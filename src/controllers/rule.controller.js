const {
  upsertRule,
  getRule,
  getRulesForService,
  deleteRule,
  verifyRule,
  getVerificationQueue,
} = require("../services/rule.service");
const { asyncHandler } = require("../utils/asyncHandler");

exports.upsertRule = asyncHandler(async (req, res) => {
  const response = await upsertRule(req.body, req.user._id);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(response.statusCode, response.data, "Rule saved successfully");
});

exports.getRule = asyncHandler(async (req, res) => {
  const response = await getRule(
    req.params.serviceId,
    req.params.action,
    req.query.state || null
  );
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Rule fetched successfully");
});

exports.getRulesForService = asyncHandler(async (req, res) => {
  const response = await getRulesForService(req.params.serviceId);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Rules fetched successfully");
});

exports.deleteRule = asyncHandler(async (req, res) => {
  const response = await deleteRule(req.params.ruleId);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, {}, response.message);
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
