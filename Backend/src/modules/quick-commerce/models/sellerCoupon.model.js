import mongoose from 'mongoose';

const sellerCouponSchema = new mongoose.Schema(
    {
        sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true, index: true },
        sellerName: { type: String, required: true },
        couponCode: { type: String, required: true, trim: true, uppercase: true, index: true },
        discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
        discountValue: { type: Number, required: true, min: 0 },
        minOrderAmount: { type: Number, default: 0, min: 0 },
        maxDiscount: { type: Number, default: null, min: 0 },
        usageLimit: { type: Number, default: null, min: 0 },
        perUserLimit: { type: Number, default: 1, min: 1 },
        usedCount: { type: Number, default: 0, min: 0 },
        validFrom: { type: Date, default: null },
        validTill: { type: Date, default: null },
        // Kept in sync with validTill for older readers/approval UIs
        expiryDate: { type: Date, required: true },
        description: { type: String, default: '', trim: true },
        isFirstOrderOnly: { type: Boolean, default: false },
        status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending', index: true },
        isActive: { type: Boolean, default: true }
    },
    { collection: 'quick_seller_coupons', timestamps: true }
);

sellerCouponSchema.index({ sellerId: 1, couponCode: 1 }, { unique: true });

export const SellerCoupon = mongoose.model('SellerCoupon', sellerCouponSchema, 'quick_seller_coupons');
