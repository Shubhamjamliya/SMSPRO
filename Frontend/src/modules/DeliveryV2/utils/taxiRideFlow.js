/**
 * Shared taxi ↔ DeliveryV2 trip helpers.
 * Keep map / proximity / action UI on food-compatible trip statuses.
 */

export function toTaxiLatLng(point) {
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

export function mapTaxiRideStatusToTripStatus(status) {
  const s = String(status || "").toLowerCase();
  if (["completed", "cancelled", "cancelled_by_rider", "cancelled_by_driver", "cancelled_by_system"].includes(s)) {
    return "COMPLETED";
  }
  if (s === "awaiting_payment") return "AWAITING_PAYMENT";
  if (s === "in_progress") return "PICKED_UP";
  if (s === "arrived") return "REACHED_PICKUP";
  if (["arriving", "assigned", "accepted", "searching", "requested"].includes(s)) {
    return "PICKING_UP";
  }
  return "PICKING_UP";
}

export function buildTaxiActiveOrder(ride, fallbackRideId = null, previousOrder = null) {
  if (!ride) return null;
  const rideId = ride.id || ride._id || fallbackRideId;
  const pickupLoc = toTaxiLatLng(ride.pickup);
  const dropLoc = toTaxiLatLng(ride.drop);
  const fareTotal = Number(
    ride.fare?.total ?? ride.fareEstimateTotal ?? ride.total ?? 0,
  );
  const driverShareRaw = Number(
    ride.fare?.driverShare ?? ride.fareBreakdown?.driverShare,
  );
  const driverShare = Number.isFinite(driverShareRaw) && driverShareRaw > 0
    ? driverShareRaw
    : Number.isFinite(fareTotal)
      ? Math.max(0, fareTotal - Number(ride.fare?.platformFee || 0))
      : 0;

  const prev =
    previousOrder &&
    String(previousOrder.rideId || previousOrder.id || previousOrder._id) === String(rideId)
      ? previousOrder
      : null;

  const rider = ride.rider || prev?.rider || null;
  const userPhone =
    ride.userPhone ||
    ride.rider?.phone ||
    prev?.userPhone ||
    prev?.rider?.phone ||
    null;
  const userName =
    ride.userName ||
    ride.rider?.name ||
    prev?.userName ||
    prev?.rider?.name ||
    null;

  return {
    ...ride,
    module: "taxi",
    jobType: "ride",
    rideId,
    _id: rideId,
    id: rideId,
    orderId: ride.rideNumber || rideId,
    pickup: ride.pickup || null,
    drop: ride.drop || null,
    restaurantLocation: pickupLoc,
    customerLocation: dropLoc,
    total: Number.isFinite(fareTotal) ? fareTotal : 0,
    fareEstimateTotal: Number.isFinite(fareTotal) ? fareTotal : 0,
    earnings: Math.max(0, driverShare),
    riderEarning: Math.max(0, driverShare),
    distanceKm: Number(ride.distanceKm || 0),
    durationMin: Number(ride.durationMin || 0),
    tripDistanceKm: Number(ride.distanceKm || 0),
    estimatedTime: Number(ride.durationMin || 0),
    payment: ride.payment || null,
    fareBreakdown: ride.fareBreakdown || null,
    fare: ride.fare || null,
    coupon: ride.coupon || null,
    waitingMin: Number(ride.waitingMin || 0),
    rider,
    userPhone,
    userName,
  };
}

export function getTaxiRideId(order) {
  return order?.rideId || order?.id || order?._id || order?.orderMongoId || null;
}

export function isTaxiActiveOrder(order) {
  if (!order) return false;
  const moduleKey = String(order.module || order.jobType || "").toLowerCase();
  return moduleKey === "taxi" || moduleKey === "ride" || Boolean(order.rideId);
}
