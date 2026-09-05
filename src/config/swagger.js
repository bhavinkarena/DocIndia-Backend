const path = require("path");
const swaggerJsdoc = require("swagger-jsdoc");
const { port, isProduction } = require("./appConfig");
const { ACTION_KEYS, ROLE_VALUES } = require("../utils/constants");
const { STATE_VALUES } = require("../utils/states");

/**
 * Interactive API docs, generated from JSDoc blocks on the route files.
 *
 * Annotations live next to the routes rather than in a hand-maintained spec
 * file, because a spec kept somewhere else drifts the first time somebody adds
 * a field in a hurry — and a wrong spec is worse than none.
 *
 * Everything shared (the response envelope, the auth scheme, the enums) is
 * defined once here; routes only describe what is specific to them.
 */
const definition = {
  openapi: "3.0.3",
  info: {
    title: "DocuIndia API",
    version: "1.0.0",
    description:
      "Rules engine and content API for DocuIndia.\n\n" +
      "**The flow it serves:** pick your state → pick a service → pick what " +
      "you're doing (new / renew / update) → answer a couple of questions → " +
      "get the documents you need, the steps to follow, and a link to the " +
      "official source for each.\n\n" +
      "### Authentication\n\n" +
      "`POST /user/login` returns a short-lived access token and sets an " +
      "httpOnly refresh cookie. Send the access token as `Authorization: " +
      "Bearer <token>`. When it expires (15 minutes), call `POST /user/refresh` " +
      "— the cookie is the credential there, so no header is needed. The " +
      "refresh token rotates on every use.\n\n" +
      "### Response shape\n\n" +
      "Every endpoint answers with the same envelope: " +
      "`{ success, statusCode, message, data }`. Errors omit `data`.",
  },
  servers: [
    { url: `http://localhost:${port}`, description: "Local development" },
  ],
  tags: [
    { name: "Auth", description: "Registration, sessions and password reset" },
    { name: "Services", description: "Government services and their actions" },
    { name: "Checklists", description: "Generating, saving and sharing checklists" },
    { name: "Documents", description: "Document catalogue (editor/admin)" },
    { name: "Rules", description: "The rules engine content (editor/admin)" },
    { name: "Feedback", description: "Accuracy reports from users" },
    { name: "Changelog", description: "History of rule changes" },
    { name: "Admin", description: "Dashboard stats and operations" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "The access token from /user/login or /user/refresh.",
      },
      refreshCookie: {
        type: "apiKey",
        in: "cookie",
        name: "docuindia_refresh",
        description:
          "Set automatically by login/register. httpOnly — page scripts " +
          "cannot read it, and it is scoped to /user.",
      },
    },
    schemas: {
      Envelope: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          statusCode: { type: "integer", example: 200 },
          message: { type: "string", example: "Success" },
          data: { type: "object" },
        },
      },
      Error: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          statusCode: { type: "integer", example: 400 },
          message: {
            type: "string",
            example: "Choose your state first",
            description: "Safe to show a user verbatim.",
          },
        },
      },
      User: {
        type: "object",
        properties: {
          _id: { type: "string", example: "6a9c054064101e4729ae66f2" },
          firstName: { type: "string", example: "Asha" },
          lastName: { type: "string", example: "Patel" },
          email: { type: "string", format: "email" },
          role: { type: "string", enum: ROLE_VALUES },
          notificationPrefs: {
            type: "object",
            properties: { email: { type: "boolean" } },
          },
        },
      },
      Session: {
        type: "object",
        properties: {
          user: { $ref: "#/components/schemas/User" },
          token: {
            type: "string",
            description:
              "Access token, 15 minute expiry. The refresh token is NOT here " +
              "— it is set as an httpOnly cookie.",
          },
        },
      },
      ChecklistItem: {
        type: "object",
        properties: {
          documentId: { type: "string" },
          name: { type: "string", example: "Proof of address" },
          description: { type: "string" },
          issuingBody: { type: "string" },
          officialUrl: { type: "string", format: "uri" },
          mandatory: { type: "boolean" },
          note: { type: "string" },
          copiesRequired: { type: "integer", example: 2 },
          attestation: {
            type: "string",
            enum: ["none", "self-attested", "notarised", "gazetted-officer"],
          },
          validityWindow: { type: "string", example: "Issued within 3 months" },
          formatNotes: { type: "string" },
        },
      },
      ProcessStep: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          mode: { type: "string", enum: ["online", "in-person", "either"] },
          url: { type: "string", format: "uri" },
          fee: { type: "string", example: "₹1,500" },
          timeline: { type: "string", example: "30–45 days" },
          order: { type: "integer" },
        },
      },
      GeneratedChecklist: {
        type: "object",
        properties: {
          service: { type: "object" },
          actionLabel: { type: "string" },
          stateLabel: { type: "string" },
          ruleScope: {
            type: "string",
            enum: ["national", "state"],
            description:
              "Whether a state override applied, or the national default did.",
          },
          verificationStatus: {
            type: "string",
            enum: ["unverified", "verified", "needs-review"],
          },
          lastVerifiedAt: { type: "string", format: "date-time" },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/ChecklistItem" },
          },
          processSteps: {
            type: "array",
            items: { $ref: "#/components/schemas/ProcessStep" },
          },
        },
      },
    },
    parameters: {
      stateQuery: {
        name: "state",
        in: "query",
        required: true,
        schema: { type: "string", enum: STATE_VALUES },
        description: "State slug, e.g. `gujarat`.",
      },
    },
    responses: {
      Unauthorized: {
        description: "Missing, expired or invalid access token.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      Forbidden: {
        description: "Authenticated, but not allowed to do this.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      NotFound: {
        description: "No such record.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      ValidationError: {
        description: "The request body or query failed validation.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
      RateLimited: {
        description:
          "Rate limit exceeded. See the Rate limits section of the backend " +
          "README for the budget on each endpoint.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
    },
  },
};

/** Reused by the route annotations for the shared action/state enums. */
const ACTION_ENUM = ACTION_KEYS;

const spec = swaggerJsdoc({
  definition,
  /**
   * Absolute, so `npm start` from any working directory still finds the
   * routes — and forward-slashed, because path.join yields backslashes on
   * Windows and the glob matches nothing. The failure is silent: you get a
   * spec with zero paths and no error.
   */
  apis: [path.join(__dirname, "../routes/*.js").split(path.sep).join("/")],
});

/**
 * Docs are served in development only.
 *
 * The spec names every endpoint, its shape and its role requirement — which is
 * a map of the attack surface, and this API has an admin CMS behind it. Set
 * ENABLE_API_DOCS=true to turn them on in a deployed environment deliberately.
 */
const docsEnabled = !isProduction || process.env.ENABLE_API_DOCS === "true";

module.exports = { spec, docsEnabled, ACTION_ENUM };
