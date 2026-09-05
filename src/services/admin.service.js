const { isValidObjectId } = require("mongoose");
const GovService = require("../models/govService.model");
const { runCleanup } = require("../cronjob/cleanup.cron");
const { runLinkHealthCheck } = require("../cronjob/linkHealth.cron");
const govServiceService = require("./govService.service");
const documentService = require("./document.service");
const ruleService = require("./rule.service");
const logger = require("../utils/logger");
const DocumentModel = require("../models/document.model");
const Rule = require("../models/rule.model");
const Checklist = require("../models/checklist.model");
const Feedback = require("../models/feedback.model");
const User = require("../models/user.model");
const { serviceHandler } = require("../utils/asyncHandler");

exports.getDashboardStats = serviceHandler(async () => {
  const [
    services,
    publishedServices,
    documents,
    rules,
    unverifiedRules,
    brokenLinks,
    users,
    savedChecklists,
    newFeedback,
    inaccurateReports,
  ] = await Promise.all([
    GovService.countDocuments({ isDeleted: false }),
    GovService.countDocuments({ isDeleted: false, isPublished: true }),
    DocumentModel.countDocuments({ isDeleted: false }),
    Rule.countDocuments({ isDeleted: false }),
    Rule.countDocuments({
      isDeleted: false,
      $or: [
        { verificationStatus: { $in: ["unverified", "needs-review"] } },
        { nextReviewAt: { $lte: new Date() } },
      ],
    }),
    DocumentModel.countDocuments({
      isDeleted: false,
      "linkHealth.isHealthy": false,
    }),
    User.countDocuments({ isDeleted: false, role: "user" }),
    Checklist.countDocuments({ isDeleted: false }),
    Feedback.countDocuments({ isDeleted: false, status: "new" }),
    Feedback.countDocuments({ isDeleted: false, wasAccurate: false }),
  ]);

  // Published-and-unverified is the urgent case: live content nobody has
  // checked against its official source.
  const publishedUnverified = await Rule.countDocuments({
    isDeleted: false,
    verificationStatus: { $ne: "verified" },
    serviceId: {
      $in: await GovService.find({ isDeleted: false, isPublished: true })
        .distinct("_id"),
    },
  });

  return {
    success: true,
    statusCode: 200,
    data: {
      content: {
        services,
        publishedServices,
        documents,
        rules,
        unverifiedRules,
        publishedUnverified,
        brokenLinks,
      },
      usage: { users, savedChecklists },
      feedback: { newFeedback, inaccurateReports },
    },
  };
});

/** Documents whose last link probe failed — the content-ops worklist. */
exports.getBrokenLinks = serviceHandler(async () => {
  const documents = await DocumentModel.find({
    isDeleted: false,
    "linkHealth.isHealthy": false,
  })
    .select("name slug officialUrl linkHealth")
    .sort({ "linkHealth.lastCheckedAt": -1 })
    .lean();

  return { success: true, statusCode: 200, data: documents };
});

/**
 * Manual trigger for the soft-delete cleanup that otherwise runs weekly.
 *
 * Exists alongside the cron because "the database is large and I want to know
 * why" is a question someone asks on a Tuesday, not on a Sunday at 04:30. The
 * dry run is the reason this is safe to offer at all: it reports exactly what
 * a real run would remove, so nobody has to trust the retention arithmetic
 * before pressing the irreversible button.
 */
exports.runSoftDeleteCleanup = serviceHandler(async ({ dryRun = true } = {}) => {
  const summary = await runCleanup({ dryRun });

  return {
    success: true,
    statusCode: 200,
    message: dryRun
      ? `${summary.total} record(s) are eligible for permanent deletion`
      : `${summary.total} record(s) permanently deleted`,
    data: { dryRun, ...summary },
  };
});

/* ------------------------------------------------------------------ *
 * Bulk operations
 * ------------------------------------------------------------------ */

/**
 * The CMS handles one record at a time, which is right for editing and wrong
 * for the operations that come in batches: publishing a set of services once
 * they have all been verified, marking a morning's review done, re-checking
 * the links you just fixed.
 *
 * Two decisions shape everything below.
 *
 * **Each item goes through the normal single-record service, not a bulk
 * updateMany.** Those services carry the integrity rules — a document cannot
 * be deleted while a rule references it, the national default cannot be
 * removed while states rely on it. A bulk path that bypassed them would let a
 * checkbox do what the UI refuses to do one at a time, which is exactly the
 * kind of shortcut that produces a dangling reference in front of a user.
 *
 * **Partial success is reported, not hidden.** Deleting eight documents where
 * two are still referenced should delete six and say plainly which two were
 * refused and why. Failing the whole batch would be unhelpful; silently
 * skipping them would be worse.
 */
const MAX_BULK_ITEMS = 100;

const runBulk = async (ids, handler) => {
  const succeeded = [];
  const failed = [];

  // Sequential, not Promise.all: these hit integrity checks that read other
  // records, and a hundred concurrent writes against a shared cluster is how
  // an admin click becomes a database incident.
  for (const id of ids) {
    try {
      const result = await handler(id);
      if (result.success) succeeded.push(id);
      else failed.push({ id, reason: result.message });
    } catch (error) {
      failed.push({ id, reason: error.message });
    }
  }

  return {
    success: true,
    statusCode: 200,
    message:
      failed.length === 0
        ? `${succeeded.length} updated`
        : `${succeeded.length} updated, ${failed.length} could not be`,
    data: {
      succeeded: succeeded.length,
      failedCount: failed.length,
      succeededIds: succeeded,
      failed,
    },
  };
};

const validateBulkInput = (ids, action, allowed) => {
  if (!Array.isArray(ids) || ids.length === 0) {
    return "Select at least one item";
  }
  if (ids.length > MAX_BULK_ITEMS) {
    return `Too many items — ${MAX_BULK_ITEMS} at a time is the limit`;
  }
  if (ids.some((id) => !isValidObjectId(id))) {
    return "One or more selected items has an invalid ID";
  }
  if (!allowed.includes(action)) {
    return `Unknown action "${action}". Expected one of: ${allowed.join(", ")}`;
  }
  return null;
};

exports.bulkServices = serviceHandler(async ({ ids, action }) => {
  const invalid = validateBulkInput(ids, action, ["publish", "unpublish", "delete"]);
  if (invalid) return { success: false, statusCode: 400, message: invalid };

  if (action === "delete") {
    return runBulk(ids, (id) => govServiceService.deleteService(id));
  }

  return runBulk(ids, (id) =>
    govServiceService.updateService(id, { isPublished: action === "publish" })
  );
});

exports.bulkDocuments = serviceHandler(async ({ ids, action }) => {
  const invalid = validateBulkInput(ids, action, ["delete", "check-links"]);
  if (invalid) return { success: false, statusCode: 400, message: invalid };

  if (action === "check-links") {
    // Probing is slow by design — it sleeps between requests rather than
    // hammering government hosts — so it runs detached and the admin sees the
    // results appear in the link-health list rather than waiting on them.
    runLinkHealthCheck(ids).catch((err) =>
      logger.error({ err }, "Bulk link check failed")
    );

    return {
      success: true,
      statusCode: 202,
      message: `Checking ${ids.length} link(s) — results will appear shortly`,
      data: { queued: ids.length },
    };
  }

  return runBulk(ids, (id) => documentService.deleteDocument(id));
});

exports.bulkRules = serviceHandler(async ({ ids, action }, actorId) => {
  const invalid = validateBulkInput(ids, action, ["verify", "needs-review", "delete"]);
  if (invalid) return { success: false, statusCode: 400, message: invalid };

  if (action === "delete") {
    return runBulk(ids, (id) => ruleService.deleteRule(id));
  }

  // Verification is a claim about having checked an official source. Bulk
  // verifying is offered because a reviewer genuinely does work through a
  // queue in one sitting — but it still stamps who did it, exactly as the
  // single-record path does.
  const verificationStatus = action === "verify" ? "verified" : "needs-review";
  return runBulk(ids, (id) =>
    ruleService.verifyRule(id, { verificationStatus }, actorId)
  );
});
