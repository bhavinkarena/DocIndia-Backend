const mongoose = require("mongoose");
const { CHECKLIST_STATUS } = require("../utils/constants");

/**
 * A frozen copy of what the engine produced at generation time — deliberately
 * denormalised. Re-running the rules on every read would silently rewrite
 * history, and the whole trust story depends on being able to show exactly
 * what the tool said on the day the user acted on it.
 */
const generatedItemSchema = new mongoose.Schema(
  {
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: "Document" },
    name: { type: String, required: true },
    description: { type: String },
    issuingBody: { type: String },
    officialUrl: { type: String },
    mandatory: { type: Boolean, default: true },
    note: { type: String },
    sourceBlock: { type: String },
  },
  { _id: false }
);

const progressSchema = new mongoose.Schema(
  {
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: "Document" },
    checked: { type: Boolean, default: false },
    checkedAt: { type: Date, default: null },
  },
  { _id: false }
);

const checklistSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    categorySlug: { type: String, trim: true },
    categoryLabel: { type: String, trim: true },
    title: { type: String, trim: true },
    answers: { type: mongoose.Schema.Types.Mixed, default: {} },
    generatedItems: { type: [generatedItemSchema], default: [] },
    progress: { type: [progressSchema], default: [] },
    ruleVersion: { type: Number, default: 1 },
    generatedAt: { type: Date, default: Date.now },
    // Set when the underlying rule moves past ruleVersion.
    hasRuleUpdate: { type: Boolean, default: false },
    shareToken: { type: String, unique: true, sparse: true },
    status: { type: String, enum: CHECKLIST_STATUS, default: "active" },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

checklistSchema.index({ userId: 1, isDeleted: 1 });

module.exports = mongoose.model("Checklist", checklistSchema);
