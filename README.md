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
| `JWT_SECRET` | Access token signing |
| `ACCESS_TOKEN_EXPIRE` / `REFRESH_TOKEN_DAYS` | Session lifetimes (default 15m / 7d) |
| `RESET_TOKEN_MINUTES` | Password reset link validity (default 30) |
| `NODE_ENV` | `production` makes the refresh cookie Secure + SameSite=None |
| `TRUST_PROXY` | Proxy hops in front of the app, so rate limits see the real client IP |
| `FRONTEND_URL` | CORS origin, and the origin used in email links |
| `LOG_LEVEL` | `trace`…`fatal` (default `info`) |
| `SOFT_DELETE_RETENTION_DAYS` | How long soft-deleted records survive before the weekly cleanup (default 90) |
| `ENABLE_API_DOCS` | `true` serves `/api-docs` in production; off by default |
| `EMAIL_USER` / `EMAIL_PASS` | SMTP. **Leave blank** to run the email service in console-log mode |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Seeded admin account |

## Deploying

Two things bite on a first deploy, and both look identical from the outside —
the process starts and immediately exits.

**1. `.env` is gitignored, so the host has none of it.** Set every variable
from the table above in the host's dashboard. Boot now validates this first
and names exactly what's missing instead of dying inside the Mongo driver.

**2. MongoDB Atlas only accepts allowlisted IPs.** By default that's just the
machine you set the cluster up on. Add the host under **Atlas → Network
Access**. Most PaaS providers give no fixed egress IP on lower tiers, so
`0.0.0.0/0` is usually the only workable entry there — which makes the
connection-string password the only thing guarding the database. Use a strong
one, and rotate it if it has ever been pasted anywhere.

**3. The browser blocks the API with a bare "CORS error".** That means the
deployed site's origin isn't in `FRONTEND_URL`. Set it to the frontend's
origin — the server log names the rejected origin and lists what it currently
allows, so you never have to guess.

```
FRONTEND_URL=https://your-site.netlify.app
FRONTEND_URL=https://your-site.netlify.app,*.netlify.app   # + preview deploys
```

Comma-separated, and normalised on load — a trailing slash pasted from the
address bar still matches, since a browser's `Origin` header never has one. A
leading `*.` trusts every subdomain of that host, so only use it for a domain
you control.

Don't forget the other side: the frontend needs `VITE_BASE_URL` pointed at the
deployed API **at build time**, not runtime — Vite inlines it into the bundle,
so changing it requires a rebuild.

Boot order is deliberate: **config is validated, then the port is bound, then
the database connects with retries.** Listening first means a database blip
degrades the service instead of failing the deploy outright, and `/health`
reports the real connection state:

```json
{ "data": { "uptime": 12.4, "database": "connected" } }
```

A 503 from `/health` with `"database": "disconnected"` means the API is fine
and the database is not — check the logs for the specific reason.

## Content

Content lives in two places, both in the same slug-referenced format:

- **`src/seed/seedData.js`** — the bootstrap set. The original eight services.
- **`content/*.json`** — packs, one per category, merged in by the seeder.

The split exists because `seedData.js` was already 1,300 lines at eight
services and the catalogue is meant to reach forty. Merging the packs into the
seed rather than importing them separately keeps **one** command that produces
a complete environment — otherwise a fresh clone gets eight services and nobody
finds out why.

A pack is exactly the bulk-import format, so the same file either seeds a new
environment or imports into a running one. See `content/README.md`.

**None of it is verified.** Rules seed as `unverified` and fees as estimates;
`--publish` makes content visible, not correct.

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
  → keep the process steps this applicant performs, and the fees they pay
  → total the money and the time
  → follow obtainedVia to build the prerequisite chain
  → split into "already have" / "still need"
  → items[] + prerequisites[] + journey + cost + timeline + processSteps[]
```

Condition operators: `eq`, `neq`, `in`, `nin`, `contains`. Blocks match on
`all` or `any` of their conditions.

**Three things carry conditions, not one.** A conditional document block, a
whole process step, and a single fee line all evaluate against the same
answers with the same operators. Tatkal is the case that needs all three: it
adds a ₹2,000 fee line, and it replaces a three-to-six-week police
verification step with a three-to-seven-day one. With one gate you can express
the fee or the step but not both, and a "route" whose timeline lives in prose
is a timeline nothing can plan a deadline against.

The one asymmetry: **an empty condition list means "always" on steps and fee
lines, and "never" on a document block.** Most fees and most steps apply to
everybody; a document block with no conditions is a mistake.

### Money and time

`fees[]` and `minDays`/`maxDays` are the computable forms. The free-text `fee`
and `timeline` survive as fallbacks for what genuinely resists a number
("varies by municipality") and can sit alongside a structured value — "₹150
approx." and "varies by state" are two different facts.

Both totals are **null rather than zero** when nothing is quotable. "We don't
know" and "it's free" are different statements and the UI renders them
differently. `hasUnquoted` marks a total that is a floor because some step's
charge is prose, and `isEstimate` marks a figure not taken from an official
schedule.

### Prerequisite chains

`obtainedVia` links a document to the service that issues it. The engine
follows that recursively, **three levels deep**, resolving a level at a time —
one query each for services, rules and documents per level, so depth costs a
fixed handful of round trips rather than one per branch.

Only **base documents** are expanded. A prerequisite's conditional blocks
branch on answers to its own questions and nobody has answered them; the
result is the floor, flagged with `hasConditionalDocs`.

**Cycles are real content, not a bug.** Aadhaar accepts a bank statement, and
opening a bank account needs Aadhaar. The chain detects the loop, marks the
node, and stops.

`journey` rolls the chain up, and money and time do not aggregate the same
way:

- **Cost sums.** Everything on the chain gets paid for.
- **Time takes the maximum across siblings.** Prerequisites at the same level
  are independent errands that can run at the same time. Summing them would
  tell someone a fortnight of parallel paperwork takes two months, and they
  would abandon a plan that was fine.

`deadlinePlan` works backwards from a `targetDate`, **against the worst case
and against the whole chain**. A passport takes six weeks; a passport for
someone with no Aadhaar takes six weeks after a three-month enrolment, and
answering with the first figure is the exact mistake the product exists to
prevent.

`targetDate` is not part of the cache key — the plan is relative to *today*,
so a cached one would hand tomorrow's visitor a day they don't have.

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

## Sessions

Two tokens, because they solve different halves of the problem.

The **access token** is a JWT sent as `Authorization: Bearer`. Nothing can
revoke a signed JWT, so it expires in 15 minutes — that window is the entire
limit on a stolen one.

The **refresh token** is not a JWT. It is an opaque random string, stored as a
SHA-256 hash in `refreshtokens`, and delivered in an httpOnly cookie scoped to
`/user`. Being a database row makes it revocable; being httpOnly puts the
long-lived credential somewhere page JavaScript cannot read it.

It **rotates on every use**: `POST /user/refresh` revokes the presented token
and issues a new one. Presenting an already-rotated token means two parties
hold it, so every session for that account is revoked and the event is logged.
Two exceptions keep that signal honest rather than noisy:

- A token revoked by **sign-out or a password change** (no replacement
  recorded) simply fails. It is a stale tab, not theft.
- A token replayed **within 15 seconds** of its rotation is served normally —
  that is two browser tabs refreshing at the same moment, not an attacker.

Changing or resetting a password revokes every session. A reset issues no new
session on purpose: the new password gets proved once before it grants access.

## Rate limits

| Endpoint | Budget |
|---|---|
| `/user/login` | 5 **failed** attempts / 15 min per IP |
| `/user/register` | 10 / hour per IP |
| `/user/forgot-password`, `/user/reset-password` | 5 / hour per IP |
| `/feedback/create` | 20 / hour per IP |
| everything else | 100 / min per IP |

Successful logins don't count against the login budget, so signing in
repeatedly on a shared machine never locks anyone out. `/health` is exempt.

Behind a load balancer, set `TRUST_PROXY` — otherwise every visitor shares the
proxy's IP and one busy minute locks out the whole site. Leave it unset when
running directly: trusting an absent proxy lets a client forge
`X-Forwarded-For` and bypass the limits entirely.

## API docs

Interactive OpenAPI docs at **`/api-docs`**, and the raw spec at
`/api-docs.json`. Generated from JSDoc blocks on the route files rather than a
hand-maintained spec, because a separate spec file drifts the first time
somebody adds a field in a hurry — and a wrong spec is worse than none.

Off in production unless `ENABLE_API_DOCS=true`. The spec names every endpoint,
its shape and its role requirement, which is a map of the attack surface, and
there is an admin CMS behind this API.

## Logging

Pino. JSON in production, pretty-printed in development. Every request gets an
id (honouring an inbound `X-Request-Id`), echoed back on the response and
attached to every line the request produces — so one filter reproduces the
whole story of one visit, which a bare stack trace on a busy instance cannot.

Levels follow outcome: 5xx is `error`, 4xx is `warn`, `/health` is `debug` so
uptime polling does not become most of the log volume. Authorization headers,
cookies, passwords and tokens are redacted before anything is written — logs
are append-only and often shipped off-box, so a secret that reaches one is a
secret that has to be rotated.

## Bulk import

`POST /admin/import/{documents|services|rules}` takes an array of rows and,
by default, **only tells you what it would do**. Pass `dryRun: false` to write.

Rows reference content by **slug**, never ObjectId — the same shape as
`seed/seedData.js`, so one file works for both seeding and importing, stays
readable in review, and imports into any environment. Nobody can proofread
`507f1f77bcf86cd799439011`.

Three properties are the whole point:

- **All or nothing.** The file is fully analysed first and *every* problem is
  reported together. If one row is bad, none are written — including the good
  ones. A half-imported catalogue is worse than a rejected file.
- **A row is the record, not a patch.** Fields you leave out reset to their
  defaults, exactly as the seeder behaves. "Blank" in a spreadsheet could mean
  "unchanged" or "clear it", and only one of those can be the rule.
- **Writes go through the ordinary services.** `upsertRule` is what runs, so an
  import bumps versions, writes changelog entries, resets verification, flags
  affected saved checklists and emails their owners. An importer writing to the
  models directly would skip all of that silently.

Rules a human has marked `verified` are **skipped, never overwritten** — the
same stance the seeder takes. Verification is the most expensive work in the
product and a bulk file is unreviewed by definition.

Unknown fields are rejected rather than ignored: in a two-hundred-row file,
nobody re-reads every line to notice that `mandotory` never took effect.

The admin page at `/admin/import` ships editable templates per type, parses CSV
client-side for the flat `documents` type, and will not show the write button
until a dry run has come back clean.

## Caching

The rules engine's output is memoised in a bounded LRU (`utils/checklistCache`)
keyed on a hash of `(serviceSlug, action, state, answers)` — the answer is
identical until an editor changes something, but recomputing it costs a service
lookup, a rule resolution, condition evaluation and a document hydration query.

**Every editor action clears the whole cache.** There used to be a targeted
`invalidateService(slug)`, and while an entry held one service's own rule it
was correct. It is not any more, for two reasons:

- a **document** is shared by every rule that references it, and the cached
  result carries its name, issuing body and official URL
- a **prerequisite chain** embeds whole other services — their fees, timelines
  and document counts — inside a checklist for this one, so a passport entry
  holds a copy of the Aadhaar rule's figures

Working out which entries a given edit actually reached would mean scanning
every rule and every chain. Clearing everything costs a few seconds of
recomputation and cannot be wrong; editor actions are rare, and a stale fee
shown to someone at a counter is not the place to save a query. The targeted
function was **deleted rather than left unused**, because it still reads as
correct at a call site.

The one-hour TTL is only a backstop for the case nobody thought of.

`alreadyHave` and `targetDate` are deliberately not part of the key. The first
only decides how the same items are split into held and needed; the second
produces a plan relative to *today*, which a cache entry outliving midnight
would get wrong. Both are applied per request, after the lookup. Failures are
never cached, so publishing a service is visible at once. Multi-instance
deployments would need Redis instead — this cache is per-process.

## Input handling

Free text is stripped of markup at the boundary (`utils/sanitize.js`, wired
into the Joi schemas) rather than escaped on the way out, so no future consumer
has to remember to escape it. HTML email templates escape their interpolations
as well — they build markup by concatenation, where nothing escapes for you.

## API

Public: `/service/states`, `/service/actions`, `/service/by-state?state=`,
`/service/:slug?state=`, `/checklist/generate`, `/checklist/classify`,
`/checklist/shared/:token`, `/feedback/create`, `/changelog/service/:id`

Auth (public, cookie- or credential-based): `/user/register`, `/user/login`,
`/user/refresh`, `/user/logout`, `/user/forgot-password`, `/user/reset-password`

Authenticated: `/user/me`, `/user/change-password`,
`/checklist/save|my|detail|progress|delete`

Editor/admin: `/service/*`, `/document/*`, `/rule/*`, `/feedback/all`, `/admin/*`

Full interactive reference at `/api-docs` — see **API docs** above.

## Cron jobs

- **Link health** (Mon 03:00) — probes every official URL. Catches hard
  failures only; government sites often redirect a dead deep link to their
  homepage and still return 200, so human spot-checks remain the real net.
  Can also be triggered for a chosen set of documents from the admin CMS.
- **Re-verification** (daily 04:00) — flags rules past their review date.
  Nothing is unpublished automatically; that call belongs to a person.
- **Cleanup** (Sun 04:30) — permanently removes records soft-deleted more than
  `SOFT_DELETE_RETENTION_DAYS` ago, cascading to what depended on them (a
  deleted service takes its rules and changelog; a deleted user takes their
  saved checklists and sessions). `POST /admin/cleanup` runs the same sweep on
  demand and **defaults to a dry run** — it reports what would go without
  touching anything, because this is the one job that cannot be undone.

## Usage analytics

`AnalyticsEvent` records six things the server can actually observe: service
views, checklist generations and saves, opened share links, and searches with
and without matches. `GET /admin/usage` aggregates them.

What it deliberately does **not** record is more important than what it does.
No user id, no IP, no user agent, no session stitching, and not the search text
itself. This is a government-paperwork tool used by people in a vulnerable
position — "which documents is this person gathering" is sensitive, and the
honest way to hold it is to keep only what answers a content question. Events
expire after a year via a TTL index.

Wizard step-by-step progress is absent for the same reason: the wizard is
entirely client-side, so tracking abandonment would mean adding a beacon
endpoint whose only purpose is tracking. That is a bigger decision than a
dashboard widget.

`generationsPerView` and `savesPerGeneration` are ratios, not percentages, and
can exceed 1 — someone who tweaks their answers generates several checklists
from one view. Both are null rather than 0 when there is no traffic, because
"0%" for a quiet week reads as a failure rather than as silence.

## Bulk operations

`POST /admin/bulk/{services,documents,rules}` — publish, unpublish, verify,
delete, and re-check links across a selection.

Each item goes through the **same single-record service** the one-at-a-time UI
uses, not a blanket `updateMany`. Those services carry the integrity rules — a
document cannot be deleted while a rule references it, the national default
cannot go while states rely on it — and a bulk path that bypassed them would
let a checkbox do what the interface refuses to do one row at a time.

Partial success is reported rather than hidden: deleting eight documents where
two are still referenced deletes six and says which two were refused and why.

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
