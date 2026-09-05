const {
  getPublishedCategories,
  getCategoryBySlug,
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} = require("../services/category.service");
const { asyncHandler } = require("../utils/asyncHandler");
const { STATES } = require("../utils/states");

/* -------- public -------- */

exports.getPublishedCategories = asyncHandler(async (req, res) => {
  const response = await getPublishedCategories();
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Categories fetched successfully");
});

exports.getCategoryBySlug = asyncHandler(async (req, res) => {
  const response = await getCategoryBySlug(req.params.slug);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Category fetched successfully");
});

/** Feeds the searchable state picker used by state-select questions. */
exports.getStates = asyncHandler(async (req, res) =>
  res.success(200, STATES, "States fetched successfully")
);

/* -------- admin -------- */

exports.createCategory = asyncHandler(async (req, res) => {
  const response = await createCategory(req.body);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(201, response.data, "Category created successfully");
});

exports.getAllCategories = asyncHandler(async (req, res) => {
  const response = await getAllCategories(req.query);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(
    200,
    { data: response.data, pagination: response.pagination },
    "Categories fetched successfully"
  );
});

exports.getCategoryById = asyncHandler(async (req, res) => {
  const response = await getCategoryById(req.params.categoryId);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Category fetched successfully");
});

exports.updateCategory = asyncHandler(async (req, res) => {
  const response = await updateCategory(req.params.categoryId, req.body);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Category updated successfully");
});

exports.deleteCategory = asyncHandler(async (req, res) => {
  const response = await deleteCategory(req.params.categoryId);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, {}, response.message);
});
