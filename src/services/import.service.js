const DocumentModel = require("../models/document.model");
const GovService = require("../models/govService.model");
const Rule = require("../models/rule.model");
const { serviceHandler } = require("../utils/asyncHandler");
const { slugify } = require("../utils/common");
const { createDocument, updateDocument } = require("./document.service");
const { createService, updateService } = require("./govService.service");
const { upsertRule, integrityChecks } = require("./rule.service");
const {
  importDocumentSchema,
  importServiceSchema,
  importRuleSchema,
  runImportSchema,
} = require("../validations/import.validation");

/**
 * Bulk content import.
 *
 * Content is the bottleneck in this product, not code. Every service, action,
 * question and rule is authored one at a time through the admin forms, and
 * growing the catalogue past its current eight services through that UI is
 * weeks of clicking.
 *
 * Three decisions shape everything below.
 *
 * **1. The import format is the seed format.** A row here has the same shape
 * as an entry in `seed/seedData.js` — references by slug, not ObjectId. That
 * gives content authors one format to learn instead of two, lets a file
 * written for import also seed a fresh environment, and means references stay
 * legible to a human reviewing a diff. Nobody can eyeball `507f1f77…`.
 *
 * A row is the **desired state of that record**, not a patch. Importing a
 * document with only its name and URL resets everything else to the schema
 * default — the same semantics the seeder has. Partial-update semantics read
 * well in a form and terribly in a spreadsheet, where "blank" could equally
 * mean "unchanged" or "clear it" and only one of those can be right.
 *
 * **2. Nothing is written until everything validates.** A half-imported
 * catalogue is worse than a rejected file: it leaves the database in a state
 * nobody designed, mixing new rows with old ones and no record of where it
 * stopped. So the analysis pass resolves every reference and runs every check
 * first, collecting *all* problems rather than stopping at the first.
 *
 * **3. Writes go through the existing single-record services.** `upsertRule`
 * bumps the version, writes a changelog entry, resets verification, flags
 * affected saved checklists and emails their owners. An importer that wrote
 * to the model directly would silently skip all of that — and the bug would
 * look like "some rule edits don't notify people", which is close to
 * unfindable. Slower per row, correct by construction.
 */

const TYPES = ["documents", "services", "rules"];

exports.IMPORT_TYPES = TYPES;

/* ------------------------------------------------------------------ *
 * Analysis — resolve references, run every check, write nothing
 * ------------------------------------------------------------------ */

const rowLabel = (type, row, index) => {
  if (type === "rules") {
    const state = row?.state ? `@${row.state}` : "";
    return row?.serviceSlug
      ? `${row.serviceSlug}/${row.action || "?"}${state}`
      : `row ${index + 1}`;
  }
  return row?.slug || row?.name || row?.label || `row ${index + 1}`;
};

/**
 * Loads the slug→id maps the whole file needs, in two queries rather than one
 * per row. A 300-row import otherwise turns into 300 round trips before it has
 * validated anything.
 */
const loadLookups = async () => {
  const [documents, services] = await Promise.all([
    DocumentModel.find({ isDeleted: false }).select("_id slug").lean(),
    GovService.find({ isDeleted: false })
      .select("_id slug actions scope availableStates")
      .lean(),
  ]);

  return {
    documentIdBySlug: new Map(documents.map((d) => [d.slug, String(d._id)])),
    serviceBySlug: new Map(services.map((s) => [s.slug, s])),
  };
};

/**
 * Turns `{ slug, mandatory, belongsTo, note }` into the `{ documentId, … }`
 * the rule schema wants, reporting every slug it could not resolve rather
 * than the first.
 */
const resolveDocumentRefs = (entries, lookups, where, errors) =>
  (entries || []).map((entry) => {
    const documentId = lookups.documentIdBySlug.get(entry.slug);
    if (!documentId) {
      errors.push(`${where}: unknown document slug "${entry.slug}"`);
    }
    return {
      documentId: documentId || null,
      mandatory: entry.mandatory !== false,
      belongsTo: entry.belongsTo || "self",
      note: entry.note || "",
    };
  });

const analyseDocuments = (rows, lookups, errors) =>
  rows.map((row, index) => {
    const label = rowLabel("documents", row, index);
    const { error, value } = importDocumentSchema.validate(row);

    if (error) {
      errors.push(`${label}: ${error.message}`);
      return { label, op: "error" };
    }

    const slug = value.slug || slugify(value.name);

    /**
     * A document may point at the service that issues it. The service has to
     * exist already — importing documents and services together in one file
     * is not supported, and pretending otherwise would mean guessing an order.
     */
    let obtainedVia;
    if (value.obtainedViaSlug) {
      const service = lookups.serviceBySlug.get(value.obtainedViaSlug);
      if (!service) {
        errors.push(
          `${label}: obtainedViaSlug "${value.obtainedViaSlug}" is not a known service — import services first`
        );
      } else if (
        !(service.actions || []).some(
          (a) => a.key === (value.obtainedViaAction || "new")
        )
      ) {
        errors.push(
          `${label}: "${value.obtainedViaSlug}" has no "${value.obtainedViaAction || "new"}" action`
        );
      } else {
        obtainedVia = {
          serviceId: String(service._id),
          action: value.obtainedViaAction || "new",
        };
      }
    }

    const { obtainedViaSlug, obtainedViaAction, ...fields } = value;

    return {
      label,
      slug,
      op: lookups.documentIdBySlug.has(slug) ? "update" : "create",
      existingId: lookups.documentIdBySlug.get(slug) || null,
      payload: { ...fields, slug, ...(obtainedVia ? { obtainedVia } : {}) },
    };
  });

const analyseServices = (rows, lookups, errors) =>
  rows.map((row, index) => {
    const label = rowLabel("services", row, index);
    const { error, value } = importServiceSchema.validate(row);

    if (error) {
      errors.push(`${label}: ${error.message}`);
      return { label, op: "error" };
    }

    const slug = value.slug || slugify(value.label);
    const existing = lookups.serviceBySlug.get(slug);

    // A state-scoped service that lists no states is invisible everywhere,
    // which is almost always a mistake rather than an intention.
    if (value.scope === "state" && !(value.availableStates || []).length) {
      errors.push(
        `${label}: scope is "state" but availableStates is empty — it would appear nowhere`
      );
    }

    const keys = (value.actions || []).map((a) => a.key);
    const duplicated = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (duplicated.length) {
      errors.push(`${label}: duplicate action key(s): ${[...new Set(duplicated)].join(", ")}`);
    }

    /**
     * Dropping an action a rule still depends on would orphan that rule. The
     * single-record editor already refuses this; the importer has to check it
     * here because it must report the problem before writing anything.
     */
    if (existing) {
      const removed = (existing.actions || [])
        .map((a) => a.key)
        .filter((k) => !keys.includes(k));
      if (removed.length) {
        errors.push(
          `${label}: this file removes action(s) ${removed.join(", ")} — delete their rules first`
        );
      }
    }

    return {
      label,
      slug,
      op: existing ? "update" : "create",
      existingId: existing ? String(existing._id) : null,
      payload: { ...value, slug },
    };
  });

const analyseRules = async (rows, lookups, errors) => {
  const plans = [];

  for (const [index, row] of rows.entries()) {
    const label = rowLabel("rules", row, index);
    const { error, value } = importRuleSchema.validate(row);

    if (error) {
      errors.push(`${label}: ${error.message}`);
      plans.push({ label, op: "error" });
      continue;
    }

    const service = lookups.serviceBySlug.get(value.serviceSlug);
    if (!service) {
      errors.push(`${label}: unknown service slug "${value.serviceSlug}"`);
      plans.push({ label, op: "error" });
      continue;
    }

    const action = (service.actions || []).find((a) => a.key === value.action);
    if (!action) {
      errors.push(`${label}: "${value.serviceSlug}" has no "${value.action}" action`);
      plans.push({ label, op: "error" });
      continue;
    }

    if (
      value.state &&
      service.scope === "state" &&
      !(service.availableStates || []).includes(value.state)
    ) {
      errors.push(`${label}: "${value.serviceSlug}" is not offered in ${value.state}`);
    }

    const payload = {
      serviceId: String(service._id),
      action: value.action,
      state: value.state ?? null,
      baseDocuments: resolveDocumentRefs(
        value.baseDocuments,
        lookups,
        `${label} baseDocuments`,
        errors
      ),
      conditionalBlocks: (value.conditionalBlocks || []).map((block) => ({
        label: block.label || "",
        matchType: block.matchType || "all",
        conditions: block.conditions || [],
        documents: resolveDocumentRefs(
          block.documents,
          lookups,
          `${label} "${block.label || "block"}"`,
          errors
        ),
      })),
      processSteps: value.processSteps || [],
      summary: value.summary || "Bulk import",
    };

    // The same check the single-record editor runs, from the same function.
    const unknownKeys = integrityChecks.findUnknownQuestionKeys(payload, action);
    if (unknownKeys.length) {
      errors.push(
        `${label}: branches on question key(s) "${unknownKeys.join(", ")}" that this action does not have`
      );
    }

    const existing = await Rule.findOne({
      serviceId: service._id,
      action: value.action,
      state: value.state ?? null,
      isDeleted: false,
    })
      .select("_id verificationStatus")
      .lean();

    /**
     * Content a human has verified is never silently replaced. The same stance
     * the seeder takes: an import is bulk and unreviewed by definition, and
     * overwriting a checked rule with it throws away the most expensive work
     * in the product. Reported as skipped, not as an error — the rest of the
     * file is still fine.
     */
    if (existing && existing.verificationStatus === "verified") {
      plans.push({
        label,
        op: "skip",
        reason: "already verified by a human — edit it directly instead",
      });
      continue;
    }

    plans.push({
      label,
      op: existing ? "update" : "create",
      existingId: existing ? String(existing._id) : null,
      payload,
    });
  }

  return plans;
};

/**
 * Duplicate identities inside one file. Mongo would apply these in order and
 * keep the last, silently discarding the earlier rows — so the second entry
 * for a slug looks like it imported when it was overwritten.
 */
const findDuplicates = (plans, errors) => {
  const seen = new Set();
  plans.forEach((plan) => {
    if (plan.op === "error") return;
    if (seen.has(plan.label)) {
      errors.push(`"${plan.label}" appears more than once in this file`);
    }
    seen.add(plan.label);
  });
};

/* ------------------------------------------------------------------ *
 * The endpoint
 * ------------------------------------------------------------------ */

exports.runImport = serviceHandler(async (payload, actorId) => {
  const { error, value } = runImportSchema.validate(payload);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  const { type, rows, dryRun } = value;
  const errors = [];
  const lookups = await loadLookups();

  let plans;
  if (type === "documents") plans = analyseDocuments(rows, lookups, errors);
  else if (type === "services") plans = analyseServices(rows, lookups, errors);
  else plans = await analyseRules(rows, lookups, errors);

  findDuplicates(plans, errors);

  const summary = {
    type,
    total: rows.length,
    created: plans.filter((p) => p.op === "create").length,
    updated: plans.filter((p) => p.op === "update").length,
    skipped: plans.filter((p) => p.op === "skip").length,
    // What each row would do, so a dry run is reviewable rather than a verdict.
    plan: plans.map(({ label, op, reason }) => ({ label, op, reason })),
    errors,
  };

  if (errors.length) {
    return {
      success: false,
      statusCode: 400,
      message: `${errors.length} problem(s) found — nothing was imported`,
      data: { ...summary, dryRun: true, applied: false },
    };
  }

  if (dryRun) {
    return {
      success: true,
      statusCode: 200,
      message: "Looks good. Nothing written yet.",
      data: { ...summary, dryRun: true, applied: false },
    };
  }

  /**
   * Writes go one row at a time through the ordinary service functions, so
   * every side effect the single-record path has — changelog, version bump,
   * checklist flagging, notifications, cache invalidation — happens here too.
   *
   * Everything checkable was checked above, so a failure now is something
   * unforeseen. It stops rather than continuing, and the response names every
   * row that did land, because the one thing worse than a failed import is not
   * knowing where it got to.
   */
  const written = [];

  for (const plan of plans) {
    if (plan.op === "skip") continue;

    let result;
    if (type === "documents") {
      result =
        plan.op === "update"
          ? await updateDocument(plan.existingId, plan.payload)
          : await createDocument(plan.payload);
    } else if (type === "services") {
      result =
        plan.op === "update"
          ? await updateService(plan.existingId, plan.payload)
          : await createService(plan.payload);
    } else {
      result = await upsertRule(plan.payload, actorId);
    }

    if (!result.success) {
      return {
        success: false,
        statusCode: 500,
        message: `Import stopped at "${plan.label}": ${result.message}`,
        data: {
          ...summary,
          dryRun: false,
          applied: true,
          written,
          failedAt: plan.label,
        },
      };
    }

    written.push(plan.label);
  }

  return {
    success: true,
    statusCode: 200,
    message: `Imported ${written.length} ${type}${summary.skipped ? `, skipped ${summary.skipped}` : ""}`,
    data: { ...summary, dryRun: false, applied: true, written },
  };
});
