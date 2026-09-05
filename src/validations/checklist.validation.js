const Joi = require("joi");
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
});

exports.saveChecklistSchema = Joi.object({
  serviceSlug: Joi.string().trim().lowercase().required(),
  action: Joi.string().valid(...ACTION_KEYS).required(),
  state: Joi.string().valid(...STATE_VALUES).required(),
  answers: answersSchema.default({}),
  alreadyHave: Joi.array().items(objectId).default([]),
  title: Joi.string().trim().max(150).allow("", null),
});

exports.updateProgressSchema = Joi.object({
  documentId: objectId.required(),
  checked: Joi.boolean().required(),
});

exports.classifySchema = Joi.object({
  query: Joi.string().trim().min(1).max(300).required(),
  state: Joi.string().valid(...STATE_VALUES).allow(null, ""),
});
