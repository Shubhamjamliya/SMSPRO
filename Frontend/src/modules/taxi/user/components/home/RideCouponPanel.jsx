import { useEffect, useState } from "react";
import { Check, Loader2, Percent, Sparkles, Ticket, X } from "lucide-react";
import { formatInr } from "../../utils/mock/vehicles";
import { taxiUserApi } from "../../../services/api";

/**
 * Inline promo applicator for Choose-a-ride — ticket strip + expandable picker.
 * Does not change vehicle list scroll behavior; sits above the Book CTA.
 */
export default function RideCouponPanel({
  vehicleTypeId = null,
  zoneId = null,
  baseFare = 0,
  platformFee = 0,
  appliedCoupon = null,
  onApply,
  onClear,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !vehicleTypeId || !(baseFare > 0)) return undefined;
    let cancelled = false;
    (async () => {
      setLoadingList(true);
      try {
        const list = await taxiUserApi.listAvailableCoupons({
          vehicleTypeId,
          zoneId: zoneId || undefined,
          fareTotal: baseFare,
          platformFee,
        });
        if (!cancelled) setSuggestions(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, vehicleTypeId, zoneId, baseFare, platformFee]);

  useEffect(() => {
    if (appliedCoupon?.code) setCode(appliedCoupon.code);
  }, [appliedCoupon?.code]);

  const applyCode = async (raw) => {
    const next = String(raw || code || "")
      .trim()
      .toUpperCase();
    if (!next) {
      setError("Enter a promo code");
      return;
    }
    if (!(baseFare > 0) || !vehicleTypeId) {
      setError("Select a ride first");
      return;
    }

    setApplying(true);
    setError("");
    try {
      const preview = await taxiUserApi.previewCoupon({
        code: next,
        fareTotal: baseFare,
        platformFee,
        vehicleTypeId,
        zoneId: zoneId || undefined,
      });
      onApply?.(preview);
      setCode(preview.code || next);
      setOpen(false);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Coupon not valid");
    } finally {
      setApplying(false);
    }
  };

  if (appliedCoupon?.code) {
    const saved = Number(appliedCoupon.discountAmount || 0);
    return (
      <div className="mb-2.5 overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#FFF7F0_0%,#FFFFFF_55%,#F3FFF8_100%)] ring-1 ring-[#FF6A00]/20">
        <div className="flex items-center gap-3 px-3.5 py-3">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF6A00] text-white shadow-[0_8px_18px_rgba(255,106,0,0.35)]">
            <Ticket className="h-4 w-4" aria-hidden />
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-white">
              <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden />
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold tracking-wide text-neutral-950">
              {appliedCoupon.code}
            </p>
            <p className="mt-0.5 truncate text-[11px] font-medium text-emerald-700">
              {saved > 0 ? `You save ${formatInr(saved)}` : appliedCoupon.name || "Promo applied"}
              {appliedCoupon.waivePlatformFee ? " · fee waived" : ""}
            </p>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onClear?.();
              setCode("");
              setError("");
            }}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white text-neutral-500 ring-1 ring-neutral-200 transition hover:bg-neutral-50 hover:text-neutral-800 disabled:opacity-50"
            aria-label="Remove coupon"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-2.5">
      {!open ? (
        <button
          type="button"
          disabled={disabled || !(baseFare > 0)}
          onClick={() => setOpen(true)}
          className="group flex w-full cursor-pointer items-center gap-3 rounded-2xl bg-neutral-950 px-3.5 py-3 text-left text-white transition hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FF6A00]/20 text-[#FFB37A] ring-1 ring-[#FF6A00]/30">
            <Percent className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold tracking-[-0.01em]">
              Have a promo code?
            </span>
            <span className="mt-0.5 block text-[11px] text-white/55">
              Apply before you book · instant fare drop
            </span>
          </span>
          <Sparkles className="h-4 w-4 shrink-0 text-[#FFB37A] opacity-80 transition group-hover:opacity-100" aria-hidden />
        </button>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200/90 shadow-[0_12px_32px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between gap-2 border-b border-neutral-100 px-3.5 py-2.5">
            <p className="text-[13px] font-bold text-neutral-950">Apply promo</p>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError("");
              }}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
              aria-label="Close promo"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="px-3.5 py-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyCode(code);
                  }
                }}
                placeholder="ENTER CODE"
                autoComplete="off"
                spellCheck={false}
                className="h-11 min-w-0 flex-1 rounded-xl border-0 bg-neutral-50 px-3 font-mono text-[13px] font-semibold tracking-[0.14em] text-neutral-900 outline-none ring-1 ring-neutral-200 placeholder:tracking-normal placeholder:text-neutral-400 focus:ring-2 focus:ring-[#FF6A00]/35"
                aria-label="Promo code"
              />
              <button
                type="button"
                disabled={applying || !code.trim()}
                onClick={() => applyCode(code)}
                className="flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-[#FF6A00] px-4 text-[13px] font-semibold text-white transition hover:bg-[#E85F00] disabled:opacity-60"
              >
                {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
              </button>
            </div>
            {error ? (
              <p className="mt-2 text-[12px] font-medium text-red-600">{error}</p>
            ) : null}
          </div>

          <div className="border-t border-dashed border-neutral-200 px-3.5 py-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-400">
              Available for this ride
            </p>
            {loadingList ? (
              <div className="flex items-center gap-2 py-2 text-[12px] text-neutral-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#FF6A00]" />
                Finding offers…
              </div>
            ) : null}
            {!loadingList && !suggestions.length ? (
              <p className="py-1.5 text-[12px] text-neutral-500">
                No listed offers for this fare right now — try a code above.
              </p>
            ) : null}
            <div className="max-h-[148px] space-y-2 overflow-y-auto overscroll-contain">
              {suggestions.map((c) => (
                <button
                  key={c.id || c.code}
                  type="button"
                  disabled={applying}
                  onClick={() => applyCode(c.code)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-xl bg-[linear-gradient(90deg,#FFF8F2,#FFFFFF)] px-3 py-2.5 text-left ring-1 ring-[#FF6A00]/15 transition hover:ring-[#FF6A00]/35 disabled:opacity-60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FF6A00]/10 text-[#FF6A00]">
                    <Ticket className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[12px] font-bold tracking-wide text-neutral-950">
                      {c.code}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
                      {c.name || c.label}
                      {c.discountAmount > 0 ? ` · save ${formatInr(c.discountAmount)}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-lg bg-neutral-950 px-2.5 py-1 text-[11px] font-semibold text-white">
                    Use
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
