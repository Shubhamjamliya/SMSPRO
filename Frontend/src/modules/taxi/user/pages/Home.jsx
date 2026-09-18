import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { userAPI } from "@food/api";
import { useLocation as useAppLocation } from "@food/hooks/useLocation";
import { formatSavedAddress } from "@food/utils/imageUtils";
import { getOrderSocket } from "@core/services/orderSocket";
import TaxiBottomNav from "../components/layout/BottomNav";
import LocationSearchFullScreen from "../components/home/LocationSearchFullScreen";
import PickupMapCard from "../components/home/PickupMapCard";
import TaxiBookingSheet from "../components/home/TaxiBookingSheet";
import TaxiLiveTrackingMap from "../components/home/TaxiLiveTrackingMap";
import RouteCompleteHero from "../components/home/RouteCompleteHero";
import FloatingRideCard from "../components/home/FloatingRideCard";
import SavingsSection from "../components/home/SavingsSection";
import ExploreCity from "../components/home/ExploreCity";
import BrandBanner from "../components/home/BrandBanner";
import useTaxiVehicles from "../hooks/useTaxiVehicles";
import useModuleBackHandler from "@/modules/common/hooks/useModuleBackHandler";
import { getTaxiWalletPath, getTaxiRidesPath } from "../utils/routes";
import {
  isTaxiUserLoggedIn,
  redirectToTaxiLogin,
} from "../utils/authUser";
import { initRazorpayPayment } from "@food/utils/razorpay";
import { taxiUserApi } from "../../services/api";
import {
  clearBookingDraft,
  saveBookingDraft,
} from "@/shared/utils/bookingDraft";
import {
  ACTIVE_RIDE_STATUSES,
  clearPersistedActiveRideId,
  etaMinutesFromMeters,
  haversineMeters,
  persistActiveRideId,
  phaseFromRideStatus,
  readPersistedActiveRideId,
} from "../utils/activeRide";


function driverLocFromRide(ride) {
  const fromRide = ride?.lastDriverLocation;
  const lat = Number(fromRide?.lat ?? ride?.driver?.lastLat);
  const lng = Number(fromRide?.lng ?? ride?.driver?.lastLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, heading: 0 };
}

export default function TaxiHome({ embedded = false }) {
  useModuleBackHandler(true);
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { location } = useAppLocation();
  const { vehicles, loading: vehiclesLoading } = useTaxiVehicles();

  const [destination, setDestination] = useState("");
  const [destinationPlace, setDestinationPlace] = useState(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [pickupConfirmed, setPickupConfirmed] = useState(false);
  const [pickupOverride, setPickupOverride] = useState(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMinimized, setSheetMinimized] = useState(false);
  const [isSearchFullScreenOpen, setIsSearchFullScreenOpen] = useState(false);
  const [sheetPhase, setSheetPhase] = useState("vehicles"); // vehicles | confirm | finding | driver | trip | payment
  const [quotesByVehicle, setQuotesByVehicle] = useState({});
  const [quotesLoading, setQuotesLoading] = useState(false);
  /** Display + book payload: road km for current pickup→drop */
  const [routeDistanceKm, setRouteDistanceKm] = useState(null);
  const cachedRouteRef = useRef(null);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [booking, setBooking] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [activeRide, setActiveRide] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [liveMetrics, setLiveMetrics] = useState({ distanceMeters: null, etaMinutes: null });
  const [hydrating, setHydrating] = useState(true);
  const lastRoadMetricsAtRef = useRef(0);
  const pickupMapRef = useRef(null);
  const [mapPreview, setMapPreview] = useState(null);
  const [mapTouched, setMapTouched] = useState(false);

  const locationTitle = useMemo(() => {
    if (pickupOverride?.address) {
      const first = String(pickupOverride.address).split(",")[0]?.trim();
      return first || "Pickup location";
    }
    const area = location?.area || location?.city;
    return area || "Current location";
  }, [location, pickupOverride]);

  const locationSubtitle = useMemo(() => {
    if (pickupOverride?.address || pickupOverride?.formattedAddress) {
      return pickupOverride.formattedAddress || pickupOverride.address;
    }
    const formatted = formatSavedAddress?.(location);
    if (formatted && String(formatted).trim()) return String(formatted);
    return location?.address || location?.formattedAddress || "Tap to change pickup location";
  }, [location, pickupOverride]);

  const cityName = location?.city || locationTitle || "";

  const pickupCoords = useMemo(() => {
    if (pickupOverride) {
      const lat = Number(pickupOverride.lat ?? pickupOverride.latitude);
      const lng = Number(pickupOverride.lng ?? pickupOverride.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
    const lat = Number(location?.latitude ?? location?.lat);
    const lng = Number(location?.longitude ?? location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }, [location, pickupOverride]);

  const dropReady = useMemo(() => {
    const lat = Number(destinationPlace?.lat);
    const lng = Number(destinationPlace?.lng);
    return Boolean(destinationPlace?.address) && Number.isFinite(lat) && Number.isFinite(lng);
  }, [destinationPlace]);

  // Both stops are entered on this screen, so a route is ready as soon as we
  // have pickup coordinates (current location, a picked suggestion, or a map
  // adjustment) plus a resolved drop.
  const routeReady = Boolean(pickupCoords) && dropReady;

  const pickupPayload = useMemo(() => {
    if (!pickupCoords) return null;
    return {
      address: locationSubtitle || locationTitle || "Pickup",
      lat: pickupCoords.lat,
      lng: pickupCoords.lng,
    };
  }, [pickupCoords, locationSubtitle, locationTitle]);

  const dropPayload = useMemo(() => {
    if (!dropReady) return null;
    return {
      address: destinationPlace.address || destination.trim(),
      lat: Number(destinationPlace.lat),
      lng: Number(destinationPlace.lng),
    };
  }, [dropReady, destinationPlace, destination]);

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === selectedVehicleId) || null,
    [vehicles, selectedVehicleId],
  );

  const selectedQuote = selectedVehicleId
    ? quotesByVehicle[selectedVehicleId]
    : null;

  const isLiveRide =
    Boolean(activeRide?.id) &&
    ["finding", "driver", "trip", "payment"].includes(sheetPhase);

  const rideStatus = String(activeRide?.status || "").toLowerCase();

  // Any time the sheet is open and not minimized, we show the 40/60 split map view
  const showVehicleSelectionMap = sheetOpen && !sheetMinimized;

  // If the sheet is minimized, we fall back to the main search screen with an overlay
  const showSheetOverlay = sheetOpen && sheetMinimized;

  const applyRide = useCallback((ride) => {
    if (!ride?.id) return;
    setActiveRide(ride);
    persistActiveRideId(ride.id);

    const nextPhase = phaseFromRideStatus(ride.status);
    if (nextPhase) {
      setSheetPhase(nextPhase);
      setSheetOpen(true);
    }

    const loc = driverLocFromRide(ride);
    if (loc) setDriverLocation((prev) => prev || loc);

    // Seed pickup/drop so UI labels stay correct after refresh
    if (ride.pickup?.address) {
      setPickupOverride({
        lat: Number(ride.pickup.lat),
        lng: Number(ride.pickup.lng),
        latitude: Number(ride.pickup.lat),
        longitude: Number(ride.pickup.lng),
        address: ride.pickup.address,
        formattedAddress: ride.pickup.address,
      });
      setPickupConfirmed(true);
    }
    if (ride.drop?.address) {
      setDestination(ride.drop.address);
      setDestinationPlace({
        address: ride.drop.address,
        lat: Number(ride.drop.lat),
        lng: Number(ride.drop.lng),
      });
    }
  }, []);

  const clearRideUi = useCallback(() => {
    setActiveRide(null);
    setDriverLocation(null);
    setLiveMetrics({ distanceMeters: null, etaMinutes: null });
    setSheetMinimized(false);
    setAppliedCoupon(null);
    clearPersistedActiveRideId();
  }, []);

  const resetOrderFlow = useCallback(() => {
    setSheetOpen(false);
    setSheetPhase("vehicles");
    setDestination("");
    setDestinationPlace(null);
    setSelectedVehicleId(null);
    setPickupConfirmed(false);
    setAppliedCoupon(null);
    cachedRouteRef.current = null;
    setRouteDistanceKm(null);
    setQuotesByVehicle({});
    clearBookingDraft("taxi");
    clearRideUi();
  }, [clearRideUi]);

  // Pre-book back: local UI only (no ride exists in DB yet).
  // After Book (finding / driver / trip / payment): minimize — keep DB ride
  // so the rider can reopen "finding drivers" / live tracking anytime.
  const handleSheetBack = useCallback(() => {
    if (
      activeRide?.id &&
      ["finding", "driver", "trip", "payment"].includes(sheetPhase)
    ) {
      setSheetMinimized(true);
      return;
    }
    // vehicles | confirm — never create/cancel a DB ride
    resetOrderFlow();
  }, [sheetPhase, activeRide?.id, resetOrderFlow]);

  // Hardware back button support
  useEffect(() => {
    const handlePopState = () => {
      if (sheetOpen && !sheetMinimized) {
        handleSheetBack();
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [sheetOpen, sheetMinimized, handleSheetBack]);

  useEffect(() => {
    if (sheetOpen && !sheetMinimized) {
      window.history.pushState({ popup: "taxiSheet" }, "");
    }
  }, [sheetOpen, sheetMinimized]);

  // Hide Food/Taxi floating chrome while booking / searching drop
  useEffect(() => {
    const chrome = document.getElementById("taxi-floating-chrome");
    const hideChrome = isSearchFullScreenOpen || showVehicleSelectionMap;

    if (chrome) {
      chrome.style.display = hideChrome ? "none" : "";
      chrome.style.visibility = hideChrome ? "hidden" : "";
      chrome.style.pointerEvents = hideChrome ? "none" : "";
    }

    return () => {
      if (chrome) {
        chrome.style.display = "";
        chrome.style.visibility = "";
        chrome.style.pointerEvents = "";
      }
    };
  }, [sheetOpen, activeRide, isSearchFullScreenOpen, showVehicleSelectionMap]);

  // Hydrate active ride after refresh
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isTaxiUserLoggedIn()) {
        setHydrating(false);
        return;
      }
      try {
        let ride = null;
        try {
          ride = await taxiUserApi.getActiveRide();
        } catch {
          ride = null;
        }
        if (!ride?.id) {
          const cachedId = readPersistedActiveRideId();
          if (cachedId) {
            try {
              ride = await taxiUserApi.getRide(cachedId);
              if (!ACTIVE_RIDE_STATUSES.has(ride?.status)) ride = null;
            } catch {
              ride = null;
            }
          }
        }
        if (!cancelled && ride?.id) {
          clearBookingDraft("taxi");
          applyRide(ride);
        } else if (!cancelled) {
          clearPersistedActiveRideId();
        }
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyRide]);

  useEffect(() => {
    if (destination || selectedVehicleId || destinationPlace || pickupCoords) {
      saveBookingDraft("taxi", {
        destination,
        destinationPlace,
        selectedVehicleId,
        pickupCoords,
        pickupConfirmed,
      });
    }
  }, [destination, destinationPlace, selectedVehicleId, pickupCoords, pickupConfirmed]);

  // Invalidate road-distance cache when pickup or drop coordinates change
  useEffect(() => {
    if (!pickupPayload || !dropPayload) {
      cachedRouteRef.current = null;
      setRouteDistanceKm(null);
      return;
    }
    const key = buildRouteCacheKey(pickupPayload, dropPayload);
    if (cachedRouteRef.current?.key !== key) {
      cachedRouteRef.current = null;
      setRouteDistanceKm(null);
    }
  }, [
    pickupPayload?.lat,
    pickupPayload?.lng,
    dropPayload?.lat,
    dropPayload?.lng,
  ]);

  const loadQuotes = useCallback(async () => {
    if (!routeReady || !pickupPayload || !dropPayload || !vehicles.length) {
      setQuotesByVehicle({});
      return false;
    }

    const routeKey = buildRouteCacheKey(pickupPayload, dropPayload);
    let routeHint =
      cachedRouteRef.current?.key === routeKey &&
      Number(cachedRouteRef.current.distanceKm) > 0
        ? cachedRouteRef.current
        : null;

    setQuotesLoading(true);
    try {
      const quoteVehicle = async (vehicle, hint) => {
        try {
          const quote = await taxiUserApi.quote({
            pickup: pickupPayload,
            drop: dropPayload,
            vehicleTypeId: vehicle.id,
            ...(hint?.distanceKm
              ? {
                  distanceKm: hint.distanceKm,
                  durationMin: hint.durationMin,
                }
              : {}),
          });
          return {
            ok: true,
            fare: Number(quote?.fareEstimateTotal ?? quote?.fare?.total ?? 0),
            distanceKm: Number(quote?.distanceKm || 0),
            durationMin: Number(quote?.durationMin || 0),
            quote,
          };
        } catch (err) {
          const msg = err?.response?.data?.message || err?.message || "Unavailable";
          if (msg === "Location is out of service zone") throw err;
          return { ok: false, message: msg };
        }
      };

      const byId = {};

      // Seed road-distance cache from first successful quote, then reuse for the rest
      if (!routeHint) {
        for (const vehicle of vehicles) {
          const result = await quoteVehicle(vehicle, null);
          byId[vehicle.id] = result;
          if (result.ok && Number(result.distanceKm) > 0) {
            routeHint = {
              key: routeKey,
              distanceKm: result.distanceKm,
              durationMin: result.durationMin,
            };
            break;
          }
        }
      }

      const pending = vehicles.filter((v) => !byId[v.id]);
      if (pending.length) {
        const rest = await Promise.all(
          pending.map(async (vehicle) => [vehicle.id, await quoteVehicle(vehicle, routeHint)]),
        );
        rest.forEach(([id, result]) => {
          byId[id] = result;
        });
      }

      if (routeHint?.distanceKm > 0) {
        cachedRouteRef.current = routeHint;
        setRouteDistanceKm(routeHint.distanceKm);
      } else {
        const anyOk = Object.values(byId).find((q) => q?.ok && Number(q.distanceKm) > 0);
        if (anyOk) {
          const next = {
            key: routeKey,
            distanceKm: anyOk.distanceKm,
            durationMin: anyOk.durationMin,
          };
          cachedRouteRef.current = next;
          setRouteDistanceKm(next.distanceKm);
        }
      }

      setQuotesByVehicle(byId);
      return true;
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message;
      if (msg === "Location is out of service zone") {
        toast.error("Location is out of service zone");
        setSheetOpen(false);
        setDestination("");
        setDestinationPlace(null);
        setQuotesByVehicle({});
        cachedRouteRef.current = null;
        setRouteDistanceKm(null);
        return false;
      }
      setQuotesByVehicle({});
      return true;
    } finally {
      setQuotesLoading(false);
    }
  }, [routeReady, pickupPayload, dropPayload, vehicles]);

  // Open vehicle sheet as soon as pickup + drop are both ready
  useEffect(() => {
    if (hydrating || isLiveRide) return;
    if (!routeReady) {
      if (sheetPhase === "vehicles" || sheetPhase === "confirm") {
        setSheetOpen(false);
        setSelectedVehicleId(null);
      }
      return;
    }
    if (
      sheetPhase === "finding" ||
      sheetPhase === "driver" ||
      sheetPhase === "trip" ||
      sheetPhase === "payment"
    ) {
      return;
    }

    const initBooking = async () => {
      setSelectedVehicleId(null);
      const success = await loadQuotes();
      if (success) {
        setSheetPhase("vehicles");
        setSheetOpen(true);
        setSheetMinimized(false);
      }
    };
    initBooking();
  }, [routeReady, hydrating, isLiveRide, vehicles.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll active ride
  useEffect(() => {
    if (!activeRide?.id) return undefined;
    if (!["finding", "driver", "trip", "payment"].includes(sheetPhase)) return undefined;

    let cancelled = false;
    const poll = async () => {
      try {
        const ride =
          sheetPhase === "payment"
            ? await taxiUserApi.getPaymentStatus(activeRide.id)
            : await taxiUserApi.getRide(activeRide.id);
        if (cancelled || !ride) return;
        setActiveRide(ride);
        persistActiveRideId(ride.id);

        const loc = driverLocFromRide(ride);
        if (loc) {
          setDriverLocation((prev) => ({
            ...loc,
            heading: prev?.heading || 0,
          }));
        }

        const nextPhase = phaseFromRideStatus(ride.status);
        if (nextPhase) {
          if (nextPhase !== sheetPhase) {
            lastRoadMetricsAtRef.current = 0;
            setLiveMetrics({ distanceMeters: null, etaMinutes: null });
          }
          setSheetPhase(nextPhase);
          setSheetOpen(true);
          if (nextPhase === "payment") setSheetMinimized(false);
        } else if (
          ["cancelled_by_rider", "cancelled_by_driver", "cancelled_by_system", "no_show", "completed"].includes(
            ride.status,
          )
        ) {
          resetOrderFlow();
          if (ride.status === "completed") {
            toast.success("Trip completed");
            navigate(getTaxiRidesPath());
          } else {
            toast.message("Ride cancelled");
          }
        }
      } catch {
        /* ignore transient poll errors */
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeRide?.id, sheetPhase, navigate, clearRideUi]);

  // Live socket location for rider
  useEffect(() => {
    if (!activeRide?.id || !isTaxiUserLoggedIn()) return undefined;
    const token =
      localStorage.getItem("user_accessToken") ||
      localStorage.getItem("accessToken") ||
      "";
    const socket = getOrderSocket(() => token);
    if (!socket) return undefined;

    const ids = [activeRide.id, activeRide.rideNumber].filter(Boolean).map(String);

    const join = () => {
      ids.forEach((id) => {
        socket.emit("join-tracking", id);
        socket.emit("join_order", id);
      });
    };
    if (socket.connected) join();
    socket.on("connect", join);

    const onLoc = (data) => {
      if (!data) return;
      const match =
        ids.includes(String(data.orderId || "")) ||
        ids.includes(String(data.rideId || "")) ||
        String(data.rideNumber || "") === String(activeRide.rideNumber || "");
      if (!match) return;
      const lat = Number(data.lat ?? data.boy_lat);
      const lng = Number(data.lng ?? data.boy_lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      setDriverLocation({
        lat,
        lng,
        heading: Number(data.heading || 0),
      });
      if (data.etaMinutes != null || data.eta != null) {
        setLiveMetrics((m) => ({
          ...m,
          etaMinutes: Math.max(1, Math.round(Number(data.etaMinutes ?? data.eta))),
        }));
      }
      if (data.roadDistanceKm != null) {
        setLiveMetrics((m) => ({
          ...m,
          distanceMeters: Number(data.roadDistanceKm) * 1000,
        }));
      }
    };

    const refreshRide = () => {
      taxiUserApi
        .getRide(activeRide.id)
        .then((ride) => {
          if (!ride) return;
          applyRide(ride);
          if (ride.status === "awaiting_payment") {
            setSheetMinimized(false);
            setSheetOpen(true);
          }
        })
        .catch(() => {});
    };

    const onStatus = (payload) => {
      if (String(payload?.rideId || "") !== String(activeRide.id)) return;
      refreshRide();
    };

    const onPayment = (payload) => {
      if (String(payload?.rideId || "") !== String(activeRide.id)) return;
      if (payload?.payment || payload?.fare) {
        setActiveRide((prev) =>
          prev
            ? {
                ...prev,
                ...(payload.status ? { status: payload.status } : {}),
                ...(payload.fare ? { fare: payload.fare } : {}),
                ...(payload.fareBreakdown ? { fareBreakdown: payload.fareBreakdown } : {}),
                ...(payload.coupon ? { coupon: payload.coupon } : {}),
                ...(payload.waitingMin != null ? { waitingMin: payload.waitingMin } : {}),
                ...(payload.payment ? { payment: { ...prev.payment, ...payload.payment } } : {}),
              }
            : prev,
        );
        if (payload.status === "awaiting_payment" || payload.payment) {
          setSheetPhase("payment");
          setSheetMinimized(false);
          setSheetOpen(true);
        }
      }
      refreshRide();
    };

    socket.on("location-update", onLoc);
    socket.on("ride_location_update", onLoc);
    socket.on("ride_status_update", onStatus);
    socket.on("ride_payment_update", onPayment);

    return () => {
      socket.off("connect", join);
      socket.off("location-update", onLoc);
      socket.off("ride_location_update", onLoc);
      socket.off("ride_status_update", onStatus);
      socket.off("ride_payment_update", onPayment);
      ids.forEach((id) => {
        socket.emit("leave-tracking", id);
        socket.emit("leave_order", id);
      });
    };
  }, [activeRide?.id, activeRide?.rideNumber, applyRide]);

  // Fallback haversine when Google Directions hasn't reported recently
  useEffect(() => {
    if (!driverLocation || !activeRide) return;
    if (Date.now() - lastRoadMetricsAtRef.current < 12000) return;
    const target =
      String(activeRide.status).toLowerCase() === "in_progress"
        ? activeRide.drop
        : activeRide.pickup;
    const meters = haversineMeters(driverLocation, target);
    if (meters == null) return;
    setLiveMetrics({
      distanceMeters: meters,
      etaMinutes: etaMinutesFromMeters(meters),
    });
  }, [driverLocation, activeRide?.status, activeRide?.pickup, activeRide?.drop]);

  const ensureLoggedInForBooking = () => {
    if (isTaxiUserLoggedIn()) return true;
    toast.message("Login required", {
      description: "Please sign in to book a taxi ride.",
    });
    redirectToTaxiLogin(navigate, routerLocation);
    return false;
  };

  useEffect(() => {
    if (sheetOpen && sheetPhase === "vehicles" && !selectedVehicleId && vehicles?.length && quotesByVehicle) {
      let lowestVehicle = null;
      let minFare = Infinity;

      vehicles.forEach((v) => {
        const quote = quotesByVehicle[v.id];
        if (quote?.ok && quote.fare < minFare) {
          minFare = quote.fare;
          lowestVehicle = v;
        }
      });

      if (lowestVehicle) {
        setSelectedVehicleId(lowestVehicle.id);
      }
    }
  }, [sheetOpen, sheetPhase, selectedVehicleId, vehicles, quotesByVehicle]);

  const handleSelectVehicle = (vehicle) => {
    setSelectedVehicleId(vehicle.id);
    setAppliedCoupon(null);
  };

  const handleApplyCoupon = (preview) => {
    if (!preview?.code) return;
    setAppliedCoupon(preview);
  };

  const handleClearCoupon = () => {
    setAppliedCoupon(null);
  };

  const handleConfirmBook = async () => {
    if (!ensureLoggedInForBooking()) return;
    if (!selectedVehicleId || !selectedQuote?.ok) {
      toast.message("Choose a vehicle with pricing");
      return;
    }

    try {
      setBooking(true);
      const ride = await taxiUserApi.createRide({
        pickup: pickupPayload,
        drop: dropPayload,
        vehicleTypeId: selectedVehicleId,
        paymentMethod: "cash",
        couponCode: appliedCoupon?.code || undefined,
        ...(cachedRouteRef.current?.distanceKm
          ? {
              distanceKm: cachedRouteRef.current.distanceKm,
              durationMin: cachedRouteRef.current.durationMin,
            }
          : selectedQuote?.distanceKm
            ? {
                distanceKm: selectedQuote.distanceKm,
                durationMin: selectedQuote.durationMin,
              }
            : {}),
      });
      // DB ride exists only from this point — refresh can resume via /taxi/rides/active
      clearBookingDraft("taxi");
      applyRide(ride);
      setAppliedCoupon(null);
      setSheetPhase("finding");
      setSheetOpen(true);
      setSheetMinimized(false);
      toast.success(`Ride ${ride?.rideNumber || ""} requested`);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Booking failed";
      // If an active ride already exists (e.g. refresh mid-book), resume it
      if (String(msg).toLowerCase().includes("already have an active ride")) {
        try {
          const existing = await taxiUserApi.getActiveRide();
          if (existing?.id) {
            clearBookingDraft("taxi");
            applyRide(existing);
            toast.message("Continuing your active ride");
            return;
          }
        } catch {
          /* fall through */
        }
      }
      toast.error(msg);
    } finally {
      setBooking(false);
    }
  };

  const handleCancelRide = useCallback(async () => {
    if (!activeRide?.id) {
      resetOrderFlow();
      return;
    }
    try {
      await taxiUserApi.cancelRide(activeRide.id, { reason: "Cancelled by rider" });
      toast.success("Ride cancelled");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not cancel ride");
    } finally {
      resetOrderFlow();
    }
  }, [activeRide?.id, resetOrderFlow]);

  const handlePayWallet = async () => {
    if (!activeRide?.id || paymentBusy) return;
    try {
      setPaymentBusy(true);
      const ride = await taxiUserApi.payWithWallet(activeRide.id);
      applyRide(ride);
      toast.success("Paid with wallet");
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Wallet payment failed");
    } finally {
      setPaymentBusy(false);
    }
  };

  const handlePayRazorpay = async () => {
    if (!activeRide?.id || paymentBusy) return;
    try {
      setPaymentBusy(true);
      const data = await taxiUserApi.createRazorpayOrder(activeRide.id);
      const razorpay = data?.razorpay || data;
      const key = razorpay?.keyId || razorpay?.key;
      const orderId = razorpay?.orderId || razorpay?.order_id;
      const amount = razorpay?.amount;
      if (!key || !orderId || amount == null) {
        throw new Error("Invalid Razorpay order response");
      }

      let prefill = {};
      try {
        const userResponse = await userAPI.getProfile();
        const userInfo =
          userResponse?.data?.data?.user || userResponse?.data?.user || {};
        prefill = {
          name: userInfo.name || "",
          email: userInfo.email || "",
          contact: String(userInfo.phone || "").replace(/\D/g, "").slice(-10),
        };
      } catch {
        /* optional prefill */
      }

      await initRazorpayPayment({
        key,
        amount,
        currency: razorpay.currency || "INR",
        order_id: orderId,
        name: "Just Order Taxi",
        description: `Taxi fare · ${activeRide.rideNumber || ""}`,
        prefill,
        notes: { type: "taxi_ride", rideId: String(activeRide.id) },
        handler: async (response) => {
          try {
            const ride = await taxiUserApi.verifyRazorpayPayment(activeRide.id, {
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            applyRide(ride);
            toast.success("Payment successful");
          } catch (error) {
            toast.error(
              error?.response?.data?.message || "Payment verification failed",
            );
          } finally {
            setPaymentBusy(false);
          }
        },
        onError: (error) => {
          toast.error(error?.description || "Payment failed");
          setPaymentBusy(false);
        },
        onClose: () => {
          setPaymentBusy(false);
        },
      });
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Could not start payment");
      setPaymentBusy(false);
    }
  };

  const handleMapMetrics = useCallback((metrics) => {
    if (!metrics) return;
    lastRoadMetricsAtRef.current = Date.now();
    setLiveMetrics({
      distanceMeters: metrics.distanceMeters ?? null,
      etaMinutes:
        metrics.durationSec != null
          ? Math.max(1, Math.ceil(Number(metrics.durationSec) / 60))
          : null,
    });
  }, []);

  const openDestinationSearch = () => {
    if (isLiveRide) {
      toast.message("Finish your current ride first");
      return;
    }
    setIsSearchFullScreenOpen(true);
  };

  const handleExplorePlace = (place) => {
    if (isLiveRide) {
      toast.message("Finish your current ride first");
      return;
    }
    setDestination(place.name);
    setDestinationPlace(null);
    toast.message(`Searching near ${place.name}`, {
      description: "Pick a matching suggestion for exact drop.",
    });
    setIsSearchFullScreenOpen(true);
  };

  const handlePickupChange = (payload) => {
    if (isLiveRide) {
      toast.message("Finish your current ride first");
      return;
    }
    if (!payload) return;
    const lat = Number(payload.lat ?? payload.latitude);
    const lng = Number(payload.lng ?? payload.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setPickupOverride({
      lat,
      lng,
      latitude: lat,
      longitude: lng,
      address: payload.address || payload.formattedAddress || "",
      formattedAddress: payload.formattedAddress || payload.address || "",
    });
    setPickupConfirmed(true);
    setMapTouched(false);
    toast.success("Pickup confirmed");
  };

  const handlePickupConfirm = (payload) => {
    if (isLiveRide) {
      toast.message("Finish your current ride first");
      return;
    }
    if (payload) return;
    if (!pickupCoords) {
      toast.message("Set pickup on the map first");
      return;
    }
    setPickupConfirmed(true);
    toast.success("Pickup location confirmed");
  };

  const triggerMapConfirm = () => {
    if (isLiveRide) {
      toast.message("Finish your current ride first");
      return;
    }
    if (pickupMapRef.current?.confirmPickup) {
      pickupMapRef.current.confirmPickup();
      return;
    }
    handlePickupConfirm(null);
  };

  const handleSelectDropPlace = (payload) => {
    if (isLiveRide) {
      toast.message("Finish your current ride first");
      return;
    }
    if (!payload) return;
    const lat = Number(payload.lat);
    const lng = Number(payload.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setDestination(payload.address || payload.formattedAddress || "");
    setDestinationPlace({
      address: payload.address || payload.formattedAddress || "",
      lat,
      lng,
    });
  };

  const handleClearDrop = () => {
    setDestinationPlace(null);
  };

  const handleSelectPickupPlace = (payload) => {
    if (isLiveRide) {
      toast.message("Finish your current ride first");
      return;
    }
    if (!payload) return;
    pickupMapRef.current?.setPickupAt?.(payload, payload.address || payload.formattedAddress);
    handlePickupChange(payload);
  };

  const reopenActiveRide = useCallback(() => {
    setSheetOpen(true);
    setSheetMinimized(false);
  }, []);

  const openRidesSheet = () => {
    setSheetPhase("vehicles");
    setAppliedCoupon(null);
    setSheetOpen(true);
    loadQuotes();
  };

  const livePickupLabel = (() => {
    // Always prefer live center-pin preview while adjusting (even after a prior confirm)
    if (!isLiveRide && mapPreview) {
      return (
        mapPreview.address ||
        mapPreview.formattedAddress ||
        "Updating location…"
      );
    }
    return locationSubtitle || locationTitle || "";
  })();

  const canConfirmFromMap = Boolean(
    (mapPreview && Number.isFinite(Number(mapPreview.lat))) || pickupCoords,
  );

  // Only surface "use map location as pickup" after the rider has actually
  // touched the map — it publishes a preview on first load too, which would
  // otherwise show the button on a screen nobody has interacted with.
  const mapMovedFromPickup = useMemo(() => {
    if (!mapTouched) return false;
    const lat = Number(mapPreview?.lat);
    const lng = Number(mapPreview?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (!pickupCoords) return true;
    return (
      Math.abs(lat - pickupCoords.lat) > 0.00015 ||
      Math.abs(lng - pickupCoords.lng) > 0.00015
    );
  }, [mapTouched, mapPreview, pickupCoords]);

  return (
    <div
      className={
        showVehicleSelectionMap
          ? "min-h-screen bg-slate-100 text-slate-900"
          : `relative min-h-screen overflow-x-hidden bg-[#F3F4F6] text-slate-900 ${
              embedded ? "pb-24" : "pb-28"
            }`
      }
    >
      {showVehicleSelectionMap ? (
        <div className="fixed inset-0 z-[100] flex h-[100dvh] w-full flex-col overflow-hidden bg-white">
          {/* Top — map for live booking, static route art on payment */}
          <div
            className={`relative w-full shrink-0 overflow-hidden ${
              sheetPhase === "payment"
                ? "h-[42%] min-h-[200px] border-b border-[#FFE8D6] bg-[#FFFBF7]"
                : "h-[48%] min-h-[220px] bg-neutral-100"
            }`}
          >
            {sheetPhase === "payment" ? (
              <RouteCompleteHero
                className="h-full w-full"
                pickupLabel={activeRide?.pickup?.address || pickupPayload?.address}
                dropLabel={activeRide?.drop?.address || dropPayload?.address}
                fareLabel={
                  Number.isFinite(
                    Number(
                      activeRide?.fare?.total ??
                        activeRide?.fareBreakdown?.total ??
                        activeRide?.fareEstimateTotal ??
                        selectedQuote?.fare,
                    ),
                  )
                    ? formatInrSafe(
                        activeRide?.fare?.total ??
                          activeRide?.fareBreakdown?.total ??
                          activeRide?.fareEstimateTotal ??
                          selectedQuote?.fare,
                      )
                    : ""
                }
              />
            ) : (
              <TaxiLiveTrackingMap
                ride={
                  activeRide || {
                    pickup: pickupPayload,
                    drop: dropPayload,
                    status: "pending",
                  }
                }
                driverLocation={driverLocation}
                onMetrics={handleMapMetrics}
                bottomPaddingRatio={0.12}
                controlsPlacement="bottom-right"
                className="h-full w-full"
                lockMapGestures={
                  sheetPhase === "vehicles" || sheetPhase === "confirm"
                }
                previewRoute={
                  sheetPhase === "vehicles" ||
                  sheetPhase === "confirm" ||
                  sheetPhase === "finding"
                }
              />
            )}
            <button
              type="button"
              onClick={() => {
                // Prefer history.back so popstate runs handleSheetBack once
                if (window.history.state?.popup === "taxiSheet") {
                  window.history.back();
                } else {
                  handleSheetBack();
                }
              }}
              className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-30 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white text-neutral-900 shadow-[0_8px_24px_rgba(15,23,42,0.14)] ring-1 ring-black/[0.04] outline-none transition hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-[#FF6A00]/35"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </button>
          </div>

          {/* Bottom — vehicle / booking details (fixed height; list scrolls inside) */}
          <div
            className="relative z-10 flex min-h-0 flex-1 flex-col border-t border-neutral-200 bg-white touch-pan-y"
            style={{ overscrollBehavior: "contain" }}
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            <TaxiBookingSheet
              open={true}
              inline
              phase={sheetPhase}
              minimized={sheetMinimized}
              onMinimize={() => setSheetMinimized(true)}
              onExpand={reopenActiveRide}
              onClose={() => {
                if (sheetPhase === "vehicles" || sheetPhase === "confirm") {
                  setSheetOpen(false);
                  setSheetPhase("vehicles");
                  setSelectedVehicleId(null);
                }
              }}
              onSelectVehicle={handleSelectVehicle}
              onConfirmBook={handleConfirmBook}
              onCancelRide={handleCancelRide}
              onPayWallet={handlePayWallet}
              onPayRazorpay={handlePayRazorpay}
              paymentBusy={paymentBusy}
              pickupLabel={activeRide?.pickup?.address || pickupPayload?.address}
              dropLabel={activeRide?.drop?.address || dropPayload?.address}
              vehicles={vehicles}
              quotesByVehicle={quotesByVehicle}
              quotesLoading={quotesLoading || vehiclesLoading}
              selectedVehicle={selectedVehicle}
              selectedQuote={selectedQuote}
              booking={booking}
              activeRide={activeRide}
              liveDistanceMeters={liveMetrics.distanceMeters}
              liveEtaMinutes={liveMetrics.etaMinutes}
              appliedCoupon={appliedCoupon}
              onApplyCoupon={handleApplyCoupon}
              onClearCoupon={handleClearCoupon}
              routeDistanceKm={routeDistanceKm}
            />
          </div>
        </div>
      ) : (
        <>
          {/* The location / wallet / notification bar was removed — pickup is set
              in the booking card below, and the module tabs now sit at the top. */}
          {/* Half-screen map — pin fixed at center, map pans underneath */}
          <section
            onPointerDown={() => {
              if (!isLiveRide) setMapTouched(true);
            }}
            className={`relative z-20 w-full ${
              embedded ? "h-[min(56vh,460px)]" : "h-[min(52vh,420px)]"
            }`}
          >
            <PickupMapCard
              ref={pickupMapRef}
              variant="immersive"
              showConfirmStrip={false}
              confirmed={pickupConfirmed}
              bottomInset={120}
              className="absolute inset-0"
              addressLabel={
                pickupConfirmed || pickupOverride
                  ? locationSubtitle
                  : "Move the map to set pickup"
              }
              initialLocation={pickupCoords}
              locked={isLiveRide}
              onPickupChange={handlePickupChange}
              onConfirm={handlePickupConfirm}
              onPreviewChange={setMapPreview}
            />
          </section>

          {/* Status card sits above map + main so search/confirm always receive clicks */}
          <div className="relative z-40 -mt-[5.5rem] px-3">
            <div className="mx-auto max-w-lg">
              <FloatingRideCard
                isLiveRide={isLiveRide}
                rideStatus={rideStatus}
                onOpenActiveRide={reopenActiveRide}
                locationTitle={locationTitle}
                locationSubtitle={livePickupLabel}
                onUseMapPickup={triggerMapConfirm}
                canUseMapPickup={canConfirmFromMap}
                mapMoved={mapMovedFromPickup}
                destination={destination}
                destinationPlace={destinationPlace}
                onDestinationChange={setDestination}
                onSelectDropPlace={handleSelectDropPlace}
                onClearDrop={handleClearDrop}
                routeReady={routeReady}
                onViewRides={openRidesSheet}
                onSelectPickupPlace={handleSelectPickupPlace}
                biasLocation={
                  mapPreview
                    ? { lat: mapPreview.lat, lng: mapPreview.lng }
                    : pickupCoords
                }
                locked={isLiveRide}
              />
            </div>
          </div>

          {/* Lower half — original browse content */}
          <main className="relative z-10 mx-auto max-w-lg space-y-5 px-4 pb-6 pt-5">
            {routeReady && !isLiveRide ? (
              <button
                type="button"
                onClick={openRidesSheet}
                className="flex h-12 w-full cursor-pointer items-center justify-center rounded-2xl bg-[#FF6A00] text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.28)] transition duration-200 hover:bg-[#E85F00]"
              >
                View available rides
              </button>
            ) : null}

            <section>
              <div className="mb-2.5 px-0.5">
                <h2 className="text-base font-semibold tracking-tight text-neutral-900">
                  Savings
                </h2>
              </div>
              <SavingsSection onOpenWallet={() => navigate(getTaxiWalletPath())} />
            </section>

            <ExploreCity city={cityName} onSelectPlace={handleExplorePlace} />

            <BrandBanner />
          </main>
        </>
      )}

      <TaxiBookingSheet
        open={showSheetOverlay}
        phase={sheetPhase}
        minimized={sheetMinimized}
        onMinimize={() => setSheetMinimized(true)}
        onExpand={reopenActiveRide}
        onClose={() => {
          if (sheetPhase === "vehicles" || sheetPhase === "confirm") {
            setSheetOpen(false);
            setSheetPhase("vehicles");
            setSelectedVehicleId(null);
          }
        }}
        onSelectVehicle={handleSelectVehicle}
        onConfirmBook={handleConfirmBook}
        onCancelRide={handleCancelRide}
        onPayWallet={handlePayWallet}
        onPayRazorpay={handlePayRazorpay}
        paymentBusy={paymentBusy}
        pickupLabel={activeRide?.pickup?.address || pickupPayload?.address}
        dropLabel={activeRide?.drop?.address || dropPayload?.address}
        vehicles={vehicles}
        quotesByVehicle={quotesByVehicle}
        quotesLoading={quotesLoading || vehiclesLoading}
        selectedVehicle={selectedVehicle}
        selectedQuote={selectedQuote}
        booking={booking}
        activeRide={activeRide}
        liveDistanceMeters={liveMetrics.distanceMeters}
        liveEtaMinutes={liveMetrics.etaMinutes}
        appliedCoupon={appliedCoupon}
        onApplyCoupon={handleApplyCoupon}
        onClearCoupon={handleClearCoupon}
        routeDistanceKm={routeDistanceKm}
      />

      <LocationSearchFullScreen
        isOpen={isSearchFullScreenOpen}
        onClose={() => setIsSearchFullScreenOpen(false)}
        initialPickup={pickupPayload?.address || ""}
        initialDrop={destination || ""}
        initialPickupLocation={pickupCoords}
        cityName={cityName}
        onConfirm={({ pickup, drop, resolvedDrop, resolvedPickup }) => {
          setIsSearchFullScreenOpen(false);
          if (drop) {
            setDestination(drop);
            if (resolvedDrop) {
              setDestinationPlace(resolvedDrop);
            }
          }
          if (resolvedPickup) {
            setPickupOverride(resolvedPickup);
            setPickupConfirmed(true);
          }
          
          if (drop && (resolvedDrop || destinationPlace) && pickup) {
            // Both are set! Open the sheet
            setPickupConfirmed(true);
            setSheetOpen(true);
            setSheetPhase("vehicles");
            setSheetMinimized(false);
          }
        }}
      />

      {!showVehicleSelectionMap && !isSearchFullScreenOpen ? (
        <TaxiBottomNav />
      ) : null}
    </div>
  );
}

function formatInrSafe(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `₹${Math.round(n)}`;
}

function buildRouteCacheKey(pickup, drop) {
  const pl = Number(pickup?.lat ?? pickup?.latitude);
  const pg = Number(pickup?.lng ?? pickup?.longitude);
  const dl = Number(drop?.lat ?? drop?.latitude);
  const dg = Number(drop?.lng ?? drop?.longitude);
  if (![pl, pg, dl, dg].every(Number.isFinite)) return "";
  return `${pl.toFixed(5)},${pg.toFixed(5)}|${dl.toFixed(5)},${dg.toFixed(5)}`;
}

function formatDistanceLabel(meters) {
  if (meters == null || !Number.isFinite(meters)) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
