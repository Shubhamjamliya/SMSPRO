import { formatInr } from "./format";

export const BOOKING_STATUS_LABELS = {
  requested: "Pending Approval",
  pending_approval: "Pending Approval",
  payment_pending: "Confirmed — pay now",
  reserved: "Confirmed",
  pickup_completed: "Pickup inspected",
  rental_started: "Handed over",
  active: "On ride",
  return_requested: "Return pending",
  inspection: "Return inspection",
  completed: "Completed",
  refund_processing: "Refund processing",
  deposit_refunded: "Deposit refunded",
  cancelled: "Cancelled",
  rejected: "Rejected",
  expired: "Expired",
  no_show: "Missed pickup",
};

export function bookingStatusLabel(status) {
  const key = String(status || "").toLowerCase();
  return BOOKING_STATUS_LABELS[key] || (key ? key.replace(/_/g, " ") : "Unknown");
}

export function bookingStatusTone(status) {
  const key = String(status || "").toLowerCase();
  if (key === "pending_approval" || key === "requested") return "warning";
  if (key === "payment_pending") return "info";
  if (["reserved", "pickup_completed", "rental_started", "active"].includes(key)) {
    return "success";
  }
  if (["cancelled", "expired", "no_show", "rejected"].includes(key)) return "danger";
  if (key === "refund_processing") return "info";
  if (["completed", "deposit_refunded"].includes(key)) return "muted";
  return "info";
}

/** Display label for who cancelled a booking. */
export function cancelledByLabel(value) {
  const key = String(value || "").toLowerCase();
  if (key === "admin") return "Admin";
  if (key === "user") return "User";
  if (key === "system") return "System";
  return key ? key.replace(/_/g, " ") : "—";
}

/** DD/MM/YYYY for cancellation date display. */
export function formatCancellationDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** True only when the user can pay (after admin approval). */
export function isPaymentPendingStatus(status) {
  const key = String(status || "").toLowerCase();
  return key === "payment_pending";
}

/** True while waiting for admin approve/reject. */
export function isAwaitingApprovalStatus(status) {
  const key = String(status || "").toLowerCase();
  return key === "pending_approval" || key === "requested";
}

/** Soft-hold that blocks re-booking the same bike (approval or unpaid). */
export function isOpenHoldStatus(status) {
  return isAwaitingApprovalStatus(status) || isPaymentPendingStatus(status);
}

export function bookingIdOf(booking) {
  return booking?.id || booking?._id || "";
}

export function bookingBikeIdOf(booking) {
  const bike = booking?.bikeId;
  if (bike && typeof bike === "object") return bike.id || bike._id || "";
  return bike || booking?.bikeSnapshot?.id || "";
}

export function remainingMs(expiresAt) {
  if (!expiresAt) return null;
  const end = new Date(expiresAt).getTime();
  if (Number.isNaN(end)) return null;
  return end - Date.now();
}

export function formatRemainingTime(expiresAt) {
  const ms = remainingMs(expiresAt);
  if (ms == null) return "";
  if (ms <= 0) return "Expired";
  const totalSec = Math.ceil(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m left`;
  }
  if (mins > 0) return `${mins}m ${String(secs).padStart(2, "0")}s left`;
  return `${secs}s left`;
}

export function bookingMoneySummary(booking) {
  const money = booking?.money || booking?.quoteSnapshot || {};
  const deposit = booking?.securityDepositPayment || {};
  const coupon = booking?.couponApplied || {};
  const rentalFee = Number(money.rentalFee || 0);
  const taxAmount = Number(money.taxAmount || 0);
  const discountAmount = Number(
    money.discountAmount ?? coupon.discountAmount ?? 0,
  );
  const extensionFee = Number(money.extensionFee || 0);
  const lateFee = Number(money.lateFee || booking?.lateReturn?.chargeAmount || 0);
  const damageFee = Number(money.damageFee || booking?.lateReturn?.damageFee || 0);
  const cancelFee = Number(money.cancelFee || booking?.cancellation?.cancellationCharge || 0);
  const securityDeposit = Number(
    deposit.depositAmount ?? money.securityDeposit ?? 0,
  );
  const totalPayable = Number(money.totalPayable || 0);
  const totalPaid = Number(money.totalPaid || 0);

  return {
    rentalFee,
    taxAmount,
    discountAmount,
    extensionFee,
    lateFee,
    damageFee,
    cancelFee,
    securityDeposit,
    depositHeld: Number(money.depositHeld || 0),
    depositCaptured: Number(money.depositCaptured || 0),
    depositRefunded: Number(money.depositRefunded || 0),
    totalPayable,
    totalPaid,
    rentalDurationHours: Number(booking?.rentalDurationHours || 0),
    couponCode: String(coupon.couponCode || booking?.couponCode || "").trim(),
    depositStatus: deposit.depositStatus || "",
    depositPaymentMethod: deposit.depositPaymentMethod || "",
    paymentMethod: String(booking?.payment?.method || booking?.payment?.mode || "").trim(),
    formattedTotal: formatInr(totalPayable),
    formattedDeposit: formatInr(securityDeposit),
  };
}

/**
 * Line items for payment summary — amounts come from booking.money (backend).
 * Frontend must not recompute totals.
 */
export function bookingPaymentLines(booking) {
  const summary = bookingMoneySummary(booking);
  const lines = [];

  if (summary.rentalFee > 0 || summary.totalPayable > 0) {
    const hours = summary.rentalDurationHours;
    lines.push({
      key: "rentalFee",
      label: hours > 0 ? `Base rental (${hours}h)` : "Base rental",
      amount: summary.rentalFee,
    });
  }
  if (summary.extensionFee > 0) {
    lines.push({ key: "extensionFee", label: "Extension charges", amount: summary.extensionFee });
  }
  if (summary.lateFee > 0) {
    lines.push({ key: "lateFee", label: "Extra hours / late charges", amount: summary.lateFee });
  }
  if (summary.damageFee > 0) {
    lines.push({ key: "damageFee", label: "Damage / repair fee", amount: summary.damageFee });
  }
  if (summary.discountAmount > 0) {
    lines.push({
      key: "discountAmount",
      label: summary.couponCode ? `Discount (${summary.couponCode})` : "Discount / coupon",
      amount: -summary.discountAmount,
      credit: true,
    });
  }
  if (summary.taxAmount > 0) {
    lines.push({ key: "taxAmount", label: "Taxes & fees", amount: summary.taxAmount });
  }
  if (summary.securityDeposit > 0) {
    lines.push({
      key: "securityDeposit",
      label: "Security deposit",
      amount: summary.securityDeposit,
      muted: true,
    });
  }
  if (summary.cancelFee > 0) {
    lines.push({
      key: "cancelFee",
      label: "Cancellation charge",
      amount: summary.cancelFee,
    });
  }
  if (summary.depositRefunded > 0) {
    lines.push({
      key: "depositRefunded",
      label: "Deposit refunded",
      amount: -summary.depositRefunded,
      credit: true,
    });
  }

  return { summary, lines };
}

function formatRefundDay(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function hoursTimelineLabel(hours) {
  const n = Number(hours);
  if (!Number.isFinite(n) || n <= 0) return "Within 24 hours";
  if (n < 1) return "Within 1 hour";
  if (n === 1) return "Within 1 hour";
  if (n < 24) return `Within ${Math.round(n)} hours`;
  const days = Math.round(n / 24);
  if (days <= 1) return "Within 24 hours";
  return `Within ${days} days`;
}

/**
 * Unified refund view-model from booking transaction fields (backend source of truth).
 */
export function getBookingRefundDetails(booking) {
  if (!booking) return null;
  const status = String(booking.status || "").toLowerCase();
  const cancel = booking.cancellation || {};
  const depositRefund = booking.depositRefund || {};
  const noShow = booking.noShow || {};
  const money = booking.money || {};
  const hoursHint = booking.depositRefundHours ?? 24;

  if (status === "cancelled") {
    const amount = Number(
      cancel.walletCreditAmount
        ?? cancel.finalRefundAmount
        ?? (Number(cancel.rentalRefund || 0) + Number(cancel.securityDepositRefund || 0))
        ?? 0,
    );
    const initiated = booking.cancelledAt || cancel.calculatedAt || null;
    const hasCredit = amount > 0;
    return {
      kind: "cancellation",
      title: "Refund details",
      amount,
      status: hasCredit ? "Completed" : "Not applicable",
      statusTone: hasCredit ? "completed" : "na",
      initiatedAt: initiated,
      initiatedLabel: formatRefundDay(initiated) || "—",
      expectedLabel: hasCredit ? "Credited immediately" : "—",
      creditedAt: hasCredit ? initiated : null,
      creditedLabel: hasCredit ? (formatRefundDay(initiated) || "—") : "—",
      method: "Wallet",
      breakdown: [
        Number(cancel.rentalRefund || 0) > 0
          ? { label: "Rental refund", amount: Number(cancel.rentalRefund) }
          : null,
        Number(cancel.securityDepositRefund || 0) > 0
          ? { label: "Security deposit refund", amount: Number(cancel.securityDepositRefund) }
          : null,
        Number(cancel.cancellationCharge || money.cancelFee || 0) > 0
          ? {
            label: "Cancellation charge",
            amount: -Number(cancel.cancellationCharge || money.cancelFee || 0),
          }
          : null,
      ].filter(Boolean),
      note: hasCredit
        ? `${formatInr(amount)} was credited to your wallet after cancellation.`
        : "No refundable amount for this cancelled booking.",
    };
  }

  if (status === "no_show" || noShow.refundProcessed) {
    const amount = Number(noShow.walletCreditAmount || noShow.depositRefund || 0);
    const initiated = noShow.processedAt || booking.updatedAt || null;
    const done = Boolean(noShow.refundProcessed) || amount > 0;
    return {
      kind: "no_show",
      title: "Refund details",
      amount,
      status: done ? "Completed" : "Pending",
      statusTone: done ? "completed" : "pending",
      initiatedAt: initiated,
      initiatedLabel: formatRefundDay(initiated) || "—",
      expectedLabel: done ? "Credited to wallet" : hoursTimelineLabel(hoursHint),
      creditedAt: done ? initiated : null,
      creditedLabel: done ? (formatRefundDay(initiated) || "—") : "—",
      method: "Wallet",
      breakdown: [
        Number(noShow.deductionAmount || noShow.depositCaptured || 0) > 0
          ? {
            label: "No-show deduction",
            amount: -Number(noShow.deductionAmount || noShow.depositCaptured || 0),
          }
          : null,
      ].filter(Boolean),
      note: done
        ? `${formatInr(amount)} credited to your wallet (no-show settlement).`
        : "No-show refund will be processed to your wallet.",
      reference: noShow.walletReference || "",
    };
  }

  const depStatus = String(depositRefund.status || "").toLowerCase();
  const showDepositRefund =
    ["processing", "completed", "failed"].includes(depStatus)
    || ["refund_processing", "deposit_refunded", "completed"].includes(status)
    || Number(depositRefund.amount || 0) > 0
    || Number(money.depositRefunded || 0) > 0;

  if (!showDepositRefund) return null;

  let statusLabel = "Pending";
  let statusTone = "pending";
  if (depStatus === "completed" || status === "deposit_refunded") {
    statusLabel = "Completed";
    statusTone = "completed";
  } else if (depStatus === "processing" || status === "refund_processing") {
    statusLabel = "Processing";
    statusTone = "processing";
  } else if (depStatus === "failed") {
    statusLabel = "Failed";
    statusTone = "failed";
  } else if (depStatus === "not_applicable") {
    statusLabel = "Not applicable";
    statusTone = "na";
  }

  const amount = Number(
    depositRefund.amount
      ?? booking.securityDepositPayment?.refundableAmount
      ?? booking.lateReturn?.refundableAmount
      ?? money.depositRefunded
      ?? 0,
  );
  const initiated = depositRefund.scheduledAt || depositRefund.eligibleAt || booking.actualEndAt || null;
  const credited = depositRefund.processedAt || null;
  const expectedLabel =
    statusTone === "completed"
      ? "Credited"
      : depositRefund.eligibleAt
        ? `By ${formatRefundDay(depositRefund.eligibleAt)}`
        : hoursTimelineLabel(hoursHint);

  return {
    kind: "deposit",
    title: "Refund details",
    amount,
    status: statusLabel,
    statusTone,
    initiatedAt: initiated,
    initiatedLabel: formatRefundDay(initiated) || "—",
    expectedLabel,
    creditedAt: credited,
    creditedLabel: formatRefundDay(credited) || "—",
    method: "Wallet",
    breakdown: [],
    note:
      statusTone === "completed" && amount > 0
        ? `${formatInr(amount)} has been added to your wallet.`
        : statusTone === "processing"
          ? `Expected credit ${expectedLabel.toLowerCase()} to your wallet.`
          : amount > 0
            ? `Refundable deposit ${formatInr(amount)} will be credited to your wallet after processing.`
            : null,
    reference: depositRefund.walletReference || "",
  };
}

export const DEPOSIT_STATUS_LABELS = {
  not_required: "Not required",
  pending_online: "Pending online payment",
  pending_collection: "Pay at pickup",
  paid: "Paid",
  refunded: "Refunded",
};

export function depositStatusLabel(status) {
  const key = String(status || "").toLowerCase();
  return DEPOSIT_STATUS_LABELS[key] || (key ? key.replace(/_/g, " ") : "—");
}

export function isDepositPendingCollection(booking) {
  return String(booking?.securityDepositPayment?.depositStatus || "") === "pending_collection";
}

/** Statuses that should surface the home "Active Ride" card. */
export const LIVE_RIDE_STATUSES = [
  "reserved",
  "pickup_completed",
  "rental_started",
  "active",
  "return_requested",
  "inspection",
];

export function isLiveRideStatus(status) {
  return LIVE_RIDE_STATUSES.includes(String(status || "").toLowerCase());
}

/** User-facing labels for the live ride card. */
export const LIVE_RIDE_STATUS_LABELS = {
  reserved: "Pickup Pending",
  pickup_completed: "Active Ride",
  rental_started: "Active Ride",
  active: "Active Ride",
  return_requested: "Return Requested",
  inspection: "Inspection",
  completed: "Completed",
};

export function liveRideStatusLabel(status) {
  const key = String(status || "").toLowerCase();
  return LIVE_RIDE_STATUS_LABELS[key] || bookingStatusLabel(status);
}

/**
 * Progress stages for the active-ride tracker.
 * Index 0..5 — current stage is highlighted; prior stages completed.
 */
export const RIDE_PROGRESS_STAGES = [
  { key: "confirmed", label: "Booking Confirmed" },
  { key: "pickup", label: "Pickup Pending" },
  { key: "active", label: "Active Ride" },
  { key: "return", label: "Return Requested" },
  { key: "inspection", label: "Inspection" },
  { key: "completed", label: "Completed" },
];

export function rideProgressIndex(status) {
  const key = String(status || "").toLowerCase();
  if (key === "reserved") return 1;
  if (["pickup_completed", "rental_started", "active"].includes(key)) return 2;
  if (key === "return_requested") return 3;
  if (key === "inspection") return 4;
  if (["completed", "refund_processing", "deposit_refunded"].includes(key)) return 5;
  return 0;
}

export function formatRideDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Live countdown toward rental end (or pickup if not started).
 * Returns { late, label, ms, target: "pickup"|"return" }.
 */
export function rideCountdown(booking, nowMs = Date.now()) {
  const status = String(booking?.status || "").toLowerCase();
  const startMs = booking?.startAt ? new Date(booking.startAt).getTime() : NaN;
  const endMs = booking?.endAt ? new Date(booking.endAt).getTime() : NaN;

  if (["return_requested", "inspection"].includes(status)) {
    const late = Number.isFinite(endMs) && nowMs > endMs;
    return {
      late,
      label: late ? "Late return — settlement pending" : "Return in progress",
      ms: late && Number.isFinite(endMs) ? nowMs - endMs : 0,
      target: "return",
      phase: "settling",
    };
  }

  if (status === "reserved" && Number.isFinite(startMs) && nowMs < startMs) {
    return {
      late: false,
      label: formatDurationLabel(startMs - nowMs),
      ms: startMs - nowMs,
      target: "pickup",
      phase: "until_pickup",
    };
  }

  if (Number.isFinite(endMs)) {
    const remaining = endMs - nowMs;
    if (remaining <= 0) {
      return {
        late: true,
        label: "Late Return",
        ms: Math.abs(remaining),
        overdueLabel: formatDurationLabel(Math.abs(remaining)),
        target: "return",
        phase: "overdue",
      };
    }
    return {
      late: false,
      label: formatDurationLabel(remaining),
      ms: remaining,
      target: "return",
      phase: "remaining",
    };
  }

  return {
    late: false,
    label: "—",
    ms: 0,
    target: "return",
    phase: "unknown",
  };
}

export function formatDurationLabel(ms) {
  const totalSec = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) return `${hours}h ${String(mins).padStart(2, "0")}m`;
  if (mins > 0) return `${mins}m ${String(secs).padStart(2, "0")}s`;
  return `${secs}s`;
}

/**
 * Prefer an on-trip booking, else soonest upcoming reserved pickup.
 */
export function pickPrimaryLiveBooking(records = []) {
  const live = (records || []).filter((row) => isLiveRideStatus(row?.status));
  if (!live.length) return null;

  const onTrip = live.find((row) =>
    ["active", "rental_started", "pickup_completed"].includes(
      String(row.status || "").toLowerCase(),
    ),
  );
  if (onTrip) return onTrip;

  const returning = live.find((row) =>
    ["return_requested", "inspection"].includes(String(row.status || "").toLowerCase()),
  );
  if (returning) return returning;

  return [...live].sort((a, b) => {
    const aStart = new Date(a.startAt || 0).getTime();
    const bStart = new Date(b.startAt || 0).getTime();
    return aStart - bStart;
  })[0];
}

