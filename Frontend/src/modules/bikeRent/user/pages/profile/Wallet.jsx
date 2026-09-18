import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  RefreshCw,
  Wallet,
} from "lucide-react";
import bikeRentUserApi from "../../services/userApi";
import AddMoneyModal from "@food/components/user/AddMoneyModal";
import {
  BikeRentPageShell,
  BikeRentPageHeader,
  SectionLabel,
  EmptyState,
  PrimaryButton,
} from "../../components/ui";
import useBikeRentAuthUser from "../../hooks/useBikeRentAuthUser";
import { getBikeRentProfilePath } from "../../utils/routes";
import { redirectToBikeRentLogin } from "../../utils/authUser";
import { formatInr } from "../../utils/format";
import {
  formatBikeRentTransactionTitle,
  formatBikeRentTransactionSubtitle,
} from "@food/pages/user/walletModule";

const FILTERS = {
  ALL: "all",
  CREDITS: "credits",
  DEBITS: "debits",
};

function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function mapBikeWalletRow(tx, index) {
  const isCredit = String(tx.type || "").toUpperCase() === "CREDIT";
  const meta = tx.metadata || {};
  const shaped = {
    id: tx.id || `tx-${index}`,
    type: isCredit ? "credit" : "debit",
    amount: Number(tx.amount || 0),
    date: tx.createdAt,
    description: tx.reason || "",
    reason: tx.reason || "",
    status: tx.transactionStatus || "completed",
    openingBalance: tx.openingBalance,
    closingBalance: tx.closingBalance,
    metadata: {
      ...meta,
      source: meta.source || tx.source || "BIKE_RENTAL",
      kind: meta.kind || meta.reasonCode,
      bookingId: meta.bookingId || tx.referenceId,
      bookingNumber: meta.bookingNumber,
    },
  };
  const title = formatBikeRentTransactionTitle(shaped);
  const subtitle =
    formatBikeRentTransactionSubtitle(shaped)
    || [tx.sourceLabel || "Bike Rental", tx.referenceId ? `Ref ${tx.referenceId}` : ""]
      .filter(Boolean)
      .join(" · ");

  return {
    id: shaped.id,
    title,
    subtitle,
    amount: shaped.amount,
    date: shaped.date,
    type: shaped.type,
    status: shaped.status,
    kind: String(meta.kind || meta.reasonCode || "").toLowerCase(),
  };
}

export default function WalletPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoggedIn, loading: authLoading } = useBikeRentAuthUser();
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [filter, setFilter] = useState(FILTERS.ALL);
  const [addMoneyOpen, setAddMoneyOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !isLoggedIn) {
      redirectToBikeRentLogin(navigate, location);
    }
  }, [authLoading, isLoggedIn, navigate, location]);

  const load = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoading(true);
    setError("");
    try {
      const data = await bikeRentUserApi.getWallet({
        source: "BIKE_RENTAL",
        limit: 50,
      });
      const nextBalance = Number(
        data?.wallet?.balance
        ?? data?.balance
        ?? 0,
      );
      setBalance(Number.isFinite(nextBalance) ? nextBalance : 0);
      const rows = Array.isArray(data?.records)
        ? data.records
        : Array.isArray(data?.wallet?.transactions)
          ? data.wallet.transactions
          : [];
      setTransactions(rows.map(mapBikeWalletRow));
    } catch (err) {
      setBalance(0);
      setTransactions([]);
      setError(err?.response?.data?.message || "Failed to load wallet");
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === FILTERS.CREDITS) return transactions.filter((tx) => tx.type === "credit");
    if (filter === FILTERS.DEBITS) return transactions.filter((tx) => tx.type === "debit");
    return transactions;
  }, [filter, transactions]);

  if (!isLoggedIn && !authLoading) return null;

  const chips = [
    { id: FILTERS.ALL, label: "All" },
    { id: FILTERS.CREDITS, label: "Credits" },
    { id: FILTERS.DEBITS, label: "Debits" },
  ];

  return (
    <BikeRentPageShell>
      <BikeRentPageHeader
        title="My Wallet"
        subtitle="Shared balance · Bike Rent activity"
        backTo={getBikeRentProfilePath()}
      />
      <main className="space-y-4 px-4 py-4 pb-8 sm:space-y-5">
        <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#FF6A00] to-[#ff8a3d] p-4 text-white shadow-md sm:p-5">
          <div className="flex items-center gap-2 text-white/85">
            <Wallet className="h-4 w-4 shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-wide">
              Available balance
            </span>
          </div>
          <p className="mt-2 text-3xl font-black tracking-tight break-all">
            {loading || authLoading ? "…" : formatInr(balance)}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-white/80">
            One wallet across Food, Bike Rent, and other services. History below is Bike Rent only.
          </p>
          <PrimaryButton
            type="button"
            className="mt-4 bg-white text-[#FF6A00] hover:bg-white/95"
            onClick={() => setAddMoneyOpen(true)}
            disabled={loading || authLoading}
          >
            <Plus className="h-4 w-4" />
            Add Money
          </PrimaryButton>
        </section>

        {error ? (
          <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {error}
          </p>
        ) : null}

        <section className="min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <SectionLabel>Bike Rent activity</SectionLabel>
            <span className="text-[11px] font-bold text-gray-400 shrink-0">
              {filtered.length} record{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {chips.map((chip) => {
              const active = filter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setFilter(chip.id)}
                  className={`shrink-0 rounded-xl border px-3.5 py-2 text-[12px] font-bold transition-colors ${
                    active
                      ? "border-[#FF6A00] bg-[#FF6A00] text-white"
                      : "border-gray-200 bg-white text-gray-600"
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-2xl bg-gray-100" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No bike rental transactions"
              subtitle="Payments, late charges, cancellation refunds, deposit credits, and Add Money appear here."
            />
          ) : (
            <div className="space-y-2">
              {filtered.map((tx) => {
                const isCredit = tx.type === "credit";
                const Icon = isCredit
                  ? (tx.kind.includes("refund") || /refund/i.test(tx.title) ? RefreshCw : ArrowDownLeft)
                  : ArrowUpRight;
                return (
                  <div
                    key={tx.id}
                    className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white px-3.5 py-3 shadow-sm min-w-0"
                  >
                    <div
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        isCredit ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                      }`}
                    >
                      <Icon className="h-4 w-4" strokeWidth={2.25} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-900 break-words">{tx.title}</p>
                      {tx.subtitle ? (
                        <p className="mt-0.5 truncate text-[11px] text-gray-500">{tx.subtitle}</p>
                      ) : null}
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-400">
                        {tx.date ? <span>{formatDate(tx.date)}</span> : null}
                        {tx.status ? (
                          <span className="rounded-full bg-gray-50 px-1.5 py-px capitalize text-gray-500">
                            {tx.status}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <p
                      className={`shrink-0 text-sm font-extrabold tabular-nums ${
                        isCredit ? "text-emerald-600" : "text-gray-900"
                      }`}
                    >
                      {isCredit ? "+" : "-"}
                      {formatInr(Math.abs(tx.amount))}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <AddMoneyModal
        open={addMoneyOpen}
        onOpenChange={setAddMoneyOpen}
        sourceModule="BIKE_RENTAL"
        onSuccess={() => {
          load();
        }}
      />
    </BikeRentPageShell>
  );
}
