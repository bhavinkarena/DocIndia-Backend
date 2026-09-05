const { isValidObjectId } = require("mongoose");
const Feedback = require("../models/feedback.model");
const { serviceHandler } = require("../utils/asyncHandler");
const {
  createFeedbackSchema,
  updateFeedbackStatusSchema,
} = require("../validations/feedback.validation");
const { parseListQuery, buildPagination } = require("../utils/common");

exports.createFeedback = serviceHandler(async (data) => {
  const { error, value } = createFeedbackSchema.validate(data);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  const feedback = await Feedback.create(value);

  return { success: true, statusCode: 201, data: feedback };
});

exports.getAllFeedback = serviceHandler(async (query) => {
  const { pageNumber, limitNumber, skip, sortBy, sortOrder } =
    parseListQuery(query);

  const filter = { isDeleted: false };
  if (query.status) filter.status = query.status;
  if (query.categoryId && isValidObjectId(query.categoryId)) {
    filter.categoryId = query.categoryId;
  }
  if (query.accurate === "false") filter.wasAccurate = false;
  if (query.accurate === "true") filter.wasAccurate = true;

  const [totalItems, feedback] = await Promise.all([
    Feedback.countDocuments(filter),
    Feedback.find(filter)
      .populate("categoryId", "label slug")
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limitNumber)
      .lean(),
  ]);

  return {
    success: true,
    statusCode: 200,
    data: feedback,
    pagination: buildPagination(totalItems, pageNumber, limitNumber),
  };
});

exports.updateFeedbackStatus = serviceHandler(async (feedbackId, data) => {
  if (!isValidObjectId(feedbackId)) {
    return { success: false, statusCode: 400, message: "Invalid feedback ID" };
  }

  const { error, value } = updateFeedbackStatusSchema.validate(data);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  const updated = await Feedback.findOneAndUpdate(
    { _id: feedbackId, isDeleted: false },
    { status: value.status },
    { new: true }
  );

  if (!updated) {
    return { success: false, statusCode: 404, message: "Feedback not found" };
  }

  return { success: true, statusCode: 200, data: updated };
});
