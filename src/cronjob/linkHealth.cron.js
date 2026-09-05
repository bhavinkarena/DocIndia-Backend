const cron = require("node-cron");
const DocumentModel = require("../models/document.model");
const LinkCheck = require("../models/linkCheck.model");
const logger = require("../utils/logger");

// See the note in reverification.cron.js.
const log = logger.child({ job: "linkHealth" });

/**
 * Probes every official source URL and records the result.
 *
 * Worth being honest about the limits: many government sites redirect a dead
 * deep link to their homepage and return 200, so a pass here is weak evidence
 * that the page still says what we think it says. This catches hard failures
 * (DNS gone, 404, timeout) and nothing subtler — human spot-checks via the
 * verification queue remain the real safety net.
 */
const probe = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    let response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });

    // Plenty of government hosts reject HEAD outright; retry properly before
    // calling the link dead.
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });
    }

    return { ok: response.ok, httpStatus: response.status, error: null };
  } catch (error) {
    return {
      ok: false,
      httpStatus: null,
      error: error.name === "AbortError" ? "Timed out" : error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * @param documentIds  restrict the sweep to these documents. Used by the admin
 *                     "re-check now" bulk action — after fixing a dead link,
 *                     waiting until Monday to find out whether the fix worked
 *                     is not a workflow.
 */
const runLinkHealthCheck = async (documentIds = null) => {
  const filter = {
    isDeleted: false,
    officialUrl: { $nin: [null, ""] },
  };
  if (documentIds && documentIds.length) filter._id = { $in: documentIds };

  const documents = await DocumentModel.find(filter)
    .select("_id officialUrl")
    .lean();

  log.info({ links: documents.length }, "Link health check starting");

  for (const doc of documents) {
    const result = await probe(doc.officialUrl);

    await Promise.all([
      DocumentModel.findByIdAndUpdate(doc._id, {
        linkHealth: {
          lastCheckedAt: new Date(),
          lastHttpStatus: result.httpStatus,
          isHealthy: result.ok,
          lastError: result.error,
        },
      }),
      LinkCheck.create({
        documentId: doc._id,
        url: doc.officialUrl,
        httpStatus: result.httpStatus,
        ok: result.ok,
        error: result.error,
      }),
    ]);

    // Spread the load rather than hammering government hosts.
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  log.info("Link health check complete");
};

// 03:00 every Monday.
const schedule = () =>
  cron.schedule("0 3 * * 1", () => {
    runLinkHealthCheck().catch((err) =>
      log.error({ err }, "Link health check failed")
    );
  });

module.exports = { schedule, runLinkHealthCheck };
