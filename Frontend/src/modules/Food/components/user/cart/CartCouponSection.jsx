import { memo } from "react"
import { CheckCircle2, ChevronRight, Percent } from "lucide-react"
import { getCouponEligibility } from "./couponEligibility"

const RUPEE = "\u20B9"

function CartCouponSection({
  appliedCoupon,
  discount = 0,
  deliveryFee = 0,
  deliveryFeeSavedLabel,
  availableCoupons = [],
  loadingCoupons = false,
  subtotal = 0,
  userOrderCount = 0,
  onRemoveCoupon,
  onOpenAllCoupons,
  onApplyCoupon,
}) {
  const preview = availableCoupons.slice(0, 1)
  const applicableCount = availableCoupons.filter(
    (c) => getCouponEligibility(c, { subtotal, userOrderCount }).applicable,
  ).length

  return (
    <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm dark:border-white/10 dark:bg-[#151515]">
      {deliveryFee === 0 && deliveryFeeSavedLabel ? (
        <div className="flex items-center gap-2 border-b border-dashed border-gray-100 bg-[#f4fcf7] px-3.5 py-2 dark:border-white/10 dark:bg-green-900/10">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
          <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
            {deliveryFeeSavedLabel}
          </span>
        </div>
      ) : null}

      {appliedCoupon ? (
        <div className="flex items-center justify-between gap-3 px-3.5 py-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <Percent className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6A00]" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded bg-[#fff3eb] px-1.5 py-0.5 text-[11px] font-black tracking-wide text-[#FF6A00] dark:bg-[#FF6A00]/10">
                  {appliedCoupon.code}
                </span>
                <span className="text-xs font-semibold text-green-700 dark:text-green-400">Applied</span>
              </div>
              <p className="mt-0.5 text-xs font-medium text-[#FF6A00]">
                You saved {RUPEE}
                {Number(discount || 0).toFixed(2)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
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
              className="rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-[#FF6A00] hover:bg-[#fff3eb] dark:hover:bg-[#FF6A00]/10"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="px-3.5 py-3">
          <button
            type="button"
            onClick={onOpenAllCoupons}
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-dashed border-[#FF6A00]/40 bg-[#fffaf6] px-3 py-2.5 text-left transition hover:bg-[#fff3eb] active:scale-[0.99] dark:bg-[#FF6A00]/5"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Percent className="h-4 w-4 shrink-0 text-[#FF6A00]" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-950 dark:text-white">Apply coupon</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
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
            <div className="mt-2 space-y-2">
              {preview.map((coupon) => {
                const eligibility = getCouponEligibility(coupon, { subtotal, userOrderCount })
                return (
                  <div
                    key={coupon.code}
                    className={`flex items-center justify-between gap-2 rounded-xl border px-2.5 py-2 ${
                      eligibility.applicable
                        ? "border-[#FF6A00]/25 bg-white dark:bg-[#111]"
                        : "border-gray-200 bg-gray-50 opacity-70 dark:border-white/10 dark:bg-white/5"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black tracking-wide text-[#FF6A00]">
                        {coupon.code}
                      </p>
                      <p className="truncate text-[11px] text-gray-600 dark:text-gray-400">
                        {eligibility.applicable
                          ? coupon.discountDisplay || coupon.description
                          : eligibility.reason}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!eligibility.applicable}
                      onClick={() => onApplyCoupon?.(coupon)}
                      className={`h-8 shrink-0 rounded-lg px-2.5 text-[10px] font-bold uppercase ${
                        eligibility.applicable
                          ? "border border-[#FF6A00] text-[#FF6A00] hover:bg-[#fff3eb]"
                          : "cursor-not-allowed border border-gray-200 text-gray-400"
                      }`}
                    >
                      Apply
                    </button>
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default memo(CartCouponSection)
