const mongoose = require("mongoose");
const { CHECKLIST_STATUS, ACTION_KEYS } = require("../utils/constants");

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
    belongsTo: { type: String, default: "self" },
    note: { type: String },
    sourceBlock: { type: String },
    // Frozen prep details — copies, attestation, validity window.
    copiesRequired: { type: Number },
    attestation: { type: String },
    validityWindow: { type: String },
    formatNotes: { type: String },
  },
  { _id: false }
);

/**
 * Fee lines are frozen already resolved — only the ones that applied to this
 * applicant's answers are here, with their conditions dropped. The conditions
 * were the mechanism for deciding what this person pays; once decided, keeping
 * them would invite a later read to re-evaluate against answers that have
 * since been edited, which is exactly the silent rewriting of history the
 * frozen snapshot exists to prevent.
 */
const frozenFeeSchema = new mongoose.Schema(
  {
    label: { type: String },
    amount: { type: Number },
    maxAmount: { type: Number, default: null },
    currency: { type: String },
    isEstimate: { type: Boolean, default: false },
    order: { type: Number },
  },
  { _id: false }
);

const frozenStepSchema = new mongoose.Schema(
  {
    title: { type: String },
    detail: { type: String },
    mode: { type: String },
    url: { type: String },
    fees: { type: [frozenFeeSchema], default: [] },
    fee: { type: String },
    minDays: { type: Number, default: null },
    maxDays: { type: Number, default: null },
    timeline: { type: String },
    order: { type: Number },
  },
  { _id: false }
);

/**
 * The totals as they stood on the day. Recomputing them on read would drift
 * away from the frozen steps the moment a fee changed, and a printed checklist
 * whose line items no longer add up to its own total is worse than one with no
 * total at all.
 */
const frozenCostSchema = new mongoose.Schema(
  {
    min: { type: Number, default: null },
    max: { type: Number, default: null },
    currency: { type: String, default: null },
    mixedCurrency: { type: Boolean, default: false },
    isEstimate: { type: Boolean, default: false },
    hasUnquoted: { type: Boolean, default: false },
    lineCount: { type: Number },
  },
  { _id: false }
);

const frozenTimelineSchema = new mongoose.Schema(
  {
    minDays: { type: Number },
    maxDays: { type: Number },
    hasUnquoted: { type: Boolean, default: false },
    stepsQuoted: { type: Number },
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
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },
    serviceSlug: { type: String, trim: true },
    serviceLabel: { type: String, trim: true },
    action: { type: String, enum: ACTION_KEYS, required: true },
    actionLabel: { type: String, trim: true },
    state: { type: String, trim: true },
    stateLabel: { type: String, trim: true },

    title: { type: String, trim: true },
    answers: { type: mongoose.Schema.Types.Mixed, default: {} },
    generatedItems: { type: [generatedItemSchema], default: [] },
    processSteps: { type: [frozenStepSchema], default: [] },
    // null where the rule quoted nothing computable — distinct from zero.
    cost: { type: frozenCostSchema, default: null },
    timeline: { type: frozenTimelineSchema, default: null },

    /**
     * The prerequisite chain as it stood, frozen with everything else.
     *
     * `Mixed` because the shape is genuinely recursive and Mongoose cannot
     * express a self-referencing sub-schema without a hack that buys nothing
     * here: this is written once and read back whole, never queried into. It
     * is a snapshot, not an index.
     */
    prerequisites: { type: mongoose.Schema.Types.Mixed, default: [] },
    journey: { type: mongoose.Schema.Types.Mixed, default: null },
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
