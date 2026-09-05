const mongoose = require("mongoose");
const {
  CONDITION_OPERATORS,
  MATCH_TYPES,
  VERIFICATION_STATUS,
} = require("../utils/constants");

/**
 * Document entries store a reference, never a copy. Resolving happens at read
 * time in the rules engine so a document edit propagates everywhere at once.
 */
const ruleDocumentSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    mandatory: { type: Boolean, default: true },
    // Category-specific nuance ("self-attested copy required") that does not
    // belong on the shared document record.
    note: { type: String, trim: true },
  },
  { _id: false }
);

const conditionSchema = new mongoose.Schema(
  {
    questionKey: { type: String, required: true, trim: true },
    operator: { type: String, enum: CONDITION_OPERATORS, default: "eq" },
    value: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const conditionalBlockSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true },
    matchType: { type: String, enum: MATCH_TYPES, default: "all" },
    conditions: { type: [conditionSchema], default: [] },
    documents: { type: [ruleDocumentSchema], default: [] },
  },
  { _id: false }
);

const ruleSchema = new mongoose.Schema(
  {
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    baseDocuments: { type: [ruleDocumentSchema], default: [] },
    conditionalBlocks: { type: [conditionalBlockSchema], default: [] },
    // Bumped on every published edit; stamped onto saved checklists so we can
    // tell a user their snapshot is behind the current rule.
    version: { type: Number, default: 1 },
    verificationStatus: {
      type: String,
      enum: VERIFICATION_STATUS,
      default: "unverified",
    },
    lastVerifiedAt: { type: Date, default: null },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    nextReviewAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

ruleSchema.index({ categoryId: 1, isDeleted: 1 });

module.exports = mongoose.model("Rule", ruleSchema);
