import { motion, AnimatePresence } from "framer-motion"
import { X, Bookmark, Share2, ChevronLeft, ChevronRight, Plus, Minus } from "lucide-react"
import { Button } from "@food/components/ui/button"

const RUPEE_SYMBOL = "\u20B9"

export default function Under250ItemDetailSheet({
  isOpen,
  selectedItem,
  selectedItemImageIndex,
  itemDetailQuantity,
  bookmarkedItems,
  disabled,
  contentRef,
  onClose,
  onTouchStart,
  onTouchEnd,
  onWheel,
  onBookmark,
  onShare,
  onImagePrev,
  onImageNext,
  onImageDot,
  onQuantityDecrement,
  onQuantityIncrement,
  onAddItem,
}) {
  if (!selectedItem) return null

  const allImages = (selectedItem.images || []).filter((img) => img && typeof img === "string")
  if (selectedItem.image && !allImages.includes(selectedItem.image)) {
    allImages.unshift(selectedItem.image)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/40 z-[9999]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed left-0 right-0 bottom-0 md:left-1/2 md:right-auto md:-translate-x-1/2 md:max-w-2xl z-[10000] bg-white dark:bg-[#111] rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.15, type: "spring", damping: 30, stiffness: 400 }}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            onWheel={onWheel}
          >
            <div className="absolute -top-[44px] left-1/2 -translate-x-1/2 z-[10001]">
              <motion.button
                type="button"
                onClick={onClose}
                className="h-10 w-10 rounded-full bg-gray-800 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-900 transition-colors shadow-lg"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <X className="h-5 w-5 text-white" />
              </motion.button>
            </div>

            {/* Image */}
            <div className="relative w-full h-56 sm:h-64 overflow-hidden rounded-t-3xl bg-gray-100 dark:bg-gray-800">
              {allImages.length === 0 ? (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-sm text-gray-400">No image available</span>
                </div>
              ) : (
                <div className="relative w-full h-full">
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={selectedItemImageIndex}
                      src={allImages[selectedItemImageIndex]}
                      alt={selectedItem.name}
                      className="w-full h-full object-cover"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    />
                  </AnimatePresence>

                  {allImages.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onImagePrev(allImages.length) }}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/85 backdrop-blur-sm rounded-full flex items-center justify-center shadow z-10"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onImageNext(allImages.length) }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/85 backdrop-blur-sm rounded-full flex items-center justify-center shadow z-10"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                        {allImages.map((_, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onImageDot(idx) }}
                            className={`w-1.5 h-1.5 rounded-full transition-all ${
                              idx === selectedItemImageIndex ? "bg-white scale-125" : "bg-white/50"
                            }`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="absolute bottom-4 right-4 flex gap-2">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onBookmark(selectedItem.id) }}
                  className={`h-9 w-9 rounded-full border flex items-center justify-center transition-all ${
                    bookmarkedItems.has(selectedItem.id)
                      ? "border-red-500 bg-red-50 text-red-500"
                      : "border-white bg-white/90 text-gray-600"
                  }`}
                >
                  <Bookmark className={`h-4 w-4 ${bookmarkedItems.has(selectedItem.id) ? "fill-red-500" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onShare(selectedItem) }}
                  className="h-9 w-9 rounded-full border border-white bg-white/90 text-gray-600 flex items-center justify-center"
                >
                  <Share2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div ref={contentRef} className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex items-start gap-2 mb-3">
                {selectedItem.isVeg && (
                  <div className="mt-1 h-5 w-5 rounded border-2 border-green-600 bg-green-50 flex items-center justify-center flex-shrink-0">
                    <div className="h-2.5 w-2.5 rounded-full bg-green-600" />
                  </div>
                )}
                <div>
                  <h2 className="text-xl font-extrabold text-gray-900 dark:text-white leading-tight">
                    {selectedItem.name}
                  </h2>
                  <p className="text-xs font-semibold text-gray-400 mt-0.5">
                    from {selectedItem.restaurant || "Under 250"}
                  </p>
                </div>
              </div>

              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-4">
                {selectedItem.description ||
                  `${selectedItem.name} from ${selectedItem.restaurant || "Under 250"}`}
              </p>

              {selectedItem.customisable && (
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1 h-0.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-[#FF6A00] rounded-full w-1/2" />
                  </div>
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">
                    Highly reordered
                  </span>
                </div>
              )}

              {selectedItem.notEligibleForCoupons && (
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mb-3">
                  Not eligible for coupons
                </p>
              )}
            </div>

            {/* Bottom bar */}
            <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-4">
              <div className="flex items-center gap-3">
                <div
                  className={`flex items-center gap-3 border-2 rounded-2xl px-3 h-12 ${
                    disabled ? "border-gray-200 opacity-50" : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <button
                    type="button"
                    disabled={itemDetailQuantity <= 1 || disabled}
                    onClick={(e) => { e.stopPropagation(); onQuantityDecrement() }}
                    className="text-gray-500 disabled:opacity-40"
                  >
                    <Minus className="h-5 w-5" />
                  </button>
                  <span className="text-lg font-bold min-w-[1.5rem] text-center text-gray-900 dark:text-white">
                    {itemDetailQuantity}
                  </span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={(e) => { e.stopPropagation(); onQuantityIncrement() }}
                    className="text-gray-500"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>

                <Button
                  disabled={disabled}
                  className={`flex-1 h-12 rounded-2xl font-bold flex items-center justify-center gap-2 ${
                    disabled
                      ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                      : "bg-[#FF6A00] hover:bg-[#E85D04] text-white shadow-md shadow-orange-500/15"
                  }`}
                  onClick={(e) => onAddItem(e)}
                >
                  <span>Add item</span>
                  <span className="font-extrabold">
                    {RUPEE_SYMBOL}{Math.round(selectedItem.price)}
                  </span>
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
