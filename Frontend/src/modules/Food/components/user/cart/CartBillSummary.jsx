import { memo, useMemo, useState } from "react"
import { ChevronRight, FileText, Info } from "lucide-react"
import ChargesInfoSheet from "./ChargesInfoSheet"

const RUPEE = "\u20B9"

function Row({ label, value, valueClass = "", muted = false }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px] leading-5">
      <span className={muted ? "text-gray-500 dark:text-gray-400" : "text-gray-600 dark:text-gray-400"}>
        {label}
      </span>
      <span className={`shrink-0 tabular-nums font-medium text-gray-900 dark:text-gray-100 ${valueClass}`}>
        {value}
      </span>
    </div>
  )
}

function CartBillSummary({
  showBillDetails,
  onToggle,
  subtotal,
  deliveryFee,
  deliveryFeeBreakdownText,
  deliverySpeedFee,
  deliverySpeedLabel,
  platformFee,
  packagingFee = 0,
  packagingMode = "",
  gstCharges,
  discount,
  savings,
  total,
  totalBeforeDiscount,
  otherPlatformSubtotal,
  otherPlatformSavings,
}) {
  const [showChargesInfo, setShowChargesInfo] = useState(false)

  // GST, platform fee and packaging are rolled into one line the customer can
  // expand — delivery stays separate because it is its own decision (speed,
  // free-delivery coupons). Amounts come straight from the pricing API.
  const chargeBreakdown = useMemo(() => {
    const rows = [
      {
        key: "gst",
        label: "GST",
        description: "Government tax on this order",
        amount: Number(gstCharges) || 0,
      },
      {
        key: "platform",
        label: "Platform fee",
        description: "Charged by the platform to run the service",
        amount: Number(platformFee) || 0,
      },
      {
        key: "packaging",
        label:
          packagingMode === "RESTAURANT"
            ? "Restaurant packaging charge"
            : "Packaging charge",
        description:
          packagingMode === "RESTAURANT"
            ? "Set by the restaurant for packing your items"
            : "Charged for packing your order",
        amount: Number(packagingFee) || 0,
      },
    ]
    return rows.filter((row) => row.amount > 0)
  }, [gstCharges, platformFee, packagingFee, packagingMode])

  const otherChargesTotal = chargeBreakdown.reduce((sum, row) => sum + row.amount, 0)

  return (
    <div className="rounded-2xl border border-black/5 bg-white px-3.5 py-3 shadow-sm dark:border-white/10 dark:bg-[#151515] sm:px-4">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <FileText className="h-4 w-4 shrink-0 text-gray-500" />
          <div className="min-w-0 text-left">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-bold text-gray-900 dark:text-white">Bill summary</span>
              {savings > 0 ? (
                <>
                  <span className="text-xs text-gray-400 line-through tabular-nums">
                    {RUPEE}
                    {Number(totalBeforeDiscount).toFixed(0)}
                  </span>
                  <span className="text-sm font-black tabular-nums text-gray-950 dark:text-white">
                    {RUPEE}
                    {Number(total).toFixed(0)}
                  </span>
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    Saved {RUPEE}
                    {Number(savings).toFixed(0)}
                  </span>
                </>
              ) : (
                <span className="text-sm font-black tabular-nums text-gray-950 dark:text-white">
                  {RUPEE}
                  {Number(total).toFixed(0)}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-gray-500">Incl. taxes & charges</p>
          </div>
        </div>
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${showBillDetails ? "rotate-90" : ""}`}
        />
      </button>

      {showBillDetails ? (
        <div className="mt-2.5 space-y-1.5 border-t border-dashed border-gray-200 pt-2.5 dark:border-white/10">
          <Row
            label="Subtotal"
            value={
              <>
                {otherPlatformSubtotal > subtotal ? (
                  <span className="mr-1.5 text-[10px] font-medium text-gray-400">
                    Other {RUPEE}
                    {Number(otherPlatformSubtotal).toFixed(0)}
                  </span>
                ) : null}
                {RUPEE}
                {Number(subtotal).toFixed(2)}
              </>
            }
          />
          <Row
            label="Delivery fee"
            value={deliveryFee === 0 ? "FREE" : `${RUPEE}${Number(deliveryFee).toFixed(2)}`}
            valueClass={deliveryFee === 0 ? "text-[#FF6A00] font-semibold" : ""}
          />
          {deliveryFeeBreakdownText ? (
            <p className="border-l-2 border-gray-100 pl-2 text-[10px] leading-snug text-gray-500 dark:border-white/10">
              {deliveryFeeBreakdownText}
            </p>
          ) : null}
          {deliverySpeedFee > 0 ? (
            <Row
              label={`${deliverySpeedLabel || "Delivery speed"} fee`}
              value={`${RUPEE}${Number(deliverySpeedFee).toFixed(2)}`}
            />
          ) : null}
          <div className="flex items-center justify-between gap-3 text-[13px] leading-5">
            <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
              GST and other charges
              {chargeBreakdown.length > 0 ? (
                <button
                  type="button"
                  aria-label="View GST and other charges breakdown"
                  onClick={() => setShowChargesInfo(true)}
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-gray-400 hover:text-[#FF6A00] active:scale-95"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </span>
            <span className="shrink-0 tabular-nums font-medium text-gray-900 dark:text-gray-100">
              {RUPEE}
              {otherChargesTotal.toFixed(2)}
            </span>
          </div>
          {discount > 0 ? (
            <Row
              label="Coupon discount"
              value={`-${RUPEE}${Number(discount).toFixed(2)}`}
              valueClass="text-[#FF6A00]"
            />
          ) : null}
          {savings > 0 ? (
            <Row
              label="Total savings"
              value={`${RUPEE}${Number(savings).toFixed(2)}`}
              valueClass="text-green-600 dark:text-green-400"
            />
          ) : null}

          <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-2 dark:border-white/10">
            <span className="text-sm font-black text-gray-950 dark:text-white">Grand total</span>
            <span className="text-sm font-black tabular-nums text-gray-950 dark:text-white">
              {RUPEE}
              {Number(total).toFixed(2)}
            </span>
          </div>

          {otherPlatformSubtotal > subtotal ? (
            <div className="mt-1.5 rounded-xl border border-[#FF6A00]/20 bg-[#fff7ed] px-2.5 py-2 dark:bg-[#2b1408]">
              <div className="flex justify-between text-[11px] font-bold text-[#FF6A00]">
                <span>Other platform</span>
                <span className="tabular-nums">
                  {RUPEE}
                  {Number(otherPlatformSubtotal).toFixed(0)}
                </span>
              </div>
              <div className="mt-0.5 flex justify-between text-[11px] font-bold text-[#FF6A00]">
                <span>You save</span>
                <span className="tabular-nums">
                  {RUPEE}
                  {Number(otherPlatformSavings).toFixed(0)}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <ChargesInfoSheet
        open={showChargesInfo}
        onClose={() => setShowChargesInfo(false)}
        charges={chargeBreakdown}
        total={otherChargesTotal}
      />
    </div>
  )
}

export default memo(CartBillSummary)
