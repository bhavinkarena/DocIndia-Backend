const Joi = require("joi");
const { QUESTION_TYPES } = require("../utils/constants");

const optionSchema = Joi.object({
  value: Joi.string().trim().required(),
  label: Joi.string().trim().required(),
});

const questionSchema = Joi.object({
  key: Joi.string()
    .trim()
    .pattern(/^[a-zA-Z][a-zA-Z0-9_]*$/)
    .required()
    .messages({
      "string.pattern.base":
        "Question key must start with a letter and contain only letters, numbers and underscores",
    }),
  label: Joi.string().trim().required(),
  type: Joi.string().valid(...QUESTION_TYPES).default("single-select"),
  helpText: Joi.string().trim().allow("", null),
  options: Joi.when("type", {
    is: Joi.valid("single-select", "multi-select"),
    then: Joi.array().items(optionSchema).min(1).required().messages({
      "array.min": "Select questions need at least one option",
    }),
    otherwise: Joi.array().items(optionSchema).default([]),
  }),
  required: Joi.boolean().default(true),
  order: Joi.number().default(0),
});

exports.createCategorySchema = Joi.object({
  label: Joi.string().trim().min(1).max(120).required(),
  slug: Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9-]+$/)
    .allow("", null),
  description: Joi.string().trim().allow("", null),
  examplePrompt: Joi.string().trim().allow("", null),
  keywords: Joi.array().items(Joi.string().trim()).default([]),
  icon: Joi.string().trim().allow("", null),
  questions: Joi.array().items(questionSchema).default([]),
  isPublished: Joi.boolean().default(false),
  order: Joi.number().default(0),
});

/**
 * Written out in full rather than forked from the create schema. Forking
 * keeps the create schema's .default() calls, so a partial update such as
 * { isPublished: true } would inject `questions: []` and wipe the category's
 * questions. Every field here is optional and nothing defaults — an omitted
 * key means "leave this alone".
 *
 * Note the nested questionSchema keeps its own defaults, which is correct:
 * those only apply to question objects the caller actually sent.
 */
exports.updateCategorySchema = Joi.object({
  label: Joi.string().trim().min(1).max(120),
  slug: Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9-]+$/)
    .allow("", null),
  description: Joi.string().trim().allow("", null),
  examplePrompt: Joi.string().trim().allow("", null),
  keywords: Joi.array().items(Joi.string().trim()),
  icon: Joi.string().trim().allow("", null),
  questions: Joi.array().items(questionSchema),
  isPublished: Joi.boolean(),
  order: Joi.number(),
}).min(1);
