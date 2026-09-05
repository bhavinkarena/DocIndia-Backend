const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const {
  jwtSecret,
  accessTokenExpire,
  refreshTokenDays,
  isProduction,
} = require("../config/appConfig");

/**
 * Access tokens are JWTs: self-contained, so verifying one costs no database
 * round trip, and short-lived because nothing can revoke them.
 *
 * Refresh tokens are NOT JWTs. They are opaque random strings checked against
 * a stored hash, which is what makes them revocable — a signed-out or stolen
 * refresh token stops working the moment its row is marked revoked. Making
 * them a different shape also means one can never be mistaken for the other.
 */
exports.signAccessToken = (payload) =>
  jwt.sign({ ...payload, type: "access" }, jwtSecret, {
    expiresIn: accessTokenExpire,
  });

exports.verifyToken = (token) => jwt.verify(token, jwtSecret);

/** 48 hex characters of CSPRNG output — not guessable, and URL-safe as-is. */
exports.generateOpaqueToken = () => crypto.randomBytes(24).toString("hex");

/**
 * Plain SHA-256, deliberately, where passwords use bcrypt.
 *
 * bcrypt is slow on purpose to defend a low-entropy secret a human chose.
 * These tokens carry 192 bits of randomness, so there is nothing to brute
 * force and the slowness would only be paid on every token refresh. What we
 * need here is a one-way function, and SHA-256 is that.
 */
exports.hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

exports.refreshTokenExpiryDate = () =>
  new Date(Date.now() + refreshTokenDays * 24 * 60 * 60 * 1000);

const REFRESH_COOKIE = "docuindia_refresh";

/**
 * The cookie is scoped to /user because that is where every endpoint that
 * reads it lives. A checklist or admin request has no use for the refresh
 * token, and a cookie that is never sent is a cookie that cannot leak through
 * a logging proxy or an unrelated handler.
 *
 * SameSite in production is "none" because the deployed frontend and API are
 * on different hosts, which makes every API call cross-site; "none" then
 * requires Secure, which is correct there anyway. In development both run on
 * localhost — same site — so "lax" works and does not demand HTTPS.
 */
const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  path: "/user",
  maxAge: refreshTokenDays * 24 * 60 * 60 * 1000,
});

exports.REFRESH_COOKIE = REFRESH_COOKIE;

exports.setRefreshCookie = (res, token) =>
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions());

/**
 * clearCookie only matches a cookie whose path, sameSite and secure flags are
 * identical to the ones it was set with. Reusing the same builder is what
 * keeps sign-out from silently leaving the cookie in place.
 */
exports.clearRefreshCookie = (res) => {
  const { maxAge, ...options } = refreshCookieOptions();
  return res.clearCookie(REFRESH_COOKIE, options);
};
