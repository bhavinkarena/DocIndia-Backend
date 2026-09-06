/**
 * IST date handling.
 *
 * Government deadlines are stated as a calendar date and mean "end of that day,
 * India time". Storing "15 Oct" naively as 2026-10-15T00:00:00Z makes the
 * scholarship read as closed from 05:30 IST on the 15th — for the whole of the
 * single most consequential day of its cycle. Every deadline goes through
 * endOfDayIST on write so that mistake can only be made in one place.
 */

// India has one timezone and no daylight saving, so a fixed offset is correct
// here in a way it would not be for most countries.
const IST_OFFSET_MINUTES = 330; // UTC+05:30
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

/** Parses a "YYYY-MM-DD" string or Date into its IST calendar parts. */
const istParts = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const shifted = new Date(date.getTime() + IST_OFFSET_MINUTES * MS_PER_MINUTE);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
};

/**
 * "15 Oct 2026" → 2026-10-15T18:29:59.999Z, i.e. 23:59:59.999 IST.
 *
 * Accepts a bare date string, which is what a CSV import and an admin date
 * picker both produce.
 */
const endOfDayIST = (value) => {
  if (!value) return null;

  // A bare "YYYY-MM-DD" has no timezone, so parse the digits directly rather
  // than letting the runtime decide whether it means UTC or local midnight.
  const bare = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parts = bare
    ? {
        year: Number(value.slice(0, 4)),
        month: Number(value.slice(5, 7)) - 1,
        day: Number(value.slice(8, 10)),
      }
    : istParts(value);

  if (!parts) return null;

  return new Date(
    Date.UTC(parts.year, parts.month, parts.day, 23, 59, 59, 999) -
      IST_OFFSET_MINUTES * MS_PER_MINUTE
  );
};

/** The mirror of endOfDayIST, for a window that opens at 00:00 IST. */
const startOfDayIST = (value) => {
  const end = endOfDayIST(value);
  if (!end) return null;
  return new Date(end.getTime() - MS_PER_DAY + 1);
};

/**
 * Whole days between two instants, rounded up.
 *
 * Rounding up rather than truncating is deliberate: with 30 hours left,
 * "1 day remaining" reads as "tomorrow" and understates the urgency, while
 * "2 days" matches how someone counts calendar days off a wall.
 */
const daysBetween = (from, to) => {
  if (!from || !to) return null;
  return Math.ceil((to.getTime() - from.getTime()) / MS_PER_DAY);
};

/** Day of the year in IST, 1–366. Used by the window predictor. */
const dayOfYearIST = (value) => {
  const parts = istParts(value);
  if (!parts) return null;
  const start = Date.UTC(parts.year, 0, 1);
  const current = Date.UTC(parts.year, parts.month, parts.day);
  return Math.round((current - start) / MS_PER_DAY) + 1;
};

/** Formats for display in emails and server-rendered text. */
const formatIST = (value) => {
  const parts = istParts(value);
  if (!parts) return null;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${parts.day} ${months[parts.month]} ${parts.year}`;
};

module.exports = {
  IST_OFFSET_MINUTES,
  MS_PER_DAY,
  endOfDayIST,
  startOfDayIST,
  daysBetween,
  dayOfYearIST,
  formatIST,
  istParts,
};
