/**
 * Idempotent seeder — safe to re-run. Upserts by slug/email so it never
 * duplicates, and never overwrites a rule that has already been verified
 * by a human.
 *
 * Run with: npm run seed
 */
const mongoose = require("mongoose");
const connectDB = require("../config/database");
const { seedAdmin } = require("../config/appConfig");

const User = require("../models/user.model");
const Category = require("../models/category.model");
const DocumentModel = require("../models/document.model");
const Rule = require("../models/rule.model");
const Changelog = require("../models/changelog.model");

const { documents, categories, rules } = require("./seedData");

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

const seedDocuments = async () => {
  const bySlug = {};

  for (const doc of documents) {
    const saved = await DocumentModel.findOneAndUpdate(
      { slug: doc.slug },
      { $set: { ...doc, isDeleted: false } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    bySlug[doc.slug] = saved._id;
  }

  console.log(`  upserted ${documents.length} documents`);
  return bySlug;
};

const seedCategories = async () => {
  const bySlug = {};

  for (const category of categories) {
    const saved = await Category.findOneAndUpdate(
      { slug: category.slug },
      // isPublished is deliberately left out of $set so re-seeding never
      // republishes something an editor has taken down.
      { $set: { ...category, isDeleted: false } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    bySlug[category.slug] = saved._id;
  }

  console.log(`  upserted ${categories.length} categories`);
  return bySlug;
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

const seedRules = async (categoryIds, documentIds) => {
  for (const [categorySlug, definition] of Object.entries(rules)) {
    const categoryId = categoryIds[categorySlug];
    if (!categoryId) {
      throw new Error(`Seed error: unknown category slug "${categorySlug}"`);
    }

    const existing = await Rule.findOne({ categoryId, isDeleted: false });

    if (existing && existing.verificationStatus === "verified") {
      console.log(`  skipping rule for "${categorySlug}" — already verified`);
      continue;
    }

    const payload = {
      categoryId,
      baseDocuments: resolveDocuments(
        definition.baseDocuments,
        documentIds,
        `${categorySlug}.baseDocuments`
      ),
      conditionalBlocks: definition.conditionalBlocks.map((block) => ({
        label: block.label,
        matchType: block.matchType,
        conditions: block.conditions,
        documents: resolveDocuments(
          block.documents,
          documentIds,
          `${categorySlug}."${block.label}"`
        ),
      })),
      // Seeded content is explicitly not verified. Someone has to check it
      // against the official sources before it goes anywhere near a user.
      verificationStatus: "unverified",
      lastVerifiedAt: null,
      isDeleted: false,
    };

    if (existing) {
      Object.assign(existing, payload);
      await existing.save();
    } else {
      const created = await Rule.create({ ...payload, version: 1 });

      // The seeder writes rules directly rather than going through
      // rule.service, so the v1 changelog entry has to be written here too —
      // otherwise version history starts at v2 and the audit trail has a hole
      // exactly where the original content came from.
      await Changelog.create({
        categoryId,
        ruleId: created._id,
        version: 1,
        summary: "Initial seed — unverified starter content",
        changes: {
          added: payload.baseDocuments
            .map((d) => d.documentId.toString())
            .concat(
              payload.conditionalBlocks.flatMap((b) =>
                b.documents.map((d) => d.documentId.toString())
              )
            ),
          removed: [],
          modified: [],
        },
        changedBy: null,
      });
    }
  }

  console.log(`  upserted ${Object.keys(rules).length} rules`);
};

const run = async () => {
  await connectDB();
  console.log("\nSeeding DocuIndia…\n");

  await seedAdminUser();
  const documentIds = await seedDocuments();
  const categoryIds = await seedCategories();
  await seedRules(categoryIds, documentIds);

  console.log("\nSeed complete.");
  console.log(
    "\nNote: seeded categories are unpublished and their rules are marked\n" +
      "'unverified'. Verify each rule against its official source in the admin\n" +
      "panel before publishing.\n"
  );

  await mongoose.connection.close();
  process.exit(0);
};

run().catch(async (err) => {
  console.error("\nSeed failed:", err.message);
  await mongoose.connection.close();
  process.exit(1);
});
