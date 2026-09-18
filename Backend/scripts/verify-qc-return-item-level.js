/**
 * Offline verification of the QC item-level return rules.
 *
 * Pure logic only — no database connection. Exercises the mandatory scenarios:
 * mixed category windows, policy/category change immutability, partial quantity,
 * variant-safe identity, and client tampering.
 *
 * Usage: node scripts/verify-qc-return-item-level.js
 */
import assert from 'node:assert/strict';

import {
  buildItemReturnEligibility,
  buildOrderReturnEligibility,
} from '../src/modules/quick-commerce/utils/return.helpers.js';
import {
  buildOrderItemLookup,
  buildPriorReturnedQuantityMap,
  buildReturnItemsWithRefundCalculation,
  normalizeReturnRequestItems,
} from '../src/modules/quick-commerce/utils/returnRefundCalculation.helpers.js';
import { buildQuickOrderItemReturnFields } from '../src/modules/quick-commerce/utils/quickOrderItem.helpers.js';

const DELIVERED_AT = new Date('2026-08-10T10:00:00+05:30');
const AT_12_AUG_10 = new Date('2026-08-12T10:00:00+05:30').getTime();
const AT_10_AUG_15 = new Date('2026-08-10T15:00:00+05:30').getTime();

const results = [];
const check = (name, fn) => {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
  }
};

const line = ({ id, name, days, qty = 1, price = 100, header = 'Gift', variant = '' }) => ({
  itemId: id,
  name,
  type: 'quick',
  sourceId: 'seller-1',
  price,
  quantity: qty,
  headerName: header,
  headerId: `hdr-${header}`,
  ...buildQuickOrderItemReturnFields(
    { itemId: id, variantKey: variant },
    {
      categoryId: 'cat-1',
      categoryName: header,
      headerId: `hdr-${header}`,
      headerName: header,
      returnPolicySnapshot: {
        eligible: true,
        returnWindowDays: days,
        source: 'header',
        sourceId: `hdr-${header}`,
        snapshotAt: DELIVERED_AT,
      },
    },
  ),
});

const buildOrder = (items) => ({
  orderType: 'quick',
  orderId: 'QC-TEST-1',
  orderStatus: 'delivered',
  deliveryState: { deliveredAt: DELIVERED_AT },
  pricing: { subtotal: 500, total: 500, discount: 0, tax: 0 },
  items,
});

const MIXED_ITEMS = [
  line({ id: 'A', name: 'Gift A', days: 1, header: 'Gift' }),
  line({ id: 'B', name: 'Gift B', days: 1, header: 'Gift' }),
  line({ id: 'C', name: 'Bakery C', days: 3, header: 'Bakery' }),
  line({ id: 'D', name: 'Bakery D', days: 3, header: 'Bakery' }),
  line({ id: 'E', name: 'Bakery E', days: 3, header: 'Bakery' }),
];

// ── Section 56: mixed category windows two days after delivery ───────────────
check('56: Gift expired, Bakery returnable at 12 Aug 10:00', () => {
  const rollup = buildOrderReturnEligibility({
    order: buildOrder(MIXED_ITEMS),
    feeSettings: { returnsEnabled: true, returnWindowHours: 72 },
    now: AT_12_AUG_10,
  });

  const byName = Object.fromEntries(rollup.items.map((row) => [row.name, row]));
  assert.equal(byName['Gift A'].returnEligible, false, 'Gift A must be expired');
  assert.equal(byName['Gift A'].ineligibleReason, 'RETURN_WINDOW_EXPIRED');
  assert.equal(byName['Gift B'].returnEligible, false);
  assert.equal(byName['Bakery C'].returnEligible, true);
  assert.equal(byName['Bakery D'].returnEligible, true);
  assert.equal(byName['Bakery E'].returnEligible, true);

  assert.equal(rollup.canReturn, true, 'order must remain returnable');
  assert.equal(rollup.anyItemReturnable, true);
  assert.equal(
    new Date(byName['Gift A'].returnEligibleUntil).toISOString(),
    new Date('2026-08-11T10:00:00+05:30').toISOString(),
  );
  assert.equal(
    new Date(byName['Bakery C'].returnEligibleUntil).toISOString(),
    new Date('2026-08-13T10:00:00+05:30').toISOString(),
  );
});

check('56: selecting Bakery C+D succeeds and leaves E returnable', () => {
  const order = buildOrder(MIXED_ITEMS);
  const rollup = buildOrderReturnEligibility({
    order,
    feeSettings: { returnsEnabled: true },
    now: AT_12_AUG_10,
  });
  const lookup = buildOrderItemLookup(order.items, rollup.items);

  const normalized = normalizeReturnRequestItems(
    [{ itemId: 'C' }, { itemId: 'D' }],
    order.items,
    new Map(),
    lookup,
  );
  assert.equal(normalized.length, 2);

  const built = buildReturnItemsWithRefundCalculation({
    order,
    quickItems: order.items,
    requestedItems: normalized,
    priorReturnedMap: new Map(),
    itemLookup: lookup,
  });
  assert.equal(built.returnItems.length, 2);
  assert.equal(built.returnRefundAmount, 200);

  const stillOpen = rollup.items.filter((row) => row.returnEligible).map((row) => row.name);
  assert.ok(stillOpen.includes('Bakery E'), 'Bakery E must remain returnable');
});

check('56: expired Gift item is rejected by the backend even if requested', () => {
  const order = buildOrder(MIXED_ITEMS);
  const rollup = buildOrderReturnEligibility({
    order,
    feeSettings: { returnsEnabled: true },
    now: AT_12_AUG_10,
  });
  const lookup = buildOrderItemLookup(order.items, rollup.items);

  assert.throws(
    () => normalizeReturnRequestItems([{ itemId: 'A' }], order.items, new Map(), lookup),
    /return window for this item has expired/i,
  );
});

// ── Section 57: both categories still open ───────────────────────────────────
check('57: Gift A + Bakery C both eligible at 10 Aug 15:00', () => {
  const order = buildOrder(MIXED_ITEMS);
  const rollup = buildOrderReturnEligibility({
    order,
    feeSettings: { returnsEnabled: true },
    now: AT_10_AUG_15,
  });
  const lookup = buildOrderItemLookup(order.items, rollup.items);

  const normalized = normalizeReturnRequestItems(
    [{ itemId: 'A' }, { itemId: 'C' }],
    order.items,
    new Map(),
    lookup,
  );
  assert.equal(normalized.length, 2);

  const built = buildReturnItemsWithRefundCalculation({
    order,
    quickItems: order.items,
    requestedItems: normalized,
    priorReturnedMap: new Map(),
    itemLookup: lookup,
  });
  assert.equal(built.returnItems.length, 2);
  assert.equal(built.returnItems[0].returnWindowDays, undefined);
  assert.equal(built.returnItems[0].headerId, 'hdr-Gift');
  assert.equal(built.returnItems[1].headerId, 'hdr-Bakery');
});

// ── Section 58/59: snapshot immutability ─────────────────────────────────────
check('58: admin widening Gift to 7 days does not revive an old 1-day order', () => {
  const order = buildOrder(MIXED_ITEMS);
  // feeSettings/global change must not influence a snapshotted line.
  const rollup = buildOrderReturnEligibility({
    order,
    feeSettings: { returnsEnabled: true, returnWindowHours: 7 * 24 },
    legacyWindowHours: 7 * 24,
    now: AT_12_AUG_10,
  });
  const gift = rollup.items.find((row) => row.name === 'Gift A');
  assert.equal(gift.returnWindowDays, 1);
  assert.equal(gift.returnEligible, false);
});

check('59: product moving to another category does not change the order snapshot', () => {
  const gift = line({ id: 'A', name: 'Gift A', days: 1, header: 'Gift' });
  // Simulate the live product now pointing at Bakery; the order line is unchanged.
  const eligibility = buildItemReturnEligibility({
    item: gift,
    deliveredAt: DELIVERED_AT,
    delivered: true,
    legacyWindowHours: 3 * 24,
    now: AT_12_AUG_10,
  });
  assert.equal(eligibility.returnWindowDays, 1);
  assert.equal(eligibility.returnEligible, false);
});

// ── Section 20: partial quantity ─────────────────────────────────────────────
check('20: partial quantity 2 of 5, then 3, then reject 1', () => {
  const item = line({ id: 'P', name: 'Bakery Pack', days: 3, qty: 5, header: 'Bakery' });
  const order = buildOrder([item]);
  const build = (priorMap) => {
    const rollup = buildOrderReturnEligibility({
      order,
      feeSettings: { returnsEnabled: true },
      priorReturnedMap: priorMap,
      now: AT_12_AUG_10,
    });
    return { rollup, lookup: buildOrderItemLookup(order.items, rollup.items) };
  };

  const first = build(new Map());
  const cycle1 = normalizeReturnRequestItems(
    [{ itemId: 'P', quantity: 2 }],
    order.items,
    new Map(),
    first.lookup,
  );
  assert.equal(cycle1[0].quantity, 2);

  const built1 = buildReturnItemsWithRefundCalculation({
    order,
    quickItems: order.items,
    requestedItems: cycle1,
    priorReturnedMap: new Map(),
    itemLookup: first.lookup,
  });
  assert.equal(built1.returnItems[0].returnedQty, 2);
  assert.equal(built1.returnItems[0].remainingQty, 3);

  const priorMap = buildPriorReturnedQuantityMap([
    { cumulativeReturnItems: [{ itemId: 'P', lineKey: 'P', returnedQty: 2 }] },
  ]);
  const second = build(priorMap);
  const row = second.rollup.items[0];
  assert.equal(row.returnedQuantity, 2);
  assert.equal(row.remainingReturnableQuantity, 3);

  const cycle2 = normalizeReturnRequestItems(
    [{ itemId: 'P', quantity: 3 }],
    order.items,
    priorMap,
    second.lookup,
  );
  assert.equal(cycle2[0].quantity, 3);

  assert.throws(
    () =>
      normalizeReturnRequestItems(
        [{ itemId: 'P', quantity: 4 }],
        order.items,
        priorMap,
        second.lookup,
      ),
    /Only 3 units/,
  );

  const exhausted = buildPriorReturnedQuantityMap([
    { cumulativeReturnItems: [{ itemId: 'P', lineKey: 'P', returnedQty: 5 }] },
  ]);
  const third = build(exhausted);
  assert.throws(
    () => normalizeReturnRequestItems([{ itemId: 'P', quantity: 1 }], order.items, exhausted, third.lookup),
    /already been fully returned/i,
  );
  assert.equal(third.rollup.items[0].ineligibleReason, 'ALREADY_RETURNED');
  assert.equal(third.rollup.canReturn, false);
});

// ── Section 18: omitted quantity keeps legacy clients working ────────────────
check('18: omitted quantity returns the full remaining quantity', () => {
  const item = line({ id: 'Q', name: 'Bakery Q', days: 3, qty: 4, header: 'Bakery' });
  const order = buildOrder([item]);
  const rollup = buildOrderReturnEligibility({ order, feeSettings: {}, now: AT_12_AUG_10 });
  const lookup = buildOrderItemLookup(order.items, rollup.items);
  const normalized = normalizeReturnRequestItems([{ itemId: 'Q' }], order.items, new Map(), lookup);
  assert.equal(normalized[0].quantity, 4);
});

// ── Section 21: variant-safe identity ────────────────────────────────────────
check('21: two variants of the same product are distinct return lines', () => {
  const red = line({ id: 'V', name: 'Shirt Red', days: 3, qty: 2, header: 'Bakery', variant: 'red' });
  const blue = line({ id: 'V', name: 'Shirt Blue', days: 3, qty: 3, header: 'Bakery', variant: 'blue' });
  assert.notEqual(red.lineKey, blue.lineKey);

  const order = buildOrder([red, blue]);
  const rollup = buildOrderReturnEligibility({ order, feeSettings: {}, now: AT_12_AUG_10 });
  assert.equal(rollup.items.length, 2);

  const lookup = buildOrderItemLookup(order.items, rollup.items);
  const normalized = normalizeReturnRequestItems(
    [{ itemId: red.lineKey }],
    order.items,
    new Map(),
    lookup,
  );
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].quantity, 2, 'must return only the red variant quantity');
});

check('21: legacy itemId still resolves to a line', () => {
  const item = line({ id: 'L', name: 'Legacy', days: 3, qty: 1, header: 'Bakery', variant: 'x' });
  const order = buildOrder([item]);
  const rollup = buildOrderReturnEligibility({ order, feeSettings: {}, now: AT_12_AUG_10 });
  const lookup = buildOrderItemLookup(order.items, rollup.items);
  const normalized = normalizeReturnRequestItems([{ itemId: 'L' }], order.items, new Map(), lookup);
  assert.equal(normalized[0].itemId, item.lineKey);
});

// ── Section 43: legacy orders without a snapshot ─────────────────────────────
check('43: legacy line falls back to the 72h window, not 0', () => {
  const legacyItem = {
    itemId: 'OLD',
    name: 'Legacy item',
    type: 'quick',
    sourceId: 'seller-1',
    price: 100,
    quantity: 1,
  };
  const order = buildOrder([legacyItem]);
  const rollup = buildOrderReturnEligibility({
    order,
    feeSettings: { returnsEnabled: true, returnWindowHours: 72 },
    now: AT_12_AUG_10,
  });
  assert.equal(rollup.items[0].returnWindowDays, 3);
  assert.equal(rollup.items[0].policyFromSnapshot, false);
  assert.equal(rollup.items[0].returnEligible, true);
});

// ── Section 8: deliveredAt must not come from updatedAt ──────────────────────
check('8: updatedAt is never used as the delivery timestamp', () => {
  const order = {
    orderType: 'quick',
    orderStatus: 'delivered',
    deliveryState: {},
    updatedAt: new Date(),
    pricing: {},
    items: [line({ id: 'A', name: 'Gift A', days: 1 })],
  };
  const rollup = buildOrderReturnEligibility({ order, feeSettings: {}, now: AT_12_AUG_10 });
  assert.equal(rollup.deliveredAt, null);
  assert.equal(rollup.canReturn, false);
  assert.equal(rollup.items[0].ineligibleReason, 'DELIVERY_TIMESTAMP_MISSING');
});

check('8: statusHistory delivered transition is a valid fallback', () => {
  const order = {
    orderType: 'quick',
    orderStatus: 'delivered',
    deliveryState: {},
    statusHistory: [{ to: 'delivered', at: DELIVERED_AT }],
    pricing: {},
    items: [line({ id: 'C', name: 'Bakery C', days: 3, header: 'Bakery' })],
  };
  const rollup = buildOrderReturnEligibility({ order, feeSettings: {}, now: AT_12_AUG_10 });
  assert.equal(new Date(rollup.deliveredAt).getTime(), DELIVERED_AT.getTime());
  assert.equal(rollup.items[0].returnEligible, true);
});

// ── Section 60: client tampering ─────────────────────────────────────────────
check('60: manipulated client fields are ignored', () => {
  const order = buildOrder(MIXED_ITEMS);
  const rollup = buildOrderReturnEligibility({ order, feeSettings: {}, now: AT_12_AUG_10 });
  const lookup = buildOrderItemLookup(order.items, rollup.items);

  assert.throws(
    () =>
      normalizeReturnRequestItems(
        [
          {
            itemId: 'A',
            quantity: 999999,
            returnEligible: true,
            returnWindowDays: 365,
            returnEligibleUntil: '2099-01-01T00:00:00Z',
            refundAmount: 99999999,
            deliveredAt: '2099-01-01T00:00:00Z',
          },
        ],
        order.items,
        new Map(),
        lookup,
      ),
    /expired/i,
    'expired item must be rejected regardless of client payload',
  );

  // A tampered policy on an otherwise valid item is ignored: the server-side
  // snapshot and remaining quantity still decide the outcome.
  const accepted = normalizeReturnRequestItems(
    [
      {
        itemId: 'C',
        returnEligible: true,
        returnWindowDays: 365,
        returnEligibleUntil: '2099-01-01T00:00:00Z',
        refundAmount: 99999999,
      },
    ],
    order.items,
    new Map(),
    lookup,
  );
  assert.deepEqual(accepted, [{ itemId: 'C', quantity: 1 }]);
});

check('60: excessive quantity on an eligible item is rejected', () => {
  const order = buildOrder(MIXED_ITEMS);
  const rollup = buildOrderReturnEligibility({ order, feeSettings: {}, now: AT_12_AUG_10 });
  const lookup = buildOrderItemLookup(order.items, rollup.items);
  assert.throws(
    () => normalizeReturnRequestItems([{ itemId: 'C', quantity: 999999 }], order.items, new Map(), lookup),
    /Only 1 unit/,
  );
});

// ── Section 23/46: refund cap ────────────────────────────────────────────────
check('23: cumulative refunds never exceed the amount paid', () => {
  const items = [line({ id: 'X', name: 'Item X', days: 3, qty: 2, price: 100, header: 'Bakery' })];
  const order = {
    ...buildOrder(items),
    pricing: { subtotal: 200, total: 150, discount: 50, tax: 0 },
  };
  const rollup = buildOrderReturnEligibility({ order, feeSettings: {}, now: AT_12_AUG_10 });
  const lookup = buildOrderItemLookup(order.items, rollup.items);
  const normalized = normalizeReturnRequestItems([{ itemId: 'X' }], order.items, new Map(), lookup);
  const built = buildReturnItemsWithRefundCalculation({
    order,
    quickItems: order.items,
    requestedItems: normalized,
    priorReturnedMap: new Map(),
    itemLookup: lookup,
  });
  assert.ok(built.returnRefundAmount <= 150, `refund ${built.returnRefundAmount} exceeded paid 150`);
  assert.equal(built.returnRefundAmount, 150);
});

// ── Section 45: Food orders are untouched ────────────────────────────────────
check('45: Food order items are not treated as QC returnable lines', () => {
  const foodOrder = {
    orderType: 'food',
    orderStatus: 'delivered',
    deliveryState: { deliveredAt: DELIVERED_AT },
    pricing: {},
    items: [{ itemId: 'F1', name: 'Pizza', type: 'food', sourceId: 'r1', price: 200, quantity: 1 }],
  };
  const rollup = buildOrderReturnEligibility({ order: foodOrder, feeSettings: {}, now: AT_12_AUG_10 });
  assert.equal(rollup.items.length, 0);
  assert.equal(rollup.canReturn, false);
});

check('45: buildQuickOrderItemReturnFields without policy leaves category fields absent', () => {
  const fields = buildQuickOrderItemReturnFields({ itemId: 'F1' }, null);
  assert.equal(fields.returnPolicySnapshot, undefined);
  assert.equal(fields.categoryId, undefined);
  assert.equal(fields.returnedQuantity, 0);
  assert.equal(fields.itemReturnStatus, 'none');
});

const failures = results.filter((row) => !row.ok);
results.forEach((row) => {
  console.log(`${row.ok ? 'PASS' : 'FAIL'}  ${row.name}${row.ok ? '' : `\n        ${row.error}`}`);
});
console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
process.exit(failures.length ? 1 : 0);
