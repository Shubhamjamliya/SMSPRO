const RUPEE = "\u20B9";

export const CHECKOUT_STORAGE_KEY = "quick_commerce_checkout_state_v1";

export const normalizeCouponCode = (coupon) =>
  String(coupon?.code || coupon?.couponCode || "")
    .trim()
    .toUpperCase();

export const getCouponMinOrder = (coupon) =>
  Math.max(
    0,
    Number(
      coupon?.minOrderValue ??
        coupon?.minOrderAmount ??
        coupon?.minOrder ??
        0,
    ),
  );

export const getCouponMaxDiscount = (coupon) =>
  Math.max(
    0,
    Number(
      coupon?.maxDiscount ??
        coupon?.maxDiscountAmount ??
        coupon?.maxDiscountValue ??
        0,
    ),
  );

export const getCouponDiscountDisplay = (coupon) => {
  if (!coupon) return "";
  if (coupon.discountDisplay) return String(coupon.discountDisplay);
  if (coupon.title) return String(coupon.title);

  const type = String(coupon.discountType || "").toLowerCase();
  const value = Number(coupon.discountValue || 0);
  if (!Number.isFinite(value) || value <= 0) return "Special offer";

  if (type === "percentage" || type === "percent") {
    const max = getCouponMaxDiscount(coupon);
    return max > 0
      ? `${value}% OFF · up to ${RUPEE}${max}`
      : `${value}% OFF`;
  }
  return `${RUPEE}${value} OFF`;
};

export const formatCouponExpiry = (coupon) => {
  const raw =
    coupon?.validTillDate ||
    coupon?.validTill ||
    coupon?.expiryDate ||
    coupon?.endDate ||
    null;
  if (!raw) return null;
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export const getCouponEligibility = (coupon, { subtotal = 0 } = {}) => {
  if (!coupon) {
    return { applicable: false, reason: "Coupon unavailable", status: "unavailable" };
  }

  const now = Date.now();
  const endRaw = coupon.validTill || coupon.expiryDate || coupon.endDate;
  const startRaw = coupon.validFrom || coupon.startDate;
  const end = endRaw ? new Date(endRaw).getTime() : null;
  const start = startRaw ? new Date(startRaw).getTime() : null;

  if (coupon.isActive === false || String(coupon.status || "").toLowerCase() === "inactive") {
    return { applicable: false, reason: "Coupon inactive", status: "inactive" };
  }
  if (Number.isFinite(end) && end < now) {
    return { applicable: false, reason: "Expired", status: "expired" };
  }
  if (Number.isFinite(start) && start > now) {
    return { applicable: false, reason: "Not yet active", status: "upcoming" };
  }

  const minOrder = getCouponMinOrder(coupon);
  if (minOrder > 0 && Number(subtotal || 0) < minOrder) {
    const gap = Math.max(0, minOrder - Number(subtotal || 0));
    return {
      applicable: false,
      reason: `Min order ${RUPEE}${minOrder} · Add ${RUPEE}${Math.ceil(gap)} more`,
      status: "min_order",
    };
  }

  if (coupon.isFirstOrderOnly) {
    return {
      applicable: true,
      reason: null,
      status: "applicable",
      note: "First order only",
    };
  }

  return { applicable: true, reason: null, status: "applicable" };
};

/**
 * Percentage: % of items, then clamp to maxDiscount when set.
 * Fixed: flat amount. GST should use (items - this discount).
 */
export const estimateCouponDiscount = (coupon, subtotal = 0) => {
  if (!coupon) return 0;

  const type = String(coupon.discountType || "").toLowerCase();
  const value = Number(coupon.discountValue ?? coupon.discount ?? 0);
  const safeSubtotal = Math.max(0, Number(subtotal || 0));
  if (safeSubtotal <= 0) return 0;

  if (type === "percentage" || type === "percent") {
    if (!Number.isFinite(value) || value <= 0) return 0;
    let discount = Math.round((safeSubtotal * value) / 100);
    const max = getCouponMaxDiscount(coupon);
    if (max > 0) discount = Math.min(discount, max);
    return Math.min(Math.max(0, discount), safeSubtotal);
  }

  if (type === "fixed" || type === "flat" || type === "amount") {
    const fixed =
      Number.isFinite(value) && value > 0
        ? value
        : Number(coupon.discountAmount || 0);
    return Math.min(Math.max(0, Math.round(fixed)), safeSubtotal);
  }

  if (Number.isFinite(value) && value > 0) {
    return Math.min(Math.round(value), safeSubtotal);
  }
  return Math.min(Math.max(0, Number(coupon.discountAmount || 0)), safeSubtotal);
};

/** Explain how discount was computed for UI (percent vs max cap). */
export const getCouponSavingsBreakdown = (coupon, subtotal = 0) => {
  const safeSubtotal = Math.max(0, Number(subtotal || 0));
  const type = String(coupon?.discountType || "").toLowerCase();
  const value = Number(coupon?.discountValue ?? coupon?.discount ?? 0);
  const max = getCouponMaxDiscount(coupon);
  const discount = estimateCouponDiscount(coupon, safeSubtotal);

  if (type === "percentage" || type === "percent") {
    const rawPercentAmount =
      Number.isFinite(value) && value > 0 && safeSubtotal > 0
        ? Math.round((safeSubtotal * value) / 100)
        : 0;
    const cappedByMax = max > 0 && rawPercentAmount > max;
    return {
      discount,
      discountType: "percentage",
      percentValue: value,
      rawPercentAmount,
      maxDiscount: max,
      cappedByMax,
      summary: cappedByMax
        ? `${value}% = ${RUPEE}${rawPercentAmount}, max cap applied ${RUPEE}${max}`
        : max > 0
          ? `${value}% off · max ${RUPEE}${max} (not hit)`
          : `${value}% off on item total`,
    };
  }

  return {
    discount,
    discountType: "fixed",
    percentValue: 0,
    rawPercentAmount: discount,
    maxDiscount: max,
    cappedByMax: false,
    summary: `Flat ${RUPEE}${discount} off on items`,
  };
};

/** Normalize list/API coupon into a consistent shape for UI + calc. */
export const normalizeCouponForClient = (coupon = {}) => {
  if (!coupon || typeof coupon !== "object") return null;
  const code = normalizeCouponCode(coupon);
  if (!code) return null;
  return {
    ...coupon,
    code,
    couponCode: code,
    discountType: String(coupon.discountType || "fixed").toLowerCase(),
    discountValue: Number(coupon.discountValue ?? coupon.discount ?? 0),
    maxDiscount: getCouponMaxDiscount(coupon),
    minOrderValue: getCouponMinOrder(coupon),
    isSellerCoupon: Boolean(coupon.isSellerCoupon),
    description: coupon.description || "",
    isFirstOrderOnly: Boolean(coupon.isFirstOrderOnly),
    perUserLimit: Number(coupon.perUserLimit || 0),
  };
};

export const readCheckoutState = () => {
  try {
    if (typeof window === "undefined") return {};
    const raw = window.localStorage.getItem(CHECKOUT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const writeCheckoutStatePatch = (patch = {}) => {
  try {
    if (typeof window === "undefined") return;
    const prev = readCheckoutState();
    window.localStorage.setItem(
      CHECKOUT_STORAGE_KEY,
      JSON.stringify({ ...prev, ...patch }),
    );
  } catch {
    /* ignore */
  }
};
