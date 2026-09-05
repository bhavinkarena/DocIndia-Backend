const Joi = require("joi");
const { sanitizeText } = require("../utils/sanitize");
const {
  CONDITION_OPERATORS,
  MATCH_TYPES,
  VERIFICATION_STATUS,
  ACTION_KEYS,
} = require("../utils/constants");
const { STATE_VALUES } = require("../utils/states");

const objectId = Joi.string().hex().length(24);

const ruleDocumentSchema = Joi.object({
  documentId: objectId.required(),
  mandatory: Joi.boolean().default(true),
  note: Joi.string().trim().custom(sanitizeText).allow("", null),
});

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
});

const conditionalBlockSchema = Joi.object({
  label: Joi.string().trim().custom(sanitizeText).allow("", null),
  matchType: Joi.string().valid(...MATCH_TYPES).default("all"),
  conditions: Joi.array().items(conditionSchema).min(1).required(),
  documents: Joi.array().items(ruleDocumentSchema).min(1).required(),
});

const processStepSchema = Joi.object({
  title: Joi.string().trim().custom(sanitizeText).required(),
  detail: Joi.string().trim().custom(sanitizeText).allow("", null),
  mode: Joi.string().valid("online", "in-person", "either").default("either"),
  url: Joi.string()
    .trim()
    .uri({ scheme: ["http", "https"] })
    .allow("", null),
  fee: Joi.string().trim().custom(sanitizeText).allow("", null),
  timeline: Joi.string().trim().custom(sanitizeText).allow("", null),
  order: Joi.number().default(0),
});

exports.upsertRuleSchema = Joi.object({
  serviceId: objectId.required(),
  action: Joi.string().valid(...ACTION_KEYS).required(),
  // null / omitted means this is the national default for the service+action.
  state: Joi.string().valid(...STATE_VALUES).allow(null).default(null),
  baseDocuments: Joi.array().items(ruleDocumentSchema).default([]),
  conditionalBlocks: Joi.array().items(conditionalBlockSchema).default([]),
  processSteps: Joi.array().items(processStepSchema).default([]),
  summary: Joi.string().trim().custom(sanitizeText).allow("", null),
});

exports.verifyRuleSchema = Joi.object({
  verificationStatus: Joi.string().valid(...VERIFICATION_STATUS).required(),
  note: Joi.string().trim().custom(sanitizeText).allow("", null),
});
