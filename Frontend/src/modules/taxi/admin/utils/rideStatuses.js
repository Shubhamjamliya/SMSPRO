/** Shared taxi ride status labels for admin UI (not mock data). */
export const RIDE_STATUSES = {
  pending: { label: "Pending", tone: "warning" },
  requested: { label: "Requested", tone: "warning" },
  searching: { label: "Searching", tone: "warning" },
  assigned: { label: "Assigned", tone: "info" },
  accepted: { label: "Accepted", tone: "info" },
  arriving: { label: "Driver Arriving", tone: "info" },
  arrived: { label: "Arrived", tone: "info" },
  in_progress: { label: "In Progress", tone: "primary" },
  awaiting_payment: { label: "Awaiting Payment", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
  cancelled_by_rider: { label: "Cancelled by rider", tone: "danger" },
  cancelled_by_driver: { label: "Cancelled by driver", tone: "danger" },
  cancelled_by_system: { label: "Cancelled by system", tone: "danger" },
  no_show: { label: "No show", tone: "danger" },
};

export function rideStatusMeta(status) {
  return RIDE_STATUSES[status] || { label: status || "Unknown", tone: "default" };
}
