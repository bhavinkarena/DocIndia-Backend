const Joi = require("joi");
const { sanitizeText } = require("../utils/sanitize");
const {
  CONDITION_OPERATORS,
  MATCH_TYPES,
  PROVIDER_TYPES,
  SERVICE_SCOPES,
  EDUCATION_LEVELS,
  SOCIAL_CATEGORIES,
  INCOME_BANDS,
  WINDOW_STAGES,
  DATE_CONFIDENCE,
  BENEFIT_FREQUENCIES,
  SOURCE_KINDS,
  VERIFICATION_STATUS,
} = require("../utils/constants");
const { STATE_VALUES } = require("../utils/states");

const objectId = Joi.string().hex().length(24);
const text = (max) =>
  Joi.string().trim().max(max).custom(sanitizeText).allow("", null);
const stateValue = Joi.string().valid(...STATE_VALUES);

/* ------------------------------------------------------------------ *
 * Shared shapes
 * ------------------------------------------------------------------ */

// Mirrors rule.validation.js — the same operators, so the same values are
// storable on a scheme criterion as on a rule condition.
const conditionSchema = Joi.object({
  questionKey: Joi.string().trim().required(),
  operator: Joi.string().valid(...CONDITION_OPERATORS).default("eq"),
  value: Joi.alternatives()
    .try(
      Joi.string().allow(""),
      Joi.number(),
      Joi.boolean(),
      Joi.array().items(Joi.string(), Joi.number(), Joi.boolean())
    )
    .required(),
  label: text(160),
});

const benefitComponentSchema = Joi.object({
  label: Joi.string().trim().max(120).custom(sanitizeText).required(),
  amountMin: Joi.number().min(0).allow(null),
  amountMax: Joi.number().min(0).allow(null),
  frequency: Joi.string().valid(...BENEFIT_FREQUENCIES).default("annual"),
  condition: Joi.array().items(conditionSchema).default([]),
  note: text(300),
}).custom((value, helpers) => {
  // A max below a min is a data-entry slip that would silently invert the
  // sort order of every match result this scheme appears in.
  if (
    value.amountMin != null &&
    value.amountMax != null &&
    value.amountMax < value.amountMin
  ) {
    return helpers.message('"amountMax" cannot be less than "amountMin"');
  }
  return value;
});

const windowStageSchema = Joi.object({
  key: Joi.string().valid(...WINDOW_STAGES).required(),
  label: text(120),
  opensAt: Joi.date().allow(null),
  closesAt: Joi.date().allow(null),
  originalClosesAt: Joi.date().allow(null),
  extensionCount: Joi.number().integer().min(0).default(0),
  confidence: Joi.string().valid(...DATE_CONFIDENCE).default("unknown"),
  sourceUrl: Joi.string().uri().allow("", null),
}).custom((value, helpers) => {
  if (value.opensAt && value.closesAt && value.closesAt < value.opensAt) {
    return helpers.message('A stage cannot close before it opens');
  }
  return value;
});

const windowSchema = Joi.object({
  academicYear: Joi.string()
    .trim()
    .pattern(/^\d{4}-\d{2}$/)
    .message('"academicYear" must look like "2026-27"')
    .allow("", null),
  isRolling: Joi.boolean().default(false),
  stages: Joi.array().items(windowStageSchema).default([]),
  renewalStages: Joi.array().items(windowStageSchema).default([]),
  history: Joi.array()
    .items(
      Joi.object({
        academicYear: Joi.string().trim().allow("", null),
        opensAt: Joi.date().allow(null),
        closesAt: Joi.date().allow(null),
      })
    )
    .default([]),
  lastAnnouncementUrl: Joi.string().uri().allow("", null),
});

/* ------------------------------------------------------------------ *
 * Create / update
 * ------------------------------------------------------------------ */

const baseFields = {
  name: Joi.string().trim().max(200).custom(sanitizeText).required(),
  slug: Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9-]+$/)
    .message('"slug" may contain only lowercase letters, numbers and hyphens')
    .max(120)
    .required(),
  shortName: text(80),
  description: text(4000),
  keywords: Joi.array().items(Joi.string().trim().max(60)).default([]),

  provider: Joi.object({
    name: text(160),
    type: Joi.string().valid(...PROVIDER_TYPES).default("central"),
    ministry: text(160),
    portalName: text(120),
  }).default({}),

  scope: Joi.string().valid(...SERVICE_SCOPES).default("national"),
  availableStates: Joi.array().items(stateValue).default([]),

  benefit: Joi.object({
    summary: text(600),
    components: Joi.array().items(benefitComponentSchema).default([]),
  }).default({}),

  eligibility: Joi.object({
    matchType: Joi.string().valid(...MATCH_TYPES).default("all"),
    criteria: Joi.array().items(conditionSchema).default([]),
    notes: text(2000),
  }).default({}),

  requiredDocuments: Joi.array()
    .items(
      Joi.object({
        documentId: objectId.required(),
        mandatory: Joi.boolean().default(true),
        note: text(300),
        condition: Joi.array().items(conditionSchema).default([]),
      })
    )
    .default([]),

  applyUrl: Joi.string().uri().allow("", null),
  officialUrl: Joi.string().uri().allow("", null),
  guidelinesUrl: Joi.string().uri().allow("", null),
  helplinePhone: text(40),
  helplineEmail: Joi.string().email().allow("", null),

  academic: Joi.object({
    levels: Joi.array().items(Joi.string().valid(...EDUCATION_LEVELS)).default([]),
    streams: Joi.array().items(Joi.string().trim().max(60)).default([]),
    minPercentage: Joi.number().min(0).max(100).allow(null),
    minCgpa: Joi.number().min(0).max(10).allow(null),
    institutionTypes: Joi.array().items(Joi.string().trim().max(40)).default([]),
    recognitionRequired: Joi.array().items(Joi.string().trim().max(40)).default([]),
    yearOfStudy: Joi.array().items(Joi.number().integer().min(1).max(10)).default([]),
  }).default({}),

  window: windowSchema.default({}),

  residency: Joi.object({
    requiresDomicileIn: Joi.array().items(stateValue).default([]),
    requiresInstitutionIn: Joi.array().items(stateValue).default([]),
    excludedStates: Joi.array().items(stateValue).default([]),
  }).default({}),

  renewal: Joi.object({
    required: Joi.boolean().default(false),
    minAttendance: Joi.number().min(0).max(100).allow(null),
    minPercentageToRenew: Joi.number().min(0).max(100).allow(null),
    note: text(600),
  }).default({}),

  quota: Joi.object({
    totalSlots: Joi.number().integer().min(0).allow(null),
    isFirstComeFirstServed: Joi.boolean().default(false),
  }).default({}),

  source: Joi.object({
    kind: Joi.string().valid(...SOURCE_KINDS).default("manual"),
    adapterKey: text(60),
    sourceUrl: Joi.string().uri().allow("", null),
  }).default({}),

  isPublished: Joi.boolean().default(false),
  order: Joi.number().integer().default(0),
};

/**
 * A state-scoped scheme with no states is invisible — it matches nobody and
 * looks published. Catching it here rather than letting an editor wonder why
 * their new Bihar scholarship never appears.
 */
const requireStatesWhenScoped = (value, helpers) => {
  if (value.scope === "state" && !(value.availableStates || []).length) {
    return helpers.message(
      'A state-scoped scholarship needs at least one entry in "availableStates"'
    );
  }
  return value;
};

exports.createScholarshipSchema = Joi.object(baseFields).custom(
  requireStatesWhenScoped
);

// Every field optional on update, but the same rules when present.
exports.updateScholarshipSchema = Joi.object(
  Object.fromEntries(
    Object.entries(baseFields).map(([key, rule]) => [
      key,
      rule.optional ? rule.optional() : rule,
    ])
  )
)
  .min(1)
  .custom((value, helpers) =>
    value.scope ? requireStatesWhenScoped(value, helpers) : value
  );

/* ------------------------------------------------------------------ *
 * Public reads
 * ------------------------------------------------------------------ */

exports.listScholarshipSchema = Joi.object({
  state: stateValue.allow("", null),
  level: Joi.string().valid(...EDUCATION_LEVELS).allow("", null),
  providerType: Joi.string().valid(...PROVIDER_TYPES).allow("", null),
  stream: Joi.string().trim().max(60).allow("", null),
  status: Joi.string()
    .valid("open", "closing-soon", "upcoming", "closed", "rolling", "not-announced")
    .allow("", null),
  search: Joi.string().trim().max(120).custom(sanitizeText).allow("", null),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string()
    .valid("deadline", "value", "name", "newest")
    .default("deadline"),
});

exports.closingSoonSchema = Joi.object({
  state: stateValue.allow("", null),
  days: Joi.number().integer().min(1).max(180).default(30),
  limit: Joi.number().integer().min(1).max(50).default(10),
});

/**
 * The eligibility quiz.
 *
 * Income is a band, never a figure — a band is all any criterion tests, and
 * storing an exact income would collect more than the product needs about a
 * person's circumstances. Everything here is optional: a partially answered
 * quiz returns "undetermined" for what it cannot decide rather than refusing
 * to run, because a student who does not know their exact category should
 * still see what they might qualify for.
 */
exports.matchSchema = Joi.object({
  domicileState: stateValue.allow("", null),
  institutionState: stateValue.allow("", null),
  dateOfBirth: Joi.date().max("now").allow(null),
  age: Joi.number().integer().min(3).max(100).allow(null),
  educationLevel: Joi.string().valid(...EDUCATION_LEVELS).allow("", null),
  stream: Joi.string().trim().max(60).allow("", null),
  yearOfStudy: Joi.number().integer().min(1).max(10).allow(null),
  lastExamPercentage: Joi.number().min(0).max(100).allow(null),
  familyIncome: Joi.string().valid(...INCOME_BANDS).allow("", null),
  category: Joi.string().valid(...SOCIAL_CATEGORIES).allow("", null),
  gender: Joi.string().valid("male", "female", "other").allow("", null),
  hasDisability: Joi.boolean().allow(null),
  isMinority: Joi.boolean().allow(null),
  institutionType: Joi.string()
    .valid("government", "private", "aided")
    .allow("", null),
  parentOccupation: Joi.string().trim().max(60).allow("", null),
}).min(1);

exports.verifySchema = Joi.object({
  verificationStatus: Joi.string().valid(...VERIFICATION_STATUS).required(),
  nextReviewAt: Joi.date().allow(null),
});
