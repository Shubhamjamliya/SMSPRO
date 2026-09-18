import axiosInstance from "@core/api/axios";
import { getWithDedupe, invalidateCache } from "@core/api/dedupe";
import { getQuickSessionId } from "./quickApi";

const withQuickSession = (config = {}) => ({
  ...config,
  params: {
    ...(config.params || {}),
    sessionId: getQuickSessionId(),
  },
  headers: {
    ...(config.headers || {}),
    "x-quick-session": getQuickSessionId(),
  },
});

const quickGetWithDedupe = (url, params = {}, options = {}) =>
  getWithDedupe(url, params, withQuickSession(options));

export const customerApi = {
  getProfile: () =>
    axiosInstance.get("/auth/me", withQuickSession()).then((res) => {
      const user =
        res?.data?.data?.user ??
        res?.data?.user ??
        res?.data?.data ??
        res?.data;
      return {
        ...res,
        data: {
          ...res.data,
          result: user,
          data: user,
        },
      };
    }),

  updateProfile: (body) =>
    axiosInstance.patch("/food/user/profile", body, withQuickSession()),


  getCart: (params = {}) => {
    const config = withQuickSession({ params });
    // Cart totals are coupon-aware — never serve a stale cached bill after apply/remove.
    // Concurrent identical in-flight requests still dedupe via getWithDedupe.
    return getWithDedupe("/quick-commerce/cart", config.params || {}, {
      ttl: 0,
      forceRefresh: true,
      headers: config.headers,
    });
  },
  addToCart: (data) => {
    invalidateCache("/quick-commerce/cart");
    return axiosInstance.post("/quick-commerce/cart/add", data, withQuickSession());
  },
  updateCartQuantity: (data) => {
    invalidateCache("/quick-commerce/cart");
    return axiosInstance.put("/quick-commerce/cart/update", data, withQuickSession());
  },
  removeFromCart: (productId, params = {}) => {
    invalidateCache("/quick-commerce/cart");
    return axiosInstance.delete(
      `/quick-commerce/cart/remove/${productId}`,
      withQuickSession({ params }),
    );
  },
  clearCart: () => {
    invalidateCache("/quick-commerce/cart");
    return axiosInstance.delete("/quick-commerce/cart/clear", withQuickSession());
  },

  placeOrder: (data) => axiosInstance.post("/quick-commerce/orders", data, withQuickSession()),
  getOrders: (params) => quickGetWithDedupe("/quick-commerce/orders", params),
  getMyOrders: (params) => quickGetWithDedupe("/quick-commerce/orders", params),
  createOrder: (data) => axiosInstance.post("/quick-commerce/orders", data, withQuickSession()),
  verifyPayment: (orderId, data) => axiosInstance.post(`/quick-commerce/orders/${orderId}/verify-payment`, data, withQuickSession()),
  getOrderDetails: (orderId, options = {}) =>
    quickGetWithDedupe(`/quick-commerce/orders/${orderId}`, {}, {
      ttl: 60 * 1000,
      ...options,
      forceRefresh: options.forceRefresh ?? options.force ?? false,
    }),
  cancelOrder: (orderId, data = {}) =>
    axiosInstance.post(`/quick-commerce/orders/${orderId}/cancel`, data, withQuickSession()),
  createSupportTicket: (data) => axiosInstance.post("/quick-commerce/support/ticket", data, withQuickSession()),
  getSupportTickets: (params = {}) => quickGetWithDedupe("/quick-commerce/support/my-tickets", params),

  getProducts: (params) =>
    quickGetWithDedupe("/quick-commerce/products", params, { ttl: 0, forceRefresh: true }),
  searchProducts: (params) =>
    quickGetWithDedupe("/quick-commerce/products", params, { ttl: 0, forceRefresh: true }),
  getCategories: (params = {}) => quickGetWithDedupe("/quick-commerce/categories", params),
  getCategoryProducts: (categoryId, params) =>
    quickGetWithDedupe("/quick-commerce/products", { categoryId, ...params }, { ttl: 0, forceRefresh: true }),
  getProductDetails: (productId) =>
    quickGetWithDedupe(`/quick-commerce/products/${productId}`, {}, { ttl: 0, forceRefresh: true }),

  getAddresses: () => axiosInstance.get("/quick-commerce/addresses", withQuickSession()),
  addAddress: (data) => axiosInstance.post("/quick-commerce/addresses", data, withQuickSession()),
  updateAddress: (id, data) => axiosInstance.put(`/quick-commerce/addresses/${id}`, data, withQuickSession()),
  deleteAddress: (id) => axiosInstance.delete(`/quick-commerce/addresses/${id}`, withQuickSession()),

  getStores: (params) => quickGetWithDedupe("/quick-commerce/stores", params),
  getStoreDetails: (storeId) => quickGetWithDedupe(`/quick-commerce/stores/${storeId}`, {}),

  getProductReviews: async (productId) => {
    try {
      return await quickGetWithDedupe(`/quick-commerce/products/${productId}/reviews`, {});
    } catch (error) {
      if (error?.response?.status === 404) {
        return { data: { success: true, results: [] } };
      }
      throw error;
    }
  },
  submitReview: (data) => axiosInstance.post("/quick-commerce/products/reviews", data, withQuickSession()),

  getBanners: (params) => quickGetWithDedupe("/quick-commerce/banners", params),
  getOfferSections: (params) => quickGetWithDedupe("/quick-commerce/offer-sections", params),
  getHomeData: () => quickGetWithDedupe("/quick-commerce/home", {}),
  // Performance: Single call jo 5 alag calls replace karta hai
  getBootstrap: (params = {}) => quickGetWithDedupe("/quick-commerce/bootstrap", params),

  getCoupons: (params = {}) => quickGetWithDedupe("/quick-commerce/coupons", params),
  // Alias kept for existing checkout callers — same endpoint as getCoupons
  getActiveCoupons: (params = {}) => quickGetWithDedupe("/quick-commerce/coupons", params),
  applyCoupon: (data) => axiosInstance.post("/quick-commerce/coupons/apply", data, withQuickSession()),
  // Alias kept for existing checkout callers — same endpoint as applyCoupon
  validateCoupon: (data) => axiosInstance.post("/quick-commerce/coupons/apply", data, withQuickSession()),
  getOffers: () => quickGetWithDedupe("/quick-commerce/offers", {}),
  getBillingSettings: () => quickGetWithDedupe("/quick-commerce/billing/settings", {}),

  getWalletBalance: () => axiosInstance.get("/quick-commerce/wallet/balance", withQuickSession()),
  getWalletTransactions: (params) => quickGetWithDedupe("/quick-commerce/wallet/transactions", params),
  geocodeAddress: (address) =>
    axiosInstance.get(
      `/quick-commerce/location/geocode?address=${encodeURIComponent(address)}`,
      withQuickSession()
    ),

  getWishlist: (params) => quickGetWithDedupe("/quick-commerce/wishlist", params),
  addToWishlist: (data) => {
    invalidateCache("/quick-commerce/wishlist");
    return axiosInstance.post("/quick-commerce/wishlist/add", data, withQuickSession());
  },
  removeFromWishlist: (productId, variantId) => {
    invalidateCache("/quick-commerce/wishlist");
    const query = variantId ? `?variantId=${encodeURIComponent(String(variantId))}` : "";
    return axiosInstance.delete(
      `/quick-commerce/wishlist/remove/${productId}${query}`,
      withQuickSession(),
    );
  },
  toggleWishlist: (data) => {
    invalidateCache("/quick-commerce/wishlist");
    return axiosInstance.post("/quick-commerce/wishlist/toggle", data, withQuickSession());
  },
  
  submitOrderRatings: (orderId, data) => 
    axiosInstance.patch(`/quick-commerce/orders/${orderId}/ratings`, data, withQuickSession()),

  createReturnRequest: (orderId, data) => {
    invalidateCache(`/quick-commerce/orders/${orderId}/returns`);
    return axiosInstance.post(`/quick-commerce/orders/${orderId}/returns`, data, withQuickSession());
  },
  getReturnStatus: (orderId, options = {}) =>
    quickGetWithDedupe(`/quick-commerce/orders/${orderId}/returns`, {}, {
      ttl: 60 * 1000,
      ...options,
      forceRefresh: options.forceRefresh ?? options.force ?? false,
    }),
  getReturnPickupOtp: (orderId, params = {}) =>
    axiosInstance.get(`/quick-commerce/orders/${orderId}/returns/pickup-otp`, withQuickSession({ params })),
  cancelReturnRequest: (orderId, data = {}) => {
    invalidateCache(`/quick-commerce/orders/${orderId}/returns`);
    return axiosInstance.post(`/quick-commerce/orders/${orderId}/returns/cancel`, data, withQuickSession());
  },
};

export const prefetchQuickHomeBootstrap = async (location = null) => {
  const hasValidLocation =
    Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude);
  const params = {};
  if (hasValidLocation) {
    params.lat = location.latitude;
    params.lng = location.longitude;
  }
  return customerApi.getBootstrap(params);
};
