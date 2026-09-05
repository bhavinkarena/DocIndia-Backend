require("dotenv").config();

const appConfig = {
  port: process.env.PORT || 9002,
  mongoURI: process.env.MONGO_URI,
  mongoDBName: process.env.MONGO_DB || "docuindia",
  jwtSecret: process.env.JWT_SECRET,
  /**
   * A short access token is the entire point of pairing it with a refresh
   * token. Nothing can revoke a JWT once signed — the only real limit on a
   * stolen one is how soon it expires. Fifteen minutes is short enough to
   * matter and long enough that the silent refresh stays invisible.
   */
  accessTokenExpire: process.env.ACCESS_TOKEN_EXPIRE || "15m",
  /**
   * The refresh token is revocable (see refreshToken.model.js), so it can
   * safely be long-lived — this is what stops a user being asked to sign in
   * every quarter of an hour.
   */
  refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS) || 7,
  /**
   * How long a password reset link stays valid. Short, because the link sits
   * in an inbox — the place a compromised account is most likely to be read
   * from — and asking for a fresh one costs the user a single click.
   */
  resetTokenMinutes: Number(process.env.RESET_TOKEN_MINUTES) || 30,
  isProduction: process.env.NODE_ENV === "production",
  /**
   * trace | debug | info | warn | error | fatal. Defaults to info, which is
   * every request plus anything that went wrong.
   *
   * Worth being able to raise without a deploy: the moment you actually need
   * debug logging is the moment you cannot ship a code change to get it.
   */
  logLevel: process.env.LOG_LEVEL || "info",
  /**
   * How long a soft-deleted record is kept before the weekly cleanup removes
   * it permanently.
   *
   * Long enough that nobody discovers a mistaken deletion after the window has
   * closed, short enough that the database is not carrying years of records
   * nobody will read. Set it higher if a retention policy demands it; setting
   * it to 0 would delete everything soft-deleted so far on the next run, so
   * anything below 1 is rejected.
   */
  softDeleteRetentionDays: Math.max(
    1,
    Number(process.env.SOFT_DELETE_RETENTION_DAYS) || 90
  ),
  // FRONTEND_URL may be a comma-separated allowlist (see allowedOrigins). Links
  // in emails need exactly one origin, so take the first entry — the others are
  // preview deploys, not where a user should be sent.
  frontendUrl:
    (process.env.FRONTEND_URL || "")
      .split(",")
      .map((o) => o.trim().replace(/\/+$/, ""))
      .filter((o) => o && !o.startsWith("*."))[0] || "http://localhost:5173",
  /**
   * FRONTEND_URL accepts a comma-separated list, so a deployed API can serve
   * the production site and a preview build without a code change.
   *
   * Entries are normalised because a browser Origin header never has a
   * trailing slash or a path — pasting "https://site.app/" out of the address
   * bar would otherwise never match, and the failure looks identical to
   * having set nothing at all.
   *
   * A leading "*." allows subdomains (e.g. "*.netlify.app" for preview
   * deploys). That is deliberately opt-in: it trusts every subdomain of that
   * host, so only use it for a domain you control.
   */
  allowedOrigins: [
    ...(process.env.FRONTEND_URL || "").split(","),
    "http://localhost:5173",
    "http://localhost:5174",
  ]
    .map((o) => o.trim().toLowerCase().replace(/\/+$/, ""))
    .filter(Boolean),
  /**
   * Behind a PaaS load balancer every request arrives from the proxy, so
   * `req.ip` is the proxy's own address — which would put every user of the
   * site into a single shared rate-limit bucket. TRUST_PROXY tells Express how
   * many hops to unwind to reach the real client.
   *
   * Left off by default on purpose. Trusting a proxy that isn't in front of
   * you is worse than not trusting one at all: a client can then forge
   * X-Forwarded-For and mint a fresh, empty rate-limit bucket per request.
   * Set it to 1 on Render / Railway / Fly, or to the actual hop count.
   */
  trustProxy: (() => {
    const raw = (process.env.TRUST_PROXY || "").trim();
    if (!raw || raw === "false") return false;
    const hops = Number(raw);
    return Number.isInteger(hops) ? hops : raw; // "loopback", a CIDR, etc.
  })(),
  emailUser: process.env.EMAIL_USER,
  emailPass: process.env.EMAIL_PASS,
  emailFrom: process.env.EMAIL_FROM || "DocuIndia <no-reply@docuindia.local>",
  seedAdmin: {
    email: process.env.SEED_ADMIN_EMAIL || "admin@gmail.com",
    password: process.env.SEED_ADMIN_PASSWORD || "Admin@123",
  },
};

module.exports = appConfig;
