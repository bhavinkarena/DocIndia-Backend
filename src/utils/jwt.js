const jwt = require("jsonwebtoken");
const { jwtSecret, tokenExpire } = require("../config/appConfig");

exports.signToken = (payload) =>
  jwt.sign(payload, jwtSecret, { expiresIn: tokenExpire });

exports.verifyToken = (token) => jwt.verify(token, jwtSecret);
