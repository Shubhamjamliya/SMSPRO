import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { History } from "lucide-react";
import { PageHeader, FilterBar, AdminTable, StatusBadge } from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import ZonePolygonMapField from "@/shared/components/maps/ZonePolygonMapField";
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

export default function ZoneRequests() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: 20 });
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(true);

  const [reviewing, setReviewing] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [acting, setActing] = useState(false);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const result = await serviceProviderAdminApi.getZoneRequests({ page, limit: meta.limit, status });
      setRows(result.records || []);
      setMeta((current) => ({ ...current, ...result }));
    } catch (error) {
      toast.error(message(error, "Could not load zone requests"));
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
    setShowReject(false);
    setRejectReason("");
  };

  const approve = async () => {
    if (!reviewing) return;
    setActing(true);
    try {
      await serviceProviderAdminApi.approveZoneRequest(reviewing._id);
      toast.success("Request approved — zone created");
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
      await serviceProviderAdminApi.rejectZoneRequest(reviewing._id, rejectReason.trim());
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
    { key: "requestedName", header: "Requested zone", cell: (row) => <span className="font-semibold">{row.requestedName}</span> },
    { key: "provider", header: "Provider", cell: (row) => row.providerId?.ownerName || "—" },
    { key: "country", header: "Country", cell: (row) => row.country || "—" },
    { key: "points", header: "Points", cell: (row) => row.coordinates?.length || 0 },
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
      <PageHeader title="Zone Requests" description="New zone requests submitted by providers for admin review." />

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
        emptyState={{ title: "No zone requests", description: "Provider requests for new zones will appear here." }}
        pagination={{
          page: meta.page,
          totalPages: meta.pages,
          total: meta.total,
          pageSize: meta.limit,
          onPageChange: (page) => load(page),
        }}
      />

      <Dialog open={Boolean(reviewing)} onOpenChange={(open) => !open && setReviewing(null)}>
        <DialogContent className="just-order-theme-scope max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{reviewing?.requestedName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p><span className="text-muted-foreground">Provider:</span> {reviewing?.providerId?.ownerName || "—"}</p>
            <p><span className="text-muted-foreground">Phone:</span> {reviewing?.providerId?.phone || "—"}</p>
            <p><span className="text-muted-foreground">Provider code:</span> {reviewing?.providerId?.providerCode || "—"}</p>
            <p><span className="text-muted-foreground">Country:</span> {reviewing?.country || "—"}</p>
            <p><span className="text-muted-foreground">Unit:</span> {reviewing?.unit || "kilometer"}</p>
            <p><span className="text-muted-foreground">Coordinates:</span> {reviewing?.coordinates?.length || 0} points</p>
            <p><span className="text-muted-foreground">Reason:</span> {reviewing?.reason || "—"}</p>
            <p><span className="text-muted-foreground">Submitted:</span> {when(reviewing?.createdAt)}</p>

            {reviewing?.coordinates?.length >= 3 ? (
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Zone boundary (as submitted — view only, cannot be edited here)
                </p>
                <ZonePolygonMapField
                  coordinates={[]}
                  onCoordinatesChange={() => {}}
                  existingZones={[{ _id: reviewing._id, name: reviewing.requestedName, country: reviewing.country, coordinates: reviewing.coordinates }]}
                  isEditMode={false}
                  selectedZoneId={reviewing._id}
                  readOnly
                />
              </div>
            ) : null}

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
                <Button isLoading={acting} onClick={approve}>Approve</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
