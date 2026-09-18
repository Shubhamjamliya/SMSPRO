import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Loader2, MapPin, Pencil, Wrench, X } from "lucide-react";
import MediaUploadField from "@/modules/bikeRent/shared/components/MediaUploadField";
import ServiceProviderLayout from "../components/ServiceProviderLayout";
import serviceProviderApi from "../services/providerApi";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const when = (value) => (value ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");

const EMPTY_REQUEST_FORM = {
  requestedName: "",
  categoryId: "",
  reason: "",
  icon: "",
  description: "",
  requestedStatus: "active",
  basePrice: "",
  providerPrice: "",
  // Optional service under a new category request
  serviceName: "",
  serviceDescription: "",
  serviceIcon: "",
  includeService: false,
};

const STATUS_STYLES = {
  approved: "bg-emerald-50 text-emerald-600",
  pending: "bg-amber-50 text-amber-600",
  rejected: "bg-red-50 text-red-600",
};
const STATUS_LABELS = { approved: "Approved", pending: "Pending", rejected: "Changes needed" };

function StatusPill({ status }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLES[status] || "bg-gray-100 text-gray-500"}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function Modal({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-600 flex items-center justify-center bg-black/30 px-4 backdrop-blur-[2px]">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-gray-100 bg-white p-5 shadow-2xl sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputClass = "w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/15";
const labelClass = "mb-1.5 block text-xs font-bold text-gray-600";
const linkBtnClass = "text-xs font-bold text-[#FF6A00] hover:underline";

export default function ServiceProviderMyServicesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [providerZone, setProviderZone] = useState(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  /** @type {Record<string, string|number>} serviceId -> provider price */
  const [selected, setSelected] = useState({});

  const [requestsLoading, setRequestsLoading] = useState(true);
  const [categoryRequests, setCategoryRequests] = useState([]);
  const [serviceRequests, setServiceRequests] = useState([]);

  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState(EMPTY_REQUEST_FORM);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, svcs, dashboard] = await Promise.all([
        serviceProviderApi.getCategoryCatalog(),
        serviceProviderApi.getServiceCatalog(),
        serviceProviderApi.getDashboard(),
      ]);
      setCategories(cats);
      setServices(svcs);
      setProviderZone(dashboard.provider?.zone || null);

      const map = {};
      (dashboard.services || []).forEach((s) => {
        const id = s.serviceId?._id || s.serviceId;
        if (!id) return;
        map[id] = s.price ?? "";
      });
      setSelected(map);

      const firstSelectedId = Object.keys(map)[0];
      const firstSelectedSvc = firstSelectedId ? svcs.find((s) => s._id === firstSelectedId) : null;
      const existingCategoryId = firstSelectedSvc?.categoryId?._id || firstSelectedSvc?.categoryId || "";
      setSelectedCategoryId((current) => existingCategoryId || current || cats[0]?._id || "");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not load services");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const [cats, svcs] = await Promise.all([
        serviceProviderApi.getMyCategoryRequests(),
        serviceProviderApi.getMyServiceRequests(),
      ]);
      setCategoryRequests(cats);
      setServiceRequests(svcs);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not load your requests");
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadRequests();
  }, [load, loadRequests]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c._id === selectedCategoryId) || null,
    [categories, selectedCategoryId],
  );

  const servicesInCategory = useMemo(
    () => services.filter((svc) => (svc.categoryId?._id || svc.categoryId) === selectedCategoryId),
    [services, selectedCategoryId],
  );

  const selectedCount = Object.keys(selected).length;
  const hasActiveZone = Boolean(providerZone && providerZone.status === "active");

  const myRequests = useMemo(() => {
    const cats = categoryRequests.map((r) => ({
      _id: r._id,
      type: "category",
      requestedName: r.requestedName,
      categoryName: null,
      reason: r.reason,
      status: r.status,
      rejectionReason: r.rejectionReason,
      createdAt: r.createdAt,
      raw: r,
    }));
    const svcs = serviceRequests.map((r) => ({
      _id: r._id,
      type: "service",
      requestedName: r.requestedName,
      categoryName: r.categoryId?.name || null,
      reason: r.reason,
      status: r.status,
      rejectionReason: r.rejectionReason,
      createdAt: r.createdAt,
      raw: r,
    }));
    return [...cats, ...svcs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [categoryRequests, serviceRequests]);

  const hasPendingDuplicate = useMemo(() => {
    const name = form.requestedName.trim().toLowerCase();
    if (!name) return false;
    const pool = dialog?.type === "category" ? categoryRequests : serviceRequests;
    return pool.some(
      (r) => r.status === "pending" && r.requestedName.trim().toLowerCase() === name && r._id !== dialog?.requestId,
    );
  }, [form.requestedName, dialog, categoryRequests, serviceRequests]);

  const toggleService = (svc) => {
    if (!hasActiveZone) {
      return toast.error("You need an active service zone before you can add services");
    }
    const checked = svc._id in selected;
    if (!checked && svc.status !== "active") {
      return toast.error("This service is no longer active and can't be added");
    }
    setSelected((current) => {
      const next = { ...current };
      if (svc._id in next) delete next[svc._id];
      else next[svc._id] = "";
      return next;
    });
  };

  const changeCategory = (nextCategoryId) => {
    if (nextCategoryId === selectedCategoryId) return;
    if (selectedCount > 0) {
      toast.message("Switched category — your previous selections were cleared");
      setSelected({});
    }
    setSelectedCategoryId(nextCategoryId);
  };

  const saveServices = async () => {
    if (selectedCount > 0 && !hasActiveZone) {
      return toast.error("You need an active service zone before you can add services");
    }

    for (const [serviceId, price] of Object.entries(selected)) {
      if (price === "" || Number.isNaN(Number(price)) || Number(price) <= 0) {
        const svc = services.find((s) => s._id === serviceId);
        return toast.error(`Enter your price (greater than ₹0) for ${svc?.name || "each service you've added"}`);
      }
    }

    setSaving(true);
    try {
      const payload = Object.entries(selected).map(([serviceId, price]) => ({
        serviceId,
        price: Number(price),
      }));
      await serviceProviderApi.updateServices(payload);
      toast.success("Services updated");
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not save services");
    } finally {
      setSaving(false);
    }
  };

  const openCreateCategory = () => {
    setDialog({ type: "category", mode: "create" });
    setForm(EMPTY_REQUEST_FORM);
  };

  const openCreateService = () => {
    setDialog({ type: "service", mode: "create" });
    setForm({ ...EMPTY_REQUEST_FORM, categoryId: selectedCategoryId });
  };

  const openResubmit = (row) => {
    setDialog({ type: row.type, mode: "resubmit", requestId: row._id });
    setForm({
      requestedName: row.requestedName,
      categoryId: row.type === "service" ? (row.raw.categoryId?._id || row.raw.categoryId || "") : "",
      reason: row.reason || "",
      icon: row.raw.icon || "",
      description: row.raw.description || "",
      requestedStatus: row.raw.requestedStatus || "active",
      basePrice: row.type === "service" || row.raw.serviceName ? String(row.raw.basePrice ?? "") : "",
      providerPrice: row.type === "service" || row.raw.serviceName ? String(row.raw.providerPrice ?? "") : "",
      serviceName: row.raw.serviceName || "",
      serviceDescription: row.raw.serviceDescription || "",
      serviceIcon: row.raw.serviceIcon || "",
      includeService: Boolean(row.raw.serviceName),
    });
  };

  const closeDialog = () => {
    setDialog(null);
    setForm(EMPTY_REQUEST_FORM);
  };

  const submitDialog = async () => {
    const name = form.requestedName.trim();
    if (!name) return toast.error(`Enter the ${dialog.type} name`);
    if (dialog.type === "service" && !form.categoryId) return toast.error("Select a category");
    const needsPricing = dialog.type === "service" || (dialog.type === "category" && form.includeService);
    if (needsPricing) {
      if (form.providerPrice === "" || Number.isNaN(Number(form.providerPrice)) || Number(form.providerPrice) <= 0) {
        return toast.error("Enter your price (must be greater than ₹0)");
      }
      if (!hasActiveZone) return toast.error("You need an active service zone to request a service");
    }
    if (dialog.type === "category" && form.includeService && !form.serviceName.trim()) {
      return toast.error("Enter the service name");
    }
    if (hasPendingDuplicate) return toast.error("You already have a pending request with this name");

    const zoneIds = providerZone ? [providerZone._id] : [];

    setSubmitting(true);
    try {
      if (dialog.type === "category") {
        const payload = {
          requestedName: name,
          reason: form.reason.trim(),
          icon: form.icon,
          description: form.description.trim(),
          requestedStatus: form.requestedStatus,
        };
        if (form.includeService) {
          Object.assign(payload, {
            serviceName: form.serviceName.trim(),
            serviceDescription: form.serviceDescription.trim(),
            serviceIcon: form.serviceIcon,
            basePrice: form.basePrice === "" ? 0 : Number(form.basePrice),
            providerPrice: Number(form.providerPrice),
            zoneIds,
          });
        }
        if (dialog.mode === "create") {
          await serviceProviderApi.requestNewCategory(payload);
          toast.success("Category request sent to admin for review");
        } else {
          await serviceProviderApi.resubmitCategoryRequest(dialog.requestId, payload);
          toast.success("Request resubmitted for admin review");
        }
      } else {
        const payload = {
          requestedName: name,
          categoryId: form.categoryId,
          reason: form.reason.trim(),
          icon: form.icon,
          description: form.description.trim(),
          requestedStatus: form.requestedStatus,
          basePrice: form.basePrice === "" ? 0 : Number(form.basePrice),
          providerPrice: Number(form.providerPrice),
          zoneIds,
        };
        if (dialog.mode === "create") {
          await serviceProviderApi.requestNewService(payload);
          toast.success("Service request sent to admin for review");
        } else {
          await serviceProviderApi.resubmitServiceRequest(dialog.requestId, payload);
          toast.success("Request resubmitted for admin review");
        }
      }
      closeDialog();
      loadRequests();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Could not send request");
    } finally {
      setSubmitting(false);
    }
  };

  const dialogTitle = () => {
    if (!dialog) return "";
    const noun = dialog.type === "category" ? "category" : "service";
    return dialog.mode === "create" ? `Request a new ${noun}` : `Edit & resubmit ${noun} request`;
  };

  return (
    <ServiceProviderLayout
      title="My Services"
      subtitle="Pick services from the Admin catalog and set your own price. Admin controls the catalog itself."
      fullWidth
    >
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-5">
          {!hasActiveZone ? (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-bold">Active service zone required</p>
                <p className="mt-0.5 text-amber-800">
                  {providerZone
                    ? `Your assigned zone (${providerZone.name}) is currently inactive — contact support.`
                    : "No service zone is assigned to your account yet — contact support."}
                </p>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 p-4 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF6A00]/10 text-[#FF6A00]">
                  <Wrench className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-extrabold text-gray-900">Your services</h2>
                  <p className="flex items-center gap-1 text-xs text-gray-500">
                    {selectedCount} service{selectedCount === 1 ? "" : "s"}
                    {providerZone ? (
                      <>
                        {" "}
                        · <MapPin className="h-3 w-3" /> {providerZone.name}
                      </>
                    ) : null}
                  </p>
                </div>
              </div>
            </div>

            {categories.length === 0 ? (
              <div className="p-4 sm:p-6">
                <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                  No categories available yet.{" "}
                  <button type="button" onClick={openCreateCategory} className={linkBtnClass}>
                    Category not available? Request a new category
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid lg:grid-cols-[260px_1fr]">
                <div className="border-b border-gray-100 p-4 lg:border-b-0 lg:border-r sm:p-6">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">Category</p>
                  <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
                    {categories.map((cat) => (
                      <button
                        key={cat._id}
                        type="button"
                        onClick={() => changeCategory(cat._id)}
                        className={`shrink-0 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors lg:w-full ${
                          selectedCategoryId === cat._id
                            ? "bg-[#FF6A00] text-white"
                            : "bg-gray-50 text-gray-700 hover:bg-orange-50 hover:text-[#FF6A00] lg:bg-transparent"
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-gray-400">One category at a time. Each service needs your price.</p>
                  <button type="button" onClick={openCreateCategory} className={`mt-3 block ${linkBtnClass}`}>
                    Category not available? Request a new category
                  </button>
                </div>

                <div className="p-4 sm:p-6">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
                      Services in {selectedCategory?.name || "this category"}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {servicesInCategory.map((svc) => {
                      const checked = svc._id in selected;
                      const price = selected[svc._id];
                      const isStale = svc.status !== "active";
                      return (
                        <div
                          key={svc._id}
                          className={`rounded-xl border p-3 transition-colors ${
                            checked ? (isStale ? "border-red-200 bg-red-50/40" : "border-[#FF6A00] bg-orange-50/40") : "border-gray-100"
                          }`}
                        >
                          <label className={`flex items-start gap-2.5 ${isStale && !checked ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={isStale && !checked}
                              onChange={() => toggleService(svc)}
                              className="mt-0.5 h-4 w-4 shrink-0 accent-[#FF6A00]"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-gray-800">{svc.name}</span>
                              <span className="block text-xs text-gray-400">Admin price: {money(svc.basePrice)}</span>
                              {isStale ? (
                                <span className="mt-0.5 block text-[11px] font-semibold text-red-600">
                                  No longer active in your zone — remove it
                                </span>
                              ) : null}
                            </span>
                          </label>
                          {checked ? (
                            <div className="mt-2.5 border-t border-orange-100/80 pt-2.5">
                              <span className="mb-1 block text-[11px] font-bold text-[#FF6A00]">Your price</span>
                              <input
                                type="number"
                                min="0"
                                placeholder="₹ — required"
                                className={inputClass}
                                value={price}
                                onChange={(e) =>
                                  setSelected((cur) => ({ ...cur, [svc._id]: e.target.value }))
                                }
                              />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    {!servicesInCategory.length ? (
                      <p className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs text-gray-500 sm:col-span-2 xl:col-span-3">
                        No services in this category yet.{" "}
                        <button type="button" onClick={openCreateService} className={linkBtnClass}>
                          Service not available? Request a new service
                        </button>
                      </p>
                    ) : null}
                  </div>

                  {servicesInCategory.length ? (
                    <button type="button" onClick={openCreateService} className={`mt-3 block ${linkBtnClass}`}>
                      Service not available? Request a new service
                    </button>
                  ) : null}

                  <div className="mt-5 flex flex-col-reverse items-center justify-between gap-3 border-t border-gray-100 pt-4 sm:flex-row">
                    <p className="text-[11px] text-gray-400">
                      Customers see Admin price only · Your price stays private
                    </p>
                    <button
                      type="button"
                      onClick={saveServices}
                      disabled={saving || (!hasActiveZone && selectedCount > 0)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF6A00] py-2.5 text-sm font-bold text-white disabled:opacity-60 sm:w-auto sm:px-6"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Save changes
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {!requestsLoading && myRequests.length > 0 ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
              <h2 className="mb-3 text-sm font-extrabold text-gray-900">My requests</h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {myRequests.map((row) => (
                  <div key={`${row.type}-${row._id}`} className="rounded-xl border border-gray-100 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-gray-900">{row.requestedName}</p>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">
                          {row.type === "category" ? "Category" : row.categoryName || "Service"} · {when(row.createdAt)}
                        </p>
                      </div>
                      <StatusPill status={row.status} />
                    </div>
                    {row.status === "rejected" ? (
                      <div className="mt-2 space-y-1.5">
                        <p className="flex items-start gap-1 text-xs text-red-600">
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {row.rejectionReason || "No reason provided"}
                        </p>
                        <button
                          type="button"
                          onClick={() => openResubmit(row)}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-bold text-gray-600 hover:bg-gray-50"
                        >
                          <Pencil className="h-3 w-3" /> Edit & resubmit
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      <Modal open={Boolean(dialog)} title={dialogTitle()} onClose={closeDialog}>
        <div className="space-y-3">
          <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
            This only sends a request — nothing is added to the catalog until Admin reviews and approves it.
          </p>

          {dialog?.type === "service" ? (
            <div>
              <label className={labelClass}>
                Category<span className="ml-0.5 text-red-500">*</span>
              </label>
              <select
                className={inputClass}
                value={form.categoryId}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
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
            </div>
          ) : null}

          <div>
            <label className={labelClass}>
              {dialog?.type === "category" ? "Category name" : "Service name"}
              <span className="ml-0.5 text-red-500">*</span>
            </label>
            <input
              className={inputClass}
              placeholder={dialog?.type === "category" ? "e.g. Pest Control" : "e.g. AC Repair"}
              value={form.requestedName}
              onChange={(e) => setForm((f) => ({ ...f, requestedName: e.target.value }))}
            />
          </div>

          {dialog?.type === "category" ? (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="accent-[#FF6A00]"
                checked={form.includeService}
                onChange={(e) => setForm((f) => ({ ...f, includeService: e.target.checked }))}
              />
              Also request a first service under this category
            </label>
          ) : null}

          {dialog?.type === "category" && form.includeService ? (
            <div>
              <label className={labelClass}>
                Service name<span className="ml-0.5 text-red-500">*</span>
              </label>
              <input
                className={inputClass}
                placeholder="e.g. AC Repair"
                value={form.serviceName}
                onChange={(e) => setForm((f) => ({ ...f, serviceName: e.target.value }))}
              />
            </div>
          ) : null}

          {(dialog?.type === "service" || (dialog?.type === "category" && form.includeService)) ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Suggested admin price (₹)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Customer price"
                    className={inputClass}
                    value={form.basePrice}
                    onChange={(e) => setForm((f) => ({ ...f, basePrice: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Your price (₹)<span className="ml-0.5 text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Your own price"
                    className={inputClass}
                    value={form.providerPrice}
                    onChange={(e) => setForm((f) => ({ ...f, providerPrice: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <span className={labelClass}>Zone</span>
                <p className="flex items-center gap-1.5 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
                  <MapPin className="h-3.5 w-3.5 text-gray-400" />
                  {providerZone ? providerZone.name : "No active zone assigned"}
                </p>
              </div>
              <p className="text-[11px] text-gray-400">
                Admin sets the final customer-facing price on approval. Your price is only visible to you and admin.
              </p>
            </>
          ) : null}

          <div>
            <label className={labelClass}>Status</label>
            <select
              className={inputClass}
              value={form.requestedStatus}
              onChange={(e) => setForm((f) => ({ ...f, requestedStatus: e.target.value }))}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <MediaUploadField
            label={dialog?.type === "category" ? "Category image" : "Service image"}
            helperText="Optional"
            value={form.icon}
            onChange={(next) => setForm((f) => ({ ...f, icon: next }))}
            folder="service-provider/requests"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            disabled={submitting}
          />

          <div>
            <label className={labelClass}>Description</label>
            <textarea
              rows={2}
              placeholder="Short description (optional)"
              className={inputClass}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          {hasPendingDuplicate ? (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-600">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              You already have a pending request with this name.
            </p>
          ) : null}

          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {dialog?.mode === "resubmit"
              ? "Fix the issue admin flagged, then resubmit — it goes back to admin for review."
              : "Reviewed by admin before it becomes available."}
          </p>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={closeDialog}
              disabled={submitting}
              className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-bold text-gray-600 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitDialog}
              disabled={submitting || hasPendingDuplicate}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#FF6A00] py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {dialog?.mode === "create" ? "Send request" : "Resubmit"}
            </button>
          </div>
        </div>
      </Modal>
    </ServiceProviderLayout>
  );
}
