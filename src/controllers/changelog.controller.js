const { getChangelogByCategory } = require("../services/changelog.service");
const { asyncHandler } = require("../utils/asyncHandler");

exports.getChangelogByCategory = asyncHandler(async (req, res) => {
  const response = await getChangelogByCategory(req.params.categoryId, req.query);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(
    200,
    { data: response.data, pagination: response.pagination },
    "Changelog fetched successfully"
  );
});
