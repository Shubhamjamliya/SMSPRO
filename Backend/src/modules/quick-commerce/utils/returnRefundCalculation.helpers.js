import { ValidationError } from '../../../core/auth/errors.js';
import { RETURN_STATUSES } from './return.helpers.js';
import {
  buildLegacyQuickItemKey,
  buildOrderItemKeyAliases,
  resolveOrderItemLineKey,
} from './quickOrderItem.helpers.js';

const INELIGIBLE_REASON_MESSAGES = {
  RETURNS_DISABLED: 'Returns are currently disabled',
  NOT_QUICK_COMMERCE: 'Returns are only available for Quick Commerce items',
  ORDER_NOT_DELIVERED: 'Returns can only be requested for delivered orders',
  DELIVERY_TIMESTAMP_MISSING: 'Delivery time is not recorded for this order',
  ITEM_NOT_RETURNABLE: 'This item is not returnable',
  RETURN_WINDOW_EXPIRED: 'The return window for this item has expired',
  ALREADY_RETURNED: 'This item has already been fully returned',
};

/**
 * Index every order line under all of its identifiers (variant-safe lineKey and the
 * legacy itemId), so both new and old clients can address the same line.
 */
export const buildOrderItemLookup = (quickItems = [], itemEligibilityList = []) => {
  const eligibilityByLineKey = new Map();
  (itemEligibilityList || []).forEach((row) => {
    if (row?.lineKey) eligibilityByLineKey.set(String(row.lineKey), row);
  });

  const byAlias = new Map();
  (quickItems || []).forEach((item) => {
    const lineKey = resolveOrderItemLineKey(item);
    if (!lineKey) return;
    const entry = { item, lineKey, eligibility: eligibilityByLineKey.get(lineKey) || null };
    buildOrderItemKeyAliases(item).forEach((alias) => {
      if (!byAlias.has(alias)) byAlias.set(alias, entry);
    });
  });
  return byAlias;
};

const priorReturnedQtyForItem = (item, priorReturnedMap = new Map()) => {
  for (const alias of buildOrderItemKeyAliases(item)) {
    if (priorReturnedMap.has(alias)) return Number(priorReturnedMap.get(alias) || 0);
  }
  return 0;
};

export const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const toPaise = (value) => Math.round((Number(value) || 0) * 100);

export const fromPaise = (paise) => roundMoney(paise / 100);

/**
 * Largest-remainder (Hamilton) distribution — totals always match exactly in paise.
 */
export const distributeProRataPaise = (totalAmount, weights = []) => {
  const paiseTotal = Math.max(0, toPaise(totalAmount));
  if (!weights.length || paiseTotal <= 0) {
    return weights.map(() => 0);
  }

  const weightSum = weights.reduce((sum, weight) => sum + Math.max(0, Number(weight) || 0), 0);
  if (weightSum <= 0) {
    return weights.map(() => 0);
  }

  const exact = weights.map((weight) => (Math.max(0, Number(weight) || 0) / weightSum) * paiseTotal);
  const floors = exact.map((value) => Math.floor(value));
  let remainder = paiseTotal - floors.reduce((sum, value) => sum + value, 0);

  const ranked = exact
    .map((value, index) => ({ index, remainder: value - floors[index] }))
    .sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; i < remainder; i += 1) {
    floors[ranked[i % ranked.length].index] += 1;
  }

  return floors.map((value) => value / 100);
};

export const calculateQuickItemsSubtotal = (quickItems = []) =>
  quickItems.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0,
  );

export const resolveOrderCouponTotal = (orderPricing = {}) =>
  roundMoney(Number(orderPricing?.discount || 0));

export const resolveOrderTaxTotal = (orderPricing = {}) =>
  roundMoney(Number(orderPricing?.tax || orderPricing?.gst || 0));

export const resolveCustomerPaidAmount = (order = {}) => {
  const pricingTotal = roundMoney(Number(order?.pricing?.total || 0));
  if (pricingTotal > 0) return pricingTotal;

  const paymentDue = roundMoney(Number(order?.payment?.amountDue || 0));
  if (paymentDue > 0) return paymentDue;

  const pricing = order?.pricing || {};
  return roundMoney(
    Math.max(
      0,
      Number(pricing.subtotal || 0) +
        Number(pricing.deliveryFee || 0) +
        Number(pricing.platformFee || 0) +
        Number(pricing.tax || pricing.gst || 0) -
        Number(pricing.discount || 0),
    ),
  );
};

export const buildPriorReturnedQuantityMap = (returnDocs = []) => {
  const map = new Map();

  returnDocs.forEach((returnDoc) => {
    const cumulative = Array.isArray(returnDoc?.cumulativeReturnItems)
      ? returnDoc.cumulativeReturnItems
      : [];

    // Register the quantity under every identifier the record carries so that
    // returns written before the variant-safe lineKey rollout still resolve.
    const register = (item, qty) => {
      const keys = new Set(
        [item?.lineKey, item?.itemId, item?.productId]
          .map((value) => String(value || '').trim())
          .filter(Boolean),
      );
      keys.forEach((key) => map.set(key, (map.get(key) || 0) + qty));
    };

    if (cumulative.length) {
      cumulative.forEach((item) => register(item, Number(item.returnedQty || 0)));
      return;
    }

    if (returnDoc?.returnStatus === RETURN_STATUSES.REFUND_COMPLETED) {
      (returnDoc.returnItems || []).forEach((item) =>
        register(item, Number(item.returnedQty ?? item.quantity ?? 0)),
      );
    }
  });

  return map;
};

export const buildPriorCumulativeFinance = (returnDoc = null, order = {}) => {
  const orderCouponTotal = resolveOrderCouponTotal(order?.pricing || {});
  const orderTaxTotal = resolveOrderTaxTotal(order?.pricing || {});
  const orderPaidTotal = resolveCustomerPaidAmount(order);

  const cumulative = Array.isArray(returnDoc?.cumulativeReturnItems)
    ? returnDoc.cumulativeReturnItems
    : [];

  let totalRefundedAmount = 0;
  let totalCouponRefunded = 0;
  let totalTaxRefunded = 0;

  if (cumulative.length) {
    cumulative.forEach((item) => {
      totalRefundedAmount += Number(item.refundAmount || 0);
      totalCouponRefunded += Number(item.couponShare || 0);
      totalTaxRefunded += Number(item.taxShare || 0);
    });
  } else if (returnDoc?.returnStatus === RETURN_STATUSES.REFUND_COMPLETED) {
    (returnDoc.returnItems || []).forEach((item) => {
      totalRefundedAmount += Number(item.refundAmount || 0);
      totalCouponRefunded += Number(item.couponShare || 0);
      totalTaxRefunded += Number(item.taxShare || 0);
    });
  }

  const storedPricing = returnDoc?.pricing || {};
  if (Number(storedPricing.totalCouponRefunded || 0) > totalCouponRefunded) {
    totalCouponRefunded = Number(storedPricing.totalCouponRefunded || 0);
  }
  if (Number(storedPricing.totalTaxRefunded || 0) > totalTaxRefunded) {
    totalTaxRefunded = Number(storedPricing.totalTaxRefunded || 0);
  }
  if (Number(storedPricing.totalRefundedAmount || 0) > totalRefundedAmount) {
    totalRefundedAmount = Number(storedPricing.totalRefundedAmount || 0);
  }

  totalRefundedAmount = roundMoney(totalRefundedAmount);
  totalCouponRefunded = roundMoney(Math.min(totalCouponRefunded, orderCouponTotal));
  totalTaxRefunded = roundMoney(Math.min(totalTaxRefunded, orderTaxTotal));

  return {
    totalRefundedAmount,
    totalCouponRefunded,
    totalTaxRefunded,
    remainingCouponAmount: roundMoney(Math.max(0, orderCouponTotal - totalCouponRefunded)),
    remainingTaxAmount: roundMoney(Math.max(0, orderTaxTotal - totalTaxRefunded)),
    remainingRefundableAmount: roundMoney(Math.max(0, orderPaidTotal - totalRefundedAmount)),
    orderCouponTotal,
    orderTaxTotal,
    orderPaidTotal,
  };
};

/** True only when every line that still has returnable quantity is fully covered by this request. */
const willFullyReturnOrder = (quickItems, priorReturnedMap, requestedItems) => {
  const requestedQtyByLineKey = new Map();
  requestedItems.forEach((item) => {
    const key = String(item?.itemId || '').trim();
    if (key) requestedQtyByLineKey.set(key, Number(item?.quantity || 0));
  });

  return quickItems.every((item) => {
    const lineKey = resolveOrderItemLineKey(item);
    if (!lineKey) return true;
    const remaining = Number(item.quantity || 0) - priorReturnedQtyForItem(item, priorReturnedMap);
    if (remaining <= 0) return true;
    return (requestedQtyByLineKey.get(lineKey) || 0) >= remaining;
  });
};

/**
 * Resolve the client's requested lines into server-authoritative return lines.
 *
 * The client may address a line by its variant-safe lineKey or by the legacy itemId.
 * `quantity` is optional: when omitted the full remaining quantity is returned, which
 * preserves the behavior of clients built before partial quantity existed.
 * Per-item eligibility (expiry, policy, remaining quantity) is enforced here.
 */
export const normalizeReturnRequestItems = (
  requestedItems = [],
  quickItems = [],
  priorReturnedMap = new Map(),
  itemLookup = null,
) => {
  const lookup = itemLookup || buildOrderItemLookup(quickItems);
  const seen = new Set();
  const normalized = [];

  requestedItems.forEach((requested) => {
    const rawKey = String(requested?.itemId || requested?.lineKey || '').trim();
    if (!rawKey) {
      throw new ValidationError('Each return item must include a valid itemId');
    }

    const entry = lookup.get(rawKey);
    if (!entry) {
      throw new ValidationError(`Item ${rawKey} is not eligible for return on this order`);
    }
    if (seen.has(entry.lineKey)) return;
    seen.add(entry.lineKey);

    const eligibility = entry.eligibility;
    if (eligibility && !eligibility.returnEligible) {
      throw new ValidationError(
        INELIGIBLE_REASON_MESSAGES[eligibility.ineligibleReason]
          || `Item ${entry.item?.name || rawKey} is not eligible for return`,
        eligibility.ineligibleReason || 'ITEM_NOT_RETURNABLE',
      );
    }

    const orderedQty = Math.max(0, Number(entry.item?.quantity || 0));
    const priorReturnedQty = eligibility
      ? Number(eligibility.returnedQuantity || 0)
      : priorReturnedQtyForItem(entry.item, priorReturnedMap);
    const remainingQty = Math.max(0, orderedQty - priorReturnedQty);
    if (remainingQty <= 0) {
      throw new ValidationError(
        `Item ${entry.item?.name || rawKey} has no remaining returnable quantity`,
        'ALREADY_RETURNED',
      );
    }

    const rawQuantity = requested?.quantity;
    const quantityProvided = rawQuantity !== undefined && rawQuantity !== null && rawQuantity !== '';
    let returnedQty = remainingQty;
    if (quantityProvided) {
      const parsed = Math.floor(Number(rawQuantity));
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new ValidationError(`Invalid return quantity for ${entry.item?.name || rawKey}`);
      }
      if (parsed > remainingQty) {
        throw new ValidationError(
          `Only ${remainingQty} unit${remainingQty === 1 ? '' : 's'} of ${entry.item?.name || rawKey} can still be returned`,
          'RETURN_QUANTITY_EXCEEDED',
        );
      }
      returnedQty = parsed;
    }

    normalized.push({ itemId: entry.lineKey, quantity: returnedQty });
  });

  if (!normalized.length) {
    throw new ValidationError('At least one return item is required');
  }

  return normalized;
};

const applyRefundCapToItems = (items, maxRefundAmount) => {
  const safeMax = roundMoney(Math.max(0, maxRefundAmount));
  const currentTotal = roundMoney(items.reduce((sum, item) => sum + Number(item.refundAmount || 0), 0));
  if (currentTotal <= safeMax) return items;

  const refundWeights = items.map((item) => Number(item.refundAmount || 0));
  const cappedRefunds = distributeProRataPaise(safeMax, refundWeights);

  return items.map((item, index) => ({
    ...item,
    refundAmount: cappedRefunds[index],
  }));
};

export const buildCumulativePricingSnapshot = ({
  order,
  priorFinance,
  currentCycle,
}) => {
  const projectedRefunded = roundMoney(
    Number(priorFinance.totalRefundedAmount || 0) + Number(currentCycle.finalRefundAmount || 0),
  );
  const projectedCoupon = roundMoney(
    Number(priorFinance.totalCouponRefunded || 0) + Number(currentCycle.couponShare || 0),
  );
  const projectedTax = roundMoney(
    Number(priorFinance.totalTaxRefunded || 0) + Number(currentCycle.taxShare || 0),
  );

  return {
    ...currentCycle,
    orderCouponTotal: priorFinance.orderCouponTotal,
    orderTaxTotal: priorFinance.orderTaxTotal,
    orderPaidTotal: priorFinance.orderPaidTotal,
    totalRefundedAmount: projectedRefunded,
    totalCouponRefunded: roundMoney(Math.min(projectedCoupon, priorFinance.orderCouponTotal)),
    totalTaxRefunded: roundMoney(Math.min(projectedTax, priorFinance.orderTaxTotal)),
    remainingCouponAmount: roundMoney(
      Math.max(0, priorFinance.orderCouponTotal - projectedCoupon),
    ),
    remainingTaxAmount: roundMoney(Math.max(0, priorFinance.orderTaxTotal - projectedTax)),
    remainingRefundableAmount: roundMoney(
      Math.max(0, priorFinance.orderPaidTotal - projectedRefunded),
    ),
  };
};

export const buildReturnItemsWithRefundCalculation = ({
  order,
  quickItems,
  requestedItems,
  priorReturnedMap = new Map(),
  existingReturnDoc = null,
  itemLookup = null,
}) => {
  const orderItemsSubtotal = calculateQuickItemsSubtotal(quickItems);
  const priorFinance = buildPriorCumulativeFinance(existingReturnDoc, order);
  const lookup = itemLookup || buildOrderItemLookup(quickItems);

  const draftItems = [];
  requestedItems.forEach((requested) => {
    const key = String(requested?.itemId || '').trim();
    if (!key) {
      throw new ValidationError('Each return item must include a valid itemId');
    }

    const entry = lookup.get(key);
    if (!entry) {
      throw new ValidationError(`Item ${key} is not eligible for return on this order`);
    }

    const orderItem = entry.item || {};
    const orderedQty = Math.max(0, Number(orderItem.quantity || 0));
    const priorReturnedQty = entry.eligibility
      ? Number(entry.eligibility.returnedQuantity || 0)
      : priorReturnedQtyForItem(orderItem, priorReturnedMap);
    const remainingBefore = orderedQty - priorReturnedQty;

    // Quantity is already clamped by normalizeReturnRequestItems; re-clamp defensively
    // so this function can never refund more than the line still owes.
    const requestedQty = Number(requested?.quantity || 0) > 0
      ? Math.min(Math.floor(Number(requested.quantity)), remainingBefore)
      : remainingBefore;
    if (requestedQty <= 0) {
      throw new ValidationError(`Item ${key} has no remaining returnable quantity`);
    }

    draftItems.push({
      key: entry.lineKey,
      orderItem,
      eligibility: entry.eligibility || null,
      returnedQty: requestedQty,
      orderedQty,
      priorReturnedQty,
      unitPrice: roundMoney(Number(orderItem?.price || 0)),
      itemGross: roundMoney(Number(orderItem?.price || 0) * requestedQty),
      remainingQty: Math.max(0, orderedQty - priorReturnedQty - requestedQty),
    });
  });

  if (!draftItems.length) {
    throw new ValidationError('At least one return item is required');
  }

  const cycleGross = roundMoney(draftItems.reduce((sum, item) => sum + item.itemGross, 0));
  const grossWeights = draftItems.map((item) => item.itemGross);
  const fullyReturning = willFullyReturnOrder(quickItems, priorReturnedMap, requestedItems);

  let cycleCoupon = fullyReturning
    ? priorFinance.remainingCouponAmount
    : roundMoney(
        Math.min(
          priorFinance.remainingCouponAmount,
          orderItemsSubtotal > 0 ? (cycleGross / orderItemsSubtotal) * priorFinance.orderCouponTotal : 0,
        ),
      );

  let cycleTax = fullyReturning
    ? priorFinance.remainingTaxAmount
    : roundMoney(
        Math.min(
          priorFinance.remainingTaxAmount,
          orderItemsSubtotal > 0 ? (cycleGross / orderItemsSubtotal) * priorFinance.orderTaxTotal : 0,
        ),
      );

  const couponShares = distributeProRataPaise(cycleCoupon, grossWeights);
  const taxShares = distributeProRataPaise(cycleTax, grossWeights);

  let normalized = draftItems.map((draft, index) => ({
    itemId: draft.key,
    lineKey: draft.key,
    legacyItemId: buildLegacyQuickItemKey(draft.orderItem),
    categoryId: String(draft.orderItem?.categoryId || ''),
    headerId: String(draft.orderItem?.headerId || ''),
    returnEligibleUntilSnapshot: draft.eligibility?.returnEligibleUntil
      ? new Date(draft.eligibility.returnEligibleUntil)
      : null,
    productId: String(draft.orderItem?.itemId || draft.key),
    variantId: String(draft.orderItem?.variantId || '').trim(),
    variantName: String(draft.orderItem?.variantName || draft.orderItem?.notes || '').trim(),
    image: String(draft.orderItem?.image || draft.orderItem?.mainImage || '').trim(),
    notes: String(draft.orderItem?.notes || draft.orderItem?.variantName || '').trim(),
    name: draft.orderItem?.name || draft.key,
    quantity: draft.returnedQty,
    returnedQty: draft.returnedQty,
    orderedQty: draft.orderedQty,
    remainingQty: draft.remainingQty,
    price: draft.unitPrice,
    unitPrice: draft.unitPrice,
    discountShare: 0,
    couponShare: couponShares[index],
    taxShare: taxShares[index],
    refundAmount: roundMoney(
      Math.max(0, draft.itemGross - couponShares[index] + taxShares[index]),
    ),
  }));

  const uncappedRefundTotal = roundMoney(
    normalized.reduce((sum, item) => sum + Number(item.refundAmount || 0), 0),
  );
  const maxCycleRefund = roundMoney(
    Math.min(uncappedRefundTotal, priorFinance.remainingRefundableAmount),
  );
  if (maxCycleRefund < uncappedRefundTotal) {
    normalized = applyRefundCapToItems(normalized, maxCycleRefund);
  }

  const currentCycle = {
    subtotal: roundMoney(normalized.reduce((sum, item) => sum + item.unitPrice * item.returnedQty, 0)),
    couponShare: roundMoney(normalized.reduce((sum, item) => sum + item.couponShare, 0)),
    taxShare: roundMoney(normalized.reduce((sum, item) => sum + item.taxShare, 0)),
    discountShare: 0,
    deliveryFeeRefunded: 0,
    platformFeeRefunded: 0,
    finalRefundAmount: roundMoney(normalized.reduce((sum, item) => sum + item.refundAmount, 0)),
  };

  const pricing = buildCumulativePricingSnapshot({
    order,
    priorFinance,
    currentCycle,
  });

  return {
    returnItems: normalized,
    pricing,
    returnRefundAmount: pricing.finalRefundAmount,
    priorFinance,
  };
};

export const hasReturnableQuantityRemaining = (quickItems = [], priorReturnedMap = new Map()) => {
  for (const item of quickItems) {
    if (!resolveOrderItemLineKey(item)) continue;
    const ordered = Number(item.quantity || 0);
    if (ordered - priorReturnedQtyForItem(item, priorReturnedMap) > 0) return true;
  }
  return false;
};

export const appendCumulativeReturnItems = (returnDoc, order = null) => {
  if (!returnDoc) return returnDoc;
  if (!Array.isArray(returnDoc.cumulativeReturnItems)) returnDoc.cumulativeReturnItems = [];

  (returnDoc.returnItems || []).forEach((item) => {
    returnDoc.cumulativeReturnItems.push({
      itemId: String(item.itemId || item.productId || '').trim(),
      lineKey: String(item.lineKey || item.itemId || '').trim(),
      productId: String(item.productId || item.itemId || '').trim(),
      variantId: String(item.variantId || '').trim(),
      returnedQty: Number(item.returnedQty ?? item.quantity ?? 0),
      refundAmount: roundMoney(item.refundAmount ?? item.price * (item.returnedQty ?? item.quantity ?? 0)),
      couponShare: roundMoney(item.couponShare || 0),
      taxShare: roundMoney(item.taxShare || 0),
      completedAt: new Date(),
    });
  });

  if (order) {
    const finance = buildPriorCumulativeFinance(returnDoc, order);
    returnDoc.pricing = {
      ...(returnDoc.pricing || {}),
      subtotal: roundMoney(Number(returnDoc.pricing?.subtotal || 0)),
      couponShare: roundMoney(
        (returnDoc.returnItems || []).reduce((sum, row) => sum + Number(row.couponShare || 0), 0),
      ),
      taxShare: roundMoney(
        (returnDoc.returnItems || []).reduce((sum, row) => sum + Number(row.taxShare || 0), 0),
      ),
      finalRefundAmount: roundMoney(Number(returnDoc.returnRefundAmount || 0)),
      orderCouponTotal: finance.orderCouponTotal,
      orderTaxTotal: finance.orderTaxTotal,
      orderPaidTotal: finance.orderPaidTotal,
      totalRefundedAmount: finance.totalRefundedAmount,
      totalCouponRefunded: finance.totalCouponRefunded,
      totalTaxRefunded: finance.totalTaxRefunded,
      remainingCouponAmount: finance.remainingCouponAmount,
      remainingTaxAmount: finance.remainingTaxAmount,
      remainingRefundableAmount: finance.remainingRefundableAmount,
    };
  }

  return returnDoc;
};

export const deriveRemainingQtyByItem = (quickItems = [], priorReturnedMap = new Map()) => {
  const remaining = {};
  quickItems.forEach((item) => {
    const lineKey = resolveOrderItemLineKey(item);
    if (!lineKey) return;
    const ordered = Number(item.quantity || 0);
    const value = Math.max(0, ordered - priorReturnedQtyForItem(item, priorReturnedMap));
    remaining[lineKey] = value;
    // Legacy alias so existing consumers keyed on itemId keep resolving.
    const legacyKey = buildLegacyQuickItemKey(item);
    if (legacyKey && legacyKey !== lineKey && remaining[legacyKey] === undefined) {
      remaining[legacyKey] = value;
    }
  });
  return remaining;
};
