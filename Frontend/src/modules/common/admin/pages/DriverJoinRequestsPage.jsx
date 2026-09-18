import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Eye,
  Loader2,
  FileWarning,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  PageHeader,
  SectionCard,
  AdminTable,
  FilterBar,
  StatusBadge,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listModuleJoinRequests,
  getModuleJoinRequest,
  approveModuleJoinRequest,
  rejectModuleJoinRequest,
  requestModuleDocuments,
} from "@/modules/common/api/driverOnboarding";

const selectCls =
  "h-10 px-3 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10";

const DOC_LABELS = {
  profilePhoto: "Profile Photo",
  aadharFront: "Aadhaar Front",
  aadharBack: "Aadhaar Back",
  panPhoto: "PAN",
  drivingLicenseFront: "DL Front",
  drivingLicenseBack: "DL Back",
  rcFront: "RC Front",
  rcBack: "RC Back",
  rcPhoto: "RC",
  insurancePhoto: "Insurance",
  pucPhoto: "PUC",
  vehiclePermitPhoto: "Vehicle Permit",
  fitnessCertificatePhoto: "Fitness Certificate",
  vehicleImage: "Vehicle Image",
  bankProof: "Bank Proof",
};

const readUrl = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.url || "";
};

const fmtDate = (value) => (value ? new Date(value).toLocaleString() : "");

function SubmissionBadge({ isResubmission, submissionCount }) {
  return isResubmission ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700">
      <RefreshCw size={11} />
      Resubmission{submissionCount > 1 ? ` #${submissionCount}` : ""}
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
      New Submission
    </span>
  );
}

function formatStatusLabel(status) {
  if (!status) return "—";
  return String(status)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildChangeMap(changedFields = []) {
  const map = new Map();
  for (const entry of changedFields) {
    if (!entry?.field) continue;
    map.set(entry.field, entry);
  }
  return map;
}

function scrollToField(fieldId) {
  const el = document.getElementById(`field-${fieldId}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-amber-400", "ring-offset-2");
  window.setTimeout(() => {
    el.classList.remove("ring-2", "ring-amber-400", "ring-offset-2");
  }, 1600);
}

/**
 * Normal field row. When changed, keeps the latest value as primary and shows
 * the previous value subtly underneath — no side-by-side layout.
 */
function InfoRow({
  id,
  label,
  value,
  previousValue = "",
  changed = false,
}) {
  if (!value && value !== 0 && !changed) return null;
  const showPrevious =
    changed &&
    previousValue != null &&
    String(previousValue).trim() !== "" &&
    String(previousValue) !== "—";

  return (
    <div
      id={id ? `field-${id}` : undefined}
      className={`min-w-0 rounded-lg transition-shadow ${
        changed ? "border border-amber-200 bg-amber-50/60 px-2.5 py-2" : ""
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
        {changed ? (
          <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold normal-case text-amber-800">
            Updated
          </span>
        ) : null}
      </p>
      <p className="mt-0.5 break-words text-sm text-gray-900">
        {value || (changed ? "—" : "")}
      </p>
      {showPrevious ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Old: <span className="line-through decoration-gray-300">{previousValue}</span>
        </p>
      ) : null}
    </div>
  );
}

function DocumentThumb({
  id,
  label,
  url,
  previousUrl = "",
  changed = false,
}) {
  if (!url && !changed) return null;
  return (
    <div
      id={id ? `field-${id}` : undefined}
      className={`relative w-28 overflow-hidden rounded-lg border bg-white transition-shadow ${
        changed
          ? "border-amber-300 ring-1 ring-amber-200"
          : "border-gray-200 hover:border-gray-300"
      }`}
    >
      {changed ? (
        <span className="absolute right-1 top-1 z-10 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white shadow">
          Updated
        </span>
      ) : null}
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="group block">
          <div className="h-20 w-full overflow-hidden bg-gray-50">
            <img
              src={url}
              alt={label}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
          </div>
          <div className="flex items-center justify-between gap-1 px-2 py-1.5">
            <span className="truncate text-[11px] font-semibold text-gray-700">
              {label}
            </span>
            <ExternalLink size={10} className="shrink-0 text-gray-400" />
          </div>
        </a>
      ) : (
        <div className="flex h-20 items-center justify-center bg-gray-50 px-2 text-center text-[11px] text-gray-400">
          Not provided
        </div>
      )}
      {changed && previousUrl && previousUrl !== "—" ? (
        <a
          href={previousUrl}
          target="_blank"
          rel="noreferrer"
          className="block border-t border-amber-100 bg-amber-50/80 px-2 py-1.5 text-center text-[10px] font-semibold text-amber-800 hover:bg-amber-100"
        >
          View previous
        </a>
      ) : null}
    </div>
  );
}

function ChangesSummary({ changes = [], rejectionReason = "" }) {
  if (!changes.length && !rejectionReason) return null;
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
      <p className="text-sm font-semibold text-gray-900">
        Changes in this resubmission
      </p>
      {rejectionReason ? (
        <p className="mt-1 text-xs text-amber-900/80">
          Previous rejection: {rejectionReason}
        </p>
      ) : null}
      {changes.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {changes.map((entry) => (
            <li key={entry.field}>
              <button
                type="button"
                onClick={() => scrollToField(entry.field)}
                className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:border-amber-400 hover:bg-amber-100"
              >
                {entry.label}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          No field-level changes detected for this resubmission.
        </p>
      )}
    </section>
  );
}

/**
 * Shared production join-request review page for any driver module.
 * @param {{ moduleKey: string, title?: string, description?: string }} props
 */
export default function DriverJoinRequestsPage({
  moduleKey = "food",
  title = "Driver Onboarding Requests",
  description = "Review and approve module-specific driver applications",
}) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [requestDocsOpen, setRequestDocsOpen] = useState(false);
  const [requestedDocs, setRequestedDocs] = useState([]);
  const [requestDocsReason, setRequestDocsReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listModuleJoinRequests(moduleKey, {
        status,
        search,
        page,
        limit: pageSize,
      });
      setRows(Array.isArray(data?.requests) ? data.requests : []);
      setTotal(Number(data?.total) || 0);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, [moduleKey, status, search, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (row) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const data = await getModuleJoinRequest(moduleKey, row._id);
      setDetail(data);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load details");
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!detail?.id && !detail?._id) return;
    setActing(true);
    try {
      const id = detail.id || detail._id;
      const data = await approveModuleJoinRequest(moduleKey, id);
      setDetail(data);
      toast.success("Module approved");
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Approve failed");
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }
    setActing(true);
    try {
      const id = detail.id || detail._id;
      const data = await rejectModuleJoinRequest(
        moduleKey,
        id,
        rejectReason.trim(),
      );
      setDetail(data);
      setRejectOpen(false);
      setRejectReason("");
      toast.success("Module rejected");
      load();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Reject failed");
    } finally {
      setActing(false);
    }
  };

  const handleRequestDocs = async () => {
    if (!requestedDocs.length) {
      toast.error("Select at least one document");
      return;
    }
    setActing(true);
    try {
      const id = detail.id || detail._id;
      const data = await requestModuleDocuments(
        moduleKey,
        id,
        requestedDocs,
        requestDocsReason.trim(),
      );
      setDetail(data);
      setRequestDocsOpen(false);
      setRequestedDocs([]);
      setRequestDocsReason("");
      toast.success("Documents requested from driver");
      load();
    } catch (error) {
      toast.error(
        error?.response?.data?.message || "Failed to request documents",
      );
    } finally {
      setActing(false);
    }
  };

  const toggleRequestedDoc = (key) => {
    setRequestedDocs((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const columns = useMemo(
    () => [
      {
        key: "name",
        header: "Driver",
        cell: (row) => (
          <div>
            <p className="font-semibold text-gray-900">{row.name}</p>
            <p className="text-xs text-muted-foreground">{row.phone}</p>
          </div>
        ),
      },
      {
        key: "submission",
        header: "Submission",
        cell: (row) => (
          <div className="space-y-1">
            <SubmissionBadge
              isResubmission={row.isResubmission}
              submissionCount={row.submissionCount}
            />
            {row.isResubmission && row.changedFieldCount > 0 ? (
              <p className="text-[11px] text-muted-foreground">
                {row.changedFieldCount} field
                {row.changedFieldCount === 1 ? "" : "s"} changed
              </p>
            ) : null}
          </div>
        ),
      },
      {
        key: "vehicle",
        header: "Vehicle",
        cell: (row) => (
          <span className="text-sm">
            {row.vehicleType || "—"}
            {row.vehicleNumber ? ` · ${row.vehicleNumber}` : ""}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        cell: (row) => <StatusBadge status={row.status} />,
      },
      {
        key: "submittedAt",
        header: "Submitted",
        cell: (row) => (
          <div className="text-sm text-gray-600">
            {row.submittedAt ? new Date(row.submittedAt).toLocaleString() : "—"}
            {row.lastResubmittedAt ? (
              <p className="text-[11px] text-muted-foreground">
                Resubmitted {new Date(row.lastResubmittedAt).toLocaleString()}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        key: "actions",
        header: "Actions",
        align: "right",
        cell: (row) => (
          <Button variant="outline" size="sm" onClick={() => openDetail(row)}>
            Review
          </Button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const enrollment = detail?.enrollment || {};
  const submissionMeta = detail?.submissionMeta || {};
  const changedFields = Array.isArray(detail?.changedFields)
    ? detail.changedFields
    : Array.isArray(enrollment.changedFields)
      ? enrollment.changedFields
      : [];
  const changeMap = buildChangeMap(changedFields);
  const timeline = Array.isArray(detail?.timeline) ? detail.timeline : [];
  const isResubmission = Boolean(
    submissionMeta.isResubmission || enrollment.isResubmission,
  );
  const docs = {
    ...(detail?.documents || {}),
    ...(enrollment.documents || {}),
  };
  const getChange = (key) => changeMap.get(key) || null;
  const isChanged = (key) => changeMap.has(key);
  const previousOf = (key) => {
    const entry = getChange(key);
    if (!entry) return "";
    const before = entry.before;
    return before && before !== "—" ? before : "";
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);

  return (
    <div className="just-order-theme-scope mx-auto max-w-[90rem] space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader title={title} description={description} />

      <SectionCard flush>
        <div className="space-y-4 p-4">
          <FilterBar
            start={
              <div className="flex w-full flex-wrap gap-2">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search name, phone, email..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <select
                  className={selectCls}
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="documents_required">Documents Required</option>
                  <option value="all">All</option>
                </select>
              </div>
            }
          />

          <AdminTable
            columns={columns}
            data={rows}
            loading={loading}
            getRowId={(row) => row._id}
            emptyState={{
              title: "No onboarding requests",
              description: "New module applications will appear here.",
            }}
            pagination={{
              page,
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

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="just-order-theme-scope max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Request details</DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : detail ? (
            <div className="space-y-5 px-1 pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={enrollment.status || detail.status} />
                <SubmissionBadge
                  isResubmission={isResubmission}
                  submissionCount={
                    submissionMeta.submissionNumber || enrollment.submissionCount
                  }
                />
                <span className="text-sm text-muted-foreground">
                  {detail.moduleLabel || moduleKey}
                </span>
              </div>

              {/* Submission meta */}
              <section
                className={`grid gap-4 rounded-xl border p-4 sm:grid-cols-3 ${
                  isResubmission
                    ? "border-blue-200 bg-blue-50/60"
                    : "border-gray-100 bg-gray-50/60"
                }`}
              >
                <InfoRow
                  label="Submission #"
                  value={submissionMeta.submissionNumber || 1}
                />
                <InfoRow
                  label="Review cycles"
                  value={submissionMeta.reviewCycles ?? 0}
                />
                <InfoRow
                  label="Current status"
                  value={formatStatusLabel(
                    submissionMeta.currentStatus || enrollment.status,
                  )}
                />
                {isResubmission ? (
                  <InfoRow
                    label="Previous review status"
                    value={formatStatusLabel(submissionMeta.previousStatus)}
                  />
                ) : null}
                <InfoRow
                  label="First submitted"
                  value={fmtDate(submissionMeta.firstSubmittedOn)}
                />
                <InfoRow
                  label="Last resubmitted"
                  value={fmtDate(submissionMeta.lastResubmittedOn)}
                />
              </section>

              {isResubmission ? (
                <ChangesSummary
                  changes={changedFields}
                  rejectionReason={
                    submissionMeta.previousRejectionReason || ""
                  }
                />
              ) : null}

              {/* Rejection banner */}
              {["rejected", "documents_required"].includes(
                enrollment.status,
              ) && enrollment.rejectionReason ? (
                <section className="rounded-xl border border-red-100 bg-red-50 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-red-500">
                    {enrollment.status === "rejected"
                      ? "Latest rejection reason"
                      : "Documents requested — reason"}
                  </p>
                  <p className="mt-1 text-sm font-medium text-red-800">
                    {enrollment.rejectionReason}
                  </p>
                  {enrollment.rejectedAt ? (
                    <p className="mt-0.5 text-xs text-red-600">
                      {fmtDate(enrollment.rejectedAt)}
                    </p>
                  ) : null}
                </section>
              ) : null}

              {/* Personal */}
              <section className="space-y-3 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                <p className="text-sm font-semibold text-gray-900">
                  Personal & contact
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoRow
                    id="name"
                    label="Name"
                    value={detail.name}
                    changed={isChanged("name")}
                    previousValue={previousOf("name")}
                  />
                  <InfoRow
                    id="phone"
                    label="Phone"
                    value={detail.phone}
                    changed={isChanged("phone")}
                    previousValue={previousOf("phone")}
                  />
                  <InfoRow
                    id="email"
                    label="Email"
                    value={detail.email}
                    changed={isChanged("email")}
                    previousValue={previousOf("email")}
                  />
                  <InfoRow
                    id="dateOfBirth"
                    label="Date of birth"
                    value={
                      detail.dateOfBirth
                        ? new Date(detail.dateOfBirth).toLocaleDateString()
                        : ""
                    }
                    changed={isChanged("dateOfBirth")}
                    previousValue={previousOf("dateOfBirth")}
                  />
                </div>
              </section>

              {/* Address & emergency */}
              <section className="space-y-3 rounded-xl border border-gray-100 p-4">
                <p className="text-sm font-semibold text-gray-900">
                  Address & emergency contact
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoRow
                    id="address"
                    label="Address"
                    value={detail.address}
                    changed={isChanged("address")}
                    previousValue={previousOf("address")}
                  />
                  <InfoRow
                    id="city"
                    label="City"
                    value={detail.city}
                    changed={isChanged("city")}
                    previousValue={previousOf("city")}
                  />
                  <InfoRow
                    id="state"
                    label="State"
                    value={detail.state}
                    changed={isChanged("state")}
                    previousValue={previousOf("state")}
                  />
                  <InfoRow
                    id="emergencyContactName"
                    label="Emergency contact name"
                    value={detail.emergencyContact?.name}
                    changed={isChanged("emergencyContactName")}
                    previousValue={previousOf("emergencyContactName")}
                  />
                  <InfoRow
                    id="emergencyContactPhone"
                    label="Emergency contact phone"
                    value={detail.emergencyContact?.phone}
                    changed={isChanged("emergencyContactPhone")}
                    previousValue={previousOf("emergencyContactPhone")}
                  />
                </div>
              </section>

              {/* Vehicle */}
              <section className="space-y-3 rounded-xl border border-gray-100 p-4">
                <p className="text-sm font-semibold text-gray-900">Vehicle</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoRow
                    id="vehicleName"
                    label="Selected vehicle"
                    value={enrollment.vehicleName || detail.vehicle?.name}
                    changed={
                      isChanged("vehicleName") ||
                      isChanged("vehicleConfigurationId")
                    }
                    previousValue={
                      previousOf("vehicleName") ||
                      previousOf("vehicleConfigurationId")
                    }
                  />
                  <InfoRow
                    id="vehicleNumber"
                    label="Vehicle number"
                    value={enrollment.vehicleNumber || detail.vehicle?.number}
                    changed={isChanged("vehicleNumber")}
                    previousValue={previousOf("vehicleNumber")}
                  />
                  <InfoRow
                    id="vehicleBrand"
                    label="Vehicle brand"
                    value={enrollment.vehicleBrand || detail.vehicle?.brand}
                    changed={isChanged("vehicleBrand")}
                    previousValue={previousOf("vehicleBrand")}
                  />
                  <InfoRow
                    id="vehicleModel"
                    label="Vehicle model"
                    value={enrollment.vehicleModel || detail.vehicle?.model}
                    changed={isChanged("vehicleModel")}
                    previousValue={previousOf("vehicleModel")}
                  />
                  <InfoRow
                    label="Submitted"
                    value={fmtDate(enrollment.submittedAt)}
                  />
                </div>
              </section>

              {/* All module enrollments */}
              {Array.isArray(detail.enrollments) &&
                detail.enrollments.length > 0 && (
                  <section className="space-y-2 rounded-xl border border-gray-100 p-4">
                    <p className="text-sm font-semibold text-gray-900">
                      All module enrollments
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {detail.enrollments.map((item) => (
                        <div
                          key={item.module}
                          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5"
                        >
                          <span className="text-xs font-semibold capitalize text-gray-800">
                            {String(item.module || "").replace(/-/g, " ")}
                          </span>
                          <StatusBadge status={item.status} />
                          {item.isResubmission ? (
                            <span className="text-[10px] font-bold uppercase text-blue-600">
                              Resubmitted
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

              {/* Bank */}
              <section className="space-y-3 rounded-xl border border-gray-100 p-4">
                <p className="text-sm font-semibold text-gray-900">
                  Bank details
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoRow
                    id="bankAccountHolderName"
                    label="Account holder"
                    value={detail.bank?.accountHolderName}
                    changed={isChanged("bankAccountHolderName")}
                    previousValue={previousOf("bankAccountHolderName")}
                  />
                  <InfoRow
                    id="bankAccountNumber"
                    label="Account number"
                    value={detail.bank?.accountNumber}
                    changed={isChanged("bankAccountNumber")}
                    previousValue={previousOf("bankAccountNumber")}
                  />
                  <InfoRow
                    id="bankIfscCode"
                    label="IFSC"
                    value={detail.bank?.ifscCode}
                    changed={isChanged("bankIfscCode")}
                    previousValue={previousOf("bankIfscCode")}
                  />
                  <InfoRow
                    id="bankName"
                    label="Bank name"
                    value={detail.bank?.bankName}
                    changed={isChanged("bankName")}
                    previousValue={previousOf("bankName")}
                  />
                  <InfoRow label="UPI" value={detail.bank?.upiId} />
                </div>
              </section>

              {/* Documents — current docs primary; previous only via link when changed */}
              <section className="space-y-2 rounded-xl border border-gray-100 p-4">
                <p className="text-sm font-semibold text-gray-900">Documents</p>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(DOC_LABELS).map((key) => {
                    const url = readUrl(docs[key]);
                    const change = getChange(key);
                    if (!url && !change) return null;
                    return (
                      <DocumentThumb
                        key={key}
                        id={key}
                        label={DOC_LABELS[key]}
                        url={url}
                        changed={Boolean(change)}
                        previousUrl={change?.before || ""}
                      />
                    );
                  })}
                </div>
              </section>

              {/* Review timeline */}
              <section className="space-y-3 rounded-xl border border-gray-100 p-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    Review History
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Full timeline of submissions and admin decisions
                  </p>
                </div>
                {timeline.length > 0 ? (
                  <div className="space-y-0">
                    {timeline.map((entry, index) => (
                      <div
                        key={`${entry.type}-${entry.at || index}-${index}`}
                        className="relative flex gap-3 pb-4 last:pb-0"
                      >
                        <div className="flex flex-col items-center">
                          <span
                            className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                              entry.type === "approved"
                                ? "bg-emerald-500"
                                : entry.type === "rejected"
                                  ? "bg-red-500"
                                  : entry.type === "documents_required"
                                    ? "bg-amber-500"
                                    : entry.type === "resubmitted"
                                      ? "bg-blue-600"
                                      : "bg-blue-400"
                            }`}
                          />
                          {index < timeline.length - 1 ? (
                            <span className="w-px flex-1 bg-gray-200" />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1 rounded-lg border border-gray-100 bg-white px-3 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-gray-900">
                              {entry.label}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {fmtDate(entry.at)}
                            </span>
                          </div>
                          {entry.adminName ? (
                            <p className="mt-0.5 text-xs text-gray-500">
                              Admin: {entry.adminName}
                            </p>
                          ) : null}
                          {entry.rejectionReason ||
                          (entry.type === "rejected" && entry.note) ? (
                            <p className="mt-1 rounded-md border border-red-100 bg-red-50 px-2 py-1.5 text-xs text-red-800">
                              <span className="font-semibold">Reason: </span>
                              {entry.rejectionReason || entry.note}
                            </p>
                          ) : entry.note ? (
                            <p className="mt-0.5 text-xs text-gray-600">
                              {entry.note}
                            </p>
                          ) : null}
                          {Array.isArray(entry.documentsRequested) &&
                          entry.documentsRequested.length ? (
                            <p className="mt-1 text-xs text-amber-700">
                              Requested:{" "}
                              {entry.documentsRequested
                                .map((k) => DOC_LABELS[k] || k)
                                .join(", ")}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No review history recorded yet.
                  </p>
                )}
              </section>

              {enrollment.status === "pending" && (
                <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                  <Button
                    variant="outline"
                    className="gap-2 text-amber-700"
                    onClick={() => setRequestDocsOpen(true)}
                    disabled={acting}
                  >
                    <FileWarning size={16} /> Request Documents
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2 text-red-600"
                    onClick={() => setRejectOpen(true)}
                    disabled={acting}
                  >
                    <XCircle size={16} /> Reject
                  </Button>
                  <Button
                    className="gap-2"
                    onClick={handleApprove}
                    isLoading={acting}
                  >
                    <CheckCircle2 size={16} /> Approve
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="just-order-theme-scope sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject application</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 px-1 pb-2">
            <p className="text-sm text-muted-foreground">
              A rejection reason is mandatory and will be shown to the driver.
            </p>
            <textarea
              className="min-h-28 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10"
              placeholder="Explain what needs to be fixed..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectOpen(false)}>
                Cancel
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700"
                onClick={handleReject}
                isLoading={acting}
              >
                Confirm Reject
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={requestDocsOpen} onOpenChange={setRequestDocsOpen}>
        <DialogContent className="just-order-theme-scope sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request documents</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 px-1 pb-2">
            <p className="text-sm text-muted-foreground">
              Select the documents the driver must re-upload. The application
              moves to "Documents Required".
            </p>
            <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto">
              {Object.entries(DOC_LABELS).map(([key, label]) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-100 px-2.5 py-2 text-sm hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={requestedDocs.includes(key)}
                    onChange={() => toggleRequestedDoc(key)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="truncate">{label}</span>
                </label>
              ))}
            </div>
            <textarea
              className="min-h-20 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/10"
              placeholder="Optional note for the driver..."
              value={requestDocsReason}
              onChange={(e) => setRequestDocsReason(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setRequestDocsOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleRequestDocs} isLoading={acting}>
                Request Documents
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
