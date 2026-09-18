import { useCallback, useEffect, useMemo, useState } from "react";
import bikeRentUserApi from "../services/userApi";
import { isBikeRentUserLoggedIn } from "../utils/authUser";
import {
  bookingBikeIdOf,
  bookingIdOf,
  isOpenHoldStatus,
} from "../utils/bookingDisplay";

/**
 * Loads the current user's soft-held bookings (awaiting approval or payment).
 */
export function useMyPendingBookings() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isBikeRentUserLoggedIn()) {
      setPending([]);
      return [];
    }
    setLoading(true);
    try {
      const data = await bikeRentUserApi.getMyBookings({
        scope: "active",
        limit: 50,
      });
      const records = (data.records || []).filter((row) =>
        isOpenHoldStatus(row.status),
      );
      setPending(records);
      return records;
    } catch {
      setPending([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const pendingByBikeId = useMemo(() => {
    const map = {};
    pending.forEach((booking) => {
      const bikeId = String(bookingBikeIdOf(booking) || "");
      if (!bikeId) return;
      if (!map[bikeId]) map[bikeId] = booking;
    });
    return map;
  }, [pending]);

  const getPendingForBike = useCallback(
    (bikeId) => pendingByBikeId[String(bikeId || "")] || null,
    [pendingByBikeId],
  );

  return {
    pending,
    pendingByBikeId,
    getPendingForBike,
    loading,
    refresh,
    pendingIds: pending.map(bookingIdOf).filter(Boolean),
  };
}
