const { Router } = require("express");
const { checkRole } = require("../middlewares/auth.middleware");
const {
  upsertRule,
  getRule,
  getRulesForService,
  deleteRule,
  verifyRule,
  getVerificationQueue,
} = require("../controllers/rule.controller");

const ruleRoutes = Router();
const EDITORS = ["admin", "editor"];

/**
 * @openapi
 * /rule/upsert:
 *   post:
 *     tags: [Rules]
 *     summary: Create or replace the rule for a service, action and state
 *     description: >
 *       A rule is keyed on (serviceId, action, state). A null state is the
 *       national default; a rule with a state overrides it for that state only.
 *
 *
 *       Every edit bumps `version`, writes a changelog entry, and resets
 *       verification to `needs-review` — a content change invalidates the
 *       previous human check. Saved checklists governed by the rule are flagged
 *       rather than rewritten, and their owners are emailed once per edit.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [serviceId, action]
 *             properties:
 *               serviceId: { type: string }
 *               action:
 *                 type: string
 *                 enum: [new, renew, update, correction, replace, surrender]
 *               state:
 *                 type: string
 *                 nullable: true
 *                 description: Null or omitted means the national default.
 *               baseDocuments:
 *                 type: array
 *                 description: Always required, whatever the answers.
 *                 items:
 *                   type: object
 *                   required: [documentId]
 *                   properties:
 *                     documentId: { type: string }
 *                     mandatory: { type: boolean }
 *                     note: { type: string }
 *               conditionalBlocks:
 *                 type: array
 *                 description: Documents that apply only when the conditions match.
 *                 items:
 *                   type: object
 *                   properties:
 *                     label: { type: string }
 *                     matchType: { type: string, enum: [all, any] }
 *                     conditions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           questionKey:
 *                             type: string
 *                             description: >
 *                               Must exist on the action. "state" is always
 *                               valid — the engine injects it.
 *                           operator:
 *                             type: string
 *                             enum: [eq, neq, in, nin, contains]
 *                           value: {}
 *                     documents: { type: array, items: { type: object } }
 *               processSteps:
 *                 type: array
 *                 items: { $ref: '#/components/schemas/ProcessStep' }
 *               summary:
 *                 type: string
 *                 description: >
 *                   What changed and why. Goes into the changelog and into the
 *                   email sent to affected users, so write it for them.
 *     responses:
 *       200: { description: Existing rule updated; version incremented. }
 *       201: { description: New rule created at version 1. }
 *       400:
 *         description: >
 *           Validation failed, or one of the integrity checks did — an unknown
 *           question key, a document id that does not exist, an action the
 *           service lacks, or a state it is not offered in.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
ruleRoutes.post("/upsert", checkRole(EDITORS), upsertRule);

/**
 * @openapi
 * /rule/verification-queue:
 *   get:
 *     tags: [Rules]
 *     summary: Rules awaiting a human source check
 *     description: >
 *       Everything unverified or flagged needs-review, including rules the
 *       daily cron flagged for being past their review date. Nothing is ever
 *       unpublished automatically — a stale checklist is still better than a
 *       missing one, and pulling content is a decision for a person.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 10 } }
 *     responses:
 *       200: { description: Paginated rules needing review. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
ruleRoutes.get("/verification-queue", checkRole(EDITORS), getVerificationQueue);

/**
 * @openapi
 * /rule/service/{serviceId}:
 *   get:
 *     tags: [Rules]
 *     summary: Every rule for a service, across actions and states
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: serviceId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: The rules. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
ruleRoutes.get("/service/:serviceId", checkRole(EDITORS), getRulesForService);

/**
 * @openapi
 * /rule/service/{serviceId}/{action}:
 *   get:
 *     tags: [Rules]
 *     summary: One rule, by service, action and optional state
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: serviceId, in: path, required: true, schema: { type: string } }
 *       - name: action
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           enum: [new, renew, update, correction, replace, surrender]
 *       - name: state
 *         in: query
 *         schema: { type: string }
 *         description: Omit for the national default.
 *     responses:
 *       200: { description: The rule. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
ruleRoutes.get("/service/:serviceId/:action", checkRole(EDITORS), getRule);

/**
 * @openapi
 * /rule/verify/{ruleId}:
 *   put:
 *     tags: [Rules]
 *     summary: Record a human verification decision
 *     description: >
 *       Marking a rule verified stamps who did it and when, and sets the next
 *       review date 90 days out. This is the claim the whole product rests on,
 *       so it is only ever set by a person.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: ruleId, in: path, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [verificationStatus]
 *             properties:
 *               verificationStatus:
 *                 type: string
 *                 enum: [unverified, verified, needs-review]
 *               note: { type: string }
 *     responses:
 *       200: { description: Updated. }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
ruleRoutes.put("/verify/:ruleId", checkRole(EDITORS), verifyRule);

/**
 * @openapi
 * /rule/delete/{ruleId}:
 *   delete:
 *     tags: [Rules]
 *     summary: Soft-delete a rule
 *     description: >
 *       Admin only. Deleting the national default is refused while any state
 *       still falls back to it.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: ruleId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Deleted. }
 *       400:
 *         description: States still depend on this national default.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
ruleRoutes.delete("/delete/:ruleId", checkRole(["admin"]), deleteRule);

module.exports = ruleRoutes;
