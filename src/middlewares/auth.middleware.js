const User = require("../models/user.model");
const { verifyToken } = require("../utils/jwt");

const extractToken = (req) => {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
};

const resolveUser = async (req) => {
  const token = extractToken(req);
  if (!token) return null;

  const decoded = verifyToken(token);
  const user = await User.findOne({
    _id: decoded.userId,
    isDeleted: false,
    status: true,
  }).select("-password");

  return user || null;
};

exports.verifyJWT = async (req, res, next) => {
  try {
    const user = await resolveUser(req);
    if (!user) return res.error(401, "Unauthorized");
    req.user = user;
    next();
  } catch (error) {
    return res.error(401, "Invalid or expired token");
  }
};

/**
 * Used on public endpoints that behave slightly differently when the caller
 * happens to be signed in (e.g. generating a checklist while logged in).
 * Never rejects — a bad token is simply treated as anonymous.
 */
exports.optionalAuth = async (req, res, next) => {
  try {
    req.user = await resolveUser(req);
  } catch (error) {
    req.user = null;
  }
  next();
};

exports.checkRole = (roles = []) => async (req, res, next) => {
  try {
    const user = await resolveUser(req);
    if (!user) return res.error(401, "Unauthorized");
    if (!roles.includes(user.role)) {
      return res.error(403, "You do not have access to this resource");
    }
    req.user = user;
    next();
  } catch (error) {
    return res.error(401, "Invalid or expired token");
  }
};
