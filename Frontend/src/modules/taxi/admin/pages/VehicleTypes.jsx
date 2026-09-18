import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Search, FolderTree, Bike, Car, Bus, Truck, Settings2, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import {
  PageHeader, SectionCard, StatCard, AdminTable, FilterBar, StatusBadge,
  FormLayout, FormSection, FormField,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { taxiAdminApi } from "../../services/api";
import { filterBySearch, paginateItems } from "../utils/taxiTableHelpers";

const selectCls = "h-10 px-3 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10";
const ICON_MAP = { Bike, Car, Bus, Truck };

const VehicleTypes = () => {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [configFilter, setConfigFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [seats, setSeats] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await taxiAdminApi.getVehicleTypes({
        limit: 100,
        status: statusFilter !== "all" ? statusFilter : undefined,
      });
      setTypes(data.records || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load vehicle types");
      setTypes([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let rows = filterBySearch(types, search, ["name", "code", "category"]);
    if (statusFilter !== "all") rows = rows.filter((r) => r.status === statusFilter);
    if (configFilter === "configured") rows = rows.filter((r) => r.seatsConfigured);
    if (configFilter === "incomplete") rows = rows.filter((r) => !r.seatsConfigured);
    return rows;
  }, [types, search, statusFilter, configFilter]);

  const { items: pageItems, total, totalPages } = useMemo(
    () => paginateItems(filtered, page, pageSize),
    [filtered, page, pageSize],
  );

  const stats = useMemo(() => ({
    total: types.length,
    active: types.filter((t) => t.status === "active").length,
    configured: types.filter((t) => t.seatsConfigured).length,
    incomplete: types.filter((t) => !t.seatsConfigured).length,
  }), [types]);

  const openSeatsModal = (row) => {
    setEditing(row);
    setSeats(row.seatsConfigured ? String(row.seats || "") : "");
    setError("");
    setModalOpen(true);
  };

  const handleSave = async () => {
    const value = Number(seats);
    if (!Number.isInteger(value) || value < 1 || value > 20) {
      setError("Seats must be an integer between 1 and 20");
      return;
    }
    if (!editing?.id) return;
    setSaving(true);
    try {
      await taxiAdminApi.updateVehicleType(editing.id, { seats: value });
      toast.success("Seats configuration saved");
      setModalOpen(false);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save seats");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      key: "name", header: "Type",
      cell: (row) => {
        const Icon = ICON_MAP[row.icon] || Car;
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50 border border-slate-100 p-1">
              {row.iconUrl ? (
                <img src={row.iconUrl} alt={row.name} className="h-full w-full object-contain" />
              ) : (
                <Icon size={18} className="text-slate-400" />
              )}
            </div>
            <div>
              <p className="font-medium text-slate-800">{row.name}</p>
              <p className="text-xs text-slate-500 uppercase tracking-wider">{row.category || row.code || row.name}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: "seats",
      header: "Seats",
      cell: (row) =>
        row.seatsConfigured ? (
          <span className="text-slate-700 font-medium">{row.seats}</span>
        ) : (
          <span className="text-sm text-muted-foreground italic">Not set</span>
        ),
    },
    {
      key: "seatsConfigured",
      header: "Taxi config",
      cell: (row) =>
        row.seatsConfigured ? (
          <StatusBadge tone="success" label="Configured" />
        ) : (
          <div className="flex flex-col gap-1 max-w-[220px]">
            <StatusBadge tone="warning" label="Incomplete" />
            <p className="text-[11px] text-amber-700 leading-snug flex gap-1">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              Set seats so this type is ready for taxi booking
            </p>
          </div>
        ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <StatusBadge status={row.status === "active" ? "success" : "default"} label={row.status} />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (row) => (
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openSeatsModal(row)}>
          <Settings2 size={14} />
          {row.seatsConfigured ? "Edit seats" : "Configure seats"}
        </Button>
      ),
    },
  ];

  return (
    <div className="just-order-theme-scope space-y-6 max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
      <PageHeader
        title="Vehicle Types"
        description="Vehicles enabled for Taxi from Global Settings — configure passenger seats here"
        actions={
          <Link
            to="/admin/global-settings/module-vehicle-mapping"
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <ExternalLink size={14} /> Module Vehicle Mapping
          </Link>
        }
      />

      <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-900">
        Create vehicle types in{" "}
        <Link className="font-semibold underline" to="/admin/global-settings/vehicle-configuration">
          Global Settings → Vehicle Configuration
        </Link>
        , enable them for Taxi in Module Vehicle Mapping, then set seats here.
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Enabled for Taxi" value={String(stats.total)} icon={<FolderTree size={18} />} />
        <StatCard title="Active" value={String(stats.active)} icon={<CheckCircle2 size={18} />} />
        <StatCard title="Seats configured" value={String(stats.configured)} />
        <StatCard title="Needs seats" value={String(stats.incomplete)} icon={<AlertTriangle size={18} />} />
      </div>

      <SectionCard flush>
        <FilterBar
          start={
            <div className="flex flex-wrap gap-2 w-full">
              <div className="relative flex-1 min-w-[220px] max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  className="pl-9"
                  placeholder="Search types..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <select
                className={selectCls}
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              >
                <option value="all">All status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <select
                className={selectCls}
                value={configFilter}
                onChange={(e) => { setConfigFilter(e.target.value); setPage(1); }}
              >
                <option value="all">All config</option>
                <option value="configured">Configured</option>
                <option value="incomplete">Incomplete</option>
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
            onPageSizeChange: setPageSize,
          }}
          emptyState={{
            title: types.length === 0 ? "No vehicles enabled for Taxi" : "No matching types",
            description:
              types.length === 0
                ? "Enable vehicles for Taxi in Global Settings → Module Vehicle Mapping."
                : "Try another search or filter.",
          }}
        />
      </SectionCard>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="just-order-theme-scope sm:max-w-[420px] p-0">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>
              {editing?.seatsConfigured ? "Edit seats" : "Configure seats"} — {editing?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 py-4">
            <FormLayout>
              <FormSection title="Passenger capacity">
                <FormField label="Seats" required error={error}>
                  <Input
                    type="number"
                    min="1"
                    max="20"
                    value={seats}
                    onChange={(e) => setSeats(e.target.value)}
                    placeholder="e.g. 4"
                  />
                </FormField>
              </FormSection>
              {!editing?.seatsConfigured && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  Seats are taxi-only. Set them here so this vehicle type is ready for booking.
                </div>
              )}
            </FormLayout>
          </div>
          <div className="px-6 py-4 border-t flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save seats"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VehicleTypes;
