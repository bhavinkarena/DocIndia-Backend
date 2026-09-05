const mongoose = require("mongoose");
const { mongoURI, mongoDBName } = require("./appConfig");
const { redact } = require("./validateConfig");
const logger = require("../utils/logger");

const log = logger.child({ component: "database" });

/**
 * Explains the two failures that actually happen in deployment, rather than
 * leaving a raw driver error in the logs.
 */
const explain = (error) => {
  const message = error?.message || "";

  if (/ENOTFOUND|querySrv/i.test(message)) {
    return "The cluster hostname could not be resolved — check MONGO_URI is complete and correct.";
  }
  if (/Authentication failed|bad auth/i.test(message)) {
    return "Credentials rejected — check the username and password in MONGO_URI.";
  }
  if (/IP that isn't whitelisted|whitelist|not allowed to connect/i.test(message)) {
    return (
      "MongoDB Atlas is refusing this host's IP. Add it under Atlas → " +
      "Network Access. Most PaaS hosts have no fixed egress IP, so 0.0.0.0/0 " +
      "is usually required there."
    );
  }
  if (/timed out|ETIMEDOUT|ServerSelectionTimeout/i.test(message)) {
    return (
      "Timed out reaching the cluster. Usually Atlas Network Access blocking " +
      "this host's IP, or the cluster being paused."
    );
  }
  return null;
};

/**
 * Connects with retries instead of exiting.
 *
 * The server binds its port before this runs, so a database that is briefly
 * unreachable degrades the service rather than killing it — on a PaaS, exiting
 * turns a transient blip into a failed deploy with no running instance to
 * inspect. /health reports the real connection state throughout.
 */
const connectDB = async ({ retries = 5, delayMs = 3000 } = {}) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(mongoURI, {
        dbName: mongoDBName,
        serverSelectionTimeoutMS: 10000,
      });
      log.info({ database: mongoDBName }, "MongoDB connected");
      return true;
    } catch (error) {
      const hint = explain(error);
      log.error(
        {
          attempt,
          retries,
          err: error.message,
          // The hint is the whole point of explain() — it names which of the
          // two deployment failures this is, so keep it a first-class field
          // rather than a second log line that a filter might separate.
          hint,
          // Only on the first attempt: it never changes, and it is the one
          // field here worth a line of log volume.
          uri: attempt === 1 ? redact(mongoURI) : undefined,
        },
        "MongoDB connection failed"
      );

      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  log.error(
    "Giving up on the initial connection. The API is listening but every " +
      "database-backed route will fail until this is resolved. Check /health."
  );
  return false;
};

// error and disconnected are warn/error rather than info: they were logged at
// info before, which put a real outage at the same level as a healthy request.
mongoose.connection.on("error", (err) => {
  log.error({ err: err.message }, "MongoDB connection error");
});

mongoose.connection.on("disconnected", () => {
  log.warn("MongoDB disconnected");
});

mongoose.connection.on("reconnected", () => {
  log.info("MongoDB reconnected");
});

const isConnected = () => mongoose.connection.readyState === 1;

module.exports = connectDB;
module.exports.isConnected = isConnected;
