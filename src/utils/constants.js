exports.ROLES = {
  USER: "user",
  EDITOR: "editor",
  ADMIN: "admin",
};

exports.ROLE_VALUES = ["user", "editor", "admin"];

exports.QUESTION_TYPES = [
  "single-select",
  "multi-select",
  "boolean",
  "state-select",
];

/**
 * What a user wants to do with a document. The same service asks for very
 * different paperwork depending on which of these it is — renewing a passport
 * is not the same errand as applying for a first one.
 */
exports.ACTION_KEYS = [
  "new",
  "renew",
  "update",
  "correction",
  "replace",
  "surrender",
  /**
   * Added for the vehicle and property errands, which are genuinely different
   * verbs rather than shades of the six above. Transferring a vehicle's
   * registration to a buyer, getting a duplicate of a document that still
   * exists, and cancelling a registration each ask for their own paperwork —
   * folding them into "update" or "replace" would put unrelated requirements
   * behind one question.
   */
  "transfer",
  "duplicate",
  "cancel",
];

exports.ACTION_LABELS = {
  new: "Apply for a new one",
  renew: "Renew / re-issue",
  update: "Update details",
  correction: "Correct a mistake",
  replace: "Replace lost or damaged",
  surrender: "Surrender / cancel",
  transfer: "Transfer to someone else",
  duplicate: "Get a duplicate copy",
  cancel: "Cancel / close",
};

// "national" services work identically everywhere (PAN, Aadhaar, passport).
// "state" services exist only in particular states (MA Card in Gujarat).
exports.SERVICE_SCOPES = ["national", "state"];

/**
 * Whose copy of a document is wanted.
 *
 * Not decoration. Enrolling a child under 5 for Aadhaar needs *a parent's*
 * Aadhaar, and a minor's passport application wants *the parents'* passports —
 * so "Aadhaar Card" and "Indian Passport" legitimately appear on the very
 * checklists for getting them. Carrying that in a free-text note left the row
 * reading as "you need an Aadhaar to get an Aadhaar", which is the kind of
 * thing that makes someone close the tab.
 */
exports.DOCUMENT_OWNERS = [
  "self",
  "parent",
  "spouse",
  "guardian",
  "child",
  "employer",
  // Marriage registration wants two witnesses' ID proof. Without this the
  // requirement reads as though the couple need a third identity document.
  "witness",
  /**
   * Transfers have two sides. Selling a vehicle needs the buyer's address
   * proof and the seller's insurance, and a checklist that lists both without
   * saying whose is a checklist you cannot act on alone.
   */
  "seller",
  "buyer",
  // Business registrations on rented premises want the property owner's
  // consent. Filed under "employer" it rendered as "your employer's NOC".
  "landlord",
];

exports.CONDITION_OPERATORS = ["eq", "neq", "in", "nin", "contains"];

exports.MATCH_TYPES = ["all", "any"];

exports.VERIFICATION_STATUS = ["unverified", "verified", "needs-review"];

exports.CHECKLIST_STATUS = ["active", "completed", "archived"];

exports.FEEDBACK_STATUS = ["new", "reviewed", "actioned"];

// How long a rule stays "fresh" before the re-verification cron flags it.
exports.REVIEW_INTERVAL_DAYS = 90;

/* ------------------------------------------------------------------ *
 * Schemes & scholarships
 * ------------------------------------------------------------------ */

/**
 * One base Scheme model, discriminated by type. Scholarships are the first
 * populated type; welfare schemes, pensions and subsidies reuse the same
 * eligibility matcher and document registry rather than growing a parallel
 * system that would inevitably drift.
 */
exports.SCHEME_TYPES = ["scholarship", "welfare", "pension", "subsidy"];

exports.PROVIDER_TYPES = [
  "central",
  "state",
  "ugc",
  "aicte",
  "university",
  "private",
  "csr",
];

exports.EDUCATION_LEVELS = [
  "pre-matric",
  "post-matric",
  "ug",
  "pg",
  "phd",
  "diploma",
  "iti",
  "professional",
];

exports.EDUCATION_LEVEL_LABELS = {
  "pre-matric": "Class 1–10 (pre-matric)",
  "post-matric": "Class 11–12 (post-matric)",
  ug: "Undergraduate",
  pg: "Postgraduate",
  phd: "PhD / research",
  diploma: "Diploma",
  iti: "ITI / vocational",
  professional: "Professional course",
};

exports.SOCIAL_CATEGORIES = ["general", "obc", "sc", "st", "ebc", "minority"];

/**
 * Income is matched in bands, never as an exact figure. A band is all any
 * eligibility criterion actually tests, and storing "₹347,200" when "2.5-4.5L"
 * is the only thing that matters collects more than the product needs — see
 * the privacy note in scholarship-implementation-plan.md §14.1.
 */
exports.INCOME_BANDS = [
  "below-1l",
  "1l-2.5l",
  "2.5l-4.5l",
  "4.5l-8l",
  "above-8l",
];

exports.INCOME_BAND_LABELS = {
  "below-1l": "Below ₹1 lakh",
  "1l-2.5l": "₹1 – 2.5 lakh",
  "2.5l-4.5l": "₹2.5 – 4.5 lakh",
  "4.5l-8l": "₹4.5 – 8 lakh",
  "above-8l": "Above ₹8 lakh",
};

/**
 * A scholarship does not have one deadline. NSP schemes run four or five
 * sequential stages, and the one people actually miss is rarely the first —
 * a student submits on time and their institute never verifies.
 */
exports.WINDOW_STAGES = [
  "application",
  "defect-correction",
  "institute-verification",
  "nodal-verification",
  "disbursement",
];

exports.WINDOW_STAGE_LABELS = {
  application: "Student application",
  "defect-correction": "Correct a defective application",
  "institute-verification": "Institute verification",
  "nodal-verification": "State nodal officer verification",
  disbursement: "Disbursement",
};

exports.WINDOW_STATUSES = [
  "rolling",
  "not-announced",
  "upcoming",
  "open",
  "closing-soon",
  "closed",
];

/**
 * Every date carries where it came from and how much we trust it. A date
 * derived from last year's pattern must never render the same way as one a
 * human confirmed against this year's official circular.
 */
exports.DATE_CONFIDENCE = ["confirmed", "reported", "predicted", "unknown"];

exports.SOURCE_KINDS = ["api", "scrape", "csv", "manual"];

exports.BENEFIT_FREQUENCIES = [
  "one-time",
  "monthly",
  "annual",
  "per-semester",
];

exports.MATCH_OUTCOMES = ["qualified", "near-miss", "undetermined"];

// Beyond two failed criteria a "near miss" is noise dressed as encouragement.
exports.NEAR_MISS_MAX_FAILURES = 2;

// A window closing within this many days gets the urgent treatment.
exports.CLOSING_SOON_DAYS = 14;

/**
 * Scholarship windows follow the academic calendar, so review is seasonal
 * rather than a rolling 90 days like REVIEW_INTERVAL_DAYS — every record is
 * re-checked each June, before the NSP cycle opens.
 */
exports.SCHOLARSHIP_REVIEW_MONTH = 5; // 0-indexed: June

exports.STATE_COVERAGE_STATUS = ["none", "partial", "complete"];
