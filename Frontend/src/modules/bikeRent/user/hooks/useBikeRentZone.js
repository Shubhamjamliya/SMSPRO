import { useState, useEffect, useCallback, useRef } from "react";
import bikeRentUserApi from "../services/userApi";

const ZONE_CACHE_TTL_MS = 30 * 1000;
const zoneCache = new Map();
const zoneInFlight = new Map();

const roundCoord = (v, digits = 5) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const p = 10 ** digits;
  return Math.round(n * p) / p;
};

const zoneKeyFromCoords = (lat, lng) => {
  const rLat = roundCoord(lat, 5);
  const rLng = roundCoord(lng, 5);
  if (rLat === null || rLng === null) return null;
  return `${rLat},${rLng}`;
};

/**
 * Bike Rent only — uses /bike-rent/zones/detect (never Food/Taxi/Porter/QC zones).
 * Matching is by lat/lng inside an active polygon — zone name is ignored.
 */
export function useBikeRentZone(location) {
  const [zoneId, setZoneId] = useState(null);
  const [zone, setZone] = useState(null);
  const [zoneStatus, setZoneStatus] = useState("loading");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const prevCoordsRef = useRef({ latitude: null, longitude: null });
  const debounceTimerRef = useRef(null);

  const applyPayload = useCallback((data) => {
    if (data?.status === "IN_SERVICE" && data.zoneId) {
      setZoneId(data.zoneId);
      setZone(data.zone || null);
      setZoneStatus("IN_SERVICE");
      try {
        localStorage.setItem("bikeRentZoneId", data.zoneId);
        localStorage.setItem("bikeRentZone", JSON.stringify(data.zone || null));
      } catch {
        /* ignore */
      }
    } else {
      setZoneId(null);
      setZone(null);
      setZoneStatus("OUT_OF_SERVICE");
      try {
        localStorage.removeItem("bikeRentZoneId");
        localStorage.removeItem("bikeRentZone");
      } catch {
        /* ignore */
      }
    }
  }, []);

  const detect = useCallback(
    async (lat, lng, { bypassCache = false } = {}) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setZoneStatus("OUT_OF_SERVICE");
        setZoneId(null);
        setZone(null);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const key = zoneKeyFromCoords(lat, lng);
        const now = Date.now();

        if (key && bypassCache) {
          zoneCache.delete(key);
        }

        if (key && !bypassCache) {
          const cached = zoneCache.get(key);
          if (cached && now - cached.ts < ZONE_CACHE_TTL_MS) {
            applyPayload(cached.payload);
            return;
          }
        }

        const promise = (() => {
          if (key && zoneInFlight.has(key)) return zoneInFlight.get(key);
          const p = bikeRentUserApi
            .detectZone(lat, lng)
            .finally(() => {
              if (key) zoneInFlight.delete(key);
            });
          if (key) zoneInFlight.set(key, p);
          return p;
        })();

        const data = await promise;
        if (key) zoneCache.set(key, { ts: Date.now(), payload: data });
        applyPayload(data);
      } catch (err) {
        setError(err);
        setZoneId(null);
        setZone(null);
        setZoneStatus("OUT_OF_SERVICE");
      } finally {
        setLoading(false);
      }
    },
    [applyPayload],
  );

  useEffect(() => {
    // Wait for location hydration — do not flash OUT_OF_SERVICE before coords exist.
    if (location == null) {
      setZoneStatus("loading");
      return undefined;
    }

    const lat = Number(location?.latitude ?? location?.lat);
    const lng = Number(location?.longitude ?? location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setZoneStatus("OUT_OF_SERVICE");
      setZoneId(null);
      setZone(null);
      return undefined;
    }

    const prev = prevCoordsRef.current;
    if (prev.latitude === lat && prev.longitude === lng) return undefined;
    prevCoordsRef.current = { latitude: lat, longitude: lng };

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    // Clear previous zone immediately so Home cannot keep fetching old-zone bikes.
    setZoneStatus("loading");
    setZoneId(null);
    setZone(null);
    debounceTimerRef.current = setTimeout(() => {
      detect(lat, lng);
    }, 350);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [location, detect]);

  const refreshZone = useCallback(() => {
    const lat = Number(location?.latitude ?? location?.lat);
    const lng = Number(location?.longitude ?? location?.lng);
    return detect(lat, lng, { bypassCache: true });
  }, [location, detect]);

  return {
    zoneId,
    zone,
    zoneStatus,
    loading,
    error,
    isInService: zoneStatus === "IN_SERVICE",
    isOutOfService: zoneStatus === "OUT_OF_SERVICE",
    refreshZone,
    userLat: Number(location?.latitude ?? location?.lat) || null,
    userLng: Number(location?.longitude ?? location?.lng) || null,
  };
}
