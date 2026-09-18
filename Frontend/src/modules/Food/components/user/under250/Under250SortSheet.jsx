import { motion, AnimatePresence } from "framer-motion"

export default function Under250SortSheet({
  isOpen,
  sortOptions,
  draftSelectedSort,
  onSelectSort,
  onClearAll,
  onClose,
  onApply,
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-[100]"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 md:left-1/2 md:right-auto md:-translate-x-1/2 md:max-w-lg bg-white dark:bg-[#111] rounded-t-3xl shadow-2xl z-[110] max-h-[60vh] overflow-hidden flex flex-col"
          >
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-12 h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
            </div>

            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-extrabold text-gray-900 dark:text-white">Sort by</h2>
              <button
                type="button"
                onClick={onClearAll}
                className="text-[#FF6A00] font-bold text-sm"
              >
                Clear all
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex flex-col gap-2.5">
                {sortOptions.map((option) => (
                  <button
                    key={option.id || "relevance"}
                    type="button"
                    onClick={() => onSelectSort(option.id)}
                    className={`px-4 py-3.5 rounded-2xl border text-left transition-all duration-200 ${
                      draftSelectedSort === option.id
                        ? "border-[#FF6A00] bg-orange-50 dark:bg-orange-950/20 shadow-sm shadow-orange-500/5"
                        : "border-gray-200 dark:border-gray-800 hover:border-[#FF6A00]/50"
                    }`}
                  >
                    <span
                      className={`text-sm font-bold ${
                        draftSelectedSort === option.id
                          ? "text-[#FF6A00]"
                          : "text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {option.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3.5 text-center font-bold text-gray-600 dark:text-gray-400 text-sm rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={onApply}
                className="flex-1 py-3.5 font-bold rounded-2xl text-sm bg-[#FF6A00] text-white hover:bg-[#E85D04] transition-colors shadow-md shadow-orange-500/15"
              >
                Apply
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
