import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { restaurantAPI } from "@food/api";
import { useRestaurantNotifications } from "@food/hooks/useRestaurantNotifications";
import RestaurantIncomingOrderPopup from "@food/components/restaurant/RestaurantIncomingOrderPopup";

const RestaurantRealtimeContext = createContext(null);

const ACTIONABLE_STATUSES = new Set([
  "created",
  "confirmed",
  "placed",
  "pending",
]);

export function getOrderKeys(orderLike = {}) {
  return [
    orderLike?.orderMongoId,
    orderLike?.order_mongo_id,
    orderLike?._id,
    orderLike?.id,
    orderLike?.orderId,
    orderLike?.order_id,
  ]
    .map((v) => (v == null ? "" : String(v).trim()))
    .filter(Boolean);
}

function ordersMatch(a, b) {
  const aKeys = new Set(getOrderKeys(a));
  const bKeys = getOrderKeys(b);
  return bKeys.some((k) => aKeys.has(k));
}

function isFutureScheduled(order) {
  if (!order?.scheduledAt) return false;
  const scheduledAt = new Date(order.scheduledAt).getTime();
  return Number.isFinite(scheduledAt) && scheduledAt > Date.now() + 15 * 60000;
}

function isActionableIncoming(order) {
  if (!order) return false;
  if (isFutureScheduled(order)) return false;
  const status = String(
    order.status || order.orderStatus || "",
  ).toLowerCase();
  if (!status) return true;
  return ACTIONABLE_STATUSES.has(status);
}

function resolveOrderId(order) {
  return order?.orderMongoId || order?._id || order?.orderId || order?.id || null;
}

export function RestaurantRealtimeProvider({
  children,
  restaurantName = "",
}) {
  const {
    newOrder,
    clearNewOrder,
    isConnected,
    stopRing,
  } = useRestaurantNotifications({ enableCatchUp: true });

  const [queue, setQueue] = useState([]);
  const [refreshOrdersToken, setRefreshOrdersToken] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const seenIdsRef = useRef(new Set());
  const queueRef = useRef([]);

  const bumpRefresh = useCallback(() => {
    setRefreshOrdersToken((t) => t + 1);
    window.dispatchEvent(
      new CustomEvent("restaurantOrdersRefresh", {
        detail: { reason: "realtime" },
      }),
    );
  }, []);

  useEffect(() => {
    const onRefresh = (event) => {
      const reason = event?.detail?.reason;
      if (reason === "realtime") return;
      setRefreshOrdersToken((t) => t + 1);

      const detail = event?.detail || {};
      const keys = getOrderKeys(detail);
      if (!keys.length) return;

      const status = String(
        detail.status || detail.orderStatus || "",
      ).toLowerCase();
      const stillActionable = !status || ACTIONABLE_STATUSES.has(status);

      if (!stillActionable) {
        setQueue((prev) => {
          const next = prev.filter(
            (o) => !getOrderKeys(o).some((k) => keys.includes(k)),
          );
          queueRef.current = next;
          if (next.length === 0) {
            clearNewOrder();
            stopRing?.();
          }
          return next;
        });
      }
    };

    window.addEventListener("restaurantOrdersRefresh", onRefresh);
    return () => window.removeEventListener("restaurantOrdersRefresh", onRefresh);
  }, [clearNewOrder, stopRing]);

  const enqueueOrder = useCallback(
    (order) => {
      if (!order || !isActionableIncoming(order)) {
        if (order && isFutureScheduled(order)) {
          toast.info(
            `New scheduled order received for ${new Date(
              order.scheduledAt,
            ).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            })}`,
          );
          bumpRefresh();
        }
        return;
      }

      const keys = getOrderKeys(order);
      if (!keys.length) return;
      if (keys.some((k) => seenIdsRef.current.has(k))) return;

      for (const k of keys) seenIdsRef.current.add(k);

      setQueue((prev) => {
        const exists = prev.some((o) =>
          getOrderKeys(o).some((k) => keys.includes(k)),
        );
        if (exists) return prev;
        // Newest first — matches reference New Orders queue
        const next = [order, ...prev];
        queueRef.current = next;
        return next;
      });
      bumpRefresh();
      window.dispatchEvent(
        new CustomEvent("restaurant:incoming_queue_updated", {
          detail: { order },
        }),
      );
    },
    [bumpRefresh],
  );

  useEffect(() => {
    if (newOrder) enqueueOrder(newOrder);
  }, [newOrder, enqueueOrder]);

  // Catch-up may only surface the newest order via the hook; load the full actionable set once.
  useEffect(() => {
    let cancelled = false;
    const loadPendingQueue = async () => {
      try {
        const response = await restaurantAPI.getOrders({ page: 1, limit: 30 });
        const rows =
          response?.data?.data?.orders ||
          response?.data?.data?.data?.orders ||
          [];
        if (cancelled) return;
        (rows || [])
          .filter((o) => {
            const status = String(o?.status || o?.orderStatus || "").toLowerCase();
            return ACTIONABLE_STATUSES.has(status);
          })
          .sort((a, b) => {
            const at = a?.createdAt || 0;
            const bt = b?.createdAt || 0;
            return new Date(bt).getTime() - new Date(at).getTime();
          })
          .forEach((order) => {
            enqueueOrder({
              ...order,
              orderMongoId:
                order.orderMongoId ||
                order._id?.toString?.() ||
                order._id ||
                order.id,
              customerAddress:
                order.customerAddress ||
                order.deliveryAddress ||
                order.address,
              total: order.total ?? order.pricing?.total ?? 0,
            });
          });
      } catch {
        // non-blocking
      }
    };
    loadPendingQueue();
    return () => {
      cancelled = true;
    };
  }, [enqueueOrder]);

  const incomingOrder = queue[0] || null;

  const clearIncoming = useCallback(
    (orderLike) => {
      const keys = orderLike ? getOrderKeys(orderLike) : getOrderKeys(incomingOrder);
      setQueue((prev) => {
        const next = orderLike
          ? prev.filter((o) => !getOrderKeys(o).some((k) => keys.includes(k)))
          : prev.slice(1);
        queueRef.current = next;
        if (next.length === 0) {
          clearNewOrder();
          stopRing?.();
        }
        return next;
      });
    },
    [clearNewOrder, incomingOrder, stopRing],
  );

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next) stopRing?.();
      return next;
    });
  }, [stopRing]);

  const acceptOrder = useCallback(
    async (prepTimeMins = null) => {
      const order = queueRef.current[0];
      if (!order) return false;
      const orderId = resolveOrderId(order);
      if (!orderId) return false;

      await restaurantAPI.acceptOrder(orderId, prepTimeMins);
      for (const k of getOrderKeys(order)) seenIdsRef.current.add(k);
      clearIncoming(order);
      bumpRefresh();
      toast.success("Order accepted");
      return true;
    },
    [bumpRefresh, clearIncoming],
  );

  const rejectOrder = useCallback(
    async (reason = "") => {
      const order = queueRef.current[0];
      if (!order) return false;
      const orderId = resolveOrderId(order);
      if (!orderId) return false;

      await restaurantAPI.rejectOrder(orderId, reason);
      for (const k of getOrderKeys(order)) seenIdsRef.current.add(k);
      clearIncoming(order);
      bumpRefresh();
      toast.success("Order rejected");
      return true;
    },
    [bumpRefresh, clearIncoming],
  );

  /** Accept a specific queued order (New Orders cards). */
  const acceptQueuedOrder = useCallback(
    async (orderLike, prepTimeMins = null) => {
      const order =
        queueRef.current.find((o) => ordersMatch(o, orderLike)) || orderLike;
      if (!order) return false;
      const orderId = resolveOrderId(order);
      if (!orderId) throw new Error("Missing order id");

      await restaurantAPI.acceptOrder(orderId, prepTimeMins);
      for (const k of getOrderKeys(order)) seenIdsRef.current.add(k);
      clearIncoming(order);
      bumpRefresh();
      toast.success("Order accepted successfully");
      return true;
    },
    [bumpRefresh, clearIncoming],
  );

  /** Reject a specific queued order (New Orders cards). */
  const rejectQueuedOrder = useCallback(
    async (orderLike, reason = "") => {
      const order =
        queueRef.current.find((o) => ordersMatch(o, orderLike)) || orderLike;
      if (!order) return false;
      const orderId = resolveOrderId(order);
      if (!orderId) throw new Error("Missing order id");

      await restaurantAPI.rejectOrder(orderId, reason);
      for (const k of getOrderKeys(order)) seenIdsRef.current.add(k);
      clearIncoming(order);
      bumpRefresh();
      toast.success("Order rejected");
      return true;
    },
    [bumpRefresh, clearIncoming],
  );

  const value = useMemo(
    () => ({
      isConnected,
      incomingOrder,
      queue,
      queueLength: queue.length,
      clearIncoming,
      acceptOrder,
      rejectOrder,
      acceptQueuedOrder,
      rejectQueuedOrder,
      refreshOrdersToken,
      bumpRefresh,
      isMuted,
      toggleMute,
      restaurantName,
    }),
    [
      isConnected,
      incomingOrder,
      queue,
      clearIncoming,
      acceptOrder,
      rejectOrder,
      acceptQueuedOrder,
      rejectQueuedOrder,
      refreshOrdersToken,
      bumpRefresh,
      isMuted,
      toggleMute,
      restaurantName,
    ],
  );

  return (
    <RestaurantRealtimeContext.Provider value={value}>
      {children}
      <RestaurantIncomingOrderPopup />
    </RestaurantRealtimeContext.Provider>
  );
}

export function useRestaurantRealtime() {
  const ctx = useContext(RestaurantRealtimeContext);
  if (!ctx) {
    throw new Error(
      "useRestaurantRealtime must be used within RestaurantRealtimeProvider",
    );
  }
  return ctx;
}

/** Safe hook for pages that may render outside the layout shell. */
export function useRestaurantRealtimeOptional() {
  return useContext(RestaurantRealtimeContext);
}
