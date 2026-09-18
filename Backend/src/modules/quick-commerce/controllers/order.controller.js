import mongoose from 'mongoose';
import { logger } from '../../../utils/logger.js';
import { sendResponse } from '../../../utils/response.js';
import { FoodUser } from '../../../core/users/user.model.js';
import { QuickOrder } from '../models/order.model.js';
import { QuickCart } from '../models/cart.model.js';
import { QuickProduct } from '../models/product.model.js';
import { Seller } from '../seller/models/seller.model.js';
import { SellerOrder } from '../seller/models/sellerOrder.model.js';
import { resolveQuickSellerCommissionAmount } from '../admin/services/commission.service.js';
import {
  calculateQuickPricing,
  getRiderEarning as getQuickRiderEarning,
  getActiveFeeSettings,
  resolveReturnWindowHoursFromProducts,
  resolveQuickOrderItemCategoryPolicyMap,
} from '../admin/services/billing.service.js';
import { getQuickCoupons } from '../services/content.service.js';
import {
  assertQuickCouponApplicable,
  findActiveSellerCoupon,
  resolveCartSellerId,
  getSellerEligibleCartTotal,
} from '../utils/coupon.helpers.js';
import {
  applyAdminCouponToPlatformProfit,
  resolveQuickCouponSource,
} from '../utils/couponEarnings.helpers.js';
import { computeSellerReceivable } from '../utils/sellerEarnings.helpers.js';
import {
  releaseQuickCouponOnCancel,
} from '../services/quickCouponUsage.service.js';
import * as foodTransactionService from '../../food/orders/services/foodTransaction.service.js';
import { FoodTransaction } from '../../food/orders/models/foodTransaction.model.js';
import { emitQuickCommerceStatusUpdate } from '../services/quickStatusRealtime.service.js';
import { getSellerLocation, getOrderAddressPoint } from '../services/quickOrder.service.js';
import { haversineKm } from '../../food/orders/services/order.helpers.js';
import { sumUniqueProductPackingFee } from '../utils/packing.helpers.js';
import { resolveQuickOrderCancellationReason } from '../utils/cancellation.helpers.js';
import { resolveQuickOrderCustomer } from '../utils/customer.helpers.js';
import { getRoadDistance } from '../../../core/location/location.service.js';
import { buildOrderReturnEligibility, buildItemReturnStatusMap } from '../utils/return.helpers.js';
import {
  buildQuickOrderItemReturnFields,
  resolveOrderItemLineKey,
} from '../utils/quickOrderItem.helpers.js';
import { buildPriorReturnedQuantityMap } from '../utils/returnRefundCalculation.helpers.js';
import { SellerReturn } from '../seller/models/sellerReturn.model.js';
import { Driver } from '../../../core/models/driver.model.js';
import {
  buildCartLineKey,
  resolveVariantLabel,
  resolveVariantStock,
  resolveVariantUnitPrice,
  stripCompositeProductId,
} from '../utils/variant.helpers.js';
import {
  decrementQuickOrderItemsStock,
  restoreQuickOrderItemsStock,
} from '../utils/stock.helpers.js';
import { processQuickOrderRefund } from '../services/quickRefund.service.js';
import { assertSellerShopOpen } from '../utils/timeFormat.helpers.js';
import { fanOutQuickSellerOrdersForParent } from '../services/quickSellerOrderFanout.service.js';
import { deductWalletBalance } from '../../food/user/services/userWallet.service.js';
import {
    createRazorpayOrder,
    getRazorpayKeyId,
    isRazorpayConfigured,
    verifyPaymentSignature,
} from '../../food/orders/helpers/razorpay.helper.js';
import { QuickPaymentIntent } from '../models/quickPaymentIntent.model.js';
import {
  finalizeQuickPaymentIntent,
  findPendingQuickPaymentIntent,
  findQuickPaymentIntentAny,
} from '../services/quickOnlinePayment.service.js';
import * as orderService from '../../food/orders/services/order.service.js';
import { z } from 'zod';
import { ValidationError } from '../../../core/auth/errors.js';

const approvedProductFilter = {
  $or: [
    { isActive: true },
    { isActive: { $exists: false } },
    { status: 'active' },
  ],
  $and: [
    {
      $or: [
        { approvalStatus: { $exists: false } },
        { approvalStatus: 'approved' },
      ],
    },
  ],
};

const getQuickSessionIdFromRequest = (req) =>
  String(req.headers['x-quick-session'] || req.body?.sessionId || req.query?.sessionId || '').trim();

const resolveId = (req) => {
  if (req.user?.userId) return { userId: req.user.userId };
  const sessionId = getQuickSessionIdFromRequest(req);
  return sessionId ? { sessionId } : null;
};

/** Match orders owned by logged-in user and/or the active quick session. */
const buildOrderAccessQuery = (req) => {
  const ownershipClauses = [];
  if (req.user?.userId) ownershipClauses.push({ userId: req.user.userId });
  const sessionId = getQuickSessionIdFromRequest(req);
  if (sessionId) ownershipClauses.push({ sessionId });
  if (!ownershipClauses.length) return null;
  return ownershipClauses.length === 1 ? ownershipClauses[0] : { $or: ownershipClauses };
};

function validateOrderRatingsDto(body) {
  const schema = z.object({
    restaurantRating: z.number().min(1).max(5).optional(),
    sellerRating: z.number().min(1).max(5).optional(),
    deliveryPartnerRating: z.number().min(1).max(5).optional(),
    restaurantComment: z.string().max(500).optional(),
    sellerComment: z.string().max(500).optional(),
    deliveryPartnerComment: z.string().max(500).optional()
  });
  const result = schema.safeParse(body || {});
  if (!result.success) {
    throw new ValidationError(result.error.errors?.[0]?.message || 'Validation failed');
  }
  return result.data;
}

const getOrderPayableAmount = (order) => {
  const pricing = order?.pricing || {};
  // pricing.total already includes: subtotal + deliveryFee + platformFee + gst - discount
  // No need to add platformFee again here.
  const total = Number(pricing.total ?? order?.total ?? 0);
  return Number.isFinite(total) ? Math.max(0, total) : 0;
};

const normalizeOrderSummary = (order) => {
  const amount = getOrderPayableAmount(order);
  const paymentMethod = order?.payment?.method || order?.paymentMethod || 'cash';
  const paymentStatus = order?.payment?.status || order?.paymentStatus || '';

  return {
    id: order._id,
    _id: order._id,
    orderId: order.orderId,
    orderNumber: order.orderId,
    total: amount,
    totalAmount: amount,
    payableAmount: amount,
    amount,
    status: order.orderStatus,
    orderStatus: order.orderStatus,
    workflowStatus: order.workflowStatus || '',
    paymentMethod,
    paymentStatus,
    payment: order.payment || {},
    itemCount: Array.isArray(order.items)
      ? order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
      : 0,
    createdAt: order.createdAt,
    items: Array.isArray(order.items)
      ? order.items.map((item) => ({
          itemId: item.itemId || item.productId || '',
          name: item.name,
          image: item.image,
          price: item.price,
          quantity: item.quantity,
          variantName: item.variantName || item.notes || '',
          notes: item.notes || item.variantName || '',
        }))
      : [],
    pricing: order.pricing || {},
    address: order.deliveryAddress || order.address || null,
    deliveryAddress: order.deliveryAddress || order.address || null,
  };
};

const normalizeDeliveryAddress = (address) => {
  if (!address || typeof address !== 'object') return null;

  const street = String(address.address || address.street || '').trim();
  const city = String(address.city || '').trim();
  const additionalDetails = String(address.landmark || address.additionalDetails || '').trim();
  const phone = String(address.phone || '').trim();
  const name = String(address.name || '').trim();
  const label = ['Home', 'Office', 'Other'].includes(address.type) ? address.type : 'Other';
  const state = String(address.state || '').trim();
  const zipCode = String(address.zipCode || address.pincode || '').trim();
  const lat = Number(address.location?.lat);
  const lng = Number(address.location?.lng);
  const formattedAddress = [street, additionalDetails, city, state, zipCode]
    .map((part) => String(part || '').trim())
    .filter((part) => part && part.toUpperCase() !== 'NA')
    .join(', ');

  return {
    label,
    name,
    street,
    additionalDetails,
    city: city || street,
    state: state || city || 'India',
    zipCode,
    phone,
    ...(formattedAddress ? { formattedAddress } : {}),
    ...(Number.isFinite(lat) && Number.isFinite(lng)
      ? {
          location: {
            type: 'Point',
            coordinates: [lng, lat],
          },
        }
      : {}),
  };
};

const buildQuickPickupPointFromSeller = (seller, sellerId) => {
  if (!seller || !sellerId) return null;
  const location = seller.location || {};
  const coordinates = Array.isArray(location.coordinates) && location.coordinates.length === 2
    ? location.coordinates
    : (Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude))
        ? [Number(location.longitude), Number(location.latitude)]
        : undefined);
  const addressText = [
    location.formattedAddress,
    location.address,
    seller.shopInfo?.address,
    seller.shopInfo?.formattedAddress,
  ]
    .map((part) => String(part || '').trim())
    .find(Boolean) || '';

  return {
    pickupType: 'quick',
    sourceId: String(sellerId),
    sourceName: String(seller.shopName || seller.name || 'Store').trim(),
    address: addressText,
    phone: String(seller.phone || '').trim(),
    ...(coordinates ? { location: { coordinates } } : {}),
  };
};

const normalizeRequestedItems = (items) => {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      const productId = stripCompositeProductId(
        item?.productId || item?.itemId || item?.id || item?._id || '',
      );
      const variantName = String(
        item?.variantName || item?.selectedVariant?.name || '',
      ).trim();
      const variantKey = String(
        item?.variantKey ||
          item?.selectedVariant?._id ||
          item?.selectedVariant?.id ||
          '',
      ).trim();
      const variantSku = String(
        item?.variantSku || item?.selectedVariant?.sku || '',
      ).trim();

      return {
        productId,
        quantity: Math.max(1, Number(item?.quantity || 1)),
        variantName,
        variantKey,
        variantSku,
        price: Number(item?.price),
        lineKey: buildCartLineKey(productId, variantKey, variantName),
      };
    })
    .filter((item) => item.productId && mongoose.isValidObjectId(item.productId));
};

const buildRequestedItemMetaMap = (items = []) =>
  items.reduce((acc, item) => {
    acc[item.lineKey || item.productId] = item;
    return acc;
  }, {});

const resolveLineItemMeta = (productId, variantMeta = {}, metaMap = {}) => {
  const keys = [
    buildCartLineKey(
      productId,
      variantMeta.variantKey,
      variantMeta.variantName,
    ),
    String(productId),
  ];
  for (const key of keys) {
    if (metaMap[key]) return metaMap[key];
  }
  return variantMeta;
};

const emitQuickOrderStatusUpdate = (order, message = '') => {
  try {
    void emitQuickCommerceStatusUpdate(order, { message });
  } catch {
    // best-effort realtime update
  }
};

export const placeOrder = async (req, res) => {
  try {
    const idQuery = resolveId(req);

    if (!idQuery) {
      return res.status(400).json({ success: false, message: 'sessionId or userId is required' });
    }

    const cart = await QuickCart.findOne(idQuery).lean();
    const requestedItems = normalizeRequestedItems(req.body?.items);
    const requestedMetaMap = buildRequestedItemMetaMap(requestedItems);
    const sourceItems =
      requestedItems.length > 0
        ? requestedItems
        : (Array.isArray(cart?.items) && cart.items.length > 0
            ? cart.items.map((item) => ({
                productId: stripCompositeProductId(item.productId),
                quantity: Math.max(1, Number(item.quantity || 1)),
                variantName: String(item.variantName || '').trim(),
                variantKey: String(item.variantKey || '').trim(),
                variantSku: String(item.variantSku || '').trim(),
                price: Number(item.unitPrice || 0),
                lineKey: buildCartLineKey(
                  item.productId,
                  item.variantKey,
                  item.variantName,
                ),
              }))
            : []);

    if (sourceItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    const productIds = sourceItems.map((item) => stripCompositeProductId(item.productId));
    const products = await QuickProduct.find({ _id: { $in: productIds }, ...approvedProductFilter }).lean();
    const productMap = products.reduce((acc, product) => {
      acc[String(product._id)] = product;
      return acc;
    }, {});

    // Product docs used purely to resolve the QC return-policy snapshot.
    // Kept separate from productMap so the pricing/packing behavior stays untouched.
    let returnPolicyProductMap = productMap;

    let items = sourceItems
      .map((item) => {
        const productId = stripCompositeProductId(item.productId);
        const product = productMap[String(productId)];
        if (!product) return null;
        const requestedMeta = resolveLineItemMeta(productId, item, requestedMetaMap);
        const variantName = resolveVariantLabel(product, requestedMeta);
        const unitPrice = resolveVariantUnitPrice(product, requestedMeta);
        return {
          productId: product._id,
          sellerId: product.sellerId || null,
          name: product.name,
          image: product.image || product.mainImage || '',
          price: unitPrice,
          quantity: item.quantity,
          variantName,
          variantKey: requestedMeta.variantKey || '',
          variantSku: requestedMeta.variantSku || '',
        };
      })
      .filter(Boolean);

    if (items.length === 0 && requestedItems.length > 0 && sourceItems !== requestedItems) {
      const fallbackProductIds = requestedItems.map((item) => item.productId);
      const fallbackProducts = await QuickProduct.find({
        _id: { $in: fallbackProductIds },
        ...approvedProductFilter,
      }).lean();
      const fallbackProductMap = fallbackProducts.reduce((acc, product) => {
        acc[String(product._id)] = product;
        return acc;
      }, {});
      returnPolicyProductMap = fallbackProductMap;

      items = requestedItems
        .map((item) => {
          const product = fallbackProductMap[String(item.productId)];
          if (!product) return null;
          const variantName = resolveVariantLabel(product, item);
          const unitPrice = resolveVariantUnitPrice(product, item);
          return {
            productId: product._id,
            sellerId: product.sellerId || null,
            name: product.name,
            image: product.image || product.mainImage || '',
            price: unitPrice,
            quantity: item.quantity,
            variantName,
            variantKey: item.variantKey || '',
            variantSku: item.variantSku || '',
          };
        })
        .filter(Boolean);
    }

    if (items.length === 0) {
      logger.warn(`Quick placeOrder: No valid items found for productIds: ${JSON.stringify(productIds)} using idQuery: ${JSON.stringify(idQuery)}`);
      return res.status(400).json({ success: false, message: 'No valid items found in cart' });
    }

    const orderSellerIds = [
      ...new Set(
        items
          .map((item) => (item.sellerId ? String(item.sellerId) : ''))
          .filter(Boolean),
      ),
    ];
    if (orderSellerIds.length > 1) {
      return res.status(400).json({
        success: false,
        code: 'MULTI_SELLER_NOT_ALLOWED',
        message: 'Quick Commerce orders support only one seller per order.',
      });
    }

    if (orderSellerIds.length === 1) {
      try {
        const orderSeller = await Seller.findById(orderSellerIds[0])
          .select('_id shopInfo.openingHours shopName name')
          .lean();
        assertSellerShopOpen(orderSeller);
      } catch (error) {
        if (error?.code === 'SHOP_CLOSED') {
          return res.status(400).json({
            success: false,
            code: 'SHOP_CLOSED',
            message: error.message,
            openingHours: error.openingHours || '',
          });
        }
        throw error;
      }
    }

    // Validate stock for all items
    for (const item of items) {
      const prodIdStr = String(item.productId);
      const product = products.find((p) => String(p._id) === prodIdStr) ||
                      (typeof fallbackProducts !== 'undefined' ? fallbackProducts.find((p) => String(p._id) === prodIdStr) : null);
      if (product) {
        const availableStock = resolveVariantStock(product, item);
        if (item.quantity > availableStock) {
          const variantSuffix = item.variantName ? ` (${item.variantName})` : '';
          return res.status(400).json({
            success: false,
            message: `Only ${availableStock} items are available in stock for ${product.name}${variantSuffix}.`,
          });
        }
      }
    }

    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Server-side coupon validation — never trust client discountTotal.
    // usedCount is NOT incremented here; it increments only on deliver.
    let discount = 0;
    let appliedCouponCode = '';
    let couponSource = '';
    let couponRefId = '';
    const couponCodeRaw = String(req.body?.couponCode || req.body?.coupon || '').trim().toUpperCase();
    if (couponCodeRaw) {
      try {
        const adminCoupons = await getQuickCoupons();
        let coupon = adminCoupons.find(
          (c) => String(c.code || '').toUpperCase() === couponCodeRaw,
        );
        const cartSellerId = resolveCartSellerId(items);
        if (!coupon) {
          coupon = await findActiveSellerCoupon({
            code: couponCodeRaw,
            sellerId: cartSellerId || items.find((item) => item.sellerId)?.sellerId,
          });
        }
        if (!coupon) {
          return res.status(400).json({
            success: false,
            message: 'Coupon not found or not valid for this store',
          });
        }

        const isSellerCoupon = coupon.isSellerCoupon === true;
        const couponSellerId = String(coupon.sellerId || cartSellerId || '').trim();
        const eligibleTotal = isSellerCoupon
          ? getSellerEligibleCartTotal(items, couponSellerId)
          : subtotal;

        const applied = await assertQuickCouponApplicable(coupon, {
          cartTotal: eligibleTotal,
          userId: idQuery.userId || req.user?.userId || null,
          items,
          sellerId: couponSellerId,
        });
        discount = Number(applied.discountAmount || 0);
        appliedCouponCode = applied.code;
        couponSource = applied.couponSource || resolveQuickCouponSource(coupon);
        couponRefId = applied.couponRefId || String(coupon._id || coupon.id || '');
      } catch (couponErr) {
        return res.status(couponErr.statusCode || 400).json({
          success: false,
          message: couponErr.message || 'Invalid coupon',
        });
      }
    }

    let deliveryAddress = normalizeDeliveryAddress(req.body?.address);

    if (idQuery.userId) {
      const customerUser = await FoodUser.findById(idQuery.userId)
        .select('name phone email')
        .lean();
      if (deliveryAddress) {
        if (!deliveryAddress.name && customerUser?.name) {
          deliveryAddress.name = String(customerUser.name).trim();
        }
        if (!deliveryAddress.phone && customerUser?.phone) {
          deliveryAddress.phone = String(customerUser.phone).trim();
        }
      }
    }

    // Calculate precise distance between seller and delivery address
    const firstProduct = products[0];
    const sellerId = firstProduct?.sellerId;
    const seller = sellerId ? await Seller.findById(sellerId).select('location').lean() : null;

    let distanceKm = 0.1; // Default fallback distance if coordinates are missing
    if (seller && deliveryAddress) {
      const sellerCoords = getSellerLocation(seller);
      const deliveryCoords = getOrderAddressPoint({ deliveryAddress });
      if (sellerCoords && deliveryCoords) {
        // Road distance (Google Routes, cached) with automatic haversine fallback.
        // Hard cap so place-order never hangs if Google is slow.
        const road = await Promise.race([
          getRoadDistance(sellerCoords, deliveryCoords).catch(() => null),
          new Promise((resolve) => setTimeout(() => resolve(null), 4500)),
        ]);
        distanceKm = road && Number.isFinite(road.distanceKm)
          ? road.distanceKm
          : haversineKm(sellerCoords.lat, sellerCoords.lng, deliveryCoords.lat, deliveryCoords.lng);
      }
    }

    const { pricing } = await calculateQuickPricing({
      subtotal,
      discount,
      products,
      lineItems: items.map((item) => {
        const product = productMap[String(item.productId)] || {};
        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.price,
          lineTotal: Number(item.price || 0) * Number(item.quantity || 0),
          packingAmount: Number(product.packingAmount || 0),
          variantKey: item.variantKey || '',
          variantName: item.variantName || '',
        };
      }),
      distanceKm,
    });

    // Never trust client delivery/tax/platform fees — pricing is server-computed.
    pricing.tax = pricing.gst;
    pricing.couponCode = appliedCouponCode || '';
    pricing.couponDiscount = discount;
    pricing.discount = discount;
    pricing.couponSource = appliedCouponCode ? couponSource : '';
    pricing.couponRefId = appliedCouponCode ? couponRefId : '';
    pricing.couponConsumed = false;
    pricing.total = Math.max(
      0,
      subtotal +
        Number(pricing.deliveryFee || 0) +
        Number(pricing.platformFee || 0) +
        Number(pricing.tax || 0) +
        Number(pricing.packagingFee || 0) -
        discount
    );

    const lineGstRows = Array.isArray(pricing.lineGst) ? pricing.lineGst : [];
    const lineGstByKey = new Map(
      lineGstRows.map((row) => [
        `${String(row.productId)}::${String(row.variantKey || '').trim()}::${String(row.variantName || '').trim()}`,
        row,
      ]),
    );
    const resolveItemGstSnap = (item) => {
      const key = `${String(item.productId)}::${String(item.variantKey || '').trim()}::${String(item.variantName || '').trim()}`;
      const snap = lineGstByKey.get(key);
      if (snap) return snap;
      return lineGstRows.find((row) => String(row.productId) === String(item.productId)) || null;
    };

    const deliveryFee = Number(pricing.deliveryFee || 0);
    const total = Number(pricing.total || 0);
    const orderNumber = `QC${Date.now().toString().slice(-8)}`;
    const paymentModeRaw = String(req.body?.paymentMode || 'COD').toUpperCase();
    const isOnlinePayment = paymentModeRaw === 'ONLINE';
    const isWalletPayment = paymentModeRaw === 'WALLET';
    const paymentMode = isOnlinePayment ? 'razorpay' : isWalletPayment ? 'wallet' : 'cash';
    const sellerPaymentMode = isOnlinePayment || isWalletPayment ? 'online' : 'cash';
    // Online orders reach sellers only after Razorpay payment is verified.
    const shouldFanOutSellerOrders = !isOnlinePayment;

    if (isWalletPayment && !idQuery.userId) {
      return res.status(400).json({
        success: false,
        message: 'Please log in to pay with wallet',
      });
    }

    // Calculate rider earning using actual distance
    const riderEarning = await getQuickRiderEarning(distanceKm);

    const sellerBuckets = new Map();
    // @deprecated multi-seller bucketing — validated to single seller above; kept for SellerOrder fan-out.
    items.forEach((item) => {
      const bucketSellerId = item.sellerId ? String(item.sellerId) : '';
      if (!bucketSellerId) return;
      if (!sellerBuckets.has(bucketSellerId)) sellerBuckets.set(bucketSellerId, []);
      sellerBuckets.get(bucketSellerId).push(item);
    });

    const sellerIdsForPickup = [...sellerBuckets.keys()];
    const sellersForPickup = sellerIdsForPickup.length
      ? await Seller.find({ _id: { $in: sellerIdsForPickup } })
          .select('shopName name phone location shopInfo')
          .lean()
      : [];
    const sellerPickupMap = sellersForPickup.reduce((acc, sellerDoc) => {
      acc[String(sellerDoc._id)] = sellerDoc;
      return acc;
    }, {});
    const pickupPoints = sellerIdsForPickup
      .map((bucketSellerId) => buildQuickPickupPointFromSeller(sellerPickupMap[bucketSellerId], bucketSellerId))
      .filter(Boolean);
    const sellerNameById = sellerIdsForPickup.reduce((acc, bucketSellerId) => {
      const sellerDoc = sellerPickupMap[bucketSellerId];
      acc[bucketSellerId] = String(sellerDoc?.shopName || sellerDoc?.name || 'Store').trim();
      return acc;
    }, {});

    const quickSessionId = getQuickSessionIdFromRequest(req);

    // ── ONLINE: create Razorpay payment intent only. FoodOrder is created after success. ──
    if (isOnlinePayment) {
      if (!isRazorpayConfigured()) {
        return res.status(400).json({
          success: false,
          message: 'Online payment is temporarily unavailable. Please use Cash or Wallet.',
        });
      }
      const amountPaise = Math.round(total * 100);
      if (amountPaise < 100) {
        return res.status(400).json({
          success: false,
          message: 'Amount too low for online payment',
        });
      }

      const intentId = `QCPAY${Date.now().toString().slice(-10)}${Math.floor(Math.random() * 90 + 10)}`;
      let rzOrder;
      try {
        rzOrder = await createRazorpayOrder(amountPaise, 'INR', intentId, {
          type: 'quick_payment_intent',
          intentId,
        });
      } catch (rzErr) {
        logger.error(`Quick Razorpay intent create failed: ${rzErr?.message || rzErr}`);
        return res.status(400).json({
          success: false,
          message: rzErr?.message || 'Payment gateway error',
        });
      }

      const { lineGst: _omitLineGst, ...pricingRest } = pricing || {};
      const snapshotPricing = {
        ...pricingRest,
        subtotal,
        total,
        tax: Number(pricing.gst || pricing.tax || 0),
        couponCode: appliedCouponCode || '',
        couponDiscount: discount,
        discount,
        couponSource: appliedCouponCode ? couponSource : '',
        couponRefId: appliedCouponCode ? couponRefId : '',
        couponConsumed: false,
      };

      await QuickPaymentIntent.create({
        intentId,
        razorpayOrderId: rzOrder.id,
        userId: idQuery.userId || null,
        sessionId: quickSessionId || idQuery.sessionId || '',
        status: 'pending',
        amount: total,
        currency: 'INR',
        expiresAt: new Date(Date.now() + 45 * 60 * 1000),
        snapshot: {
          orderNumber,
          items,
          deliveryAddress,
          pickupPoints,
          pricing: snapshotPricing,
          subtotal,
          discount,
          couponSource: appliedCouponCode ? couponSource : '',
          couponCode: appliedCouponCode || '',
          couponRefId: appliedCouponCode ? couponRefId : '',
          distanceKm,
          riderEarning: riderEarning || 0,
          platformProfit: applyAdminCouponToPlatformProfit(
            Math.max(
              0,
              deliveryFee + Number(pricing.platformFee || 0) - (riderEarning || 0),
            ),
            { discount, couponSource },
          ),
          sellerNameById,
          timeSlot: req.body?.timeSlot || 'now',
          idQuery,
          sessionId: quickSessionId || idQuery.sessionId || '',
          userId: idQuery.userId || null,
        },
      });

      return res.status(200).json({
        success: true,
        paymentIntentId: intentId,
        // No FoodOrder yet — order is created only after payment success.
        result: {
          orderId: intentId,
          paymentIntentId: intentId,
          orderType: 'quick',
          payment: { method: 'razorpay', status: 'created' },
          paymentMethod: 'razorpay',
          paymentStatus: 'created',
          pricing: snapshotPricing,
          total,
          items,
        },
        razorpay: {
          key: getRazorpayKeyId(),
          orderId: rzOrder.id,
          amount: rzOrder.amount,
          currency: rzOrder.currency || 'INR',
        },
      });
    }

    // Immutable per-item return policy snapshot (single batched category lookup).
    const returnPolicyFeeSettings = await getActiveFeeSettings();
    const returnPolicyMap = await resolveQuickOrderItemCategoryPolicyMap(
      items.map((item) => returnPolicyProductMap[String(item.productId)]).filter(Boolean),
      returnPolicyFeeSettings,
    );

    const order = await QuickOrder.create({
      orderType: 'quick',
      orderId: orderNumber,
      sessionId: quickSessionId || idQuery.sessionId || '',
      userId: idQuery.userId || null,
      items: items.map((item) => {
        const gstSnap = resolveItemGstSnap(item);
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
          packingAmount: Math.max(0, Number(product.packingAmount || 0)),
          ...buildQuickOrderItemReturnFields(
            { itemId: String(item.productId), variantKey: item.variantKey, variantSku: item.variantSku, variantName: item.variantName },
            returnPolicyMap.get(String(item.productId)),
          ),
          // QC GST historical snapshot — Mixed pricingRule; Food leaves this null/unused.
          pricingRule: gstSnap
            ? {
                qcGst: {
                  rate: Number(gstSnap.gstRate || 0),
                  amount: Number(gstSnap.gstAmount || 0),
                  headerId: String(gstSnap.headerId || ''),
                  taxableAmount: Number(gstSnap.taxableAmount || 0),
                  couponShare: Number(gstSnap.couponShare || 0),
                  lineSubtotal: Number(gstSnap.lineSubtotal || 0),
                },
              }
            : null,
        };
      }),
      pickupPoints,
      pricing: (() => {
        const { lineGst: _omitLineGst, ...pricingRest } = pricing || {};
        return {
          ...pricingRest,
          subtotal,
          total,
          tax: Number(pricing.gst || pricing.tax || 0),
        };
      })(),
      deliveryAddress,
      timeSlot: req.body?.timeSlot || 'now',
      payment: {
        method: paymentMode,
        status: isOnlinePayment ? 'created' : isWalletPayment ? 'paid' : 'cod_pending',
        amountDue: Math.max(0, total),  // total already includes platformFee
      },
      orderStatus: 'placed',
      riderEarning: riderEarning || 0,
      platformProfit: applyAdminCouponToPlatformProfit(
        Math.max(
          0,
          deliveryFee + Number(pricing.platformFee || 0) - (riderEarning || 0),
        ),
        { discount, couponSource },
      ), // Initial guess, will be updated with commission
      statusHistory: [
        {
          byRole: 'SYSTEM',
          from: '',
          to: 'placed',
          note: 'Quick commerce order placed',
        },
      ],
    });

    let razorpayPayload = null;

    if (paymentMode === "razorpay" && isRazorpayConfigured()) {
      const amountPaise = Math.round(total * 100);
      if (amountPaise >= 100) {
        try {
          const rzOrder = await createRazorpayOrder(amountPaise, "INR", order.orderId);
          order.payment.razorpay = {
            orderId: rzOrder.id,
            paymentId: "",
            signature: "",
          };
          order.payment.status = "created";
          razorpayPayload = {
            key: getRazorpayKeyId(),
            orderId: rzOrder.id,
            amount: rzOrder.amount,
            currency: rzOrder.currency || "INR",
          };
          await order.save();
        } catch (err) {
          logger.error(`Quick Razorpay order creation failed: ${err?.message || err}`);
        }
      }
    }

    if (isWalletPayment) {
      try {
        await deductWalletBalance(
          idQuery.userId,
          total,
          'Quick commerce order payment',
          {
            orderId: order.orderId,
            source: 'quick_order_payment',
            orderType: 'quick',
          },
        );
      } catch (walletErr) {
        await QuickOrder.deleteOne({ _id: order._id });
        return res.status(400).json({
          success: false,
          message: walletErr?.message || 'Insufficient wallet balance',
        });
      }
    }

    await decrementQuickOrderItemsStock(items);

    const sellerOrdersResults = sellerBuckets.size > 0
        ? await Promise.all(Array.from(sellerBuckets.entries()).map(async ([sellerId, sellerItems]) => {
            const sellerSubtotal = sellerItems.reduce(
              (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
              0,
            );
            const allocatedDeliveryFee = Number(
              ((deliveryFee * sellerSubtotal) / Math.max(subtotal, 1)).toFixed(2),
            );

            const enrichedItems = sellerItems.map((si) => {
              const product = productMap[String(si.productId)];
              return {
                ...si,
                headerId: product?.headerId || null,
                categoryId: product?.categoryId || null,
              };
            });
            const packingTotal = sumUniqueProductPackingFee(
              sellerItems.map((item) => {
                const product = productMap[String(item.productId)];
                return {
                  productId: item.productId,
                  packingAmount: Math.max(0, Number(product?.packingAmount || 0)),
                };
              }),
            );
            const commissionAmount = await resolveQuickSellerCommissionAmount(
              sellerId,
              sellerSubtotal,
              enrichedItems,
            );
            // Packing is seller income and not commissionable.
            // Seller coupon discount is funded by seller earnings.
            const sellerReceivable = computeSellerReceivable({
              subtotal: sellerSubtotal,
              commission: commissionAmount,
              packingAmount: packingTotal,
              couponDiscount: discount,
              couponSource,
            });

            return {
              orderType: 'quick',
              parentOrderId: order._id,
              sellerId,
              orderId: order.orderId,
              customer: {
                name: String(req.body?.address?.name || 'Customer').trim() || 'Customer',
                phone: String(req.body?.address?.phone || '').trim(),
              },
              items: sellerItems.map((item) => {
                const product = productMap[String(item.productId)];
                const packingAmount = Math.max(0, Number(product?.packingAmount || 0));
                return {
                  productId: item.productId,
                  name: item.name,
                  price: item.price,
                  quantity: item.quantity,
                  image: item.image,
                  variantName: item.variantName || '',
                  variantKey: item.variantKey || '',
                  variantSku: item.variantSku || '',
                  packingAmount,
                };
              }),
              pricing: {
                subtotal: sellerSubtotal,
                packingAmount: packingTotal,
                commission: commissionAmount,
                total: sellerSubtotal + allocatedDeliveryFee + packingTotal,
                receivable: sellerReceivable,
                couponDiscount: couponSource === 'seller' ? discount : 0,
                couponSource: couponSource || '',
              },
              status: 'pending',
              workflowStatus: 'SELLER_PENDING',
              sellerPendingExpiresAt: new Date(Date.now() + 2 * 60 * 1000),
              address: {
                address: deliveryAddress?.street || '',
                city: deliveryAddress?.city || '',
                ...(deliveryAddress?.state
                  ? { state: deliveryAddress.state }
                  : {}),
                ...(deliveryAddress?.zipCode
                  ? { zipCode: deliveryAddress.zipCode }
                  : {}),
                ...(Array.isArray(deliveryAddress?.location?.coordinates)
                  ? {
                      location: {
                        lat: deliveryAddress.location.coordinates[1],
                        lng: deliveryAddress.location.coordinates[0],
                      },
                    }
                  : {}),
              },
              payment: {
                method: sellerPaymentMode,
              },
            };
          }))
        : [];

    const totalSellerCommission = sellerOrdersResults.reduce((sum, so) => sum + (so.pricing?.commission || 0), 0);
    
    // Update the main order with the total commission
    if (totalSellerCommission > 0) {
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
            'pricing.restaurantCommission': totalSellerCommission,
            platformProfit: platformProfit
          } 
        }
      );
      order.pricing.restaurantCommission = totalSellerCommission;
      order.platformProfit = platformProfit;
    } else if (couponSource === 'admin' && discount > 0) {
      // No commission path — still persist admin-funded coupon cut on platformProfit
      const platformProfit = applyAdminCouponToPlatformProfit(
        Math.max(
          0,
          deliveryFee + Number(pricing.platformFee || 0) - (riderEarning || 0),
        ),
        { discount, couponSource },
      );
      await QuickOrder.updateOne(
        { _id: order._id },
        { $set: { platformProfit } },
      );
      order.platformProfit = platformProfit;
    }

    const sellerOrders = sellerOrdersResults;

    try {
      await foodTransactionService.createInitialTransaction(order);
    } catch (txnErr) {
      logger.error(
        `Quick createInitialTransaction failed for ${order.orderId}: ${txnErr?.message || txnErr}`,
      );
    }

    await QuickCart.findOneAndUpdate(idQuery, { $set: { items: [] } }, { upsert: false });

    emitQuickOrderStatusUpdate(order, 'Quick order placed successfully.');

    if (shouldFanOutSellerOrders) {
      void fanOutQuickSellerOrdersForParent(order).catch((error) => {
        logger.error(`Quick seller order fanout failed for ${order.orderId}: ${error?.message || error}`);
      });
    }

    return res.status(201).json({
      success: true,
      result: normalizeOrderSummary(order),
      razorpay: razorpayPayload,
    });
  } catch (error) {
    logger.error(`Quick placeOrder failed: ${error?.message || error}`);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to place quick order',
    });
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      paymentIntentId,
    } = req.body || {};

    const isValid = verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    );
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    // Preferred path: payment intent (order not created until now)
    let intent = await findPendingQuickPaymentIntent({
      intentId: paymentIntentId || orderId,
      razorpayOrderId: razorpay_order_id,
    });

    if (!intent) {
      const anyIntent = await findQuickPaymentIntentAny({
        intentId: paymentIntentId || orderId,
        razorpayOrderId: razorpay_order_id,
      });
      if (anyIntent?.status === 'completed' && anyIntent.orderMongoId) {
        const existing = await QuickOrder.findById(anyIntent.orderMongoId);
        if (existing) {
          return res.json({
            success: true,
            message: 'Payment already verified',
            result: normalizeOrderSummary(existing),
          });
        }
      }
    }

    if (intent) {
      const { order, alreadyCompleted } = await finalizeQuickPaymentIntent(intent, {
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
      });
      return res.json({
        success: true,
        message: alreadyCompleted
          ? 'Payment already verified'
          : 'Payment verified and order created successfully',
        result: normalizeOrderSummary(order),
      });
    }

    // Legacy / in-flight: order already exists (older clients or COD-era online flow)
    const order = await QuickOrder.findOne({
      $or: [
        { orderId },
        { 'payment.razorpay.orderId': razorpay_order_id },
      ],
    });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Payment session or order not found',
      });
    }

    if (order.payment?.status === 'paid') {
      return res.json({
        success: true,
        message: 'Payment already verified',
        result: normalizeOrderSummary(order),
      });
    }

    order.payment.status = 'paid';
    if (order.payment.razorpay) {
      order.payment.razorpay.paymentId = razorpay_payment_id;
      order.payment.razorpay.signature = razorpay_signature;
    }

    await order.save();

    try {
      const existingTxn = await FoodTransaction.findOne({ orderId: order._id }).select('_id').lean();
      if (!existingTxn) {
        await foodTransactionService.createInitialTransaction(order);
      }
      await foodTransactionService.updateTransactionStatus(order._id, 'captured', {
        status: 'captured',
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        note: 'Quick commerce payment verified',
        recordedByRole: 'USER',
        recordedById: order.userId,
      });
    } catch (txnErr) {
      logger.error(
        `Quick verifyPayment transaction sync failed for ${order.orderId}: ${txnErr?.message || txnErr}`,
      );
    }

    await fanOutQuickSellerOrdersForParent(order);

    return res.json({
      success: true,
      message: 'Payment verified successfully',
      result: normalizeOrderSummary(order),
    });
  } catch (error) {
    logger.error(`Quick verifyPayment failed: ${error?.message || error}`);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Payment verification failed',
    });
  }
};

export const getMyOrders = async (req, res) => {
  const accessQuery = buildOrderAccessQuery(req);

  if (!accessQuery) {
    return res.status(400).json({ success: false, message: 'sessionId or userId is required' });
  }

  const orders = await QuickOrder.find({ ...accessQuery, orderType: 'quick' }).sort({ createdAt: -1 }).lean();

  const sellerIds = [
    ...new Set(
      orders
        .map((order) =>
          String(order?.items?.find((item) => item?.type === 'quick')?.sourceId || order?.items?.[0]?.sourceId || '').trim(),
        )
        .filter((value) => mongoose.Types.ObjectId.isValid(value)),
    ),
  ];

  const sellers = sellerIds.length
    ? await Seller.find({ _id: { $in: sellerIds } }).select('_id name shopName').lean()
    : [];
  const sellerMap = sellers.reduce((acc, seller) => {
    acc[String(seller._id)] = seller;
    return acc;
  }, {});

  const mappedOrders = orders.map((order) => {
    const normalized = normalizeOrderSummary(order);
    const sellerId = String(
      order?.items?.find((item) => item?.type === 'quick')?.sourceId || order?.items?.[0]?.sourceId || '',
    ).trim();
    const seller = sellerMap[sellerId] || null;

    return {
      ...normalized,
      sellerId: seller?._id || null,
      storeName: seller?.shopName || seller?.name || '',
      seller: seller
        ? {
            _id: seller._id,
            name: seller.name || '',
            shopName: seller.shopName || seller.name || 'Store',
          }
        : null,
    };
  });

  return res.json({
    success: true,
    result: mappedOrders,
    results: mappedOrders,
  });
};

export const getOrderById = async (req, res) => {
  try {
    const accessQuery = buildOrderAccessQuery(req);

    if (!accessQuery) {
      return res.status(400).json({ success: false, message: 'sessionId or userId is required' });
    }

    const rawOrderId = String(req.params.orderId || '').trim();
    if (!rawOrderId) {
      return res.status(400).json({ success: false, message: 'orderId is required' });
    }

    const orderIdentityQuery = [{ orderId: rawOrderId }];
    if (mongoose.isValidObjectId(rawOrderId)) {
      orderIdentityQuery.unshift({ _id: rawOrderId });
    }

    const query = {
      orderType: 'quick',
      $and: [
        accessQuery,
        { $or: orderIdentityQuery },
      ],
    };

    const order = await QuickOrder.findOne(query).select('+deliveryOtp').lean();

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const riderId = order?.dispatch?.deliveryPartnerId
      ? String(order.dispatch.deliveryPartnerId)
      : '';
    const userId =
      order?.userId && typeof order.userId === 'object'
        ? String(order.userId._id || order.userId.id || '')
        : String(order?.userId || '');

    const [sellerOrder, feeSettings] = await Promise.all([
      SellerOrder.findOne({ orderId: order.orderId }).lean(),
      getActiveFeeSettings(),
    ]);

    const [seller, rider, customerUser] = await Promise.all([
      sellerOrder?.sellerId
        ? Seller.findById(sellerOrder.sellerId)
            .select('_id name shopName phone phoneLast10 location address shopInfo')
            .lean()
        : Promise.resolve(null),
      riderId && mongoose.Types.ObjectId.isValid(riderId)
        ? Driver.findById(riderId)
            .select('_id name phone vehicleType vehicleNumber avatar profileImage rating totalRatings')
            .lean()
        : Promise.resolve(null),
      userId && mongoose.Types.ObjectId.isValid(userId)
        ? FoodUser.findById(userId).select('_id name phone email').lean()
        : Promise.resolve(null),
    ]);

    const orderWithUser = customerUser
      ? { ...order, userId: customerUser }
      : order;
    const customer = resolveQuickOrderCustomer(orderWithUser, sellerOrder);
    const deliveryAddress = order.deliveryAddress || {};
    const deliveryCoords = Array.isArray(deliveryAddress.location?.coordinates)
      ? {
          lat: Number(deliveryAddress.location.coordinates[1]),
          lng: Number(deliveryAddress.location.coordinates[0]),
        }
      : null;
    const dropOtp = order.deliveryVerification?.dropOtp || {};
    const handoverOtp = String(order.deliveryOtp || '').trim();
    const sellerOrders = sellerOrder ? [sellerOrder] : [];
    const quickOrderItems = Array.isArray(order?.items)
      ? order.items.filter((item) => String(item?.type || '').toLowerCase() === 'quick')
      : [];

    // Legacy order-wide window is resolved only when a line predates policy snapshots.
    const needsLegacyWindow = quickOrderItems.some(
      (item) => !(Number(item?.returnPolicySnapshot?.returnWindowDays) > 0),
    );
    const [legacyWindowHours, existingReturns] = await Promise.all([
      needsLegacyWindow
        ? resolveReturnWindowHoursFromProducts(quickOrderItems, feeSettings)
        : Promise.resolve(Number(feeSettings?.returnWindowHours) || 72),
      SellerReturn.find({ orderId: order.orderId })
        .select('returnStatus returnItems cumulativeReturnItems')
        .lean(),
    ]);

    const returnEligibility = buildOrderReturnEligibility({
      order,
      sellerOrders,
      feeSettings,
      legacyWindowHours,
      priorReturnedMap: buildPriorReturnedQuantityMap(existingReturns),
      itemStatusMap: buildItemReturnStatusMap(existingReturns),
    });

    // Per-item return data is merged into the items the client already renders,
    // so no extra eligibility request is needed.
    const eligibilityByLineKey = new Map(
      returnEligibility.items.map((row) => [row.lineKey, row]),
    );
    const responseItems = (Array.isArray(order?.items) ? order.items : []).map((item) => {
      if (String(item?.type || '').toLowerCase() !== 'quick') return item;
      const row = eligibilityByLineKey.get(resolveOrderItemLineKey(item));
      if (!row) return item;
      return {
        ...item,
        lineKey: row.lineKey,
        returnPolicySnapshot: row.returnPolicySnapshot,
        returnEligible: row.returnEligible,
        returnEligibleUntil: row.returnEligibleUntil,
        returnWindowDays: row.returnWindowDays,
        remainingSeconds: row.remainingSeconds,
        returnedQuantity: row.returnedQuantity,
        remainingReturnableQuantity: row.remainingReturnableQuantity,
        itemReturnStatus: row.itemReturnStatus,
        ineligibleReason: row.ineligibleReason,
      };
    });

    // The raw OTP must never ride along in the order spread; it is re-exposed below
    // as `handoverOtp` only while the drop OTP is still required and unverified.
    const { deliveryOtp: _rawDeliveryOtp, ...orderWithoutSecrets } = order;

    const sellerAddress =
      seller?.location?.formattedAddress ||
      seller?.location?.address ||
      seller?.address ||
      [
        sellerOrder?.address?.address,
        sellerOrder?.address?.city,
        sellerOrder?.address?.state,
        sellerOrder?.address?.zipCode,
      ]
        .filter(Boolean)
        .join(', ') ||
      '';
    const sellerPhone =
      seller?.phone ||
      seller?.phoneLast10 ||
      seller?.shopInfo?.alternatePhone ||
      '';
    const storeName = seller?.shopName || seller?.name || 'Store';
    const riderAssigned =
      String(order?.dispatch?.status || '').toLowerCase() === 'accepted' || Boolean(rider);

    return res.json({
      success: true,
      result: {
        ...orderWithoutSecrets,
        id: order._id,
        _id: order._id,
        orderNumber: order.orderId,
        orderId: order.orderId,
        items: responseItems,
        returnEligibility,
        userId: customerUser || order.userId || null,
        userName: customer.name,
        userPhone: customer.phone || deliveryAddress.phone || '',
        userEmail: customer.email || '',
        customer: {
          name: customer.name,
          phone: customer.phone || deliveryAddress.phone || '',
          email: customer.email || '',
        },
        restaurantName: storeName,
        restaurantPhone: sellerPhone,
        restaurantAddress: sellerAddress || 'Address not available',
        storeName,
        address: {
          type: deliveryAddress.label || 'Other',
          name: deliveryAddress.name || customer.name || '',
          street: deliveryAddress.street || '',
          address: deliveryAddress.street || '',
          city: deliveryAddress.city || '',
          state: deliveryAddress.state || '',
          zipCode: deliveryAddress.zipCode || '',
          phone: deliveryAddress.phone || customer.phone || '',
          email: customer.email || '',
          formattedAddress: [
            deliveryAddress.street,
            deliveryAddress.additionalDetails || deliveryAddress.landmark,
            deliveryAddress.city,
            deliveryAddress.state,
            deliveryAddress.zipCode,
          ]
            .filter(Boolean)
            .join(', '),
          ...(deliveryCoords
            ? {
                location: {
                  lat: deliveryCoords.lat,
                  lng: deliveryCoords.lng,
                  coordinates: [deliveryCoords.lng, deliveryCoords.lat],
                },
              }
            : {}),
        },
        seller: seller
          ? {
              _id: seller._id,
              id: seller._id,
              name: seller.name || storeName,
              shopName: storeName,
              phone: sellerPhone,
              email: seller?.shopInfo?.supportEmail || '',
              address: sellerAddress,
              location: seller.location || null,
            }
          : null,
        sellerOrder: sellerOrder
          ? {
              _id: sellerOrder._id,
              status: sellerOrder.status,
              workflowStatus: sellerOrder.workflowStatus,
              address: sellerOrder.address || null,
              customer: sellerOrder.customer || null,
            }
          : null,
        deliveryPartnerId: rider
          ? {
              _id: rider._id,
              id: rider._id,
              name: rider.name || 'Delivery Partner',
              phone: rider.phone || '',
              vehicleType: rider.vehicleType || '',
              vehicleNumber: rider.vehicleNumber || '',
              avatar: rider.avatar || rider.profileImage || '',
              rating: rider.rating,
              totalRatings: rider.totalRatings,
            }
          : order.dispatch?.deliveryPartnerId || null,
        rider: riderAssigned && rider
          ? {
              _id: rider._id,
              name: rider.name || 'Delivery Partner',
              phone: rider.phone || '',
              vehicleType: rider.vehicleType || '',
              vehicleNumber: rider.vehicleNumber || '',
            }
          : null,
        payment: order.payment || {},
        paymentMethod: order.payment?.method || '',
        paymentStatus: order.payment?.status || '',
        cancellationReason: resolveQuickOrderCancellationReason(order, sellerOrder),
        cancelMessage:
          order?.payment?.refund?.reason ||
          resolveQuickOrderCancellationReason(order, sellerOrder) ||
          '',
        deliveryVerification: {
          ...(order.deliveryVerification || {}),
          dropOtp: {
            required: Boolean(dropOtp.required),
            verified: Boolean(dropOtp.verified),
          },
        },
        ...(dropOtp.required && !dropOtp.verified && handoverOtp
          ? { handoverOtp }
          : {}),
      },
    });
  } catch (error) {
    logger.error(`Quick getOrderById failed: ${error?.message || error}`);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to load quick order',
    });
  }
};

export const cancelOrder = async (req, res) => {
  try {
    const accessQuery = buildOrderAccessQuery(req);

    if (!accessQuery) {
      return res.status(400).json({ success: false, message: 'sessionId or userId is required' });
    }

    const rawOrderId = String(req.params.orderId || '').trim();
    if (!rawOrderId) {
      return res.status(400).json({ success: false, message: 'orderId is required' });
    }

    const orderIdentityQuery = [{ orderId: rawOrderId }];
    if (mongoose.isValidObjectId(rawOrderId)) {
      orderIdentityQuery.unshift({ _id: rawOrderId });
    }

    const query = {
      orderType: 'quick',
      $and: [
        accessQuery,
        { $or: orderIdentityQuery },
      ],
    };

    const order = await QuickOrder.findOne(query);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const currentStatus = String(order.orderStatus || '').toLowerCase();
    if (['delivered', 'cancelled_by_user', 'cancelled_by_restaurant', 'cancelled_by_admin'].includes(currentStatus)) {
      return res.status(400).json({
        success: false,
        message: currentStatus === 'delivered' ? 'Delivered orders cannot be cancelled' : 'Order is already cancelled',
      });
    }

    const cancellationReason = String(req.body?.reason || 'Quick commerce order cancelled by user').trim();
    const paymentMethod = String(order.payment?.method || '').trim().toLowerCase();
    const requestedRefundTo =
      paymentMethod === 'wallet'
        ? 'wallet'
        : req.body?.refundTo === 'wallet' || req.body?.refundTo === 'gateway'
          ? req.body.refundTo
          : 'gateway';

    order.orderStatus = 'cancelled_by_user';
    order.workflowStatus = 'CANCELLED';
    order.statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : [];
    order.statusHistory.push({
      byRole: 'USER',
      from: currentStatus || '',
      to: 'cancelled_by_user',
      note: cancellationReason,
    });

    if (order.payment?.method === 'cash' && order.payment?.status !== 'paid') {
      order.payment.status = 'failed';
    }

    const refundResult = await processQuickOrderRefund(order, {
      refundTo: requestedRefundTo,
      cancelledBy: 'user',
      reason: cancellationReason,
    });

    await restoreQuickOrderItemsStock(order.items);

    try {
      await releaseQuickCouponOnCancel(order);
    } catch (couponReleaseErr) {
      logger.warn(
        `Quick cancelOrder coupon release failed for ${order.orderId}: ${couponReleaseErr?.message || couponReleaseErr}`,
      );
    }

    await order.save();

    try {
      const isOnlinePaid =
        String(order.payment?.status || '').toLowerCase() === 'paid' ||
        String(order.payment?.status || '').toLowerCase() === 'refunded';
      await foodTransactionService.updateTransactionStatus(order._id, 'cancelled_by_user', {
        status:
          order.payment?.status === 'refunded'
            ? 'refunded'
            : isOnlinePaid
              ? 'captured'
              : 'failed',
        note: cancellationReason,
        recordedByRole: 'USER',
        recordedById: order.userId,
      });
    } catch (txnErr) {
      logger.warn(
        `Quick cancelOrder transaction sync failed for ${order.orderId}: ${txnErr?.message || txnErr}`,
      );
    }

    await SellerOrder.updateMany(
      {
        orderId: order.orderId,
        status: { $nin: ['cancelled', 'delivered'] },
      },
      {
        $set: {
          status: 'cancelled',
          workflowStatus: 'CANCELLED',
          cancellationReason,
        },
      },
    );

    const cancellationMessage =
      refundResult?.message || 'Quick order cancelled successfully.';
    emitQuickOrderStatusUpdate(order, cancellationMessage);

    return res.json({
      success: true,
      message: cancellationMessage,
      refund: refundResult || null,
      result: {
        id: order._id,
        _id: order._id,
        orderId: order.orderId,
        orderNumber: order.orderId,
        status: order.orderStatus,
        payment: order.payment || {},
      },
    });
  } catch (error) {
    logger.error(`Quick cancelOrder failed: ${error?.message || error}`);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to cancel quick order',
    });
  }
};

export async function submitOrderRatingsController(req, res, next) {
  try {
    const userId = req.user?.userId;
    const orderId = req.params.orderId;
    const dto = validateOrderRatingsDto(req.body);
    const order = await orderService.submitOrderRatings(orderId, userId, dto);
    return sendResponse(res, 200, 'Ratings submitted successfully', { order });
  } catch (err) {
    next(err);
  }
};

