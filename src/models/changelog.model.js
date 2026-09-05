const mongoose = require("mongoose");

/**
 * Written every time a rule is published. Two jobs: show users what changed
 * on a checklist they saved, and keep an audit trail of who changed what.
 */
const changelogSchema = new mongoose.Schema(
  {
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    ruleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rule",
      required: true,
    },
    version: { type: Number, required: true },
    summary: { type: String, trim: true },
    changes: {
      added: { type: [String], default: [] },
      removed: { type: [String], default: [] },
      modified: { type: [String], default: [] },
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    publishedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, versionKey: false }
);

changelogSchema.index({ categoryId: 1, version: -1 });

module.exports = mongoose.model("Changelog", changelogSchema);
