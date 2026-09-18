# Construction module — go-live runbook

Everything below assumes you are pointing at the environment you intend to
enable. Run it top to bottom; each step's output tells you whether to continue.

---

## 0. Before you start

The construction flag defaults to **on** when nothing is set, because
`moduleEnabled.service.js` treats an absent key as enabled. Set it explicitly one
way or the other rather than relying on that default — an implicit `true` is not
a decision anybody made.

Confirm which database you are about to touch:

```bash
cd Backend
node -e "require('dotenv').config();console.log(process.env.MONGODB_URI.replace(/\/\/.*@/,'//***@'))"
```

---

## 1. Migrations

Run in this order. Each is idempotent and safe to re-run.

```bash
npm run migrate:escrow-indexes            # Phase 0 — the idempotency guarantee
npm run migrate:construction-catalogue    # Phase 2
npm run migrate:construction-contractors  # Phase 3
npm run migrate:construction-pipeline     # Phase 4
npm run migrate:construction-projects     # Phase 5
npm run migrate:construction-transparency # Phase 6 — needs MongoDB 5.0+
```

Then the cross-module index repair, which fixes fifteen unique indexes that were
never built because `$ne` is rejected inside `partialFilterExpression`:

```bash
npm run check:partial-indexes    # read-only: reports duplicates, changes nothing
npm run repair:partial-indexes   # builds them; REFUSES where duplicates exist
```

If the repair reports duplicates, resolve them by hand before continuing. A
script must not choose which duplicate survives.

---

## 2. Seed the catalogue

```bash
npm run db:seed-construction
```

Then fill in the imagery. Needs `PEXELS_API_KEY` in `.env`:

```bash
node scripts/fetch-catalogue-images.js --dry-run --provider=pexels   # preview
node scripts/fetch-catalogue-images.js --provider=pexels             # apply
```

Images are downloaded and re-uploaded to **your** Cloudinary, so the app never
depends on someone else's server staying up.

---

## 3. Verify — read-only, safe anywhere

These inspect live data and change nothing:

```bash
npm run verify:escrow
npm run verify:construction-projects
npm run verify:construction-transparency
```

---

## 4. Test — creates and removes synthetic data

**Do not run these against production.** They create records and delete them, and
the acceptance suite flips the module flag off and back on.

```bash
npm run test:construction-escrow         # 55  Phase 5 — projects and escrow
npm run test:construction-transparency   # 75  Phase 6 — documents, chat, disputes
npm run test:construction-admin          # 49  Phase 7 — dashboard, reports, reassign
npm run test:construction-acceptance     # 51  Phase 8 — the go-live gate
```

Or all four at once:

```bash
npm run test:construction-all
```

Plus the three earlier suites:

```bash
node scripts/verify-escrow-holds.js            # 43
node scripts/verify-contractor-onboarding.js   # 25
node scripts/verify-construction-pipeline.js   # 44
```

**342 checks in total. Every one must pass before the flag goes on.**

---

## 5. Turn it on

The flag lives on the shared `GlobalSettings` document under `modules`. Set it
from the admin panel's module switcher, or directly:

```js
db.globalsettings.updateOne({}, { $set: { "modules.construction": true } })
```

The service caches for 10 seconds, so allow a moment before testing.

---

## 6. Confirm by hand

Ten minutes, in this order:

1. Log in as a customer → the **Construction** tab appears in the service strip
2. Open `/construction` → catalogue loads with images, search works
3. Raise an enquiry → it appears under **Enquiries**
4. Log in as a contractor at `/contractor/login` → separate login, own screens
5. Accept the lead, send a quote → it appears in the customer's **My Quotes**
6. Accept the quote → a project is created, showing **awaiting funding**
7. Fund it → customer balance unchanged, `lockedAmount` rises
8. Submit a stage with a photo → approve it → contractor wallet credited
9. Admin → `/admin/construction/dashboard` → the project appears, money reconciles
10. Admin → **Activity Record** → every action above is listed

---

## 7. If something goes wrong

**Stop new work without stranding anyone.** Turn the flag off. New enquiries stop
immediately; open projects can still be funded, approved, released, handed over
and closed. That behaviour is deliberate and is proved by acceptance check 3 —
see Appendix B8 in the blueprint for why.

**Stop one project.** Put it on hold from its admin screen. Nothing releases
until it resumes, and the reason is recorded.

**Stop one payment.** Either side can raise a dispute on the stage, which freezes
exactly that stage's money and nothing else.

**Check the money.** `npm run verify:construction-projects` reconciles every
project against the escrow ledger and reports drift without repairing it —
because money drifting is something a person should look at.

---

## Still open

**BRD Q8 — written legal confirmation that SMS Pro may hold customer funds.**

This is the one item that is not a code question. Phase 5 holds customer money,
and Phase 6 freezes and redistributes it during a dispute. Holding customer funds
in India carries regulatory obligations, and the platform is now doing it in
production the moment this flag goes on.

Everything in this runbook can be completed without it. Whether it *should* be is
your call to make, not the code's.
