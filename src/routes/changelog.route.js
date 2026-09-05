const { Router } = require("express");
const { getChangelogByService } = require("../controllers/changelog.controller");

const changelogRoutes = Router();

/**
 * Public: users are entitled to see what changed and when.
 *
 * @openapi
 * /changelog/service/{serviceId}:
 *   get:
 *     tags: [Changelog]
 *     summary: History of rule changes for a service
 *     description: >
 *       Every rule edit writes an entry here with the version it produced and
 *       which documents were added or removed. This is what lets a user whose
 *       saved checklist was flagged see what actually moved.
 *     parameters:
 *       - { name: serviceId, in: path, required: true, schema: { type: string } }
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 10 } }
 *     responses:
 *       200:
 *         description: Paginated changelog entries, newest first.
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
 *                         data:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               action: { type: string }
 *                               version: { type: integer }
 *                               summary: { type: string }
 *                               changes:
 *                                 type: object
 *                                 properties:
 *                                   added: { type: array, items: { type: string } }
 *                                   removed: { type: array, items: { type: string } }
 *                               createdAt: { type: string, format: date-time }
 *       400:
 *         description: The service id is not a valid ObjectId.
 */
changelogRoutes.get("/service/:serviceId", getChangelogByService);

module.exports = changelogRoutes;
