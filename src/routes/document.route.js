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

/**
 * @openapi
 * /document/create:
 *   post:
 *     tags: [Documents]
 *     summary: Add a document to the catalogue
 *     description: >
 *       Documents are shared across services — one "Proof of address" record is
 *       referenced by every rule that asks for it, so a correction to its
 *       official URL fixes every checklist at once.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, maxLength: 150 }
 *               description: { type: string }
 *               issuingBody: { type: string }
 *               officialUrl:
 *                 type: string
 *                 format: uri
 *                 description: The page that actually carries the authority.
 *               hasExpiry: { type: boolean }
 *               typicalValidity: { type: string, example: 10 years }
 *               copiesRequired: { type: integer, minimum: 0, maximum: 20 }
 *               attestation:
 *                 type: string
 *                 enum: [none, self-attested, notarised, gazetted-officer]
 *               validityWindow: { type: string, example: Issued within 3 months }
 *               formatNotes: { type: string }
 *               notes: { type: string }
 *               obtainedVia:
 *                 type: object
 *                 nullable: true
 *                 description: >
 *                   The service and action that issues this document, which is
 *                   what turns a flat checklist into a dependency graph.
 *                 properties:
 *                   serviceId: { type: string }
 *                   action: { type: string }
 *     responses:
 *       201: { description: Created. }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
documentRoutes.post("/create", checkRole(EDITORS), createDocument);

/**
 * @openapi
 * /document/all:
 *   get:
 *     tags: [Documents]
 *     summary: List documents
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 10 } }
 *       - { name: search, in: query, schema: { type: string } }
 *     responses:
 *       200: { description: Paginated documents. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
documentRoutes.get("/all", checkRole(EDITORS), getAllDocuments);

/**
 * @openapi
 * /document/options:
 *   get:
 *     tags: [Documents]
 *     summary: Minimal id/name list for rule-editor pickers
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "Every document as: _id and name."
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
documentRoutes.get("/options", checkRole(EDITORS), getDocumentOptions);

/**
 * @openapi
 * /document/detail/{documentId}:
 *   get:
 *     tags: [Documents]
 *     summary: Read one document
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: documentId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: The document. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
documentRoutes.get("/detail/:documentId", checkRole(EDITORS), getDocumentById);

/**
 * @openapi
 * /document/update/{documentId}:
 *   put:
 *     tags: [Documents]
 *     summary: Update a document
 *     description: Partial — only the fields sent are changed.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: documentId, in: path, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, minProperties: 1 }
 *     responses:
 *       200: { description: Updated. }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
documentRoutes.put("/update/:documentId", checkRole(EDITORS), updateDocument);

/**
 * @openapi
 * /document/delete/{documentId}:
 *   delete:
 *     tags: [Documents]
 *     summary: Soft-delete a document
 *     description: >
 *       Admin only, and refused while any rule still references it — a
 *       dangling reference must never reach a user.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: documentId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Deleted. }
 *       400:
 *         description: Still referenced by one or more rules.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
documentRoutes.delete("/delete/:documentId", checkRole(["admin"]), deleteDocument);

module.exports = documentRoutes;
