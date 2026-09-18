/**
 * QC seller earnings: items − commission + packing − seller coupon.
 * Packing is seller income (never admin). Admin keeps platform/GST/commission only.
 */

import {
  applySellerCouponToReceivable,
  getQuickCouponDiscount,
  getQuickCouponSource,
} from './couponEarnings.helpers.js';
import { sumUniqueProductPackingFee } from './packing.helpers.js';

export const resolveSellerPackingAmount = ({
  items = [],
  parentPricing = {},
  sellerSubtotal = 0,
  parentSubtotal = 0,
} = {}) => {
  const fromItems = sumUniqueProductPackingFee(items);
  if (fromItems > 0) return Number(fromItems.toFixed(2));

  const parentPacking = Math.max(0, Number(parentPricing?.packagingFee || 0));
  if (parentPacking <= 0) return 0;

  const parentSub = Math.max(0, Number(parentSubtotal || parentPricing?.subtotal || 0));
  const sellerSub = Math.max(0, Number(sellerSubtotal || 0));
  if (parentSub <= 0 || sellerSub <= 0) return Number(parentPacking.toFixed(2));

  return Number(((parentPacking * sellerSub) / parentSub).toFixed(2));
};

export const computeSellerReceivable = ({
  subtotal = 0,
  commission = 0,
  packingAmount = 0,
  couponDiscount = 0,
  couponSource = '',
} = {}) => {
  const base = Math.max(
    0,
    Number(
      (
        Math.max(0, Number(subtotal) || 0) -
        Math.max(0, Number(commission) || 0) +
        Math.max(0, Number(packingAmount) || 0)
      ).toFixed(2),
    ),
  );

  return applySellerCouponToReceivable(base, {
    discount: couponDiscount || getQuickCouponDiscount({ couponDiscount }),
    couponSource: couponSource || getQuickCouponSource({ couponSource }),
  });
};

/** On seller cancel, seller keeps packing only (admin gets nothing from that order). */
export const computeSellerCancelPackingCredit = (pricing = {}) =>
  Math.max(0, Number(pricing?.packingAmount || pricing?.packagingFee || 0));
