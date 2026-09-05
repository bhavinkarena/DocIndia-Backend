const { Router } = require("express");
const { checkRole } = require("../middlewares/auth.middleware");
const {
  getDashboardStats,
  getBrokenLinks,
  getUsage,
  runCleanup,
  bulkServices,
  bulkDocuments,
  bulkRules,
} = require("../controllers/admin.controller");

const adminRoutes = Router();
const EDITORS = ["admin", "editor"];

/**
 * @openapi
 * /admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Dashboard counts
 *     description: >
 *       Content and usage totals for the admin overview — services, documents,
 *       rules by verification status, saved checklists and open feedback.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The counts.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Envelope' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
adminRoutes.get("/stats", checkRole(EDITORS), getDashboardStats);

/**
 * @openapi
 * /admin/broken-links:
 *   get:
 *     tags: [Admin]
 *     summary: Official source URLs that failed their last check
 *     description: >
 *       From the weekly link-health cron. Catches hard failures only — many
 *       government sites redirect a dead deep link to their homepage and still
 *       return 200, so an empty list here is weak evidence that every link is
 *       still correct.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Documents whose last probe failed, with the reason.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Envelope' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
adminRoutes.get("/broken-links", checkRole(EDITORS), getBrokenLinks);

/**
 * @openapi
 * /admin/usage:
 *   get:
 *     tags: [Admin]
 *     summary: What people are actually doing
 *     description: >
 *       Feedback only arrives when something is wrong, and only from the few
 *       who bother. This answers what nobody reports: which services get used,
 *       which states have traffic, and where people searched for something
 *       that is not published.
 *
 *
 *       No personal data is recorded — no user id, IP or search text. Events
 *       expire after a year.
 *
 *
 *       `generationsPerView` and `savesPerGeneration` are ratios, not
 *       percentages, and can exceed 1 — someone who tweaks their answers
 *       generates a checklist several times from one service view. Read them
 *       as trend lines. Both are null rather than 0 when there is no traffic
 *       to divide by.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: days
 *         in: query
 *         schema: { type: integer, default: 30, minimum: 1, maximum: 365 }
 *         description: Size of the window to report on.
 *     responses:
 *       200:
 *         description: Funnel counts, top services, state distribution and content gaps.
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
 *                         windowDays: { type: integer }
 *                         funnel:
 *                           type: object
 *                           properties:
 *                             serviceViews: { type: integer }
 *                             checklistsGenerated: { type: integer }
 *                             checklistsSaved: { type: integer }
 *                             sharesOpened: { type: integer }
 *                             searches: { type: integer }
 *                             searchesWithNoResults: { type: integer }
 *                             generationsPerView: { type: number, nullable: true }
 *                             savesPerGeneration: { type: number, nullable: true }
 *                         topServices: { type: array, items: { type: object } }
 *                         byState: { type: array, items: { type: object } }
 *                         failedSearches: { type: array, items: { type: object } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
adminRoutes.get("/usage", checkRole(EDITORS), getUsage);

/**
 * @openapi
 * /admin/cleanup:
 *   post:
 *     tags: [Admin]
 *     summary: Permanently remove long-since soft-deleted records
 *     description: >
 *       Every model here marks `isDeleted: true` and keeps the row, which is
 *       right for the days after a deletion and wrong forever. This removes
 *       what was deleted more than the retention window ago (90 days by
 *       default, `SOFT_DELETE_RETENTION_DAYS`), cascading to the records that
 *       depend on them — a deleted service takes its rules and changelog, a
 *       deleted user takes their saved checklists and sessions.
 *
 *
 *       **Defaults to a dry run.** Send `dryRun: false` to actually delete.
 *       Admin only, and irreversible. The same sweep runs automatically at
 *       04:30 on Sundays.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               dryRun:
 *                 type: boolean
 *                 default: true
 *                 description: >
 *                   True reports what would be removed and changes nothing.
 *     responses:
 *       200:
 *         description: Per-collection counts of what was (or would be) removed.
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
 *                         dryRun: { type: boolean }
 *                         cutoff:
 *                           type: string
 *                           format: date-time
 *                           description: Records last modified before this were eligible.
 *                         total: { type: integer }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
adminRoutes.post("/cleanup", checkRole(["admin"]), runCleanup);

/**
 * Every bulk action routes each item through the same single-record service the
 * one-at-a-time UI uses, so the integrity rules still apply and the response
 * reports partial success rather than hiding it. See admin.service.js.
 *
 * @openapi
 * /admin/bulk/services:
 *   post:
 *     tags: [Admin]
 *     summary: Publish, unpublish or delete several services at once
 *     description: >
 *       Each item goes through the normal update/delete path, so a service
 *       whose deletion would strand a rule is refused individually and the
 *       rest still succeed. The response says which failed and why.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids, action]
 *             properties:
 *               ids:
 *                 type: array
 *                 maxItems: 100
 *                 items: { type: string }
 *               action:
 *                 type: string
 *                 enum: [publish, unpublish, delete]
 *     responses:
 *       200:
 *         description: Per-item outcome.
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
 *                         succeeded: { type: integer }
 *                         failedCount: { type: integer }
 *                         succeededIds: { type: array, items: { type: string } }
 *                         failed:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id: { type: string }
 *                               reason: { type: string }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
adminRoutes.post("/bulk/services", checkRole(EDITORS), bulkServices);

/**
 * @openapi
 * /admin/bulk/documents:
 *   post:
 *     tags: [Admin]
 *     summary: Delete several documents, or re-check their official links
 *     description: >
 *       `check-links` probes the selected URLs and returns 202 immediately —
 *       probing sleeps between requests rather than hammering government
 *       hosts, so results appear in the link-health list shortly afterwards
 *       rather than in this response. It exists because waiting until Monday
 *       to learn whether a link fix worked is not a workflow.
 *
 *
 *       `delete` refuses any document a rule still references, per document.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids, action]
 *             properties:
 *               ids:
 *                 type: array
 *                 maxItems: 100
 *                 items: { type: string }
 *               action:
 *                 type: string
 *                 enum: [delete, check-links]
 *     responses:
 *       200: { description: Per-item outcome for a delete. }
 *       202: { description: Link checks queued. }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
adminRoutes.post("/bulk/documents", checkRole(EDITORS), bulkDocuments);

/**
 * @openapi
 * /admin/bulk/rules:
 *   post:
 *     tags: [Admin]
 *     summary: Verify, flag or delete several rules at once
 *     description: >
 *       Bulk verification is offered because a reviewer really does work
 *       through the queue in one sitting — and it still stamps who verified
 *       each rule and when, exactly as the single-record path does.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids, action]
 *             properties:
 *               ids:
 *                 type: array
 *                 maxItems: 100
 *                 items: { type: string }
 *               action:
 *                 type: string
 *                 enum: [verify, needs-review, delete]
 *     responses:
 *       200: { description: Per-item outcome. }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
adminRoutes.post("/bulk/rules", checkRole(EDITORS), bulkRules);

module.exports = adminRoutes;
