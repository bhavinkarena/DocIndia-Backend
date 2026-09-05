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
