require("dotenv").config();

const appConfig = {
  port: process.env.PORT || 9002,
  mongoURI: process.env.MONGO_URI,
  mongoDBName: process.env.MONGO_DB || "docuindia",
  jwtSecret: process.env.JWT_SECRET,
  tokenExpire: process.env.TOKEN_EXPIRE || "30d",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
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
  emailUser: process.env.EMAIL_USER,
  emailPass: process.env.EMAIL_PASS,
  emailFrom: process.env.EMAIL_FROM || "DocuIndia <no-reply@docuindia.local>",
  seedAdmin: {
    email: process.env.SEED_ADMIN_EMAIL || "admin@gmail.com",
    password: process.env.SEED_ADMIN_PASSWORD || "Admin@123",
  },
};

module.exports = appConfig;
