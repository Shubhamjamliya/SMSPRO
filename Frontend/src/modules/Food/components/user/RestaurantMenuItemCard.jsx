import React, { memo, useMemo } from "react"
import { Clock, Heart, Share2, Plus, Minus } from "lucide-react"
import {
  getFoodDisplayPrice,
  getFoodVariants,
  hasFoodVariants,
} from "@food/utils/foodVariants"
import { getMinQuantityLabel, getQuantityLimits } from "@food/utils/orderQuantity"

const FOOD_IMAGE_FALLBACK = "https://picsum.photos/seed/food-fallback/800/600"
const RUPEE_SYMBOL = "\u20B9"

/** Fixed footprint so ADD ↔ quantity never shifts the card. */
const CART_CONTROL_CLASS =
  "absolute -bottom-2 left-1/2 -translate-x-1/2 w-[88px] h-8 rounded-lg border bg-white shadow-md flex items-center justify-center overflow-hidden"

function useItemPricing(item) {
  return useMemo(() => {
    const variants = getFoodVariants(item)
    const price = getFoodDisplayPrice(item)
    let otherPrice = Number(item.otherPrice) || 0
    if (variants.length > 0) {
      const validOtherPrices = variants
        .map((v) => Number(v.otherPrice) || 0)
        .filter((p) => p > 0)
      if (validOtherPrices.length > 0) {
        otherPrice = Math.min(...validOtherPrices)
      }
    }
    const hasDiscount = otherPrice > 0 && otherPrice > price
    return {
      price,
      otherPrice,
      hasDiscount,
      savingsAmount: hasDiscount ? otherPrice - price : 0,
    }
  }, [item])
}

function SavingsRow({ savingsAmount }) {
  if (!(savingsAmount > 0)) return null
  return (
    <div className="flex items-center gap-1 bg-green-50 px-1.5 py-0.5 rounded border border-green-100 w-fit">
      <span className="text-[10px] font-bold text-green-700">
        SAVE {RUPEE_SYMBOL}
        {Math.round(savingsAmount)}
      </span>
    </div>
  )
}

/**
 * Memoized restaurant menu item row — fixed cart control, like/share beside veg.
 */
function RestaurantMenuItemCard({
  item,
  quantity = 0,
  isHighlighted = false,
  isRecommended = false,
  isBookmarked = false,
  isDisabled = false,
  isUpdating = false,
  cardRef,
  onCardClick,
  onAdd,
  onIncrement,
  onDecrement,
  onBookmark,
  onShare,
}) {
  const isVeg = item?.foodType === "Veg" || item?.isVeg === true
  const customisable = hasFoodVariants(item)
  const prepTime = item?.preparationTime ? String(item.preparationTime).trim() : ""
  const description = item?.description ? String(item.description).trim() : ""
  const { price, otherPrice, hasDiscount, savingsAmount } = useItemPricing(item)
  const controlsLocked = isDisabled || isUpdating
  const quantityLimits = getQuantityLimits(item)
  const minQuantityLabel = getMinQuantityLabel(item)

  const handleAddClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (controlsLocked) return
    onAdd?.(e)
  }

  const handleInc = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (controlsLocked) return
    onIncrement?.(e)
  }

  const handleDec = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (controlsLocked) return
    onDecrement?.(e)
  }

  return (
    <div
      ref={cardRef}
      className={`flex items-start gap-3 p-3 border-b border-gray-100 last:border-none relative cursor-pointer ${
        isHighlighted ? "bg-red-50 ring-2 ring-[#FF6A00] ring-inset dark:bg-red-950/20" : ""
      }`}
      onClick={onCardClick}
    >
      {/* Left — details */}
      <div className="flex-1 min-w-0">
        {/* Veg / Non-veg + Like + Share */}
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          {isVeg ? (
            <div
              className="w-4 h-4 border-2 border-green-600 flex items-center justify-center rounded-sm shrink-0"
              title="Veg"
              aria-label="Vegetarian"
            >
              <div className="w-2 h-2 bg-green-600 rounded-full" />
            </div>
          ) : (
            <div
              className="w-4 h-4 border-2 border-red-600 flex items-center justify-center rounded-sm shrink-0"
              title="Non-Veg"
              aria-label="Non-vegetarian"
            >
              <div className="w-2 h-2 bg-red-600 rounded-full" />
            </div>
          )}
          {item?.isSpicy ? (
            <span className="text-xs font-semibold text-red-500">Spicy</span>
          ) : null}
          <button
            type="button"
            aria-label={isBookmarked ? "Remove from favorites" : "Add to favorites"}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onBookmark?.(e)
            }}
            className={`p-1.5 border rounded-md transition-colors ${
              isBookmarked
                ? "border-red-500 text-red-500 bg-red-50 dark:bg-red-900/20"
                : "border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            <Heart size={14} className={isBookmarked ? "fill-red-500" : ""} />
          </button>
          <button
            type="button"
            aria-label="Share dish"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onShare?.(e)
            }}
            className="p-1.5 border border-gray-300 dark:border-gray-700 rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Share2 size={14} />
          </button>
        </div>

        <h3 className="font-bold text-gray-800 dark:text-white text-sm leading-tight line-clamp-1">
          {item?.name}
        </h3>

        {isRecommended ? (
          <div className="flex items-center gap-2 mt-1">
            <div className="h-1.5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-[#FF6A00] w-3/4" />
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
              Highly reordered
            </span>
          </div>
        ) : null}

        {description ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 leading-snug">
            {description}
          </p>
        ) : null}

        <div className="flex flex-col mt-1.5">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 flex-wrap">
              {hasDiscount ? (
                <span className="text-sm font-medium text-gray-400 line-through tabular-nums">
                  {RUPEE_SYMBOL}
                  {Math.round(otherPrice)}
                </span>
              ) : null}
              <p className={`font-bold text-base tabular-nums ${hasDiscount ? "text-[#FF6A00]" : "text-gray-900 dark:text-white"}`}>
                {RUPEE_SYMBOL}
                {Math.round(price)}
              </p>
              {prepTime ? (
                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                  <Clock size={12} className="text-gray-500" />
                  <span>{prepTime}</span>
                </div>
              ) : null}
            </div>
            <SavingsRow savingsAmount={savingsAmount} />
          </div>
          {customisable ? (
            <p className="text-[10px] text-gray-500 font-medium mt-0.5">Customisable</p>
          ) : null}
        </div>
      </div>

      {/* Right — image + fixed cart control */}
      <div className="relative w-24 h-24 shrink-0 mb-3">
        {item?.image ? (
          <img
            src={item.image}
            alt={item.name || "Dish"}
            className="w-full h-full object-cover rounded-xl shadow-sm"
            loading="lazy"
            onError={(e) => {
              if (e.currentTarget.src !== FOOD_IMAGE_FALLBACK) {
                e.currentTarget.src = FOOD_IMAGE_FALLBACK
              }
            }}
          />
        ) : (
          <div className="w-full h-full bg-gray-200 dark:bg-gray-700 rounded-xl flex items-center justify-center">
            <span className="text-xs text-gray-400">No image</span>
          </div>
        )}

        <div
          className={`${CART_CONTROL_CLASS} ${
            controlsLocked
              ? "border-gray-300 text-gray-400 opacity-60"
              : "border-[#FF6A00] text-[#FF6A00]"
          }`}
        >
          {quantity > 0 ? (
            <div className="w-full h-full flex items-stretch">
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={controlsLocked}
                onClick={handleDec}
                className="w-7 h-full flex items-center justify-center disabled:cursor-not-allowed hover:bg-red-50 active:scale-95 transition-transform"
              >
                <Minus size={13} />
              </button>
              <span
                className={`flex-1 flex items-center justify-center text-xs font-bold tabular-nums ${
                  controlsLocked ? "text-gray-400" : "text-[#FF6A00]"
                }`}
              >
                {quantity}
              </span>
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={controlsLocked || quantity >= quantityLimits.max}
                onClick={handleInc}
                className="w-7 h-full flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-40 hover:bg-red-50 active:scale-95 transition-transform"
              >
                <Plus size={13} className="stroke-[3px]" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              aria-label="Add to cart"
              disabled={controlsLocked}
              onClick={handleAddClick}
              className="w-full h-full flex items-center justify-center gap-0.5 text-[11px] font-bold uppercase tracking-wide disabled:cursor-not-allowed hover:bg-red-50 active:scale-[0.98] transition-transform"
            >
              ADD <Plus size={12} className="stroke-[3px]" />
            </button>
          )}
        </div>

        {/* Minimum order quantity, e.g. "Min 4" — sits under the ADD control. */}
        {minQuantityLabel ? (
          <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-[#FFF3E8] px-1.5 py-0.5 text-[10px] font-bold text-[#FF6A00] dark:bg-[#2b1408]">
            {minQuantityLabel}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function propsAreEqual(prev, next) {
  return (
    prev.item?.id === next.item?.id &&
    prev.item?.name === next.item?.name &&
    prev.item?.price === next.item?.price &&
    prev.item?.otherPrice === next.item?.otherPrice &&
    prev.item?.image === next.item?.image &&
    prev.item?.description === next.item?.description &&
    prev.item?.pricingScope === next.item?.pricingScope &&
    prev.item?.minOrderQuantity === next.item?.minOrderQuantity &&
    prev.item?.maxOrderQuantity === next.item?.maxOrderQuantity &&
    prev.quantity === next.quantity &&
    prev.isHighlighted === next.isHighlighted &&
    prev.isRecommended === next.isRecommended &&
    prev.isBookmarked === next.isBookmarked &&
    prev.isDisabled === next.isDisabled &&
    prev.isUpdating === next.isUpdating
  )
}

export default memo(RestaurantMenuItemCard, propsAreEqual)
