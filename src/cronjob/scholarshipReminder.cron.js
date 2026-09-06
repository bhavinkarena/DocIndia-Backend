const cron = require("node-cron");
const SchemeWatch = require("../models/schemeWatch.model");
const { sendScholarshipReminderEmail } = require("../services/email.service");
const { describeWindow } = require("../utils/windowStatus");
const logger = require("../utils/logger");

const log = logger.child({ job: "scholarshipReminder" });

/**
 * Reminder tiers, in days before the application closes.
 *
 * Four rather than one because they do different jobs: 30 days is "you have
 * time to get the documents", 2 days is "stop what you are doing". A single
 * reminder has to pick one of those and gets the other wrong.
 */
const TIERS = [30, 14, 7, 2, 0];

/**
 * Which tier is due, and which are spent by sending it.
 *
 * Someone who starts watching three days before a deadline has, technically,
 * "reached" the 30, 14 and 7-day tiers all at once. Firing them one per day
 * would send five emails in three days about a single scholarship, which reads
 * as a malfunction. So a send consumes every tier it has passed, and the mail
 * itself always quotes the real days remaining rather than the tier's number.
 *
 * @returns {{ tier: number, consumed: number[] } | null}
 */
const dueTier = (daysLeft, sent = []) => {
  const already = new Set(sent.map((s) => s.tier));
  const reached = TIERS.filter((tier) => daysLeft <= tier && !already.has(tier));
  if (!reached.length) return null;

  // TIERS is descending, so the last reached entry is the tightest one.
  return { tier: reached[reached.length - 1], consumed: reached };
};

const runReminderSweep = async ({ now = new Date() } = {}) => {
  const watches = await SchemeWatch.find({ isDeleted: false })
    .populate({ path: "userId", select: "firstName email notificationPrefs status isDeleted" })
    .populate({ path: "schemeId", select: "name slug window applyUrl provider isPublished isDeleted" })
    .lean();

  let sent = 0;
  let skipped = 0;

  for (const watch of watches) {
    const user = watch.userId;
    const scheme = watch.schemeId;

    // A watch can outlive the thing it watches, or the account that made it.
    if (!user || !scheme || user.isDeleted || !user.status) { skipped += 1; continue; }
    if (scheme.isDeleted || !scheme.isPublished) { skipped += 1; continue; }
    if (user.notificationPrefs?.email === false) { skipped += 1; continue; }

    const window = describeWindow(scheme.window, now);
    if (window.daysRemaining === null) { skipped += 1; continue; }

    /**
     * Never remind against a date nobody has confirmed.
     *
     * A predicted or merely reported deadline is a guess, and an email saying
     * "closes in 2 days" against a guess is worse than silence — it either
     * panics someone for no reason or teaches them to ignore the next one.
     */
    if (window.confidence !== "confirmed") { skipped += 1; continue; }

    const due = dueTier(window.daysRemaining, watch.remindersSent || []);
    if (!due) { skipped += 1; continue; }

    try {
      await sendScholarshipReminderEmail(user, scheme, window.daysRemaining);

      /**
       * Recorded immediately after the send, per watch.
       *
       * The cron re-runs after a crash and a redeploy mid-sweep is ordinary.
       * Without this, a restart at the wrong moment mails everybody twice —
       * which reads as a malfunction and trains people to ignore the one
       * message that actually mattered.
       */
      const sentAt = new Date();
      await SchemeWatch.updateOne(
        { _id: watch._id },
        {
          $push: {
            remindersSent: {
              $each: due.consumed.map((tier) => ({ tier, sentAt })),
            },
          },
        }
      );
      sent += 1;
    } catch (err) {
      // One bad address must not stop the sweep for everyone behind it.
      log.warn({ err, watchId: watch._id }, "Reminder not sent");
      skipped += 1;
    }
  }

  log.info({ sent, skipped, considered: watches.length }, "Scholarship reminder sweep complete");
  return { sent, skipped, considered: watches.length };
};

// 06:00 daily — early enough to be the first thing read, late enough not to
// arrive overnight.
const schedule = () =>
  cron.schedule("0 6 * * *", () => {
    runReminderSweep().catch((err) =>
      log.error({ err }, "Scholarship reminder sweep failed")
    );
  });

module.exports = { schedule, runReminderSweep, dueTier, TIERS };
