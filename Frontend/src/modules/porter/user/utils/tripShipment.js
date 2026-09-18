/** Map Porter trip API → shipments UI model */

const ACTIVE_STATUSES = new Set([
  "quoted",
  "searching",
  "assigned",
  "en_route_pickup",
  "at_pickup",
  "loading",
  "in_transit",
  "at_drop",
  "awaiting_payment",
]);

const CANCELLED_STATUSES = new Set([
  "cancelled_by_user",
  "cancelled_by_driver",
  "cancelled_by_system",
]);

export function isTripActive(status) {
  return ACTIVE_STATUSES.has(status);
}

export function isTripCancelled(status) {
  return CANCELLED_STATUSES.has(status);
}

export function isTripDelivered(status) {
  return status === "completed";
}

export function tripBucket(status) {
  if (isTripDelivered(status)) return "delivered";
  if (isTripCancelled(status)) return "cancelled";
  if (isTripActive(status)) return "active";
  return "all";
}

export function formatTripStatusLabel(status) {
  if (!status) return "Unknown";
  if (status === "completed") return "Delivered";
  if (status === "loading") return "Parcel loading";
  if (status === "awaiting_payment") return "Extra charge pending";
  if (status.startsWith("cancelled")) return "Cancelled";
  return String(status).replace(/_/g, " ");
}

export function mapPartnerFromTrip(trip) {
  const d = trip?.driver;
  if (!d?.id && !trip?.dispatch?.deliveryPartnerId) return null;
  return {
    id: d?.id || trip.dispatch.deliveryPartnerId,
    name: d?.name || "Delivery partner",
    phone: d?.phone || "",
    rating: Number(d?.rating || 4.8),
    trips: Number(d?.trips || 0),
    vehicle: d?.vehicleType || d?.vehicleModel || trip?.vehicle?.name || "Vehicle",
    vehicleNumber: d?.vehicleNumber || "—",
    pickupOtp: trip?.deliveryOtp || "",
    photo: d?.photo || "",
    lastLat: d?.lastLat ?? trip?.lastDriverLocation?.lat ?? null,
    lastLng: d?.lastLng ?? trip?.lastDriverLocation?.lng ?? null,
  };
}

/** Timeline stages for live tracking UI */
export const TRACKING_TIMELINE = [
  {
    id: "en_route_pickup",
    label: "Partner en route to pickup",
    match: ["assigned", "en_route_pickup"],
  },
  {
    id: "at_pickup",
    label: "Partner at pickup",
    match: ["at_pickup"],
  },
  {
    id: "loading",
    label: "Parcel is being loaded",
    match: ["loading"],
  },
  {
    id: "in_transit",
    label: "Parcel in transit",
    match: ["in_transit"],
  },
  {
    id: "at_drop",
    label: "Arriving at drop",
    match: ["at_drop", "awaiting_payment"],
  },
  {
    id: "completed",
    label: "Delivered successfully",
    match: ["completed"],
  },
];

export function trackingStageIndex(status) {
  if (!status) return 0;
  if (String(status).startsWith("cancelled")) return -1;
  const idx = TRACKING_TIMELINE.findIndex((s) => s.match.includes(status));
  if (idx >= 0) return idx;
  if (["quoted", "searching"].includes(status)) return 0;
  return 0;
}

export function tripToShipment(trip) {
  if (!trip) return null;
  const fareTotal = Number(
    trip.fare?.total ?? trip.fareEstimateTotal ?? 0,
  );
  const driver = trip.driver || null;
  const partner = driver
    ? {
        id: driver.id,
        name: driver.name || "Partner",
        phone: driver.phone || "",
        vehicleNumber: driver.vehicleNumber || "—",
        rating: driver.rating || null,
        photo: driver.photo || "",
      }
    : trip.dispatch?.deliveryPartnerId
      ? {
          id: trip.dispatch.deliveryPartnerId,
          name: "Delivery partner",
          phone: "",
          vehicleNumber: "—",
          rating: null,
          photo: "",
        }
      : null;

  const bucket = tripBucket(trip.status);

  return {
    id: trip.id,
    trackingId: trip.tripNumber || trip.id,
    status: bucket === "delivered" ? "delivered" : bucket === "cancelled" ? "cancelled" : trip.status,
    statusRaw: trip.status,
    stage: trip.status,
    vehicle: trip.vehicle?.name || "Vehicle",
    pickup: {
      title: "Pickup",
      address: trip.pickup?.address || "—",
      lat: trip.pickup?.lat,
      lng: trip.pickup?.lng,
    },
    delivery: {
      title: "Drop",
      address: trip.drop?.address || "—",
      lat: trip.drop?.lat,
      lng: trip.drop?.lng,
    },
    partner,
    weightKg: Number(trip.parcel?.weightKg || 0),
    quantity: 1,
    goodsTypeName: trip.parcel?.goodsTypeName || "",
    description: trip.parcel?.description || "",
    fare: fareTotal,
    discount: 0,
    total: fareTotal,
    paymentMethod: trip.payment?.method || "cash",
    paymentStatus: trip.payment?.status || "pending",
    createdAt: trip.createdAt,
    deliveredAt: trip.completedAt || null,
    cancelledAt: trip.cancelledAt || null,
    cancelReason: trip.cancelReason || "",
    pickupOtp: trip.deliveryOtp || null,
    rating: trip.userRating || null,
    trip,
  };
}
