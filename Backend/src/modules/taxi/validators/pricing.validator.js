import { z } from 'zod';
import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';

const slabSchema = z.object({
    fromKm: z.coerce.number().min(0, 'fromKm must be ≥ 0'),
    toKm: z.union([z.coerce.number().min(0), z.null()]).optional(),
    baseFare: z.coerce.number().min(0).optional(),
    baseDistanceKm: z.coerce.number().min(0).optional(),
    perKmRate: z.coerce.number().min(0).optional(),
    perMinRate: z.coerce.number().min(0).optional(),
    freeWaitMinutes: z.coerce.number().min(0).optional(),
    perMinWaitRate: z.coerce.number().min(0).optional(),
    platformFee: z.coerce.number().min(0).optional(),
    surgeMultiplier: z.coerce.number().min(0).optional(),
});

const normalizeSlab = (s) => {
    const toKmRaw = s.toKm;
    const toKm =
        toKmRaw === null || toKmRaw === undefined || toKmRaw === ''
            ? null
            : Number(toKmRaw);

    return {
        fromKm: Number(s.fromKm || 0),
        toKm: Number.isFinite(toKm) ? toKm : null,
        baseFare: Number(s.baseFare ?? 0),
        baseDistanceKm: Number(s.baseDistanceKm ?? 0),
        perKmRate: Number(s.perKmRate ?? 0),
        perMinRate: Number(s.perMinRate ?? 0),
        freeWaitMinutes: Number(s.freeWaitMinutes ?? 0),
        perMinWaitRate: Number(s.perMinWaitRate ?? 0),
        platformFee: Number(s.platformFee ?? 0),
        surgeMultiplier: Number(s.surgeMultiplier ?? 1) || 1,
    };
};

/**
 * Validate contiguous-ish slabs: sorted by fromKm, toKm > fromKm (when set),
 * no interior overlaps. Shared boundaries allowed (e.g. 0–2 and 2–5).
 */
export function normalizeAndValidateSlabs(rawSlabs) {
    if (!Array.isArray(rawSlabs) || rawSlabs.length === 0) {
        throw new ValidationError('At least one distance slab is required');
    }

    const slabs = rawSlabs.map(normalizeSlab).sort((a, b) => a.fromKm - b.fromKm);

    for (let i = 0; i < slabs.length; i += 1) {
        const s = slabs[i];
        if (s.toKm != null && s.toKm < s.fromKm) {
            throw new ValidationError(
                `Slab ${i + 1}: toKm must be ≥ fromKm (or leave empty for unlimited)`,
            );
        }
        if (i > 0) {
            const prev = slabs[i - 1];
            if (prev.toKm == null) {
                throw new ValidationError(
                    'Only the last slab can have an open/unlimited toKm',
                );
            }
            if (s.fromKm < prev.toKm) {
                throw new ValidationError(
                    `Slab ranges overlap: ${prev.fromKm}–${prev.toKm} km and ${s.fromKm}–${s.toKm ?? '∞'} km`,
                );
            }
        }
    }

    // Only last slab may be open-ended
    for (let i = 0; i < slabs.length - 1; i += 1) {
        if (slabs[i].toKm == null) {
            throw new ValidationError('Only the last slab can have unlimited toKm');
        }
    }

    return slabs;
}

/** Sync legacy top-level rate fields from the first slab for list/stats. */
export function legacyFieldsFromSlabs(slabs = []) {
    const first = slabs[0] || {};
    return {
        baseFare: Number(first.baseFare || 0),
        baseDistanceKm: Number(first.baseDistanceKm || 0),
        perKmRate: Number(first.perKmRate || 0),
        perMinRate: Number(first.perMinRate || 0),
        freeWaitMinutes: Number(first.freeWaitMinutes || 0),
        perMinWaitRate: Number(first.perMinWaitRate || 0),
        platformFee: Number(first.platformFee || 0),
        surgeMultiplier: Number(first.surgeMultiplier ?? 1) || 1,
    };
}

/** Build one default slab from legacy flat body fields. */
function slabsFromLegacyBody(body = {}) {
    return [
        normalizeSlab({
            fromKm: 0,
            toKm: null,
            baseFare: body.baseFare,
            baseDistanceKm: body.baseDistanceKm,
            perKmRate: body.perKmRate,
            perMinRate: body.perMinRate,
            freeWaitMinutes: body.freeWaitMinutes,
            perMinWaitRate: body.perMinWaitRate,
            platformFee: body.platformFee,
            surgeMultiplier: body.surgeMultiplier,
        }),
    ];
}

const pricingBodySchema = z.object({
    vehicleTypeId: z.string().min(1, 'Vehicle type is required'),
    zoneId: z.string().optional().nullable(),
    slabs: z.array(slabSchema).optional(),
    // legacy flat fields still accepted → converted to a single open slab
    baseFare: z.coerce.number().min(0).optional(),
    baseDistanceKm: z.coerce.number().min(0).optional(),
    perKmRate: z.coerce.number().min(0).optional(),
    perMinRate: z.coerce.number().min(0).optional(),
    freeWaitMinutes: z.coerce.number().min(0).optional(),
    perMinWaitRate: z.coerce.number().min(0).optional(),
    platformFee: z.coerce.number().min(0).optional(),
    surgeMultiplier: z.coerce.number().min(0).optional(),
    status: z.enum(['active', 'inactive']).optional(),
});

export const validateCreatePricingDto = (body = {}) => {
    const result = pricingBodySchema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }
    if (!mongoose.Types.ObjectId.isValid(result.data.vehicleTypeId)) {
        throw new ValidationError('Invalid vehicle type id');
    }
    if (result.data.zoneId && !mongoose.Types.ObjectId.isValid(result.data.zoneId)) {
        throw new ValidationError('Invalid zone id');
    }

    const slabs = result.data.slabs?.length
        ? normalizeAndValidateSlabs(result.data.slabs)
        : slabsFromLegacyBody(result.data);

    return {
        vehicleTypeId: result.data.vehicleTypeId,
        zoneId: result.data.zoneId || null,
        slabs,
        ...legacyFieldsFromSlabs(slabs),
        status: result.data.status || 'active',
    };
};

export const validateUpdatePricingDto = (body = {}) => {
    const partial = pricingBodySchema.omit({ vehicleTypeId: true }).partial().safeParse(body);
    if (!partial.success) {
        throw new ValidationError(partial.error.errors[0].message);
    }
    const data = { ...partial.data };
    if (data.zoneId !== undefined && data.zoneId && !mongoose.Types.ObjectId.isValid(data.zoneId)) {
        throw new ValidationError('Invalid zone id');
    }
    if (data.zoneId === '') data.zoneId = null;

    if (data.slabs !== undefined) {
        data.slabs = normalizeAndValidateSlabs(data.slabs);
        Object.assign(data, legacyFieldsFromSlabs(data.slabs));
    }

    return data;
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

const vehicleRatesSchema = z.object({
    baseFare: z.coerce.number().min(0).optional(),
    baseDistanceKm: z.coerce.number().min(0).optional(),
    perKmRate: z.coerce.number().min(0).optional(),
    perMinRate: z.coerce.number().min(0).optional(),
    freeWaitMinutes: z.coerce.number().min(0).optional(),
    perMinWaitRate: z.coerce.number().min(0).optional(),
    platformFee: z.coerce.number().min(0).optional(),
    surgeMultiplier: z.coerce.number().min(0).optional(),
});

const zoneMatrixSlabSchema = z.object({
    fromKm: z.coerce.number().min(0),
    toKm: z.union([z.coerce.number().min(0), z.null()]).optional(),
    vehicles: z.record(z.string(), vehicleRatesSchema),
});

const zoneMatrixBodySchema = z.object({
    zoneId: z.string().optional().nullable(),
    status: z.enum(['active', 'inactive']).optional(),
    vehicleTypeIds: z.array(z.string().min(1)).min(1, 'At least one vehicle type is required'),
    /** Admin commission % per vehicle type id (0–100) */
    vehicleCommissions: z.record(z.string(), z.coerce.number().min(0).max(100)).optional(),
    slabs: z.array(zoneMatrixSlabSchema).min(1, 'At least one distance slab is required'),
});

/**
 * Zone-first matrix: shared slab ranges, rates per vehicle type inside each slab.
 */
export const validateZonePricingMatrixDto = (body = {}) => {
    const result = zoneMatrixBodySchema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }

    const zoneId = result.data.zoneId || null;
    if (zoneId && !mongoose.Types.ObjectId.isValid(zoneId)) {
        throw new ValidationError('Invalid zone id');
    }

    const vehicleTypeIds = [...new Set(result.data.vehicleTypeIds.map(String))];
    for (const id of vehicleTypeIds) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ValidationError('Invalid vehicle type id');
        }
    }

    // Validate shared ranges once (sorted / overlap-checked)
    const rangeSlabs = normalizeAndValidateSlabs(
        result.data.slabs.map((s) => ({
            fromKm: s.fromKm,
            toKm: s.toKm,
            baseFare: 0,
            baseDistanceKm: 0,
            perKmRate: 0,
            perMinRate: 0,
            freeWaitMinutes: 0,
            perMinWaitRate: 0,
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
        for (const vehicleTypeId of vehicleTypeIds) {
            const rates = raw?.vehicles?.[vehicleTypeId] || raw?.vehicles?.[String(vehicleTypeId)] || {};
            vehicles[vehicleTypeId] = normalizeSlab({
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
        vehicleTypeIds,
        vehicleCommissions: result.data.vehicleCommissions || {},
        slabs,
    };
};
