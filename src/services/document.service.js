const { isValidObjectId } = require("mongoose");
const DocumentModel = require("../models/document.model");
const Rule = require("../models/rule.model");
const { serviceHandler } = require("../utils/asyncHandler");
const {
  createDocumentSchema,
  updateDocumentSchema,
} = require("../validations/document.validation");
const { slugify, parseListQuery, buildPagination } = require("../utils/common");

exports.createDocument = serviceHandler(async (data) => {
  const { error, value } = createDocumentSchema.validate(data);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  const slug = value.slug || slugify(value.name);

  const existing = await DocumentModel.findOne({ slug, isDeleted: false });
  if (existing) {
    return {
      success: false,
      statusCode: 409,
      message: "A document with this slug already exists",
    };
  }

  const document = new DocumentModel({ ...value, slug });
  await document.save();

  return { success: true, statusCode: 201, data: document };
});

exports.getAllDocuments = serviceHandler(async (query) => {
  const { pageNumber, limitNumber, skip, search, sortBy, sortOrder } =
    parseListQuery(query);

  const filter = { isDeleted: false };
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { issuingBody: { $regex: search, $options: "i" } },
    ];
  }

  const [totalItems, documents] = await Promise.all([
    DocumentModel.countDocuments(filter),
    DocumentModel.find(filter)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limitNumber)
      .lean(),
  ]);

  return {
    success: true,
    statusCode: 200,
    data: documents,
    pagination: buildPagination(totalItems, pageNumber, limitNumber),
  };
});

/** Unpaginated, for populating rule-builder pickers. */
exports.getDocumentOptions = serviceHandler(async () => {
  const documents = await DocumentModel.find({ isDeleted: false })
    .select("name slug issuingBody officialUrl hasExpiry")
    .sort({ name: 1 })
    .lean();

  return { success: true, statusCode: 200, data: documents };
});

exports.getDocumentById = serviceHandler(async (documentId) => {
  if (!isValidObjectId(documentId)) {
    return { success: false, statusCode: 400, message: "Invalid document ID" };
  }

  const document = await DocumentModel.findOne({
    _id: documentId,
    isDeleted: false,
  }).lean();

  if (!document) {
    return { success: false, statusCode: 404, message: "Document not found" };
  }

  return { success: true, statusCode: 200, data: document };
});

exports.updateDocument = serviceHandler(async (documentId, data) => {
  if (!isValidObjectId(documentId)) {
    return { success: false, statusCode: 400, message: "Invalid document ID" };
  }

  const { error, value } = updateDocumentSchema.validate(data);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  const document = await DocumentModel.findOne({
    _id: documentId,
    isDeleted: false,
  });
  if (!document) {
    return { success: false, statusCode: 404, message: "Document not found" };
  }

  if (value.slug && value.slug !== document.slug) {
    const clash = await DocumentModel.findOne({
      slug: value.slug,
      isDeleted: false,
      _id: { $ne: documentId },
    });
    if (clash) {
      return {
        success: false,
        statusCode: 409,
        message: "A document with this slug already exists",
      };
    }
  }

  // A changed URL invalidates whatever the last health probe concluded.
  if (value.officialUrl && value.officialUrl !== document.officialUrl) {
    value.linkHealth = {
      lastCheckedAt: null,
      lastHttpStatus: null,
      isHealthy: null,
      lastError: null,
    };
  }

  const updated = await DocumentModel.findByIdAndUpdate(documentId, value, {
    new: true,
  });

  return { success: true, statusCode: 200, data: updated };
});

exports.deleteDocument = serviceHandler(async (documentId) => {
  if (!isValidObjectId(documentId)) {
    return { success: false, statusCode: 400, message: "Invalid document ID" };
  }

  const document = await DocumentModel.findOne({
    _id: documentId,
    isDeleted: false,
  });
  if (!document) {
    return { success: false, statusCode: 404, message: "Document not found" };
  }

  // The whole point of a shared registry is that deleting a document would
  // silently blank it out of every checklist referencing it. Refuse instead.
  const referencing = await Rule.find({
    isDeleted: false,
    $or: [
      { "baseDocuments.documentId": documentId },
      { "conditionalBlocks.documents.documentId": documentId },
    ],
  })
    .populate("serviceId", "label")
    .lean();

  if (referencing.length) {
    const names = [
      ...new Set(
        referencing
          .map((r) => (r.serviceId?.label ? `${r.serviceId.label} (${r.action})` : null))
          .filter(Boolean)
      ),
    ].join(", ");
    return {
      success: false,
      statusCode: 409,
      message: `This document is still used by rules in: ${names}. Remove it from those rules first.`,
    };
  }

  await DocumentModel.findByIdAndUpdate(documentId, { isDeleted: true });

  return { success: true, statusCode: 200, message: "Document deleted" };
});
