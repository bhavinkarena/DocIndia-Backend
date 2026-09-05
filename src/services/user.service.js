const User = require("../models/user.model");
const RefreshToken = require("../models/refreshToken.model");
const { serviceHandler } = require("../utils/asyncHandler");
const {
  signAccessToken,
  generateOpaqueToken,
  hashToken,
  refreshTokenExpiryDate,
} = require("../utils/jwt");
const { resetTokenMinutes } = require("../config/appConfig");
const {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require("../validations/user.validation");
const { sendWelcomeEmail, sendPasswordResetEmail } = require("./email.service");
const logger = require("../utils/logger");

/**
 * Mints an access token and a fresh refresh token row for one sign-in.
 *
 * `context` carries the request's user agent and IP. Neither drives any
 * decision — they exist so a user who is told a session was ended has
 * something recognisable to look at.
 */
const issueSession = async (user, context = {}) => {
  const refreshToken = generateOpaqueToken();

  await RefreshToken.create({
    userId: user._id,
    tokenHash: hashToken(refreshToken),
    expiresAt: refreshTokenExpiryDate(),
    userAgent: context.userAgent || null,
    ip: context.ip || null,
  });

  return {
    token: signAccessToken({ userId: user._id, role: user.role }),
    refreshToken,
  };
};

/**
 * Ends every live session for a user. Runs whenever the password changes — by
 * the owner or through a reset — because the usual reason to change a password
 * is suspecting somebody else has it, and leaving their session signed in
 * would defeat the exercise.
 */
const revokeAllSessions = (userId) =>
  RefreshToken.updateMany({ userId, revokedAt: null }, { revokedAt: new Date() });

/**
 * How long after a rotation the old token is still accepted.
 *
 * Two tabs of the same site hold the same cookie. When an access token
 * expires, both notice at once and both call /refresh — and without this, the
 * second one looks exactly like a stolen token being replayed, so the user is
 * signed out everywhere and told their session was compromised. That is a
 * false alarm on the most ordinary browsing behaviour there is.
 *
 * The cost is a narrow window in which a genuinely stolen token goes
 * undetected. Fifteen seconds is far shorter than the time an attacker needs
 * to obtain a token in the first place, and it is the difference between
 * reuse detection being a useful signal and being noise users learn to ignore.
 */
const REUSE_GRACE_MS = 15 * 1000;

exports.register = serviceHandler(async (data, context) => {
  const { error, value } = registerSchema.validate(data);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  const existing = await User.findOne({ email: value.email, isDeleted: false });
  if (existing) {
    return {
      success: false,
      statusCode: 409,
      message: "An account with this email already exists",
    };
  }

  const user = new User(value);
  await user.save();

  // Fire-and-forget: a mail failure must not fail the registration.
  sendWelcomeEmail(user).catch((err) =>
    logger.error({ err, userId: user._id }, "Welcome email failed")
  );

  const session = await issueSession(user, context);

  return {
    success: true,
    statusCode: 201,
    data: { user: user.toSafeJSON(), ...session },
  };
});

exports.login = serviceHandler(async (data, context) => {
  const { error, value } = loginSchema.validate(data);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  const user = await User.findOne({
    email: value.email,
    isDeleted: false,
  }).select("+password");

  // Same message for both branches — revealing which half was wrong tells
  // an attacker which emails have accounts.
  if (!user || !(await user.comparePassword(value.password))) {
    return { success: false, statusCode: 401, message: "Invalid email or password" };
  }

  if (!user.status) {
    return { success: false, statusCode: 403, message: "This account is disabled" };
  }

  const session = await issueSession(user, context);

  return {
    success: true,
    statusCode: 200,
    data: { user: user.toSafeJSON(), ...session },
  };
});

/**
 * Exchanges a refresh token for a new access token, and rotates the refresh
 * token itself — the presented one is revoked and replaced on every use.
 *
 * Rotation is what turns a stolen refresh token from a permanent key into a
 * race. Whoever uses it second finds it already revoked, and that is a signal
 * no non-rotating scheme can produce: a revoked token being presented means
 * two parties hold the same one. So every session for that account ends, and
 * both the thief and the real user have to sign in again. Losing a session is
 * the cheap outcome; leaving an attacker holding a valid one is not.
 */
exports.refreshSession = serviceHandler(async (rawToken, context) => {
  const expired = {
    success: false,
    statusCode: 401,
    message: "Your session has expired. Please sign in again.",
  };

  if (!rawToken) return expired;

  const stored = await RefreshToken.findOne({ tokenHash: hashToken(rawToken) });
  if (!stored) return expired;

  if (stored.revokedAt) {
    // Why a token was revoked decides what its reappearance means.
    //
    // replacedByHash is set only by rotation below. A revoked token with no
    // replacement was ended deliberately — sign-out, or a password change.
    // Seeing it again is a stale tab retrying, so it just fails. Revoking the
    // user's other devices here would mean signing out on one machine signs
    // them out everywhere the next time an old tab woke up.
    if (!stored.replacedByHash) return expired;

    // Replaced, and replaced a moment ago: a second tab racing the first.
    // Allowed through to issue its own token — see REUSE_GRACE_MS.
    const sinceRotation = Date.now() - stored.revokedAt.getTime();

    if (sinceRotation > REUSE_GRACE_MS) {
      await revokeAllSessions(stored.userId);
      logger.warn(
        { userId: stored.userId },
        "Refresh token reuse detected — all sessions revoked"
      );
      return {
        success: false,
        statusCode: 401,
        message: "This session was ended for security reasons. Please sign in again.",
      };
    }
  }

  if (stored.expiresAt <= new Date()) return expired;

  // The user is re-read on every refresh rather than trusting the role baked
  // into the old access token: a disabled account or a demoted editor must
  // lose access within one refresh cycle, not whenever their JWT expires.
  const user = await User.findOne({
    _id: stored.userId,
    isDeleted: false,
    status: true,
  });

  if (!user) {
    stored.revokedAt = new Date();
    await stored.save();
    return expired;
  }

  const nextToken = generateOpaqueToken();
  const nextHash = hashToken(nextToken);

  // Skipped on the grace path: the token is already revoked, and overwriting
  // replacedByHash would rewrite the rotation chain to point at this branch,
  // hiding the token the first tab is actually using.
  if (!stored.revokedAt) {
    stored.revokedAt = new Date();
    stored.replacedByHash = nextHash;
    await stored.save();
  }

  await RefreshToken.create({
    userId: user._id,
    tokenHash: nextHash,
    expiresAt: refreshTokenExpiryDate(),
    userAgent: context?.userAgent || null,
    ip: context?.ip || null,
  });

  return {
    success: true,
    statusCode: 200,
    data: {
      user: user.toSafeJSON(),
      token: signAccessToken({ userId: user._id, role: user.role }),
      refreshToken: nextToken,
    },
  };
});

/**
 * Signs out one device. Always reports success: the caller's intent is "end
 * this session", and a token that is already gone satisfies it. Reporting a
 * failure would only invite the client to keep a dead session on screen.
 */
exports.logout = serviceHandler(async (rawToken) => {
  if (rawToken) {
    await RefreshToken.updateOne(
      { tokenHash: hashToken(rawToken), revokedAt: null },
      { revokedAt: new Date() }
    );
  }

  return { success: true, statusCode: 200, message: "Signed out" };
});

exports.getProfile = serviceHandler(async (userId) => {
  const user = await User.findOne({ _id: userId, isDeleted: false });
  if (!user) {
    return { success: false, statusCode: 404, message: "User not found" };
  }
  return { success: true, statusCode: 200, data: user.toSafeJSON() };
});

exports.updateProfile = serviceHandler(async (userId, data) => {
  const { error, value } = updateProfileSchema.validate(data);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  const user = await User.findOneAndUpdate(
    { _id: userId, isDeleted: false },
    value,
    { new: true }
  );

  if (!user) {
    return { success: false, statusCode: 404, message: "User not found" };
  }

  return { success: true, statusCode: 200, data: user.toSafeJSON() };
});

exports.changePassword = serviceHandler(async (userId, data, context) => {
  const { error, value } = changePasswordSchema.validate(data);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  const user = await User.findOne({ _id: userId, isDeleted: false }).select(
    "+password"
  );
  if (!user) {
    return { success: false, statusCode: 404, message: "User not found" };
  }

  if (!(await user.comparePassword(value.currentPassword))) {
    return { success: false, statusCode: 401, message: "Current password is incorrect" };
  }

  user.password = value.newPassword;
  await user.save();

  // Every device is signed out, then this one is handed a new session — so the
  // change takes effect everywhere without logging the user out of the tab
  // they made it in.
  await revokeAllSessions(user._id);
  const session = await issueSession(user, context);

  return {
    success: true,
    statusCode: 200,
    message: "Password updated. Other devices have been signed out.",
    data: session,
  };
});

/**
 * Starts a reset. Answers identically whether or not the address has an
 * account — anything else turns this endpoint into a way to test which
 * addresses on a leaked list are DocuIndia users.
 */
exports.forgotPassword = serviceHandler(async (data) => {
  const { error, value } = forgotPasswordSchema.validate(data);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  const acknowledgement = {
    success: true,
    statusCode: 200,
    message: "If an account exists for that address, a reset link is on its way.",
  };

  const user = await User.findOne({ email: value.email, isDeleted: false });
  if (!user || !user.status) return acknowledgement;

  const token = generateOpaqueToken();

  // Only the hash is stored. The raw token leaves in the email and never comes
  // to rest anywhere on our side.
  user.resetTokenHash = hashToken(token);
  user.resetTokenExpiry = new Date(Date.now() + resetTokenMinutes * 60 * 1000);
  await user.save();

  // Fire-and-forget, matching sendWelcomeEmail: a mail outage must not become
  // a 500 that tells the caller this address exists after all.
  sendPasswordResetEmail(user, token, resetTokenMinutes).catch((err) =>
    logger.error({ err, userId: user._id }, "Password reset email failed")
  );

  return acknowledgement;
});

exports.resetPassword = serviceHandler(async (data) => {
  const { error, value } = resetPasswordSchema.validate(data);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  // Expiry is part of the query rather than a check afterwards, so an expired
  // token is indistinguishable from a wrong one — neither response confirms
  // that a reset was ever requested for some address.
  const user = await User.findOne({
    resetTokenHash: hashToken(value.token),
    resetTokenExpiry: { $gt: new Date() },
    isDeleted: false,
  }).select("+password +resetTokenHash +resetTokenExpiry");

  if (!user) {
    return {
      success: false,
      statusCode: 400,
      message: "That reset link is invalid or has expired. Request a new one.",
    };
  }

  user.password = value.password;
  // Cleared in the same save as the new password, which is what makes the link
  // single-use. Leaving it live would let anyone who later saw the email — or
  // a proxy that logged the URL — reset the account again.
  user.resetTokenHash = null;
  user.resetTokenExpiry = null;
  await user.save();

  // Deliberately no new session. Whoever completed this reset may or may not
  // be the account owner, so they are made to sign in with the new password —
  // one more step for an attacker working from a stolen inbox.
  await revokeAllSessions(user._id);

  return {
    success: true,
    statusCode: 200,
    message: "Password updated. You can sign in now.",
  };
});
