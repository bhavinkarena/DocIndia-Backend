const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { ROLE_VALUES } = require("../utils/constants");

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ROLE_VALUES,
      default: "user",
    },
    notificationPrefs: {
      email: { type: Boolean, default: true },
    },
    /**
     * Only the SHA-256 hash of the reset token is kept, never the token
     * itself. The raw token exists in exactly two places — the email we send
     * and the user's browser — so a leaked database dump cannot be used to
     * take over accounts, which is the whole point of a reset flow.
     *
     * `select: false` keeps both fields out of every ordinary query, so they
     * can never leak through toSafeJSON() or a populate().
     */
    resetTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    resetTokenExpiry: {
      type: Date,
      default: null,
      select: false,
    },
    status: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true, versionKey: false }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

/**
 * The secret fields are `select: false`, so normally they are not even loaded.
 * They are stripped here as well because the reset flow has to load them
 * explicitly with `.select("+resetTokenHash")`, and that same document is what
 * gets serialised back to the caller.
 */
userSchema.methods.toSafeJSON = function () {
  const { password, resetTokenHash, resetTokenExpiry, ...rest } = this.toObject();
  return rest;
};

module.exports = mongoose.model("User", userSchema);
