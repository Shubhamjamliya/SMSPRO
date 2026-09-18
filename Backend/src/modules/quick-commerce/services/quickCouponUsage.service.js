/**
 * QC coupon usage: soft-reserve on place (via order docs),
 * usedCount increments only on deliver; cancel before deliver frees the coupon.
 */
import mongoose from 'mongoose';
import { QuickOrder } from '../models/order.model.js';
import { SellerCoupon } from '../models/sellerCoupon.model.js';
import { getQuickCouponSource } from '../utils/couponEarnings.helpers.js';

const CANCELLED_STATUSES = [
  'cancelled',
  'cancelled_by_user',
  'cancelled_by_restaurant',
  'cancelled_by_admin',
  'payment_failed',
  'failed',
];

const getAdminCouponsCollection = () =>
  mongoose.connection?.db?.collection('quick_coupons') || null;

/** Non-cancelled QC orders using this coupon (soft-reserve + per-user). */
export const countActiveQuickCouponOrders = async ({
  code,
  userId = null,
  sellerId = null,
  source = null,
} = {}) => {
  const couponCode = String(code || '').trim().toUpperCase();
  if (!couponCode) return 0;

  const filter = {
    orderType: { $in: ['quick', 'mixed'] },
    'pricing.couponCode': couponCode,
    orderStatus: { $nin: CANCELLED_STATUSES },
  };

  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    filter.userId = new mongoose.Types.ObjectId(userId);
  }

  const src = String(source || '').toLowerCase();
  if (src === 'seller' || src === 'admin') {
    filter['pricing.couponSource'] = src;
  }

  if (sellerId && mongoose.Types.ObjectId.isValid(sellerId)) {
    filter['items.sellerId'] = new mongoose.Types.ObjectId(sellerId);
  }

  return QuickOrder.countDocuments(filter);
};

/**
 * Atomically mark coupon consumed on parent order and $inc usedCount.
 * Idempotent via pricing.couponConsumed.
 */
export const consumeQuickCouponOnDeliver = async (orderDoc) => {
  if (!orderDoc?._id) return { consumed: false };

  const code = String(orderDoc?.pricing?.couponCode || '').trim().toUpperCase();
  const discount = Number(orderDoc?.pricing?.couponDiscount || orderDoc?.pricing?.discount || 0);
  if (!code || discount <= 0) return { consumed: false };
  if (orderDoc?.pricing?.couponConsumed === true) return { consumed: false, already: true };

  const claimed = await QuickOrder.findOneAndUpdate(
    {
      _id: orderDoc._id,
      'pricing.couponCode': code,
      'pricing.couponConsumed': { $ne: true },
    },
    { $set: { 'pricing.couponConsumed': true } },
    { new: true },
  );

  if (!claimed) return { consumed: false, already: true };

  const source = getQuickCouponSource(claimed.pricing || {});
  const refId = String(claimed.pricing?.couponRefId || '').trim();

  try {
    if (source === 'seller') {
      const sellerItem = (claimed.items || []).find((it) => it?.sellerId);
      const sellerId = sellerItem?.sellerId;
      const query = {
        ...(refId && mongoose.Types.ObjectId.isValid(refId)
          ? { _id: new mongoose.Types.ObjectId(refId) }
          : { couponCode: code }),
      };
      if (sellerId && mongoose.Types.ObjectId.isValid(sellerId)) {
        query.sellerId = new mongoose.Types.ObjectId(sellerId);
      }
      await SellerCoupon.updateOne(query, { $inc: { usedCount: 1 } });
    } else {
      const collection = getAdminCouponsCollection();
      if (collection) {
        const { ObjectId } = mongoose.Types;
        const filter =
          refId && ObjectId.isValid(refId)
            ? { _id: new ObjectId(refId) }
            : { code };
        await collection.updateOne(filter, { $inc: { usedCount: 1 } });
      }
    }
  } catch (err) {
    // Roll back claim so a later deliver retry can re-attempt.
    await QuickOrder.updateOne(
      { _id: claimed._id },
      { $set: { 'pricing.couponConsumed': false } },
    ).catch(() => {});
    throw err;
  }

  if (orderDoc.pricing) orderDoc.pricing.couponConsumed = true;
  return { consumed: true };
};

/**
 * If a delivered order that consumed a coupon is cancelled (rare), restore usedCount.
 * Cancel before deliver does nothing — usedCount was never incremented.
 */
export const releaseQuickCouponOnCancel = async (orderDoc) => {
  if (!orderDoc?._id) return { released: false };
  if (orderDoc?.pricing?.couponConsumed !== true) return { released: false };

  const code = String(orderDoc?.pricing?.couponCode || '').trim().toUpperCase();
  if (!code) return { released: false };

  const released = await QuickOrder.findOneAndUpdate(
    {
      _id: orderDoc._id,
      'pricing.couponConsumed': true,
    },
    { $set: { 'pricing.couponConsumed': false } },
    { new: true },
  );
  if (!released) return { released: false };

  const source = getQuickCouponSource(released.pricing || {});
  const refId = String(released.pricing?.couponRefId || '').trim();

  if (source === 'seller') {
    const sellerItem = (released.items || []).find((it) => it?.sellerId);
    const sellerId = sellerItem?.sellerId;
    const query = {
      ...(refId && mongoose.Types.ObjectId.isValid(refId)
        ? { _id: new mongoose.Types.ObjectId(refId) }
        : { couponCode: code }),
      usedCount: { $gt: 0 },
    };
    if (sellerId && mongoose.Types.ObjectId.isValid(sellerId)) {
      query.sellerId = new mongoose.Types.ObjectId(sellerId);
    }
    await SellerCoupon.updateOne(query, { $inc: { usedCount: -1 } });
  } else {
    const collection = getAdminCouponsCollection();
    if (collection) {
      const { ObjectId } = mongoose.Types;
      const filter =
        refId && ObjectId.isValid(refId)
          ? { _id: new ObjectId(refId), usedCount: { $gt: 0 } }
          : { code, usedCount: { $gt: 0 } };
      await collection.updateOne(filter, { $inc: { usedCount: -1 } });
    }
  }

  if (orderDoc.pricing) orderDoc.pricing.couponConsumed = false;
  return { released: true };
};
