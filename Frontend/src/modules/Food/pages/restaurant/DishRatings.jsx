import { ChefHat, Star } from "lucide-react"
import RestaurantPageShell from "@food/components/restaurant/RestaurantPageShell"

export default function DishRatings() {
  return (
    <RestaurantPageShell
      title="Dish Ratings"
      subtitle="Customer reviews for individual dishes"
      maxWidth="lg"
      contentClassName="py-16 flex flex-col items-center text-center"
    >
      <div className="w-20 h-20 bg-amber-50 dark:bg-amber-900/20 rounded-3xl flex items-center justify-center mb-5 relative">
        <ChefHat className="w-10 h-10 text-amber-500 dark:text-amber-400" strokeWidth={1.5} />
        <div className="absolute -top-1 -right-1 w-6 h-6 bg-amber-400 rounded-full flex items-center justify-center">
          <Star className="w-3.5 h-3.5 text-white" fill="white" strokeWidth={0} />
        </div>
      </div>
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No dish ratings yet</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-xs">
        When customers rate your individual dishes, their reviews will show up here to help you improve your menu.
      </p>
    </RestaurantPageShell>
  )
}
