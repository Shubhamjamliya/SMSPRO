import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Wallet as WalletIcon, ArrowDownToLine } from "lucide-react";
import {
  SectionCard,
  FilterBar,
  AdminTable,
  StatusBadge,
  StatCard,
} from "@/shared/components/admin";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import VendorLayout from "../components/VendorLayout";
import VendorModal from "../components/VendorModal";
import { bikeVendorApi } from "../services/vendorApi";
import { BIKE_RENT_ADMIN_SELECT_CLASS, BIKE_RENT_STAT_GRID_4_CLASS } from "../../admin/utils/adminTheme";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const when = (value) => (value ? new Date(value).toLocaleDateString() : "—");

export default function VendorWallet() {
  const [wallet, setWallet] = useState(null);
  const [earnings, setEarnings] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [withdrawalStatus, setWithdrawalStatus] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const dateParams = {};
      if (from) dateParams.createdFrom = from;
      if (to) dateParams.createdTo = to;
      const [walletData, earningsData, withdrawalsData, refundsData] = await Promise.all([
        bikeVendorApi.getWallet(),
        bikeVendorApi.getEarnings({ limit: 20, ...dateParams }),
        bikeVendorApi.getWithdrawals({
          limit: 20,
          ...dateParams,
          ...(withdrawalStatus !== "all" ? { status: withdrawalStatus } : {}),
        }),
        bikeVendorApi.getRefunds({ limit: 20, ...dateParams }),
      ]);
      setWallet(walletData);
      setEarnings(earningsData.records || []);
      setWithdrawals(withdrawalsData.records || []);
      setRefunds(refundsData.records || []);
    } catch {
      toast.error("Could not load wallet");
    } finally {
      setLoading(false);
    }
  }, [from, to, withdrawalStatus]);

  useEffect(() => {
    load();
  }, [load]);

  const submitWithdrawal = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 1) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      await bikeVendorApi.requestWithdrawal({ amount: value });
      toast.success("Withdrawal request submitted");
      setModalOpen(false);
      setAmount("");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not submit withdrawal");
    } finally {
      setSaving(false);
    }
  };

  const earningsColumns = [
    { key: "bookingNumber", header: "Booking", cell: (row) => <span className="font-semibold">{row.bookingNumber}</span> },
    { key: "bikeName", header: "Bike" },
    { key: "totalPaid", header: "Total paid", cell: (row) => money(row.totalPaid) },
    {
      key: "commission",
      header: "Commission",
      cell: (row) => `${money(row.commissionAmount)} (${row.commissionRate}%)`,
    },
    {
      key: "vendorEarning",
      header: "Your earning",
      cell: (row) => <span className="font-semibold text-[var(--just-order-success)]">{money(row.vendorEarning)}</span>,
    },
  ];

  const renderEarningsMobileCard = (row) => (
    <div className="space-y-2.5 rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{row.bookingNumber}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.bikeName}</p>
        </div>
        <span className="shrink-0 text-sm font-semibold text-[var(--just-order-success)]">
          {money(row.vendorEarning)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div>
          <span className="block text-[10px] uppercase tracking-wide">Total paid</span>
          <span className="font-medium text-foreground">{money(row.totalPaid)}</span>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-wide">Commission</span>
          <span className="font-medium text-foreground">
            {money(row.commissionAmount)} ({row.commissionRate}%)
          </span>
        </div>
      </div>
    </div>
  );

  const refundColumns = [
    { key: "bookingNumber", header: "Booking", cell: (row) => <span className="font-semibold">{row.bookingNumber}</span> },
    { key: "bikeName", header: "Bike" },
    { key: "depositRefund", header: "Deposit refund", cell: (row) => money(row.depositRefund?.amount) },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.depositRefund?.status} /> },
    {
      key: "lateDamage",
      header: "Late/damage",
      cell: (row) => (row.lateReturn ? money(row.lateReturn.chargeAmount + row.lateReturn.damageFee) : "—"),
    },
    { key: "processedAt", header: "Processed", cell: (row) => when(row.depositRefund?.processedAt) },
  ];

  const renderRefundMobileCard = (row) => (
    <div className="space-y-2.5 rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{row.bookingNumber}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.bikeName}</p>
        </div>
        <StatusBadge status={row.depositRefund?.status} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div>
          <span className="block text-[10px] uppercase tracking-wide">Deposit refund</span>
          <span className="font-medium text-foreground">{money(row.depositRefund?.amount)}</span>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-wide">Late/damage</span>
          <span className="font-medium text-foreground">
            {row.lateReturn ? money(row.lateReturn.chargeAmount + row.lateReturn.damageFee) : "—"}
          </span>
        </div>
        <div className="col-span-2">
          <span className="block text-[10px] uppercase tracking-wide">Processed</span>
          <span className="font-medium text-foreground">{when(row.depositRefund?.processedAt)}</span>
        </div>
      </div>
    </div>
  );

  const withdrawalColumns = [
    { key: "amount", header: "Amount", cell: (row) => <span className="font-semibold">{money(row.amount)}</span> },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    { key: "createdAt", header: "Requested", cell: (row) => when(row.createdAt) },
    { key: "note", header: "Note", cell: (row) => row.rejectionReason || row.adminNote || "—" },
  ];

  const renderWithdrawalMobileCard = (row) => (
    <div className="space-y-2.5 rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{money(row.amount)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Requested {when(row.createdAt)}</p>
        </div>
        <StatusBadge status={row.status} />
      </div>
      {(row.rejectionReason || row.adminNote) && (
        <p className="truncate text-xs text-muted-foreground">{row.rejectionReason || row.adminNote}</p>
      )}
    </div>
  );

  return (
    <VendorLayout
      title="Wallet"
      subtitle="Track your earnings, refunds, and request payouts."
      actions={
        <Button onClick={() => setModalOpen(true)}>
          <ArrowDownToLine className="mr-1.5 h-3.5 w-3.5" />
          Withdraw
        </Button>
      }
    >
      <div className={BIKE_RENT_STAT_GRID_4_CLASS}>
        <StatCard title="Available balance" value={money(wallet?.availableBalance)} icon={<WalletIcon className="h-5 w-5" />} />
        <StatCard title="Locked (pending withdrawal)" value={money(wallet?.lockedAmount)} icon={<WalletIcon className="h-5 w-5" />} />
        <StatCard title="Lifetime earnings" value={money(wallet?.totalEarnings)} icon={<WalletIcon className="h-5 w-5" />} />
        <StatCard title="Total withdrawn" value={money(wallet?.totalWithdrawn)} icon={<WalletIcon className="h-5 w-5" />} />
      </div>

      <FilterBar
        className="mt-4"
        start={
          <>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#FF6A00] focus:ring-2 focus:ring-[#FF6A00]/20"
            />
            <select
              value={withdrawalStatus}
              onChange={(e) => setWithdrawalStatus(e.target.value)}
              className={BIKE_RENT_ADMIN_SELECT_CLASS}
            >
              <option value="all">All withdrawal statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </>
        }
      />

      <div className="mt-4 space-y-6">
        <SectionCard title="Recent earnings" flush>
          <AdminTable
            columns={earningsColumns}
            data={earnings}
            loading={loading}
            skeletonRows={4}
            getRowId={(row) => row.id}
            renderMobileCard={renderEarningsMobileCard}
            emptyState={{ title: "No earnings yet", description: "No completed bookings in this period." }}
          />
        </SectionCard>

        <SectionCard title="Refund history" flush>
          <AdminTable
            columns={refundColumns}
            data={refunds}
            loading={loading}
            skeletonRows={4}
            getRowId={(row) => row.id}
            renderMobileCard={renderRefundMobileCard}
            emptyState={{ title: "No refunds yet", description: "No deposit refunds in this period." }}
          />
        </SectionCard>

        <SectionCard title="Withdrawal requests" flush>
          <AdminTable
            columns={withdrawalColumns}
            data={withdrawals}
            loading={loading}
            skeletonRows={4}
            getRowId={(row) => row.id}
            renderMobileCard={renderWithdrawalMobileCard}
            emptyState={{ title: "No withdrawal requests yet", description: "No withdrawal requests in this period." }}
          />
        </SectionCard>
      </div>

      <VendorModal open={modalOpen} onClose={() => setModalOpen(false)} title="Request withdrawal">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Available balance: <span className="font-bold text-gray-800">{money(wallet?.availableBalance)}</span>
          </p>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (₹)" />
          <Button onClick={submitWithdrawal} isLoading={saving} className="w-full">
            {saving ? "Submitting…" : "Submit request"}
          </Button>
        </div>
      </VendorModal>
    </VendorLayout>
  );
}
