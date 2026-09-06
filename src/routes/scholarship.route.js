const { Router } = require("express");
const c = require("../controllers/scholarship.controller");
const { verifyJWT, optionalAuth, checkRole } = require("../middlewares/auth.middleware");
const { matchLimiter, watchLimiter } = require("../middlewares/rateLimit.middleware");

const scholarshipRoutes = Router();
const EDITORS = ["editor", "admin"];

/**
 * @openapi
 * tags:
 *   - name: Scholarships
 *     description: >
 *       Scholarship catalogue, eligibility finder and document readiness.
 *       Scholarships are the first populated type on the shared Scheme model;
 *       welfare schemes and pensions will reuse the same endpoints.
 */

/* ------------------------------------------------------------------ *
 * Public
 * ------------------------------------------------------------------ */

/**
 * @openapi
 * /scholarship:
 *   get:
 *     tags: [Scholarships]
 *     summary: Browse published scholarships
 *     description: >
 *       State is a scoping rule, not a filter. Passing `state` returns central
 *       schemes AND that state's own — filtering to one would hide every NSP
 *       scholarship and halve what a student sees. Window status is derived at
 *       read time, never stored, so it cannot go stale between cron runs.
 *     parameters:
 *       - { name: state, in: query, schema: { type: string }, description: State slug — scopes, does not exclude }
 *       - { name: level, in: query, schema: { type: string, enum: [pre-matric, post-matric, ug, pg, phd, diploma, iti, professional] } }
 *       - { name: providerType, in: query, schema: { type: string, enum: [central, state, ugc, aicte, university, private, csr] } }
 *       - { name: stream, in: query, schema: { type: string } }
 *       - { name: status, in: query, schema: { type: string, enum: [open, closing-soon, upcoming, closed, rolling, not-announced] } }
 *       - { name: search, in: query, schema: { type: string } }
 *       - { name: sort, in: query, schema: { type: string, enum: [deadline, value, name, newest], default: deadline } }
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 20 } }
 *     responses:
 *       200: { description: Paginated scholarships, closed ones always last. }
 */
scholarshipRoutes.get("/", c.listScholarships);

/**
 * @openapi
 * /scholarship/closing-soon:
 *   get:
 *     tags: [Scholarships]
 *     summary: Scholarships closing within a window
 *     description: >
 *       Missing a scholarship deadline costs a student an academic year, so
 *       this is a first-class endpoint rather than a sort option.
 *     parameters:
 *       - { name: state, in: query, schema: { type: string } }
 *       - { name: days, in: query, schema: { type: integer, default: 30, maximum: 180 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 10 } }
 *     responses:
 *       200: { description: Scholarships closing soonest first. }
 */
scholarshipRoutes.get("/closing-soon", c.getClosingSoon);

/**
 * @openapi
 * /scholarship/filters:
 *   get:
 *     tags: [Scholarships]
 *     summary: Facet values present in published content
 *     description: >
 *       Derived from what is actually published, so the browse filters never
 *       offer a level or stream that returns an empty list.
 *     parameters:
 *       - { name: state, in: query, schema: { type: string } }
 *     responses:
 *       200: { description: Levels, streams and provider types in use. }
 */
scholarshipRoutes.get("/filters", c.getFilters);

/**
 * @openapi
 * /scholarship/states:
 *   get:
 *     tags: [Scholarships]
 *     summary: Per-state scholarship coverage
 *     description: >
 *       Counts per state, so the picker can say "Bihar — 6 state schemes" and
 *       an uncovered state reads as "not added yet" rather than as a state
 *       with no scholarships. Those are different statements and only one is
 *       honest.
 *     responses:
 *       200: { description: Every state with its published count and coverage flag. }
 */
scholarshipRoutes.get("/states", c.getStateCoverage);

/**
 * @openapi
 * /scholarship/quiz:
 *   get:
 *     tags: [Scholarships]
 *     summary: Option sets for the eligibility finder
 *     description: >
 *       Served rather than hard-coded in the client so the values it sends can
 *       never drift from the ones scheme criteria are written against — a
 *       mismatch there fails silently as "nobody qualifies".
 *     responses:
 *       200: { description: Education levels, income bands, categories. }
 */
scholarshipRoutes.get("/quiz", c.getQuizQuestions);

/**
 * @openapi
 * /scholarship/match:
 *   post:
 *     tags: [Scholarships]
 *     summary: Find scholarships a student qualifies for
 *     description: >
 *       Public, unauthenticated and stateless — answers come in, matches go
 *       out, nothing is stored. The quiz collects caste, income band and
 *       disability status; the honest way to hold that data is not to hold it.
 *
 *
 *       Returns three groups. `qualified` meets every stated criterion.
 *       `nearMisses` fails on one or two, and says which. `undetermined`
 *       depends on a question that was not answered — never collapsed into
 *       "not qualified", because that would tell someone they are ineligible
 *       on the basis of a question they simply skipped.
 *
 *
 *       Domicile and institution state are separate questions. A
 *       Bihar-domiciled student studying in Karnataka qualifies for Bihar's
 *       scheme and not Karnataka's, and conflating the two gets that wrong for
 *       every cross-state student in the country.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               domicileState: { type: string }
 *               institutionState: { type: string }
 *               educationLevel: { type: string }
 *               stream: { type: string }
 *               yearOfStudy: { type: integer }
 *               lastExamPercentage: { type: number }
 *               familyIncome: { type: string, enum: [below-1l, 1l-2.5l, 2.5l-4.5l, 4.5l-8l, above-8l], description: A band, never an exact figure }
 *               category: { type: string, enum: [general, obc, sc, st, ebc, minority] }
 *               gender: { type: string, enum: [male, female, other] }
 *               hasDisability: { type: boolean }
 *               isMinority: { type: boolean }
 *               institutionType: { type: string, enum: [government, private, aided] }
 *               parentOccupation: { type: string }
 *     responses:
 *       200: { description: qualified, nearMisses and undetermined groups. }
 *       429: { description: Rate limited — 30 per hour per IP. }
 */
scholarshipRoutes.post("/match", matchLimiter, optionalAuth, c.matchScholarships);

/* ------------------------------------------------------------------ *
 * Editor / admin
 *
 * Mounted under /scholarship/admin rather than a separate router so the
 * whole surface stays in one file — the role guard is the boundary, not the
 * mount point.
 * ------------------------------------------------------------------ */

/**
 * @openapi
 * /scholarship/admin/all:
 *   get:
 *     tags: [Scholarships]
 *     summary: All scholarships including unpublished
 *     description: >
 *       Each row carries a weighted completeness score. A half-entered
 *       scholarship is invisible work until someone can see it, so the queue
 *       sorts on what is closest to publishable rather than at random.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Paginated, with completeness per row. }
 *       403: { description: Editor or admin only. }
 */
scholarshipRoutes.get("/admin/all", checkRole(EDITORS), c.listAllScholarships);

/**
 * @openapi
 * /scholarship/admin:
 *   post:
 *     tags: [Scholarships]
 *     summary: Create a scholarship
 *     description: >
 *       Created unpublished. Nothing publishes unverified — a human opens the
 *       official circular and confirms the closing date, the income ceiling
 *       and the apply URL first.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Created, unpublished and unverified. }
 */
scholarshipRoutes.post("/admin", checkRole(EDITORS), c.createScholarship);

/**
 * @openapi
 * /scholarship/admin/{id}:
 *   put:
 *     tags: [Scholarships]
 *     summary: Update a scholarship
 *     description: >
 *       Any content edit bumps `version` and resets verification to
 *       needs-review. An edited record still carrying yesterday's verified
 *       badge is the most misleading state this content can be in.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Updated, verification reset. }
 *   delete:
 *     tags: [Scholarships]
 *     summary: Soft-delete a scholarship
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Soft-deleted and unpublished. }
 */
scholarshipRoutes.put("/admin/:id", checkRole(EDITORS), c.updateScholarship);
scholarshipRoutes.delete("/admin/:id", checkRole(EDITORS), c.deleteScholarship);

/**
 * @openapi
 * /scholarship/admin/{id}/verify:
 *   post:
 *     tags: [Scholarships]
 *     summary: Record a verification decision
 *     description: >
 *       Defaults `nextReviewAt` to next June rather than a rolling 90 days —
 *       scholarship windows follow the academic calendar, and the useful time
 *       to re-check every record is before the cycle opens.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Verification recorded. }
 */
scholarshipRoutes.post("/admin/:id/verify", checkRole(EDITORS), c.verifyScholarship);
/* ------------------------------------------------------------------ *
 * Authenticated
 * ------------------------------------------------------------------ */

/**
 * @openapi
 * /scholarship/me/watchlist:
 *   get:
 *     tags: [Scholarships]
 *     summary: Scholarships this user is watching
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Watched scholarships, closing soonest first. }
 */
scholarshipRoutes.get("/me/watchlist", verifyJWT, c.getWatchlist);

/**
 * @openapi
 * /scholarship/{slug}/watch:
 *   post:
 *     tags: [Scholarships]
 *     summary: Get reminded before this closes
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: slug, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Watching. Reminders at 30, 14, 7 and 2 days. }
 *   delete:
 *     tags: [Scholarships]
 *     summary: Stop watching
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { name: slug, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Removed. }
 */
scholarshipRoutes.post("/:slug/watch", verifyJWT, watchLimiter, c.watchScholarship);
scholarshipRoutes.delete("/:slug/watch", verifyJWT, watchLimiter, c.unwatchScholarship);

/* ------------------------------------------------------------------ *
 * Dynamic paths last.
 *
 * Express matches in registration order, so "/:slug/watch" registered before
 * "/admin/:id" would swallow a DELETE to an admin route. Every static path
 * above is therefore registered first, and the parameterised ones come last.
 * ------------------------------------------------------------------ */

/**
 * @openapi
 * /scholarship/{slug}:
 *   get:
 *     tags: [Scholarships]
 *     summary: One scholarship, with its resolved document list
 *     parameters:
 *       - { name: slug, in: path, required: true, schema: { type: string } }
 *       - { name: state, in: query, schema: { type: string } }
 *     responses:
 *       200: { description: The scholarship, its derived window and its documents. }
 *       404: { description: Not found or not published. }
 */
scholarshipRoutes.get("/:slug", optionalAuth, c.getScholarshipBySlug);

/**
 * @openapi
 * /scholarship/{slug}/readiness:
 *   post:
 *     tags: [Scholarships]
 *     summary: Can this student still make the deadline?
 *     description: >
 *       The document bridge. Resolves which documents this applicant needs,
 *       which they already hold, and for each missing one how long it takes to
 *       obtain — using the same rules that generate checklists, so the two can
 *       never quote different lead times for the same errand.
 *
 *
 *       Documents are obtained in parallel, so the critical path is the single
 *       longest one, not the sum.
 *
 *
 *       `too-late` is returned only when every input is confirmed. If the
 *       deadline is predicted, or any lead time is unknown, the verdict is
 *       `unknown`. Telling a student they have missed a deadline they have not
 *       missed is worse than saying nothing.
 *     parameters:
 *       - { name: slug, in: path, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               answers: { type: object, description: Quiz answers, for conditional requirements }
 *               alreadyHave: { type: array, items: { type: string }, description: Document ids or slugs the student holds }
 *               state: { type: string }
 *     responses:
 *       200: { description: held, missing, criticalPath and a timing verdict. }
 */
scholarshipRoutes.post("/:slug/readiness", optionalAuth, c.getReadiness);


module.exports = scholarshipRoutes;
