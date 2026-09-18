import { useCallback, useEffect, useState } from "react";
import {
  IndianRupee,
  Landmark,
  Clock3,
  CheckCircle2,
  CreditCard,
  RotateCcw,
  Receipt,
  Percent,
} from "lucide-react";
import {
  PageHeader,
  SectionCard,
  StatCard,
  FilterBar,
  AdminTable,
  StatusBadge,
  EmptyState,
  TableSkeleton,
  KpiGridSkeleton,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import bikeRentAdminApi from "../services/adminApi";
import {
  BIKE_RENT_ADMIN_PAGE_CLASS,
  BIKE_RENT_ADMIN_SELECT_CLASS,
  BIKE_RENT_STAT_GRID_4_CLASS,
} from "../utils/adminTheme";

const message = (error, fallback) => error?.response?.data?.message || fallback;
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const when = (value) => (value ? new Date(value).toLocaleString() : "—");

const STATUS_TONE = {
  pending: "warning",
  generated: "info",
  approved: "info",
  processing: "warning",
  paid: "success",
  failed: "danger",
};

const STATUS_ACTIONS = {
  generated: { label: "Approve", next: "approved", api: "approveMonthlySettlement" },
  approved: { label: "Mark processing", next: "processing", api: "markMonthlySettlementProcessing" },
  processing: { label: "Mark paid", next: "paid", api: "markMonthlySettlementPaid", needsReference: true },
  failed: { label: "Retry processing", next: "processing", api: "markMonthlySettlementProcessing" },
};

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function Finance() {
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: 20 });
  const [periodFilter, setPeriodFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const [generating, setGenerating] = useState(false);
  const [genPeriod, setGenPeriod] = useState(currentPeriod());

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");
  const [failureNote, setFailureNote] = useState("");

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const data = await bikeRentAdminApi.getFinanceOverview({
        from: from || undefined,
        to: to || undefined,
      });
      setOverview(data);
    } catch (error) {
      toast.error(message(error, "Failed to load finance overview"));
    } finally {
      setOverviewLoading(false);
    }
  }, [from, to]);

  const loadSettlements = useCallback(async () => {
    setLoading(true);
    try {
      const result = await bikeRentAdminApi.getMonthlySettlements({
        page: meta.page,
        limit: meta.limit,
        period: periodFilter || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
      });
      setRows(result.records || []);
      setMeta((current) => ({
        ...current,
        page: result.page || current.page,
        pages: result.pages || 1,
        total: result.total || 0,
        limit: result.limit || current.limit,
      }));
    } catch (error) {
      toast.error(message(error, "Failed to load monthly settlements"));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [meta.page, meta.limit, periodFilter, statusFilter]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    loadSettlements();
  }, [loadSettlements]);

  const openDetail = async (row) => {
    setDetail(row);
    setDetailLoading(true);
    setPaymentReference("");
    setFailureNote("");
    try {
      const full = await bikeRentAdminApi.getMonthlySettlementById(row.id);
      setDetail(full);
    } catch (error) {
      toast.error(message(error, "Failed to load settlement"));
    } finally {
      setDetailLoading(false);
    }
  };

  const generate = async () => {
    if (!genPeriod) return toast.error("Choose a period");
    setGenerating(true);
    try {
      const result = await bikeRentAdminApi.generateMonthlySettlements({ period: genPeriod });
      const count = result.settlements?.length || 0;
      toast.success(count ? `Generated ${count} vendor settlement(s) for ${genPeriod}` : "No new activity for this period");
      loadSettlements();
    } catch (error) {
      toast.error(message(error, "Failed to generate settlements"));
    } finally {
      setGenerating(false);
    }
  };

  const runAction = async (apiFn, extra = {}) => {
    if (!detail) return;
    setActing(true);
    try {
      const updated = await bikeRentAdminApi[apiFn](detail.id, extra);
      setDetail(updated);
      toast.success("Settlement updated");
      loadSettlements();
    } catch (error) {
      toast.error(message(error, "Failed to update settlement"));
    } finally {
      setActing(false);
    }
  };

  const kpis = [
    { key: "totalRevenue", title: "Total Revenue", icon: IndianRupee },
    { key: "vendorPayable", title: "Vendor Payable", icon: Landmark },
    { key: "pendingSettlements", title: "Pending Settlements", icon: Clock3, isCount: true },
    { key: "completedSettlements", title: "Completed Settlements", icon: CheckCircle2, isCount: true },
    { key: "onlineCollections", title: "Online Collections", icon: CreditCard },
    { key: "refunds", title: "Refunds", icon: RotateCcw },
    { key: "gstCollected", title: "GST Collected", icon: Receipt },
    { key: "commission", title: "Platform Commission", icon: Percent },
  ];

  const action = detail ? STATUS_ACTIONS[detail.status] : null;

  const columns = [
    { key: "period", header: "Period", cell: (row) => <span className="font-medium">{row.period}</span> },
    { key: "vendor", header: "Vendor", cell: (row) => row.vendor?.businessName || "—" },
    { key: "bookings", header: "Bookings", cell: (row) => row.settlementCount ?? row.totalBookings ?? 0 },
    { key: "gross", header: "Gross", cell: (row) => money(row.grossRevenue) },
    { key: "commission", header: "Commission", cell: (row) => money(row.platformCommission) },
    { key: "payable", header: "Vendor payable", cell: (row) => <span className="font-semibold text-emerald-700">{money(row.vendorPayableAmount)}</span> },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} label={row.status} tone={STATUS_TONE[row.status]} />,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (row) => (
        <Button size="sm" variant="ghost" onClick={() => openDetail(row)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <div className={BIKE_RENT_ADMIN_PAGE_CLASS}>
      <PageHeader
        title="Finance"
        description="Platform revenue, vendor payouts, and monthly settlement runs"
      />

      <SectionCard flush className="mb-4">
        <div className="space-y-3 p-3 sm:p-4">
          <FilterBar
            start={
              <div className="flex flex-wrap items-center gap-2">
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
                <span className="text-xs text-muted-foreground">to</span>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
              </div>
            }
          />
          {overviewLoading ? (
            <KpiGridSkeleton count={8} className="sm:grid-cols-2 xl:grid-cols-4" />
          ) : (
            <div className={BIKE_RENT_STAT_GRID_4_CLASS}>
              {kpis.map((kpi) => {
                const Icon = kpi.icon;
                const value = overview?.[kpi.key] ?? 0;
                return (
                  <StatCard
                    key={kpi.key}
                    title={kpi.title}
                    value={kpi.isCount ? String(value) : money(value)}
                    icon={<Icon size={18} />}
                  />
                );
              })}
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard flush>
        <div className="space-y-4 p-3 sm:p-4">
          <FilterBar
            start={
              <div className="flex w-full flex-col gap-2 sm:flex-row">
                <select
                  className={`${BIKE_RENT_ADMIN_SELECT_CLASS} sm:w-44`}
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setMeta((v) => ({ ...v, page: 1 }));
                  }}
                >
                  <option value="all">All statuses</option>
                  <option value="generated">Generated</option>
                  <option value="approved">Approved</option>
                  <option value="processing">Processing</option>
                  <option value="paid">Paid</option>
                  <option value="failed">Failed</option>
                </select>
                <Input
                  placeholder="Period (YYYY-MM)"
                  value={periodFilter}
                  onChange={(e) => {
                    setPeriodFilter(e.target.value);
                    setMeta((v) => ({ ...v, page: 1 }));
                  }}
                  className="sm:w-40"
                />
              </div>
            }
            end={
              <div className="flex items-center gap-2">
                <Input
                  placeholder="YYYY-MM"
                  value={genPeriod}
                  onChange={(e) => setGenPeriod(e.target.value)}
                  className="w-32"
                />
                <Button size="sm" disabled={generating} onClick={generate}>
                  {generating ? "Generating…" : "Generate settlements"}
                </Button>
              </div>
            }
          />

          {loading ? (
            <TableSkeleton rows={6} columns={8} />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No monthly settlements yet"
              description="Generate a settlement for a period to aggregate that month's vendor payouts."
            />
          ) : (
            <AdminTable
              columns={columns}
              data={rows}
              getRowId={(row) => row.id}
              pagination={{
                page: meta.page,
                totalPages: meta.pages,
                total: meta.total,
                pageSize: meta.limit,
                onPageChange: (page) => setMeta((v) => ({ ...v, page })),
                onPageSizeChange: (limit) => setMeta((v) => ({ ...v, limit, page: 1 })),
              }}
            />
          )}
        </div>
      </SectionCard>

      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="just-order-theme-scope w-[calc(100vw-1rem)] max-w-lg rounded-2xl sm:rounded-3xl">
          <DialogHeader className="text-left">
            <DialogTitle>
              {detail?.period} — {detail?.vendor?.businessName || "Vendor"}
            </DialogTitle>
            {detail ? (
              <div className="mt-1">
                <StatusBadge status={detail.status} label={detail.status} tone={STATUS_TONE[detail.status]} />
              </div>
            ) : null}
          </DialogHeader>
          {detailLoading ? (
            <TableSkeleton rows={5} columns={2} />
          ) : detail ? (
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-slate-500">Total bookings</span>
                <span className="font-medium">{detail.totalBookings}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-slate-500">Gross revenue</span>
                <span className="font-medium">{money(detail.grossRevenue)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-slate-500">GST</span>
                <span className="font-medium">{money(detail.gstCollected)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-slate-500">Platform fee</span>
                <span className="font-medium">{money(detail.platformFeeAmount)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-slate-500">Platform commission</span>
                <span className="font-medium">{money(detail.platformCommission)}</span>
              </div>
              {detail.refundAdjustments ? (
                <div className="flex justify-between border-b border-slate-100 py-1.5">
                  <span className="text-slate-500">Adjustments (late charges/refunds)</span>
                  <span className={`font-medium ${detail.refundAdjustments < 0 ? "text-red-600" : "text-emerald-700"}`}>
                    {detail.refundAdjustments >= 0 ? "+" : ""}
                    {money(detail.refundAdjustments)}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between py-1.5 text-base">
                <span className="font-semibold text-slate-900">Vendor payable</span>
                <span className="font-semibold text-emerald-700">{money(detail.vendorPayableAmount)}</span>
              </div>
              {detail.status === "paid" ? (
                <p className="mt-1 text-xs text-slate-500">
                  Paid {when(detail.paidAt)}
                  {detail.paymentReference ? ` · Ref: ${detail.paymentReference}` : ""}
                </p>
              ) : null}
              {detail.status === "failed" && detail.failureReason ? (
                <p className="mt-1 text-xs text-red-600">Failure: {detail.failureReason}</p>
              ) : null}

              {action?.needsReference ? (
                <Input
                  className="mt-2"
                  placeholder="Payment reference (bank UTR / txn id)"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                />
              ) : null}
              {detail.status === "processing" ? (
                <Input
                  className="mt-2"
                  placeholder="Failure reason (only if marking failed)"
                  value={failureNote}
                  onChange={(e) => setFailureNote(e.target.value)}
                />
              ) : null}
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" disabled={acting} onClick={() => setDetail(null)}>
              Close
            </Button>
            {detail?.status === "processing" ? (
              <Button
                variant="outline"
                disabled={acting}
                onClick={() => runAction("markMonthlySettlementFailed", { failureReason: failureNote })}
              >
                Mark failed
              </Button>
            ) : null}
            {action ? (
              <Button
                disabled={acting || (action.needsReference && !paymentReference.trim())}
                onClick={() => runAction(action.api, action.needsReference ? { paymentReference: paymentReference.trim() } : {})}
              >
                {acting ? "Saving…" : action.label}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
