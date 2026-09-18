import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  PageHeader,
  SectionCard,
  StatCard,
  AdminTable,
  FilterBar,
  StatusBadge,
  EmptyState,
  TableSkeleton,
  KpiGridSkeleton,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { toast } from "sonner";
import bikeRentAdminApi from "../services/adminApi";

const message = (e, fallback) => e?.response?.data?.message || fallback;
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const hours = (value) => `${Number(value || 0).toFixed(1)}h`;
const rowId = (item, index) =>
  item?.id || item?._id || item?.status || item?.source || item?.zoneId || item?.bikeId || item?.type || item?.date || index;

const labelize = (value) => {
  if (!value) return "—";
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

function CompactRowCard({ title, subtitle, meta, badge }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        {subtitle ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        {badge}
        {meta ? <p className="mt-1 text-sm font-semibold text-foreground">{meta}</p> : null}
      </div>
    </div>
  );
}

function ReportSection({ title, subtitle, loading, children, className = "" }) {
  return (
    <SectionCard
      title={title}
      subtitle={subtitle}
      className={className}
      bodyClassName="p-0"
    >
      <div className="p-3 sm:p-4">
        {loading ? <TableSkeleton rows={4} columns={3} /> : children}
      </div>
    </SectionCard>
  );
}

export default function Reports() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (filters = {}) => {
    setLoading(true);
    try {
      setReports(await bikeRentAdminApi.getReports(filters));
    } catch (e) {
      toast.error(message(e, "Failed to load reports"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const apply = () => {
    if (from && to && from > to) {
      toast.error("From date must be before to date");
      return;
    }
    load({ from: from || undefined, to: to || undefined });
  };

  const clearDates = () => {
    setFrom("");
    setTo("");
    load();
  };

  const report = reports || {};
  const fees = report.fees || {};
  const duration = report.duration || {};
  const statuses = report.byStatus || [];
  const zones = report.zoneUtilization || [];
  const availability = report.bikeAvailability || [];
  const sources = report.bySource || [];
  const topBikes = report.topBikes || [];
  const depositLedger = report.depositLedger || [];
  const revenueByDay = report.revenueByDay || [];

  const kpiCards = [
    { title: "Total Revenue", value: money(fees.totalRevenue) },
    { title: "Deposits Held", value: money(fees.depositsHeld) },
    { title: "Deposits Refunded", value: money(fees.depositsRefunded) },
    { title: "Damage Fees", value: money(fees.damageFees) },
    { title: "Late Fees", value: money(fees.lateFees) },
    { title: "Cancel Fees", value: money(fees.cancelFees) },
    { title: "Extension Fees", value: money(fees.extensionFees) },
    { title: "Avg Duration", value: hours(duration.avgHours) },
  ];

  const statusColumns = [
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusBadge status={r.status} label={labelize(r.status)} />,
    },
    { key: "count", header: "Bookings", cell: (r) => r.count ?? 0 },
    {
      key: "revenue",
      header: "Revenue",
      align: "right",
      cell: (r) => money(r.revenue),
    },
  ];

  const availabilityColumns = [
    {
      key: "status",
      header: "Availability",
      cell: (r) => <StatusBadge status={r.status} label={labelize(r.status)} />,
    },
    { key: "count", header: "Bikes", cell: (r) => r.count ?? 0 },
  ];

  const sourceColumns = [
    {
      key: "source",
      header: "Source",
      cell: (r) => labelize(r.source),
    },
    { key: "bookings", header: "Bookings" },
    {
      key: "revenue",
      header: "Revenue",
      align: "right",
      cell: (r) => money(r.revenue),
    },
  ];

  const topBikeColumns = [
    {
      key: "bikeName",
      header: "Bike",
      cell: (r) => <span className="truncate font-medium">{r.bikeName || "—"}</span>,
    },
    { key: "bookings", header: "Bookings" },
    {
      key: "revenue",
      header: "Revenue",
      align: "right",
      cell: (r) => money(r.revenue),
    },
  ];

  const zoneColumns = [
    {
      key: "zoneName",
      header: "Zone",
      cell: (r) => <span className="truncate font-medium">{r.zoneName || "—"}</span>,
    },
    { key: "bookings", header: "Bookings" },
    {
      key: "uniqueCustomers",
      header: "Customers",
      cell: (r) => r.uniqueCustomers ?? "—",
    },
    {
      key: "revenue",
      header: "Revenue",
      align: "right",
      cell: (r) => money(r.revenue),
    },
  ];

  const ledgerColumns = [
    {
      key: "type",
      header: "Type",
      cell: (r) => labelize(r.type),
    },
    { key: "count", header: "Entries" },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      cell: (r) => money(r.amount),
    },
  ];

  const dayColumns = [
    {
      key: "date",
      header: "Date",
      cell: (r) => r.date || "—",
    },
    { key: "bookings", header: "Bookings" },
    {
      key: "revenue",
      header: "Revenue",
      align: "right",
      cell: (r) => money(r.revenue),
    },
  ];

  return (
    <div className="just-order-theme-scope mx-auto max-w-7xl space-y-4 overflow-x-hidden px-4 py-6 pb-24 sm:space-y-5 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader
        title="Bike Rent Reports"
        description="Revenue, deposits, fleet, and zone performance"
        actions={(
          <Button
            variant="outline"
            className="w-full gap-1.5 sm:w-auto"
            onClick={() => load({ from: from || undefined, to: to || undefined })}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        )}
      />

      <SectionCard flush>
        <div className="p-3 sm:p-4">
          <FilterBar
            start={(
              <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
                <div className="min-w-0">
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    From
                  </label>
                  <Input
                    type="date"
                    className="h-9 text-sm"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </div>
                <div className="min-w-0">
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    To
                  </label>
                  <Input
                    type="date"
                    className="h-9 text-sm"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </div>
                <Button className="h-9 w-full sm:w-auto" onClick={apply} disabled={loading}>
                  Apply
                </Button>
                <Button
                  variant="outline"
                  className="h-9 w-full sm:w-auto"
                  onClick={clearDates}
                  disabled={loading || (!from && !to)}
                >
                  Clear
                </Button>
              </div>
            )}
          />
        </div>
      </SectionCard>

      {loading && !reports ? (
        <KpiGridSkeleton count={8} className="grid-cols-2 sm:grid-cols-2 lg:grid-cols-4" />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {kpiCards.map((card) => (
            <StatCard key={card.title} title={card.title} value={card.value} />
          ))}
        </div>
      )}

      {(duration.maxHours > 0 || duration.minHours > 0) && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
          <div className="rounded-xl border border-border bg-card px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Min duration</p>
            <p className="mt-0.5 text-sm font-semibold">{hours(duration.minHours)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Max duration</p>
            <p className="mt-0.5 text-sm font-semibold">{hours(duration.maxHours)}</p>
          </div>
          <div className="col-span-2 rounded-xl border border-border bg-card px-3 py-2.5 sm:col-span-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Deposits captured</p>
            <p className="mt-0.5 text-sm font-semibold">{money(fees.depositsCaptured)}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
        <ReportSection title="Bookings by Status" loading={loading}>
          {statuses.length ? (
            <AdminTable
              columns={statusColumns}
              data={statuses}
              getRowId={rowId}
              renderMobileCard={(r) => (
                <CompactRowCard
                  title={labelize(r.status)}
                  subtitle={`${r.count ?? 0} bookings`}
                  meta={money(r.revenue)}
                  badge={<StatusBadge status={r.status} label={labelize(r.status)} />}
                />
              )}
            />
          ) : (
            <EmptyState title="No booking status data" description="No bookings in this period." />
          )}
        </ReportSection>

        <ReportSection title="Bike Availability" subtitle="Current fleet snapshot" loading={loading}>
          {availability.length ? (
            <AdminTable
              columns={availabilityColumns}
              data={availability}
              getRowId={rowId}
              renderMobileCard={(r) => (
                <CompactRowCard
                  title={labelize(r.status)}
                  meta={`${r.count ?? 0} bikes`}
                  badge={<StatusBadge status={r.status} label={labelize(r.status)} />}
                />
              )}
            />
          ) : (
            <EmptyState title="No availability data" description="Fleet snapshot unavailable." />
          )}
        </ReportSection>

        <ReportSection title="Booking Source" loading={loading}>
          {sources.length ? (
            <AdminTable
              columns={sourceColumns}
              data={sources}
              getRowId={rowId}
              renderMobileCard={(r) => (
                <CompactRowCard
                  title={labelize(r.source)}
                  subtitle={`${r.bookings ?? 0} bookings`}
                  meta={money(r.revenue)}
                />
              )}
            />
          ) : (
            <EmptyState title="No source data" description="Sources appear after bookings." />
          )}
        </ReportSection>

        <ReportSection title="Top Bikes" loading={loading}>
          {topBikes.length ? (
            <AdminTable
              columns={topBikeColumns}
              data={topBikes}
              getRowId={rowId}
              renderMobileCard={(r) => (
                <CompactRowCard
                  title={r.bikeName || "Bike"}
                  subtitle={`${r.bookings ?? 0} bookings`}
                  meta={money(r.revenue)}
                />
              )}
            />
          ) : (
            <EmptyState title="No bike revenue data" description="Top bikes appear after paid bookings." />
          )}
        </ReportSection>
      </div>

      <ReportSection title="Zone Utilization" loading={loading}>
        {zones.length ? (
          <AdminTable
            columns={zoneColumns}
            data={zones}
            getRowId={rowId}
            renderMobileCard={(r) => (
              <CompactRowCard
                title={r.zoneName || "Zone"}
                subtitle={`${r.bookings ?? 0} bookings · ${r.uniqueCustomers ?? 0} customers`}
                meta={money(r.revenue)}
              />
            )}
          />
        ) : (
          <EmptyState title="No zone utilization data" description="Zone stats appear after bookings." />
        )}
      </ReportSection>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
        <ReportSection title="Deposit Ledger" loading={loading}>
          {depositLedger.length ? (
            <AdminTable
              columns={ledgerColumns}
              data={depositLedger}
              getRowId={rowId}
              renderMobileCard={(r) => (
                <CompactRowCard
                  title={labelize(r.type)}
                  subtitle={`${r.count ?? 0} entries`}
                  meta={money(r.amount)}
                />
              )}
            />
          ) : (
            <EmptyState title="No ledger entries" description="Deposit movements will show here." />
          )}
        </ReportSection>

        <ReportSection title="Revenue by Day" subtitle="Latest days in range" loading={loading}>
          {revenueByDay.length ? (
            <AdminTable
              columns={dayColumns}
              data={[...revenueByDay].reverse().slice(0, 14)}
              getRowId={rowId}
              renderMobileCard={(r) => (
                <CompactRowCard
                  title={r.date || "—"}
                  subtitle={`${r.bookings ?? 0} bookings`}
                  meta={money(r.revenue)}
                />
              )}
            />
          ) : (
            <EmptyState title="No daily revenue" description="Daily totals appear after bookings." />
          )}
        </ReportSection>
      </div>
    </div>
  );
}
