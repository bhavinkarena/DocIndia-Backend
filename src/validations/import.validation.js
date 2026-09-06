const Joi = require("joi");
const { sanitizeText } = require("../utils/sanitize");
const {
  ACTION_KEYS,
  CONDITION_OPERATORS,
  MATCH_TYPES,
  DOCUMENT_OWNERS,
  QUESTION_TYPES,
  SERVICE_SCOPES,
} = require("../utils/constants");
const { STATE_VALUES } = require("../utils/states");

/**
 * The import file's shape.
 *
 * Deliberately **not** the single-record API shape: everything here references
 * content by **slug**, never by ObjectId. A content author writing a hundred
 * rules in a spreadsheet cannot paste `507f1f77bcf86cd799439011`, and a
 * reviewer reading the diff of such a file learns nothing from it. Slugs are
 * also stable across environments, so the same file imports into staging and
 * production — an id-based file would not.
 *
 * These mirror `seed/seedData.js` exactly, which is the point: one format for
 * seeding and importing rather than two that drift.
 *
 * `.unknown(false)` throughout, so a typo'd column name is an error rather
 * than a field that silently does nothing. In a bulk import that distinction
 * matters far more than in a form, because nobody re-reads two hundred rows to
 * notice that `mandotory` never took effect.
 */

const slug = Joi.string()
  .trim()
  .lowercase()
  .pattern(/^[a-z0-9-]+$/)
  .messages({
    "string.pattern.base":
      "Slugs may contain only lowercase letters, numbers and hyphens",
  });

const text = Joi.string().trim().custom(sanitizeText).allow("", null);

const url = Joi.string()
  .trim()
  .uri({ scheme: ["http", "https"] })
  .allow("", null)
  .messages({ "string.uri": "must be a valid http(s) URL" });

/* ------------------------------ documents ------------------------------ */

exports.importDocumentSchema = Joi.object({
  name: Joi.string().trim().min(1).max(150).custom(sanitizeText).required(),
  slug: slug.allow("", null),
  description: text,
  issuingBody: text,
  officialUrl: url,
  hasExpiry: Joi.boolean().default(false),
  typicalValidity: text,
  notes: text,
  copiesRequired: Joi.number().integer().min(0).max(20).allow(null),
  attestation: Joi.string()
    .valid("none", "self-attested", "notarised", "gazetted-officer")
    .default("none"),
  validityWindow: text,
  formatNotes: text,

  // Resolved to obtainedVia.serviceId by the importer.
  obtainedViaSlug: slug.allow("", null),
  obtainedViaAction: Joi.string().valid(...ACTION_KEYS).allow("", null),
}).unknown(false);

/* ------------------------------- services ------------------------------- */

const optionSchema = Joi.object({
  value: Joi.string().trim().required(),
  label: Joi.string().trim().custom(sanitizeText).required(),
}).unknown(false);

const questionSchema = Joi.object({
  key: Joi.string()
    .trim()
    .pattern(/^[a-zA-Z][a-zA-Z0-9_]*$/)
    .required()
    .invalid("state")
    .messages({
      "string.pattern.base":
        "Question key must start with a letter and contain only letters, numbers and underscores",
      "any.invalid": '"state" is reserved — state is chosen up front',
    }),
  label: Joi.string().trim().custom(sanitizeText).required(),
  type: Joi.string().valid(...QUESTION_TYPES).default("single-select"),
  helpText: text,
  options: Joi.when("type", {
    is: Joi.valid("single-select", "multi-select"),
    then: Joi.array().items(optionSchema).min(1).required().messages({
      "array.min": "Select questions need at least one option",
    }),
    otherwise: Joi.array().items(optionSchema).default([]),
  }),
  required: Joi.boolean().default(true),
  order: Joi.number().default(0),
}).unknown(false);

const actionSchema = Joi.object({
  key: Joi.string().valid(...ACTION_KEYS).required(),
  label: text,
  description: text,
  questions: Joi.array().items(questionSchema).default([]),
  isPublished: Joi.boolean().default(false),
  order: Joi.number().default(0),
}).unknown(false);

exports.importServiceSchema = Joi.object({
  label: Joi.string().trim().min(1).max(120).custom(sanitizeText).required(),
  slug: slug.allow("", null),
  description: text,
  authority: text,
  keywords: Joi.array().items(Joi.string().trim().custom(sanitizeText)).default([]),
  icon: text,
  scope: Joi.string().valid(...SERVICE_SCOPES).default("national"),
  availableStates: Joi.array().items(Joi.string().valid(...STATE_VALUES)).default([]),
  actions: Joi.array().items(actionSchema).default([]),
  isPublished: Joi.boolean().default(false),
  order: Joi.number().default(0),
}).unknown(false);

/* -------------------------------- rules -------------------------------- */

const documentRefSchema = Joi.object({
  slug: slug.required(),
  mandatory: Joi.boolean().default(true),
  belongsTo: Joi.string().valid(...DOCUMENT_OWNERS).default("self"),
  note: text,
}).unknown(false);

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
}).unknown(false);

const feeLineSchema = Joi.object({
  label: Joi.string().trim().custom(sanitizeText).required(),
  amount: Joi.number().min(0).required(),
  maxAmount: Joi.number().min(Joi.ref("amount")).allow(null).default(null),
  currency: Joi.string().trim().uppercase().length(3).default("INR"),
  isEstimate: Joi.boolean().default(false),
  matchType: Joi.string().valid(...MATCH_TYPES).default("all"),
  conditions: Joi.array().items(conditionSchema).default([]),
  order: Joi.number().default(0),
}).unknown(false);

const processStepSchema = Joi.object({
  title: Joi.string().trim().custom(sanitizeText).required(),
  detail: text,
  mode: Joi.string().valid("online", "in-person", "either").default("either"),
  url,
  matchType: Joi.string().valid(...MATCH_TYPES).default("all"),
  conditions: Joi.array().items(conditionSchema).default([]),
  fees: Joi.array().items(feeLineSchema).default([]),
  fee: text,
  minDays: Joi.number().integer().min(0).allow(null).default(null),
  // Guarded with `when` rather than a bare ref: minDays is nullable, and a ref
  // to null makes Joi reject a perfectly reasonable "up to 30 days".
  maxDays: Joi.number()
    .integer()
    .allow(null)
    .default(null)
    .when("minDays", {
      is: Joi.number().min(0).required(),
      then: Joi.number().integer().min(Joi.ref("minDays")).allow(null),
      otherwise: Joi.number().integer().min(0).allow(null),
    }),
  timeline: text,
  order: Joi.number().default(0),
}).unknown(false);

exports.importRuleSchema = Joi.object({
  serviceSlug: slug.required(),
  action: Joi.string().valid(...ACTION_KEYS).required(),
  // null / omitted is the national default for this service + action.
  state: Joi.string().valid(...STATE_VALUES).allow(null).default(null),
  baseDocuments: Joi.array().items(documentRefSchema).default([]),
  conditionalBlocks: Joi.array()
    .items(
      Joi.object({
        label: text,
        matchType: Joi.string().valid(...MATCH_TYPES).default("all"),
        conditions: Joi.array().items(conditionSchema).min(1).required(),
        documents: Joi.array().items(documentRefSchema).min(1).required(),
      }).unknown(false)
    )
    .default([]),
  processSteps: Joi.array().items(processStepSchema).default([]),
  summary: text,
})
  .unknown(false)
  .custom((value, helpers) => {
    // Mirrors the single-record editor: a rule with nothing to require is not
    // a rule, and it would generate an empty checklist.
    if (!value.baseDocuments.length && !value.conditionalBlocks.length) {
      return helpers.message("needs at least one document");
    }
    return value;
  });

/* ------------------------------- the call ------------------------------- */

exports.runImportSchema = Joi.object({
  type: Joi.string().valid("documents", "services", "rules").required(),
  /**
   * Capped because the whole file is validated in memory before anything is
   * written, and because an import this large is almost always a mistake — a
   * duplicated paste, or a spreadsheet exported with its blank rows.
   */
  rows: Joi.array().items(Joi.object()).min(1).max(1000).required().messages({
    "array.max": "Import at most 1000 rows at a time",
  }),
  // Defaults to a dry run: the destructive reading of an ambiguous request is
  // never the one to guess.
  dryRun: Joi.boolean().default(true),
});
