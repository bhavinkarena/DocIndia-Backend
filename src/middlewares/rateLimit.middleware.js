const rateLimit = require("express-rate-limit");

/**
 * Every limiter answers in the same { success, statusCode, message } envelope
 * the rest of the API uses. The default express-rate-limit handler sends a
 * bare string, which the frontend's `apiError()` helper cannot read — the user
 * would see "Something went wrong" instead of being told to wait.
 */
const buildHandler = (message) => (req, res) => res.error(429, message);

/**
 * Preflight requests carry no credentials and do nothing. Counting them means
 * a browser burns two of the user's five login attempts per real attempt.
 *
 * /health is excluded because uptime monitors poll it far more often than a
 * human browses, and a rate-limited health check reads as an outage.
 */
const skipNonRequests = (req) =>
  req.method === "OPTIONS" || req.path === "/health";

const base = {
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: skipNonRequests,
};

/**
 * Login is the brute-force target, so its budget is the tightest.
 *
 * `skipSuccessfulRequests` means only failed attempts count. Someone who signs
 * in correctly five times in an afternoon — a normal thing on a shared or
 * office machine — is never locked out, while an attacker guessing passwords
 * exhausts the budget in five tries because none of theirs succeed.
 */
const loginLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  handler: buildHandler(
    "Too many sign-in attempts. Wait 15 minutes and try again."
  ),
});

const registerLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 10,
  handler: buildHandler("Too many accounts created from here. Try again later."),
});

/**
 * Shares the register budget's shape but is counted separately: a household or
 * office behind one IP should not lose the ability to reset a password because
 * someone else there signed up ten times.
 */
const passwordResetLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  handler: buildHandler(
    "Too many password reset requests. Try again in an hour."
  ),
});

/**
 * Feedback is anonymous by design (see feedback.model.js), which is exactly
 * what makes it spammable — there is no account to ban.
 */
const feedbackLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 20,
  handler: buildHandler(
    "Thanks — that's a lot of feedback. Try again in a little while."
  ),
});

/**
 * The backstop. Generous enough that no one clicking through the wizard will
 * ever see it; low enough that a scraper walking every service in every state
 * is slowed to something the database can absorb.
 */
const globalLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 100,
  handler: buildHandler("Too many requests. Slow down and try again shortly."),
});

/**
 * The scholarship finder fans out across the whole published catalogue on
 * every call, so it is materially more expensive than an ordinary read. A
 * tighter budget than the global one keeps a scripted caller from turning the
 * quiz into a way to walk the entire scheme table repeatedly.
 *
 * Still generous for a person: nobody re-answers a twelve-question quiz thirty
 * times an hour by hand.
 */
const matchLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 30,
  handler: buildHandler(
    "Too many searches from here. Wait a little and try again."
  ),
});

/** Watching is a write, and one per scholarship is all anyone needs. */
const watchLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 20,
  handler: buildHandler("Too many watchlist changes. Try again shortly."),
});

module.exports = {
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  feedbackLimiter,
  matchLimiter,
  watchLimiter,
  globalLimiter,
};
