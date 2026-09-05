const pino = require("pino");
const { isProduction, logLevel } = require("../config/appConfig");

/**
 * One logger for the whole process.
 *
 * JSON in production because that is what a log aggregator can filter, alert
 * on and correlate — `console.log("Unhandled error:", err)` produces a line
 * that reads fine to a human tailing a terminal and is nearly useless once it
 * is one of a million in a hosted log viewer.
 *
 * Pretty-printed in development for exactly the opposite reason.
 */
const logger = pino({
  level: logLevel,
  // Pino's own keys are single letters by default; spelled out, because the
  // person reading these at 2am should not need the field reference.
  messageKey: "message",
  formatters: {
    level: (label) => ({ level: label }),
  },
  /**
   * Anything matching these paths is replaced before it is written. Logging is
   * append-only and often shipped off-box, so a secret that reaches a log is a
   * secret that has to be rotated — the cost of over-redacting is nothing.
   */
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "password",
      "newPassword",
      "currentPassword",
      "token",
      "refreshToken",
      "resetTokenHash",
      "*.password",
      "*.token",
    ],
    censor: "[redacted]",
  },
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
          // Must match messageKey above, or pino-pretty looks for "msg", finds
          // nothing, and prints the message as just another indented field.
          messageKey: "message",
        },
      },
});

module.exports = logger;
