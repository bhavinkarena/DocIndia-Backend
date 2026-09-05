const { Router } = require("express");
const { checkRole } = require("../middlewares/auth.middleware");
const { getDashboardStats, getBrokenLinks } = require("../controllers/admin.controller");

const adminRoutes = Router();
const EDITORS = ["admin", "editor"];

adminRoutes.get("/stats", checkRole(EDITORS), getDashboardStats);
adminRoutes.get("/broken-links", checkRole(EDITORS), getBrokenLinks);

module.exports = adminRoutes;
