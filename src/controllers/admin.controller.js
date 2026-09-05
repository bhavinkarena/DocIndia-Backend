const { getDashboardStats, getBrokenLinks } = require("../services/admin.service");
const { asyncHandler } = require("../utils/asyncHandler");

exports.getDashboardStats = asyncHandler(async (req, res) => {
  const response = await getDashboardStats();
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Stats fetched successfully");
});

exports.getBrokenLinks = asyncHandler(async (req, res) => {
  const response = await getBrokenLinks();
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Broken links fetched successfully");
});
