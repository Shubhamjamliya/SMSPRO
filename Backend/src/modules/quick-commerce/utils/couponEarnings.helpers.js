/**
 * QC coupon who-pays helpers.
 * Admin coupon → discount from platform/admin earnings.
 * Seller coupon → discount from seller receivable.
 * Food flows are untouched; only use these for orderType quick/mixed QC paths.
 */

export const resolveQuickCouponSource = (coupon) => {
  if (!coupon) return '';
  if (coupon.isSellerCoupon === true) return 'seller';
  return 'admin';
};

export const getQuickCouponDiscount = (pricing = {}) =>
  Math.max(
    0,
    Number(pricing?.couponDiscount ?? pricing?.discount ?? 0) || 0,
  );

export const getQuickCouponSource = (pricing = {}) => {
  const raw = String(pricing?.couponSource || '').trim().toLowerCase();
  if (raw === 'seller' || raw === 'restaurant') return 'seller';
  if (raw === 'admin') return 'admin';
  return '';
};

/** Cut seller receivable when the coupon is seller-funded. */
export const applySellerCouponToReceivable = (
  receivable,
  { discount = 0, couponSource = '' } = {},
) => {
  const base = Math.max(0, Number(receivable) || 0);
  if (getQuickCouponSource({ couponSource }) !== 'seller') return base;
  return Math.max(0, Number((base - Math.max(0, Number(discount) || 0)).toFixed(2)));
};

/** Cut platform/admin profit when the coupon is admin-funded. */
export const applyAdminCouponToPlatformProfit = (
  platformProfit,
  { discount = 0, couponSource = '' } = {},
) => {
  const base = Math.max(0, Number(platformProfit) || 0);
  if (getQuickCouponSource({ couponSource }) !== 'admin') return base;
  return Math.max(0, Number((base - Math.max(0, Number(discount) || 0)).toFixed(2)));
};
