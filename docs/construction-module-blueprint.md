# Construction Module — Master Architecture Blueprint

### SMS Pro Ecosystem — Module 01, Construction Services

**Status:** Architecture blueprint only. No code, schema, or API was written or modified as part of this document. This is a planning artifact for review and approval before implementation begins.

**Source requirement:** `docs/SMS_Pro_Construction_Summary_BRD_FRD_1.pdf` (v1.0, Simple English Edition, 22 Aug 2026).

**Scope of analysis:** `Backend/src` (Node 24 / Express 4 / Mongoose 8) and `Frontend/src` (React 19 / Vite / Tailwind v4).

**Companion documents:** `MULTI_MODULE_PLATFORM_GUIDE.md` (§7 "How To Add A New Module" is the contract this blueprint satisfies), `docs/taxi-module-blueprint.md` (structural precedent).

---

## PHASE 0 — Decisions This Blueprint Locks In

Four decisions were taken before drafting. Everything below follows from them.

| # | Decision | Chosen | Consequence |
|---|---|---|---|
| D1 | Deliverable | Technical spec + implementation plan | No code written yet; this doc is reviewable first |
| D2 | Escrow design | **Core** hold/release ledger; fix the shared wallet | Satisfies BRD Rules 2 & 3; benefits all modules; touches shared money code — see §2.1 risk register |
| D3 | Contractor identity | **New `CONTRACTOR` role + own profile collection** | Mirrors `ServiceProviderProfile` / `BikeVendor`; escapes the one-category / one-zone constraint |
| D4 | Unanswered BRD questions | **Admin-configurable, no hardcoding** | Service list, quote schema, stage rules, commission model all become admin-managed data |

D4 is the important one strategically: it converts BRD blocking questions **3, 5, 6, 7 and the commission half of 8** from build-blockers into configuration. See §7.

### BRD blocking questions — status after these decisions

| BRD Q | Question | Status |
|---|---|---|
| 1 | Full project system or service booking? | **Answered — full project system.** Code review confirms nothing in the platform models a long-lived staged job |
| 2 | One-category-at-a-time lock for long projects | **Void — the premise is incorrect.** See §1.5 |
| 3 | What construction services to offer | **Deferred to config** (§7.1) — client fills the catalogue via admin UI |
| 4 | Customer chooses contractor, or app assigns? | **Still blocking.** See §9 |
| 5 | Can several contractors quote the same enquiry? | **Deferred to config** — `allowMultipleQuotes` flag (§7.4) |
| 6 | What goes into a quotation | **Deferred to config** (§7.2) — line-item schema is admin-defined |
| 7 | Who decides stages and percentages | **Deferred to config** (§7.3) — three modes supported |
| 8 | Money-holding model and release trigger | **Half answered.** Mechanism designed (§2); the *legal/regulatory* confirmation is still client-side. See §9 |

---

## PHASE 1 — Reusability Audit

### 1.1 Reusable without changes

| Capability | Location | Notes |
|---|---|---|
| Shared customer identity | `core/users/user.model.js` → `common_users` | BRD Rule 1 already satisfied. Contractors resolve to the same record via `findOrCreateUserByPhone` |
| OTP issue/verify | `core/otp/otp.service.js` | Dev bypass via `config.useDefaultOtp` |
| JWT access/refresh | `core/auth/token.util.js` | Separate secrets; refresh persisted in `FoodRefreshToken` |
| Admin RBAC engine | `core/auth/auth.middleware.js` → `checkPermission` | 30s cache, `::` hierarchical prefix matching |
| Role gate | `core/roles/role.middleware.js` → `requireRoles` | |
| Module kill-switch | `core/modules/moduleEnabled.service.js` | `assertModuleEnabled()` |
| Idempotency | `core/idempotency/idempotencyKey.model.js` | 24h TTL, unique `(key, scope)`. Required by BRD §13 "system prevents double payment" |
| Sequence codes | `core/models/counter.model.js` | Gives enquiry reference numbers (BRD C5) and contractor codes |
| Geo / address | `core/location/*`, `address.schema.js` | Site location picking (BRD C3) |
| Razorpay + webhook dedupe | `core/payments/*`, `processedWebhookEvent.model.js` | |
| Uploads | `modules/uploads`, Cloudinary | Progress photos, drawings |
| Socket.IO | `config/socket.js` | Room-per-actor pattern |
| API response shape | `utils/response.js` — `sendResponse` / `sendError` | |
| Validation idiom | Zod DTO validators, e.g. `service-provider/validators/onboarding.validator.js` | Per-step `validateStepNDto` |
| Approval-queue pattern | `serviceProviderProfile.model.js` + `serviceProviderAuth.service.js` | Direct template for contractor onboarding |

### 1.2 Reusable with small extension

| Capability | Extension needed |
|---|---|
| `GlobalSettings.modules` | Add `construction: { type: Boolean, default: false }` — ships OFF per platform guide §7 |
| `moduleKeys.js` | Add `construction` to `SETTINGS_TO_DRIVER` / `DRIVER_TO_SETTINGS` / `MODULE_PERMISSION_ROOTS`. Without this, `toSettingsModuleKey` returns `null` and `assertModuleEnabled` silently falls back to string matching |
| `MODULE_PERMISSION_CATALOG` | Add a `construction` namespace (§5.2). Note: `bikeRent` and `serviceProvider` are **already missing** — worth backfilling in the same PR |
| `FoodAdmin.servicesAccess` enum | Currently `['food','quickCommerce','taxi','bikeRent']`. Add `construction` — and backfill the already-missing `porter`, `serviceProvider` |
| `FoodNotification.ownerType` | Currently `['USER','RESTAURANT','DELIVERY_PARTNER']`. Add `CONTRACTOR` |
| `FoodNotification.source` | Currently `['ADMIN_BROADCAST','FSSAI_EXPIRY']`. Add construction sources (`STAGE_DUE`, `STAGE_APPROVED`, `PAYMENT_RELEASED`, `DOC_EXPIRY`, `DELAY_ALERT`) |
| `socket.js` `roomNames` | Add `contractor: (id) => 'contractor:' + id`; auto-join on `role === 'CONTRACTOR'`; add `join-contractor` mirroring `join-provider` |
| `Transaction.entityType` | Add `contractor` (see §2.3) |
| `Transaction.category` | Add `escrow_hold`, `escrow_release`, `escrow_refund`, `retention_hold`, `retention_release` |
| Frontend `enabledModules.js` | Add to `DEFAULT_ENABLED_MODULES`, `MODULE_LABELS`, `MODULE_LANDING_PATHS`, `TAB_TO_MODULE_KEY`, `MODULE_KEY_TO_TAB` (**note `serviceProvider` is already missing from `MODULE_KEY_TO_TAB`**), `resolveModuleKeyFromPath`, `getVisibleHomeTabs` |
| `AdminModuleSwitcher.jsx` | Add construction entry (`serviceProvider` also missing today) |

### 1.3 Needs refactoring before construction can be built

| Problem | Current state | Required |
|---|---|---|
| **Escrow is dead code** | `lockWalletAmount` / `unlockWalletAmount` exist at `core/payments/wallet.service.js:84`. They resolve `entityType:'user'` → `FoodUserWallet` correctly, but **`FoodUserWallet` has no `lockedAmount` field**, so Mongoose strict mode silently drops the write. Neither function is called anywhere in the codebase | §2.1 — make holds real |
| **`Payment` is Food-shaped** | `Payment.orderId` is `required` and refs `FoodOrder`. `Payment.create` is called from exactly one site | §2.3 — decouple |
| **Ledger already bypassed** | service-provider and bike-rent skip `Payment`/`Transaction` entirely and call `deductWalletBalance` on `FoodUserWallet` directly, keeping payment state on their own booking docs | §2.3 — construction must not repeat this |
| **Stored balances** | `FoodUserWallet.balance`, `FoodUser.walletBalance` and `Transaction.balanceAfter` are stored mutable numbers kept in sync by `syncUserWalletBalance`. BRD Rule 3 requires balances be *derived* | §2.2 — reconciliation, not rewrite |
| **Auth is uneven** | `authMiddleware` does a live DB re-check for `USER` and `DELIVERY_PARTNER` only. All other roles hit `return next()` with no check. A suspended contractor keeps working until token expiry | §5.1 — `requireApprovedContractor` on every route |

### 1.4 Genuinely missing infrastructure

Nothing in the repo provides these. All are greenfield.

| BRD ref | Missing capability |
|---|---|
| C10–C13, W10–W13 | Quotation engine — line items, sections, versioning, comparison, templates |
| C15–C17, W15–W16 | Milestone/stage lifecycle with evidence-gated approval |
| §13 steps 1–7 | Escrow: fund → hold → stage-release → retention |
| C19 | Versioned document vault with supersede semantics |
| C20 | **Project messaging — there is no chat system anywhere in this repo, in any module** |
| Q15 | Dispute resolution — nothing, in any module |
| A10, Rule 4 | Platform-level immutable audit log. Only `BikeAuditLog` exists, bike-rent-scoped |
| W18 | Trust score |
| C18 | Schedule-delay detection and alerting |
| — | Any long-lived aggregate. Every model in the repo is a short-lived order/ride/booking |

### 1.5 Correction to BRD §6

> BRD §6 claims a service provider's category "is locked the moment they accept a job, and unlocks only when that job is finished", producing a six-month lockout for construction. It calls this blocking question #2.

**The code does not do this.** At `modules/service-provider/services/providerCatalog.service.js:96-100` the rule is that a provider's **catalogue** may contain services from only one category. It is a configuration-time constraint, it does not trigger on job acceptance, and approved providers can change their selection at any time via `updateProviderServices`.

A runtime busy lock does exist (`core/dispatch/driverBusyLock.service.js`, Redis, 2h TTL) but applies to `DELIVERY_PARTNER` dispatch only. Service providers are matched purely on slot availability — no provider is ever blocked by an in-flight job.

**Therefore BRD Q2 requires no platform change.** Under D3, contractors get their own collection and are not subject to the provider catalogue rule at all. The real constraint worth designing for is that a contractor spans multiple trades (civil + electrical + finishing) — handled natively in §3.2 via `trades[]`.

---

## PHASE 2 — Core Platform Changes (Decision D2)

This is the highest-risk phase because it touches money code all six live modules depend on. It ships **first and alone**, behind its own PR, with construction consuming it afterwards.

### 2.1 The hold/release ledger

**Principle:** money is never moved to hold it. A hold is a *claim* against the customer's wallet balance, recorded in an append-only ledger. Balance stays put; spendable balance shrinks.

**New field** on `FoodUserWallet`:
```
lockedAmount: { type: Number, default: 0, min: 0 }
```

**New core collection** `wallet_holds` — one row per active hold:

| Field | Purpose |
|---|---|
| `userId` | Wallet owner |
| `module` | `'construction'` — holds are a platform primitive, not construction-only |
| `refType` / `refId` | `'construction_project'` / project id |
| `amountHeld`, `amountReleased`, `amountRefunded` | Running totals, derived from the ledger |
| `status` | `active` \| `settled` \| `cancelled` |
| `idempotencyKey` | Unique |

**New core append-only ledger** `wallet_hold_ledger` — modelled on the working `BikeDepositLedger`:

| Field | Purpose |
|---|---|
| `holdId`, `userId`, `module` | Links |
| `entryType` | `hold` \| `release` \| `refund` \| `adjust` |
| `amount` | Always positive; `entryType` carries direction |
| `reason`, `reference` | `reference` **unique-indexed with a partial filter** — the idempotency guarantee (same pattern as `bike_deposit_ledger`) |
| `performedBy` | `actionPerformerSchema` — satisfies BRD Rule 4 "who did it" |
| `meta` | Stage id, approval id |

**No updates, no deletes.** Corrections are new `adjust` rows. This is BRD Rule 3 applied to the escrow layer, where it matters most.

**Functions to fix/add** in `core/wallet/`:

| Function | Behaviour |
|---|---|
| `createHold({userId, module, refType, refId, amount, idempotencyKey})` | Assert `available >= amount`; insert ledger `hold` row; `$inc lockedAmount`. Single Mongo transaction |
| `releaseHold({holdId, amount, toEntityType, toEntityId, reference, performedBy})` | Ledger `release` row; `$inc lockedAmount -amount`; debit balance; credit payee. Single transaction |
| `refundHold({holdId, amount, reference, performedBy})` | Ledger `refund` row; unlock without debiting — money returns to spendable |
| `getAvailableBalance(userId)` | `balance - lockedAmount` |
| `reconcileHold(holdId)` | Recompute totals from ledger; assert they match the hold doc |

**Risk register for this phase:**

| Risk | Mitigation |
|---|---|
| Every existing debit path checks `balance`, not `available`. A customer with ₹5L held for construction could spend it on food | **This is the critical change** — see the exact fix below |
| `lockWalletAmount` currently no-ops silently | Replaced outright by `createHold`. Delete the dead functions rather than leaving two mechanisms |
| Mongo transactions require a replica set | Verify the deployment target. Fall back to the compensating-write pattern already used in `service-provider/payment.service.js` if standalone |
| Retro-fitting `lockedAmount` onto live wallets | Field defaults to `0`; no backfill migration needed. Existing wallets are unaffected until a hold is created |

**The exact debit fix.** `deductWalletBalance` (`modules/food/user/services/userWallet.service.js:237`) is the single shared debit path — called by food, quick-commerce, porter, taxi, bike-rent and service-provider. It guards against overdraft atomically inside `findOneAndUpdate`:

```js
const debitFilter = { userId: oid, balance: { $gte: amount } };
```

That `balance` must become *available* balance. Because the comparison references another field in the same document, it has to move to `$expr`:

```js
const debitFilter = {
  userId: oid,
  $expr: {
    $gte: [
      { $subtract: ['$balance', { $ifNull: ['$lockedAmount', 0] }] },
      amount,
    ],
  },
};
```

`$ifNull` matters: wallets created before the schema change have no `lockedAmount` key at all, and `$subtract` against a missing field yields `null`, which would fail every comparison and block all debits platform-wide. This one line is the difference between a safe rollout and an outage.

The atomicity guarantee is preserved — the check and the `$inc` stay in the same `findOneAndUpdate`, so concurrent debits still cannot race past the balance. The existing per-`orderId` double-debit guard is untouched.

**Regression scope:** every wallet-payment path in all six live modules, plus the failure branch (the function's "insufficient balance" error message should now distinguish *insufficient* from *held*, or customers will see a wrong reason).

**Found while building — the authoritative guard is the hold, not the wallet lock.** `lockedAmount` is an *aggregate* across every hold a user has. If a customer funds two projects and a release is attempted against one of them, a check against `lockedAmount` can pass using money reserved for the *other* project. Worse, two concurrent releases against the same hold can both pass a pre-read check. Every release and refund therefore carries its outstanding-amount guard in the `WalletHold` update filter itself:

```js
$expr: { $gte: [
  { $subtract: ['$amountHeld', { $add: ['$amountReleased', '$amountRefunded'] }] },
  releaseAmount,
] }
```

The hold row is decremented *first*, inside the transaction; the wallet lock and payee credit follow. Two racing releases hit that filter and exactly one wins. `scripts/verify-escrow-holds.js` §8 reproduces both scenarios.

### 2.2 BRD Rule 3 — derived balances

Full "never store a balance" is a rewrite of the platform's money layer and is **out of scope for this module**. The proportionate answer:

1. The **escrow ledger is strictly append-only and authoritative** — held/released/refunded are always derived, never stored as an editable number
2. `wallet_holds` totals are a **cache**, verifiable by `reconcileHold()`
3. A scheduled reconciliation job (BullMQ, existing infra) asserts the BRD §13 invariant nightly:
   `held + released + refunded === agreed project value` — and alerts admins on drift
4. `FoodUserWallet.balance` stays as-is, documented as a cache of the `Transaction` ledger

This gives the BRD's actual guarantee — *financial records that cannot be altered and always reconcile* — without destabilising six live modules. **Flag to client:** this is a deliberate interpretation of Rule 3, not full compliance.

### 2.3 Contractor payee wallet

Two options; recommendation is (a).

**(a) Extend the core ledger — recommended.** Add `'contractor'` to `Transaction.entityType`, add a `ConstructionContractorWallet` to `resolveWallet()` in `core/payments/transaction.service.js`. Contractor earnings then flow through `recordTransaction()` — the atomic ledger + wallet write — the same path restaurants and drivers use. Honours BRD Rule 2.

**(b) Module-local wallet**, like `BikeVendorWallet`. Faster, but repeats the drift documented in §1.3.

`Payment.orderId` must be relaxed from `required` + `ref:'FoodOrder'` to an optional polymorphic `(refType, refId)` so construction stage payments can create real `Payment` rows instead of bypassing them.

### 2.4 Platform audit log

BRD Rule 4 and A10 demand an unchangeable record of every significant action, *including staff actions*.

Promote the proven `BikeAuditLog` shape to `core/audit/auditLog.model.js`, collection `platform_audit_logs`: `module`, `entityType`, `entityId`, `action`, `before`, `after`, `performedBy` (`actionPerformerSchema`), `meta`. No update or delete methods exposed. Construction writes to it on every quote send/accept, stage approval, money release, admin intervention and status change.

---

## PHASE 3 — Construction Domain Design

All collections prefixed `construction_`. Backend at `Backend/src/modules/construction/`, following the house layout: `routes → controllers → services → models`, plus `validators/`, `middleware/`, `state/`, `utils/`.

### 3.1 Model inventory

| # | Model | Collection | BRD ref |
|---|---|---|---|
| 1 | `ConstructionCategory` | `construction_categories` | C1, A8, Q3 |
| 2 | `ConstructionService` | `construction_services` | C1, C2, A8 |
| 3 | `ContractorProfile` | `construction_contractors` | W1–W5, A2, A3 |
| 4 | `ContractorDocument` | `construction_contractor_documents` | W3, Rule 6 (expiry tracking) |
| 5 | `ContractorPortfolio` | `construction_portfolios` | W5, C7 |
| 6 | `ConstructionEnquiry` | `construction_enquiries` | C3–C5, A4 |
| 7 | `ContractorLead` | `construction_leads` | W6, W7, Q5 |
| 8 | `SiteVisit` | `construction_site_visits` | C9, W8, W9 |
| 9 | `Quotation` | `construction_quotations` | C10–C13, W10–W13 |
| 10 | `QuotationTemplate` | `construction_quotation_templates` | W13 |
| 11 | `Project` | `construction_projects` | C14, A5 — **the long-lived aggregate** |
| 12 | `ProjectStage` | `construction_project_stages` | C15, C17, W12, W16 |
| 13 | `StageSubmission` | `construction_stage_submissions` | C16, W15 |
| 14 | `ProjectDocument` | `construction_project_documents` | C19 |
| 15 | `ProjectMessage` | `construction_project_messages` | C20 |
| 16 | `ProjectDispute` | `construction_disputes` | Q15 |
| 17 | `ConstructionSettings` | `construction_settings` | §7 — singleton |
| 18 | `ContractorScore` | `construction_contractor_scores` | W18 |

Audit rows go to the shared `platform_audit_logs` (§2.4). Money rows go to the shared escrow ledger (§2.1). **No module-local ledger.**

### 3.2 ContractorProfile — the D3 core

Modelled directly on `ServiceProviderProfile`, with construction-specific additions:

```
providerCode      → contractorCode      "CTR000001" via Counter
userId            → ref FoodUser        REQUIRED — shared identity, BRD Rule 1
businessName, businessType             individual | proprietorship | partnership | pvt_ltd | llp
ownerName, email, phone/phoneDigits/phoneLast10
trades[]          → ref ConstructionCategory   MULTIPLE — deliberately not the provider one-category rule
serviceZones[]    → ref (city/zone)     MULTIPLE — contractors travel further than plumbers
projectSizeMin / projectSizeMax        W2 — the size of projects handled
maxConcurrentProjects                  W2 — resolves BRD Q2 properly: a declared capacity, not a lock
travelRadiusKm                         W2
yearsExperience, about, profileImage
bank {...}                             same shape as provider
documents {...}                        + expiresAt per doc, for Rule 6 expiry warnings
status            onboarding | pending_approval | approved | rejected | suspended
onboardingStep    1..7
rejectionReason, rejectedSnapshot, statusHistory[]
submittedAt / approvedAt / rejectedAt / approvedBy / reviewedBy
rating, totalRatings, trustScore
isActive, isDeleted, lastLoginAt, fcmTokens[]
```

Indexes mirror the provider model: unique sparse `contractorCode`; unique `userId` partial on `isDeleted:false`; unique `phoneLast10` partial; compound `(status, createdAt desc)`.

**Enterprise customers (BRD §5)** — organisations with several staff on one project at different permission levels — are noted as designed-for but **not built in phase 1**. `Project` carries a `participants[]` array (`userId`, `role: owner|viewer|approver`, `canApproveStages`, `canApprovePayments`) from day one so the capability can be switched on without a migration. Flagged in §9.

### 3.3 State machines

Implemented as explicit transition tables in `modules/construction/state/`, following `bike-rent/state/bookingStateMachine.js`.

**Enquiry** (BRD steps 3–9)
```
draft → submitted → matching → visit_scheduled → visit_completed
      → quoted → negotiating → accepted → converted
      ↘ closed_lost (reason required)   ↘ expired
```

**Quotation** (C10–C13, W10–W13)
```
draft → sent → under_review → revision_requested → revised(v+1) → accepted
                                                                ↘ rejected (reason required)
                                                                ↘ expired (validUntil passed)
```
Every revision is a **new immutable version row**, never an in-place edit — BRD C12 requires both sides can see exactly what changed.

**Project** (steps 9–16)
```
created → awaiting_funding → active ⇄ on_hold(admin, A6)
        → stages_complete → handover_pending → completed → closed
        ↘ cancelled (Q14 policy applies)
```

**Stage** (steps 12–15) — the money-critical one
```
pending → in_progress → submitted_for_approval → approved → payment_released
                                               ↘ rejected → in_progress
                                               ↘ disputed → (dispute resolution)
```
`approved → payment_released` is the **only** transition that calls `releaseHold()`, and it is idempotent on `reference = 'stage_release_' + stageId`.

### 3.4 The money flow (BRD §13)

| Step | System action |
|---|---|
| 1. Customer funds project | Wallet top-up (existing Razorpay path) → `createHold({refType:'construction_project', refId, amount})` |
| 2. Money held, not moved | Balance unchanged, `lockedAmount` up. Contractor sees `fundedAmount` on their dashboard — knows it is real, cannot touch it |
| 3. Contractor completes stage | `StageSubmission` with dated photos. EXIF/server timestamp recorded — BRD wants *dated* proof |
| 4. Stage approved | Customer, or a supervisor if `stageApprovalMode` allows (§7.3) |
| 5. Release | `releaseHold(stageAmount)` → ledger `release` row → debit customer balance → credit contractor wallet, minus platform commission (§7.5) |
| 6. Repeat | Per stage |
| 7. Retention | `retentionPercent` of the total stays held for `defectLiabilityDays` past handover, then auto-refunds or releases |

**Invariants enforced in code and by the nightly reconciliation job:**
- `sum(stage.amount) === project.agreedValue`
- `held + released + refunded === project.agreedValue`
- No release without a matching approved stage
- No release exceeding the stage amount
- Every release idempotent on its stage reference

### 3.5 Delay detection (C18)

A BullMQ repeatable job — the platform already runs workers (`worker:all`, `node-cron` present). Daily: find stages where `targetDate < now` and `status ∉ {approved, payment_released}`; emit `DELAY_ALERT` to both parties and flag on the admin dashboard (A1). Also drives the "enquiries gone quiet" highlight for A4 and document-expiry warnings for Rule 6.

---

## PHASE 4 — API Surface

Mounted at `/api/v1/construction`, registered in `Backend/src/routes/index.js`, gated by a route-level `requireConstructionModuleEnabled` wrapper — exactly the pattern at `service-provider/routes/serviceProvider.routes.js`.

### 4.1 Contractor-facing (`role: CONTRACTOR`)
```
POST   /auth/request-otp                    public
POST   /auth/verify-otp                     public → {needsRegistration, resumeStep, tokens}
GET    /auth/me
GET    /onboarding/draft
POST   /onboarding/submit                   one-shot validate-all, → pending_approval
GET    /onboarding/categories | /zones
GET    /leads                               W6  enquiry feed
POST   /leads/:id/accept | /decline         W7
POST   /site-visits/:id/propose | /confirm  W8
POST   /site-visits/:id/report              W9  structured form + photos + geo proof
GET    /quotations | POST /quotations       W10 builder
POST   /quotations/:id/revise               new version row
POST   /quotations/:id/send
GET    /quotation-templates | POST | DELETE W13
GET    /projects | GET /projects/:id        W14 workspace
POST   /projects/:id/stages/:sid/progress   W15
POST   /projects/:id/stages/:sid/submit     W16
GET    /earnings                            W17
GET    /score                               W18
```

### 4.2 Customer-facing (`role: USER`)

**All routes authenticated — BRD Rule 5 makes construction a protected service. No public browsing endpoints.**
```
GET    /services | /services/:id            C1, C2
POST   /enquiries                           C3, C4
GET    /enquiries | /enquiries/:id          C5
GET    /enquiries/:id/contractors           C6, C8
GET    /contractors/:id                     C7
POST   /site-visits                         C9
GET    /quotations/:id                      C10
GET    /enquiries/:id/quotations/compare    C11
POST   /quotations/:id/query | /request-revision   C12
POST   /quotations/:id/accept | /reject     C13  ← creates the Project
GET    /projects/:id                        C14
GET    /projects/:id/stages                 C15
GET    /projects/:id/gallery                C16
POST   /projects/:id/stages/:sid/approve    C17  ← releases payment
GET    /projects/:id/documents              C19
GET/POST /projects/:id/messages             C20
GET    /projects/:id/payments               C21
POST   /projects/:id/fund                   C22  ← creates the hold
POST   /projects/:id/handover | /rate       C23
POST   /projects/:id/disputes               Q15
```

### 4.3 Admin (`role: ADMIN | EMPLOYEE` + `checkPermission`)
```
GET    /admin/dashboard                     A1
GET    /admin/contractors/pending           A2
POST   /admin/contractors/:id/approve|reject|suspend|activate   A2, A3
GET    /admin/enquiries                     A4
GET    /admin/projects                      A5
POST   /admin/projects/:id/hold|resume|reassign|close           A6
GET    /admin/payments/holds                A7
POST   /admin/payments/:id/block|approve    A7
CRUD   /admin/categories | /admin/services  A8
GET    /admin/reports/*                     A9
GET    /admin/audit                         A10
GET/PUT /admin/settings                     §7
GET    /admin/disputes | POST /:id/resolve  Q15
```

Every state-changing customer and contractor route accepts `Idempotency-Key`; funding and stage-approval routes **require** it.

---

## PHASE 5 — Auth & Authorization Wiring

### 5.1 The `CONTRACTOR` role

New role constant `CONTRACTOR`. OTP login mirrors `verifyServiceProviderOtpAndLogin`: verify OTP → `findOrCreateUserByPhone` (shared `FoodUser`) → find-or-create `ContractorProfile` draft → mint session carrying `{userId: contractorId, role: 'CONTRACTOR', linkedUserId: foodUserId}`.

**Critical:** `authMiddleware` has no live DB check for roles beyond `USER` and `DELIVERY_PARTNER` (§1.3). Two options:

- **(a) Recommended, low blast radius:** `requireApprovedContractor` on every contractor route, copying `requireApprovedServiceProvider`. Checks `status === 'approved'`, `isActive`, `isDeleted`, pins `req.contractorId` for query scoping. Satisfies BRD Rule 6.
- **(b)** Add a `CONTRACTOR` branch to `authMiddleware` alongside the `USER` / `DELIVERY_PARTNER` ones. Cleaner, but edits shared middleware in the same release as the money changes.

Take (a) now, consider (b) as a later consolidation that also fixes `SERVICE_PROVIDER` and `BIKE_VENDOR`.

### 5.2 RBAC namespace

```
construction::enquiries
construction::contractors
construction::projects
construction::quotations
construction::payments
construction::disputes
construction::settings
construction::reports
```
Added to `MODULE_PERMISSION_CATALOG` in `core/constants/permissions.js`. The `::` prefix matching in `checkPermission` gives sub-key granularity free.

**BRD A7 requires a two-person rule on money.** `construction::payments` with action `edit` gates blocking/approving a release; it must not be granted by the default employee role. Recommend an explicit `Construction Finance` role.

### 5.3 Module gating

- `GlobalSettings.modules.construction`, **default `false`** (platform guide §7: ship with the flag off)
- `assertModuleEnabled('construction')` on every create/book/quote/fund path — **not** on read, tracking, approval, release or dispute paths, so open projects still complete when the module is switched off (guide §6.2). For a multi-month project this matters far more than for a food order
- `moduleKeys.js` mappings added so the settings key resolves properly
- Frontend `ModuleAccessGuard moduleKey="construction"`

---

## PHASE 6 — Frontend Surface

```
Frontend/src/modules/construction/
  user/        pages/ components/ services/ context/
  contractor/  pages/ components/ context/ hooks/ services/ utils/
  admin/       pages/ routes/ services/ utils/
  shared/
  routes.jsx
```

Route prefixes, all wrapped in `ModuleAccessGuard` **and** `ProtectedRoute requiredRole="user"` (BRD Rule 5):

| Path | Actor |
|---|---|
| `/construction/*` | Customer |
| `/contractor/*` | Contractor (own login, own layout — mirrors `serviceProvider/provider/`) |
| `/admin/construction/*` | Admin |

Auth token storage: `AuthContext` currently keys tokens by `customer / seller / admin / delivery` and derives the role from the URL prefix (`getCurrentRoleFromUrl`). A contractor session needs its own key + prefix branch, exactly as `hasServiceProviderSession` does today in `routes.jsx`.

**BRD Q19** ("do contractors use the same app as plumbers?") is answered structurally: one deployed SPA, separate route surface and separate login — the pattern already proven by `serviceProvider/provider/`. No second app to build or maintain.

Design system: reuse `shared/components/ui/*` and `shared/components/admin/*`. The contractor dashboard is closest to `serviceProvider/provider/`; the admin screens to `serviceProvider/admin/`.

---

## PHASE 7 — Configurability (Decision D4)

Everything the BRD leaves unanswered becomes admin-managed data in `ConstructionSettings` (singleton) plus the catalogue collections. This is what makes BRD Q3, Q5, Q6, Q7 non-blocking — and BRD A8 asks for it independently.

### 7.1 Service catalogue (answers Q3)
`ConstructionCategory` → `ConstructionService`, admin CRUD, no code deploy. Fields per service: name, description, "what it typically covers", typical duration, example projects (C2), default stage template, quote line-item template.

### 7.2 Quotation schema (answers Q6)
`ConstructionSettings.quotation`:
- `lineItemFields[]` — admin-defined columns (default: description, quantity, unit, rate, amount)
- `sectionsEnabled` + `defaultSections[]` (civil, electrical, plumbing, finishing)
- `taxMode` — `none | inclusive | exclusive`, `taxLabel` (GST), `defaultTaxPercent` → also answers Q12
- `defaultValidityDays`, `standardTerms`, `standardExclusions`
- `requireExclusions: true` — W11, since most disputes start with an assumed inclusion

### 7.3 Stage rules (answers Q7 and Q13)
`ConstructionSettings.stages.mode`:
- `platform_fixed` — admin defines stage templates per service type
- `contractor_proposed` — contractor sets stages in the quote (W12)
- `negotiated` — proposed then editable during negotiation

Plus `stageApprovalMode`: `customer_only` | `customer_or_supervisor` | `supervisor_required` — **directly answers Q13**, including the BRD's own worry that a difficult customer could unfairly withhold a contractor's payment. Plus `autoApproveAfterDays` as an optional backstop.

### 7.4 Matching & quoting (partially answers Q4, Q5)
- `allowMultipleQuotes` (bool) + `maxQuotesPerEnquiry` → **Q5 becomes a toggle**
- `leadDistributionMode`: `broadcast | shortlist | round_robin`
- `shortlistSize` — supports the BRD's own recommendation for Q4 (app suggests a shortlist, customer chooses)
- `leadResponseHours` before reassignment (W7 — a fast decline beats a slow non-answer)

Q4 still needs a client decision because it changes the *customer UI*, not just config. See §9.

### 7.5 Commission (partially answers Q8)
`ConstructionSettings.commission`:
- `model`: `percentage | fixed | per_lead | subscription | none`
- `value`, `tieredRules[]` (by project value)
- `chargedAt`: `on_acceptance | per_stage | on_completion`
- `chargedTo`: `contractor | customer | split`

All five models are structurally supported so the client's answer is a settings change. The **legal/regulatory** half of Q8 — whether SMS Pro Venture may hold customer funds at all — is not a code question. See §9.

### 7.6 Cancellation & retention (answers Q14 partially, Q11)
- `retentionPercent`, `defectLiabilityDays` (BRD §13 step 7)
- `cancellationPolicy`: notice days, completed-work valuation method, held-money split
- `siteVisitCharged` (bool) + `siteVisitFee` + `refundIfQuoteRejected` → **answers Q11**
- `variationOrdersEnabled` → the mechanism for Q14 mid-project scope change: a variation order is a quote addendum that, once accepted, adjusts `agreedValue` and creates/resizes stages. Without it the agreed price cannot legitimately change

---

## PHASE 8 — Build Sequence

Eight phases. Each ships independently; construction stays flag-off until Phase 7 passes QA.

| Phase | Contents | Gate |
|---|---|---|
| **0. Core money** ✅ **BUILT** | §2.1 hold ledger, `lockedAmount`, fix `deductWalletBalance` to use `available`, §2.4 audit log, §2.3 contractor wallet | **Full regression across all six live modules.** Nothing else starts until this is green — run `npm run migrate:escrow-indexes` then `npm run verify:escrow` |
| **1. Registries** ✅ **BUILT** | Module flag (off), `moduleKeys`, RBAC namespace, `servicesAccess`, notification enums, socket room, frontend `enabledModules` + switcher. Backfilled the missing `bikeRent` / `serviceProvider` / `porter` entries — and fixed `ADMIN_SERVICES_ALLOWED`, which was silently stripping `porter` and `serviceProvider` from any admin who saved their profile | Existing modules unaffected |
| **2. Catalogue + settings** ✅ **BUILT** | Models 1, 2, 17. Admin CRUD (A8) + settings UI (§7) + customer C1/C2 + Rule 5 enforcement | Client can fill the service list — unblocks Q3. Run `npm run migrate:construction-catalogue` first |
| **3. Contractor onboarding** ✅ **BUILT** | Models 3, 4, 5. OTP auth, 7-step onboarding, `requireApprovedContractor`, admin approval queue (A2, A3), document expiry cron, contractor + admin UI | `npm run migrate:construction-contractors` then `npm run verify:contractors` — 25/25. Frontend builds clean |
| **4. Enquiry → quote** ✅ **BUILT** | Models 6, 7, 8, 9, 10. Enquiry, matching, leads, site visits, quotation builder + versioning + comparison, templates, admin pipeline, full customer + contractor + admin UI | `npm run migrate:construction-pipeline` then `npm run verify:pipeline` — 38/38. Frontend builds clean |
| **5. Project + escrow** ✅ **BUILT** | Models 11, 12, 13. Funding, holds, stage submission, approval, release, retention, reconciliation job. Customer / contractor / admin UI. Plus the app-style customer shell: bottom tabs, home with search + banner + catalogue, and My Quotes | `npm run migrate:construction-projects` then `npm run test:construction-escrow` — 54/54. Pipeline suite now 44/44. Frontend builds clean |
| **6. Transparency** ✅ **BUILT** | Models 14, 15, 16, 18. Versioned document vault, project messaging, dispute resolution with escrow freeze, contractor trust score. Customer / contractor / admin UI | `npm run migrate:construction-transparency` then `npm run test:construction-transparency` — 75/75. Frontend builds clean |
| **7. Admin + reports** ✅ **BUILT** | A1 dashboard, A7 payment control, A9 reports (city / service / month / contractor / delay, with CSV), A10 permanent activity record, and the missing A6 capability — reassigning a contractor | `npm run test:construction-admin` — 49/49. Frontend builds clean |
| **8. Enable** ✅ **READY** | Acceptance matrix (guide §7) as an executable suite, plus the kill-switch fix that made criterion 3 pass | `npm run test:construction-acceptance` — 51/51. Flag on when you are ready |

### Acceptance tests before enabling (per platform guide §7)
- Login once → construction tab appears; contractor login is separate and works
- Disable module → tab gone, deep links safe, other five modules unaffected
- Disable module mid-project → new enquiries 503, **open projects still fund, approve, release and complete**
- Held funds are not spendable in food / quick / porter / taxi / bike-rent
- Double-tap stage approval releases money exactly once
- `held + released + refunded === agreedValue` after every operation
- Suspended contractor loses access on the next request, not at token expiry
- Employee with only `food::*` cannot reach any `/admin/construction` route
- All money rows tagged `module: 'construction'`
- Audit log records every approval and release with actor and timestamp

---

## PHASE 9 — Still Blocking, Needs a Client Answer

Config absorbs most of BRD §14. These genuinely cannot be:

| BRD Q | Question | Why config can't absorb it |
|---|---|---|
| **4** | Customer chooses contractor, or app assigns? | Two different customer UIs. "Choose" needs browse + compare + decide screens (C6–C8, C11); "assign" needs an accept/reject screen. `leadDistributionMode` covers the backend, not the front end. **BRD's own recommendation — app shortlists, customer chooses — is the safe default and is what §7.4 is built around, but confirm before Phase 4** |
| **8** | Legal position on holding customer funds | Not a code question. Holding customer money in India carries regulatory obligations (PA/escrow rules). Needs written client confirmation before Phase 5. **The single highest-risk item in the project** |
| **9** | Contractor firms with multiple staff logins | `participants[]` is in the schema from day one, but multi-login contractor orgs need their own RBAC surface. Confirm whether phase 1 or later |
| **10** | Sub-contractor payment flow | Would make the escrow layer a payment *tree* rather than a chain. Materially changes §2.1. Must be known before Phase 0 if wanted |
| **16** | Required document types | Affects the C19 vault taxonomy. Low risk, needed by Phase 6 |
| **18** | Auto-convert finished project → AMC customer | Cross-module integration with AMC & Property Care. Out of scope unless confirmed |

**Enterprise customers (BRD §5)** are described in the BRD but appear in none of the §14 questions. Treated here as designed-for, not built. Flagging explicitly so it is a decision rather than an omission.

---

## Appendix A — BRD Traceability

| BRD | Requirement | Where |
|---|---|---|
| Rule 1 | One account for everything | Already satisfied — `common_users` + `findOrCreateUserByPhone` |
| Rule 2 | All money through the app wallet | §2.1, §2.3 — and fixes the existing drift |
| Rule 3 | Financial records never changed | §2.1 append-only ledger; §2.2 for the honest limits |
| Rule 4 | Every important action recorded | §2.4 platform audit log |
| Rule 5 | Construction is a protected service | §4.2, §6 — no public endpoints, `ProtectedRoute` everywhere |
| Rule 6 | Contractors verified before work | §5.1 `requireApprovedContractor` + §3.2 document expiry |
| C1–C5 | Discovery, enquiry | Phase 2, 4 |
| C6–C8 | Contractor selection | Phase 4 (pending Q4) |
| C9–C13 | Site visit, quotation | Phase 4 |
| C14–C18 | Project monitoring | Phase 5, 6 |
| C19–C23 | Documents, chat, money, handover | Phase 5, 6 |
| W1–W5 | Contractor onboarding | Phase 3 |
| W6–W7 | Lead feed | Phase 4 |
| W8–W13 | Visits, quoting | Phase 4 |
| W14–W18 | Workspace, earnings, score | Phase 5, 6 |
| A1–A10 | Admin | Phase 7 |
| §13 | Money handling | §2.1, §3.4 |

## Appendix B1 — Phase 0, as built

New:
```
Backend/src/core/wallet/models/walletHold.model.js       aggregate claim per commitment
Backend/src/core/wallet/models/walletHoldLedger.model.js append-only source of truth
Backend/src/core/wallet/hold.service.js                  create/release/refund/cancel/reconcile
Backend/src/core/audit/auditLog.model.js                 platform_audit_logs (append-only)
Backend/src/core/audit/audit.service.js                  recordAudit / listAuditTrail
Backend/src/core/payments/models/contractorWallet.model.js
Backend/scripts/phase0-ensure-escrow-indexes.js          REQUIRED before first use
Backend/scripts/verify-escrow-holds.js                   acceptance test
```

Changed:
```
food/user/models/userWallet.model.js        + lockedAmount
food/user/services/userWallet.service.js    $expr available-balance guard; held-vs-broke error
core/payments/transaction.service.js        + contractor wallet; lock-aware debit guard;
                                            recordTransactionInSession extracted
core/payments/wallet.service.js             dead lockWalletAmount/unlockWalletAmount removed
core/payments/settlement.service.js         dropped the dead import
core/payments/models/transaction.model.js   + contractor entityType, escrow categories
core/payments/models/payment.model.js       orderId optional + refType/refId + subject validator
core/wallet/sources.js                      + CONSTRUCTION source, escrow reasons
core/wallet/index.js                        exports the hold API
package.json                                + migrate:escrow-indexes, verify:escrow
```

Two operational notes:
- **`autoIndex: false`** on the connection means Mongoose builds no indexes. The unique index on `wallet_hold_ledger.reference` IS the idempotency guarantee, so `npm run migrate:escrow-indexes` is a hard prerequisite, not a convenience. The script fails loudly if that index is absent.
- **Transactions require a replica set.** Not a new dependency — `recordTransaction` has used sessions since the food module shipped.

## Appendix B5 — Phase 5, as built (projects, stages, escrow release)

This is the phase the Phase 0 money layer was built for. Complete: backend,
migration, 54-check acceptance suite, and UI on all three sides.

New — backend:
```
modules/construction/models/constructionProject.model.js  commercial terms SNAPSHOTTED at creation
modules/construction/models/projectStage.model.js         releaseReference = the idempotency key
modules/construction/models/stageSubmission.model.js      pre-validate requires >=1 photograph
modules/construction/services/project.service.js          create/fund/hold/resume/cancel/reconcile
modules/construction/services/stage.service.js            submit/approve/reject/escalate
modules/construction/services/handover.service.js         handover, retention, nightly reconcile
modules/construction/controllers/project.controller.js
scripts/phase5-ensure-project-indexes.js                  REQUIRED before funding is enabled
scripts/verify-construction-projects.js                   54 checks, incl. every money invariant
```

New — frontend:
```
shared/MoneyBar.jsx                       one bar: released | held | still to pay
shared/StageTimeline.jsx                  same facts both sides, wording differs
user/pages/MyProjects.jsx                 C14 + the approvals that need the customer
user/pages/ProjectDetail.jsx              C15-C17, C21-C23: fund, approve, reject, handover
contractor/pages/Projects.jsx             W14
contractor/pages/ProjectWorkspace.jsx     W15, W16 — photographs gate the claim
contractor/pages/Earnings.jsx             W17
admin/pages/Projects.jsx                  A5 — leads with the escrow position
admin/pages/ProjectDetail.jsx             A6, A7 — hold/cancel/approve/reconcile
```

Design decisions worth remembering:

- **Everything commercial is snapshotted onto the project at creation** — agreed
  value, retention percent, defect liability days, commission terms. An admin
  changing module settings must not silently re-price a live project.
- **Retention is withheld proportionally per stage**, not loaded onto the last
  one. On a two-stage project the final stage can be smaller than the total
  retention, and the "take it off the end" design goes negative there.
- **Stages are approved strictly in order.** Releasing stage 3 first would let a
  contractor collect the easy money and leave the foundation undone.
- **`approveStage` is the only function that turns held money into contractor
  money**, and it is idempotent on `stage.releaseReference`. A double-tapped
  approve pays once — proved by the suite, guaranteed by a unique index.
- **`buildStages` corrects the remainder on the last stage** so stage amounts sum
  to the agreed value exactly, with no rounding drift.
- **Confirming handover does NOT release retention.** They are separate acts, and
  the UI says so, because a customer who thinks handover ends their protection
  will not understand why money is still held.

### Three real bugs this phase surfaced

1. **Sub-paisa float drift stranded the final release** (`core/wallet/hold.service.js`).
   The guards compared raw doubles inside MongoDB. After four releases the
   outstanding balance of a hold was stored as `16666.669999999984`, so the
   comparison `>= 16666.67` failed by 1.5e-11 and the last legitimate release —
   the retention — was refused with "the held amount changed". Money would have
   been permanently stuck. Fixed with a half-paisa `EPSILON` on every guard: far
   below any real value, far above the noise. **This was in core, so it affected
   every module using holds, not just construction.**

2. **Every construction notification after the first per owner was silently lost**
   (`modules/construction/services/notify.service.js`). `food_notifications` has a
   unique index on `{broadcastId, ownerType, ownerId}`; the code set
   `broadcastId: undefined`, which stores as `null` and collides on the second
   write. The comment above the line described this exact failure — and then the
   line did it anyway. Now generates a fresh ObjectId per row, matching what the
   core notification service already did.

3. **The admin stats overstated the escrow position** —
   `totalHeld` was `funded - released`, ignoring refunds. Money returned to a
   customer is not held. Also added `stagesAwaitingApproval`, which is the queue
   an operator actually works (BRD A7).

### Verification

```
npm run migrate:construction-projects    # indexes; unique quotationId + releaseReference
npm run verify:construction-projects     # invariants against live data, read-only
npm run test:construction-escrow         # 54 checks, creates and removes synthetic data
```

The suite proves, among others: project creation is idempotent on `quotationId`;
stage amounts sum exactly to `agreedValue`; funding holds without moving money;
held money is unspendable in other modules; submission without photographs is
refused; stages must be approved in order; a retried approval pays once;
retention is withheld per stage and released only after the defect period;
cancellation returns everything still held; and
`funded = released + refunded + held` at every step.

**Do not run `test:construction-escrow` against production** — it creates and
deletes records. `verify:construction-projects` is the read-only one.

## Appendix B6 — Phase 6, as built (transparency and disputes)

BRD C19, C20, Q15, W18. Complete: backend, migration, 75-check acceptance suite,
and UI on all three sides.

New — backend:
```
models/projectDocument.model.js       versioned vault; supersede is a LINK, not an overwrite
models/projectMessage.model.js        permanent thread; content immutable, read state is not
models/projectDispute.model.js        unique partial index = one live dispute per stage
models/contractorScore.model.js       five weighted components, each with its own reason
services/document.service.js          add / supersede / revoke / history / readiness
services/message.service.js           send, system notes, read tracking, retract
services/dispute.service.js           raise (freeze), resolve (release/refund/split/dismiss)
services/score.service.js             recalculate from source data — never incremented
controllers/transparency.controller.js
scripts/phase6-ensure-transparency-indexes.js   REQUIRED before disputes are enabled
scripts/verify-construction-transparency.js     75 checks
```

New — frontend:
```
shared/DocumentVault.jsx     grouped by type; MISSING types shown as prominently as filed ones
shared/MessageThread.jsx     system notes inline with the conversation
shared/DisputePanel.jsx      states the frozen amount BEFORE the customer commits
contractor/pages/TrustScore.jsx    the number, then what to fix, then the breakdown
admin/pages/Disputes.jsx           the queue, led by money frozen rather than count
admin/pages/DisputeDetail.jsx      the only Phase 6 screen that moves money
```
Documents / Messages / Disputes are tabs on both project screens.

### The dispute design, and why it needed no new money code

`stage.service.approveStage` is the only function on the platform that turns held
money into contractor money, and it refuses any stage whose status is not
`submitted_for_approval` or `approved`. Raising a dispute sets the stage to
`disputed`, so release is blocked by machinery that already existed and was
already covered by the Phase 5 suite. The customer's money simply stays held.

Resolution then uses the same two escrow primitives as every other path —
`releaseHold` and `refundHold` — each with a reference derived from the dispute
id, so a retried resolution settles once.

`preDisputeStatus` is stored because dismissing a dispute has to put the stage
back exactly where it was, and reconstructing that from status history is
guesswork.

### Design decisions worth remembering

- **Messages are immutable in CONTENT, not frozen.** Body, attachments and
  sender can never change; read receipts and the retraction flag can. A blanket
  update ban would have made read tracking impossible; free updates would have
  made the record worthless.
- **Nothing is ever deleted.** A withdrawn document and a retracted message both
  stay visible and marked. "This was filed and later withdrawn" is itself part
  of the record.
- **Only CUSTOMER-raised disputes that were UPHELD count against the trust
  score.** A contractor raising a dispute to get paid for finished work is using
  the system correctly, and a complaint support dismissed is not evidence.
- **A new contractor is shown as "New", never as a low number.** With no
  history every component scores zero, which would rank a brand-new contractor
  below one with a string of complaints.
- **Resolving a dispute sits on `construction::payments`, not
  `construction::disputes`.** Reading and triaging are one permission; moving
  customer money is another.

### Two bugs this phase surfaced

1. **The dispute guard in `approveStage` was dead code.** It sat *after* the
   check that only allows `submitted_for_approval` / `approved`, so a `disputed`
   stage never reached it and the customer was told their frozen stage "has not
   been submitted for approval" — wrong, and the opposite of reassuring when
   their money is held. Reordered so it fires first. (`submitStage` already had
   its guard in the right place.)

2. **The message immutability hook blocked its own read receipts.** Mongoose adds
   `createdAt` under `$setOnInsert` on every update when `timestamps` is on, and
   the hook counted that as a mutation — so marking a thread read threw.
   `$setOnInsert` only applies when a NEW row is created, which is a send, not an
   edit, so it is now skipped. Caught by the suite on its first run.

### Verification

```
npm run migrate:construction-transparency    # indexes; needs MongoDB 5.0+ for the $in partial filter
npm run verify:construction-transparency     # invariants against live data, read-only
npm run test:construction-transparency       # 75 checks, creates and removes synthetic data
```

The suite proves: documents version rather than overwrite and keep exactly one
current version; internal support paperwork is invisible to the customer; message
content cannot be edited or deleted; raising a dispute freezes the stage; a
frozen stage cannot be approved by anyone, resubmitted, or disputed twice;
dismissal restores the stage exactly; a split must account for the whole frozen
amount; a replayed resolution settles once; and
`funded === released + refunded + held` after every resolution.

**Do not run `test:construction-transparency` against production.**

## Appendix B7 — Phase 7, as built (the office team)

BRD A1, A6 (reassignment), A7, A9, A10. A2/A3/A4/A5/A8 shipped in earlier phases.

New — backend:
```
services/dashboard.service.js         A1 work queue + A7 payment oversight
services/report.service.js            A9 by city / service / month / contractor / delay
controllers/admin.controller.js       all of the above, read-only
project.service.reassignContractor    A6 — the intervention that was never built
scripts/verify-construction-admin.js  49 checks
```

New — frontend:
```
admin/pages/Dashboard.jsx        the work queue first, counts second
admin/pages/PaymentControl.jsx   held / awaiting / frozen / released
admin/pages/Reports.jsx          five cuts, CSV export built from the rendered rows
admin/pages/ActivityLog.jsx      A10, with money-moving actions highlighted
admin/pages/ProjectDetail.jsx    + the reassign dialog
```

### Design decisions worth remembering

- **The dashboard is a WORK QUEUE, not a report.** The BRD says ops will keep it
  open all day, so what needs a person is at the top, ordered by consequence, and
  items with a count of zero are not rendered at all — a screen full of noughts
  trains people to stop reading it.
- **Revenue means COMMISSION, not contract value.** Reporting ₹2 crore of
  building work as revenue would overstate the business by more than an order of
  magnitude, so `grossValue` and `revenue` are separate columns everywhere.
- **Payment control does not add a third way to block money.** Putting a project
  on hold and freezing a stage via a dispute already exist; a separate "block
  payment" switch would be a third set of rules to get wrong. The screen is
  oversight, and it links to the two mechanisms that already work.
- **Reassignment never claws money back.** Stages already paid were released
  against work the customer approved; taking that back afterwards would make
  stage approval meaningless. Only unpaid stages move, part-done ones are reset,
  and the project is left ON HOLD so the new firm is not held to dates agreed
  with someone else.
- **Reassignment sits on `construction::payments`,** not `projects` — it decides
  who gets paid for the remaining work.
- **A10 has no write endpoint at all.** `platform_audit_logs` refuses updates and
  deletes at the model, and the suite proves it.

### Five bugs this phase surfaced

1. **`$ne` in `partialFilterExpression` — fifteen indexes across four LIVE
   modules were never built.** MongoDB reads `$ne` as `$not` and rejects the whole
   index spec silently. Verified empirically: the affected collections had zero
   unique indexes, so duplicate hub codes, duplicate bike registrations, duplicate
   carts, duplicate payout references and double-billed subscriptions were all
   possible. All fifteen corrected; `npm run repair:partial-indexes` builds them
   and REFUSES where existing data already violates the constraint.

2. **Push notifications to contractors and service providers failed silently.**
   `firebase.service.OWNER_MODELS` had no `CONTRACTOR` or `SERVICE_PROVIDER`
   entry, so every push died at the model lookup and was swallowed by the
   best-effort wrapper. Both registered, both given `fcmTokenMobile`, and the
   frontend now recognises `/contractor` as its own push module rather than
   falling through to the customer's token.

3. **Per-stage retention was computed but never persisted.** `retainedAmount`
   went into the escrow ledger's meta and nowhere else, so the two UI places
   showing "₹X held as retention" on a stage rendered nothing. Now stored on the
   stage, and guarded by a new assertion in the Phase 5 suite (54 → 55).

4. **Audit entries used two different `entityType` values** for the same thing —
   `'project'` and `'construction_project'` — so A10's "every action on this
   project" would have returned only half of them. Standardised on `'project'`.

5. **The dashboard counted contractors by a status that does not exist.** The
   enum is `onboarding | pending_approval | approved | rejected`; the code looked
   for `'pending'` and `'suspended'`, so "awaiting verification" would always have
   read zero. Suspension is `approved` with `isActive: false` and is now counted
   as such.

### Verification

```
npm run test:construction-admin     # 49 checks
npm run check:partial-indexes       # read-only duplicate check across live modules
npm run repair:partial-indexes      # builds the indexes that never existed
```

**Do not run `test:construction-admin` against production.**

## Appendix B8 — Phase 8, the go-live gate

The acceptance matrix in Phase 8 above is no longer a checklist to work through
by hand. It is `scripts/verify-construction-acceptance.js`, 51 checks, and it is
the last thing to run before the flag goes on.

```
npm run test:construction-acceptance   # 51 checks, the go-live gate
npm run test:construction-all          # escrow + transparency + admin + acceptance
```

It flips the real module flag off and back on, and restores it in a `finally`
block whatever happens — so an interrupted run cannot leave construction
disabled.

### The bug it was written to catch

**Turning the module off stranded every open project's money.**

`customerAuth` and `contractorAuth` both carried `requireModuleEnabled`, and the
three admin money paths carried it explicitly. So with construction switched off:

- a contractor could not submit finished work
- a customer could not approve a stage
- support could not approve on their behalf, release retention, or resolve a
  dispute
- the ONLY surviving money action was `cancel`, which refunds the customer

In other words, flipping the kill-switch mid-project left held funds with exactly
one way out: don't pay the contractor who already built something. A kill-switch
whose only escape is not paying people who did the work is not a safety feature.

Worse, the comment above `requireModuleEnabled` already claimed the opposite —
*"disabling construction blocks new enquiries and funding, never the completion
of a project already running"* — and `core/modules/moduleEnabled.service.js`
opens with the platform's own rule: *"Existing open jobs must still
complete/cancel/pay/track when a module is disabled."* The intent was documented
in two places and implemented in neither.

### The fix

The gate now has two tiers:

```
customerAuth       / contractorAuth       gated — NEW work
customerLiveAuth   / contractorLiveAuth   ungated — work that already exists
```

44 routes moved to the ungated tier, plus the three admin money paths. The rule:
anything scoped to an existing project, stage or dispute survives; anything that
creates new demand (browsing, enquiries, accepting a quotation, leads, sending
quotes) is blocked.

Both tiers still require a logged-in user of the right role, and every route
still checks that THIS person owns THAT project. Turning the module off never
widens access — it only narrows it.

### What the matrix proves

1. A held rupee is unreachable from food, quick commerce, porter, taxi and bike
   rent — probed at the exact boundary, not merely somewhere inside the free
   balance
2. Switching off stops new enquiries
3. **Switching off does not strand an open project**: submit, approve, pay,
   hand over, release retention and close all succeed with the module DISABLED
4. The other five modules keep answering their own flags
5. A double-tapped approval pays once
6. `funded === released + refunded + held` — re-checked after every single
   operation, eight times across the run
7. Every money row carries `module: 'construction'`, and no escrow row anywhere
   on the platform is mis-tagged
8. The escrow ledger, the audit log and project messages all refuse updates and
   deletes
9. A suspended contractor is stopped by a per-request profile read, not by token
   expiry
10. Every project on the platform reconciles against the escrow ledger

### Three test bugs worth remembering

Each of these was MY test being wrong, not the code — and each would have been a
false alarm at go-live:

- Probing cross-module isolation by spending an amount that was inside the free
  balance. Money that is not held genuinely is spendable; the probe has to sit at
  the boundary. (This one bit twice — the same mistake as in Phase 5.)
- Reading `metadata.module` on transaction rows when `module` is a TOP-LEVEL
  field on the model.
- Creating a contractor with `status: 'suspended'`, which is not in the enum —
  suspension is `approved` with `isActive: false`.

## Appendix B — Files Requiring Change Outside the Module

Every file below is shared with live modules. Each needs review in its own right.

```
Backend/src/modules/food/user/models/userWallet.model.js        + lockedAmount
Backend/src/modules/food/user/services/userWallet.service.js    available-balance check ← HIGHEST RISK
Backend/src/core/payments/wallet.service.js                     replace dead lock/unlock
Backend/src/core/payments/transaction.service.js                resolveWallet + contractor
Backend/src/core/payments/models/transaction.model.js           entityType, category enums
Backend/src/core/payments/models/payment.model.js               orderId → polymorphic ref
Backend/src/core/constants/permissions.js                       + construction (+ backfill bikeRent, serviceProvider)
Backend/src/core/admin/admin.model.js                           servicesAccess enum (+ backfill porter, serviceProvider)
Backend/src/core/notifications/models/notification.model.js     ownerType, source enums
Backend/src/modules/common/models/settings.model.js             modules.construction (default false)
Backend/src/modules/common/utils/moduleKeys.js                  key mappings
Backend/src/config/socket.js                                    contractor room + join handler
Backend/src/routes/index.js                                     mount /v1/construction
Frontend/src/modules/common/utils/enabledModules.js             all maps (+ fix missing serviceProvider)
Frontend/src/shared/components/AdminModuleSwitcher.jsx          + construction (+ serviceProvider)
Frontend/src/core/context/AuthContext.jsx                       contractor token key + role branch
Frontend/src/app/routes.jsx                                     three route surfaces
```

---

*Prepared: 2026-08-22 · Blueprint only, no code written · Review before implementation begins*
