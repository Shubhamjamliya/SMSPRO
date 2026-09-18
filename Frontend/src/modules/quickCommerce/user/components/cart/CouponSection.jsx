import { memo } from "react";
import { CheckCircle2, ChevronRight, Percent, Tag } from "lucide-react";
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

function CouponPreviewRow({ coupon, subtotal, onApply, isApplied }) {
  const eligibility = getCouponEligibility(coupon, { subtotal });
  const expiry = formatCouponExpiry(coupon);
  const minOrder = getCouponMinOrder(coupon);
  const maxDiscount = getCouponMaxDiscount(coupon);
  const code = normalizeCouponCode(coupon);
  const breakdown = getCouponSavingsBreakdown(coupon, subtotal);

  return (
    <div
      className={`flex items-start justify-between gap-2 rounded-xl border px-3 py-2.5 ${
        eligibility.applicable
          ? "border-[#FF6A00]/25 bg-white"
          : "border-slate-200 bg-slate-50 opacity-80"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md border border-[#FF6A00]/30 bg-[#FFF3EB] px-1.5 py-0.5 text-[11px] font-black tracking-wide text-[#FF6A00]">
            <Tag className="h-3 w-3" />
            {code}
          </span>
          {coupon.isSellerCoupon ? (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
              Store offer
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
              Platform
            </span>
          )}
        </div>
        <p className="mt-1 text-xs font-bold text-slate-900">
          {getCouponDiscountDisplay(coupon)}
        </p>
        {eligibility.applicable && breakdown.discount > 0 ? (
          <p className="mt-0.5 text-[11px] font-semibold text-[#FF6A00]">
            Save {RUPEE}
            {breakdown.discount}
            {breakdown.cappedByMax ? " · max cap" : ""}
          </p>
        ) : null}
        {coupon.description ? (
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500">
            {coupon.description}
          </p>
        ) : null}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-medium text-slate-400">
          {minOrder > 0 ? (
            <span>
              Min {RUPEE}
              {minOrder}
            </span>
          ) : (
            <span>No min order</span>
          )}
          {maxDiscount > 0 ? (
            <span>
              Max {RUPEE}
              {maxDiscount}
            </span>
          ) : null}
          {expiry ? <span>Ends {expiry}</span> : null}
          {coupon.isFirstOrderOnly ? <span>First order</span> : null}
        </div>
        {!eligibility.applicable && eligibility.reason ? (
          <p className="mt-1 text-[11px] font-semibold text-amber-700">
            {eligibility.reason}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        disabled={!eligibility.applicable || isApplied}
        onClick={() => onApply?.(coupon)}
        className={`h-8 shrink-0 rounded-lg px-2.5 text-[10px] font-bold uppercase tracking-wide ${
          isApplied
            ? "cursor-default border border-green-200 bg-green-50 text-green-700"
            : eligibility.applicable
              ? "border border-[#FF6A00] text-[#FF6A00] hover:bg-[#FFF3EB]"
              : "cursor-not-allowed border border-slate-200 text-slate-400"
        }`}
      >
        {isApplied ? "Applied" : "Apply"}
      </button>
    </div>
  );
}

function CouponSection({
  appliedCoupon,
  discount = 0,
  availableCoupons = [],
  loadingCoupons = false,
  subtotal = 0,
  onRemoveCoupon,
  onOpenAllCoupons,
  onApplyCoupon,
  previewCount = 2,
}) {
  const preview = availableCoupons.slice(0, previewCount);
  const applicableCount = availableCoupons.filter(
    (c) => getCouponEligibility(c, { subtotal }).applicable,
  ).length;
  const appliedCode = normalizeCouponCode(appliedCoupon);
  const appliedBreakdown = appliedCoupon
    ? getCouponSavingsBreakdown(appliedCoupon, subtotal)
    : null;

  return (
    <section className="overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-sm">
      {appliedCoupon ? (
        <div className="flex items-start justify-between gap-3 px-4 py-3.5">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#FFF3EB]">
              <Percent className="h-4 w-4 text-[#FF6A00]" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded bg-[#FFF3EB] px-1.5 py-0.5 text-[11px] font-black tracking-wide text-[#FF6A00]">
                  {appliedCode}
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Applied
                </span>
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                  {appliedCoupon.isSellerCoupon ? "Store" : "Platform"}
                </span>
              </div>
              <p className="mt-0.5 text-xs font-bold text-[#FF6A00]">
                You save {RUPEE}
                {Number(discount || appliedBreakdown?.discount || 0).toLocaleString("en-IN")}
                {appliedBreakdown?.cappedByMax ? " (max discount)" : ""}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {appliedBreakdown?.summary || getCouponDiscountDisplay(appliedCoupon)}
              </p>
              {appliedCoupon.description ? (
                <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">
                  {appliedCoupon.description}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <button
              type="button"
              onClick={onOpenAllCoupons}
              className="text-[11px] font-bold text-[#FF6A00] hover:underline"
            >
              View all
            </button>
            <button
              type="button"
              onClick={onRemoveCoupon}
              className="rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-[#FF6A00] hover:bg-[#FFF3EB]"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3.5">
          <button
            type="button"
            onClick={onOpenAllCoupons}
            className="flex w-full items-center justify-between gap-2 rounded-2xl border border-dashed border-[#FF6A00]/40 bg-[#FFFAF6] px-3.5 py-3 text-left transition hover:bg-[#FFF3EB] active:scale-[0.99]"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                <Percent className="h-4 w-4 text-[#FF6A00]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">Apply coupon</p>
                <p className="text-[11px] text-slate-500">
                  {loadingCoupons
                    ? "Loading offers..."
                    : availableCoupons.length > 0
                      ? `${applicableCount} applicable · ${availableCoupons.length} total`
                      : "View available offers"}
                </p>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-black uppercase tracking-wide text-[#FF6A00]">
              View all <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </button>

          {!loadingCoupons && preview.length > 0 ? (
            <div className="mt-3 space-y-2">
              {preview.map((coupon) => (
                <CouponPreviewRow
                  key={normalizeCouponCode(coupon) || coupon._id || coupon.id}
                  coupon={coupon}
                  subtotal={subtotal}
                  onApply={onApplyCoupon}
                  isApplied={normalizeCouponCode(coupon) === appliedCode}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

export default memo(CouponSection);
