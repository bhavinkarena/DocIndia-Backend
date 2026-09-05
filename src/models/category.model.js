const mongoose = require("mongoose");
const { QUESTION_TYPES } = require("../utils/constants");

const optionSchema = new mongoose.Schema(
  {
    value: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
  },
  { _id: false }
);

/**
 * Questions are embedded rather than referenced: they are small, they are
 * always read together with their category, and they are never shared between
 * categories. This is the one place embedding is clearly correct.
 */
const questionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    type: { type: String, enum: QUESTION_TYPES, default: "single-select" },
    helpText: { type: String, trim: true },
    // Ignored for state-select, which is fed from the shared states list.
    options: { type: [optionSchema], default: [] },
    required: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const categorySchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, trim: true },
    examplePrompt: { type: String, trim: true },
    // Drives the rule-based intake classifier on the home page.
    keywords: { type: [String], default: [] },
    icon: { type: String, trim: true },
    questions: { type: [questionSchema], default: [] },
    isPublished: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

categorySchema.index({ keywords: 1 });

module.exports = mongoose.model("Category", categorySchema);
