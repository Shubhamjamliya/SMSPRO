import { BikeUnit } from '../models/bikeUnit.model.js';
import { BikeBooking } from '../models/bikeBooking.model.js';
import { ValidationError } from '../../../core/auth/errors.js';
import { BIKE_BOOKING_STATUS, TERMINAL_STATUSES } from '../state/bookingStateMachine.js';

/** Bike inventory availability values (ops display). */
export const BIKE_AVAILABILITY = Object.freeze({
    AVAILABLE: 'available',
    RESERVED: 'reserved',
    RENTED: 'rented',
    MAINTENANCE: 'maintenance',
    DISABLED: 'disabled',
});

const HOLDING_STATUSES = new Set([
    BIKE_BOOKING_STATUS.REQUESTED,
    BIKE_BOOKING_STATUS.PENDING_APPROVAL,
    BIKE_BOOKING_STATUS.PAYMENT_PENDING,
    BIKE_BOOKING_STATUS.RESERVED,
    BIKE_BOOKING_STATUS.PICKUP_COMPLETED,
    BIKE_BOOKING_STATUS.RENTAL_STARTED,
    BIKE_BOOKING_STATUS.ACTIVE,
    BIKE_BOOKING_STATUS.RETURN_REQUESTED,
    BIKE_BOOKING_STATUS.INSPECTION,
]);

const RENTED_STATUSES = new Set([
    BIKE_BOOKING_STATUS.PICKUP_COMPLETED,
    BIKE_BOOKING_STATUS.RENTAL_STARTED,
    BIKE_BOOKING_STATUS.ACTIVE,
    BIKE_BOOKING_STATUS.RETURN_REQUESTED,
    BIKE_BOOKING_STATUS.INSPECTION,
]);

const RESERVED_STATUSES = new Set([
    BIKE_BOOKING_STATUS.REQUESTED,
    BIKE_BOOKING_STATUS.PENDING_APPROVAL,
    BIKE_BOOKING_STATUS.PAYMENT_PENDING,
    BIKE_BOOKING_STATUS.RESERVED,
]);

/**
 * Map booking status → desired bike availability (ignores maintenance/disabled lock).
 */
export function availabilityForBookingStatus(status) {
    const s = String(status || '').toLowerCase();
    if (RENTED_STATUSES.has(s)) return BIKE_AVAILABILITY.RENTED;
    if (RESERVED_STATUSES.has(s)) return BIKE_AVAILABILITY.RESERVED;
    if (TERMINAL_STATUSES.includes(s) || s === BIKE_BOOKING_STATUS.COMPLETED) {
        return BIKE_AVAILABILITY.AVAILABLE;
    }
    return BIKE_AVAILABILITY.AVAILABLE;
}

/**
 * Bike can accept calendar bookings if active and not maintenance/disabled.
 * Reserved/rented no longer block future non-overlapping windows.
 */
export function isBikeBookable(bike) {
    if (!bike) return false;
    if (bike.isDeleted) return false;
    if (bike.isActive === false) return false;
    if (bike.maintenanceStatus === 'maintenance') return false;
    if ([BIKE_AVAILABILITY.MAINTENANCE, BIKE_AVAILABILITY.DISABLED].includes(bike.availabilityStatus)) {
        return false;
    }
    // Vendor-submitted bikes cannot be booked until admin approves them.
    if (bike.approvalStatus === 'pending' || bike.approvalStatus === 'rejected') {
        return false;
    }
    return true;
}

export function expandWindowWithBuffer(startAt, endAt, bufferMinutes = 0) {
    const bufferMs = Math.max(0, Number(bufferMinutes) || 0) * 60 * 1000;
    const start = new Date(startAt);
    const end = new Date(endAt);
    return {
        start: new Date(start.getTime() - bufferMs),
        end: new Date(end.getTime() + bufferMs),
        bufferMinutes: Math.max(0, Number(bufferMinutes) || 0),
    };
}

/**
 * Find overlapping holding booking (optionally with turnaround buffer).
 * Buffer expands the candidate window so adjacent bookings closer than buffer conflict.
 */
export async function findOverlappingBooking({
    bikeId,
    startAt,
    endAt,
    excludeBookingId = null,
    bufferMinutes = 0,
    session = null,
}) {
    const { start, end } = expandWindowWithBuffer(startAt, endAt, bufferMinutes);
    const filter = {
        bikeId,
        isDeleted: { $ne: true },
        status: { $in: [...HOLDING_STATUSES] },
        startAt: { $lt: end },
        endAt: { $gt: start },
    };
    if (excludeBookingId) filter._id = { $ne: excludeBookingId };

    const q = BikeBooking.findOne(filter)
        .select('_id status startAt endAt bookingNumber userId')
        .sort({ startAt: 1 })
        .lean();
    if (session) q.session(session);
    return q;
}

export async function hasOverlappingBooking(opts) {
    const hit = await findOverlappingBooking(opts);
    return Boolean(hit);
}

/**
 * Derive ops availabilityStatus from all holding bookings for a bike.
 * Never overwrites maintenance/disabled/inactive.
 */
export async function syncBikeAvailabilityFromBookings(bikeId, session = null) {
    if (!bikeId) return null;
    const bikeQ = BikeUnit.findById(bikeId);
    if (session) bikeQ.session(session);
    const bike = await bikeQ;
    if (!bike || bike.isDeleted) return null;

    if (
        bike.isActive === false
        || bike.maintenanceStatus === 'maintenance'
        || [BIKE_AVAILABILITY.MAINTENANCE, BIKE_AVAILABILITY.DISABLED].includes(bike.availabilityStatus)
    ) {
        return bike;
    }

    const holdingQ = BikeBooking.find({
        bikeId,
        isDeleted: { $ne: true },
        status: { $in: [...HOLDING_STATUSES] },
    }).select('status startAt endAt').lean();
    if (session) holdingQ.session(session);
    const holdings = await holdingQ;

    let desired = BIKE_AVAILABILITY.AVAILABLE;
    if (holdings.some((b) => RENTED_STATUSES.has(b.status))) {
        desired = BIKE_AVAILABILITY.RENTED;
    } else if (holdings.length) {
        desired = BIKE_AVAILABILITY.RESERVED;
    }

    if (bike.availabilityStatus !== desired) {
        bike.availabilityStatus = desired;
        bike.heldAt = desired === BIKE_AVAILABILITY.AVAILABLE ? null : new Date();
        await bike.save(session ? { session } : undefined);
    }
    return bike;
}

/**
 * Soft-hold for create path: verify bike is bookable, then sync derived status.
 * Race safety comes from buffered overlap checks in the transaction.
 */
export async function softHoldBike(bikeId, session = null) {
    const filter = {
        _id: bikeId,
        isDeleted: { $ne: true },
        isActive: true,
        maintenanceStatus: 'none',
        availabilityStatus: {
            $nin: [BIKE_AVAILABILITY.MAINTENANCE, BIKE_AVAILABILITY.DISABLED],
        },
    };
    const bike = await BikeUnit.findOne(filter).session(session || undefined);
    if (!bike) {
        throw new ValidationError(
            'Bike is not available for booking (maintenance or inactive)',
            'BIKE_NOT_AVAILABLE',
        );
    }
    await syncBikeAvailabilityFromBookings(bikeId, session);
    const refreshed = await BikeUnit.findById(bikeId).session(session || undefined);
    return refreshed || bike;
}

export async function setBikeAvailability(bikeId, availabilityStatus, session = null) {
    if (!bikeId) return;
    await BikeUnit.updateOne(
        {
            _id: bikeId,
            availabilityStatus: {
                $nin: [BIKE_AVAILABILITY.MAINTENANCE, BIKE_AVAILABILITY.DISABLED],
            },
            maintenanceStatus: { $ne: 'maintenance' },
            isActive: true,
        },
        {
            $set: {
                availabilityStatus,
                heldAt: availabilityStatus === BIKE_AVAILABILITY.AVAILABLE ? null : new Date(),
            },
        },
        session ? { session } : undefined,
    );
}

export async function releaseBike(bikeId, session = null) {
    await syncBikeAvailabilityFromBookings(bikeId, session);
}

export async function markBikeRented(bikeId, session = null) {
    await setBikeAvailability(bikeId, BIKE_AVAILABILITY.RENTED, session);
}

export async function markBikeReserved(bikeId, session = null) {
    await setBikeAvailability(bikeId, BIKE_AVAILABILITY.RESERVED, session);
}

export async function syncBikeInventoryWithBooking(booking, session = null) {
    if (!booking?.bikeId) return null;
    return syncBikeAvailabilityFromBookings(booking.bikeId, session);
}

export { HOLDING_STATUSES, RENTED_STATUSES, RESERVED_STATUSES };
