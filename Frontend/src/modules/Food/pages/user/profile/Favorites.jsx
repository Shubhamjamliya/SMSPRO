import { Link } from "react-router-dom"
import { useState } from "react"

import { Heart, Star, Clock, MapPin, ArrowRight, ArrowLeft, Bookmark } from "lucide-react"
import AnimatedPage from "@food/components/user/AnimatedPage"
import ScrollReveal from "@food/components/user/ScrollReveal"
import { Card, CardTitle, CardContent } from "@food/components/ui/card"
import { Button } from "@food/components/ui/button"
import { useProfile } from "@food/context/ProfileContext"
import { toast } from "sonner"

export default function Favorites() {
  const { getFavorites, removeFavorite, getDishFavorites, removeDishFavorite } = useProfile()
  const restaurantFavorites = getFavorites()
  const dishFavorites = getDishFavorites()
  const [activeTab, setActiveTab] = useState("restaurants")

  const handleRemoveFavorite = (e, slug) => {
    e.preventDefault()
    e.stopPropagation()
    if (window.confirm("Remove this restaurant from favorites?")) {
      removeFavorite(slug)
      toast.success("Restaurant removed from favorites")
    }
  }

  const handleRemoveDishFavorite = (e, dishId, restaurantId) => {
    e.preventDefault()
    e.stopPropagation()
    if (window.confirm("Remove this dish from favorites?")) {
      removeDishFavorite(dishId, restaurantId)
      toast.success("Dish removed from favorites")
    }
  }

  const totalFavorites = restaurantFavorites.length + dishFavorites.length

  if (totalFavorites === 0) {
    return (
      <AnimatedPage className="min-h-screen bg-gradient-to-b from-yellow-50/30 via-white to-red-50/20 dark:from-[#0a0a0a] dark:via-[#0a0a0a] dark:to-[#0a0a0a] p-4 sm:p-6 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <ScrollReveal>
            <div className="flex items-center gap-3 sm:gap-4 mb-6">
              <Link to="/food/user/profile">
                <Button variant="ghost" size="icon" className="rounded-full h-10 w-10 bg-white/50 hover:bg-white shadow-sm transition-all">
                  <ArrowLeft className="h-5 w-5 text-gray-700" />
                </Button>
              </Link>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">My Favorites</h1>
            </div>
          </ScrollReveal>
          <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-md">
            <CardContent className="py-16 text-center flex flex-col items-center justify-center">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6">
                <Heart className="h-10 w-10 text-red-400" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">No favorites yet</h2>
              <p className="text-muted-foreground text-sm max-w-sm mb-8">
                You haven't added any restaurants or dishes to your favorites. Start exploring to save what you love!
              </p>
              <Link to="/food/user">
                <Button className="bg-gradient-to-r from-[#FF6A00] to-red-500 hover:opacity-90 text-white rounded-full px-8 py-6 text-base font-semibold shadow-md hover:shadow-lg transition-all active:scale-95">
                  Explore Now
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </AnimatedPage>
    )
  }

  return (
    <AnimatedPage className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] pb-24">
      <div className="bg-white dark:bg-[#111] sticky top-0 z-30 shadow-sm border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <ScrollReveal>
            <div className="flex items-center gap-3">
              <Link to="/food/user/profile">
                <Button variant="ghost" size="icon" className="rounded-full h-10 w-10 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors">
                  <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">My Favorites</h1>
                <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm font-medium mt-0.5">
                  {dishFavorites.length} {dishFavorites.length === 1 ? "dish" : "dishes"} • {restaurantFavorites.length} {restaurantFavorites.length === 1 ? "restaurant" : "restaurants"}
                </p>
              </div>
            </div>
          </ScrollReveal>
        </div>
        
        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-6 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab("restaurants")}
            className={`py-4 font-semibold text-sm sm:text-base whitespace-nowrap transition-all relative ${
              activeTab === "restaurants"
                ? "text-[#FF6A00]"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            Restaurants ({restaurantFavorites.length})
            {activeTab === "restaurants" && (
              <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#FF6A00] rounded-t-md" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("dishes")}
            className={`py-4 font-semibold text-sm sm:text-base whitespace-nowrap transition-all relative ${
              activeTab === "dishes"
                ? "text-[#FF6A00]"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            Dishes ({dishFavorites.length})
            {activeTab === "dishes" && (
              <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#FF6A00] rounded-t-md" />
            )}
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Restaurants Tab */}
        {activeTab === "restaurants" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {restaurantFavorites.length === 0 ? (
              <div className="col-span-full py-16 text-center bg-white dark:bg-[#111] rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
                <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Heart className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No restaurants saved</h3>
                <p className="text-gray-500 text-sm max-w-xs mx-auto mb-6">Find your favorite spots and save them here for quick access.</p>
                <Link to="/food/user">
                  <Button className="bg-[#FF6A00] hover:bg-orange-600 text-white rounded-full px-6">
                    Browse Restaurants
                  </Button>
                </Link>
              </div>
            ) : (
              restaurantFavorites.map((restaurant, index) => (
                <ScrollReveal key={restaurant.slug} delay={index * 0.05}>
                  <Link to={`/food/user/restaurants/${restaurant.slug}`}>
                    <Card className="overflow-hidden h-full border-0 shadow-sm hover:shadow-xl transition-all duration-300 group rounded-2xl bg-white dark:bg-[#111]">
                      <div className="h-40 sm:h-48 w-full relative overflow-hidden bg-gray-100">
                        <img
                          src={restaurant.image}
                          alt={restaurant.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                          onError={(e) => {
                            e.target.src = `https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&h=600&fit=crop&q=80`
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80" />
                        
                        <div className="absolute top-3 right-3">
                          <button
                            className="h-8 w-8 rounded-full bg-white/95 backdrop-blur-sm shadow-sm flex items-center justify-center hover:scale-110 active:scale-95 transition-all text-red-500"
                            onClick={(e) => handleRemoveFavorite(e, restaurant.slug)}
                          >
                            <Heart className="h-4 w-4 fill-red-500" />
                          </button>
                        </div>
                        
                        <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end">
                          <div>
                            <h3 className="text-white font-bold text-lg leading-tight line-clamp-1 mb-1 shadow-sm">
                              {restaurant.name}
                            </h3>
                            <p className="text-white/90 text-xs font-medium line-clamp-1">
                              {restaurant.cuisine}
                            </p>
                          </div>
                          {restaurant.rating && (
                            <div className="flex items-center gap-1 bg-green-600 px-2 py-1 rounded-lg shadow-sm shrink-0">
                              <span className="font-bold text-xs text-white">{restaurant.rating}</span>
                              <Star className="h-3 w-3 fill-white text-white" />
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            <span className="font-medium">{restaurant.deliveryTime || "30-40 min"}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5" />
                            <span className="font-medium">{restaurant.distance || "3.5 km"}</span>
                          </div>
                        </div>
                        <div className="w-full flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
                          <span className="text-[#FF6A00] text-sm font-bold">View Menu</span>
                          <ArrowRight className="h-4 w-4 text-[#FF6A00]" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </ScrollReveal>
              ))
            )}
          </div>
        )}

        {/* Dishes Tab */}
        {activeTab === "dishes" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {dishFavorites.length === 0 ? (
              <div className="col-span-full py-16 text-center bg-white dark:bg-[#111] rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
                <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Heart className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No dishes saved</h3>
                <p className="text-gray-500 text-sm max-w-xs mx-auto mb-6">Crave it later? Save dishes you love while browsing menus.</p>
                <Link to="/food/user">
                  <Button className="bg-[#FF6A00] hover:bg-orange-600 text-white rounded-full px-6">
                    Discover Food
                  </Button>
                </Link>
              </div>
            ) : (
              dishFavorites.map((dish, index) => {
                const restaurantSlug = dish.restaurantSlug || ""
                return (
                  <ScrollReveal key={`${dish.id}-${dish.restaurantId}`} delay={index * 0.05}>
                    <Link to={`/food/user/restaurants/${restaurantSlug}?dish=${dish.id}`}>
                      <Card className="overflow-hidden h-full border-0 shadow-sm hover:shadow-xl transition-all duration-300 group rounded-2xl bg-white dark:bg-[#111]">
                        <div className="h-40 sm:h-48 w-full relative overflow-hidden bg-gray-100">
                          <img
                            src={dish.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&h=600&fit=crop&q=80"}
                            alt={dish.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            loading="lazy"
                            onError={(e) => {
                              e.target.src = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&h=600&fit=crop&q=80"
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80" />
                          
                          <div className="absolute top-3 right-3">
                            <button
                              className="h-8 w-8 rounded-full bg-white/95 backdrop-blur-sm shadow-sm flex items-center justify-center hover:scale-110 active:scale-95 transition-all text-red-500"
                              onClick={(e) => handleRemoveDishFavorite(e, dish.id, dish.restaurantId)}
                            >
                              <Heart className="h-4 w-4 fill-red-500 text-red-500" />
                            </button>
                          </div>
                          
                          <div className="absolute bottom-3 left-3 right-3">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              {dish.foodType === "Veg" ? (
                                <div className="w-3.5 h-3.5 border-2 border-green-500 flex items-center justify-center rounded-sm bg-white/10">
                                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                                </div>
                              ) : dish.foodType === "Non-Veg" ? (
                                <div className="w-3.5 h-3.5 border-2 border-red-500 flex items-center justify-center rounded-sm bg-white/10">
                                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                                </div>
                              ) : null}
                            </div>
                            <h3 className="text-white font-bold text-lg leading-tight line-clamp-2 mb-1 shadow-sm">
                              {dish.name}
                            </h3>
                          </div>
                        </div>
                        
                        <CardContent className="p-4 space-y-3">
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 line-clamp-1">
                              From {dish.restaurantName || "Restaurant"}
                            </p>
                            <div className="text-lg font-bold text-gray-900 dark:text-white">
                              {"\u20B9"}{Math.round(dish.price || 0)}
                            </div>
                          </div>
                          <div className="w-full flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
                            <span className="text-[#FF6A00] text-sm font-bold">Order Now</span>
                            <ArrowRight className="h-4 w-4 text-[#FF6A00]" />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </ScrollReveal>
                )
              })
            )}
          </div>
        )}
      </div>
    </AnimatedPage>
  )
}
