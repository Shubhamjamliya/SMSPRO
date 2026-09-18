# Bike Rent Module

Production Bike Rent module for Just Order (admin-owned inventory in v1, vendor-ready schema).

## Phases

| Phase | Scope | Status |
|-------|--------|--------|
| 1 | Backend foundation + independent zones | Done |
| 2 | Admin module | Done |
| 3 | User catalog + checkout UI | Done |
| 4 | Booking engine (payments, deposit, lifecycle) | Done |
| 5 | Stabilization / optimization (no new features) | Done |

## Booking lifecycle

```
available (inventory)
  → requested (history)
  → payment_pending   (soft-hold bike)
  → reserved          (payment verified + deposit hold)
  → pickup_completed
  → active
  → return_requested
  → inspection
  → completed
  → deposit_refunded

Terminal: cancelled | expired | no_show
```

## Concurrency

- Atomic `findOneAndUpdate` soft-hold only when `availabilityStatus === available`
- Overlapping booking guard on the same bike + time window
- Status transitions use optimistic status guards (`STALE_STATUS` on race)

## Payments

- Razorpay + Wallet (shared Food helpers)
- Server-side quote only — client totals are never trusted
- Idempotent verify by `payment.paymentId` + status
- Wallet debit uses attempt-scoped `orderId`; compensating refund on failure

## Deposit

Ledger types: `hold` | `capture` | `refund` | `adjust`  
Unique on `(bookingId, type, reference)` — refunds cannot double-apply.

## Notifications

Hooks in `bookingNotifications.service.js` (register via `onBikeRentNotification`).  
Delivery (FCM/inbox) can be wired later without changing booking logic.

## Maintenance job

`runBookingMaintenanceSweep` every 60s in `server.js`:

- Expire unpaid bookings → release bike → audit
- Mark no-shows past pickup window
- Emit pickup / return reminder hooks

## Key APIs

Base: `/api/v1/bike-rent`

**Public:** zones detect/public, bikes, categories, quote, settings  
**User:** bookings CRUD lifecycle, pay razorpay/wallet, cancel, pickup, return, extend, review  
**Admin:** zones, categories, bikes, pricing, bookings (+ inspect settle), customers, dashboard, reports, settings

## Tests

```bash
cd Backend
npm run test:bike-rent
```

## Collections

- `bike_rent_zones`, `bike_categories`, `bike_units`, `bike_pricing_rules`
- `bike_bookings`, `bike_deposit_ledger`, `bike_reviews`
- `bike_rent_settings`, `bike_rent_audit_logs`
