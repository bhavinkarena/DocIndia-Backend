const cron = require("node-cron");
const Rule = require("../models/rule.model");

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

  console.log(`[cron:reverification] flagged ${result.modifiedCount} rule(s)`);
};

// 04:00 daily.
const schedule = () =>
  cron.schedule("0 4 * * *", () => {
    runReverificationSweep().catch((err) =>
      console.error("[cron:reverification] failed:", err.message)
    );
  });

module.exports = { schedule, runReverificationSweep };
