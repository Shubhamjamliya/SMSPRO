import { motion } from "framer-motion"
import OptimizedImage from "@food/components/OptimizedImage"
import { CategorySkeleton } from "./Skeletons"

const RUPEE_SYMBOL = "\u20B9"

export default function Under250CategoryRail({ categories, activeCategory, onSelectCategory, loading }) {
  return (
    <section className="mt-5 w-full min-w-0 max-w-7xl mx-auto overflow-hidden px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between mb-3 min-w-0">
        <h2 className="text-base font-extrabold text-gray-900 dark:text-white tracking-tight">
          Browse by category
        </h2>
        {activeCategory && (
          <button
            type="button"
            onClick={() => onSelectCategory(null)}
            className="text-[11px] font-bold text-[#FF6A00] hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      <div
        className="flex w-full min-w-0 max-w-full overflow-x-auto gap-3 pb-2 no-scrollbar overscroll-x-contain"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
      >
        {/* All chip */}
        <motion.button
          type="button"
          onClick={() => onSelectCategory(null)}
          className="flex-shrink-0 flex flex-col items-center gap-2 group"
          whileTap={{ scale: 0.95 }}
        >
          <div
            className={`w-[70px] h-[70px] rounded-2xl overflow-hidden shadow-sm transition-all duration-300 ${
              !activeCategory
                ? "border-2 border-[#FF6A00] shadow-[0_6px_18px_rgba(255,106,0,0.25)]"
                : "border border-gray-100 dark:border-gray-800 group-hover:border-[#FF6A00]/30"
            }`}
          >
            <div className="bg-gradient-to-br from-[#FF6A00] to-[#C84B00] w-full h-full flex flex-col items-center justify-center text-white">
              <span className="text-[8px] font-black uppercase tracking-wider opacity-90">All</span>
              <span className="text-sm font-black tracking-tight leading-none">{RUPEE_SYMBOL}250</span>
            </div>
          </div>
          <span
            className={`text-[11px] font-bold transition-colors ${
              !activeCategory ? "text-[#FF6A00]" : "text-gray-600 dark:text-gray-400 group-hover:text-[#FF6A00]"
            }`}
          >
            All
          </span>
        </motion.button>

        {loading
          ? [0, 1, 2, 3, 4].map((i) => <CategorySkeleton key={i} />)
          : categories.map((category, index) => {
              const isActive = activeCategory === category.id
              return (
                <motion.button
                  key={category.id}
                  type="button"
                  onClick={() => onSelectCategory(isActive ? null : category.id)}
                  className="flex-shrink-0 flex flex-col items-center gap-2 group"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <div
                    className={`w-[70px] h-[70px] rounded-2xl overflow-hidden shadow-sm transition-all duration-300 bg-gray-50 dark:bg-gray-900 ${
                      isActive
                        ? "border-2 border-[#FF6A00] shadow-[0_6px_18px_rgba(255,106,0,0.2)]"
                        : "border border-gray-100 dark:border-gray-800 group-hover:border-[#FF6A00]/30"
                    }`}
                  >
                    {category.image ? (
                      <OptimizedImage
                        src={category.image}
                        alt={category.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        objectFit="cover"
                        sizes="70px"
                        placeholder="blur"
                      />
                    ) : (
                      <div className="w-full h-full bg-orange-50 dark:bg-orange-950/20 flex items-center justify-center">
                        <span className="text-lg font-black text-[#FF6A00]/60">
                          {category.name.charAt(0)}
                        </span>
                      </div>
                    )}
                  </div>
                  <span
                    className={`text-[11px] font-bold truncate max-w-[70px] text-center transition-colors ${
                      isActive
                        ? "text-[#FF6A00]"
                        : "text-gray-600 dark:text-gray-400 group-hover:text-[#FF6A00]"
                    }`}
                  >
                    {category.name.length > 8 ? `${category.name.slice(0, 8)}…` : category.name}
                  </span>
                </motion.button>
              )
            })}
      </div>
    </section>
  )
}
