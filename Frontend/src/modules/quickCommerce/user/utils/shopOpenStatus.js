import {
  buildShopClosedMessage,
  isStoreCurrentlyOpen,
} from "@shared/utils/timeFormat";

/**
 * Resolve whether a shop/product seller is currently open.
 * Prefers API `isOpen` when present; falls back to openingHours parse (IST).
 */
export const resolveShopOpenState = (source = null) => {
  const seller = source?.seller && typeof source.seller === "object" ? source.seller : null;
  const openingHours = String(
    source?.openingHours ||
      source?.shopOpeningHours ||
      seller?.openingHours ||
      "",
  ).trim();

  let isOpen = true;
  if (typeof source?.isOpen === "boolean") {
    isOpen = source.isOpen;
  } else if (typeof source?.isShopOpen === "boolean") {
    isOpen = source.isShopOpen;
  } else if (typeof seller?.isOpen === "boolean") {
    isOpen = seller.isOpen;
  } else {
    isOpen = isStoreCurrentlyOpen(openingHours);
  }

  return {
    isOpen,
    openingHours,
    message: isOpen ? "" : buildShopClosedMessage(openingHours),
  };
};

export const isProductShopOpen = (product) => resolveShopOpenState(product).isOpen;
