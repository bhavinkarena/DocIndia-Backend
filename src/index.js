const express = require("express");
const cors = require("cors");

const { port, allowedOrigins } = require("./config/appConfig");
const { validateConfig } = require("./config/validateConfig");
const connectDB = require("./config/database");
const responseMiddleware = require("./middlewares/response.middleware");
const mainRoutes = require("./routes");
const startCronJobs = require("./cronjob");

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      // No origin: curl, health checks, same-origin server calls.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(responseMiddleware);

/**
 * Reports the database state rather than just "I'm alive" — when a deploy is
 * up but every route 500s, this is the first thing worth looking at.
 */
app.get("/health", (req, res) => {
  const connected = connectDB.isConnected();
  return res.success(
    connected ? 200 : 503,
    {
      uptime: process.uptime(),
      database: connected ? "connected" : "disconnected",
    },
    connected ? "DocuIndia API is running" : "API is up but the database is unreachable"
  );
});

mainRoutes(app);

app.use((req, res) => res.error(404, `Route not found: ${req.originalUrl}`));

// Express 5 forwards async errors here; keep it last.
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  return res.error(500, err.message || "Something went wrong");
});

const start = async () => {
  // Missing configuration is never going to fix itself — fail immediately
  // and say exactly what is absent.
  validateConfig();

  // Listen before connecting. A PaaS waits for the port bind to call the
  // deploy healthy; exiting on a database blip turns a transient problem
  // into a failed deploy with no instance left to inspect.
  app.listen(port, "0.0.0.0", () =>
    console.log(`DocuIndia API listening on port ${port}`)
  );

  const connected = await connectDB();
  if (connected) startCronJobs();
  else console.error("Cron jobs not scheduled — no database connection.");
};

start();

module.exports = app;
