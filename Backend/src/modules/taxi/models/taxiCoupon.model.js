import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/**
 * Taxi promo coupons — Food-style advanced rules + Porter-style zone/vehicle targeting.
 */
const taxiCouponSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            default: '',
            trim: true,
        },
        discountType: {
            type: String,
            enum: ['percentage', 'flat'],
            default: 'percentage',
            index: true,
        },
        discountValue: {
            type: Number,
            required: true,
            min: 0,
        },
        maxDiscount: {
            type: Number,
            default: 0,
            min: 0,
        },
        /** Minimum ride fare before discount */
        minFare: {
            type: Number,
            default: 0,
            min: 0,
        },
        usageLimit: {
            type: Number,
            default: 0,
            min: 0,
        },
        usedCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        perUserLimit: {
            type: Number,
            default: 1,
            min: 0,
        },
        validFrom: {
            type: Date,
            required: true,
            index: true,
        },
        validUntil: {
            type: Date,
            required: true,
            index: true,
        },
        customerScope: {
            type: String,
            enum: ['all', 'first-time'],
            default: 'all',
            index: true,
        },
        firstRideOnly: { type: Boolean, default: false },
        /** Waive taxi platform fee when coupon applies */
        waivePlatformFee: { type: Boolean, default: false },
        autoApply: { type: Boolean, default: false },
        showInBooking: { type: Boolean, default: true },
        /** Empty = all zones */
        zoneIds: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'TaxiZone',
        }],
        /** Empty = all vehicle types (GlobalSettings vehicle config ids) */
        vehicleTypeIds: [{
            type: mongoose.Schema.Types.ObjectId,
        }],
        status: {
            type: String,
            enum: ['active', 'scheduled', 'expired', 'inactive'],
            default: 'active',
            index: true,
        },
        totalDiscountGiven: { type: Number, default: 0, min: 0 },
        isDeleted: { type: Boolean, default: false, index: true },
        deletedAt: { type: Date, default: null },
        deletedBy: { type: actionPerformerSchema, default: null },
        createdBy: { type: actionPerformerSchema, default: null },
        updatedBy: { type: actionPerformerSchema, default: null },
        statusHistory: {
            type: [{
                status: { type: String, enum: ['active', 'scheduled', 'expired', 'inactive'] },
                changedAt: { type: Date, default: Date.now },
                changedBy: { type: actionPerformerSchema, default: null },
            }],
            default: [],
        },
    },
    {
        collection: 'taxi_coupons',
        timestamps: true,
    },
);

taxiCouponSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
taxiCouponSchema.index({ status: 1, validFrom: 1, validUntil: 1 });
taxiCouponSchema.index({ isDeleted: 1, status: 1, createdAt: -1 });

export const TaxiCoupon = mongoose.models.TaxiCoupon
    || mongoose.model('TaxiCoupon', taxiCouponSchema, 'taxi_coupons');
