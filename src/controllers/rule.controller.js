const {
  upsertRule,
  getRuleByCategory,
  verifyRule,
  getVerificationQueue,
} = require("../services/rule.service");
const { asyncHandler } = require("../utils/asyncHandler");

exports.upsertRule = asyncHandler(async (req, res) => {
  const response = await upsertRule(req.body, req.user._id);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(response.statusCode, response.data, "Rule saved successfully");
});

exports.getRuleByCategory = asyncHandler(async (req, res) => {
  const response = await getRuleByCategory(req.params.categoryId);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Rule fetched successfully");
});

exports.verifyRule = asyncHandler(async (req, res) => {
  const response = await verifyRule(req.params.ruleId, req.body, req.user._id);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Verification status updated");
});

exports.getVerificationQueue = asyncHandler(async (req, res) => {
  const response = await getVerificationQueue();
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Verification queue fetched successfully");
});
