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
const ACCENT = "#2F6BFF";

export default function PorterDropActionModal({
  order,
  status,
  isWithinRange = true,
  distanceToTarget = 0,
  eta = null,
  onReachDrop,
  onCollectCash,
  onCreateQr,
  onRefreshPayment,
  onCompleteTrip,
  onMinimize,
  busy = false,
}) {
  const [otpDigits, setOtpDigits] = useState(Array(OTP_LEN).fill(""));
  const [otpVerified, setOtpVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const otpRefs = useRef([]);

  const phase =
    status === "AWAITING_PAYMENT"
      ? "payment"
      : status === "PICKED_UP" || status === "REACHED_DROP"
        ? "to_drop"
        : "other";

  const fareTotal = Number(order?.fare?.total ?? order?.total ?? 0);
  const amountDue = Number(
    order?.payment?.extraDue
      ?? (String(order?.payment?.method || "").toLowerCase() === "cash"
        || String(order?.payment?.method || "").toLowerCase() === "cod"
        ? fareTotal
        : 0),
  );
  const paymentMethod = String(order?.payment?.method || "cash").toLowerCase();
  const isCash = paymentMethod === "cash" || paymentMethod === "cod";
  const isPrepaid = ["wallet", "upi", "razorpay"].includes(paymentMethod);
  // Only amount still due matters — prepaid base may already be "paid" while overtime remains
  const isPaid = amountDue <= 0.009;
  const showCollectActions = !isPaid;
  const dropAddress =
    order?.customerAddress
    || order?.drop?.address
    || order?.dropPoint?.address
    || "Drop location";
  const phone = order?.userPhone || order?.drop?.phone || order?.rider?.phone || "";
  const callHref = phone ? `tel:${String(phone).replace(/\s/g, "")}` : null;
  const distanceKm =
    distanceToTarget > 0
      ? (distanceToTarget / 1000).toFixed(1)
      : order?.distanceKm
        ? Number(order.distanceKm).toFixed(1)
        : null;
  const tripLabel = order?.tripNumber || order?.orderId || "Parcel";
  const otpValue = otpDigits.join("");
  const otpReady = otpValue.length === OTP_LEN && /^\d+$/.test(otpValue);
  const loadingOvertime = Number(order?.fare?.waiting || 0);
  const billableMin = Number(order?.billableLoadingMin || order?.fare?.billableLoadingMin || 0);

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
    setOtpVerified(false);
    setError("");
  }, [status, order?.id, order?._id, order?.tripId]);

  const setOtpAt = (index, value) => {
    const digit = String(value || "").replace(/\D/g, "").slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    setError("");
    setOtpVerified(false);
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
    setOtpVerified(false);
    otpRefs.current[Math.min(digits.length, OTP_LEN - 1)]?.focus();
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

  const dueLabel = isCash
    ? "Collect from customer"
    : amountDue > 0
      ? "Extra / overtime due"
      : isPrepaid
        ? "Already paid — verify OTP"
        : "Already paid";

  return (
    <div className="absolute inset-x-0 bottom-0 z-[120]">
      <div className="mx-auto w-full max-w-lg overflow-hidden rounded-t-[1.75rem] border border-black/[0.06] border-b-0 bg-white shadow-[0_-20px_60px_rgba(15,23,42,0.18)]">
        <div className="flex justify-center pt-2.5">
          <button
            type="button"
            onClick={onMinimize}
            className="flex flex-col items-center rounded-full px-4 py-1 active:bg-neutral-50"
            aria-label="Minimize"
          >
            <span className="mb-0.5 h-1 w-10 rounded-full" style={{ background: `${ACCENT}33` }} />
            <ChevronDown className="h-4 w-4 text-neutral-400" />
          </button>
        </div>

        <div className="space-y-3.5 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: ACCENT }}>
                Porter · {tripLabel}
              </p>
              <h3 className="mt-0.5 text-[1.25rem] font-extrabold tracking-tight text-neutral-950">
                {phase === "payment" ? "Verify & collect" : "Head to drop"}
              </h3>
              <p className="mt-0.5 text-[11px] font-medium text-neutral-500">
                {phase === "payment"
                  ? "Enter customer drop OTP, then collect payment"
                  : "Swipe when you reach the drop location"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {callHref ? (
                <a
                  href={callHref}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                  aria-label="Call customer"
                >
                  <Phone className="h-4 w-4" />
                </a>
              ) : null}
              <div className="rounded-2xl bg-neutral-950 px-3 py-2 text-right text-white">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60">
                  {phase === "payment" ? "Due" : "Fare"}
                </p>
                <p className="mt-0.5 text-base font-extrabold tabular-nums leading-none">
                  ₹{phase === "payment" ? amountDue.toFixed(0) : fareTotal.toFixed(0)}
                </p>
              </div>
            </div>
          </div>

          {phase === "to_drop" && (distanceKm || eta) ? (
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
            </div>
          ) : null}

          {error ? (
            <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600">
              {error}
            </p>
          ) : null}

          {phase === "to_drop" ? (
            <ActionSlider
              disabled={!isWithinRange || submitting || busy}
              color="bg-[#2F6BFF]"
              label={
                submitting
                  ? "Updating…"
                  : isWithinRange
                    ? "Slide when reached drop"
                    : "Get closer to drop"
              }
              lockedLabel={
                distanceKm ? `${distanceKm} km away · move closer` : "Get closer to drop"
              }
              successLabel="Reached drop ✓"
              onConfirm={() => run(onReachDrop)}
            />
          ) : null}

          {phase === "payment" ? (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-2xl border border-black/[0.05] bg-gradient-to-br from-[#EEF4FF] via-white to-white px-4 py-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-400">
                  {dueLabel}
                </p>
                <p className="mt-1 text-[2rem] font-black leading-none tracking-tight text-neutral-950 tabular-nums">
                  ₹{amountDue.toFixed(0)}
                </p>
                <p className="mt-2 flex items-start gap-1.5 text-[11px] text-neutral-500">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-neutral-400" />
                  <span className="line-clamp-2">{dropAddress}</span>
                </p>
              </div>

              <div className="space-y-1 rounded-2xl bg-[#F8FAFC] px-3.5 py-3 text-[12px] font-semibold text-[#475569]">
                <div className="flex justify-between">
                  <span>Base trip</span>
                  <span>₹{Number(order?.fareEstimateTotal || 0).toFixed(0)}</span>
                </div>
                {(loadingOvertime > 0 || billableMin > 0) && (
                  <div className="flex justify-between">
                    <span>Loading overtime ({billableMin} min)</span>
                    <span>₹{loadingOvertime.toFixed(0)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-[#E2E8F0] pt-1 font-bold text-[#0F172A]">
                  <span>Trip total</span>
                  <span>₹{fareTotal.toFixed(0)}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-[#2F6BFF]/20 bg-gradient-to-b from-[#F3F7FF] to-white px-3.5 py-4 text-center">
                <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#2F6BFF]">
                  <Shield className="h-3.5 w-3.5" />
                  Drop OTP
                </p>
                <div className="mt-3.5 flex justify-center gap-2" onPaste={onOtpPaste}>
                  {otpDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => {
                        otpRefs.current[index] = el;
                      }}
                      inputMode="numeric"
                      autoComplete={index === 0 ? "one-time-code" : "off"}
                      maxLength={1}
                      value={digit}
                      onChange={(e) => setOtpAt(index, e.target.value)}
                      onKeyDown={(e) => onOtpKeyDown(index, e)}
                      className="h-12 w-10 rounded-xl border border-black/[0.08] bg-white text-center text-lg font-extrabold text-neutral-950 outline-none transition focus:border-[#2F6BFF] focus:ring-2 focus:ring-[#2F6BFF]/20"
                      aria-label={`OTP digit ${index + 1}`}
                    />
                  ))}
                </div>
                {!otpVerified ? (
                  <button
                    type="button"
                    disabled={!otpReady || submitting}
                    onClick={() => {
                      if (!otpReady) return;
                      setOtpVerified(true);
                    }}
                    className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#2F6BFF] px-4 text-sm font-bold text-white disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Confirm OTP
                  </button>
                ) : (
                  <p className="mt-3 text-[12px] font-bold text-emerald-600">OTP confirmed</p>
                )}
              </div>

              <div
                className={`rounded-2xl px-3.5 py-2.5 text-center text-xs font-bold ${
                  isPaid
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border border-amber-200/80 bg-amber-50 text-amber-900"
                }`}
              >
                {isPaid
                  ? isPrepaid
                    ? "No balance due — complete after OTP"
                    : "No balance due — complete after OTP"
                  : isCash
                    ? "COD — collect full fare via cash or QR"
                    : "Prepaid — collect overtime via cash, QR, or customer wallet"}
              </div>

              {qrUrl && showCollectActions ? (
                <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-black/[0.05] bg-neutral-50 p-4">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrUrl)}`}
                    alt="Payment QR"
                    className="h-40 w-40 rounded-xl bg-white shadow-sm"
                  />
                  <p className="text-[11px] font-medium text-neutral-500">
                    Ask customer to scan & pay
                  </p>
                </div>
              ) : null}

              {!otpVerified ? (
                <p className="text-center text-[11px] font-semibold text-neutral-500">
                  {showCollectActions
                    ? "Confirm drop OTP to unlock payment actions"
                    : "Confirm drop OTP to complete delivery"}
                </p>
              ) : showCollectActions ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={submitting || busy}
                    onClick={() =>
                      run(async () => {
                        const data = await onCreateQr?.(otpValue);
                        const url =
                          data?.qr?.shortUrl || data?.trip?.payment?.shortUrl;
                        if (url) setQrUrl(url);
                      })
                    }
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#2F6BFF]/25 bg-[#EEF4FF] text-sm font-bold text-[#2F6BFF] transition active:scale-[0.99] disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                    Take QR
                  </button>
                  <button
                    type="button"
                    disabled={submitting || busy}
                    onClick={() => run(() => onCollectCash?.(otpValue))}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-neutral-950 text-sm font-bold text-white transition active:scale-[0.99] disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                    Take cash
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={submitting || busy}
                  onClick={() => run(() => onCompleteTrip?.(otpValue))}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#2F6BFF] text-sm font-bold text-white shadow-[0_8px_24px_rgba(47,107,255,0.28)] transition active:scale-[0.99] disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Mark delivery complete
                </button>
              )}

              {showCollectActions ? (
                <p className="flex items-center justify-center gap-1.5 text-[11px] text-neutral-500">
                  <Wallet className="h-3.5 w-3.5" />
                  {isPrepaid
                    ? "Customer can also pay overtime from the track page"
                    : "Customer can also pay from the track page"}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
