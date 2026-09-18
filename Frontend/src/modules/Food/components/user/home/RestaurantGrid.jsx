import React, { memo } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Clock, BadgePercent, Timer, Heart, MapPin } from "lucide-react";
import { Card, CardContent } from "@food/components/ui/card";
import { Button } from "@food/components/ui/button";
import { RestaurantGridSkeleton, LoadingSkeletonRegion } from "@food/components/ui/loading-skeletons";
import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability";
import RestaurantImageCarousel from "./RestaurantImageCarousel";

const getRestaurantDisplayLocation = (restaurant) => {
  const loc = restaurant?.location;
  if (typeof loc === "string" && loc.trim()) return loc.trim();

  const area = (typeof loc === "object" && loc?.area) || restaurant?.area;
  const city = (typeof loc === "object" && loc?.city) || restaurant?.city;
  const areaCity = [area, city].filter(Boolean).join(", ");
  if (areaCity) return areaCity;

  if (loc && typeof loc === "object") {
    return loc.formattedAddress || loc.address || null;
  }

  return null;
};

const FoodRestaurantCard = memo(({ 
  restaurant, 
  index, 
  isOutOfService, 
  currentDate,
  isFavorite, 
  onFavoriteToggle, 
  backendOrigin 
}) => {
  const nameStr = typeof restaurant?.name === "string" ? restaurant.name.trim() : "";
  const fallbackSlugSource =
    nameStr ||
    (typeof restaurant?.restaurantName === "string" ? restaurant.restaurantName.trim() : "") ||
    String(restaurant?.slug || restaurant?.id || restaurant?._id || `restaurant-${index}`);

  const restaurantSlug =
    typeof restaurant?.slug === "string" && restaurant.slug.trim()
      ? restaurant.slug.trim()
      : fallbackSlugSource.toLowerCase().replace(/\s+/g, "-");

  const availability = getRestaurantAvailabilityStatus(restaurant, currentDate, {
    ignoreOperationalStatus: false,
  });
  const favorite = isFavorite(restaurantSlug);
  const displayLocation = getRestaurantDisplayLocation(restaurant);

  return (
    <div
      key={restaurant?.id || restaurant?._id || restaurantSlug || index}
      className="h-full transform transition-all duration-300 hover:-translate-y-2 hover:scale-[1.01]"
      style={{
        perspective: 1000,
        animation: index < 10 ? `fade-in-up 0.5s ease-out ${index * 0.05}s backwards` : "none",
      }}
    >
      <div className="h-full group">
        <Link to={`/user/restaurants/${restaurantSlug}`} className="flex h-full">
          <Card
            className={`relative flex h-full w-full flex-col gap-0 overflow-hidden rounded-[24px] border border-gray-100/70 bg-white py-0 shadow-[0_4px_20px_rgba(0,0,0,0.015)] transition-all duration-500 hover:shadow-[0_15px_35px_rgba(0,0,0,0.07)] hover:border-gray-200/40 dark:border-gray-800/80 dark:bg-[#1a1a1a] ${
              isOutOfService || !availability.isOpen ? "grayscale opacity-75" : ""
            }`}
          >
            <div className="relative">
              <RestaurantImageCarousel
                restaurant={restaurant}
                priority={index < 3}
                backendOrigin={backendOrigin}
              />

              {restaurant.featuredDish && (
                <div className="absolute left-3 top-3 z-10 flex items-center transform transition-transform duration-300 group-hover:scale-105">
                  <div className="flex items-center rounded-full bg-black/85 px-3 py-1.5 text-[10px] sm:text-[11px] font-bold tracking-tight text-white shadow-xl backdrop-blur-md">
                    {restaurant.featuredDish} {restaurant.featuredPrice ? `• ₹${restaurant.featuredPrice}` : ""}
                  </div>
                </div>
              )}

              <div className="absolute right-3 top-3 z-10 transform transition-transform duration-300 group-hover:scale-110">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onFavoriteToggle(event, restaurant, restaurantSlug, favorite);
                  }}
                  aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
                  className={`flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full shadow-lg transition-all duration-300 ${
                    favorite
                      ? "bg-white text-red-500"
                      : "bg-white/90 text-gray-800 backdrop-blur-sm hover:bg-white text-red-500"
                  }`}
                >
                  <Heart className={`h-4 w-4 sm:h-5 sm:w-5 transition-all duration-300 ${favorite ? "fill-red-500 text-red-500" : ""}`} />
                </Button>
              </div>
              
              <div className="absolute right-3 bottom-3 z-10 transform transition-transform duration-300 group-hover:scale-105">
                <div
                  className={`flex-shrink-0 rounded-lg px-2.5 py-1 text-white shadow-md backdrop-blur-md ${
                    Number(restaurant.rating) >= 4.0 
                      ? "bg-emerald-600/90" 
                      : Number(restaurant.rating) > 0 
                      ? "bg-[#FF6A00]/95" 
                      : "bg-gray-400/90"
                  } flex items-center gap-1`}
                >
                  <span className="text-[10px] sm:text-[11px] font-black tracking-wider leading-none">
                    {Number(restaurant.rating) > 0 ? Number(restaurant.rating).toFixed(1) : "NEW"}
                  </span>
                  {Number(restaurant.rating) > 0 && (
                    <Star className="h-3 w-3 fill-white text-white" strokeWidth={0} />
                  )}
                </div>
              </div>
            </div>

            <div className="transform transition-transform duration-300">
              <CardContent className="flex flex-grow flex-col p-2.5 sm:p-3 gap-1">
                <div className="flex flex-col">
                  <h3 className="line-clamp-1 text-[14px] sm:text-[15px] font-black leading-tight tracking-tight text-gray-900 transition-colors duration-300 group-hover:text-[#FF6A00] dark:text-white">
                    {restaurant.name}
                  </h3>
                  {displayLocation && (
                    <p className="mt-0.5 flex items-center gap-1 line-clamp-1 text-[10px] sm:text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                      <MapPin className="h-3 w-3 flex-shrink-0 text-gray-400" strokeWidth={2} />
                      <span>{displayLocation}</span>
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-gray-500 opacity-80 transition-opacity duration-300 group-hover:opacity-100">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-gray-400 dark:text-gray-400" strokeWidth={2} />
                    <span className="font-bold text-gray-700 dark:text-gray-300">{restaurant.deliveryTime}</span>
                  </div>
                  <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600"></span>
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-gray-700 dark:text-gray-300">{restaurant.distance}</span>
                  </div>
                  {availability.isOpen && availability.closingCountdownLabel && (
                    <div className="ml-auto flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-500 border border-red-100">
                      <Timer className="h-2.5 w-2.5 flex-shrink-0" strokeWidth={2.5} />
                      <span>{availability.closingCountdownLabel}</span>
                    </div>
                  )}
                </div>

                {restaurant.offer && (
                  <div className="flex items-center gap-1 text-[10px] sm:text-[11px] transition-transform duration-300 group-hover:translate-x-1 border-t border-dashed border-gray-100 dark:border-gray-800 pt-1 mt-0.5">
                    <BadgePercent className="h-3.5 w-3.5 text-[#FF6A00] animate-pulse" strokeWidth={2.5} />
                    <span className="font-extrabold text-[#E85D04] dark:text-[#FF8c42] truncate">{restaurant.offer}</span>
                  </div>
                )}
              </CardContent>
            </div>

            <div className="pointer-events-none absolute inset-0 z-0 rounded-[24px] border border-transparent transition-all duration-300 group-hover:border-[#FF6A00]/20" />
          </Card>
        </Link>
      </div>
    </div>
  );
});

const RestaurantGrid = memo(({
  filteredRestaurants,
  visibleRestaurants,
  showRestaurantSkeleton,
  isLoadingFilterResults,
  loadingRestaurants,
  isOutOfService,
  availabilityTick,
  isFavorite,
  onFavoriteToggle,
  backendOrigin,
  hasMoreRestaurants,
  loadMoreRestaurants,
  restaurantLoadMoreRef
}) => {
  const observer = React.useRef();

  // Pre-compute Date object once per tick to avoid N new Date() calls inside card renders
  const currentDate = React.useMemo(() => new Date(availabilityTick), [availabilityTick]);

  React.useEffect(() => {
    if (loadingRestaurants || !hasMoreRestaurants) return;

    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        loadMoreRestaurants();
      }
    }, { threshold: 0.1, rootMargin: '100px' });

    if (restaurantLoadMoreRef?.current) {
      observer.current.observe(restaurantLoadMoreRef.current);
    }

    return () => {
      if (observer.current) observer.current.disconnect();
    };
  }, [loadingRestaurants, hasMoreRestaurants, loadMoreRestaurants, restaurantLoadMoreRef]);

  return (
    <section className="content-auto space-y-0 pb-8 pt-3 sm:pt-4 md:pb-10 lg:pt-6 max-w-7xl mx-auto">
      <div className="mb-6 px-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-black uppercase tracking-widest text-[#9ca3af]">
            {filteredRestaurants.length} Restaurants near you
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-[#1c1c1e] dark:text-white leading-tight mt-0.5">
            Featured Restaurants
          </h2>
        </div>
      </div>
      
      <div className={`relative ${showRestaurantSkeleton ? "min-h-[360px] sm:min-h-[420px]" : ""}`}>
        <AnimatePresence>
          {showRestaurantSkeleton && (
            <motion.div
              className="absolute inset-0 z-10 rounded-lg bg-white/94 dark:bg-[#1a1a1a]/94"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <LoadingSkeletonRegion label="Loading restaurants" className="h-full p-1 sm:p-2">
                <RestaurantGridSkeleton count={3} className="grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3" compact />
              </LoadingSkeletonRegion>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          className={`grid grid-cols-1 items-stretch gap-5 px-4 pt-1 transition-opacity duration-300 sm:gap-4 sm:pt-1.5 md:grid-cols-2 lg:gap-5 lg:pt-2 lg:grid-cols-3 xl:gap-6 ${
            isLoadingFilterResults || loadingRestaurants ? "opacity-50" : "opacity-100"
          }`}
        >
          {visibleRestaurants.map((restaurant, index) => (
            <FoodRestaurantCard
              key={restaurant?.id || restaurant?._id || restaurant?.slug || index}
              restaurant={restaurant}
              index={index}
              isOutOfService={isOutOfService}
              currentDate={currentDate}
              isFavorite={isFavorite}
              onFavoriteToggle={onFavoriteToggle}
              backendOrigin={backendOrigin}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 px-4 pt-4 sm:pt-6">
        {hasMoreRestaurants && loadingRestaurants && (
          <div className="flex items-center justify-center py-4">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#FF6A00] border-t-transparent"></div>
          </div>
        )}
        <div ref={restaurantLoadMoreRef} className="h-10 w-full" aria-hidden="true" />
      </div>
    </section>
  );
});

export default RestaurantGrid;
