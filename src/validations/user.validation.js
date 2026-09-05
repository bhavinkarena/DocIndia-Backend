const Joi = require("joi");
const { sanitizeText } = require("../utils/sanitize");

exports.registerSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(50).custom(sanitizeText).required(),
  lastName: Joi.string().trim().min(1).max(50).custom(sanitizeText).required(),
  email: Joi.string().trim().lowercase().email().required(),
  password: Joi.string().min(8).max(128).required().messages({
    "string.min": "Password must be at least 8 characters",
  }),
});

exports.loginSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  password: Joi.string().required(),
});

exports.updateProfileSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(50).custom(sanitizeText),
  lastName: Joi.string().trim().min(1).max(50).custom(sanitizeText),
  notificationPrefs: Joi.object({
    email: Joi.boolean(),
  }),
}).min(1);

exports.changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).max(128).required(),
});

exports.forgotPasswordSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required().messages({
    "string.email": "Enter a valid email address",
    "any.required": "Enter the email address on your account",
  }),
});

exports.resetPasswordSchema = Joi.object({
  // 48 hex characters — see generateOpaqueToken. Checking the shape here means
  // a truncated or mangled link is rejected before it costs a database lookup.
  token: Joi.string().trim().hex().length(48).required().messages({
    "string.hex": "That reset link is not valid",
    "string.length": "That reset link is not valid",
    "any.required": "That reset link is not valid",
  }),
  password: Joi.string().min(8).max(128).required().messages({
    "string.min": "Password must be at least 8 characters",
  }),
});
