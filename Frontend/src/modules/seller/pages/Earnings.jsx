import React from "react";
import Card from "@shared/components/ui/Card";
import Button from "@shared/components/ui/Button";
import {
  TrendingUp,
  BarChart3,
  IndianRupee,
  Download,
  Banknote,
  ArrowDownToLine,
  Building2,
  Package,
  Percent,
  ShoppingBag,
  Clock3,
  Tag,
  Undo2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { BlurFade } from "@/components/ui/blur-fade";
import ShimmerButton from "@/components/ui/shimmer-button";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { exportToCSV } from "@/lib/exportUtils";
import { useSellerEarnings } from "../context/SellerEarningsContext";

const formatINR = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;

const Earnings = () => {
  const navigate = useNavigate();
  const { earningsData: data, earningsLoading: loading } = useSellerEarnings();
  const [withdrawAmount, setWithdrawAmount] = React.useState("");
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = React.useState(false);
  const [isWithdrawing, setIsWithdrawing] = React.useState(false);

  const balances = data?.balances || {};
  const itemsSubtotal = Number(balances.itemsSubtotal ?? 0);
  const totalPacking = Number(balances.totalPacking ?? 0);
  const grossSales = Number(
    balances.grossSales ?? itemsSubtotal + totalPacking,
  );
  const totalCommission = Number(balances.totalCommission ?? 0);
  const sellerCouponDiscount = Number(balances.sellerCouponDiscount ?? 0);
  const totalNetEarnings = Number(balances.totalNetEarnings ?? 0);
  const settledBalance = Number(balances.settledBalance ?? 0);
  const totalWithdrawn = Number(balances.totalWithdrawn ?? 0);
  const pendingPayouts = Number(balances.pendingPayouts ?? 0);
  const returnRefundDeducted = Number(balances.returnRefundDeducted ?? 0);
  const returnRefundPending = Number(balances.returnRefundPending ?? 0);
  const returnedOrdersCount = Number(balances.returnedOrdersCount ?? 0);
  const pickupFeesPaidByAdmin = Number(balances.pickupFeesPaidByAdmin ?? 0);

  React.useEffect(() => {
    if (data?.balances != null && withdrawAmount === "") {
      setWithdrawAmount(settledBalance > 0 ? String(settledBalance) : "");
    }
  }, [data?.balances, settledBalance, withdrawAmount]);

  const handleWithdraw = () => {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0 || amount > settledBalance) {
      alert(
        "Please enter a valid amount between ₹0.01 and ₹" +
          settledBalance.toLocaleString(),
      );
      return;
    }

    setIsWithdrawing(true);
    setTimeout(() => {
      setIsWithdrawing(false);
      setIsWithdrawModalOpen(false);
      alert(
        `Withdrawal request of ₹${amount.toLocaleString()} submitted successfully!`,
      );
    }, 1500);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen font-black text-slate-600">
        LOADING EARNINGS...
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      <BlurFade delay={0.1}>
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
          <div>
            <h2 className="text-xl font-semibold text-gray-800 hidden md:block">
              Earnings Overview
            </h2>
            <p className="text-sm text-slate-500 mt-1 hidden md:block">
              Sales, packing, commission, and withdrawable balance
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => {
                const ledger = Array.isArray(data?.ledger) ? data.ledger : [];
                if (ledger.length === 0) {
                  toast.info("No transactions to export.");
                  return;
                }
                const exportData = ledger.map((txn) => ({
                  id: txn.id ?? txn.ref ?? "",
                  type: txn.type ?? "",
                  amount: formatINR(txn.amount ?? 0),
                  status: txn.status ?? "",
                  date:
                    txn.date ??
                    (txn.createdAt
                      ? new Date(txn.createdAt).toLocaleDateString()
                      : ""),
                  customer: txn.customer ?? "",
                  ref: txn.ref ?? "",
                }));
                exportToCSV(exportData, "Seller_Earnings_Report", {
                  id: "Transaction ID",
                  type: "Type",
                  amount: "Amount",
                  status: "Status",
                  date: "Date",
                  customer: "Customer",
                  ref: "Reference",
                });
                toast.success("Earnings report downloaded successfully!");
              }}
              variant="outline"
              className="border-gray-200"
            >
              <Download className="mr-2 h-5 w-5" />
              Download Report
            </Button>
            <ShimmerButton
              onClick={() => navigate("/seller/withdrawals")}
              className="px-6 py-2 rounded-xl text-sm font-bold text-white shadow-lg"
            >
              <span className="text-white">Withdraw Funds</span>
            </ShimmerButton>
          </div>
        </div>
      </BlurFade>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <BlurFade delay={0.15}>
          <Card className="bg-gradient-to-br from-[#FF6A00] to-[#E85D04] text-white border-none shadow-lg h-full">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-orange-100 font-medium">Total Net Earnings</p>
                <h3 className="text-4xl font-bold mt-2">
                  {formatINR(totalNetEarnings)}
                </h3>
                <p className="text-xs text-orange-100/90 mt-2">
                  After commission
                  {sellerCouponDiscount > 0 ? " & seller coupons" : ""}
                </p>
              </div>
              <div className="p-3 bg-white/20 rounded-xl">
                <IndianRupee className="h-8 w-8 text-white" />
              </div>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-2">
              <span className="flex items-center text-orange-50 bg-white/10 px-3 py-1 rounded-full text-sm">
                <TrendingUp className="mr-2 h-4 w-4" />
                Delivered orders only
              </span>
              {returnRefundDeducted > 0 ? (
                <span className="flex items-center text-orange-50 bg-white/10 px-3 py-1 rounded-full text-sm">
                  <Undo2 className="mr-2 h-4 w-4" />
                  {formatINR(returnRefundDeducted)} returned
                </span>
              ) : null}
            </div>
          </Card>
        </BlurFade>

        <BlurFade delay={0.2}>
          <Card className="h-full border-none shadow-md bg-white">
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">
              Earnings Breakdown
            </p>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium flex items-center gap-2">
                  <ShoppingBag className="h-3.5 w-3.5" />
                  Items subtotal
                </span>
                <span className="text-slate-900 font-bold">
                  {formatINR(itemsSubtotal)}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium flex items-center gap-2">
                  <Package className="h-3.5 w-3.5" />
                  Packing fees
                </span>
                <span className="text-emerald-600 font-bold">
                  + {formatINR(totalPacking)}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm pt-1 border-t border-slate-100">
                <span className="text-slate-600 font-semibold">Gross sales</span>
                <span className="text-slate-900 font-bold">
                  {formatINR(grossSales)}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium flex items-center gap-2">
                  <Percent className="h-3.5 w-3.5" />
                  Admin commission
                </span>
                <span className="text-rose-500 font-bold">
                  - {formatINR(totalCommission)}
                </span>
              </div>
              {sellerCouponDiscount > 0 ? (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 font-medium flex items-center gap-2">
                    <Tag className="h-3.5 w-3.5" />
                    Seller coupon
                  </span>
                  <span className="text-amber-600 font-bold">
                    - {formatINR(sellerCouponDiscount)}
                  </span>
                </div>
              ) : null}
              {returnRefundDeducted > 0 ? (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 font-medium flex items-center gap-2">
                    <Undo2 className="h-3.5 w-3.5" />
                    Return refunds
                    {returnedOrdersCount > 0 ? ` (${returnedOrdersCount})` : ""}
                  </span>
                  <span className="text-rose-500 font-bold">
                    - {formatINR(returnRefundDeducted)}
                  </span>
                </div>
              ) : null}
              <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
                <span className="text-slate-900 font-black">Net payout</span>
                <span className="text-[#FF6A00] font-black">
                  {formatINR(totalNetEarnings)}
                </span>
              </div>
              {returnRefundPending > 0 ? (
                <p className="text-xs font-semibold text-amber-600 pt-1">
                  {formatINR(returnRefundPending)} sits in returns still being
                  processed — it comes off once each refund clears.
                </p>
              ) : null}
              {pickupFeesPaidByAdmin > 0 ? (
                <p className="text-xs font-semibold text-emerald-600">
                  {formatINR(pickupFeesPaidByAdmin)} of return pickup charges was
                  covered by the platform, not you.
                </p>
              ) : null}
            </div>
          </Card>
        </BlurFade>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <BlurFade delay={0.25}>
          <Card className="border-none shadow-md bg-white group hover:shadow-xl transition-all duration-300">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">
                  Available to Withdraw
                </p>
                <h2 className="text-2xl font-black text-emerald-600 tracking-tight">
                  {formatINR(settledBalance)}
                </h2>
              </div>
              <div className="p-2 bg-emerald-50 rounded-lg">
                <ArrowDownToLine className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </Card>
        </BlurFade>

        <BlurFade delay={0.3}>
          <Card className="border-none shadow-md bg-white group hover:shadow-xl transition-all duration-300">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">
                  Total Withdrawn
                </p>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                  {formatINR(totalWithdrawn)}
                </h2>
              </div>
              <div className="p-2 bg-orange-50 rounded-lg">
                <Banknote className="h-5 w-5 text-[#FF6A00]" />
              </div>
            </div>
          </Card>
        </BlurFade>

        <BlurFade delay={0.35}>
          <Card className="border-none shadow-md bg-white group hover:shadow-xl transition-all duration-300">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">
                  Pending Payouts
                </p>
                <h2 className="text-2xl font-black text-amber-600 tracking-tight">
                  {formatINR(pendingPayouts)}
                </h2>
              </div>
              <div className="p-2 bg-amber-50 rounded-lg">
                <Clock3 className="h-5 w-5 text-amber-500" />
              </div>
            </div>
          </Card>
        </BlurFade>
      </div>

      <BlurFade delay={0.4}>
        <Card className="border-none shadow-md bg-white">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-[#FF6A00]" />
              Monthly Revenue Performance
            </h3>
          </div>
          <div className="h-[300px] w-full min-h-[200px] flex items-center justify-center">
            {(Array.isArray(data?.monthlyChart) ? data.monthlyChart : [])
              .length === 0 ? (
              <p className="text-slate-600 text-sm font-medium">
                No monthly revenue data yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthlyChart}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#f1f5f9"
                  />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 700 }}
                    tickFormatter={(value) => `₹${value}`}
                  />
                  <Tooltip
                    cursor={{ fill: "#fff7ed" }}
                    contentStyle={{
                      borderRadius: "12px",
                      border: "none",
                      boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                      fontSize: "12px",
                      fontWeight: "700",
                    }}
                    formatter={(value) => [
                      `₹${Number(value).toLocaleString()}`,
                      "Revenue",
                    ]}
                  />
                  <Bar
                    dataKey="revenue"
                    fill="url(#colorRevenueOrange)"
                    radius={[6, 6, 0, 0]}
                    barSize={40}
                  />
                  <defs>
                    <linearGradient
                      id="colorRevenueOrange"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="5%" stopColor="#FF6A00" stopOpacity={1} />
                      <stop offset="95%" stopColor="#FB923C" stopOpacity={1} />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </BlurFade>

      <AnimatePresence>
        {isWithdrawModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md relative z-10 bg-white rounded-lg shadow-2xl overflow-hidden p-8 text-center"
            >
              <div className="h-16 w-16 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                <Banknote className="h-8 w-8 text-[#FF6A00]" />
              </div>

              <h2 className="text-2xl font-black text-slate-900 mb-2">
                Withdraw Funds
              </h2>
              <p className="text-sm text-slate-600 font-medium mb-8">
                Available Balance:{" "}
                <span className="text-[#FF6A00] font-bold">
                  {formatINR(settledBalance)}
                </span>
              </p>

              <div className="space-y-4 text-left">
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">
                    Amount
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 font-bold">
                      ₹
                    </span>
                    <input
                      type="number"
                      className="w-full pl-8 pr-4 py-3 rounded-lg border-slate-200 bg-slate-50 font-bold text-slate-900 focus:ring-2 focus:ring-[#FF6A00]/20 focus:border-[#FF6A00] transition-all outline-none"
                      placeholder="0.00"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">
                    Select Bank Account
                  </label>
                  <div className="p-4 border border-slate-200 rounded-lg flex items-center gap-4 cursor-pointer hover:border-[#FF6A00] hover:bg-orange-50/40 transition-all group">
                    <div className="h-10 w-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600 group-hover:bg-orange-100 group-hover:text-[#FF6A00] transition-colors">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-black text-slate-900">
                        HDFC Bank **** 4589
                      </p>
                      <p className="text-xs text-slate-600 font-bold">
                        Primary Account
                      </p>
                    </div>
                    <div className="h-5 w-5 rounded-full border-2 border-slate-200 group-hover:border-[#FF6A00] group-hover:bg-[#FF6A00] transition-all" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-8">
                <button
                  onClick={() => setIsWithdrawModalOpen(false)}
                  className="py-3 rounded-lg font-black text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleWithdraw}
                  disabled={isWithdrawing}
                  className="py-3 rounded-lg bg-[#FF6A00] text-white font-black shadow-lg shadow-orange-200 hover:bg-[#E85D04] transition-all disabled:opacity-60"
                >
                  {isWithdrawing ? "SUBMITTING..." : "CONFIRM"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Earnings;
