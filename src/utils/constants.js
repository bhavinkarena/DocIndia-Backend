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

exports.CONDITION_OPERATORS = ["eq", "neq", "in", "nin", "contains"];

exports.MATCH_TYPES = ["all", "any"];

exports.VERIFICATION_STATUS = ["unverified", "verified", "needs-review"];

exports.CHECKLIST_STATUS = ["active", "completed", "archived"];

exports.FEEDBACK_STATUS = ["new", "reviewed", "actioned"];

// How long a rule stays "fresh" before the re-verification cron flags it.
exports.REVIEW_INTERVAL_DAYS = 90;
