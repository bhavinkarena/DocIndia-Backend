const { Router } = require("express");
const { checkRole } = require("../middlewares/auth.middleware");
const {
  createFeedback,
  getAllFeedback,
  updateFeedbackStatus,
} = require("../controllers/feedback.controller");

const feedbackRoutes = Router();
const EDITORS = ["admin", "editor"];

// Deliberately public and anonymous — see feedback.model.js.
feedbackRoutes.post("/create", createFeedback);

feedbackRoutes.get("/all", checkRole(EDITORS), getAllFeedback);
feedbackRoutes.put("/status/:feedbackId", checkRole(EDITORS), updateFeedbackStatus);

module.exports = feedbackRoutes;
