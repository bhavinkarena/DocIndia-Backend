const cron = require("node-cron");
const mongoose = require("mongoose");

const User = require("../models/user.model");
const GovService = require("../models/govService.model");
const DocumentModel = require("../models/document.model");
const Rule = require("../models/rule.model");
const Checklist = require("../models/checklist.model");
const Feedback = require("../models/feedback.model");
const Changelog = require("../models/changelog.model");
const RefreshToken = require("../models/refreshToken.model");
const logger = require("../utils/logger");
const { softDeleteRetentionDays } = require("../config/appConfig");

const log = logger.child({ job: "cleanup" });

/**
 * Permanently removes records that were soft-deleted long enough ago.
 *
 * Every model here marks `isDeleted: true` and keeps the row forever. That is
 * right for the days after a deletion — an admin who removes the wrong service
 * can be undone, and a user's deleted checklist is recoverable — but it is a
 * database that only grows. The indexes stay warm for records nobody will ever
 * read again, and every query pays `isDeleted: false` against them.
 *
 * The retention window is what makes this safe rather than reckless: 90 days
 * is far longer than anyone notices a mistake, and after it the record has no
 * remaining purpose.
 */

/**
 * Soft deletes carry no timestamp of their own — there is no `deletedAt`
 * field on any of these models. `updatedAt` is the closest honest proxy: the
 * delete was the last write to the record, so it is when the clock started.
 *
 * The consequence is that editing a record and then deleting it resets nothing
 * (the delete is still the newest write), but *undeleting* and re-editing
 * would. That is the conservative direction — it can only ever delay a
 * permanent delete, never bring one forward.
 */
const cutoff = () =>
  new Date(Date.now() - softDeleteRetentionDays * 24 * 60 * 60 * 1000);

/**
 * Order matters. Children are removed before their parents so that if the run
 * fails halfway the survivors are still parents with orphaned children — which
 * the next run cleans up — rather than children pointing at a parent that no
 * longer exists.
 */
const runCleanup = async ({ dryRun = false } = {}) => {
  const before = cutoff();
  const summary = {};

  const sweep = async (label, Model, filter) => {
    if (dryRun) {
      summary[label] = await Model.countDocuments(filter);
      return;
    }
    const result = await Model.deleteMany(filter);
    summary[label] = result.deletedCount || 0;
  };

  const expired = { isDeleted: true, updatedAt: { $lt: before } };

  // Deleted services take their rules and changelog with them. A rule is
  // meaningless without its service, and a changelog entry describes a rule.
  const deadServices = await GovService.find(expired).select("_id").lean();
  const deadServiceIds = deadServices.map((s) => s._id);

  if (deadServiceIds.length) {
    await sweep("changelogs", Changelog, { serviceId: { $in: deadServiceIds } });
    await sweep("rulesOfDeletedServices", Rule, {
      serviceId: { $in: deadServiceIds },
    });
  } else {
    summary.changelogs = 0;
    summary.rulesOfDeletedServices = 0;
  }

  await sweep("rules", Rule, expired);
  await sweep("checklists", Checklist, expired);
  await sweep("feedback", Feedback, expired);
  await sweep("documents", DocumentModel, expired);
  await sweep("services", GovService, expired);

  // Deleted users take their saved checklists and any lingering sessions.
  const deadUsers = await User.find(expired).select("_id").lean();
  const deadUserIds = deadUsers.map((u) => u._id);

  if (deadUserIds.length) {
    await sweep("checklistsOfDeletedUsers", Checklist, {
      userId: { $in: deadUserIds },
    });
    await sweep("refreshTokensOfDeletedUsers", RefreshToken, {
      userId: { $in: deadUserIds },
    });
  } else {
    summary.checklistsOfDeletedUsers = 0;
    summary.refreshTokensOfDeletedUsers = 0;
  }

  await sweep("users", User, expired);

  /**
   * Refresh tokens have a TTL index that expires them automatically, but only
   * once `expiresAt` passes. A revoked token sits there until then, and reuse
   * detection has no use for one older than the retention window.
   */
  await sweep("revokedRefreshTokens", RefreshToken, {
    revokedAt: { $ne: null, $lt: before },
  });

  const total = Object.values(summary).reduce((sum, n) => sum + n, 0);

  log.info(
    { retentionDays: softDeleteRetentionDays, cutoff: before, total, ...summary },
    dryRun
      ? "Cleanup dry run — nothing was deleted"
      : "Cleanup complete — records permanently removed"
  );

  return { total, cutoff: before, ...summary };
};

// 04:30 on Sundays. After the daily re-verification sweep at 04:00, and on the
// quietest day — this is the one job that cannot be undone.
const schedule = () =>
  cron.schedule("30 4 * * 0", () => {
    // Guarded, because deleteMany against a disconnected mongoose buffers and
    // then times out rather than failing fast.
    if (mongoose.connection.readyState !== 1) {
      log.warn("Skipping cleanup — no database connection");
      return;
    }
    runCleanup().catch((err) => log.error({ err }, "Cleanup failed"));
  });

module.exports = { schedule, runCleanup };
