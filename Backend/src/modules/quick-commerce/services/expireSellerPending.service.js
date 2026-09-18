import { logger } from '../../../utils/logger.js';
import { SellerOrder } from '../seller/models/sellerOrder.model.js';
import { QuickOrder } from '../models/order.model.js';
import {
  notifyOwnerSafely,
  pushStatusHistory,
} from '../../food/orders/services/order.helpers.js';
import * as foodTransactionService from '../../food/orders/services/foodTransaction.service.js';
import { emitQuickCommerceStatusUpdate } from './quickStatusRealtime.service.js';
import { processQuickOrderRefund } from './quickRefund.service.js';
import { restoreQuickOrderItemsStock } from '../utils/stock.helpers.js';
import { releaseQuickCouponOnCancel } from './quickCouponUsage.service.js';

export const SELLER_PENDING_TIMEOUT_REASON = 'Seller did not accept the order in time';

/**
 * Auto-cancel QC seller legs that stayed pending past sellerPendingExpiresAt.
 * Full prepaid refund (wallet → wallet, Razorpay → Razorpay). No packing retention.
 */
export async function expireSellerPendingQuickOrders({ limit = 40 } = {}) {
  const now = new Date();
  const expiredLegs = await SellerOrder.find({
    orderType: { $in: ['quick', 'mixed'] },
    status: 'pending',
    sellerPendingExpiresAt: { $ne: null, $lte: now },
  })
    .sort({ sellerPendingExpiresAt: 1 })
    .limit(Math.max(1, Number(limit) || 40))
    .select('_id orderId sellerId parentOrderId')
    .lean();

  if (!expiredLegs.length) {
    return { scanned: 0, cancelled: 0 };
  }

  let cancelled = 0;
  for (const leg of expiredLegs) {
    try {
      const claimed = await SellerOrder.findOneAndUpdate(
        {
          _id: leg._id,
          status: 'pending',
          sellerPendingExpiresAt: { $ne: null, $lte: now },
        },
        {
          $set: {
            status: 'cancelled',
            workflowStatus: 'CANCELLED',
            cancellationReason: SELLER_PENDING_TIMEOUT_REASON,
          },
        },
        { new: true },
      );

      if (!claimed) continue;

      await finalizeSellerPendingTimeoutCancel(claimed);
      cancelled += 1;
    } catch (err) {
      logger.error(
        `[QuickExpire] Failed for seller order ${leg.orderId || leg._id}: ${err?.message || err}`,
      );
    }
  }

  if (cancelled > 0) {
    logger.info(`[QuickExpire] Auto-cancelled ${cancelled}/${expiredLegs.length} expired seller-pending order(s)`);
  }

  return { scanned: expiredLegs.length, cancelled };
}

async function finalizeSellerPendingTimeoutCancel(sellerOrder) {
  const parentOrder = sellerOrder.parentOrderId
    ? await QuickOrder.findById(sellerOrder.parentOrderId)
    : await QuickOrder.findOne({
        orderType: { $in: ['quick', 'mixed'] },
        orderId: sellerOrder.orderId,
      });

  if (!parentOrder) {
    logger.warn(`[QuickExpire] Parent missing for seller order ${sellerOrder.orderId}`);
    return null;
  }

  const currentStatus = String(parentOrder.orderStatus || '').toLowerCase();
  if (['delivered', 'cancelled_by_user', 'cancelled_by_restaurant', 'cancelled_by_admin'].includes(currentStatus)) {
    return parentOrder;
  }

  // Zero packing receivable on timeout — seller never accepted.
  try {
    if (!sellerOrder.pricing) sellerOrder.pricing = {};
    sellerOrder.pricing.receivable = 0;
    sellerOrder.markModified('pricing');
    await sellerOrder.save();
  } catch (_) {
    /* ignore */
  }

  parentOrder.orderStatus = 'cancelled_by_restaurant';
  parentOrder.workflowStatus = 'CANCELLED';
  pushStatusHistory(parentOrder, {
    byRole: 'SYSTEM',
    byId: null,
    from: currentStatus || '',
    to: 'cancelled_by_restaurant',
    note: SELLER_PENDING_TIMEOUT_REASON,
  });

  if (parentOrder.payment?.method === 'cash' && parentOrder.payment?.status !== 'paid') {
    parentOrder.payment.status = 'failed';
  }

  const refundResult = await processQuickOrderRefund(parentOrder, {
    refundTo: 'gateway',
    cancelledBy: 'timeout',
    reason: SELLER_PENDING_TIMEOUT_REASON,
    retainPacking: false,
  });

  await restoreQuickOrderItemsStock(parentOrder.items);

  try {
    await releaseQuickCouponOnCancel(parentOrder);
  } catch (couponErr) {
    logger.warn(
      `[QuickExpire] coupon release failed for ${parentOrder.orderId}: ${couponErr?.message || couponErr}`,
    );
  }

  try {
    parentOrder.platformProfit = 0;
  } catch (_) {
    /* ignore */
  }

  await parentOrder.save();

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
        note: SELLER_PENDING_TIMEOUT_REASON,
        recordedByRole: 'SYSTEM',
        zeroPlatformEarnings: true,
        packingRetainedBySeller: 0,
      },
    );
  } catch (err) {
    logger.error(`[QuickExpire] Transaction update failed for ${parentOrder.orderId}:`, err);
  }

  // Cancel any sibling pending seller legs for the same parent order id.
  try {
    await SellerOrder.updateMany(
      {
        orderId: parentOrder.orderId,
        status: { $nin: ['cancelled', 'delivered'] },
      },
      {
        $set: {
          status: 'cancelled',
          workflowStatus: 'CANCELLED',
          cancellationReason: SELLER_PENDING_TIMEOUT_REASON,
        },
      },
    );
  } catch (_) {
    /* ignore */
  }

  const message =
    refundResult?.message ||
    'Seller did not accept your order in time. Your order has been cancelled.';

  void emitQuickCommerceStatusUpdate(parentOrder, {
    message,
    sellerId: sellerOrder.sellerId,
    sellerStatus: 'cancelled',
    sellerWorkflowStatus: 'CANCELLED',
  });

  await notifyOwnerSafely(
    { ownerType: 'USER', ownerId: parentOrder.userId },
    {
      title: 'Order Cancelled',
      body: message,
      data: {
        type: 'order_status_update',
        orderId: parentOrder.orderId,
        orderMongoId: parentOrder._id.toString(),
        orderStatus: 'cancelled_by_restaurant',
        reason: SELLER_PENDING_TIMEOUT_REASON,
      },
    },
  );

  return parentOrder;
}
