import { useState, useMemo, useEffect } from "react";
import {
  Search,
  Eye,
  Check,
  X,
  ArrowUpDown,
  Loader2,
  Clock,
  Store,
  BadgeCheck,
  FileText,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Tag,
  MapPin,
  Phone,
  Mail,
  ImageOff,
} from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "../services/adminApi";
import { useAuth } from "@core/context/AuthContext";
import { getCurrentUser } from "@food/utils/auth";
import {
  canPerformAdminPermissionAction,
  extractAdminPermissions,
  extractAdminRoleId,
  fetchAdminRolePermissions,
} from "@food/utils/adminPermissions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@food/components/ui/dialog";
import { cn } from "@/lib/utils";

const statusBadgeClass = (status) => {
  const value = String(status || "Pending").toLowerCase();
  if (value === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (value === "rejected") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
};

const resolveShop = (request = {}) => {
  const shop = request.shop || request.seller || {};
  return {
    shopName: shop.shopName || request.sellerName || "Unknown Shop",
    ownerName: shop.ownerName || shop.name || "",
    phone: shop.phone || "",
    email: shop.email || "",
    shopImage: shop.shopImage || request.sellerImage || request.image || "",
    zoneName: shop.zoneName || "",
    businessType: shop.businessType || "Quick Commerce",
    address: shop.address || "",
  };
};

const ShopAvatar = ({ src, name, size = "md" }) => {
  const [broken, setBroken] = useState(false);
  const sizeClass =
    size === "lg" ? "h-16 w-16 text-lg" : size === "sm" ? "h-9 w-9 text-xs" : "h-11 w-11 text-sm";
  const initial = String(name || "S").trim().charAt(0).toUpperCase() || "S";

  if (src && !broken) {
    return (
      <img
        src={src}
        alt={name || "Shop"}
        className={cn(sizeClass, "rounded-xl object-cover border border-slate-200 bg-slate-100 shrink-0")}
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <div
      className={cn(
        sizeClass,
        "rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center font-black shrink-0",
      )}
    >
      {initial}
    </div>
  );
};

const DetailItem = ({ label, value, mono = false }) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
    <p className={cn("mt-1.5 text-sm font-bold text-slate-800 break-words", mono && "font-mono tracking-wide")}>
      {value || "—"}
    </p>
  </div>
);

export default function SellerCouponRequest() {
  const { user: authUser } = useAuth();
  const currentUser = useMemo(() => authUser || getCurrentUser("admin"), [authUser]);

  const [resolvedPermissions, setResolvedPermissions] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortConfig, setSortConfig] = useState({ key: "createdAt", direction: "desc" });

  useEffect(() => {
    let isMounted = true;
    const resolvePermissions = async () => {
      if (!currentUser || currentUser.role === "ADMIN") {
        if (isMounted) setResolvedPermissions({});
        return;
      }
      const existingPermissions = extractAdminPermissions(currentUser);
      if (Object.keys(existingPermissions).length > 0) {
        if (isMounted) setResolvedPermissions(existingPermissions);
        return;
      }
      const roleId = extractAdminRoleId(currentUser);
      if (!roleId) {
        if (isMounted) setResolvedPermissions({});
        return;
      }
      try {
        const rolePermissions = await fetchAdminRolePermissions(roleId);
        if (isMounted) setResolvedPermissions(rolePermissions);
      } catch {
        if (isMounted) setResolvedPermissions({});
      }
    };
    resolvePermissions();
    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  const permissionKey = "quick::core_management::marketing_tools::seller_coupon_request";
  const canEdit = canPerformAdminPermissionAction(currentUser, resolvedPermissions, permissionKey, "edit");

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await adminApi.getSellerCouponRequests();
      const list = response?.data?.result || response?.data?.results || [];
      setRequests(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error("Error loading seller coupon requests:", error);
      toast.error(error?.response?.data?.message || "Failed to load seller coupon requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatDate = (value) => {
    if (!value) return "—";
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch {
      return String(value);
    }
  };

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
      result = result.filter((r) => String(r.status || "Pending").toUpperCase() === statusFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((r) => {
        const shop = resolveShop(r);
        return (
          shop.shopName.toLowerCase().includes(query) ||
          shop.ownerName.toLowerCase().includes(query) ||
          shop.phone.toLowerCase().includes(query) ||
          String(r.couponCode || "").toLowerCase().includes(query) ||
          String(r.description || "").toLowerCase().includes(query)
        );
      });
    }

    if (sortConfig.key) {
      result.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];

        if (sortConfig.key === "createdAt") {
          aVal = new Date(a.createdAt || 0).getTime();
          bVal = new Date(b.createdAt || 0).getTime();
        }
        if (sortConfig.key === "sellerName") {
          aVal = resolveShop(a).shopName.toLowerCase();
          bVal = resolveShop(b).shopName.toLowerCase();
        }

        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [requests, statusFilter, searchQuery, sortConfig]);

  const handleUpdateStatus = async (requestId, newStatus) => {
    if (!canEdit) {
      toast.error("You do not have permission to modify coupon status.");
      return;
    }
    try {
      setProcessingId(requestId);
      const response = await adminApi.updateSellerCouponRequestStatus(requestId, newStatus);
      const updated = response?.data?.result;

      if (response?.data?.success || updated) {
        toast.success(
          newStatus === "Approved"
            ? "Coupon approved & activated"
            : "Coupon rejected / deactivated",
        );

        setRequests((prev) =>
          prev.map((r) =>
            String(r._id || r.id) === String(requestId)
              ? { ...r, ...(updated || {}), status: newStatus }
              : r,
          ),
        );

        if (selectedRequest && String(selectedRequest._id || selectedRequest.id) === String(requestId)) {
          setSelectedRequest((prev) => ({ ...prev, ...(updated || {}), status: newStatus }));
        }
      } else {
        toast.error(response?.data?.message || "Failed to update request status.");
      }
    } catch (error) {
      console.error("Error updating coupon status:", error);
      toast.error(error?.response?.data?.message || "Failed to update coupon status.");
    } finally {
      setProcessingId(null);
    }
  };

  const selectedShop = selectedRequest ? resolveShop(selectedRequest) : null;

  return (
    <div className="p-4 lg:p-6 min-h-screen bg-slate-50 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Tag className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">Seller Coupon Requests</h1>
              <p className="text-sm text-slate-500 font-medium">
                Review shop coupon campaigns with full seller store details
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="self-start md:self-auto px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 flex items-center gap-1.5 text-sm font-semibold transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Requests", count: requests.length, color: "text-slate-900 bg-white border-slate-200" },
            {
              label: "Pending",
              count: requests.filter((r) => (r.status || "Pending") === "Pending").length,
              color: "text-amber-700 bg-amber-50 border-amber-200/60",
            },
            {
              label: "Approved",
              count: requests.filter((r) => r.status === "Approved").length,
              color: "text-emerald-700 bg-emerald-50 border-emerald-200/60",
            },
            {
              label: "Rejected",
              count: requests.filter((r) => r.status === "Rejected").length,
              color: "text-rose-700 bg-rose-50 border-rose-200/60",
            },
          ].map((card) => (
            <div key={card.label} className={`p-4 rounded-2xl border ${card.color} shadow-sm`}>
              <p className="text-[10px] font-black uppercase tracking-wider opacity-70">{card.label}</p>
              <p className="text-2xl font-black mt-1">{card.count}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search shop, owner, phone, coupon code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full text-sm rounded-xl border border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>

            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 p-1 rounded-xl">
              {["ALL", "PENDING", "APPROVED", "REJECTED"].map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-bold rounded-lg transition-all",
                    statusFilter === status
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-800",
                  )}
                >
                  {status === "ALL" ? "All" : status}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider w-14">#</th>
                  <th
                    className="px-5 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                    onClick={() => handleSort("sellerName")}
                  >
                    <div className="flex items-center gap-1">
                      Shop Details
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="px-5 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider">Coupon</th>
                  <th className="px-5 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider">Discount</th>
                  <th className="px-5 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider">Status</th>
                  <th
                    className="px-5 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                    onClick={() => handleSort("createdAt")}
                  >
                    <div className="flex items-center gap-1">
                      Created
                      <ArrowUpDown className={cn("w-3 h-3", sortConfig.key === "createdAt" ? "text-emerald-600" : "text-slate-400")} />
                    </div>
                  </th>
                  <th className="px-5 py-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-wider w-36">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-20 text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-slate-700">Loading requests...</p>
                    </td>
                  </tr>
                ) : processedRequests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-20 text-center">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
                        <FileText className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-bold text-slate-800 mb-1">No requests found</p>
                      <p className="text-xs text-slate-500">No seller coupon requests match your filters.</p>
                    </td>
                  </tr>
                ) : (
                  processedRequests.map((request, index) => {
                    const reqId = request._id || request.id;
                    const status = request.status || "Pending";
                    const shop = resolveShop(request);

                    return (
                      <tr key={reqId} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-5 py-4 text-sm font-semibold text-slate-500">{index + 1}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <ShopAvatar src={shop.shopImage} name={shop.shopName} />
                            <div className="min-w-0">
                              <p className="text-sm font-black text-slate-900 truncate">{shop.shopName}</p>
                              <p className="text-[11px] text-slate-500 font-medium truncate">
                                {shop.ownerName ? `Owner: ${shop.ownerName}` : "Owner not set"}
                                {shop.zoneName ? ` · ${shop.zoneName}` : ""}
                              </p>
                              {shop.phone ? (
                                <p className="text-[11px] text-slate-400 font-semibold mt-0.5">{shop.phone}</p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-sm font-extrabold text-slate-900 tracking-wider bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                            {request.couponCode}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm font-bold text-slate-800">
                          {request.discountType === "percentage"
                            ? `${request.discountValue}% OFF`
                            : `₹${request.discountValue} FLAT`}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${statusBadgeClass(status)}`}>
                            {status === "Approved" ? (
                              <BadgeCheck className="w-3.5 h-3.5" />
                            ) : status === "Rejected" ? (
                              <XCircle className="w-3.5 h-3.5" />
                            ) : (
                              <Clock className="w-3.5 h-3.5" />
                            )}
                            {status}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600 font-medium">{formatDate(request.createdAt)}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedRequest(request);
                                setShowDetailsModal(true);
                              }}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                              title="View Request"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {canEdit && status === "Pending" && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateStatus(reqId, "Approved")}
                                  disabled={processingId !== null}
                                  className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 disabled:opacity-50"
                                  title="Approve"
                                >
                                  {processingId === reqId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateStatus(reqId, "Rejected")}
                                  disabled={processingId !== null}
                                  className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 disabled:opacity-50"
                                  title="Reject"
                                >
                                  {processingId === reqId ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                                </button>
                              </>
                            )}

                            {canEdit && status === "Approved" && (
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(reqId, "Rejected")}
                                disabled={processingId !== null}
                                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 disabled:opacity-50"
                                title="Deactivate"
                              >
                                {processingId === reqId ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                              </button>
                            )}

                            {canEdit && status === "Rejected" && (
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(reqId, "Approved")}
                                disabled={processingId !== null}
                                className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 disabled:opacity-50"
                                title="Activate"
                              >
                                {processingId === reqId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
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

      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] flex flex-col bg-white border border-slate-200 rounded-2xl shadow-2xl p-0 overflow-hidden gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
            <DialogTitle className="text-lg font-black text-slate-800">Coupon request review</DialogTitle>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">Shop details + campaign parameters</p>
          </DialogHeader>

          <div className="p-6 overflow-y-auto flex-1 space-y-5">
            {selectedRequest && selectedShop ? (
              <>
                <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3">Seller shop</p>
                  <div className="flex items-start gap-4">
                    <div className="relative">
                      <ShopAvatar src={selectedShop.shopImage} name={selectedShop.shopName} size="lg" />
                      {!selectedShop.shopImage ? (
                        <span className="absolute -bottom-1 -right-1 rounded-full bg-white border border-slate-200 p-0.5 text-slate-400">
                          <ImageOff className="w-3 h-3" />
                        </span>
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-black text-slate-900 truncate">{selectedShop.shopName}</p>
                      <p className="text-sm text-slate-500 font-medium mt-0.5">
                        {selectedShop.ownerName || "Owner not set"} · {selectedShop.businessType}
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {selectedShop.zoneName ? (
                          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                            <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                            {selectedShop.zoneName}
                          </p>
                        ) : null}
                        {selectedShop.phone ? (
                          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                            <Phone className="w-3.5 h-3.5 text-emerald-600" />
                            {selectedShop.phone}
                          </p>
                        ) : null}
                        {selectedShop.email ? (
                          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 truncate">
                            <Mail className="w-3.5 h-3.5 text-emerald-600" />
                            {selectedShop.email}
                          </p>
                        ) : null}
                        {selectedShop.address ? (
                          <p className="inline-flex items-start gap-1.5 text-xs font-semibold text-slate-600 sm:col-span-2">
                            <Store className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                            <span className="leading-relaxed">{selectedShop.address}</span>
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-wide">Coupon parameters</h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <DetailItem label="Coupon code" value={selectedRequest.couponCode} mono />
                    <DetailItem
                      label="Discount"
                      value={
                        selectedRequest.discountType === "percentage"
                          ? `${selectedRequest.discountValue}% OFF`
                          : `₹${selectedRequest.discountValue} FLAT OFF`
                      }
                    />
                    <DetailItem label="Min order" value={`₹${selectedRequest.minOrderAmount || 0}`} />
                    {selectedRequest.discountType === "percentage" ? (
                      <DetailItem
                        label="Max discount"
                        value={selectedRequest.maxDiscount ? `₹${selectedRequest.maxDiscount}` : "No limit"}
                      />
                    ) : null}
                    <DetailItem
                      label="Validity"
                      value={`${formatDate(selectedRequest.validFrom || selectedRequest.startDate)} → ${formatDate(selectedRequest.validTill || selectedRequest.expiryDate)}`}
                    />
                    <DetailItem
                      label="Usage limit"
                      value={selectedRequest.usageLimit ? `${selectedRequest.usageLimit} total` : "Unlimited"}
                    />
                    <DetailItem
                      label="Per user limit"
                      value={selectedRequest.perUserLimit ? `${selectedRequest.perUserLimit} / user` : "Unlimited"}
                    />
                    <DetailItem label="First order only" value={selectedRequest.isFirstOrderOnly ? "Yes" : "No"} />
                    {selectedRequest.description ? (
                      <div className="sm:col-span-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Description</p>
                        <p className="mt-1.5 text-sm text-slate-700 leading-relaxed">{selectedRequest.description}</p>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3">
                  {selectedRequest.status !== "Pending" ? (
                    <>
                      <div className="flex-1 flex items-center justify-center p-3 rounded-xl border text-sm font-semibold bg-slate-50 border-slate-100 text-slate-600">
                        {selectedRequest.status === "Approved" ? (
                          <span className="flex items-center gap-1.5 text-emerald-600">
                            <CheckCircle2 className="w-4 h-4" /> Approved & activated
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-rose-600">
                            <XCircle className="w-4 h-4" /> Rejected / deactivated
                          </span>
                        )}
                      </div>
                      {canEdit && selectedRequest.status === "Approved" && (
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(selectedRequest._id || selectedRequest.id, "Rejected")}
                          disabled={processingId !== null}
                          className="px-5 py-2.5 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl disabled:opacity-50"
                        >
                          Deactivate
                        </button>
                      )}
                      {canEdit && selectedRequest.status === "Rejected" && (
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(selectedRequest._id || selectedRequest.id, "Approved")}
                          disabled={processingId !== null}
                          className="px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-50"
                        >
                          Activate
                        </button>
                      )}
                    </>
                  ) : (
                    canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(selectedRequest._id || selectedRequest.id, "Rejected")}
                          disabled={processingId !== null}
                          className="px-5 py-2.5 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl disabled:opacity-50"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(selectedRequest._id || selectedRequest.id, "Approved")}
                          disabled={processingId !== null}
                          className="px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-50"
                        >
                          Approve
                        </button>
                      </>
                    )
                  )}
                </div>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
