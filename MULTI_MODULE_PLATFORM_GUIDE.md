# Just Order — Multi-Module Platform Guide

**Purpose:** Document how Food, Quick Commerce, Porter (parcel), and Taxi share **one User**, **one Delivery Partner**, and **one Admin**, how tab switching must keep sockets / notifications / orders / rides conflict-free, and how to **add or disable** any module in the future without breaking the rest.

**Status:** Architecture & ops guide. Implementation should follow this document.  
**Related:** `docs/taxi-module-blueprint.md`

---

## 1. What We Want To Create

A **super-app** with four business verticals behind one product shell:

| Module | Product style | Customer job | Partner job |
|--------|---------------|--------------|-------------|
| **Food** | Zomato-like | Order food | Deliver food |
| **Quick Commerce** | Blinkit-like | Order groceries / quick items | Deliver from seller |
| **Porter** | Porter-like parcel | Send parcel / goods | Pickup → drop goods |
| **Taxi** | Rapido-like | Book a ride | Accept ride, take passenger |

### Non-negotiable product rules

1. **One customer account** for all modules (same phone, wallet, addresses, profile).
2. **One delivery / rider account** for all modules (same KYC, GPS, wallet, FCM).
3. **One admin login** with section / tab switching (Food | Quick | Porter | Taxi).
4. **No parallel apps** for user, rider, or admin — only **module tabs / sections**.
5. Requests, offers, and notifications must respect **current tab / active work module** so Food order rings do not fight Taxi ride rings.
6. Any module can be **turned off** (or added later) without major flow breakage in other modules.

---

## 2. Shared Identity Model (No Duplicates)

```
┌─────────────────────────────────────────────────────────────┐
│                     PLATFORM CORE                            │
│  Auth (OTP/JWT) · Users · Drivers · Admins · Wallets        │
│  Payments · Location · Socket.IO · FCM · Queues · Maps      │
└───────────────┬───────────────┬───────────────┬─────────────┘
                │               │               │
         ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
         │ Food / Quick│ │   Porter    │ │    Taxi     │
         │  (orders)   │ │  (trips)    │ │  (rides)    │
         └─────────────┘ └─────────────┘ └─────────────┘
```

| Actor | Single source of truth | Module differentiation |
|-------|------------------------|------------------------|
| **User** | `common_users` (`FoodUser`) | UI tabs + APIs under `/food`, `/quick`, `/porter`, `/taxi` |
| **Delivery partner** | `food_delivery_partners` (`Driver`) | `authorizedServices[]`, `registeredServices.{module}`, `activeWorkModule` |
| **Admin** | `common_admins` + RBAC | `servicesAccess` + permission keys `food::*`, `porter::*`, `taxi::*`, etc. |

### What must never be created

- ❌ `TaxiUser` / `PorterUser` collections  
- ❌ Separate rider apps or separate rider login systems per module  
- ❌ Separate admin portals per module  
- ❌ Putting Taxi/Porter trips inside `FoodOrder` (different lifecycle — use `TaxiRide` / `PorterTrip`)

---

## 3. Tab Switching = Active Context

Everything that can conflict (offers, notifications tone, deep links, UI) is scoped by **active module context**.

### 3.1 Customer app

| Mechanism | Behavior |
|-----------|----------|
| Home tabs | Quick / Food / Porter / Taxi (filtered by enabled modules) |
| URL = module | `/quick`, `/food/user`, `/porter`, `/taxi` |
| Active order/ride UI | Show only jobs for the current module on that screen; global “active job” chip may deep-link to the correct module |
| Wallet / profile | Shared routes (`/profile`, wallet) with optional `?from=taxi\|porter` for back navigation |

### 3.2 Delivery partner app (`DeliveryV2`)

| Mechanism | Behavior |
|-----------|----------|
| `DriverModuleSwitcher` | Partner picks **Food / Quick / Porter / Taxi** |
| `activeWorkModule` | Stored on Driver while online — **dispatch must filter by this** |
| Online + busy | Cannot switch module while online on a trip (or force go offline first) |
| Offers | Only jobs matching `authorizedServices` **and** `activeWorkModule` |

### 3.3 Admin panel

| Mechanism | Behavior |
|-----------|----------|
| Module switcher | Food / Quick Commerce / Porter / Taxi |
| Sidebars | Per-module menus under `/admin/food`, `/admin/quick-commerce`, `/admin/porter`, `/admin/taxi` |
| Shared screens | Users, drivers, wallets — filterable by module where needed |

---

## 4. How To Keep Systems Conflict-Free

### 4.1 Socket connection (one connection, many rooms)

**Design:** One Socket.IO connection per logged-in actor. Do **not** open one socket per module.

| Actor | Rooms | Module-safe rule |
|-------|-------|------------------|
| User | `user:{userId}` | Events include `module: 'food'\|'quick'\|'porter'\|'taxi'` |
| Driver | `delivery:{driverId}` | Offers include `module` + `jobType` (`order` vs `ride` vs `parcel`) |
| Tracking | `tracking:{jobId}` | Job ID is namespaced or typed (`food_order_…`, `taxi_ride_…`) |
| Admin | `admin:{adminId}` | Optional filter by module in UI |

**Example — correct**

```text
Driver socket connected once.
Driver activeWorkModule = "taxi"
Server receives new food order → does NOT emit to this driver.
Server receives new taxi ride → emits `new_ride_available` with { module: "taxi", rideId }.
```

**Example — conflict if done wrong**

```text
Driver is on Taxi tab and online.
Food dispatch ignores activeWorkModule and broadcasts food offer.
Driver accepts food while navigating to a taxi pickup → double assignment / busy-lock race.
```

**Rule:** Dispatch eligibility =

```text
online
AND module ∈ authorizedServices
AND activeWorkModule === module   (for taxi/porter; food/quick same rule)
AND not busy (shared busy lock across ALL modules)
```

### 4.2 Notifications (FCM + in-app)

Every push / inbox row must carry:

```json
{
  "module": "taxi",
  "jobType": "ride",
  "jobId": "...",
  "deepLink": "/taxi/rides/..."
}
```

| Situation | Correct behavior |
|-----------|------------------|
| User has food order + taxi ride | Two notifications with different `module` + deep links |
| User taps Food tab | Food active-order card; taxi ride appears as secondary or via deep link |
| Module disabled later | Client ignores / hides notifications for disabled modules; deep link falls back to first enabled module |

**Challenging part:** Same FCM token for all modules.  
**Fix:** Never rely on “last opened screen” alone — always encode `module` in the payload and route in the native/WebView handler.

### 4.3 Orders vs rides vs parcels (requests)

| Job type | Model (recommended) | Partner offer event | Customer tracking |
|----------|---------------------|---------------------|-------------------|
| Food / Quick | `FoodOrder` (`orderType`) | `new_order_available` | Food/Quick tracking |
| Porter | `PorterTrip` (new) | `new_parcel_available` | Porter tracking |
| Taxi | `TaxiRide` (new) | `new_ride_available` | Taxi tracking |

**Shared busy lock example**

```text
Driver accepted Taxi ride R1 → Redis busy lock set for driverId.
Food tryAutoAssign must see lock and skip this driver.
Porter matching must also skip.
Until R1 completes / cancels → lock released.
```

Without a **cross-module** busy lock, a rider can be assigned Food + Taxi at the same time.

### 4.4 Payments & wallet

- One user wallet, one driver wallet.
- Every `Payment` / `Transaction` sets `module: 'food'|'quick'|'porter'|'taxi'`.
- Reports filter by module; disabling a module does not delete ledger history.

---

## 5. Challenging Parts (With Examples)

### Challenge A — One driver, many job types

**Problem:** Same person delivers food and drives taxi.  
**Risk:** Wrong offer, wrong UI, double job.

**Example**

1. Rider goes online with `activeWorkModule = "food"`.  
2. Taxi ride request is created nearby.  
3. If matching only checks `online` + distance, rider gets a taxi popup while expecting food bags.  
4. Rider accepts by mistake → food orders wait, customer taxi ETA is wrong.

**Mitigation**

- Always filter on `activeWorkModule`.  
- Offer modal title/color by module (`Food order` vs `Taxi ride`).  
- Block module switch while online or on active trip.

---

### Challenge B — One socket, many event names

**Problem:** Reusing `new_order` for taxi confuses old clients.  
**Risk:** Food Delivery UI tries to open order detail for a ride ID → crash / blank screen.

**Example**

```text
Server emits: new_order { orderId: ride_123 }  // actually a taxi ride
Food handler: fetch /food/orders/ride_123 → 404 → modal stuck.
```

**Mitigation**

- Use explicit events: `new_order_available`, `new_ride_available`, `new_parcel_available`.  
- Or one event `new_job_available` with required `module` + `jobType` and a router on the client.  
- Never reuse Food order IDs for rides.

---

### Challenge C — Notification deep links after tab switch

**Problem:** User is browsing Porter; food “rider arrived” push arrives.  
**Risk:** Opens wrong screen or loses Porter booking draft.

**Example**

1. User mid Porter “parcel details” form.  
2. Food push: “Order out for delivery”.  
3. App navigates to Food tracking and wipes Porter `BookingContext` draft.

**Mitigation**

- Soft notification (banner) while in another module’s multi-step flow.  
- Persist booking drafts in `sessionStorage` / backend draft.  
- Deep link opens the correct module without destroying unrelated draft state.

---

### Challenge D — Admin employees and permissions

**Problem:** One admin panel, employees should not see all modules.  
**Risk:** Employee with only Food access can open `/admin/taxi` URLs.

**Mitigation**

- Gate routes with `servicesAccess` + `checkPermission('taxi::*')`.  
- Hide disabled / unauthorized modules from switcher.  
- Backend must enforce — frontend hide is not enough.

---

### Challenge E — Disabling a module while jobs are live

**Problem:** Admin turns off Taxi at 2 PM; rides are still in progress.  
**Risk:** New bookings blocked (good) but live tracking / payouts break (bad).

**Example**

```text
modules.taxi = false
→ New book API returns 503 MODULE_DISABLED  ✅
→ In-progress ride tracking must still work  ✅
→ Driver wallet credit for completed taxi trip must still work ✅
→ Home Taxi tab hidden ✅
```

**Mitigation — two flags (recommended)**

| Flag | Meaning |
|------|---------|
| `modules.taxi.enabled` | Show tab + allow **new** bookings |
| `modules.taxi.runtimeActive` (or always allow complete/cancel on existing jobs) | Existing jobs continue until terminal state |

Never hard-delete module code paths that settle money or close open jobs.

---

### Challenge F — Naming: `porter` vs `parcel`

**Problem:** Driver model has both `porter` and `parcel` keys.  
**Risk:** Partner approved for `porter` never receives jobs filtered as `parcel`.

**Rule:** Use **`porter`** as the single work-module key everywhere (APIs, `activeWorkModule`, offers). Treat `parcel` as alias only if needed for legacy, then remove.

---

## 6. Module Kill Switch & Safe Disconnect

### 6.1 Existing hooks in this repo

Frontend already has:

- `Frontend/src/modules/common/utils/enabledModules.js` — keys: `food`, `quickCommerce`, `porter`, `taxi`
- `ModuleAccessGuard` — redirects if module disabled
- Home tabs filtered by `getVisibleHomeTabs`
- Admin **Module Management** page

Backend should mirror the same flags in Global Settings (`modules.{food,quickCommerce,porter,taxi}`).

### 6.2 What “disable module” must do

| Layer | Action when module = OFF |
|-------|---------------------------|
| Customer tabs | Hide tab |
| Customer routes | `ModuleAccessGuard` → redirect to first enabled module |
| Customer APIs | Reject **new** create/book/quote with clear error |
| Partner switcher | Hide module chip; if it was `activeWorkModule`, force offline or switch to another authorized enabled module |
| Dispatch | Never offer jobs for disabled module |
| Admin switcher | Hide section (super-admin may still see config read-only) |
| Notifications | Do not send **marketing / new-job** pushes; still allow transactional for open jobs |
| Sockets | Keep connection; stop emitting new offers for that module |
| Payments | Allow capture/refund/settle for existing jobs |

### 6.3 What “disable” must NOT do

- ❌ Drop database collections  
- ❌ Revoke JWT for all users  
- ❌ Close unrelated modules’ sockets  
- ❌ Delete driver `authorizedServices` entries (keep history; just stop matching)  
- ❌ Break shared wallet / auth / location services  

### 6.4 Soft delete vs hard remove

| Action | When | How |
|--------|------|-----|
| **Soft disable** | Temporary / city off / maintenance | Feature flag only |
| **Hard remove** | Product sunset | Flag off → stop new data → migrate reports → remove routes in a later release after zero open jobs |

---

## 7. How To Add A New Module Later (Checklist)

Example: adding **“Rental”** or **“Intercity”** in the future.

### Backend

1. Create `Backend/src/modules/<name>/` with own models/routes/services (do not overload `FoodOrder` unless same domain).  
2. Register routes only under `/api/v1/<name>/...`.  
3. Add key to driver module enum + onboarding (`authorizedServices`).  
4. Add Global Settings flag `modules.<name>: false` by default.  
5. Tag `Payment` / `Transaction` / notifications with `module: '<name>'`.  
6. Extend dispatch filter + busy lock (do not fork a second lock system).  
7. Add RBAC permission namespace `<name>::*`.  
8. Gate **new** booking APIs with `assertModuleEnabled('<name>')`.

### Frontend

1. Add folder `Frontend/src/modules/<name>/` (user + admin).  
2. Add route prefix in `app/routes.jsx` wrapped in `ModuleAccessGuard`.  
3. Add key to `enabledModules.js` (`DEFAULT_ENABLED_MODULES`, labels, landing paths, tabs).  
4. Add customer tab + driver switcher chip + admin sidebar + admin module switcher.  
5. All API clients and socket handlers branch on `module` — never assume Food-only shapes.  
6. Ship with flag **OFF** until QA passes.

### Acceptance tests before enabling

- [ ] Login once → access new module tab  
- [ ] Disable module → tab gone, deep link safe, other modules OK  
- [ ] Driver online on Food does not get new-module offers  
- [ ] Driver busy on new module is skipped by Food dispatch  
- [ ] Wallet transactions tagged correctly  
- [ ] Open jobs still completable when flag turned off mid-trip  

---

## 8. How To Disconnect / Disable A Module Safely (Runbook)

### Step-by-step

1. **Announce** maintenance window if many open jobs.  
2. Set `modules.<key> = false` in Admin → Module Management (or Global Settings).  
3. Confirm: customer tab hidden, new book API returns `MODULE_DISABLED`.  
4. Monitor open jobs for that module until count = 0 (or force-complete/cancel with policy).  
5. Stop sending non-transactional pushes for that module.  
6. Optional: hide admin write screens; keep read/reports.  
7. Only after open jobs = 0 and finance settled → remove code in a dedicated release (optional).

### Rollback

Re-enable flag → tabs and booking return. No migration required if you only used soft disable.

---

## 9. Target Folder / Surface Map

| Concern | Location (current / planned) |
|---------|------------------------------|
| Shared user / auth | `Backend/src/core/users`, `core/auth` |
| Shared driver | `Backend/src/core/models/driver.model.js`, `modules/food/delivery` APIs |
| Shared admin | `Backend/src/core/admin`, per-module `admin/` UIs |
| Food | `Backend/src/modules/food`, `Frontend/src/modules/Food` |
| Quick | `Backend/src/modules/quick-commerce`, `Frontend/src/modules/quickCommerce` |
| Porter config | `Backend/src/modules/porter` (zones/vehicles/pricing…) |
| Porter trips (to build) | `Backend/src/modules/porter` + trip model/APIs; `Frontend/src/modules/porter` |
| Taxi (to build backend) | `Backend/src/modules/taxi` (new); `Frontend/src/modules/taxi` (UI exists) |
| Module flags | Global settings + `enabledModules.js` + `ModuleManagement.jsx` |
| Partner multi-module UI | `Frontend/src/modules/DeliveryV2` |

---

## 10. Golden Rules (Pin These)

1. **One identity** per actor type — modules are features, not new users.  
2. **One socket** — many typed events with `module` on every payload.  
3. **One busy lock** across Food, Quick, Porter, Taxi.  
4. **`activeWorkModule` is law** for partner offers.  
5. **Feature flags gate new work**; open jobs always finish.  
6. **New vertical = new domain models** when lifecycle differs (rides/parcels ≠ food orders).  
7. **Disable by flag first**, delete code last.  
8. **Never** let a disabled module’s UI/API crash shared auth, wallet, or socket bootstrap.

---

## 11. What Exists vs What To Build

| Area | Exists today | Still to build |
|------|--------------|----------------|
| Shared user / driver / admin | Yes | — |
| Customer module tabs | Yes | — |
| Driver module switcher + activeWorkModule dispatch | Yes | — |
| Porter admin config | Yes | — |
| Porter trip runtime (quote/book/dispatch) | Yes (Batch 3–4) | Multi-stop, POD photos polish |
| Taxi backend + quote/book/dispatch | Yes (Batch 1–2) | Demand surge, map destination picker, SOS |
| Cross-module busy lock | Yes (core/dispatch) | — |
| Module disable kill switch | Frontend + `assertModuleEnabled` | Ops dashboard polish |
| Mid-trip after disable | Policy: reject new / allow complete | Broader QA matrix |
| Booking draft persistence | Yes (`bookingDraft.js`) | — |
| Permission catalog | Yes (`core/constants/permissions.js`) | Wire into CreateRole UI fully |

---

## 12. Decision Log

| Decision | Choice | Why |
|----------|--------|-----|
| Shared actors | Single User, Driver, Admin | Your product requirement; already modeled |
| Taxi/Porter data | Separate trip models | Different FSM from FoodOrder |
| Partner work context | `activeWorkModule` | Prevents offer conflicts across tabs |
| Module off | Soft feature flag | Safe disconnect without code emergency |
| Canonical parcel key | `porter` | Avoid dual `porter`/`parcel` bugs |

---

*Last updated: 2026-07-23*  
*Owner: Just Order platform team*  
*Use this file when creating, enabling, or disabling any module so flows stay conflict-free.*
