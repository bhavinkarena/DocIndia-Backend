const { getChangelogByService } = require("../services/changelog.service");
const { asyncHandler } = require("../utils/asyncHandler");

exports.getChangelogByService = asyncHandler(async (req, res) => {
  const response = await getChangelogByService(req.params.serviceId, req.query);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(
    200,
    { data: response.data, pagination: response.pagination },
    "Changelog fetched successfully"
  );
});
