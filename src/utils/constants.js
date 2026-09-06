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
