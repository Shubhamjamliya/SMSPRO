# Taxi Module — Master Architecture Blueprint
### For the SMS Pro Super-App Platform (Food · Quick Commerce · Porter · Taxi)

**Status:** Architecture blueprint only. No code, schema, or API was written or modified as part of this document. This is a planning artifact for review and approval before implementation begins.

**Scope of analysis:** `Backend/src` (Node.js/Express/Mongoose) and `Frontend/src` (React 19/Vite/Tailwind v4).

---

## PHASE 1 — Understanding the Existing Project

### 1.1 Overall architecture

The platform is a **modular monolith** on both tiers, already operating as a multi-vertical "super-app" — this is not a green-field extension, it is the **fourth vertical joining three existing ones** (Food, Quick Commerce, Porter).

**Backend** (`Backend/src`):
- `core/` — cross-cutting, vertical-agnostic infrastructure: auth, payments, wallet, notifications, location, users, admin, roles, refresh tokens, idempotency.
- `modules/` — business verticals, each self-contained: `food/`, `quick-commerce/`, `porter/`, plus shared utility modules `media/`, `uploads/`, `common/`.
- Layered pattern per module: `routes → controllers → services → models`, with `validators/` (manual functions, not a schema library). Not strict DDD — services talk to Mongoose directly. Controllers are thin (`validate → call service → sendResponse`).
- Single central router (`src/routes/index.js`) mounts every module under `/api/v1/<vertical>/<resource>`, applying `authMiddleware`/`requireRoles` inline at the mount point.

**Frontend** (`Frontend/src`):
- One Vite/React SPA already hosting multiple verticals behind one router/shell, each lazy-loaded at a path prefix: `/food/*`, `/quick/*`, `/porter/*`, `/seller/*`, `/admin/*`, plus shared cross-module routes (`/cart`, `/profile`) that live outside any single vertical so switching verticals doesn't lose session state.
- `src/modules/` (plural) is the **live** architecture. `src/module/` (singular) and `src/core/routes/AppRouter.jsx` are dead code from a prior generation — do not extend either.
- A dedicated rider/driver PWA already exists as its own module: `modules/DeliveryV2/` — this is the closest structural analog to what a Taxi driver app needs.

### 1.2 Module boundaries

| Vertical | Backend location | Frontend location | Maturity |
|---|---|---|---|
| Food | `modules/food/` (admin, delivery, dining, landing, orders, restaurant, search, shared, subscriptions, user) | `modules/Food/` (user + restaurant + admin + delivery-rider via DeliveryV2) | Flagship, fully built |
| Quick Commerce | `modules/quick-commerce/` (admin, seller, + top-level) | `modules/quickCommerce/` (user, admin, vendor, delivery) | Fully built |
| Porter (parcel) | `modules/porter/` — **admin-config only**: zones, vehicles, pricing, coupons, banners, user listing. No booking/trip flow, no driver flow, no trip model yet. | `modules/porter/` — has `user/` (UserLayout, BookingContext, pages) and `admin/` | Scaffold only — closest existing precedent for Taxi |
| **Taxi (new)** | to be built | to be built | — |

**Critical existing signal:** the shared `Driver` model (`core/models/driver.model.js`) **already has `taxi` as a first-class value** in both `registeredServices: { food, 'quick-commerce', taxi, porter, parcel }` and `authorizedServices` enum. The platform's data model already anticipated this module. Taxi should **extend**, not fork, this identity.

### 1.3 Shared libraries / common utilities

Backend `core/`: `auth/`, `otp/`, `roles/`, `location/`, `notifications/`, `payments/`, `admin/`, `users/`, `models/` (Driver, actionPerformer, counter), `refreshTokens/`, `idempotency/`.

Frontend `shared/` + `core/`: `shared/components/ui/*`, `shared/components/admin/*` (admin design system), `shared/layout/*` (DashboardLayout, BottomNav, Sidebar, Topbar), `core/guards/*`, `core/native/nativeBridge.js`, `core/services/{orderSocket,trackingClient,googleMapsLoader}.js`, `core/firebase/client.js`, `core/auth/auth.store.js`, `core/api/axios.js`, `lib/utils.js`.

### 1.4 Authentication flow

Central in `core/auth/` (`auth.service.js`, `.controller.js`, `.middleware.js`, `.routes.js`, `token.util.js`, `errors.js`). JWT access token (default 15m) + JWT refresh token (default 7d, persisted in Mongo for revocation) — Bearer-token pattern, no sessions/cookies. Same JWT verified by Socket.IO handshake.

Per-actor-type OTP/login flows all inside `auth.service.js`:
- **Customer (USER):** phone/email OTP login, auto-creates `FoodUser` on first verify, referral crediting, FCM token capture.
- **Restaurant/Vendor:** OTP login with onboarding-status-aware branching (pending/rejected/onboarding).
- **Driver/Delivery Partner:** OTP login against `Driver` by normalized phone; handles `pending`/`documents_required`/`rejected`; issues login tokens only once `status === 'approved'`.
- **Admin/Employee:** email/employeeId + bcrypt password + `roleId` for RBAC.
- **Seller:** own model, own auth path.

OTP itself: `core/otp/` (`createOrUpdateOtp`/`verifyOtp`), SMS via SMS India Hub, dev bypass via `config.useDefaultOtp`.

**Frontend:** JWT stored in `localStorage` with **per-module keys** (`auth_customer`, `auth_seller`, `auth_admin`, `auth_delivery`) — the axios interceptor picks the right token based on current route prefix, and on 401 only logs out the *current* module (prevents cross-module logout bleed). `core/auth/auth.store.js` (zustand + persist) is the canonical client auth state.

### 1.5 Authorization (RBAC)

Two layers:
1. **Coarse role gating** — `core/roles/role.middleware.js` → `requireRoles(...roles)`, applied inline at route-mount points. Roles are plain strings: `USER`, `RESTAURANT`, `DELIVERY_PARTNER`, `ADMIN`, `EMPLOYEE`, `SELLER`.
2. **Fine-grained admin permissions** — `checkPermission(permissionKey, action)` in `auth.middleware.js`. `ADMIN` bypasses all checks; `EMPLOYEE` must have an `AdminRole` with a `permissions` map keyed by strings like `'porter::zones'` → `{view,create,edit,delete}`, with `::` prefix inheritance. Permissions cached in-memory 30s per role.

Frontend has no `DRIVER`/`TAXI` role yet in `core/constants/roles.js` (`UserRole = {CUSTOMER, SELLER, ADMIN, DELIVERY}`) — will need extension.

### 1.6 Firebase integration

`config/firebase.js` (backend) initializes `firebase-admin` once, exposing:
- **Realtime Database** — cost-optimized live-location sync (`active_orders/{orderId}`, `delivery_boys/{driverId}`), throttled 1 write/10s.
- **FCM** — push notifications.
No Firebase Auth — all auth is custom JWT.

Frontend: `core/firebase/client.js` (RTDB, lazy init from `VITE_FIREBASE_*`), `core/services/trackingClient.js` (subscribes to RTDB paths for live rider position/trail/route), `modules/Food/utils/firebaseMessaging.js` (FCM token registration, native-bridge-aware, web fallback, module-aware alert tone).

### 1.7 Socket.io architecture

Single central setup, `config/socket.js`, initialized once in `server.js`, optional Redis adapter for horizontal scale. JWT-authenticated handshake. Rooms: `admin:{id}`, `restaurant:{id}`, `user:{id}`, `seller:{id}`, `delivery:{id}`, `tracking:{orderId}` (already ID-agnostic — reusable for trip IDs). Live location: driver emits `update-location`, server throttles, computes authoritative ETA via `getRoadDistance`, triple-writes to (a) socket room broadcast, (b) Redis hot cache + deferred BullMQ Mongo persistence, (c) Firebase RTDB. Dispatch offers broadcast to individual `delivery:{partnerId}` rooms. Resilience: `ack_event`/`resync`/`resync_complete` for reconnect recovery of in-flight ring offers and order state.

Frontend: two client implementations exist (`core/services/socket.js` generic singleton — underused; `core/services/orderSocket.js` — the one actually wired into order/delivery flows, JWT-authenticated, with helpers like `joinOrderRoom`, `onDeliveryBroadcast`/`...Withdrawn`, `onCustomerOtp`, `onDeliveryOtpGenerated/Validated`).

### 1.8 Notification flow

Three channels, loosely coupled:
1. **Push (FCM)** — `core/notifications/firebase.service.js`, `notifyAdminsSafely`/`notifyOwnersSafely` helpers.
2. **In-app inbox** — `notification.service.js` + `FoodNotification` model, bulk upsert per `{ownerType, ownerId}` (USER/RESTAURANT/DELIVERY_PARTNER), REST endpoints at `/v1/food/notifications`.
3. **Reliable "ring" event layer** — `orderEvents.service.js` + `orderOutboxRelay.service.js`: durable per-target event records so dispatch offers survive reconnects and escalate if unacknowledged (swept every 5s). This is the backbone of the food delivery "new order" alert and is directly reusable for "new ride request."

Plus Email (SMTP, narrow use) and SMS (OTP delivery).

### 1.9 Wallet system

Fully centralized, entity-agnostic, in `core/payments/`. `transaction.service.js`'s `resolveWallet(entityType, entityId)` switches over `'user' | 'restaurant' | 'deliveryBoy' | 'admin'`. **`recordTransaction()` is the only sanctioned way to mutate a wallet balance** — atomic, session-wrapped, enforces non-negative balances. Per-entity wallet models: `FoodUserWallet`, `FoodRestaurantWallet`, `FoodDeliveryWallet` (has `cashInHand`, `totalEarnings`, `totalBonus`, `totalSettled`), `FoodAdminWallet`.

### 1.10 Transaction system

Single `Transaction` ledger model is the source of truth (`entityType`, `entityId`, `type: credit|debit`, `amount`, `balanceAfter`, `status`, `category`, **`module`** field already present for segmenting reports by vertical). `wallet.service.js` is the facade (`creditWallet`, `debitWallet`, `lockWalletAmount`/`unlockWalletAmount` for pending settlements).

### 1.11 Payment flow

Razorpay only. `Payment` model (`orderId`, `userId`, `amount`, `method`, `gateway`, `status`, **`module`** field). Webhook handling idempotent via `ProcessedWebhookEvent`, mounted publicly with raw-body capture for signature verification. Order docs embed a `payment{}` sub-object, decoupled from the logistics `orderStatus` FSM — this dual-field pattern (logistics state + payment state) is the template a Taxi Trip model should follow.

### 1.12 Coupon system

Two food-specific mechanisms (`FoodOffer` platform-wide, `RestaurantCoupon` merchant-scoped) with a real validation/consumption engine (`coupon.service.js`: subtotal-scoping, percentage/fixed with max-discount cap, per-user usage limits, atomic consumption at order-creation). A parallel `PorterCoupon` model exists but is **admin CRUD only — no consumption engine was ever wired to a booking flow**, since Porter has no booking flow yet.

### 1.13 Google Maps usage

Fully centralized in `core/location/location.service.js`: `haversineKm` (pure math), `reverseGeocode`/`geocodeAddress`/`autocompletePlaces`/`getPlaceDetails` (Google Geocoding/Places, normalized to a canonical address shape), `getRoadDistance`/`getRoadDistanceMatrix` (Google Routes API, `travelMode: TWO_WHEELER` hardcoded today with `DRIVE` fallback on error). **Aggressive Mongo caching** via `GeoCache` model (grid-snapped reverse-geocode 30d TTL, forward-geocode by text 30d TTL, road-distance by grid-pair 7d TTL) — essential Google Maps billing control.

Frontend: Google Maps is the primary library (`@react-google-maps/api`), `shared/components/MapPicker.jsx` (address picker: search + draggable marker + current-location + zone-polygon validation) and `modules/DeliveryV2/components/map/LiveMap.jsx` (flagship live-tracking view: muted styling, polyline trimming/animation as rider progresses, simulation mode for QA).

### 1.14 Location handling

`FoodUser` has exactly two coordinate stores: `addresses[]` (saved pins, GeoJSON, 2dsphere-indexed) and `liveLocation` (current GPS, overwritten in place). `Driver` mirrors this with `lastLocation`/`lastLat`/`lastLng`/`lastLocationAt`, updated via the socket `update-location` handler.

### 1.15 Address management

`core/location/address.schema.js` — reusable embeddable sub-schema, used consistently across `FoodUser.addresses[]` and elsewhere.

### 1.16 Driver architecture

Single shared `Driver` collection (`food_delivery_partners`) across all verticals, disambiguated by `authorizedServices[]`/`registeredServices.{food, quick-commerce, porter, parcel, taxi}`. Lifecycle: `pending → approved | rejected | documents_required`, plus `availabilityStatus: online|offline`. 

**Dispatch/matching** (`order-dispatch.service.js`, ~1140 lines, the most complex file in the codebase) implements a **hyperlocal ring-escalation algorithm**: radius tiers `[2,4,6,10,15,20,30,45,60]` km widening every 20s via BullMQ retry jobs; excludes busy partners (Mongo query + Redis fast-lock `driverBusyLock.service.js`) and COD-cash-limit-exceeded partners; nearest-first haversine scoring with 10-min GPS staleness cutoff; broadcasts simultaneously to every eligible driver in the ring ("first to accept wins," race-safe via conditional Mongo update); admin escalation alert after 8 failed rounds; rich audit logging of exclusion reasons. The `order.dispatch{}` sub-document (`{status, deliveryPartnerId, offeredTo:[{partnerId, at, action}], acceptedAt, assignedAt}`) is the **direct template** for a Taxi trip's driver-matching state.

### 1.17 User architecture

`FoodUser` (collection `common_users`, despite the model name) is the single shared customer identity across every vertical — no per-vertical user model exists or should exist.

### 1.18 Admin architecture

No single `modules/admin/` — distributed. `core/admin/` holds accounts + RBAC (`FoodAdmin`, `AdminRole`). Each vertical owns domain-specific admin CRUD. **Two competing patterns exist**: (a) admin pages embedded inside `Food/components/admin` + `Food/pages/admin` (older, food-centric but generalized to also cover quick-commerce), and (b) self-contained `admin/` subfolders inside each newer module (`porter/admin/`, `quickCommerce/admin/`) with their own `routes/index.jsx`. **Pattern (b) is the recommended template for Taxi.**

### 1.19 Frontend architecture / component structure

Covered in 1.1–1.4. Three tiers of UI components exist: Tier 1 truly generic (`shared/components/*`, `components/ui/*`), Tier 2 a **near-duplicate** Food-local UI kit (`modules/Food/components/ui/*`, a known smell — do not add a 4th copy for Taxi), Tier 3 food-specific business components.

### 1.20 Responsive layout / Tailwind design system

Tailwind v4, CSS-first config (no `tailwind.config.js`), tokens live in `src/shared/styles/global.css` under `@theme inline`. Canonical brand primary: `--color-primary: #FF6A00` (orange). **Important gotcha:** `--color-blue-*`/`--color-indigo-*` are globally remapped to the orange palette — any Taxi code using `text-blue-500` will render orange, not blue. App is mobile-first, viewport locked (`user-scalable=no`), shipped inside a native WebView shell (Flutter/RN) via `core/native/nativeBridge.js`.

### 1.21 API response pattern

`utils/response.js`: `sendResponse(res, statusCode, message, data=null)` → `{success:true, message, data}`; `sendError` → `{success:false, message}`. Used uniformly.

### 1.22 Error handling strategy

`core/auth/errors.js` custom classes (`ValidationError` 400, `AuthError` 401, `NotFoundError` 404) thrown in services, caught by controllers' `try/catch → next(error)`, resolved by the global `middleware/errorHandler.js` (reads `err.statusCode`, logs with `requestId`, uniform JSON error shape). Note: an older `utils/ApiError.js`/`asyncHandler.js` pair also exists — worth reconciling before Taxi adds more code on top.

### 1.23 Logging strategy

Custom lightweight logger (`utils/logger.js`, not Winston/Pino) with emoji-prefixed console output, production noise suppression. Plus `morgan('dev')`, `requestId` middleware, response-time logger. No structured/external log aggregation.

### 1.24 Background jobs

BullMQ + Redis, fully feature-flagged (degrades gracefully if disabled). Named queues: OTP, ORDER, PAYMENT, TRACKING, SUBSCRIPTION. Concrete uses: `DISPATCH_TIMEOUT_CHECK` (ring retry), `sync-hot-locations` (deferred Mongo write-back of live GPS), hourly subscription-expiry sweep. Plus interval-based (non-BullMQ) jobs in `server.js`: offer expiry, FSSAI notification sync, outbox-relay sweep (every 5s), stuck-order recovery on boot.

### 1.25 Environment configuration

`config/env.js` — single flat `config` object from `.env` via dotenv, grouped by concern. A secondary, narrower `env` object also coexists (worth normalizing before adding Taxi keys). `config/validateEnv.js` gates boot. No per-vertical env namespacing convention exists yet.

---

## PHASE 2 — Reusability Audit

### Can Be Reused Without Changes

| Item | Why |
|---|---|
| `core/auth/*` (JWT issuance, error classes, token util) | Fully generic across actor types |
| `core/otp/*`, SMS/email senders | Generic OTP delivery, actor-agnostic |
| `core/roles/role.middleware.js`, `checkPermission` RBAC engine | Just add `taxi::*` permission keys |
| `core/location/location.service.js` (geocode, distance, cache) | 100% generic, vehicle-type is a parameter not a fork point |
| `core/notifications/*` (FCM, inbox, outbox/ring reliability) | Actor/event-type agnostic |
| `core/payments/*` (Payment, Transaction, Wallet, Razorpay, Refund, Settlement) | `module` field already exists for segmentation |
| `config/socket.js` (rooms, live-location broadcast, ETA calc, Redis+RTDB dual-write) | Room naming is already ID-agnostic |
| `queues/*` infra (BullMQ connection, producers/processors/workers pattern) | Add new job types, don't rebuild infra |
| `Driver` model | `taxi` already a first-class enum value in `authorizedServices`/`registeredServices` |
| `FoodUser` model | Single shared customer identity by design |
| `utils/response.js`, `middleware/errorHandler.js`, `core/auth/errors.js` | Platform-wide conventions |
| `core/models/actionPerformer.schema.js` | Generic admin-audit sub-schema |
| Frontend: `core/native/nativeBridge.js`, `core/firebase/client.js`, `core/services/trackingClient.js` (rename RTDB paths only), `core/location/*`, `shared/components/MapPicker.jsx`, `shared/components/{EmptyState,Loader,ErrorBoundary,NetworkStatusBanner}`, `shared/components/admin/*` kit, `lib/utils.js`, `core/guards/*` | All actor/vertical-agnostic |

### Can Be Reused With Small Extension

| Item | Extension needed |
|---|---|
| `Driver.registeredServices.taxi` / `authorizedServices` | Already has the shape; wire actual approval workflow + Taxi-specific document types (e.g. commercial permit, vehicle fitness certificate) if they differ from food/porter KYC |
| `core/location/location.service.js` `travelMode: TWO_WHEELER` | Add configurable travel mode (`DRIVE`) per vehicle type for car/auto trips |
| `Transaction.entityType` / `resolveWallet()` | Decide: reuse `'deliveryBoy'`/`'user'` entityTypes as-is (recommended) or add new entity types if Taxi needs isolated earnings buckets |
| `core/constants/roles.js` (frontend) | Add `TAXI_DRIVER` (or reuse `DELIVERY` — recommend a new distinct role since matching/eligibility differs) |
| `modules/common/utils/enabledModules.js` | Add `taxi` key to the module registry (this is the exact, established extension point) |
| `AdminModuleSwitcher.jsx` | Add Taxi pill (also fix: Porter isn't wired in here yet either) |
| axios interceptor per-module token/prefix maps | Add `/taxi` prefix + `auth_taxiDriver`/reuse pattern |
| `orderSocket.js` | Add ride-specific event names alongside order ones (same file or a thin parallel `rideSocket.js`) |
| `shared/styles/global.css` `@theme inline` | Add a Taxi accent token if a distinct "ride" color is wanted (avoid `blue-*`/`indigo-*` utility classes — they're globally repointed to orange) |

### Needs Refactoring Before Taxi

| Item | Problem | Recommended fix scope |
|---|---|---|
| Two frontend socket clients (`core/services/socket.js` vs `orderSocket.js`) | Only one is actually used; the other is dead weight that could mislead Taxi implementers into using the wrong one | Deprecate/remove the unused one, or clearly document orderSocket.js as canonical, before Taxi adds a third |
| Two frontend axios instances (`core/api/axios.js` vs `services/api/axios.js`) | Overlapping responsibility, unclear which is canonical | Consolidate or clearly document boundary before adding taxi domain API calls |
| Two backend env config shapes (`config` vs `env` in `config/env.js`) | Risk of Taxi code picking the wrong one inconsistently | Normalize to one object before adding Taxi env vars |
| Two competing admin UI integration patterns (embedded-in-Food vs self-contained-per-module) | Inconsistent mental model for where "admin for vertical X" lives | Standardize on the self-contained pattern (used by porter/quickCommerce) going forward; Taxi should use it, food's older pattern is legacy-only |
| Tier 2 Food-local UI kit (`modules/Food/components/ui/*`) duplicating Tier 1 | Third near-identical shadcn primitive set already exists (Tier1 `components/ui`, Tier1 `shared/components/ui`, Tier2 `Food/components/ui`) | Do not create a Tier-4 copy for Taxi — consume Tier 1 directly; flag existing duplication as tech debt separately |
| `PorterCoupon` has no consumption engine | Admin CRUD exists but was never wired to a live booking flow, so it's unproven | Do not blindly copy; Taxi coupon consumption must be built fresh against `coupon.service.js`'s pattern, tested against a real booking flow (which Porter never got) |
| `constants/permissions.js` (backend) is an empty stub | Permission keys are ad hoc strings scattered per route file, no central registry | Not blocking, but worth centralizing before Taxi adds another dozen `taxi::*` keys — otherwise the permission surface becomes unauditable |

### Taxi-Specific Components

- Trip/Ride model + trip-state FSM (see Phase 4).
- Fare calculation engine (base + distance + time + surge + waiting + tolls), templated on `PorterPricing`'s shape but requiring genuinely new calculation logic (Porter's pricing model was never executed against a live booking).
- Driver-matching dispatch engine for point-to-point trips — structurally like `order-dispatch.service.js` but ride-specific (single-driver-per-trip, not "prepare then deliver," pre-ride cancellation economics differ).
- OTP-based ride-start verification (distinct usage from the food drop-off OTP).
- SOS / emergency workflow (no existing analog in the codebase at all).
- Surge-pricing engine (no existing analog — food/porter have static or zone-based pricing only).
- Taxi vehicle-type catalog (Mini/Sedan/SUV/Auto) distinct from Porter's parcel-vehicle catalog.
- Taxi-specific admin oversight: live trip monitoring board, driver-taxi-approval workflow, fare-rule management per zone/vehicle.
- Driver app taxi-specific screens: trip-request full-screen alert, active-trip navigation view, fare summary/receipt.
- Rider app taxi-specific screens: pickup/drop selection (two-point booking, unlike Food's single-restaurant-to-address), vehicle-type selector, fare estimate, live-trip tracking, driver/vehicle info card, SOS button.

### Technical Debt Found

1. Two socket client implementations on frontend, one effectively dead — risk of future modules (including Taxi) picking the wrong one.
2. Two axios instances with overlapping concerns.
3. Two overlapping backend config shapes (`config` and `env` in the same file).
4. Three generations of the same shadcn-style UI primitives (global `components/ui`, `shared/components/ui`, `Food/components/ui`) with no clear deprecation path.
5. Two dead legacy routers on frontend (`src/module/*`, `src/core/routes/AppRouter.jsx`) referencing a module tree that no longer exists on disk — should be deleted, not extended, and pose a risk of confusing new contributors (including whoever builds Taxi).
6. `constants/permissions.js` (backend) is an empty stub; RBAC permission keys exist only as scattered string literals per route file with no central catalog or validation that a key actually corresponds to a real permission.
7. `utils/ApiError.js`/`asyncHandler.js` coexist with the newer `core/auth/errors.js` error-class convention — unclear which new code should use.
8. `AdminModuleSwitcher.jsx` doesn't yet include Porter despite Porter having its own admin tree — the multi-module admin switching UI is already lagging behind the number of actual verticals; Taxi will make this three verticals behind if not fixed.
9. `queues/notification.queue.js` exists as a file but doesn't appear in the active `QUEUE_NAMES` constant — dead or unfinished wiring, worth confirming before Taxi assumes it's live infrastructure.

### Missing Infrastructure

- **No surge-pricing engine anywhere in the codebase** — must be designed from scratch for Taxi (though the `Transaction`/`Payment` ledger and `PorterPricing`-style rule model both extend cleanly to hold surge multipliers).
- **No SOS/emergency workflow** — no existing model, notification pattern, or admin escalation path to adapt. This is the single largest net-new subsystem Taxi introduces to the platform (and one that Food/Quick Commerce/Porter would arguably also benefit from once built — design it as platform infrastructure, not Taxi-only, from day one).
- **No toll/waiting-charge line-item pattern** — Food/Porter's fare models don't have variable itemized surcharges; the Trip fare breakdown needs new structure (still nestable inside the existing `Payment.metadata`/order-pricing-service pattern).
- **No live "current trips" ops dashboard** — Food/Porter admin has order lists, not a real-time map-based fleet view; if Taxi needs this (recommended for a taxi vertical), it's new admin frontend work with no existing analog to fork, though `LiveMap.jsx` covers the single-trip rendering piece.
- **No car/four-wheeler travel-mode default** — `TWO_WHEELER` is hardcoded in one call site; needs to become a parameter.
- **No central RBAC permission-key catalog** (see tech debt #6) — not Taxi-specific but Taxi will be the module that most exposes the gap, given how many new admin permission keys it needs.

---

## PHASE 3 — Centralized Platform Design

**Guiding principle:** Taxi is a new *vertical*, not a new *platform*. Everything about "who the user/driver is," "how money moves," "how someone gets notified," and "how the admin authenticates" is already solved centrally — Taxi must plug into those systems, not reimplement them. Only "what a trip is and how it's priced/matched" is genuinely new domain logic.

| System | Sharing model | Notes |
|---|---|---|
| **User** | Fully shared — `FoodUser` is the one and only customer identity | A person orders food, books a parcel, and books a ride with the same account, same wallet, same address book. No `TaxiUser` model. |
| **Driver** | Fully shared — `Driver` model, differentiated by `authorizedServices`/`registeredServices.taxi` | A person can be a food-delivery rider and a taxi driver simultaneously (or exclusively) using one identity, one document-verification pipeline, one wallet. |
| **Authentication** | Fully shared — `core/auth/*`, same JWT/OTP mechanism | Taxi rider login = existing USER OTP flow. Taxi driver login = existing DELIVERY_PARTNER OTP flow, gated by `registeredServices.taxi.status === 'approved'` instead of (or in addition to) the food equivalent. |
| **Wallet** | Fully shared ledger, `module: 'taxi'` tag for reporting | Rider pays from the same wallet balance used for food; driver earnings land in the same `FoodDeliveryWallet` (renaming to a vertical-neutral name is a *nice-to-have*, not required — see Phase 9 tech-debt cleanup). |
| **Payments** | Fully shared — Razorpay, `Payment`/`Transaction`, webhook idempotency | Trip fare = a `Payment` row with `module: 'taxi'`, `orderId` pointing at the Trip id. |
| **Notifications** | Fully shared — FCM, in-app inbox, outbox/ring reliability layer | New ride request reuses the exact "ring" delivery mechanism that makes food-order offers reconnect-safe. |
| **Firebase** | Fully shared — one RTDB instance, one FCM project | Taxi gets new RTDB path namespaces (`taxiLocations/{tripId}/...`), not a new Firebase project. |
| **Socket.io** | Fully shared — one server, new room names | `tracking:{tripId}` reuses the existing (already ID-agnostic) room-naming convention; `update-location` event reused as-is. |
| **Admin Panel** | Shared shell + Taxi-specific self-contained module | One admin login, one sidebar, one `AdminModuleSwitcher`; Taxi's screens live in their own `modules/Taxi/admin/` following the porter/quickCommerce pattern, not embedded in Food's admin tree. |
| **Analytics** | Should be shared at the aggregation layer | `Transaction.module` and `Payment.module` already let a single revenue-reporting service segment by vertical without per-vertical reporting code. Build one cross-vertical analytics/reporting service, filterable by module — do not build a Taxi-only reports screen from scratch if a generic one is planned. |
| **Audit Logs** | Shared mechanism (`actionPerformerSchema`), per-model application | Every Taxi admin model (TaxiZone, TaxiVehicleType, TaxiPricing, etc.) embeds the same `actionPerformerSchema` used by Porter's models. |
| **Roles & Permissions** | Shared engine, new permission keys | Add `taxi::*` namespace to the `checkPermission` system exactly as Porter did with `porter::*`. |
| **Settings** | Shared global-settings module (`modules/common/`) for cross-cutting config; Taxi-specific settings (fare rules, zones) live in Taxi's own admin models | Don't put Taxi fare config in the generic settings module — it needs structured, queryable models like `PorterPricing`, not flat key-value settings. |
| **Media Storage** | Fully shared — `modules/media/`, Cloudinary | Vehicle document photos, driver selfies for Taxi reuse the same upload/media pipeline as Food/Porter KYC docs. |
| **Address Book** | Fully shared — `FoodUser.addresses[]` | Taxi's pickup/drop pickers read/write the same saved-address list as Food's delivery-address picker. |
| **Reviews** | New pattern, shared infrastructure recommended | No generic review/rating model currently exists cross-vertical (`Driver.rating`/`totalRatings` is a running aggregate, not itemized reviews). Recommend building a shared `Review` model (`{targetType: 'driver'|'restaurant', targetId, module, rating, comment, orderId/tripId}`) now, since Taxi needs it and Food doesn't cleanly have one either — this avoids Taxi creating a Taxi-only review model that later needs merging. |
| **Transactions** | Fully shared ledger | Already covered under Wallet/Payments — one `Transaction` collection, filtered by `module`. |

**What stays service-specific (must NOT be centralized):**
- Trip/ride domain model and its state machine.
- Fare calculation and surge-pricing logic.
- Trip-matching/dispatch algorithm (even though it should mirror `order-dispatch.service.js` structurally, the eligibility rules, cancellation economics, and "who can be offered a ride" logic are trip-specific).
- Vehicle-type catalog and zone/pricing configuration (Taxi's own `TaxiZone`/`TaxiVehicleType`/`TaxiPricing` models, distinct from Porter's).
- SOS workflow content/escalation rules (even if the underlying alert-delivery mechanism is shared).
- Taxi-specific UI screens (booking flow, live trip view, driver navigation).

---

## PHASE 4 — Complete Taxi Domain Design

### 4.1 Ride lifecycle

```
requested → searching (driver matching in progress)
          → driver_assigned → driver_arriving → driver_arrived
          → trip_started (OTP-verified) → in_progress
          → trip_completed → payment_settled → closed
Alternate exits: cancelled_by_rider | cancelled_by_driver | cancelled_by_system (no driver found) | no_show
```

This is modeled directly on `FoodOrder`'s `orderStatus` FSM (`orderStateMachine.js`) plus the `dispatch{}` sub-document pattern from `order-dispatch.service.js`, adapted for point-to-point (single pickup, single drop, one driver, no "prepare" stage).

### 4.2 Driver lifecycle (Taxi-specific layer on top of the shared `Driver` identity)

```
Driver.registeredServices.taxi.status:
  not_registered → pending (KYC submitted: DL, RC, permit, vehicle photos, insurance)
                 → approved | rejected | documents_required

Once approved, per-shift:
  offline → online (available for matching)
          → on_trip (matched, unavailable for new offers)
          → online (trip closed, back in pool)
```

Reuses `Driver.availabilityStatus` and `Driver.status`-style pattern but scoped under `registeredServices.taxi` so a driver can be `approved` for food and simultaneously `pending`/`rejected` for taxi.

### 4.3 Vehicle lifecycle / vehicle approval process

Distinct from Porter's parcel-vehicle catalog (which is a static admin-defined pricing dimension, not tied to a specific physical vehicle document). Taxi vehicles need per-driver document approval:
```
Vehicle document submitted (RC, insurance, permit, fitness certificate, PUC)
  → pending_review → approved | rejected | expired (re-submission required)
```
Recommend a `TaxiDriverVehicle` sub-document or model (owned by the driver, referencing a `TaxiVehicleType`) distinct from the admin-managed `TaxiVehicleType` catalog (Mini/Sedan/SUV/Auto — the pricing dimension, analogous to `PorterVehicle`).

### 4.4 Ride states / Driver states / Vehicle approval

Covered above (4.1–4.3). Cross-reference: a trip can only enter `searching` if driver pool has ≥1 driver with `registeredServices.taxi.status === 'approved'`, `availabilityStatus === 'online'`, an `approved` vehicle document, and no active trip lock (busy-lock pattern reused from `driverBusyLock.service.js`).

### 4.5 Passenger journey

1. Open Taxi tab (from the shared module switcher) → land on booking screen.
2. Set pickup (defaults to live location, editable via `MapPicker`) and drop (search/autocomplete).
3. See vehicle-type options with fare estimates (calls fare-estimate endpoint, no commitment).
4. Confirm ride → trip enters `searching`.
5. Live "finding driver" screen (reuse ring/broadcast + resync pattern) → driver assigned → live map with driver approaching (reuse `LiveMap.jsx` shape, RTDB-sourced).
6. Driver arrives → rider optionally shares OTP with driver to start trip (or driver enters displayed OTP).
7. Live trip tracking during `in_progress`.
8. Trip ends → fare summary/receipt → payment settlement (wallet auto-debit or online payment capture) → rate driver.

### 4.6 Driver journey

1. Onboarding: KYC + vehicle document submission (mirrors `DeliveryV2` two-step signup + OTP + "pending verification" gate).
2. Go online → enters matching pool.
3. Full-screen ride-request alert with ring/countdown (reuse `NewOrderModal.jsx` pattern + `nativeBridge.js` ring).
4. Accept (race-safe, first-to-accept-wins) → navigate to pickup (turn-by-turn via Google Maps deep link or in-app polyline).
5. Arrive → notify rider → wait for OTP-based trip start.
6. Drive to destination, live location streamed throughout.
7. End trip (system or manual, e.g. geofence-arrival trigger) → fare computed → collect payment (if cash) or auto-settle (wallet/online) → rate rider.
8. Earnings reflected in the shared driver wallet, `module: 'taxi'`-tagged transactions.

### 4.7 Admin workflow

- Approve/reject driver taxi-registration + vehicle documents.
- Configure zones, vehicle types, base/per-km/per-min pricing, surge rules, cancellation-fee rules.
- Configure/approve Taxi coupons.
- Live trip monitoring (in-progress trips, searching trips with no match — the "stuck order recovery" pattern from Food generalizes here).
- Dispute/refund handling for cancelled or disputed trips (reuses `refund.service.js`).
- Driver settlement/payout oversight (reuses `settlement.service.js`).
- SOS alert triage queue.

### 4.8 Fare calculation

Base structure templated on `PorterPricing` but computed live per trip (Porter's model is never executed today):
```
fare = baseFare(vehicleType, zone)
     + distanceCharge(kmTravelled × perKmRate)
     + timeCharge(minutesTravelled × perMinRate)     [new dimension vs Porter]
     + waitingCharge(waitMinutesBeyondFree × perMinWaitRate)   [new]
     + tollCharge(if applicable, driver-declared or route-detected)  [new]
     × surgeMultiplier(zone, time-of-day, demand/supply ratio)  [new]
     − couponDiscount
     + platformServiceFee
```
Estimate shown pre-booking uses `getRoadDistance`/`getRoadDistanceMatrix` (already generic) with `travelMode: DRIVE`; final fare recomputed from actual tracked distance/time at trip close (mirrors how Food recomputes ETA live rather than trusting the initial estimate).

### 4.9 Dynamic pricing / surge pricing

**No existing analog in the codebase — new subsystem.** Recommend: a `TaxiSurgeRule` model (zone, time-window or real-time-demand-trigger, multiplier, active flag) evaluated at fare-estimate and fare-finalization time. Real-time demand-based surge (vs. scheduled time-window surge) requires tracking live searching-trip-count vs. online-driver-count per zone — a new lightweight aggregation, not present anywhere today. Start with time-window/zone-based surge (simple, no new real-time infra) and treat demand-based surge as a fast-follow.

### 4.10 Waiting charges

New fare line-item (4.8). Trip model needs `arrivedAt` and `tripStartedAt` timestamps to compute wait duration; free-wait-minutes threshold configurable in `TaxiPricing`.

### 4.11 Toll handling

New fare line-item. Two viable approaches: (a) driver self-declares toll amount with photo proof (simplest, matches the platform's general pattern of trusting driver-submitted evidence with admin dispute resolution), or (b) route-based automatic toll lookup (requires a third-party toll API — out of scope unless explicitly requested). Recommend (a) for v1.

### 4.12 Cancellation rules

Templated on order-cancellation patterns already implicit in `FoodOrder`'s dispatch/status model, but taxi-specific economics: free cancellation window before driver assignment; cancellation fee if cancelled after driver assigned/arrived (configurable in `TaxiPricing`); driver-side cancellation penalties (repeated cancellations reduce ranking in matching — new logic, no existing analog, but conceptually similar to how COD-limit-exceeded drivers get deprioritized in `order-dispatch.service.js`).

### 4.13 OTP verification

Reuses `core/otp/` infrastructure but a **new usage context**: trip-start OTP (rider shows driver, or driver enters what rider tells them) is functionally analogous to Food's `delivery_drop_otp` handover pattern — same mechanism, different trigger point in the lifecycle (start-of-service vs. end-of-service).

### 4.14 Live tracking

Fully reuses existing infrastructure: Socket.IO `update-location` event, `tracking:{tripId}` room, Redis hot-cache + BullMQ deferred Mongo persistence, Firebase RTDB dual-write. Frontend reuses `trackingClient.js` (new RTDB path namespace) and `LiveMap.jsx`'s rendering approach (fork into a Taxi-specific component, since the data shape — single trip, single driver — is simpler than Food's shared component's assumptions, but the polyline-trimming/animation utilities are directly reusable).

### 4.15 Ride completion

System-triggered (geofence arrival at drop coordinates) or driver-manual "End Trip" action. Triggers: final fare computation, payment capture/wallet settlement, driver wallet credit, rider/driver mutual rating prompts, socket room teardown.

### 4.16 Payment lifecycle

Identical shape to Food: `Payment` row created at trip-request or trip-completion (design choice — recommend creating at completion once final fare is known, avoiding pre-auth complexity for v1), `method: cash|wallet|online`, settled via existing `payment.service.js`/`transaction.service.js`, `module: 'taxi'`.

### 4.17 Refund lifecycle

Reuses `refund.service.js` as-is — e.g., system-cancelled trips (no driver found) auto-refund any pre-authorized amount; disputed trips go through admin-triggered refund.

### 4.18 Settlement lifecycle

Reuses `settlement.service.js` — driver taxi earnings settle through the same payout mechanism as delivery-partner earnings, `module`-tagged for separate reporting/reconciliation if the business wants to settle taxi and food earnings on different schedules.

### 4.19 Ratings

Driver-side: extend `Driver.rating`/`totalRatings` running aggregate (already generic, not food-specific) to also accept taxi-trip ratings — same aggregate, `module`-agnostic by nature. Rider-side rating (driver rates passenger) has no existing analog — new field/mechanism if desired, low complexity.

### 4.20 Reviews

Per Phase 3: no generic itemized-review model exists yet. Recommend building the shared `Review` model now (Taxi is the first consumer, but the model is designed vertical-agnostic from day one — avoids yet another isolated review system).

### 4.21 SOS workflow

**Entirely new subsystem, no existing analog.** Recommended shape: rider/driver-triggered SOS button during an active trip → creates an `SosAlert` record (tripId, triggeredBy, location snapshot, timestamp) → immediately notifies: (a) platform admin via the highest-priority notification channel (push + in-app + potentially SMS to an ops on-call number — new integration), (b) optionally pre-configured emergency contacts (new feature, needs contact-management UI), (c) live location continues streaming even if the rest of the app is backgrounded. Admin gets a dedicated SOS triage queue (Phase 4.7). Recommend building this as `core/safety/` (platform-level, not `modules/taxi/`) since Food/Porter delivery riders would benefit from the same SOS mechanism — this is exactly the kind of cross-cutting concern the codebase's `core/` convention exists for.

### 4.22 Support workflow

Reuses existing support-ticket patterns already present in `DeliveryV2/pages/help/` (rider support tickets) and Food's `pages/user/complaints/` — extend the same ticketing model with a `module: 'taxi'` tag and trip-context fields rather than building a parallel support system.

---

## PHASE 5 — Database Planning

### Existing collections/models that can be reused as-is

- `FoodUser` (`common_users`) — Taxi rider identity.
- `Driver` (`food_delivery_partners`) — Taxi driver identity (already has `taxi` in enums).
- `FoodAdmin`, `AdminRole` — admin accounts/RBAC.
- `Payment`, `Transaction`, `Refund`, `Settlement`, `ProcessedWebhookEvent` — money movement.
- `FoodUserWallet`, `FoodDeliveryWallet`, `FoodAdminWallet` — balances (rider = FoodUserWallet, driver = FoodDeliveryWallet).
- `GeoCache` — geocode/distance caching.
- `FoodNotification`, `notificationBroadcast` — in-app inbox.
- `OTP` model.
- `FoodRefreshToken`, `IdempotencyKey`.
- `actionPerformerSchema`, `address.schema.js` — reusable sub-schemas.

### Existing collections that should be extended

- `Driver` — extend `registeredServices.taxi` usage (already schema-present; needs the *workflow* built, not new fields) and add a taxi-vehicle-documents sub-structure if vehicle documents differ meaningfully from food's delivery-vehicle fields (they likely do: RC, permit, fitness certificate, PUC vs. a two-wheeler's simpler document set).
- `Transaction`/`Payment` — no schema change needed, just consistent `module: 'taxi'` usage.

### New Taxi-specific models needed

| Model | Purpose | Closest existing template |
|---|---|---|
| `TaxiTrip` | Core trip/booking record: pickup, drop, status FSM, dispatch sub-doc, fare breakdown, OTPs, timestamps | `FoodOrder` + its `dispatch{}` sub-doc + `orderStateMachine.js` |
| `TaxiZone` | Service-area polygons for pricing/eligibility | `PorterZone` |
| `TaxiVehicleType` | Mini/Sedan/SUV/Auto catalog with capacity, base pricing dimension | `PorterVehicle` |
| `TaxiPricing` | Base fare, per-km, per-min, waiting rate, cancellation fee, free-wait-minutes, per zone × vehicle type | `PorterPricing` |
| `TaxiSurgeRule` | Zone/time-window (or demand-triggered) multiplier | No existing template — new |
| `TaxiCoupon` | Taxi-specific coupon definitions | `PorterCoupon` (admin CRUD shape) + `coupon.service.js` (consumption logic, built fresh) |
| `TaxiDriverVehicle` | Per-driver vehicle + document approval record, references `TaxiVehicleType` | New, loosely modeled on `Driver`'s embedded document fields |
| `SosAlert` (recommend under `core/safety/`, not `modules/taxi/`) | Emergency trigger record | New — no template |
| `Review` (recommend under `core/`, not `modules/taxi/`) | Itemized ratings/reviews, vertical-agnostic | New — no template, but designed shared from day one |

### Relationships between entities

```
FoodUser (rider) 1---* TaxiTrip *---1 Driver (driver)
TaxiTrip *---1 TaxiVehicleType
TaxiTrip *---1 TaxiZone (pickup zone, for pricing)
TaxiTrip 1---1 Payment 1---* Transaction
TaxiTrip 1---0..1 SosAlert
TaxiTrip 1---0..2 Review (rider→driver, driver→rider)
Driver 1---* TaxiDriverVehicle
TaxiPricing *---1 TaxiZone, *---1 TaxiVehicleType
TaxiSurgeRule *---1 TaxiZone
```

### Ownership of data

- Rider owns their profile/addresses (via shared `FoodUser`) — Taxi module never owns rider identity data, only references it.
- Driver owns their vehicle/document data (via shared `Driver` + new `TaxiDriverVehicle`) — same principle.
- Taxi module owns: `TaxiTrip`, `TaxiZone`, `TaxiVehicleType`, `TaxiPricing`, `TaxiSurgeRule`, `TaxiCoupon`.
- Platform core owns: `SosAlert`, `Review` (shared, cross-vertical) — Taxi is a consumer, not the owner, to avoid the "Taxi-only" trap described in Phase 3/4.

### Data lifecycle

- `TaxiTrip` — active during the ride lifecycle, then immutable historical record (mirrors `FoodOrder` retention).
- Live-location pings — hot in Redis/RTDB during trip, cold-persisted to Mongo via the existing deferred-sync BullMQ job, same TTL/retention policy the Food tracking system already uses.
- `GeoCache` entries — shared TTL policy applies automatically (no Taxi-specific change).

### Archival strategy

Follow whatever archival policy Food/Porter orders already use for `FoodOrder` (not fully inspected in this pass — recommend confirming the existing retention/archival job, if any, before designing a separate one for `TaxiTrip`; if none exists today, that's a platform-wide gap worth flagging, not something to solve uniquely for Taxi).

---

## PHASE 6 — API Planning

### API groups

- `/v1/taxi/auth` — thin pass-through/alias to existing `core/auth` OTP flows scoped for taxi context if any taxi-specific auth branching is needed (likely minimal — mostly reuse `/v1/food/auth` and `/v1/auth` as-is, since identity is shared).
- `/v1/taxi/rider` — booking, fare estimate, trip status, trip history, ratings (rider-facing).
- `/v1/taxi/driver` — go online/offline, accept/reject offers, active trip actions (arrived/start/end), earnings, taxi-specific onboarding/document submission.
- `/v1/taxi/admin` — zones, vehicle types, pricing, surge rules, coupons, driver-taxi approval, trip monitoring, disputes.
- `/v1/taxi/public` (or folded into `/v1/location`) — vehicle-type catalog, zone lookup for the booking screen's pre-auth fare estimate.

Mirrors the existing pattern: `modules/food/orders/routes/{order.routes.js, order.routes.user.js, sync.routes.js}` all separately mounted from the central router → Taxi should do `modules/taxi/routes/{trip.routes.user.js, trip.routes.driver.js, admin.routes.js}`.

### Responsibilities

- Rider routes: never expose driver PII beyond what's needed for trust (name, photo, vehicle, rating) — mirrors how Food hides internal dispatch data from customers.
- Driver routes: gated by `registeredServices.taxi.status === 'approved'` in addition to standard `authMiddleware`.
- Admin routes: gated by `checkPermission('taxi::<resource>', action)`.

### Versioning strategy

Follow the existing flat `/v1` convention — no per-module versioning precedent exists, so Taxi shouldn't introduce one unilaterally.

### Authentication requirements

All routes require `authMiddleware` except the public vehicle-type/zone catalog (mirrors `/v1/location`'s public-utility pattern) and public health checks.

### Authorization rules

`requireRoles('USER')` for rider routes, `requireRoles('DELIVERY_PARTNER')` + taxi-approval check for driver routes, `requireRoles('ADMIN','EMPLOYEE')` + `checkPermission('taxi::*', ...)` for admin routes — exact mirror of existing conventions, no new authorization primitive needed.

### Idempotency considerations

Trip creation and payment-capture endpoints should use the existing `core/idempotency/idempotencyKey.model.js` + `middleware/idempotency.js` mechanism (already generic), exactly as Razorpay webhook handling does via `ProcessedWebhookEvent`. Critical for trip-request endpoints given mobile clients commonly double-submit on flaky networks.

### Validation strategy

Follow the established per-module `validators/*.js` manual-function pattern (not a schema library) — consistent with every other module, no new validation approach to introduce.

### Error response strategy

Reuse `sendResponse`/`sendError` + `core/auth/errors.js` classes uniformly — no Taxi-specific error shape.

---

## PHASE 7 — Real-Time Architecture

### Socket event flow

Reuse `config/socket.js` wholesale. New room: `tracking:{tripId}` (the existing `tracking:{orderId}` room naming is already ID-agnostic — either literally reuse the same room-name function with a trip ID, or add a `taxi:{tripId}` alias for clarity in logs/debugging — recommend the latter for operational clarity even though functionally either works).

### Driver location updates

Driver emits the existing `update-location` event unchanged (`{tripId (as orderId param), lat, lng, heading, speed, accuracy, polyline, status}`) — server-side throttling, ETA computation, Redis buffering, and Firebase dual-write all apply without modification.

### Passenger updates

Reuse `location-update` broadcast to `tracking:{tripId}` + `user:{riderId}` rooms — same event name and payload shape as Food's order tracking.

### Ride events

New logical events layered on the existing socket transport (either add to `orderSocket.js` or fork a `rideSocket.js` with an identical shape): `ride:requested`, `ride:driver_assigned`, `ride:driver_arrived`, `ride:started` (OTP-verified), `ride:completed`, `ride:cancelled` — directly analogous to `order:status:update`/`delivery:broadcast`/`delivery:otp:*`.

### Notification events

Reuse the outbox/ring reliability layer (`orderEvents.service.js`/`orderOutboxRelay.service.js`) for "new ride offer" broadcasts to nearby drivers — same reconnect-safe, ack-based mechanism that makes food-order offers reliable.

### Firebase usage

New RTDB path namespace: `taxiLocations/{tripId}/{driverId}` (mirrors `deliveryLocations/{orderId}/{deliveryBoyId}`), `trips/{tripId}/{driver,trail,route}` (mirrors `orders/{orderId}/{rider,trail,route}`). `trackingClient.js` on the frontend is reused near-verbatim with renamed paths.

### Offline handling

Reuse the existing `resync`/`resync_complete` socket events — on reconnect, server re-emits current trip state + any pending un-acked ride offers, exactly as it does for orders today.

### Reconnection strategy

No new work — Socket.IO's built-in reconnection (already configured client-side with `reconnection: true`) plus the resync mechanism covers this.

### Scalability concerns

- The existing Redis adapter for Socket.IO already supports horizontal scaling — no Taxi-specific change needed there.
- The ring-broadcast dispatch pattern (broadcasting to every eligible driver in a radius simultaneously) is proven at Food's delivery scale; Taxi's matching frequency and geographic density may differ (rides are typically more time-sensitive than food delivery matching), so the radius-tier timing constants (`RING_RETRY_DELAY_MS = 20s`, tiers `[2,4,6,...]` km) should **not** be reused as literal defaults — they need Taxi-specific tuning, even though the algorithm shape is reused.
- Live-location write throughput: Taxi trips are typically shorter and more numerous during peak hours than food deliveries in a given zone; monitor Redis hot-cache and BullMQ deferred-write queue depth under Taxi's expected load profile before assuming Food's current throttle intervals (2s socket broadcast, 10s Firebase write, 30s Mongo persistence) are sufficient — likely fine unadjusted for v1, called out as a monitoring item for Phase 10.

---

## PHASE 8 — UI/UX Consistency

Taxi must read as another tab in the same product, not a bolted-on app. Concretely:

### Layout & Navigation

Mount at `/taxi/*` exactly like `/food/*`/`/quick/*`/`/porter/*` in `app/routes.jsx`. Add `taxi` to `modules/common/utils/enabledModules.js` so it participates in the existing tab-switcher on the shared Home shell, the `ModuleAccessGuard`, and the admin `AdminModuleSwitcher`. Taxi driver app mounts as its own sub-route reusing the `DeliveryV2` shell pattern (`DeliveryLayout`, `BottomNavigation`) rather than inventing new chrome.

### Responsive behaviour / Mobile-first approach

Inherit the existing locked-viewport, WebView-shell assumptions (`nativeBridge.js`) without modification — Taxi is not a separate deployment target.

### Cards, Tables, Forms, Buttons, Dialogs

Consume Tier 1 primitives directly: `shared/components/ui/*` (Card, Button, Modal, DataTable, StatCard, Pagination) for admin screens, `shared/components/admin/*` kit (AdminTable, FilterBar, FormField, FormLayout, StatusBadge) for all Taxi admin CRUD screens — do not fork a Taxi-local UI kit (this is the one explicit anti-pattern flagged in Phase 2's tech debt: three generations of near-duplicate primitives already exist; a fourth is the wrong move).

### Maps

Reuse `MapPicker.jsx` for pickup/drop selection unchanged (it already supports zone-polygon overlays, which Taxi needs for service-area validation). Fork `LiveMap.jsx`'s rendering/polyline-animation approach into a Taxi-scoped component (data shape differs — one driver/one trip vs. Food's potentially multi-leg context) but keep the same muted map styling for visual consistency with the delivery-tracking experience riders may have already seen in Food.

### Typography, Colors, Icons

Typography: inherit the existing `Inter`-based `--font-display`/`--font-poppins`/`--font-outfit` tokens — no new type scale. Colors: use `--color-primary` (#FF6A00 orange) for primary CTAs to stay visually unified with the rest of the app; if a distinct "ride" accent is desired for map markers/status chips, add a new named token (e.g. `--color-taxi-accent`) to the same `@theme inline` block in `global.css` — explicitly avoid `blue-*`/`indigo-*` Tailwind utility classes since they're globally repointed to orange platform-wide (a real trap for anyone unfamiliar with this codebase). Icons: reuse the existing icon set/convention (`shared/components/CategoryIcon.jsx`, `IconSelector.jsx`) rather than importing a new icon library.

### Loading states, Skeletons, Empty states, Animations

Reuse `shared/components/EmptyState.jsx`, `Loader.jsx`, and the existing skeleton components (`AppShellSkeleton`, `ContentPageSkeleton` patterns from `app/routes.jsx`) for Taxi's route-level Suspense fallbacks — same visual language for "app is loading a module" that Food/Quick/Porter already established. Motion: reuse `framer-motion` conventions already used elsewhere (e.g. `DeliveryV2`'s `ActionSlider`/`GlassCard`) rather than introducing a new animation library.

### Accessibility

No accessibility-specific patterns were surfaced in either research pass — treat this as a gap to address explicitly during Taxi implementation (contrast checks against the orange-on-white palette, focus states on the map picker, screen-reader labeling on the SOS button given its safety-critical nature) rather than assuming existing conventions cover it.

---

## PHASE 9 — Development Roadmap

Each phase below assumes the previous phase's deliverables are merged and stable. Complexity is relative (Low/Medium/High/Very High), not absolute time estimates — sizing should come from the team once this blueprint is reviewed.

### Phase 0 — Foundation & Platform Extensions
**Objective:** Make the platform Taxi-ready without writing any Taxi domain logic yet.
**Dependencies:** None.
**Complexity:** Low–Medium.
**Risks:** Touches shared code (`enabledModules.js`, `roles.js`, `AdminModuleSwitcher.jsx`) — must not regress Food/Quick/Porter.
**Shared modules used:** `core/constants/roles.js`, `modules/common/utils/enabledModules.js`, `AdminModuleSwitcher.jsx`, `core/roles` permission catalog.
**Deliverables:** New `TAXI_DRIVER` role constant; `taxi` key added to the module registry (frontend + wherever it's mirrored server-side, e.g. business/tenant module-toggle config); `taxi::*` permission namespace scaffolded (even if unused yet); resolve the two-axios / two-socket-client / two-config-shape tech debt *before* Taxi code starts landing on top of the ambiguous one.

### Phase 1 — Core Domain Models
**Objective:** Stand up `TaxiTrip`, `TaxiZone`, `TaxiVehicleType`, `TaxiPricing`, `TaxiDriverVehicle` and the trip-state FSM, no APIs exposed yet.
**Dependencies:** Phase 0.
**Complexity:** Medium.
**Risks:** Getting the `TaxiTrip` schema wrong is expensive to fix once trips are live in production — invest review time here specifically.
**Shared modules used:** `actionPerformerSchema`, `address.schema.js`, `Driver`/`FoodUser` models (referenced, not modified).
**Deliverables:** Mongoose models + migration/seed scripts for initial zones/vehicle types/pricing; unit-tested state machine.

### Phase 2 — Driver Onboarding Extension
**Objective:** Let a driver register for Taxi service (KYC + vehicle documents) and get admin-approved.
**Dependencies:** Phase 1.
**Complexity:** Medium.
**Risks:** Document-type differences from food (permit, fitness cert) may require new upload UI, not just new fields.
**Shared modules used:** `core/auth` (existing driver OTP login), `modules/media` (document uploads), `core/notifications` (approval/rejection alerts).
**Deliverables:** Backend endpoints for taxi registration submission + admin approval; frontend onboarding flow forked from `DeliveryV2`'s signup pattern.

### Phase 3 — Fare Engine
**Objective:** Fare estimation (pre-booking) and fare finalization (post-trip), including waiting/toll line items, excluding surge for now.
**Dependencies:** Phase 1.
**Complexity:** Medium–High.
**Risks:** Getting distance/time-tracking accuracy wrong directly affects revenue and rider trust — needs real-world road-test validation, not just unit tests.
**Shared modules used:** `core/location/location.service.js` (with `DRIVE` travel mode), `core/payments`.
**Deliverables:** `order-pricing.service.js`-style fare calculation service; fare-estimate API; fare-finalization logic tied to trip completion.

### Phase 4 — Trip Booking & Dispatch (Rider + Driver core loop)
**Objective:** End-to-end happy path: rider requests → driver matched → trip completed, no payment yet (assume cash/manual).
**Dependencies:** Phases 1–3.
**Complexity:** Very High — this is the heart of the module.
**Risks:** Dispatch race conditions (double-assignment), driver-busy-lock correctness, socket reconnect edge cases. Recommend heavy load-testing against the existing `driverBusyLock.service.js` pattern before trusting it at Taxi's expected concurrency.
**Shared modules used:** `config/socket.js`, `core/notifications` (ring/outbox), `queues/*` (dispatch-timeout retry), `core/otp` (trip-start verification).
**Deliverables:** Rider booking flow (frontend + backend), driver matching engine, driver accept/reject flow, live tracking (backend socket + Firebase wiring, frontend `LiveMap` fork).

### Phase 5 — Payments & Wallet Integration
**Objective:** Wire fare settlement into the existing payment/wallet/transaction ledger.
**Dependencies:** Phase 4.
**Complexity:** Medium.
**Risks:** Getting `module: 'taxi'` tagging consistent everywhere is easy to get wrong in a few call sites and hard to backfill later — enforce via code review checklist.
**Shared modules used:** `core/payments/*` (Payment, Transaction, Wallet, Razorpay, Refund, Settlement) — no new payment infra.
**Deliverables:** Payment capture on trip completion, wallet debit/credit wiring, refund handling for cancelled trips.

### Phase 6 — Admin Console
**Objective:** Full admin CRUD (zones, vehicle types, pricing, coupons) + live trip monitoring + driver-taxi approval queue.
**Dependencies:** Phases 1–3 (data models must exist); can run in parallel with Phase 4–5 once models are stable.
**Complexity:** Medium.
**Risks:** Low — this is the most well-templated part of the whole project (`modules/porter/admin/` is a near-literal structural copy).
**Shared modules used:** `shared/components/admin/*` kit, `checkPermission` RBAC, `actionPerformerSchema`.
**Deliverables:** `modules/Taxi/admin/` (frontend) + `modules/taxi/admin/` (backend) following the Porter self-contained pattern.

### Phase 7 — Coupons, Ratings/Reviews, Support
**Objective:** Secondary rider-experience features.
**Dependencies:** Phase 4 (trips must exist to attach coupons/ratings/support tickets to), Phase 3 pricing engine (for coupon discount application).
**Complexity:** Medium.
**Risks:** Coupon consumption engine is genuinely new logic (Porter never built one) — budget real design/testing time, don't treat it as a copy-paste task.
**Shared modules used:** New shared `Review` model (build here if not built earlier — recommend building it as platform-level per Phase 3/4 of this document), existing support-ticket pattern from `DeliveryV2`/Food.
**Deliverables:** `TaxiCoupon` + consumption logic; rating/review capture UI both sides; support ticket integration.

### Phase 8 — Surge Pricing
**Objective:** Time-window/zone-based surge multiplier (v1); demand-based surge as fast-follow.
**Dependencies:** Phase 3 (fare engine), Phase 6 (admin UI to configure rules).
**Complexity:** Medium (time-window) / High (demand-based, needs new real-time supply/demand aggregation — no existing infra).
**Risks:** Demand-based surge specifically has no precedent anywhere in the codebase; treat as its own mini-project, not a fare-engine afterthought.
**Shared modules used:** Fare engine, admin kit.
**Deliverables:** `TaxiSurgeRule` model + evaluation logic + admin configuration screen.

### Phase 9 — SOS / Safety
**Objective:** Emergency-trigger workflow, built as platform-level infrastructure (`core/safety/`) with Taxi as first consumer.
**Dependencies:** Phase 4 (needs an active-trip context to attach to), notification infrastructure (already exists).
**Complexity:** High — safety-critical, needs careful design/testing regardless of code volume.
**Risks:** This is genuinely new territory for the platform (no existing pattern to lean on) and has real-world consequences if it fails silently — recommend a dedicated design review before implementation, and explicit alerting/monitoring on the SOS pipeline itself (i.e., monitor that SOS notifications are actually being delivered, not just that the code deploys clean).
**Shared modules used:** `core/notifications` (highest-priority channel), potentially new SMS-to-oncall integration.
**Deliverables:** `SosAlert` model, trigger endpoint + UI (rider + driver), admin triage queue, escalation notification path.

### Phase 10 — Hardening & Launch Prep
**Objective:** Load testing, monitoring, edge-case cleanup, staged rollout.
**Dependencies:** All prior phases.
**Complexity:** Medium.
**Risks:** See Phase 10 (Production Readiness) below in full.
**Shared modules used:** All of the above.
**Deliverables:** See production-readiness checklist.

---

## PHASE 10 — Production Readiness

### Security considerations
- Driver-taxi approval must be a genuine admin gate — no client-side-only enforcement (`registeredServices.taxi.status` check must happen server-side on every driver-facing endpoint, mirroring how food delivery already gates on `status === 'approved'`).
- Trip-start OTP must not be guessable/brute-forceable — reuse whatever rate-limiting already protects the existing OTP endpoints (`config` has rate-limiting settings — confirm they cover this new usage, don't assume).
- SOS endpoint should be reachable and functional even under degraded network conditions — this may warrant SMS fallback rather than push-notification-only, given the safety stakes (worth a deliberate product decision, flagged here rather than decided unilaterally).
- Location data (live trip tracking) is sensitive — confirm existing RTDB security rules correctly scope access to only the trip's rider/driver/admin, not globally readable (this should already be true for Food's `active_orders` node; verify the same rule pattern extends correctly to new `taxiLocations` paths rather than assuming).

### Performance optimizations
- Reuse `GeoCache` TTL strategy unmodified — no new Google Maps cost surface introduced if travel-mode/zone parameters are just new call arguments to existing cached functions.
- Confirm Redis hot-cache/BullMQ deferred-write throughput assumptions hold at Taxi's expected concurrent-trip volume (flagged in Phase 7) before general availability, not after.

### Monitoring requirements
- Extend the existing BullMQ queue-stats admin endpoint (`/v1/admin/queues`) — Taxi's dispatch-retry jobs will show up here automatically if built on the same queue infra, no new monitoring surface needed for that piece.
- Add explicit monitoring for the SOS pipeline specifically (delivery confirmation, not just "job ran") — this is the one subsystem where silent failure is unacceptable.
- Track dispatch-success-rate and average-time-to-match as new Taxi-specific operational metrics — no existing equivalent dashboard to extend, this is net-new.

### Logging requirements
- Follow the existing `utils/logger.js` + `requestId` convention — no new logging framework.
- Given the custom logger has no structured/external aggregation today (flagged as a platform-wide gap in Phase 1.23), consider whether Taxi's safety-critical paths (SOS, cancellations, disputes) justify pushing for structured logging platform-wide rather than accepting the current console-based approach silently — worth raising to the team rather than deciding here.

### Backup strategy
- No Taxi-specific backup need beyond whatever backs up MongoDB today — new collections are automatically covered by existing database backup policy.

### Disaster recovery
- Trip continuity on socket-server restart is already handled by the `resync`/outbox mechanism — confirm this is tested specifically for the "driver mid-trip when server restarts" scenario before launch, since Taxi trips are typically shorter/more time-sensitive than food deliveries and a dropped trip is a worse user experience than a delayed food order.

### Scalability plan
- Socket.IO Redis adapter already supports horizontal scaling — no new architecture needed, just confirm it's actually enabled (`REDIS_ENABLED=true`) in the target production environment before Taxi launch, since it's currently optional/feature-flagged.

### Testing strategy
- Dispatch/matching logic needs concurrency testing specifically (race conditions in "first to accept wins"), not just functional unit tests — this is the highest-risk piece per Phase 9's roadmap risk callouts.
- Fare engine needs real-world road-test validation against actual GPS traces, not just unit tests with synthetic coordinates.
- SOS pipeline needs an end-to-end delivery-confirmation test as part of the release checklist, every release, not just at initial launch (safety-critical paths regress silently otherwise).

### Deployment checklist
- Confirm `taxi::*` permission keys are seeded for existing admin roles that should have access before the feature is exposed (otherwise admins get silently locked out of a module they should manage).
- Confirm the module-toggle (`enabledModules`) defaults to **disabled** for Taxi at deploy time, enabled deliberately per rollout plan (staged city-by-city or business-by-business rollout is standard for taxi products) rather than instantly live platform-wide.

### Rollback strategy
- Because Taxi's models/routes are additive and namespaced (`modules/taxi/`, `TaxiTrip`, `/v1/taxi/*`), rollback of the Taxi module specifically should be low-risk to other verticals — the module-toggle flag (`enabledModules`) doubles as an instant kill-switch without needing a code rollback, which is a strong reason to prioritize wiring that toggle correctly in Phase 0.
- Confirm no Taxi migration modifies a shared model (`Driver`, `FoodUser`, `Transaction`) in a way that isn't backward-compatible if Taxi needs to be disabled after some drivers have already registered — additive fields only, never repurpose existing shared fields for Taxi-specific meaning.

---

## Final Note

The single most important finding across both research passes: **this platform was already designed with Taxi in mind.** The `Driver` model's `authorizedServices`/`registeredServices` enums already include `'taxi'`, the `Transaction`/`Payment` models already have a `module` field for exactly this kind of segmentation, and the Porter module exists as a half-built structural precedent for a point-to-point booking vertical. The work ahead is not "bolt a taxi app onto a food app" — it's "finish what the data model already started," while building the genuinely new pieces (fare engine, dispatch tuning, surge pricing, SOS) as disciplined, reviewed, platform-grade additions rather than one-off Taxi-only hacks.
