const STORAGE_KEY = "taxi_user_active_ride_id";

export function persistActiveRideId(rideId) {
  try {
    if (rideId) sessionStorage.setItem(STORAGE_KEY, String(rideId));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function readPersistedActiveRideId() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function clearPersistedActiveRideId() {
  persistActiveRideId(null);
}

/** Haversine distance in meters */
export function haversineMeters(a, b) {
  if (!a || !b) return null;
  const lat1 = Number(a.lat ?? a.latitude);
  const lng1 = Number(a.lng ?? a.longitude);
  const lat2 = Number(b.lat ?? b.latitude);
  const lng2 = Number(b.lng ?? b.longitude);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** Rough ETA minutes from meters @ ~28 km/h city speed */
export function etaMinutesFromMeters(meters) {
  if (meters == null || !Number.isFinite(meters)) return null;
  const speedMps = 8; // ~28.8 km/h
  return Math.max(1, Math.ceil(meters / speedMps / 60));
}

export function googleMapsNavUrl(lat, lng, label = "") {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  const q = label ? encodeURIComponent(label) : `${la},${ln}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${la},${ln}&destination_place_id=&travelmode=driving&dir_action=navigate&q=${q}`;
}

export function phaseFromRideStatus(status) {
  const s = String(status || "").toLowerCase();
  if (["requested", "searching"].includes(s)) return "finding";
  if (["assigned", "arriving", "arrived"].includes(s)) return "driver";
  if (s === "in_progress") return "trip";
  if (s === "awaiting_payment") return "payment";
  return null;
}

export const ACTIVE_RIDE_STATUSES = new Set([
  "requested",
  "searching",
  "assigned",
  "arriving",
  "arrived",
  "in_progress",
  "awaiting_payment",
]);
