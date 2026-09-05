const { randomUUID } = require("crypto");
const pinoHttp = require("pino-http");
const logger = require("../utils/logger");

const HEADER = "x-request-id";

/**
 * Gives every request an id and echoes it back on the response.
 *
 * The point is correlation. A single checklist generation touches the rules
 * engine and several collections; when one of those throws, the stack trace
 * alone does not say which request caused it, and on a busy instance the
 * surrounding lines belong to other people's requests. With an id, one filter
 * reproduces the whole story of one visit.
 *
 * An inbound id is honoured so a trace started at a load balancer or another
 * service keeps its identity. The header goes back on the response so a user
 * reporting a problem can be asked for the id rather than for the time they
 * think it happened.
 */
const requestId = (req, res, next) => {
  const inbound = req.headers[HEADER];

  // Length-capped: this lands in every log line for the request, and an
  // untrusted header must not be able to write an arbitrarily long string
  // into the log stream.
  req.id =
    typeof inbound === "string" && inbound.length > 0 && inbound.length <= 128
      ? inbound
      : randomUUID();

  res.setHeader(HEADER, req.id);
  next();
};

/**
 * One line per completed request, and `req.log` — a child logger already
 * carrying the request id — for handlers to use.
 *
 * Level by outcome rather than everything at info: a 500 should stand out in a
 * stream where the healthy case is also being logged. 4xx is warn because it
 * is usually the caller's problem, not the server's.
 */
/**
 * `req.url` is rewritten to be relative to whichever router matched, so inside
 * the /service router it reads "/states". `originalUrl` is the path the client
 * actually asked for, which is the only one worth logging.
 */
const fullPath = (req) => req.originalUrl || req.url;

const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.id,
  // The request id has to reach the log line itself — correlation is the whole
  // point, and the custom `req` serializer below drops pino-http's default
  // carrier for it.
  customProps: (req) => ({ requestId: req.id }),
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    // Health checks are polled constantly by uptime monitors and would other-
    // wise be most of the log volume while saying nothing.
    if (fullPath(req) === "/health") return "debug";
    return "info";
  },
  customSuccessMessage: (req, res) =>
    `${req.method} ${fullPath(req)} → ${res.statusCode}`,
  customErrorMessage: (req, res, err) =>
    `${req.method} ${fullPath(req)} → ${res.statusCode} (${err.message})`,
  serializers: {
    // The defaults log every header and the full body. Neither is worth the
    // volume, and both are where credentials leak into a log file.
    req: (req) => ({ method: req.method, url: req.originalUrl || req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});

module.exports = { requestId, httpLogger };
