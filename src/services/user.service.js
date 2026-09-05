const User = require("../models/user.model");
const { serviceHandler } = require("../utils/asyncHandler");
const { signToken } = require("../utils/jwt");
const {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
} = require("../validations/user.validation");
const { sendWelcomeEmail } = require("./email.service");

exports.register = serviceHandler(async (data) => {
  const { error, value } = registerSchema.validate(data);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  const existing = await User.findOne({ email: value.email, isDeleted: false });
  if (existing) {
    return {
      success: false,
      statusCode: 409,
      message: "An account with this email already exists",
    };
  }

  const user = new User(value);
  await user.save();

  // Fire-and-forget: a mail failure must not fail the registration.
  sendWelcomeEmail(user).catch((err) =>
    console.error("Welcome email failed:", err.message)
  );

  const token = signToken({ userId: user._id, role: user.role });

  return {
    success: true,
    statusCode: 201,
    data: { user: user.toSafeJSON(), token },
  };
});

exports.login = serviceHandler(async (data) => {
  const { error, value } = loginSchema.validate(data);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  const user = await User.findOne({
    email: value.email,
    isDeleted: false,
  }).select("+password");

  // Same message for both branches — revealing which half was wrong tells
  // an attacker which emails have accounts.
  if (!user || !(await user.comparePassword(value.password))) {
    return { success: false, statusCode: 401, message: "Invalid email or password" };
  }

  if (!user.status) {
    return { success: false, statusCode: 403, message: "This account is disabled" };
  }

  const token = signToken({ userId: user._id, role: user.role });

  return {
    success: true,
    statusCode: 200,
    data: { user: user.toSafeJSON(), token },
  };
});

exports.getProfile = serviceHandler(async (userId) => {
  const user = await User.findOne({ _id: userId, isDeleted: false });
  if (!user) {
    return { success: false, statusCode: 404, message: "User not found" };
  }
  return { success: true, statusCode: 200, data: user.toSafeJSON() };
});

exports.updateProfile = serviceHandler(async (userId, data) => {
  const { error, value } = updateProfileSchema.validate(data);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  const user = await User.findOneAndUpdate(
    { _id: userId, isDeleted: false },
    value,
    { new: true }
  );

  if (!user) {
    return { success: false, statusCode: 404, message: "User not found" };
  }

  return { success: true, statusCode: 200, data: user.toSafeJSON() };
});

exports.changePassword = serviceHandler(async (userId, data) => {
  const { error, value } = changePasswordSchema.validate(data);
  if (error) {
    return { success: false, statusCode: 400, message: error.message };
  }

  const user = await User.findOne({ _id: userId, isDeleted: false }).select(
    "+password"
  );
  if (!user) {
    return { success: false, statusCode: 404, message: "User not found" };
  }

  if (!(await user.comparePassword(value.currentPassword))) {
    return { success: false, statusCode: 401, message: "Current password is incorrect" };
  }

  user.password = value.newPassword;
  await user.save();

  return { success: true, statusCode: 200, message: "Password updated" };
});
