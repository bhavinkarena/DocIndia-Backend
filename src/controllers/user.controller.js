const {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
} = require("../services/user.service");
const { asyncHandler } = require("../utils/asyncHandler");

exports.register = asyncHandler(async (req, res) => {
  const response = await register(req.body);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(201, response.data, "Account created successfully");
});

exports.login = asyncHandler(async (req, res) => {
  const response = await login(req.body);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Logged in successfully");
});

exports.getProfile = asyncHandler(async (req, res) => {
  const response = await getProfile(req.user._id);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Profile fetched successfully");
});

exports.updateProfile = asyncHandler(async (req, res) => {
  const response = await updateProfile(req.user._id, req.body);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, response.data, "Profile updated successfully");
});

exports.changePassword = asyncHandler(async (req, res) => {
  const response = await changePassword(req.user._id, req.body);
  if (!response.success) return res.error(response.statusCode, response.message);
  return res.success(200, {}, response.message);
});
