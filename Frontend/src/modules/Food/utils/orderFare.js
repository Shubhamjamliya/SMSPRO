/**
 * Detailed fare breakdown for an order, built from the pricing the backend
 * persisted at checkout. Nothing here re-prices anything — it only groups and
 * labels stored values, so the admin sees exactly what was charged and settled.
 *
 * Settlement mirrors Backend/src/modules/food/orders/services/foodTransaction.service.js
 * (createInitialTransaction). Keep the two in step if the split changes.
 */

const num = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const isFood = (item) => String(item?.type || "food") === "food"

/** Food-side subtotal — mixed orders settle food and quick lines separately. */
function resolveFoodSubtotal(order) {
  const pricing = order?.pricing || {}
  const orderType = String(order?.orderType || "").toLowerCase()
  const items = Array.isArray(order?.items) ? order.items : []

  if (orderType !== "mixed") return num(pricing.subtotal)

  const foodLines = items.filter(isFood)
  if (!foodLines.length) return num(pricing.subtotal)
  return foodLines.reduce((sum, item) => sum + num(item.price) * num(item.quantity || 1), 0)
}

/**
 * What the customer was charged, in bill order.
 * Zero-value rows are dropped except the ones that always matter (subtotal, total).
 */
export function buildCustomerFareRows(order) {
  const pricing = order?.pricing || {}

  const deliveryFee = num(pricing.deliveryFee)
  const distanceKm = pricing.deliveryDistanceKm
  const sponsored = num(pricing.restaurantDeliveryFee)
  const packagingMode = String(pricing.packagingMode || "")
  const speed = pricing.deliverySpeed || {}

  const rows = [
    {
      key: "subtotal",
      label: "Item subtotal",
      amount: num(pricing.subtotal),
      always: true,
    },
    {
      key: "itemDiscount",
      label: "Item discount",
      amount: -num(pricing.itemDiscount),
      tone: "credit",
    },
    {
      key: "couponDiscount",
      label: pricing.couponCode
        ? `Coupon discount (${pricing.couponCode})`
        : "Coupon discount",
      amount: -num(pricing.couponDiscount || pricing.discount),
      tone: "credit",
      hint: pricing.couponSource ? `Funded by ${pricing.couponSource}` : "",
    },
    {
      key: "deliveryFee",
      label: "Delivery fee",
      amount: deliveryFee,
      always: true,
      free: deliveryFee === 0,
      hint: [
        Number.isFinite(Number(distanceKm)) && Number(distanceKm) > 0
          ? `${Number(distanceKm).toFixed(2)} km`
          : "",
        sponsored > 0 ? `₹${sponsored.toFixed(2)} borne by restaurant` : "",
        pricing.couponFreeDelivery ? "Free delivery coupon" : "",
      ]
        .filter(Boolean)
        .join(" · "),
    },
    {
      key: "deliverySpeedFee",
      label: speed.label ? `${speed.label} delivery fee` : "Delivery speed fee",
      amount: num(pricing.deliverySpeedFee),
      hint:
        speed.etaMinutesMin != null && speed.etaMinutesMax != null
          ? `ETA ${speed.etaMinutesMin}–${speed.etaMinutesMax} min`
          : "",
    },
    {
      key: "packagingFee",
      label:
        packagingMode === "RESTAURANT"
          ? "Packaging charge (restaurant)"
          : packagingMode === "ADMIN"
            ? "Packaging charge (platform)"
            : "Packaging charge",
      amount: num(pricing.packagingFee),
      hint:
        packagingMode === "RESTAURANT"
          ? "Per-item charge set by the restaurant"
          : packagingMode === "ADMIN"
            ? "Flat per-order charge set by admin"
            : "",
    },
    {
      key: "platformFee",
      label: "Platform fee",
      amount: num(pricing.platformFee),
      always: true,
    },
    {
      key: "tax",
      label: "GST",
      amount: num(pricing.tax),
      always: true,
    },
  ]

  return rows.filter((row) => row.always || Math.abs(row.amount) > 0)
}

/** Total the customer paid — the stored value, with a computed fallback. */
export function resolveCustomerTotal(order) {
  const pricing = order?.pricing || {}
  if (pricing.total != null) return num(pricing.total)

  return Math.max(
    0,
    num(pricing.subtotal) +
      num(pricing.tax) +
      num(pricing.packagingFee) +
      num(pricing.deliveryFee) +
      num(pricing.deliverySpeedFee) +
      num(pricing.platformFee) -
      num(pricing.discount),
  )
}

/**
 * Where the money goes. Restaurant net is derived the same way the ledger does
 * it; rider earning and platform profit are read from the order as stored.
 */
export function buildSettlementRows(order) {
  const pricing = order?.pricing || {}

  const foodSubtotal = resolveFoodSubtotal(order)
  const commission = num(pricing.restaurantCommission)
  const commissionPct = num(pricing.restaurantCommissionPercentage)
  const restaurantDeliveryFee = num(pricing.restaurantDeliveryFee)
  // Packaging follows its owner: restaurant-set charges are restaurant income,
  // admin-set charges stay with the platform.
  const restaurantPackaging =
    String(pricing.packagingMode || "") === "RESTAURANT" ? num(pricing.packagingFee) : 0

  const restaurantNet = Math.max(
    0,
    foodSubtotal + restaurantPackaging - restaurantDeliveryFee - commission,
  )

  return [
    {
      key: "restaurant",
      label: "Restaurant receives",
      amount: restaurantNet,
      parts: [
        { label: "Food subtotal", amount: foodSubtotal },
        ...(restaurantPackaging > 0
          ? [{ label: "Packaging charge", amount: restaurantPackaging }]
          : []),
        ...(commission > 0
          ? [
              {
                label: `Commission${commissionPct > 0 ? ` (${commissionPct}%)` : ""}`,
                amount: -commission,
              },
            ]
          : []),
        ...(restaurantDeliveryFee > 0
          ? [{ label: "Delivery sponsored", amount: -restaurantDeliveryFee }]
          : []),
      ],
    },
    {
      key: "rider",
      label: "Delivery partner earns",
      amount: num(order?.riderEarning),
      parts: [
        { label: "Total delivery fee collected", amount: num(pricing.totalDeliveryFee) },
      ],
    },
    {
      key: "platform",
      label: "Platform earns",
      amount: num(order?.platformProfit),
      parts: [
        { label: "Platform fee", amount: num(pricing.platformFee) },
        ...(commission > 0 ? [{ label: "Restaurant commission", amount: commission }] : []),
        ...(String(pricing.packagingMode || "") === "ADMIN" && num(pricing.packagingFee) > 0
          ? [{ label: "Packaging charge", amount: num(pricing.packagingFee) }]
          : []),
      ],
    },
  ]
}
