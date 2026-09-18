import { useEffect, useRef } from "react";
import io from "socket.io-client";
import { API_BASE_URL } from "@food/api/config";

const resolveBackendOrigin = () => {
  try {
    const base = String(API_BASE_URL).startsWith("http") ? undefined : window.location.origin;
    return new URL(API_BASE_URL, base).origin;
  } catch {
    return window.location.origin;
  }
};

const pickCustomerToken = () => {
  const candidates = [
    localStorage.getItem("user_accessToken"),
    localStorage.getItem("auth_customer"),
    localStorage.getItem("accessToken"),
  ].filter((token) => token && token !== "null" && token !== "undefined");
  return candidates[0] || null;
};

/**
 * Real-time push for a customer's own booking — same Socket.IO server the Taxi
 * customer tracking screen uses (rooms.user(<id>), auto-joined server-side from the
 * JWT role, no explicit join needed here). Mirrors Taxi's own pattern of never
 * trusting the socket payload as final state (Frontend/src/modules/taxi/user/pages/
 * Home.jsx's ride_status_update handler) — every push here is purely a trigger to
 * refetch from the database via onUpdate, which stays the single source of truth.
 */
export default function useBookingSocket(bookingId, onUpdate) {
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!bookingId) return undefined;
    const token = pickCustomerToken();
    if (!token) return undefined;

    const socket = io(resolveBackendOrigin(), {
      path: "/socket.io/",
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 20000,
      auth: { token },
    });

    const handleUpdate = (payload) => {
      if (payload?.bookingId && String(payload.bookingId) !== String(bookingId)) return;
      onUpdateRef.current?.();
    };

    socket.on("connect", () => onUpdateRef.current?.());
    socket.on("booking_status_update", handleUpdate);

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [bookingId]);
}
