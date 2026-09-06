const { isValidObjectId } = require("mongoose");
const GovService = require("../models/govService.model");
const Rule = require("../models/rule.model");
const { serviceHandler } = require("../utils/asyncHandler");
const checklistCache = require("../utils/checklistCache");
const {
  createServiceSchema,
  updateServiceSchema,
} = require("../validations/govService.validation");
const { slugify, parseListQuery, buildPagination } = require("../utils/common");
const { ACTION_LABELS } = require("../utils/constants");
const { STATES, isValidState } = require("../utils/states");

const assertUniqueKeys = (service) => {
  const actionKeys = (service.actions || []).map((a) => a.key);
  const dupeActions = actionKeys.filter((k, i) => actionKeys.indexOf(k) !== i);
  if (dupeActions.length) {
    return `Duplicate action(s): ${[...new Set(dupeActions)].join(", ")}`;
  }

  for (const action of service.actions || []) {
    const keys = (action.questions || []).map((q) => q.key);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dupes.length) {
      return `Duplicate question keys in "${action.key}": ${[...new Set(dupes)].join(", ")}`;
    }
  }
  return null;
};

/* ---------------- public ---------------- */

/**
 * Everything on offer where the user actually lives: national services plus
 * the ones scoped to their state. An action only counts as offered if it is
 * published AND has a rule that resolves for this state — otherwise the user
 * clicks through to a dead end.
 */
exports.getServicesForState = serviceHandler(async (state) => {
  if (!isValidState(state)) {
    return { success: false, statusCode: 400, message: "Choose a valid state first" };
  }

  const services = await GovService.find({
    isDeleted: false,
    isPublished: true,
    $or: [
      { scope: "national" },
      { scope: "state", availableStates: state },
    ],
  })
    .sort({ order: 1, label: 1 })
    .lean();

  const serviceIds = services.map((s) => s._id);

  // One query for every relevant rule, then match in memory — far cheaper
  // than a lookup per service/action pair.
  const rules = await Rule.find({
    serviceId: { $in: serviceIds },
    isDeleted: false,
    $or: [{ state }, { state: null }],
  })
    .select("serviceId action state verificationStatus lastVerifiedAt")
    .lean();

  const ruleKey = (serviceId, action) => `${serviceId}:${action}`;
  const available = new Map();
  rules.forEach((r) => {
    const key = ruleKey(r.serviceId, r.action);
    // A state-specific rule beats the national default.
    if (!available.has(key) || r.state === state) available.set(key, r);
  });

  const data = services
    .map((service) => {
      const actions = (service.actions || [])
        .filter((a) => a.isPublished && available.has(ruleKey(service._id, a.key)))
        .sort((a, b) => a.order - b.order)
        .map((a) => {
          const rule = available.get(ruleKey(service._id, a.key));
          return {
            key: a.key,
            label: a.label || ACTION_LABELS[a.key] || a.key,
            description: a.description || "",
            questionCount: (a.questions || []).length,
            verificationStatus: rule?.verificationStatus,
            lastVerifiedAt: rule?.lastVerifiedAt,
          };
        });

      return {
        _id: service._id,
        label: service.label,
        slug: service.slug,
        description: service.description,
        authority: service.authority,
        icon: service.icon,
        scope: service.scope,
        actions,
      };
    })
    // Hide services with nothing usable behind them.
    .filter((s) => s.actions.length > 0);

  return { success: true, statusCode: 200, data };
});

exports.getServiceBySlug = serviceHandler(async (slug, state) => {
  if (!isValidState(state)) {
    return { success: false, statusCode: 400, message: "Choose a valid state first" };
  }

  const service = await GovService.findOne({
    slug,
    isDeleted: false,
    isPublished: true,
  }).lean();

  if (!service) {
    return { success: false, statusCode: 404, message: "Service not found" };
  }

  if (service.scope === "state" && !(service.availableStates || []).includes(state)) {
    const label = STATES.find((s) => s.value === state)?.label || state;
    return {
      success: false,
      statusCode: 404,
      message: `${service.label} is not available in ${label}`,
    };
  }

  const rules = await Rule.find({
    serviceId: service._id,
    isDeleted: false,
    $or: [{ state }, { state: null }],
  })
    .select("action state verificationStatus lastVerifiedAt processSteps")
    .lean();

  const byAction = new Map();
  rules.forEach((r) => {
    if (!byAction.has(r.action) || r.state === state) byAction.set(r.action, r);
  });

  service.actions = (service.actions || [])
    .filter((a) => a.isPublished && byAction.has(a.key))
    .sort((a, b) => a.order - b.order)
    .map((a) => {
      const rule = byAction.get(a.key);
      return {
        ...a,
        label: a.label || ACTION_LABELS[a.key] || a.key,
        questions: (a.questions || []).sort((x, y) => x.order - y.order),
        verificationStatus: rule?.verificationStatus,
        lastVerifiedAt: rule?.lastVerifiedAt,
        stepCount: (rule?.processSteps || []).length,
      };
    });

  if (!service.actions.length) {
    return {
      success: false,
      statusCode: 404,
      message: "Nothing has been published for this service yet",
    };
  }

  return { success: true, statusCode: 200, data: service };
});

/* ---------------- admin ---------------- */

exports.createService = serviceHandler(async (data) => {
  const { error, value } = createServiceSchema.validate(data);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  const keyError = assertUniqueKeys(value);
  if (keyError) return { success: false, statusCode: 400, message: keyError };

  const slug = value.slug || slugify(value.label);

  const existing = await GovService.findOne({ slug, isDeleted: false });
  if (existing) {
    return {
      success: false,
      statusCode: 409,
      message: "A service with this slug already exists",
    };
  }

  const service = new GovService({ ...value, slug });
  await service.save();

  return { success: true, statusCode: 201, data: service };
});

exports.getAllServices = serviceHandler(async (query) => {
  const { pageNumber, limitNumber, skip, search, sortBy, sortOrder } =
    parseListQuery(query);

  const filter = { isDeleted: false };
  if (search) filter.label = { $regex: search, $options: "i" };

  const [totalItems, services] = await Promise.all([
    GovService.countDocuments(filter),
    GovService.find(filter)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limitNumber)
      .lean(),
  ]);

  const ids = services.map((s) => s._id);
  const rules = await Rule.find({ serviceId: { $in: ids }, isDeleted: false })
    .select("serviceId action state verificationStatus version")
    .lean();

  const data = services.map((service) => {
    const own = rules.filter((r) => String(r.serviceId) === String(service._id));
    return {
      ...service,
      actionCount: (service.actions || []).length,
      publishedActionCount: (service.actions || []).filter((a) => a.isPublished).length,
      ruleCount: own.length,
      unverifiedRuleCount: own.filter(
        (r) => r.verificationStatus !== "verified"
      ).length,
    };
  });

  return {
    success: true,
    statusCode: 200,
    data,
    pagination: buildPagination(totalItems, pageNumber, limitNumber),
  };
});

exports.getServiceById = serviceHandler(async (serviceId) => {
  if (!isValidObjectId(serviceId)) {
    return { success: false, statusCode: 400, message: "Invalid service ID" };
  }

  const service = await GovService.findOne({
    _id: serviceId,
    isDeleted: false,
  }).lean();

  if (!service) {
    return { success: false, statusCode: 404, message: "Service not found" };
  }

  const rules = await Rule.find({ serviceId, isDeleted: false })
    .select("action state version verificationStatus lastVerifiedAt")
    .lean();

  return { success: true, statusCode: 200, data: { ...service, rules } };
});

exports.updateService = serviceHandler(async (serviceId, data) => {
  if (!isValidObjectId(serviceId)) {
    return { success: false, statusCode: 400, message: "Invalid service ID" };
  }

  const { error, value } = updateServiceSchema.validate(data);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  const service = await GovService.findOne({ _id: serviceId, isDeleted: false });
  if (!service) {
    return { success: false, statusCode: 404, message: "Service not found" };
  }

  if (value.actions) {
    const keyError = assertUniqueKeys(value);
    if (keyError) return { success: false, statusCode: 400, message: keyError };
  }

  if (value.slug && value.slug !== service.slug) {
    const clash = await GovService.findOne({
      slug: value.slug,
      isDeleted: false,
      _id: { $ne: serviceId },
    });
    if (clash) {
      return {
        success: false,
        statusCode: 409,
        message: "A service with this slug already exists",
      };
    }
  }

  // Removing an action or a question that a rule still depends on would leave
  // that rule permanently unreachable or its conditions unsatisfiable.
  if (value.actions) {
    const rules = await Rule.find({ serviceId, isDeleted: false })
      .select("action conditionalBlocks")
      .lean();

    const newActionKeys = value.actions.map((a) => a.key);
    const orphanedActions = [
      ...new Set(rules.map((r) => r.action).filter((a) => !newActionKeys.includes(a))),
    ];
    if (orphanedActions.length) {
      return {
        success: false,
        statusCode: 409,
        message: `Cannot remove action(s) that still have rules: ${orphanedActions.join(", ")}`,
      };
    }

    for (const action of value.actions) {
      const rule = rules.find((r) => r.action === action.key);
      if (!rule) continue;

      const known = new Set((action.questions || []).map((q) => q.key));
      // `state` is always available to conditions, injected by the engine.
      known.add("state");

      const used = new Set();
      (rule.conditionalBlocks || []).forEach((b) =>
        (b.conditions || []).forEach((c) => used.add(c.questionKey))
      );
      const orphaned = [...used].filter((k) => !known.has(k));
      if (orphaned.length) {
        return {
          success: false,
          statusCode: 409,
          message: `Cannot remove question(s) still used by "${action.key}" rules: ${orphaned.join(", ")}`,
        };
      }
    }
  }

  const updated = await GovService.findByIdAndUpdate(serviceId, value, { new: true });

  /**
   * Publishing state, labels, action labels and availableStates all show up in
   * a generated checklist, or decide whether one can be generated at all — and
   * they appear in *other* services' checklists too, as nodes on a
   * prerequisite chain. Unpublishing Aadhaar has to stop the passport
   * checklist offering it as a next step, so this clears everything rather
   * than this service's own entries.
   */
  checklistCache.invalidateAll(`service updated: ${service.slug}`);

  return { success: true, statusCode: 200, data: updated };
});

exports.deleteService = serviceHandler(async (serviceId) => {
  if (!isValidObjectId(serviceId)) {
    return { success: false, statusCode: 400, message: "Invalid service ID" };
  }

  const service = await GovService.findOne({ _id: serviceId, isDeleted: false });
  if (!service) {
    return { success: false, statusCode: 404, message: "Service not found" };
  }

  await GovService.findByIdAndUpdate(serviceId, { isDeleted: true });
  await Rule.updateMany({ serviceId }, { isDeleted: true });

  checklistCache.invalidateAll(`service deleted: ${service.slug}`);

  return { success: true, statusCode: 200, message: "Service deleted" };
});
