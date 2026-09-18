import {
  formatDeliveryAddressText,
  isReturnPickupTrip,
  normalizePickupPoints,
} from "./orderRouting";

export const FEED_SERVICE_LABELS = {
  food: "Food",
  quick: "Quick Commerce",
  "quick-commerce": "Quick Commerce",
  taxi: "Taxi",
  "bike-rent": "Bike Rent",
  bikeRent: "Bike Rent",
  porter: "Porter",
  parcel: "Parcel",
};

export const formatFeedMoney = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `₹${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
};

export const formatFeedDistance = (km) => {
  const n = Number(km);
  if (!Number.isFinite(n)) return null;
  if (n < 1) return `${Math.round(n * 1000)} m`;
  return `${n.toFixed(1)} km`;
};

export const formatFeedDuration = (mins) => {
  const n = Number(mins);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 60) return `${Math.ceil(n)} min`;
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
};

export const formatFeedClock = (isoOrDate) => {
  if (!isoOrDate) return null;
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

export const formatFeedRelativeTime = (isoOrDate) => {
  if (!isoOrDate) return null;
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return null;
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  if (diffSec < 15) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return formatFeedClock(d);
};

export const getFeedServiceKey = (order = {}) => {
  const raw = String(
    order?.module ||
      order?.dispatchLeg?.pickupType ||
      order?.orderType ||
      order?.serviceType ||
      order?.type ||
      "food",
  )
    .trim()
    .toLowerCase();
  if (raw === "quick" || raw === "quickcommerce") return "quick-commerce";
  if (raw.includes("bike")) return "bike-rent";
  if (raw.includes("taxi")) return "taxi";
  if (raw.includes("porter")) return "porter";
  if (raw.includes("parcel")) return "parcel";
  if (raw.includes("food") || raw === "home delivery") return "food";
  return raw || "food";
};

export const getFeedServiceLabel = (order) =>
  FEED_SERVICE_LABELS[getFeedServiceKey(order)] || "Delivery";

export const getFeedRequestId = (order = {}) =>
  order?.orderId ||
  order?.rideId ||
  order?.tripId ||
  order?.orderMongoId ||
  order?._id ||
  order?.id ||
  null;

export const getFeedEarnings = (order = {}) => {
  const candidates = [
    order.earnings,
    order.riderEarning,
    order.deliveryEarning,
    order.earningAmount,
    order.tripEarning,
    order.walletEarning,
    order.fare?.driverShare,
    order.fareBreakdown?.driverShare,
    order.pricing?.deliveryFee,
    order.deliveryFee,
    order.returnPickupFee,
    order.deliveryPayout,
    order.payout,
    order.estimatedEarnings?.totalEarning,
  ];

  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }

  // Taxi last-resort: customer fare minus platform fee (prefer driverShare above)
  const fareTotal = Number(
    order.fare?.total ?? order.fareEstimateTotal ?? order.total ?? 0,
  );
  const platformFee = Number(
    order.fareBreakdown?.platformFee ?? order.fare?.platformFee ?? 0,
  );
  if (Number.isFinite(fareTotal) && fareTotal > 0) {
    return Math.max(0, fareTotal - platformFee);
  }

  return 0;
};

export const getFeedRiderBaseAmount = (order = {}) =>
  Number(order.riderBaseDeliveryFee ?? order.pricing?.riderBaseDeliveryFee ?? 0);

/** @deprecated Use getFeedRiderBaseAmount for breakdown base, getFeedTotalRiderEarnings for total */
export const getFeedRiderBaseEarnings = (order = {}) => getFeedTotalRiderEarnings(order);

export const getFeedDeliveryExtraFee = (order = {}) => {
  const candidates = [order.deliveryExtraFee, order.pricing?.deliveryExtraFee];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
};

export const getFeedTotalRiderEarnings = (order = {}) => {
  const riderBase = getFeedRiderBaseAmount(order);
  const deliveryExtra = getFeedDeliveryExtraFee(order);
  if (riderBase > 0 || deliveryExtra > 0) {
    return riderBase + deliveryExtra;
  }

  const candidates = [
    order.riderEarning,
    order.earnings,
    order.deliveryEarning,
  ];

  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return getFeedEarnings(order);
};

export const getFeedEarningsLabel = (order = {}) => {
  const base = getFeedRiderBaseAmount(order);
  const extra = getFeedDeliveryExtraFee(order);
  if (extra > 0 && base > 0) {
    return `${formatFeedMoney(base)} + ${formatFeedMoney(extra)} extra`;
  }
  return formatFeedMoney(getFeedTotalRiderEarnings(order));
};

export const getFeedPaymentMethod = (order = {}) => {
  const method =
    order?.paymentMethod ||
    order?.payment?.method ||
    order?.paymentMode ||
    order?.paymentType ||
    "";
  const status = order?.paymentStatus || order?.payment?.status || "";
  const label = String(method || "Cash").replace(/_/g, " ");
  return status ? `${label} · ${String(status).replace(/_/g, " ")}` : label;
};

export const getFeedPickup = (order = {}) => {
  const serviceKey = getFeedServiceKey(order);
  if (isReturnPickupTrip(order)) {
    const pickups = normalizePickupPoints(order);
    const primary = pickups[0] || null;
    const title =
      primary?.sourceName ||
      order?.customerName ||
      order?.userName ||
      "Customer";
    const address =
      primary?.address ||
      order?.customerAddress ||
      formatDeliveryAddressText(order?.deliveryAddress, "") ||
      "Address unavailable";
    return { title: String(title), address: String(address) };
  }

  if (serviceKey === "taxi" || serviceKey === "porter" || serviceKey === "parcel") {
    const title =
      order?.pickup?.name ||
      order?.pickup?.label ||
      (serviceKey === "taxi" ? "Pickup" : "Parcel pickup");
    const address =
      order?.pickup?.address ||
      order?.pickup?.formattedAddress ||
      order?.restaurantLocation?.address ||
      "Address unavailable";
    return { title: String(title), address: String(address) };
  }

  const pickups = normalizePickupPoints(order);
  const primary = pickups[0] || null;
  const isQuick =
    serviceKey === "quick-commerce" ||
    String(order?.orderType || "").toLowerCase() === "quick";

  const title =
    primary?.sourceName ||
    order?.dispatchLeg?.sourceName ||
    (isQuick
      ? order?.storeName || order?.sellerName || order?.seller?.shopName
      : order?.restaurantName ||
        order?.restaurant_name ||
        order?.restaurantId?.restaurantName ||
        order?.restaurantId?.name) ||
    (isReturnPickupTrip(order) ? "Return pickup" : "Pickup");

  const address =
    primary?.address ||
    order?.dispatchLeg?.address ||
    (isQuick
      ? order?.storeAddress ||
        order?.sellerAddress ||
        order?.seller?.location?.address
      : order?.restaurantAddress ||
        order?.restaurant_address ||
        order?.restaurantId?.location?.address) ||
    "Address unavailable";

  return { title: String(title), address: String(address) };
};

export const getFeedDrop = (order = {}) => {
  const serviceKey = getFeedServiceKey(order);
  if (isReturnPickupTrip(order)) {
    const dropPoint = order?.dropPoint || null;
    const title =
      dropPoint?.name ||
      dropPoint?.sourceName ||
      order?.storeName ||
      order?.sellerName ||
      order?.seller?.shopName ||
      order?.restaurantName ||
      "Seller";
    const address =
      dropPoint?.address ||
      order?.storeAddress ||
      order?.sellerAddress ||
      order?.restaurantAddress ||
      "Location unavailable";
    return { title: String(title), address: String(address) };
  }

  if (serviceKey === "taxi" || serviceKey === "porter" || serviceKey === "parcel") {
    const title =
      order?.drop?.name ||
      order?.drop?.label ||
      order?.customerName ||
      (serviceKey === "taxi" ? "Drop" : "Parcel drop");
    const address =
      order?.drop?.address ||
      order?.drop?.formattedAddress ||
      order?.customerLocation?.address ||
      "Location unavailable";
    return { title: String(title), address: String(address) };
  }

  const deliveryAddress = order?.deliveryAddress || {};
  const dropPoint = order?.dropPoint || null;
  const title =
    dropPoint?.name ||
    order?.customerName ||
    order?.userName ||
    deliveryAddress?.name ||
    "Drop";
  const address =
    dropPoint?.address ||
    formatDeliveryAddressText(
      deliveryAddress,
      order?.customerAddress || order?.customer_address || "",
    ) ||
    "Location unavailable";
  return { title: String(title), address: String(address) };
};

/**
 * Derive a display status for feed badges without changing backend status.
 */
export const getFeedRequestStatus = (order = {}, { expiresInSec } = {}) => {
  const dispatch = String(order?.dispatch?.status || "").toLowerCase();
  const status = String(order?.orderStatus || order?.status || "").toLowerCase();

  if (expiresInSec != null && expiresInSec <= 10) return "expiring";
  if (order?.isScheduled || order?.scheduledAt || status.includes("schedul")) {
    return "scheduled";
  }
  if (["accepted", "assigned", "out_for_delivery", "picked_up"].includes(status)) {
    return status === "accepted" ? "accepted" : "assigned";
  }
  if (dispatch === "assigned") return "assigned";
  if (order?.priority === true || order?.isPriority || order?.urgent) {
    return "priority";
  }
  return "new";
};

export const FEED_STATUS_META = {
  new: {
    label: "New",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  assigned: {
    label: "Assigned",
    className: "bg-sky-50 text-sky-700 border-sky-200",
  },
  accepted: {
    label: "Accepted",
    className: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  scheduled: {
    label: "Scheduled",
    className: "bg-violet-50 text-violet-700 border-violet-200",
  },
  priority: {
    label: "Priority",
    className: "bg-amber-50 text-amber-800 border-amber-200",
  },
  expiring: {
    label: "Expiring Soon",
    className: "bg-red-50 text-red-700 border-red-200",
  },
};

export const getFeedTripEstimates = (order = {}, riderLocation = null) => {
  if (isReturnPickupTrip(order)) {
    const explicitTripKm = Number(order.tripDistanceKm);
    const pickupKmRaw = Number(order.pickupDistanceKm ?? order.distanceKm);
    const hasExplicitTrip = Number.isFinite(explicitTripKm) && explicitTripKm > 0;
    const tripKm = hasExplicitTrip
      ? explicitTripKm
      : Number.isFinite(pickupKmRaw) && pickupKmRaw > 0
        ? pickupKmRaw
        : null;
    const toPickupKm =
      hasExplicitTrip &&
      Number.isFinite(pickupKmRaw) &&
      pickupKmRaw > 0 &&
      Math.abs(pickupKmRaw - explicitTripKm) > 0.01
        ? pickupKmRaw
        : null;
    const etaMins = Number(
      order?.estimatedTime ??
        order?.durationMin ??
        order?.duration ??
        order?.eta ??
        order?.prepTime,
    );
    return {
      pickupDistanceKm: toPickupKm,
      tripDistanceKm: tripKm,
      etaMins: Number.isFinite(etaMins) && etaMins > 0 ? etaMins : null,
      hasRiderLocation: Boolean(riderLocation),
    };
  }

  const pickupKm = Number(
    order?.pickupDistanceKm ?? order?.distanceToPickupKm ?? order?.distanceKm,
  );
  const tripKm = Number(
    order?.tripDistanceKm ??
      order?.deliveryDistanceKm ??
      order?.totalDistanceKm ??
      order?.distanceKm,
  );
  const etaMins = Number(
    order?.estimatedTime ??
      order?.durationMin ??
      order?.duration ??
      order?.eta ??
      order?.prepTime,
  );

  return {
    pickupDistanceKm: Number.isFinite(pickupKm) ? pickupKm : null,
    tripDistanceKm: Number.isFinite(tripKm) ? tripKm : null,
    etaMins: Number.isFinite(etaMins) && etaMins > 0 ? etaMins : null,
    hasRiderLocation: Boolean(riderLocation),
  };
};

/** Normalize an order into a compact feed view-model for cards. */
export const buildFeedRequestViewModel = (
  order,
  { expiresInSec, riderLocation } = {},
) => {
  if (!order) return null;
  const serviceKey = getFeedServiceKey(order);
  const statusKey = getFeedRequestStatus(order, { expiresInSec });
  const estimates = getFeedTripEstimates(order, riderLocation);
  const receivedAt =
    order?.offeredAt || order?.createdAt || order?.updatedAt || null;

  return {
    id: String(getFeedRequestId(order) || Math.random()),
    requestId: getFeedRequestId(order),
    serviceKey,
    serviceLabel: getFeedServiceLabel(order),
    statusKey,
    statusMeta: FEED_STATUS_META[statusKey] || FEED_STATUS_META.new,
    pickup: getFeedPickup(order),
    drop: getFeedDrop(order),
    earnings: getFeedTotalRiderEarnings(order),
    earningsLabel: getFeedEarningsLabel(order) || formatFeedMoney(getFeedEarnings(order)),
    paymentLabel: getFeedPaymentMethod(order),
    pickupDistanceLabel: formatFeedDistance(estimates.pickupDistanceKm),
    tripDistanceLabel: formatFeedDistance(estimates.tripDistanceKm),
    etaLabel: formatFeedDuration(estimates.etaMins),
    receivedAt,
    receivedLabel: formatFeedRelativeTime(receivedAt),
    receivedClock: formatFeedClock(receivedAt),
    expiresInSec: expiresInSec ?? null,
    raw: order,
  };
};
