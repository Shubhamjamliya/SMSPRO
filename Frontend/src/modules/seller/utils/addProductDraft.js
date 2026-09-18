/**
 * Persist single-add product form across refresh / accidental navigation.
 * Variant images are stored as data URLs; File objects are rebuilt on restore.
 */

import { convertToWebP } from "@shared/utils/imageUploadUtils";
import {
  createAddProductClientRequestId,
  emptyVariant,
  sanitizeVariantImageUrls,
} from "@shared/utils/variantMedia";

export const SELLER_ADD_PRODUCT_DRAFT_KEY = "sellerAddProductDraft";
export const SELLER_ADD_PRODUCT_JUST_SAVED_KEY = "sellerAddProductJustSaved";

export const DEFAULT_ADD_PRODUCT_FORM = {
  name: "",
  slug: "",
  sku: "",
  description: "",
  packingAmount: "",
  lowStockAlert: 5,
  category: "",
  subcategory: "",
  header: "",
  status: "active",
  tags: "",
  weight: "",
  brand: "",
  clientRequestId: "",
  createdProductId: "",
  variants: [emptyVariant()],
};

const dataUrlToFile = (dataUrl, filename = "image.jpg") => {
  try {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
    const [meta, data] = dataUrl.split(",");
    if (!data) return null;
    const mimeMatch = meta.match(/:(.*?);/);
    const mime = mimeMatch?.[1] || "image/jpeg";
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const ext = mime.includes("webp") ? "webp" : mime.includes("png") ? "png" : "jpg";
    return new File([bytes], filename.replace(/\.[^.]+$/, `.${ext}`), { type: mime });
  } catch {
    return null;
  }
};

const stripVariantFiles = (variants = []) =>
  (Array.isArray(variants) ? variants : []).map((variant) => {
    const { imageFiles: _files, ...rest } = variant || {};
    return {
      ...rest,
      images: sanitizeVariantImageUrls(rest.images),
    };
  });

export const readAddProductDraft = () => {
  try {
    const raw = sessionStorage.getItem(SELLER_ADD_PRODUCT_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

export const writeAddProductDraft = (draft) => {
  try {
    sessionStorage.setItem(SELLER_ADD_PRODUCT_DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    try {
      const lightVariants = stripVariantFiles(draft?.formData?.variants).map((variant) => ({
        ...variant,
        images: (variant.images || []).filter((url) => !String(url).startsWith("data:")).slice(0, 3),
      }));
      const light = {
        ...draft,
        formData: {
          ...(draft?.formData || {}),
          variants: lightVariants,
        },
      };
      sessionStorage.setItem(SELLER_ADD_PRODUCT_DRAFT_KEY, JSON.stringify(light));
      return true;
    } catch {
      return false;
    }
  }
};

export const clearAddProductDraft = () => {
  try {
    sessionStorage.removeItem(SELLER_ADD_PRODUCT_DRAFT_KEY);
  } catch {
    // ignore
  }
};

export const markAddProductJustSaved = () => {
  try {
    sessionStorage.setItem(SELLER_ADD_PRODUCT_JUST_SAVED_KEY, "1");
  } catch {
    // ignore
  }
};

export const consumeAddProductJustSaved = () => {
  try {
    const flag = sessionStorage.getItem(SELLER_ADD_PRODUCT_JUST_SAVED_KEY);
    if (!flag) return false;
    sessionStorage.removeItem(SELLER_ADD_PRODUCT_JUST_SAVED_KEY);
    clearAddProductDraft();
    return true;
  } catch {
    return false;
  }
};

const hydrateVariants = (draftVariants) => {
  const source =
    Array.isArray(draftVariants) && draftVariants.length
      ? draftVariants
      : DEFAULT_ADD_PRODUCT_FORM.variants;

  return source.map((variant, index) => {
    const images = sanitizeVariantImageUrls(variant?.images);
    const imageFiles = images
      .map((img, imgIndex) =>
        typeof img === "string" && img.startsWith("data:")
          ? dataUrlToFile(img, `variant-${index + 1}-${imgIndex + 1}.jpg`)
          : null,
      )
      .filter(Boolean);
    return {
      ...emptyVariant({ id: variant?.id || variant?._id || Date.now() + index }),
      ...variant,
      images,
      imageFiles,
    };
  });
};

export const hydrateAddProductForm = (draftForm = {}) => {
  const form = {
    ...DEFAULT_ADD_PRODUCT_FORM,
    ...draftForm,
    clientRequestId: draftForm.clientRequestId || createAddProductClientRequestId(),
    createdProductId: draftForm.createdProductId || "",
    variants: hydrateVariants(draftForm.variants),
  };

  delete form.mainImage;
  delete form.mainImageFile;
  delete form.galleryImages;
  delete form.galleryFiles;

  return form;
};

export const buildAddProductDraftPayload = (formData, modalTab = "general") => {
  const serializable = { ...(formData || {}) };
  delete serializable.mainImage;
  delete serializable.mainImageFile;
  delete serializable.galleryImages;
  delete serializable.galleryFiles;

  return {
    modalTab: modalTab || "general",
    formData: {
      ...DEFAULT_ADD_PRODUCT_FORM,
      ...serializable,
      variants: stripVariantFiles(serializable.variants),
    },
    savedAt: Date.now(),
  };
};

export const fileToPersistedImage = async (file) => {
  if (!file) return null;
  try {
    const compressed = await convertToWebP(file);
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(compressed);
    });
    return { file: compressed, dataUrl };
  } catch {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return { file, dataUrl };
  }
};

export const createBlankAddProductForm = () => ({
  ...DEFAULT_ADD_PRODUCT_FORM,
  clientRequestId: createAddProductClientRequestId(),
  createdProductId: "",
  variants: [emptyVariant({ id: Date.now() })],
});
