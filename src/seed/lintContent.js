/**
 * Offline lint for the seed set and every content pack.
 *
 *   npm run content:lint
 *
 * Touches no database. It runs the same Joi schemas the bulk importer uses,
 * then resolves every cross-reference across the whole catalogue at once —
 * which the importer cannot do, because it handles one type per call.
 *
 * Worth having as a command rather than a habit: a content pack is authored by
 * hand, and the failure mode is not a crash but a service that quietly
 * generates an empty checklist, or a requirement that silently vanishes.
 */
const {
  importDocumentSchema,
  importServiceSchema,
  importRuleSchema,
} = require("../validations/import.validation");
const { ACTION_KEYS } = require("../utils/constants");
const seedData = require("./seedData");
const { loadContentPacks } = require("./contentPacks");

const lintContent = () => {
  const packs = loadContentPacks();

  const documents = [...seedData.documents, ...packs.documents];
  const services = [...seedData.services, ...packs.services];
  const rules = [...seedData.rules, ...packs.rules];

  const errors = [];
  const warnings = [];

  /* ------------------------------ shapes ------------------------------ */

  const validate = (label, schema, rows, id) =>
    rows.forEach((row) => {
      const { error } = schema.validate(row);
      if (error) errors.push(`${label} "${id(row)}": ${error.message}`);
    });

  validate("document", importDocumentSchema, documents, (d) => d.slug || d.name);
  validate("service", importServiceSchema, services, (s) => s.slug || s.label);
  validate("rule", importRuleSchema, rules, (r) => `${r.serviceSlug}/${r.action}`);

  /* --------------------------- unique slugs --------------------------- */

  const seenDoc = new Set();
  documents.forEach((d) => {
    if (seenDoc.has(d.slug)) errors.push(`duplicate document slug "${d.slug}"`);
    seenDoc.add(d.slug);
  });

  const serviceBySlug = new Map();
  services.forEach((s) => {
    if (serviceBySlug.has(s.slug)) errors.push(`duplicate service slug "${s.slug}"`);
    serviceBySlug.set(s.slug, s);
  });

  const seenRule = new Set();
  rules.forEach((r) => {
    const key = `${r.serviceSlug}/${r.action}@${r.state || "national"}`;
    if (seenRule.has(key)) errors.push(`duplicate rule "${key}"`);
    seenRule.add(key);
  });

  /* -------------------------- cross-references ------------------------ */

  documents.forEach((d) => {
    if (!d.obtainedViaSlug) return;
    const service = serviceBySlug.get(d.obtainedViaSlug);
    if (!service) {
      errors.push(`document "${d.slug}" is obtained via unknown service "${d.obtainedViaSlug}"`);
      return;
    }
    const action = d.obtainedViaAction || "new";
    if (!(service.actions || []).some((a) => a.key === action)) {
      errors.push(`document "${d.slug}" points at "${d.obtainedViaSlug}/${action}", which has no such action`);
    }
  });

  services.forEach((s) =>
    (s.actions || []).forEach((a) => {
      if (!ACTION_KEYS.includes(a.key)) {
        errors.push(`service "${s.slug}" has unknown action key "${a.key}"`);
      }
    })
  );

  rules.forEach((rule) => {
    const label = `${rule.serviceSlug}/${rule.action}`;
    const service = serviceBySlug.get(rule.serviceSlug);

    if (!service) {
      errors.push(`rule "${label}" references unknown service "${rule.serviceSlug}"`);
      return;
    }

    const action = (service.actions || []).find((a) => a.key === rule.action);
    if (!action) {
      errors.push(`rule "${label}": that service has no "${rule.action}" action`);
      return;
    }

    const entries = [
      ...(rule.baseDocuments || []).map((d) => ({ ...d, where: "base" })),
      ...(rule.conditionalBlocks || []).flatMap((b) =>
        (b.documents || []).map((d) => ({ ...d, where: b.label || "a block" }))
      ),
    ];

    entries.forEach((entry) => {
      if (!seenDoc.has(entry.slug)) {
        errors.push(`rule "${label}" references unknown document "${entry.slug}"`);
      }
    });

    /**
     * The one that actually bites.
     *
     * The engine unions requirements by document id and ownership is
     * first-writer-wins, so the same document listed once for the applicant
     * and once for someone else collapses into a single row and the second
     * ownership is silently lost. Listing it twice with the *same* owner is
     * fine and common — a document required by both a base list and a matched
     * block is one requirement.
     */
    const owners = new Map();
    entries.forEach((entry) => {
      const owner = entry.belongsTo || "self";
      if (!owners.has(entry.slug)) owners.set(entry.slug, new Map());
      owners.get(entry.slug).set(owner, entry.where);
    });

    owners.forEach((byOwner, slug) => {
      if (byOwner.size > 1) {
        errors.push(
          `rule "${label}": "${slug}" is required for ${[...byOwner.keys()].join(" and ")} ` +
            `(${[...byOwner.values()].join(", ")}) — these union into one row and one owner is lost. ` +
            `Use a distinct document for the other party.`
        );
      }
    });

    // Every questionKey a rule branches on — in a block, a step or a fee line.
    const known = new Set([...(action.questions || []).map((q) => q.key), "state"]);
    const used = new Set();

    (rule.conditionalBlocks || []).forEach((b) =>
      (b.conditions || []).forEach((c) => used.add(c.questionKey))
    );
    (rule.processSteps || []).forEach((step) => {
      (step.conditions || []).forEach((c) => used.add(c.questionKey));
      (step.fees || []).forEach((f) =>
        (f.conditions || []).forEach((c) => used.add(c.questionKey))
      );
    });

    [...used]
      .filter((k) => !known.has(k))
      .forEach((k) => errors.push(`rule "${label}" branches on unknown question key "${k}"`));
  });

  /* ------------------------------ warnings ---------------------------- */

  // A published action with no rule generates nothing — the checklist 404s.
  services.forEach((s) =>
    (s.actions || []).forEach((a) => {
      const has = rules.some((r) => r.serviceSlug === s.slug && r.action === a.key);
      if (!has) warnings.push(`"${s.slug}/${a.key}" has no rule — it cannot generate a checklist`);
    })
  );

  const referenced = new Set(
    rules.flatMap((r) => [
      ...(r.baseDocuments || []).map((d) => d.slug),
      ...(r.conditionalBlocks || []).flatMap((b) => (b.documents || []).map((d) => d.slug)),
    ])
  );
  documents.forEach((d) => {
    if (!referenced.has(d.slug)) warnings.push(`document "${d.slug}" is not used by any rule`);
  });

  return {
    errors,
    warnings,
    counts: {
      documents: documents.length,
      services: services.length,
      rules: rules.length,
      actions: services.reduce((n, s) => n + (s.actions || []).length, 0),
    },
  };
};

module.exports = { lintContent };

/* Run directly: node src/seed/lintContent.js */
if (require.main === module) {
  const { errors, warnings, counts } = lintContent();

  warnings.forEach((w) => console.log(`WARN  ${w}`));
  errors.forEach((e) => console.log(`ERROR ${e}`));

  console.log(
    `\n${counts.documents} documents · ${counts.services} services · ` +
      `${counts.actions} actions · ${counts.rules} rules`
  );
  console.log(
    errors.length
      ? `\n${errors.length} error(s), ${warnings.length} warning(s)`
      : `\ncontent is consistent (${warnings.length} warning(s))`
  );

  process.exit(errors.length ? 1 : 0);
}
