import { z } from 'zod';
import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';
import { validateBikeSettingsOverrideDto } from './settings.validator.js';

const objectId = z.string().refine((v) => mongoose.Types.ObjectId.isValid(String(v)), 'Invalid id');

const docSchema = z.object({
    url: z.string().optional(),
    publicId: z.string().optional(),
}).optional().nullable();

const imageSchema = z.object({
    url: z.string().min(1),
    publicId: z.string().optional(),
    isPrimary: z.boolean().optional(),
});

const normalizeRequiredDocuments = (value) => {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const list = [];
    for (const item of value) {
        const title = String(
            typeof item === 'string' ? item : (item?.title || item?.name || ''),
        ).trim().slice(0, 200);
        if (!title) continue;
        const key = title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        list.push(title);
        if (list.length >= 20) break;
    }
    return list;
};

const bikeBodySchema = z.object({
    name: z.string().min(1, 'Bike name is required').max(160),
    brand: z.string().min(1, 'Brand is required').max(120),
    model: z.string().min(1, 'Model is required').max(120),
    categoryId: objectId,
    registrationNumber: z.string().min(1, 'Registration number is required').max(40),
    engineNumber: z.string().max(80).optional(),
    chassisNumber: z.string().max(80).optional(),
    fuelType: z.enum(['petrol', 'diesel', 'electric', 'hybrid', 'cng', 'other']).optional(),
    transmission: z.enum(['manual', 'automatic', 'cvt', 'other']).optional(),
    seatingCapacity: z.coerce.number().int().min(1).max(10).optional(),
    helmetIncluded: z.union([z.boolean(), z.string()]).optional(),
    description: z.string().max(5000).optional(),
    requiredDocuments: z.array(z.union([
        z.string().max(200),
        z.object({ title: z.string().max(200).optional(), name: z.string().max(200).optional() }).passthrough(),
    ])).max(20).optional(),
    images: z.array(imageSchema).optional(),
    rcDoc: docSchema,
    insuranceDoc: docSchema,
    pucDoc: docSchema,
    hourlyPrice: z.coerce.number().min(0, 'Hourly price is required'),
    dailyPrice: z.coerce.number().min(0, 'Full day price is required'),
    weeklyPrice: z.coerce.number().min(0, 'Full week price is required'),
    securityDeposit: z.coerce.number().min(0, 'Security deposit is required'),
    zoneId: objectId,
    hubId: objectId,
    availabilityStatus: z.enum(['available', 'reserved', 'rented', 'maintenance', 'disabled', 'unavailable']).optional(),
    maintenanceStatus: z.enum(['none', 'maintenance']).optional(),
    isActive: z.union([z.boolean(), z.string()]).optional(),
});

const toBool = (value, fallback = true) => {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const s = String(value).toLowerCase();
    if (['true', '1', 'yes'].includes(s)) return true;
    if (['false', '0', 'no'].includes(s)) return false;
    return fallback;
};

const parseMaybeJson = (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if ((trimmed.startsWith('{') && trimmed.endsWith('}'))
        || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try { return JSON.parse(trimmed); } catch { return value; }
    }
    return value;
};

const normalizeBody = (body = {}) => {
    const data = { ...body };
    ['images', 'rcDoc', 'insuranceDoc', 'pucDoc', 'requiredDocuments', 'settingsOverride'].forEach((key) => {
        if (data[key] !== undefined) data[key] = parseMaybeJson(data[key]);
    });
    return data;
};

const normalizeDoc = (doc) => {
    if (!doc || typeof doc !== 'object') return { url: '', publicId: '' };
    return {
        url: String(doc.url || '').trim(),
        publicId: String(doc.publicId || '').trim(),
        uploadedAt: doc.url ? new Date() : null,
    };
};

export const validateCreateBikeDto = (body = {}) => {
    const normalized = normalizeBody(body);
    const result = bikeBodySchema.safeParse(normalized);
    if (!result.success) throw new ValidationError(result.error.errors[0].message);
    const d = result.data;
    return {
        ...d,
        name: d.name.trim(),
        brand: d.brand.trim(),
        model: d.model.trim(),
        registrationNumber: d.registrationNumber.trim().toUpperCase(),
        engineNumber: d.engineNumber?.trim() || '',
        chassisNumber: d.chassisNumber?.trim() || '',
        fuelType: d.fuelType || 'petrol',
        transmission: d.transmission || 'manual',
        seatingCapacity: d.seatingCapacity ?? 2,
        helmetIncluded: toBool(d.helmetIncluded, true),
        description: d.description?.trim() || '',
        requiredDocuments: normalizeRequiredDocuments(d.requiredDocuments),
        images: Array.isArray(d.images) ? d.images.map((img, i) => ({
            url: img.url,
            publicId: img.publicId || '',
            isPrimary: img.isPrimary ?? i === 0,
        })) : [],
        rcDoc: normalizeDoc(d.rcDoc),
        insuranceDoc: normalizeDoc(d.insuranceDoc),
        pucDoc: normalizeDoc(d.pucDoc),
        weeklyPrice: Number(d.weeklyPrice ?? 0),
        availabilityStatus: d.availabilityStatus || 'available',
        maintenanceStatus: d.maintenanceStatus || 'none',
        isActive: toBool(d.isActive, true),
        ownerType: 'admin',
        vendorId: null,
        settingsOverride: validateBikeSettingsOverrideDto(normalized.settingsOverride),
    };
};

export const validateUpdateBikeDto = (body = {}) => {
    const normalized = normalizeBody(body);
    const result = bikeBodySchema.partial().safeParse(normalized);
    if (!result.success) throw new ValidationError(result.error.errors[0].message);
    const d = { ...result.data };
    if (Object.prototype.hasOwnProperty.call(normalized, 'settingsOverride')) {
        d.settingsOverride = validateBikeSettingsOverrideDto(normalized.settingsOverride);
    }
    if (d.name !== undefined) d.name = d.name.trim();
    if (d.brand !== undefined) d.brand = d.brand.trim();
    if (d.model !== undefined) d.model = d.model.trim();
    if (d.registrationNumber !== undefined) {
        d.registrationNumber = d.registrationNumber.trim().toUpperCase();
    }
    if (d.engineNumber !== undefined) d.engineNumber = d.engineNumber.trim();
    if (d.chassisNumber !== undefined) d.chassisNumber = d.chassisNumber.trim();
    if (d.description !== undefined) d.description = d.description.trim();
    if (d.requiredDocuments !== undefined) {
        d.requiredDocuments = normalizeRequiredDocuments(d.requiredDocuments);
    }
    if (d.helmetIncluded !== undefined) d.helmetIncluded = toBool(d.helmetIncluded, true);
    if (d.isActive !== undefined) d.isActive = toBool(d.isActive, true);
    if (d.images !== undefined) {
        d.images = d.images.map((img, i) => ({
            url: img.url,
            publicId: img.publicId || '',
            isPrimary: img.isPrimary ?? i === 0,
        }));
    }
    if (d.rcDoc !== undefined) d.rcDoc = normalizeDoc(d.rcDoc);
    if (d.insuranceDoc !== undefined) d.insuranceDoc = normalizeDoc(d.insuranceDoc);
    if (d.pucDoc !== undefined) d.pucDoc = normalizeDoc(d.pucDoc);
    if (d.weeklyPrice === '' || d.weeklyPrice === null || d.weeklyPrice === undefined) {
        // keep unset on partial update unless explicitly provided as empty → treat as 0 when set
        if (Object.prototype.hasOwnProperty.call(result.data, 'weeklyPrice')) {
            d.weeklyPrice = 0;
        } else {
            delete d.weeklyPrice;
        }
    } else {
        d.weeklyPrice = Number(d.weeklyPrice);
    }
    return d;
};

export const validateBikeId = (id) => {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid bike id');
    }
    return String(id);
};

export const validateBikeStatusDto = (body = {}) => {
    const data = {};
    if (body.isActive !== undefined) data.isActive = toBool(body.isActive, true);
    if (body.availabilityStatus !== undefined) {
        if (!['available', 'reserved', 'rented', 'maintenance', 'disabled', 'unavailable'].includes(body.availabilityStatus)) {
            throw new ValidationError('Invalid availability status');
        }
        data.availabilityStatus = body.availabilityStatus;
    }
    if (body.maintenanceStatus !== undefined) {
        if (!['none', 'maintenance'].includes(body.maintenanceStatus)) {
            throw new ValidationError('Invalid maintenance status');
        }
        data.maintenanceStatus = body.maintenanceStatus;
    }
    if (!Object.keys(data).length) {
        throw new ValidationError('No status fields provided');
    }
    return data;
};
