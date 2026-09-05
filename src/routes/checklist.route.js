const { Router } = require("express");
const { verifyJWT } = require("../middlewares/auth.middleware");
const {
  generateChecklist,
  classifyGoal,
  getSharedChecklist,
  saveChecklist,
  getMyChecklists,
  getChecklistById,
  updateProgress,
  deleteChecklist,
} = require("../controllers/checklist.controller");

const checklistRoutes = Router();

/**
 * @openapi
 * /checklist/generate:
 *   post:
 *     tags: [Checklists]
 *     summary: Run the rules engine and return a checklist
 *     description: >
 *       Public — the entire wizard works without an account. Picks the state
 *       override for the given state if one exists, otherwise the national
 *       default, then evaluates the conditional blocks against the answers.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [serviceSlug, action, state]
 *             properties:
 *               serviceSlug: { type: string, example: passport }
 *               action:
 *                 type: string
 *                 enum: [new, renew, update, correction, replace, surrender]
 *               state: { type: string, example: gujarat }
 *               answers:
 *                 type: object
 *                 additionalProperties: true
 *                 description: >
 *                   Keyed by the action's question keys. `state` is reserved —
 *                   the engine injects it from the state field above.
 *                 example: { whatToUpdate: "address" }
 *               alreadyHave:
 *                 type: array
 *                 items: { type: string }
 *                 description: >
 *                   Document ids the user already holds, so the result can
 *                   separate "you have this" from "you still need this".
 *     responses:
 *       200:
 *         description: The generated checklist.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/GeneratedChecklist' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       404:
 *         description: No published rule for that service, action and state.
 */
checklistRoutes.post("/generate", generateChecklist);

/**
 * @openapi
 * /checklist/classify:
 *   post:
 *     tags: [Checklists]
 *     summary: Match a plain-language goal to services
 *     description: >
 *       Keyword-overlap scoring, not a language model. `confident` is true only
 *       when the top hit scores at least 10 **and** is clearly ahead of the
 *       runner-up — being the best of several weak matches is not the same as
 *       being right. `guessedAction` is inferred from words like "renew" or
 *       "lost" and is null when nothing indicates one.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [query]
 *             properties:
 *               query:
 *                 type: string
 *                 maxLength: 300
 *                 example: I want to renew my passport
 *               state:
 *                 type: string
 *                 nullable: true
 *                 description: Limits results to services offered there.
 *     responses:
 *       200:
 *         description: Up to five matches, best first.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         confident: { type: boolean }
 *                         matches:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               _id: { type: string }
 *                               label: { type: string }
 *                               slug: { type: string }
 *                               authority: { type: string }
 *                               score: { type: number }
 *                               guessedAction:
 *                                 type: string
 *                                 nullable: true
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
checklistRoutes.post("/classify", classifyGoal);

/**
 * @openapi
 * /checklist/shared/{shareToken}:
 *   get:
 *     tags: [Checklists]
 *     summary: Read a shared checklist
 *     description: >
 *       Read-only, no auth. The owner's progress is deliberately not exposed.
 *     parameters:
 *       - name: shareToken
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The frozen checklist as it was generated.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Envelope' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
checklistRoutes.get("/shared/:shareToken", getSharedChecklist);

/**
 * @openapi
 * /checklist/save:
 *   post:
 *     tags: [Checklists]
 *     summary: Save a generated checklist to the account
 *     description: >
 *       Re-runs the engine server-side and stores a frozen snapshot. The
 *       snapshot is never rewritten afterwards — when the underlying rule
 *       changes the saved copy is flagged instead, so it always shows exactly
 *       what the tool said on the day the user acted on it.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [serviceSlug, action, state]
 *             properties:
 *               serviceSlug: { type: string }
 *               action:
 *                 type: string
 *                 enum: [new, renew, update, correction, replace, surrender]
 *               state: { type: string }
 *               answers: { type: object, additionalProperties: true }
 *               alreadyHave:
 *                 type: array
 *                 items: { type: string }
 *                 description: Carried in as starting progress.
 *               title: { type: string, maxLength: 150 }
 *     responses:
 *       201:
 *         description: Saved.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Envelope' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
checklistRoutes.post("/save", verifyJWT, saveChecklist);

/**
 * @openapi
 * /checklist/my:
 *   get:
 *     tags: [Checklists]
 *     summary: List the signed-in user's saved checklists
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 10 } }
 *     responses:
 *       200:
 *         description: Paginated checklists, each with a progress summary.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Envelope' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
checklistRoutes.get("/my", verifyJWT, getMyChecklists);

/**
 * @openapi
 * /checklist/detail/{checklistId}:
 *   get:
 *     tags: [Checklists]
 *     summary: Read one saved checklist
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: checklistId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: >
 *           The saved checklist. `hasRuleUpdate` true means the official
 *           requirements have moved on since it was saved.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Envelope' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
checklistRoutes.get("/detail/:checklistId", verifyJWT, getChecklistById);

/**
 * @openapi
 * /checklist/progress/{checklistId}:
 *   put:
 *     tags: [Checklists]
 *     summary: Tick or untick one document
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: checklistId, in: path, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [documentId, checked]
 *             properties:
 *               documentId: { type: string }
 *               checked: { type: boolean }
 *     responses:
 *       200:
 *         description: Updated progress.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Envelope' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
checklistRoutes.put("/progress/:checklistId", verifyJWT, updateProgress);

/**
 * @openapi
 * /checklist/delete/{checklistId}:
 *   delete:
 *     tags: [Checklists]
 *     summary: Delete a saved checklist
 *     description: Soft delete — the record is retained but no longer returned.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: checklistId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Deleted.
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
checklistRoutes.delete("/delete/:checklistId", verifyJWT, deleteChecklist);

module.exports = checklistRoutes;
