import { ValidationError } from '../../../core/auth/errors.js';

/** Allowed status transitions for TaxiRide. */
export const RIDE_TRANSITIONS = {
    requested: ['searching', 'cancelled_by_rider', 'cancelled_by_system'],
    searching: ['assigned', 'arriving', 'cancelled_by_rider', 'cancelled_by_system', 'no_show'],
    assigned: ['arriving', 'cancelled_by_rider', 'cancelled_by_driver', 'cancelled_by_system', 'no_show'],
    arriving: ['arrived', 'cancelled_by_rider', 'cancelled_by_driver', 'cancelled_by_system', 'no_show'],
    arrived: ['in_progress', 'cancelled_by_rider', 'cancelled_by_driver', 'cancelled_by_system', 'no_show'],
    in_progress: ['awaiting_payment', 'cancelled_by_system'],
    awaiting_payment: ['completed', 'cancelled_by_system'],
    completed: [],
    cancelled_by_rider: [],
    cancelled_by_driver: [],
    cancelled_by_system: [],
    no_show: [],
};

export function canTransition(from, to) {
    const allowed = RIDE_TRANSITIONS[from];
    if (!allowed) return false;
    return allowed.includes(to);
}

export function assertTransition(from, to) {
    if (from === to) return;
    if (!canTransition(from, to)) {
        throw new ValidationError(`Invalid ride status transition: ${from} → ${to}`);
    }
}
