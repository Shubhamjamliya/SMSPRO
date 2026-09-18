import React, { memo } from "react";
import { SlidersHorizontal, MapPin } from "lucide-react";
import { Button } from "@food/components/ui/button";

const PRIMARY_FILTERS = [
  { id: "delivery-under-30", label: "Under 30 mins" },
  { id: "delivery-under-45", label: "Under 45 mins" },
  { id: "distance-under-1km", label: "Under 1km", icon: MapPin },
  { id: "distance-under-2km", label: "Under 2km", icon: MapPin },
];

const SortFilterSection = memo(({ activeFilters, toggleFilter, setIsFilterOpen }) => {
  return (
    <section className="sticky top-0 md:top-[128px] z-40 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-900/60 py-3 px-4 shadow-[0_2px_12px_rgba(0,0,0,0.01)] transition-all duration-300">
      <div
        className="max-w-7xl mx-auto flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none sm:gap-2 lg:gap-3"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <div className="transition-transform hover:scale-105 active:scale-95">
          <Button
            variant="outline"
            onClick={() => setIsFilterOpen(true)}
            className="flex h-8 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-200 bg-white px-4 font-bold text-gray-700 transition-all hover:bg-gray-50 dark:border-gray-800 dark:bg-[#1a1a1a] dark:text-white dark:hover:bg-gray-800 sm:h-9"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="text-xs font-bold text-gray-900 dark:text-white sm:text-sm">Filters</span>
          </Button>
        </div>

        {PRIMARY_FILTERS.map((filter, index) => {
          const Icon = filter.icon;
          const isActive = activeFilters.has(filter.id);

          return (
            <div
              key={filter.id}
              className="animate-in fade-in"
              style={{ animationDelay: `${index * 50}ms`, animationFillMode: "backwards" }}
            >
              <Button
                variant="outline"
                onClick={() => toggleFilter(filter.id)}
                className={`flex h-8 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 font-bold transition-all duration-300 active:scale-95 sm:h-9 ${
                  isActive
                    ? "border-0 bg-gradient-to-r from-[#FF6A00] to-[#E85D04] text-white hover:opacity-95 shadow-[0_4px_12px_rgba(255,106,0,0.18)]"
                    : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-[#1a1a1a] dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                {Icon && <Icon className={`h-3.5 w-3.5 ${isActive ? "fill-white text-white" : "text-gray-500"}`} />}
                <span className={`text-xs font-bold sm:text-sm ${isActive ? "text-white" : "text-gray-800 dark:text-gray-200"}`}>{filter.label}</span>
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
});

export default SortFilterSection;
