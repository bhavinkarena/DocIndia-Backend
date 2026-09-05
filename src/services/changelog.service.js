const { isValidObjectId } = require("mongoose");
const Changelog = require("../models/changelog.model");
const { serviceHandler } = require("../utils/asyncHandler");
const { parseListQuery, buildPagination } = require("../utils/common");

exports.getChangelogByService = serviceHandler(async (serviceId, query) => {
  if (!isValidObjectId(serviceId)) {
    return { success: false, statusCode: 400, message: "Invalid service ID" };
  }

  const { pageNumber, limitNumber, skip } = parseListQuery(query);

  const filter = { serviceId };
  if (query.action) filter.action = query.action;

  const [totalItems, entries] = await Promise.all([
    Changelog.countDocuments(filter),
    Changelog.find(filter)
      .populate("changedBy", "firstName lastName")
      .sort({ publishedAt: -1, version: -1 })
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
