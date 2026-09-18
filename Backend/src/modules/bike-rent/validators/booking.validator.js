import { z } from 'zod';
import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';
import { BIKE_BOOKING_STATUSES } from '../models/bikeBooking.model.js';

export const validateBookingId = (id) => {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid booking id');
    }
    return String(id);
};

export const validateBookingStatusDto = (body = {}) => {
    const status = String(body.status || '').trim();
    if (!BIKE_BOOKING_STATUSES.includes(status)) {
        throw new ValidationError('Invalid booking status');
    }
    const note = String(body.note || body.reason || '').trim().slice(0, 500);
    if (status === 'cancelled' && !note) {
        throw new ValidationError('Cancellation reason is required');
    }
    return {
        status,
        note,
    };
};

export const validateInspectDto = (body = {}) => {
    const schema = z.object({
        inspectionNotes: z.string().max(2000).optional(),
        damageFee: z.coerce.number().min(0).optional(),
        lateFee: z.coerce.number().min(0).optional(),
        depositCapture: z.coerce.number().min(0).optional(),
        markCompleted: z.boolean().optional(),
    });
    const result = schema.safeParse(body);
    if (!result.success) throw new ValidationError(result.error.errors[0].message);
    return {
        inspectionNotes: result.data.inspectionNotes?.trim() || '',
        damageFee: result.data.damageFee ?? 0,
        lateFee: result.data.lateFee ?? 0,
        depositCapture: result.data.depositCapture ?? 0,
        markCompleted: result.data.markCompleted !== false,
    };
};
