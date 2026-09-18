export const getRestaurantFavoriteKey = (restaurant) =>
  String(
    restaurant?.mongoId ||
      restaurant?._id ||
      restaurant?.restaurantId ||
      restaurant?.id ||
      "",
  ).trim()

export const getDishFavoriteKey = (item) =>
  String(item?.id || item?._id || item?.itemId || "").trim()

export const buildDishFavoritePayload = (item, restaurant, restaurantSlug = "") => {
  const dishId = getDishFavoriteKey(item)
  const restaurantId = getRestaurantFavoriteKey(restaurant)

  if (!dishId || !restaurantId) return null

  return {
    id: dishId,
    name: item?.name || "Dish",
    description: item?.description || "",
    price: item?.price,
    originalPrice: item?.originalPrice,
    image: item?.image || "",
    restaurantId,
    restaurantName: restaurant?.name || "",
    restaurantSlug: restaurant?.slug || restaurantSlug || "",
    foodType: item?.foodType,
    isSpicy: item?.isSpicy,
    customisable: item?.customisable,
  }
}
