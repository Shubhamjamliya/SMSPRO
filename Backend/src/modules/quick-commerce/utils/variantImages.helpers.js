/** Per-variant photo rules for seller-created QC products. */

export const MAX_PRODUCT_VARIANTS = 5;
export const MIN_VARIANT_IMAGES = 1;
export const MAX_VARIANT_IMAGES = 3;

const isHttpUrl = (value) => {
  const url = String(value || "").trim();
  return /^https?:\/\//i.test(url);
};

export const sanitizeVariantImageList = (images = [], { max = MAX_VARIANT_IMAGES } = {}) => {
  const source = Array.isArray(images) ? images : [];
  const unique = [];
  const seen = new Set();
  for (const item of source) {
    const url = String(item || "").trim();
    if (!url || url.startsWith("data:") || seen.has(url)) continue;
    seen.add(url);
    unique.push(url);
    if (unique.length >= max) break;
  }
  return unique;
};

export const firstVariantImage = (variant) => {
  const images = sanitizeVariantImageList(variant?.images);
  return images[0] || "";
};

export const deriveProductImagesFromVariants = (variants = []) => {
  const list = Array.isArray(variants) ? variants : [];
  const all = [];
  const seen = new Set();
  for (const variant of list) {
    for (const url of sanitizeVariantImageList(variant?.images)) {
      if (seen.has(url)) continue;
      seen.add(url);
      all.push(url);
    }
  }
  return {
    mainImage: all[0] || "",
    galleryImages: all,
  };
};

export const assertVariantImageRules = (variants = [], { requireImages = false } = {}) => {
  const list = Array.isArray(variants) ? variants : [];
  if (list.length > MAX_PRODUCT_VARIANTS) {
    const err = new Error(`A product can have at most ${MAX_PRODUCT_VARIANTS} variants`);
    err.statusCode = 400;
    throw err;
  }

  if (!requireImages) return;

  for (let index = 0; index < list.length; index += 1) {
    const count = sanitizeVariantImageList(list[index]?.images).length;
    if (count < MIN_VARIANT_IMAGES) {
      const name = String(list[index]?.name || `Variant ${index + 1}`).trim();
      const err = new Error(`${name}: add at least ${MIN_VARIANT_IMAGES} photo (max ${MAX_VARIANT_IMAGES})`);
      err.statusCode = 400;
      throw err;
    }
  }
};

export const resolveStoredImageUrl = (value) => {
  const url = String(value || "").trim();
  if (!url || url.startsWith("data:")) return "";
  return isHttpUrl(url) || url.startsWith("/") ? url : "";
};
