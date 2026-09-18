import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Banknote,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Landmark,
  PackageX,
  Smartphone,
  Tag,
  Truck,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useBooking } from "../context/BookingContext";
import {
  getPorterFindingPartnerPath,
  getPorterPromoPath,
  getPorterPaymentPath,
  getPorterVehiclePath,
} from "../utils/routes";
import { PAYMENT_METHODS } from "../utils/mock/payments";
import { porterUserApi } from "../services/api";
import { saveBookingDraft, loadBookingDraft, clearBookingDraft } from "@/shared/utils/bookingDraft";
import { initRazorpayPayment } from "@food/utils/razorpay";
import { userAPI } from "@food/api";

const METHOD_ICONS = {
  wallet: Wallet,
  upi: Smartphone,
  cash: Banknote,
  netbanking: Landmark,
};

function formatInr(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "₹0";
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

function personLine(place, role) {
  const name = role === "pickup" ? place?.senderName : place?.receiverName;
  const phone = role === "pickup" ? place?.senderPhone : place?.receiverPhone;
  return [name, phone].filter(Boolean).join(" · ") || place?.title || (role === "pickup" ? "Pickup" : "Drop");
}

function addressLine(place) {
  return [place?.addressDetails, place?.address].filter(Boolean).join(", ") || place?.address || "—";
}

function GoodsTypeSheet({
  open,
  onClose,
  goodsTypes,
  restrictedItems,
  selectedId,
  onSelect,
  onConfirm,
  loading,
}) {
  const [restrictedOpen, setRestrictedOpen] = useState(false);
  if (!open) return null;

  const preview = (restrictedItems || []).slice(0, 3).join(", ");
  const mid = Math.ceil((restrictedItems || []).length / 2);
  const colA = (restrictedItems || []).slice(0, mid);
  const colB = (restrictedItems || []).slice(mid);
  const canConfirm = Boolean(selectedId);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: 48, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 48, opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        className="relative z-10 flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-white shadow-[0_-12px_40px_rgba(15,23,42,0.2)] sm:rounded-[28px]"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <h2 className="text-[18px] font-extrabold tracking-tight text-[#0F172A]">
            Select Goods Type
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F1F5F9] text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2.4} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-3">
          <div className="rounded-2xl bg-[#FFF8E8] px-3.5 py-3">
            <button
              type="button"
              onClick={() => setRestrictedOpen((v) => !v)}
              className="flex w-full items-start gap-2.5 text-left"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#DC2626] shadow-sm">
                <PackageX className="h-4.5 w-4.5" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold text-[#0F172A]">Restricted Items</span>
                <span className="mt-0.5 block truncate text-[11px] text-[#78716C]">
                  {preview ? `${preview} & …` : "Items not allowed for delivery"}
                </span>
              </span>
              <span className="mt-1 flex shrink-0 items-center gap-0.5 text-[12px] font-bold text-[#2F6BFF]">
                {restrictedOpen ? "Hide" : "Show"}
                {restrictedOpen ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </span>
            </button>

            <AnimatePresence initial={false}>
              {restrictedOpen ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-[#F5E6C8] pt-3">
                    {[colA, colB].map((col, idx) => (
                      <ul key={idx} className="space-y-1.5">
                        {col.map((item) => (
                          <li key={item} className="flex gap-1.5 text-[11px] leading-snug text-[#44403C]">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#78716C]" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    ))}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <p className="mb-2 mt-4 text-[12px] font-bold uppercase tracking-wider text-[#94A3B8]">
            Goods type
          </p>

          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
          ) : !goodsTypes.length ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No goods types configured yet.
            </p>
          ) : (
            <div className="space-y-2 pb-2">
              {goodsTypes.map((g) => {
                const active = String(selectedId) === String(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onSelect(g)}
                    className={`flex w-full items-center justify-between rounded-2xl border-2 px-3.5 py-3 text-left transition ${
                      active
                        ? "border-[#2F6BFF] bg-[#F3F7FF]"
                        : "border-transparent bg-[#F8FAFC]"
                    }`}
                  >
                    <span>
                      <span className="block text-[14px] font-bold text-[#0F172A]">{g.name}</span>
                      {g.description ? (
                        <span className="mt-0.5 block text-[11px] text-[#6B7280]">{g.description}</span>
                      ) : null}
                    </span>
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                        active
                          ? "border-[#2F6BFF] bg-[#2F6BFF] text-white"
                          : "border-[#D1D5DB] bg-white"
                      }`}
                    >
                      {active ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-[#E8EEF7] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            disabled={!canConfirm}
            onClick={onConfirm}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-[#2F6BFF] text-[15px] font-bold text-white shadow-[0_10px_24px_rgba(47,107,255,0.35)] disabled:bg-[#E5E7EB] disabled:text-[#9CA3AF] disabled:shadow-none"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function FareEstimate() {
  const navigate = useNavigate();
  const {
    pickup,
    delivery,
    parcel,
    updateParcel,
    vehicleId,
    setVehicleId,
    coupon,
    paymentMethodId,
    setPaymentMethodId,
    discount,
    baseFare,
    apiQuote,
    setApiQuote,
    setActiveShipment,
  } = useBooking();

  const [goodsOpen, setGoodsOpen] = useState(false);
  const [goodsTypes, setGoodsTypes] = useState([]);
  const [restrictedItems, setRestrictedItems] = useState([]);
  const [goodsLoading, setGoodsLoading] = useState(false);
  const [pickedGoodsId, setPickedGoodsId] = useState(parcel?.goodsTypeId || null);
  const [paymentBusy, setPaymentBusy] = useState(false);

  useEffect(() => {
    if (!PAYMENT_METHODS.some((m) => m.id === paymentMethodId)) {
      setPaymentMethodId("cash");
    }
  }, [paymentMethodId, setPaymentMethodId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hasFare =
        apiQuote?.fareEstimateTotal != null || apiQuote?.fare?.total != null;
      const hasLoading =
        apiQuote?.freeLoadingMinutes != null
        || apiQuote?.pricing?.freeLoadingMinutes != null
        || apiQuote?.vehicle?.freeLoadingMinutes != null;
      if (hasFare && hasLoading) return;
      if (pickup?.lat == null || delivery?.lat == null) return;
      const vid = vehicleId && String(vehicleId).length >= 12 ? vehicleId : null;
      if (!vid) return;
      try {
        const quoteRes = await porterUserApi.quote({
          vehicleId: vid,
          pickup: { lat: Number(pickup.lat), lng: Number(pickup.lng) },
          drop: { lat: Number(delivery.lat), lng: Number(delivery.lng) },
          parcel: {
            description: parcel?.parcelDescription || parcel?.parcelName || "",
            weightKg: Number(parcel?.weightKg) || 0,
            quantity: Number(parcel?.quantity) || 1,
          },
        });
        const quote = quoteRes?.quote || quoteRes;
        if (cancelled || !quote) return;
        setApiQuote((prev) => ({
          ...(prev || {}),
          vehicle: quote.vehicle || prev?.vehicle || { id: vid },
          fare: quote.fare ?? prev?.fare,
          fareEstimateTotal:
            quote.fareEstimateTotal ?? quote.fare?.total ?? prev?.fareEstimateTotal,
          distanceKm: quote.distanceKm ?? prev?.distanceKm,
          durationMin: quote.durationMin ?? prev?.durationMin,
          zoneId: quote.zoneId ?? prev?.zoneId,
          freeLoadingMinutes: quote.freeLoadingMinutes,
          extraLoadingPerMinCharge: quote.extraLoadingPerMinCharge,
          pricing: quote.pricing || null,
        }));
        if (quote.vehicle?.id) setVehicleId(quote.vehicle.id);
      } catch {
        /* keep existing context totals */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    apiQuote?.fareEstimateTotal,
    apiQuote?.fare?.total,
    apiQuote?.freeLoadingMinutes,
    apiQuote?.pricing?.freeLoadingMinutes,
    apiQuote?.vehicle?.freeLoadingMinutes,
    pickup?.lat,
    pickup?.lng,
    delivery?.lat,
    delivery?.lng,
    vehicleId,
    parcel?.parcelDescription,
    parcel?.parcelName,
    parcel?.weightKg,
    parcel?.quantity,
    setApiQuote,
    setVehicleId,
  ]);

  const openGoodsSheet = async () => {
    if (!canBook) {
      toast.error("Complete route and vehicle selection first");
      return;
    }
    setGoodsOpen(true);
    setPickedGoodsId(parcel?.goodsTypeId || null);
    if (goodsTypes.length) return;
    setGoodsLoading(true);
    try {
      const data = await porterUserApi.getGoodsCatalog();
      setGoodsTypes(data.goodsTypes || []);
      setRestrictedItems(data.restrictedItems || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load goods types");
    } finally {
      setGoodsLoading(false);
    }
  };

  const confirmGoodsSelection = () => {
    const selected = goodsTypes.find((g) => String(g.id) === String(pickedGoodsId));
    if (!selected) {
      toast.error("Select a goods type");
      return;
    }
    updateParcel({
      goodsTypeId: selected.id,
      goodsTypeName: selected.name,
      parcelName: parcel?.parcelName || selected.name,
    });
    const draft = loadBookingDraft("porter") || {};
    saveBookingDraft("porter", {
      ...draft,
      parcel: {
        ...(draft.parcel || parcel || {}),
        goodsTypeId: selected.id,
        goodsTypeName: selected.name,
      },
    });
    setGoodsOpen(false);
    toast.success(`${selected.name} selected`);
  };

  const toPlace = (place, fallbackOffset = 0) => ({
    address: place?.address || place?.title || "Address",
    lat: Number(place?.lat ?? place?.latitude ?? 28.5355 + fallbackOffset),
    lng: Number(place?.lng ?? place?.longitude ?? 77.391 + fallbackOffset),
  });

  const buildTripBody = () => ({
    pickup: toPlace(pickup, 0),
    drop: toPlace(delivery, 0.01),
    vehicleId: apiQuote?.vehicle?.id || vehicleId,
    parcel: {
      description: parcel?.parcelDescription || parcel?.parcelName || parcel?.goodsTypeName || "",
      weightKg: Number(parcel?.weightKg) || 0,
      size: parcel?.size || "",
      goodsTypeId: parcel?.goodsTypeId || null,
      goodsTypeName: parcel?.goodsTypeName || "",
    },
    paymentMethod: ["cash", "wallet", "upi"].includes(paymentMethodId)
      ? paymentMethodId
      : "cash",
  });

  const goFindingPartner = (trip) => {
    const amount = Number(
      trip?.fareEstimateTotal
      ?? apiQuote?.fareEstimateTotal
      ?? apiQuote?.fare?.total
      ?? baseFare
      ?? 0,
    );
    const shipment = {
      id: trip?.id || trip?._id,
      trackingId: trip?.tripNumber || `BLZ${Date.now().toString().slice(-8)}`,
      status: trip?.status || "searching",
      stage: "searching",
      partner: null,
      pickup,
      delivery,
      vehicle: apiQuote?.vehicle?.name || "Vehicle",
      total: amount,
      createdAt: trip?.createdAt || new Date().toISOString(),
      trip,
    };
    try {
      sessionStorage.setItem("porter_active_trip_id", String(shipment.id || ""));
    } catch {
      /* ignore */
    }
    clearBookingDraft("porter");
    setActiveShipment(shipment);
    navigate(getPorterFindingPartnerPath(), { replace: true });
  };

  const handleMakePayment = async () => {
    if (!canBook || paymentBusy) return;
    if (!parcel?.goodsTypeId) {
      openGoodsSheet();
      return;
    }
    try {
      setPaymentBusy(true);
      const body = buildTripBody();
      if (!body.vehicleId || String(body.vehicleId).length < 12) {
        const vehicles = await porterUserApi.getPublicVehicles();
        if (vehicles?.[0]?.id) body.vehicleId = vehicles[0].id;
      }

      const trip = await porterUserApi.createTrip(body);
      const tripId = trip?.id || trip?._id;
      if (!tripId) throw new Error("Trip was not created");

      if (paymentMethodId === "cash") {
        toast.success("Booking confirmed");
        goFindingPartner(trip);
        return;
      }

      if (paymentMethodId === "wallet") {
        const paid = await porterUserApi.payWithWallet(tripId);
        toast.success("Paid with wallet");
        goFindingPartner(paid || trip);
        return;
      }

      // UPI / online → Razorpay
      const data = await porterUserApi.createRazorpayOrder(tripId);
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
        /* optional */
      }

      await initRazorpayPayment({
        key,
        amount,
        currency: razorpay.currency || "INR",
        order_id: orderId,
        name: "Just Order Porter",
        description: `Porter fare · ${trip.tripNumber || ""}`,
        prefill,
        notes: { type: "porter_trip", tripId: String(tripId) },
        handler: async (response) => {
          try {
            const paid = await porterUserApi.verifyRazorpayPayment(tripId, {
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            toast.success("Payment successful");
            goFindingPartner(paid || trip);
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
      toast.error(err?.response?.data?.message || err?.message || "Payment failed");
      setPaymentBusy(false);
    } finally {
      if (paymentMethodId !== "upi") setPaymentBusy(false);
    }
  };

  const payment = PAYMENT_METHODS.find((p) => p.id === paymentMethodId);
  const PaymentIcon = METHOD_ICONS[paymentMethodId] || Banknote;

  const vehicle = apiQuote?.vehicle || {};
  const fare = apiQuote?.fare || {};
  const distanceKm = Number(apiQuote?.distanceKm || 0);
  const durationMin = Number(apiQuote?.durationMin || 0);

  const fareRows = useMemo(() => {
    const rows = [
      { label: "Base fare", value: Number(fare.base || 0) },
      { label: "Distance charge", value: Number(fare.distance || 0) },
      { label: "Weight charge", value: Number(fare.weight || 0) },
      { label: "Platform fee", value: Number(fare.platformFee || 0) },
    ].filter((r) => r.value > 0);

    if (!rows.length) {
      const fallback = Number(apiQuote?.fareEstimateTotal ?? fare.total ?? baseFare ?? 0);
      if (fallback > 0) {
        return [{ label: "Trip fare", value: fallback }];
      }
      return [{ label: "Base fare", value: 0 }];
    }
    return rows;
  }, [apiQuote?.fareEstimateTotal, fare, baseFare]);

  const subtotal = Number(
    apiQuote?.fareEstimateTotal ?? fare.total ?? baseFare ?? 0,
  );
  const promoDiscount = Number(discount || 0);
  const payable = Math.max(0, subtotal - promoDiscount);

  const weightKg = Number(parcel?.weightKg || 0) * Number(parcel?.quantity || 1);
  const vehicleName = vehicle?.name || "Selected vehicle";

  const freeLoadingMinutes = (() => {
    const raw =
      apiQuote?.freeLoadingMinutes
      ?? apiQuote?.pricing?.freeLoadingMinutes
      ?? vehicle?.freeLoadingMinutes
      ?? 60;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 60;
  })();

  const extraLoadingPerMin = (() => {
    const raw =
      apiQuote?.extraLoadingPerMinCharge
      ?? apiQuote?.pricing?.extraLoadingPerMinCharge
      ?? vehicle?.extraLoadingPerMinCharge
      ?? 3;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 3;
  })();

  const freeLoadingLabel = Number.isInteger(freeLoadingMinutes)
    ? String(freeLoadingMinutes)
    : freeLoadingMinutes.toFixed(1);
  const extraRateLabel = Number.isInteger(extraLoadingPerMin)
    ? String(extraLoadingPerMin)
    : extraLoadingPerMin.toFixed(1);

  const bookingInstructions = useMemo(
    () => [
      {
        key: "labour",
        text: "Fare doesn't include labour charges for loading & unloading.",
      },
      {
        key: "free",
        text: (
          <>
            Fare includes{" "}
            <span className="font-bold text-[#0F172A]">{freeLoadingLabel} mins</span>{" "}
            free loading/unloading time.
          </>
        ),
      },
      {
        key: "extra",
        text: (
          <>
            <span className="font-bold text-[#0F172A]">₹ {extraRateLabel}/min</span>{" "}
            for additional loading/unloading time.
          </>
        ),
      },
      {
        key: "route",
        text: "Fare may change if route or location changes.",
      },
      {
        key: "parking",
        text: "Parking charges to be paid by customer.",
      },
      {
        key: "toll",
        text: "Fare includes toll and permit charges, if any.",
      },
      {
        key: "overload",
        text: "We don't allow overloading.",
      },
    ],
    [freeLoadingLabel, extraRateLabel],
  );

  const canBook =
    pickup?.lat != null &&
    delivery?.lat != null &&
    (vehicle?.id || vehicleId) &&
    payable >= 0;

  return (
    <div className="relative min-h-[100dvh] bg-[#F4F7FC] pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: `
            linear-gradient(rgba(47, 107, 255, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(47, 107, 255, 0.05) 1px, transparent 1px)
          `,
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative z-10 mx-auto max-w-lg px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(getPorterVehiclePath())}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-[0_6px_18px_rgba(15,23,42,0.1)]"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5 text-slate-800" strokeWidth={2.2} />
          </button>
          <div>
            <h1 className="text-[18px] font-bold tracking-tight text-[#0F172A]">
              Review Booking
            </h1>
            <p className="text-[12px] font-medium text-[#6B7280]">
              Review fare and confirm booking
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-[20px] border border-white bg-white p-4 shadow-[0_10px_28px_rgba(15,40,90,0.07)]">
          <div className="flex gap-3">
            <div className="flex flex-col items-center pt-1">
              <span className="h-2.5 w-2.5 rounded-full bg-[#22C55E]" />
              <span className="my-1 w-px flex-1 border-l border-dashed border-[#D1D5DB]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#EF4444]" />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="truncate text-[13px] font-bold text-[#0F172A]">
                  {personLine(pickup, "pickup")}
                </p>
                <p className="truncate text-[11px] text-[#6B7280]">
                  {addressLine(pickup)}
                </p>
              </div>
              <div>
                <p className="truncate text-[13px] font-bold text-[#0F172A]">
                  {personLine(delivery, "drop")}
                </p>
                <p className="truncate text-[11px] text-[#6B7280]">
                  {addressLine(delivery)}
                </p>
              </div>
            </div>
          </div>
          {(distanceKm > 0 || durationMin > 0) && (
            <div className="mt-3 flex gap-2 border-t border-[#F1F5F9] pt-3">
              {distanceKm > 0 ? (
                <span className="rounded-full bg-[#F3F5F8] px-2.5 py-1 text-[11px] font-semibold text-[#475569]">
                  {distanceKm.toFixed(1)} km
                </span>
              ) : null}
              {durationMin > 0 ? (
                <span className="rounded-full bg-[#F3F5F8] px-2.5 py-1 text-[11px] font-semibold text-[#475569]">
                  ~{Math.max(1, Math.round(durationMin))} mins
                </span>
              ) : null}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center gap-3 rounded-[18px] border border-white bg-white p-3.5 shadow-[0_8px_22px_rgba(15,40,90,0.05)]">
          <div className="flex h-14 w-16 shrink-0 items-center justify-center rounded-xl bg-[#F3F7FF]">
            {vehicle?.iconUrl || vehicle?.image ? (
              <img
                src={vehicle.iconUrl || vehicle.image}
                alt=""
                className="h-10 w-14 object-contain"
              />
            ) : (
              <Truck className="h-7 w-7 text-[#2F6BFF]" strokeWidth={1.6} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-bold text-[#0F172A]">
              {vehicleName}
            </p>
            <p className="mt-0.5 text-[12px] text-[#6B7280]">
              {weightKg > 0 ? `${weightKg} kg load` : "Standard load"}
              {vehicle?.maxWeight ? ` · up to ${vehicle.maxWeight} kg` : ""}
              {parcel?.goodsTypeName ? ` · ${parcel.goodsTypeName}` : ""}
            </p>
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-[18px] border border-white bg-white shadow-[0_8px_22px_rgba(15,40,90,0.05)]">
          <button
            type="button"
            onClick={() => navigate(getPorterPromoPath())}
            className="flex w-full items-center justify-between px-4 py-3.5 text-left"
          >
            <span className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EEF3FF] text-[#2F6BFF]">
                <Tag className="h-4 w-4" strokeWidth={2.2} />
              </span>
              <span>
                <span className="block text-[13px] font-bold text-[#0F172A]">
                  {coupon?.code ? coupon.code : "Apply Coupon"}
                </span>
                <span className="block text-[11px] text-[#6B7280]">
                  {coupon ? "Promo applied" : "Optional discount"}
                </span>
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-[#C0C7D4]" />
          </button>
          <div className="mx-4 border-t border-[#F1F5F9]" />
          <button
            type="button"
            onClick={() => navigate(getPorterPaymentPath())}
            className="flex w-full items-center justify-between px-4 py-3.5 text-left"
          >
            <span className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EEF3FF] text-[#2F6BFF]">
                <PaymentIcon className="h-4 w-4" strokeWidth={2.2} />
              </span>
              <span>
                <span className="block text-[13px] font-bold text-[#0F172A]">
                  {payment?.label || "Payment method"}
                </span>
                <span className="block text-[11px] text-[#6B7280]">
                  {payment?.subtitle || "Choose how you want to pay"}
                </span>
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-[#C0C7D4]" />
          </button>
        </div>

        <div className="mt-3 rounded-[18px] border border-white bg-white p-4 shadow-[0_8px_22px_rgba(15,40,90,0.05)]">
          <p className="mb-3 text-[13px] font-bold text-[#0F172A]">Fare Summary</p>
          <div className="space-y-2.5">
            {fareRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between text-[13px]">
                <span className="text-[#6B7280]">{row.label}</span>
                <span className="font-semibold text-[#0F172A]">{formatInr(row.value)}</span>
              </div>
            ))}
            {promoDiscount > 0 ? (
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-[#16A34A]">Promo discount</span>
                <span className="font-semibold text-[#16A34A]">
                  −{formatInr(promoDiscount)}
                </span>
              </div>
            ) : null}
            <div className="border-t border-[#F1F5F9] pt-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-bold text-[#0F172A]">Amount Payable</span>
                <span className="text-[18px] font-extrabold tracking-tight text-[#0F172A]">
                  {formatInr(payable)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {parcel?.goodsTypeId ? (
          <div className="mt-3 rounded-[18px] border border-white bg-white p-4 shadow-[0_8px_22px_rgba(15,40,90,0.05)]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                  Goods type
                </p>
                <p className="mt-0.5 truncate text-[14px] font-bold text-[#0F172A]">
                  {parcel.goodsTypeName || "Selected"}
                </p>
              </div>
              <button
                type="button"
                onClick={openGoodsSheet}
                className="shrink-0 rounded-lg bg-[#EEF3FF] px-3 py-1.5 text-[12px] font-bold text-[#2F6BFF]"
              >
                Change
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 mb-2">
          <p className="mb-2 text-[13px] font-bold text-[#0F172A]">Read before Booking</p>
          <div className="rounded-[18px] border border-[#E8EEF7] bg-white px-4 py-3.5">
            <ul className="space-y-2">
              {bookingInstructions.map((line) => (
                <li key={line.key} className="flex gap-2 text-[12px] leading-relaxed text-[#6B7280]">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#94A3B8]" />
                  <span>{line.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#E8EEF7] bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          disabled={!canBook || paymentBusy}
          onClick={parcel?.goodsTypeId ? handleMakePayment : openGoodsSheet}
          className="flex h-12 w-full items-center justify-center rounded-xl bg-[#2F6BFF] text-[15px] font-bold text-white shadow-[0_10px_24px_rgba(47,107,255,0.35)] disabled:opacity-50"
        >
          {paymentBusy
            ? "Please wait…"
            : parcel?.goodsTypeId
              ? paymentMethodId === "cash"
                ? "Confirm Booking"
                : "Make Payment"
              : "Choose Goods Type"}
        </button>
      </div>

      <AnimatePresence>
        {goodsOpen ? (
          <GoodsTypeSheet
            key="goods"
            open={goodsOpen}
            onClose={() => setGoodsOpen(false)}
            goodsTypes={goodsTypes}
            restrictedItems={restrictedItems}
            selectedId={pickedGoodsId}
            onSelect={(g) => setPickedGoodsId(g.id)}
            onConfirm={confirmGoodsSelection}
            loading={goodsLoading}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
