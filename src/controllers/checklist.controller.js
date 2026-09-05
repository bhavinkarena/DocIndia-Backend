const {
  generateChecklist,
  classifyGoal,
  saveChecklist,
  getMyChecklists,
  getChecklistById,
  getSharedChecklist,
  updateProgress,
  deleteChecklist,
} = require("../services/checklist.service");
const { asyncHandler } = require("../utils/asyncHandler");

/* -------- public -------- */

exports.generateChecklist = asyncHandler(async (req, res) => {
  const response = await generateChecklist(req.body);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Checklist generated successfully");
});

exports.classifyGoal = asyncHandler(async (req, res) => {
  const response = await classifyGoal(req.body);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Matches fetched successfully");
});

exports.getSharedChecklist = asyncHandler(async (req, res) => {
  const response = await getSharedChecklist(req.params.shareToken);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Checklist fetched successfully");
});

/* -------- authenticated -------- */

exports.saveChecklist = asyncHandler(async (req, res) => {
  const response = await saveChecklist(req.user._id, req.body);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(201, response.data, "Checklist saved successfully");
});

exports.getMyChecklists = asyncHandler(async (req, res) => {
  const response = await getMyChecklists(req.user._id, req.query);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(
    200,
    { data: response.data, pagination: response.pagination },
    "Checklists fetched successfully"
  );
});

exports.getChecklistById = asyncHandler(async (req, res) => {
  const response = await getChecklistById(req.user._id, req.params.checklistId);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Checklist fetched successfully");
});

exports.updateProgress = asyncHandler(async (req, res) => {
  const response = await updateProgress(
    req.user._id,
    req.params.checklistId,
    req.body
  );
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Progress updated successfully");
});

exports.deleteChecklist = asyncHandler(async (req, res) => {
  const response = await deleteChecklist(req.user._id, req.params.checklistId);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, {}, response.message);
});
