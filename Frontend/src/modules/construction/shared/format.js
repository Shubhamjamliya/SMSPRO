/** Shared formatting for the construction module — one source for money and dates. */

/** Indian short form: ₹32.7 L, ₹1.2 Cr. Used wherever space is tight. */
export const shortMoney = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(n % 10000000 ? 2 : 0)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(n % 100000 ? 2 : 0)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
};

/** Full precision, for anything that forms part of an agreement. */
export const fullMoney = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
};

export const budgetRange = ({ min, max } = {}) => {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${shortMoney(min)} – ${shortMoney(max)}`;
  if (min != null) return `From ${shortMoney(min)}`;
  return `Up to ${shortMoney(max)}`;
};

export const shortDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

export const dateTime = (d) =>
  d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";

/** "in 3 days" / "2 days ago" — used on lead expiry and quote validity. */
export const relativeDays = (d) => {
  if (!d) return "";
  const diff = Math.round((new Date(d).getTime() - Date.now()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return diff > 0 ? `in ${diff} days` : `${Math.abs(diff)} days ago`;
};

export const hoursLeft = (d) => {
  if (!d) return null;
  const ms = new Date(d).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 3600000);
};

export const ENQUIRY_STATUS_LABEL = {
  submitted: "Submitted",
  matching: "Finding contractors",
  visit_scheduled: "Site visit booked",
  visit_completed: "Site visited",
  quoted: "Quotes received",
  negotiating: "In discussion",
  accepted: "Quote accepted",
  converted: "Project started",
  closed_lost: "Closed",
  expired: "Expired",
};

export const ENQUIRY_STATUS_TONE = {
  submitted: "bg-blue-50 text-blue-700",
  matching: "bg-blue-50 text-blue-700",
  visit_scheduled: "bg-amber-50 text-amber-700",
  visit_completed: "bg-amber-50 text-amber-700",
  quoted: "bg-emerald-50 text-emerald-700",
  negotiating: "bg-amber-50 text-amber-700",
  accepted: "bg-emerald-50 text-emerald-700",
  converted: "bg-emerald-50 text-emerald-700",
  closed_lost: "bg-gray-100 text-gray-600",
  expired: "bg-gray-100 text-gray-600",
};

export const QUOTE_STATUS_LABEL = {
  draft: "Draft",
  sent: "Sent",
  under_review: "Being reviewed",
  revision_requested: "Revision requested",
  superseded: "Superseded",
  accepted: "Accepted",
  rejected: "Rejected",
  expired: "Expired",
  withdrawn: "Withdrawn",
};

export const UNIT_LABEL = {
  sqft: "sq ft", sqm: "sq m", rft: "rft", rmt: "rmt",
  cuft: "cu ft", cum: "cu m", nos: "nos", lumpsum: "lump sum", day: "day",
};

// ---------- Projects and stages (Phase 5) ----------

export const PROJECT_STATUS_LABEL = {
  awaiting_funding: "Waiting for payment",
  active: "In progress",
  on_hold: "On hold",
  handover_pending: "Ready for handover",
  completed: "Completed",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const PROJECT_STATUS_TONE = {
  awaiting_funding: "bg-amber-50 text-amber-700 ring-amber-200",
  active: "bg-blue-50 text-blue-700 ring-blue-200",
  on_hold: "bg-orange-50 text-orange-700 ring-orange-200",
  handover_pending: "bg-violet-50 text-violet-700 ring-violet-200",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  closed: "bg-gray-100 text-gray-600 ring-gray-200",
  cancelled: "bg-rose-50 text-rose-700 ring-rose-200",
};

export const STAGE_STATUS_LABEL = {
  pending: "Not started",
  in_progress: "Under way",
  submitted_for_approval: "Waiting for your approval",
  approved: "Approved",
  payment_released: "Paid",
  rejected: "Sent back",
  skipped: "Skipped",
};

/** What the contractor sees for the same stage — the wording differs by side. */
export const STAGE_STATUS_LABEL_CONTRACTOR = {
  ...STAGE_STATUS_LABEL,
  submitted_for_approval: "Awaiting customer approval",
  rejected: "Changes requested",
};

export const STAGE_STATUS_TONE = {
  pending: "bg-gray-100 text-gray-600 ring-gray-200",
  in_progress: "bg-blue-50 text-blue-700 ring-blue-200",
  submitted_for_approval: "bg-amber-50 text-amber-700 ring-amber-200",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  payment_released: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  skipped: "bg-gray-100 text-gray-500 ring-gray-200",
};

/**
 * Money has three states in this module and customers confuse them constantly,
 * so the labels spell out where the money actually IS rather than naming the
 * accounting bucket.
 */
export const MONEY_LABEL = {
  funded: "You have paid in",
  held: "Held safely",
  released: "Paid to contractor",
  retention: "Held back until the defect period ends",
  pending: "Still to pay in",
};

/** One short line saying where a booked site visit is — text plus a badge tone. */
export const siteVisitStatus = (r) => {
  if (r.payment?.status === "pending") return { text: "Payment pending", tone: "bg-amber-50 text-amber-700" };
  if (r.payment?.status === "refunded") return { text: "Refunded", tone: "bg-slate-100 text-slate-600" };
  if (r.contract?.status === "sent") return { text: "Contract ready", tone: "bg-amber-50 text-amber-700" };
  if (r.contract?.status === "accepted") return { text: "Contract accepted", tone: "bg-emerald-50 text-emerald-700" };
  if (r.contract?.status === "rejected") return { text: "Contract declined", tone: "bg-slate-100 text-slate-600" };
  switch (r.visit?.stage) {
    case "on_the_way": return { text: "Contractor on the way", tone: "bg-blue-50 text-blue-700" };
    case "arrived": return { text: "Visit in progress", tone: "bg-blue-50 text-blue-700" };
    case "report_submitted": return { text: "Visit complete", tone: "bg-emerald-50 text-emerald-700" };
    case "assigned": return { text: "Contractor assigned", tone: "bg-emerald-50 text-emerald-700" };
    default: return { text: "Finding a contractor", tone: "bg-amber-50 text-amber-700" };
  }
};
