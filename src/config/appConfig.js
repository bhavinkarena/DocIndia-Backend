require("dotenv").config();

const appConfig = {
  port: process.env.PORT || 9002,
  mongoURI: process.env.MONGO_URI,
  mongoDBName: process.env.MONGO_DB || "docuindia",
  jwtSecret: process.env.JWT_SECRET,
  tokenExpire: process.env.TOKEN_EXPIRE || "30d",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  emailUser: process.env.EMAIL_USER,
  emailPass: process.env.EMAIL_PASS,
  emailFrom: process.env.EMAIL_FROM || "DocuIndia <no-reply@docuindia.local>",
  seedAdmin: {
    email: process.env.SEED_ADMIN_EMAIL || "admin@gmail.com",
    password: process.env.SEED_ADMIN_PASSWORD || "Admin@123",
  },
};

module.exports = appConfig;
