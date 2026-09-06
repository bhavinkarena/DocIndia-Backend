const userRoutes = require("./user.route");
const serviceRoutes = require("./govService.route");
const documentRoutes = require("./document.route");
const ruleRoutes = require("./rule.route");
const checklistRoutes = require("./checklist.route");
const feedbackRoutes = require("./feedback.route");
const changelogRoutes = require("./changelog.route");
const adminRoutes = require("./admin.route");
const scholarshipRoutes = require("./scholarship.route");

const mainRoutes = (app) => {
  app.use("/user", userRoutes);
  app.use("/service", serviceRoutes);
  app.use("/document", documentRoutes);
  app.use("/rule", ruleRoutes);
  app.use("/checklist", checklistRoutes);
  app.use("/feedback", feedbackRoutes);
  app.use("/changelog", changelogRoutes);
  app.use("/admin", adminRoutes);
  app.use("/scholarship", scholarshipRoutes);
};

module.exports = mainRoutes;
