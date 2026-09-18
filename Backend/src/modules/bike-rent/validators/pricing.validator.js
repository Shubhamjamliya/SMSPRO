import { z } from 'zod';
import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';

const objectId = z.string().refine((v) => mongoose.Types.ObjectId.isValid(String(v)), 'Invalid id');

const pricingBodySchema = z.object({
    name: z.string().min(1, 'Rule name is required').max(160),
    scope: z.enum(['global', 'category', 'zone', 'bike']),
    categoryId: objectId.optional().nullable(),
    zoneId: objectId.optional().nullable(),
    bikeId: objectId.optional().nullable(),
    hourlyPrice: z.coerce.number().min(0).optional().nullable(),
    dailyPrice: z.coerce.number().min(0).optional().nullable(),
    weeklyPrice: z.coerce.number().min(0).optional().nullable(),
    securityDeposit: z.coerce.number().min(0).optional().nullable(),
    overtimeRatePerHour: z.coerce.number().min(0).optional(),
    taxPercent: z.coerce.number().min(0).max(100).optional(),
    status: z.enum(['active', 'inactive']).optional(),
});

const cleanNullableId = (value) => {
    if (value === undefined || value === null || value === '' || value === 'null') return null;
    return String(value);
};

export const validateCreatePricingDto = (body = {}) => {
    const result = pricingBodySchema.safeParse(body);
    if (!result.success) throw new ValidationError(result.error.errors[0].message);
    const d = result.data;
    const categoryId = cleanNullableId(d.categoryId);
    const zoneId = cleanNullableId(d.zoneId);
    const bikeId = cleanNullableId(d.bikeId);

    if (d.scope === 'category' && !categoryId) throw new ValidationError('categoryId is required for category scope');
    if (d.scope === 'zone' && !zoneId) throw new ValidationError('zoneId is required for zone scope');
    if (d.scope === 'bike' && !bikeId) throw new ValidationError('bikeId is required for bike scope');

    return {
        ...d,
        name: d.name.trim(),
        categoryId: d.scope === 'category' ? categoryId : null,
        zoneId: d.scope === 'zone' ? zoneId : null,
        bikeId: d.scope === 'bike' ? bikeId : null,
        hourlyPrice: d.hourlyPrice ?? null,
        dailyPrice: d.dailyPrice ?? null,
        weeklyPrice: d.weeklyPrice ?? null,
        securityDeposit: d.securityDeposit ?? null,
        overtimeRatePerHour: d.overtimeRatePerHour ?? 0,
        taxPercent: d.taxPercent ?? 0,
        status: d.status || 'active',
    };
};

export const validateUpdatePricingDto = (body = {}) => {
    const result = pricingBodySchema.partial().safeParse(body);
    if (!result.success) throw new ValidationError(result.error.errors[0].message);
    const d = { ...result.data };
    if (d.name !== undefined) d.name = d.name.trim();
    if (d.categoryId !== undefined) d.categoryId = cleanNullableId(d.categoryId);
    if (d.zoneId !== undefined) d.zoneId = cleanNullableId(d.zoneId);
    if (d.bikeId !== undefined) d.bikeId = cleanNullableId(d.bikeId);
    return d;
};

export const validatePricingId = (id) => {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid pricing id');
    }
    return String(id);
};

export const validatePricingStatusDto = (body = {}) => {
    const status = String(body.status || '').trim();
    if (!['active', 'inactive'].includes(status)) {
        throw new ValidationError('Invalid pricing status');
    }
    return { status };
};
