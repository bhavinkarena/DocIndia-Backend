const { Router } = require("express");
const { checkRole } = require("../middlewares/auth.middleware");
const {
  getPublishedCategories,
  getCategoryBySlug,
  getStates,
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} = require("../controllers/category.controller");

const categoryRoutes = Router();
const EDITORS = ["admin", "editor"];

// Public — the wizard reads these without a login.
categoryRoutes.get("/published", getPublishedCategories);
categoryRoutes.get("/states", getStates);

// Admin — declared before /slug/:slug would be irrelevant here since the
// public route is namespaced, but keeping admin paths explicit avoids clashes.
categoryRoutes.post("/create", checkRole(EDITORS), createCategory);
categoryRoutes.get("/all", checkRole(EDITORS), getAllCategories);
categoryRoutes.get("/detail/:categoryId", checkRole(EDITORS), getCategoryById);
categoryRoutes.put("/update/:categoryId", checkRole(EDITORS), updateCategory);
categoryRoutes.delete("/delete/:categoryId", checkRole(["admin"]), deleteCategory);

// Public catch-all by slug — registered last so it cannot shadow the
// literal paths above.
categoryRoutes.get("/:slug", getCategoryBySlug);

module.exports = categoryRoutes;
