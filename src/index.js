const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const { port, allowedOrigins, trustProxy } = require("./config/appConfig");
const { validateConfig } = require("./config/validateConfig");
const connectDB = require("./config/database");
const responseMiddleware = require("./middlewares/response.middleware");
const { requestId, httpLogger } = require("./middlewares/requestId.middleware");
const { globalLimiter } = require("./middlewares/rateLimit.middleware");
const logger = require("./utils/logger");
const swaggerUi = require("swagger-ui-express");
const { spec, docsEnabled } = require("./config/swagger");
const mainRoutes = require("./routes");
const startCronJobs = require("./cronjob");

const app = express();

// Rate limiting is only as good as its idea of "who". See the note on
// trustProxy in appConfig — this must stay off unless a proxy really is
// in front of the process.
app.set("trust proxy", trustProxy);

/**
 * Matches an Origin against the allowlist. Supports a leading "*." to cover
 * preview subdomains — see the note in appConfig.
 */
const originAllowed = (origin) => {
  const candidate = origin.toLowerCase().replace(/\/+$/, "");

  return allowedOrigins.some((allowed) => {
    if (allowed === candidate) return true;
    if (!allowed.startsWith("*.")) return false;

    // "*.netlify.app" → matches "https://anything.netlify.app"
    const suffix = allowed.slice(1);
    const host = candidate.replace(/^https?:\/\//, "");
    return host.endsWith(suffix);
  });
};

app.use(
  cors({
    origin: (origin, callback) => {
      // No origin: curl, health checks, same-origin server calls.
      if (!origin) return callback(null, true);
      if (originAllowed(origin)) return callback(null, true);

      // A browser only reports "CORS error" with no detail, so say plainly
      // in the server log what was rejected and how to permit it.
      logger.warn(
        { origin, allowedOrigins },
        "CORS rejected origin — add it to FRONTEND_URL (comma-separated)"
      );
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Before everything that might log, so every line downstream can be traced
// back to the request that produced it.
app.use(requestId);
app.use(httpLogger);

app.use(responseMiddleware);

// After responseMiddleware, because the limiter answers with res.error() so a
// 429 arrives in the same envelope as every other failure. Before the routes,
// so it covers all of them — the per-route limiters in user.route.js and
// feedback.route.js are tighter budgets layered on top of this one.
app.use(globalLimiter);

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

/**
 * Mounted before the routes so /api-docs is not swallowed by the 404 handler,
 * and after the limiter so a docs page cannot be used to bypass it.
 */
if (docsEnabled) {
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(spec, {
      customSiteTitle: "DocuIndia API",
      swaggerOptions: { persistAuthorization: true },
    })
  );
  // The raw spec, for generating clients or importing into Postman.
  app.get("/api-docs.json", (req, res) => res.json(spec));
  logger.info("API docs available at /api-docs");
}

mainRoutes(app);

app.use((req, res) => res.error(404, `Route not found: ${req.originalUrl}`));

// Express 5 forwards async errors here; keep it last.
app.use((err, req, res, next) => {
  // req.log, not the bare logger: this carries the request id, which is what
  // ties the stack trace to the request that caused it.
  (req.log || logger).error({ err }, "Unhandled error");
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
    logger.info({ port }, `DocuIndia API listening on port ${port}`)
  );

  const connected = await connectDB();
  if (connected) startCronJobs();
  else logger.error("Cron jobs not scheduled — no database connection");
};

start();

module.exports = app;
