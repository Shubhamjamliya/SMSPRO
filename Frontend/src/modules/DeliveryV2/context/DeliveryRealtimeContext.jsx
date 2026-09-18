import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import alertSound from "@food/assets/audio/alert.mp3";
import originalSound from "@food/assets/audio/original.mp3";
import { hasNativeShell } from "@core/native/nativeBridge";
import { AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { deliveryAPI } from "@food/api";
import { isModuleAuthenticated } from "@food/utils/auth";
import { useDeliveryNotifications } from "@food/hooks/useDeliveryNotifications";
import { NewOrderModal } from "@/modules/DeliveryV2/components/modals/NewOrderModal";
import { useOrderManager } from "@/modules/DeliveryV2/hooks/useOrderManager";
import { useDeliveryStore } from "@/modules/DeliveryV2/store/useDeliveryStore";
import {
  enrichReturnDeliveryOrder,
  formatDeliveryAddressText,
  getDeliveryDocumentId,
  isReturnPickupTrip,
  normalizePickupPoints,
} from "@/modules/DeliveryV2/utils/orderRouting";
import {
  isDeliveryWorkFeaturesBlocked,
  normalizeDriverModuleKey,
} from "@/modules/DeliveryV2/utils/driverModuleAccess";
import { useLocation } from "react-router-dom";

const DeliveryRealtimeContext = createContext(null);

function getOfferKeys(orderLike = {}) {
  return [
    orderLike?.orderMongoId,
    orderLike?._id,
    orderLike?.id,
    orderLike?.orderId,
    orderLike?.rideId,
    orderLike?.tripId,
    orderLike?.returnId,
    orderLike?.dispatchLeg?.legId,
  ]
    .map((v) => (v == null ? "" : String(v).trim()))
    .filter(Boolean);
}

/** Dedupe key includes dispatch attempt so taxi/porter retries can re-popup. */
function getOfferDedupeKeys(orderLike = {}) {
  const base = getOfferKeys(orderLike);
  const attempt =
    orderLike?.dispatchAttempt ??
    orderLike?.attemptNumber ??
    orderLike?.dispatch?.currentAttempt;
  if (attempt == null || attempt === "") return base;
  return base.map((k) => `${k}::a${attempt}`);
}

function getOfferModuleKey(order = {}) {
  if (isReturnPickupTrip(order)) return "quick-commerce";
  return normalizeDriverModuleKey(
    order?.module || order?.sourceType || order?.orderType || order?.serviceType || "food",
  );
}

const FOOD_OFFERABLE_STATUSES = [
  "confirmed",
  "preparing",
  "ready_for_pickup",
];
const RETURN_PICKUP_OFFERABLE_STATUSES = [
  "return_approved",
  "return_pickup_assigned",
  "return_in_transit",
];
const TAXI_OFFERABLE_STATUSES = ["requested", "searching"];
const PORTER_OFFERABLE_STATUSES = ["quoted", "searching"];

function isTaxiIncomingOffer(order) {
  const moduleKey = getOfferModuleKey(order || {});
  return moduleKey === "taxi" || Boolean(order?.rideId);
}

/** Foreground looping ring for taxi offers (food uses FCM native ring). */
function TaxiOfferRing({ offer }) {
  const audioRef = useRef(null);

  useEffect(() => {
    if (!offer) return undefined;
    // Native shell already starts the looping alarm via startRing / FCM.
    if (hasNativeShell()) return undefined;
    const selected = localStorage.getItem("delivery_alert_sound") || "zomato_tone";
    const src = selected === "original" ? originalSound : alertSound;
    const audio = new Audio(src);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0.9;
    audioRef.current = audio;
    audio.play().catch(() => {});
    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, [
    offer?.rideId,
    offer?.orderMongoId,
    offer?.orderId,
    offer?.dispatchAttempt,
    offer?.attemptNumber,
  ]);

  return null;
}

function isOfferStillActionable(update = {}) {
  const status = String(
    update.orderStatus || update.status || "",
  ).toLowerCase();
  if (!status) return true;
  if (isReturnPickupTrip(update)) {
    return RETURN_PICKUP_OFFERABLE_STATUSES.includes(status);
  }
  const moduleKey = getOfferModuleKey(update);
  if (moduleKey === "taxi" || update.rideId) {
    return TAXI_OFFERABLE_STATUSES.includes(status);
  }
  if (moduleKey === "porter" || moduleKey === "parcel" || update.tripId) {
    return PORTER_OFFERABLE_STATUSES.includes(status);
  }
  return FOOD_OFFERABLE_STATUSES.includes(status);
}

function driverCanReceiveOffer(order) {
  const store = useDeliveryStore.getState();
  const available = store.getAvailableModules?.() || [];
  // Vehicle/profile not seeded yet — don't drop offers preemptively
  if (!available.length) return true;
  const moduleKey = getOfferModuleKey(order);
  if (!available.includes(moduleKey)) return false;
  // Respect active work tab — backend also filters; this is defense-in-depth
  const active = store.activeModule
    ? normalizeDriverModuleKey(store.activeModule)
    : null;
  if (active && active !== moduleKey) return false;
  return true;
}

function normalizeIncomingOffer(order) {
  if (!order) return null;
  return enrichReturnDeliveryOrder({
    ...order,
    pickupPoints: normalizePickupPoints(order),
    customerLocation:
      order.customerLocation ||
      order.deliveryAddress?.location ||
      null,
    customerAddress: formatDeliveryAddressText(
      order.deliveryAddress,
      order.customerAddress || order.customer_address || "",
    ),
  });
}

export function DeliveryRealtimeProvider({ children }) {
  const notifications = useDeliveryNotifications();
  const { acceptOrder } = useOrderManager();
  const activeOrder = useDeliveryStore((s) => s.activeOrder);
  const activeModule = useDeliveryStore((s) => s.activeModule);

  const [queue, setQueue] = useState([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [offersLoading, setOffersLoading] = useState(true);
  const [offersError, setOffersError] = useState(null);
  const seenIdsRef = useRef(new Set());
  const queueRef = useRef([]);

  const enqueueOffer = useCallback((rawOrder) => {
    const order = normalizeIncomingOffer(rawOrder);
    if (!order) return;
    if (!driverCanReceiveOffer(order)) return;
    const keys = getOfferKeys(order);
    const dedupeKeys = getOfferDedupeKeys(order);
    if (!keys.length) return;

    // Newer dispatch attempt for same ride → allow popup again
    for (const seen of [...seenIdsRef.current]) {
      if (keys.some((id) => seen === id || String(seen).startsWith(`${id}::a`))) {
        const isCurrentAttempt = dedupeKeys.includes(seen);
        if (!isCurrentAttempt) seenIdsRef.current.delete(seen);
      }
    }

    if (dedupeKeys.some((k) => seenIdsRef.current.has(k))) return;
    for (const k of dedupeKeys) seenIdsRef.current.add(k);

    setQueue((prev) => {
      const withoutOld = prev.filter(
        (o) => !getOfferKeys(o).some((k) => keys.includes(k)),
      );
      const next = [...withoutOld, order];
      queueRef.current = next;
      return next;
    });
    setIsMinimized(false);
  }, []);

  useEffect(() => {
    if (notifications.newOrder) {
      enqueueOffer(notifications.newOrder);
    }
  }, [notifications.newOrder, enqueueOffer]);

  const refreshOffers = useCallback(async () => {
    setOffersLoading(true);
    setOffersError(null);
    try {
      const availableResponse = await deliveryAPI.getOrders({
        limit: 20,
        page: 1,
      });
      const availablePayload =
        availableResponse?.data?.data || availableResponse?.data || {};
      const availableOrders = Array.isArray(availablePayload?.docs)
        ? availablePayload.docs
        : Array.isArray(availablePayload?.items)
          ? availablePayload.items
          : Array.isArray(availablePayload)
            ? availablePayload
            : [];
      availableOrders
        .filter((order) => {
          const dispatchStatus = String(
            order?.dispatch?.status || "",
          ).toLowerCase();
          const orderStatus = String(
            order?.orderStatus || order?.status || "",
          ).toLowerCase();
          return (
            ["unassigned", "assigned"].includes(dispatchStatus) &&
            [
              "confirmed",
              "preparing",
              "ready_for_pickup",
              "return_approved",
              "return_pickup_assigned",
            ].includes(orderStatus)
          );
        })
        .forEach((order) => enqueueOffer(order));
    } catch (error) {
      setOffersError(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to load nearby requests",
      );
    } finally {
      setOffersLoading(false);
    }
  }, [enqueueOffer]);

  // Catch-up + re-scope when the selected work module changes (incl. first hydrate).
  useEffect(() => {
    setQueue((prev) => {
      const next = prev.filter((order) => driverCanReceiveOffer(order));
      queueRef.current = next;
      return next;
    });
    void refreshOffers();
  }, [activeModule, refreshOffers]);

  // Clear offer when driver already has an active trip, or status leaves offerable state.
  useEffect(() => {
    if (!activeOrder) return;
    const activeKeys = getOfferKeys(activeOrder);
    setQueue((prev) => {
      const next = prev.filter(
        (o) => !getOfferKeys(o).some((k) => activeKeys.includes(k)),
      );
      queueRef.current = next;
      return next;
    });
    notifications.clearNewOrder?.();
  }, [activeOrder, notifications.clearNewOrder]);

  useEffect(() => {
    const update = notifications.orderStatusUpdate;
    if (!update) return;
    const keys = getOfferKeys(update);
    const stillOfferable = isOfferStillActionable(update);

    if (keys.length && !stillOfferable) {
      const currentKeys = getOfferKeys(queueRef.current[0] || {});
      const matchesLiveOffer = keys.some((k) => currentKeys.includes(k));
      setQueue((prev) => {
        const next = prev.filter(
          (o) => !getOfferKeys(o).some((k) => keys.includes(k)),
        );
        queueRef.current = next;
        return next;
      });
      // Only stop the ring when this update is about the offer currently ringing.
      // A stale food status update must not kill a new taxi ride alert.
      if (matchesLiveOffer) {
        notifications.clearNewOrder?.();
      }
    } else if (keys.length && stillOfferable) {
      setQueue((prev) =>
        prev.map((o) => {
          if (!getOfferKeys(o).some((k) => keys.includes(k))) return o;
          return {
            ...o,
            ...update,
            status: update.orderStatus || update.status || o.status,
            orderStatus: update.orderStatus || update.status || o.orderStatus,
            preparationTime:
              update.preparationTime ?? o.preparationTime,
            expectedReadyAt: update.expectedReadyAt || o.expectedReadyAt,
          };
        }),
      );
    }
  }, [notifications.orderStatusUpdate, notifications.clearNewOrder]);

  const incomingOrder = activeOrder ? null : queue[0] || null;

  const clearIncoming = useCallback(
    (orderLike) => {
      const keys = orderLike
        ? getOfferKeys(orderLike)
        : getOfferKeys(incomingOrder);
      const dedupeKeys = orderLike
        ? getOfferDedupeKeys(orderLike)
        : getOfferDedupeKeys(incomingOrder);

      // Clear from seen cache so resent offers can popup again
      for (const k of [...keys, ...dedupeKeys]) {
        seenIdsRef.current.delete(k);
      }
      // Also clear any attempt-scoped keys for this offer id
      for (const id of keys) {
        for (const seen of [...seenIdsRef.current]) {
          if (seen === id || String(seen).startsWith(`${id}::a`)) {
            seenIdsRef.current.delete(seen);
          }
        }
      }

      setQueue((prev) => {
        const next = orderLike
          ? prev.filter((o) => !getOfferKeys(o).some((k) => keys.includes(k)))
          : prev.slice(1);
        queueRef.current = next;
        return next;
      });
      notifications.clearNewOrder?.();
    },
    [incomingOrder, notifications.clearNewOrder],
  );

  const acceptIncoming = useCallback(
    async (order) => {
      const target = order || queueRef.current[0];
      if (!target) return false;
      try {
        await acceptOrder(target);
        clearIncoming(target);
        setIsMinimized(false);
        return true;
      } catch (error) {
        toast.error(
          error?.response?.data?.message || "Failed to accept delivery",
        );
        return false;
      }
    },
    [acceptOrder, clearIncoming],
  );

  const rejectIncoming = useCallback(
    async (order) => {
      const target = order || queueRef.current[0];
      if (!target) return false;
      const orderId = getDeliveryDocumentId(target);
      const moduleKey = String(target?.module || target?.jobType || "").toLowerCase();
      const isTaxiOrPorter =
        moduleKey === "taxi" ||
        moduleKey === "porter" ||
        moduleKey === "ride" ||
        moduleKey === "parcel";
      try {
        // Taxi/porter offers are socket-only; food reject API 404s on ride numbers
        if (orderId && !isTaxiOrPorter) {
          await deliveryAPI.rejectOrder(orderId, {
            ...(target?.dispatchLeg?.legId
              ? { legId: target.dispatchLeg.legId }
              : {}),
            ...(String(target?.documentType || "").includes("return")
              ? { documentType: "seller_return" }
              : {}),
          });
        }
      } catch {
        // Still clear local offer so ring/popup stop; backend may re-offer.
      }
      clearIncoming(target);
      setIsMinimized(false);
      return true;
    },
    [clearIncoming],
  );

  const value = useMemo(
    () => ({
      ...notifications,
      incomingOrder,
      offerQueue: queue,
      queueLength: queue.length,
      offersLoading,
      offersError,
      refreshOffers,
      isMinimized,
      setIsMinimized,
      acceptIncoming,
      rejectIncoming,
      clearIncoming,
      enqueueOffer,
    }),
    [
      notifications,
      incomingOrder,
      queue,
      offersLoading,
      offersError,
      refreshOffers,
      isMinimized,
      acceptIncoming,
      rejectIncoming,
      clearIncoming,
      enqueueOffer,
    ],
  );

  return (
    <DeliveryRealtimeContext.Provider value={value}>
      {children}
      {incomingOrder && isTaxiIncomingOffer(incomingOrder) ? (
        <TaxiOfferRing offer={incomingOrder} />
      ) : null}
      <AnimatePresence>
        {!isMinimized && incomingOrder ? (
          <NewOrderModal
            key={
              [
                ...getOfferKeys(incomingOrder),
                incomingOrder?.dispatchAttempt ?? incomingOrder?.attemptNumber ?? "",
              ]
                .filter(Boolean)
                .join("-") || "incoming"
            }
            order={incomingOrder}
            onAccept={(o) => acceptIncoming(o)}
            onReject={() => rejectIncoming(incomingOrder)}
            onMinimize={() => setIsMinimized(true)}
          />
        ) : null}
      </AnimatePresence>
    </DeliveryRealtimeContext.Provider>
  );
}

/** Mount socket+popup only for authenticated delivery sessions with work access. */
export function DeliveryRealtimeGate({ children }) {
  const authenticated = isModuleAuthenticated("delivery");
  const location = useLocation();
  const path = String(location?.pathname || "");
  const isAuthOrOnboardingPath =
    /\/food\/delivery\/(welcome|login|auth\/login|otp|signup|verification)(\/|$)/.test(
      path,
    );

  if (
    !authenticated ||
    isAuthOrOnboardingPath ||
    isDeliveryWorkFeaturesBlocked()
  ) {
    return children;
  }
  return <DeliveryRealtimeProvider>{children}</DeliveryRealtimeProvider>;
}

export function useDeliveryRealtime() {
  const ctx = useContext(DeliveryRealtimeContext);
  if (!ctx) {
    throw new Error(
      "useDeliveryRealtime must be used within DeliveryRealtimeProvider",
    );
  }
  return ctx;
}

export function useDeliveryRealtimeOptional() {
  return useContext(DeliveryRealtimeContext);
}
