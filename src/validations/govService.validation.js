const Joi = require("joi");
const {
  QUESTION_TYPES,
  ACTION_KEYS,
  SERVICE_SCOPES,
} = require("../utils/constants");
const { STATE_VALUES } = require("../utils/states");

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
    })
    // `state` is injected by the engine from the user's chosen state; a
    // question using that key would be silently overwritten.
    .invalid("state")
    .messages({ "any.invalid": '"state" is reserved — state is chosen up front' }),
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

const actionSchema = Joi.object({
  key: Joi.string().valid(...ACTION_KEYS).required(),
  label: Joi.string().trim().allow("", null),
  description: Joi.string().trim().allow("", null),
  questions: Joi.array().items(questionSchema).default([]),
  isPublished: Joi.boolean().default(false),
  order: Joi.number().default(0),
});

const baseFields = {
  label: Joi.string().trim().min(1).max(120),
  slug: Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9-]+$/)
    .allow("", null),
  description: Joi.string().trim().allow("", null),
  authority: Joi.string().trim().allow("", null),
  keywords: Joi.array().items(Joi.string().trim()),
  icon: Joi.string().trim().allow("", null),
  scope: Joi.string().valid(...SERVICE_SCOPES),
  availableStates: Joi.array().items(Joi.string().valid(...STATE_VALUES)),
  actions: Joi.array().items(actionSchema),
  isPublished: Joi.boolean(),
  order: Joi.number(),
};

exports.createServiceSchema = Joi.object({
  ...baseFields,
  label: baseFields.label.required(),
  keywords: baseFields.keywords.default([]),
  scope: baseFields.scope.default("national"),
  availableStates: baseFields.availableStates.default([]),
  actions: baseFields.actions.default([]),
  isPublished: baseFields.isPublished.default(false),
  order: baseFields.order.default(0),
});

/**
 * Written out separately rather than forked from the create schema: forking
 * carries the create schema's .default() calls, so a partial update such as
 * { isPublished: true } would inject `actions: []` and wipe the service's
 * actions. Every field here is optional and nothing defaults.
 */
exports.updateServiceSchema = Joi.object({ ...baseFields }).min(1);
