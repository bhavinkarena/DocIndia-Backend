const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

exports.generateChecklistSchema = Joi.object({
  categorySlug: Joi.string().trim().lowercase().required(),
  answers: Joi.object().pattern(
    Joi.string(),
    Joi.alternatives().try(
      Joi.string().allow(""),
      Joi.number(),
      Joi.boolean(),
      Joi.array().items(Joi.string(), Joi.number(), Joi.boolean())
    )
  ).default({}),
});

exports.saveChecklistSchema = Joi.object({
  categorySlug: Joi.string().trim().lowercase().required(),
  answers: Joi.object().default({}),
  title: Joi.string().trim().max(150).allow("", null),
});

exports.updateProgressSchema = Joi.object({
  documentId: objectId.required(),
  checked: Joi.boolean().required(),
});

exports.classifySchema = Joi.object({
  query: Joi.string().trim().min(1).max(300).required(),
});
