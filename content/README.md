# Content packs

The catalogue beyond the bootstrap set. `src/seed/seedData.js` holds the
original eight services; everything after that lives here, one JSON file per
category.

## ⚠️ Nothing in here is verified

Every rule seeds with `verificationStatus: "unverified"` and every fee carries
`isEstimate: true`. These processes are run by state and municipal bodies and
differ between them — a birth certificate in Ahmedabad and one in Patna are not
the same errand.

**This is a scaffold, not an answer.** It gives the admin CMS real structure to
work against and the engine real chains to resolve. Someone has to sit down
with the official source for each rule and confirm it in the verification queue
before it is published.

The seeder leaves everything unpublished unless you pass `--publish`, and that
flag makes content *visible*, not *correct*.

## Format

A pack is exactly the [bulk-import](../README.md#bulk-import) format:

```json
{
  "documents": [ … ],
  "services":  [ … ],
  "rules":     [ … ]
}
```

Everything references everything else by **slug**, never ObjectId. The same
file therefore works two ways — `npm run seed` on a fresh environment, or
`/admin/import` on a running one — with no second format to learn and no
chance of the two drifting.

Any other top-level key is ignored, which is why these files can carry a
`_readme`.

## Loading order

Files load alphabetically, so packs are numbered. Within a run the seeder
writes **documents → services → rules**, and links `obtainedViaSlug` after
services exist — so a document may point at a service defined in the same run,
or in any pack.

The bulk importer has no such luxury: it handles one type per call and will
tell you to import services before documents that reference them.

## Adding a pack

1. Copy the shape above into `NN-category.json`.
2. Reuse existing document slugs wherever you can. The registry is shared, and
   a second "Electricity Bill" is a bug, not a document.
3. Run **`npm run content:lint`**. It validates every pack against the same
   schemas the bulk importer uses, resolves every cross-reference across the
   whole catalogue, and catches the two traps below. No database needed.
4. Run `npm run seed` and read the log — a pack that fails to parse is fatal
   rather than skipped, because an environment quietly missing a whole category
   is far harder to notice than a failed seed.

### Two traps worth knowing

**A document can only appear once per rule.** The engine unions requirements by
document id, and ownership is first-writer-wins — so listing "Aadhaar Card" for
the applicant *and* for a witness collapses into one row and silently loses the
second. Use a distinct registry entry (see `witness-id-proof`) when two
different people's copies are needed.

**Set `belongsTo` whenever the document is not the applicant's own.** Enrolling
a child under 5 needs *a parent's* Aadhaar, and without that field the row
reads as "you need an Aadhaar to get an Aadhaar". Valid values are `self`
(default), `parent`, `spouse`, `guardian`, `child`, `employer`, `witness`,
`seller`, `buyer`, `landlord`.

Pick the one that is actually true. A landlord's NOC filed under `employer`
renders as "Your employer's Premises NOC", which is worse than no label — and
adding a new value means adding `item.owner.*`, `item.ownerBadge.*` and
`item.ownerHint.*` to **both** locale files, or the badge shows a raw key.

## Packs

| File | Services | Status |
|---|---|---|
| `01-identity-civic.json` | Birth & death certificates, marriage registration, income / caste / domicile certificates, legal heir, PCC, gazette name change, UDID, senior citizen card, ABHA | Unverified scaffold |
| `02-vehicle.json` | Vehicle RC (register, transfer, address, duplicate), inter-state NOC, PUC, HSRP, international driving permit | Unverified scaffold |
| `03-work-money.json` | EPF, ESIC, GST, Udyam/MSME, FSSAI, Shop & Establishment, professional tax, e-Shram | Unverified scaffold |
| `04-property.json` | Property registration, mutation, encumbrance certificate, property tax | Unverified scaffold |
| `05-state-overrides.json` | Property mutation for Maharashtra, Karnataka and Uttar Pradesh; Tamil Nadu nativity certificate | Unverified scaffold |

**37 services, 66 actions, 71 rules, 65 documents.**

## When to write a state override

Rarely. An override is for content that genuinely differs — not for content
that merely happens somewhere else.

**If only the portal, fee or timeline changes, don't override.** Put
state-conditional *process steps* on the national rule instead: `state` is a
reserved question key the engine injects, so a step can carry
`{"questionKey": "state", "operator": "eq", "value": "gujarat"}`, and a final
fallback step using `nin` catches everywhere else. Exactly one survives. The
income, caste and domicile certificates work this way across ten states — one
document list, ten portals. Ten near-identical rules differing in a URL is what
the national-default model exists to prevent.

**Override when the document set differs.** Land records are the clear case: a
7/12 extract, an RTC and a khatauni are different records, in different systems,
under different names, and mutation asks for different things alongside each.

**And when a service does not exist somewhere, say so with `scope`.** Several
large states do not levy professional tax at all, so that service is
`scope: "state"` with an `availableStates` list. A user in Uttar Pradesh is told
it is not available there rather than sent hunting for a registration that does
not exist.
