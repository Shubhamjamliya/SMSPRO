const getParentId = (node) => {
  if (!node?.parentId) return null;
  if (typeof node.parentId === "object") {
    return node.parentId._id || node.parentId.id || null;
  }
  return node.parentId;
};

/** Walk category tree upward until a header node is found. */
export const resolveHeaderFromCategoryTree = (nodeId, fullMap = {}) => {
  if (!nodeId || !fullMap || typeof fullMap !== "object") return null;

  let current = fullMap[nodeId];
  const visited = new Set();

  while (current && !visited.has(String(current._id))) {
    visited.add(String(current._id));
    if (current.type === "header") return current;
    const parentId = getParentId(current);
    if (!parentId) break;
    current = fullMap[parentId];
  }

  return null;
};

export const getVariantKey = (variant) => {
  if (!variant || typeof variant !== "object") return "";
  return String(
    variant._id || variant.id || variant.sku || variant.name || "",
  ).trim();
};

export const getVariantDisplayLabel = (variant) => {
  if (!variant) return "";
  const named = String(variant.name || "").trim();
  if (named && named !== "Default") return named;
  return named || "Variant";
};

export const getCartLineId = (productId, variant) => {
  const baseId = String(productId || "").trim().split("::")[0];
  if (!baseId) return "";
  const variantKey = getVariantKey(variant);
  return variantKey ? `${baseId}::${variantKey}` : baseId;
};

export const applyVariantToProduct = (product = {}, variant = null) => {
  if (!variant) return product;

  const baseId = String(product.id || product._id || "").trim().split("::")[0];
  const salePrice = Number(variant.salePrice || 0);
  const basePrice = Number(variant.price || 0);
  const price = salePrice > 0 ? salePrice : basePrice;
  const mrp = Math.max(
    price,
    basePrice > 0
      ? basePrice
      : Number(product.originalPrice ?? product.mrp ?? price),
  );
  const variantImages = Array.isArray(variant.images) ? variant.images.filter(Boolean) : [];
  const image = variantImages[0] || product.image || product.mainImage || "";

  return {
    ...product,
    id: getCartLineId(baseId, variant),
    _id: getCartLineId(baseId, variant),
    productId: baseId,
    selectedVariant: variant,
    variantId: String(variant._id || variant.id || ""),
    price,
    salePrice,
    mrp,
    originalPrice: mrp,
    packingAmount: Number(product.packingAmount || 0),
    stock: Number(variant.stock ?? product.stock ?? 0),
    image,
    mainImage: image,
    galleryImages: variantImages.length ? variantImages : product.galleryImages,
  };
};
