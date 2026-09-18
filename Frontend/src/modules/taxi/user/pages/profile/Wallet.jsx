import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Wallet } from "lucide-react";
import { userAPI } from "@food/api";
import {
  TaxiPageShell,
  TaxiPageHeader,
  SectionLabel,
  PrimaryButton,
  EmptyState,
} from "../../components/ui";
import useTaxiAuthUser from "../../hooks/useTaxiAuthUser";
import { getTaxiProfilePath } from "../../utils/routes";
import { redirectToTaxiLogin } from "../../utils/authUser";
import { WALLET_TRANSACTIONS } from "../../utils/mock/profile";

const inr = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function WalletPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoggedIn, loading: authLoading } = useTaxiAuthUser();
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    if (!authLoading && !isLoggedIn) {
      redirectToTaxiLogin(navigate, location);
    }
  }, [authLoading, isLoggedIn, navigate, location]);

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await userAPI.getWallet();
        const data = res?.data?.data || res?.data || {};
        const nextBalance =
          data?.wallet?.balance ??
          data?.balance ??
          data?.walletBalance ??
          data?.totalBalance ??
          0;
        const txs =
          data?.wallet?.transactions ||
          data?.transactions ||
          [];
        if (!cancelled) {
          setBalance(Number(nextBalance) || 0);
          setTransactions(
            Array.isArray(txs) && txs.length
              ? txs.slice(0, 10).map((tx, i) => ({
                  id: tx.id || tx._id || `tx-${i}`,
                  title: tx.title || tx.type || "Transaction",
                  subtitle: tx.subtitle || tx.note || tx.description || "",
                  amount: Number(tx.amount ?? tx.value ?? 0),
                  date: tx.date || tx.createdAt || "",
                  type:
                    Number(tx.amount ?? 0) >= 0 || tx.type === "credit"
                      ? "credit"
                      : "debit",
                }))
              : WALLET_TRANSACTIONS,
          );
        }
      } catch {
        if (!cancelled) {
          setBalance(0);
          setTransactions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  if (!isLoggedIn && !authLoading) return null;

  return (
    <TaxiPageShell>
      <TaxiPageHeader
        title="My Wallet"
        subtitle="Balance & history"
        backTo={getTaxiProfilePath()}
      />
      <main className="space-y-5 px-4 py-4">
        <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#FF6A00] to-[#ff8a3d] p-5 text-white shadow-md">
          <div className="flex items-center gap-2 text-white/85">
            <Wallet className="h-4 w-4" />
            <span className="text-[11px] font-bold uppercase tracking-wide">
              Available balance
            </span>
          </div>
          <p className="mt-2 text-3xl font-black tracking-tight">
            {loading || authLoading ? "…" : inr(balance)}
          </p>
          <PrimaryButton
            className="mt-4 h-10 bg-white text-[#FF6A00] shadow-none hover:bg-white"
            onClick={() =>
              toast.message("Add money", {
                description: "Wallet top-up UI placeholder.",
              })
            }
          >
            <Plus className="h-4 w-4" />
            Add Money
          </PrimaryButton>
        </section>

        <section>
          <SectionLabel>Recent transactions</SectionLabel>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-2xl bg-gray-100"
                />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No transactions yet"
              subtitle="Ride payments and top-ups will appear here."
            />
          ) : (
            <div className="space-y-2">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-3.5 py-3 shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-900">{tx.title}</p>
                    {tx.subtitle ? (
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        {tx.subtitle}
                      </p>
                    ) : null}
                    {tx.date ? (
                      <p className="mt-0.5 text-[10px] text-gray-400">
                        {typeof tx.date === "string"
                          ? tx.date
                          : new Date(tx.date).toLocaleString("en-IN")}
                      </p>
                    ) : null}
                  </div>
                  <p
                    className={`text-sm font-extrabold ${
                      tx.type === "credit"
                        ? "text-emerald-600"
                        : "text-gray-900"
                    }`}
                  >
                    {tx.amount > 0 ? "+" : ""}
                    {inr(tx.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </TaxiPageShell>
  );
}
