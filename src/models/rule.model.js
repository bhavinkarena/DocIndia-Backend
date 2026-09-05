const mongoose = require("mongoose");
const {
  CONDITION_OPERATORS,
  MATCH_TYPES,
  VERIFICATION_STATUS,
  ACTION_KEYS,
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
    // Service-specific nuance ("self-attested copy required") that does not
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

/**
 * One ordered step in the actual errand — where to go, what it costs, how
 * long it takes. A document list answers "what do I bring"; this answers
 * "what do I do".
 */
const processStepSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    detail: { type: String, trim: true },
    mode: {
      type: String,
      enum: ["online", "in-person", "either"],
      default: "either",
    },
    url: { type: String, trim: true },
    // Free text rather than a number: fees are often tiered or conditional,
    // and inventing a single figure would be worse than quoting the range.
    fee: { type: String, trim: true },
    timeline: { type: String, trim: true },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const ruleSchema = new mongoose.Schema(
  {
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },
    action: { type: String, enum: ACTION_KEYS, required: true },
    /**
     * null means "the national default for this service + action".
     * A rule with a state set overrides the default for that state only, so
     * PAN does not need 36 near-identical copies of the same requirements.
     */
    state: { type: String, default: null },

    baseDocuments: { type: [ruleDocumentSchema], default: [] },
    conditionalBlocks: { type: [conditionalBlockSchema], default: [] },
    processSteps: { type: [processStepSchema], default: [] },

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

// The lookup the engine performs on every generate.
ruleSchema.index({ serviceId: 1, action: 1, state: 1, isDeleted: 1 });

module.exports = mongoose.model("Rule", ruleSchema);
