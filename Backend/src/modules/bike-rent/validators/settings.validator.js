import { z } from 'zod';
import { ValidationError } from '../../../core/auth/errors.js';
import { BIKE_RENT_SETTINGS_DEFAULTS } from '../models/bikeRentSettings.model.js';
import { VENDOR_OVERRIDABLE_KEYS } from '../utils/vendorSettings.util.js';

export const settingsSchema = z.object({
    unpaidBookingTtlMinutes: z.coerce.number().int().min(1).max(1440).optional(),
    pickupWindowMinutes: z.coerce.number().int().min(5).max(1440).optional(),
    cancelFeePercentAfterReserve: z.coerce.number().min(0).max(100).optional(),
    freeCancelBeforePickupMinutes: z.coerce.number().int().min(0).max(10080).optional(),
    cancellationChargeType: z.enum(['percent', 'fixed']).optional(),
    cancellationChargePercent: z.coerce.number().min(0).max(100).optional(),
    cancellationChargeFixed: z.coerce.number().min(0).optional(),
    lateFeePerHour: z.coerce.number().min(0).optional(),
    lateReturnGraceMinutes: z.coerce.number().int().min(0).max(1440).optional(),
    lateReturnMaxCharge: z.union([
        z.coerce.number().min(0),
        z.null(),
        z.literal(''),
    ]).optional(),
    allowWeeklyPricing: z.boolean().optional(),
    depositRefundDays: z.coerce.number().int().min(0).max(90).optional(),
    depositRefundHours: z.coerce.number().int().min(0).max(720).optional(),
    securityDepositPaymentMode: z.enum(['online', 'pay_at_pickup', 'both']).optional(),
    noShowPolicyEnabled: z.boolean().optional(),
    noShowGraceMinutes: z.coerce.number().int().min(0).max(1440).optional(),
    noShowRefundRule: z.enum(['full', 'partial', 'none']).optional(),
    noShowRefundMode: z.enum(['percent', 'fixed']).optional(),
    noShowRefundPercent: z.coerce.number().min(0).max(100).optional(),
    noShowRefundFixed: z.coerce.number().min(0).optional(),
    noShowPenaltyAmount: z.coerce.number().min(0).optional(),
    minBookingDurationHours: z.coerce.number().int().min(1).max(720).optional(),
    maxBookingDurationHours: z.coerce.number().int().min(1).max(720).optional(),
    turnaroundBufferMinutes: z.coerce.number().int().min(0).max(1440).optional(),
    supportPhone: z.string().max(30).optional(),
    supportEmail: z.string().email().or(z.literal('')).optional(),
    termsHtml: z.string().max(50000).optional(),
    outOfServiceMessage: z.string().max(500).optional(),
    defaultVendorCommissionPercent: z.coerce.number().min(0).max(100).optional(),
    settlementDayOfMonth: z.coerce.number().int().min(0).max(31).optional(),
    documentTypes: z.array(z.object({
        key: z.string().max(80).optional(),
        label: z.string().min(1).max(120),
        active: z.boolean().optional(),
    })).max(50).optional(),
});

const slugifyDocKey = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);

const normalizeDocumentTypes = (list = []) => {
    const seen = new Set();
    const out = [];
    for (const item of list) {
        const key = slugifyDocKey(item.key || item.label);
        const label = String(item.label || '').trim();
        if (!key || !label || seen.has(key)) continue;
        seen.add(key);
        out.push({ key, label, active: item.active !== false });
    }
    return out;
};

export const validateSettingsDto = (body = {}) => {
    const result = settingsSchema.safeParse(body);
    if (!result.success) throw new ValidationError(result.error.errors[0].message);
    const data = { ...result.data };
    if (data.supportPhone !== undefined) data.supportPhone = data.supportPhone.trim();
    if (data.supportEmail !== undefined) data.supportEmail = data.supportEmail.trim();
    if (data.documentTypes !== undefined) {
        data.documentTypes = normalizeDocumentTypes(data.documentTypes);
        if (!data.documentTypes.length) {
            throw new ValidationError('At least one required-document type must remain');
        }
    }
    if (data.outOfServiceMessage !== undefined) {
        data.outOfServiceMessage = data.outOfServiceMessage.trim()
            || BIKE_RENT_SETTINGS_DEFAULTS.outOfServiceMessage;
    }
    if (data.lateReturnMaxCharge === '' || data.lateReturnMaxCharge === undefined) {
        if (data.lateReturnMaxCharge === '') data.lateReturnMaxCharge = null;
    } else if (data.lateReturnMaxCharge === null) {
        data.lateReturnMaxCharge = null;
    } else {
        data.lateReturnMaxCharge = Number(data.lateReturnMaxCharge);
    }

    // Keep legacy percent field in sync when new percent charge is updated.
    if (data.cancellationChargePercent != null && data.cancelFeePercentAfterReserve == null) {
        data.cancelFeePercentAfterReserve = data.cancellationChargePercent;
    }
    if (data.cancelFeePercentAfterReserve != null && data.cancellationChargePercent == null) {
        data.cancellationChargePercent = data.cancelFeePercentAfterReserve;
    }

    // Keep pickup window aligned with no-show grace when grace is updated.
    if (data.noShowGraceMinutes != null && data.pickupWindowMinutes == null) {
        data.pickupWindowMinutes = Math.max(5, Number(data.noShowGraceMinutes) || 5);
    }

    const minH = data.minBookingDurationHours;
    const maxH = data.maxBookingDurationHours;
    if (minH != null && maxH != null && maxH < minH) {
        throw new ValidationError(
            'Maximum booking duration must be greater than or equal to minimum booking duration',
        );
    }

    return data;
};

const vendorSettingsShape = Object.fromEntries(VENDOR_OVERRIDABLE_KEYS.map((key) => [key, true]));
const vendorSettingsSchema = settingsSchema.pick(vendorSettingsShape);

const normalizeOverridePayload = (parsed) => {
    const data = { ...parsed };

    if (data.supportPhone !== undefined) data.supportPhone = data.supportPhone.trim();
    if (data.supportEmail !== undefined) data.supportEmail = data.supportEmail.trim();
    if (data.outOfServiceMessage !== undefined) data.outOfServiceMessage = data.outOfServiceMessage.trim();

    if (data.lateReturnMaxCharge === '' ) {
        data.lateReturnMaxCharge = null;
    } else if (data.lateReturnMaxCharge !== undefined && data.lateReturnMaxCharge !== null) {
        data.lateReturnMaxCharge = Number(data.lateReturnMaxCharge);
    }

    const minH = data.minBookingDurationHours;
    const maxH = data.maxBookingDurationHours;
    if (minH != null && maxH != null && maxH < minH) {
        throw new ValidationError(
            'Maximum booking duration must be greater than or equal to minimum booking duration',
        );
    }

    return data;
};

/**
 * Validates a vendor's settings-override payload. Unlike `validateSettingsDto`, this is a
 * *full replace* — the returned object becomes the vendor's entire `settings` override map,
 * so omitted keys simply mean "inherit the platform default" rather than "leave unchanged".
 */
export const validateVendorSettingsDto = (body = {}) => {
    const result = vendorSettingsSchema.safeParse(body);
    if (!result.success) throw new ValidationError(result.error.errors[0].message);
    return normalizeOverridePayload(result.data);
};

/**
 * Validates a single bike's `settingsOverride` map (highest-priority tier of the settings
 * hierarchy) — same whitelist/shape as the vendor override, also a full replace. `null`/`undefined`
 * clears the bike-level override entirely so the bike falls through to the vendor/admin values.
 */
export const validateBikeSettingsOverrideDto = (value) => {
    if (value === null || value === undefined) return null;
    const result = vendorSettingsSchema.safeParse(value);
    if (!result.success) throw new ValidationError(result.error.errors[0].message);
    const data = normalizeOverridePayload(result.data);
    return Object.keys(data).length ? data : null;
};
