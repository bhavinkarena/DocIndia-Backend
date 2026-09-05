const { isValidObjectId } = require("mongoose");
const Rule = require("../models/rule.model");
const Category = require("../models/category.model");
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
  return [...new Set(ids)];
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

/** Every questionKey a rule branches on must exist on the category. */
const findUnknownQuestionKeys = (payload, category) => {
  const known = new Set((category.questions || []).map((q) => q.key));
  const used = new Set();
  (payload.conditionalBlocks || []).forEach((block) =>
    (block.conditions || []).forEach((c) => used.add(c.questionKey))
  );
  return [...used].filter((k) => !known.has(k));
};

const summariseDiff = (previous, next) => {
  if (!previous) return { added: [], removed: [], modified: [] };

  const idsOf = (rule) => new Set(collectDocumentIds(rule).map(String));
  const before = idsOf(previous);
  const after = idsOf(next);

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

  const category = await Category.findOne({
    _id: value.categoryId,
    isDeleted: false,
  }).lean();

  if (!category) {
    return { success: false, statusCode: 404, message: "Category not found" };
  }

  const unknownKeys = findUnknownQuestionKeys(value, category);
  if (unknownKeys.length) {
    return {
      success: false,
      statusCode: 400,
      message: `Unknown question key(s) for this category: ${unknownKeys.join(", ")}`,
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
    categoryId: value.categoryId,
    isDeleted: false,
  });

  let rule;
  let version;

  if (existing) {
    version = existing.version + 1;
    const diff = summariseDiff(existing.toObject(), value);

    existing.baseDocuments = value.baseDocuments;
    existing.conditionalBlocks = value.conditionalBlocks;
    existing.version = version;
    // Any content edit invalidates the previous verification.
    existing.verificationStatus = "needs-review";
    await existing.save();
    rule = existing;

    await Changelog.create({
      categoryId: value.categoryId,
      ruleId: rule._id,
      version,
      summary: value.summary || "Rule updated",
      changes: diff,
      changedBy: actorId || null,
    });

    // Saved checklists keep their frozen snapshot but get flagged, so users
    // are told their copy is behind rather than having it rewritten.
    await Checklist.updateMany(
      {
        categoryId: value.categoryId,
        isDeleted: false,
        ruleVersion: { $lt: version },
      },
      { hasRuleUpdate: true }
    );
  } else {
    version = 1;
    rule = await Rule.create({
      categoryId: value.categoryId,
      baseDocuments: value.baseDocuments,
      conditionalBlocks: value.conditionalBlocks,
      version,
      verificationStatus: "unverified",
    });

    await Changelog.create({
      categoryId: value.categoryId,
      ruleId: rule._id,
      version,
      summary: value.summary || "Rule created",
      changes: { added: collectDocumentIds(value).map(String), removed: [], modified: [] },
      changedBy: actorId || null,
    });
  }

  return { success: true, statusCode: existing ? 200 : 201, data: rule };
});

exports.getRuleByCategory = serviceHandler(async (categoryId) => {
  if (!isValidObjectId(categoryId)) {
    return { success: false, statusCode: 400, message: "Invalid category ID" };
  }

  const rule = await Rule.findOne({ categoryId, isDeleted: false })
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
      message: "No rule has been created for this category yet",
    };
  }

  return { success: true, statusCode: 200, data: rule };
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
    .populate("categoryId", "label slug isPublished")
    .sort({ nextReviewAt: 1, updatedAt: -1 })
    .lean();

  return { success: true, statusCode: 200, data: rules };
});
