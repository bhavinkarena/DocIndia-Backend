const { Router } = require("express");
const { verifyJWT } = require("../middlewares/auth.middleware");
const {
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
} = require("../middlewares/rateLimit.middleware");
const {
  register,
  login,
  refresh,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
} = require("../controllers/user.controller");

const userRoutes = Router();

/**
 * @openapi
 * /user/register:
 *   post:
 *     tags: [Auth]
 *     summary: Create an account
 *     description: >
 *       Returns an access token and sets the httpOnly refresh cookie, so a new
 *       account is signed in immediately. Rate limited to 10 per hour per IP.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, email, password]
 *             properties:
 *               firstName: { type: string, maxLength: 50, example: Asha }
 *               lastName: { type: string, maxLength: 50, example: Patel }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8, format: password }
 *     responses:
 *       201:
 *         description: Account created and signed in.
 *         headers:
 *           Set-Cookie:
 *             description: httpOnly refresh token, scoped to /user.
 *             schema: { type: string }
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Session' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       409:
 *         description: An account with this email already exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       429: { $ref: '#/components/responses/RateLimited' }
 */
userRoutes.post("/register", registerLimiter, register);

/**
 * @openapi
 * /user/login:
 *   post:
 *     tags: [Auth]
 *     summary: Sign in
 *     description: >
 *       Rate limited to 5 **failed** attempts per 15 minutes per IP —
 *       successful sign-ins do not count against the budget.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *     responses:
 *       200:
 *         description: Signed in.
 *         headers:
 *           Set-Cookie:
 *             description: httpOnly refresh token, scoped to /user.
 *             schema: { type: string }
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Session' }
 *       401:
 *         description: >
 *           Invalid email or password. Deliberately the same message for both,
 *           so the endpoint cannot be used to discover which emails exist.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: The account is disabled.
 *       429: { $ref: '#/components/responses/RateLimited' }
 */
userRoutes.post("/login", loginLimiter, login);

/**
 * @openapi
 * /user/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset link
 *     description: >
 *       Always answers 200 with the same message whether or not the address
 *       has an account — anything else would turn this into a way to test
 *       which addresses on a leaked list are users here. The emailed link
 *       carries a single-use token valid for 30 minutes.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Acknowledged — sent if the account exists.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Envelope' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       429: { $ref: '#/components/responses/RateLimited' }
 */
userRoutes.post("/forgot-password", passwordResetLimiter, forgotPassword);

/**
 * @openapi
 * /user/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Set a new password using a reset token
 *     description: >
 *       Single-use. Revokes every session for the account and deliberately
 *       issues no new one — the new password is proved once before it grants
 *       access, which is one more step for someone working from a stolen inbox.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token:
 *                 type: string
 *                 description: The 48-character token from the emailed link.
 *               password: { type: string, minLength: 8, format: password }
 *     responses:
 *       200:
 *         description: Password updated. Sign in with it.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Envelope' }
 *       400:
 *         description: >
 *           The token is invalid, already used, or expired. One message covers
 *           all three so the response cannot confirm a reset was requested.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       429: { $ref: '#/components/responses/RateLimited' }
 */
userRoutes.post("/reset-password", passwordResetLimiter, resetPassword);

/**
 * @openapi
 * /user/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Exchange the refresh cookie for a new access token
 *     description: >
 *       No Authorization header — the access token is expected to be expired by
 *       the time anything calls this. The refresh token rotates on every use:
 *       the presented one is revoked and replaced.
 *
 *
 *       Presenting an already-rotated token means two parties hold it, so every
 *       session for the account is revoked. Two exceptions keep that signal
 *       honest: a token revoked by sign-out or a password change simply fails,
 *       and one replayed within 15 seconds of its rotation is served normally
 *       (two browser tabs refreshing at once, not an attacker).
 *     security:
 *       - refreshCookie: []
 *     responses:
 *       200:
 *         description: New access token issued and the cookie rotated.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Session' }
 *       401:
 *         description: >
 *           No cookie, or it is expired, revoked or reused. The cookie is
 *           cleared, so a client holding a dead token stops retrying.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
userRoutes.post("/refresh", refresh);

/**
 * @openapi
 * /user/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Sign out this device
 *     description: >
 *       Revokes the presented refresh token and clears the cookie. Other
 *       devices keep their sessions. Always 200 — a token that is already gone
 *       satisfies the intent.
 *     security:
 *       - refreshCookie: []
 *     responses:
 *       200:
 *         description: Signed out.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Envelope' }
 */
userRoutes.post("/logout", logout);

/**
 * @openapi
 * /user/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the signed-in user's profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The profile.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/User' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   put:
 *     tags: [Auth]
 *     summary: Update name or notification preferences
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               firstName: { type: string, maxLength: 50 }
 *               lastName: { type: string, maxLength: 50 }
 *               notificationPrefs:
 *                 type: object
 *                 properties:
 *                   email:
 *                     type: boolean
 *                     description: >
 *                       Whether to be emailed when a saved checklist's
 *                       requirements change.
 *     responses:
 *       200:
 *         description: Updated profile.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/User' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
userRoutes.get("/me", verifyJWT, getProfile);
userRoutes.put("/me", verifyJWT, updateProfile);

/**
 * @openapi
 * /user/change-password:
 *   put:
 *     tags: [Auth]
 *     summary: Change your password
 *     description: >
 *       Signs out every other device and issues this one a replacement session
 *       in the same response, so the caller is not logged out of the tab they
 *       made the change in.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string, format: password }
 *               newPassword: { type: string, minLength: 8, format: password }
 *     responses:
 *       200:
 *         description: Password updated; a fresh session is returned.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/Session' }
 *       401:
 *         description: Not signed in, or the current password is wrong.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
userRoutes.put("/change-password", verifyJWT, changePassword);

module.exports = userRoutes;
