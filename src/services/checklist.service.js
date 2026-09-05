const { isValidObjectId } = require("mongoose");
const Category = require("../models/category.model");
const Rule = require("../models/rule.model");
const DocumentModel = require("../models/document.model");
const Checklist = require("../models/checklist.model");
const { serviceHandler } = require("../utils/asyncHandler");
const {
  generateChecklistSchema,
  saveChecklistSchema,
  updateProgressSchema,
  classifySchema,
} = require("../validations/checklist.validation");
const {
  parseListQuery,
  buildPagination,
  generateShareToken,
} = require("../utils/common");
const { isValidState } = require("../utils/states");

// Below this, a "match" is a coincidental word in common rather than a signal.
const MIN_MATCH_SCORE = 4;

/* ------------------------------------------------------------------ *
 * Rules engine
 *
 * Pure and deterministic: the same answers always produce the same
 * checklist. Nothing here writes to the database, which is what makes
 * it cheap to test and safe to call from public, unauthenticated routes.
 * ------------------------------------------------------------------ */

const evaluateCondition = (condition, answers) => {
  const answer = answers[condition.questionKey];
  const { operator, value } = condition;

  switch (operator) {
    case "eq":
      return answer === value;
    case "neq":
      return answer !== value;
    case "in":
      return Array.isArray(value) && value.includes(answer);
    case "nin":
      return Array.isArray(value) && !value.includes(answer);
    // For multi-select answers: does the chosen set include this value?
    case "contains":
      return Array.isArray(answer) && answer.includes(value);
    default:
      return false;
  }
};

const blockMatches = (block, answers) => {
  if (!block.conditions?.length) return false;
  const results = block.conditions.map((c) => evaluateCondition(c, answers));
  return block.matchType === "any"
    ? results.some(Boolean)
    : results.every(Boolean);
};

/**
 * Validates submitted answers against the category's own question
 * definitions. Built dynamically because every category has a different
 * question set — there is no single static schema to check against.
 */
const validateAnswers = (questions = [], answers = {}) => {
  const errors = [];

  questions.forEach((question) => {
    const answer = answers[question.key];
    const isEmpty =
      answer === undefined ||
      answer === null ||
      answer === "" ||
      (Array.isArray(answer) && answer.length === 0);

    if (isEmpty) {
      if (question.required) errors.push(`"${question.label}" is required`);
      return;
    }

    if (question.type === "state-select") {
      if (!isValidState(answer)) {
        errors.push(`"${question.label}" must be a valid Indian state or UT`);
      }
      return;
    }

    if (question.type === "boolean") {
      if (typeof answer !== "boolean") {
        errors.push(`"${question.label}" must be true or false`);
      }
      return;
    }

    const allowed = (question.options || []).map((o) => o.value);

    if (question.type === "single-select") {
      if (!allowed.includes(answer)) {
        errors.push(`"${question.label}" has an invalid selection`);
      }
      return;
    }

    if (question.type === "multi-select") {
      if (!Array.isArray(answer)) {
        errors.push(`"${question.label}" must be a list`);
        return;
      }
      const invalid = answer.filter((a) => !allowed.includes(a));
      if (invalid.length) {
        errors.push(`"${question.label}" has an invalid selection`);
      }
    }
  });

  return errors;
};

/**
 * Collapses base + matched conditional documents into a single list.
 * A document appearing in more than one block is emitted once, and
 * mandatory always wins over conditional — a document required by any
 * matched path is required, full stop.
 */
const composeItems = (rule, answers) => {
  const collected = new Map();

  const add = (entry, sourceBlock) => {
    const id = entry.documentId?.toString();
    if (!id) return;

    const existing = collected.get(id);
    if (existing) {
      existing.mandatory = existing.mandatory || entry.mandatory;
      if (entry.note && !existing.notes.includes(entry.note)) {
        existing.notes.push(entry.note);
      }
      return;
    }

    collected.set(id, {
      documentId: id,
      mandatory: entry.mandatory !== false,
      notes: entry.note ? [entry.note] : [],
      sourceBlock,
    });
  };

  (rule.baseDocuments || []).forEach((entry) => add(entry, "base"));

  (rule.conditionalBlocks || []).forEach((block) => {
    if (!blockMatches(block, answers)) return;
    (block.documents || []).forEach((entry) =>
      add(entry, block.label || "conditional")
    );
  });

  return Array.from(collected.values());
};

/**
 * Resolves document references into full records. Deliberately a lookup at
 * read time rather than embedded copies — one edit to a document propagates
 * to every rule that references it.
 */
const hydrateItems = async (composed) => {
  const ids = composed.map((c) => c.documentId);
  const docs = await DocumentModel.find({
    _id: { $in: ids },
    isDeleted: false,
  }).lean();

  const byId = new Map(docs.map((d) => [d._id.toString(), d]));

  return composed
    .map((entry) => {
      const doc = byId.get(entry.documentId);
      // A reference to a deleted document is dropped rather than rendered
      // as a blank row. The admin verification queue surfaces these.
      if (!doc) return null;

      return {
        documentId: doc._id,
        name: doc.name,
        description: doc.description || "",
        issuingBody: doc.issuingBody || "",
        officialUrl: doc.officialUrl || "",
        hasExpiry: doc.hasExpiry,
        typicalValidity: doc.typicalValidity || "",
        mandatory: entry.mandatory,
        note: entry.notes.join(" "),
        sourceBlock: entry.sourceBlock,
      };
    })
    .filter(Boolean)
    // Mandatory items first, then alphabetical — stable, predictable order.
    .sort((a, b) => {
      if (a.mandatory !== b.mandatory) return a.mandatory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
};

const buildChecklist = async (categorySlug, answers) => {
  const category = await Category.findOne({
    slug: categorySlug,
    isDeleted: false,
    isPublished: true,
  }).lean();

  if (!category) {
    return { success: false, statusCode: 404, message: "Category not found" };
  }

  const answerErrors = validateAnswers(category.questions, answers);
  if (answerErrors.length) {
    return { success: false, statusCode: 400, message: answerErrors.join("; ") };
  }

  const rule = await Rule.findOne({
    categoryId: category._id,
    isDeleted: false,
  }).lean();

  if (!rule) {
    return {
      success: false,
      statusCode: 404,
      message: "No document rules have been published for this category yet",
    };
  }

  const composed = composeItems(rule, answers);
  const items = await hydrateItems(composed);

  return {
    success: true,
    statusCode: 200,
    data: {
      category: {
        _id: category._id,
        label: category.label,
        slug: category.slug,
        description: category.description,
      },
      answers,
      items,
      mandatoryCount: items.filter((i) => i.mandatory).length,
      conditionalCount: items.filter((i) => !i.mandatory).length,
      ruleVersion: rule.version,
      verificationStatus: rule.verificationStatus,
      lastVerifiedAt: rule.lastVerifiedAt,
      generatedAt: new Date(),
    },
  };
};

/* ------------------------------------------------------------------ *
 * Public endpoints
 * ------------------------------------------------------------------ */

exports.generateChecklist = serviceHandler(async (payload) => {
  const { error, value } = generateChecklistSchema.validate(payload);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }
  return buildChecklist(value.categorySlug, value.answers);
});

/**
 * Rule-based intake classifier. A keyword map covers the overwhelming
 * majority of real phrasings; swapping in an LLM later is a change behind
 * this one function, not a change to the flow.
 */
exports.classifyGoal = serviceHandler(async (payload) => {
  const { error, value } = classifySchema.validate(payload);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  const query = value.query.toLowerCase();
  const tokens = new Set(query.split(/\s+/).filter((t) => t.length > 2));

  const categories = await Category.find({ isDeleted: false, isPublished: true })
    .select("label slug description keywords icon")
    .lean();

  const scored = categories
    .map((category) => {
      let score = 0;

      (category.keywords || []).forEach((keyword) => {
        const k = keyword.toLowerCase();

        // A full phrase hit is the strong signal.
        if (query.includes(k)) {
          score += 10;
          return;
        }

        // Word-level overlap only — never substring. Substring matching let a
        // generic word like "register" inside "gst registration" score a
        // company-registration query against GST, which surfaced confidently
        // wrong suggestions.
        const overlap = k
          .split(/\s+/)
          .filter((word) => word.length > 2 && tokens.has(word)).length;

        score += overlap * 2;
      });

      if (query.includes(category.label.toLowerCase())) score += 15;

      return { ...category, score };
    })
    // A single generic word in common is noise, not a match.
    .filter((c) => c.score >= MIN_MATCH_SCORE)
    .sort((a, b) => b.score - a.score);

  // Confident means: a strong hit that is also clearly ahead of the runner-up.
  // Being the best of several weak matches is not the same as being right.
  const confident =
    scored.length > 0 &&
    scored[0].score >= 10 &&
    (scored.length === 1 || scored[0].score >= scored[1].score * 2);

  return {
    success: true,
    statusCode: 200,
    data: { matches: scored.slice(0, 5), confident },
  };
});

/* ------------------------------------------------------------------ *
 * Saved checklists (authenticated)
 * ------------------------------------------------------------------ */

exports.saveChecklist = serviceHandler(async (userId, payload) => {
  const { error, value } = saveChecklistSchema.validate(payload);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  const generated = await buildChecklist(value.categorySlug, value.answers);
  if (!generated.success) return generated;

  const { category, items, ruleVersion } = generated.data;

  const checklist = new Checklist({
    userId,
    categoryId: category._id,
    categorySlug: category.slug,
    categoryLabel: category.label,
    title: value.title || category.label,
    answers: value.answers,
    // Frozen at save time — see the note in checklist.model.js.
    generatedItems: items.map((i) => ({
      documentId: i.documentId,
      name: i.name,
      description: i.description,
      issuingBody: i.issuingBody,
      officialUrl: i.officialUrl,
      mandatory: i.mandatory,
      note: i.note,
      sourceBlock: i.sourceBlock,
    })),
    progress: items.map((i) => ({ documentId: i.documentId, checked: false })),
    ruleVersion,
    generatedAt: new Date(),
    shareToken: generateShareToken(),
  });

  await checklist.save();

  return { success: true, statusCode: 201, data: checklist };
});

exports.getMyChecklists = serviceHandler(async (userId, query) => {
  const { pageNumber, limitNumber, skip, search, sortBy, sortOrder } =
    parseListQuery(query);

  const filter = { userId, isDeleted: false };
  if (search) filter.title = { $regex: search, $options: "i" };

  const [totalItems, checklists] = await Promise.all([
    Checklist.countDocuments(filter),
    Checklist.find(filter)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limitNumber)
      .lean(),
  ]);

  const data = checklists.map((c) => {
    const total = c.progress?.length || 0;
    const completed = c.progress?.filter((p) => p.checked).length || 0;
    return {
      ...c,
      stats: {
        total,
        completed,
        percent: total ? Math.round((completed / total) * 100) : 0,
      },
    };
  });

  return {
    success: true,
    statusCode: 200,
    data,
    pagination: buildPagination(totalItems, pageNumber, limitNumber),
  };
});

exports.getChecklistById = serviceHandler(async (userId, checklistId) => {
  if (!isValidObjectId(checklistId)) {
    return { success: false, statusCode: 400, message: "Invalid checklist ID" };
  }

  const checklist = await Checklist.findOne({
    _id: checklistId,
    userId,
    isDeleted: false,
  }).lean();

  if (!checklist) {
    return { success: false, statusCode: 404, message: "Checklist not found" };
  }

  return { success: true, statusCode: 200, data: checklist };
});

exports.getSharedChecklist = serviceHandler(async (shareToken) => {
  const checklist = await Checklist.findOne({
    shareToken,
    isDeleted: false,
  })
    .select("-userId -progress")
    .lean();

  if (!checklist) {
    return { success: false, statusCode: 404, message: "Checklist not found" };
  }

  return { success: true, statusCode: 200, data: checklist };
});

exports.updateProgress = serviceHandler(async (userId, checklistId, payload) => {
  if (!isValidObjectId(checklistId)) {
    return { success: false, statusCode: 400, message: "Invalid checklist ID" };
  }

  const { error, value } = updateProgressSchema.validate(payload);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  const checklist = await Checklist.findOne({
    _id: checklistId,
    userId,
    isDeleted: false,
  });

  if (!checklist) {
    return { success: false, statusCode: 404, message: "Checklist not found" };
  }

  const entry = checklist.progress.find(
    (p) => p.documentId?.toString() === value.documentId
  );

  if (!entry) {
    return {
      success: false,
      statusCode: 404,
      message: "That document is not part of this checklist",
    };
  }

  entry.checked = value.checked;
  entry.checkedAt = value.checked ? new Date() : null;

  const allDone = checklist.progress.every((p) => p.checked);
  checklist.status = allDone ? "completed" : "active";

  await checklist.save();

  return { success: true, statusCode: 200, data: checklist };
});

exports.deleteChecklist = serviceHandler(async (userId, checklistId) => {
  if (!isValidObjectId(checklistId)) {
    return { success: false, statusCode: 400, message: "Invalid checklist ID" };
  }

  const deleted = await Checklist.findOneAndUpdate(
    { _id: checklistId, userId, isDeleted: false },
    { isDeleted: true },
    { new: true }
  );

  if (!deleted) {
    return { success: false, statusCode: 404, message: "Checklist not found" };
  }

  return { success: true, statusCode: 200, message: "Checklist deleted" };
});

// Exported for direct unit testing of the engine without a database.
exports._internals = {
  evaluateCondition,
  blockMatches,
  validateAnswers,
  composeItems,
};
