const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Calendar YYYY-MM-DD in Asia/Kolkata. */
export const formatIstCalendarDate = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

const partsToIstMidnightUtc = (y, m, d) =>
  new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - IST_OFFSET_MS);

const partsToIstEndOfDayUtc = (y, m, d) =>
  new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - IST_OFFSET_MS + 24 * 60 * 60 * 1000 - 1);

/** Start of "today" in IST as a Date (UTC instant). */
export const startOfDay = (date = new Date()) => {
  const key = formatIstCalendarDate(date);
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) {
    const fallback = new Date(date);
    fallback.setHours(0, 0, 0, 0);
    return fallback;
  }
  return partsToIstMidnightUtc(y, m, d);
};

export const endOfDay = (date = new Date()) => {
  const key = formatIstCalendarDate(date);
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) {
    const fallback = new Date(date);
    fallback.setHours(23, 59, 59, 999);
    return fallback;
  }
  return partsToIstEndOfDayUtc(y, m, d);
};

/**
 * Parse coupon date input. YYYY-MM-DD is treated as an IST calendar date
 * (avoids the UTC-midnight → previous-day shift in India).
 */
export const normalizeCouponValidFrom = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return partsToIstMidnightUtc(Number(match[1]), Number(match[2]), Number(match[3]));
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return startOfDay(parsed);
};

export const normalizeCouponValidTill = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return partsToIstEndOfDayUtc(Number(match[1]), Number(match[2]), Number(match[3]));
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return endOfDay(parsed);
};

export const isQuickCouponExpired = (coupon, now = new Date()) => {
  const till = coupon?.validTill || coupon?.expiryDate;
  if (!till) return false;
  return now.getTime() > new Date(till).getTime();
};

export const isQuickCouponNotStarted = (coupon, now = new Date()) => {
  const from = coupon?.validFrom;
  if (!from) return false;
  return now.getTime() < new Date(from).getTime();
};

export const isQuickCouponCurrentlyValid = (coupon, now = new Date()) => {
  if (coupon?.isActive === false) return false;
  const status = String(coupon?.status || '').trim().toLowerCase();
  if (status === 'inactive' || status === 'expired') return false;
  if (isQuickCouponNotStarted(coupon, now)) return false;
  if (isQuickCouponExpired(coupon, now)) return false;
  return true;
};

export const getQuickCouponEffectiveStatus = (coupon, now = new Date()) => {
  if (coupon?.isActive === false || String(coupon?.status || '').toLowerCase() === 'inactive') {
    return 'inactive';
  }
  if (String(coupon?.status || '').toLowerCase() === 'expired' || isQuickCouponExpired(coupon, now)) {
    return 'expired';
  }
  if (isQuickCouponNotStarted(coupon, now)) {
    return 'scheduled';
  }
  if (isQuickCouponCurrentlyValid(coupon, now)) {
    return 'active';
  }
  return 'inactive';
};

export const buildQuickCouponDateQuery = (now = new Date()) => {
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  return {
    $and: [
      {
        $or: [
          { validFrom: null },
          { validFrom: { $exists: false } },
          { validFrom: { $lte: todayEnd } },
        ],
      },
      {
        $or: [
          { validTill: null },
          { validTill: { $exists: false } },
          { validTill: { $gte: todayStart } },
        ],
      },
    ],
  };
};

export const enrichQuickCoupon = (coupon, now = new Date()) => ({
  ...coupon,
  validFromDate: formatIstCalendarDate(coupon?.validFrom),
  validTillDate: formatIstCalendarDate(coupon?.validTill || coupon?.expiryDate),
  effectiveStatus: getQuickCouponEffectiveStatus(coupon, now),
  isEffectivelyActive: isQuickCouponCurrentlyValid(coupon, now),
});

/**
 * Shared create/update payload validation for admin + seller QC coupons.
 * Same-day start/end is allowed. couponType/strategy is intentionally ignored.
 */
export const validateAndNormalizeQuickCouponPayload = (data = {}, { requireDates = true } = {}) => {
  const code = String(data.code || data.couponCode || '').trim().toUpperCase();
  if (!code) throw new Error('Coupon code is required');
  if (code.length < 3 || code.length > 32) {
    throw new Error('Coupon code must be between 3 and 32 characters');
  }
  if (!/^[A-Z0-9_-]+$/.test(code)) {
    throw new Error('Coupon code can only contain letters, numbers, underscore and hyphen');
  }

  const discountType = String(data.discountType || 'percentage').trim().toLowerCase();
  if (!['percentage', 'fixed'].includes(discountType)) {
    throw new Error('Discount type must be percentage or fixed');
  }

  const discountValue = Number(data.discountValue);
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    throw new Error('Discount value must be greater than 0');
  }
  if (discountType === 'percentage' && discountValue > 100) {
    throw new Error('Percentage discount cannot exceed 100');
  }

  const minOrderValue = Number(data.minOrderValue ?? data.minOrderAmount ?? 0);
  if (!Number.isFinite(minOrderValue) || minOrderValue < 0) {
    throw new Error('Minimum order value cannot be negative');
  }

  let maxDiscount;
  if (data.maxDiscount !== undefined && data.maxDiscount !== null && data.maxDiscount !== '') {
    maxDiscount = Number(data.maxDiscount);
    if (!Number.isFinite(maxDiscount) || maxDiscount < 0) {
      throw new Error('Max discount cannot be negative');
    }
  }

  let usageLimit;
  if (data.usageLimit !== undefined && data.usageLimit !== null && data.usageLimit !== '') {
    usageLimit = Number(data.usageLimit);
    if (!Number.isFinite(usageLimit) || usageLimit < 1) {
      throw new Error('Usage limit must be at least 1');
    }
  }

  const perUserLimitRaw = data.perUserLimit !== undefined && data.perUserLimit !== null && data.perUserLimit !== ''
    ? Number(data.perUserLimit)
    : 1;
  if (!Number.isFinite(perUserLimitRaw) || perUserLimitRaw < 1) {
    throw new Error('Per user limit must be at least 1');
  }

  const validFrom = normalizeCouponValidFrom(data.validFrom);
  const validTill = normalizeCouponValidTill(data.validTill || data.expiryDate);

  if (requireDates) {
    if (!validFrom) throw new Error('Start date is required');
    if (!validTill) throw new Error('End date is required');
  }

  if (validFrom && validTill && validFrom.getTime() > validTill.getTime()) {
    throw new Error('Start date cannot be after end date');
  }

  const description = String(data.description || '').trim();
  if (!description) throw new Error('Description is required');
  if (description.length > 500) throw new Error('Description cannot exceed 500 characters');

  return {
    code,
    discountType,
    discountValue,
    minOrderValue,
    maxDiscount,
    usageLimit,
    perUserLimit: perUserLimitRaw,
    validFrom,
    validTill,
    description,
    isFirstOrderOnly: Boolean(data.isFirstOrderOnly),
  };
};

export const calculateQuickCouponDiscount = (coupon, cartTotal) => {
  const total = Math.max(0, Number(cartTotal || 0));
  const discountType = String(coupon?.discountType || 'fixed').toLowerCase();
  const discountValue = Number(coupon?.discountValue || coupon?.discount || 0);
  const maxDiscount = Number(coupon?.maxDiscount || coupon?.maxDiscountValue || 0);

  let discountAmount = 0;
  if (discountType === 'percent' || discountType === 'percentage') {
    discountAmount = Math.round((total * discountValue) / 100);
    if (maxDiscount > 0) discountAmount = Math.min(discountAmount, maxDiscount);
  } else {
    discountAmount = discountValue;
  }

  return Math.max(0, Math.min(discountAmount, total));
};

/** Subtotal of cart lines belonging to one seller (seller coupons only). */
export const getSellerEligibleCartTotal = (items = [], sellerId) => {
  if (!sellerId) return 0;
  const sid = String(sellerId);
  return (Array.isArray(items) ? items : []).reduce((sum, item) => {
    const itemSeller = String(
      item?.sellerId?._id || item?.sellerId || item?.seller?._id || item?.quickStoreId || '',
    );
    if (!itemSeller || itemSeller !== sid) return sum;
    const line =
      Number(item.price || item.salePrice || 0) * Number(item.quantity || 1);
    return sum + (Number.isFinite(line) ? line : 0);
  }, 0);
};

export const resolveCartSellerId = (items = []) => {
  const ids = [
    ...new Set(
      (Array.isArray(items) ? items : [])
        .map((item) =>
          String(
            item?.sellerId?._id || item?.sellerId || item?.seller?._id || item?.quickStoreId || '',
          ).trim(),
        )
        .filter(Boolean),
    ),
  ];
  if (ids.length === 1) return ids[0];
  return null;
};

export const mapSellerCouponForApply = (sellerCoupon) => {
  if (!sellerCoupon) return null;
  return {
    ...sellerCoupon,
    _id: sellerCoupon._id,
    id: sellerCoupon._id,
    code: sellerCoupon.couponCode,
    discountType: sellerCoupon.discountType,
    discountValue: Number(sellerCoupon.discountValue || 0),
    maxDiscount: Number(sellerCoupon.maxDiscount || 0),
    minOrderValue: sellerCoupon.minOrderAmount,
    validFrom: sellerCoupon.validFrom || null,
    validTill: sellerCoupon.validTill || sellerCoupon.expiryDate,
    expiryDate: sellerCoupon.expiryDate || sellerCoupon.validTill,
    isSellerCoupon: true,
    isActive: sellerCoupon.isActive !== false,
    status: 'active',
    sellerId: sellerCoupon.sellerId,
  };
};

export const findActiveSellerCoupon = async ({ code, sellerId }) => {
  if (!sellerId || !code) return null;
  const mongoose = (await import('mongoose')).default;
  if (!mongoose.Types.ObjectId.isValid(sellerId)) return null;
  const { SellerCoupon } = await import('../models/sellerCoupon.model.js');
  const todayStart = startOfDay(new Date());
  const sellerCoupon = await SellerCoupon.findOne({
    sellerId: new mongoose.Types.ObjectId(sellerId),
    couponCode: String(code).toUpperCase().trim(),
    status: 'Approved',
    isActive: { $ne: false },
    $and: [
      {
        $or: [
          { validFrom: null },
          { validFrom: { $exists: false } },
          { validFrom: { $lte: endOfDay(new Date()) } },
        ],
      },
      {
        $or: [
          { validTill: { $gte: todayStart } },
          { validTill: { $exists: false }, expiryDate: { $gte: todayStart } },
        ],
      },
    ],
  }).lean();
  return mapSellerCouponForApply(sellerCoupon);
};

export const assertQuickCouponApplicable = async (
  coupon,
  { cartTotal = 0, userId = null, items = [], sellerId = null } = {},
) => {
  if (!coupon) {
    const err = new Error('Coupon not found or expired');
    err.statusCode = 404;
    throw err;
  }

  if (!isQuickCouponCurrentlyValid(coupon)) {
    const err = new Error(
      isQuickCouponExpired(coupon)
        ? 'This coupon has expired'
        : isQuickCouponNotStarted(coupon)
          ? 'This coupon is not active yet'
          : 'This coupon is not active',
    );
    err.statusCode = 400;
    throw err;
  }

  const isSellerCoupon = coupon.isSellerCoupon === true;
  const couponSellerId = String(coupon.sellerId || sellerId || '').trim();

  let eligibleTotal = Number(cartTotal || 0);
  if (isSellerCoupon) {
    if (!couponSellerId) {
      const err = new Error('Seller coupon is not valid for this cart');
      err.statusCode = 400;
      throw err;
    }
    if (Array.isArray(items) && items.length > 0) {
      eligibleTotal = getSellerEligibleCartTotal(items, couponSellerId);
    }
    if (eligibleTotal <= 0) {
      const err = new Error('This coupon is only valid on products from this seller');
      err.statusCode = 400;
      throw err;
    }
  }

  const minOrder = Number(coupon.minOrderValue || coupon.minOrderAmount || coupon.minOrder || 0);
  if (minOrder > 0 && eligibleTotal < minOrder) {
    const err = new Error(`Minimum order value of ₹${minOrder} required for this coupon`);
    err.statusCode = 400;
    throw err;
  }

  const usageLimit = Number(coupon.usageLimit || 0);
  const usedCount = Number(coupon.usedCount || 0);
  // Soft-reserve: non-cancelled orders count toward global limit until cancelled.
  // usedCount itself only rises on deliver (admin metric + hard redeem).
  const { countActiveQuickCouponOrders } = await import(
    '../services/quickCouponUsage.service.js'
  );
  if (usageLimit > 0) {
    const activeOrders = await countActiveQuickCouponOrders({
      code: coupon.code || coupon.couponCode,
      sellerId: isSellerCoupon ? couponSellerId : null,
      source: isSellerCoupon ? 'seller' : 'admin',
    });
    const reserved = Math.max(usedCount, activeOrders);
    if (reserved >= usageLimit) {
      const err = new Error('This coupon has reached its usage limit');
      err.statusCode = 400;
      throw err;
    }
  }

  const perUserLimit = Number(coupon.perUserLimit || 0);
  if (perUserLimit > 0 && userId) {
    const userUses = await countActiveQuickCouponOrders({
      code: coupon.code || coupon.couponCode,
      userId,
      sellerId: isSellerCoupon ? couponSellerId : null,
      source: isSellerCoupon ? 'seller' : 'admin',
    });
    if (userUses >= perUserLimit) {
      const err = new Error('You have already used this coupon the maximum number of times');
      err.statusCode = 400;
      throw err;
    }
  }

  if (coupon.isFirstOrderOnly && userId) {
    const { QuickOrder } = await import('../models/order.model.js');
    const prior = await QuickOrder.countDocuments({
      userId,
      orderType: { $in: ['quick', 'mixed'] },
      orderStatus: {
        $nin: [
          'cancelled',
          'cancelled_by_user',
          'cancelled_by_restaurant',
          'cancelled_by_admin',
          'payment_failed',
          'failed',
        ],
      },
    });
    if (prior > 0) {
      const err = new Error('This coupon is valid only for your first order');
      err.statusCode = 400;
      throw err;
    }
  }

  return {
    code: String(coupon.code || coupon.couponCode || '').toUpperCase(),
    description: coupon.description || '',
    discountType: coupon.discountType,
    discountValue: Number(coupon.discountValue || 0),
    maxDiscount: Number(coupon.maxDiscount || coupon.maxDiscountValue || 0),
    minOrderValue: Number(coupon.minOrderValue || coupon.minOrderAmount || coupon.minOrder || 0),
    discountAmount: calculateQuickCouponDiscount(coupon, eligibleTotal),
    isFirstOrderOnly: Boolean(coupon.isFirstOrderOnly),
    eligibleTotal,
    couponRefId: String(coupon._id || coupon.id || ''),
    couponSource: isSellerCoupon ? 'seller' : 'admin',
    sellerId: isSellerCoupon ? couponSellerId : '',
  };
};
