import mongoose from 'mongoose';
import { logger } from '../../../utils/logger.js';
import { getIO, rooms } from '../../../config/socket.js';
import { Seller } from '../seller/models/seller.model.js';
import { SellerOrder } from '../seller/models/sellerOrder.model.js';
import { SellerTransaction } from '../seller/models/sellerTransaction.model.js';
import { QuickOrder } from '../models/order.model.js';
import { Driver } from '../../../core/models/driver.model.js';
import {
  pushStatusHistory,
  notifyOwnerSafely,
  notifyOwnersSafely,
  buildDeliverySocketPayload,
  enqueueOrderEvent,
  isStatusAdvance,
  haversineKm,
} from '../../food/orders/services/order.helpers.js';
import { tryAutoAssign } from '../../food/orders/services/order-dispatch.service.js';
import * as foodTransactionService from '../../food/orders/services/foodTransaction.service.js';
import { ValidationError, NotFoundError } from '../../../core/auth/errors.js';
import { emitQuickCommerceStatusUpdate } from './quickStatusRealtime.service.js';
import { processQuickOrderRefund } from './quickRefund.service.js';
import { restoreQuickOrderItemsStock } from '../utils/stock.helpers.js';
import { isQuickOrderVisibleToSeller } from '../utils/sellerOrderVisibility.helpers.js';
import {
  consumeQuickCouponOnDeliver,
  releaseQuickCouponOnCancel,
} from './quickCouponUsage.service.js';
import { computeSellerCancelPackingCredit } from '../utils/sellerEarnings.helpers.js';

/**
 * Status mapping from SellerOrder to Parent QuickOrder (FoodOrder)
 */
const SELLER_TO_PARENT_STATUS_MAP = {
  pending: "placed",
  confirmed: "confirmed",
  packed: "preparing",
  ready_for_pickup: "ready_for_pickup",
  out_for_delivery: "picked_up",
  delivered: "delivered",
  cancelled: "cancelled_by_restaurant",
};

/**
 * Workflow status mapping for parent order
 */
const SELLER_TO_WORKFLOW_MAP = {
  pending: "SELLER_PENDING",
  confirmed: "SELLER_ACCEPTED",
  packed: "PICKUP_READY", // Or stay in SELLER_ACCEPTED until ready
  ready_for_pickup: "PICKUP_READY",
  out_for_delivery: "OUT_FOR_DELIVERY",
  delivered: "DELIVERED",
  cancelled: "CANCELLED",
};

/**
 * Main service for Quick Commerce Order lifecycle
 */
export const updateSellerOrderStatus = async (sellerOrderId, sellerId, nextStatus, reason = '') => {
  const isId = mongoose.Types.ObjectId.isValid(sellerOrderId);
  const sellerOrder = await SellerOrder.findOne({
    sellerId,
    $or: [
      ...(isId ? [{ _id: sellerOrderId }] : []),
      { orderId: sellerOrderId }
    ]
  });
  if (!sellerOrder) throw new NotFoundError('Seller order not found');

  const parentOrder = sellerOrder.parentOrderId
    ? await QuickOrder.findById(sellerOrder.parentOrderId)
    : await QuickOrder.findOne({
        orderType: { $in: ['quick', 'mixed'] },
        orderId: sellerOrder.orderId,
      });

  if (parentOrder && !isQuickOrderVisibleToSeller(parentOrder)) {
    throw new ValidationError('Payment is not completed for this order yet');
  }

  const currentStatus = sellerOrder.status;
  if (currentStatus === nextStatus) return sellerOrder;

  // 1. Update SellerOrder
  sellerOrder.status = nextStatus;
  sellerOrder.workflowStatus = SELLER_TO_WORKFLOW_MAP[nextStatus] || sellerOrder.workflowStatus;
  if (nextStatus === 'delivered') sellerOrder.deliveredAt = new Date();
  if (nextStatus === 'cancelled' && reason) {
    sellerOrder.cancellationReason = reason;
  }
  await sellerOrder.save();

  // 1b. Earnings credit: create/upsert an "Order Payment" transaction once delivered.
  // This is idempotent (unique by sellerId + orderId + type).
  if (nextStatus === 'delivered') {
    const packingAmount = Math.max(0, Number(sellerOrder?.pricing?.packingAmount || 0));
    const receivableRaw =
      Number(sellerOrder?.pricing?.receivable) ||
      Math.max(
        0,
        Number(sellerOrder?.pricing?.subtotal || 0) -
          Number(sellerOrder?.pricing?.commission || 0) +
          packingAmount,
      );
    const receivable = Number.isFinite(receivableRaw) ? Math.max(0, receivableRaw) : 0;

    if (receivable > 0) {
      try {
        await SellerTransaction.findOneAndUpdate(
          { sellerId, type: 'Order Payment', orderId: sellerOrder.orderId },
          {
            $set: {
              amount: receivable,
              status: 'Settled',
              reference: sellerOrder.orderId,
              customer: sellerOrder?.customer?.name || 'Customer',
              reason: 'Delivered order earnings',
            },
            $setOnInsert: {
              sellerId,
              type: 'Order Payment',
              orderId: sellerOrder.orderId,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
      } catch (err) {
        logger.error(
          `[QuickEarnings] Failed to upsert seller transaction for ${sellerOrder.orderId}: ${err?.message || err}`,
        );
      }
    }
  }

  // Seller cancel: packing retained ONLY when seller already accepted AND customer prepaid.
  // Pending decline / timeout → seller earns nothing from packing.
  if (nextStatus === 'cancelled') {
    const wasAcceptedBeforeCancel = [
      'confirmed',
      'packed',
      'ready_for_pickup',
      'out_for_delivery',
    ].includes(String(currentStatus || '').toLowerCase());
    const packingFromLeg = computeSellerCancelPackingCredit(sellerOrder?.pricing || {});
    const packingFromParent = Math.max(0, Number(parentOrder?.pricing?.packagingFee || 0));
    const packingAmount = packingFromLeg > 0 ? packingFromLeg : packingFromParent;

    const payMethod = String(parentOrder?.payment?.method || sellerOrder?.payment?.method || '')
      .trim()
      .toLowerCase();
    const payStatus = String(parentOrder?.payment?.status || '')
      .trim()
      .toLowerCase();
    const isCod = ['cash', 'cod', 'cash_on_delivery'].includes(payMethod);
    const isPrepaidPaid =
      !isCod &&
      ['paid', 'captured', 'refunded'].includes(payStatus);

    // Keep packing + commission visible; receivable is packing only when prepaid+accepted, else 0.
    if (!sellerOrder.pricing) sellerOrder.pricing = {};
    if (!Number(sellerOrder.pricing.packingAmount) && packingAmount > 0) {
      sellerOrder.pricing.packingAmount = packingAmount;
    }
    sellerOrder.pricing.receivable =
      wasAcceptedBeforeCancel && isPrepaidPaid ? packingAmount : 0;
    sellerOrder.markModified('pricing');
    await sellerOrder.save();

    if (wasAcceptedBeforeCancel && isPrepaidPaid && packingAmount > 0) {
      try {
        await SellerTransaction.findOneAndUpdate(
          { sellerId, type: 'Order Payment', orderId: sellerOrder.orderId },
          {
            $set: {
              amount: packingAmount,
              status: 'Settled',
              reference: sellerOrder.orderId,
              customer: sellerOrder?.customer?.name || 'Customer',
              reason: 'Packing fee retained on seller cancel (prepaid)',
            },
            $setOnInsert: {
              sellerId,
              type: 'Order Payment',
              orderId: sellerOrder.orderId,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
      } catch (err) {
        logger.error(
          `[QuickEarnings] Failed to credit packing on cancel for ${sellerOrder.orderId}: ${err?.message || err}`,
        );
      }
    } else {
      // Pending decline / timeout / COD cancel must not leave settled packing earnings.
      try {
        await SellerTransaction.deleteMany({
          sellerId,
          type: 'Order Payment',
          orderId: sellerOrder.orderId,
          reason: { $regex: /packing fee retained on seller cancel/i },
        });
      } catch (_) {
        /* ignore */
      }
    }
  }

  // 2. Sync Parent Order
  if (parentOrder) {
    const parentNextStatus = SELLER_TO_PARENT_STATUS_MAP[nextStatus];
    const fromStatus = parentOrder.orderStatus;

    if (parentNextStatus) {
      const fromStatus = parentOrder.orderStatus;
      const shouldUpdateParentStatus = parentOrder.orderType !== 'mixed' || isStatusAdvance(fromStatus, parentNextStatus);

      if (shouldUpdateParentStatus) {
        parentOrder.orderStatus = parentNextStatus;
      }
      parentOrder.workflowStatus =
        SELLER_TO_WORKFLOW_MAP[nextStatus] || parentOrder.workflowStatus;

      pushStatusHistory(parentOrder, {
        byRole: 'SELLER',
        byId: sellerId,
        from: fromStatus,
        to: parentOrder.orderStatus,
        note: reason ? `Seller cancelled order: ${reason}` : (parentOrder.orderType === 'mixed' 
          ? `Seller updated mixed-order leg to ${nextStatus}`
          : `Seller updated status to ${nextStatus}`),
      });

      // If cancelled -> handle refund and stock restore
      let cancelRefundResult = null;
      if (nextStatus === 'cancelled') {
        const wasPending = String(currentStatus || '').toLowerCase() === 'pending';
        const reasonText = String(reason || '').trim();
        const looksLikeTimeout = /did not accept|timed out|timeout|auto-?cancel/i.test(reasonText);
        const cancelledBy = wasPending && looksLikeTimeout ? 'timeout' : 'seller';
        const retainPacking = !wasPending;
        cancelRefundResult = await handleSellerOrderCancellation(parentOrder, reasonText, {
          cancelledBy,
          retainPacking,
        });
        void emitQuickCommerceStatusUpdate(parentOrder, {
          message: cancelRefundResult?.message || 'Order cancelled by the store.',
          sellerId,
          sellerStatus: sellerOrder.status,
          sellerWorkflowStatus: sellerOrder.workflowStatus,
        });
      } else {
        void emitQuickCommerceStatusUpdate(parentOrder, {
          sellerId,
          sellerStatus: sellerOrder.status,
          sellerWorkflowStatus: sellerOrder.workflowStatus,
        });
      }

      await parentOrder.save();

      if (nextStatus === 'delivered') {
        try {
          await consumeQuickCouponOnDeliver(parentOrder);
        } catch (couponErr) {
          logger.error(
            `[QuickCoupon] consume on deliver failed for ${parentOrder.orderId}: ${couponErr?.message || couponErr}`,
          );
        }
      }

      // Handle Side Effects (Post-Save to avoid race conditions)
      const isAcceptedStatus = ['confirmed', 'preparing', 'packed', 'ready_for_pickup', 'out_for_delivery'].includes(nextStatus);
      const isDispatchUnassigned = !parentOrder.dispatch?.status || parentOrder.dispatch.status === 'unassigned';

      if (isAcceptedStatus && isDispatchUnassigned) {
        logger.info(`[QuickDispatch] Triggering dispatch for order ${parentOrder.orderId} (Status: ${nextStatus})`);
        void triggerQuickOrderDispatch(parentOrder._id, sellerId).catch((err) =>
          logger.error(`[QuickDispatch] Trigger failed: ${err.message}`),
        );
      }

      if (nextStatus === 'ready_for_pickup') {
        const assignedId = parentOrder.dispatch?.deliveryPartnerId;
        if (assignedId) {
          const seller = await Seller.findById(sellerId).select('shopName').lean();
          const io = getIO();
          const payload = buildDeliverySocketPayload(parentOrder, seller);
          io.to(rooms.delivery(assignedId)).emit('order_ready', payload);
        }
      }

      // FCM Notification to User (cancel uses refund-aware message)
      if (nextStatus === 'cancelled') {
        await notifyOwnerSafely(
          { ownerType: 'USER', ownerId: parentOrder.userId },
          {
            title: 'Order Cancelled',
            body:
              cancelRefundResult?.message ||
              `Your order #${parentOrder.orderId} was cancelled by the store.`,
            data: {
              type: 'order_status_update',
              orderId: parentOrder.orderId,
              orderMongoId: parentOrder._id.toString(),
              orderStatus: parentOrder.orderStatus,
            },
          },
        );
      } else {
        await notifyOwnerSafely(
          { ownerType: 'USER', ownerId: parentOrder.userId },
          {
            title: `Order Update: ${nextStatus.replace(/_/g, ' ')}`,
            body: `Your order #${parentOrder.orderId} from ${sellerOrder.items?.[0]?.name || 'the store'} is now ${nextStatus.replace(/_/g, ' ')}.`,
            data: {
              type: 'order_status_update',
              orderId: parentOrder.orderId,
              orderMongoId: parentOrder._id.toString(),
            },
          },
        );
      }
    }
  }

  return sellerOrder;
};

const handleSellerOrderCancellation = async (
  parentOrder,
  reason = '',
  { cancelledBy = 'seller', retainPacking = true } = {},
) => {
  const refundResult = await processQuickOrderRefund(parentOrder, {
    refundTo: 'gateway',
    cancelledBy,
    reason,
    retainPacking: Boolean(retainPacking),
  });

  await restoreQuickOrderItemsStock(parentOrder.items);

  try {
    await releaseQuickCouponOnCancel(parentOrder);
  } catch (couponErr) {
    logger.warn(
      `[QuickCoupon] release on seller cancel failed for ${parentOrder.orderId}: ${couponErr?.message || couponErr}`,
    );
  }

  // Admin earns nothing on seller-cancelled QC orders.
  // Keep restaurantCommission on the order for audit/display (what would have been charged).
  try {
    parentOrder.platformProfit = 0;
  } catch (_) {
    /* ignore */
  }

  try {
    await foodTransactionService.updateTransactionStatus(
      parentOrder._id,
      'cancelled_by_restaurant',
      {
        status:
          parentOrder.payment?.status === 'refunded'
            ? 'refunded'
            : String(parentOrder.payment?.status || '').toLowerCase() === 'paid'
              ? 'captured'
              : 'failed',
        note: reason ? `Cancelled by seller: ${reason}` : 'Cancelled by seller',
        recordedByRole: cancelledBy === 'timeout' ? 'SYSTEM' : 'SELLER',
        zeroPlatformEarnings: true,
        packingRetainedBySeller: retainPacking
          ? Math.max(0, Number(parentOrder?.pricing?.packagingFee || 0))
          : 0,
      },
    );
  } catch (err) {
    logger.error(`Transaction update failed for Quick Order ${parentOrder.orderId}:`, err);
  }

  return refundResult;
};

export const syncSellerOrderFromDelivery = async (parentOrderId, deliveryStatus) => {
  const nextSellerStatus = deliveryStatus === 'picked_up' ? 'out_for_delivery' : (deliveryStatus === 'delivered' ? 'delivered' : null);
  if (!nextSellerStatus) return;

  const deliveredStamp = nextSellerStatus === 'delivered' ? new Date() : null;

  const parent = await QuickOrder.findById(parentOrderId).select('_id orderId').lean();
  if (!parent) return;

  // Backward compatibility: older quick seller orders were created without parentOrderId.
  // Sync by parentOrderId (new) OR by orderId (old), and backfill parentOrderId where missing.
  const syncResults = await Promise.all([
    SellerOrder.find({
      $or: [
        { parentOrderId },
        { orderId: parent.orderId, $or: [{ parentOrderId: null }, { parentOrderId: { $exists: false } }] }
      ]
    }),
    SellerOrder.updateMany(
      { parentOrderId },
      {
        $set: {
          status: nextSellerStatus,
          workflowStatus: SELLER_TO_WORKFLOW_MAP[nextSellerStatus],
          ...(deliveredStamp ? { deliveredAt: deliveredStamp } : {}),
        },
      },
    ),
    SellerOrder.updateMany(
      { orderId: parent.orderId, $or: [{ parentOrderId: null }, { parentOrderId: { $exists: false } }] },
      {
        $set: {
          parentOrderId: parent._id,
          status: nextSellerStatus,
          workflowStatus: SELLER_TO_WORKFLOW_MAP[nextSellerStatus],
          ...(deliveredStamp ? { deliveredAt: deliveredStamp } : {}),
        },
      },
    ),
  ]);

  // If delivered -> Ensure earnings are credited for each affected seller leg
  if (nextSellerStatus === 'delivered') {
    const parentFull = await QuickOrder.findById(parentOrderId);
    if (parentFull) {
      try {
        await consumeQuickCouponOnDeliver(parentFull);
      } catch (couponErr) {
        logger.error(
          `[QuickCoupon] consume on delivery sync failed for ${parent.orderId}: ${couponErr?.message || couponErr}`,
        );
      }
    }

    const affectedSellerOrders = syncResults[0] || [];
    for (const so of affectedSellerOrders) {
      const packingAmount = Math.max(0, Number(so?.pricing?.packingAmount || 0));
      const receivableRaw =
        Number(so?.pricing?.receivable) ||
        Math.max(
          0,
          Number(so?.pricing?.subtotal || 0) -
            Number(so?.pricing?.commission || 0) +
            packingAmount,
        );
      const receivable = Number.isFinite(receivableRaw) ? Math.max(0, receivableRaw) : 0;

      if (receivable > 0) {
        try {
          await SellerTransaction.findOneAndUpdate(
            { sellerId: so.sellerId, type: 'Order Payment', orderId: so.orderId },
            {
              $set: {
                amount: receivable,
                status: 'Settled',
                reference: so.orderId,
                customer: so?.customer?.name || 'Customer',
              },
              $setOnInsert: {
                sellerId: so.sellerId,
                type: 'Order Payment',
                orderId: so.orderId,
                reason: '',
              },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
          );
        } catch (err) {
          logger.error(
            `[QuickEarningsSync] Failed to upsert seller transaction for ${so.orderId}: ${err?.message || err}`,
          );
        }
      }
    }
  }
};

export const triggerQuickOrderDispatch = async (parentOrderId, sellerId) => {
  try {
    logger.info(`[QuickDispatch] Delegating dispatch for order ${parentOrderId} to unified engine`);
    await tryAutoAssign(parentOrderId, { attempt: 1, quickSellerId: sellerId });
  } catch (error) {
    logger.error(`[QuickDispatch] Delegation failed for order ${parentOrderId}: ${error.message}`);
  }
};

export const getSellerLocation = (seller) => {
  if (Array.isArray(seller?.location?.coordinates) && seller.location.coordinates.length === 2) {
    return { lat: Number(seller.location.coordinates[1]), lng: Number(seller.location.coordinates[0]) };
  }
  if (Number.isFinite(Number(seller?.location?.latitude)) && Number.isFinite(Number(seller?.location?.longitude))) {
    return { lat: Number(seller.location.latitude), lng: Number(seller.location.longitude) };
  }
  return null;
};

export const getOrderAddressPoint = (order) => {
  // FoodOrder/QuickOrder schema uses deliveryAddress.location.coordinates [lng, lat]
  if (order?.deliveryAddress?.location?.coordinates?.length === 2) {
    const [lng, lat] = order.deliveryAddress.location.coordinates;
    return { lat: Number(lat), lng: Number(lng) };
  }
  // Client-supplied deliveryAddress may carry {lat,lng} or latitude/longitude
  // instead of GeoJSON (quick-commerce checkout sends location: {lat, lng}).
  const candidates = [
    [order?.deliveryAddress?.location?.lat, order?.deliveryAddress?.location?.lng],
    [order?.deliveryAddress?.latitude, order?.deliveryAddress?.longitude],
    [order?.address?.location?.lat, order?.address?.location?.lng],
    [order?.location?.lat, order?.location?.lng]
  ];
  for (const [rawLat, rawLng] of candidates) {
    const lat = Number(rawLat);
    const lng = Number(rawLng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }
  return null;
};

export const listNearbyOnlineDeliveryPartnersByCoords = async (origin, { maxKm = 15, limit = 10 } = {}) => {
  if (!origin?.lat || !origin?.lng) return [];

  const onlinePartners = await Driver.find({
    availabilityStatus: "online",
    authorizedServices: "quick-commerce",
    status: { $in: process.env.NODE_ENV === "production" ? ["approved"] : ["approved", "pending"] },
  })
    .select("_id name phone status lastLat lastLng")
    .lean();
  const STALE_GPS_MS = 10 * 60 * 1000;
  const scored = onlinePartners
    .map((partner) => {
      const lat = Number(partner.lastLat);
      const lng = Number(partner.lastLng);
      // Fallback: if lastLocationAt is missing, assume it's fresh if we have coordinates (or check if coordinates exist)
      const isStale = partner.lastLocationAt && Date.now() - new Date(partner.lastLocationAt).getTime() > STALE_GPS_MS;

      if (!Number.isFinite(lat) || !Number.isFinite(lng) || isStale) {
        return {
          partnerId: partner._id,
          distanceKm: null,
          score: Number.MAX_SAFE_INTEGER,
          name: partner.name || "Delivery Partner",
          phone: partner.phone || "",
        };
      }

      const d = haversineKm(origin.lat, origin.lng, lat, lng);
      return {
        partnerId: partner._id,
        distanceKm: d,
        score: d,
        name: partner.name || "Delivery Partner",
        phone: partner.phone || "",
      };
    })
    .filter((p) => p.distanceKm !== null && p.distanceKm <= maxKm)
    .sort((a, b) => a.score - b.score);

  return scored.slice(0, limit);
};
