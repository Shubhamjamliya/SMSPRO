import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Package, Search } from "lucide-react";
import Screen from "../components/Screen";
import MapPreview from "../components/MapPreview";
import { useBooking } from "../context/BookingContext";
import {
  getPorterPartnerAssignedPath,
  getPorterFareEstimatePath,
  getPorterHomePath,
} from "../utils/routes";
import { porterUserApi } from "../services/api";

const ASSIGNED_STATUSES = new Set([
  "assigned",
  "en_route_pickup",
  "at_pickup",
  "in_transit",
  "at_drop",
  "completed",
]);

const CANCELLED_STATUSES = new Set([
  "cancelled_by_system",
  "cancelled_by_user",
  "cancelled_by_driver",
]);

function mapPartnerFromTrip(trip) {
  const d = trip?.driver;
  if (!d?.id && !trip?.dispatch?.deliveryPartnerId) return null;
  return {
    id: d?.id || trip.dispatch.deliveryPartnerId,
    name: d?.name || "Delivery partner",
    phone: d?.phone || "",
    rating: d?.rating || 4.8,
    trips: d?.completedOrders || 0,
    vehicle: d?.vehicleType || d?.vehicleModel || trip?.vehicle?.name || "Vehicle",
    vehicleNumber: d?.vehicleNumber || "—",
    pickupOtp: trip?.deliveryOtp || "",
    photo: d?.photo || "",
    lastLat: d?.lastLat ?? trip?.lastDriverLocation?.lat ?? null,
    lastLng: d?.lastLng ?? trip?.lastDriverLocation?.lng ?? null,
  };
}

export default function FindingPartner() {
  const navigate = useNavigate();
  const { activeShipment, setActiveShipment, vehicle, resetBooking } = useBooking();
  const [error, setError] = useState(null);
  const [cancelledMsg, setCancelledMsg] = useState(null);
  const storedTripId = (() => {
    try {
      return sessionStorage.getItem("porter_active_trip_id") || null;
    } catch {
      return null;
    }
  })();
  const tripId = activeShipment?.id || activeShipment?.trip?.id || storedTripId;

  useEffect(() => {
    if (!tripId) {
      setError("No active booking found");
      return undefined;
    }

    let cancelled = false;
    let timer = null;

    const applyTrip = (trip) => {
      if (!trip || cancelled) return "continue";

      if (CANCELLED_STATUSES.has(trip.status)) {
        const reason =
          trip.cancelReason
          || "No delivery partner accepted your request. Booking cancelled.";
        setCancelledMsg(reason);
        setActiveShipment((prev) => ({
          ...(prev || {}),
          id: trip.id || prev?.id,
          status: trip.status,
          trip,
        }));
        try {
          sessionStorage.removeItem("porter_active_trip_id");
        } catch {
          /* ignore */
        }
        return "cancelled";
      }

      const partner = mapPartnerFromTrip(trip);
      const assigned =
        ASSIGNED_STATUSES.has(trip.status)
        || Boolean(trip?.dispatch?.deliveryPartnerId)
        || Boolean(partner);

      setActiveShipment((prev) => ({
        ...(prev || {}),
        id: trip.id || prev?.id,
        trackingId: trip.tripNumber || prev?.trackingId,
        status: trip.status,
        stage: assigned ? "to_pickup" : "searching",
        partner: partner || prev?.partner || null,
        total: trip.fareEstimateTotal ?? prev?.total,
        trip,
      }));

      if (assigned && partner) {
        navigate(getPorterPartnerAssignedPath(), { replace: true });
        return "assigned";
      }
      return "continue";
    };

    const tick = async () => {
      try {
        const trip = await porterUserApi.getTrip(tripId);
        if (cancelled) return;
        const result = applyTrip(trip);
        if (result !== "continue") return;
      } catch (err) {
        if (cancelled) return;
        const msg =
          err?.response?.data?.message || err?.message || "Failed to check booking status";
        setError(msg);
      }
      if (!cancelled) {
        timer = setTimeout(tick, 3000);
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [tripId, navigate, setActiveShipment]);

  if (!tripId) {
    return (
      <Screen title="Finding partner" bare>
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-6">
          <p className="text-center text-[14px] text-gray-500">
            {error || "Complete payment to start searching for a partner."}
          </p>
          <button
            type="button"
            className="mt-4 w-full max-w-xs rounded-xl bg-[#FF6A00] py-3 text-sm font-bold text-white"
            onClick={() => navigate(getPorterFareEstimatePath())}
          >
            Back to review
          </button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen title="Finding partner" subtitle="Matching you with a nearby delivery partner" bare>
      <div className="relative">
        <MapPreview height="calc(100vh - 120px)" showRoute animateCar rounded="rounded-none" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-white via-white/95 to-transparent px-4 pb-10 pt-16">
          {cancelledMsg ? (
            <>
              <h2 className="text-center text-[18px] font-extrabold text-gray-900">
                No partner found
              </h2>
              <p className="mt-2 text-center text-[13px] text-gray-500">{cancelledMsg}</p>
              <button
                type="button"
                className="mt-4 w-full rounded-xl bg-[#FF6A00] py-3 text-sm font-bold text-white"
                onClick={() => {
                  resetBooking?.();
                  navigate(getPorterHomePath(), { replace: true });
                }}
              >
                Book again
              </button>
            </>
          ) : error ? (
            <>
              <h2 className="text-center text-[18px] font-extrabold text-gray-900">
                Could not continue
              </h2>
              <p className="mt-2 text-center text-[13px] text-red-500">{error}</p>
              <button
                type="button"
                className="mt-4 w-full rounded-xl bg-[#FF6A00] py-3 text-sm font-bold text-white"
                onClick={() => navigate(getPorterHomePath())}
              >
                Back to home
              </button>
            </>
          ) : (
            <>
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#FFF1F1]"
              >
                <Search className="h-7 w-7 text-[#FF6A00]" />
              </motion.div>
              <h2 className="text-center text-[18px] font-extrabold text-gray-900">
                Searching for delivery partner
              </h2>
              <p className="mt-1 text-center text-[13px] text-gray-500">
                Finding the best partner for your{" "}
                {vehicle?.name || activeShipment?.vehicle || "delivery"} shipment
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-2 w-2 rounded-full bg-[#FF6A00]"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </div>
              <div className="mt-6 flex items-center justify-center gap-2 rounded-2xl bg-gray-50 p-3">
                <Package className="h-4 w-4 text-[#FF6A00]" />
                <span className="text-[12px] font-semibold text-gray-600">
                  Your parcel details are shared securely with the partner
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </Screen>
  );
}
