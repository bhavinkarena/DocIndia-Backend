const mongoose = require("mongoose");

/**
 * What people actually do, so content decisions stop being guesswork.
 *
 * Feedback is reactive — it only arrives when something is wrong, and only
 * from the small fraction of people who bother. This answers the questions
 * nobody reports: which services people look for, where in the wizard they
 * give up, and which states have traffic nothing is published for.
 *
 * Deliberately NOT a general-purpose event pipeline. No IP, no user agent, no
 * session stitching, no funnel identity. This is a government-paperwork tool
 * used by people in a vulnerable position — "which documents is this person
 * gathering" is sensitive, and the honest way to hold it is to record only
 * what answers a content question and nothing that rebuilds an individual's
 * history.
 *
 * Only events the server can actually observe are listed. Wizard step-by-step
 * progress is deliberately absent: the wizard runs entirely client-side and
 * makes no request between questions, so recording "abandoned on question 3"
 * would mean adding a beacon endpoint whose only purpose is tracking. That is
 * a bigger decision than a dashboard widget — and an event type nothing emits
 * is worse than none at all, because it fills a chart with a confident-looking
 * zero.
 */
const EVENT_TYPES = [
  "service_viewed",
  "checklist_generated",
  "checklist_saved",
  "share_opened",
  "search_performed",
  "search_no_results",
  /**
   * Scholarship events follow the same rule as everything above: what the
   * server can observe about *content*, never about a person. A match records
   * how many results came back and nothing about the answers that produced
   * them — those include caste, income band and disability status, and the
   * honest way to hold that is not to hold it.
   */
  "scholarship_viewed",
  "scholarship_matched",
  "scholarship_match_empty",
];

const analyticsEventSchema = new mongoose.Schema(
  {
    type: { type: String, enum: EVENT_TYPES, required: true, index: true },

    // Slug rather than ObjectId: these outlive the records they describe, and
    // a chart that breaks when a service is deleted is not much of a record.
    serviceSlug: { type: String, trim: true, default: null },
    action: { type: String, trim: true, default: null },
    state: { type: String, trim: true, default: null },

    /**
     * How many results a search returned. Typed and singular rather than a
     * free-form metadata blob, so this cannot quietly become the place someone
     * stashes personal data later.
     */
    resultCount: { type: Number, default: null },

    /**
     * Whether the visitor was signed in — not WHO they were.
     *
     * "Do people save more when signed in" is worth knowing; "what is user X
     * applying for" is not ours to keep. Storing a userId would make this
     * collection a per-person record of someone's dealings with the state.
     */
    wasAuthenticated: { type: Boolean, default: false },

    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

/**
 * Every dashboard query is "events of this type, in this window", so the
 * compound index matches the access pattern rather than adding one per field.
 */
analyticsEventSchema.index({ type: 1, createdAt: -1 });
analyticsEventSchema.index({ serviceSlug: 1, createdAt: -1 });
analyticsEventSchema.index({ state: 1, createdAt: -1 });

/**
 * Events expire after a year. Analytics is for spotting trends and gaps, and
 * a two-year-old page view informs no decision anyone is making — while an
 * ever-growing collection of behavioural records is a liability that only
 * grows. Mongo drops them without anyone having to remember.
 */
analyticsEventSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 365 * 24 * 60 * 60 }
);

module.exports = mongoose.model("AnalyticsEvent", analyticsEventSchema);
module.exports.EVENT_TYPES = EVENT_TYPES;
