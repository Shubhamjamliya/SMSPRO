import { z } from 'zod';
import { ValidationError } from '../../../../core/auth/errors.js';

const sponsorRuleSchema = z.object({
    minOrderAmount: z.number().min(0),
    maxOrderAmount: z.number().min(0).nullable().optional(),
    maxDistanceKm: z.number().min(0),
    sponsorType: z.enum(['USER_FULL', 'RESTAURANT_FULL', 'SPLIT']),
    sponsoredKm: z.number().min(0).nullable().optional()
});

const deliveryDistanceSlabSchema = z.object({
    fromKm: z.number().min(0),
    toKm: z.number().min(0),
    deliveryFee: z.number().min(0),
    extraAmount: z.number().min(0).optional(),
    extraType: z.enum(['FLAT', 'PERCENT']).optional()
});

const deliverySpeedOptionSchema = z.object({
    code: z.string().trim().min(1).toLowerCase(),
    label: z.string().trim().min(1),
    description: z.string().trim().optional(),
    etaMinutesMin: z.number().min(0),
    etaMinutesMax: z.number().min(0),
    extraFee: z.number().min(0),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().optional()
});

const packagingChargeSchema = z.object({
    isEnabled: z.boolean(),
    mode: z.enum(['ADMIN', 'RESTAURANT']),
    adminChargePerOrder: z.number().min(0).max(10000)
});

const feeSettingsUpsertSchema = z.object({
    baseDistanceKm: z.number().min(0).nullable().optional(),
    baseDeliveryFee: z.number().min(0).nullable().optional(),
    perKmCharge: z.number().min(0).nullable().optional(),
    sponsorRules: z.array(sponsorRuleSchema).optional(),
    deliveryDistanceSlabs: z.array(deliveryDistanceSlabSchema).optional(),
    deliverySpeedOptions: z.array(deliverySpeedOptionSchema).optional(),
    platformFee: z.number().min(0).nullable().optional(),
    gstRate: z.number().min(0).max(100).nullable().optional(),
    packagingCharge: packagingChargeSchema.optional(),
    mixedOrderDistanceLimit: z.number().min(0).nullable().optional(),
    mixedOrderAngleLimit: z.number().min(0).nullable().optional(),
    isActive: z.boolean().optional()
});

export const validateFeeSettingsUpsertDto = (body) => {
    const normalized = {
        baseDistanceKm:
            body?.baseDistanceKm === null
                ? null
                : body?.baseDistanceKm !== undefined
                    ? Number(body.baseDistanceKm)
                    : undefined,
        baseDeliveryFee:
            body?.baseDeliveryFee === null
                ? null
                : body?.baseDeliveryFee !== undefined
                    ? Number(body.baseDeliveryFee)
                    : undefined,
        perKmCharge:
            body?.perKmCharge === null
                ? null
                : body?.perKmCharge !== undefined
                    ? Number(body.perKmCharge)
                    : undefined,
        sponsorRules: Array.isArray(body?.sponsorRules)
            ? body.sponsorRules.map((rule) => ({
                minOrderAmount: Number(rule?.minOrderAmount),
                maxOrderAmount:
                    rule?.maxOrderAmount === null || rule?.maxOrderAmount === undefined || rule?.maxOrderAmount === ''
                        ? null
                        : Number(rule.maxOrderAmount),
                maxDistanceKm: Number(rule?.maxDistanceKm),
                sponsorType: String(rule?.sponsorType || '').trim().toUpperCase(),
                sponsoredKm:
                    rule?.sponsoredKm === null || rule?.sponsoredKm === undefined || rule?.sponsoredKm === ''
                        ? null
                        : Number(rule.sponsoredKm)
            }))
            : undefined,
        deliveryDistanceSlabs: Array.isArray(body?.deliveryDistanceSlabs)
            ? body.deliveryDistanceSlabs.map((slab) => ({
                fromKm: Number(slab?.fromKm),
                toKm: Number(slab?.toKm),
                deliveryFee: Number(slab?.deliveryFee),
                extraAmount: Number(slab?.extraAmount) || 0,
                extraType: String(slab?.extraType || 'FLAT').trim().toUpperCase() === 'PERCENT'
                    ? 'PERCENT'
                    : 'FLAT'
            }))
            : undefined,
        deliverySpeedOptions: Array.isArray(body?.deliverySpeedOptions)
            ? body.deliverySpeedOptions.map((option) => ({
                code: String(option?.code || '').trim().toLowerCase(),
                label: String(option?.label || '').trim(),
                description: String(option?.description || '').trim(),
                etaMinutesMin: Number(option?.etaMinutesMin),
                etaMinutesMax: Number(option?.etaMinutesMax),
                extraFee: Number(option?.extraFee) || 0,
                isDefault: Boolean(option?.isDefault),
                isActive: option?.isActive !== false,
                sortOrder: Number.isFinite(Number(option?.sortOrder)) ? Number(option.sortOrder) : 0
            }))
            : undefined,
        platformFee:
            body?.platformFee === null ? null : body?.platformFee !== undefined ? Number(body.platformFee) : undefined,
        gstRate:
            body?.gstRate === null ? null : body?.gstRate !== undefined ? Number(body.gstRate) : undefined,
        packagingCharge:
            body?.packagingCharge !== undefined && body?.packagingCharge !== null
                ? {
                    isEnabled: Boolean(body.packagingCharge?.isEnabled),
                    mode: String(body.packagingCharge?.mode || 'ADMIN').trim().toUpperCase() === 'RESTAURANT'
                        ? 'RESTAURANT'
                        : 'ADMIN',
                    adminChargePerOrder: Number(body.packagingCharge?.adminChargePerOrder) || 0
                }
                : undefined,
        mixedOrderDistanceLimit:
            body?.mixedOrderDistanceLimit === null ? null : body?.mixedOrderDistanceLimit !== undefined ? Number(body.mixedOrderDistanceLimit) : undefined,
        mixedOrderAngleLimit:
            body?.mixedOrderAngleLimit === null ? null : body?.mixedOrderAngleLimit !== undefined ? Number(body.mixedOrderAngleLimit) : undefined,
        isActive: body?.isActive !== undefined ? Boolean(body.isActive) : undefined
    };

    const result = feeSettingsUpsertSchema.safeParse(normalized);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }

    const packagingCharge = result.data.packagingCharge;
    if (
        packagingCharge?.isEnabled &&
        packagingCharge.mode === 'ADMIN' &&
        packagingCharge.adminChargePerOrder <= 0
    ) {
        throw new ValidationError('Enter a packaging charge per order, or turn packaging charges off');
    }

    const sponsorRules = Array.isArray(result.data.sponsorRules) ? result.data.sponsorRules : undefined;
    const slabs = Array.isArray(result.data.deliveryDistanceSlabs) ? result.data.deliveryDistanceSlabs : undefined;
    if (slabs) {
        for (const slab of slabs) {
            if (slab.toKm < slab.fromKm) {
                throw new ValidationError('To KM must be greater than or equal to From KM');
            }
        }
    }
    const deliverySpeedOptions = Array.isArray(result.data.deliverySpeedOptions) ? result.data.deliverySpeedOptions : undefined;
    if (deliverySpeedOptions) {
        const seenCodes = new Set();
        for (const option of deliverySpeedOptions) {
            if (!option.code) {
                throw new ValidationError('Delivery speed option code is required');
            }
            if (seenCodes.has(option.code)) {
                throw new ValidationError(`Duplicate delivery speed option code: ${option.code}`);
            }
            seenCodes.add(option.code);
            if (option.etaMinutesMax < option.etaMinutesMin) {
                throw new ValidationError('Delivery speed max ETA must be greater than or equal to min ETA');
            }
        }
    }
    if (sponsorRules) {
        for (const rule of sponsorRules) {
            if (
                rule.maxOrderAmount != null &&
                Number.isFinite(rule.maxOrderAmount) &&
                rule.maxOrderAmount < rule.minOrderAmount
            ) {
                throw new ValidationError('Maximum order amount must be greater than or equal to minimum order amount');
            }
            if (rule.sponsorType === 'SPLIT') {
                const sponsoredKm = Number(rule.sponsoredKm);
                if (!Number.isFinite(sponsoredKm) || sponsoredKm < 0) {
                    throw new ValidationError('Sponsored KM is required for split rules');
                }
            }
            if (rule.sponsorType !== 'SPLIT') {
                rule.sponsoredKm = null;
            }
        }
    }

    return result.data;
};

