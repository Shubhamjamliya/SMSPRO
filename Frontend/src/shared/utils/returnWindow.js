export const RETURN_WINDOW_DAY_PRESETS = [1, 3, 5, 7, 10, 15, 30];

export const hoursToReturnWindowDays = (hours) => {
  const safeHours = Number(hours);
  if (!Number.isFinite(safeHours) || safeHours <= 0) return 3;
  return Math.max(1, Math.round(safeHours / 24));
};

export const returnWindowDaysToHours = (days) => {
  const safeDays = Number(days);
  if (!Number.isFinite(safeDays) || safeDays <= 0) return 72;
  return Math.round(safeDays * 24);
};

export const formatReturnWindowCountdown = (remainingSeconds = 0) => {
  const safe = Math.max(0, Number(remainingSeconds) || 0);
  if (safe <= 0) return "Expired";

  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  const minutes = Math.floor((safe % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? "Day" : "Days"}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "Hour" : "Hours"}`);
  if (days === 0 && hours === 0 && minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? "Minute" : "Minutes"}`);
  }
  if (!parts.length) return "Less than 1 minute";

  return parts.join(" ");
};

export const getReturnWindowWarningLevel = (remainingSeconds = 0) => {
  const safe = Math.max(0, Number(remainingSeconds) || 0);
  if (safe <= 0) return "expired";
  if (safe <= 2 * 3600) return "critical";
  if (safe <= 24 * 3600) return "warning";
  return "normal";
};

/**
 * Recompute a single item's countdown locally from the backend-provided expiry.
 * The backend stays the authority: we only re-derive the clock, never eligibility
 * from category/product data.
 */
export const resolveLiveItemReturnEligibility = (item, now = Date.now()) => {
  if (!item || typeof item !== "object") return null;

  const expiryMs = item.returnEligibleUntil
    ? new Date(item.returnEligibleUntil).getTime()
    : 0;
  const remainingSeconds = expiryMs
    ? Math.max(0, Math.floor((expiryMs - now) / 1000))
    : Math.max(0, Number(item.remainingSeconds || 0));
  const expired = Boolean(expiryMs) && remainingSeconds <= 0;

  return {
    ...item,
    remainingSeconds,
    returnWindowExpired: expired,
    returnEligible: Boolean(item.returnEligible) && !expired,
    ineligibleReason: expired && !item.ineligibleReason
      ? "RETURN_WINDOW_EXPIRED"
      : item.ineligibleReason || "",
  };
};

export const resolveLiveReturnEligibility = (eligibility, now = Date.now()) => {
  if (!eligibility || typeof eligibility !== "object") return null;

  const items = Array.isArray(eligibility.items)
    ? eligibility.items.map((item) => resolveLiveItemReturnEligibility(item, now))
    : [];

  const expiryMs = eligibility.returnExpiryAt
    ? new Date(eligibility.returnExpiryAt).getTime()
    : 0;
  const remainingSeconds = expiryMs
    ? Math.max(0, Math.floor((expiryMs - now) / 1000))
    : Math.max(0, Number(eligibility.remainingSeconds || 0));
  const returnWindowExpired = Boolean(
    eligibility.returnWindowExpired || remainingSeconds <= 0,
  );
  const returnsEnabled = eligibility.returnsEnabled !== false;

  // With mixed category policies the order stays returnable while ANY item is.
  // Orders without item data fall back to the flat order-level window.
  const anyItemReturnable = items.length
    ? items.some((item) => item.returnEligible)
    : !returnWindowExpired && remainingSeconds > 0;

  const canReturn = Boolean(
    returnsEnabled && eligibility.canReturn !== false && anyItemReturnable,
  );

  return {
    ...eligibility,
    items,
    remainingSeconds,
    remainingHours: Math.floor(remainingSeconds / 3600),
    returnWindowExpired: items.length ? !anyItemReturnable : returnWindowExpired,
    anyItemReturnable,
    canReturn,
  };
};

const clean = (value) => String(value ?? "").trim();

const resolveVariantLabel = (source = {}) =>
  clean(source.variantName || source.notes);

/**
 * Variant-safe order line identity (mirrors backend quickOrderItem.helpers.js).
 * Two lines of the same product with different variants must not share one key.
 */
export const buildQuickOrderLineKey = (source = {}) => {
  const base = clean(source.itemId || source.productId);
  if (!base) return "";
  const variant = clean(
    source.variantId || source.variantKey || source.variantSku || resolveVariantLabel(source),
  );
  return variant ? `${base}::${variant}` : base;
};

/**
 * Every identifier a line may be addressed by, most specific first.
 */
export const buildOrderItemKeyAliases = (item = {}) => {
  const aliases = [];
  const push = (value) => {
    const normalized = clean(value);
    if (normalized && !aliases.includes(normalized)) aliases.push(normalized);
  };

  push(item.lineKey);
  push(buildQuickOrderLineKey(item));
  push(clean(item.itemId || item.productId || item.name));
  return aliases;
};

export const resolveOrderItemLineKey = (item = {}) => {
  const persisted = clean(item.lineKey);
  const derived = buildQuickOrderLineKey(item);
  const legacy = clean(item.itemId || item.productId || item.name);
  const base = clean(item.itemId || item.productId);
  const hasVariant = Boolean(
    clean(item.variantId || item.variantKey || item.variantSku || resolveVariantLabel(item)),
  );

  // Legacy rows sometimes persisted only productId as lineKey while variant lives in notes.
  if (persisted) {
    if (hasVariant && base && persisted === base && derived && derived !== persisted) {
      return derived;
    }
    return persisted;
  }

  return derived || legacy;
};

const buildItemLabel = (item = {}) =>
  `${clean(item.name)}|${resolveVariantLabel(item)}`;

const findEligibilityRow = (item, byLineKey, byLabel) => {
  for (const alias of buildOrderItemKeyAliases(item)) {
    if (byLineKey.has(alias)) return byLineKey.get(alias);
  }
  const label = buildItemLabel(item);
  if (label !== "|" && byLabel.has(label)) return byLabel.get(label);
  return null;
};

const mergeOrderItemWithEligibility = (item, row) => {
  const lineKey = row?.lineKey || resolveOrderItemLineKey(item);
  const variantName = resolveVariantLabel(item) || row?.variantName || "";

  return {
    ...item,
    lineKey,
    name: item.name || row?.name || "",
    variantName,
    quantity: Number(item.quantity ?? row?.quantity ?? 0),
    price: Number(item.price ?? row?.price ?? 0),
    returnEligible: row != null ? Boolean(row.returnEligible) : Boolean(item.returnEligible),
    returnEligibleUntil: row?.returnEligibleUntil ?? item.returnEligibleUntil ?? null,
    remainingSeconds: row?.remainingSeconds ?? item.remainingSeconds ?? 0,
    returnWindowDays: row?.returnWindowDays ?? item.returnWindowDays ?? null,
    remainingReturnableQuantity:
      row?.remainingReturnableQuantity ??
      item.remainingReturnableQuantity ??
      Number(item.quantity || 0),
    returnedQuantity: row?.returnedQuantity ?? item.returnedQuantity ?? 0,
    itemReturnStatus: row?.itemReturnStatus ?? item.itemReturnStatus ?? "none",
    ineligibleReason: row?.ineligibleReason ?? item.ineligibleReason ?? "",
    headerName: row?.headerName ?? item.headerName ?? "",
    categoryName: row?.categoryName ?? item.categoryName ?? "",
  };
};

const buildRowsFromEligibility = (eligibilityItems = [], orderItems = []) => {
  const orderByLineKey = new Map();
  const orderByLabel = new Map();
  (Array.isArray(orderItems) ? orderItems : []).forEach((item) => {
    buildOrderItemKeyAliases(item).forEach((alias) => {
      if (!orderByLineKey.has(alias)) orderByLineKey.set(alias, item);
    });
    const label = buildItemLabel(item);
    if (label !== "|" && !orderByLabel.has(label)) orderByLabel.set(label, item);
  });

  const priceByLabel = new Map();
  orderItems.forEach((item) => {
    const label = buildItemLabel(item);
    if (label !== "|" && item?.price != null && !priceByLabel.has(label)) {
      priceByLabel.set(label, Number(item.price) || 0);
    }
  });

  return eligibilityItems
    .map((row) => {
      const orderItem =
        findEligibilityRow(row, orderByLineKey, orderByLabel) ||
        orderByLineKey.get(resolveOrderItemLineKey(row)) ||
        null;
      const label = buildItemLabel(row);
      return mergeOrderItemWithEligibility(orderItem || {}, {
        ...row,
        lineKey: resolveOrderItemLineKey(row),
        name: row.name || orderItem?.name || "",
        variantName: resolveVariantLabel(row) || resolveVariantLabel(orderItem),
        quantity: Number(row.quantity ?? orderItem?.quantity ?? 0),
        price: Number(row.price ?? orderItem?.price ?? priceByLabel.get(label) ?? 0),
      });
    })
    .filter((item) => item.lineKey);
};

/**
 * Merge per-item return data from the order-details response with the live
 * eligibility rollup, so the return UI can render each line independently.
 */
export const buildReturnableItemRows = (orderItems = [], eligibility = null) => {
  const eligibilityItems = Array.isArray(eligibility?.items) ? eligibility.items : [];
  const byLineKey = new Map();
  const byLabel = new Map();

  eligibilityItems.forEach((row) => {
    buildOrderItemKeyAliases(row).forEach((alias) => {
      if (!byLineKey.has(alias)) byLineKey.set(alias, row);
    });
    const label = buildItemLabel(row);
    if (label !== "|" && !byLabel.has(label)) byLabel.set(label, row);
  });

  const quickOrderItems = (Array.isArray(orderItems) ? orderItems : []).filter(
    (item) => !item?.type || String(item.type).toLowerCase() === "quick",
  );

  if (quickOrderItems.length) {
    const mapped = quickOrderItems
      .map((item) => mergeOrderItemWithEligibility(item, findEligibilityRow(item, byLineKey, byLabel)))
      .filter((item) => item.lineKey);

    const mappedHasEligible = mapped.some((item) => item.returnEligible);
    const eligibilityHasEligible = eligibilityItems.some((item) => item.returnEligible);

    if (!mappedHasEligible && eligibilityHasEligible && eligibilityItems.length) {
      return buildRowsFromEligibility(eligibilityItems, quickOrderItems);
    }

    if (mapped.length) return mapped;
  }

  if (eligibilityItems.length) {
    return buildRowsFromEligibility(eligibilityItems, quickOrderItems);
  }

  return [];
};

export const RETURN_INELIGIBLE_LABELS = {
  RETURN_WINDOW_EXPIRED: "Return window expired",
  ALREADY_RETURNED: "Already returned",
  ITEM_NOT_RETURNABLE: "Not returnable",
  RETURNS_DISABLED: "Returns unavailable",
  ORDER_NOT_DELIVERED: "Not delivered yet",
  DELIVERY_TIMESTAMP_MISSING: "Delivery time unavailable",
};

export const describeItemReturnState = (item) => {
  if (item?.returnEligible) return "";
  const status = String(item?.itemReturnStatus || "none");
  if (status === "requested") return "Return requested";
  if (status === "approved") return "Return approved";
  if (status === "returned") return "Picked up";
  if (status === "refunded") return "Refunded";
  if (status === "rejected") return "Return rejected";
  return RETURN_INELIGIBLE_LABELS[item?.ineligibleReason] || "Not returnable";
};
