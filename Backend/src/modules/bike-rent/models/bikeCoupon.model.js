import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

export const BIKE_COUPON_DISCOUNT_TYPES = Object.freeze(['percentage', 'fixed']);
export const BIKE_COUPON_APPLICABLE_ON = Object.freeze(['rental', 'deposit', 'both']);
export const BIKE_COUPON_STATUSES = Object.freeze(['active', 'inactive']);

const bikeCouponSchema = new mongoose.Schema(
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
            enum: BIKE_COUPON_DISCOUNT_TYPES,
            default: 'percentage',
        },
        discountValue: {
            type: Number,
            required: true,
            min: 0,
        },
        /** rental | deposit | both */
        applicableOn: {
            type: String,
            enum: BIKE_COUPON_APPLICABLE_ON,
            default: 'rental',
            index: true,
        },
        /** Minimum rental amount required to apply */
        minimumAmount: {
            type: Number,
            default: 0,
            min: 0,
        },
        /** Cap for percentage discounts (0 = no cap) */
        maximumDiscount: {
            type: Number,
            default: 0,
            min: 0,
        },
        /** 0 = unlimited */
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
        /** 0 = unlimited per user */
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
        validTill: {
            type: Date,
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: BIKE_COUPON_STATUSES,
            default: 'active',
            index: true,
        },
        totalDiscountGiven: {
            type: Number,
            default: 0,
            min: 0,
        },
        ownerType: {
            type: String,
            enum: ['admin', 'vendor'],
            default: 'admin',
            index: true,
        },
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeVendor',
            default: null,
            index: true,
        },
        /** Vendor-submitted coupons require admin approval before they're redeemable */
        approvalStatus: {
            type: String,
            enum: ['approved', 'pending', 'rejected'],
            default: 'approved',
            index: true,
        },
        rejectionReason: { type: String, trim: true, default: '' },
        /** Snapshot of coupon fields as they stood at the moment of the last rejection,
         *  so admins can diff it against the resubmitted values. Cleared on approval. */
        rejectedSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
        reviewedAt: { type: Date, default: null },
        approvalHistory: {
            type: [{
                status: { type: String, enum: ['submitted', 'approved', 'rejected', 'resubmitted'] },
                reason: { type: String, trim: true, default: '' },
                changedAt: { type: Date, default: Date.now },
                changedBy: { type: actionPerformerSchema, default: null },
            }],
            default: [],
        },
        isDeleted: { type: Boolean, default: false, index: true },
        deletedAt: { type: Date, default: null },
        deletedBy: { type: actionPerformerSchema, default: null },
        createdBy: { type: actionPerformerSchema, default: null },
        updatedBy: { type: actionPerformerSchema, default: null },
    },
    {
        collection: 'bike_rent_coupons',
        timestamps: true,
    },
);

bikeCouponSchema.index(
    { code: 1 },
    { unique: true, partialFilterExpression: { isDeleted: false } },
);
bikeCouponSchema.index({ status: 1, validFrom: 1, validTill: 1 });
bikeCouponSchema.index({ isDeleted: 1, status: 1, createdAt: -1 });
bikeCouponSchema.index({ vendorId: 1, approvalStatus: 1 });

export const BikeCoupon = mongoose.models.BikeCoupon
    || mongoose.model('BikeCoupon', bikeCouponSchema, 'bike_rent_coupons');
