import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Search,
  Pencil,
  Truck,
  Upload,
  X,
  Power,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  PageHeader,
  SectionCard,
  AdminTable,
  FilterBar,
  StatusBadge,
  FormLayout,
  FormSection,
  FormRow,
  FormField,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { compressImage } from "@/shared/utils/imageCompression";
import {
  createVehicleConfiguration,
  getVehicleConfiguration,
  updateVehicleConfiguration,
  updateVehicleConfigurationStatus,
  deleteVehicleConfiguration,
} from "@/modules/common/api/vehicleConfigurations";

const selectCls =
  "h-10 px-3 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10";

const EMPTY_FORM = {
  name: "",
  category: "",
  displayOrder: 0,
  status: "active",
  documents: [],
};

const getVehicleId = (vehicle) => String(vehicle?._id || vehicle?.id || "");

export default function VehicleConfiguration() {
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [iconFile, setIconFile] = useState(null);
  const [iconPreview, setIconPreview] = useState("");
  const [errors, setErrors] = useState({});

  const applyConfig = useCallback((config) => {
    setVehicles(Array.isArray(config?.vehicles) ? config.vehicles : []);
    setDocumentTypes(Array.isArray(config?.documentTypes) ? config.documentTypes : []);
  }, []);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const config = await getVehicleConfiguration();
      applyConfig(config);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load vehicles");
    } finally {
      setLoading(false);
    }
  }, [applyConfig]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return vehicles.filter((vehicle) => {
      const matchesSearch =
        !query || String(vehicle.name || "").toLowerCase().includes(query);
      const matchesStatus =
        statusFilter === "all" || vehicle.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [vehicles, search, statusFilter]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const openModal = (vehicle = null) => {
    setEditing(vehicle);
    setForm(
      vehicle
        ? {
            name: vehicle.name || "",
            category: vehicle.category || "",
            displayOrder: vehicle.displayOrder || 0,
            status: vehicle.status || "active",
            documents: Array.isArray(vehicle.documents)
              ? vehicle.documents.map((doc) => ({
                  key: doc.key,
                  required: doc.required !== false,
                }))
              : [],
          }
        : EMPTY_FORM,
    );
    setIconFile(null);
    setIconPreview(vehicle?.icon?.url || "");
    setErrors({});
    setModalOpen(true);
  };

  const selectedDocumentMap = useMemo(() => {
    const map = new Map();
    form.documents.forEach((doc) => map.set(doc.key, doc));
    return map;
  }, [form.documents]);

  const toggleDocument = (key, checked) => {
    setForm((prev) => {
      if (!checked) {
        return {
          ...prev,
          documents: prev.documents.filter((doc) => doc.key !== key),
        };
      }
      if (prev.documents.some((doc) => doc.key === key)) return prev;
      return {
        ...prev,
        documents: [...prev.documents, { key, required: true }],
      };
    });
  };

  const setDocumentRequired = (key, required) => {
    setForm((prev) => ({
      ...prev,
      documents: prev.documents.map((doc) =>
        doc.key === key ? { ...doc, required } : doc,
      ),
    }));
  };

  const handleIconChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 512,
      });
      setIconFile(compressed);
      setIconPreview(URL.createObjectURL(compressed));
    } catch {
      setIconFile(file);
      setIconPreview(URL.createObjectURL(file));
    }
  };

  const validate = () => {
    const nextErrors = {};
    const category = form.category.trim();
    if (category.length < 2 || category.length > 80) {
      nextErrors.category = "Category must be between 2 and 80 characters";
    }
    if (!form.status) nextErrors.status = "Status is required";
    if (!Array.isArray(form.documents) || form.documents.length === 0) {
      nextErrors.documents = "Select at least one onboarding document";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.category.trim(),
        category: form.category.trim(),
        displayOrder: Number(form.displayOrder),
        status: form.status,
        documents: form.documents,
      };
      const config = editing
        ? await updateVehicleConfiguration(getVehicleId(editing), payload, iconFile)
        : await createVehicleConfiguration(payload, iconFile);
      applyConfig(config);
      setModalOpen(false);
      toast.success(editing ? "Vehicle updated" : "Vehicle created");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to save vehicle");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (vehicle) => {
    const nextStatus = vehicle.status === "active" ? "inactive" : "active";
    try {
      const config = await updateVehicleConfigurationStatus(
        getVehicleId(vehicle),
        nextStatus,
      );
      applyConfig(config);
      toast.success(
        `${vehicle.name} marked ${nextStatus === "active" ? "active" : "inactive"}`,
      );
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update status");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this vehicle configuration? This action cannot be undone and will remove it from all associated modules.")) return;
    try {
      const config = await deleteVehicleConfiguration(id);
      applyConfig(config);
      toast.success("Vehicle deleted successfully");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete vehicle");
    }
  };

  const columns = [
    {
      key: "name",
      header: "Vehicle",
      cell: (row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-gray-100 bg-amber-50 text-amber-600">
            {row.icon?.url ? (
              <img
                src={row.icon.url}
                alt={row.name}
                className="h-full w-full object-contain"
              />
            ) : (
              <Truck size={18} />
            )}
          </div>
          <div>
            <p className="font-semibold text-gray-900">{row.name}</p>
            <p className="text-xs text-muted-foreground">
              {row.category ? `${row.category} • ` : ""}
              {(row.documents || []).length} document
              {(row.documents || []).length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "documents",
      header: "Documents",
      cell: (row) => {
        const labels = (row.documents || [])
          .map((doc) => {
            const meta = documentTypes.find((item) => item.key === doc.key);
            return meta
              ? `${meta.label}${doc.required === false ? " (Optional)" : " (Required)"}`
              : doc.key;
          })
          .slice(0, 3);
        const remaining = Math.max(
          0,
          (row.documents || []).length - labels.length,
        );
        return (
          <span className="text-sm text-gray-600">
            {labels.join(", ") || "—"}
            {remaining > 0 ? ` +${remaining}` : ""}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (row) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => openModal(row)}>
            <Pencil size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={row.status === "active" ? "text-red-600" : "text-green-600"}
            onClick={() => handleToggleStatus(row)}
          >
            <Power size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:bg-red-50"
            onClick={() => handleDelete(getVehicleId(row))}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="just-order-theme-scope space-y-6 max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
      <PageHeader
        title="Vehicle Configuration"
        description="Create vehicle types and configure required onboarding documents"
        actions={
          <Button className="gap-2" onClick={() => openModal()}>
            <Plus size={16} /> Add Vehicle
          </Button>
        }
      />

      <SectionCard flush>
        <div className="p-4 space-y-4">
          <FilterBar
            start={
              <div className="flex flex-wrap gap-2 w-full">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search vehicles..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <select
                  className={selectCls}
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            }
          />
          <AdminTable
            columns={columns}
            data={pageItems}
            loading={loading}
            getRowId={(row) => getVehicleId(row)}
            emptyState={{
              title: "No vehicles yet",
              description: "Add your first vehicle type to start configuring documents.",
              action: (
                <Button className="gap-2" onClick={() => openModal()}>
                  <Plus size={16} /> Add Vehicle
                </Button>
              ),
            }}
            pagination={{
              page: safePage,
              totalPages,
              total,
              pageSize,
              onPageChange: setPage,
              onPageSizeChange: (size) => {
                setPageSize(size);
                setPage(1);
              },
            }}
          />
        </div>
      </SectionCard>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="just-order-theme-scope sm:max-w-[640px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle>
          </DialogHeader>

          <div className="px-6 py-4 space-y-5">
            <FormLayout>
              <FormSection title="Vehicle Details">
                <FormRow>
                  <FormField label="Category" error={errors.category}>
                    <Input
                      value={form.category}
                      onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value, name: e.target.value }))}
                      placeholder="e.g. Sedan, Mini"
                    />
                  </FormField>
                  <FormField label="Display Order">
                    <Input
                      type="number"
                      value={form.displayOrder}
                      onChange={(e) => setForm((prev) => ({ ...prev, displayOrder: e.target.value }))}
                    />
                  </FormField>
                </FormRow>
                
                <FormRow>
                  <FormField label="Status" error={errors.status}>
                    <select
                      className={selectCls + " w-full"}
                      value={form.status}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, status: e.target.value }))
                      }
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </FormField>
                </FormRow>

                <FormField label="Vehicle Icon / Image">
                  <div className="flex items-center gap-4">
                    <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-gray-300 bg-gray-50">
                      {iconPreview ? (
                        <img
                          src={iconPreview}
                          alt="Vehicle icon"
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <Truck className="h-7 w-7 text-gray-400" />
                      )}
                    </div>
                    <div className="space-y-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload size={14} /> Upload Icon
                      </Button>
                      {iconPreview && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="gap-2 text-red-600"
                          onClick={() => {
                            setIconFile(null);
                            setIconPreview("");
                          }}
                        >
                          <X size={14} /> Remove
                        </Button>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleIconChange}
                      />
                    </div>
                  </div>
                </FormField>
              </FormSection>

              <FormSection title="Onboarding Documents (Required / Optional)">
                {errors.documents && (
                  <p className="mb-3 text-xs text-red-600">{errors.documents}</p>
                )}
                <p className="mb-3 text-xs text-muted-foreground">
                  Checked documents appear on the driver Documents step for this
                  vehicle. Mark each as Required or Optional.
                </p>
                <div className="space-y-2">
                  {documentTypes.map((docType) => {
                    const selected = selectedDocumentMap.get(docType.key);
                    const checked = Boolean(selected);
                    return (
                      <div
                        key={docType.key}
                        className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <label className="flex items-center gap-3 text-sm font-medium text-gray-800">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-[var(--just-order-primary)] focus:ring-[var(--just-order-primary)]"
                            checked={checked}
                            onChange={(e) =>
                              toggleDocument(docType.key, e.target.checked)
                            }
                          />
                          {docType.label}
                        </label>
                        {checked && (
                          <select
                            className={selectCls}
                            value={selected.required === false ? "optional" : "required"}
                            onChange={(e) =>
                              setDocumentRequired(
                                docType.key,
                                e.target.value === "required",
                              )
                            }
                          >
                            <option value="required">Required</option>
                            <option value="optional">Optional</option>
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              </FormSection>
            </FormLayout>
          </div>

          <div className="px-6 py-4 border-t flex justify-end gap-2 bg-gray-50/50">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} isLoading={saving}>
              {editing ? "Save Changes" : "Create Vehicle"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
