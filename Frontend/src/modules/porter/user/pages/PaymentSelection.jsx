import React, { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Banknote,
  Check,
  Landmark,
  Smartphone,
  Wallet,
} from "lucide-react";
import { useBooking } from "../context/BookingContext";
import { getPorterFareEstimatePath } from "../utils/routes";
import { PAYMENT_METHODS } from "../utils/mock/payments";
import { saveBookingDraft, loadBookingDraft } from "@/shared/utils/bookingDraft";

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

function formatBookingDate(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function PaymentSelection() {
  const navigate = useNavigate();
  const {
    paymentMethodId,
    setPaymentMethodId,
    total,
    apiQuote,
    discount,
    scheduledAt,
  } = useBooking();

  useEffect(() => {
    if (!PAYMENT_METHODS.some((m) => m.id === paymentMethodId)) {
      setPaymentMethodId("cash");
    }
  }, [paymentMethodId, setPaymentMethodId]);

  const amountDue = useMemo(() => {
    const quoteTotal = Number(
      apiQuote?.fareEstimateTotal ?? apiQuote?.fare?.total ?? total ?? 0,
    );
    return Math.max(0, quoteTotal - Number(discount || 0));
  }, [apiQuote, total, discount]);

  const bookingDateLabel = useMemo(
    () => formatBookingDate(scheduledAt),
    [scheduledAt],
  );

  const selectMethod = (id) => {
    setPaymentMethodId(id);
    const draft = loadBookingDraft("porter") || {};
    saveBookingDraft("porter", { ...draft, paymentMethodId: id });
  };

  return (
    <div className="relative min-h-[100dvh] bg-[#F4F7FC]">
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

      <div className="relative z-10 mx-auto max-w-lg px-4 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mb-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(getPorterFareEstimatePath())}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-[0_6px_18px_rgba(15,23,42,0.1)]"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5 text-slate-800" strokeWidth={2.2} />
          </button>
          <div>
            <h1 className="text-[18px] font-bold tracking-tight text-[#0F172A]">
              Payment method
            </h1>
            <p className="text-[12px] font-medium text-[#6B7280]">
              Choose how you want to pay
            </p>
          </div>
        </div>

        <div className="mb-4 rounded-[18px] border border-white bg-white p-4 shadow-[0_8px_22px_rgba(15,40,90,0.05)]">
          <p className="mb-3 text-[12px] font-bold uppercase tracking-wider text-[#94A3B8]">
            Payment summary
          </p>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-[#6B7280]">Amount due</span>
            <span className="text-[18px] font-extrabold tracking-tight text-[#0F172A]">
              {formatInr(amountDue)}
            </span>
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <span className="text-[13px] text-[#6B7280]">Booking date</span>
            <span className="text-[13px] font-semibold text-[#0F172A]">
              {bookingDateLabel}
            </span>
          </div>
        </div>

        <div className="space-y-2.5">
          {PAYMENT_METHODS.map((m) => {
            const selected = paymentMethodId === m.id;
            const Icon = METHOD_ICONS[m.id] || Banknote;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => selectMethod(m.id)}
                className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition ${
                  selected
                    ? "border-[#2F6BFF] bg-[#F3F7FF] shadow-[0_8px_22px_rgba(47,107,255,0.12)]"
                    : "border-transparent bg-white shadow-[0_6px_18px_rgba(15,40,90,0.05)]"
                }`}
              >
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                    selected ? "bg-[#2F6BFF] text-white" : "bg-[#EEF3FF] text-[#2F6BFF]"
                  }`}
                >
                  <Icon className="h-5 w-5" strokeWidth={2.1} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[14px] font-bold text-[#0F172A]">{m.label}</span>
                    {m.recommended ? (
                      <span className="rounded-full bg-[#2F6BFF] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                        Recommended
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-[#6B7280]">{m.subtitle}</span>
                </span>
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                    selected
                      ? "border-[#2F6BFF] bg-[#2F6BFF] text-white"
                      : "border-[#D1D5DB] bg-white"
                  }`}
                >
                  {selected ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-4 px-1 text-[11px] leading-relaxed text-[#94A3B8]">
          Cash is collected at pickup. Online methods are confirmed when the trip is booked.
        </p>

        <button
          type="button"
          onClick={() => navigate(getPorterFareEstimatePath())}
          className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-[#2F6BFF] text-[15px] font-bold text-white shadow-[0_10px_24px_rgba(47,107,255,0.35)]"
        >
          Confirm payment method
        </button>
      </div>
    </div>
  );
}
