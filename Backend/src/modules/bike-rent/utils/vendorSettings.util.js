/**
 * Settings hierarchy: bike override (highest) > vendor override > platform default (fallback).
 * Grouped into sections so the vendor UI can offer one clear "customize this section" toggle
 * per policy area instead of a confusing field-by-field override matrix.
 */
export const VENDOR_SETTINGS_SECTIONS = {
    booking: ['minBookingDurationHours', 'maxBookingDurationHours'],
    cancellation: [
        'freeCancelBeforePickupMinutes',
        'cancellationChargeType',
        'cancellationChargePercent',
        'cancellationChargeFixed',
    ],
    noShow: [
        'noShowPolicyEnabled',
        'noShowGraceMinutes',
        'noShowRefundRule',
        'noShowRefundMode',
        'noShowRefundPercent',
        'noShowRefundFixed',
        'noShowPenaltyAmount',
    ],
    lateReturn: ['lateFeePerHour', 'lateReturnGraceMinutes', 'lateReturnMaxCharge'],
    // securityDepositPaymentMode intentionally removed — deposit is always collected online now.
    deposit: ['depositRefundHours'],
    support: ['supportPhone', 'supportEmail', 'outOfServiceMessage'],
};

export const VENDOR_OVERRIDABLE_KEYS = Object.values(VENDOR_SETTINGS_SECTIONS).flat();
export const VENDOR_OVERRIDABLE_KEY_SET = new Set(VENDOR_OVERRIDABLE_KEYS);
