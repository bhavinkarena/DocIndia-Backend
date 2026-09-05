const {
  createFeedback,
  getAllFeedback,
  updateFeedbackStatus,
} = require("../services/feedback.service");
const { asyncHandler } = require("../utils/asyncHandler");

exports.createFeedback = asyncHandler(async (req, res) => {
  const response = await createFeedback(req.body);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(201, response.data, "Thanks — your feedback was recorded");
});

exports.getAllFeedback = asyncHandler(async (req, res) => {
  const response = await getAllFeedback(req.query);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(
    200,
    { data: response.data, pagination: response.pagination },
    "Feedback fetched successfully"
  );
});

exports.updateFeedbackStatus = asyncHandler(async (req, res) => {
  const response = await updateFeedbackStatus(req.params.feedbackId, req.body);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Feedback updated successfully");
});
