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
];

exports.ACTION_LABELS = {
  new: "Apply for a new one",
  renew: "Renew / re-issue",
  update: "Update details",
  correction: "Correct a mistake",
  replace: "Replace lost or damaged",
  surrender: "Surrender / cancel",
};

// "national" services work identically everywhere (PAN, Aadhaar, passport).
// "state" services exist only in particular states (MA Card in Gujarat).
exports.SERVICE_SCOPES = ["national", "state"];

exports.CONDITION_OPERATORS = ["eq", "neq", "in", "nin", "contains"];

exports.MATCH_TYPES = ["all", "any"];

exports.VERIFICATION_STATUS = ["unverified", "verified", "needs-review"];

exports.CHECKLIST_STATUS = ["active", "completed", "archived"];

exports.FEEDBACK_STATUS = ["new", "reviewed", "actioned"];

// How long a rule stays "fresh" before the re-verification cron flags it.
exports.REVIEW_INTERVAL_DAYS = 90;
