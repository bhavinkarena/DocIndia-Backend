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
const { track } = require("../services/analytics.service");

/* -------- public -------- */

exports.generateChecklist = asyncHandler(async (req, res) => {
  const response = await generateChecklist(req.body);
  if (!response.success) return res.error(response.statusCode, response.message);

  // Emitted from the controller, not the service: the service is also called
  // by saveChecklist, and counting that as a second generation would inflate
  // the completion rate the dashboard reports.
  track("checklist_generated", {
    serviceSlug: req.body?.serviceSlug,
    action: req.body?.action,
    state: req.body?.state,
    wasAuthenticated: Boolean(req.user),
  });

  return res.success(200, response.data, "Checklist generated successfully");
});

exports.classifyGoal = asyncHandler(async (req, res) => {
  const response = await classifyGoal(req.body);
  if (!response.success) return res.error(response.statusCode, response.message);

  const matched = response.data?.matches?.length || 0;
  // The query text itself is deliberately not recorded — see the note in
  // analyticsEvent.model.js. The count and the state are what say "people here
  // are looking for something we do not have".
  track(matched ? "search_performed" : "search_no_results", {
    state: req.body?.state,
    resultCount: matched,
    wasAuthenticated: Boolean(req.user),
  });

  return res.success(200, response.data, "Matches fetched successfully");
});

exports.getSharedChecklist = asyncHandler(async (req, res) => {
  const response = await getSharedChecklist(req.params.shareToken);
  if (!response.success) return res.error(response.statusCode, response.message);

  track("share_opened", {
    serviceSlug: response.data?.serviceSlug,
    action: response.data?.action,
    state: response.data?.state,
  });

  return res.success(200, response.data, "Checklist fetched successfully");
});

/* -------- authenticated -------- */

exports.saveChecklist = asyncHandler(async (req, res) => {
  const response = await saveChecklist(req.user._id, req.body);
  if (!response.success) return res.error(response.statusCode, response.message);

  track("checklist_saved", {
    serviceSlug: req.body?.serviceSlug,
    action: req.body?.action,
    state: req.body?.state,
    wasAuthenticated: true,
  });

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
