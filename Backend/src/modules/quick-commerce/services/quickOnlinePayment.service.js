/**
 * QC online payments: create Razorpay intent first; persist FoodOrder only after success.
 */
import { logger } from '../../../utils/logger.js';
import { QuickOrder } from '../models/order.model.js';
import { QuickCart } from '../models/cart.model.js';
import { QuickProduct } from '../models/product.model.js';
import { QuickPaymentIntent } from '../models/quickPaymentIntent.model.js';
import { resolveQuickSellerCommissionAmount } from '../admin/services/commission.service.js';
import { applyAdminCouponToPlatformProfit } from '../utils/couponEarnings.helpers.js';
import { decrementQuickOrderItemsStock } from '../utils/stock.helpers.js';
import { fanOutQuickSellerOrdersForParent } from './quickSellerOrderFanout.service.js';
import { emitQuickCommerceStatusUpdate } from './quickStatusRealtime.service.js';
import * as foodTransactionService from '../../food/orders/services/foodTransaction.service.js';
import {
  getActiveFeeSettings,
  resolveQuickOrderItemCategoryPolicyMap,
} from '../admin/services/billing.service.js';
import { buildQuickOrderItemReturnFields } from '../utils/quickOrderItem.helpers.js';

const approvedProductFilter = {
  $or: [
    { isActive: true },
    { isActive: { $exists: false } },
    { status: 'active' },
    { status: { $exists: false } },
  ],
};

/**
 * Persist a real QC order from a paid payment intent snapshot.
 * Idempotent: if intent already completed, returns existing order.
 */
export const finalizeQuickPaymentIntent = async (
  intent,
  { razorpayPaymentId = '', razorpaySignature = '' } = {},
) => {
  if (!intent) {
    const err = new Error('Payment intent not found');
    err.statusCode = 404;
    throw err;
  }

  if (intent.status === 'completed' && intent.orderMongoId) {
    const existing = await QuickOrder.findById(intent.orderMongoId);
    if (existing) return { order: existing, alreadyCompleted: true };
  }

  if (intent.status !== 'pending') {
    const err = new Error('This payment session is no longer valid');
    err.statusCode = 400;
    throw err;
  }

  if (intent.expiresAt && new Date(intent.expiresAt).getTime() < Date.now()) {
    intent.status = 'expired';
    await intent.save();
    const err = new Error('Payment session expired. Please place the order again.');
    err.statusCode = 400;
    throw err;
  }

  const snap = intent.snapshot || {};
  const items = Array.isArray(snap.items) ? snap.items : [];
  if (!items.length) {
    const err = new Error('Invalid payment session payload');
    err.statusCode = 400;
    throw err;
  }

  // Claim intent before creating order (prevents double create on parallel verify/webhook)
  const claimed = await QuickPaymentIntent.findOneAndUpdate(
    { _id: intent._id, status: 'pending' },
    {
      $set: {
        status: 'completed',
        razorpayPaymentId: String(razorpayPaymentId || ''),
      },
    },
    { new: true },
  );
  if (!claimed) {
    const again = await QuickPaymentIntent.findById(intent._id);
    if (again?.orderMongoId) {
      const existing = await QuickOrder.findById(again.orderMongoId);
      if (existing) return { order: existing, alreadyCompleted: true };
    }
    const err = new Error('Payment already processed');
    err.statusCode = 400;
    throw err;
  }

  const productIds = items.map((item) => item.productId).filter(Boolean);
  const products = await QuickProduct.find({
    _id: { $in: productIds },
    ...approvedProductFilter,
  }).lean();
  const productMap = products.reduce((acc, product) => {
    acc[String(product._id)] = product;
    return acc;
  }, {});

  for (const item of items) {
    const product = productMap[String(item.productId)];
    if (!product) {
      await QuickPaymentIntent.updateOne(
        { _id: intent._id },
        { $set: { status: 'pending', razorpayPaymentId: '' } },
      );
      const err = new Error(`Product unavailable: ${item.name || item.productId}`);
      err.statusCode = 400;
      throw err;
    }
  }

  const orderNumber = String(snap.orderNumber || `QC${Date.now().toString().slice(-8)}`);
  const pricing = snap.pricing || {};
  const deliveryFee = Number(pricing.deliveryFee || 0);
  const subtotal = Number(pricing.subtotal || snap.subtotal || 0);
  const total = Number(pricing.total || intent.amount || 0);
  const discount = Number(snap.discount || pricing.couponDiscount || pricing.discount || 0);
  const couponSource = String(snap.couponSource || pricing.couponSource || '');
  const riderEarning = Number(snap.riderEarning || 0);
  const deliveryAddress = snap.deliveryAddress || null;
  const pickupPoints = Array.isArray(snap.pickupPoints) ? snap.pickupPoints : [];
  const sellerNameById = snap.sellerNameById || {};

  // Same immutable per-item return policy snapshot as the COD/wallet path.
  const returnPolicyFeeSettings = await getActiveFeeSettings();
  const returnPolicyMap = await resolveQuickOrderItemCategoryPolicyMap(
    items.map((item) => productMap[String(item.productId)]).filter(Boolean),
    returnPolicyFeeSettings,
  );

  let order;
  try {
    order = await QuickOrder.create({
      orderType: 'quick',
      orderId: orderNumber,
      sessionId: snap.sessionId || intent.sessionId || '',
      userId: snap.userId || intent.userId || null,
      items: items.map((item) => {
          const product = productMap[String(item.productId)] || {};
          return {
          itemId: String(item.productId),
          name: item.name,
          image: item.image,
          price: item.price,
          quantity: item.quantity,
          type: 'quick',
          sourceId: String(item.sellerId || item.productId),
          sourceName: sellerNameById[String(item.sellerId || '')] || '',
          variantName: item.variantName || '',
          notes: item.variantName || '',
          packingAmount: Math.max(0, Number(product.packingAmount || item.packingAmount || 0)),
          ...buildQuickOrderItemReturnFields(
            { itemId: String(item.productId), variantKey: item.variantKey, variantSku: item.variantSku, variantName: item.variantName },
            returnPolicyMap.get(String(item.productId)),
          ),
          pricingRule: null,
        };
        }),
      pickupPoints,
      pricing: {
        ...pricing,
        subtotal,
        total,
        tax: Number(pricing.gst || pricing.tax || 0),
        couponCode: snap.couponCode || pricing.couponCode || '',
        couponDiscount: discount,
        discount,
        couponSource: couponSource || '',
        couponRefId: snap.couponRefId || pricing.couponRefId || '',
        couponConsumed: false,
      },
      deliveryAddress,
      timeSlot: snap.timeSlot || 'now',
      payment: {
        method: 'razorpay',
        status: 'paid',
        amountDue: Math.max(0, total),
        razorpay: {
          orderId: intent.razorpayOrderId || '',
          paymentId: String(razorpayPaymentId || ''),
          signature: String(razorpaySignature || ''),
        },
      },
      orderStatus: 'placed',
      riderEarning: riderEarning || 0,
      platformProfit: Number(snap.platformProfit || 0),
      statusHistory: [
        {
          byRole: 'SYSTEM',
          from: '',
          to: 'placed',
          note: 'Quick commerce order placed after online payment success',
        },
      ],
    });
  } catch (createErr) {
    await QuickPaymentIntent.updateOne(
      { _id: intent._id },
      { $set: { status: 'pending', razorpayPaymentId: '' } },
    );
    throw createErr;
  }

  // Commission + platform profit refresh (same as placeOrder)
  const sellerBuckets = new Map();
  items.forEach((item) => {
    const bucketSellerId = item.sellerId ? String(item.sellerId) : '';
    if (!bucketSellerId) return;
    if (!sellerBuckets.has(bucketSellerId)) sellerBuckets.set(bucketSellerId, []);
    sellerBuckets.get(bucketSellerId).push(item);
  });

  let totalSellerCommission = 0;
  for (const [sellerId, sellerItems] of sellerBuckets.entries()) {
    const sellerSubtotal = sellerItems.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0,
    );
    const enrichedItems = sellerItems.map((si) => {
      const product = productMap[String(si.productId)];
      return {
        ...si,
        headerId: product?.headerId || null,
        categoryId: product?.categoryId || null,
      };
    });
    const commissionAmount = await resolveQuickSellerCommissionAmount(
      sellerId,
      sellerSubtotal,
      enrichedItems,
    );
    totalSellerCommission += commissionAmount;
  }

  if (totalSellerCommission > 0 || (couponSource === 'admin' && discount > 0)) {
    const platformProfit = applyAdminCouponToPlatformProfit(
      Math.max(
        0,
        deliveryFee +
          Number(pricing.platformFee || 0) +
          totalSellerCommission -
          (riderEarning || 0),
      ),
      { discount, couponSource },
    );
    await QuickOrder.updateOne(
      { _id: order._id },
      {
        $set: {
          ...(totalSellerCommission > 0
            ? { 'pricing.restaurantCommission': totalSellerCommission }
            : {}),
          platformProfit,
        },
      },
    );
    if (totalSellerCommission > 0) {
      order.pricing = order.pricing || {};
      order.pricing.restaurantCommission = totalSellerCommission;
    }
    order.platformProfit = platformProfit;
  }

  try {
    await decrementQuickOrderItemsStock(items);
  } catch (stockErr) {
    logger.error(
      `[QC Online] Stock decrement failed for ${order.orderId}: ${stockErr?.message || stockErr}`,
    );
  }

  const idQuery = snap.idQuery || {};
  if (idQuery.userId || idQuery.sessionId) {
    await QuickCart.findOneAndUpdate(idQuery, { $set: { items: [] } }, { upsert: false });
  }

  try {
    await foodTransactionService.createInitialTransaction(order);
    await foodTransactionService.updateTransactionStatus(order._id, 'captured', {
      status: 'captured',
      razorpayPaymentId: String(razorpayPaymentId || ''),
      razorpaySignature: String(razorpaySignature || ''),
      note: 'Quick commerce online payment verified',
      recordedByRole: 'USER',
      recordedById: order.userId,
    });
  } catch (txnErr) {
    logger.error(
      `[QC Online] Transaction sync failed for ${order.orderId}: ${txnErr?.message || txnErr}`,
    );
  }

  await fanOutQuickSellerOrdersForParent(order);

  emitQuickCommerceStatusUpdate(order, {
    message: 'Quick order placed successfully.',
  });

  await QuickPaymentIntent.updateOne(
    { _id: intent._id },
    {
      $set: {
        orderId: order.orderId,
        orderMongoId: order._id,
        status: 'completed',
      },
    },
  );

  return { order, alreadyCompleted: false };
};

export const findPendingQuickPaymentIntent = async ({
  intentId = '',
  razorpayOrderId = '',
} = {}) => {
  const clauses = [];
  if (intentId) clauses.push({ intentId: String(intentId) });
  if (razorpayOrderId) clauses.push({ razorpayOrderId: String(razorpayOrderId) });
  if (!clauses.length) return null;
  return QuickPaymentIntent.findOne({
    status: 'pending',
    $or: clauses,
  });
};

export const findQuickPaymentIntentAny = async ({
  intentId = '',
  razorpayOrderId = '',
} = {}) => {
  const clauses = [];
  if (intentId) clauses.push({ intentId: String(intentId) });
  if (razorpayOrderId) clauses.push({ razorpayOrderId: String(razorpayOrderId) });
  if (!clauses.length) return null;
  return QuickPaymentIntent.findOne({ $or: clauses });
};
