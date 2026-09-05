const userRoutes = require("./user.route");
const categoryRoutes = require("./category.route");
const documentRoutes = require("./document.route");
const ruleRoutes = require("./rule.route");
const checklistRoutes = require("./checklist.route");
const feedbackRoutes = require("./feedback.route");
const changelogRoutes = require("./changelog.route");
const adminRoutes = require("./admin.route");

const mainRoutes = (app) => {
  app.use("/user", userRoutes);
  app.use("/category", categoryRoutes);
  app.use("/document", documentRoutes);
  app.use("/rule", ruleRoutes);
  app.use("/checklist", checklistRoutes);
  app.use("/feedback", feedbackRoutes);
  app.use("/changelog", changelogRoutes);
  app.use("/admin", adminRoutes);
};

module.exports = mainRoutes;
