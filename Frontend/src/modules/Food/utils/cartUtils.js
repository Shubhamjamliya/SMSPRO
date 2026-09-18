/**
 * Get the highest priced item from cart
 * @param {Array} cart - Array of cart items
 * @returns {Object|null} The highest priced item or null if cart is empty
 */
export const getHighestPricedItem = (cart = []) => {
  if (!Array.isArray(cart) || cart.length === 0) return null;

  return cart.reduce((highest, current) => {
    const currentPrice = Number(current?.price || 0);
    const highestPrice = Number(highest?.price || 0);
    return currentPrice > highestPrice ? current : highest;
  }, cart[0] || null);
};

/**
 * Parse preparation time string to get numeric value in minutes
 * Examples: "15 mins" -> 15, "20-25 mins" -> 25, "30" -> 30
 * @param {string} timeString - Time string to parse
 * @returns {number} Time in minutes
 */
export const parseTimeToMinutes = (timeString = "") => {
  if (!timeString) return 15; // Default to 15 minutes

  // Extract all numbers from the string
  const numbers = timeString.match(/\d+/g);

  if (!numbers || numbers.length === 0) return 15; // Default fallback

  // If it's a range (e.g., "20-25 mins"), return the maximum
  if (numbers.length > 1) {
    return Math.max(...numbers.map(Number));
  }

  // Single number
  return Number(numbers[0]);
};

/**
 * Get the highest preparation time among all cart items
 * @param {Array} cart - Array of cart items
 * @returns {number} Maximum preparation time in minutes
 */
export const getMaxPreparationTimeMinutes = (cart = []) => {
  if (!Array.isArray(cart) || cart.length === 0) return 15;

  const times = cart
    .filter((item) => item?.preparationTime)
    .map((item) => parseTimeToMinutes(item.preparationTime));

  if (times.length === 0) return 15;

  return Math.max(...times);
};

/**
 * Get the display preparation time (e.g. "40-50 mins") of the cart item that
 * takes the longest to prepare, since the whole order can't leave the
 * restaurant before its slowest dish is ready.
 * @param {Array} cart - Array of cart items
 * @param {Object} restaurantData - Restaurant data with fallback delivery time
 * @returns {string} The preparation time or fallback delivery time
 */
export const getMaxDeliveryTime = (cart = [], restaurantData = null) => {
  let slowestItem = null;
  let slowestMinutes = -1;

  (Array.isArray(cart) ? cart : []).forEach((item) => {
    if (!item?.preparationTime) return;
    const minutes = parseTimeToMinutes(item.preparationTime);
    if (minutes > slowestMinutes) {
      slowestMinutes = minutes;
      slowestItem = item;
    }
  });

  if (slowestItem) {
    return slowestItem.preparationTime;
  }

  // Fallback to restaurant's estimated delivery time
  if (restaurantData?.estimatedDeliveryTime) {
    return restaurantData.estimatedDeliveryTime;
  }

  // Final fallback
  return "15-20 mins";
};

/**
 * Get delivery time information for the order
 * Combines highest priced item + restaurant data for optimal display
 * @param {Array} cart - Array of cart items
 * @param {Object} restaurantData - Restaurant data
 * @returns {Object} Object with displayTime and minutes
 */
export const getOrderDeliveryTimeInfo = (cart = [], restaurantData = null) => {
  const displayTime = getMaxDeliveryTime(cart, restaurantData);
  const minutes = getMaxPreparationTimeMinutes(cart);

  return {
    displayTime,
    minutes,
    highestPricedItem: getHighestPricedItem(cart),
  };
};
