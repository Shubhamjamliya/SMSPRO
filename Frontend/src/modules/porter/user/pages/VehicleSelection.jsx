import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  ArrowDownUp,
  ArrowLeft,
  Info,
  Loader2,
  Pencil,
  Plus,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useBooking } from "../context/BookingContext";
import { porterUserApi } from "../services/api";
import { saveBookingDraft, loadBookingDraft } from "@/shared/utils/bookingDraft";
import {
  getPorterBookPath,
  getPorterFareEstimatePath,
  getPorterHomePath,
} from "../utils/routes";

function formatPersonLine(place, role) {
  const name = role === "pickup" ? place?.senderName : place?.receiverName;
  const phone = role === "pickup" ? place?.senderPhone : place?.receiverPhone;
  const namePhone = [name, phone].filter(Boolean).join(" · ");
  if (namePhone) return namePhone;
  return place?.title || (role === "pickup" ? "Pickup" : "Drop");
}

function formatAddressLine(place) {
  return [place?.addressDetails, place?.address].filter(Boolean).join(", ")
    || place?.address
    || "—";
}

function formatInr(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "₹—";
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

function VehicleThumb({ vehicle, size = "sm" }) {
  const src = vehicle?.iconUrl || vehicle?.image;
  const box = size === "lg" ? "h-[120px] w-full" : "h-14 w-[72px]";
  const img =
    size === "lg"
      ? "h-[100px] w-auto max-w-[200px] object-contain"
      : "h-11 w-16 object-contain";
  const icon = size === "lg" ? 56 : 28;

  return (
    <div className={`flex items-center justify-center ${box}`}>
      {src ? (
        <img src={src} alt="" className={img} />
      ) : (
        <Truck className="text-[#2F6BFF]" size={icon} strokeWidth={1.5} />
      )}
    </div>
  );
}

function cmLabel(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "—";
  return `${Math.round(v)} cm`;
}

/** Orthographic cargo outline with dimension callouts. */
function DimensionView({ label, widthCm, heightCm, aspect = "front" }) {
  const hasSize = Number(widthCm) > 0 && Number(heightCm) > 0;
  const boxW = aspect === "side" ? 92 : 56;
  const boxH = aspect === "side" ? 52 : 72;
  const svgW = 148;
  const svgH = 128;
  const ox = (svgW - boxW) / 2 + 6;
  const oy = (svgH - boxH) / 2 - 4;

  return (
    <div className="rounded-2xl bg-[#EEF4FF] px-2 pb-2.5 pt-3">
      <p className="mb-1 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-[#2F6BFF]/70">
        {label}
      </p>
      {hasSize ? (
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="mx-auto h-[118px] w-full" aria-hidden>
          <rect
            x={ox}
            y={oy}
            width={boxW}
            height={boxH}
            rx="10"
            fill="rgba(255,255,255,0.72)"
            stroke="#2F6BFF"
            strokeWidth="2.2"
          />
          <path
            d={`M ${ox + 10} ${oy + boxH * 0.38} H ${ox + boxW - 10}`}
            stroke="#2F6BFF"
            strokeWidth="1.4"
            strokeOpacity="0.35"
            strokeLinecap="round"
          />
          <circle cx={ox + boxW / 2} cy={oy + boxH * 0.62} r="3.5" fill="#2F6BFF" fillOpacity="0.2" />

          <line
            x1={ox - 14}
            y1={oy}
            x2={ox - 14}
            y2={oy + boxH}
            stroke="#2F6BFF"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <line x1={ox - 18} y1={oy} x2={ox - 10} y2={oy} stroke="#2F6BFF" strokeWidth="1.4" />
          <line
            x1={ox - 18}
            y1={oy + boxH}
            x2={ox - 10}
            y2={oy + boxH}
            stroke="#2F6BFF"
            strokeWidth="1.4"
          />
          <text
            x={ox - 22}
            y={oy + boxH / 2}
            fill="#2F6BFF"
            fontSize="11"
            fontWeight="700"
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(-90 ${ox - 22} ${oy + boxH / 2})`}
          >
            {cmLabel(heightCm)}
          </text>

          <line
            x1={ox}
            y1={oy + boxH + 14}
            x2={ox + boxW}
            y2={oy + boxH + 14}
            stroke="#2F6BFF"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <line
            x1={ox}
            y1={oy + boxH + 10}
            x2={ox}
            y2={oy + boxH + 18}
            stroke="#2F6BFF"
            strokeWidth="1.4"
          />
          <line
            x1={ox + boxW}
            y1={oy + boxH + 10}
            x2={ox + boxW}
            y2={oy + boxH + 18}
            stroke="#2F6BFF"
            strokeWidth="1.4"
          />
          <text
            x={ox + boxW / 2}
            y={oy + boxH + 28}
            fill="#2F6BFF"
            fontSize="11"
            fontWeight="700"
            textAnchor="middle"
          >
            {cmLabel(widthCm)}
          </text>
        </svg>
      ) : (
        <div className="flex h-[118px] items-center justify-center text-[12px] font-medium text-[#94A3B8]">
          Size not set
        </div>
      )}
    </div>
  );
}

function SpecChip({ label, value }) {
  return (
    <div className="rounded-xl bg-[#F8FAFC] px-2.5 py-2 text-center ring-1 ring-[#E8EEF7]">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">{label}</p>
      <p className="mt-0.5 text-[13px] font-extrabold tabular-nums text-[#0F172A]">{value}</p>
    </div>
  );
}

function CapacitySheet({ vehicle, open, onClose, onDone }) {
  if (!open || !vehicle) return null;

  const weight = Number(vehicle.maxWeight || 0);
  const length = Number(vehicle.maxLengthCm || 0);
  const width = Number(vehicle.maxWidthCm || 0);
  const height = Number(vehicle.maxHeightCm || 0);
  const name = vehicle.name || "Vehicle";
  const iconSrc = vehicle.iconUrl || vehicle.image;

  const handleDone = () => {
    if (typeof onDone === "function") onDone();
    else onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        className="relative z-10 w-full max-w-lg rounded-t-[28px] bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-[0_-12px_40px_rgba(15,23,42,0.18)] sm:rounded-[28px] sm:pb-5"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[#F1F5F9] text-slate-600"
          aria-label="Close capacity"
        >
          <X className="h-4 w-4" strokeWidth={2.4} />
        </button>

        <div className="mb-4 flex justify-center">
          <div className="flex h-16 w-24 items-center justify-center">
            {iconSrc ? (
              <img src={iconSrc} alt="" className="max-h-14 max-w-[88px] object-contain" />
            ) : (
              <Truck className="h-10 w-10 text-[#2F6BFF]" strokeWidth={1.5} />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <DimensionView label="Front" widthCm={width} heightCm={height} aspect="front" />
          <DimensionView label="Side" widthCm={length} heightCm={height} aspect="side" />
        </div>

        <h2 className="mt-4 text-[22px] font-extrabold tracking-tight text-[#0F172A]">{name}</h2>
        <p className="mt-1 text-[13px] font-medium text-[#64748B]">
          Max load capacity for this vehicle type
        </p>

        <div className="mt-3 grid grid-cols-4 gap-2">
          <SpecChip label="Weight" value={weight > 0 ? `${Math.round(weight)} kg` : "—"} />
          <SpecChip label="Length" value={length > 0 ? `${Math.round(length)}` : "—"} />
          <SpecChip label="Width" value={width > 0 ? `${Math.round(width)}` : "—"} />
          <SpecChip label="Height" value={height > 0 ? `${Math.round(height)}` : "—"} />
        </div>
        {(length > 0 || width > 0 || height > 0) && (
          <p className="mt-1.5 text-center text-[10px] font-medium text-[#94A3B8]">
            Dimensions in cm · L × W × H
          </p>
        )}

        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-[#F3F5F8] px-3.5 py-3">
          <Truck className="h-4 w-4 shrink-0 text-[#64748B]" strokeWidth={2} />
          <p className="text-[12px] font-medium text-[#64748B]">
            Fleet includes all {name} vehicles.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDone}
          className="mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-[#2F6BFF] text-[15px] font-bold text-white shadow-[0_10px_24px_rgba(47,107,255,0.35)]"
        >
          Done
        </button>
      </motion.div>
    </div>
  );
}

function VehicleCard({ row, active, onSelect }) {
  const v = row.vehicle || {};
  const pricingMissing = row.pricingConfigured === false
    || String(row.error || "").toLowerCase().includes("price");
  const selectable = row.selectable !== false && row.fareEstimateTotal != null && !pricingMissing;
  const unavailable = !selectable;
  const capacity = Number(v.maxWeight || 0);
  const eta =
    row.durationMin != null
      ? `${Math.max(1, Math.round(row.durationMin))} mins`
      : row.nearestPartnerDistanceKm != null
        ? `${Number(row.nearestPartnerDistanceKm).toFixed(1)} km away`
        : "—";
  const name = v.name || "Vehicle";
  const meta = `${capacity > 0 ? `${capacity} kg` : "Capacity —"} · ${eta}`;
  const statusLabel = pricingMissing
    ? "Prices are not configured"
    : row.error || "Not available for this route";

  return (
    <motion.button
      type="button"
      layout
      disabled={unavailable && pricingMissing}
      onClick={() => {
        if (pricingMissing) return;
        if (!selectable) {
          toast.error(statusLabel);
          return;
        }
        onSelect(row);
      }}
      transition={{
        layout: { type: "spring", stiffness: 380, damping: 32, mass: 0.7 },
      }}
      className={`relative w-full overflow-hidden rounded-2xl border-2 text-left outline-none ${
        active && selectable
          ? "border-[#2F6BFF] bg-[#F3F7FF] shadow-[0_10px_28px_rgba(47,107,255,0.16)]"
          : selectable
            ? "border-[#E8EEF7] bg-white hover:bg-[#F8FAFC]"
            : "border-transparent bg-white hover:bg-[#F8FAFC]"
      } ${unavailable ? "opacity-55" : ""}`}
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {active && selectable ? (
          <motion.div
            key="expanded"
            initial={{ opacity: 0.55, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="px-4 pb-4 pt-3"
          >
            <motion.div layout="position" className="mx-auto mb-3 flex justify-center">
              <VehicleThumb vehicle={v} size="lg" />
            </motion.div>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[16px] font-bold text-[#0F172A]">{name}</p>
                  <Info className="h-3.5 w-3.5 shrink-0 text-[#A8B3C7]" />
                </div>
                <p className="mt-0.5 text-[12px] font-medium text-[#6B7280]">{meta}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[20px] font-extrabold tracking-tight text-[#0F172A]">
                  {formatInr(row.fareEstimateTotal)}
                </p>
                {row.distanceKm != null ? (
                  <p className="text-[10px] font-medium text-[#9AA3B2]">
                    {Number(row.distanceKm).toFixed(1)} km
                  </p>
                ) : null}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="compact"
            initial={{ opacity: 0.55 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-3 px-3 py-2.5"
          >
            <div className="flex h-14 w-[72px] shrink-0 items-center justify-center rounded-xl bg-[#F4F7FC]">
              <VehicleThumb vehicle={v} size="sm" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-[15px] font-bold text-[#0F172A]">{name}</p>
                <Info className="h-3.5 w-3.5 shrink-0 text-[#A8B3C7]" />
              </div>
              <p className="mt-0.5 text-[12px] font-medium text-[#6B7280]">{meta}</p>
              {unavailable ? (
                <p className="mt-1 text-[11px] font-medium text-amber-600">{statusLabel}</p>
              ) : null}
            </div>
            <div className="text-right">
              <p className="text-[16px] font-extrabold text-[#0F172A]">
                {selectable ? formatInr(row.fareEstimateTotal) : "—"}
              </p>
              {row.distanceKm != null && selectable ? (
                <p className="text-[10px] font-medium text-[#9AA3B2]">
                  {Number(row.distanceKm).toFixed(1)} km
                </p>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

export default function VehicleSelection() {
  const navigate = useNavigate();
  const {
    pickup,
    delivery,
    setPickup,
    setDelivery,
    vehicleId,
    setVehicleId,
    parcel,
    setApiQuote,
  } = useBooking();

  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState([]);
  const [error, setError] = useState("");
  const [capacityOpen, setCapacityOpen] = useState(false);
  const [capacityVehicle, setCapacityVehicle] = useState(null);

  const hasRoute = pickup?.lat != null && delivery?.lat != null;

  const loadQuotes = useCallback(async () => {
    if (!hasRoute) {
      setLoading(false);
      setError("Set pickup and drop locations first");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await porterUserApi.getAvailableVehicles({
        pickup: {
          lat: pickup.lat,
          lng: pickup.lng,
          address: pickup.address || "",
        },
        drop: {
          lat: delivery.lat,
          lng: delivery.lng,
          address: delivery.address || "",
        },
        parcel: {
          weightKg: Number(parcel?.weightKg || 0),
          description: parcel?.parcelDescription || parcel?.description || "",
        },
      });

      const rows = data.vehicles || [];
      setQuotes(rows);

      if (!rows.length) {
        setError(
          `No vehicles with online partners within ${data.searchRadiusKm ?? 5} km of pickup`,
        );
        return;
      }

      const selectable = rows.filter(
        (r) => r.selectable && r.fareEstimateTotal != null,
      );
      if (selectable.length) {
        const preferred =
          selectable.find((r) => String(r.vehicle?.id) === String(vehicleId))
          || selectable[0];
        setVehicleId(preferred.vehicle.id);
        setApiQuote({
          ...preferred,
          fareEstimateTotal: preferred.fareEstimateTotal,
          distanceKm: preferred.distanceKm,
          durationMin: preferred.durationMin,
          freeLoadingMinutes:
            preferred.freeLoadingMinutes ?? preferred.vehicle?.freeLoadingMinutes,
          extraLoadingPerMinCharge:
            preferred.extraLoadingPerMinCharge
            ?? preferred.vehicle?.extraLoadingPerMinCharge,
          pricing: preferred.pricing || {
            freeLoadingMinutes:
              preferred.freeLoadingMinutes ?? preferred.vehicle?.freeLoadingMinutes,
            extraLoadingPerMinCharge:
              preferred.extraLoadingPerMinCharge
              ?? preferred.vehicle?.extraLoadingPerMinCharge,
          },
        });
      } else {
        setApiQuote(null);
      }
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load vehicles");
      setQuotes([]);
    } finally {
      setLoading(false);
    }
  }, [
    delivery,
    hasRoute,
    parcel,
    pickup,
    setApiQuote,
    setVehicleId,
    vehicleId,
  ]);

  useEffect(() => {
    loadQuotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup?.lat, pickup?.lng, delivery?.lat, delivery?.lng]);

  const selected = useMemo(
    () => quotes.find((q) => String(q.vehicle?.id) === String(vehicleId)) || null,
    [quotes, vehicleId],
  );

  const swapLocations = () => {
    if (!pickup || !delivery) return;
    const nextPickup = {
      ...delivery,
      senderName: delivery.receiverName || pickup.senderName,
      senderPhone: delivery.receiverPhone || pickup.senderPhone,
      addressDetails: delivery.addressDetails,
    };
    delete nextPickup.receiverName;
    delete nextPickup.receiverPhone;
    const nextDrop = {
      ...pickup,
      receiverName: pickup.senderName || delivery.receiverName,
      receiverPhone: pickup.senderPhone || delivery.receiverPhone,
      addressDetails: pickup.addressDetails,
    };
    delete nextDrop.senderName;
    delete nextDrop.senderPhone;
    setPickup(nextPickup);
    setDelivery(nextDrop);
    const draft = loadBookingDraft("porter") || {};
    saveBookingDraft("porter", { ...draft, pickup: nextPickup, delivery: nextDrop });
  };

  const selectVehicle = (row) => {
    const id = row.vehicle?.id;
    if (!id || !row.selectable || row.fareEstimateTotal == null) return;

    // Already selected → show capacity popup on second tap
    if (String(vehicleId) === String(id)) {
      setCapacityVehicle(row.vehicle);
      setCapacityOpen(true);
      return;
    }

    setVehicleId(id);
    setApiQuote({
      ...row,
      fareEstimateTotal: row.fareEstimateTotal,
      distanceKm: row.distanceKm,
      durationMin: row.durationMin,
      freeLoadingMinutes: row.freeLoadingMinutes ?? row.vehicle?.freeLoadingMinutes,
      extraLoadingPerMinCharge:
        row.extraLoadingPerMinCharge ?? row.vehicle?.extraLoadingPerMinCharge,
      pricing: row.pricing || {
        freeLoadingMinutes: row.freeLoadingMinutes ?? row.vehicle?.freeLoadingMinutes,
        extraLoadingPerMinCharge:
          row.extraLoadingPerMinCharge ?? row.vehicle?.extraLoadingPerMinCharge,
      },
    });
  };

  const proceed = () => {
    if (!selected?.vehicle?.id || selected.fareEstimateTotal == null || !selected.selectable) {
      toast.error("Select an available vehicle");
      return;
    }
    setVehicleId(selected.vehicle.id);
    setApiQuote({
      ...selected,
      fareEstimateTotal: selected.fareEstimateTotal,
      distanceKm: selected.distanceKm,
      durationMin: selected.durationMin,
      freeLoadingMinutes:
        selected.freeLoadingMinutes ?? selected.vehicle?.freeLoadingMinutes,
      extraLoadingPerMinCharge:
        selected.extraLoadingPerMinCharge ?? selected.vehicle?.extraLoadingPerMinCharge,
      pricing: selected.pricing || {
        freeLoadingMinutes:
          selected.freeLoadingMinutes ?? selected.vehicle?.freeLoadingMinutes,
        extraLoadingPerMinCharge:
          selected.extraLoadingPerMinCharge ?? selected.vehicle?.extraLoadingPerMinCharge,
      },
    });
    setCapacityOpen(false);
    navigate(getPorterFareEstimatePath());
  };

  if (!hasRoute) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#F4F7FC] px-6">
        <p className="mb-4 text-center text-sm text-slate-600">
          Set pickup and drop locations to see vehicles.
        </p>
        <button
          type="button"
          onClick={() => navigate(getPorterBookPath())}
          className="rounded-xl bg-[#2F6BFF] px-5 py-3 text-sm font-bold text-white"
        >
          Set locations
        </button>
      </div>
    );
  }

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
        <div className="mb-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(getPorterBookPath())}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-[0_6px_18px_rgba(15,23,42,0.1)]"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5 text-slate-800" strokeWidth={2.2} />
          </button>
          <h1 className="text-[18px] font-bold tracking-tight text-[#0F172A]">
            Select Vehicle
          </h1>
        </div>

        <div className="overflow-hidden rounded-[20px] border border-white bg-white shadow-[0_10px_30px_rgba(15,40,90,0.08)]">
          <div className="flex gap-3 p-4">
            <div className="flex flex-col items-center pt-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#22C55E]" />
              <span className="my-1 w-px flex-1 border-l border-dashed border-[#D1D5DB]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#EF4444]" />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold text-[#0F172A]">
                  {formatPersonLine(pickup, "pickup")}
                </p>
                <p className="truncate text-[11px] text-[#6B7280]">
                  {formatAddressLine(pickup)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold text-[#0F172A]">
                  {formatPersonLine(delivery, "drop")}
                </p>
                <p className="truncate text-[11px] text-[#6B7280]">
                  {formatAddressLine(delivery)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={swapLocations}
              className="mt-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#E8EEF7] bg-[#F8FAFC] text-[#2F6BFF]"
              aria-label="Swap locations"
            >
              <ArrowDownUp className="h-4 w-4" strokeWidth={2.2} />
            </button>
          </div>
          <div className="flex border-t border-[#F1F5F9]">
            <button
              type="button"
              onClick={() => navigate(getPorterBookPath())}
              className="flex flex-1 items-center justify-center gap-1.5 py-3 text-[13px] font-bold text-[#2F6BFF]"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.6} />
              Add Stop
            </button>
            <span className="w-px bg-[#E8EEF7]" />
            <button
              type="button"
              onClick={() => navigate(getPorterBookPath())}
              className="flex flex-1 items-center justify-center gap-1.5 py-3 text-[13px] font-bold text-[#2F6BFF]"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={2.2} />
              Edit Locations
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-[22px] bg-white pb-4 shadow-[0_10px_30px_rgba(15,40,90,0.08)]">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-[#2F6BFF]" />
            </div>
          ) : error && !quotes.length ? (
            <div className="px-4 py-12 text-center">
              <p className="text-sm text-slate-600">{error}</p>
              <button
                type="button"
                onClick={loadQuotes}
                className="mt-3 text-sm font-bold text-[#2F6BFF]"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => navigate(getPorterHomePath())}
                className="mt-2 block w-full text-xs text-slate-400"
              >
                Back to home
              </button>
            </div>
          ) : (
            <LayoutGroup>
              <div className="space-y-2.5 px-3 pt-3">
                {quotes.map((row) => {
                  const id = row.vehicle?.id;
                  const active = String(id) === String(selected?.vehicle?.id);
                  return (
                    <VehicleCard
                      key={id}
                      row={row}
                      active={active}
                      onSelect={selectVehicle}
                    />
                  );
                })}
              </div>
            </LayoutGroup>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#E8EEF7] bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          onClick={proceed}
          disabled={!selected?.vehicle?.id || selected.fareEstimateTotal == null || !selected.selectable}
          className="flex h-12 w-full items-center justify-center rounded-xl bg-[#2F6BFF] text-[15px] font-bold text-white shadow-[0_10px_24px_rgba(47,107,255,0.35)] disabled:opacity-50"
        >
          {selected?.vehicle?.name
            ? `Proceed With ${selected.vehicle.name}`
            : "Proceed"}
        </button>
      </div>

      <AnimatePresence>
        {capacityOpen ? (
          <CapacitySheet
            key="capacity"
            vehicle={capacityVehicle}
            open={capacityOpen}
            onClose={() => setCapacityOpen(false)}
            onDone={() => setCapacityOpen(false)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
