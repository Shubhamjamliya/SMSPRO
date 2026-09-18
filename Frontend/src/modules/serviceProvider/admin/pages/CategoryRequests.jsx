import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { History } from "lucide-react";
import { PageHeader, FilterBar, AdminTable, StatusBadge } from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import serviceProviderAdminApi from "../services/adminApi";
import { SP_ADMIN_PAGE_CLASS, SP_ADMIN_SELECT_CLASS } from "../utils/adminTheme";

const message = (error, fallback) => error?.response?.data?.message || fallback;
const when = (value) => (value ? new Date(value).toLocaleString() : "—");

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

export default function CategoryRequests() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: 20 });
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(true);

  const [reviewing, setReviewing] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [approvePrice, setApprovePrice] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [acting, setActing] = useState(false);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const result = await serviceProviderAdminApi.getCategoryRequests({ page, limit: meta.limit, status });
      setRows(result.records || []);
      setMeta((current) => ({ ...current, ...result }));
    } catch (error) {
      toast.error(message(error, "Could not load category requests"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    load(1);
  }, [load]);

  const openReview = (row) => {
    setReviewing(row);
    setApprovePrice(String(row.basePrice ?? ""));
    setShowReject(false);
    setRejectReason("");
  };

  const hasIncludedService = Boolean(reviewing?.serviceName);
  const priceInvalid = hasIncludedService
    && (approvePrice === "" || Number.isNaN(Number(approvePrice)) || Number(approvePrice) <= 0);

  const approve = async () => {
    if (!reviewing) return;
    if (hasIncludedService && priceInvalid) {
      return toast.error("Set an admin price greater than ₹0 for the included service");
    }
    setActing(true);
    try {
      const body = hasIncludedService ? { basePrice: Number(approvePrice) } : {};
      await serviceProviderAdminApi.approveCategoryRequest(reviewing._id, body);
      toast.success(hasIncludedService ? "Category and service created" : "Request approved — category created");
      setReviewing(null);
      load(meta.page);
    } catch (error) {
      toast.error(message(error, "Could not approve request"));
    } finally {
      setActing(false);
    }
  };

  const reject = async () => {
    if (!reviewing || !rejectReason.trim()) return;
    setActing(true);
    try {
      await serviceProviderAdminApi.rejectCategoryRequest(reviewing._id, rejectReason.trim());
      toast.success("Request rejected");
      setReviewing(null);
      load(meta.page);
    } catch (error) {
      toast.error(message(error, "Could not reject request"));
    } finally {
      setActing(false);
    }
  };

  const columns = [
    { key: "requestedName", header: "Requested category", cell: (row) => <span className="font-semibold">{row.requestedName}</span> },
    { key: "provider", header: "Provider", cell: (row) => row.providerId?.ownerName || "—" },
    { key: "reason", header: "Reason", cell: (row) => row.reason || "—" },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    { key: "createdAt", header: "Requested", cell: (row) => when(row.createdAt) },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (row.status === "pending" ? (
        <Button variant="outline" size="sm" onClick={() => openReview(row)}>Review</Button>
      ) : null),
    },
  ];

  return (
    <div className={SP_ADMIN_PAGE_CLASS}>
      <PageHeader title="Category Requests" description="New category requests submitted by providers for admin review." />

      <FilterBar
        start={
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={SP_ADMIN_SELECT_CLASS}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        }
      />

      <AdminTable
        columns={columns}
        data={rows}
        loading={loading}
        skeletonRows={5}
        getRowId={(row) => row._id}
        emptyState={{ title: "No category requests", description: "Provider requests for new categories will appear here." }}
        pagination={{
          page: meta.page,
          totalPages: meta.pages,
          total: meta.total,
          pageSize: meta.limit,
          onPageChange: (page) => load(page),
        }}
      />

      <Dialog open={Boolean(reviewing)} onOpenChange={(open) => !open && setReviewing(null)}>
        <DialogContent className="just-order-theme-scope max-w-md">
          <DialogHeader>
            <DialogTitle>{reviewing?.requestedName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {reviewing?.icon ? (
              <img src={reviewing.icon} alt="" className="h-24 w-24 rounded-lg border border-gray-200 object-cover" />
            ) : null}
            <p><span className="text-muted-foreground">Provider:</span> {reviewing?.providerId?.ownerName || "—"}</p>
            <p><span className="text-muted-foreground">Phone:</span> {reviewing?.providerId?.phone || "—"}</p>
            <p><span className="text-muted-foreground">Provider code:</span> {reviewing?.providerId?.providerCode || "—"}</p>
            <p><span className="text-muted-foreground">Description:</span> {reviewing?.description || "—"}</p>
            <p><span className="text-muted-foreground">Requested status:</span> {reviewing?.requestedStatus || "active"}</p>
            {reviewing?.serviceName ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 space-y-1">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Included service</p>
                <p><span className="text-muted-foreground">Service:</span> {reviewing.serviceName}</p>
                <p><span className="text-muted-foreground">Zones:</span> {(reviewing.zoneIds || []).map((z) => z.name || z).join(", ") || "—"}</p>
                <p>
                  <span className="text-muted-foreground">Provider price:</span>{" "}
                  ₹{Number(reviewing.providerPrice || 0).toLocaleString("en-IN")}
                </p>
                <p><span className="text-muted-foreground">Service description:</span> {reviewing.serviceDescription || "—"}</p>
              </div>
            ) : null}
            <p><span className="text-muted-foreground">Reason:</span> {reviewing?.reason || "—"}</p>
            <p><span className="text-muted-foreground">Submitted:</span> {when(reviewing?.createdAt)}</p>
            {reviewing?.history?.length ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-amber-800">
                  <History className="h-3.5 w-3.5" /> Previously rejected — resubmitted
                </p>
                {reviewing.history.map((h, i) => (
                  <p key={i} className="text-xs text-amber-700">{h.reason || "No reason recorded"}</p>
                ))}
              </div>
            ) : null}
            {!showReject && reviewing?.serviceName ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Admin price (₹) for included service<span className="ml-0.5 text-red-500">*</span>
                </label>
                <Input type="number" min="0" value={approvePrice} onChange={(e) => setApprovePrice(e.target.value)} />
                {priceInvalid ? <p className="mt-1 text-xs text-red-600">Enter a price greater than ₹0</p> : null}
              </div>
            ) : null}
            {showReject ? (
              <Input placeholder="Rejection reason (required)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            ) : null}
          </div>
          <DialogFooter>
            {showReject ? (
              <>
                <Button variant="outline" onClick={() => setShowReject(false)} disabled={acting}>Back</Button>
                <Button variant="danger" isLoading={acting} disabled={!rejectReason.trim()} onClick={reject}>Confirm reject</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setShowReject(true)} disabled={acting}>Reject</Button>
                <Button isLoading={acting} disabled={priceInvalid} onClick={approve}>Approve</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
