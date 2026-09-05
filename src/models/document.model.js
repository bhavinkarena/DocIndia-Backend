const mongoose = require("mongoose");

/**
 * The canonical registry of real-world documents. One record per document
 * type, referenced by every rule that needs it — so "PAN card" is defined
 * exactly once and a changed source URL is a one-place edit.
 */
const documentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, trim: true },
    issuingBody: { type: String, trim: true },
    officialUrl: { type: String, trim: true },
    hasExpiry: { type: Boolean, default: false },
    typicalValidity: { type: String, trim: true },
    notes: { type: String, trim: true },

    /**
     * The details that actually get people turned away at a counter. Wasted
     * trips are the most expensive failure in this domain, so these are
     * first-class fields rather than prose buried in the description.
     */
    copiesRequired: { type: Number, default: null },
    attestation: {
      type: String,
      enum: ["none", "self-attested", "notarised", "gazetted-officer"],
      default: "none",
    },
    // e.g. "must be dated within the last 3 months"
    validityWindow: { type: String, trim: true },
    // e.g. "35x45mm, white background, matte finish"
    formatNotes: { type: String, trim: true },

    /**
     * If this document is itself obtainable through one of our services, link
     * it. That turns a flat checklist into a dependency graph: "you don't
     * have a PAN — here's how to get one first."
     */
    obtainedVia: {
      serviceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Service",
        default: null,
      },
      action: { type: String, default: null },
    },
    linkHealth: {
      lastCheckedAt: { type: Date, default: null },
      lastHttpStatus: { type: Number, default: null },
      isHealthy: { type: Boolean, default: null },
      lastError: { type: String, default: null },
    },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model("Document", documentSchema);
