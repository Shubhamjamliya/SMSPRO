import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Search, Truck, AlertTriangle, CheckCircle2, Settings2, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import {
  PageHeader, SectionCard, StatCard, AdminTable, FilterBar,
  FormLayout, FormSection, FormRow, FormField, StatusBadge,
  TableSkeleton,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import porterAdminApi from "../services/adminApi";

const EMPTY_CAPACITY = {
  maxWeight: "",
  maxLengthCm: "",
  maxWidthCm: "",
  maxHeightCm: "",
  sizeLabel: "",
  description: "",
};

const selectCls =
  "h-10 px-3 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10";

const Vehicles = () => {
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState([]);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [configFilter, setConfigFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [formData, setFormData] = useState(EMPTY_CAPACITY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const result = await porterAdminApi.getVehicles({
        page: 1,
        limit: 100,
        search: searchTerm.trim() || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        sortBy: "displayOrder",
        sortOrder: "asc",
      });
      setVehicles(result.records || []);
      setTotal(result.total || 0);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load vehicles");
      setVehicles([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  const filtered = useMemo(() => {
    let rows = [...vehicles];
    if (configFilter === "configured") rows = rows.filter((v) => v.capacityConfigured);
    if (configFilter === "incomplete") rows = rows.filter((v) => !v.capacityConfigured);
    return rows;
  }, [vehicles, configFilter]);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize) || 1);

  const stats = useMemo(() => ({
    total: vehicles.length,
    active: vehicles.filter((v) => v.status === "active").length,
    configured: vehicles.filter((v) => v.capacityConfigured).length,
    incomplete: vehicles.filter((v) => !v.capacityConfigured).length,
  }), [vehicles]);

  const openCapacityModal = (vehicle) => {
    setEditingVehicle(vehicle);
    setFormData({
      maxWeight: vehicle.maxWeight ?? "",
      maxLengthCm: vehicle.maxLengthCm ?? "",
      maxWidthCm: vehicle.maxWidthCm ?? "",
      maxHeightCm: vehicle.maxHeightCm ?? "",
      sizeLabel: vehicle.sizeLabel || "",
      description: vehicle.description || "",
    });
    setErrors({});
    setIsModalOpen(true);
  };

  const validate = () => {
    const next = {};
    if (formData.maxWeight === "" || Number(formData.maxWeight) <= 0) {
      next.maxWeight = "Max weight is required";
    }
    if (!(Number(formData.maxLengthCm) > 0)) next.maxLengthCm = "Length (cm) is required";
    if (!(Number(formData.maxWidthCm) > 0)) next.maxWidthCm = "Width (cm) is required";
    if (!(Number(formData.maxHeightCm) > 0)) next.maxHeightCm = "Height (cm) is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!editingVehicle?.id || !validate()) {
      toast.error("Please fix the validation errors");
      return;
    }
    setSaving(true);
    try {
      await porterAdminApi.updateVehicleCapacity(editingVehicle.id, {
        maxWeight: Number(formData.maxWeight),
        maxLengthCm: Number(formData.maxLengthCm),
        maxWidthCm: Number(formData.maxWidthCm),
        maxHeightCm: Number(formData.maxHeightCm),
        sizeLabel: formData.sizeLabel || "",
        description: formData.description || "",
      });
      toast.success("Capacity configuration saved");
      setIsModalOpen(false);
      fetchVehicles();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save capacity");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      header: "Vehicle",
      key: "name",
      cell: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
            {row.iconUrl ? (
              <img src={row.iconUrl} alt={row.name} className="w-full h-full object-contain p-1" />
            ) : (
              <Truck size={18} className="text-slate-400" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 truncate">{row.name}</p>
            <p className="text-xs text-slate-500 uppercase tracking-wide">
              {row.vehicleCode || row.category || "—"}
            </p>
          </div>
        </div>
      ),
    },
    {
      header: "Category",
      key: "category",
      cell: (row) => <span className="text-sm text-slate-700">{row.category || "—"}</span>,
    },
    {
      header: "Weight capacity",
      key: "weight",
      cell: (row) =>
        row.capacityConfigured ? (
          <span className="text-sm font-medium">Up to {row.maxWeight} kg</span>
        ) : (
          <span className="text-sm text-muted-foreground italic">Not set</span>
        ),
    },
    {
      header: "Size capacity",
      key: "size",
      cell: (row) =>
        row.capacityConfigured ? (
          <span className="text-sm">
            {row.maxLengthCm}×{row.maxWidthCm}×{row.maxHeightCm} cm
            {row.sizeLabel ? ` · ${row.sizeLabel}` : ""}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground italic">Not set</span>
        ),
    },
    {
      header: "Porter config",
      key: "capacityConfigured",
      cell: (row) =>
        row.capacityConfigured ? (
          <StatusBadge tone="success" label="Configured" />
        ) : (
          <div className="flex flex-col gap-1 max-w-[220px]">
            <StatusBadge tone="warning" label="Incomplete" />
            <p className="text-[11px] text-amber-700 leading-snug flex gap-1">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              Complete configuration so it is visible on the user side
            </p>
          </div>
        ),
    },
    {
      header: "Status",
      key: "status",
      cell: (row) => (
        <StatusBadge
          status={row.status === "active" ? "success" : "default"}
          label={row.status}
        />
      ),
    },
    {
      header: "Actions",
      key: "actions",
      align: "right",
      cell: (row) => (
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openCapacityModal(row)}>
          <Settings2 size={14} />
          {row.capacityConfigured ? "Edit capacity" : "Configure"}
        </Button>
      ),
    },
  ];

  return (
    <div className="just-order-theme-scope space-y-6 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
      <PageHeader
        title="Porter Vehicles"
        subtitle="Vehicles enabled for Porter from Global Settings — configure weight & size capacity here"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Porter", href: "/admin/porter" },
          { label: "Vehicles" },
        ]}
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
        Create and edit vehicle types in{" "}
        <Link className="font-semibold underline" to="/admin/global-settings/vehicle-configuration">
          Global Settings → Vehicle Configuration
        </Link>
        , then enable them for Porter in{" "}
        <Link className="font-semibold underline" to="/admin/global-settings/module-vehicle-mapping">
          Module Vehicle Mapping
        </Link>
        . Only capacity-configured vehicles appear on the user app.
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Enabled for Porter" value={String(stats.total)} icon={<Truck size={18} />} />
        <StatCard title="Active" value={String(stats.active)} icon={<CheckCircle2 size={18} />} />
        <StatCard title="Capacity configured" value={String(stats.configured)} />
        <StatCard title="Needs configuration" value={String(stats.incomplete)} icon={<AlertTriangle size={18} />} />
      </div>

      <SectionCard flush>
        <div className="p-4 space-y-4">
          <FilterBar
            start={
              <div className="flex flex-wrap gap-2 w-full">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search name, category, code..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                </div>
                <select
                  className={selectCls}
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="all">All status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <select
                  className={selectCls}
                  value={configFilter}
                  onChange={(e) => {
                    setConfigFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="all">All config</option>
                  <option value="configured">Configured</option>
                  <option value="incomplete">Incomplete</option>
                </select>
              </div>
            }
          />

          {loading ? (
            <TableSkeleton rows={5} columns={7} />
          ) : (
            <AdminTable
              columns={columns}
              data={pageItems}
              getRowId={(r) => r.id}
              emptyState={{
                title: total === 0 ? "No vehicles enabled for Porter" : "No matching vehicles",
                description:
                  total === 0
                    ? "Enable vehicles for Porter in Global Settings → Module Vehicle Mapping."
                    : "Try another search or filter.",
              }}
              pagination={{
                page: currentPage,
                totalPages,
                total: filtered.length,
                pageSize,
                onPageChange: setCurrentPage,
                onPageSizeChange: (s) => {
                  setPageSize(s);
                  setCurrentPage(1);
                },
              }}
            />
          )}
        </div>
      </SectionCard>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="just-order-theme-scope sm:max-w-[560px] p-0">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>
              {editingVehicle?.capacityConfigured ? "Edit capacity" : "Configure capacity"} —{" "}
              {editingVehicle?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
            <FormLayout>
              <FormSection title="Weight capacity (kg)">
                <FormField label="Max weight" required error={errors.maxWeight}>
                  <Input
                    type="number"
                    min="0"
                    value={formData.maxWeight}
                    onChange={(e) => setFormData({ ...formData, maxWeight: e.target.value })}
                    placeholder="e.g. 500"
                  />
                </FormField>
              </FormSection>

              <FormSection title="Size / load capacity (cm)">
                <FormRow>
                  <FormField label="Max length" required error={errors.maxLengthCm}>
                    <Input
                      type="number"
                      min="0"
                      value={formData.maxLengthCm}
                      onChange={(e) => setFormData({ ...formData, maxLengthCm: e.target.value })}
                      placeholder="L"
                    />
                  </FormField>
                  <FormField label="Max width" required error={errors.maxWidthCm}>
                    <Input
                      type="number"
                      min="0"
                      value={formData.maxWidthCm}
                      onChange={(e) => setFormData({ ...formData, maxWidthCm: e.target.value })}
                      placeholder="W"
                    />
                  </FormField>
                  <FormField label="Max height" required error={errors.maxHeightCm}>
                    <Input
                      type="number"
                      min="0"
                      value={formData.maxHeightCm}
                      onChange={(e) => setFormData({ ...formData, maxHeightCm: e.target.value })}
                      placeholder="H"
                    />
                  </FormField>
                </FormRow>
                <FormField label="Size label (optional)">
                  <Input
                    value={formData.sizeLabel}
                    onChange={(e) => setFormData({ ...formData, sizeLabel: e.target.value })}
                    placeholder="e.g. Medium load / 1 ton body"
                  />
                </FormField>
                <FormField label="Notes (optional)">
                  <textarea
                    className={selectCls + " w-full h-20 py-2"}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Any porter-specific load notes"
                  />
                </FormField>
              </FormSection>

              {!editingVehicle?.capacityConfigured && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  Until this is saved, the vehicle will not appear for users when booking Porter.
                </div>
              )}
            </FormLayout>
          </div>
          <div className="px-6 py-4 border-t flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save capacity"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Vehicles;
