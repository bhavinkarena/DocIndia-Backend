const { isValidObjectId } = require("mongoose");
const Category = require("../models/category.model");
const Rule = require("../models/rule.model");
const { serviceHandler } = require("../utils/asyncHandler");
const {
  createCategorySchema,
  updateCategorySchema,
} = require("../validations/category.validation");
const { slugify, parseListQuery, buildPagination } = require("../utils/common");

const assertUniqueQuestionKeys = (questions = []) => {
  const keys = questions.map((q) => q.key);
  const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
  return duplicates.length
    ? `Duplicate question keys: ${[...new Set(duplicates)].join(", ")}`
    : null;
};

/* ---------------- public ---------------- */

exports.getPublishedCategories = serviceHandler(async () => {
  const categories = await Category.find({ isDeleted: false, isPublished: true })
    .select("label slug description examplePrompt icon order")
    .sort({ order: 1, label: 1 })
    .lean();

  return { success: true, statusCode: 200, data: categories };
});

exports.getCategoryBySlug = serviceHandler(async (slug) => {
  const category = await Category.findOne({
    slug,
    isDeleted: false,
    isPublished: true,
  }).lean();

  if (!category) {
    return { success: false, statusCode: 404, message: "Category not found" };
  }

  // Questions drive the wizard, so hand them back in a stable order.
  category.questions = (category.questions || []).sort(
    (a, b) => a.order - b.order
  );

  return { success: true, statusCode: 200, data: category };
});

/* ---------------- admin ---------------- */

exports.createCategory = serviceHandler(async (data) => {
  const { error, value } = createCategorySchema.validate(data);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  const keyError = assertUniqueQuestionKeys(value.questions);
  if (keyError) {
    return { success: false, statusCode: 400, message: keyError };
  }

  const slug = value.slug || slugify(value.label);

  const existing = await Category.findOne({ slug, isDeleted: false });
  if (existing) {
    return {
      success: false,
      statusCode: 409,
      message: "A category with this slug already exists",
    };
  }

  const category = new Category({ ...value, slug });
  await category.save();

  return { success: true, statusCode: 201, data: category };
});

exports.getAllCategories = serviceHandler(async (query) => {
  const { pageNumber, limitNumber, skip, search, sortBy, sortOrder } =
    parseListQuery(query);

  const filter = { isDeleted: false };
  if (search) filter.label = { $regex: search, $options: "i" };

  const pipeline = [
    { $match: filter },
    {
      $lookup: {
        from: "rules",
        let: { categoryId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$categoryId", "$$categoryId"] },
              isDeleted: false,
            },
          },
          {
            $project: {
              version: 1,
              verificationStatus: 1,
              lastVerifiedAt: 1,
              nextReviewAt: 1,
              documentCount: {
                $add: [
                  { $size: { $ifNull: ["$baseDocuments", []] } },
                  {
                    $sum: {
                      $map: {
                        input: { $ifNull: ["$conditionalBlocks", []] },
                        as: "block",
                        in: { $size: { $ifNull: ["$$block.documents", []] } },
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
        as: "rule",
      },
    },
    { $addFields: { rule: { $first: "$rule" } } },
    { $addFields: { questionCount: { $size: { $ifNull: ["$questions", []] } } } },
    { $sort: { [sortBy]: sortOrder } },
    { $skip: skip },
    { $limit: limitNumber },
  ];

  const [totalItems, categories] = await Promise.all([
    Category.countDocuments(filter),
    Category.aggregate(pipeline),
  ]);

  return {
    success: true,
    statusCode: 200,
    data: categories,
    pagination: buildPagination(totalItems, pageNumber, limitNumber),
  };
});

exports.getCategoryById = serviceHandler(async (categoryId) => {
  if (!isValidObjectId(categoryId)) {
    return { success: false, statusCode: 400, message: "Invalid category ID" };
  }

  const category = await Category.findOne({
    _id: categoryId,
    isDeleted: false,
  }).lean();

  if (!category) {
    return { success: false, statusCode: 404, message: "Category not found" };
  }

  return { success: true, statusCode: 200, data: category };
});

exports.updateCategory = serviceHandler(async (categoryId, data) => {
  if (!isValidObjectId(categoryId)) {
    return { success: false, statusCode: 400, message: "Invalid category ID" };
  }

  const { error, value } = updateCategorySchema.validate(data);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  if (value.questions) {
    const keyError = assertUniqueQuestionKeys(value.questions);
    if (keyError) {
      return { success: false, statusCode: 400, message: keyError };
    }
  }

  const category = await Category.findOne({ _id: categoryId, isDeleted: false });
  if (!category) {
    return { success: false, statusCode: 404, message: "Category not found" };
  }

  if (value.slug && value.slug !== category.slug) {
    const clash = await Category.findOne({
      slug: value.slug,
      isDeleted: false,
      _id: { $ne: categoryId },
    });
    if (clash) {
      return {
        success: false,
        statusCode: 409,
        message: "A category with this slug already exists",
      };
    }
  }

  // Removing a question whose key a rule still branches on would leave that
  // condition permanently unsatisfiable, so block it rather than silently
  // breaking the checklist.
  if (value.questions) {
    const rule = await Rule.findOne({ categoryId, isDeleted: false }).lean();
    if (rule) {
      const newKeys = value.questions.map((q) => q.key);
      const usedKeys = new Set();
      (rule.conditionalBlocks || []).forEach((block) =>
        (block.conditions || []).forEach((c) => usedKeys.add(c.questionKey))
      );
      const orphaned = [...usedKeys].filter((k) => !newKeys.includes(k));
      if (orphaned.length) {
        return {
          success: false,
          statusCode: 409,
          message: `Cannot remove question(s) still used by this category's rules: ${orphaned.join(", ")}`,
        };
      }
    }
  }

  const updated = await Category.findByIdAndUpdate(categoryId, value, {
    new: true,
  });

  return { success: true, statusCode: 200, data: updated };
});

exports.deleteCategory = serviceHandler(async (categoryId) => {
  if (!isValidObjectId(categoryId)) {
    return { success: false, statusCode: 400, message: "Invalid category ID" };
  }

  const category = await Category.findOne({ _id: categoryId, isDeleted: false });
  if (!category) {
    return { success: false, statusCode: 404, message: "Category not found" };
  }

  await Category.findByIdAndUpdate(categoryId, { isDeleted: true });
  await Rule.updateMany({ categoryId }, { isDeleted: true });

  return { success: true, statusCode: 200, message: "Category deleted" };
});
