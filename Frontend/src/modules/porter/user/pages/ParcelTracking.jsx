import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Phone, Check, Loader2, MapPin, Copy, Wallet, Smartphone } from "lucide-react";
import { toast } from "sonner";
import Screen from "../components/Screen";
import LiveTripMap from "../components/LiveTripMap";
import PorterLoadingTimer from "@/modules/DeliveryV2/components/modals/PorterLoadingPanel";
import { PrimaryButton, StickyBar } from "../components/ui";
import { useBooking } from "../context/BookingContext";
import {
  getPorterRatePath,
  getPorterInvoicePath,
  getPorterFindingPartnerPath,
  getPorterPartnerAssignedPath,
  getPorterHomePath,
  getPorterSosPath,
} from "../utils/routes";
import { porterUserApi } from "../services/api";
import { initRazorpayPayment } from "@food/utils/razorpay";
import { userAPI } from "@food/api";
import {
  TRACKING_TIMELINE,
  formatTripStatusLabel,
  mapPartnerFromTrip,
  trackingStageIndex,
} from "../utils/tripShipment";

const BTN_BLUE =
  "!bg-[#2F6BFF] !shadow-[0_10px_24px_rgba(47,107,255,0.35)] hover:!bg-[#2557D6]";

const OTP_VISIBLE_STATUSES = new Set(["assigned", "en_route_pickup", "at_pickup"]);
const DROP_OTP_STATUSES = new Set(["at_drop", "awaiting_payment"]);

export default function ParcelTracking() {
  const navigate = useNavigate();
  const { activeShipment, setActiveShipment } = useBooking();
  const [loading, setLoading] = useState(!activeShipment?.trip);
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

  const [paymentBusy, setPaymentBusy] = useState(false);
  const trip = activeShipment?.trip;
  const partner = activeShipment?.partner;
  const status = activeShipment?.status || trip?.status || "";
  const stageIdx = trackingStageIndex(status);
  const delivered = status === "completed";
  const cancelled = String(status).startsWith("cancelled");
  const isLoading = status === "loading";
  const awaitingExtra = status === "awaiting_payment";
  const extraDue = Number(trip?.payment?.extraDue || 0);
  const paymentMethod = String(trip?.payment?.method || "").toLowerCase();
  const isCash = paymentMethod === "cash" || paymentMethod === "cod";
  const isPrepaid = ["wallet", "upi", "razorpay"].includes(paymentMethod);
  // Dues at drop: full COD fare, or prepaid loading overtime only
  const duesCleared = !(extraDue > 0.009);
  // Show wallet/online whenever money is still due (COD full fare or prepaid overtime).
  // Hide only when prepaid with nothing left to pay.
  const showUserPayOptions = awaitingExtra && !duesCleared;

  const applyTripUpdate = useCallback(
    (next) => {
      if (!next) return;
      const mapped = mapPartnerFromTrip(next);
      setActiveShipment((prev) => ({
        ...(prev || {}),
        id: next.id || prev?.id,
        trackingId: next.tripNumber || prev?.trackingId,
        status: next.status,
        stage: next.status,
        partner: mapped || prev?.partner || null,
        total: next.fare?.total ?? next.fareEstimateTotal ?? prev?.total,
        pickup: next.pickup || prev?.pickup,
        delivery: next.drop || prev?.delivery,
        trip: {
          ...next,
          // Keep drop OTP across payment-status polls that may omit it
          dropOtp: next.dropOtp || prev?.trip?.dropOtp,
          deliveryOtp: next.deliveryOtp || prev?.trip?.deliveryOtp,
        },
      }));
    },
    [setActiveShipment],
  );
  const dropOtp = useMemo(() => {
    const otp = String(trip?.dropOtp || "").trim();
    if (!otp || delivered || cancelled) return "";
    if (!DROP_OTP_STATUSES.has(String(status))) return "";
    return otp;
  }, [trip?.dropOtp, status, delivered, cancelled]);

  useEffect(() => {
    if (!tripId) {
      setLoading(false);
      return undefined;
    }
    let cancelledPoll = false;
    let timer = null;

    const load = async () => {
      try {
        const next = awaitingExtra
          ? await porterUserApi.getPaymentStatus(tripId)
          : await porterUserApi.getTrip(tripId);
        if (cancelledPoll || !next) return;

        applyTripUpdate(next);

        if (["quoted", "searching"].includes(next.status) && !next?.dispatch?.deliveryPartnerId) {
          navigate(getPorterFindingPartnerPath(), { replace: true });
          return;
        }
      } catch (err) {
        if (!cancelledPoll) {
          toast.error(err?.response?.data?.message || "Could not refresh tracking");
        }
      } finally {
        if (!cancelledPoll) setLoading(false);
      }
      if (!cancelledPoll && !delivered && !cancelled) {
        timer = setTimeout(load, awaitingExtra ? 3000 : 4000);
      }
    };

    load();
    return () => {
      cancelledPoll = true;
      if (timer) clearTimeout(timer);
    };
  }, [tripId, navigate, applyTripUpdate, delivered, cancelled, awaitingExtra]);

  const driverLocation = useMemo(() => {
    if (partner?.lastLat != null && partner?.lastLng != null) {
      return { lat: partner.lastLat, lng: partner.lastLng };
    }
    if (trip?.lastDriverLocation?.lat != null) {
      return {
        lat: trip.lastDriverLocation.lat,
        lng: trip.lastDriverLocation.lng,
      };
    }
    return null;
  }, [partner, trip]);

  const pickupOtp = useMemo(() => {
    const otp = String(
      trip?.deliveryOtp
      || partner?.pickupOtp
      || activeShipment?.partner?.pickupOtp
      || "",
    ).trim();
    if (!otp) return "";
    if (delivered || cancelled) return "";
    if (status && !OTP_VISIBLE_STATUSES.has(String(status))) return "";
    return otp;
  }, [trip, partner, activeShipment, status, delivered, cancelled]);

  const copyOtp = () => {
    if (!pickupOtp) return;
    navigator.clipboard?.writeText(pickupOtp);
    toast.success("OTP copied");
  };

  const handlePayWallet = async () => {
    if (!tripId || paymentBusy || !showUserPayOptions) return;
    try {
      setPaymentBusy(true);
      const next = await porterUserApi.payWithWallet(tripId);
      applyTripUpdate(next);
      toast.success("Paid with wallet");
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Wallet payment failed");
    } finally {
      setPaymentBusy(false);
    }
  };

  const handlePayOnline = async () => {
    if (!tripId || paymentBusy || !showUserPayOptions) return;
    try {
      setPaymentBusy(true);
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
        /* optional prefill */
      }

      await initRazorpayPayment({
        key,
        amount,
        currency: razorpay.currency || "INR",
        order_id: orderId,
        name: "Just Order Porter",
        description: `Porter fare · ${trip?.tripNumber || ""}`,
        prefill,
        notes: { type: "porter_trip_drop", tripId: String(tripId) },
        handler: async (response) => {
          try {
            const next = await porterUserApi.verifyRazorpayPayment(tripId, {
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            applyTripUpdate(next);
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

  if (!tripId) {
    return (
      <Screen title="Track parcel">
        <p className="text-[14px] text-gray-500">No active shipment to track.</p>
        <PrimaryButton className={`mt-4 ${BTN_BLUE}`} onClick={() => navigate(getPorterHomePath())}>
          Back to home
        </PrimaryButton>
      </Screen>
    );
  }

  if (loading && !trip) {
    return (
      <Screen title="Track parcel" subtitle="Loading…">
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-[13px] text-gray-500">
          <Loader2 className="h-7 w-7 animate-spin text-[#2F6BFF]" />
          Loading live tracking…
        </div>
      </Screen>
    );
  }

  const phoneHref = partner?.phone
    ? `tel:${String(partner.phone).replace(/\s/g, "")}`
    : null;

  return (
    <Screen
      title="Track parcel"
      subtitle={activeShipment?.trackingId || trip?.tripNumber || "Live tracking"}
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
      <LiveTripMap
        pickup={trip?.pickup || activeShipment?.pickup}
        drop={trip?.drop || activeShipment?.delivery}
        driverLocation={driverLocation}
        height={240}
        className="mb-4"
      />

      <div className="mb-3 flex items-center justify-between rounded-2xl border border-[#E8EEF7] bg-white px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
            Current status
          </p>
          <p className="truncate text-[14px] font-extrabold capitalize text-[#0F172A]">
            {formatTripStatusLabel(status)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${
            delivered
              ? "bg-green-50 text-[#16A34A]"
              : cancelled
                ? "bg-gray-100 text-gray-500"
                : "bg-[#EEF3FF] text-[#2F6BFF]"
          }`}
        >
          {delivered ? "Done" : cancelled ? "Cancelled" : "Live"}
        </span>
      </div>

      {partner ? (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[#E8EEF7] bg-white p-3 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-[#EEF3FF] text-[16px] font-bold text-[#2F6BFF]">
            {partner.photo ? (
              <img src={partner.photo} alt="" className="h-full w-full object-cover" />
            ) : (
              (partner.name || "P").charAt(0)
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold text-[#0F172A]">{partner.name}</p>
            <p className="text-[11px] text-gray-500">
              {partner.vehicle} · {partner.vehicleNumber}
            </p>
          </div>
          {phoneHref ? (
            <a
              href={phoneHref}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2F6BFF] text-white"
              aria-label="Call partner"
            >
              <Phone className="h-4 w-4" />
            </a>
          ) : (
            <button
              type="button"
              onClick={() => navigate(getPorterPartnerAssignedPath())}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EEF3FF] text-[#2F6BFF]"
            >
              <MapPin className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : null}

      {isLoading && trip ? (
        <div className="mb-4">
          <PorterLoadingTimer trip={trip} />
          <p className="mt-2 text-center text-[12px] font-semibold text-[#64748B]">
            Your partner is loading the parcel. Overtime applies after the free window.
          </p>
        </div>
      ) : null}

      {awaitingExtra ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          {!duesCleared ? (
            <>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700">
                {isCash ? "Pay on delivery" : "Loading overtime due"}
              </p>
              <p className="mt-1 text-[22px] font-black text-[#0F172A]">
                ₹{Math.round(extraDue)}
              </p>
              <p className="mt-1 text-[12px] font-semibold text-[#64748B]">
                {isCash
                  ? "Pay online or from wallet, or share the drop OTP for cash / QR collection."
                  : "Pay the overtime online or from wallet, then share the drop OTP."}
              </p>
            </>
          ) : (
            <p className="text-[12px] font-semibold text-[#64748B]">
              {isPrepaid
                ? "Trip is prepaid. Share the drop OTP so your partner can complete delivery."
                : "Payment received. Share the drop OTP so your partner can complete delivery."}
            </p>
          )}

          {dropOtp ? (
            <div className="mt-3 rounded-2xl border border-dashed border-[#2F6BFF]/40 bg-white p-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#2F6BFF]">
                Drop OTP
              </p>
              <p className="mt-1 font-mono text-[28px] font-black tracking-[0.28em] text-[#0F172A]">
                {dropOtp}
              </p>
              <p className="mt-1 text-[11px] text-gray-500">
                Share this OTP with your partner at drop
              </p>
            </div>
          ) : null}

          {showUserPayOptions ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={paymentBusy}
                onClick={handlePayWallet}
                className="inline-flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-2xl border border-[#2F6BFF]/25 bg-white px-2 py-2.5 text-[#2F6BFF] disabled:opacity-50"
              >
                {paymentBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wallet className="h-4 w-4" />
                )}
                <span className="text-[12px] font-semibold">Pay via wallet</span>
              </button>
              <button
                type="button"
                disabled={paymentBusy}
                onClick={handlePayOnline}
                className="inline-flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-2xl bg-[#2F6BFF] px-2 py-2.5 text-white disabled:opacity-50"
              >
                {paymentBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Smartphone className="h-4 w-4" />
                )}
                <span className="text-[12px] font-semibold">Pay online</span>
              </button>
            </div>
          ) : duesCleared ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-center text-[12px] font-bold text-emerald-700">
              No balance due — waiting for partner to complete delivery
            </div>
          ) : null}
        </div>
      ) : null}

      {dropOtp && !awaitingExtra ? (
        <div className="mb-4 rounded-2xl border-2 border-dashed border-[#2F6BFF]/30 bg-[#F3F7FF] p-4 text-center">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#2F6BFF]">
            Drop OTP
          </p>
          <p className="mt-1 font-mono text-[32px] font-extrabold tracking-[0.3em] text-[#0F172A]">
            {dropOtp}
          </p>
          <p className="mt-2 text-[11px] text-gray-500">
            Share this OTP with your partner at drop
          </p>
        </div>
      ) : null}

      {pickupOtp ? (
        <div className="mb-4 rounded-2xl border-2 border-dashed border-[#2F6BFF]/30 bg-[#F3F7FF] p-4 text-center">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#2F6BFF]">
            Pickup OTP
          </p>
          <div className="mt-1 flex items-center justify-center gap-2">
            <span className="text-[32px] font-extrabold tracking-[0.3em] text-[#0F172A]">
              {pickupOtp}
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
          <p className="mt-2 text-[11px] text-gray-500">
            Share this OTP only when handing over the parcel
          </p>
        </div>
      ) : null}

      {(trip?.pickup || trip?.drop) && (
        <div className="mb-4 rounded-2xl border border-[#E8EEF7] bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-start gap-2">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#22C55E]" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase text-[#94A3B8]">Pickup</p>
              <p className="truncate text-[13px] font-semibold text-[#0F172A]">
                {trip?.pickup?.address || "—"}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2F6BFF]" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase text-[#94A3B8]">Drop</p>
              <p className="truncate text-[13px] font-semibold text-[#0F172A]">
                {trip?.drop?.address || "—"}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[#E8EEF7] bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-[14px] font-bold text-[#0F172A]">Shipment progress</h2>
        <div className="space-y-0">
          {TRACKING_TIMELINE.map((s, i) => {
            const done = stageIdx >= 0 && i <= stageIdx;
            const active = stageIdx >= 0 && i === stageIdx;
            return (
              <div key={s.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <motion.div
                    animate={active ? { scale: [1, 1.08, 1] } : {}}
                    transition={{ duration: 1.5, repeat: active ? Infinity : 0 }}
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                      done ? "bg-[#2F6BFF] text-white" : "bg-[#EEF3FF] text-[#94A3B8]"
                    }`}
                  >
                    {done && i < stageIdx ? <Check className="h-4 w-4" /> : i + 1}
                  </motion.div>
                  {i < TRACKING_TIMELINE.length - 1 && (
                    <div
                      className={`my-1 h-8 w-0.5 ${
                        i < stageIdx ? "bg-[#2F6BFF]" : "bg-[#E2E8F0]"
                      }`}
                    />
                  )}
                </div>
                <div className="pb-6 pt-1">
                  <p
                    className={`text-[14px] font-bold ${
                      active
                        ? "text-[#2F6BFF]"
                        : done
                          ? "text-[#0F172A]"
                          : "text-gray-400"
                    }`}
                  >
                    {s.label}
                  </p>
                  {active ? (
                    <p className="text-[11px] text-gray-500">Updated just now</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(Number(trip?.fare?.waiting) > 0 || Number(trip?.billableLoadingMin) > 0)
        && !isLoading
        && !awaitingExtra ? (
        <div className="mt-4 rounded-2xl border border-[#E8EEF7] bg-white px-4 py-3 text-[12px] font-semibold text-[#475569] shadow-sm">
          <p className="font-bold text-[#0F172A]">Fare includes loading overtime</p>
          <div className="mt-2 space-y-1">
            <div className="flex justify-between">
              <span>Base trip</span>
              <span>₹{Math.round(Number(trip?.fareEstimateTotal || 0))}</span>
            </div>
            <div className="flex justify-between">
              <span>
                Loading overtime ({Number(trip?.billableLoadingMin || 0)} min)
              </span>
              <span>₹{Math.round(Number(trip?.fare?.waiting || 0))}</span>
            </div>
            <div className="flex justify-between border-t border-[#E2E8F0] pt-1 font-bold text-[#0F172A]">
              <span>
                {String(trip?.payment?.method || "").toLowerCase() === "cash"
                  ? "Pay on delivery"
                  : "Total"}
              </span>
              <span>₹{Math.round(Number(trip?.fare?.total || activeShipment?.total || 0))}</span>
            </div>
          </div>
        </div>
      ) : null}

      <StickyBar>
        {delivered ? (
          <div className="flex gap-2">
            <PrimaryButton
              variant="outline"
              className="flex-1 border-[#2F6BFF]/25 text-[#2F6BFF]"
              onClick={() => navigate(getPorterInvoicePath(tripId))}
            >
              View invoice
            </PrimaryButton>
            <PrimaryButton className={`flex-1 ${BTN_BLUE}`} onClick={() => navigate(getPorterRatePath())}>
              Rate delivery
            </PrimaryButton>
          </div>
        ) : cancelled ? (
          <PrimaryButton className={BTN_BLUE} onClick={() => navigate(getPorterHomePath())}>
            Book again
          </PrimaryButton>
        ) : showUserPayOptions ? (
          <div className="grid grid-cols-2 gap-2">
            <PrimaryButton
              variant="outline"
              className="flex-1 border-[#2F6BFF]/25 text-[#2F6BFF]"
              disabled={paymentBusy}
              onClick={handlePayWallet}
            >
              {paymentBusy ? "Paying…" : "Pay wallet"}
            </PrimaryButton>
            <PrimaryButton
              className={`flex-1 ${BTN_BLUE}`}
              disabled={paymentBusy}
              onClick={handlePayOnline}
            >
              {paymentBusy ? "Paying…" : "Pay online"}
            </PrimaryButton>
          </div>
        ) : awaitingExtra ? (
          <PrimaryButton
            variant="outline"
            className="border-[#2F6BFF]/25 text-[#2F6BFF]"
            onClick={() => navigate(getPorterPartnerAssignedPath())}
          >
            {dropOtp
              ? `Drop OTP ${dropOtp}`
              : duesCleared
                ? "Share OTP with partner"
                : "Waiting for partner"}
          </PrimaryButton>
        ) : (
          <PrimaryButton
            variant="outline"
            className="border-[#2F6BFF]/25 text-[#2F6BFF]"
            onClick={() => navigate(getPorterPartnerAssignedPath())}
          >
            Partner details
          </PrimaryButton>
        )}
      </StickyBar>
    </Screen>
  );
}
