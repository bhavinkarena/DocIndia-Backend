const mongoose = require("mongoose");

/**
 * A user watching a scholarship, so we can warn them before it closes.
 *
 * Separate from the saved-checklist model because the two answer different
 * questions: a checklist is "what I need to gather", a watch is "tell me
 * before this shuts". Someone watches five scholarships and saves a checklist
 * for the one they actually pursue.
 */
const schemeWatchSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    schemeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Scheme",
      required: true,
    },
    // Profile scoping, for when family profiles land — a parent watching one
    // scholarship for each of two children needs two watches, not one.
    profileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Profile",
      default: null,
    },

    /**
     * Which reminder tiers have already gone out.
     *
     * The reminder cron re-runs after a crash, and a redeploy mid-sweep is
     * ordinary. Without this, a restart at the wrong moment mails everybody
     * twice — which reads as a malfunction and trains people to ignore the
     * one message that actually mattered.
     */
    remindersSent: {
      type: [
        {
          tier: { type: Number, required: true }, // days before close
          sentAt: { type: Date, default: Date.now },
          _id: false,
        },
      ],
      default: [],
    },

    // Answers that produced the match, so a reminder can say "you qualify"
    // rather than "you were looking at this". Never includes raw income.
    matchedAt: { type: Date, default: null },

    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

// One watch per user per scheme. A partial index rather than a plain unique
// one, so a soft-deleted watch does not block re-watching later.
schemeWatchSchema.index(
  { userId: 1, schemeId: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);
schemeWatchSchema.index({ schemeId: 1, isDeleted: 1 });

module.exports = mongoose.model("SchemeWatch", schemeWatchSchema);
