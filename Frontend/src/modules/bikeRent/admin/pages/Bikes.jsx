import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  PageHeader, SectionCard, StatCard, AdminTable, FilterBar,
  FormLayout, FormSection, FormRow, FormField, StatusBadge, EmptyState, TableSkeleton,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import bikeRentAdminApi from "../services/adminApi";
import {
  BIKE_RENT_ADMIN_PAGE_CLASS,
  BIKE_RENT_ADMIN_SELECT_COMPACT_CLASS,
  BIKE_RENT_STAT_GRID_3_CLASS,
} from "../utils/adminTheme";
import MediaUploadField from "../../shared/components/MediaUploadField";
import BikeSettingsOverridePanel from "../../shared/components/BikeSettingsOverridePanel";
import {
  BIKE_FORM_LIMITS as LIMITS,
  EMPTY_BIKE_FORM as EMPTY,
  buildBikePayload,
  getBikeEntityId as getId,
  normalizeBikeForm as normalizeForm,
  revokeBikeFormMedia as revokeFormMedia,
  trimBikeValue as trimValue,
  uploadBikeFormMedia,
  validateBikeForm,
} from "../../shared/utils/bikeForm";

const DIALOG_CONTENT_CLASS = [
  "just-order-theme-scope",
  "!flex w-[calc(100vw-1rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0",
  "max-h-[min(90dvh,860px)] rounded-2xl sm:w-full sm:rounded-3xl",
  "left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]",
].join(" ");

const message = (error, fallback) => error?.response?.data?.message || fallback;

export default function Bikes() {
  const [bikes, setBikes] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: 10 });
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [zones, setZones] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [hubsLoading, setHubsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [documentCatalog, setDocumentCatalog] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [savePhase, setSavePhase] = useState("");
  const [deleting, setDeleting] = useState(null);
  const savingLock = useRef(false);
  const formRef = useRef(form);
  formRef.current = form;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await bikeRentAdminApi.getBikes({
        page: meta.page,
        limit: meta.limit,
        search: search.trim() || undefined,
        ownerType: ownerFilter !== "all" ? ownerFilter : undefined,
      });
      setBikes(result.records);
      setMeta((current) => ({ ...current, ...result }));
    } catch (error) {
      toast.error(message(error, "Failed to load bikes"));
    } finally {
      setLoading(false);
    }
  }, [meta.page, meta.limit, search, ownerFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    Promise.all([bikeRentAdminApi.getCategoryDropdown(), bikeRentAdminApi.getZoneDropdown()])
      .then(([categoryRows, zoneRows]) => {
        setCategories(categoryRows);
        setZones(zoneRows);
      })
      .catch((error) => toast.error(message(error, "Failed to load bike form options")));
    bikeRentAdminApi
      .getPublicDocumentCatalog()
      .then((catalog) => setDocumentCatalog(Array.isArray(catalog) ? catalog : []))
      .catch(() => setDocumentCatalog([]));
  }, []);

  useEffect(() => {
    if (!form.zoneId) {
      setHubs([]);
      return undefined;
    }
    let cancelled = false;
    setHubsLoading(true);
    bikeRentAdminApi
      .getHubDropdown({ zoneId: form.zoneId })
      .then((rows) => {
        if (!cancelled) setHubs(rows);
      })
      .catch((error) => {
        if (!cancelled) {
          setHubs([]);
          toast.error(message(error, "Failed to load hubs for zone"));
        }
      })
      .finally(() => {
        if (!cancelled) setHubsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form.zoneId]);

  const closeForm = () => {
    revokeFormMedia(formRef.current);
    setOpen(false);
    setEditing(null);
    setForm(EMPTY);
    setErrors({});
    setSavePhase("");
  };

  const openForm = (bike) => {
    revokeFormMedia(formRef.current);
    setEditing(bike || null);
    setForm(bike ? normalizeForm(bike) : { ...EMPTY });
    setErrors({});
    setSavePhase("");
    setOpen(true);
  };

  const toggleRequiredDocument = (key) => {
    const current = form.requiredDocuments || [];
    update(
      "requiredDocuments",
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );
  };

  const update = (name, value) => {
    setForm((current) => {
      if (name === "zoneId") {
        return { ...current, zoneId: value, hubId: "" };
      }
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
      if (!current[name] && name !== "maintenanceStatus" && name !== "availabilityStatus") {
        return current;
      }
      const next = { ...current };
      delete next[name];
      delete next.maintenanceStatus;
      delete next.availabilityStatus;
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
    if (savingLock.current) return;

    const nextErrors = validateBikeForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      toast.error("Please fix the highlighted fields");
      return;
    }

    savingLock.current = true;
    setSaving(true);

    try {
      let uploadedMedia;
      try {
        uploadedMedia = await uploadBikeFormMedia(form, { onPhase: setSavePhase });
      } catch (error) {
        toast.error(message(error, "Image upload failed. Bike was not saved."));
        setSavePhase("");
        return;
      }

      const payload = buildBikePayload(form, uploadedMedia, documentCatalog);

      setSavePhase(editing ? "Updating bike…" : "Creating bike…");
      const bikeId = getId(editing);
      if (bikeId) await bikeRentAdminApi.updateBike(bikeId, payload);
      else await bikeRentAdminApi.createBike(payload);

      toast.success(editing ? "Bike updated" : "Bike created");
      // Avoid revoking freshly uploaded remote URLs; clear local blobs only.
      revokeFormMedia(formRef.current);
      setOpen(false);
      setEditing(null);
      setForm(EMPTY);
      setErrors({});
      setSavePhase("");
      load();
    } catch (error) {
      toast.error(message(error, "Failed to save bike"));
      setSavePhase("");
    } finally {
      setSaving(false);
      savingLock.current = false;
    }
  };

  const changeStatus = async (bike, body) => {
    try {
      await bikeRentAdminApi.updateBikeStatus(bike.id, body);
      toast.success("Bike status updated");
      load();
    } catch (error) {
      toast.error(message(error, "Failed to update bike status"));
    }
  };

  const toggleMaintenance = (bike) => {
    const inMaintenance =
      bike.maintenanceStatus === "maintenance"
      || bike.availabilityStatus === "maintenance";
    if (inMaintenance) {
      // Ready — clear maintenance and restore bookable availability
      return changeStatus(bike, {
        maintenanceStatus: "none",
        availabilityStatus: bike.isActive === false ? "disabled" : "available",
      });
    }
    return changeStatus(bike, {
      maintenanceStatus: "maintenance",
      availabilityStatus: "maintenance",
    });
  };

  const isInMaintenance = (bike) =>
    bike.maintenanceStatus === "maintenance"
    || bike.availabilityStatus === "maintenance";

  const remove = async () => {
    try {
      await bikeRentAdminApi.deleteBike(deleting.id);
      toast.success("Bike deleted");
      setDeleting(null);
      load();
    } catch (error) {
      toast.error(message(error, "Failed to delete bike"));
    }
  };

  const columns = [
    {
      key: "name",
      header: "Bike",
      cell: (row) => (
        <div className="min-w-0 max-w-[14rem]">
          <div className="flex items-center gap-1.5">
            <p className="truncate font-medium">{row.name}</p>
            {row.ownerType === "vendor" && (
              <span className="shrink-0 rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-orange-600">
                Vendor
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {[row.brand, row.model].filter(Boolean).join(" ")}
            {row.registrationNumber ? ` · ${row.registrationNumber}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      cell: (row) => (
        <span className="truncate text-sm">{row.category?.name || row.categoryName || "—"}</span>
      ),
    },
    {
      key: "location",
      header: "Zone / Hub",
      cell: (row) => (
        <div className="min-w-0 max-w-[11rem]">
          <p className="truncate text-sm">{row.zone?.name || row.zoneName || "—"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.hub?.name || row.hubName || "—"}
          </p>
        </div>
      ),
    },
    {
      key: "pricing",
      header: "Pricing",
      cell: (row) => (
        <div className="whitespace-nowrap text-xs leading-relaxed">
          <p>₹{Number(row.hourlyPrice || 0).toLocaleString("en-IN")}/hr</p>
          <p className="text-muted-foreground">
            ₹{Number(row.dailyPrice || 0).toLocaleString("en-IN")}/day
          </p>
          <p className="text-muted-foreground">
            ₹{Number(row.weeklyPrice || 0).toLocaleString("en-IN")}/wk
          </p>
        </div>
      ),
    },
    {
      key: "availabilityStatus",
      header: "Status",
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge
            status={isInMaintenance(row) ? "maintenance" : row.availabilityStatus}
            label={isInMaintenance(row) ? "Maintenance" : undefined}
            tone={isInMaintenance(row) ? "warning" : undefined}
          />
          <StatusBadge status={row.isActive ? "active" : "inactive"} />
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (row) => (
        <div className="inline-flex flex-nowrap items-center justify-end gap-0.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() => changeStatus(row, { isActive: !row.isActive })}
          >
            {row.isActive ? "Off" : "On"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() => toggleMaintenance(row)}
          >
            {isInMaintenance(row) ? "Ready" : "Maint."}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={() => openForm(row)}
          >
            <Pencil size={14} />
            <span className="sr-only">Edit</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-red-600"
            onClick={() => setDeleting(row)}
          >
            <Trash2 size={14} />
            <span className="sr-only">Delete</span>
          </Button>
        </div>
      ),
    },
  ];

  const renderMobileCard = (row) => (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">{row.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[row.brand, row.model].filter(Boolean).join(" ")}
            {row.registrationNumber ? ` · ${row.registrationNumber}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge
            status={isInMaintenance(row) ? "maintenance" : row.availabilityStatus}
            label={isInMaintenance(row) ? "Maintenance" : undefined}
            tone={isInMaintenance(row) ? "warning" : undefined}
          />
          <StatusBadge status={row.isActive ? "active" : "inactive"} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div className="min-w-0">
          <span className="block text-[10px] uppercase tracking-wide">Category</span>
          <span className="truncate font-semibold text-foreground">
            {row.category?.name || row.categoryName || "—"}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block text-[10px] uppercase tracking-wide">Pricing</span>
          <span className="font-semibold text-foreground">
            ₹{Number(row.hourlyPrice || 0).toLocaleString("en-IN")}/hr
          </span>
          <span className="mt-0.5 block text-[10px] text-muted-foreground">
            ₹{Number(row.dailyPrice || 0).toLocaleString("en-IN")}/day · ₹
            {Number(row.weeklyPrice || 0).toLocaleString("en-IN")}/wk
          </span>
        </div>
        <div className="min-w-0">
          <span className="block text-[10px] uppercase tracking-wide">Zone</span>
          <span className="truncate font-semibold text-foreground">
            {row.zone?.name || row.zoneName || "—"}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block text-[10px] uppercase tracking-wide">Hub</span>
          <span className="truncate font-semibold text-foreground">
            {row.hub?.name || row.hubName || "—"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border pt-2">
        <Button
          size="sm"
          variant="outline"
          className="min-w-[5.5rem] flex-1"
          onClick={() => changeStatus(row, { isActive: !row.isActive })}
        >
          {row.isActive ? "Disable" : "Enable"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="min-w-[5.5rem] flex-1"
          onClick={() => toggleMaintenance(row)}
        >
          {isInMaintenance(row) ? "Mark ready" : "Maintenance"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="min-w-[5.5rem] flex-1"
          onClick={() => openForm(row)}
        >
          <Pencil size={14} className="mr-1" /> Edit
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="min-w-[5.5rem] flex-1 border-red-200 text-red-600"
          onClick={() => setDeleting(row)}
        >
          <Trash2 size={14} className="mr-1" /> Delete
        </Button>
      </div>
    </div>
  );

  const textField = (label, name, {
    required = false,
    max,
    upper = false,
    placeholder,
    type = "text",
    inputMode,
  } = {}) => (
    <FormField label={label} required={required} error={errors[name]} className="min-w-0">
      <Input
        className="h-9 max-w-full text-sm"
        type={type}
        inputMode={inputMode}
        value={form[name]}
        maxLength={max}
        placeholder={placeholder}
        disabled={saving}
        onChange={(event) => updateText(name, event.target.value, { upper, max })}
        onBlur={() => {
          if (typeof form[name] === "string") {
            update(name, upper ? trimValue(form[name]).toUpperCase() : trimValue(form[name]));
          }
        }}
      />
    </FormField>
  );

  const selectField = (label, name, options, { required = false } = {}) => (
    <FormField label={label} required={required} error={errors[name]} className="min-w-0">
      <select
        className={BIKE_RENT_ADMIN_SELECT_COMPACT_CLASS}
        value={form[name]}
        disabled={saving}
        onChange={(event) => update(name, event.target.value)}
      >
        {options}
      </select>
    </FormField>
  );

  const saveLabel = (() => {
    if (!saving) return editing ? "Update Bike" : "Create Bike";
    if (savePhase) return savePhase;
    return editing ? "Updating…" : "Creating…";
  })();

  return (
    <div className={BIKE_RENT_ADMIN_PAGE_CLASS}>
      <PageHeader
        title="Bike Management"
        description="Manage rental bike inventory, documentation, and availability"
        actions={(
          <Button className="w-full gap-2 sm:w-auto" onClick={() => openForm()}>
            <Plus size={16} /> Add Bike
          </Button>
        )}
      />
      <div className={BIKE_RENT_STAT_GRID_3_CLASS}>
        <StatCard title="Total Bikes" value={String(meta.total)} />
        <StatCard
          title="Available on Page"
          value={String(bikes.filter((bike) => bike.availabilityStatus === "available").length)}
        />
        <StatCard
          title="In Maintenance"
          value={String(bikes.filter((bike) => isInMaintenance(bike)).length)}
        />
      </div>
      <SectionCard flush>
        <div className="space-y-3 p-3 sm:space-y-4 sm:p-4">
          <FilterBar
            start={(
              <div className="relative w-full max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-9 pl-9 text-sm"
                  placeholder="Search name, reg. no, brand…"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setMeta((value) => ({ ...value, page: 1 }));
                  }}
                />
              </div>
            )}
          />
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-muted-foreground">Owner</label>
            <select
              value={ownerFilter}
              onChange={(event) => {
                setOwnerFilter(event.target.value);
                setMeta((value) => ({ ...value, page: 1 }));
              }}
              className={BIKE_RENT_ADMIN_SELECT_COMPACT_CLASS}
            >
              <option value="all">All</option>
              <option value="admin">Admin fleet</option>
              <option value="vendor">Vendor fleet</option>
            </select>
          </div>
          {loading ? (
            <TableSkeleton rows={5} columns={6} />
          ) : bikes.length ? (
            <AdminTable
              columns={columns}
              data={bikes}
              getRowId={(row) => row.id}
              renderMobileCard={renderMobileCard}
              pagination={{
                page: meta.page,
                totalPages: meta.pages,
                total: meta.total,
                pageSize: meta.limit,
                onPageChange: (page) => setMeta((value) => ({ ...value, page })),
                onPageSizeChange: (limit) => setMeta((value) => ({ ...value, limit, page: 1 })),
              }}
            />
          ) : (
            <EmptyState title="No bikes found" description="Add a bike to make it available for rental." />
          )}
        </div>
      </SectionCard>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !saving) closeForm();
        }}
      >
        <DialogContent
          className={DIALOG_CONTENT_CLASS}
          onPointerDownOutside={(event) => {
            // Native <select> menus render outside the dialog and would otherwise close it.
            event.preventDefault();
          }}
          onInteractOutside={(event) => {
            event.preventDefault();
          }}
          onOpenAutoFocus={(event) => {
            // Avoid focusing first field in a way that scrolls the sheet awkwardly on mobile.
            event.preventDefault();
          }}
        >
          <DialogHeader className="shrink-0 border-b border-slate-100 px-3 py-3 pr-11 text-left sm:px-5 sm:py-3.5">
            <DialogTitle className="text-base sm:text-lg">
              {editing ? "Edit Bike" : "Create Bike"}
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4">
            <FormLayout className="min-w-0 [&_.space-y-6]:space-y-3">
              <FormSection title="Bike details" className="p-3 sm:p-4">
                <FormRow className="gap-3">
                  {textField("Name", "name", { required: true, max: LIMITS.name, placeholder: "e.g. Honda Activa" })}
                  {textField("Brand", "brand", { required: true, max: LIMITS.brand, placeholder: "e.g. Honda" })}
                </FormRow>
                <FormRow className="gap-3">
                  {textField("Model", "model", { required: true, max: LIMITS.model, placeholder: "e.g. Activa 6G" })}
                  {selectField(
                    "Category",
                    "categoryId",
                    <>
                      <option value="">Select category</option>
                      {categories.map((item) => (
                        <option key={getId(item)} value={getId(item)}>
                          {item.name}
                        </option>
                      ))}
                    </>,
                    { required: true },
                  )}
                </FormRow>
                <FormRow className="gap-3">
                  {textField("Registration number", "registrationNumber", {
                    required: true,
                    max: LIMITS.registrationNumber,
                    upper: true,
                    placeholder: "e.g. MH12AB1234",
                  })}
                  {textField("Engine number", "engineNumber", {
                    max: LIMITS.engineNumber,
                    placeholder: "Optional",
                  })}
                </FormRow>
                <FormRow className="gap-3">
                  {textField("Chassis number", "chassisNumber", {
                    max: LIMITS.chassisNumber,
                    placeholder: "Optional",
                  })}
                  {textField("Seating capacity", "seatingCapacity", {
                    required: true,
                    type: "number",
                    inputMode: "numeric",
                  })}
                </FormRow>
                <FormRow className="gap-3">
                  {selectField(
                    "Fuel type",
                    "fuelType",
                    <>
                      <option value="petrol">Petrol</option>
                      <option value="electric">Electric</option>
                      <option value="diesel">Diesel</option>
                      <option value="hybrid">Hybrid</option>
                      <option value="cng">CNG</option>
                      <option value="other">Other</option>
                    </>,
                  )}
                  {selectField(
                    "Transmission",
                    "transmission",
                    <>
                      <option value="manual">Manual</option>
                      <option value="automatic">Automatic</option>
                      <option value="cvt">CVT</option>
                      <option value="other">Other</option>
                    </>,
                  )}
                </FormRow>
                <FormField label="Description" error={errors.description}>
                  <Input
                    className="h-9 text-sm"
                    value={form.description}
                    maxLength={LIMITS.description}
                    disabled={saving}
                    placeholder="Optional short description"
                    onChange={(event) => updateText("description", event.target.value, {
                      max: LIMITS.description,
                    })}
                    onBlur={() => update("description", trimValue(form.description))}
                  />
                  <p className="mt-1 text-[10px] text-slate-400">
                    {trimValue(form.description).length}/{LIMITS.description}
                  </p>
                </FormField>
              </FormSection>

              <FormSection title="Rental prices & operations" className="p-3 sm:p-4">
                <p className="mb-2 text-[11px] leading-snug text-slate-500">
                  Hourly (under 24h) · Full day (24h–under 7 days) · Full week (7+ days, remainder by day/hour).
                </p>
                <FormRow className="gap-3">
                  {textField("Hourly price", "hourlyPrice", {
                    required: true,
                    type: "number",
                    inputMode: "decimal",
                    placeholder: "0",
                  })}
                  {textField("Full day price (24 hours)", "dailyPrice", {
                    required: true,
                    type: "number",
                    inputMode: "decimal",
                    placeholder: "0",
                  })}
                </FormRow>
                <FormRow className="gap-3">
                  {textField("Full week price (7 days)", "weeklyPrice", {
                    required: true,
                    type: "number",
                    inputMode: "decimal",
                    placeholder: "0",
                  })}
                  {textField("Security deposit", "securityDeposit", {
                    required: true,
                    type: "number",
                    inputMode: "decimal",
                    placeholder: "0",
                  })}
                </FormRow>

                {/* Zone + hub stacked full-width so native selects never overflow the modal */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField label="Zone" required error={errors.zoneId} className="min-w-0">
                    <select
                      className={BIKE_RENT_ADMIN_SELECT_COMPACT_CLASS}
                      value={form.zoneId}
                      disabled={saving}
                      onChange={(event) => update("zoneId", event.target.value)}
                    >
                      <option value="">Select zone</option>
                      {zones.map((item) => (
                        <option key={getId(item)} value={getId(item)}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Pickup hub" required error={errors.hubId} className="min-w-0">
                    <select
                      className={BIKE_RENT_ADMIN_SELECT_COMPACT_CLASS}
                      value={form.hubId}
                      disabled={!form.zoneId || hubsLoading || saving}
                      onChange={(event) => update("hubId", event.target.value)}
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
                      {hubs.map((item) => (
                        <option key={getId(item)} value={getId(item)} title={item.address || item.name}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    {!form.zoneId ? (
                      <p className="text-[11px] text-slate-400">Choose a zone to load hubs</p>
                    ) : null}
                    {form.zoneId && !hubsLoading && hubs.length === 0 ? (
                      <p className="text-[11px] text-amber-700">
                        Add hubs under Zone → View, then try again.
                      </p>
                    ) : null}
                  </FormField>
                </div>

                <FormRow className="gap-3">
                  {selectField(
                    "Availability",
                    "availabilityStatus",
                    <>
                      <option value="available">Available</option>
                      <option value="reserved">Reserved</option>
                      <option value="rented">Rented</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="unavailable">Unavailable</option>
                      <option value="disabled">Disabled</option>
                    </>,
                  )}
                  {selectField(
                    "Maintenance status",
                    "maintenanceStatus",
                    <>
                      <option value="none">None</option>
                      <option value="maintenance">Maintenance</option>
                    </>,
                  )}
                </FormRow>
                <FormRow className="gap-3">
                  <FormField label="Active">
                    <label className="flex min-h-9 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(form.isActive)}
                        disabled={saving}
                        onChange={(event) => update("isActive", event.target.checked)}
                      />
                      Available for booking
                    </label>
                  </FormField>
                  <FormField label="Helmet included">
                    <label className="flex min-h-9 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(form.helmetIncluded)}
                        disabled={saving}
                        onChange={(event) => update("helmetIncluded", event.target.checked)}
                      />
                      Helmet provided
                    </label>
                  </FormField>
                </FormRow>
              </FormSection>

              <FormSection title="Documents required" className="p-3 sm:p-4">
                <p className="mb-2 text-[11px] leading-snug text-slate-500">
                  Select which ID proofs customers must carry when collecting this bike.
                </p>
                {documentCatalog.length > 0 && (
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {documentCatalog.map((doc) => (
                      <label
                        key={doc.key}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                      >
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
                )}
              </FormSection>

              <FormSection title="Policy override for this bike" className="p-3 sm:p-4">
                <BikeSettingsOverridePanel
                  value={form.settingsOverride}
                  disabled={saving}
                  onChange={(next) => update("settingsOverride", next)}
                />
              </FormSection>

              <FormSection title="Images and documents" className="p-3 sm:p-4">
                <p className="mb-2 text-[11px] leading-snug text-slate-500">
                  Preview locally — files upload when you{" "}
                  {editing ? "update" : "create"} the bike.
                </p>
                <div className="space-y-3">
                  <MediaUploadField
                    label="Bike images"
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
                    label="Primary image"
                    helperText="Optional cover photo"
                    value={form.primaryImage}
                    onChange={(next) => update("primaryImage", next)}
                    folder="bike-rent/bikes"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    deferUpload
                    disabled={saving}
                    error={errors.primaryImage}
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
              </FormSection>
            </FormLayout>
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-white px-3 py-3 sm:flex-row sm:justify-end sm:px-5">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={closeForm}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" onClick={save} disabled={saving}>
              {saveLabel}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={() => setDeleting(null)}>
        <DialogContent className="just-order-theme-scope w-[calc(100vw-1.5rem)] max-w-md gap-3 rounded-2xl p-4 sm:rounded-3xl sm:p-5">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="text-base">Delete Bike</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Delete <strong className="break-words">{deleting?.name}</strong>? This cannot be undone.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setDeleting(null)}
            >
              Cancel
            </Button>
            <Button className="w-full bg-red-600 hover:bg-red-700 sm:w-auto" onClick={remove}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
