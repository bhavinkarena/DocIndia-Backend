const AnalyticsEvent = require("../models/analyticsEvent.model");
const { serviceHandler } = require("../utils/asyncHandler");
const logger = require("../utils/logger");

const log = logger.child({ component: "analytics" });

/**
 * Records an event without ever making the caller wait or fail on it.
 *
 * Fire-and-forget on purpose. Analytics is the least important thing happening
 * in any request that emits one — a user generating a checklist must not see
 * an error, or a slower page, because a write to a metrics collection had a
 * bad moment. Failures are logged at debug: they matter to nobody at 3am.
 */
const track = (type, fields = {}) => {
  AnalyticsEvent.create({
    type,
    serviceSlug: fields.serviceSlug || null,
    action: fields.action || null,
    state: fields.state || null,
    resultCount: fields.resultCount ?? null,
    wasAuthenticated: Boolean(fields.wasAuthenticated),
  }).catch((err) => log.debug({ err, type }, "Analytics event not recorded"));
};

/** Events from the last `days` days. */
const since = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/**
 * The admin dashboard's usage panel.
 *
 * Everything is scoped to a window rather than all-time, because "which
 * services are popular" means now — a service that was busy last year and is
 * dead today should not look healthy.
 */
exports.getUsageSummary = serviceHandler(async ({ days = 30 } = {}) => {
  const window = { createdAt: { $gte: since(days) } };

  const [topServices, byState, funnel, failedSearches] = await Promise.all([
    AnalyticsEvent.aggregate([
      { $match: { ...window, type: "checklist_generated", serviceSlug: { $ne: null } } },
      { $group: { _id: { service: "$serviceSlug", action: "$action" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      {
        $project: {
          _id: 0,
          serviceSlug: "$_id.service",
          action: "$_id.action",
          count: 1,
        },
      },
    ]),

    AnalyticsEvent.aggregate([
      { $match: { ...window, type: "checklist_generated", state: { $ne: null } } },
      { $group: { _id: "$state", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
      { $project: { _id: 0, state: "$_id", count: 1 } },
    ]),

    /**
     * Counts per stage, which is what turns raw totals into rates. The
     * interesting number is not how many checklists were generated but how
     * many people opened a service to get them.
     */
    AnalyticsEvent.aggregate([
      { $match: window },
      { $group: { _id: "$type", count: { $sum: 1 } } },
      { $project: { _id: 0, type: "$_id", count: 1 } },
    ]),

    /**
     * Searches that matched nothing, with what was being looked for implied by
     * the state and count. This is the content backlog, written by users:
     * every row is somebody who wanted something that is not here.
     */
    AnalyticsEvent.aggregate([
      { $match: { ...window, type: "search_no_results" } },
      { $group: { _id: "$state", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, state: "$_id", count: 1 } },
    ]),
  ]);

  const counts = Object.fromEntries(funnel.map((f) => [f.type, f.count]));
  const viewed = counts.service_viewed || 0;
  const generated = counts.checklist_generated || 0;
  const saved = counts.checklist_saved || 0;

  return {
    success: true,
    statusCode: 200,
    data: {
      windowDays: days,
      funnel: {
        serviceViews: viewed,
        checklistsGenerated: generated,
        checklistsSaved: saved,
        sharesOpened: counts.share_opened || 0,
        searches: counts.search_performed || 0,
        searchesWithNoResults: counts.search_no_results || 0,
        /**
         * Ratios, not percentages — and named so, because both can legitimately
         * exceed 1. Someone who tweaks their answers generates the checklist
         * three times from a single service view; calling that a "completion
         * rate of 300%" would be nonsense on a dashboard.
         *
         * Read them as trend lines. A falling generationsPerView means people
         * are opening services and not getting through the wizard, which is
         * the signal worth acting on, whatever its absolute value.
         *
         * Null rather than 0 when the denominator is empty: "0%" for a period
         * with no traffic reads as a failure rather than as silence.
         */
        generationsPerView: viewed ? Number((generated / viewed).toFixed(3)) : null,
        savesPerGeneration: generated ? Number((saved / generated).toFixed(3)) : null,
      },
      topServices,
      byState,
      failedSearches,
    },
  };
});

exports.track = track;
