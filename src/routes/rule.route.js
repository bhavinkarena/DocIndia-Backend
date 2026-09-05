const { Router } = require("express");
const { checkRole } = require("../middlewares/auth.middleware");
const {
  upsertRule,
  getRuleByCategory,
  verifyRule,
  getVerificationQueue,
} = require("../controllers/rule.controller");

const ruleRoutes = Router();
const EDITORS = ["admin", "editor"];

ruleRoutes.post("/upsert", checkRole(EDITORS), upsertRule);
ruleRoutes.get("/verification-queue", checkRole(EDITORS), getVerificationQueue);
ruleRoutes.get("/category/:categoryId", checkRole(EDITORS), getRuleByCategory);
ruleRoutes.put("/verify/:ruleId", checkRole(EDITORS), verifyRule);

module.exports = ruleRoutes;
