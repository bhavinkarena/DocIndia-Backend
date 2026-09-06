const { evaluateCriteria } = require("../utils/conditionEngine");
const {
  NEAR_MISS_MAX_FAILURES,
  INCOME_BAND_LABELS,
  EDUCATION_LEVEL_LABELS,
} = require("../utils/constants");
const { STATES } = require("../utils/states");

/**
 * Eligibility matching for schemes.
 *
 * Pure, like the checklist engine: a function of (schemes, answers). Nothing
 * here touches the database, which is what lets the public unauthenticated
 * quiz route be cheap and lets this be tested without a Mongo instance.
 *
 * Three outcomes, and the distinction between the last two is the whole point:
 *
 *   qualified    — every criterion this scheme states is met
 *   near-miss    — fails on one or two criteria, and we can say which
 *   undetermined — depends on something the student did not tell us
 *
 * Collapsing "undetermined" into "not qualified" would tell people they are
 * ineligible for schemes they may well qualify for, on the basis of a question
 * they simply skipped. That is the worst thing this module could do, so it
 * gets its own outcome and its own section of the results page.
 */

const stateLabelOf = (value) =>
  STATES.find((s) => s.value === value)?.label || value;

/**
 * Turns a failed criterion into something a person can read.
 *
 * A near-miss is only useful if it names what to change — "you would qualify
 * if your family income were under ₹2.5 lakh" is actionable, "failed on
 * familyIncome" is not. Editors can override this with the criterion's own
 * `label`; this is the fallback that keeps unlabelled content usable.
 */
const describeCriterion = (condition) => {
  if (condition.label) return condition.label;

  const { questionKey, operator, value } = condition;
  const readable = Array.isArray(value)
    ? value.map((v) => humanValue(questionKey, v)).join(" or ")
    : humanValue(questionKey, value);

  const key = KEY_LABELS[questionKey] || questionKey;

  switch (operator) {
    case "eq":
      return `${key} must be ${readable}`;
    case "neq":
      return `${key} must not be ${readable}`;
    case "in":
      return `${key} must be one of: ${readable}`;
    case "nin":
      return `${key} must not be: ${readable}`;
    case "contains":
      return `${key} must include ${readable}`;
    default:
      return `${key}: ${readable}`;
  }
};

const KEY_LABELS = {
  domicileState: "Home state",
  institutionState: "State of your college",
  category: "Category",
  familyIncome: "Annual family income",
  educationLevel: "Level of study",
  gender: "Gender",
  hasDisability: "Disability status",
  isMinority: "Minority status",
  institutionType: "Type of institution",
  lastExamPercentage: "Last exam percentage",
  yearOfStudy: "Year of study",
  parentOccupation: "Parent's occupation",
  age: "Age",
};

const humanValue = (key, value) => {
  if (key === "familyIncome") return INCOME_BAND_LABELS[value] || value;
  if (key === "educationLevel") return EDUCATION_LEVEL_LABELS[value] || value;
  if (key === "domicileState" || key === "institutionState") {
    return stateLabelOf(value);
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string") return value.toUpperCase().length <= 4
    ? value.toUpperCase()
    : value;
  return String(value);
};

/**
 * Residency is checked separately from the generic criteria because it is two
 * different questions that every other scholarship site collapses into one.
 *
 * A Bihar-domiciled student studying in Karnataka qualifies for Bihar's scheme
 * and not Karnataka's. Testing a single "state" answer against both would get
 * one of those two wrong for every cross-state student in the country.
 */
const checkResidency = (scholarship, answers) => {
  const residency = scholarship.residency || {};
  const failures = [];
  const unknown = [];

  const domicile = answers.domicileState;
  const institution = answers.institutionState || answers.domicileState;

  if (residency.requiresDomicileIn?.length) {
    if (!domicile) {
      unknown.push({ questionKey: "domicileState", label: "Which state are you a permanent resident of?" });
    } else if (!residency.requiresDomicileIn.includes(domicile)) {
      failures.push({
        questionKey: "domicileState",
        label: `You must be a permanent resident of ${residency.requiresDomicileIn
          .map(stateLabelOf)
          .join(" or ")}`,
      });
    }
  }

  if (residency.requiresInstitutionIn?.length) {
    if (!institution) {
      unknown.push({ questionKey: "institutionState", label: "Which state is your college in?" });
    } else if (!residency.requiresInstitutionIn.includes(institution)) {
      failures.push({
        questionKey: "institutionState",
        label: `Your college must be in ${residency.requiresInstitutionIn
          .map(stateLabelOf)
          .join(" or ")}`,
      });
    }
  }

  if (residency.excludedStates?.length && domicile) {
    if (residency.excludedStates.includes(domicile)) {
      failures.push({
        questionKey: "domicileState",
        label: `Not available in ${stateLabelOf(domicile)} — the state runs its own scheme`,
      });
    }
  }

  return { failures, unknown };
};

/**
 * Academic gates that are structural rather than criteria-driven: an ITI
 * student cannot qualify for a postgraduate scholarship, whatever else is true.
 *
 * These live on `academic` rather than in `eligibility.criteria` because they
 * describe what the scholarship IS, and an editor should not have to hand-write
 * a criterion to express "this is for undergraduates".
 */
const checkAcademic = (scholarship, answers) => {
  const academic = scholarship.academic || {};
  const failures = [];
  const unknown = [];

  if (academic.levels?.length) {
    if (!answers.educationLevel) {
      unknown.push({ questionKey: "educationLevel", label: "What are you studying?" });
    } else if (!academic.levels.includes(answers.educationLevel)) {
      failures.push({
        questionKey: "educationLevel",
        label: `For ${academic.levels
          .map((l) => EDUCATION_LEVEL_LABELS[l] || l)
          .join(" / ")} students`,
      });
    }
  }

  if (academic.streams?.length && answers.stream) {
    if (!academic.streams.includes(answers.stream)) {
      failures.push({
        questionKey: "stream",
        label: `For ${academic.streams.join(" / ")} students`,
      });
    }
  }

  if (academic.minPercentage != null) {
    if (answers.lastExamPercentage == null) {
      unknown.push({
        questionKey: "lastExamPercentage",
        label: "What did you score in your last exam?",
      });
    } else if (answers.lastExamPercentage < academic.minPercentage) {
      failures.push({
        questionKey: "lastExamPercentage",
        label: `Needs at least ${academic.minPercentage}% in your last exam`,
      });
    }
  }

  if (academic.yearOfStudy?.length && answers.yearOfStudy != null) {
    if (!academic.yearOfStudy.includes(answers.yearOfStudy)) {
      failures.push({
        questionKey: "yearOfStudy",
        label: `For students in year ${academic.yearOfStudy.join(" or ")}`,
      });
    }
  }

  if (academic.institutionTypes?.length && answers.institutionType) {
    if (!academic.institutionTypes.includes(answers.institutionType)) {
      failures.push({
        questionKey: "institutionType",
        label: `For students at ${academic.institutionTypes.join(" / ")} institutions`,
      });
    }
  }

  return { failures, unknown };
};

/**
 * Matches one scheme against one set of answers.
 *
 * @returns {{ outcome: "qualified"|"near-miss"|"undetermined"|"excluded",
 *             failed: object[], unanswered: object[] }}
 */
const matchOne = (scheme, answers) => {
  const residency = checkResidency(scheme, answers);
  const academic = checkAcademic(scheme, answers);

  const criteria = evaluateCriteria(
    scheme.eligibility?.criteria || [],
    answers,
    scheme.eligibility?.matchType || "all"
  );

  const failed = [
    ...residency.failures,
    ...academic.failures,
    ...criteria.failed.map((c) => ({
      questionKey: c.questionKey,
      label: describeCriterion(c),
    })),
  ];

  const unanswered = [
    ...residency.unknown,
    ...academic.unknown,
    ...criteria.unanswered.map((c) => ({
      questionKey: c.questionKey,
      label: describeCriterion(c),
    })),
  ];

  if (failed.length === 0 && unanswered.length === 0) {
    return { outcome: "qualified", failed, unanswered };
  }

  // Something is definitely wrong — a near-miss if it's a short list, and
  // excluded if the student would have to change several things about
  // themselves. Beyond two, "you'd qualify if…" stops being encouragement.
  if (failed.length > 0) {
    return {
      outcome: failed.length <= NEAR_MISS_MAX_FAILURES ? "near-miss" : "excluded",
      failed,
      unanswered,
    };
  }

  // Nothing failed, but we couldn't check everything.
  return { outcome: "undetermined", failed, unanswered };
};

/**
 * Ranks qualified matches.
 *
 * Value first, because a student comparing two offers wants the bigger one —
 * but never at the cost of burying something about to close. Anything within
 * a week jumps the queue regardless of value: a ₹50,000 scholarship you can
 * still apply for beats a ₹80,000 one that shut yesterday.
 */
const rankQualified = (a, b) => {
  const aUrgent = a.window?.daysRemaining != null && a.window.daysRemaining <= 7;
  const bUrgent = b.window?.daysRemaining != null && b.window.daysRemaining <= 7;
  if (aUrgent !== bUrgent) return aUrgent ? -1 : 1;

  const aValue = a.benefit?.annualValueMax ?? a.benefit?.annualValueMin ?? 0;
  const bValue = b.benefit?.annualValueMax ?? b.benefit?.annualValueMin ?? 0;
  if (aValue !== bValue) return bValue - aValue;

  const aDays = a.window?.daysRemaining ?? Infinity;
  const bDays = b.window?.daysRemaining ?? Infinity;
  return aDays - bDays;
};

/**
 * Matches a set of schemes against a set of answers.
 *
 * `decorate` is injected so the caller can attach the derived window
 * description without this module importing anything with a clock in it —
 * keeping the matcher itself a pure function of its inputs.
 */
const matchSchemes = (schemes = [], answers = {}, decorate = (s) => s) => {
  const qualified = [];
  const nearMisses = [];
  const undetermined = [];

  schemes.forEach((scheme) => {
    const result = matchOne(scheme, answers);
    if (result.outcome === "excluded") return;

    const payload = { ...decorate(scheme), match: result };

    if (result.outcome === "qualified") qualified.push(payload);
    else if (result.outcome === "near-miss") nearMisses.push(payload);
    else undetermined.push(payload);
  });

  qualified.sort(rankQualified);
  // Fewest things to fix first — the closest near-miss is the most actionable.
  nearMisses.sort((a, b) => a.match.failed.length - b.match.failed.length);

  return {
    qualified,
    nearMisses,
    undetermined,
    counts: {
      qualified: qualified.length,
      nearMisses: nearMisses.length,
      undetermined: undetermined.length,
    },
  };
};

module.exports = {
  matchSchemes,
  matchOne,
  describeCriterion,
  checkResidency,
  checkAcademic,
  rankQualified,
};
