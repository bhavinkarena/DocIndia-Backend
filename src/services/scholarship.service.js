const { isValidObjectId } = require("mongoose");
const Scheme = require("../models/scheme.model");
const Scholarship = require("../models/scholarship.model");
const SchemeWatch = require("../models/schemeWatch.model");
const DocumentModel = require("../models/document.model");
const { serviceHandler } = require("../utils/asyncHandler");
const { buildPagination } = require("../utils/common");
const { describeWindow, deriveStatus } = require("../utils/windowStatus");
const { predictWindow, describePrediction } = require("../utils/windowPredictor");
const { endOfDayIST, startOfDayIST } = require("../utils/istDate");
const { matchSchemes } = require("./schemeMatcher.service");
const { assessReadiness } = require("./documentReadiness.service");
const { STATES } = require("../utils/states");
const {
  createScholarshipSchema,
  updateScholarshipSchema,
  listScholarshipSchema,
  closingSoonSchema,
  matchSchema,
  verifySchema,
} = require("../validations/scholarship.validation");
const {
  SCHOLARSHIP_REVIEW_MONTH,
  PROVIDER_TYPES,
  EDUCATION_LEVELS,
} = require("../utils/constants");

const PUBLIC_FIELDS =
  "name slug shortName description provider scope availableStates benefit " +
  "eligibility applyUrl officialUrl guidelinesUrl helplinePhone helplineEmail " +
  "academic window residency renewal quota requiredDocuments " +
  "verificationStatus lastVerifiedAt linkHealth type createdAt updatedAt";

/**
 * State is a scoping rule, not a filter.
 *
 * A student in Bihar is eligible for central schemes AND Bihar's own. Filtering
 * to one state would hide every NSP scholarship and halve what they see, which
 * is the single most common way a scholarship listing misleads someone.
 */
const scopeFilter = (state) => {
  const base = { type: "scholarship", isPublished: true, isDeleted: false };
  if (!state) return base;
  return {
    ...base,
    $and: [
      { $or: [{ scope: "national" }, { scope: "state", availableStates: state }] },
      // A central scheme a state opts out of, because it runs a parallel one.
      { $or: [{ "residency.excludedStates": { $exists: false } },
              { "residency.excludedStates": { $ne: state } }] },
    ],
  };
};

/**
 * Attaches everything derived from the clock.
 *
 * Kept in one place so a scholarship looks identical however it was fetched —
 * a list row, a detail page and a match result all carry the same window shape,
 * and the frontend never does date arithmetic of its own.
 */
const decorate = (scheme, now = new Date()) => {
  const plain = scheme.toObject ? scheme.toObject() : scheme;
  const window = describeWindow(plain.window, now);

  // Only predict when there is nothing announced. A confirmed date must never
  // be shadowed by a guess.
  const prediction =
    window.status === "not-announced" ? predictWindow(plain.window, now) : null;

  return {
    ...plain,
    window: {
      ...window,
      prediction,
      predictionText: describePrediction(prediction),
    },
  };
};

/* ------------------------------------------------------------------ *
 * Public reads
 * ------------------------------------------------------------------ */

exports.listScholarships = serviceHandler(async (query) => {
  const { error, value } = listScholarshipSchema.validate(query);
  if (error) return { success: false, statusCode: 400, message: error.message };

  const { state, level, providerType, stream, status, search, page, limit, sort } = value;

  const filter = scopeFilter(state);
  if (level) filter["academic.levels"] = level;
  if (providerType) filter["provider.type"] = providerType;
  if (stream) filter["academic.streams"] = stream;
  if (search) {
    filter.$text = undefined; // no text index yet — keyword + name match instead
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: rx }, { shortName: rx }, { keywords: rx }];
  }

  const all = await Scheme.find(filter).select(PUBLIC_FIELDS).lean();
  const now = new Date();
  let decorated = all.map((s) => decorate(s, now));

  // Status is derived, so it cannot be a Mongo filter — apply it here.
  if (status) decorated = decorated.filter((s) => s.window.status === status);

  decorated.sort(SORTERS[sort] || SORTERS.deadline);

  const start = (page - 1) * limit;
  return {
    success: true,
    statusCode: 200,
    data: {
      items: decorated.slice(start, start + limit),
      pagination: buildPagination(decorated.length, page, limit),
    },
  };
});

/**
 * Closed scholarships sort last whatever the chosen order — an expired entry
 * at the top of a list reads as the site being broken.
 */
const closedLast = (a, b) => {
  const aClosed = a.window.status === "closed";
  const bClosed = b.window.status === "closed";
  if (aClosed !== bClosed) return aClosed ? 1 : -1;
  return 0;
};

const SORTERS = {
  deadline: (a, b) =>
    closedLast(a, b) ||
    (a.window.daysRemaining ?? Infinity) - (b.window.daysRemaining ?? Infinity),
  value: (a, b) =>
    closedLast(a, b) ||
    (b.benefit?.annualValueMax ?? 0) - (a.benefit?.annualValueMax ?? 0),
  name: (a, b) => closedLast(a, b) || a.name.localeCompare(b.name),
  newest: (a, b) => closedLast(a, b) || new Date(b.createdAt) - new Date(a.createdAt),
};

exports.getScholarshipBySlug = serviceHandler(async (slug, query = {}) => {
  const scheme = await Scheme.findOne({
    slug: String(slug).toLowerCase(),
    type: "scholarship",
    isDeleted: false,
    isPublished: true,
  })
    .select(PUBLIC_FIELDS)
    .lean();

  if (!scheme) {
    return { success: false, statusCode: 404, message: "Scholarship not found" };
  }

  const decorated = decorate(scheme);

  // Hydrate the document list so the page can show what to gather even before
  // the student answers anything.
  const docs = await DocumentModel.find({
    _id: { $in: (scheme.requiredDocuments || []).map((r) => r.documentId) },
    isDeleted: false,
  })
    .populate("obtainedVia.serviceId", "label slug isPublished")
    .select("name slug description issuingBody officialUrl copiesRequired attestation validityWindow formatNotes obtainedVia")
    .lean();

  const byId = new Map(docs.map((d) => [String(d._id), d]));

  decorated.documents = (scheme.requiredDocuments || [])
    .map((r) => {
      const doc = byId.get(String(r.documentId));
      if (!doc) return null;
      const via = doc.obtainedVia?.serviceId;
      return {
        ...doc,
        mandatory: r.mandatory !== false,
        note: r.note || null,
        conditional: Boolean(r.condition?.length),
        obtainedVia:
          via && via.isPublished
            ? { serviceSlug: via.slug, serviceLabel: via.label, action: doc.obtainedVia.action || "new" }
            : null,
      };
    })
    .filter(Boolean);

  return { success: true, statusCode: 200, data: decorated };
});

exports.getClosingSoon = serviceHandler(async (query) => {
  const { error, value } = closingSoonSchema.validate(query);
  if (error) return { success: false, statusCode: 400, message: error.message };

  const { state, days, limit } = value;
  const now = new Date();
  const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const all = await Scheme.find({
    ...scopeFilter(state),
    "window.stages": {
      $elemMatch: { key: "application", closesAt: { $gte: now, $lte: cutoff } },
    },
  })
    .select(PUBLIC_FIELDS)
    .lean();

  const items = all
    .map((s) => decorate(s, now))
    .filter((s) => s.window.daysRemaining !== null)
    .sort((a, b) => a.window.daysRemaining - b.window.daysRemaining)
    .slice(0, limit);

  return { success: true, statusCode: 200, data: { items, days } };
});

/**
 * Facet values present in *published* content, so the browse filters never
 * offer a level or provider that returns nothing.
 */
exports.getFilters = serviceHandler(async (query = {}) => {
  const schemes = await Scheme.find(scopeFilter(query.state))
    .select("academic.levels academic.streams provider.type")
    .lean();

  const levels = new Set();
  const streams = new Set();
  const providers = new Set();

  schemes.forEach((s) => {
    (s.academic?.levels || []).forEach((l) => levels.add(l));
    (s.academic?.streams || []).forEach((x) => streams.add(x));
    if (s.provider?.type) providers.add(s.provider.type);
  });

  return {
    success: true,
    statusCode: 200,
    data: {
      levels: EDUCATION_LEVELS.filter((l) => levels.has(l)),
      streams: [...streams].sort(),
      providerTypes: PROVIDER_TYPES.filter((p) => providers.has(p)),
      total: schemes.length,
    },
  };
});

/**
 * Per-state counts, so the picker can say "Bihar — 6 state schemes" and an
 * uncovered state reads as "not added yet" rather than mysteriously empty.
 */
exports.getStateCoverage = serviceHandler(async () => {
  const stateSchemes = await Scheme.find({
    type: "scholarship",
    isPublished: true,
    isDeleted: false,
    scope: "state",
  })
    .select("availableStates")
    .lean();

  const counts = new Map();
  stateSchemes.forEach((s) =>
    (s.availableStates || []).forEach((st) => counts.set(st, (counts.get(st) || 0) + 1))
  );

  const nationalCount = await Scheme.countDocuments({
    type: "scholarship",
    isPublished: true,
    isDeleted: false,
    scope: "national",
  });

  return {
    success: true,
    statusCode: 200,
    data: {
      nationalCount,
      states: STATES.map((s) => ({
        value: s.value,
        label: s.label,
        count: counts.get(s.value) || 0,
        // "We haven't done this yet" is a different statement from "there is
        // nothing here", and only one of them is honest.
        coverage: counts.get(s.value) ? "partial" : "none",
      })),
    },
  };
});

/* ------------------------------------------------------------------ *
 * The finder
 * ------------------------------------------------------------------ */

/**
 * Matches the quiz answers against the catalogue.
 *
 * Public, unauthenticated and stateless: answers come in, matches go out,
 * nothing is written. The quiz collects caste, income band and disability
 * status, and the honest way to hold that is not to hold it at all unless the
 * student explicitly asks us to.
 */
exports.matchScholarships = serviceHandler(async (payload) => {
  const { error, value } = matchSchema.validate(payload);
  if (error) return { success: false, statusCode: 400, message: error.message };

  // Age is derived rather than asked twice, so a rule can branch on either.
  const answers = { ...value };
  if (!answers.age && answers.dateOfBirth) {
    const dob = new Date(answers.dateOfBirth);
    const diff = Date.now() - dob.getTime();
    answers.age = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
  }
  // The engine's reserved key, so scheme criteria can branch on "state" the
  // same way rule conditions do.
  answers.state = answers.domicileState || null;

  const scopeState = answers.domicileState || answers.institutionState || null;
  const schemes = await Scheme.find(scopeFilter(scopeState))
    .select(PUBLIC_FIELDS)
    .lean();

  const now = new Date();
  const results = matchSchemes(schemes, answers, (s) => decorate(s, now));

  return {
    success: true,
    statusCode: 200,
    data: {
      ...results,
      // Echoed back so the results page can say what it matched on without
      // the client having to keep its own copy in sync.
      answeredKeys: Object.keys(value),
    },
  };
});

/**
 * Document readiness for one scholarship.
 *
 * The differentiator: not "you need an income certificate" but "you need one,
 * you don't have it, it takes 15 days, and you have 38".
 */
exports.getReadiness = serviceHandler(async (slug, payload = {}) => {
  const scheme = await Scheme.findOne({
    slug: String(slug).toLowerCase(),
    type: "scholarship",
    isDeleted: false,
    isPublished: true,
  }).lean();

  if (!scheme) {
    return { success: false, statusCode: 404, message: "Scholarship not found" };
  }

  const window = describeWindow(scheme.window);
  const readiness = await assessReadiness(scheme, {
    answers: payload.answers || {},
    alreadyHave: payload.alreadyHave || [],
    state: payload.state || null,
    deadline: window.closesAt,
    deadlineConfidence: window.confidence,
  });

  return {
    success: true,
    statusCode: 200,
    data: { scholarship: { name: scheme.name, slug: scheme.slug }, window, readiness },
  };
});

/* ------------------------------------------------------------------ *
 * Watchlist
 * ------------------------------------------------------------------ */

exports.watchScholarship = serviceHandler(async (userId, slug) => {
  const scheme = await Scheme.findOne({
    slug: String(slug).toLowerCase(),
    type: "scholarship",
    isDeleted: false,
    isPublished: true,
  })
    .select("_id name")
    .lean();

  if (!scheme) {
    return { success: false, statusCode: 404, message: "Scholarship not found" };
  }

  // Upsert rather than create: re-watching something previously unwatched is
  // ordinary, and the partial unique index would otherwise reject it.
  await SchemeWatch.findOneAndUpdate(
    { userId, schemeId: scheme._id },
    { $set: { isDeleted: false, matchedAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return {
    success: true,
    statusCode: 200,
    message: `You'll be reminded before ${scheme.name} closes`,
  };
});

exports.unwatchScholarship = serviceHandler(async (userId, slug) => {
  const scheme = await Scheme.findOne({ slug: String(slug).toLowerCase() })
    .select("_id")
    .lean();
  if (!scheme) {
    return { success: false, statusCode: 404, message: "Scholarship not found" };
  }

  await SchemeWatch.findOneAndUpdate(
    { userId, schemeId: scheme._id },
    // Reminder history is cleared with the watch, so re-watching later starts
    // the tiers again rather than silently skipping every one already "sent".
    { $set: { isDeleted: true, remindersSent: [] } }
  );

  return { success: true, statusCode: 200, message: "Removed from your watchlist" };
});

exports.getWatchlist = serviceHandler(async (userId) => {
  const watches = await SchemeWatch.find({ userId, isDeleted: false })
    .populate({ path: "schemeId", select: PUBLIC_FIELDS })
    .lean();

  const now = new Date();
  const items = watches
    .filter((w) => w.schemeId)
    .map((w) => ({ ...decorate(w.schemeId, now), watchedAt: w.createdAt }))
    .sort((a, b) => (a.window.daysRemaining ?? Infinity) - (b.window.daysRemaining ?? Infinity));

  return { success: true, statusCode: 200, data: { items } };
});

/* ------------------------------------------------------------------ *
 * Editor / admin
 * ------------------------------------------------------------------ */

/**
 * Deadlines arrive as calendar dates and mean end-of-day IST. Normalising on
 * write means the rest of the system can compare them to `new Date()` without
 * every call site remembering the offset.
 */
const normaliseWindow = (window) => {
  if (!window) return window;
  const fix = (stages = []) =>
    stages.map((s) => ({
      ...s,
      opensAt: s.opensAt ? startOfDayIST(s.opensAt) : null,
      closesAt: s.closesAt ? endOfDayIST(s.closesAt) : null,
      originalClosesAt: s.originalClosesAt ? endOfDayIST(s.originalClosesAt) : null,
    }));

  return {
    ...window,
    stages: fix(window.stages),
    renewalStages: fix(window.renewalStages),
    history: (window.history || []).map((h) => ({
      ...h,
      opensAt: h.opensAt ? startOfDayIST(h.opensAt) : null,
      closesAt: h.closesAt ? endOfDayIST(h.closesAt) : null,
    })),
  };
};

/** A rule cannot reference a document that doesn't exist — same guarantee the
 *  rule service already makes, because Mongo makes none. */
const assertDocumentsExist = async (requiredDocuments = []) => {
  if (!requiredDocuments.length) return null;
  const ids = requiredDocuments.map((r) => r.documentId);
  const found = await DocumentModel.countDocuments({
    _id: { $in: ids },
    isDeleted: false,
  });
  return found === ids.length
    ? null
    : "One or more required documents do not exist";
};

exports.createScholarship = serviceHandler(async (payload) => {
  const { error, value } = createScholarshipSchema.validate(payload);
  if (error) return { success: false, statusCode: 400, message: error.message };

  const exists = await Scheme.findOne({ slug: value.slug }).lean();
  if (exists) {
    return { success: false, statusCode: 409, message: "That slug is already taken" };
  }

  const docError = await assertDocumentsExist(value.requiredDocuments);
  if (docError) return { success: false, statusCode: 400, message: docError };

  const created = await Scholarship.create({
    ...value,
    window: normaliseWindow(value.window),
  });

  return { success: true, statusCode: 201, data: created };
});

exports.updateScholarship = serviceHandler(async (id, payload) => {
  if (!isValidObjectId(id)) {
    return { success: false, statusCode: 400, message: "Invalid scholarship id" };
  }

  const { error, value } = updateScholarshipSchema.validate(payload);
  if (error) return { success: false, statusCode: 400, message: error.message };

  if (value.requiredDocuments) {
    const docError = await assertDocumentsExist(value.requiredDocuments);
    if (docError) return { success: false, statusCode: 400, message: docError };
  }

  const scheme = await Scholarship.findOne({ _id: id, isDeleted: false });
  if (!scheme) {
    return { success: false, statusCode: 404, message: "Scholarship not found" };
  }

  Object.assign(scheme, value);
  if (value.window) scheme.window = normaliseWindow(value.window);

  /**
   * Any content edit resets verification, exactly as a rule edit does. An
   * edited record carrying yesterday's "verified" badge is the single most
   * misleading state this content can be in.
   */
  scheme.version += 1;
  scheme.verificationStatus = "needs-review";

  await scheme.save();
  return { success: true, statusCode: 200, data: scheme };
});

exports.verifyScholarship = serviceHandler(async (id, payload, actorId) => {
  if (!isValidObjectId(id)) {
    return { success: false, statusCode: 400, message: "Invalid scholarship id" };
  }
  const { error, value } = verifySchema.validate(payload);
  if (error) return { success: false, statusCode: 400, message: error.message };

  // Scholarship windows follow the academic calendar, so the default review
  // date is next June — before the cycle opens — not a rolling 90 days.
  const nextJune = new Date();
  nextJune.setMonth(SCHOLARSHIP_REVIEW_MONTH, 1);
  nextJune.setHours(0, 0, 0, 0);
  if (nextJune <= new Date()) nextJune.setFullYear(nextJune.getFullYear() + 1);

  const updated = await Scholarship.findOneAndUpdate(
    { _id: id, isDeleted: false },
    {
      $set: {
        verificationStatus: value.verificationStatus,
        lastVerifiedAt: value.verificationStatus === "verified" ? new Date() : null,
        verifiedBy: actorId || null,
        nextReviewAt: value.nextReviewAt || nextJune,
      },
    },
    { new: true }
  );

  if (!updated) {
    return { success: false, statusCode: 404, message: "Scholarship not found" };
  }
  return { success: true, statusCode: 200, data: updated };
});

exports.deleteScholarship = serviceHandler(async (id) => {
  if (!isValidObjectId(id)) {
    return { success: false, statusCode: 400, message: "Invalid scholarship id" };
  }
  const deleted = await Scholarship.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $set: { isDeleted: true, isPublished: false } },
    { new: true }
  );
  if (!deleted) {
    return { success: false, statusCode: 404, message: "Scholarship not found" };
  }
  return { success: true, statusCode: 200, message: "Scholarship deleted" };
});

/** Admin listing — includes unpublished, which the public one never does. */
exports.listAllScholarships = serviceHandler(async (query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

  const filter = { type: "scholarship", isDeleted: false };
  if (query.verificationStatus) filter.verificationStatus = query.verificationStatus;
  if (query.isPublished !== undefined) filter.isPublished = query.isPublished === "true";

  const [items, total] = await Promise.all([
    Scheme.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Scheme.countDocuments(filter),
  ]);

  const now = new Date();
  return {
    success: true,
    statusCode: 200,
    data: {
      items: items.map((s) => ({
        ...decorate(s, now),
        completeness: scoreCompleteness(s),
      })),
      pagination: buildPagination(total, page, limit),
    },
  };
});

/**
 * How usable a record actually is, weighted by what a student needs.
 *
 * A half-entered scholarship is invisible work until someone can see it — the
 * admin queue sorts on this so the records closest to publishable surface
 * first, rather than an editor picking at random.
 */
const WEIGHTED_FIELDS = [
  ["applyUrl", 3, (s) => Boolean(s.applyUrl)],
  ["closingDate", 3, (s) => (s.window?.stages || []).some((x) => x.key === "application" && x.closesAt)],
  ["requiredDocuments", 3, (s) => Boolean(s.requiredDocuments?.length)],
  ["eligibility", 3, (s) => Boolean(s.eligibility?.criteria?.length)],
  ["benefitSummary", 2, (s) => Boolean(s.benefit?.summary)],
  ["description", 1, (s) => Boolean(s.description)],
  ["provider", 1, (s) => Boolean(s.provider?.name)],
  ["academicLevels", 2, (s) => Boolean(s.academic?.levels?.length)],
  ["officialUrl", 1, (s) => Boolean(s.officialUrl)],
  ["benefitComponents", 1, (s) => Boolean(s.benefit?.components?.length)],
];

const scoreCompleteness = (scheme) => {
  const total = WEIGHTED_FIELDS.reduce((sum, [, weight]) => sum + weight, 0);
  const missing = [];
  let score = 0;

  WEIGHTED_FIELDS.forEach(([name, weight, test]) => {
    if (test(scheme)) score += weight;
    else missing.push(name);
  });

  return { score, total, percent: Math.round((score / total) * 100), missing };
};

exports._internals = { decorate, scopeFilter, scoreCompleteness, normaliseWindow, SORTERS };
