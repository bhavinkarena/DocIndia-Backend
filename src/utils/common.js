const crypto = require("crypto");

exports.slugify = (value = "") =>
  value
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

exports.buildPagination = (totalItems, pageNumber, limitNumber) => {
  const totalPages = Math.ceil(totalItems / limitNumber) || 0;
  return {
    totalItems,
    totalPages,
    currentPage: pageNumber,
    limit: limitNumber,
    hasNextPage: pageNumber < totalPages,
    hasPrevPage: pageNumber > 1,
  };
};

exports.parseListQuery = (query = {}) => {
  const pageNumber = parseInt(query.page) || 1;
  const limitNumber = parseInt(query.limit) || 10;
  return {
    pageNumber,
    limitNumber,
    skip: (pageNumber - 1) * limitNumber,
    search: query.search || null,
    sortBy: query.sortby || "createdAt",
    sortOrder: query.sortorder === "asc" ? 1 : -1,
  };
};

exports.generateShareToken = () => crypto.randomBytes(12).toString("hex");

exports.addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};
