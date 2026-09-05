const Joi = require("joi");
const {
  CONDITION_OPERATORS,
  MATCH_TYPES,
  VERIFICATION_STATUS,
} = require("../utils/constants");

const objectId = Joi.string().hex().length(24);

const ruleDocumentSchema = Joi.object({
  documentId: objectId.required(),
  mandatory: Joi.boolean().default(true),
  note: Joi.string().trim().allow("", null),
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
  label: Joi.string().trim().allow("", null),
  matchType: Joi.string().valid(...MATCH_TYPES).default("all"),
  conditions: Joi.array().items(conditionSchema).min(1).required(),
  documents: Joi.array().items(ruleDocumentSchema).min(1).required(),
});

exports.upsertRuleSchema = Joi.object({
  categoryId: objectId.required(),
  baseDocuments: Joi.array().items(ruleDocumentSchema).default([]),
  conditionalBlocks: Joi.array().items(conditionalBlockSchema).default([]),
  summary: Joi.string().trim().allow("", null),
});

exports.verifyRuleSchema = Joi.object({
  verificationStatus: Joi.string().valid(...VERIFICATION_STATUS).required(),
  note: Joi.string().trim().allow("", null),
});
