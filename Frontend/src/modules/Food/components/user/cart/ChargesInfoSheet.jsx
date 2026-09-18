import { useEffect } from "react"
import { X } from "lucide-react"

const RUPEE = "₹"

/**
 * Breakdown behind the "GST and other charges" line in the cart bill.
 * Every amount here comes from the order pricing API — nothing is computed
 * in the UI, so what the customer reads is what they are charged.
 */
export default function ChargesInfoSheet({ open, onClose, charges = [], total = 0 }) {
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.()
    }
    document.addEventListener("keydown", onKeyDown)
    // Keep the cart behind the sheet from scrolling under the customer's thumb.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="GST and other charges"
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl dark:bg-[#151515] sm:w-[420px] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-gray-950 dark:text-white">
              GST and other charges
            </h3>
            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
              Here's what makes up this amount
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {charges.map((charge) => (
            <div key={charge.key} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                  {charge.label}
                </p>
                {charge.description ? (
                  <p className="mt-0.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                    {charge.description}
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 text-[13px] font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {RUPEE}
                {Number(charge.amount).toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-dashed border-gray-200 pt-3 dark:border-white/10">
          <span className="text-sm font-black text-gray-950 dark:text-white">Total charges</span>
          <span className="text-sm font-black tabular-nums text-gray-950 dark:text-white">
            {RUPEE}
            {Number(total).toFixed(2)}
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-[#FF6A00] py-3 text-sm font-bold text-white active:scale-[0.99]"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
