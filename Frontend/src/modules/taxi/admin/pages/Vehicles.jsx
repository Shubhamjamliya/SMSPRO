import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Eye, Truck, CheckCircle2, Wifi } from "lucide-react";
import {
  PageHeader, SectionCard, StatCard, AdminTable, FilterBar, StatusBadge,
  FormLayout, FormSection, FormRow, FormField,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { taxiAdminApi } from "../../services/api";
import { filterBySearch, sortItems, paginateItems } from "../utils/taxiTableHelpers";

const selectCls = "h-10 px-3 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10";

const Vehicles = () => {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [onlineFilter, setOnlineFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await taxiAdminApi.getFleet({
        limit: 100,
        onlineStatus: onlineFilter !== "all" ? onlineFilter : undefined,
        search: search.trim() || undefined,
      });
      setVehicles(data.records || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load fleet");
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  }, [onlineFilter, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const filtered = useMemo(() => {
    let rows = filterBySearch(vehicles, search, ["id", "vehicleNumber", "vehicleType", "driverName", "driverPhone"]);
    if (statusFilter !== "all") rows = rows.filter((r) => r.status === statusFilter);
    if (onlineFilter !== "all") rows = rows.filter((r) => r.onlineStatus === onlineFilter);
    return sortItems(rows, "vehicleNumber", "asc");
  }, [vehicles, search, statusFilter, onlineFilter]);

  const { items: pageItems, total, totalPages } = useMemo(
    () => paginateItems(filtered, page, pageSize),
    [filtered, page, pageSize],
  );

  const stats = useMemo(() => ({
    total: vehicles.length,
    active: vehicles.filter((v) => v.status === "active").length,
    online: vehicles.filter((v) => v.onlineStatus === "online").length,
  }), [vehicles]);

  const columns = [
    {
      key: "vehicleNumber", header: "Plate",
      cell: (row) => <span className="font-semibold font-mono">{row.vehicleNumber || "—"}</span>,
    },
    { key: "vehicleType", header: "Type", cell: (row) => row.vehicleType || "—" },
    {
      key: "driverName", header: "Driver",
      cell: (row) => (
        <div>
          <p className="font-medium text-sm">{row.driverName || "—"}</p>
          <p className="text-xs text-gray-500">{row.driverPhone || ""}</p>
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
      cell: (row) => <StatusBadge status={row.status === "active" ? "success" : "default"} label={row.status} />,
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
      <PageHeader
        title="Vehicles"
        description="Fleet from taxi-authorized drivers (plate & vehicle details on partner profiles)"
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard title="Fleet size" value={String(stats.total)} icon={<Truck size={18} />} />
        <StatCard title="Active" value={String(stats.active)} icon={<CheckCircle2 size={18} />} />
        <StatCard title="Online now" value={String(stats.online)} icon={<Wifi size={18} />} />
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
                    placeholder="Search fleet..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  />
                </div>
                <select className={selectCls} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
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
            emptyState={{ title: "No fleet vehicles yet", description: "Vehicles appear from drivers authorized for taxi once they set plate / vehicle info." }}
          />
        </div>
      </SectionCard>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader className="pr-8">
            <DialogTitle>{selected?.vehicleNumber || "Vehicle"}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <FormLayout>
                <FormSection>
                  <FormRow>
                    <FormField label="Type"><div className="text-sm font-medium">{selected.vehicleType || "—"}</div></FormField>
                    <FormField label="Status"><div className="text-sm capitalize">{selected.status}</div></FormField>
                  </FormRow>
                  <FormRow>
                    <FormField label="Driver"><div className="text-sm font-medium">{selected.driverName || "—"}</div></FormField>
                    <FormField label="Phone"><div className="text-sm font-medium">{selected.driverPhone || "—"}</div></FormField>
                  </FormRow>
                  <FormRow>
                    <FormField label="Online"><div className="text-sm capitalize">{selected.onlineStatus || "offline"}</div></FormField>
                    <FormField label="Rating"><div className="text-sm">★ {Number(selected.rating || 0).toFixed(1)}</div></FormField>
                  </FormRow>
                </FormSection>
              </FormLayout>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Vehicles;
