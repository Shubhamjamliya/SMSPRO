import { QuickSellerCommission } from '../models/sellerCommission.model.js';

const SELLER_COMMISSION_CACHE_MS = 60 * 1000;
let sellerCommissionRulesCache = null;
let sellerCommissionRulesLoadedAt = 0;

export function invalidateSellerCommissionCache() {
  sellerCommissionRulesCache = null;
  sellerCommissionRulesLoadedAt = 0;
}

async function getActiveSellerCommissionRules() {
  const now = Date.now();
  if (
    sellerCommissionRulesCache &&
    now - sellerCommissionRulesLoadedAt < SELLER_COMMISSION_CACHE_MS
  ) {
    return sellerCommissionRulesCache;
  }

  const list = await QuickSellerCommission.find({
    status: { $ne: false },
  }).lean();
  sellerCommissionRulesCache = list || [];
  sellerCommissionRulesLoadedAt = now;
  return sellerCommissionRulesCache;
}

export function computeSellerCommissionAmount(baseAmount, rule) {
  const safeBase = Math.max(0, Number(baseAmount) || 0);
  const empty = {
    commissionAmount: 0,
    commissionType: rule?.defaultCommission?.type || 'percentage',
    commissionValue: 0,
    baseAmount: Number.isFinite(safeBase) ? safeBase : 0,
  };

  if (!Number.isFinite(safeBase) || safeBase <= 0) {
    return empty;
  }

  const commissionType = rule?.defaultCommission?.type || 'percentage';
  const commissionValue = Math.max(
    0,
    Number(rule?.defaultCommission?.value ?? 0) || 0,
  );

  let commissionAmount = 0;
  if (commissionType === 'percentage') {
    commissionAmount = safeBase * (commissionValue / 100);
  } else if (commissionType === 'amount') {
    commissionAmount = commissionValue;
  }

  commissionAmount = Math.round((commissionAmount || 0) * 100) / 100;
  commissionAmount = Math.max(0, Math.min(commissionAmount, safeBase));

  return { commissionAmount, commissionType, commissionValue, baseAmount: safeBase };
}

/**
 * Seller Commission page rule for one seller (active only).
 */
export async function getSellerCommissionSnapshot(sellerId, baseAmount) {
  const safeBase = Math.max(0, Number(baseAmount) || 0);
  if (!sellerId) {
    return {
      commissionAmount: 0,
      commissionType: 'percentage',
      commissionValue: 0,
      baseAmount: safeBase,
      hasRule: false,
      source: 'none',
    };
  }

  const rules = await getActiveSellerCommissionRules();
  const rule = rules.find((r) => String(r.sellerId) === String(sellerId)) || null;

  if (!rule) {
    return {
      commissionAmount: 0,
      commissionType: 'percentage',
      commissionValue: 0,
      baseAmount: safeBase,
      hasRule: false,
      source: 'none',
    };
  }

  return {
    ...computeSellerCommissionAmount(safeBase, rule),
    hasRule: true,
    source: 'seller_rule',
  };
}

/**
 * Earnings commission for QC seller orders:
 * 1) Active Seller Commission rule (admin page) — highest priority
 * 2) Else Header category adminCommission %
 * 3) Else 0
 */
export async function resolveQuickSellerCommissionAmount(
  sellerId,
  baseAmount,
  productItems = [],
) {
  const snap = await getSellerCommissionSnapshot(sellerId, baseAmount);
  if (snap.hasRule) {
    return snap.commissionAmount;
  }

  try {
    const { getCategoryCommissionRateFromProducts } = await import(
      './billing.service.js'
    );
    const rate = await getCategoryCommissionRateFromProducts(productItems);
    const safeBase = Math.max(0, Number(baseAmount) || 0);
    if (rate > 0 && safeBase > 0) {
      return Math.round(safeBase * (rate / 100) * 100) / 100;
    }
  } catch {
    // billing helper unavailable — keep 0
  }

  return 0;
}
