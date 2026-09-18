import { useCallback, useEffect, useState } from "react";
import { Eye, ExternalLink, Phone, Search } from "lucide-react";
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
  BIKE_RENT_STAT_GRID_3_CLASS,
} from "../utils/adminTheme";

const message = (error, fallback) => error?.response?.data?.message || fallback;
const getId = (item) => item?.id || item?._id;
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const customerName = (row) => row?.name || row?.fullName || "—";
const customerStatus = (row) =>
  row?.status || (row?.isBlocked ? "blocked" : row?.isActive === false ? "inactive" : "active");

const formatDate = (value, withTime = false) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", withTime
    ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "numeric" });
};

const formatGender = (value) => {
  if (!value) return "—";
  return String(value).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

const phoneDisplay = (row) => {
  if (!row?.phone) return "—";
  const code = row.countryCode || "";
  return code ? `${code} ${row.phone}` : row.phone;
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

export default function Customers() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: 10 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await bikeRentAdminApi.getCustomers({
        page: meta.page,
        limit: meta.limit,
        search: search.trim() || undefined,
      });
      setRows(result.records || []);
      setMeta((current) => ({ ...current, ...result }));
    } catch (error) {
      toast.error(message(error, "Failed to load customers"));
    } finally {
      setLoading(false);
    }
  }, [meta.page, meta.limit, search]);

  useEffect(() => {
    load();
  }, [load]);

  const view = async (row) => {
    setDetail(row);
    setDetailLoading(true);
    try {
      setDetail(await bikeRentAdminApi.getCustomerById(getId(row)));
    } catch (error) {
      toast.error(message(error, "Failed to load customer details"));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    if (!detailLoading) setDetail(null);
  };

  const columns = [
    {
      key: "name",
      header: "Customer",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2.5">
          {row.profileImage ? (
            <img
              src={row.profileImage}
              alt=""
              className="h-8 w-8 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
              {String(customerName(row)).charAt(0).toUpperCase() || "?"}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{customerName(row)}</p>
            <p className="truncate text-xs text-muted-foreground">{row.email || "—"}</p>
          </div>
        </div>
      ),
    },
    {
      key: "phone",
      header: "Phone",
      cell: (row) => <span className="whitespace-nowrap text-sm">{phoneDisplay(row)}</span>,
    },
    {
      key: "bookingsCount",
      header: "Bookings",
      cell: (row) => row.bookingsCount ?? row.bookings ?? 0,
    },
    {
      key: "totalSpend",
      header: "Spend",
      cell: (row) => money(row.totalSpend ?? row.totalSpent ?? row.totalAmount),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={customerStatus(row)} />,
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

  const historyColumns = [
    {
      key: "bookingNumber",
      header: "Booking",
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold text-orange-700">
            {row.bookingNumber || row.id || "—"}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {formatDate(row.startAt, true)}
          </p>
        </div>
      ),
    },
    {
      key: "bike",
      header: "Bike / Zone",
      cell: (row) => (
        <div className="min-w-0 max-w-[10rem]">
          <p className="truncate text-sm">{row.bikeName || row.bike?.name || "—"}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {[row.zoneName, row.hubName].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
      ),
    },
    {
      key: "totalAmount",
      header: "Paid",
      cell: (row) => (
        <div className="text-right">
          <p className="whitespace-nowrap text-sm font-medium">
            {money(row.totalPaid ?? row.totalAmount ?? row.money?.totalPaid)}
          </p>
          {Number(row.securityDeposit || 0) > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Dep {money(row.securityDeposit)}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} />,
    },
  ];

  const renderMobileCard = (row) => (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          {row.profileImage ? (
            <img
              src={row.profileImage}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500">
              {String(customerName(row)).charAt(0).toUpperCase() || "?"}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{customerName(row)}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.email || "No email"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{phoneDisplay(row)}</p>
          </div>
        </div>
        <StatusBadge status={customerStatus(row)} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
        <div className="min-w-0">
          <span className="block text-[10px] uppercase tracking-wide">Bookings</span>
          <span className="font-semibold text-foreground">
            {row.bookingsCount ?? row.bookings ?? 0}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block text-[10px] uppercase tracking-wide">Spend</span>
          <span className="font-semibold text-foreground">
            {money(row.totalSpend ?? row.totalSpent ?? row.totalAmount)}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block text-[10px] uppercase tracking-wide">Wallet</span>
          <span className="font-semibold text-foreground">{money(row.walletBalance)}</span>
        </div>
      </div>

      <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => view(row)}>
        <Eye size={14} /> View details
      </Button>
    </div>
  );

  const renderHistoryMobileCard = (row) => (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold text-orange-700">
            {row.bookingNumber || row.id || "—"}
          </p>
          <p className="mt-0.5 truncate text-sm font-medium">
            {row.bikeName || row.bike?.name || "Bike"}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {[row.zoneName, row.hubName].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <StatusBadge status={row.status} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{formatDate(row.startAt, true)}</span>
        <span className="font-semibold text-foreground">
          {money(row.totalPaid ?? row.totalAmount ?? row.money?.totalPaid)}
        </span>
      </div>
    </div>
  );

  const bookings = Array.isArray(detail?.bookings) ? detail.bookings : [];
  const addresses = Array.isArray(detail?.addresses) ? detail.addresses : [];
  const docs = detail?.documents || {};

  return (
    <div className={BIKE_RENT_ADMIN_PAGE_CLASS}>
      <PageHeader
        title="Bike Rent Customers"
        description="Customer profiles and rental history"
      />

      <div className={BIKE_RENT_STAT_GRID_3_CLASS}>
        <StatCard title="Total Customers" value={String(meta.total)} />
        <StatCard title="On This Page" value={String(rows.length)} />
        <StatCard
          title="Verified on Page"
          value={String(rows.filter((row) => row.isVerified).length)}
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
                  placeholder="Search name, phone, email…"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setMeta((value) => ({ ...value, page: 1 }));
                  }}
                />
              </div>
            )}
          />

          {loading ? (
            <TableSkeleton rows={5} columns={6} />
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
              title="No customers found"
              description="Customers with Bike Rent bookings will appear here."
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
            <DialogTitle className="text-base">Customer details</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3 sm:px-4">
            {detailLoading ? (
              <TableSkeleton rows={5} columns={2} />
            ) : detail ? (
              <div className="space-y-3">
                {/* Header identity */}
                <div className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                  {detail.profileImage ? (
                    <img
                      src={detail.profileImage}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-full object-cover sm:h-14 sm:w-14"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-base font-semibold text-slate-500 sm:h-14 sm:w-14 sm:text-lg">
                      {String(customerName(detail)).charAt(0).toUpperCase() || "?"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold text-slate-900">
                        {customerName(detail)}
                      </h3>
                      <StatusBadge status={customerStatus(detail)} />
                      {detail.isVerified ? (
                        <StatusBadge status="verified" label="Verified" tone="success" />
                      ) : (
                        <StatusBadge status="unverified" label="Unverified" tone="warning" />
                      )}
                    </div>
                    <p className="mt-0.5 break-all text-xs text-slate-500">{detail.email || "No email"}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-700">
                      <Phone size={13} className="shrink-0 text-slate-400" />
                      {phoneDisplay(detail)}
                    </p>
                  </div>
                </div>

                {/* Stats strip */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: "Bookings", value: detail.bookingsCount ?? bookings.length },
                    { label: "Active", value: detail.active ?? 0 },
                    { label: "Spend", value: money(detail.totalSpend ?? detail.totalAmount) },
                    { label: "Wallet", value: money(detail.walletBalance) },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-xl border border-slate-100 bg-white px-3 py-2"
                    >
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">{stat.label}</p>
                      <p className="mt-0.5 text-sm font-semibold text-slate-900">{stat.value}</p>
                    </div>
                  ))}
                </div>

                {/* Profile */}
                <section className="rounded-xl border border-slate-100 p-3">
                  <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Profile
                  </h4>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-3">
                    <InfoItem label="Customer ID" className="col-span-2 sm:col-span-1">
                      <span className="font-mono text-xs">{detail.id || "—"}</span>
                    </InfoItem>
                    <InfoItem label="Gender">{formatGender(detail.gender)}</InfoItem>
                    <InfoItem label="Date of birth">{formatDate(detail.dateOfBirth)}</InfoItem>
                    <InfoItem label="Anniversary">{formatDate(detail.anniversary)}</InfoItem>
                    <InfoItem label="Alt. phone">{detail.alternatePhone || "—"}</InfoItem>
                    <InfoItem label="Role">{detail.role || "USER"}</InfoItem>
                    <InfoItem label="Account">{detail.accountStatus || "active"}</InfoItem>
                    <InfoItem label="COD allowed">{detail.isCodAllowed === false ? "No" : "Yes"}</InfoItem>
                    <InfoItem label="Blocked">{detail.isBlocked ? "Yes" : "No"}</InfoItem>
                    <InfoItem label="Referral code">{detail.referralCode || "—"}</InfoItem>
                    <InfoItem label="Referrals">{detail.referralCount ?? 0}</InfoItem>
                    <InfoItem label="Terms accepted">{detail.termsAccepted ? "Yes" : "No"}</InfoItem>
                    <InfoItem label="Joined">{formatDate(detail.createdAt, true)}</InfoItem>
                    <InfoItem label="Updated">{formatDate(detail.updatedAt, true)}</InfoItem>
                  </div>
                </section>

                {/* Documents / KYC */}
                <section className="rounded-xl border border-slate-100 p-3">
                  <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Documents
                  </h4>
                  <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
                    <InfoItem label="Driving license">
                      {detail.drivingLicenseNumber || "—"}
                    </InfoItem>
                    <InfoItem label="Aadhaar">{detail.aadhaarNumber || "—"}</InfoItem>
                    <InfoItem label="DL front">
                      <DocLink href={docs.drivingLicenseFront} label="View" />
                    </InfoItem>
                    <InfoItem label="DL back">
                      <DocLink href={docs.drivingLicenseBack} label="View" />
                    </InfoItem>
                    <InfoItem label="Aadhaar front">
                      <DocLink href={docs.aadhaarFront} label="View" />
                    </InfoItem>
                    <InfoItem label="Aadhaar back">
                      <DocLink href={docs.aadhaarBack} label="View" />
                    </InfoItem>
                    <InfoItem label="PAN">{detail.panNumber || "—"}</InfoItem>
                    <InfoItem label="PAN card">
                      <DocLink href={docs.panCardImage} label="View" />
                    </InfoItem>
                  </div>
                </section>

                {/* Addresses */}
                <section className="rounded-xl border border-slate-100 p-3">
                  <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Addresses
                  </h4>
                  {addresses.length ? (
                    <div className="space-y-2">
                      {addresses.map((addr) => (
                        <div
                          key={addr.id || `${addr.label}-${addr.street}`}
                          className="rounded-lg bg-slate-50 px-3 py-2"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-slate-800">
                              {addr.label || "Address"}
                            </span>
                            {addr.isDefault && (
                              <StatusBadge status="default" label="Default" tone="info" />
                            )}
                          </div>
                          <p className="mt-1 text-sm text-slate-700">
                            {addr.formattedAddress
                              || [addr.street, addr.area, addr.landmark, addr.city, addr.state, addr.zipCode]
                                .filter(Boolean)
                                .join(", ")
                              || "—"}
                          </p>
                          {addr.phone ? (
                            <p className="mt-0.5 text-xs text-slate-500">{addr.phone}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : detail.address?.formatted ? (
                    <p className="text-sm text-slate-700">{detail.address.formatted}</p>
                  ) : (
                    <p className="text-sm text-slate-400">No saved addresses</p>
                  )}
                </section>

                {/* Rental summary */}
                <section className="rounded-xl border border-slate-100 p-3">
                  <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Rental summary
                  </h4>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-4">
                    <InfoItem label="Total bookings">{detail.bookingsCount ?? 0}</InfoItem>
                    <InfoItem label="Completed">{detail.completed ?? 0}</InfoItem>
                    <InfoItem label="Cancelled / no-show">{detail.cancelled ?? 0}</InfoItem>
                    <InfoItem label="Deposits (sum)">{money(detail.totalDeposit)}</InfoItem>
                  </div>
                </section>

                {/* Booking history */}
                <section className="rounded-xl border border-slate-100">
                  <div className="border-b border-slate-100 px-3 py-2.5">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Booking history
                      <span className="ml-1.5 font-normal normal-case text-slate-400">
                        (latest {bookings.length})
                      </span>
                    </h4>
                  </div>
                  <div className="p-3">
                    {bookings.length ? (
                      <AdminTable
                        columns={historyColumns}
                        data={bookings}
                        getRowId={getId}
                        renderMobileCard={renderHistoryMobileCard}
                      />
                    ) : (
                      <EmptyState
                        title="No bookings"
                        description="This customer has no Bike Rent bookings yet."
                      />
                    )}
                  </div>
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
