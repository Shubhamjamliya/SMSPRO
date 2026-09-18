/**
 * Single source of truth for order status across customer, seller, delivery, and admin UIs.
 * Mirrors backend `legacyStatusFromWorkflow` (see backend/app/constants/orderWorkflow.js).
 */

export const WORKFLOW_STATUS = {
  CREATED: "CREATED",
  SELLER_PENDING: "SELLER_PENDING",
  SELLER_ACCEPTED: "SELLER_ACCEPTED",
  DELIVERY_SEARCH: "DELIVERY_SEARCH",
  DELIVERY_ASSIGNED: "DELIVERY_ASSIGNED",
  PICKUP_READY: "PICKUP_READY",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
};

const LEGACY_ENUM = new Set([
  "pending",
  "confirmed",
  "packed",
  "out_for_delivery",
  "delivered",
  "cancelled",
]);

function legacyFromWorkflow(workflowStatus) {
  switch (workflowStatus) {
    case WORKFLOW_STATUS.CREATED:
    case WORKFLOW_STATUS.SELLER_PENDING:
      return "pending";
    case WORKFLOW_STATUS.SELLER_ACCEPTED:
    case WORKFLOW_STATUS.DELIVERY_SEARCH:
      return "confirmed";
    case WORKFLOW_STATUS.DELIVERY_ASSIGNED:
    case WORKFLOW_STATUS.PICKUP_READY:
      return "confirmed";
    case WORKFLOW_STATUS.OUT_FOR_DELIVERY:
      return "out_for_delivery";
    case WORKFLOW_STATUS.DELIVERED:
      return "delivered";
    case WORKFLOW_STATUS.CANCELLED:
      return "cancelled";
    default:
      return "pending";
  }
}

/**
 * Normalized legacy bucket (matches Order.status enum + v2 workflow mapping).
 * Use for filters, tabs, and comparisons across panels.
 */
export function getLegacyStatusFromOrder(order) {
  if (!order) return "pending";

  // Explicitly check for delivered status first using multiple indicators
  if (
    order.deliveredAt ||
    order.deliveryState?.deliveredAt ||
    String(order.deliveryState?.status || order.deliveryState || "").toLowerCase() === "delivered" ||
    String(order.orderStatus || "").toLowerCase() === "delivered" ||
    String(order.status || "").toLowerCase() === "delivered"
  ) {
    return "delivered";
  }

  if (
    String(order.orderStatus || "").toLowerCase().includes("cancel") ||
    String(order.status || "").toLowerCase().includes("cancel") ||
    String(order.workflowStatus || "").toLowerCase().includes("cancel")
  ) {
    return "cancelled";
  }

  const v = Number(order.workflowVersion) || 0;
  if (v >= 2 && order.workflowStatus) {
    const workflowStatus = String(order.workflowStatus).toUpperCase();

    if (workflowStatus === WORKFLOW_STATUS.OUT_FOR_DELIVERY) {
      return "out_for_delivery";
    }
    if (workflowStatus === WORKFLOW_STATUS.DELIVERED) {
      return "delivered";
    }
    if (
      workflowStatus === WORKFLOW_STATUS.DELIVERY_ASSIGNED ||
      workflowStatus === WORKFLOW_STATUS.PICKUP_READY
    ) {
      return "confirmed";
    }

    return legacyFromWorkflow(workflowStatus);
  }

  const riderStep = Number(order.deliveryRiderStep) || 0;
  if (riderStep >= 3 || order.outForDeliveryAt || order.pickupConfirmedAt) {
    return "out_for_delivery";
  }
  if (riderStep >= 1 || order.assignedAt || order.pickupReadyAt || order.deliveryBoy) {
    return "confirmed";
  }

  const s = String(order.status ?? "pending").toLowerCase();
  if (LEGACY_ENUM.has(s)) return s;
  return "pending";
}

const DISPLAY_LABELS = {
  pending: "Pending",
  confirmed: "Confirmed",
  packed: "Packed",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** Human-readable status for list/detail badges (customer-facing tone). */
export function getOrderStatusLabel(order) {
  const bucket = getLegacyStatusFromOrder(order);
  return DISPLAY_LABELS[bucket] || bucket.replace(/_/g, " ");
}

/**
 * Admin sidebar uses path segments like `processed` and `out-for-delivery`.
 * Map route param → whether an order belongs in that view.
 */
export function adminRouteMatchesOrder(routeStatus, order) {
  const legacy = getLegacyStatusFromOrder(order);
  if (routeStatus === "all") return true;
  if (routeStatus === "pending") return legacy === "pending";
  if (routeStatus === "processed") {
    return legacy === "confirmed" || legacy === "packed";
  }
  if (routeStatus === "out-for-delivery") {
    return legacy === "out_for_delivery";
  }
  if (routeStatus === "delivered") return legacy === "delivered";
  if (routeStatus === "cancelled") return legacy === "cancelled";
  if (routeStatus === "returned") {
    return orderHasReturn(order);
  }
  return legacy === routeStatus;
}

/* ------------------------------------------------------------------ *
 * Return / refund status                                              *
 * ------------------------------------------------------------------ */

/** Mirrors backend RETURN_STATUSES (quick-commerce/utils/return.helpers.js). */
export const RETURN_STATUS = {
  REQUESTED: "return_requested",
  APPROVED: "return_approved",
  REJECTED: "return_rejected",
  PICKUP_ASSIGNED: "return_pickup_assigned",
  IN_TRANSIT: "return_in_transit",
  RETURNED: "returned",
  REFUND_COMPLETED: "refund_completed",
  CANCELLED: "return_cancelled",
};

const RETURN_STATUS_LABELS = {
  [RETURN_STATUS.REQUESTED]: "Return requested",
  [RETURN_STATUS.APPROVED]: "Return approved",
  [RETURN_STATUS.REJECTED]: "Return rejected",
  [RETURN_STATUS.PICKUP_ASSIGNED]: "Awaiting pickup",
  [RETURN_STATUS.IN_TRANSIT]: "Return in transit",
  [RETURN_STATUS.RETURNED]: "Returned to you",
  [RETURN_STATUS.REFUND_COMPLETED]: "Refunded",
  [RETURN_STATUS.CANCELLED]: "Return cancelled",
};

const RETURN_STATUS_VARIANTS = {
  [RETURN_STATUS.REQUESTED]: "warning",
  [RETURN_STATUS.APPROVED]: "info",
  [RETURN_STATUS.REJECTED]: "error",
  [RETURN_STATUS.PICKUP_ASSIGNED]: "info",
  [RETURN_STATUS.IN_TRANSIT]: "primary",
  [RETURN_STATUS.RETURNED]: "secondary",
  [RETURN_STATUS.REFUND_COMPLETED]: "success",
  [RETURN_STATUS.CANCELLED]: "secondary",
};

/** Return states where the goods/refund are still moving. */
export const ACTIVE_RETURN_STATUSES = new Set([
  RETURN_STATUS.REQUESTED,
  RETURN_STATUS.APPROVED,
  RETURN_STATUS.PICKUP_ASSIGNED,
  RETURN_STATUS.IN_TRANSIT,
  RETURN_STATUS.RETURNED,
]);

const normalizeReturnStatus = (value) => String(value || "").trim().toLowerCase();

/** Reads whichever return field the API surface happens to expose. */
export function resolveReturnStatus(order) {
  return normalizeReturnStatus(
    order?.returnSummary?.returnStatus ||
      order?.returnInfo?.returnStatus ||
      order?.returnStatus,
  );
}

export function orderHasReturn(order) {
  if (order?.returnSummary?.hasReturn || order?.returnInfo?.hasReturn) return true;
  const status = resolveReturnStatus(order);
  return Boolean(status) && status !== "none";
}

export function getReturnStatusLabel(status) {
  const normalized = normalizeReturnStatus(status);
  if (!normalized || normalized === "none") return "";
  return RETURN_STATUS_LABELS[normalized] || normalized.replace(/_/g, " ");
}

export function getReturnStatusVariant(status) {
  const normalized = normalizeReturnStatus(status);
  return RETURN_STATUS_VARIANTS[normalized] || "secondary";
}

const REFUND_STATUS_LABELS = {
  none: "No refund",
  pending: "Refund pending payout",
  processing: "Refund processing",
  completed: "Refund completed",
  failed: "Refund failed",
};

const REFUND_STATUS_VARIANTS = {
  none: "secondary",
  pending: "warning",
  processing: "info",
  completed: "success",
  failed: "error",
};

export function getRefundStatusLabel(status) {
  const normalized = normalizeReturnStatus(status);
  if (!normalized) return "";
  return REFUND_STATUS_LABELS[normalized] || normalized.replace(/_/g, " ");
}

export function getRefundStatusVariant(status) {
  return REFUND_STATUS_VARIANTS[normalizeReturnStatus(status)] || "secondary";
}

/**
 * Ordered checkpoints for a return, with the reached/current one flagged.
 * Rejected and cancelled returns stop after the request step.
 */
export function buildReturnProgressSteps(status) {
  const normalized = normalizeReturnStatus(status);
  const flow = [
    RETURN_STATUS.REQUESTED,
    RETURN_STATUS.APPROVED,
    RETURN_STATUS.PICKUP_ASSIGNED,
    RETURN_STATUS.IN_TRANSIT,
    RETURN_STATUS.RETURNED,
    RETURN_STATUS.REFUND_COMPLETED,
  ];

  if (normalized === RETURN_STATUS.REJECTED || normalized === RETURN_STATUS.CANCELLED) {
    return [
      { status: RETURN_STATUS.REQUESTED, label: getReturnStatusLabel(RETURN_STATUS.REQUESTED), reached: true, current: false },
      { status: normalized, label: getReturnStatusLabel(normalized), reached: true, current: true },
    ];
  }

  const activeIndex = flow.indexOf(normalized);
  return flow.map((step, index) => ({
    status: step,
    label: getReturnStatusLabel(step),
    reached: activeIndex >= 0 && index <= activeIndex,
    current: index === activeIndex,
  }));
}
