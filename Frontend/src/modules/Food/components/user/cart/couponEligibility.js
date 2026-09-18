const RUPEE = "\u20B9"

/**
 * Resolve whether a coupon can be applied and a human-readable reason if not.
 */
export function getCouponEligibility(coupon, { subtotal = 0, userOrderCount = 0 } = {}) {
  if (!coupon) {
    return { applicable: false, reason: "Coupon unavailable", status: "unavailable" }
  }

  const now = Date.now()
  const end = coupon.endDate ? new Date(coupon.endDate).getTime() : null
  const start = coupon.startDate ? new Date(coupon.startDate).getTime() : null

  if (Number.isFinite(end) && end < now) {
    return { applicable: false, reason: "Expired", status: "expired" }
  }
  if (Number.isFinite(start) && start > now) {
    return { applicable: false, reason: "Not yet active", status: "upcoming" }
  }

  if (coupon.restaurantEligible === false || coupon.restaurantNotEligible === true) {
    return { applicable: false, reason: "Restaurant not eligible", status: "restaurant" }
  }

  if (coupon.categoryRestricted === true || coupon.categoryEligible === false) {
    return { applicable: false, reason: "Category restriction", status: "category" }
  }

  if (coupon.alreadyUsed === true || coupon.isUsed === true) {
    return { applicable: false, reason: "Already used", status: "used" }
  }

  if (coupon.customerGroup === "new" && Number(userOrderCount) > 0) {
    return { applicable: false, reason: "First-time users only", status: "new_users" }
  }

  const minOrder = Number(coupon.minOrder) || 0
  if (subtotal < minOrder) {
    const gap = Math.max(0, minOrder - subtotal)
    return {
      applicable: false,
      reason: `Minimum order ${RUPEE}${minOrder} not met · Add ${RUPEE}${Math.round(gap)} more`,
      status: "min_order",
    }
  }

  if (coupon.eligible === false && coupon.ineligibilityReason) {
    return {
      applicable: false,
      reason: String(coupon.ineligibilityReason),
      status: "other",
    }
  }

  return { applicable: true, reason: null, status: "applicable" }
}

export function formatCouponExpiry(endDate) {
  if (!endDate) return null
  const d = new Date(endDate)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}
