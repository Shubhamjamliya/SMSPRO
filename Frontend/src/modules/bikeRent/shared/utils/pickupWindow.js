/**
 * Derives the pickup-window lifecycle state for a booking — shared by the User, Vendor, and
 * Admin surfaces so the badge/countdown reads identically everywhere. Pure/stateless: callers
 * own the ticking (re-render on an interval) and just pass a fresh `now`.
 */

const RIDE_STARTED_STATUSES = [
  "pickup_completed",
  "rental_started",
  "active",
  "return_requested",
  "inspection",
  "completed",
  "refund_processing",
  "deposit_refunded",
];

export function getPickupWindowInfo(booking = {}, now = Date.now()) {
  const status = booking?.status;
  const startAt = booking?.startAt ? new Date(booking.startAt).getTime() : null;
  const windowEndsAt = booking?.pickupWindowEndsAt
    ? new Date(booking.pickupWindowEndsAt).getTime()
    : null;
  const overridden = Boolean(booking?.noShow?.overridden);

  if (status === "no_show") {
    return { key: "no_show", label: "No-Show", tone: "red", deadline: null, overridden };
  }
  if (RIDE_STARTED_STATUSES.includes(status)) {
    return { key: "ride_started", label: "Ride Started", tone: "emerald", deadline: null, overridden };
  }
  if (status !== "reserved") {
    return { key: null, label: "", tone: "gray", deadline: null, overridden: false };
  }
  if (startAt != null && now < startAt) {
    return { key: "waiting", label: "Waiting for Pickup", tone: "blue", deadline: startAt, overridden };
  }
  if (windowEndsAt != null && now > windowEndsAt) {
    return { key: "window_expiring", label: "Pickup Window Expiring", tone: "red", deadline: windowEndsAt, overridden };
  }
  return { key: "window_active", label: "Pickup Window Active", tone: "amber", deadline: windowEndsAt, overridden };
}

/** "in 12m 04s" / "3m 10s ago" style label for a countdown target. */
export function formatCountdown(deadlineMs, nowMs = Date.now()) {
  if (deadlineMs == null) return "";
  const diff = deadlineMs - nowMs;
  const isPast = diff < 0;
  const abs = Math.abs(diff);
  const totalSeconds = Math.floor(abs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  let label;
  if (hours > 0) label = `${hours}h ${minutes}m`;
  else if (minutes > 0) label = `${minutes}m ${seconds}s`;
  else label = `${seconds}s`;
  return isPast ? `${label} ago` : `in ${label}`;
}
