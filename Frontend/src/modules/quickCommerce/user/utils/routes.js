const STANDALONE_BASE = "/quick";

export const isEmbeddedQuickPath = () => false;

export const getQuickHomePath = () => STANDALONE_BASE;

export const getQuickCartPath = () => `${STANDALONE_BASE}/cart`;

export const getQuickCheckoutPath = () => `${STANDALONE_BASE}/checkout`;

export const getQuickSearchPath = () => `${STANDALONE_BASE}/search`;
export const getQuickProductsPath = () => `${STANDALONE_BASE}/products`;
export const getQuickProductPath = (productId) =>
  `${STANDALONE_BASE}/product/${productId}`;
export const getQuickCategoriesPath = () => `${STANDALONE_BASE}/categories`;
export const getQuickCategoryPath = (categoryId, { headerId } = {}) => {
  const base = `${STANDALONE_BASE}/categories/${categoryId}`;
  if (!headerId || headerId === "all") return base;
  return `${base}?headerId=${encodeURIComponent(String(headerId))}`;
};
export const getQuickProfilePath = () => `/quick/profile`;
export const getQuickWishlistPath = () => `${STANDALONE_BASE}/wishlist`;
export const getQuickOffersPath = () => `${STANDALONE_BASE}/offers`;
export const getQuickOrdersPath = () => `${STANDALONE_BASE}/orders`;
export const getQuickOrderDetailPath = (orderId) =>
  `${STANDALONE_BASE}/orders/${orderId}`;
export const getQuickAddressesPath = () => `${STANDALONE_BASE}/addresses`;
export const getQuickSupportPath = () => `${STANDALONE_BASE}/support`;
export const getQuickWalletPath = () => `${STANDALONE_BASE}/wallet`;
export const getQuickStorePath = (storeId, { categoryId, headerId } = {}) => {
  const base = `${STANDALONE_BASE}/store/${storeId}`;
  const params = new URLSearchParams();
  if (categoryId) params.set("categoryId", String(categoryId));
  if (headerId && headerId !== "all") params.set("headerId", String(headerId));
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
};
