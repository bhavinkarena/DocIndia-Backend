const { Router } = require("express");
const { verifyJWT } = require("../middlewares/auth.middleware");
const {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
} = require("../controllers/user.controller");

const userRoutes = Router();

userRoutes.post("/register", register);
userRoutes.post("/login", login);
userRoutes.get("/me", verifyJWT, getProfile);
userRoutes.put("/me", verifyJWT, updateProfile);
userRoutes.put("/change-password", verifyJWT, changePassword);

module.exports = userRoutes;
