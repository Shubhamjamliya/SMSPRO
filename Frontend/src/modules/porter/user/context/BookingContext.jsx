import React, { createContext, useContext, useMemo, useState, useCallback, useEffect } from "react";
import { estimateDeliveryCost, getVehicleById } from "../utils/mock/vehicles";
import { computeDiscount } from "../utils/mock/coupons";
import { saveBookingDraft, loadBookingDraft, clearBookingDraft } from "@/shared/utils/bookingDraft";

const BookingContext = createContext(null);

/** Old mock used as "Current Location" — treat as unset if still in draft */
const LEGACY_FAKE_PICKUP = {
  address: "B-204, Green Residency, Sector 18, Noida",
  lat: 28.5355,
  lng: 77.391,
};

const DEFAULT_PARCEL = {
  parcelName: "",
  parcelDescription: "",
  weightKg: 0,
  quantity: 1,
  instructions: "",
  receiverName: "",
  receiverPhone: "",
  isScheduled: false,
  goodsTypeId: null,
  goodsTypeName: "",
};

const VALID_PAYMENT_IDS = new Set(["cash", "wallet", "upi"]);

function normalizePaymentMethodId(id) {
  if (VALID_PAYMENT_IDS.has(id)) return id;
  return "cash";
}

function isLegacyFakePickup(loc) {
  if (!loc) return false;
  const lat = Number(loc.lat ?? loc.latitude);
  const lng = Number(loc.lng ?? loc.longitude);
  const address = String(loc.address || "").trim();
  if (address.includes("Green Residency, Sector 18, Noida")) return true;
  if (
    Number.isFinite(lat)
    && Number.isFinite(lng)
    && Math.abs(lat - LEGACY_FAKE_PICKUP.lat) < 0.0001
    && Math.abs(lng - LEGACY_FAKE_PICKUP.lng) < 0.0001
  ) {
    return true;
  }
  return false;
}

function sanitizePickup(loc) {
  if (!loc || isLegacyFakePickup(loc)) return null;
  const lat = Number(loc.lat ?? loc.latitude);
  const lng = Number(loc.lng ?? loc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return loc;
}

export function PorterProvider({ children }) {
  const draft = loadBookingDraft("porter");
  const [pickup, setPickup] = useState(() => sanitizePickup(draft?.pickup));
  const [delivery, setDelivery] = useState(draft?.delivery || null);
  const [parcel, setParcel] = useState(draft?.parcel || DEFAULT_PARCEL);
  const [vehicleId, setVehicleId] = useState(draft?.vehicleId || "auto");
  const [coupon, setCoupon] = useState(draft?.coupon || null);
  const [paymentMethodId, setPaymentMethodId] = useState(
    normalizePaymentMethodId(draft?.paymentMethodId || "cash"),
  );
  const [scheduledAt, setScheduledAt] = useState(draft?.scheduledAt || null);
  const [activeShipment, setActiveShipment] = useState(null);
  const [apiQuote, setApiQuote] = useState(draft?.apiQuote || null);

  const distanceKm = useMemo(
    () => apiQuote?.distanceKm ?? delivery?.distanceKm ?? 8.2,
    [apiQuote, delivery],
  );
  const durationMin = useMemo(
    () => apiQuote?.durationMin ?? Math.max(10, Math.round(distanceKm * 3)),
    [apiQuote, distanceKm],
  );
  const baseFare = useMemo(() => {
    if (apiQuote?.fareEstimateTotal != null) return Number(apiQuote.fareEstimateTotal);
    if (apiQuote?.fare?.total != null) return Number(apiQuote.fare.total);
    return estimateDeliveryCost(vehicleId, distanceKm, durationMin);
  }, [apiQuote, vehicleId, distanceKm, durationMin]);
  const discount = useMemo(() => computeDiscount(coupon, baseFare), [coupon, baseFare]);
  const total = Math.max(0, baseFare - discount);
  const vehicle = apiQuote?.vehicle || getVehicleById(vehicleId);
  const updateParcel = useCallback((patch) => setParcel((p) => ({ ...p, ...patch })), []);

  useEffect(() => {
    saveBookingDraft("porter", {
      pickup,
      delivery,
      parcel,
      vehicleId,
      coupon,
      paymentMethodId: normalizePaymentMethodId(paymentMethodId),
      scheduledAt,
      apiQuote,
    });
  }, [pickup, delivery, parcel, vehicleId, coupon, paymentMethodId, scheduledAt, apiQuote]);

  const resetBooking = useCallback(() => {
    setPickup(null);
    setDelivery(null);
    setParcel(DEFAULT_PARCEL);
    setCoupon(null);
    setScheduledAt(null);
    setActiveShipment(null);
    setVehicleId("auto");
    setApiQuote(null);
    clearBookingDraft("porter");
  }, []);

  const value = useMemo(
    () => ({
      pickup, setPickup, delivery, setDelivery,
      parcel, setParcel, updateParcel, vehicleId, setVehicleId, vehicle,
      coupon, setCoupon, paymentMethodId, setPaymentMethodId,
      scheduledAt, setScheduledAt, activeShipment, setActiveShipment,
      distanceKm, durationMin, baseFare, discount, total, resetBooking,
      apiQuote, setApiQuote,
    }),
    [pickup, delivery, parcel, updateParcel, vehicleId, vehicle, coupon, paymentMethodId, scheduledAt, activeShipment, distanceKm, durationMin, baseFare, discount, total, resetBooking, apiQuote],
  );

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) {
    return {
      pickup: null, setPickup: () => {}, delivery: null, setDelivery: () => {},
      parcel: DEFAULT_PARCEL, setParcel: () => {}, updateParcel: () => {},
      vehicleId: "auto", setVehicleId: () => {}, vehicle: getVehicleById("auto"),
      coupon: null, setCoupon: () => {}, paymentMethodId: "wallet", setPaymentMethodId: () => {},
      scheduledAt: null, setScheduledAt: () => {}, activeShipment: null, setActiveShipment: () => {},
      distanceKm: 8.2, durationMin: 26, baseFare: estimateDeliveryCost("auto"), discount: 0,
      total: estimateDeliveryCost("auto"), resetBooking: () => {},
      apiQuote: null, setApiQuote: () => {},
    };
  }
  return ctx;
}

export default BookingContext;
