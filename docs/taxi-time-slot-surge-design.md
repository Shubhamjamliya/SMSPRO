# Taxi Time-Slot Surge — Design

## Understanding Summary

- Keep existing taxi fare engine (zone × vehicle × distance slabs).
- Add admin-managed **global**, **recurring weekly** time-slot surge as a **flat ₹ amount**.
- Surge locked at **quote / booking**; rider sees an explicit surge line item.
- Overlap: highest **priority** wins.
- Legacy slab `surgeMultiplier` remains in the engine but is hidden from admin UI.
- Non-goals: demand surge, date/holiday overrides, zone/vehicle-specific surge, slab math changes.

## Assumptions

- IST (`Asia/Kolkata`) for slot matching.
- Overnight windows allowed (e.g. 22:00–06:00).
- Fail-open: no match or load failure → ₹0 surge; quotes still work.
- Persist surge snapshot on ride so finalize does not re-resolve time.
- Permission: reuse `taxi::pricing` (same as fare management).
- Scale: dozens of slots max.

## Decision Log

| Decision | Choice | Alternatives | Why |
|----------|--------|--------------|-----|
| Scope | Additive surge | Full redesign | Keep working engine |
| Surge type | Flat ₹ | Multiplier / both | Ops simplicity |
| Granularity | Global | Zone / vehicle | YAGNI |
| Slots | Recurring weekly | Date-based | Ops default |
| Lock moment | Quote/book | Start / end | Rider trust |
| Legacy multiplier | Hide in admin, keep in engine | Remove / keep visible | Soft migration |
| Overlap | Priority wins | Forbid / max / sum | Flexible ops |
| Rider UX | Explicit line item | Hidden / soft | Transparency |
| Architecture | Separate `TaxiSurgeSlot` | Settings embed / per-slab | Extensible, clean |

## Final Design

### Architecture

- Collection: `taxi_surge_slots` (`TaxiSurgeSlot`).
- Fields: `name`, `daysOfWeek` (0=Sun…6=Sat), `startTime`, `endTime` (`HH:mm`), `amount`, `priority`, `isActive`, soft-delete fields.
- Quote/create: after `computeFare`, resolve active slot → add flat amount → store on ride.
- Finalize (`reachDrop`): reuse stored surge; do not re-resolve by clock.

### Data flow

1. Admin CRUD surge slots.
2. Rider quote → fare + `timeSlotSurge` + slot meta in breakdown.
3. Create ride → persist `fare.timeSlotSurge`, `fare.surgeSlotId`, `fare.surgeSlotName` (or equivalent).
4. Payment uses locked total.

### Error handling / edge cases

- No matching slot → ₹0.
- Overlap → highest priority; tie-break by higher `amount`, then newest `updatedAt`.
- Overnight: match if time ≥ start OR time < end when start > end.
- Inactive / deleted ignored.
- Surge config errors → log + ₹0 (fail-open).

### Testing strategy

- Slot matcher: weekday, overnight, overlap priority, inactive.
- Fare: base total + flat surge; legacy multiplier still applied before flat add.
- Quote/create persistence; finalize does not change surge with clock.

## Risks

- Admin misconfigured overlapping priorities → wrong amount (mitigate: clear priority UI + list preview).
- Timezone drift if server not IST-aware (mitigate: explicit Asia/Kolkata in resolver).

## Implementation status (done)

- `TaxiSurgeSlot` model + admin CRUD at `/v1/taxi/admin/surge-slots`
- Resolver + `applyTimeSlotSurge` / `applyLockedTimeSlotSurge`
- Quote + create ride apply live surge; `reachDrop` keeps locked surge
- Admin UI: `/admin/taxi/surge`
- Pricing admin: slab `surgeMultiplier` field hidden
- Rider/admin fare breakdowns show time-slot surge line
