import mongoose from 'mongoose';
import { QuickCategory } from '../models/category.model.js';

/** Round to 2 decimal rupees (paise-safe). */
export const roundQcMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const toPaise = (value) => Math.round((Number(value) || 0) * 100);

/**
 * Largest-remainder distribution so allocated parts always sum to total (paise).
 * Same approach as QC return coupon shares — used to spread cart-level coupon
 * across lines before per-header GST (does not change coupon eligibility rules).
 */
export const distributeQcAmountProRata = (totalAmount, weights = []) => {
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

const normalizeObjectId = (value) => {
  if (!value) return '';
  if (typeof value === 'object' && value._id) return String(value._id).trim();
  const raw = String(value).trim();
  return mongoose.Types.ObjectId.isValid(raw) ? raw : '';
};

/** Stable product/line id key (ObjectId or plain string). */
const normalizeProductKey = (value) => {
  if (!value) return '';
  if (typeof value === 'object' && value._id) return String(value._id).trim();
  return String(value).trim();
};

/**
 * Batch-resolve Header GST % for products.
 * Prefer product.headerId → handlingFees; else categoryId → parent header.
 * Returns Map(productId → { gstRate, headerId }).
 */
export async function buildProductHeaderGstMap(products = []) {
  const list = Array.isArray(products) ? products : [];
  const result = new Map();
  if (!list.length) return result;

  const candidateIds = new Set();
  list.forEach((product) => {
    const headerId = normalizeObjectId(product?.headerId);
    const categoryId = normalizeObjectId(product?.categoryId);
    if (headerId) candidateIds.add(headerId);
    if (categoryId) candidateIds.add(categoryId);
  });

  if (!candidateIds.size) {
    list.forEach((product) => {
      const pid = normalizeProductKey(product?._id || product?.id || product?.productId);
      if (pid) result.set(pid, { gstRate: 0, headerId: '' });
    });
    return result;
  }

  const categories = await QuickCategory.find({ _id: { $in: Array.from(candidateIds) } })
    .select('_id type parentId handlingFees')
    .lean();

  const byId = new Map(categories.map((doc) => [String(doc._id), doc]));

  const missingParentIds = new Set();
  categories.forEach((doc) => {
    if (String(doc.type || '') !== 'header' && doc.parentId) {
      const parentId = String(doc.parentId);
      if (!byId.has(parentId)) missingParentIds.add(parentId);
    }
  });

  if (missingParentIds.size) {
    const parents = await QuickCategory.find({
      _id: { $in: Array.from(missingParentIds) },
      type: 'header',
    })
      .select('_id type parentId handlingFees')
      .lean();
    parents.forEach((doc) => byId.set(String(doc._id), doc));
  }

  const resolveHeader = (product) => {
    const headerId = normalizeObjectId(product?.headerId);
    if (headerId) {
      const header = byId.get(headerId);
      if (header && String(header.type || '') === 'header') {
        return header;
      }
      // headerId pointed at a non-header / missing — try as-is rate if present
      if (header) return header;
    }

    const categoryId = normalizeObjectId(product?.categoryId);
    if (!categoryId) return null;
    const main = byId.get(categoryId);
    if (!main) return null;
    if (String(main.type || '') === 'header') return main;
    const parentId = normalizeObjectId(main.parentId);
    return parentId ? byId.get(parentId) || null : null;
  };

  list.forEach((product) => {
    const pid = normalizeProductKey(product?._id || product?.id || product?.productId);
    if (!pid) return;
    const header = resolveHeader(product);
    result.set(pid, {
      gstRate: Math.max(0, Number(header?.handlingFees || 0)),
      headerId: header?._id ? String(header._id) : '',
    });
  });

  return result;
}

/**
 * Per-line QC GST (exclusive prices).
 * Coupon discount is allocated pro-rata by line subtotal (existing cart-level coupon amount),
 * then each line uses its own Header GST %.
 */
export function calculateQcLineGst({
  lines = [],
  discount = 0,
  productGstMap = new Map(),
} = {}) {
  const normalized = (Array.isArray(lines) ? lines : []).map((line) => {
    const productId = normalizeProductKey(line?.productId || line?._id || line?.id);
    const quantity = Math.max(0, Number(line?.quantity || 0));
    const unitPrice = Number(
      line?.unitPrice ?? line?.price ?? line?.salePrice ?? 0,
    );
    const lineSubtotal = Number.isFinite(Number(line?.lineTotal))
      ? Math.max(0, Number(line.lineTotal))
      : Math.max(0, unitPrice * quantity);
    const fromMap = productId ? productGstMap.get(productId) : null;
    const gstRate = Math.max(
      0,
      Number(
        line?.gstRate ??
          fromMap?.gstRate ??
          line?.headerGstRate ??
          0,
      ),
    );
    const headerId = String(line?.headerId || fromMap?.headerId || '').trim();

    return {
      productId,
      quantity,
      unitPrice: roundQcMoney(unitPrice),
      lineSubtotal: roundQcMoney(lineSubtotal),
      gstRate,
      headerId,
      variantKey: String(line?.variantKey || '').trim(),
      variantName: String(line?.variantName || '').trim(),
    };
  });

  const safeDiscount = Math.max(0, Number(discount || 0));
  const couponShares = distributeQcAmountProRata(
    safeDiscount,
    normalized.map((line) => line.lineSubtotal),
  );

  let totalGst = 0;
  const details = normalized.map((line, index) => {
    const couponShare = Number(couponShares[index] || 0);
    const taxableAmount = Math.max(0, roundQcMoney(line.lineSubtotal - couponShare));
    // Same rounding style as legacy cart-level Math.round(amount * rate / 100), per line.
    const gstAmount =
      line.gstRate > 0 ? Math.round(taxableAmount * (line.gstRate / 100)) : 0;
    totalGst += gstAmount;
    return {
      productId: line.productId,
      variantKey: line.variantKey,
      variantName: line.variantName,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineSubtotal: line.lineSubtotal,
      couponShare,
      taxableAmount,
      headerId: line.headerId,
      gstRate: line.gstRate,
      gstAmount,
    };
  });

  return {
    gst: totalGst,
    lineGst: details,
    discount: roundQcMoney(safeDiscount),
  };
}
