/**
 * Condition evaluation, shared by the checklist rules engine and the scheme
 * eligibility matcher.
 *
 * This lived inside checklist.service.js until schemes needed the same
 * semantics. Two copies would have drifted, and the checklist engine's
 * determinism — same answers, same checklist — is what makes it safe to expose
 * on public unauthenticated routes. There is exactly one implementation of
 * "does this condition hold" in the codebase, and this is it.
 *
 * Pure: no I/O, no clock, no randomness. Every function here is a plain
 * function of its arguments.
 */

/**
 * Evaluates one condition against a set of answers.
 *
 * An operator we don't recognise returns false rather than throwing. A rule
 * carrying a bad operator should quietly fail to match, not take down every
 * checklist generation for that service — validation is the layer that stops
 * bad operators being stored in the first place.
 */
const evaluateCondition = (condition, answers) => {
  const answer = answers[condition.questionKey];
  const { operator, value } = condition;

  switch (operator) {
    case "eq":
      return answer === value;
    case "neq":
      return answer !== value;
    case "in":
      return Array.isArray(value) && value.includes(answer);
    case "nin":
      return Array.isArray(value) && !value.includes(answer);
    // For multi-select answers: does the chosen set include this value?
    case "contains":
      return Array.isArray(answer) && answer.includes(value);
    default:
      return false;
  }
};

/**
 * Evaluates a conditional block — a set of conditions plus how to combine them.
 *
 * A block with no conditions never matches. An empty condition list would
 * otherwise vacuously satisfy `every()` and attach its documents to every
 * checklist, which is the opposite of what an editor who left it blank meant.
 */
const blockMatches = (block, answers) => {
  if (!block.conditions?.length) return false;
  const results = block.conditions.map((c) => evaluateCondition(c, answers));
  return block.matchType === "any"
    ? results.some(Boolean)
    : results.every(Boolean);
};

/**
 * Whether an answer has actually been given.
 *
 * Shared with the matcher's "undetermined" outcome: a criterion that branches
 * on a question the user never answered cannot be evaluated, and treating that
 * as a failure would tell people they are ineligible for things they may well
 * qualify for.
 */
const isAnswered = (answer) =>
  !(
    answer === undefined ||
    answer === null ||
    answer === "" ||
    (Array.isArray(answer) && answer.length === 0)
  );

/**
 * The detailed variant, used by the scheme matcher.
 *
 * `blockMatches` answers a yes/no question, which is all the checklist engine
 * needs. Eligibility has to explain itself — "you would qualify if your family
 * income were under ₹2.5 lakh" is the single most useful thing the finder can
 * say to someone who does not qualify — so this returns the per-criterion
 * verdict rather than collapsing it.
 *
 * Criteria whose question was never answered come back as `unanswered` rather
 * than failed, and the caller decides what that means.
 *
 * @returns {{
 *   passed: boolean,
 *   results: Array<{ condition: object, met: boolean, answered: boolean }>,
 *   failed: object[],
 *   unanswered: object[],
 * }}
 */
const evaluateCriteria = (criteria = [], answers = {}, matchType = "all") => {
  const results = criteria.map((condition) => {
    const answered = isAnswered(answers[condition.questionKey]);
    return {
      condition,
      answered,
      met: answered ? evaluateCondition(condition, answers) : false,
    };
  });

  const failed = results.filter((r) => r.answered && !r.met).map((r) => r.condition);
  const unanswered = results.filter((r) => !r.answered).map((r) => r.condition);

  // No criteria means "open to everyone" — unlike blockMatches, where an empty
  // list means an editor forgot to fill it in. A scheme with no stated
  // restrictions genuinely has none, and the two cases are distinguishable
  // because a scheme's criteria are its whole eligibility statement.
  if (!criteria.length) {
    return { passed: true, results, failed: [], unanswered: [] };
  }

  const passed =
    matchType === "any"
      ? results.some((r) => r.met)
      : results.every((r) => r.met);

  return { passed, results, failed, unanswered };
};

module.exports = {
  evaluateCondition,
  blockMatches,
  evaluateCriteria,
  isAnswered,
};
