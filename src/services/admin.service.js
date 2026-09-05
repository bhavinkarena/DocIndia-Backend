const GovService = require("../models/govService.model");
const DocumentModel = require("../models/document.model");
const Rule = require("../models/rule.model");
const Checklist = require("../models/checklist.model");
const Feedback = require("../models/feedback.model");
const User = require("../models/user.model");
const { serviceHandler } = require("../utils/asyncHandler");

exports.getDashboardStats = serviceHandler(async () => {
  const [
    services,
    publishedServices,
    documents,
    rules,
    unverifiedRules,
    brokenLinks,
    users,
    savedChecklists,
    newFeedback,
    inaccurateReports,
  ] = await Promise.all([
    GovService.countDocuments({ isDeleted: false }),
    GovService.countDocuments({ isDeleted: false, isPublished: true }),
    DocumentModel.countDocuments({ isDeleted: false }),
    Rule.countDocuments({ isDeleted: false }),
    Rule.countDocuments({
      isDeleted: false,
      $or: [
        { verificationStatus: { $in: ["unverified", "needs-review"] } },
        { nextReviewAt: { $lte: new Date() } },
      ],
    }),
    DocumentModel.countDocuments({
      isDeleted: false,
      "linkHealth.isHealthy": false,
    }),
    User.countDocuments({ isDeleted: false, role: "user" }),
    Checklist.countDocuments({ isDeleted: false }),
    Feedback.countDocuments({ isDeleted: false, status: "new" }),
    Feedback.countDocuments({ isDeleted: false, wasAccurate: false }),
  ]);

  // Published-and-unverified is the urgent case: live content nobody has
  // checked against its official source.
  const publishedUnverified = await Rule.countDocuments({
    isDeleted: false,
    verificationStatus: { $ne: "verified" },
    serviceId: {
      $in: await GovService.find({ isDeleted: false, isPublished: true })
        .distinct("_id"),
    },
  });

  return {
    success: true,
    statusCode: 200,
    data: {
      content: {
        services,
        publishedServices,
        documents,
        rules,
        unverifiedRules,
        publishedUnverified,
        brokenLinks,
      },
      usage: { users, savedChecklists },
      feedback: { newFeedback, inaccurateReports },
    },
  };
});

/** Documents whose last link probe failed — the content-ops worklist. */
exports.getBrokenLinks = serviceHandler(async () => {
  const documents = await DocumentModel.find({
    isDeleted: false,
    "linkHealth.isHealthy": false,
  })
    .select("name slug officialUrl linkHealth")
    .sort({ "linkHealth.lastCheckedAt": -1 })
    .lean();

  return { success: true, statusCode: 200, data: documents };
});
