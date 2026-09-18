/**
 * Shared Porter ↔ DeliveryV2 trip helpers (mirror taxiRideFlow).
 */

export function toPorterLatLng(point) {
  if (!point) return null;
  const lat = Number(point.lat ?? point.latitude);
  const lng = Number(point.lng ?? point.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    address: String(point.address || point.formattedAddress || "").trim(),
  };
}

export function mapPorterTripStatusToTripStatus(status) {
  const s = String(status || "").toLowerCase();
  if (
    [
      "completed",
      "cancelled",
      "cancelled_by_user",
      "cancelled_by_driver",
      "cancelled_by_system",
    ].includes(s)
  ) {
    return "COMPLETED";
  }
  if (s === "awaiting_payment") return "AWAITING_PAYMENT";
  if (s === "at_drop") return "REACHED_DROP";
  if (s === "in_transit") return "PICKED_UP";
  if (s === "loading") return "LOADING";
  if (s === "at_pickup") return "REACHED_PICKUP";
  if (["assigned", "en_route_pickup", "searching", "quoted"].includes(s)) {
    return "PICKING_UP";
  }
  return "PICKING_UP";
}

export function buildPorterActiveOrder(trip, fallbackTripId = null, previousOrder = null) {
  if (!trip) return null;
  const tripId = trip.id || trip._id || fallbackTripId;
  const pickupLoc = toPorterLatLng(trip.pickup);
  const dropLoc = toPorterLatLng(trip.drop);
  const fareTotal = Number(
    trip.fare?.total ?? trip.fareEstimateTotal ?? trip.total ?? 0,
  );
  const platformFee = Number(trip.fare?.platformFee || 0);
  const driverShare = Number(
    trip.fare?.driverShare
    ?? Math.max(0, fareTotal - platformFee),
  );

  const prev =
    previousOrder
    && String(previousOrder.tripId || previousOrder.id || previousOrder._id) === String(tripId)
      ? previousOrder
      : null;

  const rider = trip.rider || prev?.rider || null;
  const userPhone =
    trip.userPhone || trip.rider?.phone || prev?.userPhone || prev?.rider?.phone || null;
  const userName =
    trip.userName || trip.rider?.name || prev?.userName || prev?.rider?.name || null;

  const pickupAddress = pickupLoc?.address || trip.pickup?.address || "";
  const dropAddress = dropLoc?.address || trip.drop?.address || "";

  return {
    ...trip,
    module: "porter",
    jobType: "parcel",
    orderType: "parcel",
    tripId,
    _id: tripId,
    id: tripId,
    orderId: trip.tripNumber || tripId,
    orderMongoId: tripId,
    pickup: trip.pickup || null,
    drop: trip.drop || null,
    restaurantLocation: pickupLoc,
    customerLocation: dropLoc,
    restaurantName: trip.pickup?.contactName || userName || "Parcel pickup",
    restaurantAddress: pickupAddress || "Pickup address",
    restaurantPhone: trip.pickup?.phone || userPhone || "",
    customerName: trip.drop?.contactName || userName || "Customer",
    customerAddress: dropAddress || "Drop address",
    total: Number.isFinite(fareTotal) ? fareTotal : 0,
    fareEstimateTotal: Number(trip.fareEstimateTotal || fareTotal || 0),
    earnings: Number.isFinite(driverShare) ? driverShare : 0,
    riderEarning: Number.isFinite(driverShare) ? driverShare : 0,
    distanceKm: Number(trip.distanceKm || 0),
    durationMin: Number(trip.durationMin || 0),
    tripDistanceKm: Number(trip.distanceKm || 0),
    estimatedTime: Number(trip.durationMin || 0),
    payment: trip.payment || null,
    fare: trip.fare || null,
    deliveryOtp: trip.deliveryOtp || null,
    freeLoadingMinutes: Number(trip.freeLoadingMinutes ?? 60),
    extraLoadingPerMinCharge: Number(trip.extraLoadingPerMinCharge ?? 3),
    loadingStartedAt: trip.loadingStartedAt || null,
    loadedAt: trip.loadedAt || null,
    loadingMin: Number(trip.loadingMin || 0),
    billableLoadingMin: Number(trip.billableLoadingMin || 0),
    rider,
    userPhone,
    userName,
    vehicle: trip.vehicle || prev?.vehicle || null,
  };
}

export function getPorterTripId(order) {
  return order?.tripId || order?.id || order?._id || order?.orderMongoId || null;
}

export function isPorterActiveOrder(order) {
  if (!order) return false;
  const moduleKey = String(order.module || "").toLowerCase();
  const jobType = String(order.jobType || order.orderType || "").toLowerCase();
  if (moduleKey === "porter" || moduleKey === "parcel") return true;
  if (jobType === "parcel" && (order.tripId || order.id || order._id) && !order.rideId) {
    return true;
  }
  return false;
}

/** Elapsed loading minutes (ceil), live from loadingStartedAt. */
export function getPorterLoadingElapsedMin(orderOrTrip, now = Date.now()) {
  const started = orderOrTrip?.loadingStartedAt;
  if (!started) return Number(orderOrTrip?.loadingMin || 0);
  if (orderOrTrip?.loadedAt) return Number(orderOrTrip.loadingMin || 0);
  const startMs = new Date(started).getTime();
  if (!Number.isFinite(startMs)) return 0;
  return Math.max(0, Math.ceil((now - startMs) / 60000));
}

export function getPorterLoadingOvertimeCharge(orderOrTrip, now = Date.now()) {
  const free = Math.max(0, Number(orderOrTrip?.freeLoadingMinutes ?? 60));
  const rate = Math.max(0, Number(orderOrTrip?.extraLoadingPerMinCharge ?? 3));
  const elapsed = getPorterLoadingElapsedMin(orderOrTrip, now);
  const billable = Math.max(0, elapsed - free);
  return {
    free,
    rate,
    elapsed,
    billable,
    charge: Math.round(billable * rate * 100) / 100,
  };
}
