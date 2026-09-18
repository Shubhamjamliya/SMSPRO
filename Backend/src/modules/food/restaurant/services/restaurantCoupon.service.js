import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { RestaurantCoupon } from '../../admin/models/restaurantCoupon.model.js';
import { FoodRestaurant } from '../models/restaurant.model.js';

export async function listRestaurantCoupons(restaurantId) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(String(restaurantId))) {
        throw new ValidationError('Invalid restaurant id');
    }
    const filter = {
        restaurantId: new mongoose.Types.ObjectId(String(restaurantId))
    };
    return RestaurantCoupon.find(filter).sort({ createdAt: -1 }).lean();
}

export async function createRestaurantCoupon(restaurantId, body) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(String(restaurantId))) {
        throw new ValidationError('Invalid restaurant id');
    }
    const rid = new mongoose.Types.ObjectId(String(restaurantId));
    
    const couponName = String(body?.couponName || '').trim();
    if (!couponName) throw new ValidationError('Coupon name is required');

    const couponCode = String(body?.couponCode || '').trim().toUpperCase();
    if (!couponCode) throw new ValidationError('Coupon code is required');
    
    // Check if duplicate couponCode exists for this restaurant
    const existing = await RestaurantCoupon.findOne({
        restaurantId: rid,
        couponCode
    }).select('_id').lean();
    
    if (existing) {
        throw new ValidationError('A coupon with this code already exists for your restaurant');
    }

    const restaurant = await FoodRestaurant.findById(rid).select('restaurantName').lean();
    if (!restaurant) throw new ValidationError('Restaurant not found');

    const discountType = body?.discountType;
    if (!discountType || !['percentage', 'fixed'].includes(discountType)) {
        throw new ValidationError('Discount type must be percentage or fixed');
    }

    const discountValue = Number(body?.discountValue);
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
        throw new ValidationError('Discount value must be greater than 0');
    }

    const maxDiscount = Number(body?.maxDiscount) || 0;

    const startDate = body?.startDate ? new Date(body.startDate) : null;
    if (!startDate || Number.isNaN(startDate.getTime())) {
        throw new ValidationError('A valid start date is required');
    }

    const endDate = body?.endDate || body?.expiryDate ? new Date(body.endDate || body.expiryDate) : null;
    if (!endDate || Number.isNaN(endDate.getTime())) {
        throw new ValidationError('A valid end date (expiry date) is required');
    }

    const doc = await RestaurantCoupon.create({
        restaurantId: rid,
        restaurantName: restaurant.restaurantName || 'Unknown Restaurant',
        couponName,
        couponCode,
        discountType,
        discountValue,
        maxDiscount,
        minOrderAmount: Number(body?.minOrderAmount) || 0,
        startDate,
        endDate,
        usageLimit: body?.usageLimit ? Number(body.usageLimit) : null,
        perUserLimit: body?.perUserLimit ? Number(body.perUserLimit) : 1,
        description: String(body?.description || '').trim(),
        termsAndConditions: String(body?.termsAndConditions || '').trim(),
        applicableCategories: Array.isArray(body?.applicableCategories) ? body.applicableCategories.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(String(id))) : [],
        applicableItems: Array.isArray(body?.applicableItems) ? body.applicableItems.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(String(id))) : [],
        approvalStatus: 'pending',
        requestedAt: new Date(),
        freeDelivery: Boolean(body?.freeDelivery),
        statusHistory: [{
            action: 'submitted',
            note: 'Coupon submitted for admin approval',
            changedAt: new Date(),
            changedBy: null,
        }],
    });

    try {
        const { invalidateCache } = await import('../../../../middleware/cache.js');
        await invalidateCache('offers*');
    } catch (err) {
        console.error('Failed to invalidate offers cache on create:', err);
    }

    return doc.toObject();
}

export async function updateRestaurantCoupon(restaurantId, couponId, body) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(String(restaurantId))) {
        throw new ValidationError('Invalid restaurant id');
    }
    if (!couponId || !mongoose.Types.ObjectId.isValid(String(couponId))) {
        throw new ValidationError('Invalid coupon id');
    }
    const rid = new mongoose.Types.ObjectId(String(restaurantId));
    const cid = new mongoose.Types.ObjectId(String(couponId));

    const existingCoupon = await RestaurantCoupon.findOne({ _id: cid, restaurantId: rid }).lean();
    if (!existingCoupon) {
        throw new ValidationError('Coupon not found');
    }

    const couponName = String(body?.couponName || existingCoupon.couponName || '').trim();
    if (!couponName) throw new ValidationError('Coupon name is required');

    const couponCode = String(body?.couponCode || '').trim().toUpperCase();
    if (!couponCode) throw new ValidationError('Coupon code is required');

    // Check duplicate excluding current
    const duplicate = await RestaurantCoupon.findOne({
        restaurantId: rid,
        couponCode,
        _id: { $ne: cid }
    }).select('_id').lean();

    if (duplicate) {
        throw new ValidationError('A coupon with this code already exists for your restaurant');
    }

    const discountType = body?.discountType;
    if (!discountType || !['percentage', 'fixed'].includes(discountType)) {
        throw new ValidationError('Discount type must be percentage or fixed');
    }

    const discountValue = Number(body?.discountValue);
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
        throw new ValidationError('Discount value must be greater than 0');
    }

    const maxDiscount = Number(body?.maxDiscount) || 0;

    const startDate = body?.startDate ? new Date(body.startDate) : null;
    if (!startDate || Number.isNaN(startDate.getTime())) {
        throw new ValidationError('A valid start date is required');
    }

    const endDate = body?.endDate || body?.expiryDate ? new Date(body.endDate || body.expiryDate) : null;
    if (!endDate || Number.isNaN(endDate.getTime())) {
        throw new ValidationError('A valid end date is required');
    }

    const updatePayload = {
        couponName,
        couponCode,
        discountType,
        discountValue,
        maxDiscount,
        minOrderAmount: Number(body?.minOrderAmount) || 0,
        startDate,
        endDate,
        usageLimit: body?.usageLimit ? Number(body.usageLimit) : null,
        perUserLimit: body?.perUserLimit ? Number(body.perUserLimit) : 1,
        description: String(body?.description || '').trim(),
        termsAndConditions: String(body?.termsAndConditions || '').trim(),
        applicableCategories: Array.isArray(body?.applicableCategories) ? body.applicableCategories.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(String(id))) : [],
        applicableItems: Array.isArray(body?.applicableItems) ? body.applicableItems.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(String(id))) : [],
        freeDelivery: Boolean(body?.freeDelivery)
    };

    // If the coupon was already approved or rejected, changing any field resets it to pending
    // We store the previously approved values into `previousApproved`
    const isCurrentlyApprovedOrRejected = existingCoupon.approvalStatus === 'approved' || existingCoupon.approvalStatus === 'rejected';
    
    if (isCurrentlyApprovedOrRejected) {
        updatePayload.approvalStatus = 'pending';
        updatePayload.requestedAt = new Date();
        updatePayload.rejectionReason = '';
        updatePayload.approvedAt = null;
        updatePayload.rejectedAt = null;
        updatePayload.previousApproved = {
            couponName: existingCoupon.couponName,
            couponCode: existingCoupon.couponCode,
            discountType: existingCoupon.discountType,
            discountValue: existingCoupon.discountValue,
            maxDiscount: existingCoupon.maxDiscount,
            minOrderAmount: existingCoupon.minOrderAmount,
            startDate: existingCoupon.startDate,
            endDate: existingCoupon.endDate || existingCoupon.expiryDate,
            usageLimit: existingCoupon.usageLimit,
            perUserLimit: existingCoupon.perUserLimit,
            description: existingCoupon.description,
            termsAndConditions: existingCoupon.termsAndConditions,
            applicableCategories: existingCoupon.applicableCategories,
            applicableItems: existingCoupon.applicableItems,
            freeDelivery: existingCoupon.freeDelivery
        };
    }

    const updateQuery = { $set: updatePayload };
    if (isCurrentlyApprovedOrRejected) {
        updateQuery.$push = {
            statusHistory: {
                action: 'submitted',
                note: 'Coupon resubmitted for admin review',
                changedAt: new Date(),
                changedBy: null,
            },
        };
    }

    const updated = await RestaurantCoupon.findOneAndUpdate(
        { _id: cid, restaurantId: rid },
        updateQuery,
        { new: true }
    ).lean();

    try {
        const { invalidateCache } = await import('../../../../middleware/cache.js');
        await invalidateCache('offers*');
    } catch (err) {
        console.error('Failed to invalidate offers cache on update:', err);
    }

    return updated;
}

export async function deleteRestaurantCoupon(restaurantId, couponId) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(String(restaurantId))) {
        throw new ValidationError('Invalid restaurant id');
    }
    if (!couponId || !mongoose.Types.ObjectId.isValid(String(couponId))) {
        throw new ValidationError('Invalid coupon id');
    }
    const rid = new mongoose.Types.ObjectId(String(restaurantId));
    const cid = new mongoose.Types.ObjectId(String(couponId));

    const result = await RestaurantCoupon.findOneAndDelete({ _id: cid, restaurantId: rid }).lean();
    if (!result) {
        throw new ValidationError('Coupon not found');
    }

    try {
        const { invalidateCache } = await import('../../../../middleware/cache.js');
        await invalidateCache('offers*');
    } catch (err) {
        console.error('Failed to invalidate offers cache on delete:', err);
    }

    return { id: cid };
}
