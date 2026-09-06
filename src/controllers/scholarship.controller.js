const service = require("../services/scholarship.service");
const { asyncHandler } = require("../utils/asyncHandler");
const { track } = require("../services/analytics.service");
const {
  EDUCATION_LEVELS,
  EDUCATION_LEVEL_LABELS,
  INCOME_BANDS,
  INCOME_BAND_LABELS,
  SOCIAL_CATEGORIES,
  PROVIDER_TYPES,
} = require("../utils/constants");

/** Thin, as everywhere: unwrap the service result into the shared envelope. */
const respond = (res, result, successMessage) =>
  result.success
    ? res.success(result.statusCode, result.data, result.message || successMessage)
    : res.error(result.statusCode, result.message);

/* -------- public -------- */

exports.listScholarships = asyncHandler(async (req, res) => {
  const result = await service.listScholarships(req.query);
  return respond(res, result, "Scholarships fetched successfully");
});

exports.getScholarshipBySlug = asyncHandler(async (req, res) => {
  const result = await service.getScholarshipBySlug(req.params.slug, req.query);
  if (result.success) {
    track("scholarship_viewed", {
      serviceSlug: req.params.slug,
      state: req.query.state || null,
      wasAuthenticated: Boolean(req.user),
    });
  }
  return respond(res, result, "Scholarship fetched successfully");
});

exports.getClosingSoon = asyncHandler(async (req, res) => {
  const result = await service.getClosingSoon(req.query);
  return respond(res, result, "Closing soon fetched successfully");
});

exports.getFilters = asyncHandler(async (req, res) => {
  const result = await service.getFilters(req.query);
  return respond(res, result, "Filters fetched successfully");
});

exports.getStateCoverage = asyncHandler(async (req, res) => {
  const result = await service.getStateCoverage();
  return respond(res, result, "State coverage fetched successfully");
});

/**
 * The question set the finder renders.
 *
 * Served rather than hard-coded in the frontend so the option values the
 * client sends can never drift from the ones scheme criteria are written
 * against — a mismatch there fails silently as "nobody qualifies".
 */
exports.getQuizQuestions = asyncHandler(async (req, res) =>
  res.success(
    200,
    {
      educationLevels: EDUCATION_LEVELS.map((value) => ({
        value,
        label: EDUCATION_LEVEL_LABELS[value],
      })),
      incomeBands: INCOME_BANDS.map((value) => ({
        value,
        label: INCOME_BAND_LABELS[value],
      })),
      categories: SOCIAL_CATEGORIES.map((value) => ({
        value,
        label: value === "obc" ? "OBC" : value.toUpperCase(),
      })),
      providerTypes: PROVIDER_TYPES,
      institutionTypes: [
        { value: "government", label: "Government" },
        { value: "private", label: "Private" },
        { value: "aided", label: "Government-aided" },
      ],
    },
    "Quiz options fetched successfully"
  )
);

exports.matchScholarships = asyncHandler(async (req, res) => {
  const result = await service.matchScholarships(req.body);

  if (result.success) {
    const count = result.data.counts.qualified;
    /**
     * Only the count, never the answers. A zero-result match is a content-gap
     * signal worth acting on; what the student told us about their caste and
     * income is not something this product keeps.
     */
    track(count > 0 ? "scholarship_matched" : "scholarship_match_empty", {
      state: req.body?.domicileState || null,
      resultCount: count,
      wasAuthenticated: Boolean(req.user),
    });
  }

  return respond(res, result, "Matches fetched successfully");
});

exports.getReadiness = asyncHandler(async (req, res) => {
  const result = await service.getReadiness(req.params.slug, req.body);
  return respond(res, result, "Readiness assessed successfully");
});

/* -------- authenticated -------- */

exports.watchScholarship = asyncHandler(async (req, res) => {
  const result = await service.watchScholarship(req.user._id, req.params.slug);
  return respond(res, result, "Added to your watchlist");
});

exports.unwatchScholarship = asyncHandler(async (req, res) => {
  const result = await service.unwatchScholarship(req.user._id, req.params.slug);
  return respond(res, result, "Removed from your watchlist");
});

exports.getWatchlist = asyncHandler(async (req, res) => {
  const result = await service.getWatchlist(req.user._id);
  return respond(res, result, "Watchlist fetched successfully");
});

/* -------- editor / admin -------- */

exports.listAllScholarships = asyncHandler(async (req, res) => {
  const result = await service.listAllScholarships(req.query);
  return respond(res, result, "Scholarships fetched successfully");
});

exports.createScholarship = asyncHandler(async (req, res) => {
  const result = await service.createScholarship(req.body);
  return respond(res, result, "Scholarship created successfully");
});

exports.updateScholarship = asyncHandler(async (req, res) => {
  const result = await service.updateScholarship(req.params.id, req.body);
  return respond(res, result, "Scholarship updated successfully");
});

exports.verifyScholarship = asyncHandler(async (req, res) => {
  const result = await service.verifyScholarship(
    req.params.id,
    req.body,
    req.user._id
  );
  return respond(res, result, "Verification updated successfully");
});

exports.deleteScholarship = asyncHandler(async (req, res) => {
  const result = await service.deleteScholarship(req.params.id);
  return respond(res, result, "Scholarship deleted successfully");
});
