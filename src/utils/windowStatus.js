const {
  WINDOW_STAGE_LABELS,
  CLOSING_SOON_DAYS,
} = require("./constants");
const { daysBetween } = require("./istDate");

/**
 * Derives a scholarship's window status.
 *
 * Status is computed on every read and never stored. A stored "open" is wrong
 * the moment a cron misses a night, and the failure is silent — the page keeps
 * saying "apply now" for a scholarship that closed a week ago. Deriving it
 * means the worst a missed cron can do is delay a notification, not publish a
 * falsehood.
 *
 * Pure: a function of (window, now). The clock is injected so the whole thing
 * is testable without freezing time.
 */

/** The stage the student acts on. Everything else happens after they submit. */
const applicationStage = (window) =>
  (window?.stages || []).find((s) => s.key === "application") || null;

const deriveStatus = (window, now = new Date()) => {
  if (!window) return "not-announced";
  if (window.isRolling) return "rolling";

  const stage = applicationStage(window);
  if (!stage?.closesAt) return "not-announced";

  const closesAt = new Date(stage.closesAt);
  const opensAt = stage.opensAt ? new Date(stage.opensAt) : null;

  if (opensAt && now < opensAt) return "upcoming";
  if (now > closesAt) return "closed";

  const remaining = daysBetween(now, closesAt);
  return remaining !== null && remaining <= CLOSING_SOON_DAYS
    ? "closing-soon"
    : "open";
};

/**
 * The full picture the UI needs, in one call.
 *
 * `nextDeadline` deliberately looks past the application stage. A student who
 * has already submitted still has an institute-verification deadline coming,
 * and that is the one applications actually die on — showing only the
 * application date would hide the trap this module exists to surface.
 */
const describeWindow = (window, now = new Date()) => {
  const status = deriveStatus(window, now);
  const stage = applicationStage(window);

  const closesAt = stage?.closesAt ? new Date(stage.closesAt) : null;
  const opensAt = stage?.opensAt ? new Date(stage.opensAt) : null;

  const upcomingStages = (window?.stages || [])
    .filter((s) => s.closesAt && new Date(s.closesAt) > now)
    .sort((a, b) => new Date(a.closesAt) - new Date(b.closesAt));

  const next = upcomingStages[0] || null;

  return {
    status,
    academicYear: window?.academicYear || null,
    isRolling: Boolean(window?.isRolling),

    opensAt,
    closesAt,
    daysRemaining: closesAt && now <= closesAt ? daysBetween(now, closesAt) : null,
    daysUntilOpen: opensAt && now < opensAt ? daysBetween(now, opensAt) : null,

    // Confidence rides along with the date so the UI can render a confirmed
    // deadline differently from one nobody has verified. See §4.3 of the plan.
    confidence: stage?.confidence || "unknown",
    sourceUrl: stage?.sourceUrl || null,

    // Extensions are the norm on NSP, not the exception. Surfacing the original
    // date stops a silently-changed deadline reading as our mistake.
    wasExtended: Boolean(stage?.extensionCount),
    originalClosesAt: stage?.originalClosesAt
      ? new Date(stage.originalClosesAt)
      : null,

    nextDeadline: next
      ? {
          key: next.key,
          label: next.label || WINDOW_STAGE_LABELS[next.key] || next.key,
          closesAt: new Date(next.closesAt),
          daysRemaining: daysBetween(now, new Date(next.closesAt)),
        }
      : null,

    stages: (window?.stages || [])
      .slice()
      .sort((a, b) => {
        if (!a.closesAt) return 1;
        if (!b.closesAt) return -1;
        return new Date(a.closesAt) - new Date(b.closesAt);
      })
      .map((s) => ({
        key: s.key,
        label: s.label || WINDOW_STAGE_LABELS[s.key] || s.key,
        opensAt: s.opensAt ? new Date(s.opensAt) : null,
        closesAt: s.closesAt ? new Date(s.closesAt) : null,
        confidence: s.confidence || "unknown",
        isPast: Boolean(s.closesAt && new Date(s.closesAt) < now),
      })),
  };
};

/** Whether an application can still be started. Drives the apply button. */
const isActionable = (status) =>
  status === "open" || status === "closing-soon" || status === "rolling";

module.exports = { deriveStatus, describeWindow, isActionable, applicationStage };
