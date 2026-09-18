import { motion } from "framer-motion"
import { Plus, Minus } from "lucide-react"
import OptimizedImage from "@food/components/OptimizedImage"

const RUPEE_SYMBOL = "\u20B9"

export default function Under250DishCard({
  item,
  itemIndex,
  quantity,
  disabled,
  onItemClick,
  onAdd,
  onIncrement,
  onDecrement,
}) {
  return (
    <motion.div
      className="w-full min-w-0 group cursor-pointer"
      onClick={() => onItemClick(item)}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, delay: itemIndex * 0.04 }}
    >
      <div className="relative w-full min-w-0 rounded-2xl overflow-hidden border border-gray-100/90 dark:border-gray-800/50 bg-white dark:bg-gray-900/80 backdrop-blur-md transition-all duration-300 group-hover:shadow-[0_16px_40px_-16px_rgba(255,106,0,0.2)] group-hover:border-[#FF6A00]/30 md:group-hover:-translate-y-1">
        {/* Image */}
        <div className="relative h-32 sm:h-36 md:h-40 overflow-hidden bg-gray-100 dark:bg-gray-800">
          <OptimizedImage
            src={item.image}
            alt={item.name}
            className="w-full h-full transition-transform duration-700 ease-out group-hover:scale-108"
            objectFit="cover"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            placeholder="blur"
            priority={itemIndex < 4}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          {/* Price badge */}
          <div className="absolute bottom-2.5 left-2.5 bg-black/55 backdrop-blur-md text-white px-2 py-0.5 rounded-lg text-[11px] font-extrabold ring-1 ring-white/10">
            {RUPEE_SYMBOL}{Math.round(item.price)}
          </div>

          {/* Veg indicator */}
          {item.isVeg && (
            <div className="absolute top-2.5 left-2.5 h-4 w-4 rounded border-2 border-green-600 bg-white flex items-center justify-center">
              <div className="h-2 w-2 rounded-full bg-green-600" />
            </div>
          )}

          {/* Add / qty control */}
          <div
            className="absolute bottom-2.5 right-2.5"
            onClick={(e) => e.stopPropagation()}
          >
            {quantity > 0 ? (
              <div className="flex items-center gap-1 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={(e) => onDecrement(item, e)}
                  className="p-1.5 text-[#FF6A00] hover:bg-orange-50 dark:hover:bg-orange-950/30 disabled:opacity-50"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs font-bold text-gray-900 dark:text-white min-w-[1.25rem] text-center">
                  {quantity}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={(e) => onIncrement(item, e)}
                  className="p-1.5 text-[#FF6A00] hover:bg-orange-50 dark:hover:bg-orange-950/30 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={disabled}
                onClick={(e) => onAdd(item, e)}
                className="flex items-center gap-0.5 bg-white dark:bg-gray-900 text-[#FF6A00] px-3 py-1.5 rounded-xl text-[11px] font-extrabold shadow-lg border border-[#FF6A00]/20 hover:bg-[#FF6A00] hover:text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="h-3 w-3" />
                ADD
              </button>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="p-3">
          <div className="flex items-start gap-1.5 mb-1">
            {item.isVeg && (
              <div className="mt-0.5 h-3 w-3 rounded border border-green-600 bg-green-50 dark:bg-green-900/20 flex items-center justify-center flex-shrink-0">
                <div className="h-1.5 w-1.5 rounded-full bg-green-600" />
              </div>
            )}
            <h4 className="text-[13px] font-bold text-gray-900 dark:text-white line-clamp-2 leading-snug group-hover:text-[#FF6A00] transition-colors">
              {item.name}
            </h4>
          </div>
          {item.bestPrice && (
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
              Best price
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}
