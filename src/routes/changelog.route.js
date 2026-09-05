const { Router } = require("express");
const { getChangelogByService } = require("../controllers/changelog.controller");

const changelogRoutes = Router();

// Public: users are entitled to see what changed and when.
changelogRoutes.get("/service/:serviceId", getChangelogByService);

module.exports = changelogRoutes;
