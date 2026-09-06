const { isValidObjectId } = require("mongoose");
const Rule = require("../models/rule.model");
const GovService = require("../models/govService.model");
const DocumentModel = require("../models/document.model");
const Checklist = require("../models/checklist.model");
const Changelog = require("../models/changelog.model");
const User = require("../models/user.model");
const { sendChecklistUpdatedEmail } = require("./email.service");
const logger = require("../utils/logger");
const checklistCache = require("../utils/checklistCache");
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

/**
 * Tells people their saved checklist is behind. Flagging it in the database is
 * only half the job — nobody opens a checklist they already built to see
 * whether it changed, which is exactly the case the flag exists for.
 *
 * Grouped by user so one rule edit is one email, however many of that person's
 * checklists it touched. Failures are swallowed per recipient: a rule edit is
 * the admin's action, and it must not fail because one address bounces.
 */
const notifyAffectedUsers = async (checklists, summary) => {
  if (!checklists.length) return;

  const byUser = new Map();
  checklists.forEach((checklist) => {
    const key = String(checklist.userId);
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key).push(checklist);
  });

  const recipients = await User.find({
    _id: { $in: [...byUser.keys()] },
    isDeleted: false,
    status: true,
    "notificationPrefs.email": true,
  })
    .select("firstName email")
    .lean();

  const results = await Promise.allSettled(
    recipients.map((user) =>
      sendChecklistUpdatedEmail(user, byUser.get(String(user._id)), summary)
    )
  );

  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length) {
    logger.error(
      {
        failed: failed.length,
        total: results.length,
        err: failed[0].reason,
      },
      "Checklist update emails failed"
    );
  }
};

/**
 * Exported for the bulk importer's dry run.
 *
 * The importer has to report every problem in a file *before* writing any of
 * it, which means running these checks without going through `upsertRule` —
 * and they must be the same checks, not a second implementation that drifts
 * into disagreeing with the one that actually guards the database.
 */
exports.integrityChecks = {
  collectDocumentIds,
  findMissingDocuments,
  findUnknownQuestionKeys,
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

    /**
     * Read before the flag is set, and only the checklists not already
     * flagged.
     *
     * Someone with an unread "your checklist changed" notice gains nothing
     * from a second one carrying the same message — and an admin working
     * through a rule over an afternoon would otherwise send an email per save.
     * Once the user reviews the checklist and the flag clears, the next real
     * change reaches them again.
     */
    const newlyAffected = await Checklist.find({
      ...affected,
      hasRuleUpdate: false,
    })
      .select("userId title serviceLabel")
      .lean();

    await Checklist.updateMany(affected, { hasRuleUpdate: true });

    // Fire-and-forget, matching every other send in this codebase: the rule
    // was saved, and the admin waiting on the response should not be held up
    // by SMTP — nor see a 500 because of it.
    notifyAffectedUsers(newlyAffected, value.summary).catch((err) =>
      logger.error({ err }, "Checklist update notifications failed")
    );
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

  /**
   * The engine's output has just changed — and not only for this service.
   *
   * A generated checklist now embeds the prerequisite chain beneath it, which
   * carries other services' fees, timelines and document counts. So a passport
   * checklist holds a copy of the Aadhaar rule's figures, and clearing only
   * `service.slug` would leave that passport entry quoting numbers this edit
   * just replaced. Clearing everything costs a few seconds of recomputation
   * and cannot be wrong; editor actions are rare enough that this is the same
   * trade already made for document edits.
   */
  checklistCache.invalidateAll(`rule saved for ${service.slug}`);

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

  // Global for the same reason as the upsert above: prerequisite chains put
  // this rule's figures inside other services' cached checklists.
  const owner = await GovService.findById(rule.serviceId).select("slug").lean();
  checklistCache.invalidateAll(`rule deleted for ${owner?.slug || "unknown"}`);

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

  // verificationStatus and lastVerifiedAt are both part of the generated
  // checklist — they drive the "not yet verified" warning the user sees, which
  // must not keep showing after someone has verified it.
  const owner = await GovService.findById(rule.serviceId).select("slug").lean();
  checklistCache.invalidateAll(`rule verified for ${owner?.slug || "unknown"}`);

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
