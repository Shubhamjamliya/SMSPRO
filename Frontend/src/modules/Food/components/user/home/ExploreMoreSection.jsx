import React, { memo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ExploreGridSkeleton } from "@food/components/ui/loading-skeletons";
import OptimizedImage from "@food/components/OptimizedImage";
import discoveryBg from "@food/assets/food_discovery_bg.png";

const ExploreMoreSection = memo(({
  exploreMoreHeading,
  showExploreSkeleton,
  finalExploreItems,
  backendOrigin = ""
}) => {
  return (
    <section className="px-4 py-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-extrabold text-gray-900 dark:text-white tracking-tight">
          {exploreMoreHeading || "Explore More"}
        </h3>
        <span className="text-[11px] font-bold text-[#FF6A00]">Discover →</span>
      </div>

      {showExploreSkeleton ? (
        <div className="grid grid-cols-3 gap-3">
          <ExploreGridSkeleton count={3} className="grid-cols-3" />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {finalExploreItems.map((item, index) => (
            <Link
              key={item.id}
              to={item.href}
              className="group flex flex-col items-center gap-2"
            >
              <div className="relative w-full aspect-square rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 shadow-sm bg-gray-50 dark:bg-gray-900 transition-all duration-300 group-hover:scale-[1.03] group-hover:shadow-[0_8px_24px_rgba(255,106,0,0.13)] group-hover:border-[#FF6A00]/30 group-active:scale-95">
                <OptimizedImage
                  src={item.image}
                  alt={item.label}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  backendOrigin={backendOrigin}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                <span className="absolute bottom-2 left-0 right-0 text-center text-[11px] font-bold text-white drop-shadow-md px-1 leading-tight">
                  {item.label}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
});

export default ExploreMoreSection;
