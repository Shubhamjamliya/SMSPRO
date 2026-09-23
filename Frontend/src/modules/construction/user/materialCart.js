/**
 * The material request "cart" — built while browsing on the Materials page,
 * then handed off to the checkout page as a full page (not a modal), the same
 * way the End-to-End flow hands a chosen package off to `RequirementBuilder`.
 *
 * Session storage only: enough to survive the navigation to checkout (and a
 * refresh there), never trusted for anything — the checkout page re-fetches
 * the materials themselves and the server re-checks stock and price.
 */
const CART_KEY = "construction_material_cart";

/** `{ [materialId]: quantity }` -> a plain array, since that is what the API and the checkout page both want. */
export const saveMaterialCart = (basket) => {
  const lines = Object.entries(basket)
    .map(([materialId, quantity]) => ({ materialId, quantity: Number(quantity) }))
    .filter((line) => line.quantity > 0);
  try {
    sessionStorage.setItem(CART_KEY, JSON.stringify(lines));
  } catch {
    /* storage unavailable — the checkout page simply opens empty */
  }
};

export const loadMaterialCart = () => {
  try {
    const raw = sessionStorage.getItem(CART_KEY);
    const lines = raw ? JSON.parse(raw) : [];
    return Array.isArray(lines) ? lines : [];
  } catch {
    return [];
  }
};

export const clearMaterialCart = () => {
  try {
    sessionStorage.removeItem(CART_KEY);
  } catch {
    /* storage unavailable — nothing to clear */
  }
};
