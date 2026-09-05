const cron = require("node-cron");
const Rule = require("../models/rule.model");
const logger = require("../utils/logger");

// Tagged once so every line this job writes is filterable as a unit — a cron
// run has no request id to correlate on.
const log = logger.child({ job: "reverification" });

/**
 * Flags rules whose review date has passed. Nothing is unpublished
 * automatically — a stale checklist is still better than a missing one, and
 * the decision to pull content belongs to a person, not a timer.
 */
const runReverificationSweep = async () => {
  const result = await Rule.updateMany(
    {
      isDeleted: false,
      verificationStatus: "verified",
      nextReviewAt: { $lte: new Date() },
    },
    { verificationStatus: "needs-review" }
  );

  log.info({ flagged: result.modifiedCount }, "Re-verification sweep complete");
};

// 04:00 daily.
const schedule = () =>
  cron.schedule("0 4 * * *", () => {
    runReverificationSweep().catch((err) =>
      log.error({ err }, "Re-verification sweep failed")
    );
  });

module.exports = { schedule, runReverificationSweep };
