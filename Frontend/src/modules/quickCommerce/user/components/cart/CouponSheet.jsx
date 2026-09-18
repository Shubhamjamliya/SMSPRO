import { memo, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Percent, Search, Tag, X } from "lucide-react";
import {
  formatCouponExpiry,
  getCouponDiscountDisplay,
  getCouponEligibility,
  getCouponMaxDiscount,
  getCouponMinOrder,
  getCouponSavingsBreakdown,
  normalizeCouponCode,
} from "../../utils/couponDisplay";

const RUPEE = "\u20B9";

function CouponCard({ coupon, eligibility, isApplied, applyingCode, onApply, subtotal }) {
  const expiry = formatCouponExpiry(coupon);
  const applicable = eligibility.applicable;
  const code = normalizeCouponCode(coupon);
  const isBusy = applyingCode && applyingCode === code;
  const minOrder = getCouponMinOrder(coupon);
  const maxDiscount = getCouponMaxDiscount(coupon);
  const breakdown = getCouponSavingsBreakdown(coupon, subtotal);

  return (
    <div
      className={`rounded-2xl border p-3.5 transition-colors ${
        applicable
          ? "border-[#FF6A00]/35 bg-[#FFFAF6]"
          : "border-slate-200 bg-slate-50 opacity-80"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-black tracking-wide ${
                applicable
                  ? "border-[#FF6A00]/30 bg-white text-[#FF6A00]"
                  : "border-slate-300 bg-white text-slate-400"
              }`}
            >
              <Tag className="h-3 w-3" />
              {code}
            </span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                isApplied
                  ? "bg-green-100 text-green-700"
                  : applicable
                    ? "bg-green-100 text-green-700"
                    : "bg-slate-200 text-slate-500"
              }`}
            >
              {isApplied
                ? "Applied"
                : applicable
                  ? "Applicable"
                  : eligibility.status === "expired"
                    ? "Expired"
                    : "Not applicable"}
            </span>
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
              {coupon.isSellerCoupon ? "Store offer" : "Platform"}
            </span>
          </div>

          <p
            className={`mt-2 text-sm font-bold ${
              applicable ? "text-slate-900" : "text-slate-500"
            }`}
          >
            {getCouponDiscountDisplay(coupon)}
          </p>

          {applicable && breakdown.discount > 0 ? (
            <p className="mt-1 text-xs font-semibold text-[#FF6A00]">
              You save {RUPEE}
              {breakdown.discount}
              {breakdown.cappedByMax ? " (max discount applied)" : ""}
            </p>
          ) : null}

          {breakdown.summary ? (
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
              {breakdown.summary}
            </p>
          ) : null}

          {coupon.description ? (
            <p className="mt-1 text-xs leading-snug text-slate-600">
              {coupon.description}
            </p>
          ) : null}

          <div className="mt-2 space-y-1 text-[11px] text-slate-500">
            <p>
              {minOrder > 0
                ? `Min order ${RUPEE}${minOrder}`
                : "No minimum order"}
            </p>
            {maxDiscount > 0 ? (
              <p>
                Max discount {RUPEE}
                {maxDiscount}
                {breakdown.cappedByMax
                  ? " · percentage exceeds this, so max applies"
                  : ""}
              </p>
            ) : (
              <p>No max discount cap</p>
            )}
            {expiry ? <p>Valid till {expiry}</p> : null}
            {coupon.isFirstOrderOnly ? <p>Valid on first order only</p> : null}
            {Number(coupon.perUserLimit) > 0 ? (
              <p>Per user limit: {Number(coupon.perUserLimit)}</p>
            ) : null}
            <p>GST is calculated on items after this coupon discount.</p>
          </div>

          {!applicable && eligibility.reason ? (
            <p className="mt-2 text-[11px] font-semibold text-amber-700">
              {eligibility.reason}
            </p>
          ) : null}
        </div>

        {isApplied ? (
          <span className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl bg-green-100 px-3 text-[11px] font-bold uppercase text-green-700">
            <Check className="h-3.5 w-3.5" /> Applied
          </span>
        ) : (
          <button
            type="button"
            disabled={!applicable || isBusy}
            onClick={() => onApply?.(coupon)}
            className={`h-9 shrink-0 rounded-xl px-3 text-[11px] font-bold uppercase tracking-wide transition ${
              applicable
                ? "border border-[#FF6A00] bg-white text-[#FF6A00] hover:bg-[#FFF3EB] active:scale-[0.98]"
                : "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
            }`}
          >
            {isBusy ? "..." : "Apply"}
          </button>
        )}
      </div>
    </div>
  );
}

function CouponSheet({
  open,
  onClose,
  coupons = [],
  subtotal = 0,
  appliedCode,
  applyingCode,
  manualCouponCode = "",
  onManualCodeChange,
  onApplyManual,
  onApplyCoupon,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedApplied = String(appliedCode || "").toUpperCase();

  useEffect(() => {
    if (!open) setSearchQuery("");
  }, [open]);

  const filteredCoupons = useMemo(() => {
    const q = String(searchQuery || "").trim().toUpperCase();
    if (!q) return coupons;
    return coupons.filter((coupon) => {
      const code = normalizeCouponCode(coupon);
      const desc = String(coupon?.description || "").toUpperCase();
      const title = String(coupon?.title || "").toUpperCase();
      return code.includes(q) || desc.includes(q) || title.includes(q);
    });
  }, [coupons, searchQuery]);

  const { applicable, notApplicable } = useMemo(() => {
    const yes = [];
    const no = [];
    for (const coupon of filteredCoupons) {
      const eligibility = getCouponEligibility(coupon, { subtotal });
      const entry = { coupon, eligibility };
      if (eligibility.applicable) yes.push(entry);
      else no.push(entry);
    }
    return { applicable: yes, notApplicable: no };
  }, [filteredCoupons, subtotal]);

  if (typeof document === "undefined") return null;

  const handleSearchChange = (value) => {
    const next = String(value || "").toUpperCase();
    setSearchQuery(next);
    onManualCodeChange?.(next);
  };

  const handleApplyFromBar = () => {
    const code = String(manualCouponCode || searchQuery || "").trim().toUpperCase();
    if (!code) return;
    const matched = coupons.find((c) => normalizeCouponCode(c) === code);
    if (matched) onApplyCoupon?.(matched);
    else onApplyManual?.();
  };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[700] flex items-end justify-center sm:items-center">
          <motion.button
            type="button"
            aria-label="Close coupons"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="All coupons"
            initial={{ y: "100%", opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="relative z-10 mb-[calc(0.5rem+env(safe-area-inset-bottom))] flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:mb-0 sm:max-h-[80vh] sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <Percent className="h-4 w-4 text-[#FF6A00]" />
                <div>
                  <p className="text-sm font-black text-slate-900">All coupons</p>
                  <p className="text-[11px] text-slate-500">
                    {applicable.length} applicable · {notApplicable.length} not applicable
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full bg-slate-100 p-1.5 text-slate-600 hover:bg-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 border-b border-slate-100 px-4 py-2.5">
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={manualCouponCode || searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleApplyFromBar();
                      }
                    }}
                    placeholder="Search or enter coupon code"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-semibold uppercase tracking-wide text-slate-900 outline-none focus:border-[#FF6A00]"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleApplyFromBar}
                  className="h-10 shrink-0 rounded-xl bg-[#FF6A00] px-4 text-xs font-bold uppercase tracking-wide text-white hover:bg-[#E85D04] active:scale-[0.98]"
                >
                  Apply
                </button>
              </div>
              <p className="text-[10px] text-slate-400">
                Type to filter offers, or enter a code and tap Apply.
              </p>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3 pb-6">
              {applicable.length > 0 ? (
                <section>
                  <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#FF6A00]">
                    Applicable coupons
                  </p>
                  <div className="space-y-2">
                    {applicable.map(({ coupon, eligibility }) => (
                      <CouponCard
                        key={normalizeCouponCode(coupon) || coupon._id}
                        coupon={coupon}
                        eligibility={eligibility}
                        isApplied={normalizeCouponCode(coupon) === normalizedApplied}
                        applyingCode={applyingCode}
                        onApply={onApplyCoupon}
                        subtotal={subtotal}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {notApplicable.length > 0 ? (
                <section>
                  <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
                    Not applicable yet
                  </p>
                  <div className="space-y-2">
                    {notApplicable.map(({ coupon, eligibility }) => (
                      <CouponCard
                        key={normalizeCouponCode(coupon) || coupon._id}
                        coupon={coupon}
                        eligibility={eligibility}
                        isApplied={normalizeCouponCode(coupon) === normalizedApplied}
                        applyingCode={applyingCode}
                        onApply={onApplyCoupon}
                        subtotal={subtotal}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {filteredCoupons.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  {coupons.length === 0
                    ? "No coupons available right now"
                    : "No coupons match your search"}
                </p>
              ) : null}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

export default memo(CouponSheet);
