import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Receipt } from "lucide-react";
import {
  SectionCard,
  FilterBar,
  AdminTable,
  StatusBadge,
} from "@/shared/components/admin";
import VendorLayout from "../components/VendorLayout";
import { bikeVendorApi } from "../services/vendorApi";
import { BIKE_RENT_ADMIN_SELECT_CLASS } from "../../admin/utils/adminTheme";

const TYPE_LABELS = {
  booking_payment: "Booking payment",
  deposit_collection: "Deposit collection",
  refund: "Refund",
  damage_deduction: "Damage deduction",
  late_charge: "Late charge",
  vendor_earning: "Vendor earning",
  platform_commission: "Platform commission",
  vendor_settlement: "Settlement",
  admin_adjustment: "Admin adjustment",
};

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const when = (value) => (value ? new Date(value).toLocaleString() : "—");

export default function VendorTransactions() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: 20 });
  const [type, setType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);

  const [monthly, setMonthly] = useState([]);
  const [monthlyLoading, setMonthlyLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await bikeVendorApi.getFinanceTransactions({
        page: meta.page,
        limit: meta.limit,
        transactionType: type === "all" ? undefined : type,
        createdFrom: from || undefined,
        createdTo: to || undefined,
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
      toast.error(error?.response?.data?.message || "Could not load transactions");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [meta.page, meta.limit, type, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setMonthlyLoading(true);
      try {
        const result = await bikeVendorApi.getMonthlySettlements({ limit: 12 });
        if (!cancelled) setMonthly(result.records || []);
      } catch {
        if (!cancelled) setMonthly([]);
      } finally {
        if (!cancelled) setMonthlyLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const monthlyColumns = [
    { key: "period", header: "Period", cell: (row) => <span className="font-semibold">{row.period}</span> },
    { key: "bookings", header: "Bookings", cell: (row) => row.settlementCount ?? row.totalBookings },
    { key: "gross", header: "Gross", cell: (row) => money(row.grossRevenue) },
    {
      key: "payable",
      header: "Payable",
      cell: (row) => <span className="font-semibold text-[var(--just-order-success)]">{money(row.vendorPayableAmount)}</span>,
    },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
  ];

  const renderMonthlyMobileCard = (row) => (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{row.period}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {row.settlementCount ?? row.totalBookings} bookings
          </p>
        </div>
        <StatusBadge status={row.status} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div>
          <span className="block text-[10px] uppercase tracking-wide">Gross</span>
          <span className="font-medium text-foreground">{money(row.grossRevenue)}</span>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-wide">Payable</span>
          <span className="font-semibold text-[var(--just-order-success)]">
            {money(row.vendorPayableAmount)}
          </span>
        </div>
      </div>
    </div>
  );

  const transactionColumns = [
    { key: "createdAt", header: "Date", cell: (row) => when(row.createdAt) },
    {
      key: "type",
      header: "Type",
      cell: (row) => <span className="font-semibold">{TYPE_LABELS[row.transactionType] || row.transactionType}</span>,
    },
    { key: "paymentMode", header: "Mode", cell: (row) => <span className="capitalize">{row.paymentMode}</span> },
    {
      key: "transactionId",
      header: "Reference",
      cell: (row) => <span className="text-xs text-muted-foreground">{row.transactionId}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      cell: (row) => <span className="font-semibold">{money(row.amount)}</span>,
    },
  ];

  const renderTransactionMobileCard = (row) => (
    <div className="space-y-2.5 rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {TYPE_LABELS[row.transactionType] || row.transactionType}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{when(row.createdAt)}</p>
        </div>
        <span className="shrink-0 text-sm font-semibold text-foreground">{money(row.amount)}</span>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="capitalize">{row.paymentMode}</span>
        <span className="truncate">{row.transactionId}</span>
      </div>
    </div>
  );

  return (
    <VendorLayout title="Transactions" subtitle="Complete history of earnings, deductions, refunds, and payouts.">
      <SectionCard title="Monthly settlements" icon={<Receipt className="h-4 w-4" />} flush>
        <AdminTable
          columns={monthlyColumns}
          data={monthly}
          loading={monthlyLoading}
          skeletonRows={3}
          getRowId={(row) => row.id}
          renderMobileCard={renderMonthlyMobileCard}
          emptyState={{ title: "No monthly settlements yet", description: "Payout runs will appear here." }}
        />
      </SectionCard>

      <div className="mt-6 space-y-4">
        <FilterBar
          start={
            <>
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  setMeta((v) => ({ ...v, page: 1 }));
                }}
                className={BIKE_RENT_ADMIN_SELECT_CLASS}
              >
                <option value="all">All transaction types</option>
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setMeta((v) => ({ ...v, page: 1 }));
                }}
                className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setMeta((v) => ({ ...v, page: 1 }));
                }}
                className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20"
              />
            </>
          }
        />

        <AdminTable
          columns={transactionColumns}
          data={rows}
          loading={loading}
          skeletonRows={6}
          getRowId={(row) => row.id}
          renderMobileCard={renderTransactionMobileCard}
          emptyState={{
            title: "No transactions yet",
            description: "Your earnings and deductions will show up here.",
          }}
          pagination={{
            page: meta.page,
            totalPages: meta.pages,
            total: meta.total,
            pageSize: meta.limit,
            onPageChange: (page) => setMeta((v) => ({ ...v, page })),
          }}
        />
      </div>
    </VendorLayout>
  );
}
