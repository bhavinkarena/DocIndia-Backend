const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

const log = logger.child({ component: "contentPacks" });

const PACK_DIR = path.join(__dirname, "..", "..", "content");

/**
 * Content packs — the catalogue beyond the bootstrap set.
 *
 * `seedData.js` was already 1,300 lines at eight services, and the plan is to
 * reach forty. Rather than growing one unreviewable file, each category lives
 * in its own JSON pack under `content/`.
 *
 * **A pack is exactly the bulk-import format.** Same slug references, same
 * shape, same validation. That means one file can either seed a fresh
 * environment or be imported into a running one through `/admin/import`, and
 * there is no second format for content authors to learn or for the two paths
 * to drift between.
 *
 * Load order matters and is alphabetical by filename, which is why packs are
 * numbered. A rule can only reference a document the same run has already
 * defined, and a document's `obtainedViaSlug` can only point at a service that
 * exists — the seeder resolves documents, then services, then rules, so
 * within a run the ordering that matters is between packs, not inside one.
 *
 * Scholarships live in packs too, and reference documents by the same slugs.
 * They load after everything else for the same reason rules do: a scholarship
 * can only require a document the run has already created.
 */
const loadContentPacks = () => {
  const empty = { documents: [], services: [], rules: [], scholarships: [] };

  if (!fs.existsSync(PACK_DIR)) return empty;

  const files = fs
    .readdirSync(PACK_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (!files.length) return empty;

  const merged = { documents: [], services: [], rules: [], scholarships: [] };

  files.forEach((file) => {
    const full = path.join(PACK_DIR, file);
    let pack;

    try {
      pack = JSON.parse(fs.readFileSync(full, "utf8"));
    } catch (error) {
      // Loud and fatal. A pack that silently fails to parse means a seeded
      // environment quietly missing a whole category of content, which is far
      // harder to notice than a failed seed.
      throw new Error(`Content pack "${file}" is not valid JSON: ${error.message}`);
    }

    ["documents", "services", "rules", "scholarships"].forEach((key) => {
      if (pack[key] && !Array.isArray(pack[key])) {
        throw new Error(`Content pack "${file}": "${key}" must be an array`);
      }
      merged[key].push(...(pack[key] || []));
    });

    log.info(
      {
        pack: file,
        documents: (pack.documents || []).length,
        services: (pack.services || []).length,
        rules: (pack.rules || []).length,
        scholarships: (pack.scholarships || []).length,
      },
      "Loaded content pack"
    );
  });

  return merged;
};

module.exports = { loadContentPacks, PACK_DIR };
