import mongoose from 'mongoose';
import crypto from 'crypto';
import {
  isGenericCustomerLabel,
  resolveQuickOrderCustomer,
} from './customer.helpers.js';
import {
  buildLegacyQuickItemKey,
  buildOrderItemKeyAliases,
  buildQuickOrderLineKey,
  resolveOrderItemLineKey,
} from './quickOrderItem.helpers.js';

export {
  buildLegacyQuickItemKey,
  buildOrderItemKeyAliases,
  buildQuickOrderLineKey,
  resolveOrderItemLineKey,
};

export const RETURN_STATUSES = {
  REQUESTED: 'return_requested',
  APPROVED: 'return_approved',
  REJECTED: 'return_rejected',
  PICKUP_ASSIGNED: 'return_pickup_assigned',
  IN_TRANSIT: 'return_in_transit',
  RETURNED: 'returned',
  REFUND_COMPLETED: 'refund_completed',
  CANCELLED: 'return_cancelled',
};

export const TERMINAL_RETURN_STATUSES = new Set([
  RETURN_STATUSES.REJECTED,
  RETURN_STATUSES.REFUND_COMPLETED,
  RETURN_STATUSES.CANCELLED,
]);

/** One return slot per order — cancelled returns may be retried once. */
export const hasUsedReturnSlot = (returnDocs = []) =>
  (returnDocs || []).some((doc) => {
    const status = String(doc?.returnStatus || '').trim();
    return status && status !== RETURN_STATUSES.CANCELLED;
  });

export const ACTIVE_RETURN_STATUSES = new Set([
  RETURN_STATUSES.REQUESTED,
  RETURN_STATUSES.APPROVED,
  RETURN_STATUSES.PICKUP_ASSIGNED,
  RETURN_STATUSES.IN_TRANSIT,
  RETURN_STATUSES.RETURNED,
]);

export const REFUND_METHODS = new Set(['wallet', 'upi', 'bank']);

export const REFUND_STATUSES = {
  NONE: 'none',
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

export const RETURN_HISTORY_ROLES = new Set([
  'USER',
  'SELLER',
  'ADMIN',
  'DELIVERY_PARTNER',
  'SYSTEM',
]);

export const DEFAULT_RETURN_WINDOW_HOURS = 72;

export const generateReturnOtp = () => String(crypto.randomInt(1000, 9999));

/** calculatedPickupCharge → riderEarning → legacy returnDeliveryCommission */
export const resolveReturnPickupCharge = (returnDoc = {}) => {
  const calculated = Number(returnDoc?.calculatedPickupCharge || 0);
  if (calculated > 0) return calculated;
  const rider = Number(returnDoc?.riderEarning || 0);
  if (rider > 0) return rider;
  return Number(returnDoc?.returnDeliveryCommission || 0);
};

export const normalizeRefundMethod = (value) => String(value || '').trim().toLowerCase();

export const formatRefundMethodLabel = (method) => {
  const normalized = normalizeRefundMethod(method);
  if (normalized === 'wallet') return 'Wallet';
  if (normalized === 'bank') return 'Bank';
  if (normalized === 'upi') return 'UPI';
  return method ? String(method) : 'Not selected';
};

export const formatRefundStatusLabel = (status) => {
  const normalized = String(status || REFUND_STATUSES.NONE).trim().toLowerCase();
  if (normalized === 'none') return 'Not started';
  if (normalized === 'pending') return 'Pending';
  if (normalized === 'processing') return 'Processing';
  if (normalized === 'completed') return 'Completed';
  if (normalized === 'failed') return 'Failed';
  return normalized;
};

export const isQuickCommerceOrderType = (orderType) => ['quick', 'mixed'].includes(String(orderType || '').toLowerCase());

export const isDeliveredOrder = (order) => {
  const status = String(order?.orderStatus || '').toLowerCase();
  const workflow = String(order?.workflowStatus || '').toUpperCase();
  return status === 'delivered' || workflow === 'DELIVERED';
};

/** Last `delivered` transition recorded in the order status history, if any. */
const resolveDeliveredAtFromStatusHistory = (order) => {
  const history = Array.isArray(order?.statusHistory) ? order.statusHistory : [];
  const stamps = history
    .filter((entry) => String(entry?.to || '').toLowerCase() === 'delivered' && entry?.at)
    .map((entry) => new Date(entry.at).getTime())
    .filter((value) => Number.isFinite(value));
  if (!stamps.length) return null;
  return new Date(Math.max(...stamps));
};

/**
 * Immutable delivery instant used for every return-window calculation.
 * `order.updatedAt` is deliberately NOT a fallback: it moves on every later write
 * (return status sync, refund sync) and would silently extend the return window.
 */
export const resolveOrderDeliveredAt = (order, sellerOrders = []) => {
  const fromDeliveryState = order?.deliveryState?.deliveredAt;
  if (fromDeliveryState) return new Date(fromDeliveryState);

  const sellerDelivered = (sellerOrders || [])
    .map((leg) => leg?.deliveredAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  if (sellerDelivered) return new Date(sellerDelivered);

  if (isDeliveredOrder(order)) {
    return resolveDeliveredAtFromStatusHistory(order);
  }

  return null;
};

export const isWithinReturnWindow = (deliveredAt, windowHours = DEFAULT_RETURN_WINDOW_HOURS) => {
  if (!deliveredAt) return false;
  const hours = Number(windowHours);
  const safeHours = Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_RETURN_WINDOW_HOURS;
  const deadline = new Date(deliveredAt).getTime() + safeHours * 60 * 60 * 1000;
  return Date.now() <= deadline;
};

export const computeReturnExpiryAt = (deliveredAt, windowHours = DEFAULT_RETURN_WINDOW_HOURS) => {
  if (!deliveredAt) return null;
  const hours = Number(windowHours);
  const safeHours = Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_RETURN_WINDOW_HOURS;
  return new Date(new Date(deliveredAt).getTime() + safeHours * 60 * 60 * 1000);
};

/**
 * Return-window hours for a single order line.
 *
 * Snapshot wins. Only lines without a snapshot (orders placed before the
 * item-level rollout) fall back to the legacy order-wide window.
 */
export const resolveItemReturnWindowHours = (item, legacyWindowHours = DEFAULT_RETURN_WINDOW_HOURS) => {
  const snapshot = item?.returnPolicySnapshot;
  const snapshotDays = Number(snapshot?.returnWindowDays);
  if (snapshot && Number.isFinite(snapshotDays) && snapshotDays > 0) {
    return { hours: snapshotDays * 24, fromSnapshot: true };
  }
  const legacy = Number(legacyWindowHours);
  return {
    hours: Number.isFinite(legacy) && legacy > 0 ? legacy : DEFAULT_RETURN_WINDOW_HOURS,
    fromSnapshot: false,
  };
};

/**
 * Authoritative per-item return eligibility. This is the only place that decides
 * whether a specific order line can still be returned.
 */
export const buildItemReturnEligibility = ({
  item,
  deliveredAt,
  returnsEnabled = true,
  delivered = false,
  isQc = true,
  legacyWindowHours = DEFAULT_RETURN_WINDOW_HOURS,
  priorReturnedQty = 0,
  now = Date.now(),
}) => {
  const { hours: windowHours, fromSnapshot } = resolveItemReturnWindowHours(item, legacyWindowHours);
  const snapshot = item?.returnPolicySnapshot || null;
  const policyEligible = snapshot ? snapshot.eligible !== false : true;

  const orderedQuantity = Math.max(0, Number(item?.quantity || 0));
  const returnedQuantity = Math.max(0, Number(priorReturnedQty || item?.returnedQuantity || 0));
  const remainingReturnableQuantity = Math.max(0, orderedQuantity - returnedQuantity);

  const expiry = computeReturnExpiryAt(deliveredAt, windowHours);
  const remainingSeconds = deliveredAt && expiry
    ? Math.max(0, Math.floor((expiry.getTime() - now) / 1000))
    : 0;
  const returnWindowExpired = Boolean(deliveredAt && expiry && remainingSeconds <= 0);

  let ineligibleReason = '';
  if (!returnsEnabled) ineligibleReason = 'RETURNS_DISABLED';
  else if (!isQc) ineligibleReason = 'NOT_QUICK_COMMERCE';
  else if (!delivered) ineligibleReason = 'ORDER_NOT_DELIVERED';
  else if (!deliveredAt) ineligibleReason = 'DELIVERY_TIMESTAMP_MISSING';
  else if (!policyEligible) ineligibleReason = 'ITEM_NOT_RETURNABLE';
  else if (returnWindowExpired) ineligibleReason = 'RETURN_WINDOW_EXPIRED';
  else if (remainingReturnableQuantity <= 0) ineligibleReason = 'ALREADY_RETURNED';
  else if (item?.returnSlotUsed) ineligibleReason = 'RETURN_ALREADY_USED';

  return {
    itemId: String(item?.itemId || ''),
    lineKey: resolveOrderItemLineKey(item),
    name: item?.name || '',
    quantity: orderedQuantity,
    price: Number(item?.price || 0),
    variantId: String(item?.variantId || ''),
    variantName: item?.variantName || '',
    categoryId: String(item?.categoryId || ''),
    categoryName: item?.categoryName || '',
    headerId: String(item?.headerId || ''),
    headerName: item?.headerName || '',
    returnPolicySnapshot: snapshot
      ? {
          eligible: snapshot.eligible !== false,
          returnWindowDays: Number(snapshot.returnWindowDays || 0),
          source: snapshot.source || '',
        }
      : null,
    policyFromSnapshot: fromSnapshot,
    returnWindowDays: Math.max(1, Math.round(windowHours / 24)),
    returnWindowHours: windowHours,
    returnEligible: !ineligibleReason,
    returnEligibleUntil: expiry ? expiry.toISOString() : null,
    remainingSeconds,
    returnWindowExpired,
    returnedQuantity,
    remainingReturnableQuantity,
    itemReturnStatus: item?.itemReturnStatus || 'none',
    ineligibleReason,
  };
};

/**
 * Map every order-line identifier to the lifecycle stage of the return it belongs to.
 * Derived live from SellerReturn documents so the value never goes stale.
 */
export const buildItemReturnStatusMap = (returnDocs = []) => {
  const statusByKey = new Map();

  (returnDocs || []).forEach((returnDoc) => {
    const status = String(returnDoc?.returnStatus || '');
    let itemStatus = '';
    if (status === RETURN_STATUSES.REQUESTED) itemStatus = 'requested';
    else if (status === RETURN_STATUSES.APPROVED || status === RETURN_STATUSES.PICKUP_ASSIGNED) itemStatus = 'approved';
    else if (status === RETURN_STATUSES.IN_TRANSIT || status === RETURN_STATUSES.RETURNED) itemStatus = 'returned';
    else if (status === RETURN_STATUSES.REFUND_COMPLETED) itemStatus = 'refunded';
    else if (status === RETURN_STATUSES.REJECTED) itemStatus = 'rejected';
    if (!itemStatus) return;

    (returnDoc?.returnItems || []).forEach((row) => {
      [row?.lineKey, row?.itemId, row?.legacyItemId]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .forEach((key) => statusByKey.set(key, itemStatus));
    });
  });

  return statusByKey;
};

/**
 * Order-level rollup built from independent per-item eligibility.
 * `canReturn` means "at least one line is still returnable" — never a single
 * shared window derived from the longest item policy.
 */
export const buildOrderReturnEligibility = ({
  order,
  sellerOrders = [],
  feeSettings = {},
  legacyWindowHours,
  priorReturnedMap = new Map(),
  itemStatusMap = new Map(),
  returnDocs = [],
  now = Date.now(),
}) => {
  const returnAlreadyUsed = hasUsedReturnSlot(returnDocs);
  const returnsEnabled = feeSettings?.returnsEnabled !== false;
  const isQc = isQuickCommerceOrderType(order?.orderType);
  const delivered = isDeliveredOrder(order);
  const deliveredAt = resolveOrderDeliveredAt(order, sellerOrders);
  const quickItems = getQuickItemsFromOrder(order);

  const fallbackHours = Number(legacyWindowHours) > 0
    ? Number(legacyWindowHours)
    : Number(feeSettings?.returnWindowHours) || DEFAULT_RETURN_WINDOW_HOURS;

  const items = quickItems.map((item) => {
    const row = buildItemReturnEligibility({
      item: returnAlreadyUsed ? { ...item, returnSlotUsed: true } : item,
      deliveredAt,
      returnsEnabled,
      delivered,
      isQc,
      legacyWindowHours: fallbackHours,
      priorReturnedQty: resolvePriorReturnedQtyForItem(item, priorReturnedMap),
      now,
    });

    const liveStatus = buildOrderItemKeyAliases(item)
      .map((alias) => itemStatusMap.get(alias))
      .find(Boolean);
    return liveStatus ? { ...row, itemReturnStatus: liveStatus } : row;
  });

  const anyItemReturnable = !returnAlreadyUsed && items.some((row) => row.returnEligible);
  const expiryStamps = items
    .map((row) => (row.returnEligibleUntil ? new Date(row.returnEligibleUntil).getTime() : null))
    .filter((value) => Number.isFinite(value));

  const earliestExpiryMs = expiryStamps.length ? Math.min(...expiryStamps) : 0;
  const latestExpiryMs = expiryStamps.length ? Math.max(...expiryStamps) : 0;
  const maxWindowHours = items.length
    ? Math.max(...items.map((row) => row.returnWindowHours))
    : fallbackHours;

  // Legacy top-level fields kept for existing clients: they now describe the
  // widest still-open window across the order rather than a single order policy.
  const remainingSeconds = latestExpiryMs ? Math.max(0, Math.floor((latestExpiryMs - now) / 1000)) : 0;

  return {
    canReturn: Boolean(returnsEnabled && isQc && delivered && deliveredAt && anyItemReturnable),
    anyItemReturnable,
    returnAlreadyUsed,
    returnsEnabled,
    deliveredAt: deliveredAt ? new Date(deliveredAt).toISOString() : null,
    earliestExpiryAt: earliestExpiryMs ? new Date(earliestExpiryMs).toISOString() : null,
    latestExpiryAt: latestExpiryMs ? new Date(latestExpiryMs).toISOString() : null,
    returnWindowHours: maxWindowHours,
    returnWindowDays: Math.max(1, Math.round(maxWindowHours / 24)),
    returnExpiryAt: latestExpiryMs ? new Date(latestExpiryMs).toISOString() : null,
    remainingSeconds,
    remainingHours: Math.floor(remainingSeconds / 3600),
    returnWindowExpired: Boolean(deliveredAt && !anyItemReturnable),
    items,
  };
};

/**
 * @deprecated Prefer buildOrderReturnEligibility — kept so existing callers
 * (and any legacy consumer of the flat contract) keep working unchanged.
 */
export const buildReturnEligibilityMeta = ({
  order,
  sellerOrders = [],
  feeSettings = {},
  returnWindowHours: returnWindowHoursOverride,
  priorReturnedMap = new Map(),
  now = Date.now(),
}) =>
  buildOrderReturnEligibility({
    order,
    sellerOrders,
    feeSettings,
    legacyWindowHours: returnWindowHoursOverride,
    priorReturnedMap,
    now,
  });

export const getQuickItemsFromOrder = (order) =>
  (Array.isArray(order?.items) ? order.items : []).filter((item) => String(item?.type || '').toLowerCase() === 'quick');

export const groupQuickItemsBySeller = (quickItems = []) => {
  // @deprecated for current policy — ONE ORDER = ONE SELLER. Kept for backward-compatible reads.
  const buckets = new Map();
  quickItems.forEach((item) => {
    const sellerId = String(item?.sourceId || '').trim();
    if (!sellerId || !mongoose.Types.ObjectId.isValid(sellerId)) return;
    if (!buckets.has(sellerId)) buckets.set(sellerId, []);
    buckets.get(sellerId).push(item);
  });
  return buckets;
};

/**
 * @deprecated Legacy (non variant-safe) identity. Still used to read historical
 * SellerReturn documents; new writes use resolveOrderItemLineKey.
 */
export const buildReturnItemKey = (item) => buildLegacyQuickItemKey(item);

/**
 * Prior returned quantity for an order line, tolerating both the new variant-safe
 * lineKey and the legacy itemId used by returns created before this rollout.
 */
export const resolvePriorReturnedQtyForItem = (item, priorReturnedMap = new Map()) => {
  for (const alias of buildOrderItemKeyAliases(item)) {
    if (priorReturnedMap.has(alias)) return Number(priorReturnedMap.get(alias) || 0);
  }
  return 0;
};

const resolveReturnItemVariantName = (item = {}) =>
  String(item?.variantName || item?.notes || '').trim();

const resolveReturnItemImage = (item = {}) =>
  String(item?.image || item?.mainImage || item?.thumbnail || '').trim();

const normalizeReturnItemForResponse = (item = {}) => {
  const returnedQty = Number(item.returnedQty ?? item.quantity ?? 0);
  const unitPrice = Number(item.unitPrice ?? item.price ?? 0);
  const orderedQty = Number(item.orderedQty ?? item.quantity ?? returnedQty);
  return {
    itemId: item.itemId || '',
    lineKey: item.lineKey || item.itemId || '',
    productId: item.productId || item.itemId || '',
    variantId: item.variantId || '',
    variantName: resolveReturnItemVariantName(item),
    image: resolveReturnItemImage(item),
    notes: String(item.notes || item.variantName || '').trim(),
    name: item.name || '',
    quantity: returnedQty,
    returnedQty,
    orderedQty,
    remainingQty: Number(item.remainingQty ?? Math.max(0, orderedQty - returnedQty)),
    price: unitPrice,
    unitPrice,
    discountShare: Number(item.discountShare || 0),
    couponShare: Number(item.couponShare || 0),
    taxShare: Number(item.taxShare || 0),
    refundAmount: Number(
      item.refundAmount ?? roundMoney(unitPrice * returnedQty),
    ),
  };
};

/**
 * Fill variant/image/ordered qty from the delivered order lines.
 * Existing SellerReturn docs were saved without variantName/image — this keeps
 * seller/admin/customer UIs accurate without a backfill migration.
 */
export const enrichReturnItemsFromOrderItems = (returnItems = [], orderItems = []) => {
  const orderRows = Array.isArray(orderItems) ? orderItems : [];
  const byAlias = new Map();

  orderRows.forEach((row) => {
    const variantName = resolveReturnItemVariantName(row);
    [
      ...buildOrderItemKeyAliases(row),
      resolveOrderItemLineKey(row),
      String(row.productId || ''),
      String(row.itemId || ''),
      `${String(row.name || '').trim()}|${variantName}`,
      `${String(row.name || '').trim()}|${String(row.variantId || '').trim()}`,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .forEach((key) => {
        if (!byAlias.has(key)) byAlias.set(key, row);
      });
  });

  return (Array.isArray(returnItems) ? returnItems : []).map((item) => {
    const variantHint = resolveReturnItemVariantName(item) || String(item.variantId || '').trim();
    const aliases = [
      item.lineKey,
      item.itemId,
      item.productId,
      `${String(item.name || '').trim()}|${variantHint}`,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    let match = aliases.map((key) => byAlias.get(key)).find(Boolean) || null;
    if (!match && item.name) {
      const sameName = orderRows.filter(
        (row) => String(row.name || '').trim() === String(item.name || '').trim(),
      );
      if (sameName.length === 1) {
        match = sameName[0];
      } else if (sameName.length > 1 && variantHint) {
        match =
          sameName.find((row) => {
            const rowVariant = resolveReturnItemVariantName(row) || String(row.variantId || '').trim();
            return rowVariant && rowVariant.toLowerCase() === variantHint.toLowerCase();
          }) || null;
      }
    }

    const variantName = resolveReturnItemVariantName(item) || resolveReturnItemVariantName(match);
    let image = resolveReturnItemImage(item) || resolveReturnItemImage(match);
    if (!image && (item.name || match?.name)) {
      const wantedName = String(item.name || match?.name || '').trim();
      const withImage = orderRows.find(
        (row) =>
          String(row.name || '').trim() === wantedName &&
          (!variantName || resolveReturnItemVariantName(row) === variantName) &&
          resolveReturnItemImage(row),
      );
      if (withImage) image = resolveReturnItemImage(withImage);
    }

    return {
      ...item,
      name: item.name || match?.name || '',
      variantName,
      variantId: String(item.variantId || match?.variantId || '').trim(),
      image,
      notes: String(item.notes || match?.notes || variantName || '').trim(),
      orderedQty: Number(item.orderedQty || match?.quantity || item.quantity || 0),
    };
  });
};

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const normalizeReturnPricingForResponse = (returnDoc = {}) => {
  const pricing = returnDoc?.pricing || {};
  const returnItems = Array.isArray(returnDoc?.returnItems) ? returnDoc.returnItems : [];
  const itemRefundSubtotal = roundMoney(
    returnItems.reduce((sum, item) => sum + Number(item.refundAmount ?? 0), 0),
  );
  const fallbackSubtotal = roundMoney(
    returnItems.reduce(
      (sum, item) => sum + Number(item.unitPrice ?? item.price ?? 0) * Number(item.returnedQty ?? item.quantity ?? 0),
      0,
    ),
  );

  const orderCouponTotal = Number(
    pricing.orderCouponTotal ?? returnDoc?.refundPricing?.orderCouponTotal ?? 0,
  );
  const orderTaxTotal = Number(
    pricing.orderTaxTotal ?? returnDoc?.refundPricing?.orderTaxTotal ?? 0,
  );
  const orderPaidTotal = Number(
    pricing.orderPaidTotal ?? returnDoc?.refundPricing?.orderPaidTotal ?? 0,
  );

  return {
    subtotal: Number(pricing.subtotal ?? fallbackSubtotal),
    couponShare: Number(pricing.couponShare || 0),
    taxShare: Number(pricing.taxShare || 0),
    discountShare: Number(pricing.discountShare || 0),
    deliveryFeeRefunded: Number(pricing.deliveryFeeRefunded || 0),
    platformFeeRefunded: Number(pricing.platformFeeRefunded || 0),
    deliveryFeeRetained: Number(
      pricing.deliveryFeeRetained ??
        Math.max(0, Number(pricing.orderDeliveryFee || 0) - Number(pricing.deliveryFeeRefunded || 0)),
    ),
    platformFeeRetained: Number(
      pricing.platformFeeRetained ??
        Math.max(0, Number(pricing.orderPlatformFee || 0) - Number(pricing.platformFeeRefunded || 0)),
    ),
    orderDeliveryFee: Number(pricing.orderDeliveryFee || 0),
    orderPlatformFee: Number(pricing.orderPlatformFee || 0),
    finalRefundAmount: Number(
      pricing.finalRefundAmount ?? returnDoc?.returnRefundAmount ?? itemRefundSubtotal,
    ),
    pickupFee: resolveReturnPickupCharge(returnDoc),
    orderCouponTotal,
    orderTaxTotal,
    orderPaidTotal,
    totalRefundedAmount: Number(pricing.totalRefundedAmount || 0),
    totalCouponRefunded: Number(pricing.totalCouponRefunded || 0),
    totalTaxRefunded: Number(pricing.totalTaxRefunded || 0),
    remainingCouponAmount: Number(pricing.remainingCouponAmount ?? Math.max(0, orderCouponTotal - Number(pricing.totalCouponRefunded || 0))),
    remainingTaxAmount: Number(pricing.remainingTaxAmount ?? Math.max(0, orderTaxTotal - Number(pricing.totalTaxRefunded || 0))),
    remainingRefundableAmount: Number(
      pricing.remainingRefundableAmount ?? Math.max(0, orderPaidTotal - Number(pricing.totalRefundedAmount || 0)),
    ),
  };
};

export const extractPayoutDetailsFromReturn = (returnDoc) => {
  const history = Array.isArray(returnDoc?.returnHistory) ? returnDoc.returnHistory : [];
  const requestEntry = history.find((entry) => entry?.action === 'RETURN_REQUESTED');
  return requestEntry?.metadata?.payoutDetails || {};
};

export const maskAccountNumber = (accountNumber = '') => {
  const normalized = String(accountNumber || '').replace(/\s/g, '');
  if (!normalized) return '';
  if (normalized.length <= 4) return '****';
  return `${'*'.repeat(Math.min(normalized.length - 4, 8))}${normalized.slice(-4)}`;
};

export const sanitizeRefundAuditMetadata = (metadata = {}) => {
  if (!metadata || typeof metadata !== 'object') return {};
  const next = { ...metadata };
  if (next.payoutDetails && typeof next.payoutDetails === 'object') {
    const payoutDetails = { ...next.payoutDetails };
    const accountNumber = String(payoutDetails.accountNumber || payoutDetails.accountNo || '').trim();
    if (accountNumber) {
      const masked = maskAccountNumber(accountNumber);
      payoutDetails.accountNumber = masked;
      if (payoutDetails.accountNo) payoutDetails.accountNo = masked;
    }
    next.payoutDetails = payoutDetails;
  }
  return next;
};

export const serializePayoutDetailsForDisplay = (returnDoc, { maskSensitive = false } = {}) => {
  const raw = extractPayoutDetailsFromReturn(returnDoc);
  const method = normalizeRefundMethod(returnDoc?.refundMethod);
  if (method === 'wallet') return null;

  const accountNumber = String(raw.accountNumber || raw.accountNo || '').trim();
  const upiId = String(raw.upiId || raw.vpa || '').trim();
  const accountHolderName = String(
    raw.accountHolderName || raw.holderName || raw.name || '',
  ).trim();
  const ifsc = String(raw.ifsc || raw.ifscCode || '').trim().toUpperCase();
  const bankName = String(raw.bankName || raw.bank || '').trim();

  if (!accountHolderName && !accountNumber && !upiId && !ifsc && !bankName) {
    return null;
  }

  return {
    method,
    accountHolderName,
    accountNumber: maskSensitive ? maskAccountNumber(accountNumber) : accountNumber,
    accountNumberMasked: maskAccountNumber(accountNumber),
    ifsc,
    bankName,
    upiId: maskSensitive && upiId.length > 4 ? `${upiId.slice(0, 2)}***${upiId.slice(-2)}` : upiId,
    upiIdMasked: upiId.length > 4 ? `${upiId.slice(0, 2)}***${upiId.slice(-2)}` : upiId,
  };
};

export const serializePickupImageEntriesForResponse = (returnDoc) => {
  const entries = Array.isArray(returnDoc?.pickupImageEntries) ? returnDoc.pickupImageEntries : [];
  if (entries.length) {
    return entries
      .map((entry) => ({
        url: entry?.url || entry?.imageUrl || '',
        uploadedAt: entry?.uploadedAt || entry?.at || null,
        uploadedByRole: entry?.uploadedByRole || 'DELIVERY_PARTNER',
        uploadedById: entry?.uploadedBy ? String(entry.uploadedBy) : null,
        metadata: entry?.metadata || {},
      }))
      .filter((row) => row.url);
  }

  const images = Array.isArray(returnDoc?.pickupImages) ? returnDoc.pickupImages : [];
  return images.map((url, idx) => ({
    url,
    uploadedAt: null,
    uploadedByRole: 'DELIVERY_PARTNER',
    uploadedById: null,
    metadata: { fallbackIndex: idx },
  }));
};

export const resolveReturnLifecycleLabel = (returnDoc = {}) => {
  const status = String(returnDoc?.returnStatus || '').trim();
  const refundStatus = String(returnDoc?.refundStatus || REFUND_STATUSES.NONE).trim().toLowerCase();
  const deliveryStatus = String(returnDoc?.deliveryState?.status || '').trim();
  const quality = String(returnDoc?.qualityCheck?.status || '').trim();
  const dispatchStatus = String(returnDoc?.dispatch?.status || '').trim();

  if (status === RETURN_STATUSES.REJECTED) return 'Rejected';
  if (status === RETURN_STATUSES.CANCELLED) return 'Cancelled';
  if (refundStatus === 'failed') return 'Refund Failed';
  if (refundStatus === 'completed' || status === RETURN_STATUSES.REFUND_COMPLETED) return 'Refund Completed';
  if (refundStatus === 'processing') return 'Refund Processing';
  if (refundStatus === 'pending') return 'Refund Pending';
  if (quality === 'passed' && refundStatus === REFUND_STATUSES.NONE) return 'Quality Check Passed';
  if (status === RETURN_STATUSES.RETURNED) return 'Quality Check';
  if (deliveryStatus === 'picked_up' || deliveryStatus === 'reached_drop') return 'Pickup Completed';
  if (status === RETURN_STATUSES.IN_TRANSIT) return 'Pickup In Progress';
  if (status === RETURN_STATUSES.PICKUP_ASSIGNED) {
    return dispatchStatus === 'accepted' ? 'Pickup In Progress' : 'Pickup Assigned';
  }
  if (status === RETURN_STATUSES.APPROVED) return 'Approved';
  if (status === RETURN_STATUSES.REQUESTED) return 'Requested';
  return status || 'Unknown';
};

export const RETURN_TIMELINE_STEPS = [
  { id: 'return_requested', label: 'Return Requested' },
  { id: 'return_approved', label: 'Approved' },
  { id: 'return_pickup_assigned', label: 'Pickup Assigned' },
  { id: 'return_in_transit', label: 'Rider Coming' },
  { id: 'picked_up', label: 'Picked Up' },
  { id: 'reached_seller', label: 'Reached Seller' },
  { id: 'quality_check', label: 'Quality Check' },
  { id: 'refund_processing', label: 'Refund Processing' },
  { id: 'refund_completed', label: 'Refund Completed' },
];

const normalizeRefundStatusValue = (value) =>
  String(value || REFUND_STATUSES.NONE).trim().toLowerCase();

export const isReturnRefundSettled = (returnDoc = {}) => {
  const refundStatus = normalizeRefundStatusValue(returnDoc?.refundStatus);
  const returnStatus = String(returnDoc?.returnStatus || '').trim();
  return refundStatus === REFUND_STATUSES.COMPLETED || returnStatus === RETURN_STATUSES.REFUND_COMPLETED;
};

/** Refund-phase steps follow refundStatus / returnStatus — same source as Refund Details card. */
export const applyRefundTimelineGuards = (returnDoc = {}, steps = []) => {
  if (!Array.isArray(steps) || !steps.length) return [];

  const refundStatus = normalizeRefundStatusValue(returnDoc?.refundStatus);
  const returnStatus = String(returnDoc?.returnStatus || '').trim();

  if (refundStatus === REFUND_STATUSES.COMPLETED || returnStatus === RETURN_STATUSES.REFUND_COMPLETED) {
    return steps.map((step) => ({ ...step, status: 'completed' }));
  }

  if (refundStatus === REFUND_STATUSES.PENDING || refundStatus === REFUND_STATUSES.PROCESSING) {
    return steps.map((step) => {
      if (step.id === 'quality_check') return { ...step, status: 'completed' };
      if (step.id === 'refund_processing') return { ...step, status: 'active' };
      if (step.id === 'refund_completed') return { ...step, status: 'pending' };
      return step;
    });
  }

  if (refundStatus === REFUND_STATUSES.FAILED) {
    return steps.map((step) => {
      if (step.id === 'quality_check') return { ...step, status: 'completed' };
      if (step.id === 'refund_processing') return { ...step, status: 'rejected' };
      if (step.id === 'refund_completed') return { ...step, status: 'pending' };
      return step;
    });
  }

  return steps;
};

/** Refund steps follow refundStatus — same source of truth as Refund Details card. */
export const resolveReturnTimelineStepStatuses = (returnDoc = {}) => {
  const status = String(returnDoc?.returnStatus || '').trim();
  const refundStatus = normalizeRefundStatusValue(returnDoc?.refundStatus);
  const deliveryStatus = String(returnDoc?.deliveryState?.status || '').trim();
  const quality = String(returnDoc?.qualityCheck?.status || '').trim().toLowerCase();

  if (status === RETURN_STATUSES.REJECTED || status === RETURN_STATUSES.CANCELLED) {
    return RETURN_TIMELINE_STEPS.map(() => 'rejected');
  }

  if (refundStatus === REFUND_STATUSES.COMPLETED || status === RETURN_STATUSES.REFUND_COMPLETED) {
    return RETURN_TIMELINE_STEPS.map(() => 'completed');
  }

  if (refundStatus === REFUND_STATUSES.FAILED) {
    return RETURN_TIMELINE_STEPS.map((_, index) => {
      if (index < 7) return 'completed';
      if (index === 7) return 'rejected';
      return 'pending';
    });
  }

  if (refundStatus === REFUND_STATUSES.PROCESSING || refundStatus === REFUND_STATUSES.PENDING) {
    return RETURN_TIMELINE_STEPS.map((_, index) => {
      if (index < 7) return 'completed';
      if (index === 7) return 'active';
      return 'pending';
    });
  }

  let activeIndex = 0;
  if (quality === 'passed') activeIndex = 7;
  else if (status === RETURN_STATUSES.RETURNED) activeIndex = 6;
  else if (deliveryStatus === 'reached_drop') activeIndex = 5;
  else if (deliveryStatus === 'picked_up') activeIndex = 4;
  else if (status === RETURN_STATUSES.IN_TRANSIT) activeIndex = 3;
  else if (status === RETURN_STATUSES.PICKUP_ASSIGNED) activeIndex = 2;
  else if (status === RETURN_STATUSES.APPROVED) activeIndex = 1;
  else if (status === RETURN_STATUSES.REQUESTED) activeIndex = 0;

  return RETURN_TIMELINE_STEPS.map((_, index) => {
    if (index < activeIndex) return 'completed';
    if (index === activeIndex) return 'active';
    return 'pending';
  });
};

export const serializeReturnTimelineSteps = (returnDoc = {}) => {
  const statuses = resolveReturnTimelineStepStatuses(returnDoc);
  const steps = RETURN_TIMELINE_STEPS.map((step, index) => ({
    id: step.id,
    label: step.label,
    status: statuses[index],
  }));
  return applyRefundTimelineGuards(returnDoc, steps);
};

export const enrichSerializedReturnPricingFromParentOrder = (serialized, parentOrder) => {
  if (!parentOrder?.pricing) return serialized;

  const orderDeliveryFee = Number(parentOrder.pricing.deliveryFee || 0);
  const orderPlatformFee = Number(parentOrder.pricing.platformFee || 0);
  const pricing = serialized.pricing || serialized.refundPricing || {};

  const enrichedPricing = {
    ...pricing,
    orderDeliveryFee,
    orderPlatformFee,
    deliveryFeeRetained: Math.max(
      0,
      orderDeliveryFee - Number(pricing.deliveryFeeRefunded || 0),
    ),
    platformFeeRetained: Math.max(
      0,
      orderPlatformFee - Number(pricing.platformFeeRefunded || 0),
    ),
  };

  return {
    ...serialized,
    pricing: enrichedPricing,
    refundPricing: enrichedPricing,
  };
};

export const enrichSerializedReturnCustomerFromParentOrder = (serialized, parentOrder) => {
  const customer = resolveQuickOrderCustomer(parentOrder);
  const merged = mergeSellerReturnOrderContext(serialized, {
    deliveryAddress: parentOrder?.deliveryAddress,
    orderItems: parentOrder?.items || [],
  });

  return {
    ...merged,
    customer: {
      name: !isGenericCustomerLabel(merged.customer?.name)
        ? merged.customer.name
        : customer.name,
      phone: merged.customer?.phone || customer.phone,
      email: customer.email || '',
    },
  };
};

export const normalizeDispatchForResponse = (dispatch = {}) => ({
  modeAtCreation: dispatch.modeAtCreation || 'auto',
  status: dispatch.status || 'unassigned',
  deliveryPartnerId: dispatch.deliveryPartnerId ? String(dispatch.deliveryPartnerId) : null,
  assignedAt: dispatch.assignedAt || null,
  acceptedAt: dispatch.acceptedAt || null,
  completedAt: dispatch.completedAt || null,
  dispatchingAt: dispatch.dispatchingAt || null,
  offeredTo: Array.isArray(dispatch.offeredTo)
    ? dispatch.offeredTo.map((entry) => ({
        partnerId: entry?.partnerId ? String(entry.partnerId) : null,
        at: entry?.at || null,
        action: entry?.action || 'offered',
      }))
    : [],
});

/** Customer-safe dispatch — no rider ids or offer history. */
export const normalizeCustomerDispatchForResponse = (dispatch = {}) => ({
  status: dispatch.status || 'unassigned',
  assignedAt: dispatch.assignedAt || null,
  acceptedAt: dispatch.acceptedAt || null,
  completedAt: dispatch.completedAt || null,
});

export const serializeCustomerPickupImageEntries = (returnDoc) =>
  serializePickupImageEntriesForResponse(returnDoc).map(({ url, uploadedAt, uploadedByRole }) => ({
    url,
    uploadedAt,
    uploadedByRole,
  }));

export const serializeCustomerRefundAuditLog = (returnDoc) =>
  (Array.isArray(returnDoc?.refundAuditLog) ? returnDoc.refundAuditLog : []).map((entry) => ({
    at: entry?.at || null,
    action: entry?.action || '',
    refundStatus: entry?.refundStatus || '',
    refundMethod: entry?.refundMethod || '',
    amount: Number(entry?.amount || 0),
    refundTransactionId: entry?.refundTransactionId || '',
    refundReference: entry?.refundReference || '',
    note: entry?.note || '',
  }));

export const serializeReturnTimeline = (returnDoc) =>
  (Array.isArray(returnDoc?.returnHistory) ? returnDoc.returnHistory : [])
    .slice()
    .sort((a, b) => new Date(a?.at || 0).getTime() - new Date(b?.at || 0).getTime())
    .map((entry) => ({
      at: entry?.at || null,
      byRole: entry?.byRole || 'SYSTEM',
      byId: entry?.byId ? String(entry.byId) : null,
      action: entry?.action || '',
      fromStatus: entry?.fromStatus || '',
      toStatus: entry?.toStatus || '',
      note: entry?.note || '',
      metadata: entry?.metadata || {},
    }));

export const serializeReturnDocumentBase = (returnDoc) => ({
  id: String(returnDoc?._id || ''),
  returnId: String(returnDoc?._id || ''),
  orderId: returnDoc?.orderId || '',
  sellerId: returnDoc?.sellerId ? String(returnDoc.sellerId) : '',
  returnStatus: returnDoc?.returnStatus || '',
  refundMethod: returnDoc?.refundMethod || '',
  refundMethodLabel: formatRefundMethodLabel(returnDoc?.refundMethod),
  refundStatus: returnDoc?.refundStatus || REFUND_STATUSES.NONE,
  refundStatusLabel: formatRefundStatusLabel(returnDoc?.refundStatus),
  lifecycleLabel: resolveReturnLifecycleLabel(returnDoc),
  returnReason: returnDoc?.returnReason || '',
  returnRejectedReason: returnDoc?.returnRejectedReason || '',
  returnRequestedAt: returnDoc?.returnRequestedAt || returnDoc?.createdAt || null,
  returnItems: Array.isArray(returnDoc?.returnItems)
    ? returnDoc.returnItems.map(normalizeReturnItemForResponse)
    : [],
  returnRefundAmount: Number(returnDoc?.returnRefundAmount || 0),
  calculatedPickupCharge: resolveReturnPickupCharge(returnDoc),
  returnPickupCharge: resolveReturnPickupCharge(returnDoc),
  pickupDistanceKm: Number(returnDoc?.pickupDistanceKm || 0),
  pickupPricingBreakdown: returnDoc?.pickupPricingBreakdown || null,
  returnDeliveryCommission: Number(returnDoc?.returnDeliveryCommission || 0),
  riderEarning: resolveReturnPickupCharge(returnDoc),
  refundPricing: normalizeReturnPricingForResponse(returnDoc),
  payoutDetails: serializePayoutDetailsForDisplay(returnDoc),
  pickupImages: Array.isArray(returnDoc?.pickupImages) ? returnDoc.pickupImages : [],
  pickupImageEntries: serializePickupImageEntriesForResponse(returnDoc),
  dispatch: normalizeDispatchForResponse(returnDoc?.dispatch || {}),
  deliveryState: returnDoc?.deliveryState || {},
  qualityCheck: returnDoc?.qualityCheck || { status: 'pending' },
  qualityCheckStatus: String(returnDoc?.qualityCheck?.status || 'pending'),
  timeline: serializeReturnTimeline(returnDoc),
  timelineSteps: serializeReturnTimelineSteps(returnDoc),
  refundTransactionId: returnDoc?.refundTransactionId || '',
  refundReference: returnDoc?.refundReference || '',
  refundAuditLog: Array.isArray(returnDoc?.refundAuditLog) ? returnDoc.refundAuditLog : [],
  finance: returnDoc?.finance || {},
  updatedAt: returnDoc?.updatedAt || null,
});

/** Lean customer API response — no internal dispatch, finance, or duplicate fields. */
export const serializeReturnForCustomer = (returnDoc) => {
  const pickupCharge = resolveReturnPickupCharge(returnDoc);
  return {
    id: String(returnDoc?._id || ''),
    returnId: String(returnDoc?._id || ''),
    orderId: returnDoc?.orderId || '',
    sellerId: returnDoc?.sellerId ? String(returnDoc.sellerId) : '',
    returnStatus: returnDoc?.returnStatus || '',
    refundMethod: returnDoc?.refundMethod || '',
    refundMethodLabel: formatRefundMethodLabel(returnDoc?.refundMethod),
    refundStatus: returnDoc?.refundStatus || REFUND_STATUSES.NONE,
    refundStatusLabel: formatRefundStatusLabel(returnDoc?.refundStatus),
    lifecycleLabel: resolveReturnLifecycleLabel(returnDoc),
    returnReason: returnDoc?.returnReason || '',
    returnRejectedReason: returnDoc?.returnRejectedReason || '',
    returnRequestedAt: returnDoc?.returnRequestedAt || returnDoc?.createdAt || null,
    returnItems: Array.isArray(returnDoc?.returnItems)
      ? returnDoc.returnItems.map(normalizeReturnItemForResponse)
      : [],
    returnRefundAmount: Number(returnDoc?.returnRefundAmount || 0),
    pickupCharge,
    pickupPricingBreakdown: returnDoc?.pickupPricingBreakdown || null,
    riderEarning: pickupCharge,
    refundPricing: normalizeReturnPricingForResponse(returnDoc),
    payoutDetails: serializePayoutDetailsForDisplay(returnDoc, { maskSensitive: true }),
    pickupImageEntries: serializeCustomerPickupImageEntries(returnDoc),
    dispatch: normalizeCustomerDispatchForResponse(returnDoc?.dispatch || {}),
    qualityCheckStatus: String(returnDoc?.qualityCheck?.status || 'pending'),
    timelineSteps: serializeReturnTimelineSteps(returnDoc),
    refundTransactionId: returnDoc?.refundTransactionId || '',
    refundReference: returnDoc?.refundReference || '',
    refundAuditLog: serializeCustomerRefundAuditLog(returnDoc),
    updatedAt: returnDoc?.updatedAt || null,
  };
};

export const formatReturnDeliveryAddress = (address = {}) => {
  const line = [address?.address, address?.city].filter(Boolean).join(', ');
  return line.trim();
};

export const mergeSellerReturnOrderContext = (
  serialized,
  { sellerOrder, deliveryAddress, orderItems = [] } = {},
) => {
  const resolvedAddress =
    sellerOrder?.address?.address || sellerOrder?.address?.city
      ? sellerOrder.address
      : deliveryAddress
        ? {
            address:
              [deliveryAddress?.street, deliveryAddress?.additionalDetails]
                .filter(Boolean)
                .join(', ') ||
              deliveryAddress?.address ||
              '',
            city: deliveryAddress?.city || '',
            location: deliveryAddress?.location?.coordinates
              ? {
                  lat: deliveryAddress.location.coordinates[1],
                  lng: deliveryAddress.location.coordinates[0],
                }
              : undefined,
          }
        : null;

  const customerName =
    serialized.customer?.name && serialized.customer.name !== 'Customer'
      ? serialized.customer.name
      : sellerOrder?.customer?.name || deliveryAddress?.name || serialized.customer?.name || 'Customer';

  const sourceItems = [
    ...(Array.isArray(orderItems) ? orderItems : []),
    ...(Array.isArray(sellerOrder?.items) ? sellerOrder.items : []),
  ];

  return {
    ...serialized,
    customer: {
      name: customerName,
      phone:
        serialized.customer?.phone ||
        sellerOrder?.customer?.phone ||
        deliveryAddress?.phone ||
        '',
    },
    address: resolvedAddress,
    returnItems: enrichReturnItemsFromOrderItems(serialized.returnItems, sourceItems),
  };
};

export const serializeReturnForSeller = (returnDoc) => {
  const base = serializeReturnDocumentBase(returnDoc);
  const timeline = (base.timeline || []).map((entry) => {
    if (!entry?.metadata?.payoutDetails) return entry;
    const { payoutDetails, ...restMetadata } = entry.metadata;
    return { ...entry, metadata: restMetadata };
  });

  return {
    ...base,
    timeline,
    refundMethodLabel: formatRefundMethodLabel(returnDoc?.refundMethod),
    refundStatusLabel: formatRefundStatusLabel(returnDoc?.refundStatus),
    customer: returnDoc?.customer || { name: 'Customer', phone: '' },
    sellerOtp: returnDoc?.sellerOtp || '',
    sellerInspectionImages: Array.isArray(returnDoc?.sellerInspectionImages)
      ? returnDoc.sellerInspectionImages
      : [],
    dispatch: normalizeDispatchForResponse(returnDoc?.dispatch || {}),
  };
};

export const serializeReturnForAdmin = (returnDoc) => ({
  ...serializeReturnForSeller(returnDoc),
  customerOtp: returnDoc?.customerOtp || '',
  parentOrderId: returnDoc?.parentOrderId ? String(returnDoc.parentOrderId) : '',
  userId: returnDoc?.userId ? String(returnDoc.userId) : '',
  pricing: normalizeReturnPricingForResponse(returnDoc),
  cumulativeReturnItems: Array.isArray(returnDoc?.cumulativeReturnItems)
    ? returnDoc.cumulativeReturnItems
    : [],
  returnDeliveryCommission: Number(returnDoc?.returnDeliveryCommission || 0),
  calculatedPickupCharge: resolveReturnPickupCharge(returnDoc),
  returnPickupCharge: resolveReturnPickupCharge(returnDoc),
  pickupDistanceKm: Number(returnDoc?.pickupDistanceKm || 0),
  pickupPricingBreakdown: returnDoc?.pickupPricingBreakdown || null,
  riderEarning: resolveReturnPickupCharge(returnDoc),
  pickupFeeZeroWarning: resolveReturnPickupCharge(returnDoc) <= 0,
  createdAt: returnDoc?.createdAt || null,
});
