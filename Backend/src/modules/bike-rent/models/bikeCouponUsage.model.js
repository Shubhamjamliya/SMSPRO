import mongoose from 'mongoose';

const bikeCouponUsageSchema = new mongoose.Schema(
    {
        couponId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeCoupon',
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeBooking',
            required: true,
            index: true,
        },
        couponCode: {
            type: String,
            default: '',
            trim: true,
            uppercase: true,
        },
        discountAmount: {
            type: Number,
            default: 0,
            min: 0,
        },
        rentalDiscount: {
            type: Number,
            default: 0,
            min: 0,
        },
        depositDiscount: {
            type: Number,
            default: 0,
            min: 0,
        },
        usedAt: {
            type: Date,
            default: Date.now,
            index: true,
        },
        releasedAt: {
            type: Date,
            default: null,
        },
        status: {
            type: String,
            enum: ['consumed', 'released'],
            default: 'consumed',
            index: true,
        },
    },
    {
        collection: 'bike_rent_coupon_usages',
        timestamps: true,
    },
);

bikeCouponUsageSchema.index(
    { bookingId: 1, status: 1 },
    { unique: true, partialFilterExpression: { status: 'consumed' } },
);
bikeCouponUsageSchema.index({ couponId: 1, userId: 1, status: 1 });

export const BikeCouponUsage = mongoose.models.BikeCouponUsage
    || mongoose.model('BikeCouponUsage', bikeCouponUsageSchema, 'bike_rent_coupon_usages');
