const express = require("express");
const cors = require("cors");

const { port, frontendUrl } = require("./config/appConfig");
const connectDB = require("./config/database");
const responseMiddleware = require("./middlewares/response.middleware");
const mainRoutes = require("./routes");
const startCronJobs = require("./cronjob");

const app = express();

app.use(
  cors({
    origin: [frontendUrl, "http://localhost:5173", "http://localhost:5174"],
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(responseMiddleware);

app.get("/health", (req, res) =>
  res.success(200, { uptime: process.uptime() }, "DocuIndia API is running")
);

mainRoutes(app);

app.use((req, res) => res.error(404, `Route not found: ${req.originalUrl}`));

// Express 5 forwards async errors here; keep it last.
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  return res.error(500, err.message || "Something went wrong");
});

const start = async () => {
  await connectDB();
  startCronJobs();
  app.listen(port, () => console.log(`DocuIndia API listening on port ${port}`));
};

start();

module.exports = app;
