import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { QuickFeeSettings } from '../models/feeSettings.model.js';
import { QuickDeliveryCommissionRule } from '../models/deliveryCommissionRule.model.js';
import { QuickCategory } from '../../models/category.model.js';
import { sumUniqueProductPackingFee } from '../../utils/packing.helpers.js';
import {
  buildProductHeaderGstMap,
  calculateQcLineGst,
} from '../../utils/gst.helpers.js';

const DEFAULT_QUICK_FEE_SETTINGS = {
  deliveryFee: 0,
  deliveryFeeRanges: [],
  freeDeliveryThreshold: 0,
  platformFee: 0,
  gstRate: 0,
  returnWindowHours: 72,
  returnsEnabled: true,
  isActive: true,
};
let deliveryCommissionRulesCache = null;
let deliveryCommissionRulesLoadedAt = 0;
const DELIVERY_COMMISSION_CACHE_MS = 30 * 1000;

const clearDeliveryCommissionRulesCache = () => {
  deliveryCommissionRulesCache = null;
  deliveryCommissionRulesLoadedAt = 0;
};

export async function getDeliveryCommissionRules() {
  const list = await QuickDeliveryCommissionRule.find({}).sort({ createdAt: -1 }).lean();
  const commissions = list.map((r, index) => ({
    _id: r._id,
    sl: index + 1,
    name: r.name || '',
    minDistance: r.minDistance,
    maxDistance: r.maxDistance ?? null,
    commissionPerKm: r.commissionPerKm,
    basePayout: r.basePayout,
    status: r.status !== false,
  }));
  return { commissions };
}

function validateCommissionRuleSet(rules) {
  const active = (rules || []).filter((r) => r && r.status !== false);
  if (!active.length) {
    throw new ValidationError('A base slab with minDistance = 0 is required');
  }

  const baseRules = active.filter((r) => Number(r.minDistance || 0) === 0);
  if (baseRules.length === 0) {
    throw new ValidationError('A base slab with minDistance = 0 is required');
  }
  if (baseRules.length > 1) {
    throw new ValidationError('Exactly one base slab with minDistance = 0 is allowed. You already have a base slab active. Please edit the existing one instead of adding a new one.');
  }

  const sorted = [...active].sort((a, b) => Number(a.minDistance || 0) - Number(b.minDistance || 0));
  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    const min = Number(current.minDistance || 0);
    const max = current.maxDistance == null ? null : Number(current.maxDistance);
    if (max != null && max <= min) {
      throw new ValidationError('maxDistance must be greater than minDistance');
    }
    if (i > 0) {
      const prev = sorted[i - 1];
      const prevMin = Number(prev.minDistance || 0);
      const prevMax = prev.maxDistance == null ? null : Number(prev.maxDistance);
      const effectivePrevMax = prevMax == null ? Infinity : prevMax;
      if (min < effectivePrevMax) {
        throw new ValidationError('Distance slabs must not overlap');
      }
      if (min === prevMin) {
        throw new ValidationError('Distance slabs must not share the same minDistance');
      }
    }
  }
}

export async function createDeliveryCommissionRule(body) {
  if (Number(body.minDistance || 0) === 0 && (body.status ?? true) !== false) {
    // Automatically deactivate any existing active base slab
    await QuickDeliveryCommissionRule.updateMany(
      { minDistance: 0, status: { $ne: false } },
      { $set: { status: false } }
    );
  }
  const existing = await QuickDeliveryCommissionRule.find({}).lean();
  const candidate = [
    ...existing,
    {
      minDistance: body.minDistance,
      maxDistance: body.maxDistance ?? null,
      commissionPerKm: body.commissionPerKm,
      basePayout: body.basePayout,
      status: body.status ?? true,
    },
  ];

  validateCommissionRuleSet(candidate);
  const created = await QuickDeliveryCommissionRule.create({
    name: body.name || '',
    minDistance: body.minDistance,
    maxDistance: body.maxDistance ?? null,
    commissionPerKm: body.commissionPerKm,
    basePayout: body.basePayout,
    status: body.status ?? true,
  });
  clearDeliveryCommissionRulesCache();
  return created.toObject();
}

export async function updateDeliveryCommissionRule(id, body) {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
  if (Number(body.minDistance || 0) === 0 && body.status !== false) {
    // Automatically deactivate any other active base slab except the one being updated
    await QuickDeliveryCommissionRule.updateMany(
      { _id: { $ne: id }, minDistance: 0, status: { $ne: false } },
      { $set: { status: false } }
    );
  }
  const existing = await QuickDeliveryCommissionRule.find({}).lean();
  const candidate = existing.map((r) =>
    String(r._id) === String(id)
      ? {
          ...r,
          minDistance: body.minDistance,
          maxDistance: body.maxDistance ?? null,
          commissionPerKm: body.commissionPerKm,
          basePayout: body.basePayout,
          status: r.status !== false,
        }
      : r,
  );

  validateCommissionRuleSet(candidate);
  const updated = await QuickDeliveryCommissionRule.findByIdAndUpdate(
    id,
    {
      $set: {
        name: body.name || '',
        minDistance: body.minDistance,
        maxDistance: body.maxDistance ?? null,
        commissionPerKm: body.commissionPerKm,
        basePayout: body.basePayout,
      },
    },
    { new: true },
  ).lean();
  clearDeliveryCommissionRulesCache();
  return updated;
}

export async function deleteDeliveryCommissionRule(id) {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
  const deleted = await QuickDeliveryCommissionRule.findByIdAndDelete(id).lean();
  clearDeliveryCommissionRulesCache();
  return deleted ? { id } : null;
}

export async function toggleDeliveryCommissionRuleStatus(id, status) {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
  const updated = await QuickDeliveryCommissionRule.findByIdAndUpdate(
    id,
    { $set: { status: Boolean(status) } },
    { new: true },
  ).lean();
  clearDeliveryCommissionRulesCache();
  return updated;
}

const sanitizeFeeSettingsForApi = (doc) => {
  if (!doc) return null;
  return {
    _id: doc._id,
    platformFee: Number(doc.platformFee || 0),
    returnsEnabled: doc.returnsEnabled !== false,
    isActive: doc.isActive !== false,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
};

export async function getFeeSettings() {
  const doc = await QuickFeeSettings.findOne({ isActive: true }).sort({ createdAt: -1 }).lean();
  return { feeSettings: sanitizeFeeSettingsForApi(doc) };
}

export async function upsertFeeSettings(body) {
  const existing = await QuickFeeSettings.findOne({ isActive: true }).sort({ createdAt: -1 });
  if (existing) {
    const $set = {};

    if (body.platformFee === null) $set.platformFee = 0;
    else if (body.platformFee !== undefined) $set.platformFee = body.platformFee;

    if (body.returnsEnabled !== undefined) $set.returnsEnabled = Boolean(body.returnsEnabled);

    if (body.isActive !== undefined) $set.isActive = body.isActive;

    if (!Object.keys($set).length) return sanitizeFeeSettingsForApi(existing.toObject());

    const updated = await QuickFeeSettings.findByIdAndUpdate(
      existing._id,
      { $set },
      { new: true },
    ).lean();
    return sanitizeFeeSettingsForApi(updated);
  }

  const payload = {
    deliveryFeeRanges: [],
    isActive: body.isActive ?? true,
    returnsEnabled: body.returnsEnabled ?? true,
    platformFee: body.platformFee ?? 0,
  };

  const created = await QuickFeeSettings.create(payload);
  return sanitizeFeeSettingsForApi(created.toObject());
}

export async function getActiveFeeSettings() {
  const doc = await QuickFeeSettings.findOne({ isActive: true }).sort({ createdAt: -1 }).lean();
  return doc || DEFAULT_QUICK_FEE_SETTINGS;
}

async function getHeaderCategoryRatesFromProducts(products = []) {
  const ids = new Set();

  for (const product of products) {
    const candidates = [product?.headerId, product?.categoryId];
    candidates.forEach((value) => {
      const normalized =
        value && typeof value === 'object' && value._id ? String(value._id) : String(value || '').trim();
      if (normalized && mongoose.Types.ObjectId.isValid(normalized)) {
        ids.add(normalized);
      }
    });
  }

  if (!ids.size) {
    return { gstRate: 0, commissionRate: 0, handlingFee: 0, returnWindowDays: 0 };
  }

  const categories = await QuickCategory.find({ _id: { $in: Array.from(ids) } })
    .select('_id type parentId handlingFees adminCommission returnWindowDays')
    .lean();

  // Prefer header nodes; also resolve parent headers for main categories
  const headerIds = new Set();
  categories.forEach((category) => {
    if (String(category.type || '') === 'header') {
      headerIds.add(String(category._id));
    } else if (category.parentId) {
      headerIds.add(String(category.parentId));
    }
  });

  let headers = categories.filter((category) => headerIds.has(String(category._id)));
  const missingHeaderIds = [...headerIds].filter(
    (id) => !headers.some((header) => String(header._id) === id),
  );
  if (missingHeaderIds.length) {
    const extra = await QuickCategory.find({ _id: { $in: missingHeaderIds }, type: 'header' })
      .select('_id handlingFees adminCommission returnWindowDays')
      .lean();
    headers = [...headers, ...extra];
  }

  return headers.reduce(
    (acc, category) => ({
      gstRate: Math.max(acc.gstRate, Number(category?.handlingFees || 0)),
      commissionRate: Math.max(acc.commissionRate, Number(category?.adminCommission || 0)),
      // handlingFees on header = GST % only (not a flat ₹ handling fee)
      handlingFee: acc.handlingFee,
      returnWindowDays: Math.max(acc.returnWindowDays, Number(category?.returnWindowDays || 0)),
    }),
    { gstRate: 0, commissionRate: 0, handlingFee: 0, returnWindowDays: 0 },
  );
}

/** Resolve return window hours from product header categories (max days among items). */
export async function resolveReturnWindowHoursFromProducts(products = [], feeSettings = null) {
  const rates = await getHeaderCategoryRatesFromProducts(products);
  const days = Number(rates.returnWindowDays || 0);
  if (Number.isFinite(days) && days > 0) {
    return Math.round(days * 24);
  }
  const fallbackHours = Number(feeSettings?.returnWindowHours);
  if (Number.isFinite(fallbackHours) && fallbackHours > 0) return fallbackHours;
  return 72;
}

/**
 * Resolve the per-product Quick Commerce return policy in ONE database round trip.
 *
 * Unlike resolveReturnWindowHoursFromProducts (which collapses an order to a single
 * MAX window and is still used for legacy orders), this returns an independent policy
 * for every product so each order line can carry its own snapshot.
 *
 * @param {Array} products - QuickProduct documents (must carry headerId / categoryId)
 * @returns {Promise<Map<string, object>>} productId -> { categoryId, categoryName, headerId, headerName, returnPolicySnapshot }
 */
export async function resolveQuickOrderItemCategoryPolicyMap(products = [], feeSettings = null) {
  const result = new Map();
  if (!Array.isArray(products) || !products.length) return result;

  const toId = (value) => {
    if (!value) return '';
    const normalized = value && typeof value === 'object' && value._id ? String(value._id) : String(value).trim();
    return mongoose.Types.ObjectId.isValid(normalized) ? normalized : '';
  };

  const ids = new Set();
  products.forEach((product) => {
    const headerId = toId(product?.headerId);
    const categoryId = toId(product?.categoryId);
    if (headerId) ids.add(headerId);
    if (categoryId) ids.add(categoryId);
  });

  const categoryById = new Map();
  if (ids.size) {
    const categories = await QuickCategory.find({ _id: { $in: Array.from(ids) } })
      .select('_id name type parentId returnWindowDays')
      .lean();
    categories.forEach((category) => categoryById.set(String(category._id), category));

    // Resolve parent headers of main categories that were not already fetched.
    const missingParentIds = new Set();
    categories.forEach((category) => {
      if (String(category.type || '') === 'header') return;
      const parentId = toId(category.parentId);
      if (parentId && !categoryById.has(parentId)) missingParentIds.add(parentId);
    });
    if (missingParentIds.size) {
      const parents = await QuickCategory.find({ _id: { $in: Array.from(missingParentIds) } })
        .select('_id name type parentId returnWindowDays')
        .lean();
      parents.forEach((category) => categoryById.set(String(category._id), category));
    }
  }

  const fallbackHours = Number(feeSettings?.returnWindowHours);
  const fallbackDays = Number.isFinite(fallbackHours) && fallbackHours > 0
    ? Math.max(1, Math.round(fallbackHours / 24))
    : 3;
  const snapshotAt = new Date();

  products.forEach((product) => {
    const productId = String(product?._id || '');
    if (!productId) return;

    const categoryDoc = categoryById.get(toId(product?.categoryId)) || null;
    let headerDoc = categoryById.get(toId(product?.headerId)) || null;
    if (!headerDoc || String(headerDoc.type || '') !== 'header') {
      if (categoryDoc && String(categoryDoc.type || '') === 'header') {
        headerDoc = categoryDoc;
      } else if (categoryDoc?.parentId) {
        const parent = categoryById.get(toId(categoryDoc.parentId));
        if (parent && String(parent.type || '') === 'header') headerDoc = parent;
      }
    }

    const headerDays = Number(headerDoc?.returnWindowDays || 0);
    const hasHeaderPolicy = Number.isFinite(headerDays) && headerDays > 0;

    result.set(productId, {
      categoryId: toId(product?.categoryId),
      categoryName: categoryDoc?.name || '',
      headerId: headerDoc ? String(headerDoc._id) : toId(product?.headerId),
      headerName: headerDoc?.name || '',
      returnPolicySnapshot: {
        eligible: true,
        returnWindowDays: hasHeaderPolicy ? headerDays : fallbackDays,
        source: hasHeaderPolicy ? 'header' : 'global_fallback',
        sourceId: hasHeaderPolicy ? String(headerDoc._id) : '',
        snapshotAt,
      },
    });
  });

  return result;
}

export async function calculateHandlingFeeFromProducts(products = []) {
  const rates = await getHeaderCategoryRatesFromProducts(products);
  return rates.handlingFee;
}

export async function getCategoryCommissionRateFromProducts(products = []) {
  const rates = await getHeaderCategoryRatesFromProducts(products);
  return rates.commissionRate;
}

/**
 * Legacy helper used by food mixed-order paths.
 * Keep behavior intact so Food is unaffected when QC admin stops editing these fields.
 */
export function calculateDeliveryFeeFromSettings(subtotal, feeSettings = DEFAULT_QUICK_FEE_SETTINGS) {
  const safeSubtotal = Number(subtotal || 0);
  const freeThreshold = Number(feeSettings.freeDeliveryThreshold || 0);

  if (Number.isFinite(freeThreshold) && freeThreshold > 0 && safeSubtotal >= freeThreshold) {
    return 0;
  }

  const ranges = Array.isArray(feeSettings.deliveryFeeRanges)
    ? [...feeSettings.deliveryFeeRanges].sort((a, b) => Number(a.min) - Number(b.min))
    : [];

  if (ranges.length) {
    let matched = null;
    for (let i = 0; i < ranges.length; i += 1) {
      const range = ranges[i] || {};
      const min = Number(range.min);
      const max = Number(range.max);
      const fee = Number(range.fee);
      if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(fee)) continue;
      const isLast = i === ranges.length - 1;
      const inRange = isLast
        ? safeSubtotal >= min && safeSubtotal <= max
        : safeSubtotal >= min && safeSubtotal < max;
      if (inRange) {
        matched = fee;
        break;
      }
    }
    if (Number.isFinite(matched)) return matched;
  }

  return Number(feeSettings.deliveryFee || 0);
}

export async function calculateQuickPricing({
  subtotal = 0,
  discount = 0,
  products = [],
  lineItems = [],
  distanceKm = 0,
} = {}) {
  const feeSettings = await getActiveFeeSettings();
  const safeSubtotal = Number(subtotal || 0);
  const safeDiscount = Math.max(0, Number(discount || 0));
  const platformFee = Number(feeSettings.platformFee || 0);

  // Flat ₹ handling fee is unused for QC (header.handlingFees = GST % only).
  const handlingFee = 0;

  // Flat slab fee for the matched distance band (= rider earning; customer pays same).
  // Not cumulative base + ₹/km — matches admin "Delivery Fee" per band.
  const deliveryFee = await getRiderEarning(distanceKm);

  // Per-line Header GST (NOT cart × Math.max rate). Food does not call this function.
  const productGstMap = await buildProductHeaderGstMap(products);
  const packagingSource =
    Array.isArray(lineItems) && lineItems.length
      ? lineItems
      : (products || []).map((product) => ({
          productId: product?._id || product?.id || product?.productId,
          packingAmount: product?.packingAmount,
          quantity: 1,
          lineTotal: Number(product?.price || product?.salePrice || 0),
          unitPrice: Number(product?.salePrice || product?.price || 0),
        }));

  const { gst, lineGst } = calculateQcLineGst({
    lines: packagingSource,
    discount: safeDiscount,
    productGstMap,
  });

  // Flat packing per unique product — never multiply by qty / variant lines.
  const packagingFee = sumUniqueProductPackingFee(packagingSource);

  const total = Math.max(
    0,
    safeSubtotal + deliveryFee + platformFee + gst + packagingFee - safeDiscount,
  );

  return {
    pricing: {
      subtotal: safeSubtotal,
      gst,
      tax: gst,
      packagingFee: Number(packagingFee.toFixed(2)),
      deliveryFee,
      platformFee,
      handlingFee,
      restaurantCommission: 0,
      discount: safeDiscount,
      total,
      currency: 'INR',
      lineGst,
    },
    snapshots: {
      feeSettings: sanitizeFeeSettingsForApi(feeSettings) || {
        platformFee,
        returnsEnabled: feeSettings.returnsEnabled !== false,
        isActive: true,
      },
    },
  };
}


export async function getActiveDeliveryCommissionRules() {
  const now = Date.now();
  if (
    deliveryCommissionRulesCache &&
    now - deliveryCommissionRulesLoadedAt < DELIVERY_COMMISSION_CACHE_MS
  ) {
    return deliveryCommissionRulesCache;
  }

  const list = await QuickDeliveryCommissionRule.find({ status: { $ne: false } }).lean();
  deliveryCommissionRulesCache = list || [];
  deliveryCommissionRulesLoadedAt = now;
  return deliveryCommissionRulesCache;
}

/**
 * Flat band fee for the distance slab the trip falls into.
 *
 * Admin UI stores:
 *   - base slab (minDistance = 0) → basePayout
 *   - other slabs → commissionPerKm field (used here as the flat band fee, NOT ₹/km)
 *
 * Example (admin table):
 *   0–3 km → ₹50,  3–6 km → ₹60,  6+ km → ₹70
 *   4.08 km → ₹60 (matched band), never 50 + 1.08×60.
 *
 * At a shared boundary (e.g. exactly 3.0 / 6.0 km) the higher-min slab wins so
 * "from X km" bands take precedence.
 */
const resolveFlatSlabFee = (rule) => {
  if (!rule) return 0;
  const isBase = Number(rule.minDistance || 0) === 0;
  const fee = isBase ? Number(rule.basePayout || 0) : Number(rule.commissionPerKm || 0);
  return Number.isFinite(fee) && fee > 0 ? fee : 0;
};

export async function getRiderEarningBreakdown(distanceKm) {
  const d = Number(distanceKm);
  const distanceRounded = Number.isFinite(d) && d >= 0 ? Math.round(d * 100) / 100 : 0;
  const empty = {
    distanceKm: Number.isFinite(d) && d >= 0 ? distanceRounded : 0,
    earning: 0,
    basePayout: 0,
    baseKm: 0,
    extraKm: 0,
    perKmRate: 0,
    pricingMode: 'flat_slab',
    slabCharges: [],
  };

  if (!Number.isFinite(d) || d < 0) return empty;

  const rules = await getActiveDeliveryCommissionRules();
  if (!rules.length) return { ...empty, distanceKm: distanceRounded };

  const sorted = [...rules].sort((a, b) => (a.minDistance || 0) - (b.minDistance || 0));
  const baseRule = sorted.find((r) => Number(r.minDistance || 0) === 0) || null;
  const basePayout = Number(baseRule?.basePayout || 0);
  const baseKm = baseRule
    ? baseRule.maxDistance == null
      ? Number(baseRule.minDistance || 0)
      : Number(baseRule.maxDistance || 0)
    : 0;

  let matched = null;
  for (const rule of sorted) {
    const min = Number(rule.minDistance || 0);
    const max = rule.maxDistance == null ? null : Number(rule.maxDistance);
    // Half-open band [min, max); unlimited band is [min, ∞).
    if (d < min) continue;
    if (max != null && d >= max) continue;
    matched = rule;
    break;
  }

  const flatFee = resolveFlatSlabFee(matched);
  if (!matched || flatFee <= 0) {
    return {
      ...empty,
      distanceKm: distanceRounded,
      basePayout,
      baseKm,
    };
  }

  const matchedMin = Number(matched.minDistance || 0);
  const matchedMax = matched.maxDistance == null ? null : Number(matched.maxDistance);

  return {
    distanceKm: distanceRounded,
    earning: Math.round(flatFee),
    basePayout,
    baseKm,
    extraKm: 0,
    perKmRate: 0,
    pricingMode: 'flat_slab',
    matchedSlab: {
      minDistance: matchedMin,
      maxDistance: matchedMax,
      flatFee: Math.round(flatFee),
    },
    slabCharges: [
      {
        fromKm: matchedMin,
        toKm: matchedMax,
        kmInSlab: distanceRounded,
        perKm: 0,
        flatFee: Math.round(flatFee),
        charge: Math.round(flatFee),
      },
    ],
  };
}

export async function getRiderEarning(distanceKm) {
  const breakdown = await getRiderEarningBreakdown(distanceKm);
  return breakdown.earning;
}
