const { Router } = require("express");
const { checkRole } = require("../middlewares/auth.middleware");
const {
  createDocument,
  getAllDocuments,
  getDocumentOptions,
  getDocumentById,
  updateDocument,
  deleteDocument,
} = require("../controllers/document.controller");

const documentRoutes = Router();
const EDITORS = ["admin", "editor"];

documentRoutes.post("/create", checkRole(EDITORS), createDocument);
documentRoutes.get("/all", checkRole(EDITORS), getAllDocuments);
documentRoutes.get("/options", checkRole(EDITORS), getDocumentOptions);
documentRoutes.get("/detail/:documentId", checkRole(EDITORS), getDocumentById);
documentRoutes.put("/update/:documentId", checkRole(EDITORS), updateDocument);
documentRoutes.delete("/delete/:documentId", checkRole(["admin"]), deleteDocument);

module.exports = documentRoutes;
