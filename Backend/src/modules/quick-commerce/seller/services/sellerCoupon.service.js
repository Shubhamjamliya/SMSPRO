import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { SellerCoupon } from '../../models/sellerCoupon.model.js';
import { Seller } from '../models/seller.model.js';
import { validateAndNormalizeQuickCouponPayload } from '../../utils/coupon.helpers.js';

async function invalidateCouponCaches() {
    try {
        const { invalidateCache } = await import('../../../../middleware/cache.js');
        await invalidateCache('quick_coupons*');
        await invalidateCache('quick_offers*');
    } catch (err) {
        console.error('Failed to invalidate quick coupons cache:', err);
    }
}

function toSellerCouponDoc(normalized, seller) {
    return {
        sellerName: seller.shopName || seller.name || 'Unknown Seller',
        couponCode: normalized.code,
        discountType: normalized.discountType,
        discountValue: normalized.discountValue,
        minOrderAmount: normalized.minOrderValue,
        maxDiscount: normalized.maxDiscount ?? null,
        usageLimit: normalized.usageLimit ?? null,
        perUserLimit: normalized.perUserLimit,
        validFrom: normalized.validFrom,
        validTill: normalized.validTill,
        expiryDate: normalized.validTill,
        description: normalized.description,
        isFirstOrderOnly: normalized.isFirstOrderOnly,
        status: 'Pending',
        isActive: true,
    };
}

export async function listSellerCoupons(sellerId) {
    if (!sellerId || !mongoose.Types.ObjectId.isValid(String(sellerId))) {
        throw new ValidationError('Invalid seller id');
    }
    return SellerCoupon.find({
        sellerId: new mongoose.Types.ObjectId(String(sellerId)),
    }).sort({ createdAt: -1 }).lean();
}

export async function createSellerCoupon(sellerId, body) {
    if (!sellerId || !mongoose.Types.ObjectId.isValid(String(sellerId))) {
        throw new ValidationError('Invalid seller id');
    }
    const sid = new mongoose.Types.ObjectId(String(sellerId));

    let normalized;
    try {
        normalized = validateAndNormalizeQuickCouponPayload(body, { requireDates: true });
    } catch (err) {
        throw new ValidationError(err.message || 'Invalid coupon data');
    }

    const existing = await SellerCoupon.findOne({
        sellerId: sid,
        couponCode: normalized.code,
    }).select('_id').lean();
    if (existing) {
        throw new ValidationError('A coupon with this code already exists for your shop');
    }

    const seller = await Seller.findById(sid).select('name shopName').lean();
    if (!seller) throw new ValidationError('Seller not found');

    const doc = await SellerCoupon.create({
        sellerId: sid,
        ...toSellerCouponDoc(normalized, seller),
        usedCount: 0,
    });

    await invalidateCouponCaches();
    return doc.toObject();
}

export async function updateSellerCoupon(sellerId, couponId, body) {
    if (!sellerId || !mongoose.Types.ObjectId.isValid(String(sellerId))) {
        throw new ValidationError('Invalid seller id');
    }
    if (!couponId || !mongoose.Types.ObjectId.isValid(String(couponId))) {
        throw new ValidationError('Invalid coupon id');
    }
    const sid = new mongoose.Types.ObjectId(String(sellerId));
    const cid = new mongoose.Types.ObjectId(String(couponId));

    const existingCoupon = await SellerCoupon.findOne({ _id: cid, sellerId: sid }).lean();
    if (!existingCoupon) {
        throw new ValidationError('Coupon not found');
    }

    let normalized;
    try {
        normalized = validateAndNormalizeQuickCouponPayload(body, { requireDates: true });
    } catch (err) {
        throw new ValidationError(err.message || 'Invalid coupon data');
    }

    const duplicate = await SellerCoupon.findOne({
        sellerId: sid,
        couponCode: normalized.code,
        _id: { $ne: cid },
    }).select('_id').lean();
    if (duplicate) {
        throw new ValidationError('A coupon with this code already exists for your shop');
    }

    const seller = await Seller.findById(sid).select('name shopName').lean();
    if (!seller) throw new ValidationError('Seller not found');

    const updated = await SellerCoupon.findOneAndUpdate(
        { _id: cid, sellerId: sid },
        { $set: toSellerCouponDoc(normalized, seller) },
        { new: true },
    ).lean();

    await invalidateCouponCaches();
    return updated;
}

export async function deleteSellerCoupon(sellerId, couponId) {
    if (!sellerId || !mongoose.Types.ObjectId.isValid(String(sellerId))) {
        throw new ValidationError('Invalid seller id');
    }
    if (!couponId || !mongoose.Types.ObjectId.isValid(String(couponId))) {
        throw new ValidationError('Invalid coupon id');
    }
    const sid = new mongoose.Types.ObjectId(String(sellerId));
    const cid = new mongoose.Types.ObjectId(String(couponId));

    const result = await SellerCoupon.findOneAndDelete({ _id: cid, sellerId: sid }).lean();
    if (!result) {
        throw new ValidationError('Coupon not found');
    }

    await invalidateCouponCaches();
    return { id: cid };
}

const mapSellerShopDetails = (seller = null, fallbackName = '') => {
    if (!seller) {
        return {
            shopName: fallbackName || 'Unknown Shop',
            ownerName: '',
            phone: '',
            email: '',
            shopImage: '',
            zoneName: '',
            businessType: 'Quick Commerce',
            address: '',
        };
    }

    return {
        shopName: seller.shopName || seller.name || fallbackName || 'Unknown Shop',
        ownerName: seller.name || '',
        phone: seller.phoneLast10 || seller.phone || '',
        email: seller.email || '',
        shopImage: seller.shopInfo?.shopImage || '',
        zoneName: seller.shopInfo?.zoneName || '',
        businessType:
            seller.shopInfo?.businessType === 'Pharmacy'
                ? 'Quick Commerce'
                : seller.shopInfo?.businessType || 'Quick Commerce',
        address:
            seller.location?.formattedAddress ||
            seller.location?.address ||
            '',
    };
};

export async function listAdminSellerCoupons(params = {}) {
    const filter = {};
    const status = String(params.status || '').trim();
    if (status && status.toLowerCase() !== 'all') {
        const normalized =
            status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
        if (['Pending', 'Approved', 'Rejected'].includes(normalized)) {
            filter.status = normalized;
        }
    }

    const search = String(params.search || '').trim();
    if (search) {
        filter.$or = [
            { couponCode: { $regex: search, $options: 'i' } },
            { sellerName: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
        ];
    }

    const coupons = await SellerCoupon.find(filter).sort({ createdAt: -1 }).lean();
    const sellerIds = [
        ...new Set(
            coupons
                .map((c) => String(c.sellerId || ''))
                .filter((id) => mongoose.Types.ObjectId.isValid(id)),
        ),
    ];

    const sellers = sellerIds.length
        ? await Seller.find({ _id: { $in: sellerIds } })
              .select(
                  'name shopName email phone phoneLast10 location shopInfo',
              )
              .lean()
        : [];

    const sellerMap = new Map(sellers.map((s) => [String(s._id), s]));

    return coupons.map((coupon) => {
        const seller = sellerMap.get(String(coupon.sellerId || '')) || null;
        const shop = mapSellerShopDetails(seller, coupon.sellerName);
        return {
            ...coupon,
            id: coupon._id,
            type: 'seller',
            sellerName: shop.shopName,
            sellerImage: shop.shopImage,
            shop,
            seller: seller
                ? {
                      _id: seller._id,
                      id: seller._id,
                      ...shop,
                  }
                : null,
        };
    });
}

export async function updateAdminSellerCouponStatus(couponId, status) {
    if (!couponId || !mongoose.Types.ObjectId.isValid(String(couponId))) {
        throw new ValidationError('Invalid coupon id');
    }

    const nextStatus = String(status || '').trim();
    if (!['Pending', 'Approved', 'Rejected'].includes(nextStatus)) {
        throw new ValidationError('Status must be Pending, Approved, or Rejected');
    }

    const updated = await SellerCoupon.findByIdAndUpdate(
        couponId,
        {
            $set: {
                status: nextStatus,
                isActive: nextStatus === 'Approved',
            },
        },
        { new: true },
    ).lean();

    if (!updated) {
        throw new ValidationError('Coupon not found');
    }

    const seller = updated.sellerId
        ? await Seller.findById(updated.sellerId)
              .select('name shopName email phone phoneLast10 location shopInfo')
              .lean()
        : null;
    const shop = mapSellerShopDetails(seller, updated.sellerName);

    await invalidateCouponCaches();

    return {
        ...updated,
        id: updated._id,
        type: 'seller',
        sellerName: shop.shopName,
        sellerImage: shop.shopImage,
        shop,
        seller: seller
            ? {
                  _id: seller._id,
                  id: seller._id,
                  ...shop,
              }
            : null,
    };
}
