const { Router } = require("express");
const { checkRole } = require("../middlewares/auth.middleware");
const {
  getStates,
  getActionTypes,
  getServicesForState,
  getServiceBySlug,
  createService,
  getAllServices,
  getServiceById,
  updateService,
  deleteService,
} = require("../controllers/govService.controller");

const serviceRoutes = Router();
const EDITORS = ["admin", "editor"];

// Public — the whole browse flow works without a login.
serviceRoutes.get("/states", getStates);
serviceRoutes.get("/actions", getActionTypes);
serviceRoutes.get("/by-state", getServicesForState);

// Admin.
serviceRoutes.post("/create", checkRole(EDITORS), createService);
serviceRoutes.get("/all", checkRole(EDITORS), getAllServices);
serviceRoutes.get("/detail/:serviceId", checkRole(EDITORS), getServiceById);
serviceRoutes.put("/update/:serviceId", checkRole(EDITORS), updateService);
serviceRoutes.delete("/delete/:serviceId", checkRole(["admin"]), deleteService);

// Public catch-all by slug — registered last so it cannot shadow the
// literal paths above.
serviceRoutes.get("/:slug", getServiceBySlug);

module.exports = serviceRoutes;
