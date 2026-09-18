import { useState, useMemo, useEffect } from "react";
import {
  Search, Eye, Check, X, ArrowUpDown, Loader2,
  Clock, Store, ShieldAlert, BadgeCheck, FileText, CheckCircle2, XCircle, Truck, RotateCcw
} from "lucide-react";
import { adminAPI } from "@food/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@food/components/ui/dialog";
import RefreshButton from "@/shared/components/ui/RefreshButton";

const statusBadgeClass = (status) => {
  const value = String(status || "Pending").toLowerCase()
  if (value === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (value === "rejected") return "bg-rose-50 text-rose-700 border-rose-200"
  return "bg-amber-50 text-amber-700 border-amber-200"
}

const normalizeStatus = (status) => {
  const value = String(status || "pending").toLowerCase();
  if (value === "approved") return "Approved";
  if (value === "rejected") return "Rejected";
  return "Pending";
};

const formatDate = (value, withTime = false) => {
  if (!value) return "—";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString("en-GB", withTime
      ? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
      : { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return String(value);
  }
};

const formatDiscount = (request) => {
  if (!request) return "—";
  return request.discountType === "percentage"
    ? `${request.discountValue}% OFF`
    : `₹${request.discountValue} FLAT OFF`;
};

const formatMoney = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  return `₹${Number(value) || 0}`;
};

const formatBoolean = (value) => (value ? "Yes" : "No");

const formatUsage = (request) => {
  const used = Number(request?.usedCount || 0);
  const limit = request?.usageLimit;
  return limit ? `${used} / ${limit}` : `${used} / Unlimited`;
};

const formatPerformer = (performer) => {
  if (!performer) return "—";
  const name = performer.name || performer.roleName || performer.role || "Admin";
  const contact = performer.email || performer.phone || "";
  return contact ? `${name} (${contact})` : name;
};

const formatHistoryAction = (action) => {
  const value = String(action || "").toLowerCase();
  if (value === "approved") return "Approved";
  if (value === "rejected") return "Rejected";
  if (value === "reverted_to_pending") return "Reverted to Pending";
  if (value === "submitted") return "Submitted";
  return action || "Updated";
};

const DetailField = ({ label, value, className = "" }) => (
  <div className={className}>
    <p className="text-xs text-slate-400 font-medium">{label}</p>
    <div className="text-sm font-semibold text-slate-800 mt-1 break-words">{value ?? "—"}</div>
  </div>
);

const DiffField = ({ label, current, previous, formatter = (v) => v }) => {
  const currentValue = formatter(current);
  const previousValue = formatter(previous);
  const changed = previous !== undefined && previous !== null && String(previousValue) !== String(currentValue);

  if (!changed) {
    return <DetailField label={label} value={currentValue} />;
  }

  return (
    <div>
      <p className="text-xs text-slate-400 font-medium">{label}</p>
      <div className="flex flex-col gap-1 mt-1">
        <span className="text-xs line-through text-slate-400 bg-slate-50 px-2 py-0.5 rounded w-fit border border-slate-200">
          OLD: {previousValue || "—"}
        </span>
        <span className="text-sm font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded w-fit border border-emerald-200">
          NEW: {currentValue || "—"}
        </span>
      </div>
    </div>
  );
};

const NameChipList = ({ items, emptyLabel = "Entire restaurant" }) => {
  if (!Array.isArray(items) || items.length === 0) {
    return <span className="text-sm text-slate-600">{emptyLabel}</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {items.map((item) => (
        <span
          key={item.id || item._id || item.name}
          className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700"
        >
          {item.name || "Unknown"}
        </span>
      ))}
    </div>
  );
};

export default function CouponsRequest() {
  const [searchQuery, setSearchQuery] = useState("");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailsModalMode, setDetailsModalMode] = useState("view");
  const [rejectReason, setRejectReason] = useState("");

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortConfig, setSortConfig] = useState({ key: "createdAt", direction: "desc" });

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getRestaurantCoupons();
      const list = response?.data?.data || response?.data || [];
      const restaurantOnly = (Array.isArray(list) ? list : [])
        .filter((r) => r.type !== "seller")
        .map((r) => ({ ...r, status: normalizeStatus(r.status || r.approvalStatus) }));
      setRequests(restaurantOnly);
    } catch (error) {
      console.error("Error loading coupon requests:", error);
      toast.error("Failed to load restaurant coupon requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const processedRequests = useMemo(() => {
    let result = [...requests];

    if (statusFilter !== "ALL") {
      result = result.filter((r) => normalizeStatus(r.status).toUpperCase() === statusFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((r) => {
        const restName = r.restaurantName?.toLowerCase() || "";
        const couponName = r.couponName?.toLowerCase() || "";
        const code = r.couponCode?.toLowerCase() || "";
        const desc = r.description?.toLowerCase() || "";
        const terms = r.termsAndConditions?.toLowerCase() || "";
        return restName.includes(query) || couponName.includes(query) || code.includes(query) || desc.includes(query) || terms.includes(query);
      });
    }

    if (sortConfig.key) {
      result.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];

        if (sortConfig.key === "createdAt" || sortConfig.key === "startDate" || sortConfig.key === "endDate") {
          aVal = new Date(aVal || 0).getTime();
          bVal = new Date(bVal || 0).getTime();
        }

        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [requests, statusFilter, searchQuery, sortConfig]);

  const openDetailsModal = (request, mode = "view") => {
    setSelectedRequest(request);
    setDetailsModalMode(mode);
    setRejectReason("");
    setShowDetailsModal(true);
  };

  const closeDetailsModal = () => {
    setShowDetailsModal(false);
    setDetailsModalMode("view");
    setRejectReason("");
    setSelectedRequest(null);
  };

  const handleUpdateStatus = async (requestId, newStatus, reason = "") => {
    try {
      setProcessingId(requestId);
      const response = await adminAPI.updateRestaurantCouponStatus(requestId, newStatus, reason);

      if (response?.data?.success || response?.success) {
        toast.success(
          newStatus === "Rejected"
            ? "Coupon rejected. Restaurant will see your feedback."
            : `Coupon request successfully ${newStatus.toLowerCase()}!`
        );
        closeDetailsModal();
        await fetchData();
      } else {
        toast.error(response?.data?.message || "Failed to update request status.");
      }
    } catch (error) {
      console.error("Error updating coupon request status:", error);
      toast.error(error?.response?.data?.message || "Failed to update coupon request status.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleRevert = async (requestId) => {
    try {
      setProcessingId(requestId);
      const response = await adminAPI.revertRestaurantCoupon(requestId);

      if (response?.data?.success || response?.success) {
        toast.success("Coupon reverted to pending. You can review it again.");
        closeDetailsModal();
        await fetchData();
      } else {
        toast.error(response?.data?.message || "Failed to revert coupon request.");
      }
    } catch (error) {
      console.error("Error reverting coupon request:", error);
      toast.error(error?.response?.data?.message || "Failed to revert coupon request.");
    } finally {
      setProcessingId(null);
    }
  };

  const renderDetailsModalContent = () => {
    if (!selectedRequest) return null;

    if (detailsModalMode === "revert") {
      const requestId = selectedRequest._id || selectedRequest.id;
      return (
        <div className="space-y-5 font-sans">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-bold text-amber-900">Revert rejected coupon to pending?</p>
            <p className="mt-1 text-sm text-amber-800 leading-relaxed">
              This will move the coupon back to the <strong>Pending</strong> queue without requiring the restaurant to recreate or resubmit it.
              You can then approve or reject it again.
            </p>
          </div>
          {selectedRequest.rejectionReason ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Current rejection reason</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedRequest.rejectionReason}</p>
            </div>
          ) : null}
          <div className="flex items-center gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={() => setDetailsModalMode("view")}
              className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleRevert(requestId)}
              disabled={processingId !== null}
              className="px-4 py-2 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {processingId === requestId ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              Confirm revert
            </button>
          </div>
        </div>
      );
    }

    if (detailsModalMode === "reject") {
      const requestId = selectedRequest._id || selectedRequest.id;
      return (
        <div className="space-y-5 font-sans">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-bold text-rose-800">Reject coupon request</p>
            <p className="mt-1 text-sm text-rose-700">
              This message will be shown to the restaurant so they can fix and resubmit the coupon.
            </p>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              Rejection reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain what needs to be fixed..."
              className="w-full p-3 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500 min-h-[140px]"
              autoFocus
            />
          </div>
          <div className="flex items-center gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={() => setDetailsModalMode("view")}
              className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                if (!rejectReason.trim()) {
                  toast.error("Please provide a rejection reason.");
                  return;
                }
                handleUpdateStatus(requestId, "Rejected", rejectReason.trim());
              }}
              disabled={processingId !== null}
              className="px-4 py-2 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-all disabled:opacity-50"
            >
              {processingId === requestId ? <Loader2 className="w-4 h-4 animate-spin inline" /> : null}
              Confirm rejection
            </button>
          </div>
        </div>
      );
    }

    const previous = selectedRequest.previousApproved;
    const hasDiff = normalizeStatus(selectedRequest.status) === "Pending" && Boolean(previous);
    const categoryDetails = selectedRequest.applicableCategoryDetails || [];
    const itemDetails = selectedRequest.applicableItemDetails || [];
    const previousCategoryDetails = previous?.applicableCategoryDetails || [];
    const previousItemDetails = previous?.applicableItemDetails || [];

    return (
      <div className="space-y-6 font-sans">
        {hasDiff ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-bold text-amber-900">Resubmitted after changes</p>
            <p className="mt-1 text-sm text-amber-800">
              The restaurant updated this coupon. Compare OLD vs NEW values below before approving or rejecting.
            </p>
          </div>
        ) : null}

        <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Restaurant Information</h3>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 text-red-600 flex items-center justify-center border border-red-200">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <p className="text-base font-bold text-slate-800">{selectedRequest.restaurantName || "—"}</p>
              <p className="text-xs text-slate-500 mt-0.5">Restaurant ID: {selectedRequest.restaurantId || "—"}</p>
              <p className="text-xs text-slate-500">Coupon ID: {selectedRequest._id || selectedRequest.id || "—"}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <FileText className="w-5 h-5 text-red-600" />
            <h4 className="text-base font-bold text-slate-800">Coupon Details</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DiffField label="Coupon Name" current={selectedRequest.couponName} previous={previous?.couponName} />
            <DiffField label="Coupon Code" current={selectedRequest.couponCode} previous={previous?.couponCode} />
            <DiffField label="Discount Type" current={selectedRequest.discountType} previous={previous?.discountType} />
            <DiffField label="Discount Value" current={selectedRequest.discountValue} previous={previous?.discountValue} formatter={(v) => v ?? "—"} />
            <DiffField label="Discount Offer" current={selectedRequest} previous={previous} formatter={formatDiscount} />
            <DiffField label="Maximum Discount" current={selectedRequest.maxDiscount} previous={previous?.maxDiscount} formatter={formatMoney} />
            <DiffField label="Minimum Order Amount" current={selectedRequest.minOrderAmount} previous={previous?.minOrderAmount} formatter={formatMoney} />
            <DiffField label="Free Delivery" current={selectedRequest.freeDelivery} previous={previous?.freeDelivery} formatter={formatBoolean} />
            <DiffField label="Start Date" current={selectedRequest.startDate} previous={previous?.startDate} formatter={(v) => formatDate(v)} />
            <DiffField label="End Date" current={selectedRequest.endDate || selectedRequest.expiryDate} previous={previous?.endDate} formatter={(v) => formatDate(v)} />
            <DiffField label="Total Usage Limit" current={selectedRequest.usageLimit} previous={previous?.usageLimit} formatter={(v) => (v ? `${v} uses` : "Unlimited")} />
            <DetailField label="Used Count" value={`${selectedRequest.usedCount || 0}`} />
            <DiffField label="Per User Limit" current={selectedRequest.perUserLimit} previous={previous?.perUserLimit} formatter={(v) => v || 1} />
            <DetailField label="Status" value={normalizeStatus(selectedRequest.status)} />
            <DetailField label="Requested At" value={formatDate(selectedRequest.requestedAt || selectedRequest.createdAt, true)} />
            <DetailField label="Approved At" value={formatDate(selectedRequest.approvedAt, true)} />
            <DetailField label="Rejected At" value={formatDate(selectedRequest.rejectedAt, true)} />
            <DetailField label="Created At" value={formatDate(selectedRequest.createdAt, true)} />
            <DetailField label="Last Updated" value={formatDate(selectedRequest.updatedAt, true)} />
            <DetailField label="Approved By" value={formatPerformer(selectedRequest.approvedBy)} />
            <DetailField label="Rejected By" value={formatPerformer(selectedRequest.rejectedBy)} />
          </div>

          <div className="md:col-span-2">
            <p className="text-xs text-slate-400 font-medium">Description</p>
            {hasDiff && previous?.description !== selectedRequest.description ? (
              <div className="flex flex-col gap-1 mt-1">
                <p className="text-xs line-through text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-200">OLD: {previous?.description || "—"}</p>
                <p className="text-sm text-slate-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">NEW: {selectedRequest.description || "—"}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-700 mt-1 bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap">
                {selectedRequest.description || "—"}
              </p>
            )}
          </div>

          <div className="md:col-span-2">
            <p className="text-xs text-slate-400 font-medium">Terms & Conditions</p>
            {hasDiff && previous?.termsAndConditions !== selectedRequest.termsAndConditions ? (
              <div className="flex flex-col gap-1 mt-1">
                <p className="text-xs line-through text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-200 whitespace-pre-wrap">OLD: {previous?.termsAndConditions || "—"}</p>
                <p className="text-sm text-slate-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200 whitespace-pre-wrap">NEW: {selectedRequest.termsAndConditions || "—"}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-700 mt-1 bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-wrap">
                {selectedRequest.termsAndConditions || "—"}
              </p>
            )}
          </div>

          <div>
            <p className="text-xs text-slate-400 font-medium">Applicable Categories</p>
            {hasDiff && JSON.stringify(previousCategoryDetails) !== JSON.stringify(categoryDetails) ? (
              <div className="space-y-2 mt-1">
                <div>
                  <p className="text-[11px] font-bold text-slate-400 mb-1">OLD</p>
                  <NameChipList items={previousCategoryDetails} />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-emerald-600 mb-1">NEW</p>
                  <NameChipList items={categoryDetails} />
                </div>
              </div>
            ) : (
              <NameChipList items={categoryDetails} />
            )}
          </div>

          <div>
            <p className="text-xs text-slate-400 font-medium">Applicable Items</p>
            {hasDiff && JSON.stringify(previousItemDetails) !== JSON.stringify(itemDetails) ? (
              <div className="space-y-2 mt-1">
                <div>
                  <p className="text-[11px] font-bold text-slate-400 mb-1">OLD</p>
                  <NameChipList items={previousItemDetails} />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-emerald-600 mb-1">NEW</p>
                  <NameChipList items={itemDetails} />
                </div>
              </div>
            ) : (
              <NameChipList items={itemDetails} />
            )}
          </div>

          {selectedRequest.rejectionReason ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-xs font-bold text-rose-700 uppercase tracking-wider mb-1">Rejection Reason</p>
              <p className="text-sm text-rose-900 whitespace-pre-wrap">{selectedRequest.rejectionReason}</p>
            </div>
          ) : null}

          {Array.isArray(selectedRequest.statusHistory) && selectedRequest.statusHistory.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Activity History</p>
              <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                {[...selectedRequest.statusHistory].reverse().map((entry, index) => (
                  <div key={`${entry.changedAt || index}-${entry.action}`} className="border border-slate-100 rounded-lg p-3 bg-slate-50/70">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-bold text-slate-800">{formatHistoryAction(entry.action)}</span>
                      <span className="text-xs text-slate-500">{formatDate(entry.changedAt, true)}</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">By: {formatPerformer(entry.changedBy)}</p>
                    {entry.note ? (
                      <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{entry.note}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-100 pt-5 mt-6 flex flex-col sm:flex-row items-center justify-end gap-3 w-full">
          {normalizeStatus(selectedRequest.status) !== "Pending" ? (
            <>
              <div className="flex-1 flex items-center justify-center p-3 rounded-lg border text-sm font-semibold bg-slate-50 border-slate-100 text-slate-600 w-full">
                {normalizeStatus(selectedRequest.status) === "Approved" ? (
                  <span className="flex items-center gap-1.5 text-emerald-600">
                    <CheckCircle2 className="w-4 h-4" /> This coupon request has been APPROVED
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-rose-600">
                    <XCircle className="w-4 h-4" /> This coupon request has been REJECTED
                  </span>
                )}
              </div>
              {normalizeStatus(selectedRequest.status) === "Rejected" && (
                <button
                  type="button"
                  onClick={() => setDetailsModalMode("revert")}
                  disabled={processingId !== null}
                  className="px-5 py-2.5 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                >
                  <RotateCcw className="w-4 h-4" />
                  Revert to Pending
                </button>
              )}
              {normalizeStatus(selectedRequest.status) === "Approved" && (
                <button
                  type="button"
                  onClick={() => setDetailsModalMode("reject")}
                  disabled={processingId !== null}
                  className="px-5 py-2.5 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                >
                  <X className="w-4 h-4" />
                  Deactivate
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setDetailsModalMode("reject")}
                disabled={processingId !== null}
                className="px-5 py-2.5 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X className="w-4 h-4" />
                Reject
              </button>
              <button
                type="button"
                onClick={() => handleUpdateStatus(selectedRequest._id || selectedRequest.id, "Approved")}
                disabled={processingId !== null}
                className="px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processingId === selectedRequest._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Approve
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 lg:p-6 min-h-screen bg-[#ffffffcc] transition-colors duration-200 font-sans">
      <div className="max-w-[1600px] mx-auto">

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-lg shadow-orange-500/25 border border-red-500">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">Coupons Request</h1>
              <p className="text-sm text-slate-500 font-medium">Verify and approve restaurant requested coupons & promo codes</p>
            </div>
          </div>
          <RefreshButton onClick={fetchData} loading={loading} className="self-start md:self-auto" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Requests", count: requests.length, color: "text-slate-900 bg-slate-50 border-slate-200" },
            { label: "Pending Verification", count: requests.filter((r) => normalizeStatus(r.status) === "Pending").length, color: "text-amber-600 bg-amber-50 border-amber-200/50" },
            { label: "Approved Coupons", count: requests.filter((r) => normalizeStatus(r.status) === "Approved").length, color: "text-emerald-600 bg-emerald-50 border-emerald-200/50" },
            { label: "Rejected Requests", count: requests.filter((r) => normalizeStatus(r.status) === "Rejected").length, color: "text-rose-600 bg-rose-50 border-rose-200/50" },
          ].map((card, idx) => (
            <div key={idx} className={`p-4 rounded-xl border ${card.color} shadow-sm transition-all hover:scale-[1.01]`}>
              <p className="text-xs font-bold uppercase tracking-wider opacity-75">{card.label}</p>
              <p className="text-2xl font-black mt-1">{card.count}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 p-4 mb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search restaurant, coupon name, code, description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 p-1 rounded-lg">
                {["ALL", "PENDING", "APPROVED", "REJECTED"].map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                      statusFilter === status
                        ? "bg-slate-800 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-800"
                    }`}
                  >
                    {status === "ALL" ? "All Status" : status}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200/80 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1400px]">
              <thead className="bg-slate-50 border-b border-slate-200/80">
                <tr>
                  <th className="px-4 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-12">Sl</th>
                  <th className="px-4 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Restaurant</th>
                  <th className="px-4 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Coupon Name</th>
                  <th className="px-4 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Code</th>
                  <th className="px-4 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Discount</th>
                  <th className="px-4 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Max Discount</th>
                  <th className="px-4 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Min Order</th>
                  <th className="px-4 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Free Delivery</th>
                  <th className="px-4 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Validity</th>
                  <th className="px-4 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Usage</th>
                  <th className="px-4 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Per User</th>
                  <th
                    className="px-4 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleSort("createdAt")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Submitted</span>
                      <ArrowUpDown className={`w-3 h-3 ${sortConfig.key === "createdAt" ? "text-red-600" : "text-slate-400"}`} />
                    </div>
                  </th>
                  <th className="px-4 py-4 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-4 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider w-28">Actions</th>
                </tr>
              </thead>

              <tbody className="bg-white divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={14} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-red-600 mb-3" />
                        <p className="text-base font-semibold text-slate-700">Loading requests...</p>
                      </div>
                    </td>
                  </tr>
                ) : processedRequests.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                          <FileText className="w-6 h-6" />
                        </div>
                        <p className="text-base font-bold text-slate-800 mb-1">No requests found</p>
                        <p className="text-xs text-slate-500">There are no coupon requests matching your search or filters at the moment.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  processedRequests.map((request, index) => {
                    const reqId = request._id || request.id;
                    const status = normalizeStatus(request.status);

                    return (
                      <tr key={reqId} className="hover:bg-slate-50/50 transition-colors align-top">
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="text-sm font-semibold text-slate-500">{index + 1}</span>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm font-bold text-slate-900">{request.restaurantName || "—"}</p>
                          <p className="text-xs text-slate-400 mt-0.5">ID: {request.restaurantId || "—"}</p>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm font-semibold text-slate-800">{request.couponName || "—"}</p>
                          {request.description ? (
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{request.description}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="text-sm font-extrabold text-slate-900 tracking-wider bg-slate-100 px-2.5 py-0.5 rounded border border-slate-300">
                            {request.couponCode}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-slate-800">
                          {formatDiscount(request)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-700">
                          {request.discountType === "percentage" ? formatMoney(request.maxDiscount) : "—"}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-slate-700">
                          {formatMoney(request.minOrderAmount)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {request.freeDelivery ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-xs font-bold">
                              <Truck className="w-3 h-3" /> Yes
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500">No</span>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-xs text-slate-600 font-medium">
                          <div>{formatDate(request.startDate)}</div>
                          <div className="text-slate-400">to {formatDate(request.endDate || request.expiryDate)}</div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-700">
                          {formatUsage(request)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-700">
                          {request.perUserLimit || 1}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-600 font-medium">
                          {formatDate(request.requestedAt || request.createdAt, true)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1.5">
                            <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full border w-fit ${statusBadgeClass(status)}`}>
                              {status === "Approved" ? <BadgeCheck className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                              {status}
                            </span>
                            {status === "Pending" && request.previousApproved ? (
                              <span className="inline-flex w-fit rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                                Resubmitted
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => openDetailsModal(request, "view")}
                              className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors border border-red-100"
                              title="View full coupon details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {status === "Approved" && (
                              <button
                                onClick={() => openDetailsModal(request, "reject")}
                                disabled={processingId !== null}
                                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100 transition-colors disabled:opacity-50"
                                title="Deactivate coupon"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            )}
                            {status === "Rejected" && (
                              <button
                                onClick={() => openDetailsModal(request, "revert")}
                                disabled={processingId !== null}
                                className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-100 transition-colors disabled:opacity-50"
                                title="Revert to pending"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={showDetailsModal} onOpenChange={(open) => { if (!open) closeDetailsModal(); else setShowDetailsModal(true); }}>
        <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[90vh] flex flex-col bg-white border border-slate-200 rounded-xl shadow-2xl p-0 overflow-hidden gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-lg font-black text-slate-800">
                  {detailsModalMode === "reject"
                    ? "Reject Coupon Request"
                    : detailsModalMode === "revert"
                      ? "Revert Coupon Request"
                      : "Coupon Request Details"}
                </DialogTitle>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">
                  {detailsModalMode === "reject"
                    ? "Share clear feedback for the restaurant"
                    : detailsModalMode === "revert"
                      ? "Confirm before moving this coupon back to pending"
                      : "Full database record for admin review"}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="p-6 overflow-y-auto flex-1 scrollbar-thin">
            {renderDetailsModalContent()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
