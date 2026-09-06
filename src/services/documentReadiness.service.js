const DocumentModel = require("../models/document.model");
const { evaluateCriteria } = require("../utils/conditionEngine");
const { daysBetween } = require("../utils/istDate");
const {
  composeSteps,
  summariseTimeline,
  resolveRule,
} = require("./checklist.service")._internals;

/**
 * The document bridge.
 *
 * This is the reason the scholarship module exists rather than being a
 * filterable list like every other scholarship site. Those sites say "you need
 * an income certificate" and stop. DocuIndia already knows how to obtain an
 * income certificate, how long it takes, and therefore whether the student can
 * still make the deadline.
 *
 * The join is entirely over things the codebase already has:
 *
 *   Scheme.requiredDocuments → Document registry → Document.obtainedVia
 *     → the issuing Service → its Rule → that rule's process steps
 *     → summariseTimeline() → a lead time in days
 *
 * Lead times come from the same rules that generate checklists, deliberately.
 * A second source of "how long does a caste certificate take" would drift from
 * the first, and then the scholarship page and the checklist page would
 * disagree about the same errand.
 */

/**
 * Which documents this scholarship actually requires of *this* applicant.
 *
 * A disability certificate is required only of someone claiming that category,
 * so requirements carry conditions and are resolved against the quiz answers
 * exactly as a rule's conditional blocks are.
 */
const resolveRequirements = (scheme, answers = {}) =>
  (scheme.requiredDocuments || []).filter((entry) => {
    if (!entry.condition?.length) return true;
    return evaluateCriteria(entry.condition, answers, "all").passed;
  });

/**
 * How long the missing document takes to obtain.
 *
 * Returns null when we genuinely don't know — the document isn't issued by any
 * service we model, or the service's rule quotes no durations. Null propagates
 * all the way to an "unknown" verdict rather than being coerced to zero; a
 * zero would silently claim the document is instant and turn an honest "we
 * can't tell" into a confident "you have plenty of time".
 */
const leadTimeFor = async (doc, state) => {
  const via = doc.obtainedVia;
  if (!via?.serviceId) return null;

  const service = via.serviceId;
  // Populated documents carry the service object; unpopulated carry an id.
  const serviceId = service?._id || service;
  const isPublished = service?.isPublished;

  // An unpublished service can't be linked to, so its timeline is not
  // something we can offer as a plan.
  if (isPublished === false) return null;

  const { rule } = await resolveRule(serviceId, via.action || "new", state);
  if (!rule) return null;

  const timeline = summariseTimeline(composeSteps(rule, { state }));
  if (!timeline) return null;

  return {
    minDays: timeline.minDays,
    maxDays: timeline.maxDays,
    // Some step quoted only free text, so the real figure is higher than this.
    hasUnquoted: timeline.hasUnquoted,
    serviceSlug: service?.slug || null,
    serviceLabel: service?.label || null,
    action: via.action || "new",
  };
};

/**
 * @param scheme       a Scholarship document (lean or hydrated)
 * @param opts.answers quiz answers, for conditional requirements
 * @param opts.alreadyHave  document ids or slugs the student says they hold
 * @param opts.state   the student's state, for resolving state-specific rules
 * @param opts.deadline the application closing date, if known
 * @param opts.deadlineConfidence  from the window stage — see the verdict note
 */
const assessReadiness = async (scheme, opts = {}) => {
  const {
    answers = {},
    alreadyHave = [],
    state = null,
    deadline = null,
    deadlineConfidence = "unknown",
    now = new Date(),
  } = opts;

  const requirements = resolveRequirements(scheme, answers);
  if (!requirements.length) {
    return {
      required: [],
      held: [],
      missing: [],
      criticalPath: null,
      verdict: "unknown",
      reason: "This scholarship has no document list yet.",
    };
  }

  const docs = await DocumentModel.find({
    _id: { $in: requirements.map((r) => r.documentId) },
    isDeleted: false,
  })
    .populate("obtainedVia.serviceId", "label slug isPublished")
    .lean();

  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const heldSet = new Set(alreadyHave.map(String));

  const held = [];
  const missing = [];

  for (const requirement of requirements) {
    const doc = byId.get(String(requirement.documentId));
    // A requirement pointing at a deleted document is a content bug, not
    // something to render as a mystery item the student cannot act on.
    if (!doc) continue;

    const item = {
      documentId: doc._id,
      name: doc.name,
      slug: doc.slug,
      description: doc.description,
      issuingBody: doc.issuingBody,
      officialUrl: doc.officialUrl,
      mandatory: requirement.mandatory !== false,
      note: requirement.note || null,
      copiesRequired: doc.copiesRequired ?? null,
      attestation: doc.attestation || null,
      validityWindow: doc.validityWindow || null,
      formatNotes: doc.formatNotes || null,
    };

    if (heldSet.has(String(doc._id)) || heldSet.has(doc.slug)) {
      held.push(item);
      continue;
    }

    const lead = await leadTimeFor(doc, state);
    missing.push({
      ...item,
      leadTime: lead,
      // The link that makes this different from every other scholarship site.
      obtainedVia: lead
        ? { serviceSlug: lead.serviceSlug, serviceLabel: lead.serviceLabel, action: lead.action }
        : null,
    });
  }

  return {
    required: [...held, ...missing],
    held,
    missing,
    ...assessTiming({ missing, deadline, deadlineConfidence, now }),
  };
};

/**
 * Can they still make it?
 *
 * The honesty rule, and the most important line of judgement in this module:
 * **"too-late" is only ever returned when every input is confirmed.** If the
 * deadline is a prediction, or any missing document's lead time is unknown,
 * the verdict is "unknown" with an explanation.
 *
 * Telling a student they have missed a deadline they have not missed would
 * make them abandon a scholarship they could still get. That is a worse
 * outcome than saying nothing, so uncertainty always resolves toward saying
 * nothing.
 */
const assessTiming = ({ missing, deadline, deadlineConfidence, now }) => {
  if (!missing.length) {
    return {
      criticalPath: null,
      verdict: "ready",
      reason: "You already have everything this scholarship asks for.",
    };
  }

  const mandatory = missing.filter((m) => m.mandatory);
  const withLead = mandatory.filter((m) => m.leadTime);
  const withoutLead = mandatory.filter((m) => !m.leadTime);

  if (!deadline) {
    return {
      criticalPath: null,
      verdict: "unknown",
      reason: "No closing date is confirmed for this cycle yet.",
    };
  }

  if (!withLead.length) {
    return {
      criticalPath: null,
      verdict: "unknown",
      reason: "We don't know how long these documents take to obtain.",
    };
  }

  /**
   * Documents are obtained in parallel — nothing stops someone applying for a
   * caste certificate and an income certificate on the same morning. So the
   * critical path is the single longest one, not the sum.
   */
  const slowest = withLead.reduce((worst, item) =>
    item.leadTime.maxDays > worst.leadTime.maxDays ? item : worst
  );

  const daysAvailable = daysBetween(now, new Date(deadline));
  const daysNeeded = slowest.leadTime.maxDays;
  const daysNeededBest = slowest.leadTime.minDays;

  const startBy = new Date(new Date(deadline).getTime());
  startBy.setDate(startBy.getDate() - daysNeeded);

  const criticalPath = {
    documentName: slowest.name,
    documentSlug: slowest.slug,
    serviceSlug: slowest.leadTime.serviceSlug,
    action: slowest.leadTime.action,
    leadTimeDays: daysNeeded,
    leadTimeBestDays: daysNeededBest,
    startBy,
    slackDays: daysAvailable - daysNeeded,
    // Some lead time in the chain is free text and isn't counted, so every
    // figure here is optimistic. The UI has to say so.
    isOptimistic: Boolean(slowest.leadTime.hasUnquoted) || withoutLead.length > 0,
    unknownCount: withoutLead.length,
  };

  /**
   * Uncertainty cuts in one direction, not both.
   *
   * Documents whose lead time we don't know can only make the errand LONGER,
   * never shorter. So they undermine a reassuring verdict and reinforce a
   * discouraging one:
   *
   *   comfortable — needs every lead time known. An unknown one could add
   *                 weeks, and "you have plenty of time" is the single most
   *                 harmful thing to say wrongly here.
   *   too-late    — the known minimum already exceeds the time available.
   *                 Unmeasured extras only make that more true, so they do
   *                 not soften it.
   *
   * What does soften "too-late" is an unconfirmed *deadline*, because then the
   * date being compared against may itself be wrong.
   */
  const deadlineIsFirm = deadlineConfidence === "confirmed";

  let verdict;
  if (daysAvailable < 0) verdict = "closed";
  else if (daysAvailable >= daysNeeded) {
    verdict = criticalPath.isOptimistic ? "tight" : "comfortable";
  } else if (daysAvailable >= daysNeededBest) verdict = "tight";
  else verdict = deadlineIsFirm ? "too-late" : "unknown";

  const unknownNote = criticalPath.unknownCount
    ? ` ${criticalPath.unknownCount} other document${
        criticalPath.unknownCount === 1 ? "" : "s"
      } may add time we can't estimate.`
    : "";

  const reason =
    verdict === "too-late"
      ? `${slowest.name} takes ${daysNeededBest}–${daysNeeded} days and only ${daysAvailable} remain.`
      : verdict === "unknown"
      ? `${slowest.name} may take longer than the ${daysAvailable} days left, and this closing date isn't confirmed.`
      : verdict === "tight"
      ? `Possible, but start ${slowest.name} today — it needs ${daysNeededBest}–${daysNeeded} days.${unknownNote}`
      : `You have ${criticalPath.slackDays} days of slack. Start ${slowest.name} by ${startBy.toDateString()}.`;

  return { criticalPath, verdict, reason };
};

module.exports = { assessReadiness, resolveRequirements, leadTimeFor, assessTiming };
