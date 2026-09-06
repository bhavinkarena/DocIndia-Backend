const Joi = require("joi");
const { sanitizeText } = require("../utils/sanitize");
const { ACTION_KEYS } = require("../utils/constants");
const { STATE_VALUES } = require("../utils/states");

const objectId = Joi.string().hex().length(24);

const answersSchema = Joi.object().pattern(
  Joi.string(),
  Joi.alternatives().try(
    Joi.string().allow(""),
    Joi.number(),
    Joi.boolean(),
    Joi.array().items(Joi.string(), Joi.number(), Joi.boolean())
  )
);

exports.generateChecklistSchema = Joi.object({
  serviceSlug: Joi.string().trim().lowercase().required(),
  action: Joi.string().valid(...ACTION_KEYS).required(),
  state: Joi.string().valid(...STATE_VALUES).required().messages({
    "any.required": "Choose your state first",
    "any.only": "That is not a valid Indian state or union territory",
  }),
  answers: answersSchema.default({}),
  // Documents the user says they already hold, so the result can separate
  // "you have this" from "you still need this".
  alreadyHave: Joi.array().items(objectId).default([]),
  /**
   * A date the user has to meet, so the result can plan the timeline backwards
   * from it. Past dates are accepted deliberately — the planner has an honest
   * verdict for one, and rejecting it would only hide a deadline already
   * missed behind a validation error.
   */
  targetDate: Joi.date().iso().allow(null).default(null),
});

exports.saveChecklistSchema = Joi.object({
  serviceSlug: Joi.string().trim().lowercase().required(),
  action: Joi.string().valid(...ACTION_KEYS).required(),
  state: Joi.string().valid(...STATE_VALUES).required(),
  answers: answersSchema.default({}),
  alreadyHave: Joi.array().items(objectId).default([]),
  title: Joi.string().trim().max(150).custom(sanitizeText).allow("", null),
});

exports.updateProgressSchema = Joi.object({
  documentId: objectId.required(),
  checked: Joi.boolean().required(),
});

exports.classifySchema = Joi.object({
  query: Joi.string().trim().min(1).max(300).custom(sanitizeText).required(),
  state: Joi.string().valid(...STATE_VALUES).allow(null, ""),
});
