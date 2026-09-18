import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Bike as BikeIcon } from "lucide-react";
import VendorLayout from "../components/VendorLayout";
import VendorModal from "../components/VendorModal";
import { bikeVendorApi } from "../services/vendorApi";
import MediaUploadField from "../../shared/components/MediaUploadField";
import BikeSettingsOverridePanel from "../../shared/components/BikeSettingsOverridePanel";
import {
  BIKE_FORM_LIMITS as LIMITS,
  EMPTY_BIKE_FORM,
  buildBikePayload,
  getBikeEntityId as getId,
  normalizeBikeForm,
  revokeBikeFormMedia,
  trimBikeValue as trimValue,
  uploadBikeFormMedia,
  validateBikeForm,
} from "../../shared/utils/bikeForm";

const message = (error, fallback) => error?.response?.data?.message || fallback;

export default function VendorBikes() {
  const [bikes, setBikes] = useState([]);
  const [zones, setZones] = useState([]);
  const [categories, setCategories] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [hubsLoading, setHubsLoading] = useState(false);
  const [documentCatalog, setDocumentCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingBike, setEditingBike] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [form, setForm] = useState(EMPTY_BIKE_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [savePhase, setSavePhase] = useState("");
  const formRef = useRef(form);
  formRef.current = form;

  const loadBikes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await bikeVendorApi.getBikes({ limit: 100 });
      setBikes(data.records || []);
    } catch {
      toast.error("Could not load bikes");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLookups = useCallback(async () => {
    try {
      const [zoneList, categoryList, settings] = await Promise.all([
        bikeVendorApi.getPublicZones(),
        bikeVendorApi.getCategoryDropdown(),
        bikeVendorApi.getPublicSettings(),
      ]);
      setZones(Array.isArray(zoneList) ? zoneList : []);
      setCategories(Array.isArray(categoryList) ? categoryList : []);
      setDocumentCatalog(Array.isArray(settings?.documentTypes) ? settings.documentTypes : []);
    } catch {
      toast.error("Could not load zones/categories");
    }
  }, []);

  useEffect(() => {
    loadBikes();
    loadLookups();
  }, [loadBikes, loadLookups]);

  const loadHubsForZone = useCallback(async (zoneId) => {
    if (!zoneId) {
      setHubs([]);
      setHubsLoading(false);
      return;
    }
    setHubsLoading(true);
    try {
      const list = await bikeVendorApi.getHubDropdown({ zoneId });
      setHubs(Array.isArray(list) ? list : []);
    } catch {
      toast.error("Could not load pickup hubs for this zone");
      setHubs([]);
    } finally {
      setHubsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHubsForZone(form.zoneId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.zoneId]);

  const closeModal = () => {
    revokeBikeFormMedia(formRef.current);
    setModalOpen(false);
    setEditingId(null);
    setEditingBike(null);
    setForm(EMPTY_BIKE_FORM);
    setErrors({});
    setSavePhase("");
  };

  const openCreate = () => {
    revokeBikeFormMedia(formRef.current);
    setEditingId(null);
    setEditingBike(null);
    setForm({ ...EMPTY_BIKE_FORM });
    setErrors({});
    setSavePhase("");
    setModalOpen(true);
  };

  const openEdit = (bike) => {
    revokeBikeFormMedia(formRef.current);
    setEditingId(bike.id);
    setEditingBike(bike);
    setForm(normalizeBikeForm(bike));
    setErrors({});
    setSavePhase("");
    setModalOpen(true);
  };

  const toggleRequiredDocument = (key) => {
    setForm((f) => {
      const current = f.requiredDocuments || [];
      return {
        ...f,
        requiredDocuments: current.includes(key)
          ? current.filter((k) => k !== key)
          : [...current, key],
      };
    });
  };

  const update = (name, value) => {
    setForm((current) => {
      if (name === "zoneId") return { ...current, zoneId: value, hubId: "" };
      if (name === "maintenanceStatus") {
        if (value === "maintenance") {
          return { ...current, maintenanceStatus: value, availabilityStatus: "maintenance" };
        }
        return {
          ...current,
          maintenanceStatus: value,
          availabilityStatus:
            current.availabilityStatus === "maintenance" ? "available" : current.availabilityStatus,
        };
      }
      if (name === "availabilityStatus") {
        if (value === "maintenance") {
          return { ...current, availabilityStatus: value, maintenanceStatus: "maintenance" };
        }
        return {
          ...current,
          availabilityStatus: value,
          maintenanceStatus:
            current.maintenanceStatus === "maintenance" ? "none" : current.maintenanceStatus,
        };
      }
      return { ...current, [name]: value };
    });
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  };

  const updateText = (name, value, { upper = false, max } = {}) => {
    let next = String(value ?? "");
    if (max && next.length > max) next = next.slice(0, max);
    if (upper) next = next.toUpperCase();
    update(name, next);
  };

  const save = async () => {
    const nextErrors = validateBikeForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      toast.error("Please fix the highlighted fields");
      return;
    }

    setSaving(true);
    try {
      let uploadedMedia;
      try {
        uploadedMedia = await uploadBikeFormMedia(form, { onPhase: setSavePhase });
      } catch (err) {
        toast.error(message(err, "Image upload failed. Bike was not saved."));
        setSavePhase("");
        return;
      }

      const payload = buildBikePayload(form, uploadedMedia, documentCatalog);

      setSavePhase(
        editingId && editingBike?.approvalStatus === "rejected"
          ? "Resubmitting…"
          : editingId
            ? "Updating bike…"
            : "Creating bike…",
      );

      if (editingId && editingBike?.approvalStatus === "rejected") {
        await bikeVendorApi.resubmitBike(editingId, payload);
        toast.success("Bike resubmitted for admin approval");
      } else if (editingId) {
        await bikeVendorApi.updateBike(editingId, payload);
        toast.success("Bike updated");
      } else {
        await bikeVendorApi.createBike(payload);
        toast.success("Bike created");
      }

      revokeBikeFormMedia(formRef.current);
      setModalOpen(false);
      setEditingId(null);
      setEditingBike(null);
      setForm(EMPTY_BIKE_FORM);
      setErrors({});
      setSavePhase("");
      loadBikes();
    } catch (err) {
      toast.error(message(err, "Could not save bike"));
      setSavePhase("");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (bike) => {
    try {
      await bikeVendorApi.updateBikeStatus(bike.id, { isActive: !bike.isActive });
      loadBikes();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not update bike");
    }
  };

  const removeBike = async (bike) => {
    if (!window.confirm(`Delete bike "${bike.name}"?`)) return;
    try {
      await bikeVendorApi.deleteBike(bike.id);
      toast.success("Bike deleted");
      loadBikes();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not delete bike");
    }
  };

  const saveLabel = (() => {
    if (saving) return savePhase || "Saving…";
    if (editingId && editingBike?.approvalStatus === "rejected") return "Resubmit for approval";
    return "Save bike";
  })();

  return (
    <VendorLayout
      title="My bikes"
      subtitle="Manage your fleet, pricing, and availability."
      actions={
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#FF6A00] px-3 py-2 text-xs font-bold text-white"
        >
          <Plus className="h-3.5 w-3.5" />
          New bike
        </button>
      }
    >
      {loading ? (
        <p className="text-sm text-gray-500">Loading bikes…</p>
      ) : bikes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          No bikes yet. Add your first bike to start receiving bookings.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bikes.map((bike) => (
            <div key={bike.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BikeIcon className="h-4 w-4 text-[#FF6A00]" />
                  <p className="text-sm font-bold text-gray-900">{bike.name}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      bike.isActive ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {bike.availabilityStatus}
                  </span>
                  {bike.approvalStatus !== "approved" && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        bike.approvalStatus === "rejected"
                          ? "bg-red-50 text-red-600"
                          : "bg-amber-50 text-amber-600"
                      }`}
                    >
                      {bike.approvalStatus}
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {bike.brand} {bike.model} · {bike.registrationNumber}
              </p>
              <p className="mt-1 text-xs text-gray-500">{bike.categoryName} · {bike.hubName}</p>
              <div className="mt-2 flex items-center gap-3 text-xs font-semibold text-gray-700">
                <span>₹{bike.hourlyPrice}/hr</span>
                <span>₹{bike.dailyPrice}/day</span>
              </div>
              {bike.approvalStatus === "rejected" && bike.rejectionReason && (
                <p className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-[11px] text-red-600">
                  {bike.rejectionReason}
                </p>
              )}
              {bike.approvalHistory?.length > 0 && (
                <button
                  type="button"
                  onClick={() => setHistoryFor(historyFor === bike.id ? null : bike.id)}
                  className="mt-1.5 text-[11px] font-bold text-gray-400 hover:text-gray-600"
                >
                  {historyFor === bike.id ? "Hide history" : "View history"}
                </button>
              )}
              {historyFor === bike.id && bike.approvalHistory?.length > 0 && (
                <ol className="mt-2 space-y-1 border-l border-gray-100 pl-3">
                  {bike.approvalHistory.map((h, i) => (
                    <li key={i} className="text-[11px] text-gray-500">
                      <span className="font-bold capitalize text-gray-700">{h.status}</span>
                      {h.changedAt ? ` · ${new Date(h.changedAt).toLocaleString()}` : ""}
                      {h.reason ? ` — ${h.reason}` : ""}
                    </li>
                  ))}
                </ol>
              )}
              <div className="mt-3 flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => toggleActive(bike)}
                  className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-bold text-gray-600 hover:bg-gray-50"
                >
                  {bike.isActive ? "Deactivate" : "Activate"}
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(bike)}
                  className="rounded-lg border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50"
                  title={bike.approvalStatus === "rejected" ? "Edit & resubmit" : "Edit"}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeBike(bike)}
                  className="rounded-lg border border-red-100 p-1.5 text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <VendorModal
        open={modalOpen}
        onClose={() => {
          if (!saving) closeModal();
        }}
        title={
          editingId && editingBike?.approvalStatus === "rejected"
            ? "Edit & resubmit bike"
            : editingId
              ? "Edit bike"
              : "New bike"
        }
        wide
      >
        <div className="space-y-5">
          <FormBlock title="Bike details">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bike name" required error={errors.name}>
                <input
                  className={inputClass(Boolean(errors.name))}
                  value={form.name}
                  maxLength={LIMITS.name}
                  disabled={saving}
                  onChange={(e) => updateText("name", e.target.value, { max: LIMITS.name })}
                  onBlur={() => update("name", trimValue(form.name))}
                />
              </Field>
              <Field label="Brand" required error={errors.brand}>
                <input
                  className={inputClass(Boolean(errors.brand))}
                  value={form.brand}
                  maxLength={LIMITS.brand}
                  disabled={saving}
                  onChange={(e) => updateText("brand", e.target.value, { max: LIMITS.brand })}
                  onBlur={() => update("brand", trimValue(form.brand))}
                />
              </Field>
              <Field label="Model" required error={errors.model}>
                <input
                  className={inputClass(Boolean(errors.model))}
                  value={form.model}
                  maxLength={LIMITS.model}
                  disabled={saving}
                  onChange={(e) => updateText("model", e.target.value, { max: LIMITS.model })}
                  onBlur={() => update("model", trimValue(form.model))}
                />
              </Field>
              <Field label="Category" required error={errors.categoryId}>
                <select
                  className={inputClass(Boolean(errors.categoryId))}
                  value={form.categoryId}
                  disabled={saving}
                  onChange={(e) => update("categoryId", e.target.value)}
                >
                  <option value="">Select…</option>
                  {categories.map((c) => (
                    <option key={getId(c)} value={getId(c)}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Registration number" required error={errors.registrationNumber}>
                <input
                  className={inputClass(Boolean(errors.registrationNumber))}
                  value={form.registrationNumber}
                  maxLength={LIMITS.registrationNumber}
                  disabled={saving}
                  placeholder="e.g. MH12AB1234"
                  onChange={(e) => updateText("registrationNumber", e.target.value, { upper: true, max: LIMITS.registrationNumber })}
                  onBlur={() => update("registrationNumber", trimValue(form.registrationNumber).toUpperCase())}
                />
              </Field>
              <Field label="Engine number" error={errors.engineNumber}>
                <input
                  className={inputClass(Boolean(errors.engineNumber))}
                  value={form.engineNumber}
                  maxLength={LIMITS.engineNumber}
                  disabled={saving}
                  placeholder="Optional"
                  onChange={(e) => updateText("engineNumber", e.target.value, { max: LIMITS.engineNumber })}
                  onBlur={() => update("engineNumber", trimValue(form.engineNumber))}
                />
              </Field>
              <Field label="Chassis number" error={errors.chassisNumber}>
                <input
                  className={inputClass(Boolean(errors.chassisNumber))}
                  value={form.chassisNumber}
                  maxLength={LIMITS.chassisNumber}
                  disabled={saving}
                  placeholder="Optional"
                  onChange={(e) => updateText("chassisNumber", e.target.value, { max: LIMITS.chassisNumber })}
                  onBlur={() => update("chassisNumber", trimValue(form.chassisNumber))}
                />
              </Field>
              <Field label="Seating capacity" required error={errors.seatingCapacity}>
                <input
                  type="number"
                  inputMode="numeric"
                  min={LIMITS.seatingCapacityMin}
                  max={LIMITS.seatingCapacityMax}
                  className={inputClass(Boolean(errors.seatingCapacity))}
                  value={form.seatingCapacity}
                  disabled={saving}
                  onChange={(e) => update("seatingCapacity", e.target.value)}
                />
              </Field>
              <Field label="Fuel type" error={errors.fuelType}>
                <select
                  className={inputClass(false)}
                  value={form.fuelType}
                  disabled={saving}
                  onChange={(e) => update("fuelType", e.target.value)}
                >
                  <option value="petrol">Petrol</option>
                  <option value="electric">Electric</option>
                  <option value="diesel">Diesel</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="cng">CNG</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Transmission" error={errors.transmission}>
                <select
                  className={inputClass(false)}
                  value={form.transmission}
                  disabled={saving}
                  onChange={(e) => update("transmission", e.target.value)}
                >
                  <option value="manual">Manual</option>
                  <option value="automatic">Automatic</option>
                  <option value="cvt">CVT</option>
                  <option value="other">Other</option>
                </select>
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Description" error={errors.description}>
                <textarea
                  rows={3}
                  className={inputClass(Boolean(errors.description))}
                  value={form.description}
                  maxLength={LIMITS.description}
                  disabled={saving}
                  placeholder="Optional short description"
                  onChange={(e) => updateText("description", e.target.value, { max: LIMITS.description })}
                  onBlur={() => update("description", trimValue(form.description))}
                />
                <p className="mt-1 text-[10px] text-gray-400">
                  {trimValue(form.description).length}/{LIMITS.description}
                </p>
              </Field>
            </div>
          </FormBlock>

          <FormBlock title="Rental prices & operations">
            <p className="mb-2 text-[11px] leading-snug text-gray-500">
              Hourly (under 24h) · Full day (24h–under 7 days) · Full week (7+ days, remainder by day/hour).
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Hourly price (₹)" required error={errors.hourlyPrice}>
                <input
                  type="number"
                  inputMode="decimal"
                  className={inputClass(Boolean(errors.hourlyPrice))}
                  value={form.hourlyPrice}
                  disabled={saving}
                  onChange={(e) => update("hourlyPrice", e.target.value)}
                />
              </Field>
              <Field label="Full day price (24h)" required error={errors.dailyPrice}>
                <input
                  type="number"
                  inputMode="decimal"
                  className={inputClass(Boolean(errors.dailyPrice))}
                  value={form.dailyPrice}
                  disabled={saving}
                  onChange={(e) => update("dailyPrice", e.target.value)}
                />
              </Field>
              <Field label="Full week price (7 days)" required error={errors.weeklyPrice}>
                <input
                  type="number"
                  inputMode="decimal"
                  className={inputClass(Boolean(errors.weeklyPrice))}
                  value={form.weeklyPrice}
                  disabled={saving}
                  onChange={(e) => update("weeklyPrice", e.target.value)}
                />
              </Field>
              <Field label="Security deposit (₹)" required error={errors.securityDeposit}>
                <input
                  type="number"
                  inputMode="decimal"
                  className={inputClass(Boolean(errors.securityDeposit))}
                  value={form.securityDeposit}
                  disabled={saving}
                  onChange={(e) => update("securityDeposit", e.target.value)}
                />
              </Field>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Zone" required error={errors.zoneId}>
                <select
                  className={inputClass(Boolean(errors.zoneId))}
                  value={form.zoneId}
                  disabled={saving}
                  onChange={(e) => update("zoneId", e.target.value)}
                >
                  <option value="">Select zone</option>
                  {zones.map((z) => (
                    <option key={getId(z)} value={getId(z)}>{z.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Pickup hub" required error={errors.hubId}>
                <select
                  className={inputClass(Boolean(errors.hubId))}
                  value={form.hubId}
                  disabled={!form.zoneId || hubsLoading || saving}
                  onChange={(e) => update("hubId", e.target.value)}
                >
                  <option value="">
                    {!form.zoneId
                      ? "Select zone first"
                      : hubsLoading
                        ? "Loading hubs…"
                        : hubs.length
                          ? "Select hub"
                          : "No hubs in this zone"}
                  </option>
                  {hubs.map((h) => (
                    <option key={getId(h)} value={getId(h)} title={h.address || h.name}>
                      {h.ownerType === "admin" ? `${h.name} (Platform)` : h.name}
                    </option>
                  ))}
                </select>
                {form.zoneId && !hubsLoading && hubs.length === 0 ? (
                  <p className="mt-1 text-[11px] text-red-500">
                    No pickup hubs in this zone yet —{" "}
                    <Link to="/bike-rent/vendor/hubs" className="font-bold underline">
                      create one first
                    </Link>
                    .
                  </p>
                ) : null}
              </Field>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Availability" error={errors.availabilityStatus}>
                <select
                  className={inputClass(false)}
                  value={form.availabilityStatus}
                  disabled={saving}
                  onChange={(e) => update("availabilityStatus", e.target.value)}
                >
                  <option value="available">Available</option>
                  <option value="reserved">Reserved</option>
                  <option value="rented">Rented</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="unavailable">Unavailable</option>
                  <option value="disabled">Disabled</option>
                </select>
              </Field>
              <Field label="Maintenance status" error={errors.maintenanceStatus}>
                <select
                  className={inputClass(false)}
                  value={form.maintenanceStatus}
                  disabled={saving}
                  onChange={(e) => update("maintenanceStatus", e.target.value)}
                >
                  <option value="none">None</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={Boolean(form.isActive)}
                  disabled={saving}
                  onChange={(e) => update("isActive", e.target.checked)}
                />
                Available for booking
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={Boolean(form.helmetIncluded)}
                  disabled={saving}
                  onChange={(e) => update("helmetIncluded", e.target.checked)}
                />
                Helmet provided
              </label>
            </div>
          </FormBlock>

          <FormBlock title="Documents required at pickup">
            <p className="mb-2 text-[11px] leading-snug text-gray-500">
              Choose which ID proofs riders must show when they pick up this bike.
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {documentCatalog.map((doc) => (
                <label key={doc.key} className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={(form.requiredDocuments || []).includes(doc.key)}
                    disabled={saving}
                    onChange={() => toggleRequiredDocument(doc.key)}
                  />
                  {doc.label}
                </label>
              ))}
            </div>
          </FormBlock>

          <FormBlock title="Policy override for this bike">
            <BikeSettingsOverridePanel
              value={form.settingsOverride}
              disabled={saving}
              onChange={(next) => update("settingsOverride", next)}
            />
          </FormBlock>

          <FormBlock title="Photos and documents">
            <p className="mb-2 text-[11px] leading-snug text-gray-500">
              Preview locally — files upload when you {editingId ? "save" : "create"} the bike.
            </p>
            <div className="space-y-3">
              <MediaUploadField
                label="Bike photos"
                helperText={`Up to ${LIMITS.maxImages}`}
                value={form.images}
                onChange={(next) => update("images", Array.isArray(next) ? next : [])}
                folder="bike-rent/bikes"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                multiple
                deferUpload
                maxFiles={LIMITS.maxImages}
                disabled={saving}
                error={errors.images}
              />
              <MediaUploadField
                label="Primary photo"
                helperText="Optional cover photo"
                value={form.primaryImage}
                onChange={(next) => update("primaryImage", next)}
                folder="bike-rent/bikes"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                deferUpload
                disabled={saving}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <MediaUploadField
                  label="RC document"
                  helperText="Image or PDF"
                  value={form.rcDoc}
                  onChange={(next) => update("rcDoc", next)}
                  folder="bike-rent/docs"
                  deferUpload
                  disabled={saving}
                />
                <MediaUploadField
                  label="Insurance"
                  helperText="Image or PDF"
                  value={form.insuranceDoc}
                  onChange={(next) => update("insuranceDoc", next)}
                  folder="bike-rent/docs"
                  deferUpload
                  disabled={saving}
                />
              </div>
              <MediaUploadField
                label="PUC document"
                helperText="Image or PDF"
                value={form.pucDoc}
                onChange={(next) => update("pucDoc", next)}
                folder="bike-rent/docs"
                deferUpload
                disabled={saving}
              />
            </div>
          </FormBlock>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="w-full rounded-xl bg-[#FF6A00] py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {saveLabel}
          </button>
        </div>
      </VendorModal>
    </VendorLayout>
  );
}

function FormBlock({ title, children }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-3 sm:p-4">
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">{title}</p>
      {children}
    </div>
  );
}

const inputClass = (hasError) =>
  `w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${
    hasError
      ? "border-red-400 focus:border-red-500 focus:ring-red-500/15"
      : "border-gray-200 focus:border-[#FF6A00] focus:ring-[#FF6A00]/15"
  }`;

function Field({ label, required, children, error }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-gray-700">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
      {error ? <span className="block text-xs font-semibold text-red-600">{error}</span> : null}
    </label>
  );
}
