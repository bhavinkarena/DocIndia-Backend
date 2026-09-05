const Joi = require("joi");

exports.createDocumentSchema = Joi.object({
  name: Joi.string().trim().min(1).max(150).required(),
  slug: Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9-]+$/)
    .allow("", null),
  description: Joi.string().trim().allow("", null),
  issuingBody: Joi.string().trim().allow("", null),
  officialUrl: Joi.string()
    .trim()
    .uri({ scheme: ["http", "https"] })
    .allow("", null)
    .messages({ "string.uri": "Official URL must be a valid http(s) URL" }),
  hasExpiry: Joi.boolean().default(false),
  typicalValidity: Joi.string().trim().allow("", null),
  notes: Joi.string().trim().allow("", null),
});

/**
 * Written out in full for the same reason as updateCategorySchema: forking
 * the create schema would carry over `hasExpiry: default(false)`, so editing
 * only a document's name would silently reset its expiry flag.
 */
exports.updateDocumentSchema = Joi.object({
  name: Joi.string().trim().min(1).max(150),
  slug: Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9-]+$/)
    .allow("", null),
  description: Joi.string().trim().allow("", null),
  issuingBody: Joi.string().trim().allow("", null),
  officialUrl: Joi.string()
    .trim()
    .uri({ scheme: ["http", "https"] })
    .allow("", null)
    .messages({ "string.uri": "Official URL must be a valid http(s) URL" }),
  hasExpiry: Joi.boolean(),
  typicalValidity: Joi.string().trim().allow("", null),
  notes: Joi.string().trim().allow("", null),
}).min(1);
