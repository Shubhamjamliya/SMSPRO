import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import { Star, Clock, MapPin, ArrowRight } from "lucide-react"
import Under250DishCard from "./Under250DishCard"

export default function Under250RestaurantSection({
  restaurant,
  sectionIndex,
  quantities,
  disabled,
  onItemClick,
  onAdd,
  onIncrement,
  onDecrement,
}) {
  const restaurantSlug = restaurant.slug || restaurant.name.toLowerCase().replace(/\s+/g, "-")

  return (
    <motion.section
      className="max-w-7xl mx-auto w-full min-w-0 overflow-hidden px-4 sm:px-6 lg:px-8"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay: sectionIndex * 0.05 }}
    >
      {/* Restaurant header card */}
      <div className="flex items-center justify-between gap-3 mb-4 p-4 rounded-2xl bg-white dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800/50 shadow-sm">
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] sm:text-base font-extrabold text-gray-900 dark:text-white truncate tracking-tight">
            {restaurant.name}
          </h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500">
            <span className="flex items-center gap-1 shrink-0">
              <Clock className="h-3.5 w-3.5 text-[#FF6A00]" strokeWidth={2} />
              {restaurant.deliveryTime}
            </span>
            {restaurant.distance && (
              <span className="flex items-center gap-1 shrink-0">
                <MapPin className="h-3.5 w-3.5 text-[#FF6A00]" strokeWidth={2} />
                {restaurant.distance}
              </span>
            )}
            <span className="text-gray-300 dark:text-gray-700">·</span>
            <span className="shrink-0">{restaurant.menuItems?.length || 0} dishes</span>
          </div>
        </div>

        <div className="flex flex-col items-end flex-shrink-0">
          <div className="flex items-center gap-1 bg-[#128C7E] text-white px-2 py-0.5 rounded-lg shadow-sm">
            <span className="text-[12px] font-bold leading-none">
              {restaurant.rating ? restaurant.rating.toFixed(1) : "—"}
            </span>
            <Star className="h-3 w-3 fill-white text-white" />
          </div>
          {restaurant.totalRatings > 0 && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 font-medium">
              {restaurant.totalRatings >= 1000
                ? `${(restaurant.totalRatings / 1000).toFixed(1)}K+`
                : `${restaurant.totalRatings}+`}
            </span>
          )}
        </div>
      </div>

      {/* Dish cards */}
      {restaurant.menuItems?.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 w-full min-w-0">
            {restaurant.menuItems.map((item, itemIndex) => (
              <Under250DishCard
                key={item.id}
                item={item}
                itemIndex={itemIndex}
                quantity={quantities[item.id] || 0}
                disabled={disabled}
                onItemClick={(dish) => onItemClick(dish, restaurant)}
                onAdd={(dish, e) => onAdd(dish, restaurant, e)}
                onIncrement={(dish, e) => onIncrement(dish, restaurant, e)}
                onDecrement={(dish, e) => onDecrement(dish, restaurant, e)}
              />
            ))}
          </div>

          <Link
            to={`/user/restaurants/${restaurantSlug}?under250=true`}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800 text-[13px] font-bold text-gray-500 dark:text-gray-400 hover:border-[#FF6A00] hover:text-[#FF6A00] hover:bg-orange-50/50 dark:hover:bg-orange-950/10 transition-all duration-200 group"
          >
            View full menu
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      )}

      {sectionIndex > 0 && (
        <div className="mt-8 border-t border-gray-100 dark:border-gray-900/60" />
      )}
    </motion.section>
  )
}
