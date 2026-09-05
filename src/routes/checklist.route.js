const { Router } = require("express");
const { verifyJWT } = require("../middlewares/auth.middleware");
const {
  generateChecklist,
  classifyGoal,
  getSharedChecklist,
  saveChecklist,
  getMyChecklists,
  getChecklistById,
  updateProgress,
  deleteChecklist,
} = require("../controllers/checklist.controller");

const checklistRoutes = Router();

// Public — the entire wizard works without an account.
checklistRoutes.post("/generate", generateChecklist);
checklistRoutes.post("/classify", classifyGoal);
checklistRoutes.get("/shared/:shareToken", getSharedChecklist);

// Authenticated — saving is the single conversion moment.
checklistRoutes.post("/save", verifyJWT, saveChecklist);
checklistRoutes.get("/my", verifyJWT, getMyChecklists);
checklistRoutes.get("/detail/:checklistId", verifyJWT, getChecklistById);
checklistRoutes.put("/progress/:checklistId", verifyJWT, updateProgress);
checklistRoutes.delete("/delete/:checklistId", verifyJWT, deleteChecklist);

module.exports = checklistRoutes;
