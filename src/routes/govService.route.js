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

/**
 * @openapi
 * /service/states:
 *   get:
 *     tags: [Services]
 *     summary: List all states and union territories
 *     description: Static for the life of the app — safe to cache hard.
 *     responses:
 *       200:
 *         description: 36 entries of { value, label }.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           value: { type: string, example: gujarat }
 *                           label: { type: string, example: Gujarat }
 */
serviceRoutes.get("/states", getStates);

/**
 * @openapi
 * /service/actions:
 *   get:
 *     tags: [Services]
 *     summary: List the action types and their labels
 *     description: >
 *       What a user wants to do with a document. The same service asks for very
 *       different paperwork depending on which of these it is — renewing a
 *       passport is not the same errand as applying for a first one.
 *     responses:
 *       200:
 *         description: Action keys with display labels.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           key:
 *                             type: string
 *                             enum: [new, renew, update, correction, replace, surrender]
 *                           label: { type: string, example: Renew / re-issue }
 */
serviceRoutes.get("/actions", getActionTypes);

/**
 * @openapi
 * /service/by-state:
 *   get:
 *     tags: [Services]
 *     summary: List published services available in a state
 *     description: >
 *       Returns national services plus any state-scoped ones offered there.
 *       A service with no published action is omitted — there would be nothing
 *       to click through to.
 *     parameters:
 *       - $ref: '#/components/parameters/stateQuery'
 *     responses:
 *       200:
 *         description: Services with their published actions.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Envelope' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
serviceRoutes.get("/by-state", getServicesForState);

/**
 * @openapi
 * /service/create:
 *   post:
 *     tags: [Services]
 *     summary: Create a service
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [label]
 *             properties:
 *               label: { type: string, maxLength: 120 }
 *               slug:
 *                 type: string
 *                 description: Derived from the label when omitted.
 *               description: { type: string }
 *               authority: { type: string, example: Issued by UIDAI }
 *               keywords:
 *                 type: array
 *                 items: { type: string }
 *                 description: Feeds the /checklist/classify search.
 *               scope: { type: string, enum: [national, state] }
 *               availableStates:
 *                 type: array
 *                 items: { type: string }
 *                 description: Only consulted when scope is "state".
 *               actions: { type: array, items: { type: object } }
 *               isPublished: { type: boolean }
 *     responses:
 *       201:
 *         description: Created.
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
serviceRoutes.post("/create", checkRole(EDITORS), createService);

/**
 * @openapi
 * /service/all:
 *   get:
 *     tags: [Services]
 *     summary: List every service, published or not
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 10 } }
 *       - { name: search, in: query, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Paginated services with action counts.
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
serviceRoutes.get("/all", checkRole(EDITORS), getAllServices);

/**
 * @openapi
 * /service/detail/{serviceId}:
 *   get:
 *     tags: [Services]
 *     summary: Read one service by id, including unpublished actions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: serviceId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: The service. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
serviceRoutes.get("/detail/:serviceId", checkRole(EDITORS), getServiceById);

/**
 * @openapi
 * /service/update/{serviceId}:
 *   put:
 *     tags: [Services]
 *     summary: Update a service
 *     description: >
 *       Partial — only the fields sent are changed. Dropping an action or a
 *       question that a rule still depends on is refused, since Mongo enforces
 *       no referential integrity of its own.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: serviceId, in: path, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, minProperties: 1 }
 *     responses:
 *       200: { description: Updated. }
 *       400:
 *         description: >
 *           Validation failed, or the change would orphan a rule that still
 *           references the removed action or question.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
serviceRoutes.put("/update/:serviceId", checkRole(EDITORS), updateService);

/**
 * @openapi
 * /service/delete/{serviceId}:
 *   delete:
 *     tags: [Services]
 *     summary: Soft-delete a service
 *     description: Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: serviceId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Deleted. }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
serviceRoutes.delete("/delete/:serviceId", checkRole(["admin"]), deleteService);

/**
 * Registered last so it cannot shadow the literal paths above.
 *
 * @openapi
 * /service/{slug}:
 *   get:
 *     tags: [Services]
 *     summary: Read a published service by slug
 *     description: >
 *       Public. Each action carries its verification status and last-verified
 *       date so the interface can say plainly how trustworthy it is.
 *     parameters:
 *       - { name: slug, in: path, required: true, schema: { type: string }, example: passport }
 *       - $ref: '#/components/parameters/stateQuery'
 *     responses:
 *       200:
 *         description: The service and its published actions.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Envelope' }
 *       404:
 *         description: Not published, or not available in that state.
 */
serviceRoutes.get("/:slug", getServiceBySlug);

module.exports = serviceRoutes;
