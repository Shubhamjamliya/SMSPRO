import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import { API_BASE_URL } from "@food/api/config";
import { getServiceProviderToken, getServiceProviderUser } from "../utils/authServiceProvider";

const resolveBackendOrigin = () => {
  try {
    const base = String(API_BASE_URL).startsWith("http") ? undefined : window.location.origin;
    return new URL(API_BASE_URL, base).origin;
  } catch {
    return window.location.origin;
  }
};

/**
 * Real-time incoming-request + status-update connection for the provider dashboard —
 * same Socket.IO server/connection pattern Food's useDeliveryNotifications.js uses for
 * delivery partners (auth:{token} handshake, auto reconnect), just scoped to the
 * `provider:<id>` room (config/socket.js) instead of `delivery:<id>`.
 *
 * Deliberately a pure connection + event-relay layer with no sound/UI logic of its
 * own — ServiceProviderRealtimeContext (mounted once at the layout level, not
 * per-page) is the single place that owns the ring loop and the pending-request
 * queue, so this hook only needs to be called from that one place.
 *
 * This is additive to — never a replacement for — the existing REST polling: if the
 * socket is down or reconnecting, the poll interval keeps the UI correct off the
 * database, which stays the source of truth.
 */
export default function useServiceProviderSocket({ onNewRequest, onStatusUpdate, onPlaySound } = {}) {
  const [connected, setConnected] = useState(false);
  const onNewRequestRef = useRef(onNewRequest);
  const onStatusUpdateRef = useRef(onStatusUpdate);
  const onPlaySoundRef = useRef(onPlaySound);

  useEffect(() => {
    onNewRequestRef.current = onNewRequest;
  }, [onNewRequest]);
  useEffect(() => {
    onStatusUpdateRef.current = onStatusUpdate;
  }, [onStatusUpdate]);
  useEffect(() => {
    onPlaySoundRef.current = onPlaySound;
  }, [onPlaySound]);

  useEffect(() => {
    const token = getServiceProviderToken();
    const provider = getServiceProviderUser();
    const providerId = provider?._id || provider?.id;
    if (!token || !providerId) return undefined;

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

    const join = () => socket.emit("join-provider", providerId);

    socket.on("connect", () => {
      setConnected(true);
      join();
    });
    socket.on("reconnect", join);
    socket.on("disconnect", () => setConnected(false));
    socket.on("new_service_booking_available", (payload) => onNewRequestRef.current?.(payload));
    socket.on("play_notification_sound", (payload) => onPlaySoundRef.current?.(payload));
    socket.on("booking_status_update", (payload) => onStatusUpdateRef.current?.(payload));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);

  return { connected };
}
