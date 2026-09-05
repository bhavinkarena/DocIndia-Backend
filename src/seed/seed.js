/**
 * Idempotent seeder — safe to re-run. Upserts by slug/email so it never
 * duplicates, and never overwrites a rule that has already been verified
 * by a human.
 *
 *   npm run seed         # safe: everything lands unpublished
 *   npm run seed:demo    # also publishes, so you can click through locally
 *
 * The demo flag exists only so the app isn't empty on a fresh clone. It does
 * not make the content verified — it just makes it visible.
 */
const mongoose = require("mongoose");
const connectDB = require("../config/database");
const { validateConfig } = require("../config/validateConfig");
const { seedAdmin } = require("../config/appConfig");

const User = require("../models/user.model");
const GovService = require("../models/govService.model");
const DocumentModel = require("../models/document.model");
const Rule = require("../models/rule.model");
const Changelog = require("../models/changelog.model");

const { documents, services, rules } = require("./seedData");

const PUBLISH = process.argv.includes("--publish");

const seedAdminUser = async () => {
  const existing = await User.findOne({ email: seedAdmin.email });
  if (existing) {
    console.log(`  admin already exists: ${seedAdmin.email}`);
    return existing;
  }

  const user = new User({
    firstName: "Docu",
    lastName: "Admin",
    email: seedAdmin.email,
    password: seedAdmin.password,
    role: "admin",
  });
  await user.save();

  console.log(`  created admin: ${seedAdmin.email}`);
  return user;
};

/**
 * Documents are written first, without their obtainedVia links — those point
 * at services, which don't exist yet. They get back-filled in a second pass.
 */
const seedDocuments = async () => {
  const bySlug = {};

  for (const doc of documents) {
    const { obtainedViaSlug, obtainedViaAction, ...fields } = doc;
    const saved = await DocumentModel.findOneAndUpdate(
      { slug: doc.slug },
      { $set: { ...fields, isDeleted: false } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    bySlug[doc.slug] = saved._id;
  }

  console.log(`  upserted ${documents.length} documents`);
  return bySlug;
};

const seedServices = async () => {
  const bySlug = {};

  for (const service of services) {
    const actions = (service.actions || []).map((a) => ({
      ...a,
      isPublished: PUBLISH,
    }));

    const saved = await GovService.findOneAndUpdate(
      { slug: service.slug },
      { $set: { ...service, actions, isPublished: PUBLISH, isDeleted: false } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    bySlug[service.slug] = saved._id;
  }

  console.log(
    `  upserted ${services.length} services${PUBLISH ? " (published)" : " (unpublished)"}`
  );
  return bySlug;
};

/** Second pass: now that services exist, link documents to how you get them. */
const linkDocumentsToServices = async (documentIds, serviceIds) => {
  let linked = 0;

  for (const doc of documents) {
    if (!doc.obtainedViaSlug) continue;

    const serviceId = serviceIds[doc.obtainedViaSlug];
    if (!serviceId) {
      throw new Error(
        `Seed error: document "${doc.slug}" points at unknown service "${doc.obtainedViaSlug}"`
      );
    }

    await DocumentModel.findByIdAndUpdate(documentIds[doc.slug], {
      obtainedVia: { serviceId, action: doc.obtainedViaAction || "new" },
    });
    linked++;
  }

  console.log(`  linked ${linked} documents to the service that issues them`);
};

const resolveDocuments = (entries, documentIds, context) =>
  entries.map((entry) => {
    const documentId = documentIds[entry.slug];
    if (!documentId) {
      throw new Error(
        `Seed error: unknown document slug "${entry.slug}" referenced in ${context}`
      );
    }
    return {
      documentId,
      mandatory: entry.mandatory !== false,
      note: entry.note || "",
    };
  });

const seedRules = async (serviceIds, documentIds) => {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const definition of rules) {
    const serviceId = serviceIds[definition.serviceSlug];
    if (!serviceId) {
      throw new Error(`Seed error: unknown service slug "${definition.serviceSlug}"`);
    }

    const label = `${definition.serviceSlug}/${definition.action}${
      definition.state ? `@${definition.state}` : ""
    }`;

    const existing = await Rule.findOne({
      serviceId,
      action: definition.action,
      state: definition.state ?? null,
      isDeleted: false,
    });

    if (existing && existing.verificationStatus === "verified") {
      console.log(`  skipping ${label} — already verified by a human`);
      skipped++;
      continue;
    }

    const payload = {
      serviceId,
      action: definition.action,
      state: definition.state ?? null,
      baseDocuments: resolveDocuments(
        definition.baseDocuments || [],
        documentIds,
        `${label}.baseDocuments`
      ),
      conditionalBlocks: (definition.conditionalBlocks || []).map((block) => ({
        label: block.label,
        matchType: block.matchType,
        conditions: block.conditions,
        documents: resolveDocuments(
          block.documents,
          documentIds,
          `${label}."${block.label}"`
        ),
      })),
      processSteps: definition.processSteps || [],
      // Seeded content is explicitly not verified. Someone has to check it
      // against the official sources before it goes anywhere near a user.
      verificationStatus: "unverified",
      lastVerifiedAt: null,
      isDeleted: false,
    };

    if (existing) {
      Object.assign(existing, payload);
      await existing.save();
      updated++;
    } else {
      const rule = await Rule.create({ ...payload, version: 1 });
      created++;

      // The seeder writes rules directly rather than going through
      // rule.service, so the v1 changelog entry has to be written here too —
      // otherwise version history starts at v2 and the audit trail has a hole
      // exactly where the original content came from.
      const added = [
        ...payload.baseDocuments.map((d) => d.documentId.toString()),
        ...payload.conditionalBlocks.flatMap((b) =>
          b.documents.map((d) => d.documentId.toString())
        ),
      ];

      await Changelog.create({
        serviceId,
        action: definition.action,
        ruleId: rule._id,
        version: 1,
        summary: "Initial seed — unverified starter content",
        changes: { added: [...new Set(added)], removed: [], modified: [] },
        changedBy: null,
      });
    }
  }

  console.log(
    `  rules: ${created} created, ${updated} updated, ${skipped} skipped`
  );
};

const run = async () => {
  validateConfig();

  // connectDB retries and returns false rather than exiting, because the API
  // should survive a database blip. A seeder should not — there is nothing
  // useful to do without a connection.
  const connected = await connectDB();
  if (!connected) {
    console.error("Cannot seed without a database connection.");
    process.exit(1);
  }

  console.log("\nSeeding DocuIndia…\n");

  await seedAdminUser();
  const documentIds = await seedDocuments();
  const serviceIds = await seedServices();
  await linkDocumentsToServices(documentIds, serviceIds);
  await seedRules(serviceIds, documentIds);

  console.log("\nSeed complete.");
  console.log(
    "\nEvery seeded rule is marked 'unverified'. Verify each one against its\n" +
      "official source in the admin panel before treating it as correct —\n" +
      "the fees and timelines in the seed are indicative, not confirmed.\n"
  );
  if (!PUBLISH) {
    console.log("Nothing is published. Run `npm run seed:demo` to publish for local browsing.\n");
  }

  await mongoose.connection.close();
  process.exit(0);
};

run().catch(async (err) => {
  console.error("\nSeed failed:", err.message);
  await mongoose.connection.close();
  process.exit(1);
});
