import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronDown,
  Clock3,
  CreditCard,
  MapPin,
  Navigation,
  Route,
  X,
} from "lucide-react";
import { ActionSlider } from "@/modules/DeliveryV2/components/ui/ActionSlider";
import { useDeliveryStore } from "@/modules/DeliveryV2/store/useDeliveryStore";
import { getHaversineDistance } from "@/modules/DeliveryV2/utils/geo";
import {
  normalizePickupPoints,
  formatDeliveryAddressText,
  isReturnPickupTrip,
  getPrimaryPickupLocation,
  getReturnDropLocation,
} from "@/modules/DeliveryV2/utils/orderRouting";
import {
  buildFeedRequestViewModel,
  getFeedServiceKey,
} from "@/modules/DeliveryV2/utils/feedRequestFormatters";
import { RequestCard } from "@/modules/DeliveryV2/components/feed";
import { locationAPI } from "@food/api";

const OFFER_SECONDS = 30;

function CountdownRing({ seconds, total = OFFER_SECONDS }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const progress = Math.max(0, Math.min(1, seconds / total));
  const urgent = seconds <= 8;

  return (
    <div className="relative flex h-11 w-11 items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 44 44" aria-hidden>
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-neutral-200"
        />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          className={urgent ? "text-red-500" : "text-[#FF6A00]"}
        />
      </svg>
      <span
        className={`relative text-[12px] font-bold tabular-nums ${
          urgent ? "text-red-600" : "text-neutral-900"
        }`}
      >
        {seconds}
      </span>
    </div>
  );
}

function TaxiOfferBody({ viewModel }) {
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-black/[0.05] bg-gradient-to-br from-[#FFF8F2] via-white to-white px-4 py-4">
        <div
          className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-[#FF6A00]/10 blur-2xl"
          aria-hidden
        />
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-400">
          Estimated fare
        </p>
        <p className="mt-1 text-[2rem] font-black leading-none tracking-tight text-neutral-950 tabular-nums">
          {viewModel.earningsLabel || "—"}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {viewModel.paymentLabel ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-700 ring-1 ring-black/[0.06]">
              <CreditCard className="h-3 w-3 text-neutral-400" />
              {viewModel.paymentLabel}
            </span>
          ) : null}
          {viewModel.tripDistanceLabel ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-700 ring-1 ring-black/[0.06]">
              <Route className="h-3 w-3 text-neutral-400" />
              {viewModel.tripDistanceLabel}
            </span>
          ) : null}
          {viewModel.etaLabel ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-700 ring-1 ring-black/[0.06]">
              <Clock3 className="h-3 w-3 text-neutral-400" />
              {viewModel.etaLabel}
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-0 rounded-2xl border border-black/[0.05] bg-white px-3.5 py-3">
        <div className="flex gap-3">
          <div className="flex flex-col items-center pt-1">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100" />
            <span className="my-1 min-h-[1.75rem] w-px flex-1 border-l border-dashed border-neutral-300" />
          </div>
          <div className="min-w-0 flex-1 pb-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600/80">
              Pickup
            </p>
            <p className="mt-0.5 truncate text-[13px] font-bold text-neutral-900">
              {viewModel.pickup.title}
            </p>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-neutral-500">
              {viewModel.pickup.address}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex flex-col items-center pt-1">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 ring-4 ring-red-100" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-500/80">
              Drop
            </p>
            <p className="mt-0.5 truncate text-[13px] font-bold text-neutral-900">
              {viewModel.drop.title}
            </p>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-neutral-500">
              {viewModel.drop.address}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-black/[0.05] bg-neutral-50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-neutral-400">
            <Navigation className="h-3.5 w-3.5" />
            <span className="text-[10px] font-semibold uppercase tracking-wide">
              To pickup
            </span>
          </div>
          <p className="mt-1 text-sm font-bold text-neutral-900">
            {viewModel.pickupDistanceLabel || "—"}
          </p>
        </div>
        <div className="rounded-xl border border-black/[0.05] bg-neutral-50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-neutral-400">
            <MapPin className="h-3.5 w-3.5" />
            <span className="text-[10px] font-semibold uppercase tracking-wide">
              Ride ID
            </span>
          </div>
          <p className="mt-1 text-sm font-bold tabular-nums text-neutral-900">
            {viewModel.requestId
              ? String(viewModel.requestId).slice(-8).toUpperCase()
              : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Incoming offer popup — taxi rides get a clean professional sheet;
 * other modules keep the compact RequestCard layout.
 */
export const NewOrderModal = ({ order, onAccept, onReject, onMinimize }) => {
  const { riderLocation, activeModule, resolveActiveModule } = useDeliveryStore();
  const [timeLeft, setTimeLeft] = useState(OFFER_SECONDS);
  const [showDetails, setShowDetails] = useState(false);
  const pickupPoints = normalizePickupPoints(order);
  const primaryPickup = pickupPoints[0] || null;

  const workModule = activeModule || resolveActiveModule?.() || null;
  const serviceKey = getFeedServiceKey(order);
  const isTaxi =
    serviceKey === "taxi" || String(workModule || "").toLowerCase() === "taxi";

  useEffect(() => {
    setTimeLeft(OFFER_SECONDS);
    setShowDetails(false);
  }, [
    order?.orderId,
    order?._id,
    order?.id,
    order?.rideId,
    order?.dispatchAttempt,
    order?.attemptNumber,
  ]);

  useEffect(() => {
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [
    order?.orderId,
    order?._id,
    order?.id,
    order?.rideId,
    order?.dispatchAttempt,
    order?.attemptNumber,
  ]);

  useEffect(() => {
    if (timeLeft <= 0) onReject();
  }, [timeLeft, onReject]);

  const { distanceKm, etaMins } = useMemo(() => {
    if (!order) return { distanceKm: null, etaMins: null };

    const rawEta = order.estimatedTime || order.duration || order.eta;

    if (isReturnPickupTrip(order)) {
      const pickupLoc = getPrimaryPickupLocation(order);
      const tripKm = Number(
        order.tripDistanceKm ?? order.pickupDistanceKm ?? order.distanceKm,
      );
      if (riderLocation && pickupLoc) {
        const distM = getHaversineDistance(
          riderLocation.lat,
          riderLocation.lng,
          pickupLoc.lat,
          pickupLoc.lng,
        );
        const km = distM / 1000;
        return {
          distanceKm: km.toFixed(1),
          etaMins:
            rawEta && rawEta > 0
              ? Math.ceil(rawEta)
              : Math.ceil(distM / 416) + 5,
        };
      }
      return {
        distanceKm: null,
        etaMins:
          rawEta && rawEta > 0
            ? Math.ceil(rawEta)
            : Number.isFinite(tripKm) && tripKm > 0
              ? Math.ceil(tripKm * 1000 / 416) + 5
              : order.prepTime || 15,
      };
    }

    const rawDist = order.pickupDistanceKm || order.distanceKm;

    if (rawDist != null) {
      return {
        distanceKm: Number(rawDist).toFixed(1),
        etaMins:
          rawEta && rawEta > 0
            ? Math.ceil(rawEta)
            : Math.ceil((rawDist * 1000) / 416) + 5,
      };
    }

    const rest =
      primaryPickup?.location ||
      order.restaurantLocation ||
      order.restaurantId?.location ||
      order.pickup ||
      {};
    const resLat = parseFloat(
      order.restaurant_lat ||
        order.restaurantLat ||
        rest.latitude ||
        rest.lat,
    );
    const resLng = parseFloat(
      order.restaurant_lng ||
        order.restaurantLng ||
        rest.longitude ||
        rest.lng,
    );

    if (riderLocation && !isNaN(resLat) && !isNaN(resLng)) {
      const distM = getHaversineDistance(
        riderLocation.lat,
        riderLocation.lng,
        resLat,
        resLng,
      );
      const km = distM / 1000;
      const mins = Math.ceil(distM / 416) + (order.prepTime || 5);
      return { distanceKm: km.toFixed(1), etaMins: mins };
    }

    return { distanceKm: null, etaMins: order.prepTime || 15 };
  }, [order, primaryPickup, riderLocation]);

  const routeCoords = useMemo(() => {
    if (!order) return { pickup: null, drop: null };

    if (isReturnPickupTrip(order)) {
      return {
        pickup: getPrimaryPickupLocation(order),
        drop: getReturnDropLocation(order),
      };
    }

    const rest =
      primaryPickup?.location ||
      order.restaurantLocation ||
      order.restaurantId?.location ||
      order.pickup ||
      {};
    const pLat = parseFloat(
      order.restaurant_lat ||
        order.restaurantLat ||
        rest.latitude ||
        rest.lat,
    );
    const pLng = parseFloat(
      order.restaurant_lng ||
        order.restaurantLng ||
        rest.longitude ||
        rest.lng,
    );
    const geo = order?.deliveryAddress?.location?.coordinates;
    const dropRaw =
      order.customerLocation ||
      order.deliveryLocation ||
      order.drop ||
      (Array.isArray(geo) && geo.length >= 2
        ? { lat: geo[1], lng: geo[0] }
        : null);
    const dLat = parseFloat(dropRaw?.lat ?? dropRaw?.latitude);
    const dLng = parseFloat(dropRaw?.lng ?? dropRaw?.longitude);
    return {
      pickup:
        Number.isFinite(pLat) && Number.isFinite(pLng)
          ? { lat: pLat, lng: pLng }
          : null,
      drop:
        Number.isFinite(dLat) && Number.isFinite(dLng)
          ? { lat: dLat, lng: dLng }
          : null,
    };
  }, [order, primaryPickup]);

  const [roadLegs, setRoadLegs] = useState({ pickup: null, drop: null });
  useEffect(() => {
    setRoadLegs({ pickup: null, drop: null });
    if (!order) return undefined;
    let cancelled = false;

    const fetchLeg = (from, to, key) => {
      if (!from || !to) return;
      locationAPI
        .roadDistance(from.lat, from.lng, to.lat, to.lng)
        .then((res) => {
          const d = res?.data?.data;
          if (
            !cancelled &&
            d &&
            Number.isFinite(Number(d.distanceKm)) &&
            d.source !== "haversine"
          ) {
            setRoadLegs((prev) => ({ ...prev, [key]: d }));
          }
        })
        .catch(() => {});
    };

    fetchLeg(
      riderLocation
        ? { lat: riderLocation.lat, lng: riderLocation.lng }
        : null,
      routeCoords.pickup,
      "pickup",
    );
    fetchLeg(routeCoords.pickup, routeCoords.drop, "drop");

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    order?.orderId,
    order?._id,
    routeCoords.pickup?.lat,
    routeCoords.pickup?.lng,
    routeCoords.drop?.lat,
    routeCoords.drop?.lng,
  ]);

  const enrichedOrder = useMemo(() => {
    if (!order) return null;
    const isReturn = isReturnPickupTrip(order);
    const pickupKm =
      roadLegs.pickup?.distanceKm != null
        ? Number(roadLegs.pickup.distanceKm)
        : distanceKm != null
          ? Number(distanceKm)
          : isReturn
            ? null
            : order.pickupDistanceKm;
    const backendTripKm = Number(
      order.tripDistanceKm ?? order.pickupDistanceKm ?? order.distanceKm,
    );
    const roadTripKm =
      roadLegs.drop?.distanceKm != null ? Number(roadLegs.drop.distanceKm) : null;
    const tripKm = isReturn
      ? (roadTripKm != null && roadTripKm > 0
          ? roadTripKm
          : Number.isFinite(backendTripKm) && backendTripKm > 0
            ? backendTripKm
            : null)
      : roadTripKm != null
        ? roadTripKm
        : order.tripDistanceKm ?? order.deliveryDistanceKm;
    const eta =
      roadLegs.pickup?.durationMinutes ??
      roadLegs.drop?.durationMinutes ??
      etaMins ??
      order.estimatedTime;
    return {
      ...order,
      pickupDistanceKm: pickupKm,
      tripDistanceKm: tripKm,
      estimatedTime: eta,
    };
  }, [order, roadLegs, distanceKm, etaMins]);

  const viewModel = useMemo(
    () =>
      buildFeedRequestViewModel(enrichedOrder, {
        expiresInSec: timeLeft,
        riderLocation,
      }),
    [enrichedOrder, timeLeft, riderLocation],
  );

  if (!order || !viewModel) return null;

  const deliveryAddress = order?.deliveryAddress || {};
  const note = order?.note || order?.deliveryInstructions || "";
  const items = Array.isArray(order?.items) ? order.items : [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[500] flex items-end justify-center bg-black/50 p-0 sm:p-4"
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        className={`flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.35)] sm:rounded-3xl ${
          isTaxi
            ? "rounded-t-[1.75rem] bg-white"
            : "rounded-t-3xl bg-slate-100"
        }`}
      >
        <div className="shrink-0 px-4 pt-2">
          <div className="flex justify-center pb-1">
            <button
              type="button"
              onClick={onMinimize}
              className="flex flex-col items-center rounded-full p-1.5 active:bg-neutral-100"
              aria-label="Minimize offer"
            >
              <span
                className={`mb-0.5 h-1 w-10 rounded-full ${
                  isTaxi ? "bg-[#FF6A00]/30" : "bg-slate-300"
                }`}
              />
              <ChevronDown className="h-4 w-4 text-neutral-400" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 pb-3">
            <div className="min-w-0">
              <p
                className={`text-[11px] font-bold uppercase tracking-[0.12em] ${
                  isTaxi ? "text-[#FF6A00]" : "text-slate-500"
                }`}
              >
                {isTaxi ? "New ride request" : "New request"}
              </p>
              <p className="mt-0.5 truncate text-base font-bold tracking-tight text-neutral-950">
                {isTaxi ? "Accept before it expires" : "Review & respond"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <CountdownRing seconds={Math.max(0, timeLeft)} />
              <button
                type="button"
                onClick={onMinimize}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 active:scale-95"
                aria-label="Minimize"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-2">
          {isTaxi ? (
            <TaxiOfferBody viewModel={viewModel} />
          ) : (
            <>
              <RequestCard
                viewModel={viewModel}
                order={enrichedOrder}
                highlighted
                expanded={showDetails}
                onViewDetails={() => setShowDetails((v) => !v)}
              />
              {showDetails ? (
                <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-white px-3.5 py-3">
                  {note ? (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Instructions
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-700">
                        {note}
                      </p>
                    </div>
                  ) : null}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Drop address
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-700">
                      {formatDeliveryAddressText(
                        deliveryAddress,
                        order.customerAddress || order.customer_address || "",
                      ) || viewModel.drop.address}
                    </p>
                  </div>
                  {items.length > 0 ? (
                    <div>
                      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Items ({items.length})
                      </p>
                      <ul className="space-y-1">
                        {items.slice(0, 6).map((item, idx) => (
                          <li
                            key={idx}
                            className="text-xs font-semibold text-slate-800"
                          >
                            {Number(item.quantity || 1)} × {item.name || "Item"}
                          </li>
                        ))}
                        {items.length > 6 ? (
                          <li className="text-[11px] font-medium text-slate-400">
                            +{items.length - 6} more
                          </li>
                        ) : null}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>

        <div
          className={`shrink-0 space-y-2.5 border-t px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 ${
            isTaxi
              ? "border-black/[0.05] bg-white"
              : "border-slate-200 bg-white"
          }`}
        >
          <ActionSlider
            label={isTaxi ? "Slide to accept ride" : "Slide to Accept"}
            onConfirm={() => onAccept(order)}
            color="bg-[#FF6A00]"
            successLabel={isTaxi ? "Ride accepted ✓" : "Accepted ✓"}
            timeProgress={(timeLeft / OFFER_SECONDS) * 100}
          />
          <button
            type="button"
            onClick={onReject}
            className="h-11 w-full rounded-xl text-xs font-bold uppercase tracking-wide text-neutral-500 transition active:scale-[0.98] active:bg-neutral-50"
          >
            Decline
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
