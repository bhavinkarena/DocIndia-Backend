const { Router } = require("express");
const { checkRole } = require("../middlewares/auth.middleware");
const { feedbackLimiter } = require("../middlewares/rateLimit.middleware");
const {
  createFeedback,
  getAllFeedback,
  updateFeedbackStatus,
} = require("../controllers/feedback.controller");

const feedbackRoutes = Router();
const EDITORS = ["admin", "editor"];

/**
 * Deliberately public and anonymous — see feedback.model.js. That is also what
 * makes it spammable, hence the limiter.
 *
 * @openapi
 * /feedback/create:
 *   post:
 *     tags: [Feedback]
 *     summary: Report whether a checklist was accurate
 *     description: >
 *       Anonymous by design and public: this is the early-warning system for
 *       content going stale, and the moment it costs effort people stop
 *       reporting. Rate limited to 20 per hour per IP. Free text is stripped of
 *       markup on the way in.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: At least one of wasAccurate or comment is required.
 *             properties:
 *               serviceId: { type: string, nullable: true }
 *               action: { type: string, nullable: true }
 *               checklistId: { type: string, nullable: true }
 *               wasAccurate: { type: boolean, nullable: true }
 *               comment: { type: string, maxLength: 2000 }
 *               contactEmail:
 *                 type: string
 *                 format: email
 *                 description: Optional — only if they want a reply.
 *     responses:
 *       201:
 *         description: Recorded.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Envelope' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/RateLimited' }
 */
feedbackRoutes.post("/create", feedbackLimiter, createFeedback);

/**
 * @openapi
 * /feedback/all:
 *   get:
 *     tags: [Feedback]
 *     summary: List reports
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 10 } }
 *       - name: status
 *         in: query
 *         schema: { type: string, enum: [new, reviewed, actioned] }
 *     responses:
 *       200:
 *         description: Paginated feedback, newest first.
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
feedbackRoutes.get("/all", checkRole(EDITORS), getAllFeedback);

/**
 * @openapi
 * /feedback/status/{feedbackId}:
 *   put:
 *     tags: [Feedback]
 *     summary: Move a report through the triage states
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: feedbackId, in: path, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [new, reviewed, actioned] }
 *     responses:
 *       200: { description: Updated. }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
feedbackRoutes.put("/status/:feedbackId", checkRole(EDITORS), updateFeedbackStatus);

module.exports = feedbackRoutes;
