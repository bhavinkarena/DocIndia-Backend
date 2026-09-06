const { MS_PER_DAY, dayOfYearIST, formatIST } = require("./istDate");

/**
 * Predicts when a not-yet-announced cycle is likely to open, from the pattern
 * of previous years.
 *
 * The problem this solves: between April and July, next year's NSP dates do not
 * exist. Showing last year's closed date is actively harmful — a student reads
 * "closed 31 October" and gives up on a scholarship that will reopen in six
 * weeks. Showing nothing is merely useless.
 *
 * So we say what we actually know: "this has opened in early August each of the
 * last three years". That is honest, useful, and clearly not a promise.
 *
 * Two rules keep it that way:
 *
 *   1. A prediction is NEVER written into window.stages. It is computed at read
 *      time only, so no later query can mistake it for a confirmed date.
 *   2. Two prior years minimum. One year is an anecdote, and a government
 *      portal that has run once may never run again on the same schedule.
 */

const MIN_HISTORY_YEARS = 2;

/** Circular mean over day-of-year, so a December/January pattern doesn't
 *  average to June. */
const meanDayOfYear = (days) => {
  if (!days.length) return null;

  const radians = days.map((d) => (d / 365) * 2 * Math.PI);
  const x = radians.reduce((sum, r) => sum + Math.cos(r), 0) / radians.length;
  const y = radians.reduce((sum, r) => sum + Math.sin(r), 0) / radians.length;

  let angle = Math.atan2(y, x);
  if (angle < 0) angle += 2 * Math.PI;

  return Math.round((angle / (2 * Math.PI)) * 365) || 365;
};

/** Spread of the historical dates, so we can say "early August" rather than
 *  pretending to know the day. */
const spreadDays = (days, mean) => {
  if (days.length < 2) return null;
  const deltas = days.map((d) => {
    const raw = Math.abs(d - mean);
    return Math.min(raw, 365 - raw); // shortest way round the year
  });
  return Math.round(Math.max(...deltas));
};

const dayOfYearToDate = (day, year) =>
  new Date(Date.UTC(year, 0, 1) + (day - 1) * MS_PER_DAY);

/**
 * @returns {null | {
 *   confidence: "predicted",
 *   yearsObserved: number,
 *   opensAround: Date, closesAround: Date,
 *   opensLabel: string, closesLabel: string,
 *   spreadDays: number|null,
 * }}
 */
const predictWindow = (window, now = new Date()) => {
  const history = (window?.history || []).filter((h) => h.opensAt && h.closesAt);
  if (history.length < MIN_HISTORY_YEARS) return null;

  const openDays = history.map((h) => dayOfYearIST(h.opensAt)).filter(Boolean);
  const closeDays = history.map((h) => dayOfYearIST(h.closesAt)).filter(Boolean);
  if (!openDays.length || !closeDays.length) return null;

  const meanOpen = meanDayOfYear(openDays);
  const meanClose = meanDayOfYear(closeDays);

  const year = now.getUTCFullYear();
  let opensAround = dayOfYearToDate(meanOpen, year);
  let closesAround = dayOfYearToDate(meanClose, year);

  // If this year's expected opening has already passed without an
  // announcement, the useful prediction is next year's.
  if (opensAround < now) {
    opensAround = dayOfYearToDate(meanOpen, year + 1);
    closesAround = dayOfYearToDate(meanClose, year + 1);
  }
  // A window that opens in November and closes in February crosses the year.
  if (closesAround < opensAround) {
    closesAround = dayOfYearToDate(meanClose, closesAround.getUTCFullYear() + 1);
  }

  return {
    confidence: "predicted",
    yearsObserved: history.length,
    observedYears: history.map((h) => h.academicYear).filter(Boolean),
    opensAround,
    closesAround,
    opensLabel: formatIST(opensAround),
    closesLabel: formatIST(closesAround),
    spreadDays: spreadDays(openDays, meanOpen),
  };
};

/**
 * The sentence the UI shows. Built here rather than in the frontend so the
 * hedging language cannot drift between surfaces — this is the one place in
 * the product that talks about a date we are not sure of, and it has to keep
 * sounding unsure.
 */
const describePrediction = (prediction) => {
  if (!prediction) return null;
  const { opensLabel, closesLabel, yearsObserved, spreadDays: spread } = prediction;
  const precision = spread !== null && spread <= 10 ? "around" : "roughly around";
  return (
    `Dates for the next cycle have not been announced. ` +
    `Based on the last ${yearsObserved} years, this usually opens ${precision} ` +
    `${opensLabel} and closes ${precision} ${closesLabel}. ` +
    `These are estimates from past years, not official dates.`
  );
};

module.exports = { predictWindow, describePrediction, MIN_HISTORY_YEARS };
