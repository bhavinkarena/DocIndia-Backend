const { isValidObjectId } = require("mongoose");
const Changelog = require("../models/changelog.model");
const { serviceHandler } = require("../utils/asyncHandler");
const { parseListQuery, buildPagination } = require("../utils/common");

exports.getChangelogByCategory = serviceHandler(async (categoryId, query) => {
  if (!isValidObjectId(categoryId)) {
    return { success: false, statusCode: 400, message: "Invalid category ID" };
  }

  const { pageNumber, limitNumber, skip } = parseListQuery(query);
  const filter = { categoryId };

  const [totalItems, entries] = await Promise.all([
    Changelog.countDocuments(filter),
    Changelog.find(filter)
      .populate("changedBy", "firstName lastName")
      .sort({ version: -1 })
      .skip(skip)
      .limit(limitNumber)
      .lean(),
  ]);

  return {
    success: true,
    statusCode: 200,
    data: entries,
    pagination: buildPagination(totalItems, pageNumber, limitNumber),
  };
});
