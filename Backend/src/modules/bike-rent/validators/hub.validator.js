import { z } from 'zod';
import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';

const objectId = z.string().refine(
    (v) => mongoose.Types.ObjectId.isValid(String(v)),
    'Invalid id',
);

const hubBodySchema = z.object({
    zoneId: objectId.optional(),
    name: z.string().min(1, 'Hub name is required').max(120),
    address: z.string().min(1, 'Hub address is required').max(300),
    landmark: z.string().max(200).optional().or(z.literal('')),
    instructions: z.string().max(500).optional().or(z.literal('')),
    lat: z.coerce.number().nullable().optional(),
    lng: z.coerce.number().nullable().optional(),
    /** Max bikes at this hub; omit/null = unlimited */
    maxBikes: z.union([
        z.coerce.number().int().min(1).max(10000),
        z.null(),
        z.literal(''),
    ]).optional(),
    status: z.enum(['active', 'inactive']).optional(),
    displayOrder: z.coerce.number().int().min(0).optional(),
});

const normalizeCoords = (lat, lng) => {
    const nextLat = lat == null || lat === '' ? null : Number(lat);
    const nextLng = lng == null || lng === '' ? null : Number(lng);
    return {
        lat: Number.isFinite(nextLat) ? nextLat : null,
        lng: Number.isFinite(nextLng) ? nextLng : null,
    };
};

const normalizeMaxBikes = (value) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.floor(n);
};

export const validateCreateHubDto = (body = {}, zoneIdFromRoute = null) => {
    const result = hubBodySchema.safeParse(body);
    if (!result.success) throw new ValidationError(result.error.errors[0].message);
    const zoneId = zoneIdFromRoute || result.data.zoneId;
    if (!zoneId) throw new ValidationError('Zone is required for hub');
    const coords = normalizeCoords(result.data.lat, result.data.lng);
    return {
        zoneId: String(zoneId),
        name: result.data.name.trim(),
        address: result.data.address.trim(),
        landmark: String(result.data.landmark || '').trim(),
        instructions: String(result.data.instructions || '').trim(),
        ...coords,
        maxBikes: normalizeMaxBikes(result.data.maxBikes) ?? null,
        status: result.data.status || 'active',
        displayOrder: result.data.displayOrder ?? 0,
    };
};

export const validateUpdateHubDto = (body = {}) => {
    const result = hubBodySchema.partial().safeParse(body);
    if (!result.success) throw new ValidationError(result.error.errors[0].message);
    const data = { ...result.data };
    if (data.name !== undefined) data.name = data.name.trim();
    if (data.address !== undefined) data.address = data.address.trim();
    if (data.landmark !== undefined) data.landmark = String(data.landmark || '').trim();
    if (data.instructions !== undefined) data.instructions = String(data.instructions || '').trim();
    if (data.lat !== undefined || data.lng !== undefined) {
        const coords = normalizeCoords(data.lat, data.lng);
        data.lat = coords.lat;
        data.lng = coords.lng;
    }
    if (data.zoneId !== undefined) data.zoneId = String(data.zoneId);
    if (data.maxBikes !== undefined) data.maxBikes = normalizeMaxBikes(data.maxBikes);
    return data;
};

export const validateHubId = (id) => {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid hub id');
    }
    return String(id);
};

export const validateHubStatusDto = (body = {}) => {
    const status = String(body.status || '').trim();
    if (!['active', 'inactive'].includes(status)) {
        throw new ValidationError('Invalid hub status');
    }
    return { status };
};
