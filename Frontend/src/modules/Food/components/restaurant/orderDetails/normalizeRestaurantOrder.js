/**
 * Normalize a restaurant FoodOrder API payload into a view model
 * for the Order Details page. Keeps the UI free of schema quirks.
 */

const toNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

export const firstNumber = (...values) => {
  for (const value of values) {
    const num = toNumber(value)
    if (num !== null) return num
  }
  return null
}

export const firstText = (...values) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
  }
  return ""
}

export const formatMoney = (value, { signed = false } = {}) => {
  const num = Number(value || 0)
  const abs = Math.abs(num)
  const formatted = `₹${abs.toLocaleString("en-IN", {
    minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
  if (!signed) return formatted
  if (num < 0) return `-${formatted}`
  if (num > 0) return `+${formatted}`
  return formatted
}

export const formatDateTime = (value) => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
}

export const formatDateOnly = (value) => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

const normalizeStatusKey = (raw) =>
  String(raw || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")

export const isCancelledStatus = (raw) => {
  const key = normalizeStatusKey(raw)
  return key.startsWith("cancelled") || key === "rejected" || key === "failed"
}

export const formatOrderStatusLabel = (raw) => {
  const key = normalizeStatusKey(raw)
  const map = {
    pending: "Pending",
    created: "Placed",
    confirmed: "Accepted",
    preparing: "Preparing",
    ready: "Ready for Pickup",
    ready_for_pickup: "Ready for Pickup",
    assigned: "Pickup Assigned",
    picked_up: "Picked Up",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
    completed: "Completed",
    cancelled: "Cancelled",
    cancelled_by_user: "Cancelled by Customer",
    cancelled_by_restaurant: "Cancelled by Restaurant",
    cancelled_by_admin: "Cancelled by Admin",
    rejected: "Rejected",
  }
  if (map[key]) return map[key]
  return String(raw || "Unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export const getStatusTone = (raw) => {
  const key = normalizeStatusKey(raw)
  if (isCancelledStatus(key)) {
    return "bg-red-50 text-red-700 border-red-100 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50"
  }
  if (key === "delivered" || key === "completed") {
    return "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50"
  }
  if (key === "preparing" || key === "confirmed") {
    return "bg-amber-50 text-amber-800 border-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50"
  }
  if (key === "ready" || key === "ready_for_pickup") {
    return "bg-sky-50 text-sky-700 border-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900/50"
  }
  if (key === "picked_up" || key === "out_for_delivery" || key === "assigned") {
    return "bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/50"
  }
  return "bg-gray-50 text-gray-700 border-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
}

export const paymentMethodLabel = (method) => {
  const m = String(method || "").toLowerCase()
  if (m === "cash" || m === "cod") return "Cash on Delivery"
  if (m === "wallet") return "Wallet"
  if (m === "razorpay") return "Online (Razorpay)"
  if (m === "razorpay_qr") return "QR (Razorpay)"
  if (m === "upi") return "UPI"
  if (m === "card") return "Card"
  return method ? String(method) : "—"
}

export const paymentStatusMeta = (status, method, orderStatus) => {
  const s = String(status || "").toLowerCase()
  const m = String(method || "").toLowerCase()
  const o = normalizeStatusKey(orderStatus)

  if (["refunded", "partially_refunded"].includes(s)) {
    return { key: "refunded", label: "Refunded", tone: "purple" }
  }
  if (["paid", "captured", "authorized", "settled", "completed", "success", "succeeded"].includes(s)) {
    return { key: "paid", label: "Paid", tone: "green" }
  }
  if (["failed", "declined"].includes(s)) {
    return { key: "failed", label: "Failed", tone: "red" }
  }
  if (m === "cash" || m === "cod" || s.includes("cod")) {
    return {
      key: o === "delivered" ? "paid" : "cod",
      label: o === "delivered" ? "Collected (COD)" : "COD Pending",
      tone: o === "delivered" ? "green" : "amber",
    }
  }
  return { key: "pending", label: "Pending", tone: "amber" }
}

const formatAddress = (addr) => {
  if (!addr) return ""
  if (typeof addr === "string") return addr
  if (addr.formattedAddress) return addr.formattedAddress
  if (addr.address) return addr.address
  return [
    addr.street,
    addr.additionalDetails,
    addr.landmark,
    addr.area,
    addr.city,
    addr.state,
    addr.zipCode || addr.pincode,
  ]
    .filter(Boolean)
    .join(", ")
}

const getItemAddons = (item) => {
  const list = Array.isArray(item?.addons)
    ? item.addons
    : Array.isArray(item?.addOns)
      ? item.addOns
      : []
  return list
    .map((addon) => {
      const qty = Math.max(1, toNumber(addon?.quantity) ?? 1)
      const unit = Math.max(0, toNumber(addon?.price) ?? 0)
      return {
        name: firstText(addon?.name, addon?.title, addon?.label),
        quantity: qty,
        unitPrice: unit,
        total: unit * qty,
      }
    })
    .filter((addon) => addon.name)
}

const ROLE_LABEL = {
  USER: "Customer",
  CUSTOMER: "Customer",
  RESTAURANT: "Restaurant",
  ADMIN: "Admin",
  SYSTEM: "System",
  DELIVERY: "Delivery Partner",
  DELIVERY_PARTNER: "Delivery Partner",
  RIDER: "Delivery Partner",
}

const JOURNEY_STEPS = [
  { id: "placed", label: "Order Placed", match: ["pending", "created"] },
  { id: "accepted", label: "Accepted", match: ["confirmed"] },
  { id: "preparing", label: "Preparing", match: ["preparing"] },
  { id: "ready", label: "Ready for Pickup", match: ["ready", "ready_for_pickup"] },
  { id: "assigned", label: "Pickup Assigned", match: ["assigned"] },
  { id: "picked_up", label: "Picked Up", match: ["picked_up"] },
  { id: "out_for_delivery", label: "Out for Delivery", match: ["out_for_delivery"] },
  { id: "delivered", label: "Delivered", match: ["delivered", "completed"] },
  { id: "cancelled", label: "Cancelled", match: ["cancelled", "cancelled_by_user", "cancelled_by_restaurant", "cancelled_by_admin", "rejected"] },
]

function findHistoryTimestamp(history, matchers) {
  const hit = [...history].reverse().find((entry) => {
    const to = normalizeStatusKey(entry.to)
    return matchers.some((m) => to === m || to.startsWith(`${m}_`) || to.startsWith(m))
  })
  return hit?.at || null
}

function findAcceptedAt(statusHistory) {
  // Restaurant Accept usually sets status directly to preparing (skips confirmed).
  return (
    findHistoryTimestamp(statusHistory, ["confirmed"]) ||
    findHistoryTimestamp(statusHistory, ["preparing"])
  )
}

function extractCancellation(order, statusHistory, refund, statusKey) {
  const cancelHistory = [...statusHistory]
    .reverse()
    .find((entry) => isCancelledStatus(entry.to))

  const byRoleRaw = String(cancelHistory?.byRole || "").toUpperCase()
  let cancelledBy = ROLE_LABEL[byRoleRaw] || ""
  if (!cancelledBy) {
    if (statusKey.includes("user")) cancelledBy = "Customer"
    else if (statusKey.includes("restaurant")) cancelledBy = "Restaurant"
    else if (statusKey.includes("admin")) cancelledBy = "Admin"
    else cancelledBy = "System"
  }

  const rawNote = firstText(
    cancelHistory?.note,
    refund?.reason,
    order?.cancellationReason,
    order?.rejectionReason,
    order?.payment?.refund?.reason,
  )

  const summary = statusKey.includes("restaurant")
    ? "This order was cancelled by the restaurant."
    : statusKey.includes("user")
      ? "This order was cancelled by the customer."
      : statusKey.includes("admin")
        ? "This order was cancelled by admin support."
        : "This order was cancelled."

  const reason =
    rawNote && !/^order cancelled by/i.test(rawNote)
      ? rawNote
      : rawNote || "No specific reason was shared."

  return {
    reason,
    summary,
    cancelledBy,
    cancelledAt: cancelHistory?.at || null,
    cancelledAtLabel: formatDateTime(cancelHistory?.at),
    refundStatus: firstText(refund?.status) || "",
    refundAmount: firstNumber(refund?.amount) ?? 0,
    historyNote: rawNote || "",
  }
}

function buildJourney(order, statusHistory) {
  const status = normalizeStatusKey(order.orderStatus || order.status)
  const cancelled = isCancelledStatus(status)
  const delivery = order.deliveryState || {}
  const dispatch = order.dispatch || {}
  const acceptedAt = findAcceptedAt(statusHistory)

  const timestamps = {
    placed: order.createdAt || findHistoryTimestamp(statusHistory, ["pending", "created"]),
    accepted: acceptedAt,
    preparing: findHistoryTimestamp(statusHistory, ["preparing"]) || acceptedAt,
    ready: findHistoryTimestamp(statusHistory, ["ready", "ready_for_pickup"]),
    assigned: dispatch.assignedAt || findHistoryTimestamp(statusHistory, ["assigned"]),
    picked_up: delivery.pickedUpAt || findHistoryTimestamp(statusHistory, ["picked_up"]),
    out_for_delivery: findHistoryTimestamp(statusHistory, ["out_for_delivery"]),
    delivered:
      order.deliveredAt ||
      delivery.deliveredAt ||
      findHistoryTimestamp(statusHistory, ["delivered", "completed"]),
    cancelled: cancelled
      ? findHistoryTimestamp(statusHistory, [
          "cancelled",
          "cancelled_by_user",
          "cancelled_by_restaurant",
          "cancelled_by_admin",
          "rejected",
        ])
      : null,
  }

  const orderRank = {
    pending: 0,
    created: 0,
    confirmed: 1,
    preparing: 2,
    ready: 3,
    ready_for_pickup: 3,
    assigned: 4,
    picked_up: 5,
    out_for_delivery: 6,
    delivered: 7,
    completed: 7,
  }
  const stepRank = {
    placed: 0,
    accepted: 1,
    preparing: 2,
    ready: 3,
    assigned: 4,
    picked_up: 5,
    out_for_delivery: 6,
    delivered: 7,
    cancelled: 99,
  }

  const currentRank = cancelled ? -1 : (orderRank[status] ?? 0)

  const currentStepId = (() => {
    if (cancelled) return "cancelled"
    if (status === "pending" || status === "created") return "placed"
    if (status === "confirmed") return "accepted"
    if (status === "preparing") return "preparing"
    if (status === "ready" || status === "ready_for_pickup") return "ready"
    if (status === "assigned") return "assigned"
    if (status === "picked_up") return "picked_up"
    if (status === "out_for_delivery") return "out_for_delivery"
    if (status === "delivered" || status === "completed") return "delivered"
    return "placed"
  })()

  return JOURNEY_STEPS.filter((step) => {
    if (step.id === "cancelled") return cancelled
    if (cancelled) {
      if (step.id === "placed") return true
      if (step.id === "accepted") return Boolean(timestamps.accepted)
      return Boolean(timestamps[step.id])
    }
    return true
  }).map((step) => {
    const at = timestamps[step.id] || null
    let state = "upcoming"

    if (step.id === "cancelled") {
      state = "current"
    } else if (cancelled) {
      state = at || step.id === "placed" ? "done" : "skipped"
    } else if (step.id === currentStepId) {
      state = "current"
    } else if (stepRank[step.id] < currentRank || at) {
      state = "done"
    } else {
      state = "upcoming"
    }

    if (!cancelled && state === "upcoming" && at) state = "done"
    if (!cancelled && step.id === currentStepId) state = "current"

    // Accept-to-preparing path: still show Accepted as completed with timestamp.
    if (!cancelled && step.id === "accepted" && currentRank >= 2 && acceptedAt) {
      state = status === "confirmed" ? "current" : "done"
    }

    return {
      id: step.id,
      label: step.label,
      at,
      atLabel: formatDateTime(at),
      state,
      note: "",
    }
  })
}

function buildActivityLog(statusHistory) {
  return [...statusHistory]
    .filter((entry) => entry?.at || entry?.to)
    .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
    .map((entry, index) => ({
      id: `${entry.at || "evt"}-${index}`,
      at: entry.at,
      atLabel: formatDateTime(entry.at) || "—",
      from: formatOrderStatusLabel(entry.from || "—"),
      to: formatOrderStatusLabel(entry.to || "—"),
      byRole: ROLE_LABEL[String(entry.byRole || "").toUpperCase()] || firstText(entry.byRole) || "System",
      note: firstText(entry.note) || "",
    }))
}

function computeEarnings(pricing) {
  const subtotal = firstNumber(pricing.subtotal) ?? 0
  // Packaging is the restaurant's income only when it set the per-item charge.
  // In admin-managed mode the platform keeps it (see backend packagingCharge.js).
  const packagingFee =
    String(pricing.packagingMode || "") === "RESTAURANT"
      ? firstNumber(pricing.packagingFee) ?? 0
      : 0
  const restaurantDeliveryFee = firstNumber(pricing.restaurantDeliveryFee) ?? 0
  const commissionPct = firstNumber(pricing.restaurantCommissionPercentage) ?? 0
  const commissionAmt = firstNumber(pricing.restaurantCommission) ?? 0
  const orderValue = subtotal + packagingFee
  const net = Math.max(0, orderValue - restaurantDeliveryFee - commissionAmt)

  return {
    orderValue,
    commissionPct,
    commissionAmt,
    restaurantDeliveryFee,
    taxOnCommission: 0,
    netEarnings: net,
  }
}

/**
 * @param {object} order Raw API order
 */
export function normalizeRestaurantOrder(order) {
  if (!order || typeof order !== "object") return null

  const pricing = order.pricing || {}
  const payment = order.payment || {}
  const deliveryState = order.deliveryState || {}
  const dispatch = order.dispatch || {}
  const statusRaw = order.orderStatus || order.status || ""
  const statusKey = normalizeStatusKey(statusRaw)
  const cancelled = isCancelledStatus(statusKey)

  const statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : []
  const paymentMeta = paymentStatusMeta(payment.status, payment.method, statusRaw)

  const subtotal = firstNumber(pricing.subtotal, pricing.itemsTotal, pricing.itemSubtotal) ?? 0
  const packagingFee = firstNumber(pricing.packagingFee) ?? 0
  const deliveryFee = firstNumber(
    pricing.userDeliveryFee,
    pricing.deliveryFee,
    pricing.totalDeliveryFee,
  ) ?? 0
  const tax = firstNumber(pricing.tax, pricing.gst) ?? 0
  const platformFee = firstNumber(pricing.platformFee) ?? 0
  const discount = firstNumber(pricing.discount) ?? 0
  const couponDiscount = firstNumber(pricing.couponDiscount) ?? 0
  const itemDiscount = firstNumber(pricing.itemDiscount) ?? 0
  const walletDiscount = firstNumber(pricing.walletDiscount, pricing.walletUsed) ?? 0
  const deliverySpeedFee = firstNumber(pricing.deliverySpeedFee) ?? 0
  const total = firstNumber(pricing.total, payment.amountDue) ?? 0
  const amountDue = firstNumber(payment.amountDue, total) ?? total

  const addonsTotal = (Array.isArray(order.items) ? order.items : []).reduce((sum, item) => {
    return (
      sum +
      getItemAddons(item).reduce((inner, addon) => inner + addon.total, 0)
    )
  }, 0)

  const items = (Array.isArray(order.items) ? order.items : []).map((item, index) => {
    const qty = Math.max(1, toNumber(item.quantity) ?? 1)
    const unit = Math.max(0, toNumber(item.price) ?? toNumber(item.basePrice) ?? 0)
    const addons = getItemAddons(item)
    const addonsSum = addons.reduce((s, a) => s + a.total, 0)
    return {
      id: String(item._id || item.itemId || `${item.name}-${index}`),
      name: firstText(item.name) || "Item",
      quantity: qty,
      unitPrice: unit,
      lineTotal: unit * qty + addonsSum,
      isVeg: item.isVeg !== false,
      variant: firstText(item.variantName, item.variant),
      notes: firstText(item.notes, item.specialInstructions, item.instruction),
      image: firstText(item.image),
      addons,
    }
  })

  const partner =
    dispatch.deliveryPartnerId && typeof dispatch.deliveryPartnerId === "object"
      ? dispatch.deliveryPartnerId
      : order.deliveryPartnerId && typeof order.deliveryPartnerId === "object"
        ? order.deliveryPartnerId
        : null

  const refund = payment.refund || {}
  const earnings = computeEarnings(pricing)
  const acceptedAt = findAcceptedAt(statusHistory)
  const cancellation = cancelled
    ? {
        ...extractCancellation(order, statusHistory, refund, statusKey),
        refundStatus:
          firstText(refund.status) ||
          (paymentMeta.key === "refunded" ? "Refunded" : "Not started"),
      }
    : null

  let settlementStatus = "Not applicable"
  let settlementDate = null
  if (statusKey === "delivered" || statusKey === "completed") {
    if (paymentMeta.key === "paid" || paymentMeta.key === "cod") {
      settlementStatus = "Pending settlement"
    } else {
      settlementStatus = "Awaiting payment"
    }
  } else if (cancelled) {
    settlementStatus = "No settlement"
  } else {
    settlementStatus = "In progress"
  }

  const estimatedPrep = firstNumber(order.preparationTime)
  const createdAt = order.createdAt
  const estimatedReadyAt =
    createdAt && estimatedPrep
      ? new Date(new Date(createdAt).getTime() + estimatedPrep * 60 * 1000)
      : null

  const pickupAt = deliveryState.pickedUpAt || deliveryState.reachedPickupAt || null
  const deliveredAt = order.deliveredAt || deliveryState.deliveredAt || null
  const distanceKm = firstNumber(pricing.deliveryDistanceKm)

  return {
    raw: order,
    mongoId: String(order._id || ""),
    orderId: firstText(order.orderId, order._id) || "—",
    statusRaw,
    statusKey,
    statusLabel: formatOrderStatusLabel(statusRaw),
    statusTone: getStatusTone(statusRaw),
    cancelled,
    createdAt,
    createdAtLabel: formatDateTime(createdAt),
    updatedAt: order.updatedAt,
    preparationTime: estimatedPrep,
    estimatedReadyAt,
    estimatedReadyAtLabel: formatDateTime(estimatedReadyAt),
    acceptedAt,
    acceptedAtLabel: formatDateTime(acceptedAt),
    payment: {
      method: payment.method || "",
      methodLabel: paymentMethodLabel(payment.method),
      status: payment.status || "",
      statusMeta: paymentMeta,
      amountDue,
      amountPaid:
        paymentMeta.key === "paid" || (paymentMeta.key === "cod" && statusKey === "delivered")
          ? amountDue
          : paymentMeta.key === "refunded"
            ? firstNumber(refund.amount, amountDue) ?? 0
            : 0,
      amountPending:
        paymentMeta.key === "pending" || paymentMeta.key === "cod"
          ? amountDue
          : Math.max(0, amountDue - (firstNumber(refund.amount) ?? 0)),
      refund: {
        status: firstText(refund.status) || "",
        amount: firstNumber(refund.amount) ?? 0,
        reason: firstText(refund.reason) || "",
        processedAt: refund.processedAt || null,
        requestedAt: refund.requestedAt || null,
      },
    },
    customer: {
      name:
        firstText(
          order.userId?.name,
          order.customerName,
          order.customer?.name,
          order.deliveryAddress?.name,
        ) || "Customer",
      phone: firstText(
        order.userId?.phone,
        order.customerPhone,
        order.deliveryAddress?.phone,
      ),
      email: firstText(order.userId?.email),
    },
    address: {
      full: formatAddress(order.deliveryAddress || order.address) || "Address not available",
      instructions: firstText(
        order.deliveryAddress?.additionalDetails,
        order.deliveryAddress?.landmark,
        order.address?.additionalDetails,
      ),
      phone: firstText(order.deliveryAddress?.phone),
    },
    notes: firstText(order.note, order.notes, order.orderNote),
    cutlery: Boolean(order.sendCutlery),
    items,
    bill: {
      itemSubtotal: subtotal,
      addonCharges: addonsTotal,
      packagingFee,
      deliveryCharges: deliveryFee,
      deliverySpeedFee,
      taxes: tax,
      couponDiscount,
      couponCode: firstText(pricing.couponCode),
      itemDiscount,
      walletDiscount,
      otherDiscount: Math.max(0, discount - couponDiscount - itemDiscount - walletDiscount),
      platformCharges: platformFee,
      grandTotal: total,
      currency: firstText(pricing.currency) || "INR",
    },
    earnings: {
      ...earnings,
      settlementStatus,
      settlementDate,
      settlementDateLabel: formatDateOnly(settlementDate),
    },
    delivery: {
      partnerName: firstText(partner?.name, partner?.fullName) || "",
      partnerPhone: firstText(partner?.phone) || "",
      partnerRating: firstNumber(partner?.rating),
      dispatchStatus: firstText(dispatch.status),
      assignedAt: dispatch.assignedAt || null,
      acceptedAt: dispatch.acceptedAt || null,
      pickupAt,
      pickupAtLabel: formatDateTime(pickupAt),
      deliveredAt,
      deliveredAtLabel: formatDateTime(deliveredAt),
      distanceKm,
      distanceLabel:
        distanceKm != null ? `${Number(distanceKm).toFixed(distanceKm % 1 ? 1 : 0)} km` : "",
      estimatedDeliveryLabel: estimatedReadyAt
        ? formatDateTime(estimatedReadyAt)
        : "",
      actualDeliveryLabel: formatDateTime(deliveredAt),
      phase: firstText(deliveryState.currentPhase, deliveryState.status),
    },
    cancellation,
    journey: buildJourney(order, statusHistory),
    activityLog: buildActivityLog(statusHistory),
    dispatchStatus: firstText(dispatch.status),
    canResendNotification:
      !cancelled &&
      ["preparing", "ready", "ready_for_pickup", "confirmed"].includes(statusKey) &&
      String(dispatch.status || "").toLowerCase() !== "accepted",
    actions: {
      canAccept: ["pending", "created", "confirmed"].includes(statusKey),
      canReject: ["pending", "created", "confirmed", "preparing"].includes(statusKey),
      canMarkReady: statusKey === "preparing",
      canUpdatePrep: statusKey === "preparing" || statusKey === "confirmed",
    },
  }
}

export default normalizeRestaurantOrder
