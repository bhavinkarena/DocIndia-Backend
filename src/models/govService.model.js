const mongoose = require("mongoose");
const {
  QUESTION_TYPES,
  ACTION_KEYS,
  SERVICE_SCOPES,
} = require("../utils/constants");

const optionSchema = new mongoose.Schema(
  {
    value: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
  },
  { _id: false }
);

/**
 * Questions hang off the *action*, not the service: renewing a passport asks
 * about your existing booklet, applying for a first one asks about your age
 * and category. Sharing one question set across both would force every
 * question to be conditional.
 *
 * Note there is no state question here any more — state is chosen once,
 * up front, and injected into the answers by the rules engine.
 */
const questionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    type: { type: String, enum: QUESTION_TYPES, default: "single-select" },
    helpText: { type: String, trim: true },
    options: { type: [optionSchema], default: [] },
    required: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const actionSchema = new mongoose.Schema(
  {
    key: { type: String, enum: ACTION_KEYS, required: true },
    label: { type: String, trim: true },
    description: { type: String, trim: true },
    questions: { type: [questionSchema], default: [] },
    // Published per action: "new passport" can be ready while "renew" is not.
    isPublished: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const govServiceSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, trim: true },
    // Short line shown on the service card, e.g. "Issued by UIDAI".
    authority: { type: String, trim: true },
    keywords: { type: [String], default: [] },
    icon: { type: String, trim: true },

    scope: { type: String, enum: SERVICE_SCOPES, default: "national" },
    // Only consulted when scope is "state". Empty means "not yet available
    // anywhere", which keeps a half-built state service out of the listing.
    availableStates: { type: [String], default: [] },

    actions: { type: [actionSchema], default: [] },

    isPublished: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false }
);

govServiceSchema.index({ keywords: 1 });
govServiceSchema.index({ scope: 1, availableStates: 1 });

module.exports = mongoose.model("Service", govServiceSchema);
