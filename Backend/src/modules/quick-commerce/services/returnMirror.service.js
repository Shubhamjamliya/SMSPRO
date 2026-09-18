import { logger } from '../../../utils/logger.js';
import { QuickOrder } from '../models/order.model.js';
import { SellerOrder } from '../seller/models/sellerOrder.model.js';
import { SellerReturn } from '../seller/models/sellerReturn.model.js';
import {
  ACTIVE_RETURN_STATUSES,
  REFUND_STATUSES,
  RETURN_STATUSES,
} from '../utils/return.helpers.js';

const num = (value) => Number(value || 0);
const round2 = (value) => Math.round(num(value) * 100) / 100;

/**
 * Lifecycle stage weights used to pick a single headline status when an order
 * has more than one return document (multi-seller legacy data).
 */
const RETURN_STAGE_WEIGHT = {
  [RETURN_STATUSES.REQUESTED]: 1,
  [RETURN_STATUSES.APPROVED]: 2,
  [RETURN_STATUSES.PICKUP_ASSIGNED]: 3,
  [RETURN_STATUSES.IN_TRANSIT]: 4,
  [RETURN_STATUSES.RETURNED]: 5,
  [RETURN_STATUSES.REFUND_COMPLETED]: 6,
};

const TERMINAL_PREFERENCE = [
  RETURN_STATUSES.REFUND_COMPLETED,
  RETURN_STATUSES.REJECTED,
  RETURN_STATUSES.CANCELLED,
];

const isActive = (status) => ACTIVE_RETURN_STATUSES.has(String(status || ''));

/**
 * Collapse every return on an order into the one status the order should show.
 *
 * An in-flight return always wins over a finished one so a re-opened return is
 * never hidden behind an older completed/cancelled cycle.
 */
export const resolveOrderLevelReturnStatus = (returnDocs = []) => {
  const docs = (returnDocs || []).filter(Boolean);
  if (!docs.length) return '';

  const active = docs.filter((doc) => isActive(doc.returnStatus));
  if (active.length) {
    return active.reduce((best, doc) => {
      const bestWeight = RETURN_STAGE_WEIGHT[String(best?.returnStatus || '')] || 0;
      const weight = RETURN_STAGE_WEIGHT[String(doc?.returnStatus || '')] || 0;
      return weight > bestWeight ? doc : best;
    }, active[0]).returnStatus;
  }

  for (const preferred of TERMINAL_PREFERENCE) {
    if (docs.some((doc) => String(doc.returnStatus || '') === preferred)) return preferred;
  }

  return String(docs[0].returnStatus || '');
};

const resolveHistoryDate = (returnDoc, actions = []) => {
  const history = Array.isArray(returnDoc?.returnHistory) ? returnDoc.returnHistory : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    const action = String(entry?.action || '').toUpperCase();
    const toStatus = String(entry?.toStatus || '');
    if (actions.includes(action) || actions.includes(toStatus)) return entry?.at || null;
  }
  return null;
};

const resolveRefundedAt = (returnDoc) => {
  const audit = Array.isArray(returnDoc?.refundAuditLog) ? returnDoc.refundAuditLog : [];
  for (let index = audit.length - 1; index >= 0; index -= 1) {
    if (String(audit[index]?.action || '') === 'REFUND_COMPLETED') return audit[index]?.at || null;
  }
  return null;
};

/**
 * Build the SellerOrder.returnSummary payload for a single return document.
 *
 * `sellerDeductedAmount` reflects money actually recovered from the seller, so
 * it stays 0 until the refund clears — a pending refund must not reduce the
 * seller's earnings.
 */
export const buildSellerOrderReturnSummary = (returnDoc, sellerOrder = null) => {
  if (!returnDoc) {
    return {
      hasReturn: false,
      returnId: null,
      returnStatus: '',
      refundStatus: '',
      refundMethod: '',
      returnReason: '',
      returnRejectedReason: '',
      refundAmount: 0,
      refundedAmount: 0,
      sellerDeductedAmount: 0,
      pickupFeeAdminExpense: 0,
      returnedItemCount: 0,
      returnedQuantity: 0,
      netReceivable: round2(sellerOrder?.pricing?.receivable),
      requestedAt: null,
      decidedAt: null,
      returnedAt: null,
      refundedAt: null,
      syncedAt: new Date(),
    };
  }

  const returnStatus = String(returnDoc.returnStatus || '');
  const refundStatus = String(returnDoc.refundStatus || REFUND_STATUSES.NONE);
  const refundAmount = round2(returnDoc.returnRefundAmount);
  const refundCompleted = refundStatus === REFUND_STATUSES.COMPLETED;

  const finance = returnDoc.finance || {};
  const sellerDeductedAmount = finance.sellerLedgerApplied
    ? round2(num(finance.preSettlementDeducted) + num(finance.postSettlementDebited))
    : 0;

  const items = Array.isArray(returnDoc.returnItems) ? returnDoc.returnItems : [];
  const returnedQuantity = items.reduce(
    (sum, item) => sum + num(item?.returnedQty || item?.quantity),
    0,
  );

  const receivable = round2(sellerOrder?.pricing?.receivable);

  return {
    hasReturn: true,
    returnId: returnDoc._id || null,
    returnStatus,
    refundStatus,
    refundMethod: String(returnDoc.refundMethod || ''),
    returnReason: String(returnDoc.returnReason || ''),
    returnRejectedReason: String(returnDoc.returnRejectedReason || ''),
    refundAmount,
    refundedAmount: refundCompleted ? refundAmount : 0,
    sellerDeductedAmount,
    pickupFeeAdminExpense: round2(finance.pickupFeeAdminExpense),
    returnedItemCount: items.length,
    returnedQuantity,
    netReceivable: round2(Math.max(0, receivable - sellerDeductedAmount)),
    requestedAt: returnDoc.returnRequestedAt || null,
    decidedAt: resolveHistoryDate(returnDoc, [
      'SELLER_APPROVED',
      'SELLER_REJECTED',
      RETURN_STATUSES.APPROVED,
      RETURN_STATUSES.REJECTED,
    ]),
    returnedAt:
      returnDoc?.deliveryState?.completedAt ||
      returnDoc?.dispatch?.completedAt ||
      resolveHistoryDate(returnDoc, [RETURN_STATUSES.RETURNED]),
    refundedAt: refundCompleted ? resolveRefundedAt(returnDoc) : null,
    syncedAt: new Date(),
  };
};

/**
 * Recompute every denormalized copy of an order's return state.
 *
 * Covers the parent QuickOrder headline status plus each seller leg's
 * returnSummary, so the seller dashboard, admin returned-orders list and
 * earnings math all read the same numbers. Safe to call repeatedly.
 */
export const syncOrderReturnMirrors = async ({ orderId, returnDoc = null } = {}) => {
  const resolvedOrderId = String(orderId || returnDoc?.orderId || '').trim();
  if (!resolvedOrderId) return { synced: false, reason: 'missing_order_id' };

  try {
    const returns = await SellerReturn.find({ orderId: resolvedOrderId }).lean();
    if (!returns.length) return { synced: false, reason: 'no_returns' };

    const orderLevelStatus = resolveOrderLevelReturnStatus(returns);

    const sellerOrders = await SellerOrder.find({ orderId: resolvedOrderId })
      .select('_id sellerId orderId pricing returnSummary')
      .lean();

    const sellerOrderBySeller = new Map(
      sellerOrders.map((leg) => [String(leg.sellerId), leg]),
    );

    await Promise.all(
      returns.map((row) => {
        const leg = sellerOrderBySeller.get(String(row.sellerId));
        if (!leg) return null;
        return SellerOrder.updateOne(
          { _id: leg._id },
          { $set: { returnSummary: buildSellerOrderReturnSummary(row, leg) } },
        );
      }),
    );

    if (orderLevelStatus) {
      await QuickOrder.updateOne(
        { orderId: resolvedOrderId },
        { $set: { returnStatus: orderLevelStatus } },
      );
    }

    return { synced: true, orderLevelStatus, returnCount: returns.length };
  } catch (error) {
    logger.warn(
      `[ReturnMirror] Failed to sync return mirrors for order ${resolvedOrderId}: ${error?.message || error}`,
    );
    return { synced: false, reason: 'error', error: error?.message || String(error) };
  }
};
