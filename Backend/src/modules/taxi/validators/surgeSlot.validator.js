import { z } from 'zod';
import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:mm');

const surgeBodySchema = z.object({
    name: z.string().min(1, 'Name is required').max(80),
    daysOfWeek: z.array(z.coerce.number().int().min(0).max(6)).min(1, 'Select at least one day'),
    startTime: hhmm,
    endTime: hhmm,
    amount: z.coerce.number().min(0, 'Amount must be ≥ 0'),
    priority: z.coerce.number().int().optional(),
    isActive: z.boolean().optional(),
});

const uniqDays = (days = []) => [...new Set(days.map(Number))].sort((a, b) => a - b);

export const validateCreateSurgeSlotDto = (body = {}) => {
    const result = surgeBodySchema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }
    return {
        name: result.data.name.trim(),
        daysOfWeek: uniqDays(result.data.daysOfWeek),
        startTime: result.data.startTime,
        endTime: result.data.endTime,
        amount: Number(result.data.amount),
        priority: result.data.priority ?? 0,
        isActive: result.data.isActive !== false,
    };
};

export const validateUpdateSurgeSlotDto = (body = {}) => {
    const result = surgeBodySchema.partial().safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }
    const data = { ...result.data };
    if (data.name !== undefined) data.name = data.name.trim();
    if (Array.isArray(data.daysOfWeek)) {
        data.daysOfWeek = uniqDays(data.daysOfWeek);
        if (!data.daysOfWeek.length) {
            throw new ValidationError('Select at least one day');
        }
    }
    if (data.amount !== undefined) data.amount = Number(data.amount);
    if (data.priority !== undefined) data.priority = Number(data.priority);
    return data;
};

export const validateSurgeSlotId = (id) => {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid surge slot id');
    }
    return String(id);
};

export const validateSurgeSlotStatusDto = (body = {}) => {
    if (typeof body.isActive === 'boolean') {
        return { isActive: body.isActive };
    }
    const status = String(body.status || '').trim().toLowerCase();
    if (status === 'active') return { isActive: true };
    if (status === 'inactive') return { isActive: false };
    throw new ValidationError('Invalid surge slot status');
};
