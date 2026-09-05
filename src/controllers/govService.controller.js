const {
  getServicesForState,
  getServiceBySlug,
  createService,
  getAllServices,
  getServiceById,
  updateService,
  deleteService,
} = require("../services/govService.service");
const { asyncHandler } = require("../utils/asyncHandler");
const { track } = require("../services/analytics.service");
const { STATES } = require("../utils/states");
const { ACTION_KEYS, ACTION_LABELS } = require("../utils/constants");

/* -------- public -------- */

/** Feeds the searchable state picker shown before anything else. */
exports.getStates = asyncHandler(async (req, res) =>
  res.success(200, STATES, "States fetched successfully")
);

exports.getActionTypes = asyncHandler(async (req, res) =>
  res.success(
    200,
    ACTION_KEYS.map((key) => ({ key, label: ACTION_LABELS[key] })),
    "Actions fetched successfully"
  )
);

exports.getServicesForState = asyncHandler(async (req, res) => {
  const response = await getServicesForState(req.query.state);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Services fetched successfully");
});

exports.getServiceBySlug = asyncHandler(async (req, res) => {
  const response = await getServiceBySlug(req.params.slug, req.query.state);
  if (!response.success) return res.error(response.statusCode, response.message);

  // The top of the funnel: someone picked this service and is now choosing an
  // action. Compared against checklist_generated it says how many people got
  // through the wizard at all.
  track("service_viewed", {
    serviceSlug: req.params.slug,
    state: req.query.state,
    wasAuthenticated: Boolean(req.user),
  });

  return res.success(200, response.data, "Service fetched successfully");
});

/* -------- admin -------- */

exports.createService = asyncHandler(async (req, res) => {
  const response = await createService(req.body);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(201, response.data, "Service created successfully");
});

exports.getAllServices = asyncHandler(async (req, res) => {
  const response = await getAllServices(req.query);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(
    200,
    { data: response.data, pagination: response.pagination },
    "Services fetched successfully"
  );
});

exports.getServiceById = asyncHandler(async (req, res) => {
  const response = await getServiceById(req.params.serviceId);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Service fetched successfully");
});

exports.updateService = asyncHandler(async (req, res) => {
  const response = await updateService(req.params.serviceId, req.body);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Service updated successfully");
});

exports.deleteService = asyncHandler(async (req, res) => {
  const response = await deleteService(req.params.serviceId);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, {}, response.message);
});
