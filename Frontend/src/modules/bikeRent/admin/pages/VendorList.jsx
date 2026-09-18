import { useCallback, useEffect, useState } from "react";
import { Eye, ExternalLink, Phone, Mail, MapPin, Search, Building2 } from "lucide-react";
import {
  PageHeader,
  SectionCard,
  StatCard,
  AdminTable,
  FilterBar,
  StatusBadge,
  EmptyState,
  TableSkeleton,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import bikeRentAdminApi from "../services/adminApi";
import {
  BIKE_RENT_ADMIN_PAGE_CLASS,
  BIKE_RENT_ADMIN_SELECT_CLASS,
  BIKE_RENT_STAT_GRID_4_CLASS,
} from "../utils/adminTheme";

const message = (error, fallback) => error?.response?.data?.message || fallback;
const getId = (item) => item?.id || item?._id;

const formatDate = (value, withTime = false) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", withTime
    ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "numeric" });
};

const DIALOG_CONTENT_CLASS = [
  "just-order-theme-scope",
  "!flex w-[calc(100vw-0.75rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0",
  "max-h-[min(94dvh,900px)] rounded-2xl sm:w-full sm:rounded-3xl",
  "left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]",
].join(" ");

function InfoItem({ label, children, className = "" }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-0.5 break-words text-sm font-medium text-slate-900">{children ?? "—"}</div>
    </div>
  );
}

function DocLink({ href, label }) {
  if (!href) {
    return <span className="text-sm text-slate-400">Not uploaded</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm font-medium text-[#FF6A00] hover:underline"
    >
      {label} <ExternalLink size={12} />
    </a>
  );
}

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "approved", label: "Approved" },
  { value: "pending", label: "Pending" },
  { value: "rejected", label: "Rejected" },
  { value: "onboarding", label: "Onboarding" },
];

export default function VendorList() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: 10 });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ total: 0, approved: 0, pending: 0, rejected: 0 });
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await bikeRentAdminApi.getVendorRequests({
        status: statusFilter,
        page: meta.page,
        limit: meta.limit,
        search: search.trim() || undefined,
      });
      setRows(result.records || []);
      setMeta((current) => ({ ...current, ...result }));
    } catch (error) {
      toast.error(message(error, "Failed to load vendors"));
    } finally {
      setLoading(false);
    }
  }, [meta.page, meta.limit, search, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const loadCounts = async () => {
      try {
        const [all, approved, pending, rejected] = await Promise.all([
          bikeRentAdminApi.getVendorRequests({ status: "all", limit: 1 }),
          bikeRentAdminApi.getVendorRequests({ status: "approved", limit: 1 }),
          bikeRentAdminApi.getVendorRequests({ status: "pending", limit: 1 }),
          bikeRentAdminApi.getVendorRequests({ status: "rejected", limit: 1 }),
        ]);
        setCounts({
          total: all.total || 0,
          approved: approved.total || 0,
          pending: pending.total || 0,
          rejected: rejected.total || 0,
        });
      } catch {
        // Non-blocking — stat cards simply stay at 0 if this fails.
      }
    };
    loadCounts();
  }, []);

  const view = async (row) => {
    setDetail(row);
    setDetailLoading(true);
    try {
      setDetail(await bikeRentAdminApi.getVendorRequestById(getId(row)));
    } catch (error) {
      toast.error(message(error, "Failed to load vendor details"));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    if (!detailLoading) setDetail(null);
  };

  const columns = [
    {
      key: "businessName",
      header: "Vendor",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2.5">
          {row.profilePhoto ? (
            <img
              src={row.profilePhoto}
              alt=""
              className="h-8 w-8 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
              {String(row.businessName || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.businessName || "—"}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.ownerName || "—"} · {row.vendorCode || "—"}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      cell: (row) => (
        <div className="min-w-0">
          <p className="whitespace-nowrap text-sm">{row.phone || "—"}</p>
          <p className="truncate text-xs text-muted-foreground">{row.email || "—"}</p>
        </div>
      ),
    },
    {
      key: "location",
      header: "Location",
      cell: (row) => (
        <span className="text-sm">{[row.city, row.state].filter(Boolean).join(", ") || "—"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "isActive",
      header: "Active",
      cell: (row) => (
        <StatusBadge status={row.isActive === false ? "inactive" : "active"} />
      ),
    },
    {
      key: "submittedAt",
      header: "Joined",
      cell: (row) => (
        <span className="whitespace-nowrap text-sm">{formatDate(row.submittedAt || row.createdAt)}</span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (row) => (
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => view(row)}>
          <Eye size={15} />
          <span className="sr-only">View</span>
        </Button>
      ),
    },
  ];

  const renderMobileCard = (row) => (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          {row.profilePhoto ? (
            <img
              src={row.profilePhoto}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500">
              {String(row.businessName || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{row.businessName || "—"}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {row.ownerName || "—"} · {row.vendorCode || "—"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{row.phone || "—"}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={row.status} />
          <StatusBadge status={row.isActive === false ? "inactive" : "active"} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div className="min-w-0">
          <span className="block text-[10px] uppercase tracking-wide">Location</span>
          <span className="font-semibold text-foreground">
            {[row.city, row.state].filter(Boolean).join(", ") || "—"}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block text-[10px] uppercase tracking-wide">Joined</span>
          <span className="font-semibold text-foreground">{formatDate(row.submittedAt || row.createdAt)}</span>
        </div>
      </div>

      <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => view(row)}>
        <Eye size={14} /> View details
      </Button>
    </div>
  );

  const docs = detail?.documents || {};
  const statusHistory = Array.isArray(detail?.statusHistory) ? detail.statusHistory : [];

  return (
    <div className={BIKE_RENT_ADMIN_PAGE_CLASS}>
      <PageHeader
        title="Bike Rent Vendors"
        description="Every vendor account across all statuses — onboarding, pending, approved and rejected."
      />

      <div className={BIKE_RENT_STAT_GRID_4_CLASS}>
        <StatCard title="Total Vendors" value={String(counts.total)} />
        <StatCard title="Approved" value={String(counts.approved)} />
        <StatCard title="Pending" value={String(counts.pending)} />
        <StatCard title="Rejected" value={String(counts.rejected)} />
      </div>

      <SectionCard flush>
        <div className="space-y-3 p-3 sm:space-y-4 sm:p-4">
          <FilterBar
            start={(
              <div className="relative w-full max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-9 pl-9 text-sm"
                  placeholder="Search business, owner, phone, email, city…"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setMeta((value) => ({ ...value, page: 1 }));
                  }}
                />
              </div>
            )}
            end={(
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setMeta((value) => ({ ...value, page: 1 }));
                }}
                className={`${BIKE_RENT_ADMIN_SELECT_CLASS} sm:w-48`}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          />

          {loading ? (
            <TableSkeleton rows={5} columns={7} />
          ) : rows.length ? (
            <AdminTable
              columns={columns}
              data={rows}
              getRowId={getId}
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
            <EmptyState
              title="No vendors found"
              description="Try a different search term or status filter."
            />
          )}
        </div>
      </SectionCard>

      <Dialog
        open={Boolean(detail)}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
      >
        <DialogContent
          className={DIALOG_CONTENT_CLASS}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader className="shrink-0 border-b border-slate-100 px-3 py-3 pr-11 text-left sm:px-4">
            <DialogTitle className="text-base">Vendor details</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3 sm:px-4">
            {detailLoading ? (
              <TableSkeleton rows={5} columns={2} />
            ) : detail ? (
              <div className="space-y-3">
                {/* Header identity */}
                <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                  {detail.profilePhoto ? (
                    <img
                      src={detail.profilePhoto}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-full object-cover sm:h-14 sm:w-14"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-base font-semibold text-slate-500 sm:h-14 sm:w-14 sm:text-lg">
                      <Building2 size={20} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold text-slate-900">
                        {detail.businessName || "—"}
                      </h3>
                      <StatusBadge status={detail.status} />
                      <StatusBadge status={detail.isActive === false ? "inactive" : "active"} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {detail.ownerName || "—"} · {detail.vendorCode || "—"}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-700">
                      <Phone size={13} className="shrink-0 text-slate-400" />
                      {detail.phone || "—"}
                    </p>
                  </div>
                </div>

                {detail.rejectionReason ? (
                  <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                    Rejection reason: {detail.rejectionReason}
                  </div>
                ) : null}

                {/* Contact & business */}
                <section className="rounded-xl border border-slate-100 p-3">
                  <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Contact & business
                  </h4>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-3">
                    <InfoItem label="Vendor ID" className="col-span-2 sm:col-span-1">
                      <span className="font-mono text-xs">{detail.vendorCode || getId(detail) || "—"}</span>
                    </InfoItem>
                    <InfoItem label="Owner">{detail.ownerName}</InfoItem>
                    <InfoItem label="Phone">
                      <span className="inline-flex items-center gap-1">
                        <Phone size={12} className="text-slate-400" /> {detail.phone || "—"}
                      </span>
                    </InfoItem>
                    <InfoItem label="Email">
                      <span className="inline-flex items-center gap-1 break-all">
                        <Mail size={12} className="shrink-0 text-slate-400" /> {detail.email || "—"}
                      </span>
                    </InfoItem>
                    <InfoItem label="Onboarding step">{detail.onboardingStep ? `${detail.onboardingStep} / 4` : "—"}</InfoItem>
                    <InfoItem label="Joined">{formatDate(detail.createdAt, true)}</InfoItem>
                  </div>
                </section>

                {/* Address */}
                <section className="rounded-xl border border-slate-100 p-3">
                  <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Address
                  </h4>
                  <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
                    <InfoItem label="Address">
                      <span className="inline-flex items-start gap-1">
                        <MapPin size={12} className="mt-0.5 shrink-0 text-slate-400" />
                        {[detail.address, detail.landmark].filter(Boolean).join(", ") || "—"}
                      </span>
                    </InfoItem>
                    <InfoItem label="City / State / Pincode">
                      {[detail.city, detail.state, detail.pincode].filter(Boolean).join(", ") || "—"}
                    </InfoItem>
                  </div>
                </section>

                {/* Documents */}
                <section className="rounded-xl border border-slate-100 p-3">
                  <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Documents
                  </h4>
                  <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
                    <InfoItem label="PAN number">{docs.panNumber || "—"}</InfoItem>
                    <InfoItem label="PAN card">
                      <DocLink href={docs.panImage} label="View" />
                    </InfoItem>
                    <InfoItem label="Aadhaar number">{docs.aadhaarNumber || "—"}</InfoItem>
                    <InfoItem label="Aadhaar card">
                      <DocLink href={docs.aadhaarImage} label="View" />
                    </InfoItem>
                    <InfoItem label="Driving licence">{docs.drivingLicenseNumber || "—"}</InfoItem>
                    <InfoItem label="Driving licence doc">
                      <DocLink href={docs.drivingLicenseImage} label="View" />
                    </InfoItem>
                    <InfoItem label="GST number">{docs.gstNumber || "—"}</InfoItem>
                    <InfoItem label="GST certificate">
                      <DocLink href={docs.gstImage} label="View" />
                    </InfoItem>
                    <InfoItem label="Business registration">{docs.businessRegistrationNumber || "—"}</InfoItem>
                    <InfoItem label="Business reg. doc">
                      <DocLink href={docs.businessRegistrationImage} label="View" />
                    </InfoItem>
                  </div>
                </section>

                {/* Bank details */}
                <section className="rounded-xl border border-slate-100 p-3">
                  <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Bank details
                  </h4>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-3">
                    <InfoItem label="Bank name">{detail.bank?.bankName}</InfoItem>
                    <InfoItem label="Account holder">{detail.bank?.accountHolderName}</InfoItem>
                    <InfoItem label="Account number">{detail.bank?.accountNumber}</InfoItem>
                    <InfoItem label="IFSC code">{detail.bank?.ifscCode}</InfoItem>
                    <InfoItem label="Account type">{detail.bank?.accountType}</InfoItem>
                    <InfoItem label="UPI ID">{detail.bank?.upiId}</InfoItem>
                  </div>
                </section>

                {/* Shop images */}
                <section className="rounded-xl border border-slate-100 p-3">
                  <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Shop images
                  </h4>
                  {detail.shopImages && detail.shopImages.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {detail.shopImages.map((url, idx) => (
                        <a
                          key={url + idx}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="overflow-hidden rounded-xl border border-slate-100"
                        >
                          <img src={url} alt="" className="h-24 w-full object-cover" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">No shop images uploaded</p>
                  )}
                </section>

                {/* Timeline */}
                <section className="rounded-xl border border-slate-100 p-3">
                  <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Timeline
                  </h4>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-3">
                    <InfoItem label="Submitted">{formatDate(detail.submittedAt || detail.createdAt, true)}</InfoItem>
                    <InfoItem label="Approved">{formatDate(detail.approvedAt, true)}</InfoItem>
                    <InfoItem label="Rejected">{formatDate(detail.rejectedAt, true)}</InfoItem>
                  </div>
                  {statusHistory.length > 0 ? (
                    <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2.5">
                      {statusHistory.slice().reverse().map((entry, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-2 text-xs">
                          <span className="capitalize text-slate-600">
                            {entry.status || "—"} {entry.reason ? `— ${entry.reason}` : ""}
                          </span>
                          <span className="shrink-0 text-slate-400">{formatDate(entry.at, true)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 justify-end border-t border-slate-100 bg-white px-3 py-3 sm:px-4">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={closeDetail}
              disabled={detailLoading}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
