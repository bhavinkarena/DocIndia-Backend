const { Router } = require("express");
const { checkRole } = require("../middlewares/auth.middleware");
const {
  upsertRule,
  getRule,
  getRulesForService,
  deleteRule,
  verifyRule,
  getVerificationQueue,
} = require("../controllers/rule.controller");

const ruleRoutes = Router();
const EDITORS = ["admin", "editor"];

ruleRoutes.post("/upsert", checkRole(EDITORS), upsertRule);
ruleRoutes.get("/verification-queue", checkRole(EDITORS), getVerificationQueue);
ruleRoutes.get("/service/:serviceId", checkRole(EDITORS), getRulesForService);
ruleRoutes.get("/service/:serviceId/:action", checkRole(EDITORS), getRule);
ruleRoutes.put("/verify/:ruleId", checkRole(EDITORS), verifyRule);
ruleRoutes.delete("/delete/:ruleId", checkRole(["admin"]), deleteRule);

module.exports = ruleRoutes;
