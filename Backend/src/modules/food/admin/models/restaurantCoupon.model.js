import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../../core/models/actionPerformer.schema.js';

const restaurantCouponSchema = new mongoose.Schema(
    {
        restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', required: true, index: true },
        restaurantName: { type: String, required: true },
        couponName: { type: String, required: true, trim: true },
        couponCode: { type: String, required: true, trim: true, uppercase: true, index: true },
        discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
        discountValue: { type: Number, required: true, min: 0 },
        maxDiscount: { type: Number, default: 0, min: 0 },
        minOrderAmount: { type: Number, default: 0, min: 0 },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        usageLimit: { type: Number, default: null, min: 0 },
        perUserLimit: { type: Number, default: 1, min: 1 },
        usedCount: { type: Number, default: 0, min: 0 },
        description: { type: String },
        termsAndConditions: { type: String, trim: true },
        applicableCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FoodCategory' }],
        applicableItems: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FoodItem' }],
        approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
        rejectionReason: { type: String, trim: true, default: '' },
        freeDelivery: { type: Boolean, default: false },
        requestedAt: { type: Date },
        approvedAt: { type: Date },
        rejectedAt: { type: Date },
        approvedBy: { type: actionPerformerSchema, default: null },
        rejectedBy: { type: actionPerformerSchema, default: null },
        statusHistory: {
            type: [{
                action: {
                    type: String,
                    enum: ['submitted', 'approved', 'rejected', 'reverted_to_pending'],
                    required: true,
                },
                note: { type: String, trim: true, default: '' },
                changedAt: { type: Date, default: Date.now },
                changedBy: { type: actionPerformerSchema, default: null },
            }],
            default: [],
        },
        previousApproved: {
            couponName: { type: String, default: undefined },
            couponCode: { type: String, default: undefined },
            discountType: { type: String, default: undefined },
            discountValue: { type: Number, default: undefined },
            maxDiscount: { type: Number, default: undefined },
            minOrderAmount: { type: Number, default: undefined },
            startDate: { type: Date, default: undefined },
            endDate: { type: Date, default: undefined },
            usageLimit: { type: Number, default: undefined },
            perUserLimit: { type: Number, default: undefined },
            description: { type: String, default: undefined },
            termsAndConditions: { type: String, default: undefined },
            applicableCategories: { type: [mongoose.Schema.Types.ObjectId], default: undefined },
            applicableItems: { type: [mongoose.Schema.Types.ObjectId], default: undefined },
            freeDelivery: { type: Boolean, default: undefined }
        }
    },
    { collection: 'food_restaurant_coupons', timestamps: true }
);

export const RestaurantCoupon = mongoose.model('RestaurantCoupon', restaurantCouponSchema, 'food_restaurant_coupons');
