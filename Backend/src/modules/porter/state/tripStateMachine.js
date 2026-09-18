import { ValidationError } from '../../../core/auth/errors.js';

/** Allowed status transitions for PorterTrip. */
export const TRIP_TRANSITIONS = {
    quoted: ['searching', 'cancelled_by_user', 'cancelled_by_system'],
    searching: ['assigned', 'en_route_pickup', 'cancelled_by_user', 'cancelled_by_system'],
    assigned: ['en_route_pickup', 'cancelled_by_user', 'cancelled_by_driver', 'cancelled_by_system'],
    en_route_pickup: ['at_pickup', 'cancelled_by_user', 'cancelled_by_driver', 'cancelled_by_system'],
    at_pickup: ['loading', 'cancelled_by_user', 'cancelled_by_driver', 'cancelled_by_system'],
    loading: ['in_transit', 'cancelled_by_user', 'cancelled_by_driver', 'cancelled_by_system'],
    in_transit: ['at_drop', 'awaiting_payment', 'completed', 'cancelled_by_system'],
    at_drop: ['awaiting_payment', 'completed', 'cancelled_by_system'],
    awaiting_payment: ['completed', 'cancelled_by_system'],
    completed: [],
    cancelled_by_user: [],
    cancelled_by_driver: [],
    cancelled_by_system: [],
};

export function canTransition(from, to) {
    const allowed = TRIP_TRANSITIONS[from];
    if (!allowed) return false;
    return allowed.includes(to);
}

export function assertTransition(from, to) {
    if (from === to) return;
    if (!canTransition(from, to)) {
        throw new ValidationError(`Invalid trip status transition: ${from} → ${to}`);
    }
}
