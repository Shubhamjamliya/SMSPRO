import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import alertSound from "@food/assets/audio/alert.mp3";
import useServiceProviderSocket from "../hooks/useServiceProviderSocket";
import serviceProviderApi from "../services/providerApi";

const ServiceProviderRealtimeContext = createContext(null);

// Same loop shape as Food's useDeliveryNotifications.js (ALERT_LOOP_INTERVAL_MS /
// ALERT_LOOP_MAX_MS) — ring immediately, then keep nagging every 4.5s while the tab
// is in the background, for up to 2 minutes, unless the request is handled first.
const ALERT_LOOP_INTERVAL_MS = 4500;
const ALERT_LOOP_MAX_MS = 120000;

/**
 * Mounted once at the Service Provider dashboard layout level (ServiceProviderLayout,
 * used by every approved-provider page) instead of per-page — this is the fix for
 * "sound only works on /service-provider/requests": a single persistent socket
 * connection + ring loop + pending-request queue that survives navigation between
 * Dashboard/My Services/My Zones/Availability/Incoming Requests/Jobs, exactly like
 * Food's DeliveryRealtimeContext is mounted once app-wide rather than per-page.
 */
export function ServiceProviderRealtimeProvider({ children }) {
  const [queue, setQueue] = useState([]);
  const [lastEventAt, setLastEventAt] = useState(0);
  const audioRef = useRef(null);
  const loopTimerRef = useRef(null);
  const loopStartedAtRef = useRef(0);
  const queueRef = useRef([]);
  const ringingIdRef = useRef(null);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const playSound = useCallback(() => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(alertSound);
        audioRef.current.preload = "auto";
        audioRef.current.volume = 0.9;
      }
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate([200, 100, 200, 100, 300]);
      }
    } catch {
      // Autoplay-policy or unsupported browser — the popup/list still shows the
      // request, sound is a best-effort enhancement on top of it.
    }
  }, []);

  const stopLoop = useCallback(() => {
    if (loopTimerRef.current) {
      clearInterval(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    loopStartedAtRef.current = 0;
    ringingIdRef.current = null;
  }, []);

  const startLoop = useCallback(() => {
    if (loopTimerRef.current) clearInterval(loopTimerRef.current);
    loopStartedAtRef.current = Date.now();
    loopTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - loopStartedAtRef.current;
      if (elapsed >= ALERT_LOOP_MAX_MS || queueRef.current.length === 0) {
        stopLoop();
        return;
      }
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        playSound();
      }
    }, ALERT_LOOP_INTERVAL_MS);
  }, [playSound, stopLoop]);

  const removeFromQueue = useCallback((bookingId) => {
    setQueue((prev) => prev.filter((item) => String(item._id) !== String(bookingId)));
  }, []);

  const refreshQueue = useCallback(async () => {
    try {
      const list = await serviceProviderApi.getIncomingRequests();
      setQueue(list);
    } catch {
      // Best-effort resync only — the socket push + this poll's next tick remain
      // the recovery paths, a single failed refresh must not clear the queue.
    }
  }, []);

  const handleNewRequest = useCallback((payload) => {
    const bookingId = String(payload?.bookingId || "");
    if (!bookingId) return;
    setQueue((prev) => (prev.some((item) => String(item._id) === bookingId) ? prev : [...prev, { ...payload, _id: bookingId }]));
    setLastEventAt(Date.now());
  }, []);

  const handleStatusUpdate = useCallback((payload) => {
    setLastEventAt(Date.now());
    // Any status change away from 'requested' means this offer is no longer awaiting
    // THIS provider's response (accepted elsewhere, expired, reassigned) — drop it
    // from the queue immediately so the ring stops right away.
    if (payload?.bookingId && payload.status && payload.status !== "requested") {
      removeFromQueue(payload.bookingId);
    }
  }, [removeFromQueue]);

  const { connected } = useServiceProviderSocket({
    onNewRequest: handleNewRequest,
    onStatusUpdate: handleStatusUpdate,
  });

  // Resync from the database on mount and whenever the socket (re)connects — the
  // guarantee that a request offered while disconnected is never missed.
  useEffect(() => {
    refreshQueue();
  }, [connected, refreshQueue]);

  // Database-backed safety net poll, independent of socket state.
  useEffect(() => {
    const timer = setInterval(refreshQueue, 15000);
    return () => clearInterval(timer);
  }, [refreshQueue]);

  // Ring exactly once per distinct "current" (oldest) request, then keep looping
  // while it stays at the head of the queue — stops the instant it's removed
  // (accepted/rejected/expired), and never re-rings a request already handled.
  useEffect(() => {
    const headId = queue[0]?._id ? String(queue[0]._id) : null;
    if (headId && headId !== ringingIdRef.current) {
      ringingIdRef.current = headId;
      playSound();
      startLoop();
    } else if (!headId) {
      stopLoop();
    }
  }, [queue, playSound, startLoop, stopLoop]);

  // Client-side mirror of the server's own per-offer timeout (dispatch.respondBy) —
  // if a status-update push is ever missed, a locally-expired request still stops
  // ringing/showing instead of lingering past what the backend already moved on from.
  useEffect(() => {
    if (!queue.length) return undefined;
    const timer = setInterval(() => {
      const now = Date.now();
      setQueue((prev) => prev.filter((item) => {
        const respondBy = item?.dispatch?.respondBy || item?.respondBy;
        return !respondBy || new Date(respondBy).getTime() > now;
      }));
    }, 3000);
    return () => clearInterval(timer);
  }, [queue.length]);

  useEffect(() => () => stopLoop(), [stopLoop]);

  const value = { queue, connected, lastEventAt, removeFromQueue, refreshQueue };
  return (
    <ServiceProviderRealtimeContext.Provider value={value}>
      {children}
    </ServiceProviderRealtimeContext.Provider>
  );
}

export function useServiceProviderRealtime() {
  const ctx = useContext(ServiceProviderRealtimeContext);
  if (!ctx) {
    throw new Error("useServiceProviderRealtime must be used within ServiceProviderRealtimeProvider");
  }
  return ctx;
}
