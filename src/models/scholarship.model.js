const mongoose = require("mongoose");
const Scheme = require("./scheme.model");
const {
  EDUCATION_LEVELS,
  WINDOW_STAGES,
  DATE_CONFIDENCE,
} = require("../utils/constants");

/**
 * Scholarships, as a discriminator on Scheme.
 *
 * Everything shared — eligibility, documents, benefits, provider, verification
 * — lives on the base. This adds only what is genuinely scholarship-shaped:
 * an academic dimension and a multi-stage application window.
 */

/**
 * One stage of the application cycle.
 *
 * A scholarship does not have a deadline; it has four or five, and the one
 * students actually miss is rarely the first. They submit on time, their
 * institute never verifies before the institute cut-off, and the application
 * dies without anyone being told. Modelling only "closesAt" would hide exactly
 * the trap this module exists to surface.
 */
const windowStageSchema = new mongoose.Schema(
  {
    key: { type: String, enum: WINDOW_STAGES, required: true },
    label: { type: String, trim: true },
    opensAt: { type: Date, default: null },
    closesAt: { type: Date, default: null },

    /**
     * Extensions are the norm on NSP, not the exception — often more than one
     * in a cycle. Keeping the original date lets the page say "extended from
     * 31 Oct" instead of silently showing a different date than it did
     * yesterday, which reads as our error rather than the ministry's decision.
     */
    originalClosesAt: { type: Date, default: null },
    extensionCount: { type: Number, default: 0 },

    /**
     * How much this date is worth trusting. A date lifted from an aggregator
     * must not render identically to one a human confirmed against this year's
     * circular — see windowStatus.js and §4.3 of the plan.
     */
    confidence: { type: String, enum: DATE_CONFIDENCE, default: "unknown" },
    sourceUrl: { type: String, trim: true },
  },
  { _id: false }
);

const windowSchema = new mongoose.Schema(
  {
    academicYear: { type: String, trim: true }, // "2026-27"
    isRolling: { type: Boolean, default: false },
    stages: { type: [windowStageSchema], default: [] },
    // Renewal applicants often face a different — and earlier — set of dates.
    renewalStages: { type: [windowStageSchema], default: [] },

    /**
     * Every prior cycle's dates.
     *
     * This is what lets the app be useful between April and July, when next
     * year's window does not exist yet. "Usually opens in early August" beats
     * both a stale closed date and a blank space. See windowPredictor.js —
     * predictions are computed from this at read time and never written back.
     */
    history: {
      type: [
        {
          academicYear: { type: String, trim: true },
          opensAt: Date,
          closesAt: Date,
          _id: false,
        },
      ],
      default: [],
    },

    lastAnnouncementUrl: { type: String, trim: true },
  },
  { _id: false }
);

const scholarshipSchema = new mongoose.Schema(
  {
    academic: {
      levels: { type: [String], enum: EDUCATION_LEVELS, default: [] },
      streams: { type: [String], default: [] },
      minPercentage: { type: Number, default: null },
      minCgpa: { type: Number, default: null },
      institutionTypes: { type: [String], default: [] },
      // Some schemes require the college to be UGC/AICTE-recognised.
      recognitionRequired: { type: [String], default: [] },
      // [1, 2] = first and second year only.
      yearOfStudy: { type: [Number], default: [] },
    },

    window: { type: windowSchema, default: () => ({}) },

    /**
     * Residency is two questions, not one, and conflating them is the most
     * common way scholarship sites give wrong answers.
     *
     * A Bihar-domiciled student studying in Karnataka qualifies for Bihar's
     * scheme (domicile) and not Karnataka's — even though they live in
     * Karnataka. Some schemes test domicile, some test where the institution
     * is, and a few test both.
     */
    residency: {
      requiresDomicileIn: { type: [String], default: [] },
      requiresInstitutionIn: { type: [String], default: [] },
      // Central schemes sometimes exclude states running a parallel scheme.
      excludedStates: { type: [String], default: [] },
    },

    renewal: {
      required: { type: Boolean, default: false },
      minAttendance: { type: Number, default: null },
      minPercentageToRenew: { type: Number, default: null },
      note: { type: String, trim: true },
    },

    quota: {
      totalSlots: { type: Number, default: null },
      // Changes the urgency message materially: with a fixed number of slots,
      // "closes in 40 days" is not the real deadline.
      isFirstComeFirstServed: { type: Boolean, default: false },
    },
  },
  { _id: false, versionKey: false }
);

// Indexed for the "closing soon" query, which is the module's busiest read.
scholarshipSchema.index({ "window.stages.closesAt": 1 });
scholarshipSchema.index({ "academic.levels": 1 });

module.exports = Scheme.discriminator("scholarship", scholarshipSchema);
