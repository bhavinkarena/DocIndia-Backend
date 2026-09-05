const Joi = require("joi");
const { sanitizeText } = require("../utils/sanitize");

const objectId = Joi.string().hex().length(24);

exports.createFeedbackSchema = Joi.object({
  serviceId: objectId.allow(null),
  action: Joi.string().trim().allow(null, ""),
  checklistId: objectId.allow(null),
  wasAccurate: Joi.boolean().allow(null),
  comment: Joi.string().trim().max(2000).custom(sanitizeText).allow("", null),
  contactEmail: Joi.string().trim().lowercase().email().allow("", null),
}).or("wasAccurate", "comment");

exports.updateFeedbackStatusSchema = Joi.object({
  status: Joi.string().valid("new", "reviewed", "actioned").required(),
});
