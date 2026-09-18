import { ArrowDownUp, Timer, ChevronDown } from "lucide-react"

export default function Under250FilterBar({
  selectedSort,
  sortOptions,
  under30MinsFilter,
  onOpenSort,
  onToggleUnder30,
  resultCount,
}) {
  const sortLabel = selectedSort
    ? sortOptions.find((opt) => opt.id === selectedSort)?.label
    : "Sort"

  return (
    <section className="sticky top-0 md:top-[160px] z-30 mt-4 w-full min-w-0 overflow-hidden">
      <div className="bg-white/85 dark:bg-[#08080a]/85 backdrop-blur-md border-y border-gray-100 dark:border-gray-900/60 py-3 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto w-full min-w-0 flex items-center justify-between gap-3">
          <div
            className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-1 min-w-0 overscroll-x-contain"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            <button
              type="button"
              onClick={onOpenSort}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-[12px] font-bold whitespace-nowrap flex-shrink-0 transition-all duration-200 ${
                selectedSort
                  ? "bg-[#FF6A00] border-[#FF6A00] text-white shadow-md shadow-orange-500/10"
                  : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:border-[#FF6A00] hover:text-[#FF6A00]"
              }`}
            >
              <ArrowDownUp className="h-3.5 w-3.5 rotate-90" strokeWidth={2} />
              {sortLabel}
              <ChevronDown className="h-3 w-3" />
            </button>

            <button
              type="button"
              onClick={onToggleUnder30}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-[12px] font-bold whitespace-nowrap flex-shrink-0 transition-all duration-200 ${
                under30MinsFilter
                  ? "bg-[#FF6A00] border-[#FF6A00] text-white shadow-md shadow-orange-500/10"
                  : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:border-[#FF6A00] hover:text-[#FF6A00]"
              }`}
            >
              <Timer className="h-3.5 w-3.5" strokeWidth={2} />
              Under 30 mins
            </button>
          </div>

          {resultCount > 0 && (
            <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 whitespace-nowrap hidden sm:block">
              {resultCount} restaurant{resultCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
