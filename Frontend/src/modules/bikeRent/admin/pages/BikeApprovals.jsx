import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Bike,
  Building2,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Fuel,
  Gauge,
  HardHat,
  History,
  IndianRupee,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Tag,
  User,
  X,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import bikeRentAdminApi from "../services/adminApi";
import { BIKE_SETTINGS_SECTIONS } from "../../shared/components/BikeSettingsOverridePanel";

const SETTINGS_OVERRIDE_LABELS = Object.fromEntries(
  BIKE_SETTINGS_SECTIONS.flatMap((section) => section.fields.map((field) => [field.key, field.label])),
);

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatInr = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;

const STATUS_STYLES = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
};
const statusBadgeClass = (status) => STATUS_STYLES[status] || "bg-gray-100 text-gray-600";

const STATUS_TABS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

/* ---------------- Resubmission diff ---------------- */

const CHANGE_TEXT_FIELDS = {
  name: "Bike name",
  brand: "Brand",
  model: "Model",
  registrationNumber: "Registration number",
  engineNumber: "Engine number",
  chassisNumber: "Chassis number",
  fuelType: "Fuel type",
  transmission: "Transmission",
  seatingCapacity: "Seating capacity",
  helmetIncluded: "Helmet included",
  description: "Description",
  hourlyPrice: "Hourly price",
  dailyPrice: "Daily price",
  weeklyPrice: "Weekly price",
  securityDeposit: "Security deposit",
};

const CHANGE_DOC_FIELDS = {
  "rcDoc.url": "RC document",
  "insuranceDoc.url": "Insurance document",
  "pucDoc.url": "PUC document",
};

const getPath = (obj, path) =>
  path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);

const buildBikeChanges = (previous, current) => {
  if (!previous) return null;

  const textChanges = Object.entries(CHANGE_TEXT_FIELDS)
    .map(([path, label]) => ({
      path,
      label,
      before: getPath(previous, path),
      after: getPath(current, path),
    }))
    .filter((c) => String(c.before ?? "") !== String(c.after ?? ""));

  const docChanges = Object.entries(CHANGE_DOC_FIELDS)
    .map(([path, label]) => ({
      path,
      label,
      before: getPath(previous, path) || "",
      after: getPath(current, path) || "",
    }))
    .filter((c) => c.before !== c.after);

  const prevImages = (previous.images || []).map((i) => i.url).filter(Boolean);
  const currImages = (current.images || []).map((i) => i.url).filter(Boolean);
  const addedImages = currImages.filter((u) => !prevImages.includes(u));
  const removedImages = prevImages.filter((u) => !currImages.includes(u));

  const prevDocs = previous.requiredDocuments || [];
  const currDocs = current.requiredDocuments || [];
  const addedDocs = currDocs.filter((k) => !prevDocs.includes(k));
  const removedDocs = prevDocs.filter((k) => !currDocs.includes(k));

  const prevOverride = previous.settingsOverride || {};
  const currOverride = current.settingsOverride || {};
  const overrideKeys = [...new Set([...Object.keys(prevOverride), ...Object.keys(currOverride)])];
  const overrideChanges = overrideKeys
    .map((key) => ({
      key,
      label: SETTINGS_OVERRIDE_LABELS[key] || key,
      before: prevOverride[key],
      after: currOverride[key],
    }))
    .filter((c) => String(c.before ?? "") !== String(c.after ?? ""));

  return { textChanges, docChanges, addedImages, removedImages, addedDocs, removedDocs, overrideChanges };
};

const formatFieldValue = (path, value) => {
  if (path === "helmetIncluded") return value ? "Yes" : "No";
  if (["hourlyPrice", "dailyPrice", "weeklyPrice", "securityDeposit"].includes(path)) {
    return formatInr(value);
  }
  return value === "" || value == null ? "—" : String(value);
};

/* ---------------- Small presentational pieces ---------------- */

function SectionLabel({ children }) {
  return (
    <p className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-wide text-gray-400 first:mt-0">
      {children}
    </p>
  );
}

function Info({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {label}
      </div>
      <p className="text-sm font-semibold text-gray-800 wrap-break-word">{value || "—"}</p>
    </div>
  );
}

function DocThumb({ label, url, onView }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50">
      {url ? (
        <button type="button" onClick={() => onView(url)} className="group relative block h-24 w-full">
          <img src={url} alt={label} className="h-full w-full object-cover" />
          <span className="absolute inset-0 hidden items-center justify-center bg-black/30 group-hover:flex">
            <ZoomIn className="h-5 w-5 text-white" />
          </span>
        </button>
      ) : (
        <div className="flex h-24 w-full items-center justify-center bg-gray-100 text-gray-300">
          <Tag className="h-5 w-5" />
        </div>
      )}
      <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
    </div>
  );
}

function ImageDiffThumb({ url, label, onView }) {
  if (!url) {
    return (
      <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 text-center text-[9px] font-semibold uppercase text-gray-400">
        None
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onView(url)}
      className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-200"
      title={label}
    >
      <img src={url} alt={label} className="h-full w-full object-cover" />
    </button>
  );
}

function BikeChangesPanel({ previous, current, onView }) {
  const changes = useMemo(() => buildBikeChanges(previous, current), [previous, current]);
  if (!changes) return null;

  const { textChanges, docChanges, addedImages, removedImages, addedDocs, removedDocs, overrideChanges } = changes;
  const hasChanges =
    textChanges.length > 0
    || docChanges.length > 0
    || addedImages.length > 0
    || removedImages.length > 0
    || addedDocs.length > 0
    || removedDocs.length > 0
    || overrideChanges.length > 0;

  return (
    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <p className="mb-3 flex items-center gap-1.5 text-sm font-bold text-amber-800">
        <History className="h-4 w-4" />
        Changes since last rejection
      </p>

      {!hasChanges ? (
        <p className="text-sm text-amber-700">Resubmitted without changing any details.</p>
      ) : (
        <div className="space-y-3">
          {textChanges.map((c) => (
            <div key={c.path} className="text-sm">
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">{c.label}</p>
              <p className="mt-0.5">
                <span className="text-red-600 line-through">{formatFieldValue(c.path, c.before)}</span>
                <span className="mx-1.5 text-gray-400">→</span>
                <span className="font-semibold text-emerald-700">{formatFieldValue(c.path, c.after)}</span>
              </p>
            </div>
          ))}

          {docChanges.map((c) => (
            <div key={c.path} className="text-sm">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">{c.label}</p>
              <div className="flex items-center gap-2">
                <ImageDiffThumb url={c.before} label="Previous" onView={onView} />
                <span className="text-gray-400">→</span>
                <ImageDiffThumb url={c.after} label="New" onView={onView} />
              </div>
            </div>
          ))}

          {addedImages.length > 0 || removedImages.length > 0 ? (
            <div className="text-sm">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">Bike photos</p>
              {addedImages.length > 0 ? (
                <p className="font-semibold text-emerald-700">+{addedImages.length} added</p>
              ) : null}
              {removedImages.length > 0 ? (
                <p className="font-semibold text-red-600">-{removedImages.length} removed</p>
              ) : null}
            </div>
          ) : null}

          {addedDocs.length > 0 || removedDocs.length > 0 ? (
            <div className="text-sm">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                Documents required at pickup
              </p>
              {addedDocs.length > 0 ? (
                <p className="font-semibold text-emerald-700">+{addedDocs.length} added</p>
              ) : null}
              {removedDocs.length > 0 ? (
                <p className="font-semibold text-red-600">-{removedDocs.length} removed</p>
              ) : null}
            </div>
          ) : null}

          {overrideChanges.length > 0 ? (
            <div className="text-sm">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                Bike policy override
              </p>
              {overrideChanges.map((c) => (
                <p key={c.key} className="mt-0.5">
                  <span className="text-gray-600">{c.label}: </span>
                  <span className="text-red-600 line-through">{formatFieldValue(c.key, c.before ?? "—")}</span>
                  <span className="mx-1.5 text-gray-400">→</span>
                  <span className="font-semibold text-emerald-700">{formatFieldValue(c.key, c.after ?? "—")}</span>
                </p>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ---------------- Main page ---------------- */

export default function BikeApprovals() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ pages: 1, total: 0 });
  const [documentCatalog, setDocumentCatalog] = useState([]);

  const [processingId, setProcessingId] = useState(null);
  const [rejecting, setRejecting] = useState(null); // { id, name }
  const [reason, setReason] = useState("");
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  const [selected, setSelected] = useState(null); // row-level summary
  const [detail, setDetail] = useState(null); // full fetched bike
  const [detailLoading, setDetailLoading] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await bikeRentAdminApi.getPendingBikes({
        status: statusFilter,
        search,
        page,
        limit: 20,
      });
      setRecords(data?.records || []);
      setMeta({ pages: data?.pages || 1, total: data?.total || 0 });
    } catch (err) {
      const message = err?.response?.data?.message || "Failed to load bikes";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    bikeRentAdminApi
      .getPublicDocumentCatalog()
      .then((catalog) => setDocumentCatalog(Array.isArray(catalog) ? catalog : []))
      .catch(() => setDocumentCatalog([]));
  }, []);

  // Debounce the raw input into the actual search term used for fetching.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Jump back to page 1 whenever the filters change (no-op, no extra fetch, if already on page 1).
  useEffect(() => {
    setPage(1);
  }, [statusFilter, search]);

  // Single source of truth for fetching — fires once filters/page have settled.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter, search]);

  const requiredDocLabels = (keys = []) =>
    keys.map((key) => documentCatalog.find((d) => d.key === key)?.label || key);

  const openView = async (item) => {
    setSelected(item);
    setDetail(null);
    setDetailLoading(true);
    try {
      const full = await bikeRentAdminApi.getBikeById(item.id);
      setDetail(full);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not load bike details");
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeView = () => {
    setSelected(null);
    setDetail(null);
  };

  const approve = async (bike) => {
    setProcessingId(bike.id);
    try {
      await bikeRentAdminApi.approveBike(bike.id);
      toast.success("Bike approved");
      if (detail?.id === bike.id) closeView();
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Approve failed");
    } finally {
      setProcessingId(null);
    }
  };

  const openReject = (bike) => {
    setRejecting({ id: bike.id, name: bike.name });
    setReason("");
  };

  const submitReject = async () => {
    if (!reason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }
    setRejectSubmitting(true);
    try {
      await bikeRentAdminApi.rejectBike(rejecting.id, reason.trim());
      toast.success("Bike rejected");
      const wasDetail = detail?.id === rejecting.id;
      setRejecting(null);
      setReason("");
      if (wasDetail) closeView();
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Reject failed");
    } finally {
      setRejectSubmitting(false);
    }
  };

  const primaryImage = (bike) =>
    bike?.images?.find((img) => img.isPrimary)?.url || bike?.images?.[0]?.url || "";

  const isResubmitted = (item) =>
    item.approvalStatus === "pending" && Boolean(item.rejectedSnapshot);

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Bike approvals</h1>
          <p className="mt-1 text-sm text-gray-500">
            Vendor-added bikes need approval before they become bookable and visible to customers.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-gray-200 bg-white p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatusFilter(tab.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                statusFilter === tab.value
                  ? "bg-[#FF6A00] text-white"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, brand, registration…"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#FF6A00]"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-white py-16 text-gray-400 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading…
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-white py-16 text-center shadow-sm">
          <AlertCircle className="h-6 w-6 text-red-400" />
          <p className="text-sm text-gray-500">{loadError}</p>
          <button
            type="button"
            onClick={() => load()}
            className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50"
          >
            Retry
          </button>
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center text-sm text-gray-400 shadow-sm">
          No bikes found for this filter
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm sm:block">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Bike</th>
                    <th className="px-4 py-3">Vendor</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Registration</th>
                    <th className="px-4 py-3">Submitted</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((item) => (
                    <tr key={item.id} className="border-t border-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {primaryImage(item) ? (
                            <img
                              src={primaryImage(item)}
                              alt={item.name}
                              className="h-9 w-9 shrink-0 rounded-lg object-cover"
                            />
                          ) : (
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-[#FF6A00]">
                              <Bike className="h-4 w-4" />
                            </span>
                          )}
                          <div>
                            <span className="font-bold text-gray-900">{item.name}</span>
                            <p className="text-xs text-gray-400">
                              {item.brand} {item.model}
                            </p>
                          </div>
                        </div>
                        {isResubmitted(item) && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">
                            <History className="h-3 w-3" />
                            Resubmitted
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {item.vendor?.businessName || "—"}
                        <p className="text-xs text-gray-400">{item.vendor?.vendorCode || ""}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{item.categoryName || "—"}</td>
                      <td className="px-4 py-3 text-gray-500">{item.registrationNumber || "—"}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(item.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase ${statusBadgeClass(item.approvalStatus)}`}>
                          {item.approvalStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openView(item)}
                            className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
                            title="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {item.approvalStatus === "pending" && (
                            <>
                              <button
                                type="button"
                                disabled={processingId === item.id}
                                onClick={() => approve(item)}
                                className="rounded-lg bg-emerald-50 p-2 text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                                title="Approve"
                              >
                                {processingId === item.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={processingId === item.id}
                                onClick={() => openReject(item)}
                                className="rounded-lg bg-red-50 p-2 text-red-600 hover:bg-red-100 disabled:opacity-60"
                                title="Reject"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 sm:hidden">
            {records.map((item) => (
              <div key={item.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  {primaryImage(item) ? (
                    <img src={primaryImage(item)} alt={item.name} className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#FF6A00]">
                      <Bike className="h-5 w-5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-bold text-gray-900">{item.name}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClass(item.approvalStatus)}`}>
                        {item.approvalStatus}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">{item.brand} {item.model} · {item.registrationNumber}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {item.vendor?.businessName || "—"} {item.vendor?.vendorCode ? `· ${item.vendor.vendorCode}` : ""}
                    </p>
                    {isResubmitted(item) && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">
                        <History className="h-3 w-3" />
                        Resubmitted
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-gray-50 pt-3">
                  <button
                    type="button"
                    onClick={() => openView(item)}
                    className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-bold text-gray-600 hover:bg-gray-50"
                  >
                    View
                  </button>
                  {item.approvalStatus === "pending" && (
                    <>
                      <button
                        type="button"
                        disabled={processingId === item.id}
                        onClick={() => approve(item)}
                        className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 disabled:opacity-60"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={processingId === item.id}
                        onClick={() => openReject(item)}
                        className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-600 disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {meta.pages > 1 && (
            <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs text-gray-500">
                Page {page} of {meta.pages} · {meta.total} total
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-gray-200 p-1.5 text-gray-600 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={page >= meta.pages}
                  onClick={() => setPage((p) => Math.min(meta.pages, p + 1))}
                  className="rounded-lg border border-gray-200 p-1.5 text-gray-600 disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ---------------- Detail / View modal ---------------- */}
      {selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
            {detailLoading || !detail ? (
              <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading bike details…
              </div>
            ) : (
              <>
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-gray-100 bg-gray-50">
                      {primaryImage(detail) ? (
                        <button
                          type="button"
                          onClick={() => setLightboxImage(primaryImage(detail))}
                          className="block h-full w-full"
                        >
                          <img src={primaryImage(detail)} alt={detail.name} className="h-full w-full object-cover" />
                        </button>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-gray-300">
                          <Bike className="h-6 w-6" />
                        </div>
                      )}
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-gray-900">{detail.name}</h2>
                      <p className="text-sm text-gray-500">
                        {detail.brand} {detail.model} · {detail.registrationNumber}
                      </p>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${statusBadgeClass(detail.approvalStatus)}`}>
                          {detail.approvalStatus}
                        </span>
                        {isResubmitted(detail) ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold uppercase text-blue-700">
                            <History className="h-3 w-3" />
                            Resubmitted
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeView}
                    className="rounded-xl bg-gray-100 p-2 text-gray-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {detail.approvalStatus === "rejected" && detail.rejectionReason ? (
                  <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                    Rejection reason: {detail.rejectionReason}
                  </div>
                ) : detail.approvalStatus === "pending" && detail.rejectedSnapshot?.rejectionReason ? (
                  <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                    Previously rejected for: {detail.rejectedSnapshot.rejectionReason}
                  </div>
                ) : null}

                {detail.approvalStatus === "pending" && detail.rejectedSnapshot ? (
                  <BikeChangesPanel
                    previous={detail.rejectedSnapshot}
                    current={detail}
                    onView={setLightboxImage}
                  />
                ) : null}

                <SectionLabel>Vendor</SectionLabel>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Info icon={Building2} label="Business" value={detail.vendor?.businessName} />
                  <Info icon={User} label="Owner" value={detail.vendor?.ownerName} />
                </div>

                <SectionLabel>Specifications</SectionLabel>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Info icon={Tag} label="Category" value={detail.categoryName} />
                  <Info icon={Fuel} label="Fuel type" value={detail.fuelType} />
                  <Info icon={Gauge} label="Transmission" value={detail.transmission} />
                  <Info icon={HardHat} label="Helmet included" value={detail.helmetIncluded ? "Yes" : "No"} />
                  <Info label="Seating capacity" value={detail.seatingCapacity} />
                  <Info label="Engine number" value={detail.engineNumber} />
                  <Info label="Chassis number" value={detail.chassisNumber} />
                </div>
                {detail.description ? (
                  <div className="mt-3">
                    <Info label="Description" value={detail.description} />
                  </div>
                ) : null}

                <SectionLabel>Pricing</SectionLabel>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Info icon={IndianRupee} label="Hourly price" value={formatInr(detail.hourlyPrice)} />
                  <Info icon={IndianRupee} label="Daily price" value={formatInr(detail.dailyPrice)} />
                  <Info icon={IndianRupee} label="Weekly price" value={formatInr(detail.weeklyPrice)} />
                  <Info icon={IndianRupee} label="Security deposit" value={formatInr(detail.securityDeposit)} />
                </div>

                <SectionLabel>Location</SectionLabel>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Info icon={MapPin} label="Zone" value={detail.zoneName} />
                  <Info icon={MapPin} label="Pickup hub" value={detail.hubName || detail.pickupHub?.name} />
                </div>

                <SectionLabel>Documents required at pickup</SectionLabel>
                {detail.requiredDocuments?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {requiredDocLabels(detail.requiredDocuments).map((label) => (
                      <span
                        key={label}
                        className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">None specified</p>
                )}

                <SectionLabel>Vehicle documents</SectionLabel>
                <div className="grid gap-3 sm:grid-cols-3">
                  <DocThumb label="RC" url={detail.rcDoc?.url} onView={setLightboxImage} />
                  <DocThumb label="Insurance" url={detail.insuranceDoc?.url} onView={setLightboxImage} />
                  <DocThumb label="PUC" url={detail.pucDoc?.url} onView={setLightboxImage} />
                </div>

                <SectionLabel>Bike photos</SectionLabel>
                {detail.images?.length ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {detail.images.map((img, idx) => (
                      <button
                        type="button"
                        key={img.url + idx}
                        onClick={() => setLightboxImage(img.url)}
                        className="group relative h-20 overflow-hidden rounded-xl border border-gray-100"
                      >
                        <img src={img.url} alt="" className="h-full w-full object-cover" />
                        {img.isPrimary && (
                          <span className="absolute left-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                            Primary
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No photos uploaded</p>
                )}

                <SectionLabel>Timeline</SectionLabel>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Info icon={Calendar} label="Submitted" value={formatDate(detail.createdAt)} />
                  <Info icon={Calendar} label="Last updated" value={formatDate(detail.updatedAt)} />
                </div>

                {detail.approvalHistory?.length > 0 ? (
                  <>
                    <SectionLabel>Approval history</SectionLabel>
                    <ol className="space-y-1.5 border-l border-gray-100 pl-3">
                      {detail.approvalHistory.map((h, i) => (
                        <li key={i} className="text-xs text-gray-500">
                          <span className="font-bold capitalize text-gray-700">{h.status}</span>
                          {h.changedByName ? ` · ${h.changedByName}` : ""}
                          {h.changedAt ? ` · ${formatDate(h.changedAt)}` : ""}
                          {h.reason ? ` — ${h.reason}` : ""}
                        </li>
                      ))}
                    </ol>
                  </>
                ) : null}

                {detail.approvalStatus === "pending" ? (
                  <div className="mt-5 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                    <button
                      type="button"
                      disabled={processingId === detail.id}
                      onClick={() => approve(detail)}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                    >
                      {processingId === detail.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={processingId === detail.id}
                      onClick={() => openReject(detail)}
                      className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                    >
                      <X className="h-4 w-4" />
                      Reject
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* ---------------- Reject reason modal ---------------- */}
      {rejecting ? (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <h2 className="mb-1 text-lg font-black text-gray-900">Reject &quot;{rejecting.name}&quot;</h2>
            <p className="mb-3 text-xs text-gray-500">
              This reason will be shown to the vendor so they can fix the issue and resubmit.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Rejection reason (required)"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#FF6A00]"
            />
            {!reason.trim() ? (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-red-500">
                <AlertCircle className="h-3 w-3" />
                A reason is required to reject a bike
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejecting(null)}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rejectSubmitting || !reason.trim()}
                onClick={submitReject}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {rejectSubmitting ? "Rejecting…" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---------------- Image lightbox ---------------- */}
      {lightboxImage ? (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            className="absolute right-4 top-4 rounded-xl bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightboxImage}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl"
          />
        </div>
      ) : null}
    </div>
  );
}
