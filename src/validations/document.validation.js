const Joi = require("joi");
const { ACTION_KEYS } = require("../utils/constants");

const objectId = Joi.string().hex().length(24);

const fields = {
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

  copiesRequired: Joi.number().integer().min(0).max(20).allow(null),
  attestation: Joi.string().valid(
    "none",
    "self-attested",
    "notarised",
    "gazetted-officer"
  ),
  validityWindow: Joi.string().trim().allow("", null),
  formatNotes: Joi.string().trim().allow("", null),

  obtainedVia: Joi.object({
    serviceId: objectId.allow(null),
    action: Joi.string().valid(...ACTION_KEYS).allow(null),
  }).allow(null),
};

exports.createDocumentSchema = Joi.object({
  ...fields,
  name: fields.name.required(),
  hasExpiry: fields.hasExpiry.default(false),
  attestation: fields.attestation.default("none"),
});

/**
 * Written out in full for the same reason as updateServiceSchema: forking the
 * create schema would carry over `hasExpiry: default(false)`, so editing only
 * a document's name would silently reset its expiry flag.
 */
exports.updateDocumentSchema = Joi.object({ ...fields }).min(1);
