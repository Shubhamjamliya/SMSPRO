import { memo, useMemo } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { Check, Percent, Tag, X } from "lucide-react"
import { formatCouponExpiry, getCouponEligibility } from "./couponEligibility"

const RUPEE = "\u20B9"

function CouponCard({
  coupon,
  eligibility,
  isApplied,
  applyingCode,
  onApply,
}) {
  const expiry = formatCouponExpiry(coupon.endDate)
  const applicable = eligibility.applicable
  const isBusy = applyingCode === coupon.code

  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        applicable
          ? "border-[#FF6A00]/35 bg-[#fffaf6] dark:border-[#FF6A00]/40 dark:bg-[#FF6A00]/5"
          : "border-gray-200 bg-gray-50 opacity-70 dark:border-white/10 dark:bg-white/5"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-black tracking-wide ${
                applicable
                  ? "border-[#FF6A00]/30 bg-white text-[#FF6A00] dark:bg-[#111]"
                  : "border-gray-300 bg-white text-gray-400 dark:bg-[#111]"
              }`}
            >
              <Tag className="h-3 w-3" />
              {coupon.code}
            </span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                applicable
                  ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                  : "bg-gray-200 text-gray-500 dark:bg-white/10 dark:text-gray-400"
              }`}
            >
              {isApplied ? "Applied" : applicable ? "Applicable" : eligibility.status === "expired" ? "Expired" : "Not applicable"}
            </span>
          </div>

          <p
            className={`mt-1.5 text-sm font-bold ${
              applicable ? "text-gray-950 dark:text-white" : "text-gray-500"
            }`}
          >
            {coupon.discountDisplay || `Save ${RUPEE}${coupon.discount || 0}`}
          </p>

          {coupon.description ? (
            <p className="mt-0.5 text-xs leading-snug text-gray-600 dark:text-gray-400">
              {coupon.description}
            </p>
          ) : null}

          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500 dark:text-gray-400">
            {Number(coupon.minOrder) > 0 ? (
              <span>
                Min order {RUPEE}
                {Number(coupon.minOrder).toFixed(0)}
              </span>
            ) : (
              <span>No min order</span>
            )}
            {expiry ? <span>Expires {expiry}</span> : null}
            {coupon.customerGroup === "new" ? <span>New users</span> : null}
          </div>

          {coupon.terms ? (
            <p className="mt-1 text-[10px] text-gray-400">{coupon.terms}</p>
          ) : null}

          {!applicable && eligibility.reason ? (
            <p className="mt-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
              {eligibility.reason}
            </p>
          ) : null}
        </div>

        {isApplied ? (
          <span className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-green-100 px-3 text-[11px] font-bold uppercase text-green-700 dark:bg-green-900/30 dark:text-green-300">
            <Check className="h-3.5 w-3.5" /> Applied
          </span>
        ) : (
          <button
            type="button"
            disabled={!applicable || isBusy}
            onClick={() => onApply?.(coupon)}
            className={`h-9 shrink-0 rounded-lg px-3 text-[11px] font-bold uppercase tracking-wide transition ${
              applicable
                ? "border border-[#FF6A00] bg-white text-[#FF6A00] hover:bg-[#fff3eb] active:scale-[0.98] dark:bg-[#111]"
                : "cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400 dark:border-white/10 dark:bg-white/5"
            }`}
          >
            {isBusy ? "..." : "Apply"}
          </button>
        )}
      </div>
    </div>
  )
}

function CartCouponSheet({
  open,
  onClose,
  coupons = [],
  subtotal = 0,
  userOrderCount = 0,
  appliedCode,
  applyingCode,
  manualCouponCode,
  onManualCodeChange,
  onApplyManual,
  onApplyCoupon,
}) {
  const { applicable, notApplicable } = useMemo(() => {
    const yes = []
    const no = []
    for (const coupon of coupons) {
      const eligibility = getCouponEligibility(coupon, { subtotal, userOrderCount })
      const entry = { coupon, eligibility }
      if (eligibility.applicable) yes.push(entry)
      else no.push(entry)
    }
    return { applicable: yes, notApplicable: no }
  }, [coupons, subtotal, userOrderCount])

  if (typeof document === "undefined") return null

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
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
            className="relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-[#151515] sm:max-h-[80vh] sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-white/10">
              <div className="flex items-center gap-2">
                <Percent className="h-4 w-4 text-[#FF6A00]" />
                <div>
                  <p className="text-sm font-black text-gray-950 dark:text-white">All coupons</p>
                  <p className="text-[11px] text-gray-500">
                    {applicable.length} applicable · {notApplicable.length} not applicable
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full bg-gray-100 p-1.5 text-gray-600 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex gap-2 border-b border-gray-100 px-4 py-2.5 dark:border-white/10">
              <input
                type="text"
                value={manualCouponCode}
                onChange={(e) => onManualCodeChange?.(e.target.value.toUpperCase())}
                placeholder="Enter coupon code"
                className="h-10 min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-semibold uppercase tracking-wide text-gray-900 outline-none focus:border-[#FF6A00] dark:border-white/10 dark:bg-[#0f0f0f] dark:text-white"
              />
              <button
                type="button"
                onClick={onApplyManual}
                className="h-10 shrink-0 rounded-xl bg-[#FF6A00] px-4 text-xs font-bold uppercase tracking-wide text-white hover:bg-[#e85d04] active:scale-[0.98]"
              >
                Apply
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
              {applicable.length > 0 ? (
                <section>
                  <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#FF6A00]">
                    Applicable coupons
                  </p>
                  <div className="space-y-2">
                    {applicable.map(({ coupon, eligibility }) => (
                      <CouponCard
                        key={coupon.code}
                        coupon={coupon}
                        eligibility={eligibility}
                        isApplied={appliedCode === coupon.code}
                        applyingCode={applyingCode}
                        onApply={onApplyCoupon}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {notApplicable.length > 0 ? (
                <section>
                  <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-gray-400">
                    Not applicable
                  </p>
                  <div className="space-y-2">
                    {notApplicable.map(({ coupon, eligibility }) => (
                      <CouponCard
                        key={coupon.code}
                        coupon={coupon}
                        eligibility={eligibility}
                        isApplied={appliedCode === coupon.code}
                        applyingCode={applyingCode}
                        onApply={onApplyCoupon}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {coupons.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">No coupons available right now</p>
              ) : null}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}

export default memo(CartCouponSheet)
