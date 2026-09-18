import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

const DEFAULTS = {
    unpaidBookingTtlMinutes: 15,
    /** How long after the scheduled pickup time the rider can still be checked in via OTP. */
    pickupWindowMinutes: 30,
    /** @deprecated Prefer freeCancelBeforePickupMinutes + cancellationCharge* */
    cancelFeePercentAfterReserve: 10,
    /** Free cancel window ending this many minutes before scheduled pickup. */
    freeCancelBeforePickupMinutes: 60,
    /** percent | fixed */
    cancellationChargeType: 'percent',
    /** Used when cancellationChargeType === 'percent' */
    cancellationChargePercent: 10,
    /** Used when cancellationChargeType === 'fixed' */
    cancellationChargeFixed: 200,
    /** Extra hour / late return charge (₹ per hour). */
    lateFeePerHour: 100,
    /** Minutes after scheduled return with no late charge. */
    lateReturnGraceMinutes: 0,
    /** Optional cap on late fee only (null/undefined = no cap). */
    lateReturnMaxCharge: null,
    allowWeeklyPricing: true,
    depositRefundDays: 1,
    /** Hours after inspection before auto wallet refund (preferred over days). */
    depositRefundHours: 24,
    /** online | pay_at_pickup | both */
    securityDepositPaymentMode: 'both',
    /** No-show policy */
    noShowPolicyEnabled: true,
    /** Minutes after scheduled pickup before auto no-show (grace). */
    noShowGraceMinutes: 30,
    /** full | partial | none */
    noShowRefundRule: 'full',
    /** percent | fixed — used when noShowRefundRule === 'partial' */
    noShowRefundMode: 'percent',
    noShowRefundPercent: 20,
    noShowRefundFixed: 500,
    /** Optional fixed penalty taken from deposit before refund calc. */
    noShowPenaltyAmount: 0,
    minBookingDurationHours: 1,
    maxBookingDurationHours: 12,
    /** Minutes of turnaround/buffer between consecutive bookings on the same bike. */
    turnaroundBufferMinutes: 30,
    supportPhone: '',
    supportEmail: '',
    termsHtml: '',
    outOfServiceMessage: 'Bike Rent is not available in your area yet. Please try a different location.',
    /** Platform commission % applied to vendor bookings when a vendor has no custom rate set. */
    defaultVendorCommissionPercent: 20,
    /** Day of month the monthly vendor settlement auto-generates. 0 = last day of the month. */
    settlementDayOfMonth: 0,
};

const bikeRentSettingsSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            default: 'default',
            unique: true,
            index: true,
        },
        unpaidBookingTtlMinutes: { type: Number, default: DEFAULTS.unpaidBookingTtlMinutes, min: 1 },
        pickupWindowMinutes: { type: Number, default: DEFAULTS.pickupWindowMinutes, min: 5 },
        cancelFeePercentAfterReserve: { type: Number, default: DEFAULTS.cancelFeePercentAfterReserve, min: 0, max: 100 },
        freeCancelBeforePickupMinutes: {
            type: Number,
            default: DEFAULTS.freeCancelBeforePickupMinutes,
            min: 0,
        },
        cancellationChargeType: {
            type: String,
            enum: ['percent', 'fixed'],
            default: DEFAULTS.cancellationChargeType,
        },
        cancellationChargePercent: {
            type: Number,
            default: DEFAULTS.cancellationChargePercent,
            min: 0,
            max: 100,
        },
        cancellationChargeFixed: {
            type: Number,
            default: DEFAULTS.cancellationChargeFixed,
            min: 0,
        },
        lateFeePerHour: { type: Number, default: DEFAULTS.lateFeePerHour, min: 0 },
        lateReturnGraceMinutes: {
            type: Number,
            default: DEFAULTS.lateReturnGraceMinutes,
            min: 0,
        },
        lateReturnMaxCharge: {
            type: Number,
            default: null,
            min: 0,
        },
        allowWeeklyPricing: { type: Boolean, default: DEFAULTS.allowWeeklyPricing },
        depositRefundDays: { type: Number, default: DEFAULTS.depositRefundDays, min: 0 },
        depositRefundHours: {
            type: Number,
            default: DEFAULTS.depositRefundHours,
            min: 0,
        },
        /**
         * @deprecated No longer read by booking creation — the deposit is always collected
         * online, bundled with the rest of the booking payment. Field kept only so existing
         * stored settings documents don't fail schema validation; has no effect.
         */
        securityDepositPaymentMode: {
            type: String,
            enum: ['online', 'pay_at_pickup', 'both'],
            default: DEFAULTS.securityDepositPaymentMode,
        },
        noShowPolicyEnabled: { type: Boolean, default: DEFAULTS.noShowPolicyEnabled },
        noShowGraceMinutes: {
            type: Number,
            default: DEFAULTS.noShowGraceMinutes,
            min: 0,
        },
        noShowRefundRule: {
            type: String,
            enum: ['full', 'partial', 'none'],
            default: DEFAULTS.noShowRefundRule,
        },
        noShowRefundMode: {
            type: String,
            enum: ['percent', 'fixed'],
            default: DEFAULTS.noShowRefundMode,
        },
        noShowRefundPercent: {
            type: Number,
            default: DEFAULTS.noShowRefundPercent,
            min: 0,
            max: 100,
        },
        noShowRefundFixed: {
            type: Number,
            default: DEFAULTS.noShowRefundFixed,
            min: 0,
        },
        noShowPenaltyAmount: {
            type: Number,
            default: DEFAULTS.noShowPenaltyAmount,
            min: 0,
        },
        minBookingDurationHours: {
            type: Number,
            default: DEFAULTS.minBookingDurationHours,
            min: 1,
        },
        maxBookingDurationHours: {
            type: Number,
            default: DEFAULTS.maxBookingDurationHours,
            min: 1,
        },
        turnaroundBufferMinutes: {
            type: Number,
            default: DEFAULTS.turnaroundBufferMinutes,
            min: 0,
        },
        supportPhone: { type: String, default: '', trim: true },
        supportEmail: { type: String, default: '', trim: true },
        termsHtml: { type: String, default: '' },
        outOfServiceMessage: { type: String, default: DEFAULTS.outOfServiceMessage, trim: true },
        defaultVendorCommissionPercent: {
            type: Number,
            default: DEFAULTS.defaultVendorCommissionPercent,
            min: 0,
            max: 100,
        },
        settlementDayOfMonth: {
            type: Number,
            default: DEFAULTS.settlementDayOfMonth,
            min: 0,
            max: 31,
        },
        /** Admin-curated catalog of pickup document types bikes can require (e.g. Driving License, Aadhaar). */
        documentTypes: {
            type: [{
                key: { type: String, trim: true, required: true },
                label: { type: String, trim: true, required: true },
                active: { type: Boolean, default: true },
            }],
            default: () => ([
                { key: 'driving_license', label: 'Driving License', active: true },
                { key: 'aadhaar_card', label: 'Aadhaar Card', active: true },
                { key: 'passport', label: 'Passport', active: true },
                { key: 'voter_id', label: 'Voter ID', active: true },
            ]),
        },
        updatedBy: { type: actionPerformerSchema, default: null },
    },
    {
        collection: 'bike_rent_settings',
        timestamps: true,
    },
);

export const BikeRentSettings = mongoose.models.BikeRentSettings
    || mongoose.model('BikeRentSettings', bikeRentSettingsSchema, 'bike_rent_settings');

export const BIKE_RENT_SETTINGS_DEFAULTS = DEFAULTS;
