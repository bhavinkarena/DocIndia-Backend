# DocuIndia — Backend

Rules engine and content API for DocuIndia.

The flow it serves: **pick your state → pick a service → pick what you're doing
(new / renew / update) → answer a couple of questions → get the documents you
need, the steps to follow, and a link to the official source for each.**

Node / Express 5 / MongoDB (Mongoose), layered `route → controller → service → model`.

## Getting started

```bash
npm install
cp .env.example .env      # fill in the values
npm run seed              # safe: admin user + content, all unpublished
npm run seed:demo         # same, but published so you can click through locally
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

## The model

**State is global context, not a question.** It's chosen once, up front, and
gates everything: which services exist and which rule applies.

```
Service ──┬── action: new       ──┬── Rule (state: null)      ← national default
          │                       └── Rule (state: gujarat)   ← override
          ├── action: renew     ──── Rule (state: null)
          └── action: update    ──── Rule (state: null)
```

- **`Service`** — one document or scheme (Aadhaar, PAN, Passport, MA Card).
  `scope: "national"` means it works everywhere; `scope: "state"` restricts it
  to `availableStates` (MA Card exists only in Gujarat).
- **Actions** live on the service and carry their own questions. Renewing a
  passport and applying for a first one share a name and almost nothing else,
  so they get separate question sets and separate rules.
- **`Rule`** is keyed by `(serviceId, action, state)`. A `state` of `null` is
  the national default. **A state-specific rule overrides it** — so PAN needs
  one rule, not 36 near-identical copies, and Gujarat's ration card can point
  at Digital Gujarat while everyone else uses the national portal.
- **`Document`** — the canonical registry. One record per real-world document,
  referenced by every rule that needs it, so "PAN card" is defined once.

Plus `Checklist` (saved), `User`, `Changelog`, `Feedback`, `LinkCheck`.

Three decisions worth knowing:

1. **Documents are referenced, never embedded.** Mongo would happily let you
   inline each document's details into every rule for faster reads. Don't — a
   changed URL then has to be fixed in five places.
2. **A saved checklist freezes its `generatedItems` and `processSteps`.**
   Re-running the rules on every read would silently rewrite history, and the
   trust story depends on showing exactly what the tool said on the day
   someone acted on it. When a rule changes, saved checklists are *flagged*
   (`hasRuleUpdate`), never rewritten — and a national edit deliberately does
   **not** flag users in a state that has its own override.
3. **`state` is a reserved question key.** The engine injects the user's state
   into the answers, so any rule can branch on it — including a national rule
   carrying one state-specific block. A category may not declare it.

## Rules engine

`services/checklist.service.js` is the only non-boilerplate logic here. Pure
and deterministic — same answers, same checklist — which is what makes it safe
to expose on public unauthenticated routes and cheap to test.

```
resolve service (is it offered in this state?)
  → resolve action (published?)
  → validate answers against that action's questions
  → find rule: (service, action, state) ?? (service, action, null)
  → base documents + matched conditional blocks
  → union by documentId (mandatory wins over conditional)
  → resolve document references
  → split into "already have" / "still need"
  → items[] + processSteps[] + ruleScope + lastVerifiedAt
```

Condition operators: `eq`, `neq`, `in`, `nin`, `contains`. Blocks match on
`all` or `any` of their conditions.

## Content integrity

Mongo enforces no referential integrity, so the service layer does:

- A rule cannot reference a document that doesn't exist.
- A rule cannot branch on a question key its action doesn't have.
- A rule cannot target an action the service lacks, or a state it isn't offered in.
- A document cannot be deleted while a rule still references it.
- A service cannot drop an action or question that a rule still depends on.
- The national default cannot be deleted while states still fall back to it.

Every rule edit bumps `version`, writes a `changelog` entry, resets
verification to `needs-review`, and flags the affected saved checklists.

## API

Public: `/service/states`, `/service/actions`, `/service/by-state?state=`,
`/service/:slug?state=`, `/checklist/generate`, `/checklist/classify`,
`/checklist/shared/:token`, `/feedback/create`, `/changelog/service/:id`

Authenticated: `/user/*`, `/checklist/save|my|detail|progress|delete`

Editor/admin: `/service/*`, `/document/*`, `/rule/*`, `/feedback/all`, `/admin/*`

## Cron jobs

- **Link health** (Mon 03:00) — probes every official URL. Catches hard
  failures only; government sites often redirect a dead deep link to their
  homepage and still return 200, so human spot-checks remain the real net.
- **Re-verification** (daily 04:00) — flags rules past their review date.
  Nothing is unpublished automatically; that call belongs to a person.

## Seeded content

`npm run seed` is idempotent and never overwrites a rule a human has verified.

Ships 8 services (Aadhaar, PAN, Passport, Driving Licence, Voter ID, Ration
Card, MA Card, Register a Business), 22 documents and 19 rules — including a
Gujarat override for the ration card to demonstrate state-specific rules.

**Every seeded rule is marked `unverified`, and `npm run seed` leaves
everything unpublished.** This data exists to exercise the schema and give the
admin CMS something to edit. It is not a verified statement of what any
government body requires, and the fees and timelines in it are indicative
only. Verify each rule against its official source before publishing.
