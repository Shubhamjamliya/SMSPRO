/**
 * Per-item order quantity limits (mirrors Backend shared/orderQuantityRules.js).
 *
 * The server is the authority — it clamps on cart add, rejects out-of-range cart
 * updates, and re-checks at checkout. These helpers only keep the UI honest so a
 * customer never taps a button that is going to fail.
 */

export const DEFAULT_MIN_ORDER_QUANTITY = 1
export const ABSOLUTE_MAX_ORDER_QUANTITY = 99

const toInt = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? Math.floor(num) : NaN
}

/**
 * Reads limits off any item shape we pass around (menu item, cart line, or a
 * cart line that only carries the nested product).
 */
export function getQuantityLimits(item) {
  const source = item?.minOrderQuantity != null || item?.maxOrderQuantity != null ? item : item?.product || item

  const rawMin = toInt(source?.minOrderQuantity)
  const min =
    Number.isFinite(rawMin) && rawMin > 0
      ? Math.min(rawMin, ABSOLUTE_MAX_ORDER_QUANTITY)
      : DEFAULT_MIN_ORDER_QUANTITY

  const rawMax = toInt(source?.maxOrderQuantity)
  const hasMax = Number.isFinite(rawMax) && rawMax > 0
  const max = hasMax
    ? Math.min(Math.max(rawMax, min), ABSOLUTE_MAX_ORDER_QUANTITY)
    : ABSOLUTE_MAX_ORDER_QUANTITY

  return {
    min,
    max,
    hasMin: min > DEFAULT_MIN_ORDER_QUANTITY,
    hasMax,
  }
}

/** Quantity a fresh "Add" should put in the cart. */
export function getInitialQuantity(item) {
  return getQuantityLimits(item).min
}

export function clampQuantity(quantity, item) {
  const { min, max } = getQuantityLimits(item)
  const qty = toInt(quantity)
  if (!Number.isFinite(qty)) return min
  return Math.min(max, Math.max(min, qty))
}

/**
 * What a "−" tap should do: at the minimum there is no valid lower quantity, so
 * the line is removed instead of becoming invalid.
 */
export function getDecrementTarget(currentQuantity, item) {
  const { min } = getQuantityLimits(item)
  const next = toInt(currentQuantity) - 1
  return next < min ? 0 : next
}

/** True when "+" would exceed the item's cap. */
export function isAtMaxQuantity(currentQuantity, item) {
  const { max } = getQuantityLimits(item)
  return toInt(currentQuantity) >= max
}

/** Short badge for menu cards, e.g. "Min 4". Empty when there's nothing to say. */
export function getMinQuantityLabel(item) {
  const { min, hasMin } = getQuantityLimits(item)
  return hasMin ? `Min ${min}` : ""
}

/** Sentence for toasts / detail sheets. */
export function getQuantityLimitMessage(item, name = "This item") {
  const { min, max, hasMin, hasMax } = getQuantityLimits(item)
  if (hasMin && hasMax) return `${name} can be ordered in quantities of ${min} to ${max}`
  if (hasMin) return `${name} has a minimum order quantity of ${min}`
  if (hasMax) return `${name} has a maximum order quantity of ${max}`
  return ""
}

export function getMaxQuantityMessage(item, name = "This item") {
  const { max, hasMax } = getQuantityLimits(item)
  return hasMax ? `You can order at most ${max} of ${name}` : `Maximum ${max} per item`
}
