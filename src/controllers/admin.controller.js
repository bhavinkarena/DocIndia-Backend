const {
  getDashboardStats,
  getBrokenLinks,
  runSoftDeleteCleanup,
  bulkServices,
  bulkDocuments,
  bulkRules,
} = require("../services/admin.service");
const { getUsageSummary } = require("../services/analytics.service");
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

exports.runCleanup = asyncHandler(async (req, res) => {
  // Defaults to a dry run. Permanently deleting records is not something an
  // accidental POST with no body should be able to do.
  const dryRun = req.body?.dryRun !== false;

  const response = await runSoftDeleteCleanup({ dryRun });
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, response.message);
});

exports.getUsage = asyncHandler(async (req, res) => {
  // Clamped: the aggregation scans an indexed range, and an unbounded `days`
  // from a query string is a free way to make the database do arbitrary work.
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);

  const response = await getUsageSummary({ days });
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Usage fetched successfully");
});

/**
 * One handler per resource. The action lives in the body rather than the URL so
 * the frontend has a single endpoint per list page to talk to, and so adding an
 * action later does not mean adding a route.
 */
const bulkHandler = (operation, needsActor = false) =>
  asyncHandler(async (req, res) => {
    const payload = { ids: req.body?.ids, action: req.body?.action };
    const response = needsActor
      ? await operation(payload, req.user._id)
      : await operation(payload);

    if (!response.success) return res.error(response.statusCode, response.message);
    return res.success(response.statusCode, response.data, response.message);
  });

exports.bulkServices = bulkHandler(bulkServices);
exports.bulkDocuments = bulkHandler(bulkDocuments);
exports.bulkRules = bulkHandler(bulkRules, true);
