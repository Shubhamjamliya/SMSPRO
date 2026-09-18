import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Eye, Users, Wifi, Ban, CheckCircle2 } from "lucide-react";
import {
  PageHeader, SectionCard, StatCard, AdminTable, FilterBar, StatusBadge,
  FormLayout, FormSection, FormRow, FormField,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { taxiAdminApi } from "../../services/api";
import { filterBySearch, sortItems, paginateItems, formatDateTime } from "../utils/taxiTableHelpers";

const selectCls = "h-10 px-3 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10";

const Drivers = () => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [onlineFilter, setOnlineFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await taxiAdminApi.getDrivers({
        limit: 100,
        status: statusFilter !== "all" ? statusFilter : undefined,
        onlineStatus: onlineFilter !== "all" ? onlineFilter : undefined,
        search: search.trim() || undefined,
      });
      setDrivers(data.records || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load drivers");
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, onlineFilter, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const filtered = useMemo(() => {
    let rows = filterBySearch(drivers, search, ["id", "name", "phone", "vehicleNumber", "vehicleType"]);
    if (statusFilter !== "all") {
      rows = rows.filter((r) => {
        if (statusFilter === "active") return r.isActive && r.status === "approved";
        if (statusFilter === "suspended") return !r.isActive;
        return r.status === statusFilter;
      });
    }
    if (onlineFilter !== "all") rows = rows.filter((r) => r.onlineStatus === onlineFilter);
    return sortItems(rows, "name", "asc");
  }, [drivers, search, statusFilter, onlineFilter]);

  const { items: pageItems, total, totalPages } = useMemo(
    () => paginateItems(filtered, page, pageSize),
    [filtered, page, pageSize],
  );

  const stats = useMemo(() => ({
    total: drivers.length,
    online: drivers.filter((d) => d.onlineStatus === "online").length,
    active: drivers.filter((d) => d.isActive && d.status === "approved").length,
    suspended: drivers.filter((d) => !d.isActive).length,
  }), [drivers]);

  const toggleStatus = async (row) => {
    const next = row.isActive ? "suspended" : "active";
    setSaving(true);
    try {
      await taxiAdminApi.updateDriverStatus(row.id, next);
      toast.success(`${row.name} marked ${next}`);
      setDetailOpen(false);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to update status");
    } finally {
      setSaving(false);
    }
  };

  const displayStatus = (row) => {
    if (!row.isActive) return "suspended";
    if (row.status === "approved") return "active";
    return row.status || "pending";
  };

  const columns = [
    {
      key: "name", header: "Driver",
      cell: (row) => (
        <div className="flex items-center gap-3">
          {row.photo ? (
            <img src={row.photo} alt={row.name} className="w-9 h-9 rounded-full bg-gray-100 object-cover" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center text-sm font-semibold">
              {(row.name || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-medium">{row.name || "—"}</p>
            <p className="text-xs text-gray-500 font-mono">{row.id.slice(-8)}</p>
          </div>
        </div>
      ),
    },
    { key: "phone", header: "Phone", cell: (row) => row.phone || "—" },
    {
      key: "vehicleType", header: "Vehicle",
      cell: (row) => (
        <div>
          <p className="font-medium text-sm">{row.vehicleType || row.vehicleModel || "—"}</p>
          <p className="text-xs text-gray-500">{row.vehicleNumber || "—"}</p>
        </div>
      ),
    },
    {
      key: "onlineStatus", header: "Online",
      cell: (row) => (
        <StatusBadge
          status={row.onlineStatus === "online" ? "success" : "default"}
          label={row.onlineStatus || "offline"}
        />
      ),
    },
    {
      key: "rating", header: "Rating",
      cell: (row) => <span className="text-yellow-600 font-medium">★ {Number(row.rating || 0).toFixed(1)}</span>,
    },
    {
      key: "status", header: "Status",
      cell: (row) => {
        const s = displayStatus(row);
        return <StatusBadge status={s === "active" ? "success" : s === "suspended" ? "danger" : "warning"} label={s} />;
      },
    },
    {
      key: "actions", header: "Actions", align: "right",
      cell: (row) => (
        <Button variant="ghost" size="sm" onClick={() => { setSelected(row); setDetailOpen(true); }}>
          <Eye size={14} />
        </Button>
      ),
    },
  ];

  return (
    <div className="just-order-theme-scope space-y-6 max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
      <PageHeader title="Drivers" description="Partners authorized for the taxi module" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Drivers" value={String(stats.total)} icon={<Users size={18} />} />
        <StatCard title="Online" value={String(stats.online)} icon={<Wifi size={18} />} />
        <StatCard title="Active" value={String(stats.active)} icon={<CheckCircle2 size={18} />} />
        <StatCard title="Suspended" value={String(stats.suspended)} icon={<Ban size={18} />} />
      </div>

      <SectionCard flush>
        <div className="p-4 space-y-4">
          <FilterBar
            start={
              <div className="flex flex-wrap gap-2 w-full">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search drivers..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  />
                </div>
                <select className={selectCls} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
                  <option value="all">All status</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                </select>
                <select className={selectCls} value={onlineFilter} onChange={(e) => { setOnlineFilter(e.target.value); setPage(1); }}>
                  <option value="all">All online</option>
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                </select>
              </div>
            }
          />
          <AdminTable
            columns={columns}
            data={pageItems}
            loading={loading}
            getRowId={(r) => r.id}
            pagination={{
              page,
              pageSize,
              total,
              totalPages,
              onPageChange: setPage,
              onPageSizeChange: (s) => { setPageSize(s); setPage(1); },
            }}
            emptyState={{ title: "No taxi drivers yet", description: "Drivers appear here once they are authorized for the taxi module." }}
          />
        </div>
      </SectionCard>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader className="pr-8">
            <DialogTitle>{selected?.name || "Driver"}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <FormLayout>
                <FormSection>
                  <FormRow>
                    <FormField label="Phone"><div className="text-sm font-medium">{selected.phone || "—"}</div></FormField>
                    <FormField label="Email"><div className="text-sm font-medium">{selected.email || "—"}</div></FormField>
                  </FormRow>
                  <FormRow>
                    <FormField label="Vehicle"><div className="text-sm font-medium">{selected.vehicleType || selected.vehicleModel || "—"}</div></FormField>
                    <FormField label="Plate"><div className="text-sm font-mono font-medium">{selected.vehicleNumber || "—"}</div></FormField>
                  </FormRow>
                  <FormRow>
                    <FormField label="Online"><div className="text-sm capitalize">{selected.onlineStatus || "offline"}</div></FormField>
                    <FormField label="Active module"><div className="text-sm">{selected.activeWorkModule || "—"}</div></FormField>
                  </FormRow>
                  <FormRow>
                    <FormField label="Rating"><div className="text-sm">★ {Number(selected.rating || 0).toFixed(1)} ({selected.totalRatings || 0})</div></FormField>
                    <FormField label="Joined"><div className="text-sm">{formatDateTime(selected.createdAt)}</div></FormField>
                  </FormRow>
                </FormSection>
              </FormLayout>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
                <Button
                  variant={selected.isActive ? "outline" : "default"}
                  className={selected.isActive ? "text-red-600" : ""}
                  disabled={saving}
                  onClick={() => toggleStatus(selected)}
                >
                  {selected.isActive ? "Suspend" : "Activate"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Drivers;
