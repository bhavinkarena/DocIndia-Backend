const { isValidObjectId } = require("mongoose");
const Rule = require("../models/rule.model");
const GovService = require("../models/govService.model");
const DocumentModel = require("../models/document.model");
const Checklist = require("../models/checklist.model");
const Changelog = require("../models/changelog.model");
const { serviceHandler } = require("../utils/asyncHandler");
const {
  upsertRuleSchema,
  verifyRuleSchema,
} = require("../validations/rule.validation");
const { addDays } = require("../utils/common");
const { REVIEW_INTERVAL_DAYS } = require("../utils/constants");

const collectDocumentIds = (payload) => {
  const ids = (payload.baseDocuments || []).map((d) => d.documentId);
  (payload.conditionalBlocks || []).forEach((block) =>
    (block.documents || []).forEach((d) => ids.push(d.documentId))
  );
  return [...new Set(ids.map(String))];
};

/**
 * Mongo will not check that a documentId points at a real document, so this
 * is the referential-integrity net a relational database would have given
 * for free. A dangling reference must never reach a user.
 */
const findMissingDocuments = async (ids) => {
  if (!ids.length) return [];
  const found = await DocumentModel.find({
    _id: { $in: ids },
    isDeleted: false,
  })
    .select("_id")
    .lean();
  const foundIds = new Set(found.map((d) => d._id.toString()));
  return ids.filter((id) => !foundIds.has(id));
};

/**
 * Every questionKey a rule branches on must exist on the action it belongs
 * to. `state` is always valid — the engine injects it from the user's chosen
 * state, so a national rule can still carry a state-specific block.
 */
const findUnknownQuestionKeys = (payload, action) => {
  const known = new Set((action.questions || []).map((q) => q.key));
  known.add("state");

  const used = new Set();
  (payload.conditionalBlocks || []).forEach((block) =>
    (block.conditions || []).forEach((c) => used.add(c.questionKey))
  );
  return [...used].filter((k) => !known.has(k));
};

const summariseDiff = (previous, next) => {
  if (!previous) return { added: [], removed: [], modified: [] };

  const before = new Set(collectDocumentIds(previous));
  const after = new Set(collectDocumentIds(next));

  return {
    added: [...after].filter((id) => !before.has(id)),
    removed: [...before].filter((id) => !after.has(id)),
    modified: [],
  };
};

exports.upsertRule = serviceHandler(async (payload, actorId) => {
  const { error, value } = upsertRuleSchema.validate(payload);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  const service = await GovService.findOne({
    _id: value.serviceId,
    isDeleted: false,
  }).lean();

  if (!service) {
    return { success: false, statusCode: 404, message: "Service not found" };
  }

  const action = (service.actions || []).find((a) => a.key === value.action);
  if (!action) {
    return {
      success: false,
      statusCode: 400,
      message: `"${value.action}" is not an action on this service — add it first`,
    };
  }

  // A state override only makes sense where the service is actually offered.
  if (
    value.state &&
    service.scope === "state" &&
    !(service.availableStates || []).includes(value.state)
  ) {
    return {
      success: false,
      statusCode: 400,
      message: "This service is not available in that state",
    };
  }

  const unknownKeys = findUnknownQuestionKeys(value, action);
  if (unknownKeys.length) {
    return {
      success: false,
      statusCode: 400,
      message: `Unknown question key(s) for this action: ${unknownKeys.join(", ")}`,
    };
  }

  const missing = await findMissingDocuments(collectDocumentIds(value));
  if (missing.length) {
    return {
      success: false,
      statusCode: 400,
      message: `These document IDs do not exist: ${missing.join(", ")}`,
    };
  }

  const existing = await Rule.findOne({
    serviceId: value.serviceId,
    action: value.action,
    state: value.state,
    isDeleted: false,
  });

  let rule;
  let version;

  if (existing) {
    version = existing.version + 1;
    const diff = summariseDiff(existing.toObject(), value);

    existing.baseDocuments = value.baseDocuments;
    existing.conditionalBlocks = value.conditionalBlocks;
    existing.processSteps = value.processSteps;
    existing.version = version;
    // Any content edit invalidates the previous verification.
    existing.verificationStatus = "needs-review";
    await existing.save();
    rule = existing;

    await Changelog.create({
      serviceId: value.serviceId,
      action: value.action,
      ruleId: rule._id,
      version,
      summary: value.summary || "Rule updated",
      changes: diff,
      changedBy: actorId || null,
    });

    // Saved checklists keep their frozen snapshot but get flagged, so users
    // are told their copy is behind rather than having it rewritten. Only
    // checklists this rule actually governs — a national edit must not flag
    // users in a state that has its own override.
    const affected = {
      serviceId: value.serviceId,
      action: value.action,
      isDeleted: false,
      ruleVersion: { $lt: version },
    };

    if (value.state) {
      affected.state = value.state;
    } else {
      const overriddenStates = await Rule.find({
        serviceId: value.serviceId,
        action: value.action,
        state: { $ne: null },
        isDeleted: false,
      })
        .select("state")
        .lean();
      const excluded = overriddenStates.map((r) => r.state);
      if (excluded.length) affected.state = { $nin: excluded };
    }

    await Checklist.updateMany(affected, { hasRuleUpdate: true });
  } else {
    version = 1;
    rule = await Rule.create({
      serviceId: value.serviceId,
      action: value.action,
      state: value.state,
      baseDocuments: value.baseDocuments,
      conditionalBlocks: value.conditionalBlocks,
      processSteps: value.processSteps,
      version,
      verificationStatus: "unverified",
    });

    await Changelog.create({
      serviceId: value.serviceId,
      action: value.action,
      ruleId: rule._id,
      version,
      summary: value.summary || "Rule created",
      changes: { added: collectDocumentIds(value), removed: [], modified: [] },
      changedBy: actorId || null,
    });
  }

  return { success: true, statusCode: existing ? 200 : 201, data: rule };
});

exports.getRule = serviceHandler(async (serviceId, action, state) => {
  if (!isValidObjectId(serviceId)) {
    return { success: false, statusCode: 400, message: "Invalid service ID" };
  }

  const rule = await Rule.findOne({
    serviceId,
    action,
    state: state || null,
    isDeleted: false,
  })
    .populate("baseDocuments.documentId", "name slug issuingBody officialUrl")
    .populate(
      "conditionalBlocks.documents.documentId",
      "name slug issuingBody officialUrl"
    )
    .lean();

  if (!rule) {
    return {
      success: false,
      statusCode: 404,
      message: "No rule has been created for this combination yet",
    };
  }

  return { success: true, statusCode: 200, data: rule };
});

exports.getRulesForService = serviceHandler(async (serviceId) => {
  if (!isValidObjectId(serviceId)) {
    return { success: false, statusCode: 400, message: "Invalid service ID" };
  }

  const rules = await Rule.find({ serviceId, isDeleted: false })
    .select(
      "action state version verificationStatus lastVerifiedAt nextReviewAt baseDocuments conditionalBlocks processSteps"
    )
    .lean();

  const data = rules.map((r) => ({
    _id: r._id,
    action: r.action,
    state: r.state,
    version: r.version,
    verificationStatus: r.verificationStatus,
    lastVerifiedAt: r.lastVerifiedAt,
    nextReviewAt: r.nextReviewAt,
    documentCount: collectDocumentIds(r).length,
    stepCount: (r.processSteps || []).length,
  }));

  return { success: true, statusCode: 200, data };
});

exports.deleteRule = serviceHandler(async (ruleId) => {
  if (!isValidObjectId(ruleId)) {
    return { success: false, statusCode: 400, message: "Invalid rule ID" };
  }

  const rule = await Rule.findOne({ _id: ruleId, isDeleted: false });
  if (!rule) {
    return { success: false, statusCode: 404, message: "Rule not found" };
  }

  // Removing the national default would strand every state that relies on it.
  if (rule.state === null) {
    const overrides = await Rule.countDocuments({
      serviceId: rule.serviceId,
      action: rule.action,
      state: { $ne: null },
      isDeleted: false,
    });
    const service = await GovService.findById(rule.serviceId).lean();
    const stateCount = service?.scope === "state" ? (service.availableStates || []).length : Infinity;

    if (overrides < stateCount) {
      return {
        success: false,
        statusCode: 409,
        message:
          "This is the national default — states without their own override would be left with no requirements. Add state rules first, or unpublish the action.",
      };
    }
  }

  await Rule.findByIdAndUpdate(ruleId, { isDeleted: true });

  return { success: true, statusCode: 200, message: "Rule deleted" };
});

exports.verifyRule = serviceHandler(async (ruleId, payload, actorId) => {
  if (!isValidObjectId(ruleId)) {
    return { success: false, statusCode: 400, message: "Invalid rule ID" };
  }

  const { error, value } = verifyRuleSchema.validate(payload);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  const rule = await Rule.findOne({ _id: ruleId, isDeleted: false });
  if (!rule) {
    return { success: false, statusCode: 404, message: "Rule not found" };
  }

  rule.verificationStatus = value.verificationStatus;

  if (value.verificationStatus === "verified") {
    rule.lastVerifiedAt = new Date();
    rule.verifiedBy = actorId || null;
    rule.nextReviewAt = addDays(new Date(), REVIEW_INTERVAL_DAYS);
  }

  await rule.save();

  return { success: true, statusCode: 200, data: rule };
});

/** Rules that are unverified, flagged, or past their review date. */
exports.getVerificationQueue = serviceHandler(async () => {
  const rules = await Rule.find({
    isDeleted: false,
    $or: [
      { verificationStatus: { $in: ["unverified", "needs-review"] } },
      { nextReviewAt: { $lte: new Date() } },
    ],
  })
    .populate("serviceId", "label slug isPublished actions")
    .sort({ nextReviewAt: 1, updatedAt: -1 })
    .lean();

  // Surface whether the action is live, since a published-and-unverified rule
  // is the urgent case.
  const data = rules.map((r) => {
    const action = (r.serviceId?.actions || []).find((a) => a.key === r.action);
    return {
      ...r,
      actionIsPublished: Boolean(action?.isPublished),
      serviceId: r.serviceId
        ? {
            _id: r.serviceId._id,
            label: r.serviceId.label,
            slug: r.serviceId.slug,
            isPublished: r.serviceId.isPublished,
          }
        : null,
    };
  });

  return { success: true, statusCode: 200, data };
});
