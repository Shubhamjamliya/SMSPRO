/**
 * Quick verification for QC per-line GST (no DB).
 * Run: node Backend/scripts/verify-qc-line-gst.js
 */
import {
  calculateQcLineGst,
  distributeQcAmountProRata,
} from '../src/modules/quick-commerce/utils/gst.helpers.js';

const assert = (cond, msg) => {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('OK:', msg);
  }
};

// Mandatory mixed-header example
{
  const productGstMap = new Map([
    ['flute', { gstRate: 20, headerId: 'musical' }],
    ['watch', { gstRate: 10, headerId: 'gifts' }],
  ]);
  const { gst, lineGst } = calculateQcLineGst({
    lines: [
      { productId: 'flute', quantity: 1, unitPrice: 650, lineTotal: 650 },
      { productId: 'watch', quantity: 1, unitPrice: 520, lineTotal: 520 },
    ],
    discount: 0,
    productGstMap,
  });
  assert(gst === 182, `mixed GST expected 182 got ${gst}`);
  assert(lineGst[0].gstAmount === 130, `flute GST expected 130 got ${lineGst[0].gstAmount}`);
  assert(lineGst[1].gstAmount === 52, `watch GST expected 52 got ${lineGst[1].gstAmount}`);
  assert(gst !== 234, 'must not equal max-rate 234');
}

// Quantity
{
  const productGstMap = new Map([['flute', { gstRate: 20, headerId: 'musical' }]]);
  const { gst } = calculateQcLineGst({
    lines: [{ productId: 'flute', quantity: 2, unitPrice: 250, lineTotal: 500 }],
    discount: 0,
    productGstMap,
  });
  assert(gst === 100, `qty GST expected 100 got ${gst}`);
}

// Coupon pro-rata then per-line GST
{
  const productGstMap = new Map([
    ['flute', { gstRate: 20, headerId: 'musical' }],
    ['watch', { gstRate: 10, headerId: 'gifts' }],
  ]);
  // ₹117 discount on ₹1170 → shares 65 + 52
  const shares = distributeQcAmountProRata(117, [650, 520]);
  assert(Math.abs(shares[0] + shares[1] - 117) < 0.001, `shares sum ${shares[0]}+${shares[1]}`);
  const { gst, lineGst } = calculateQcLineGst({
    lines: [
      { productId: 'flute', quantity: 1, unitPrice: 650, lineTotal: 650 },
      { productId: 'watch', quantity: 1, unitPrice: 520, lineTotal: 520 },
    ],
    discount: 117,
    productGstMap,
  });
  // taxable: 585 @20% = 117; 468 @10% = 47; total 164
  const expected =
    Math.round(lineGst[0].taxableAmount * 0.2) + Math.round(lineGst[1].taxableAmount * 0.1);
  assert(gst === expected, `coupon GST expected ${expected} got ${gst}`);
  assert(gst < 182, 'coupon should reduce GST vs no-coupon 182');
}

// Coupon ADMIN100: 15% of 1170 = 176 → taxable 994, per-line GST
{
  const productGstMap = new Map([
    ['flute', { gstRate: 20, headerId: 'musical' }],
    ['watch', { gstRate: 10, headerId: 'gifts' }],
  ]);
  const discount = 176;
  const { gst, lineGst, discount: appliedDiscount } = calculateQcLineGst({
    lines: [
      { productId: 'flute', quantity: 1, unitPrice: 650, lineTotal: 650 },
      { productId: 'watch', quantity: 1, unitPrice: 520, lineTotal: 520 },
    ],
    discount,
    productGstMap,
  });
  const shareSum = lineGst.reduce((s, row) => s + Number(row.couponShare || 0), 0);
  const taxableSum = lineGst.reduce((s, row) => s + Number(row.taxableAmount || 0), 0);
  assert(appliedDiscount === 176, `discount expected 176 got ${appliedDiscount}`);
  assert(Math.abs(shareSum - 176) < 0.001, `coupon shares must sum to 176 got ${shareSum}`);
  assert(Math.abs(taxableSum - 994) < 0.001, `taxable sum expected 994 got ${taxableSum}`);
  assert(gst !== 182, 'coupon GST must not stay at pre-coupon 182');
  assert(gst !== Math.round(994 * 0.2), 'must not use max-rate on post-coupon total');
  const expected =
    Math.round(lineGst[0].taxableAmount * 0.2) + Math.round(lineGst[1].taxableAmount * 0.1);
  assert(gst === expected, `ADMIN100 GST expected ${expected} got ${gst}`);
  console.log(`  ADMIN100 → GST ₹${gst} (flute ₹${lineGst[0].gstAmount}, watch ₹${lineGst[1].gstAmount})`);
}


if (process.exitCode) {
  console.error('\nQC line GST verification FAILED');
} else {
  console.log('\nQC line GST verification PASSED');
}
