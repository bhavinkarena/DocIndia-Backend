const appConfig = require("./appConfig");

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
    console.error("\nMissing required environment variables:\n");
    missing.forEach((m) => console.error(`  ${m.key}  — ${m.hint}`));
    console.error(
      "\nThe .env file is gitignored, so a deployed host has none of these\n" +
        "unless you set them in its dashboard. See .env.example for the full list.\n"
    );
    process.exit(1);
  }

  console.log("Config OK");
  console.log(`  database : ${appConfig.mongoDBName}`);
  console.log(`  mongo    : ${redact(appConfig.mongoURI)}`);
  console.log(`  origins  : ${appConfig.allowedOrigins.join(", ")}`);
  console.log(`  email    : ${appConfig.emailUser ? "SMTP configured" : "console-log mode"}`);
};

module.exports = { validateConfig, redact };
