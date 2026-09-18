import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';
import { BikeUnit } from '../models/bikeUnit.model.js';
import { BikeRentZone } from '../models/bikeRentZone.model.js';
import { isBikeBookable } from './inventory.service.js';
import { BIKE_RENT_SETTINGS_DEFAULTS } from '../models/bikeRentSettings.model.js';
import { assertWindowAvailable } from './availability.service.js';
import { getSettings } from './settings.service.js';

const MAX_START_AHEAD_DAYS = 60;

function formatDurationHoursLabel(hours) {
    const value = Number(hours);
    if (!Number.isFinite(value)) return 'the configured limit';
    if (value === 1) return '1 hour';
    return `${value} hours`;
}

/**
 * Validate rental start/end window business rules.
 * @param {object} [opts]
 * @param {Date} [opts.now]
 * @param {boolean} [opts.allowPastStart]
 * @param {number} [opts.minDurationHours]
 * @param {number} [opts.maxDurationHours]
 * @param {boolean} [opts.skipDurationLimits] - for extension delta quotes
 */
export function validateRentalWindow(startAt, endAt, {
    now = new Date(),
    allowPastStart = false,
    minDurationHours = BIKE_RENT_SETTINGS_DEFAULTS.minBookingDurationHours,
    maxDurationHours = BIKE_RENT_SETTINGS_DEFAULTS.maxBookingDurationHours,
    skipDurationLimits = false,
} = {}) {
    const start = new Date(startAt);
    const end = new Date(endAt);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new ValidationError('Valid startAt and endAt are required');
    }
    if (end <= start) {
        throw new ValidationError('endAt must be after startAt');
    }

    const durationMs = end.getTime() - start.getTime();
    const durationHoursExact = durationMs / (60 * 60 * 1000);

    if (!skipDurationLimits) {
        const minH = Math.max(1, Number(minDurationHours) || 1);
        const maxH = Math.max(minH, Number(maxDurationHours) || minH);
        if (durationHoursExact + 1e-9 < minH) {
            throw new ValidationError(
                `Minimum booking duration is ${formatDurationHoursLabel(minH)}. Please select a longer duration.`,
            );
        }
        if (durationHoursExact > maxH + 1e-9) {
            throw new ValidationError(
                `Maximum booking duration is ${formatDurationHoursLabel(maxH)}. Please select a shorter duration.`,
            );
        }
    }

    // Allow slight clock skew (2 minutes)
    if (!allowPastStart && start.getTime() < now.getTime() - 2 * 60 * 1000) {
        throw new ValidationError('startAt cannot be in the past');
    }
    if (start.getTime() > now.getTime() + MAX_START_AHEAD_DAYS * 24 * 60 * 60 * 1000) {
        throw new ValidationError(`startAt cannot be more than ${MAX_START_AHEAD_DAYS} days ahead`);
    }

    return {
        start,
        end,
        durationHours: Math.ceil(durationHoursExact),
        durationHoursExact,
    };
}

export async function getBookingDurationLimits({ bikeId = null, vendorId = null } = {}) {
    const { getEffectiveSettings } = await import('./settings.service.js');
    const { settings } = await getEffectiveSettings({ bikeId, vendorId });
    const minDurationHours = Math.max(
        1,
        Number(settings.minBookingDurationHours)
            || BIKE_RENT_SETTINGS_DEFAULTS.minBookingDurationHours,
    );
    const maxDurationHours = Math.max(
        minDurationHours,
        Number(settings.maxBookingDurationHours)
            || BIKE_RENT_SETTINGS_DEFAULTS.maxBookingDurationHours,
    );
    return { minDurationHours, maxDurationHours };
}

export async function validateRentalWindowWithSettings(startAt, endAt, opts = {}) {
    const { bikeId = null, vendorId = null, ...rest } = opts;
    const limits = await getBookingDurationLimits({ bikeId, vendorId });
    return validateRentalWindow(startAt, endAt, {
        ...rest,
        minDurationHours: limits.minDurationHours,
        maxDurationHours: limits.maxDurationHours,
    });
}

export function validateExtensionWindow(currentEndAt, newEndAt, { now = new Date() } = {}) {
    const currentEnd = new Date(currentEndAt);
    const nextEnd = new Date(newEndAt);
    if (Number.isNaN(nextEnd.getTime())) {
        throw new ValidationError('Valid newEndAt is required');
    }
    if (nextEnd <= currentEnd) {
        throw new ValidationError('newEndAt must be after current endAt');
    }
    if (nextEnd.getTime() <= now.getTime()) {
        throw new ValidationError('Extension end time must be in the future');
    }
    const extraMs = nextEnd.getTime() - currentEnd.getTime();
    if (extraMs < 60 * 60 * 1000) {
        throw new ValidationError('Minimum extension is 1 hour');
    }
    if (extraMs > 14 * 24 * 60 * 60 * 1000) {
        throw new ValidationError('Maximum extension is 14 days');
    }
    return { currentEnd, nextEnd, extraHours: Math.ceil(extraMs / (60 * 60 * 1000)) };
}

/**
 * Load bike and enforce availability + optional zone match before reservation.
 */
export async function assertBikeReadyForBooking({
    bikeId,
    zoneId = null,
    startAt,
    endAt,
    excludeBookingId = null,
    session = null,
}) {
    if (!mongoose.Types.ObjectId.isValid(String(bikeId))) {
        throw new ValidationError('Valid bikeId is required');
    }

    await validateRentalWindowWithSettings(startAt, endAt, { bikeId });

    const bikeQ = BikeUnit.findOne({ _id: bikeId, isDeleted: { $ne: true } });
    if (session) bikeQ.session(session);
    const bike = await bikeQ;
    if (!bike) throw new ValidationError('Bike not found');

    if (!isBikeBookable(bike)) {
        throw new ValidationError('Bike is not available for booking', 'BIKE_NOT_AVAILABLE');
    }

    if (zoneId) {
        if (!mongoose.Types.ObjectId.isValid(String(zoneId))) {
            throw new ValidationError('Invalid zone id');
        }
        if (String(bike.zoneId) !== String(zoneId)) {
            throw new ValidationError('Bike is not available in the selected Bike Rent zone', 'ZONE_MISMATCH');
        }
        const zone = await BikeRentZone.findOne({
            _id: zoneId,
            isDeleted: { $ne: true },
            status: 'active',
        }).select('_id').lean();
        if (!zone) throw new ValidationError('Bike Rent zone is not active');
    } else {
        const zone = await BikeRentZone.findOne({
            _id: bike.zoneId,
            isDeleted: { $ne: true },
            status: 'active',
        }).select('_id').lean();
        if (!zone) throw new ValidationError('Bike Rent zone is not active');
    }

    const settings = await getSettings();
    await assertWindowAvailable({
        bikeId: bike._id,
        startAt,
        endAt,
        excludeBookingId,
        session,
        bufferMinutes: settings.turnaroundBufferMinutes,
        includeAlternates: true,
        throwOnConflict: true,
    });

    return bike;
}

export { MAX_START_AHEAD_DAYS };
