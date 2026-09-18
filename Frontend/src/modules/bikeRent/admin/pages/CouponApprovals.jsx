import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  History,
  IndianRupee,
  Loader2,
  Percent,
  RefreshCw,
  Search,
  Tag,
  Ticket,
  User,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import bikeRentAdminApi from "../services/adminApi";

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDay = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const formatInr = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const discountLabel = (coupon) =>
  coupon?.discountType === "fixed"
    ? `${formatInr(coupon.discountValue)} off`
    : `${Number(coupon?.discountValue || 0)}% off`;

const APPLICABLE_LABELS = { rental: "Rental fee", deposit: "Security deposit", both: "Rental + deposit" };

const STATUS_STYLES = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
};
const statusBadgeClass = (status) => STATUS_STYLES[status] || "bg-gray-100 text-gray-600";

const STATUS_TABS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

/* ---------------- Resubmission diff ---------------- */

const CHANGE_TEXT_FIELDS = {
  code: "Coupon code",
  name: "Name",
  description: "Description",
  discountType: "Discount type",
  discountValue: "Discount value",
  applicableOn: "Applies to",
  minimumAmount: "Minimum booking amount",
  maximumDiscount: "Maximum discount cap",
  usageLimit: "Total usage limit",
  perUserLimit: "Per-customer limit",
  validFrom: "Valid from",
  validTill: "Valid till",
};

const DATE_FIELDS = new Set(["validFrom", "validTill"]);
const MONEY_FIELDS = new Set(["minimumAmount", "maximumDiscount"]);

const formatFieldValue = (path, value) => {
  if (DATE_FIELDS.has(path)) return formatDay(value);
  if (path === "discountValue") return value === "" || value == null ? "—" : String(value);
  if (path === "applicableOn") return APPLICABLE_LABELS[value] || value || "—";
  if (MONEY_FIELDS.has(path)) return formatInr(value);
  return value === "" || value == null ? "—" : String(value);
};

const getPath = (obj, path) => (obj ? obj[path] : undefined);

const buildCouponChanges = (previous, current) => {
  if (!previous) return null;
  const textChanges = Object.entries(CHANGE_TEXT_FIELDS)
    .map(([path, label]) => ({
      path,
      label,
      before: getPath(previous, path),
      after: getPath(current, path),
    }))
    .filter((c) => {
      if (DATE_FIELDS.has(c.path)) {
        return formatDay(c.before) !== formatDay(c.after);
      }
      return String(c.before ?? "") !== String(c.after ?? "");
    });
  return { textChanges };
};

/* ---------------- Small presentational pieces ---------------- */

function SectionLabel({ children }) {
  return (
    <p className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-wide text-gray-400 first:mt-0">
      {children}
    </p>
  );
}

function Info({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {label}
      </div>
      <p className="text-sm font-semibold text-gray-800 wrap-break-word">{value || "—"}</p>
    </div>
  );
}

function CouponChangesPanel({ previous, current }) {
  const changes = useMemo(() => buildCouponChanges(previous, current), [previous, current]);
  if (!changes) return null;
  const { textChanges } = changes;

  return (
    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <p className="mb-3 flex items-center gap-1.5 text-sm font-bold text-amber-800">
        <History className="h-4 w-4" />
        Changes since last rejection
      </p>
      {textChanges.length === 0 ? (
        <p className="text-sm text-amber-700">Resubmitted without changing any details.</p>
      ) : (
        <div className="space-y-3">
          {textChanges.map((c) => (
            <div key={c.path} className="text-sm">
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">{c.label}</p>
              <p className="mt-0.5">
                <span className="text-red-600 line-through">{formatFieldValue(c.path, c.before)}</span>
                <span className="mx-1.5 text-gray-400">→</span>
                <span className="font-semibold text-emerald-700">{formatFieldValue(c.path, c.after)}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Main page ---------------- */

export default function CouponApprovals() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ pages: 1, total: 0 });

  const [processingId, setProcessingId] = useState(null);
  const [rejecting, setRejecting] = useState(null); // { id, code }
  const [reason, setReason] = useState("");
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  const [selected, setSelected] = useState(null); // row-level summary
  const [detail, setDetail] = useState(null); // full fetched coupon
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await bikeRentAdminApi.getPendingCoupons({
        status: statusFilter,
        search,
        page,
        limit: 20,
      });
      setRecords(data?.records || []);
      setMeta({ pages: data?.pages || 1, total: data?.total || 0 });
    } catch (err) {
      const message = err?.response?.data?.message || "Failed to load coupons";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  // Debounce the raw input into the actual search term used for fetching.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Jump back to page 1 whenever the filters change (no-op, no extra fetch, if already on page 1).
  useEffect(() => {
    setPage(1);
  }, [statusFilter, search]);

  // Single source of truth for fetching — fires once filters/page have settled.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, search]);

  const openView = async (item) => {
    setSelected(item);
    setDetail(null);
    setDetailLoading(true);
    try {
      const full = await bikeRentAdminApi.getCouponById(item.id);
      setDetail(full);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not load coupon details");
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeView = () => {
    setSelected(null);
    setDetail(null);
  };

  const approve = async (coupon) => {
    setProcessingId(coupon.id);
    try {
      await bikeRentAdminApi.approveCoupon(coupon.id);
      toast.success("Coupon approved");
      if (detail?.id === coupon.id) closeView();
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Approve failed");
    } finally {
      setProcessingId(null);
    }
  };

  const openReject = (coupon) => {
    setRejecting({ id: coupon.id, code: coupon.code });
    setReason("");
  };

  const submitReject = async () => {
    if (!reason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }
    setRejectSubmitting(true);
    try {
      await bikeRentAdminApi.rejectCoupon(rejecting.id, reason.trim());
      toast.success("Coupon rejected");
      const wasDetail = detail?.id === rejecting.id;
      setRejecting(null);
      setReason("");
      if (wasDetail) closeView();
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Reject failed");
    } finally {
      setRejectSubmitting(false);
    }
  };

  const isResubmitted = (item) => item.approvalStatus === "pending" && Boolean(item.rejectedSnapshot);

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Coupon approvals</h1>
          <p className="mt-1 text-sm text-gray-500">
            Vendor-created coupons need approval before they become redeemable. The discount cost is
            billed to that vendor&apos;s own wallet.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-gray-200 bg-white p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatusFilter(tab.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                statusFilter === tab.value ? "bg-[#FF6A00] text-white" : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search code or name…"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#FF6A00]"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-white py-16 text-gray-400 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading…
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white py-16 text-center shadow-sm">
          <AlertCircle className="h-6 w-6 text-red-400" />
          <p className="text-sm text-gray-500">{loadError}</p>
          <button
            type="button"
            onClick={() => load()}
            className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50"
          >
            Retry
          </button>
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center text-sm text-gray-400 shadow-sm">
          No coupons found for this filter
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm sm:block">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Coupon</th>
                    <th className="px-4 py-3">Vendor</th>
                    <th className="px-4 py-3">Discount</th>
                    <th className="px-4 py-3">Valid</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((item) => (
                    <tr key={item.id} className="border-t border-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Tag className="h-4 w-4 text-[#FF6A00]" />
                          <div>
                            <span className="font-bold text-gray-900">{item.code}</span>
                            <p className="text-xs text-gray-400">{item.name}</p>
                          </div>
                        </div>
                        {isResubmitted(item) && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">
                            <History className="h-3 w-3" />
                            Resubmitted
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {item.vendor?.businessName || "—"}
                        <p className="text-xs text-gray-400">{item.vendor?.vendorCode || ""}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{discountLabel(item)}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {formatDay(item.validFrom)} – {formatDay(item.validTill)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase ${statusBadgeClass(item.approvalStatus)}`}>
                          {item.approvalStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openView(item)}
                            className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
                            title="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {item.approvalStatus === "pending" && (
                            <>
                              <button
                                type="button"
                                disabled={processingId === item.id}
                                onClick={() => approve(item)}
                                className="rounded-lg bg-emerald-50 p-2 text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                                title="Approve"
                              >
                                {processingId === item.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={processingId === item.id}
                                onClick={() => openReject(item)}
                                className="rounded-lg bg-red-50 p-2 text-red-600 hover:bg-red-100 disabled:opacity-60"
                                title="Reject"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 sm:hidden">
            {records.map((item) => (
              <div key={item.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#FF6A00]">
                    <Tag className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-bold text-gray-900">{item.code}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClass(item.approvalStatus)}`}>
                        {item.approvalStatus}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">{item.name}</p>
                    <p className="mt-1 text-xs font-semibold text-gray-700">
                      {discountLabel(item)} · {formatDay(item.validFrom)} – {formatDay(item.validTill)}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {item.vendor?.businessName || "—"} {item.vendor?.vendorCode ? `· ${item.vendor.vendorCode}` : ""}
                    </p>
                    {isResubmitted(item) && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">
                        <History className="h-3 w-3" />
                        Resubmitted
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-gray-50 pt-3">
                  <button
                    type="button"
                    onClick={() => openView(item)}
                    className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-bold text-gray-600 hover:bg-gray-50"
                  >
                    View
                  </button>
                  {item.approvalStatus === "pending" && (
                    <>
                      <button
                        type="button"
                        disabled={processingId === item.id}
                        onClick={() => approve(item)}
                        className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 disabled:opacity-60"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={processingId === item.id}
                        onClick={() => openReject(item)}
                        className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-600 disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {meta.pages > 1 && (
            <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs text-gray-500">
                Page {page} of {meta.pages} · {meta.total} total
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-gray-200 p-1.5 text-gray-600 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={page >= meta.pages}
                  onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}
                  className="rounded-lg border border-gray-200 p-1.5 text-gray-600 disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ---------------- Detail / View modal ---------------- */}
      {selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
            {detailLoading || !detail ? (
              <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading coupon details…
              </div>
            ) : (
              <>
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-gray-100 bg-orange-50 text-[#FF6A00]">
                      <Ticket className="h-6 w-6" />
                    </span>
                    <div>
                      <h2 className="text-lg font-black text-gray-900">{detail.code}</h2>
                      <p className="text-sm text-gray-500">{detail.name}</p>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${statusBadgeClass(detail.approvalStatus)}`}>
                          {detail.approvalStatus}
                        </span>
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${
                            detail.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {detail.displayStatus || detail.status}
                        </span>
                        {isResubmitted(detail) ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold uppercase text-blue-700">
                            <History className="h-3 w-3" />
                            Resubmitted
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeView}
                    className="rounded-xl bg-gray-100 p-2 text-gray-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {detail.approvalStatus === "rejected" && detail.rejectionReason ? (
                  <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                    Rejection reason: {detail.rejectionReason}
                  </div>
                ) : detail.approvalStatus === "pending" && detail.rejectedSnapshot?.rejectionReason ? (
                  <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                    Previously rejected for: {detail.rejectedSnapshot.rejectionReason}
                  </div>
                ) : null}

                {detail.approvalStatus === "pending" && detail.rejectedSnapshot ? (
                  <CouponChangesPanel previous={detail.rejectedSnapshot} current={detail} />
                ) : null}

                {detail.description ? (
                  <>
                    <SectionLabel>Description</SectionLabel>
                    <p className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3 text-sm text-gray-700">
                      {detail.description}
                    </p>
                  </>
                ) : null}

                <SectionLabel>Vendor</SectionLabel>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Info icon={Building2} label="Business" value={detail.vendor?.businessName} />
                  <Info icon={User} label="Owner" value={detail.vendor?.ownerName} />
                </div>

                <SectionLabel>Discount configuration</SectionLabel>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Info icon={Percent} label="Discount type" value={detail.discountType === "fixed" ? "Fixed amount" : "Percentage"} />
                  <Info
                    icon={IndianRupee}
                    label="Discount value"
                    value={detail.discountType === "fixed" ? formatInr(detail.discountValue) : `${detail.discountValue}%`}
                  />
                  <Info label="Applies to" value={APPLICABLE_LABELS[detail.applicableOn] || detail.applicableOn} />
                  <Info icon={IndianRupee} label="Minimum booking amount" value={formatInr(detail.minimumAmount)} />
                  <Info icon={IndianRupee} label="Maximum discount cap" value={detail.maximumDiscount ? formatInr(detail.maximumDiscount) : "No cap"} />
                  <Info icon={IndianRupee} label="Total discount given so far" value={formatInr(detail.totalDiscountGiven)} />
                </div>

                <SectionLabel>Usage limits</SectionLabel>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Info icon={Users} label="Total usage limit" value={detail.usageLimit ? detail.usageLimit : "Unlimited"} />
                  <Info icon={Users} label="Per-customer limit" value={detail.perUserLimit ? detail.perUserLimit : "Unlimited"} />
                  <Info label="Used so far" value={detail.usedCount} />
                  <Info label="Remaining uses" value={detail.remainingUses == null ? "Unlimited" : detail.remainingUses} />
                </div>

                <SectionLabel>Validity</SectionLabel>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Info icon={Calendar} label="Valid from" value={formatDay(detail.validFrom)} />
                  <Info icon={Calendar} label="Valid till" value={formatDay(detail.validTill)} />
                </div>

                <SectionLabel>Timeline</SectionLabel>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Info icon={Calendar} label="Submitted" value={formatDate(detail.createdAt)} />
                  <Info icon={Calendar} label="Last updated" value={formatDate(detail.updatedAt)} />
                </div>

                {detail.approvalHistory?.length > 0 ? (
                  <>
                    <SectionLabel>Approval history</SectionLabel>
                    <ol className="space-y-1.5 border-l border-gray-100 pl-3">
                      {detail.approvalHistory.map((h, i) => (
                        <li key={i} className="text-xs text-gray-500">
                          <span className="font-bold capitalize text-gray-700">{h.status}</span>
                          {h.changedByName ? ` · ${h.changedByName}` : ""}
                          {h.changedAt ? ` · ${formatDate(h.changedAt)}` : ""}
                          {h.reason ? ` — ${h.reason}` : ""}
                        </li>
                      ))}
                    </ol>
                  </>
                ) : null}

                {detail.approvalStatus === "pending" ? (
                  <div className="mt-5 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                    <button
                      type="button"
                      disabled={processingId === detail.id}
                      onClick={() => approve(detail)}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                    >
                      {processingId === detail.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={processingId === detail.id}
                      onClick={() => openReject(detail)}
                      className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                    >
                      <X className="h-4 w-4" />
                      Reject
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* ---------------- Reject reason modal ---------------- */}
      {rejecting ? (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <h2 className="mb-1 text-lg font-black text-gray-900">Reject &quot;{rejecting.code}&quot;</h2>
            <p className="mb-3 text-xs text-gray-500">
              This reason will be shown to the vendor so they can fix the issue and resubmit.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Rejection reason (required)"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#FF6A00]"
            />
            {!reason.trim() ? (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-red-500">
                <AlertCircle className="h-3 w-3" />
                A reason is required to reject a coupon
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejecting(null)}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rejectSubmitting || !reason.trim()}
                onClick={submitReject}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {rejectSubmitting ? "Rejecting…" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
