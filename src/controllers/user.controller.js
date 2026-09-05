const {
  register,
  login,
  refreshSession,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
} = require("../services/user.service");
const { asyncHandler } = require("../utils/asyncHandler");
const {
  REFRESH_COOKIE,
  setRefreshCookie,
  clearRefreshCookie,
} = require("../utils/jwt");

/** What the service records alongside a session — see issueSession. */
const requestContext = (req) => ({
  userAgent: req.headers["user-agent"] || null,
  ip: req.ip || null,
});

/**
 * Moves the refresh token out of the JSON body and into an httpOnly cookie.
 *
 * This is the whole reason the refresh token is worth having. An access token
 * lives in localStorage where any injected script can read it, but it expires
 * in fifteen minutes. The refresh token is the long-lived credential, so it
 * goes somewhere JavaScript cannot reach it at all — which also means the
 * client never has to store, send or think about it.
 */
const attachSession = (res, data) => {
  const { refreshToken, ...body } = data;
  if (refreshToken) setRefreshCookie(res, refreshToken);
  return body;
};

exports.register = asyncHandler(async (req, res) => {
  const response = await register(req.body, requestContext(req));
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(
    201,
    attachSession(res, response.data),
    "Account created successfully"
  );
});

exports.login = asyncHandler(async (req, res) => {
  const response = await login(req.body, requestContext(req));
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(
    200,
    attachSession(res, response.data),
    "Logged in successfully"
  );
});

/**
 * Called by the frontend interceptor when an access token has expired, so it
 * runs on an unauthenticated request by definition — the credential is the
 * cookie, not the Authorization header.
 *
 * The cookie is cleared on every failure. Without that, a browser holding a
 * revoked token retries this endpoint on each 401 forever and never reaches
 * the sign-in screen.
 */
exports.refresh = asyncHandler(async (req, res) => {
  const response = await refreshSession(
    req.cookies?.[REFRESH_COOKIE],
    requestContext(req)
  );

  if (!response.success) {
    clearRefreshCookie(res);
    return res.error(response.statusCode, response.message);
  }

  return res.success(200, attachSession(res, response.data), "Session refreshed");
});

exports.logout = asyncHandler(async (req, res) => {
  const response = await logout(req.cookies?.[REFRESH_COOKIE]);
  clearRefreshCookie(res);
  return res.success(200, {}, response.message);
});

exports.getProfile = asyncHandler(async (req, res) => {
  const response = await getProfile(req.user._id);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Profile fetched successfully");
});

exports.updateProfile = asyncHandler(async (req, res) => {
  const response = await updateProfile(req.user._id, req.body);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Profile updated successfully");
});

exports.changePassword = asyncHandler(async (req, res) => {
  const response = await changePassword(
    req.user._id,
    req.body,
    requestContext(req)
  );
  if (!response.success) return res.error(response.statusCode, response.message);
  // Changing a password revokes every session, this one included, so the
  // caller is handed a replacement access token and cookie in the same
  // response — otherwise the next request from this tab would 401.
  return res.success(200, attachSession(res, response.data), response.message);
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  const response = await forgotPassword(req.body);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, {}, response.message);
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const response = await resetPassword(req.body);
  if (!response.success) return res.error(response.statusCode, response.message);
  // Any session this browser still held belonged to the old password.
  clearRefreshCookie(res);
  return res.success(200, {}, response.message);
});
