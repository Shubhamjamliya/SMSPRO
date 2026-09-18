import mongoose from 'mongoose';
import { BikeUnit } from '../models/bikeUnit.model.js';
import { BikeBooking } from '../models/bikeBooking.model.js';
import { ValidationError } from '../../../core/auth/errors.js';
import { mapBike } from '../utils/mappers.util.js';
import { getSettings } from './settings.service.js';
import {
    HOLDING_STATUSES,
    findOverlappingBooking,
    hasOverlappingBooking,
    isBikeBookable,
    expandWindowWithBuffer,
} from './inventory.service.js';

async function getBufferMinutes() {
    const settings = await getSettings();
    return Math.max(0, Number(settings.turnaroundBufferMinutes) || 0);
}

function toIso(d) {
    return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

export async function getBikeBusyIntervals(bikeId, {
    from,
    to,
    bufferMinutes = null,
    excludeBookingId = null,
} = {}) {
    if (!mongoose.Types.ObjectId.isValid(String(bikeId))) {
        throw new ValidationError('Invalid bike id');
    }
    const buffer = bufferMinutes == null ? await getBufferMinutes() : Math.max(0, Number(bufferMinutes) || 0);
    const rangeStart = from ? new Date(from) : new Date();
    const rangeEnd = to
        ? new Date(to)
        : new Date(rangeStart.getTime() + 14 * 24 * 60 * 60 * 1000);

    const filter = {
        bikeId,
        isDeleted: { $ne: true },
        status: { $in: [...HOLDING_STATUSES] },
        startAt: { $lt: rangeEnd },
        endAt: { $gt: rangeStart },
    };
    if (excludeBookingId) filter._id = { $ne: excludeBookingId };

    const bookings = await BikeBooking.find(filter)
        .select('_id bookingNumber status startAt endAt')
        .sort({ startAt: 1 })
        .lean();

    const busy = bookings.map((b) => {
        const start = new Date(b.startAt);
        const end = new Date(b.endAt);
        const padded = expandWindowWithBuffer(start, end, buffer);
        return {
            bookingId: String(b._id),
            bookingNumber: b.bookingNumber || '',
            status: b.status,
            startAt: toIso(start),
            endAt: toIso(end),
            bufferStartAt: toIso(padded.start),
            bufferEndAt: toIso(padded.end),
            bufferMinutes: buffer,
        };
    });

    return {
        bikeId: String(bikeId),
        from: toIso(rangeStart),
        to: toIso(rangeEnd),
        bufferMinutes: buffer,
        busy,
    };
}

export function computeFreeSlots(busy, from, to, durationMs) {
    const rangeStart = new Date(from).getTime();
    const rangeEnd = new Date(to).getTime();
    const blocks = (busy || [])
        .map((b) => ({
            start: new Date(b.bufferStartAt || b.startAt).getTime(),
            end: new Date(b.bufferEndAt || b.endAt).getTime(),
        }))
        .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start)
        .sort((a, b) => a.start - b.start);

    const merged = [];
    for (const block of blocks) {
        if (!merged.length || block.start > merged[merged.length - 1].end) {
            merged.push({ ...block });
        } else {
            merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, block.end);
        }
    }

    const free = [];
    let cursor = rangeStart;
    for (const block of merged) {
        if (block.start > cursor) {
            free.push({ startAt: new Date(cursor).toISOString(), endAt: new Date(block.start).toISOString() });
        }
        cursor = Math.max(cursor, block.end);
    }
    if (cursor < rangeEnd) {
        free.push({ startAt: new Date(cursor).toISOString(), endAt: new Date(rangeEnd).toISOString() });
    }

    const need = Math.max(0, Number(durationMs) || 0);
    if (!need) return free;
    return free.filter((slot) => new Date(slot.endAt) - new Date(slot.startAt) >= need);
}

export async function findNextAvailableSlot(bikeId, {
    durationMs,
    from = new Date(),
    searchDays = 14,
    excludeBookingId = null,
    bufferMinutes = null,
} = {}) {
    const start = new Date(from);
    const end = new Date(start.getTime() + Math.max(1, searchDays) * 24 * 60 * 60 * 1000);
    const { busy, bufferMinutes: buffer } = await getBikeBusyIntervals(bikeId, {
        from: start,
        to: end,
        excludeBookingId,
        bufferMinutes,
    });
    const free = computeFreeSlots(busy, start, end, durationMs);
    const first = free[0];
    if (!first) return null;
    const slotStart = new Date(first.startAt);
    const slotEnd = new Date(slotStart.getTime() + durationMs);
    if (slotEnd > new Date(first.endAt)) return null;
    return {
        startAt: slotStart.toISOString(),
        endAt: slotEnd.toISOString(),
        bufferMinutes: buffer,
    };
}

async function findAlternateBikes({
    bike,
    startAt,
    endAt,
    bufferMinutes,
    limit = 6,
}) {
    if (!bike?.zoneId || !bike?.categoryId) return [];
    const candidates = await BikeUnit.find({
        _id: { $ne: bike._id },
        zoneId: bike.zoneId,
        categoryId: bike.categoryId,
        isDeleted: { $ne: true },
        isActive: true,
        maintenanceStatus: 'none',
        availabilityStatus: { $nin: ['maintenance', 'disabled'] },
    })
        .limit(40)
        .lean();

    const available = [];
    for (const candidate of candidates) {
        if (!isBikeBookable(candidate)) continue;
        const overlap = await hasOverlappingBooking({
            bikeId: candidate._id,
            startAt,
            endAt,
            bufferMinutes,
        });
        if (!overlap) {
            available.push(mapBike(candidate));
            if (available.length >= limit) break;
        }
    }
    return available;
}

export async function assertWindowAvailable({
    bikeId,
    startAt,
    endAt,
    excludeBookingId = null,
    session = null,
    bufferMinutes = null,
    includeAlternates = true,
    throwOnConflict = true,
}) {
    if (!mongoose.Types.ObjectId.isValid(String(bikeId))) {
        throw new ValidationError('Valid bikeId is required');
    }

    const buffer = bufferMinutes == null ? await getBufferMinutes() : Math.max(0, Number(bufferMinutes) || 0);
    const bikeQ = BikeUnit.findOne({ _id: bikeId, isDeleted: { $ne: true } });
    if (session) bikeQ.session(session);
    const bike = await bikeQ.lean();
    if (!bike) {
        throw new ValidationError('Bike not found', 'BIKE_NOT_FOUND');
    }
    if (!isBikeBookable(bike)) {
        const payload = {
            available: false,
            code: 'BIKE_MAINTENANCE',
            message: 'This bike is under maintenance or disabled and cannot be booked.',
            conflict: null,
            nextSlot: null,
            alternateBikes: includeAlternates
                ? await findAlternateBikes({ bike, startAt, endAt, bufferMinutes: buffer })
                : [],
            bufferMinutes: buffer,
        };
        if (throwOnConflict) {
            throw new ValidationError(payload.message, payload.code, payload);
        }
        return payload;
    }

    const conflictDoc = await findOverlappingBooking({
        bikeId: bike._id,
        startAt,
        endAt,
        excludeBookingId,
        bufferMinutes: buffer,
        session,
    });

    if (!conflictDoc) {
        return {
            available: true,
            code: null,
            message: null,
            conflict: null,
            nextSlot: null,
            alternateBikes: [],
            bufferMinutes: buffer,
            bike,
        };
    }

    const start = new Date(startAt);
    const end = new Date(endAt);
    const durationMs = Math.max(0, end.getTime() - start.getTime());
    const nextSlot = await findNextAvailableSlot(bike._id, {
        durationMs: durationMs || 60 * 60 * 1000,
        from: new Date(Math.max(Date.now(), start.getTime())),
        excludeBookingId,
        bufferMinutes: buffer,
    });

    const hardOverlap = new Date(conflictDoc.startAt) < end && new Date(conflictDoc.endAt) > start;
    const code = hardOverlap ? 'BOOKING_OVERLAP' : 'BUFFER_CONFLICT';
    const message = hardOverlap
        ? 'This bike already has a booking overlapping the selected time window.'
        : `This slot conflicts with the ${buffer}-minute turnaround buffer after/before another booking.`;

    const payload = {
        available: false,
        code,
        message,
        conflict: {
            bookingId: String(conflictDoc._id),
            bookingNumber: conflictDoc.bookingNumber || '',
            status: conflictDoc.status,
            startAt: toIso(conflictDoc.startAt),
            endAt: toIso(conflictDoc.endAt),
        },
        nextSlot,
        alternateBikes: includeAlternates
            ? await findAlternateBikes({ bike, startAt, endAt, bufferMinutes: buffer })
            : [],
        bufferMinutes: buffer,
        bike,
    };

    if (throwOnConflict) {
        throw new ValidationError(payload.message, payload.code, payload);
    }
    return payload;
}

export async function checkAvailability(body = {}) {
    const bikeId = body.bikeId;
    const startAt = body.startAt;
    const endAt = body.endAt;
    if (!bikeId || !startAt || !endAt) {
        throw new ValidationError('bikeId, startAt, and endAt are required');
    }

    const { validateRentalWindowWithSettings } = await import('./bookingValidation.service.js');
    try {
        await validateRentalWindowWithSettings(startAt, endAt, { bikeId });
    } catch (err) {
        return {
            available: false,
            code: err.code || 'INVALID_WINDOW',
            message: err.message,
            conflict: null,
            nextSlot: null,
            alternateBikes: [],
            bufferMinutes: await getBufferMinutes(),
        };
    }

    return assertWindowAvailable({
        bikeId,
        startAt,
        endAt,
        excludeBookingId: body.excludeBookingId || null,
        throwOnConflict: false,
        includeAlternates: body.includeAlternates !== false,
    });
}

export async function getBikeAvailabilityCalendar(bikeId, query = {}) {
    const from = query.from || new Date().toISOString();
    const to = query.to
        || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const durationHours = Math.max(1, Number(query.durationHours) || 1);
    const data = await getBikeBusyIntervals(bikeId, { from, to });
    const free = computeFreeSlots(
        data.busy,
        data.from,
        data.to,
        durationHours * 60 * 60 * 1000,
    );
    const nextSlot = await findNextAvailableSlot(bikeId, {
        durationMs: durationHours * 60 * 60 * 1000,
        from: new Date(from),
        bufferMinutes: data.bufferMinutes,
    });
    return {
        ...data,
        freeSlots: free,
        nextSlot,
    };
}
