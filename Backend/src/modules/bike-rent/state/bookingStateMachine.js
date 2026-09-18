import { ValidationError } from '../../../core/auth/errors.js';

export const BIKE_BOOKING_STATUS = Object.freeze({
    REQUESTED: 'requested',
    PENDING_APPROVAL: 'pending_approval',
    PAYMENT_PENDING: 'payment_pending',
    RESERVED: 'reserved',
    PICKUP_COMPLETED: 'pickup_completed',
    RENTAL_STARTED: 'rental_started',
    ACTIVE: 'active',
    RETURN_REQUESTED: 'return_requested',
    INSPECTION: 'inspection',
    COMPLETED: 'completed',
    REFUND_PROCESSING: 'refund_processing',
    DEPOSIT_REFUNDED: 'deposit_refunded',
    CANCELLED: 'cancelled',
    REJECTED: 'rejected',
    EXPIRED: 'expired',
    NO_SHOW: 'no_show',
});

export const TERMINAL_STATUSES = Object.freeze([
    BIKE_BOOKING_STATUS.DEPOSIT_REFUNDED,
    BIKE_BOOKING_STATUS.CANCELLED,
    BIKE_BOOKING_STATUS.REJECTED,
    BIKE_BOOKING_STATUS.EXPIRED,
    BIKE_BOOKING_STATUS.NO_SHOW,
]);

/** Explicit allow-list — invalid transitions are rejected. */
export const ALLOWED_TRANSITIONS = Object.freeze({
    [BIKE_BOOKING_STATUS.REQUESTED]: [
        BIKE_BOOKING_STATUS.PENDING_APPROVAL,
        BIKE_BOOKING_STATUS.PAYMENT_PENDING,
        BIKE_BOOKING_STATUS.CANCELLED,
        BIKE_BOOKING_STATUS.REJECTED,
        BIKE_BOOKING_STATUS.EXPIRED,
    ],
    [BIKE_BOOKING_STATUS.PENDING_APPROVAL]: [
        BIKE_BOOKING_STATUS.PAYMENT_PENDING,
        BIKE_BOOKING_STATUS.CANCELLED,
        BIKE_BOOKING_STATUS.REJECTED,
        BIKE_BOOKING_STATUS.EXPIRED,
    ],
    [BIKE_BOOKING_STATUS.PAYMENT_PENDING]: [
        BIKE_BOOKING_STATUS.RESERVED,
        BIKE_BOOKING_STATUS.CANCELLED,
        BIKE_BOOKING_STATUS.EXPIRED,
    ],
    [BIKE_BOOKING_STATUS.RESERVED]: [
        BIKE_BOOKING_STATUS.PICKUP_COMPLETED,
        BIKE_BOOKING_STATUS.CANCELLED,
        BIKE_BOOKING_STATUS.NO_SHOW,
        BIKE_BOOKING_STATUS.EXPIRED,
    ],
    [BIKE_BOOKING_STATUS.PICKUP_COMPLETED]: [
        BIKE_BOOKING_STATUS.RENTAL_STARTED,
        BIKE_BOOKING_STATUS.ACTIVE,
        BIKE_BOOKING_STATUS.RETURN_REQUESTED,
    ],
    [BIKE_BOOKING_STATUS.RENTAL_STARTED]: [
        BIKE_BOOKING_STATUS.ACTIVE,
        BIKE_BOOKING_STATUS.RETURN_REQUESTED,
    ],
    [BIKE_BOOKING_STATUS.ACTIVE]: [
        BIKE_BOOKING_STATUS.RETURN_REQUESTED,
        BIKE_BOOKING_STATUS.ACTIVE,
    ],
    [BIKE_BOOKING_STATUS.RETURN_REQUESTED]: [
        BIKE_BOOKING_STATUS.INSPECTION,
    ],
    [BIKE_BOOKING_STATUS.INSPECTION]: [
        BIKE_BOOKING_STATUS.COMPLETED,
        BIKE_BOOKING_STATUS.REFUND_PROCESSING,
    ],
    [BIKE_BOOKING_STATUS.COMPLETED]: [
        BIKE_BOOKING_STATUS.REFUND_PROCESSING,
        BIKE_BOOKING_STATUS.DEPOSIT_REFUNDED,
    ],
    [BIKE_BOOKING_STATUS.REFUND_PROCESSING]: [
        BIKE_BOOKING_STATUS.DEPOSIT_REFUNDED,
    ],
    [BIKE_BOOKING_STATUS.DEPOSIT_REFUNDED]: [],
    [BIKE_BOOKING_STATUS.CANCELLED]: [],
    [BIKE_BOOKING_STATUS.REJECTED]: [],
    [BIKE_BOOKING_STATUS.EXPIRED]: [],
    // Admin/vendor "Override No-Show" restores the booking to awaiting-pickup — the only way
    // back out of this otherwise-terminal state.
    [BIKE_BOOKING_STATUS.NO_SHOW]: [
        BIKE_BOOKING_STATUS.RESERVED,
    ],
});

const norm = (s) => String(s || '').trim().toLowerCase();

export const isTerminalStatus = (status) => TERMINAL_STATUSES.includes(norm(status));

export function canTransition(from, to, { allowIdempotent = true } = {}) {
    const f = norm(from);
    const t = norm(to);
    if (!t) return false;
    if (f === t) return allowIdempotent;
    const allowed = ALLOWED_TRANSITIONS[f] || [];
    return allowed.includes(t);
}

export function assertTransition(from, to, opts = {}) {
    const f = norm(from);
    const t = norm(to);
    if (!canTransition(f, t, opts)) {
        throw new ValidationError(
            `Invalid booking status transition: '${f || '(none)'}' → '${t || '(none)'}'`,
            'INVALID_STATUS_TRANSITION',
        );
    }
    return { noop: f === t, from: f, to: t };
}

/** Atomic update guard: only apply when booking is still at expected status. */
export function buildTransitionGuard(from) {
    return { status: norm(from) };
}
