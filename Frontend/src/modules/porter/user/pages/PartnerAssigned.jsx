import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, Star, Copy, Navigation, Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Screen from "../components/Screen";
import MapPreview from "../components/MapPreview";
import { PrimaryButton, StickyBar, inr } from "../components/ui";
import { useBooking } from "../context/BookingContext";
import {
  getPorterTrackingPath,
  getPorterCancelPath,
  getPorterSosPath,
  getPorterFindingPartnerPath,
  getPorterHomePath,
} from "../utils/routes";
import { porterUserApi } from "../services/api";
import {
  formatTripStatusLabel,
  mapPartnerFromTrip,
} from "../utils/tripShipment";

const BTN_BLUE =
  "!bg-[#2F6BFF] !shadow-[0_10px_24px_rgba(47,107,255,0.35)] hover:!bg-[#2557D6]";

export default function PartnerAssigned() {
  const navigate = useNavigate();
  const { activeShipment, setActiveShipment, total } = useBooking();
  const [loading, setLoading] = useState(!activeShipment?.partner);
  const tripId =
    activeShipment?.id
    || activeShipment?.trip?.id
    || (() => {
      try {
        return sessionStorage.getItem("porter_active_trip_id") || null;
      } catch {
        return null;
      }
    })();
  const partner = activeShipment?.partner;
  const trip = activeShipment?.trip;

  useEffect(() => {
    if (!tripId) return undefined;
    let cancelled = false;
    let timer = null;

    const load = async () => {
      try {
        const next = await porterUserApi.getTrip(tripId);
        if (cancelled || !next) return;
        const mapped = mapPartnerFromTrip(next);
        setActiveShipment((prev) => ({
          ...(prev || {}),
          id: next.id || prev?.id,
          trackingId: next.tripNumber || prev?.trackingId,
          status: next.status,
          partner: mapped || prev?.partner || null,
          total: next.fareEstimateTotal ?? prev?.total,
          pickup: next.pickup || prev?.pickup,
          delivery: next.drop || prev?.delivery,
          trip: next,
        }));

        const stillSearching =
          ["quoted", "searching"].includes(next.status)
          && !next?.dispatch?.deliveryPartnerId;
        if (stillSearching) {
          navigate(getPorterFindingPartnerPath(), { replace: true });
          return;
        }
        if (["loading", "in_transit", "at_drop", "awaiting_payment", "completed"].includes(next.status)) {
          navigate(getPorterTrackingPath(), { replace: true });
          return;
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err?.response?.data?.message || "Could not load partner details");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (!cancelled) timer = setTimeout(load, 5000);
    };

    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [tripId, navigate, setActiveShipment]);

  if (!tripId) {
    return (
      <Screen title="Partner assigned">
        <p className="text-[14px] text-gray-500">No active shipment. Start a new parcel booking.</p>
        <PrimaryButton className={`mt-4 ${BTN_BLUE}`} onClick={() => navigate(getPorterHomePath())}>
          Send a parcel
        </PrimaryButton>
      </Screen>
    );
  }

  if (loading && !partner) {
    return (
      <Screen title="Partner assigned" subtitle="Loading partner details…">
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-[13px] text-gray-500">
          <Loader2 className="h-7 w-7 animate-spin text-[#2F6BFF]" />
          Fetching accepted partner…
        </div>
      </Screen>
    );
  }

  if (!partner) {
    return (
      <Screen title="Partner assigned">
        <p className="text-[14px] text-gray-500">Still waiting for a partner to accept.</p>
        <PrimaryButton
          className={`mt-4 ${BTN_BLUE}`}
          onClick={() => navigate(getPorterFindingPartnerPath())}
        >
          Back to searching
        </PrimaryButton>
      </Screen>
    );
  }

  const copyOtp = () => {
    if (!partner.pickupOtp) return;
    navigator.clipboard?.writeText(partner.pickupOtp);
    toast.success("OTP copied");
  };

  const phoneHref = partner.phone
    ? `tel:${String(partner.phone).replace(/\s/g, "")}`
    : null;

  return (
    <Screen
      title="Partner assigned"
      subtitle={activeShipment?.trackingId || "Share OTP at pickup"}
      right={
        <button
          type="button"
          onClick={() => navigate(getPorterSosPath())}
          className="text-[12px] font-bold text-[#2F6BFF]"
        >
          SOS
        </button>
      }
    >
      <MapPreview height={180} showRoute animateCar className="mb-4" />

      <div className="mb-3 flex items-center justify-between rounded-2xl border border-[#E8EEF7] bg-white px-4 py-3 shadow-sm">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">Status</p>
          <p className="text-[14px] font-extrabold capitalize text-[#0F172A]">
            {formatTripStatusLabel(activeShipment?.status || trip?.status)}
          </p>
        </div>
        <span className="rounded-full bg-[#EEF3FF] px-3 py-1 text-[11px] font-bold text-[#2F6BFF]">
          Live
        </span>
      </div>

      <div className="mb-4 rounded-2xl border border-[#E8EEF7] bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-[#EEF3FF] text-[20px] font-bold text-[#2F6BFF]">
            {partner.photo ? (
              <img src={partner.photo} alt="" className="h-full w-full object-cover" />
            ) : (
              (partner.name || "P").charAt(0)
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-extrabold text-[#0F172A]">{partner.name}</h2>
            <div className="flex items-center gap-1 text-[12px] text-gray-500">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              <span className="font-bold">{partner.rating || "—"}</span>
              {partner.trips ? <span>· {partner.trips} deliveries</span> : null}
            </div>
            <p className="text-[12px] text-gray-600">
              {partner.vehicle} · {partner.vehicleNumber}
            </p>
          </div>
          {phoneHref ? (
            <a
              href={phoneHref}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2F6BFF] text-white shadow-[0_8px_18px_rgba(47,107,255,0.35)]"
              aria-label="Call partner"
            >
              <Phone className="h-4 w-4" />
            </a>
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-gray-400">
              <Phone className="h-4 w-4" />
            </span>
          )}
        </div>
      </div>

      {partner.pickupOtp ? (
        <div className="mb-4 rounded-2xl border-2 border-dashed border-[#2F6BFF]/30 bg-[#F3F7FF] p-4 text-center">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#2F6BFF]">
            Pickup OTP
          </p>
          <div className="mt-1 flex items-center justify-center gap-2">
            <span className="text-[32px] font-extrabold tracking-[0.3em] text-[#0F172A]">
              {partner.pickupOtp}
            </span>
            <button
              type="button"
              onClick={copyOtp}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm"
              aria-label="Copy OTP"
            >
              <Copy className="h-4 w-4 text-[#2F6BFF]" />
            </button>
          </div>
          <p className="mt-1 text-[11px] text-gray-600">
            Share this OTP only when handing over the parcel
          </p>
        </div>
      ) : null}

      <div className="mb-4 flex items-center gap-2 rounded-2xl border border-[#E8EEF7] bg-white p-3 shadow-sm">
        <Shield className="h-4 w-4 text-[#2F6BFF]" />
        <p className="text-[12px] text-gray-600">
          Parcel insured up to ₹5,000 · Live tracking enabled
        </p>
      </div>

      <div className="rounded-2xl border border-[#E8EEF7] bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-gray-500">Delivery fare</span>
          <span className="text-[16px] font-extrabold text-[#0F172A]">
            {inr(activeShipment?.total ?? total)}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-gray-400">
          ETA ~
          {Math.max(1, Math.round(Number(trip?.durationMin || 12)))} min
        </p>
      </div>

      <StickyBar>
        <div className="flex gap-2">
          <PrimaryButton
            variant="outline"
            className="flex-1 border-[#2F6BFF]/25 text-[#2F6BFF]"
            onClick={() => navigate(getPorterCancelPath())}
          >
            Cancel
          </PrimaryButton>
          <PrimaryButton
            className={`flex-[2] ${BTN_BLUE}`}
            onClick={() => navigate(getPorterTrackingPath())}
          >
            <Navigation className="h-4 w-4" />
            Track parcel
          </PrimaryButton>
        </div>
      </StickyBar>
    </Screen>
  );
}
