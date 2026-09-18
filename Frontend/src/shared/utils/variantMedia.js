export const MAX_PRODUCT_VARIANTS = 5;
export const MIN_VARIANT_IMAGES = 1;
export const MAX_VARIANT_IMAGES = 3;

export const createAddProductClientRequestId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const sanitizeVariantImageUrls = (images = []) => {
  if (!Array.isArray(images)) return [];
  const unique = [];
  const seen = new Set();
  for (const item of images) {
    const url = String(item || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    unique.push(url);
    if (unique.length >= MAX_VARIANT_IMAGES) break;
  }
  return unique;
};

export const getVariantImages = (variant) => sanitizeVariantImageUrls(variant?.images);

export const getProductCardImage = (product = {}) => {
  const selected = product.selectedVariant;
  return (
    getVariantImages(selected)[0] ||
    getVariantImages(Array.isArray(product.variants) ? product.variants[0] : null)[0] ||
    product.image ||
    product.mainImage ||
    ""
  );
};

export const emptyVariant = (overrides = {}) => ({
  id: Date.now() + Math.floor(Math.random() * 1000),
  name: "Default",
  price: "",
  salePrice: "",
  stock: "",
  sku: "",
  images: [],
  ...overrides,
});
