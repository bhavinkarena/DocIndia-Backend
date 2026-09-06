const { isValidObjectId } = require("mongoose");
const GovService = require("../models/govService.model");
const Rule = require("../models/rule.model");
const DocumentModel = require("../models/document.model");
const Checklist = require("../models/checklist.model");
const { serviceHandler } = require("../utils/asyncHandler");
const {
  generateChecklistSchema,
  saveChecklistSchema,
  updateProgressSchema,
  classifySchema,
} = require("../validations/checklist.validation");
const {
  parseListQuery,
  buildPagination,
  generateShareToken,
} = require("../utils/common");
const { STATES } = require("../utils/states");
const { ACTION_LABELS } = require("../utils/constants");
const checklistCache = require("../utils/checklistCache");
const { evaluateCondition, blockMatches } = require("../utils/conditionEngine");

// Below this, a "match" is a coincidental word in common rather than a signal.
const MIN_MATCH_SCORE = 4;

const stateLabelOf = (value) =>
  STATES.find((s) => s.value === value)?.label || value;

/* ------------------------------------------------------------------ *
 * Rules engine
 *
 * Pure and deterministic: the same answers always produce the same
 * checklist. Nothing here writes to the database, which is what makes
 * it cheap to test and safe to call from public, unauthenticated routes.
 * ------------------------------------------------------------------ */

/**
 * Condition evaluation now lives in utils/conditionEngine.js, because the
 * scheme eligibility matcher needs identical semantics. Two copies would have
 * drifted, and this engine's determinism is the reason the public routes are
 * safe. Re-exported below so existing tests and callers are unaffected.
 */

/**
 * Validates submitted answers against the action's own question definitions.
 * Built dynamically because every action has a different question set — there
 * is no single static schema to check against.
 */
const validateAnswers = (questions = [], answers = {}) => {
  const errors = [];

  questions.forEach((question) => {
    const answer = answers[question.key];
    const isEmpty =
      answer === undefined ||
      answer === null ||
      answer === "" ||
      (Array.isArray(answer) && answer.length === 0);

    if (isEmpty) {
      if (question.required) errors.push(`"${question.label}" is required`);
      return;
    }

    if (question.type === "boolean") {
      if (typeof answer !== "boolean") {
        errors.push(`"${question.label}" must be true or false`);
      }
      return;
    }

    if (question.type === "state-select") {
      if (!STATES.some((s) => s.value === answer)) {
        errors.push(`"${question.label}" must be a valid Indian state or UT`);
      }
      return;
    }

    const allowed = (question.options || []).map((o) => o.value);

    if (question.type === "single-select") {
      if (!allowed.includes(answer)) {
        errors.push(`"${question.label}" has an invalid selection`);
      }
      return;
    }

    if (question.type === "multi-select") {
      if (!Array.isArray(answer)) {
        errors.push(`"${question.label}" must be a list`);
        return;
      }
      if (answer.some((a) => !allowed.includes(a))) {
        errors.push(`"${question.label}" has an invalid selection`);
      }
    }
  });

  return errors;
};

/**
 * Finds the rule that applies to this service + action + state.
 *
 * A state-specific rule wins over the national default. Most central services
 * (PAN, passport, Aadhaar) need identical documents everywhere, so they get
 * one national rule rather than 36 near-identical copies; only genuinely
 * divergent states get an override.
 */
const resolveRule = async (serviceId, action, state) => {
  const stateRule = await Rule.findOne({
    serviceId,
    action,
    state,
    isDeleted: false,
  }).lean();

  if (stateRule) return { rule: stateRule, source: "state" };

  const nationalRule = await Rule.findOne({
    serviceId,
    action,
    state: null,
    isDeleted: false,
  }).lean();

  return nationalRule ? { rule: nationalRule, source: "national" } : { rule: null };
};

/**
 * Collapses base + matched conditional documents into a single list.
 * A document appearing in more than one block is emitted once, and
 * mandatory always wins over conditional — a document required by any
 * matched path is required, full stop.
 */
const composeItems = (rule, answers) => {
  const collected = new Map();

  const add = (entry, sourceBlock) => {
    const id = entry.documentId?.toString();
    if (!id) return;

    const existing = collected.get(id);
    if (existing) {
      existing.mandatory = existing.mandatory || entry.mandatory;
      /**
       * Ownership is first-writer-wins. No rule currently asks for the same
       * document both for the applicant and for someone else, and splitting
       * the row would need progress keyed by (documentId, belongsTo) rather
       * than documentId alone — otherwise ticking "your Aadhaar" would tick
       * "your parent's Aadhaar" with it. The merged note still carries the
       * second requirement in words if it ever arises.
       */
      if (entry.note && !existing.notes.includes(entry.note)) {
        existing.notes.push(entry.note);
      }
      return;
    }

    collected.set(id, {
      documentId: id,
      mandatory: entry.mandatory !== false,
      belongsTo: entry.belongsTo || "self",
      notes: entry.note ? [entry.note] : [],
      sourceBlock,
    });
  };

  (rule.baseDocuments || []).forEach((entry) => add(entry, "base"));

  (rule.conditionalBlocks || []).forEach((block) => {
    if (!blockMatches(block, answers)) return;
    (block.documents || []).forEach((entry) =>
      add(entry, block.label || "conditional")
    );
  });

  return Array.from(collected.values());
};

/**
 * Something that only applies on some routes — a Tatkal surcharge, a step only
 * minors perform — is dropped when its conditions don't match, exactly as a
 * document block is.
 *
 * The one difference from a document block: **no conditions means always**,
 * whereas an unconditional document block never fires. Most fees and most
 * steps apply to everybody, and making an editor write a tautological
 * condition to say so would be noise on every record.
 */
const appliesTo = (entry, answers) =>
  !entry.conditions?.length || blockMatches(entry, answers);

/**
 * Orders the steps, drops the ones this applicant doesn't perform, and
 * resolves each surviving step's fee lines the same way.
 *
 * Filtering whole steps is what makes the timeline computable. "Police
 * verification: weeks on the normal route, days on Tatkal" is two steps with
 * two durations, not one step with a caveat in its prose — and a caveat in
 * prose is a number nothing can plan a deadline against.
 */
const composeSteps = (rule, answers) =>
  [...(rule.processSteps || [])]
    .filter((step) => appliesTo(step, answers))
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((step) => ({
      ...step,
      fees: (step.fees || [])
        .filter((line) => appliesTo(line, answers))
        .sort((a, b) => (a.order || 0) - (b.order || 0)),
    }));

/**
 * Adds up what the errand costs.
 *
 * Returns null rather than zero when nothing is quotable — "we don't know" and
 * "it's free" are different statements, and rendering the first as the second
 * is the kind of confident wrong number this whole model is built to avoid.
 *
 * `hasUnquoted` marks a total that is a floor: some step carried a free-text
 * fee that cannot be summed, so the real figure is higher than what we show.
 */
const summariseCost = (steps) => {
  const currencies = new Set();
  let min = 0;
  let max = 0;
  let isEstimate = false;
  let hasUnquoted = false;
  let lineCount = 0;

  steps.forEach((step) => {
    if (!step.fees?.length) {
      // Free text with no structured equivalent — a real cost we can't add.
      if (step.fee) hasUnquoted = true;
      return;
    }

    step.fees.forEach((line) => {
      min += line.amount;
      max += line.maxAmount ?? line.amount;
      if (line.isEstimate) isEstimate = true;
      currencies.add(line.currency || "INR");
      lineCount += 1;
    });
  });

  if (!lineCount) return null;

  /**
   * Summing across currencies would produce a confidently meaningless number.
   * In practice it means a content error, so the totals are withheld and the
   * flag says why — one shape either way, so nothing downstream has to guess
   * which variant it received.
   */
  const mixedCurrency = currencies.size > 1;

  return {
    min: mixedCurrency ? null : min,
    max: mixedCurrency ? null : max,
    currency: mixedCurrency ? null : [...currencies][0],
    mixedCurrency,
    isEstimate,
    hasUnquoted,
    lineCount,
  };
};

/**
 * Total elapsed time. Process steps are sequential by definition — you cannot
 * collect the document before you have applied for it — so these add rather
 * than overlap.
 */
const summariseTimeline = (steps) => {
  let minDays = 0;
  let maxDays = 0;
  let stepsQuoted = 0;
  let hasUnquoted = false;

  steps.forEach((step) => {
    if (step.minDays == null && step.maxDays == null) {
      if (step.timeline) hasUnquoted = true;
      return;
    }

    minDays += step.minDays ?? 0;
    maxDays += step.maxDays ?? step.minDays ?? 0;
    stepsQuoted += 1;
  });

  return stepsQuoted ? { minDays, maxDays, hasUnquoted, stepsQuoted } : null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Works the timeline backwards from a date the user has to meet.
 *
 * Planned against the **worst case**, not the average. Telling someone they
 * have time on the strength of the optimistic figure is precisely how people
 * miss flights, and this tool exists to prevent that class of mistake.
 *
 * Returns null when there is nothing to plan against — no target, or no step
 * quoted a duration. A planner that renders confidently off no data is worse
 * than an absent one.
 */
const planForDeadline = (timeline, targetDate, journey) => {
  if (!timeline || !targetDate) return null;

  const target = startOfDay(targetDate);
  if (Number.isNaN(target.getTime())) return null;

  /**
   * Plan against the whole chain when there is one.
   *
   * This is the difference between a useful answer and a harmful one. A
   * passport takes six weeks; a passport for someone who does not yet have an
   * Aadhaar takes six weeks *after* a three-month enrolment. Planning against
   * this leg alone would tell that person they have plenty of time, which is
   * precisely the mistake they came here to avoid — and it would be delivered
   * with more confidence than the prose it replaced.
   */
  const includesPrerequisites = Boolean(journey);
  const minDays = includesPrerequisites ? journey.total.minDays : timeline.minDays;
  const maxDays = includesPrerequisites ? journey.total.maxDays : timeline.maxDays;

  const today = startOfDay(new Date());
  const daysAvailable = Math.round((target - today) / MS_PER_DAY);

  const lastSafeStart = new Date(target);
  lastSafeStart.setDate(lastSafeStart.getDate() - maxDays);

  let verdict;
  if (daysAvailable < 0) verdict = "past";
  else if (daysAvailable >= maxDays) verdict = "comfortable";
  else if (daysAvailable >= minDays) verdict = "tight";
  else verdict = "insufficient";

  return {
    targetDate: target,
    daysAvailable,
    daysNeeded: maxDays,
    daysNeededBest: minDays,
    lastSafeStart,
    // Already overdue: they needed to start before today.
    startedLate: lastSafeStart < today,
    verdict,
    // Whether the figures above cover the prerequisites too, so the UI can say
    // "including everything you need first" rather than leave it ambiguous.
    includesPrerequisites,
    /**
     * Something in these totals is free text and isn't counted — a step's
     * duration, or a truncated branch of the chain. Every verdict here is
     * therefore optimistic, and the UI must say so rather than quietly
     * reassure.
     */
    hasUnquoted: timeline.hasUnquoted || Boolean(journey?.partial),
  };
};

/**
 * Resolves document references into full records. Deliberately a lookup at
 * read time rather than embedded copies — one edit to a document propagates
 * to every rule that references it.
 */
const hydrateItems = async (composed, current) => {
  const ids = composed.map((c) => c.documentId);
  const docs = await DocumentModel.find({
    _id: { $in: ids },
    isDeleted: false,
  })
    .populate("obtainedVia.serviceId", "label slug isPublished")
    .lean();

  const byId = new Map(docs.map((d) => [d._id.toString(), d]));

  return composed
    .map((entry) => {
      const doc = byId.get(entry.documentId);
      // A reference to a deleted document is dropped rather than rendered
      // as a blank row. The admin verification queue surfaces these.
      if (!doc) return null;

      /**
       * If this document is itself obtainable through a published service,
       * expose that so the UI can offer "get this one first".
       *
       * Unless it is the errand they are already on. Enrolling a child under
       * five requires a *parent's* Aadhaar, so "Aadhaar card" appears on the
       * Aadhaar-enrolment checklist — and pointing that row at Aadhaar
       * enrolment sent the reader back to the page they were reading, over a
       * button promising to help. The document registry links a document to
       * its issuing service; it has no way to say "somebody else's copy", and
       * this is where that gap surfaces.
       */
      const via = doc.obtainedVia?.serviceId;
      const viaAction = doc.obtainedVia?.action || "new";
      const isSelfReferential =
        via &&
        current &&
        via.slug === current.serviceSlug &&
        viaAction === current.action;

      const obtainedVia =
        via && via.isPublished && !isSelfReferential
          ? {
              serviceSlug: via.slug,
              serviceLabel: via.label,
              action: viaAction,
            }
          : null;

      return {
        documentId: doc._id,
        name: doc.name,
        description: doc.description || "",
        issuingBody: doc.issuingBody || "",
        officialUrl: doc.officialUrl || "",
        hasExpiry: doc.hasExpiry,
        typicalValidity: doc.typicalValidity || "",
        copiesRequired: doc.copiesRequired ?? null,
        attestation: doc.attestation || "none",
        validityWindow: doc.validityWindow || "",
        formatNotes: doc.formatNotes || "",
        obtainedVia,
        mandatory: entry.mandatory,
        belongsTo: entry.belongsTo || "self",
        note: entry.notes.join(" "),
        sourceBlock: entry.sourceBlock,
      };
    })
    .filter(Boolean)
    // Mandatory items first, then alphabetical — stable, predictable order.
    .sort((a, b) => {
      if (a.mandatory !== b.mandatory) return a.mandatory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
};

const findAction = (service, actionKey) =>
  (service.actions || []).find((a) => a.key === actionKey);

/* ------------------------------------------------------------------ *
 * Prerequisite chains
 * ------------------------------------------------------------------ */

/**
 * Three levels. A passport needs an Aadhaar, which needs a birth certificate,
 * which needs a hospital record — past that the tree stops describing an
 * errand anyone is actually going to run and starts being a diagram.
 */
const MAX_PREREQ_DEPTH = 3;

/**
 * Expands the chain of documents that are themselves errands.
 *
 * `obtainedVia` already tells a single missing item where it comes from.
 * Following that link repeatedly is what turns a flat list into the real shape
 * of the job.
 *
 * Three things make this safe to run on the busiest endpoint in the product:
 *
 * - **It resolves a level at a time, not a node at a time.** Every service,
 *   rule and document a whole level needs is fetched in one query each, so
 *   depth costs a fixed handful of round trips instead of one per branch.
 * - **Only base documents are expanded.** A prerequisite's conditional blocks
 *   branch on answers to its own questions, and nobody has answered them.
 *   Guessing would fabricate requirements, so what comes back is the floor and
 *   `hasConditionalDocs` says the real list may be longer.
 * - **Cycles are detected, not survived by luck.** Aadhaar accepts a bank
 *   statement, opening a bank account needs Aadhaar. That loop exists in the
 *   real content and would otherwise recurse until the depth cap hid it.
 */
const expandPrerequisites = async (rootItems, state, rootKey) => {
  const roots = [];
  let frontier = [];

  const nodeFor = (item, depth) => ({
    documentId: item.documentId,
    documentName: item.name,
    serviceSlug: item.obtainedVia.serviceSlug,
    serviceLabel: item.obtainedVia.serviceLabel,
    action: item.obtainedVia.action,
    actionLabel: ACTION_LABELS[item.obtainedVia.action] || item.obtainedVia.action,
    mandatory: item.mandatory !== false,
    depth,
    itemCount: 0,
    cost: null,
    timeline: null,
    hasConditionalDocs: false,
    // No published rule for this service+action in this state. The link is
    // real, the content behind it isn't there yet — say so rather than drop
    // the row and leave a requirement looking self-explanatory.
    unavailable: false,
    // Depth cap reached with more underneath.
    truncated: false,
    // This service already appears higher up the same branch.
    cycle: false,
    prerequisites: [],
  });

  rootItems.forEach((item) => {
    if (!item.obtainedVia) return;
    const node = nodeFor(item, 1);
    roots.push(node);
    frontier.push({
      node,
      /**
       * The checklist being generated is itself on the path, so a chain that
       * loops back to it is caught. Aadhaar enrolment needing a passport that
       * needs an Aadhaar is a real loop, and without the root in here it
       * simply reappears three levels down as though it were progress.
       */
      ancestry: new Set([rootKey, `${node.serviceSlug}:${node.action}`]),
    });
  });

  for (let depth = 1; depth <= MAX_PREREQ_DEPTH && frontier.length; depth += 1) {
    const slugs = [...new Set(frontier.map((f) => f.node.serviceSlug))];

    const services = await GovService.find({
      slug: { $in: slugs },
      isDeleted: false,
      isPublished: true,
    }).lean();
    const serviceBySlug = new Map(services.map((s) => [s.slug, s]));

    const rules = await Rule.find({
      serviceId: { $in: services.map((s) => s._id) },
      isDeleted: false,
      state: { $in: [state, null] },
    }).lean();

    // State override wins over the national default, same as resolveRule.
    const ruleIndex = new Map();
    rules.forEach((r) => {
      const key = `${r.serviceId}:${r.action}`;
      const existing = ruleIndex.get(key);
      if (!existing || (r.state && !existing.state)) ruleIndex.set(key, r);
    });

    const resolved = [];

    frontier.forEach(({ node, ancestry }) => {
      const service = serviceBySlug.get(node.serviceSlug);
      const actionDef = service && findAction(service, node.action);
      const offeredHere =
        service &&
        (service.scope !== "state" ||
          (service.availableStates || []).includes(state));

      if (!service || !actionDef?.isPublished || !offeredHere) {
        node.unavailable = true;
        return;
      }

      const rule = ruleIndex.get(`${service._id}:${node.action}`);
      if (!rule) {
        node.unavailable = true;
        return;
      }

      // Only `state` is known here, so a fee line gated on this service's own
      // questions is correctly dropped rather than guessed at.
      const steps = composeSteps(rule, { state });
      node.itemCount = (rule.baseDocuments || []).length;
      node.cost = summariseCost(steps);
      node.timeline = summariseTimeline(steps);
      node.hasConditionalDocs = Boolean(rule.conditionalBlocks?.length);

      resolved.push({ node, ancestry, rule });
    });

    // The last permitted level still reports whether anything lies beneath it.
    const atCap = depth === MAX_PREREQ_DEPTH;

    const docIds = resolved.flatMap((r) =>
      (r.rule.baseDocuments || []).map((d) => d.documentId)
    );

    if (!docIds.length) break;

    const docs = await DocumentModel.find({
      _id: { $in: docIds },
      isDeleted: false,
    })
      .populate("obtainedVia.serviceId", "label slug isPublished")
      .lean();
    const docById = new Map(docs.map((d) => [d._id.toString(), d]));

    const nextFrontier = [];

    resolved.forEach(({ node, ancestry, rule }) => {
      (rule.baseDocuments || []).forEach((entry) => {
        const doc = docById.get(entry.documentId?.toString());
        const via = doc?.obtainedVia?.serviceId;
        if (!via || !via.isPublished) return;

        const action = doc.obtainedVia.action || "new";
        const key = `${via.slug}:${action}`;

        if (atCap) {
          node.truncated = true;
          return;
        }

        const child = nodeFor(
          {
            documentId: doc._id,
            name: doc.name,
            mandatory: entry.mandatory !== false,
            obtainedVia: {
              serviceSlug: via.slug,
              serviceLabel: via.label,
              action,
            },
          },
          depth + 1
        );

        node.prerequisites.push(child);

        if (ancestry.has(key)) {
          child.cycle = true;
          return;
        }

        nextFrontier.push({ node: child, ancestry: new Set(ancestry).add(key) });
      });
    });

    frontier = nextFrontier;
  }

  return roots;
};

/**
 * Rolls a prerequisite chain up into one figure for money and one for time.
 *
 * These do not aggregate the same way, and treating them alike is the easiest
 * way to produce a confidently wrong number:
 *
 * - **Cost sums.** Every prerequisite on the chain gets paid for, whatever
 *   order they happen in.
 * - **Time does not.** Prerequisites at the same level are independent
 *   errands that can run at the same time, so a level takes as long as its
 *   slowest branch — not the sum of all of them. Summing would tell someone
 *   that a fortnight of parallel paperwork takes two months, and they would
 *   give up on a plan that was actually fine.
 *
 * `partial` marks a roll-up with holes in it — an unquoted fee, a truncated
 * branch, a prerequisite whose own questions could add more. Every total it
 * touches is a floor rather than an answer.
 */
const rollUpChain = (nodes) => {
  const acc = { min: 0, max: 0, minDays: 0, maxDays: 0, partial: false };

  (nodes || []).forEach((node) => {
    const below = rollUpChain(node.prerequisites);

    if (
      node.unavailable ||
      node.truncated ||
      node.cycle ||
      node.hasConditionalDocs ||
      !node.cost ||
      !node.timeline ||
      below.partial
    ) {
      acc.partial = true;
    }

    acc.min += (node.cost?.min ?? 0) + below.min;
    acc.max += (node.cost?.max ?? node.cost?.min ?? 0) + below.max;

    // This branch: its own duration, after everything beneath it is done.
    const branchMin = (node.timeline?.minDays ?? 0) + below.minDays;
    const branchMax = (node.timeline?.maxDays ?? 0) + below.maxDays;

    acc.minDays = Math.max(acc.minDays, branchMin);
    acc.maxDays = Math.max(acc.maxDays, branchMax);
  });

  return acc;
};

/**
 * The whole errand, chain plus this leg, or null when there is no chain.
 *
 * Built per request rather than cached, because which prerequisites are
 * *relevant* depends on what the user says they already hold — and a path
 * telling somebody to go and get the Aadhaar in their pocket is worse than no
 * path at all. Almost every checklist has Aadhaar as a base document, so
 * without this filter the feature would fire on nearly every page and be
 * trained away as noise within a week.
 */
const buildJourney = (prerequisites, cost, timeline) => {
  if (!prerequisites.length) return null;

  const chain = rollUpChain(prerequisites);

  return {
    count: countNodes(prerequisites),
    maxDepth: deepestLevel(prerequisites),
    chain: {
      min: chain.min,
      max: chain.max,
      minDays: chain.minDays,
      maxDays: chain.maxDays,
    },
    // The chain runs first, then this errand — so these add.
    total: {
      min: chain.min + (cost?.min ?? 0),
      max: chain.max + (cost?.max ?? cost?.min ?? 0),
      minDays: chain.minDays + (timeline?.minDays ?? 0),
      maxDays: chain.maxDays + (timeline?.maxDays ?? 0),
      currency: cost?.currency || "INR",
    },
    /**
     * Something on the chain isn't fully quoted, so every figure above is a
     * floor. The UI must present them as "at least", never as the answer.
     */
    partial:
      chain.partial ||
      !cost ||
      !timeline ||
      Boolean(cost.hasUnquoted) ||
      Boolean(timeline.hasUnquoted),
  };
};

const countNodes = (nodes) =>
  (nodes || []).reduce(
    (total, n) => total + 1 + countNodes(n.prerequisites),
    0
  );

const deepestLevel = (nodes) =>
  (nodes || []).reduce(
    (deepest, n) => Math.max(deepest, n.depth, deepestLevel(n.prerequisites)),
    0
  );

/**
 * Applies the parts of the response that belong to *this* request rather than
 * to the cached computation.
 *
 * `alreadyHave` is deliberately not part of the cache key. It only decides how
 * the same list of items is split into "you have this" and "you still need
 * this", and folding it into the key would give every distinct set of held
 * documents its own entry — fragmenting the cache to the point of uselessness
 * for the one input that costs nothing to recompute.
 *
 * `targetDate` is out of the key for the same reason, plus a sharper one: the
 * plan it produces is relative to *today*. Caching it would let a stale entry
 * tell tomorrow's visitor they have a day more than they do.
 */
const withRequestSpecifics = (core, alreadyHave, targetDate) => {
  const have = new Set((alreadyHave || []).map(String));
  const items = core.items;

  // A prerequisite for something they already hold is not a prerequisite.
  const visible = (core.prerequisites || []).filter(
    (node) => !have.has(String(node.documentId))
  );
  const journey = buildJourney(visible, core.cost, core.timeline);

  return {
    ...core,
    stillNeed: items.filter((i) => !have.has(String(i.documentId))),
    alreadyHeld: items.filter((i) => have.has(String(i.documentId))),
    prerequisites: visible,
    journey,
    deadlinePlan: planForDeadline(core.timeline, targetDate, journey),
    // Must be now, not when the entry was cached — this is stamped onto saved
    // checklists and shown on the printout as the date the advice was given.
    generatedAt: new Date(),
  };
};

const computeChecklist = async ({ serviceSlug, action, state, answers }) => {
  const service = await GovService.findOne({
    slug: serviceSlug,
    isDeleted: false,
    isPublished: true,
  }).lean();

  if (!service) {
    return { success: false, statusCode: 404, message: "Service not found" };
  }

  // A state-scoped service must actually be offered where the user is.
  if (service.scope === "state" && !(service.availableStates || []).includes(state)) {
    return {
      success: false,
      statusCode: 404,
      message: `${service.label} is not available in ${stateLabelOf(state)}`,
    };
  }

  const actionDef = findAction(service, action);
  if (!actionDef || !actionDef.isPublished) {
    return {
      success: false,
      statusCode: 404,
      message: "That option is not available for this service yet",
    };
  }

  const answerErrors = validateAnswers(actionDef.questions, answers);
  if (answerErrors.length) {
    return { success: false, statusCode: 400, message: answerErrors.join("; ") };
  }

  const { rule, source } = await resolveRule(service._id, action, state);
  if (!rule) {
    return {
      success: false,
      statusCode: 404,
      message: "No document requirements have been published for this yet",
    };
  }

  // State is injected as an answer so rules can still branch on it — a
  // national rule can carry one Gujarat-specific block without needing a
  // whole separate state rule.
  const fullAnswers = { ...answers, state };

  const composed = composeItems(rule, fullAnswers);
  const items = await hydrateItems(composed, { serviceSlug: service.slug, action });

  const steps = composeSteps(rule, fullAnswers);
  const timeline = summariseTimeline(steps);
  const cost = summariseCost(steps);

  const prerequisites = await expandPrerequisites(
    items,
    state,
    `${service.slug}:${action}`
  );

  return {
    success: true,
    statusCode: 200,
    data: {
      service: {
        _id: service._id,
        label: service.label,
        slug: service.slug,
        authority: service.authority,
        description: service.description,
      },
      action,
      actionLabel: actionDef.label || ACTION_LABELS[action] || action,
      state,
      stateLabel: stateLabelOf(state),
      answers,
      items,
      processSteps: steps,
      // Both null when the content quotes nothing computable, which the UI has
      // to render as silence rather than as a zero.
      cost,
      timeline,
      prerequisites,
      // The full chain is cached; which of it is *shown* depends on what the
      // user already holds, so `journey` is assembled per request below.
      mandatoryCount: items.filter((i) => i.mandatory).length,
      conditionalCount: items.filter((i) => !i.mandatory).length,
      // Tells the UI whether these requirements are state-specific or the
      // national default, which is worth showing.
      ruleScope: source,
      ruleVersion: rule.version,
      verificationStatus: rule.verificationStatus,
      lastVerifiedAt: rule.lastVerifiedAt,
    },
  };
};

/**
 * The cached front door to the engine.
 *
 * Only successes are cached. A 404 means the content is unpublished or missing,
 * and the moment an editor publishes it the answer changes — caching the
 * failure would leave the site telling people a service does not exist for up
 * to an hour after it went live.
 */
const buildChecklist = async ({
  serviceSlug,
  action,
  state,
  answers,
  alreadyHave = [],
  targetDate = null,
}) => {
  const key = checklistCache.buildKey({ serviceSlug, action, state, answers });

  const cached = checklistCache.get(key);
  if (cached) {
    return {
      success: true,
      statusCode: 200,
      data: withRequestSpecifics(cached, alreadyHave, targetDate),
    };
  }

  const result = await computeChecklist({ serviceSlug, action, state, answers });
  if (!result.success) return result;

  checklistCache.set(key, result.data);

  return {
    success: true,
    statusCode: 200,
    data: withRequestSpecifics(result.data, alreadyHave, targetDate),
  };
};

/* ------------------------------------------------------------------ *
 * Public endpoints
 * ------------------------------------------------------------------ */

exports.generateChecklist = serviceHandler(async (payload) => {
  const { error, value } = generateChecklistSchema.validate(payload);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }
  return buildChecklist(value);
});

/**
 * Rule-based intake classifier. A keyword map covers the overwhelming
 * majority of real phrasings; swapping in an LLM later is a change behind
 * this one function, not a change to the flow.
 */
exports.classifyGoal = serviceHandler(async (payload) => {
  const { error, value } = classifySchema.validate(payload);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  const query = value.query.toLowerCase();
  const tokens = new Set(query.split(/\s+/).filter((t) => t.length > 2));

  const filter = { isDeleted: false, isPublished: true };
  if (value.state) {
    filter.$or = [
      { scope: "national" },
      { scope: "state", availableStates: value.state },
    ];
  }

  const services = await GovService.find(filter)
    .select("label slug description authority keywords icon actions scope")
    .lean();

  const scored = services
    .map((service) => {
      let score = 0;

      (service.keywords || []).forEach((keyword) => {
        const k = keyword.toLowerCase();

        if (query.includes(k)) {
          score += 10;
          return;
        }

        // Word-level overlap only — never substring. Substring matching let a
        // generic word like "register" inside "gst registration" score a
        // company-registration query against GST.
        const overlap = k
          .split(/\s+/)
          .filter((word) => word.length > 2 && tokens.has(word)).length;

        score += overlap * 2;
      });

      if (query.includes(service.label.toLowerCase())) score += 15;

      // Guess which action they meant, so we can deep-link past the picker.
      const actionHints = {
        renew: ["renew", "renewal", "reissue", "re-issue", "expired", "expiry"],
        update: ["update", "change", "modify", "edit", "shift", "shifted"],
        correction: ["correct", "correction", "mistake", "wrong", "spelling"],
        replace: ["lost", "stolen", "damaged", "duplicate", "replace", "misplaced"],
        new: ["new", "apply", "first", "fresh", "enrol", "enroll", "get"],
      };

      let guessedAction = null;
      for (const [key, hints] of Object.entries(actionHints)) {
        if (!(service.actions || []).some((a) => a.key === key && a.isPublished)) {
          continue;
        }
        if (hints.some((h) => tokens.has(h) || query.includes(h))) {
          guessedAction = key;
          break;
        }
      }

      return {
        _id: service._id,
        label: service.label,
        slug: service.slug,
        description: service.description,
        authority: service.authority,
        icon: service.icon,
        score,
        guessedAction,
      };
    })
    .filter((s) => s.score >= MIN_MATCH_SCORE)
    .sort((a, b) => b.score - a.score);

  // Confident means: a strong hit that is also clearly ahead of the runner-up.
  // Being the best of several weak matches is not the same as being right.
  const confident =
    scored.length > 0 &&
    scored[0].score >= 10 &&
    (scored.length === 1 || scored[0].score >= scored[1].score * 2);

  return {
    success: true,
    statusCode: 200,
    data: { matches: scored.slice(0, 5), confident },
  };
});

/* ------------------------------------------------------------------ *
 * Saved checklists (authenticated)
 * ------------------------------------------------------------------ */

exports.saveChecklist = serviceHandler(async (userId, payload) => {
  const { error, value } = saveChecklistSchema.validate(payload);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  const generated = await buildChecklist(value);
  if (!generated.success) return generated;

  const {
    service,
    items,
    processSteps,
    cost,
    timeline,
    prerequisites,
    journey,
    ruleVersion,
    actionLabel,
    stateLabel,
  } = generated.data;

  const have = new Set((value.alreadyHave || []).map(String));

  const checklist = new Checklist({
    userId,
    serviceId: service._id,
    serviceSlug: service.slug,
    serviceLabel: service.label,
    action: value.action,
    actionLabel,
    state: value.state,
    stateLabel,
    title: value.title || `${service.label} — ${actionLabel}`,
    answers: value.answers,
    // Frozen at save time — see the note in checklist.model.js.
    generatedItems: items.map((i) => ({
      documentId: i.documentId,
      name: i.name,
      description: i.description,
      issuingBody: i.issuingBody,
      officialUrl: i.officialUrl,
      mandatory: i.mandatory,
      belongsTo: i.belongsTo,
      note: i.note,
      sourceBlock: i.sourceBlock,
      copiesRequired: i.copiesRequired,
      attestation: i.attestation,
      validityWindow: i.validityWindow,
      formatNotes: i.formatNotes,
    })),
    processSteps,
    // Frozen alongside the steps they were computed from, so a printed total
    // always adds up to the lines printed beneath it.
    cost,
    timeline,
    prerequisites,
    journey,
    // Anything they told us they already have starts ticked.
    progress: items.map((i) => ({
      documentId: i.documentId,
      checked: have.has(String(i.documentId)),
      checkedAt: have.has(String(i.documentId)) ? new Date() : null,
    })),
    ruleVersion,
    generatedAt: new Date(),
    shareToken: generateShareToken(),
  });

  await checklist.save();

  return { success: true, statusCode: 201, data: checklist };
});

exports.getMyChecklists = serviceHandler(async (userId, query) => {
  const { pageNumber, limitNumber, skip, search, sortBy, sortOrder } =
    parseListQuery(query);

  const filter = { userId, isDeleted: false };
  if (search) filter.title = { $regex: search, $options: "i" };

  const [totalItems, checklists] = await Promise.all([
    Checklist.countDocuments(filter),
    Checklist.find(filter)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limitNumber)
      .lean(),
  ]);

  const data = checklists.map((c) => {
    const total = c.progress?.length || 0;
    const completed = c.progress?.filter((p) => p.checked).length || 0;
    return {
      ...c,
      stats: {
        total,
        completed,
        percent: total ? Math.round((completed / total) * 100) : 0,
      },
    };
  });

  return {
    success: true,
    statusCode: 200,
    data,
    pagination: buildPagination(totalItems, pageNumber, limitNumber),
  };
});

exports.getChecklistById = serviceHandler(async (userId, checklistId) => {
  if (!isValidObjectId(checklistId)) {
    return { success: false, statusCode: 400, message: "Invalid checklist ID" };
  }

  const checklist = await Checklist.findOne({
    _id: checklistId,
    userId,
    isDeleted: false,
  }).lean();

  if (!checklist) {
    return { success: false, statusCode: 404, message: "Checklist not found" };
  }

  return { success: true, statusCode: 200, data: checklist };
});

exports.getSharedChecklist = serviceHandler(async (shareToken) => {
  const checklist = await Checklist.findOne({
    shareToken,
    isDeleted: false,
  })
    .select("-userId -progress")
    .lean();

  if (!checklist) {
    return { success: false, statusCode: 404, message: "Checklist not found" };
  }

  return { success: true, statusCode: 200, data: checklist };
});

exports.updateProgress = serviceHandler(async (userId, checklistId, payload) => {
  if (!isValidObjectId(checklistId)) {
    return { success: false, statusCode: 400, message: "Invalid checklist ID" };
  }

  const { error, value } = updateProgressSchema.validate(payload);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  const checklist = await Checklist.findOne({
    _id: checklistId,
    userId,
    isDeleted: false,
  });

  if (!checklist) {
    return { success: false, statusCode: 404, message: "Checklist not found" };
  }

  const entry = checklist.progress.find(
    (p) => p.documentId?.toString() === value.documentId
  );

  if (!entry) {
    return {
      success: false,
      statusCode: 404,
      message: "That document is not part of this checklist",
    };
  }

  entry.checked = value.checked;
  entry.checkedAt = value.checked ? new Date() : null;

  const allDone = checklist.progress.every((p) => p.checked);
  checklist.status = allDone ? "completed" : "active";

  await checklist.save();

  return { success: true, statusCode: 200, data: checklist };
});

exports.deleteChecklist = serviceHandler(async (userId, checklistId) => {
  if (!isValidObjectId(checklistId)) {
    return { success: false, statusCode: 400, message: "Invalid checklist ID" };
  }

  const deleted = await Checklist.findOneAndUpdate(
    { _id: checklistId, userId, isDeleted: false },
    { isDeleted: true },
    { new: true }
  );

  if (!deleted) {
    return { success: false, statusCode: 404, message: "Checklist not found" };
  }

  return { success: true, statusCode: 200, message: "Checklist deleted" };
});

// Exported for direct unit testing of the engine without a database, and
// reused by documentReadiness.service.js — a scholarship's missing documents
// are costed against the very same rules that produce a checklist, so the two
// can never quote different lead times for the same errand.
exports._internals = {
  evaluateCondition,
  blockMatches,
  validateAnswers,
  composeItems,
  composeSteps,
  summariseTimeline,
  summariseCost,
  resolveRule,
  buildChecklist,
};
