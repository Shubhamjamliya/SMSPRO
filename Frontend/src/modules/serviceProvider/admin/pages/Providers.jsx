import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, Pencil, Plus } from "lucide-react";
import {
  PageHeader,
  FilterBar,
  AdminTable,
  StatusBadge,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import serviceProviderAdminApi from "../services/adminApi";
import { SP_ADMIN_PAGE_CLASS, SP_ADMIN_SELECT_CLASS } from "../utils/adminTheme";

const message = (error, fallback) => error?.response?.data?.message || fallback;
const when = (value) => (value ? new Date(value).toLocaleString() : "—");

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "onboarding", label: "Onboarding" },
  { value: "pending_approval", label: "Pending approval" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "suspended", label: "Suspended" },
];

export default function Providers() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [acting, setActing] = useState(false);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const result = await serviceProviderAdminApi.getProviders({
        page,
        limit: meta.limit,
        status,
        search: search.trim() || undefined,
      });
      setRows(result.records || []);
      setMeta((current) => ({ ...current, ...result }));
    } catch (error) {
      toast.error(message(error, "Could not load providers"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, search]);

  useEffect(() => {
    load(1);
  }, [load]);

  const openDetail = async (row) => {
    setDetail(row);
    setDetailLoading(true);
    try {
      const full = await serviceProviderAdminApi.getProviderById(row.id);
      setDetail(full);
    } catch (error) {
      toast.error(message(error, "Could not load provider"));
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleActive = async () => {
    if (!detail) return;
    setActing(true);
    try {
      if (detail.isActive) {
        await serviceProviderAdminApi.suspendProvider(detail.id, "Suspended by admin");
        toast.success("Provider suspended");
      } else {
        await serviceProviderAdminApi.activateProvider(detail.id);
        toast.success("Provider activated");
      }
      setDetail(null);
      load(meta.page);
    } catch (error) {
      toast.error(message(error, "Action failed"));
    } finally {
      setActing(false);
    }
  };

  const columns = [
    { key: "providerCode", header: "Provider", cell: (row) => <span className="font-semibold">{row.providerCode || "—"}</span> },
    { key: "ownerName", header: "Name" },
    { key: "phone", header: "Phone" },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <div className="space-x-1">
          <StatusBadge status={row.status} />
          {!row.isActive ? <StatusBadge status="suspended" tone="danger" label="Suspended" /> : null}
        </div>
      ),
    },
    { key: "createdAt", header: "Joined", cell: (row) => when(row.createdAt) },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <Button variant="outline" size="sm" onClick={() => openDetail(row)}>
          <Eye className="mr-1.5 h-3.5 w-3.5" /> View
        </Button>
      ),
    },
  ];

  return (
    <div className={SP_ADMIN_PAGE_CLASS}>
      <PageHeader
        title="Service Providers"
        description="All registered service providers on the platform."
        actions={
          <Button onClick={() => navigate("/admin/service-provider/providers/add")}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Service Provider
          </Button>
        }
      />

      <FilterBar
        start={
          <>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={SP_ADMIN_SELECT_CLASS}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <Input
              placeholder="Search name, phone, provider code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
          </>
        }
      />

      <AdminTable
        columns={columns}
        data={rows}
        loading={loading}
        skeletonRows={6}
        getRowId={(row) => row.id}
        emptyState={{ title: "No providers found", description: "Try adjusting your filters." }}
        pagination={{
          page: meta.page,
          totalPages: meta.pages,
          total: meta.total,
          pageSize: meta.limit,
          onPageChange: (page) => load(page),
        }}
      />

      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="just-order-theme-scope max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.ownerName || "Provider"}</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="h-40 animate-pulse rounded-xl bg-muted" />
          ) : detail ? (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">Phone</p><p className="font-semibold">{detail.phone}</p></div>
                <div><p className="text-xs text-muted-foreground">Email</p><p className="font-semibold">{detail.email || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Status</p><StatusBadge status={detail.status} /></div>
                <div><p className="text-xs text-muted-foreground">Active</p><p className="font-semibold">{detail.isActive ? "Yes" : "Suspended"}</p></div>
              </div>
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Services ({detail.services?.length || 0})
                </p>
                <p className="text-xs">
                  {(detail.services || []).map((s) => s.serviceId?.name).filter(Boolean).join(", ") || "None"}
                </p>
              </div>
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Zones ({detail.zones?.length || 0})
                </p>
                <p className="text-xs">
                  {(detail.zones || []).map((z) => z.zoneId?.name).filter(Boolean).join(", ") || "None"}
                </p>
              </div>
            </div>
          ) : null}
          {detail && !detailLoading ? (
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => navigate(`/admin/service-provider/providers/${detail.id}/edit`)}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
              </Button>
              {detail.status === "approved" ? (
                <Button
                  variant={detail.isActive ? "danger" : "primary"}
                  isLoading={acting}
                  onClick={toggleActive}
                >
                  {detail.isActive ? "Suspend" : "Activate"}
                </Button>
              ) : null}
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
