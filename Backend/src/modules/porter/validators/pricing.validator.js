import { z } from 'zod';
import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';

const vehicleRatesSchema = z.object({
    baseFare: z.coerce.number().min(0).optional(),
    baseDistanceKm: z.coerce.number().min(0).optional(),
    perKmRate: z.coerce.number().min(0).optional(),
    freeWeightKg: z.coerce.number().min(0).optional(),
    perKgRate: z.coerce.number().min(0).optional(),
    platformFee: z.coerce.number().min(0).optional(),
    surgeMultiplier: z.coerce.number().min(0).optional(),
}).passthrough();

const slabSchema = z.object({
    fromKm: z.coerce.number().min(0),
    toKm: z.union([z.coerce.number().min(0), z.null()]).optional(),
    baseFare: z.coerce.number().min(0).optional(),
    baseDistanceKm: z.coerce.number().min(0).optional(),
    perKmRate: z.coerce.number().min(0).optional(),
    freeWeightKg: z.coerce.number().min(0).optional(),
    perKgRate: z.coerce.number().min(0).optional(),
    platformFee: z.coerce.number().min(0).optional(),
    surgeMultiplier: z.coerce.number().min(0).optional(),
}).passthrough();

function normalizeSlab(raw = {}) {
    return {
        fromKm: Number(raw.fromKm || 0),
        toKm: raw.toKm == null || raw.toKm === '' ? null : Number(raw.toKm),
        baseFare: Number(raw.baseFare || 0),
        baseDistanceKm: Number(raw.baseDistanceKm || 0),
        perKmRate: Number(raw.perKmRate || 0),
        freeWeightKg: Number(raw.freeWeightKg || 0),
        perKgRate: Number(raw.perKgRate || 0),
        platformFee: Number(raw.platformFee || 0),
        surgeMultiplier: Number(raw.surgeMultiplier ?? 1) || 1,
    };
}

/**
 * Validate contiguous-ish slabs: sorted by fromKm, toKm ≥ fromKm (when set),
 * shared edges OK, only last slab may be open-ended.
 */
export function normalizeAndValidateSlabs(rawSlabs = []) {
    if (!Array.isArray(rawSlabs) || !rawSlabs.length) {
        throw new ValidationError('Add at least one distance slab');
    }

    const slabs = rawSlabs.map(normalizeSlab).sort((a, b) => a.fromKm - b.fromKm);

    for (let i = 0; i < slabs.length; i += 1) {
        const s = slabs[i];
        if (s.toKm != null && s.toKm < s.fromKm) {
            throw new ValidationError(`Slab ${i + 1}: To (km) must be ≥ From (km)`);
        }
        if (i > 0) {
            const prev = slabs[i - 1];
            if (prev.toKm == null) {
                throw new ValidationError('Only the last slab can have unlimited To (km)');
            }
            if (s.fromKm < prev.toKm) {
                throw new ValidationError(
                    `Slabs overlap: ${prev.fromKm}–${prev.toKm} and ${s.fromKm}–${s.toKm ?? '∞'}. Shared edges are OK.`,
                );
            }
        }
    }

    for (let i = 0; i < slabs.length - 1; i += 1) {
        if (slabs[i].toKm == null) {
            throw new ValidationError('Only the last slab can have unlimited To (km)');
        }
    }

    return slabs;
}

export function legacyFieldsFromSlabs(slabs = []) {
    const first = slabs[0] || {};
    return {
        baseFare: Number(first.baseFare || 0),
        baseDistanceKm: Number(first.baseDistanceKm || 0),
        perKmRate: Number(first.perKmRate || 0),
        freeWeightKg: Number(first.freeWeightKg || 0),
        perKgRate: Number(first.perKgRate || 0),
        platformFee: Number(first.platformFee || 0),
        surgeMultiplier: Number(first.surgeMultiplier ?? 1) || 1,
        pricingConfigured: true,
    };
}

const zoneMatrixSlabSchema = z.object({
    fromKm: z.coerce.number().min(0),
    toKm: z.union([z.coerce.number().min(0), z.null()]).optional(),
    vehicles: z.record(z.string(), vehicleRatesSchema),
});

const zoneMatrixBodySchema = z.object({
    zoneId: z.string().optional().nullable(),
    status: z.enum(['active', 'inactive']).optional(),
    vehicleIds: z.array(z.string().min(1)).min(1, 'At least one vehicle is required'),
    vehicleCommissions: z.record(z.string(), z.coerce.number().min(0).max(100)).optional(),
    vehicleLoadingRules: z.record(z.string(), z.object({
        freeLoadingMinutes: z.coerce.number().min(0).optional(),
        extraLoadingPerMinCharge: z.coerce.number().min(0).optional(),
    }).passthrough()).optional(),
    slabs: z.array(zoneMatrixSlabSchema).min(1, 'At least one distance slab is required'),
});

export const validateZonePricingMatrixDto = (body = {}) => {
    const result = zoneMatrixBodySchema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }

    const zoneId = result.data.zoneId || null;
    if (zoneId && !mongoose.Types.ObjectId.isValid(zoneId)) {
        throw new ValidationError('Invalid zone id');
    }

    const vehicleIds = [...new Set(result.data.vehicleIds.map(String))];
    for (const id of vehicleIds) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ValidationError('Invalid vehicle id');
        }
    }

    const rangeSlabs = normalizeAndValidateSlabs(
        result.data.slabs.map((s) => ({
            fromKm: s.fromKm,
            toKm: s.toKm,
            baseFare: 0,
            baseDistanceKm: 0,
            perKmRate: 0,
            freeWeightKg: 0,
            perKgRate: 0,
            platformFee: 0,
            surgeMultiplier: 1,
        })),
    );

    const originalByFrom = new Map(
        result.data.slabs.map((s) => [Number(s.fromKm || 0), s]),
    );

    const slabs = rangeSlabs.map((range) => {
        const raw = originalByFrom.get(Number(range.fromKm)) || { vehicles: {} };
        const vehicles = {};
        for (const vehicleId of vehicleIds) {
            const rates = raw?.vehicles?.[vehicleId] || raw?.vehicles?.[String(vehicleId)] || {};
            vehicles[vehicleId] = normalizeSlab({
                fromKm: range.fromKm,
                toKm: range.toKm,
                ...rates,
            });
        }
        return {
            fromKm: range.fromKm,
            toKm: range.toKm,
            vehicles,
        };
    });

    return {
        zoneId,
        status: result.data.status || 'active',
        vehicleIds,
        vehicleCommissions: result.data.vehicleCommissions || {},
        vehicleLoadingRules: result.data.vehicleLoadingRules || {},
        slabs,
    };
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

/** Legacy single-vehicle upsert kept for compatibility */
export const validateCreatePricingDto = (body = {}) => {
    const vehicleId = String(body.vehicleId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
        throw new ValidationError('Valid vehicleId is required');
    }
    const slabs = body.slabs?.length
        ? normalizeAndValidateSlabs(body.slabs)
        : normalizeAndValidateSlabs([{
            fromKm: 0,
            toKm: null,
            baseFare: body.baseFare ?? body.basePrice ?? 0,
            baseDistanceKm: body.baseDistanceKm ?? body.baseDistance ?? 0,
            perKmRate: body.perKmRate ?? body.distancePrice ?? 0,
            freeWeightKg: body.freeWeightKg ?? 0,
            perKgRate: body.perKgRate ?? 0,
            platformFee: body.platformFee ?? body.commissionValue ?? 0,
            surgeMultiplier: body.surgeMultiplier ?? 1,
        }]);

    return {
        vehicleId,
        zoneId: body.zoneId || null,
        slabs,
        ...legacyFieldsFromSlabs(slabs),
        adminCommissionPercent: Number(body.adminCommissionPercent ?? body.commissionValue ?? 0),
        status: body.status || 'active',
        description: String(body.description || '').trim(),
    };
};

export const validateUpdatePricingDto = (body = {}) => {
    const data = {};
    if (body.slabs !== undefined) {
        data.slabs = normalizeAndValidateSlabs(body.slabs);
        Object.assign(data, legacyFieldsFromSlabs(data.slabs));
    }
    if (body.status !== undefined) data.status = body.status;
    if (body.adminCommissionPercent !== undefined) {
        data.adminCommissionPercent = Number(body.adminCommissionPercent);
    }
    if (body.description !== undefined) data.description = String(body.description).trim();
    if (body.zoneId !== undefined) data.zoneId = body.zoneId || null;
    return data;
};
