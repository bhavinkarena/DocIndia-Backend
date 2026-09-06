const mongoose = require("mongoose");
const {
  SCHEME_TYPES,
  PROVIDER_TYPES,
  SERVICE_SCOPES,
  CONDITION_OPERATORS,
  MATCH_TYPES,
  VERIFICATION_STATUS,
  BENEFIT_FREQUENCIES,
  SOURCE_KINDS,
} = require("../utils/constants");

/**
 * The base for every government scheme: scholarships, welfare schemes,
 * pensions, subsidies.
 *
 * One collection with a discriminator rather than a model per type. The
 * eligibility matcher, the Document registry link, the admin editor, CSV
 * import, the verification queue and the link-health cron are all shared —
 * a second model would duplicate six pieces of working infrastructure and
 * guarantee they drift apart. Type-specific fields live on the discriminator,
 * so a pension is never validated against a scholarship's academic rules.
 */

/** Mirrors rule.model.js exactly — the same operators, the same engine. */
const conditionSchema = new mongoose.Schema(
  {
    questionKey: { type: String, required: true, trim: true },
    operator: { type: String, enum: CONDITION_OPERATORS, default: "eq" },
    value: { type: mongoose.Schema.Types.Mixed },
    // Shown when this is the criterion someone narrowly failed, e.g.
    // "family income under ₹2.5 lakh". Without it a near-miss can only say
    // "familyIncome", which helps nobody.
    label: { type: String, trim: true },
  },
  { _id: false }
);

/**
 * Benefits are itemised rather than stored as one number, because a
 * scholarship is usually "full tuition **plus** ₹1,200 a month" and a student
 * comparing two offers needs to see both halves.
 */
const benefitComponentSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    amountMin: { type: Number, default: null },
    amountMax: { type: Number, default: null },
    frequency: { type: String, enum: BENEFIT_FREQUENCIES, default: "annual" },
    // A component that only applies to some applicants — hostellers get a
    // maintenance allowance day scholars don't.
    condition: { type: [conditionSchema], default: [] },
    note: { type: String, trim: true },
  },
  { _id: false }
);

const requiredDocumentSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    mandatory: { type: Boolean, default: true },
    note: { type: String, trim: true },
    // Only required when this matches — a disability certificate is needed
    // only by applicants claiming that category.
    condition: { type: [conditionSchema], default: [] },
  },
  { _id: false }
);

/**
 * Where a record came from, and whether it has changed since we looked.
 *
 * contentHash is what makes daily re-fetching cheap: an unchanged hash means
 * no review task and no editor time spent. It also distinguishes "unchanged"
 * from "unchecked", which a lastFetchedAt alone cannot.
 */
const sourceSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: SOURCE_KINDS, default: "manual" },
    adapterKey: { type: String, trim: true },
    sourceUrl: { type: String, trim: true },
    contentHash: { type: String, default: null },
    lastFetchedAt: { type: Date, default: null },
    lastChangedAt: { type: Date, default: null },
  },
  { _id: false }
);

const schemeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    // "Post-Matric SC" — the full name is too long for a card or a chip.
    shortName: { type: String, trim: true, maxlength: 80 },
    description: { type: String, trim: true },
    keywords: { type: [String], default: [] },

    provider: {
      name: { type: String, trim: true },
      type: { type: String, enum: PROVIDER_TYPES, default: "central" },
      ministry: { type: String, trim: true },
      // Which portal to apply on. Central schemes nearly all funnel through
      // NSP; every state runs its own, and a student who lands on the wrong
      // one loses a day.
      portalName: { type: String, trim: true },
    },

    // Mirrors govService.model.js so state scoping behaves identically
    // everywhere in the product.
    scope: { type: String, enum: SERVICE_SCOPES, default: "national" },
    availableStates: { type: [String], default: [] },

    benefit: {
      // Always shown. Free text, because "full tuition" is not a number and
      // inventing one would be worse than quoting the phrase.
      summary: { type: String, trim: true },
      components: { type: [benefitComponentSchema], default: [] },
      // Derived on save from the components, for ranking matches by value.
      // Null when genuinely unquantifiable rather than 0 — a fee waiver worth
      // ₹80,000 must not sort below a ₹500 stipend.
      annualValueMin: { type: Number, default: null },
      annualValueMax: { type: Number, default: null },
    },

    eligibility: {
      matchType: { type: String, enum: MATCH_TYPES, default: "all" },
      criteria: { type: [conditionSchema], default: [] },
      // Anything the operators cannot express. Shown verbatim, never
      // evaluated — honesty beats a confident false negative.
      notes: { type: String, trim: true },
    },

    requiredDocuments: { type: [requiredDocumentSchema], default: [] },

    applyUrl: { type: String, trim: true },
    officialUrl: { type: String, trim: true },
    guidelinesUrl: { type: String, trim: true },
    helplinePhone: { type: String, trim: true },
    helplineEmail: { type: String, trim: true },

    // Same posture as rule.model.js: content is only as good as its last check,
    // and the public page says when that was.
    verificationStatus: {
      type: String,
      enum: VERIFICATION_STATUS,
      default: "unverified",
    },
    lastVerifiedAt: { type: Date, default: null },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    nextReviewAt: { type: Date, default: null },
    version: { type: Number, default: 1 },

    source: { type: sourceSchema, default: () => ({}) },

    // Mirrors document.model.js. A dead apply link on an open scholarship is
    // the highest-severity content failure this module has.
    linkHealth: {
      lastCheckedAt: { type: Date, default: null },
      lastHttpStatus: { type: Number, default: null },
      isHealthy: { type: Boolean, default: null },
      lastError: { type: String, default: null },
    },

    isPublished: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
    discriminatorKey: "type",
    // Mongoose adds the discriminator key automatically, but naming the
    // allowed values here means a bad `type` is rejected at validation
    // rather than silently creating an unqueryable record.
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

schemeSchema.path("type", {
  type: String,
  enum: SCHEME_TYPES,
  required: true,
});

/**
 * Roll the benefit components up to an annual range.
 *
 * Done on save rather than at read time because it is the sort key for every
 * match result, and sorting in JS across the whole catalogue would undo the
 * point of having an index.
 */
const toAnnual = (amount, frequency) => {
  if (amount === null || amount === undefined) return null;
  switch (frequency) {
    case "monthly":
      return amount * 12;
    case "per-semester":
      return amount * 2;
    // A one-time grant is compared against a year of benefit as-is; annualising
    // it over an unknown course length would invent precision.
    default:
      return amount;
  }
};

schemeSchema.pre("save", function (next) {
  const components = this.benefit?.components || [];
  if (!components.length) return next();

  let min = 0;
  let max = 0;
  let sawAny = false;

  components.forEach((c) => {
    const cMin = toAnnual(c.amountMin, c.frequency);
    const cMax = toAnnual(c.amountMax ?? c.amountMin, c.frequency);
    if (cMin === null && cMax === null) return;
    sawAny = true;
    min += cMin ?? cMax ?? 0;
    max += cMax ?? cMin ?? 0;
  });

  this.benefit.annualValueMin = sawAny ? min : null;
  this.benefit.annualValueMax = sawAny ? max : null;
  next();
});

schemeSchema.index({ type: 1, isPublished: 1, isDeleted: 1 });
schemeSchema.index({ scope: 1, availableStates: 1 });
schemeSchema.index({ "provider.type": 1 });
schemeSchema.index({ keywords: 1 });
schemeSchema.index({ nextReviewAt: 1 });

module.exports = mongoose.model("Scheme", schemeSchema);
module.exports.conditionSchema = conditionSchema;
module.exports.requiredDocumentSchema = requiredDocumentSchema;
