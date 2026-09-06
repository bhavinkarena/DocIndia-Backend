const mongoose = require("mongoose");
const {
  CONDITION_OPERATORS,
  MATCH_TYPES,
  VERIFICATION_STATUS,
  ACTION_KEYS,
  DOCUMENT_OWNERS,
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
    /**
     * Whose copy. Defaults to the applicant's own, which is almost always the
     * case — but when it isn't, this is the difference between a checklist
     * that makes sense and one that appears to demand the thing you came to
     * get. Rendered next to the name, not buried in the note.
     */
    belongsTo: { type: String, enum: DOCUMENT_OWNERS, default: "self" },
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
 * One line of what this step costs.
 *
 * Fees are tiered far more often than they are flat — Tatkal costs more, a
 * minor costs less, a state's service centre adds its own charge on top. So a
 * line carries the same conditions a document block does and is dropped when
 * they don't match, which means the total is computed for *this* applicant
 * rather than quoted as a range covering everybody.
 *
 * `maxAmount` covers the genuinely unresolvable case: a fee that is a band
 * even once every condition is known. Leaving it null means the amount is
 * exact.
 */
const feeLineSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    maxAmount: { type: Number, default: null, min: 0 },
    currency: { type: String, default: "INR", trim: true },
    /**
     * Flags a figure we could not source exactly — an agent's charge, a
     * photocopy shop's rate. Rendered differently, because a wrong number
     * quoted confidently is worse than an honest approximation.
     */
    isEstimate: { type: Boolean, default: false },

    // Empty conditions means the line always applies.
    matchType: { type: String, enum: MATCH_TYPES, default: "all" },
    conditions: { type: [conditionSchema], default: [] },
    order: { type: Number, default: 0 },
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

    /**
     * A step that only exists on some routes.
     *
     * Tatkal replaces weeks of police verification with days of it; a minor's
     * application adds a parental consent step nobody else performs. Those are
     * different steps with different durations, not one step with a caveat in
     * its prose — and expressing them as one is what makes a timeline
     * uncomputable. Empty conditions means the step always applies.
     */
    matchType: { type: String, enum: MATCH_TYPES, default: "all" },
    conditions: { type: [conditionSchema], default: [] },

    /**
     * `fees` is the computable form; `fee` is the free-text fallback kept for
     * the cases that genuinely resist a number ("varies by municipality").
     * When both exist the structured lines win and the string is ignored, so
     * a half-migrated step never double-counts.
     */
    fees: { type: [feeLineSchema], default: [] },
    fee: { type: String, trim: true },

    /**
     * Same arrangement for time. Days rather than a string, so a deadline can
     * actually be planned backwards from. Both null means "we don't know",
     * which is a different statement from zero and has to survive as one.
     */
    minDays: { type: Number, default: null, min: 0 },
    maxDays: { type: Number, default: null, min: 0 },
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
