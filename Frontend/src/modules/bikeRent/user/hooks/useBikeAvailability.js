import { useEffect, useState } from "react";
import bikeRentUserApi from "../services/userApi";

/**
 * Debounced live window availability check for a bike.
 */
export function useWindowAvailabilityCheck({
  bikeId,
  startAt,
  endAt,
  enabled = true,
  debounceMs = 400,
}) {
  const [check, setCheck] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !bikeId || !startAt || !endAt) {
      setCheck(null);
      setLoading(false);
      setError(null);
      return undefined;
    }

    const start = new Date(startAt);
    const end = new Date(endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setCheck(null);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await bikeRentUserApi.checkAvailability({
          bikeId,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
        });
        if (!cancelled) {
          setCheck(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const details = err?.response?.data?.details;
          setCheck(
            details
              ? { available: false, ...details, message: err?.response?.data?.message || details.message }
              : {
                available: false,
                message: err?.response?.data?.message || "Could not check availability",
                code: err?.response?.data?.code || "CHECK_FAILED",
              },
          );
          setError(err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bikeId, startAt, endAt, enabled, debounceMs]);

  return { check, loading, error };
}

export function useBikeAvailabilityCalendar(bikeId, { from, to, durationHours = 1, enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !bikeId) {
      setData(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    bikeRentUserApi
      .getBikeAvailability(bikeId, {
        from: from || new Date().toISOString(),
        to: to || new Date(Date.now() + 7 * 86400000).toISOString(),
        durationHours,
      })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bikeId, from, to, durationHours, enabled]);

  return { data, loading };
}
