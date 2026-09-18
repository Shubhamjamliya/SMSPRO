/**
 * Centralized location service — single source of truth for:
 *  - reading the device GPS position (with retry + permission handling)
 *  - resolving coordinates to a full address (via backend /v1/location/*)
 *  - persisting/broadcasting the selected location app-wide
 *  - road distance between two points
 *
 * Canonical location object used everywhere:
 * {
 *   latitude, longitude, accuracy,
 *   street, area, landmark, city, state, pincode, country,
 *   address,            // display string (short)
 *   formattedAddress,   // full display string
 *   placeId,
 *   source,             // 'gps' | 'saved-address' | 'manual' | 'cache'
 *   updatedAt           // epoch ms
 * }
 */
import { locationAPI, userAPI } from "@/services/api";

export const LOCATION_STORAGE_KEY = "app_user_location";
export const LOCATION_UPDATED_EVENT = "userLocationUpdated";

// Legacy keys still read by older components; kept in sync during migration.
const LEGACY_FOOD_KEY = "userLocation";
const LEGACY_QUICK_KEY = "location_v2";

const isFiniteNum = (n) => typeof n === "number" && Number.isFinite(n);

/* ===================== CANONICAL SHAPE ===================== */
export const toCanonicalLocation = (raw = {}, source = "cache") => {
  const latitude = Number(raw.latitude ?? raw.lat);
  const longitude = Number(raw.longitude ?? raw.lng);
  const pincode = String(
    raw.pincode || raw.zipCode || raw.postalCode || raw.postcode || ""
  ).trim();
  const formattedAddress = String(
    raw.formattedAddress || raw.address || raw.name || ""
  ).trim();
  const area = String(raw.area || "").trim();
  const city = String(raw.city || "").trim();

  return {
    latitude: isFiniteNum(latitude) ? latitude : null,
    longitude: isFiniteNum(longitude) ? longitude : null,
    accuracy: isFiniteNum(Number(raw.accuracy)) ? Number(raw.accuracy) : null,
    street: String(raw.street || "").trim(),
    area,
    landmark: String(raw.landmark || "").trim(),
    city,
    state: String(raw.state || "").trim(),
    pincode,
    country: String(raw.country || "").trim(),
    address: String(raw.address || "").trim() || area || city || formattedAddress,
    formattedAddress,
    placeId: String(raw.placeId || "").trim(),
    source: raw.source || source,
    updatedAt: raw.updatedAt || Date.now(),
  };
};

export const hasCoordinates = (loc) =>
  isFiniteNum(loc?.latitude) && isFiniteNum(loc?.longitude);

export const hasResolvedAddress = (loc) =>
  Boolean(loc?.city || loc?.area || loc?.formattedAddress);

/* ===================== DEVICE GPS ===================== */
/**
 * Promise wrapper over navigator.geolocation with a low-accuracy retry.
 * Must be called from a user gesture the first time so the browser shows
 * the permission prompt.
 */
export const getDevicePosition = ({ fresh = false } = {}) =>
  new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not supported on this device"));
      return;
    }

    const attempt = (options, isRetry) =>
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        (err) => {
          // Timeout on high accuracy -> retry once with network-based location
          if (err.code === 3 && !isRetry) {
            attempt(
              { enableHighAccuracy: false, timeout: 8000, maximumAge: fresh ? 0 : 300000 },
              true
            );
            return;
          }
          reject(err);
        },
        options
      );

    attempt(
      { enableHighAccuracy: true, timeout: 12000, maximumAge: fresh ? 0 : 60000 },
      false
    );
  });

/* ===================== REVERSE GEOCODE (backend, cached) ===================== */
export const resolveAddress = async (latitude, longitude) => {
  const res = await locationAPI.reverseGeocode(latitude, longitude);
  const addr = res?.data?.data?.address;
  if (!addr) return null;
  return toCanonicalLocation({ ...addr, latitude, longitude }, "gps");
};

/* ===================== PERSISTENCE + BROADCAST ===================== */
export const loadStoredLocation = () => {
  try {
    const raw = localStorage.getItem(LOCATION_STORAGE_KEY);
    if (raw) return toCanonicalLocation(JSON.parse(raw), "cache");
    // Migration: fall back to legacy keys once
    const legacy =
      localStorage.getItem(LEGACY_FOOD_KEY) || localStorage.getItem(LEGACY_QUICK_KEY);
    if (legacy) return toCanonicalLocation(JSON.parse(legacy), "cache");
  } catch {
    /* corrupted cache — ignore */
  }
  return null;
};

export const saveLocation = (location, { broadcast = true, persistToDb = true } = {}) => {
  const canonical = toCanonicalLocation(location, location?.source || "manual");
  if (!hasCoordinates(canonical)) return canonical;

  try {
    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(canonical));
    // Keep legacy consumers working during migration.
    localStorage.setItem(
      LEGACY_FOOD_KEY,
      JSON.stringify({ ...canonical, postalCode: canonical.pincode })
    );
    localStorage.setItem(
      LEGACY_QUICK_KEY,
      JSON.stringify({
        address: canonical.formattedAddress || canonical.address,
        city: canonical.city,
        state: canonical.state,
        pincode: canonical.pincode,
        latitude: canonical.latitude,
        longitude: canonical.longitude,
      })
    );
  } catch {
    /* storage full/blocked — non-fatal */
  }

  if (broadcast && typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(LOCATION_UPDATED_EVENT, { detail: { location: canonical } })
    );
  }

  if (persistToDb && hasResolvedAddress(canonical)) {
    const token =
      localStorage.getItem("user_accessToken") || localStorage.getItem("accessToken");
    if (token && token !== "null" && token !== "undefined") {
      userAPI
        .updateLocation({
          latitude: canonical.latitude,
          longitude: canonical.longitude,
          accuracy: canonical.accuracy ?? undefined,
          street: canonical.street,
          area: canonical.area,
          landmark: canonical.landmark,
          city: canonical.city,
          state: canonical.state,
          zipCode: canonical.pincode,
          country: canonical.country,
          formattedAddress: canonical.formattedAddress,
        })
        .catch(() => {});
    }
  }

  return canonical;
};

/**
 * One-call flow: GPS -> reverse geocode -> save + broadcast.
 * Resolves with a canonical location even when reverse geocoding fails
 * (coordinates-only), so distance/fee logic keeps working.
 */
export const fetchCurrentLocation = async ({ fresh = true } = {}) => {
  const pos = await getDevicePosition({ fresh });
  const { latitude, longitude, accuracy } = pos.coords;

  let resolved = null;
  try {
    resolved = await resolveAddress(latitude, longitude);
  } catch {
    /* backend/geocoder unavailable */
  }

  const location = toCanonicalLocation(
    { ...(resolved || {}), latitude, longitude, accuracy, source: "gps" },
    "gps"
  );
  return saveLocation(location, { broadcast: true, persistToDb: true });
};

/* ===================== ROAD DISTANCE ===================== */
/**
 * Road distance in km (+ ETA minutes) between two points via backend.
 * Returns { distanceKm, durationMinutes, source } or null.
 */
export const getRoadDistance = async (from, to) => {
  if (!hasCoordinates(from) || !hasCoordinates(to)) return null;
  try {
    const res = await locationAPI.roadDistance(
      from.latitude,
      from.longitude,
      to.latitude,
      to.longitude
    );
    const data = res?.data?.data;
    if (data && Number.isFinite(Number(data.distanceKm))) return data;
  } catch {
    /* fall through to haversine */
  }
  return {
    distanceKm: Math.round(haversineKm(from.latitude, from.longitude, to.latitude, to.longitude) * 100) / 100,
    durationMinutes: null,
    source: "haversine",
  };
};

/** Air distance in km — for coarse sorting/filtering only, never for fees. */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Subscribe to app-wide location changes. Returns an unsubscribe function. */
export const onLocationChange = (handler) => {
  if (typeof window === "undefined") return () => {};
  const listener = (event) => {
    const loc = event?.detail?.location || loadStoredLocation();
    if (loc) handler(loc);
  };
  window.addEventListener(LOCATION_UPDATED_EVENT, listener);
  return () => window.removeEventListener(LOCATION_UPDATED_EVENT, listener);
};
