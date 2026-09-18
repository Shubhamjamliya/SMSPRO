import { memo } from "react"
import { Minus, Plus, Trash2, Utensils } from "lucide-react"
import { getQuantityLimits } from "@food/utils/orderQuantity"
import { getLineAddonUnitTotal, getLineTotal } from "@food/utils/cartTotals"

const RUPEE = "\u20B9"
const QTY_CLASS =
  "flex h-8 w-[88px] shrink-0 items-center overflow-hidden rounded-lg border border-[#FF6A00] bg-white dark:bg-[#111]"

function CartItemRow({ item, onDecrement, onIncrement }) {
  // Base dish price stays the headline; add-ons are shown as an explicit extra
  // so the customer can see where the money goes.
  const unit = Number(item?.price || 0)
  const other = Number(item?.otherPrice || 0)
  const qty = Number(item?.quantity || 1)
  const addonUnit = getLineAddonUnitTotal(item)
  const addonTotal = addonUnit * qty
  // Server's figure when present, so the row can never disagree with the bill.
  const lineTotal = getLineTotal(item)
  const lineOther = (other + addonUnit) * qty
  const hasSave = other > unit
  const limits = getQuantityLimits(item)
  // At the item's minimum there is no smaller valid quantity, so "−" removes
  // the line — show a bin icon so that reads as intentional.
  const decrementRemoves = qty <= limits.min
  const atMax = qty >= limits.max

  return (
    <div className="flex min-w-0 items-start gap-2.5 px-3 py-2.5 sm:gap-3 sm:px-4">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-gray-100 dark:bg-white/10 sm:h-16 sm:w-16">
        {item?.image ? (
          <img
            src={item.image}
            alt={item.name || "Item"}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Utensils className="h-5 w-5 text-gray-300" />
          </div>
        )}
        <div
          className={`absolute left-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border bg-white ${
            item?.isVeg !== false ? "border-green-600" : "border-red-600"
          }`}
        >
          <div
            className={`h-1.5 w-1.5 rounded-full ${
              item?.isVeg !== false ? "bg-green-600" : "bg-red-600"
            }`}
          />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-bold leading-snug text-gray-950 dark:text-gray-100">
          {item?.name}
        </p>
        {item?.variantName ? (
          <p className="mt-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
            {item.variantName}
          </p>
        ) : null}
        {Array.isArray(item?.addons) && item.addons.length > 0 ? (
          <ul className="mt-0.5 space-y-0.5">
            {item.addons.map((addon) => (
              <li
                key={addon.addonId || addon.name}
                className="text-[11px] text-gray-500 dark:text-gray-400"
              >
                + {addon.name}
                {Number(addon.quantity) > 1 ? ` x${addon.quantity}` : ""} ({RUPEE}
                {Number(addon.price || 0).toFixed(0)})
              </li>
            ))}
            <li className="text-[11px] font-semibold text-[#FF6A00]">
              Extras {RUPEE}
              {addonUnit.toFixed(0)} per item
            </li>
          </ul>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-gray-900 dark:text-gray-100">
            {RUPEE}
            {unit.toFixed(0)}
          </span>
          {hasSave ? (
            <>
              <span className="text-[10px] text-gray-400 line-through">
                {RUPEE}
                {other.toFixed(0)}
              </span>
              <span className="rounded-full bg-green-50 px-1.5 py-px text-[9px] font-bold text-green-700 dark:bg-green-950/40 dark:text-green-400">
                Save {RUPEE}
                {(other - unit).toFixed(0)}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div className={QTY_CLASS}>
          <button
            type="button"
            aria-label="Decrease quantity"
            className="flex h-full w-7 items-center justify-center text-[#FF6A00] hover:bg-orange-50 dark:hover:bg-[#FF6A00]/10"
            onClick={() => onDecrement?.(item)}
          >
            {decrementRemoves ? (
              <Trash2 className="h-3.5 w-3.5" />
            ) : (
              <Minus className="h-3.5 w-3.5" />
            )}
          </button>
          <span className="flex-1 text-center text-xs font-black tabular-nums text-[#FF6A00]">
            {qty}
          </span>
          <button
            type="button"
            aria-label="Increase quantity"
            disabled={atMax}
            className="flex h-full w-7 items-center justify-center text-[#FF6A00] hover:bg-orange-50 disabled:opacity-40 dark:hover:bg-[#FF6A00]/10"
            onClick={() => onIncrement?.(item)}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {limits.hasMin ? (
          <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">
            Min {limits.min}
          </span>
        ) : null}
        <div className="text-right leading-tight">
          {hasSave ? (
            <p className="text-[10px] text-gray-400 line-through">
              {RUPEE}
              {lineOther.toFixed(0)}
            </p>
          ) : null}
          {addonTotal > 0 ? (
            <p className="text-[10px] text-gray-500 dark:text-gray-400">
              incl. extras {RUPEE}
              {addonTotal.toFixed(0)}
            </p>
          ) : null}
          <p className="text-sm font-black tabular-nums text-gray-950 dark:text-gray-100">
            {RUPEE}
            {lineTotal.toFixed(0)}
          </p>
        </div>
      </div>
    </div>
  )
}

function areEqual(prev, next) {
  const a = prev.item
  const b = next.item
  return (
    a?.id === b?.id &&
    a?.quantity === b?.quantity &&
    a?.price === b?.price &&
    a?.otherPrice === b?.otherPrice &&
    a?.name === b?.name &&
    a?.variantName === b?.variantName &&
    a?.image === b?.image &&
    a?.minOrderQuantity === b?.minOrderQuantity &&
    a?.maxOrderQuantity === b?.maxOrderQuantity &&
    a?.addonUnitTotal === b?.addonUnitTotal &&
    (a?.addons?.length || 0) === (b?.addons?.length || 0)
  )
}

export default memo(CartItemRow, areEqual)
