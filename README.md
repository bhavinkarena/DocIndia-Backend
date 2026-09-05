# DocuIndia — Backend

Rules engine and content API for DocuIndia: a user states a goal, answers 2–3
questions, and gets a checklist of the documents they need, each linked to its
official government source.

Node / Express 5 / MongoDB (Mongoose), layered `route → controller → service → model`.

## Getting started

```bash
npm install
cp .env.example .env      # fill in the values
npm run seed              # creates the admin user + starter content
npm run dev               # http://localhost:9002
```

### Environment

| Variable | Purpose |
|---|---|
| `PORT` | API port (default 9002) |
| `MONGO_URI` / `MONGO_DB` | MongoDB connection |
| `JWT_SECRET` / `TOKEN_EXPIRE` | Auth token signing |
| `FRONTEND_URL` | CORS origin |
| `EMAIL_USER` / `EMAIL_PASS` | SMTP. **Leave blank** to run the email service in console-log mode |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Seeded admin account |

## Architecture

```
src/
├── config/       appConfig (all env access), database
├── controllers/  thin — asyncHandler + res.success / res.error
├── services/     serviceHandler, return { success, statusCode, data|message }
├── models/       Mongoose schemas, soft delete via isDeleted
├── routes/       per feature + index.js → mainRoutes(app)
├── validations/  Joi schemas, called from the service layer
├── middlewares/  auth (verifyJWT, checkRole, optionalAuth), response
├── cronjob/      link health, re-verification sweeps
├── utils/        asyncHandler, jwt, states, constants
└── seed/         idempotent seeder
```

Services never throw for expected failures — they return a result object that
the controller translates into a response. Only unexpected errors bubble to
`asyncHandler`.

## The data model

Three collections carry the product:

- **`category`** — one thing a person is trying to do. Questions are *embedded*
  (small, always read together, never shared).
- **`document`** — the canonical registry. One record per real-world document,
  referenced by every rule that needs it, so "PAN card" is defined once.
- **`rule`** — per category: base documents plus conditional blocks keyed to
  answers. Stores document **references**, never copies.

Plus `checklist` (saved), `user`, `changelog`, `feedback`, `linkCheck`.

Two decisions worth knowing:

1. **Documents are referenced, not embedded.** Mongo would happily let you
   inline each document's details into every rule for faster reads. Don't — a
   changed URL then has to be fixed in five places. Resolution happens at read
   time in the rules engine.
2. **A saved checklist freezes its `generatedItems`.** It is deliberately
   denormalised. Re-running the rules on every read would silently rewrite
   history, and the trust story depends on being able to show exactly what the
   tool said on the day someone acted on it. When a rule changes, saved
   checklists are *flagged* (`hasRuleUpdate`), never rewritten.

## Rules engine

`services/checklist.service.js` is the only non-boilerplate logic here. It is
pure and deterministic — same answers, same checklist — which is what makes it
safe to expose on public unauthenticated routes and cheap to test.

```
resolve category → validate answers against its own questions
  → base documents + matched conditional blocks
  → union by documentId (mandatory wins over conditional)
  → resolve document references
  → items[] + ruleVersion + lastVerifiedAt
```

Condition operators: `eq`, `neq`, `in`, `nin`, `contains`. Blocks match on
`all` or `any` of their conditions.

## Content integrity

Mongo enforces no referential integrity, so the service layer does:

- A rule cannot reference a document that doesn't exist.
- A rule cannot branch on a question key its category doesn't have.
- A document cannot be deleted while a rule still references it.
- A category cannot drop a question a rule still branches on.

Every rule edit bumps `version`, writes a `changelog` entry, resets
verification to `needs-review`, and flags affected saved checklists.

## API

Public: `/category/published`, `/category/states`, `/category/:slug`,
`/checklist/generate`, `/checklist/classify`, `/checklist/shared/:token`,
`/feedback/create`, `/changelog/category/:id`

Authenticated: `/user/*`, `/checklist/save|my|detail|progress|delete`

Editor/admin: `/category/*`, `/document/*`, `/rule/*`, `/feedback/all`, `/admin/*`

## Cron jobs

- **Link health** (Mon 03:00) — probes every official URL, records the result.
  Catches hard failures only; government sites often redirect a dead deep link
  to their homepage and still return 200, so human spot-checks remain the real
  safety net.
- **Re-verification** (daily 04:00) — flags rules past their review date.
  Nothing is unpublished automatically; that call belongs to a person.

## Seeded content

`npm run seed` is idempotent and never overwrites a rule a human has verified.

**The seeded rules are marked `unverified` and their categories are
unpublished on purpose.** They exist to exercise the schema and give the admin
CMS something to edit — they are not a verified statement of what any
government body currently requires. Verify each rule against its official
source before publishing.
