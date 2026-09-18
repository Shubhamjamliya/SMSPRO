/**
 * Food coupon validation + atomic consume/release.
 * Used by calculateOrder / createOrder / payment / cancel paths.
 */
import mongoose from 'mongoose';
import { FoodOffer } from '../../admin/models/offer.model.js';
import { FoodOfferUsage } from '../../admin/models/offerUsage.model.js';
import { RestaurantCoupon } from '../../admin/models/restaurantCoupon.model.js';
import { FoodItem } from '../../admin/models/food.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodOrder } from '../models/order.model.js';

const CANCELLED_ORDER_STATUSES = [
  'cancelled_by_user',
  'cancelled_by_admin',
  'cancelled_by_restaurant',
  'cancelled',
  'failed',
  'payment_failed',
];

async function resolveRestaurantMongoId(restaurantId) {
  if (!restaurantId) return null;
  if (mongoose.Types.ObjectId.isValid(restaurantId)) {
    return String(restaurantId);
  }
  const rest = await FoodRestaurant.findOne({ restaurantId: String(restaurantId) })
    .select('_id')
    .lean();
  return rest?._id ? String(rest._id) : null;
}

async function countSuccessfulPriorOrders(userId) {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return 0;
  return FoodOrder.countDocuments({
    userId: new mongoose.Types.ObjectId(userId),
    orderStatus: { $nin: CANCELLED_ORDER_STATUSES },
    'payment.status': { $in: ['paid', 'cod_pending'] },
  });
}

async function countRestaurantCouponUsesByUser({ userId, couponCode, restaurantMongoId }) {
  if (!userId || !couponCode) return 0;
  const filter = {
    userId: new mongoose.Types.ObjectId(userId),
    'pricing.couponCode': String(couponCode).trim().toUpperCase(),
    'pricing.couponConsumed': true,
    orderStatus: { $nin: CANCELLED_ORDER_STATUSES },
  };
  if (restaurantMongoId && mongoose.Types.ObjectId.isValid(restaurantMongoId)) {
    filter.restaurantId = new mongoose.Types.ObjectId(restaurantMongoId);
  }
  return FoodOrder.countDocuments(filter);
}

async function buildEligibleSubtotal({ items, applicableItems, applicableCategories }) {
  const foodItems = (items || []).filter((item) => item.type === 'food' || !item.type);
  const itemIds = [...new Set(
    foodItems
      .map((item) => String(item.itemId || ''))
      .filter((id) => mongoose.Types.ObjectId.isValid(id)),
  )];

  const hasItemFilter = Array.isArray(applicableItems) && applicableItems.length > 0;
  const hasCategoryFilter = Array.isArray(applicableCategories) && applicableCategories.length > 0;
  if (!hasItemFilter && !hasCategoryFilter) {
    return foodItems.reduce(
      (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1),
      0,
    );
  }

  const docs = itemIds.length
    ? await FoodItem.find({ _id: { $in: itemIds.map((id) => new mongoose.Types.ObjectId(id)) } })
      .select('_id categoryId')
      .lean()
    : [];
  const docMap = new Map(docs.map((d) => [String(d._id), d]));
  const allowedItems = new Set((applicableItems || []).map((id) => String(id)));
  const allowedCategories = new Set((applicableCategories || []).map((id) => String(id)));

  return foodItems.reduce((sum, it) => {
    const id = String(it.itemId || '');
    const doc = docMap.get(id);
    if (!doc) return sum;
    const itemOk = !hasItemFilter || allowedItems.has(id);
    const catOk = !hasCategoryFilter || allowedCategories.has(String(doc.categoryId || ''));
    if (!(itemOk && catOk)) return sum;
    return sum + (Number(it.price) || 0) * (Number(it.quantity) || 1);
  }, 0);
}

function computeDiscountAmount({ discountType, discountValue, maxDiscount, eligibleSubtotal }) {
  const base = Math.max(0, Number(eligibleSubtotal) || 0);
  if (base <= 0) return 0;
  const type = String(discountType || '').toLowerCase();
  if (type === 'percentage' || type === 'percent') {
    const pct = Math.max(0, Number(discountValue) || 0);
    const raw = Math.floor(base * (pct / 100));
    const cap = Number(maxDiscount) > 0 ? Number(maxDiscount) : Infinity;
    return Math.max(0, Math.min(base, Math.min(raw, cap)));
  }
  return Math.max(0, Math.min(base, Math.floor(Number(discountValue) || 0)));
}

/**
 * Authoritative coupon validation + discount computation.
 */
export async function computeCouponDiscount({
  couponCode,
  subtotal,
  restaurantId,
  userId,
  items = [],
}) {
  const codeRaw = couponCode ? String(couponCode).trim().toUpperCase() : '';
  if (!codeRaw) {
    return {
      discount: 0,
      couponDiscount: 0,
      itemDiscount: 0,
      appliedCoupon: null,
      couponCode: null,
      freeDelivery: false,
      couponSource: null,
      couponRefId: null,
    };
  }

  const now = new Date();
  const restaurantMongoId = await resolveRestaurantMongoId(restaurantId);
  const offer = await FoodOffer.findOne({ couponCode: codeRaw }).lean();

  if (!offer) {
    const restCoupon = restaurantMongoId
      ? await RestaurantCoupon.findOne({
        couponCode: codeRaw,
        approvalStatus: 'approved',
        restaurantId: new mongoose.Types.ObjectId(restaurantMongoId),
      }).lean()
      : null;

    if (!restCoupon) {
      return {
        discount: 0,
        couponDiscount: 0,
        itemDiscount: 0,
        appliedCoupon: null,
        couponCode: codeRaw,
        freeDelivery: false,
        couponSource: null,
        couponRefId: null,
      };
    }

    const startOk = !restCoupon.startDate || now >= new Date(restCoupon.startDate);
    const endOk = !restCoupon.endDate || now < new Date(restCoupon.endDate);
    const minOk = Number(subtotal) >= (Number(restCoupon.minOrderAmount) || 0);
    const usageOk = !(
      Number(restCoupon.usageLimit) > 0 &&
      Number(restCoupon.usedCount || 0) >= Number(restCoupon.usageLimit)
    );

    let perUserOk = true;
    if (userId && Number(restCoupon.perUserLimit) > 0) {
      const used = await countRestaurantCouponUsesByUser({
        userId,
        couponCode: codeRaw,
        restaurantMongoId,
      });
      if (used >= Number(restCoupon.perUserLimit)) perUserOk = false;
    }

    const eligibleSubtotal = await buildEligibleSubtotal({
      items,
      applicableItems: restCoupon.applicableItems,
      applicableCategories: restCoupon.applicableCategories,
    });
    const restrictionActive =
      (Array.isArray(restCoupon.applicableItems) && restCoupon.applicableItems.length > 0) ||
      (Array.isArray(restCoupon.applicableCategories) && restCoupon.applicableCategories.length > 0);
    const eligibleOk = !restrictionActive || eligibleSubtotal > 0;

    if (!(startOk && endOk && minOk && usageOk && perUserOk && eligibleOk)) {
      return {
        discount: 0,
        couponDiscount: 0,
        itemDiscount: 0,
        appliedCoupon: null,
        couponCode: codeRaw,
        freeDelivery: false,
        couponSource: null,
        couponRefId: null,
      };
    }

    const discount = computeDiscountAmount({
      discountType: restCoupon.discountType,
      discountValue: restCoupon.discountValue,
      maxDiscount: restCoupon.maxDiscount,
      eligibleSubtotal: restrictionActive ? eligibleSubtotal : subtotal,
    });
    const freeDelivery = Boolean(restCoupon.freeDelivery);
    if (discount <= 0 && !freeDelivery) {
      return {
        discount: 0,
        couponDiscount: 0,
        itemDiscount: 0,
        appliedCoupon: null,
        couponCode: codeRaw,
        freeDelivery: false,
        couponSource: null,
        couponRefId: null,
      };
    }

    return {
      discount,
      couponDiscount: discount,
      itemDiscount: 0,
      appliedCoupon: { code: codeRaw, discount, freeDelivery },
      couponCode: codeRaw,
      freeDelivery,
      couponSource: 'restaurant',
      couponRefId: String(restCoupon._id),
    };
  }

  const statusOk = offer.status === 'active';
  const startOk = !offer.startDate || now >= new Date(offer.startDate);
  const endOk = !offer.endDate || now < new Date(offer.endDate);
  const scopeOk =
    offer.restaurantScope !== 'selected' ||
    (restaurantMongoId && String(offer.restaurantId || '') === String(restaurantMongoId));
  const minOk = Number(subtotal) >= (Number(offer.minOrderValue) || 0);
  const usageOk = !(
    Number(offer.usageLimit) > 0 &&
    Number(offer.usedCount || 0) >= Number(offer.usageLimit)
  );

  let perUserOk = true;
  if (userId && Number(offer.perUserLimit) > 0) {
    const usage = await FoodOfferUsage.findOne({
      offerId: offer._id,
      userId: new mongoose.Types.ObjectId(userId),
    }).lean();
    if (usage && Number(usage.count) >= Number(offer.perUserLimit)) perUserOk = false;
  }

  let firstOrderOk = true;
  if (userId && (offer.customerScope === 'first-time' || offer.isFirstOrderOnly === true)) {
    const prior = await countSuccessfulPriorOrders(userId);
    firstOrderOk = prior === 0;
  }

  const allowed = statusOk && startOk && endOk && scopeOk && minOk && usageOk && perUserOk && firstOrderOk;
  if (!allowed) {
    return {
      discount: 0,
      couponDiscount: 0,
      itemDiscount: 0,
      appliedCoupon: null,
      couponCode: codeRaw,
      freeDelivery: false,
      couponSource: null,
      couponRefId: null,
    };
  }

  const discount = computeDiscountAmount({
    discountType: offer.discountType === 'flat-price' ? 'fixed' : offer.discountType,
    discountValue: offer.discountValue,
    maxDiscount: offer.maxDiscount,
    eligibleSubtotal: subtotal,
  });
  const freeDelivery = Boolean(offer.freeDelivery);
  if (discount <= 0 && !freeDelivery) {
    return {
      discount: 0,
      couponDiscount: 0,
      itemDiscount: 0,
      appliedCoupon: null,
      couponCode: codeRaw,
      freeDelivery: false,
      couponSource: null,
      couponRefId: null,
    };
  }

  return {
    discount,
    couponDiscount: discount,
    itemDiscount: 0,
    appliedCoupon: { code: codeRaw, discount, freeDelivery },
    couponCode: codeRaw,
    freeDelivery,
    couponSource: 'admin',
    couponRefId: String(offer._id),
  };
}

async function incrementAdminOfferUsage({ offerId, userId, usageLimit, perUserLimit }) {
  const offerFilter = {
    _id: offerId,
    $or: [
      { usageLimit: null },
      { usageLimit: { $exists: false } },
      { usageLimit: { $lte: 0 } },
      { $expr: { $lt: ['$usedCount', '$usageLimit'] } },
    ],
  };
  const offerUpdate = await FoodOffer.updateOne(offerFilter, { $inc: { usedCount: 1 } });
  if (!offerUpdate.matchedCount) {
    return { ok: false, reason: 'GLOBAL_LIMIT' };
  }

  if (userId && Number(perUserLimit) > 0) {
    const uid = new mongoose.Types.ObjectId(userId);
    const oid = new mongoose.Types.ObjectId(offerId);
    const limited = await FoodOfferUsage.updateOne(
      { offerId: oid, userId: uid, count: { $lt: Number(perUserLimit) } },
      { $inc: { count: 1 }, $set: { lastUsedAt: new Date() } },
    );
    if (limited.matchedCount) return { ok: true };

    try {
      await FoodOfferUsage.create({
        offerId: oid,
        userId: uid,
        count: 1,
        lastUsedAt: new Date(),
      });
      return { ok: true };
    } catch (err) {
      if (err?.code === 11000) {
        const retry = await FoodOfferUsage.updateOne(
          { offerId: oid, userId: uid, count: { $lt: Number(perUserLimit) } },
          { $inc: { count: 1 }, $set: { lastUsedAt: new Date() } },
        );
        if (retry.matchedCount) return { ok: true };
      }
      await FoodOffer.updateOne({ _id: offerId, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
      return { ok: false, reason: 'PER_USER_LIMIT' };
    }
  }

  if (userId) {
    await FoodOfferUsage.updateOne(
      { offerId: offerId, userId: new mongoose.Types.ObjectId(userId) },
      { $inc: { count: 1 }, $set: { lastUsedAt: new Date() } },
      { upsert: true },
    );
  }
  return { ok: true };
}

async function incrementRestaurantCouponUsage({ couponId, usageLimit }) {
  const filter = {
    _id: couponId,
    approvalStatus: 'approved',
    $or: [
      { usageLimit: null },
      { usageLimit: { $exists: false } },
      { usageLimit: { $lte: 0 } },
      { $expr: { $lt: ['$usedCount', '$usageLimit'] } },
    ],
  };
  const updated = await RestaurantCoupon.updateOne(filter, { $inc: { usedCount: 1 } });
  return { ok: Boolean(updated.matchedCount) };
}

/**
 * Atomically consume coupon for a paid/COD-confirmed order. Idempotent via couponConsumed.
 * Claims the order flag first, then increments usage — so a failed limit check never
 * leaves a completed discounted order without a durable consume, and concurrent claims
 * cannot double-increment for the same order.
 */
export async function consumeCouponForOrder(orderDoc) {
  if (!orderDoc) return { consumed: false };
  const pricing = orderDoc.pricing || {};
  if (pricing.couponConsumed === true) return { consumed: true, already: true };

  const code = String(pricing.couponCode || '').trim().toUpperCase();
  const couponDiscount = Number(pricing.couponDiscount || pricing.discount || 0);
  const freeDelivery = Boolean(pricing.couponFreeDelivery);
  if (!code || (couponDiscount <= 0 && !freeDelivery)) {
    return { consumed: false };
  }

  const source = pricing.couponSource || null;
  let offer = null;
  let restCoupon = null;

  if (source === 'restaurant' && pricing.couponRefId && mongoose.Types.ObjectId.isValid(pricing.couponRefId)) {
    restCoupon = await RestaurantCoupon.findById(pricing.couponRefId).lean();
  } else if (source === 'admin' && pricing.couponRefId && mongoose.Types.ObjectId.isValid(pricing.couponRefId)) {
    offer = await FoodOffer.findById(pricing.couponRefId).lean();
  } else {
    offer = await FoodOffer.findOne({ couponCode: code }).lean();
    if (!offer) {
      restCoupon = await RestaurantCoupon.findOne({
        couponCode: code,
        ...(orderDoc.restaurantId ? { restaurantId: orderDoc.restaurantId } : {}),
      }).lean();
    }
  }

  if (!offer && !restCoupon) {
    return { consumed: false, reason: 'NOT_FOUND' };
  }

  if (restCoupon && orderDoc.userId && Number(restCoupon.perUserLimit) > 0) {
    const used = await countRestaurantCouponUsesByUser({
      userId: orderDoc.userId,
      couponCode: code,
      restaurantMongoId: restCoupon.restaurantId,
    });
    if (used >= Number(restCoupon.perUserLimit)) {
      return { consumed: false, reason: 'PER_USER_LIMIT' };
    }
  }

  const couponSource = offer ? 'admin' : 'restaurant';
  const couponRefId = String((offer || restCoupon)._id);

  // Claim this order first so only one consumer can proceed.
  const claim = await FoodOrder.updateOne(
    { _id: orderDoc._id, 'pricing.couponConsumed': { $ne: true } },
    {
      $set: {
        'pricing.couponConsumed': true,
        'pricing.couponCode': code,
        'pricing.couponDiscount': couponDiscount,
        'pricing.couponFreeDelivery': freeDelivery,
        'pricing.couponSource': couponSource,
        'pricing.couponRefId': couponRefId,
      },
    },
  );

  if (!claim.matchedCount) {
    const current = await FoodOrder.findById(orderDoc._id)
      .select('pricing.couponConsumed')
      .lean();
    if (current?.pricing?.couponConsumed === true) {
      if (orderDoc.pricing) orderDoc.pricing.couponConsumed = true;
      return { consumed: true, already: true };
    }
    return { consumed: false, reason: 'CLAIM_FAILED' };
  }

  let usageOk = true;
  let failReason = 'GLOBAL_LIMIT';

  if (offer) {
    const result = await incrementAdminOfferUsage({
      offerId: offer._id,
      userId: orderDoc.userId,
      usageLimit: offer.usageLimit,
      perUserLimit: offer.perUserLimit,
    });
    usageOk = Boolean(result.ok);
    failReason = result.reason || failReason;
  } else {
    const result = await incrementRestaurantCouponUsage({
      couponId: restCoupon._id,
      usageLimit: restCoupon.usageLimit,
    });
    usageOk = Boolean(result.ok);
    failReason = result.reason || failReason;
  }

  if (!usageOk) {
    // Release claim — coupon must not stay marked consumed without usage.
    await FoodOrder.updateOne(
      { _id: orderDoc._id, 'pricing.couponConsumed': true },
      { $set: { 'pricing.couponConsumed': false } },
    );
    if (orderDoc.pricing) orderDoc.pricing.couponConsumed = false;
    return { consumed: false, reason: failReason };
  }

  if (orderDoc.pricing) {
    orderDoc.pricing.couponConsumed = true;
    orderDoc.pricing.couponCode = code;
    orderDoc.pricing.couponDiscount = couponDiscount;
    orderDoc.pricing.couponFreeDelivery = freeDelivery;
    orderDoc.pricing.couponSource = couponSource;
    orderDoc.pricing.couponRefId = couponRefId;
  }
  return { consumed: true };
}

/**
 * Restore coupon usage when order is cancelled/refunded after consumption.
 */
export async function releaseCouponForOrder(orderDoc) {
  if (!orderDoc) return { released: false };
  const pricing = orderDoc.pricing || {};
  if (pricing.couponConsumed !== true) return { released: false, already: true };

  const code = String(pricing.couponCode || '').trim().toUpperCase();
  if (!code) {
    await FoodOrder.updateOne(
      { _id: orderDoc._id },
      { $set: { 'pricing.couponConsumed': false } },
    );
    return { released: true };
  }

  const source = pricing.couponSource;
  let releasedFrom = null;

  if (source === 'admin' || !source) {
    const offer = pricing.couponRefId && mongoose.Types.ObjectId.isValid(pricing.couponRefId)
      ? await FoodOffer.findById(pricing.couponRefId).lean()
      : await FoodOffer.findOne({ couponCode: code }).lean();
    if (offer) {
      await FoodOffer.updateOne(
        { _id: offer._id, usedCount: { $gt: 0 } },
        { $inc: { usedCount: -1 } },
      );
      if (orderDoc.userId) {
        await FoodOfferUsage.updateOne(
          {
            offerId: offer._id,
            userId: new mongoose.Types.ObjectId(orderDoc.userId),
            count: { $gt: 0 },
          },
          { $inc: { count: -1 } },
        );
      }
      releasedFrom = 'admin';
    }
  }

  if (releasedFrom !== 'admin' && (source === 'restaurant' || !source)) {
    const restCoupon = pricing.couponRefId && mongoose.Types.ObjectId.isValid(pricing.couponRefId) && source === 'restaurant'
      ? await RestaurantCoupon.findById(pricing.couponRefId).lean()
      : await RestaurantCoupon.findOne({
        couponCode: code,
        ...(orderDoc.restaurantId ? { restaurantId: orderDoc.restaurantId } : {}),
      }).lean();
    if (restCoupon) {
      await RestaurantCoupon.updateOne(
        { _id: restCoupon._id, usedCount: { $gt: 0 } },
        { $inc: { usedCount: -1 } },
      );
      releasedFrom = 'restaurant';
    }
  }

  await FoodOrder.updateOne(
    { _id: orderDoc._id, 'pricing.couponConsumed': true },
    { $set: { 'pricing.couponConsumed': false } },
  );
  if (orderDoc.pricing) orderDoc.pricing.couponConsumed = false;
  return { released: true };
}

export function computeTaxOnTaxableAmount({
  orderType,
  items,
  subtotal,
  itemDiscount = 0,
  couponDiscount = 0,
  foodGstRate = 0,
  quickGstRate = 0,
}) {
  const totalDiscount = Math.max(0, Number(itemDiscount) || 0) + Math.max(0, Number(couponDiscount) || 0);

  if (orderType === 'mixed') {
    const foodSubtotal = (items || [])
      .filter((i) => i.type === 'food')
      .reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
    const quickSubtotal = (items || [])
      .filter((i) => i.type === 'quick')
      .reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
    const foodShare = foodSubtotal + quickSubtotal > 0 ? foodSubtotal / (foodSubtotal + quickSubtotal) : 1;
    const foodDiscount = totalDiscount * foodShare;
    const quickDiscount = totalDiscount - foodDiscount;
    const foodTaxable = Math.max(0, foodSubtotal - foodDiscount);
    const quickTaxable = Math.max(0, quickSubtotal - quickDiscount);
    return Math.round(foodTaxable * (Number(foodGstRate) / 100)) +
      Math.round(quickTaxable * (Number(quickGstRate) / 100));
  }

  const taxableAmount = Math.max(0, (Number(subtotal) || 0) - totalDiscount);
  const rate = Number(foodGstRate) || 0;
  return rate > 0 ? Math.round(taxableAmount * (rate / 100)) : 0;
}
