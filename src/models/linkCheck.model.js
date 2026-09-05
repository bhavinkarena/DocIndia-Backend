const mongoose = require("mongoose");

/**
 * History of source-link health probes. Government URLs move often, and a
 * single failed check is not proof of rot — the history is what tells you
 * whether a link is genuinely dead or the site was just briefly down.
 */
const linkCheckSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    url: { type: String, required: true },
    httpStatus: { type: Number, default: null },
    ok: { type: Boolean, default: false },
    error: { type: String, default: null },
    checkedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, versionKey: false }
);

linkCheckSchema.index({ documentId: 1, checkedAt: -1 });

module.exports = mongoose.model("LinkCheck", linkCheckSchema);
