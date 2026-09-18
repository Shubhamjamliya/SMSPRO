import { z } from 'zod';
import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';

const coordinateSchema = z.object({
    lat: z.coerce.number(),
    lng: z.coerce.number(),
}).or(z.object({
    latitude: z.coerce.number(),
    longitude: z.coerce.number(),
}));

const pickupHubSchema = z.object({
    name: z.string().max(120).optional().or(z.literal('')),
    address: z.string().max(300).optional().or(z.literal('')),
    landmark: z.string().max(200).optional().or(z.literal('')),
    instructions: z.string().max(500).optional().or(z.literal('')),
    lat: z.coerce.number().nullable().optional(),
    lng: z.coerce.number().nullable().optional(),
}).optional();

const zoneBodySchema = z.object({
    name: z.string().min(1, 'Zone name is required').max(120),
    country: z.string().min(1, 'Country is required').max(80),
    unit: z.enum(['kilometer', 'mile']).default('kilometer'),
    status: z.enum(['active', 'inactive']).optional(),
    coordinates: z.array(coordinateSchema).min(3, 'Draw a polygon with at least 3 points'),
    polygon: z.string().optional(),
    displayOrder: z.coerce.number().int().min(0).optional(),
    pickupHub: pickupHubSchema,
});

const normalizeCoordinates = (coords = []) => coords.map((c) => ({
    lat: Number(c.lat ?? c.latitude),
    lng: Number(c.lng ?? c.longitude),
}));

const normalizePickupHub = (hub) => {
    if (!hub || typeof hub !== 'object') {
        return {
            name: '',
            address: '',
            landmark: '',
            instructions: '',
            lat: null,
            lng: null,
        };
    }
    const lat = hub.lat == null || hub.lat === '' ? null : Number(hub.lat);
    const lng = hub.lng == null || hub.lng === '' ? null : Number(hub.lng);
    return {
        name: String(hub.name || '').trim(),
        address: String(hub.address || '').trim(),
        landmark: String(hub.landmark || '').trim(),
        instructions: String(hub.instructions || '').trim(),
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
    };
};

export const validateCreateZoneDto = (body = {}) => {
    const result = zoneBodySchema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }

    const coordinates = normalizeCoordinates(result.data.coordinates);
    const polygon = result.data.polygon?.trim()
        || `${coordinates.length}-point polygon`;

    return {
        ...result.data,
        name: result.data.name.trim(),
        country: result.data.country.trim(),
        unit: result.data.unit,
        status: result.data.status || 'active',
        coordinates,
        polygon,
        displayOrder: result.data.displayOrder ?? 0,
        pickupHub: normalizePickupHub(result.data.pickupHub),
    };
};

export const validateUpdateZoneDto = (body = {}) => {
    const partial = zoneBodySchema.partial().safeParse(body);
    if (!partial.success) {
        throw new ValidationError(partial.error.errors[0].message);
    }

    const data = { ...partial.data };
    if (data.name !== undefined) data.name = data.name.trim();
    if (data.country !== undefined) data.country = data.country.trim();
    if (data.pickupHub !== undefined) data.pickupHub = normalizePickupHub(data.pickupHub);
    if (Array.isArray(data.coordinates)) {
        data.coordinates = normalizeCoordinates(data.coordinates);
        if (data.coordinates.length < 3) {
            throw new ValidationError('Draw a polygon with at least 3 points');
        }
        data.polygon = data.polygon?.trim() || `${data.coordinates.length}-point polygon`;
    }
    return data;
};

export const validateZoneId = (id) => {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid zone id');
    }
    return String(id);
};

export const validateZoneStatusDto = (body = {}) => {
    const status = String(body.status || '').trim();
    if (!['active', 'inactive'].includes(status)) {
        throw new ValidationError('Invalid zone status');
    }
    return { status };
};
