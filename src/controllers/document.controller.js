const {
  createDocument,
  getAllDocuments,
  getDocumentOptions,
  getDocumentById,
  updateDocument,
  deleteDocument,
} = require("../services/document.service");
const { asyncHandler } = require("../utils/asyncHandler");

exports.createDocument = asyncHandler(async (req, res) => {
  const response = await createDocument(req.body);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(201, response.data, "Document created successfully");
});

exports.getAllDocuments = asyncHandler(async (req, res) => {
  const response = await getAllDocuments(req.query);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(
    200,
    { data: response.data, pagination: response.pagination },
    "Documents fetched successfully"
  );
});

exports.getDocumentOptions = asyncHandler(async (req, res) => {
  const response = await getDocumentOptions();
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Documents fetched successfully");
});

exports.getDocumentById = asyncHandler(async (req, res) => {
  const response = await getDocumentById(req.params.documentId);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Document fetched successfully");
});

exports.updateDocument = asyncHandler(async (req, res) => {
  const response = await updateDocument(req.params.documentId, req.body);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Document updated successfully");
});

exports.deleteDocument = asyncHandler(async (req, res) => {
  const response = await deleteDocument(req.params.documentId);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, {}, response.message);
});
