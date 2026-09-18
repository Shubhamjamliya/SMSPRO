import { useEffect, useRef, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  QrCode,
  Shield,
  Wallet,
} from "lucide-react";
import ActionSlider from "@/modules/DeliveryV2/components/ui/ActionSlider";

const OTP_LEN = 6;
const ACCENT = "#FF6A00";

const PHASE_META = {
  to_pickup: {
    eyebrow: "En route",
    title: "Head to pickup",
    hint: "Swipe when you arrive at the passenger",
  },
  at_pickup: {
    eyebrow: "At pickup",
    title: "Verify & start",
    hint: "Ask the rider for their 6-digit OTP",
  },
  to_drop: {
    eyebrow: "Trip in progress",
    title: "Head to drop",
    hint: "Swipe when you reach the destination",
  },
  payment: {
    eyebrow: "Trip finished",
    title: "Collect payment",
    hint: "Rider can pay online, or collect via QR / cash",
  },
  other: {
    eyebrow: "Taxi ride",
    title: "Ride update",
    hint: "",
  },
};

function FareBreakdown({ fare, breakdown, coupon }) {
  const waitMin = Number(breakdown?.waitingMin ?? fare?.waitingMin ?? 0);
  const billableWait = Number(breakdown?.billableWaitMin ?? 0);
  const waitRate = Number(breakdown?.perMinWaitRate ?? fare?.perMinWaitRate ?? 0);
  const discount = Number(
    breakdown?.discount ?? fare?.discount ?? coupon?.discountAmount ?? 0,
  );
  const originalTotal = Number(
    breakdown?.originalTotal ?? fare?.originalTotal ?? 0,
  );
  const surgeAmt = Number(breakdown?.timeSlotSurge ?? fare?.timeSlotSurge ?? 0);
  const surgeName =
    breakdown?.surgeSlotName || fare?.surgeSlotName || "Peak surge";
  const couponCode = breakdown?.couponCode || coupon?.code;
  const couponName = breakdown?.couponName || coupon?.name;

  const rows = [
    ["Base fare", breakdown?.base ?? fare?.base],
    ["Distance", breakdown?.distance ?? fare?.distance],
    [
      waitMin > 0
        ? `Waiting (${waitMin} min${billableWait > 0 && waitRate > 0 ? ` · ₹${waitRate}/min after free` : ""})`
        : "Waiting",
      breakdown?.waiting ?? fare?.waiting,
    ],
    [surgeName, surgeAmt],
    ["Platform fee", breakdown?.platformFee ?? fare?.platformFee],
  ].filter(([, v]) => v != null && Number(v) !== 0);

  if (!rows.length && fare?.total == null && breakdown?.total == null) return null;

  return (
    <div className="space-y-1.5 rounded-2xl border border-black/[0.05] bg-neutral-50 px-3.5 py-3 text-[11px] text-neutral-600">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-400">
        Fare breakdown
      </p>
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-2">
          <span className="min-w-0 pr-2">{label}</span>
          <span className="shrink-0 font-semibold tabular-nums text-neutral-900">
            ₹{Number(value).toFixed(0)}
          </span>
        </div>
      ))}
      {(breakdown?.surgeMultiplier ?? fare?.surgeMultiplier) > 1 ? (
        <div className="flex justify-between gap-2">
          <span>Distance surge</span>
          <span className="font-semibold">
            {Number(breakdown?.surgeMultiplier ?? fare?.surgeMultiplier).toFixed(1)}x
          </span>
        </div>
      ) : null}
      {discount > 0 ? (
        <div className="flex justify-between gap-2 text-emerald-700">
          <span className="min-w-0 pr-2">
            Offer{couponCode ? ` · ${couponCode}` : ""}
            {couponName ? ` (${couponName})` : ""}
          </span>
          <span className="shrink-0 font-semibold tabular-nums">
            −₹{discount.toFixed(0)}
          </span>
        </div>
      ) : null}
      {originalTotal > 0 && discount > 0 ? (
        <div className="flex justify-between gap-2 text-neutral-400">
          <span>Before offer</span>
          <span className="tabular-nums line-through">₹{originalTotal.toFixed(0)}</span>
        </div>
      ) : null}
      <div className="flex justify-between gap-2 border-t border-black/[0.06] pt-2 text-[13px] font-extrabold text-neutral-950">
        <span>Total</span>
        <span className="tabular-nums">
          ₹{Number(breakdown?.total ?? fare?.total ?? 0).toFixed(0)}
        </span>
      </div>
      {Number(breakdown?.driverShare ?? fare?.driverShare) > 0 ? (
        <div className="flex justify-between gap-2 text-[11px] text-neutral-500">
          <span>Your share</span>
          <span className="font-semibold tabular-nums text-neutral-800">
            ₹{Number(breakdown?.driverShare ?? fare?.driverShare).toFixed(0)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function RouteStops({ pickupAddress, dropAddress, emphasize }) {
  return (
    <div className="rounded-2xl border border-black/[0.05] bg-white px-3.5 py-3">
      <div className="flex gap-3">
        <div className="flex flex-col items-center pt-1">
          <span
            className={`h-2.5 w-2.5 rounded-full ring-4 ${
              emphasize === "pickup"
                ? "bg-emerald-500 ring-emerald-100"
                : "bg-emerald-500/70 ring-emerald-50"
            }`}
          />
          <span className="my-1 min-h-[1.5rem] w-px flex-1 border-l border-dashed border-neutral-300" />
        </div>
        <div className="min-w-0 flex-1 pb-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600/80">
            Pickup
          </p>
          <p className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-snug text-neutral-900">
            {pickupAddress}
          </p>
        </div>
      </div>
      <div className="flex gap-3">
        <div className="flex flex-col items-center pt-1">
          <span
            className={`h-2.5 w-2.5 rounded-full ring-4 ${
              emphasize === "drop"
                ? "bg-red-500 ring-red-100"
                : "bg-red-500/70 ring-red-50"
            }`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-red-500/80">
            Drop
          </p>
          <p className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-snug text-neutral-900">
            {dropAddress}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Partner-side taxi ride actions + payment collection.
 * Phases: to_pickup → at_pickup (OTP) → to_drop → payment.
 */
export default function TaxiRideActionModal({
  order,
  status,
  isWithinRange = true,
  distanceToTarget,
  eta,
  onArrivedPickup,
  onStartTrip,
  onReachDrop,
  onCompleteTrip,
  onCreateQr,
  onCollectCash,
  onRefreshPayment,
  onMinimize,
  busy = false,
}) {
  const [otpDigits, setOtpDigits] = useState(Array(OTP_LEN).fill(""));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [qrUrl, setQrUrl] = useState(
    order?.payment?.shortUrl || order?.payment?.qr?.shortUrl || "",
  );
  const otpRefs = useRef([]);

  const pickupAddress =
    order?.pickup?.address ||
    order?.restaurantLocation?.address ||
    "Pickup location";
  const dropAddress =
    order?.drop?.address ||
    order?.customerLocation?.address ||
    "Drop location";
  const fare = Number(
    order?.fare?.total ?? order?.fareEstimateTotal ?? order?.total ?? 0,
  );
  const rideLabel = order?.rideNumber || order?.orderId || "Taxi ride";
  const paymentStatus = String(order?.payment?.status || "pending").toLowerCase();
  const isPaid = paymentStatus === "paid";
  const riderPhone = String(
    order?.rider?.phone ||
      order?.userPhone ||
      order?.user?.phone ||
      order?.customerPhone ||
      order?.phone ||
      "",
  ).trim();
  const callHref = riderPhone
    ? `tel:${riderPhone.replace(/[^\d+]/g, "")}`
    : null;

  const distanceKm =
    distanceToTarget != null && distanceToTarget !== Infinity
      ? (distanceToTarget / 1000).toFixed(1)
      : null;

  const otpValue = otpDigits.join("");
  const otpReady = otpValue.length === OTP_LEN && /^\d+$/.test(otpValue);

  const phase =
    status === "PICKING_UP"
      ? "to_pickup"
      : status === "REACHED_PICKUP"
        ? "at_pickup"
        : status === "AWAITING_PAYMENT"
          ? "payment"
          : status === "PICKED_UP" || status === "REACHED_DROP"
            ? "to_drop"
            : "other";

  const meta = PHASE_META[phase] || PHASE_META.other;
  const emphasize = phase === "to_drop" || phase === "payment" ? "drop" : "pickup";

  useEffect(() => {
    setQrUrl(order?.payment?.shortUrl || order?.payment?.qr?.shortUrl || "");
  }, [order?.payment?.shortUrl, order?.payment?.qr?.shortUrl]);

  useEffect(() => {
    if (status !== "AWAITING_PAYMENT" || isPaid || !onRefreshPayment) return undefined;
    const id = setInterval(() => {
      onRefreshPayment()?.catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [status, isPaid, onRefreshPayment]);

  useEffect(() => {
    setOtpDigits(Array(OTP_LEN).fill(""));
    setError("");
  }, [status, order?.id, order?._id]);

  const setOtpAt = (index, value) => {
    const digit = String(value || "").replace(/\D/g, "").slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    setError("");
    if (digit && index < OTP_LEN - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const onOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const onOtpPaste = (e) => {
    const text = e.clipboardData?.getData("text") || "";
    const digits = text.replace(/\D/g, "").slice(0, OTP_LEN).split("");
    if (!digits.length) return;
    e.preventDefault();
    const next = Array(OTP_LEN).fill("");
    digits.forEach((d, i) => {
      next[i] = d;
    });
    setOtpDigits(next);
    setError("");
    const focusAt = Math.min(digits.length, OTP_LEN - 1);
    otpRefs.current[focusAt]?.focus();
  };

  const run = async (fn) => {
    if (!fn || submitting || busy) return;
    setSubmitting(true);
    setError("");
    try {
      return await fn();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Action failed");
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-[120]">
      <div className="mx-auto w-full max-w-lg overflow-hidden rounded-t-[1.75rem] border border-black/[0.06] border-b-0 bg-white shadow-[0_-20px_60px_rgba(15,23,42,0.18)]">
        {/* Handle */}
        <div className="flex justify-center pt-2.5">
          <button
            type="button"
            onClick={onMinimize}
            className="flex flex-col items-center rounded-full px-4 py-1 active:bg-neutral-50"
            aria-label="Minimize"
          >
            <span className="mb-0.5 h-1 w-10 rounded-full bg-[#FF6A00]/30" />
            <ChevronDown className="h-4 w-4 text-neutral-400" />
          </button>
        </div>

        <div className="space-y-3.5 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                className="text-[11px] font-bold uppercase tracking-[0.12em]"
                style={{ color: ACCENT }}
              >
                Taxi · {rideLabel}
              </p>
              <h3 className="mt-0.5 text-[1.25rem] font-extrabold tracking-tight text-neutral-950">
                {meta.title}
              </h3>
              {meta.hint ? (
                <p className="mt-0.5 text-[11px] font-medium text-neutral-500">
                  {meta.hint}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {callHref ? (
                <a
                  href={callHref}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 transition active:scale-95"
                  aria-label="Call rider"
                  title={riderPhone}
                >
                  <Phone className="h-4 w-4" />
                </a>
              ) : null}
              <div className="rounded-2xl bg-neutral-950 px-3 py-2 text-right text-white">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60">
                  Fare
                </p>
                <p className="mt-0.5 text-base font-extrabold tabular-nums leading-none">
                  ₹{Number.isFinite(fare) ? fare.toFixed(0) : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Live distance chip */}
          {phase !== "payment" && (distanceKm || eta) ? (
            <div className="flex flex-wrap items-center gap-2">
              {distanceKm ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold text-neutral-700 ring-1 ring-black/[0.05]">
                  <Navigation className="h-3 w-3 text-neutral-400" />
                  {distanceKm} km
                </span>
              ) : null}
              {eta ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold text-neutral-700 ring-1 ring-black/[0.05]">
                  <Clock3 className="h-3 w-3 text-neutral-400" />
                  ~{eta} min
                </span>
              ) : null}
              {!isWithinRange && phase === "to_pickup" ? (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-100">
                  Get closer to unlock
                </span>
              ) : null}
            </div>
          ) : null}

          {phase !== "payment" ? (
            <RouteStops
              pickupAddress={pickupAddress}
              dropAddress={dropAddress}
              emphasize={emphasize}
            />
          ) : null}

          {error ? (
            <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600">
              {error}
            </p>
          ) : null}

          {/* ─── To pickup ─── */}
          {phase === "to_pickup" ? (
            <ActionSlider
              disabled={!isWithinRange || submitting || busy}
              color="bg-[#FF6A00]"
              label={
                submitting
                  ? "Updating…"
                  : isWithinRange
                    ? "Slide when arrived at pickup"
                    : "Get closer to pickup"
              }
              lockedLabel={
                distanceKm
                  ? `${distanceKm} km away · move closer`
                  : "Get closer to pickup"
              }
              successLabel="Arrived ✓"
              onConfirm={() => run(onArrivedPickup)}
            />
          ) : null}

          {/* ─── OTP / start ─── */}
          {phase === "at_pickup" ? (
            <div className="space-y-3.5">
              <div className="rounded-2xl border border-[#FF6A00]/20 bg-gradient-to-b from-[#FFF8F2] to-white px-3.5 py-4 text-center">
                <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#FF6A00]">
                  <Shield className="h-3.5 w-3.5" />
                  Rider OTP
                </p>
                <div className="mt-3.5 flex justify-center gap-2" onPaste={onOtpPaste}>
                  {otpDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => {
                        otpRefs.current[index] = el;
                      }}
                      id={`taxi-otp-${index}`}
                      inputMode="numeric"
                      autoComplete={index === 0 ? "one-time-code" : "off"}
                      maxLength={1}
                      value={digit}
                      onChange={(e) => setOtpAt(index, e.target.value)}
                      onKeyDown={(e) => onOtpKeyDown(index, e)}
                      className="h-12 w-10 rounded-xl border border-black/[0.08] bg-white text-center text-lg font-extrabold text-neutral-950 outline-none transition focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20"
                      aria-label={`OTP digit ${index + 1}`}
                    />
                  ))}
                </div>
              </div>
              <button
                type="button"
                disabled={!otpReady || submitting || busy}
                onClick={() => run(() => onStartTrip(otpValue))}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#FF6A00] text-sm font-bold text-white shadow-[0_8px_24px_rgba(255,106,0,0.28)] transition active:scale-[0.99] disabled:opacity-50 disabled:shadow-none"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Start trip
              </button>
            </div>
          ) : null}

          {/* ─── To drop ─── */}
          {phase === "to_drop" ? (
            <ActionSlider
              disabled={submitting || busy}
              color="bg-[#FF6A00]"
              label={submitting ? "Updating…" : "Slide when reached drop"}
              lockedLabel="Updating…"
              successLabel="Reached drop ✓"
              onConfirm={() => run(onReachDrop || onCompleteTrip)}
            />
          ) : null}

          {/* ─── Payment ─── */}
          {phase === "payment" ? (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-2xl border border-black/[0.05] bg-gradient-to-br from-[#FFF8F2] via-white to-white px-4 py-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-400">
                  Amount due
                </p>
                <p className="mt-1 text-[2rem] font-black leading-none tracking-tight text-neutral-950 tabular-nums">
                  ₹{Number.isFinite(fare) ? fare.toFixed(0) : "—"}
                </p>
                <p className="mt-2 flex items-start gap-1.5 text-[11px] text-neutral-500">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-neutral-400" />
                  <span className="line-clamp-2">{dropAddress}</span>
                </p>
              </div>

              <FareBreakdown
                fare={order?.fare}
                breakdown={order?.fareBreakdown}
                coupon={order?.coupon}
              />

              <div
                className={`rounded-2xl px-3.5 py-2.5 text-center text-xs font-bold ${
                  isPaid
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border border-amber-200/80 bg-amber-50 text-amber-900"
                }`}
              >
                {isPaid
                  ? `Paid · ${String(order?.payment?.method || "online").replace(/_/g, " ")}`
                  : "Payment pending — online, QR, or cash"}
              </div>

              {qrUrl && !isPaid ? (
                <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-black/[0.05] bg-neutral-50 p-4">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrUrl)}`}
                    alt="Payment QR"
                    className="h-40 w-40 rounded-xl bg-white shadow-sm"
                  />
                  <p className="text-[11px] font-medium text-neutral-500">
                    Ask rider to scan & pay
                  </p>
                  <a
                    href={qrUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-[#FF6A00]"
                  >
                    Open payment link
                  </a>
                </div>
              ) : null}

              {!isPaid ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={submitting || busy}
                    onClick={() =>
                      run(async () => {
                        const data = await onCreateQr?.();
                        const url =
                          data?.qr?.shortUrl || data?.ride?.payment?.shortUrl;
                        if (url) setQrUrl(url);
                      })
                    }
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#FF6A00]/25 bg-[#FFF4ED] text-sm font-bold text-[#FF6A00] transition active:scale-[0.99] disabled:opacity-50"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <QrCode className="h-4 w-4" />
                    )}
                    Take QR
                  </button>
                  <button
                    type="button"
                    disabled={submitting || busy}
                    onClick={() => run(onCollectCash)}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-neutral-950 text-sm font-bold text-white transition active:scale-[0.99] disabled:opacity-50"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Banknote className="h-4 w-4" />
                    )}
                    Take cash
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={submitting || busy}
                  onClick={() => run(onCompleteTrip)}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#FF6A00] text-sm font-bold text-white shadow-[0_8px_24px_rgba(255,106,0,0.28)] transition active:scale-[0.99] disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Mark ride complete
                </button>
              )}

              {!isPaid ? (
                <p className="flex items-center justify-center gap-1.5 text-[11px] text-neutral-500">
                  <Wallet className="h-3.5 w-3.5" />
                  Waiting for rider wallet / UPI…
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
