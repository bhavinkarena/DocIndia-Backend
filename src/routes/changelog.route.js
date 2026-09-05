const { Router } = require("express");
const { getChangelogByCategory } = require("../controllers/changelog.controller");

const changelogRoutes = Router();

// Public: users are entitled to see what changed and when.
changelogRoutes.get("/category/:categoryId", getChangelogByCategory);

module.exports = changelogRoutes;
