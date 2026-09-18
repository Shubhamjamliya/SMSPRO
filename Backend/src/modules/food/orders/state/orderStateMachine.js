/**
 * Order state machine — the single, explicit definition of which order-status
 * transitions are allowed. MongoDB remains the source of truth; this module only
 * decides validity.
 *
 * Why this exists
 * ---------------
 * Delivery-side transitions already guard forward progression via
 * `isStatusAdvance` (order.helpers.js), but the restaurant status endpoint
 * (`updateOrderStatusRestaurant`) previously set `orderStatus` with no check, so a
 * backwards or post-terminal transition was possible. This centralises the rules and
 * lets every state-changing path share one guard.
 *
 * Design notes
 * ------------
 * - The vocabulary is the existing `orderStatus` enum (order.model.js) — NOT renamed,
 *   to avoid a data migration. The target names map onto these:
 *     confirmed ≈ RESTAURANT_ACCEPTED, ready_for_pickup ≈ READY, picked_up ≈ PICKED_UP.
 *   Driver assignment lives on `dispatch.status`, not `orderStatus`.
 * - A transition is allowed when: it is the same status (idempotent re-send), OR it is
 *   an explicitly listed forward transition, OR it is a cancellation from a non-terminal
 *   state. Terminal states (delivered / cancelled_*) allow nothing further.
 * - `buildTransitionGuard(from)` returns a Mongo filter fragment so callers can perform
 *   an atomic, conditional update (`... WHERE orderStatus = <from>`) and reject
 *   concurrent/duplicate transitions (0 rows matched).
 */

import { ValidationError } from '../../../../core/auth/errors.js';

export const ORDER_STATUS = Object.freeze({
  PLACED: 'placed',
  CREATED: 'created',
  SCHEDULED: 'scheduled',
  CONFIRMED: 'confirmed',
  PREPARING: 'preparing',
  READY: 'ready_for_pickup',
  PICKED_UP: 'picked_up',
  DELIVERED: 'delivered',
  CANCELLED_BY_USER: 'cancelled_by_user',
  CANCELLED_BY_RESTAURANT: 'cancelled_by_restaurant',
  CANCELLED_BY_ADMIN: 'cancelled_by_admin',
});

export const CANCELLED_STATUSES = Object.freeze([
  ORDER_STATUS.CANCELLED_BY_USER,
  ORDER_STATUS.CANCELLED_BY_RESTAURANT,
  ORDER_STATUS.CANCELLED_BY_ADMIN,
]);

export const TERMINAL_STATUSES = Object.freeze([
  ORDER_STATUS.DELIVERED,
  ...CANCELLED_STATUSES,
]);

const TERMINAL_SET = new Set(TERMINAL_STATUSES);
const CANCELLED_SET = new Set(CANCELLED_STATUSES);

/**
 * Canonical happy-path flow (documentation + basis for a future strict mode). The guard
 * below intentionally allows any FORWARD move by rank — not only these adjacent steps — so
 * it never rejects a transition the pre-existing code already performed (e.g. a restaurant
 * jumping straight to `ready_for_pickup`). It only adds rejection of *backwards* and
 * *post-terminal* moves, which is the actual bug class.
 */
export const CANONICAL_TRANSITIONS = Object.freeze({
  [ORDER_STATUS.CREATED]: [ORDER_STATUS.CONFIRMED],
  [ORDER_STATUS.PLACED]: [ORDER_STATUS.CONFIRMED],
  [ORDER_STATUS.SCHEDULED]: [ORDER_STATUS.CONFIRMED],
  [ORDER_STATUS.CONFIRMED]: [ORDER_STATUS.PREPARING],
  [ORDER_STATUS.PREPARING]: [ORDER_STATUS.READY],
  [ORDER_STATUS.READY]: [ORDER_STATUS.PICKED_UP],
  [ORDER_STATUS.PICKED_UP]: [ORDER_STATUS.DELIVERED],
  [ORDER_STATUS.DELIVERED]: [],
});

/**
 * Forward rank per status — mirrors STATUS_PRIORITY in order.helpers.js so this guard is a
 * safe superset of the existing `isStatusAdvance` behaviour. Entry states share the lowest
 * rank; cancellations are terminal and handled separately (not ranked here).
 */
const STATUS_RANK = Object.freeze({
  [ORDER_STATUS.PLACED]: 0,
  [ORDER_STATUS.SCHEDULED]: 0,
  [ORDER_STATUS.CREATED]: 10,
  [ORDER_STATUS.CONFIRMED]: 20,
  [ORDER_STATUS.PREPARING]: 30,
  [ORDER_STATUS.READY]: 40,
  [ORDER_STATUS.PICKED_UP]: 60,
  [ORDER_STATUS.DELIVERED]: 80,
});

const norm = (s) => String(s || '').trim().toLowerCase();

export const isTerminalStatus = (status) => TERMINAL_SET.has(norm(status));
export const isCancellation = (status) => CANCELLED_SET.has(norm(status));

/**
 * Whether `to` is a legal next status from `from`.
 *  - same status            -> allowed (idempotent re-send) unless opted out
 *  - from is terminal        -> nothing follows
 *  - to is a cancellation    -> allowed from any non-terminal state
 *  - to ranks strictly higher -> allowed (any forward move; matches legacy behaviour)
 *  - otherwise (backwards)   -> rejected
 * @param {string} from current status
 * @param {string} to   requested status
 * @param {{ allowIdempotent?: boolean }} [opts] allow same-status re-send (default true)
 */
export function canTransition(from, to, opts = {}) {
  const allowIdempotent = opts.allowIdempotent !== false;
  const f = norm(from);
  const t = norm(to);

  if (!t) return false;
  if (f === t) return allowIdempotent;
  if (TERMINAL_SET.has(f)) return false;
  if (CANCELLED_SET.has(t)) return true;

  const fromRank = STATUS_RANK[f];
  const toRank = STATUS_RANK[t];
  if (fromRank === undefined || toRank === undefined) return false; // unknown status
  return toRank > fromRank; // forward-only
}

/**
 * Throw a ValidationError if the transition is not allowed. Returns metadata so the
 * caller can treat an idempotent re-send as a no-op.
 * @returns {{ noop: boolean, from: string, to: string }}
 */
export function assertTransition(from, to, opts = {}) {
  const f = norm(from);
  const t = norm(to);
  if (!canTransition(f, t, opts)) {
    throw new ValidationError(
      `Invalid order status transition: '${f || '(none)'}' → '${t || '(none)'}'.`,
      'INVALID_STATUS_TRANSITION',
    );
  }
  return { noop: f === t, from: f, to: t };
}

/**
 * Filter fragment for an atomic conditional update that only applies when the order is
 * still at the expected previous status — so two concurrent transitions can't both win.
 * Usage: `FoodOrder.updateOne({ _id, ...buildTransitionGuard(from) }, { $set: { orderStatus: to } })`
 */
export function buildTransitionGuard(from) {
  return { orderStatus: norm(from) };
}
