/**
 * Cart line money — one place, so every surface (bill summary, floating cart
 * bar, line row) agrees on what a line costs.
 *
 * An add-on is charged per unit of its parent item, matching the server:
 *   line total = (item price + Σ addon.price × addon.qty) × item quantity
 *
 * The server sends `addonUnitTotal` and `lineTotal` on every hydrated line; the
 * fallbacks here only matter for guest carts, which are re-priced server-side
 * the moment the customer signs in.
 */

const num = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Per-unit add-on cost of a line. */
export function getLineAddonUnitTotal(item) {
  if (item?.addonUnitTotal != null) return num(item.addonUnitTotal)
  const addons = Array.isArray(item?.addons) ? item.addons : []
  return addons.reduce(
    (sum, addon) => sum + num(addon?.price) * Math.max(1, num(addon?.quantity) || 1),
    0,
  )
}

/** What one unit of this line costs, add-ons included. */
export function getLineUnitPrice(item) {
  return num(item?.price) + getLineAddonUnitTotal(item)
}

/** Total for the line. Prefers the server's figure when present. */
export function getLineTotal(item) {
  if (item?.lineTotal != null) return num(item.lineTotal)
  return getLineUnitPrice(item) * Math.max(0, num(item?.quantity))
}

/** Cart subtotal across all lines, add-ons included. */
export function getCartSubtotal(cart = []) {
  return (Array.isArray(cart) ? cart : []).reduce((sum, item) => sum + getLineTotal(item), 0)
}
