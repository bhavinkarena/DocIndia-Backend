const mongoose = require("mongoose");

/**
 * One row per issued refresh token, rather than a field on the user.
 *
 * A single field would mean one session per account — signing in on a phone
 * would silently sign you out on a laptop. A collection lets each device hold
 * its own token, lets a single device be revoked without touching the others,
 * and gives us somewhere to record what replaced what, which is what makes
 * reuse detection possible (see user.service.refreshSession).
 *
 * Only the hash is stored, for the same reason as the password reset token:
 * a database dump must not be a set of working sessions.
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    /**
     * Set the moment the token is used or explicitly signed out. A revoked row
     * is deliberately kept until it expires rather than deleted — presenting
     * one is the signal that a token was stolen, and a deleted row is
     * indistinguishable from a token that never existed.
     */
    revokedAt: {
      type: Date,
      default: null,
    },
    /** Hash of the token issued in its place, for tracing a rotation chain. */
    replacedByHash: {
      type: String,
      default: null,
    },
    // Not used for any decision — purely so a user can be told "a session from
    // this browser was signed out" when reuse is detected.
    userAgent: { type: String, default: null },
    ip: { type: String, default: null },
  },
  { timestamps: true, versionKey: false }
);

/**
 * Mongo drops rows once expiresAt passes, so expired sessions clean themselves
 * up. Reuse detection only needs the window in which a stolen token is still
 * usable, and past that point the row can no longer prove anything.
 */
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
