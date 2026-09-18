import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Pencil, Plus, Search, Trash2, Users, Wrench } from "lucide-react";
import { PageHeader, AdminTable, StatusBadge } from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import MediaUploadField from "@/modules/bikeRent/shared/components/MediaUploadField";
import serviceProviderAdminApi from "../services/adminApi";
import { SP_ADMIN_PAGE_CLASS, SP_ADMIN_SELECT_CLASS } from "../utils/adminTheme";

const errorMessage = (error, fallback) => error?.response?.data?.message || fallback;
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const EMPTY = {
  categoryId: "",
  name: "",
  icon: "",
  description: "",
  basePrice: "",
  duration: "",
  status: "active",
  zoneIds: [],
};


function PriceCell({ value }) {
  if (Number(value) > 0) return <span>{money(value)}</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
      <AlertTriangle className="h-3 w-3" /> No price set
    </span>
  );
}

const DIALOG_CONTENT_CLASS =
  "just-order-theme-scope flex w-[calc(100%-1rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 " +
  "max-h-[min(90dvh,720px)] rounded-2xl sm:w-full";

function ServiceThumb({ icon }) {
  return icon ? (
    <img
      src={icon}
      alt=""
      className="h-10 w-10 shrink-0 rounded-lg border border-gray-200 bg-white object-cover"
    />
  ) : (
    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-300">
      <Wrench className="h-4.5 w-4.5" />
    </span>
  );
}

export default function Services() {
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [viewingProvidersFor, setViewingProvidersFor] = useState(null);
  const [providerRows, setProviderRows] = useState([]);
  const [providersLoading, setProvidersLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [services, cats, zonesResult] = await Promise.all([
        serviceProviderAdminApi.getServices(),
        serviceProviderAdminApi.getCategories(),
        serviceProviderAdminApi.getZones({ status: "active" }),
      ]);
      setRows(services);
      setCategories(cats);
      setZones(zonesResult.records || []);
    } catch (error) {
      toast.error(errorMessage(error, "Could not load services"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) => row.name?.toLowerCase().includes(q) || row.categoryId?.name?.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY, categoryId: categories[0]?._id || "" });
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      categoryId: row.categoryId?._id || row.categoryId || "",
      name: row.name || "",
      icon: row.icon || "",
      description: row.description || "",
      basePrice: String(row.basePrice ?? ""),
      duration: row.duration != null ? String(row.duration) : "",
      status: row.status || "active",
      zoneIds: (row.zoneIds || row.zones || []).map((z) => String(z._id || z)),
    });
    setErrors({});
    setModalOpen(true);
  };

  const toggleZone = (zoneId) => {
    setForm((prev) => {
      const set = new Set((prev.zoneIds || []).map(String));
      if (set.has(String(zoneId))) set.delete(String(zoneId));
      else set.add(String(zoneId));
      return { ...prev, zoneIds: [...set] };
    });
    setErrors((prev) => (prev.zoneIds ? { ...prev, zoneIds: undefined } : prev));
  };

  const save = async () => {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = "Service name is required";
    if (!form.categoryId) nextErrors.categoryId = "Select a category";
    if (form.basePrice === "" || Number.isNaN(Number(form.basePrice)) || Number(form.basePrice) <= 0) {
      nextErrors.basePrice = "Price is required and must be greater than ₹0";
    }
    if (!form.zoneIds?.length) nextErrors.zoneIds = "Select at least one zone";
    if (form.duration !== "" && (Number.isNaN(Number(form.duration)) || Number(form.duration) < 0)) {
      nextErrors.duration = "Enter a valid duration in minutes";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    try {
      const payload = {
        categoryId: form.categoryId,
        name: form.name.trim(),
        icon: form.icon || "",
        description: form.description.trim(),
        basePrice: Number(form.basePrice),
        duration: form.duration === "" ? null : Number(form.duration),
        status: form.status || "active",
        zoneIds: form.zoneIds,
      };
      if (editing) {
        await serviceProviderAdminApi.updateService(editing._id, payload);
        toast.success("Service updated");
      } else {
        await serviceProviderAdminApi.createService(payload);
        toast.success("Service created");
      }
      setModalOpen(false);
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not save service"));
    } finally {
      setSaving(false);
    }
  };

  const openProviders = async (row) => {
    setViewingProvidersFor(row);
    setProvidersLoading(true);
    try {
      const providers = await serviceProviderAdminApi.getServiceProviders(row._id);
      setProviderRows(providers);
    } catch (error) {
      toast.error(errorMessage(error, "Could not load providers"));
      setProviderRows([]);
    } finally {
      setProvidersLoading(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await serviceProviderAdminApi.deleteService(deleting._id);
      toast.success("Service deleted");
      setDeleting(null);
      load();
    } catch (error) {
      toast.error(errorMessage(error, "Could not delete service"));
    } finally {
      setDeletingBusy(false);
    }
  };

  const columns = [
    {
      key: "name",
      header: "Service",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <ServiceThumb icon={row.icon} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">{row.name}</p>
            {row.description ? <p className="truncate text-xs text-gray-500">{row.description}</p> : null}
          </div>
        </div>
      ),
    },
    { key: "category", header: "Category", cell: (row) => row.categoryId?.name || "—" },
    {
      key: "zones",
      header: "Zones",
      cell: (row) => {
        const names = (row.zones || []).map((z) => z.name).filter(Boolean);
        if (!names.length) return <span className="text-xs text-red-600">No zones</span>;
        return <span className="text-xs text-gray-600">{names.join(", ")}</span>;
      },
    },
    { key: "basePrice", header: "Base price", cell: (row) => <PriceCell value={row.basePrice} /> },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: "providers",
      header: "Providers",
      cell: (row) => (
        <button
          type="button"
          onClick={() => openProviders(row)}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-600 hover:border-[#FF6A00] hover:text-[#FF6A00]"
          title="View providers offering this service"
        >
          <Users className="h-3.5 w-3.5" /> {row.providerCount ?? 0}
        </button>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <div className="flex justify-end gap-1.5">
          <Button variant="outline" size="sm" onClick={() => openEdit(row)} title="Edit service">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleting(row)}
            title="Delete service"
            className="border-red-200 text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const renderMobileCard = (row) => (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
      <div className="flex items-start gap-3">
        <ServiceThumb icon={row.icon} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold text-gray-900">{row.name}</p>
              <p className="flex items-center gap-1 text-xs text-gray-500">
                {row.categoryId?.name || "—"} · <PriceCell value={row.basePrice} />
              </p>
            </div>
            <StatusBadge status={row.status} />
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-1.5 border-t border-gray-200/80 pt-2">
        <Button size="sm" variant="outline" className="h-8 flex-1 text-xs" onClick={() => openEdit(row)}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
        </Button>
        <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => openProviders(row)}>
          <Users className="mr-1.5 h-3.5 w-3.5" /> {row.providerCount ?? 0}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 border-red-200 px-2.5 text-red-600"
          onClick={() => setDeleting(row)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className={SP_ADMIN_PAGE_CLASS}>
      <PageHeader
        title="Services"
        description="Services providers can offer (e.g. AC Repair, Plumbing)."
        actions={
          <Button onClick={openCreate} disabled={!categories.length || !zones.length}>
            <Plus className="mr-1.5 h-4 w-4" /> Add service
          </Button>
        }
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Search services…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <AdminTable
        columns={columns}
        data={filteredRows}
        loading={loading}
        skeletonRows={5}
        getRowId={(row) => row._id}
        renderMobileCard={renderMobileCard}
        emptyState={{
          icon: <Wrench className="h-10 w-10" />,
          title: search ? "No services match your search" : "No services yet",
          description: search
            ? "Try a different search term."
            : categories.length
              ? zones.length
                ? "Add your first service to get started."
                : "Create and activate a zone first."
              : "Create a category first.",
        }}
      />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className={DIALOG_CONTENT_CLASS}>
          <DialogHeader className="shrink-0 border-b border-gray-100 px-4 py-3.5 pr-12 text-left sm:px-5">
            <DialogTitle className="text-base">{editing ? "Edit service" : "Add service"}</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
            <label className="block text-sm">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                Category<span className="ml-0.5 text-red-500">*</span>
              </span>
              <select
                className={SP_ADMIN_SELECT_CLASS}
                value={form.categoryId}
                onChange={(e) => setField("categoryId", e.target.value)}
                disabled={saving}
              >
                <option value="" disabled>
                  Select a category
                </option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {errors.categoryId ? <p className="mt-1 text-xs text-red-600">{errors.categoryId}</p> : null}
            </label>

            <Input
              label={
                <>
                  Name<span className="ml-0.5 text-red-500">*</span>
                </>
              }
              placeholder="e.g. AC Repair"
              value={form.name}
              error={errors.name}
              onChange={(e) => setField("name", e.target.value)}
              disabled={saving}
            />

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">
                  Base price<span className="ml-0.5 text-red-500">*</span>
                </span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                    ₹
                  </span>
                  <Input
                    className="pl-7"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={form.basePrice}
                    error={errors.basePrice}
                    onChange={(e) => setField("basePrice", e.target.value)}
                    disabled={saving}
                  />
                </div>
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">Status</span>
                <select
                  className={SP_ADMIN_SELECT_CLASS}
                  value={form.status}
                  onChange={(e) => setField("status", e.target.value)}
                  disabled={saving}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-sm font-medium text-gray-700">Duration (minutes)</span>
                <Input
                  type="number"
                  min="0"
                  placeholder="Optional — e.g. 60"
                  value={form.duration}
                  error={errors.duration}
                  onChange={(e) => setField("duration", e.target.value)}
                  disabled={saving}
                />
              </label>
            </div>

            <div>
              <span className="mb-1.5 block text-sm font-medium text-gray-700">
                Available zones<span className="ml-0.5 text-red-500">*</span>
              </span>
              {zones.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-200 px-3 py-2 text-xs text-gray-500">
                  No active zones yet. Create and activate a zone first.
                </p>
              ) : (
                <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-gray-200 p-2">
                  {zones.map((zone) => {
                    const checked = form.zoneIds.map(String).includes(String(zone._id));
                    return (
                      <label
                        key={zone._id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                          checked ? "bg-orange-50 text-gray-900" : "hover:bg-gray-50 text-gray-700"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="accent-[#FF6A00]"
                          checked={checked}
                          onChange={() => toggleZone(zone._id)}
                          disabled={saving}
                        />
                        <span className="truncate font-medium">{zone.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              {errors.zoneIds ? <p className="mt-1 text-xs text-red-600">{errors.zoneIds}</p> : null}
              {form.zoneIds.length > 0 ? (
                <p className="mt-1.5 text-[11px] text-gray-400">
                  {form.zoneIds.length} zone{form.zoneIds.length === 1 ? "" : "s"} selected — customers only see this
                  service in these zones.
                </p>
              ) : null}
            </div>

            <MediaUploadField
              label="Service image"
              helperText="Optional — shown to providers and customers"
              value={form.icon}
              onChange={(next) => setField("icon", next)}
              folder="service-provider/services"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              disabled={saving}
            />

            <label className="block text-sm">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">Description</span>
              <Textarea
                placeholder="Short description (optional)"
                rows={3}
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                disabled={saving}
              />
            </label>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-gray-100 px-4 py-3 sm:px-5">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" isLoading={saving} onClick={save}>
              {editing ? "Save changes" : "Create service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className={`${DIALOG_CONTENT_CLASS} max-w-md`}>
          <DialogHeader className="shrink-0 border-b border-gray-100 px-4 py-3.5 pr-12 text-left sm:px-5">
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Delete service
            </DialogTitle>
          </DialogHeader>
          <div className="px-4 py-4 sm:px-5">
            <p className="text-sm text-gray-600">
              Delete <strong className="text-gray-900">{deleting?.name}</strong>? This cannot be undone.
            </p>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-gray-100 px-4 py-3 sm:px-5">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setDeleting(null)}
              disabled={deletingBusy}
            >
              Cancel
            </Button>
            <Button variant="danger" className="w-full sm:w-auto" isLoading={deletingBusy} onClick={remove}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(viewingProvidersFor)} onOpenChange={(open) => !open && setViewingProvidersFor(null)}>
        <DialogContent className={`${DIALOG_CONTENT_CLASS} max-w-md`}>
          <DialogHeader className="shrink-0 border-b border-gray-100 px-4 py-3.5 pr-12 text-left sm:px-5">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5 text-[#FF6A00]" />
              Providers offering {viewingProvidersFor?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            {providersLoading ? (
              <p className="py-6 text-center text-sm text-gray-400">Loading…</p>
            ) : providerRows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-500">
                No providers are currently offering this service.
              </p>
            ) : (
              <div className="space-y-2">
                {providerRows.map((p) => (
                  <div key={p.providerId} className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">{p.ownerName}</p>
                      <p className="text-xs text-gray-400">{p.providerCode} · {p.phone}</p>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-gray-700">{money(p.price)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-gray-100 px-4 py-3 sm:px-5">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setViewingProvidersFor(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
