import React, { memo } from "react";
import { Link } from "react-router-dom";
import { ArrowDownUp } from "lucide-react";
import { CategoryChipRowSkeleton } from "@food/components/ui/loading-skeletons";
import OptimizedImage from "@food/components/OptimizedImage";
import foodPattern from "@food/assets/food_pattern_background.png";

const CategoryRail = memo(({
  displayCategories,
  showCategorySkeleton,
  navigate,
  setShowAllCategoriesModal,
  backendOrigin = ""
}) => {
  const openAllCategories = () => {
    if (typeof setShowAllCategoriesModal === "function") {
      setShowAllCategoriesModal(true);
      return;
    }
    navigate("/user/categories");
  };

  return (
    <section className="mt-4 px-3 sm:mt-5 sm:px-4" data-purpose="mind-categories">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="min-w-0 truncate text-[15px] font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-base">
          What's on your mind?
        </h3>
        <button
          type="button"
          className="shrink-0 rounded-full bg-orange-50 px-3 py-1 text-[11px] font-black text-[#FF6A00] transition active:scale-95 dark:bg-[#FF6A00]/10"
          onClick={openAllCategories}
        >
          See all
        </button>
      </div>

      <div
        className="-mx-3 flex snap-x gap-3 overflow-x-auto px-3 pb-2 scrollbar-none sm:-mx-4 sm:px-4"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {/* Offers Card */}
        <div
          className="group flex w-[64px] shrink-0 snap-start cursor-pointer flex-col items-center gap-1.5 sm:w-[74px] sm:gap-2"
          onClick={() => navigate("/user/under-250")}
        >
          <div className="h-16 w-16 overflow-hidden rounded-2xl border border-[#FF6A00]/20 shadow-sm transition-all duration-300 group-hover:scale-105 group-hover:shadow-[0_6px_18px_rgba(255,106,0,0.18)] sm:h-[74px] sm:w-[74px]">
            <div className="bg-gradient-to-br from-[#FF6A00] to-[#C84B00] w-full h-full flex flex-col items-center justify-center text-white">
              <span className="text-[8px] font-black uppercase tracking-wider opacity-90">Under</span>
              <span className="text-base font-black tracking-tight leading-none">₹250</span>
              <div className="bg-white/20 text-white text-[7px] px-2 py-0.5 rounded-full mt-1.5 font-extrabold uppercase">Claim</div>
            </div>
          </div>
          <span className="text-[11px] font-bold text-gray-600 dark:text-gray-400 group-hover:text-[#FF6A00] transition-colors">Offers</span>
        </div>

        {!showCategorySkeleton && displayCategories.map((category, index) => (
          <Link
            key={category.id || index}
            to={`/user/category/${category.slug || category.name.toLowerCase().replace(/\s+/g, "-")}`}
            className="group flex w-[64px] shrink-0 snap-start flex-col items-center gap-1.5 sm:w-[74px] sm:gap-2"
          >
            <div className="h-16 w-16 overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 shadow-sm transition-all duration-300 group-hover:scale-105 group-hover:border-[#FF6A00]/30 group-hover:shadow-[0_6px_18px_rgba(255,106,0,0.12)] dark:border-gray-800 dark:bg-gray-900 sm:h-[74px] sm:w-[74px]">
              <OptimizedImage
                src={category.image}
                alt={category.name}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                backendOrigin={backendOrigin}
              />
            </div>
            <span className="line-clamp-2 max-w-full text-center text-[10px] font-bold leading-tight text-gray-600 transition-colors group-hover:text-[#FF6A00] dark:text-gray-400 sm:text-[11px]">
              {category.name}
            </span>
          </Link>
        ))}

        {showCategorySkeleton && <CategoryChipRowSkeleton className="flex-shrink-0" />}
      </div>
    </section>
  );
});

export default CategoryRail;
