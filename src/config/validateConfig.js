const appConfig = require("./appConfig");
const logger = require("../utils/logger");

/**
 * Fails loudly and specifically when required configuration is missing.
 *
 * Without this, a missing MONGO_URI surfaced as a bare "Exited with status 1"
 * on the host with nothing useful in the logs — the process died inside
 * mongoose.connect before anything explained why.
 */
const REQUIRED = [
  { key: "MONGO_URI", value: appConfig.mongoURI, hint: "your MongoDB connection string" },
  { key: "MONGO_DB", value: appConfig.mongoDBName, hint: "the database name" },
  { key: "JWT_SECRET", value: appConfig.jwtSecret, hint: "any long random string" },
];

/** Never log a connection string verbatim — it carries the password. */
const redact = (uri = "") => uri.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@");

const validateConfig = () => {
  const missing = REQUIRED.filter((r) => !r.value);

  if (missing.length) {
    logger.fatal(
      { missing: missing.map((m) => ({ key: m.key, hint: m.hint })) },
      "Missing required environment variables. The .env file is gitignored, " +
        "so a deployed host has none of these unless you set them in its " +
        "dashboard — see .env.example for the full list."
    );
    process.exit(1);
  }

  logger.info(
    {
      database: appConfig.mongoDBName,
      mongo: redact(appConfig.mongoURI),
      origins: appConfig.allowedOrigins,
      email: appConfig.emailUser ? "SMTP configured" : "console-log mode",
      accessToken: appConfig.accessTokenExpire,
      refreshDays: appConfig.refreshTokenDays,
      logLevel: appConfig.logLevel,
      // Worth logging: with this off behind a load balancer, every user of the
      // site shares one rate-limit bucket and the first busy minute locks
      // everyone out. The symptom looks nothing like a proxy misconfiguration.
      proxy:
        appConfig.trustProxy === false
          ? "not trusted (set TRUST_PROXY if behind a load balancer)"
          : `trusting ${appConfig.trustProxy}`,
    },
    "Config OK"
  );
};

module.exports = { validateConfig, redact };
