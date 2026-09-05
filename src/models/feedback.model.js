const mongoose = require("mongoose");
const { FEEDBACK_STATUS } = require("../utils/constants");

/**
 * The early-warning system for stale content. Anonymous by default — asking
 * for contact details before someone will tell you a page is wrong is a good
 * way to never hear that a page is wrong.
 */
const feedbackSchema = new mongoose.Schema(
  {
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    checklistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Checklist",
      default: null,
    },
    wasAccurate: { type: Boolean, default: null },
    comment: { type: String, trim: true, maxlength: 2000 },
    contactEmail: { type: String, trim: true, lowercase: true },
    status: { type: String, enum: FEEDBACK_STATUS, default: "new" },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("Feedback", feedbackSchema);
