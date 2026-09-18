import { useState, useMemo, useEffect, useCallback } from "react"
import { useSearchParams } from "react-router-dom"
import {
  ArrowLeft,
  Wallet as WalletIcon,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Gift,
  Sparkles,
} from "lucide-react"
import { Button } from "@food/components/ui/button"
import AnimatedPage from "@food/components/user/AnimatedPage"
import AddMoneyModal from "@food/components/user/AddMoneyModal"
import { userAPI } from "@food/api"
import { toast } from "sonner"
import { useCompanyName } from "@food/hooks/useCompanyName"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import {
  resolveWalletFrom,
  isModuleWalletTransaction,
  walletModuleTitle,
  walletSourceModuleForApi,
  formatBikeRentTransactionTitle,
  formatBikeRentTransactionSubtitle,
} from "./walletModule"

const TRANSACTION_TYPES = {
  ALL: "all",
  ADDITIONS: "additions",
  DEDUCTIONS: "deductions",
  REFUNDS: "refunds",
}

function BalanceSkeleton() {
  return (
    <div className="rounded-3xl overflow-hidden border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/60 p-6 shimmer-bg">
      <div className="h-3 w-24 rounded-md bg-gray-100 dark:bg-gray-800 mb-4" />
      <div className="h-10 w-40 rounded-xl bg-gray-100 dark:bg-gray-800 mb-6" />
      <div className="h-12 w-full rounded-2xl bg-gray-100 dark:bg-gray-800" />
    </div>
  )
}

function TransactionSkeleton() {
  return (
    <div className="flex items-center gap-3 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/60 shimmer-bg">
      <div className="h-11 w-11 rounded-xl bg-gray-100 dark:bg-gray-800 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-3/5 rounded-md bg-gray-100 dark:bg-gray-800" />
        <div className="h-3 w-2/5 rounded-md bg-gray-100 dark:bg-gray-800" />
      </div>
      <div className="h-5 w-16 rounded-md bg-gray-100 dark:bg-gray-800" />
    </div>
  )
}

function ShimmerStyles() {
  return (
    <style>{`
      @keyframes shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }
      .shimmer-bg { position: relative; overflow: hidden; }
      .shimmer-bg::after {
        position: absolute; inset: 0;
        transform: translateX(-100%);
        background-image: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
        content: ''; animation: shimmer 2s infinite;
      }
      .dark .shimmer-bg::after {
        background-image: linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent);
      }
      .no-scrollbar::-webkit-scrollbar { display: none; }
      .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
    `}</style>
  )
}

function formatAmount(amount) {
  const numeric = Number(amount ?? 0)
  const safe = Number.isFinite(numeric) ? numeric : 0
  return `${"\u20B9"}${safe.toLocaleString("en-IN")}`
}

function formatDate(dateString) {
  if (!dateString) return "N/A"
  const date = new Date(dateString)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()

  const time = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
  if (isToday) return `Today, ${time}`
  if (isYesterday) return `Yesterday, ${time}`
  return `${date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}, ${time}`
}

function getTransactionMeta(type) {
  switch (type) {
    case "addition":
      return {
        icon: ArrowDownLeft,
        iconBg: "bg-emerald-50 dark:bg-emerald-950/30",
        iconColor: "text-emerald-600 dark:text-emerald-400",
        amountColor: "text-emerald-600 dark:text-emerald-400",
        prefix: "+",
      }
    case "deduction":
      return {
        icon: ArrowUpRight,
        iconBg: "bg-red-50 dark:bg-red-950/30",
        iconColor: "text-red-600 dark:text-red-400",
        amountColor: "text-red-600 dark:text-red-400",
        prefix: "-",
      }
    case "refund":
      return {
        icon: RefreshCw,
        iconBg: "bg-blue-50 dark:bg-blue-950/30",
        iconColor: "text-blue-600 dark:text-blue-400",
        amountColor: "text-blue-600 dark:text-blue-400",
        prefix: "+",
      }
    default:
      return {
        icon: WalletIcon,
        iconBg: "bg-gray-50 dark:bg-gray-800",
        iconColor: "text-gray-500",
        amountColor: "text-gray-700 dark:text-gray-300",
        prefix: "",
      }
  }
}

export default function Wallet() {
  const companyName = useCompanyName()
  const goBack = useAppBackNavigation()
  const [searchParams] = useSearchParams()
  const moduleKey = resolveWalletFrom(searchParams.get("from"))
  const isBikeModule = moduleKey === "bike"
  const moduleLabel = walletModuleTitle(moduleKey)

  const [selectedFilter, setSelectedFilter] = useState(TRANSACTION_TYPES.ALL)
  const [wallet, setWallet] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [addMoneyModalOpen, setAddMoneyModalOpen] = useState(false)

  const apiSource = walletSourceModuleForApi(moduleKey)

  const fetchWalletData = useCallback(async ({ force = false } = {}) => {
    try {
      setLoading(true)
      setError(null)
      // When opened via ?from=<module>, ask API for that module's ledger only.
      // Food default: load full ledger; client keeps Food-scoped history.
      const response = await userAPI.getWallet({
        force: Boolean(force),
        ...(apiSource ? { source: apiSource } : {}),
      })
      const walletData = response?.data?.data?.wallet || response?.data?.wallet
      if (walletData) {
        setWallet(walletData)
        setTransactions(Array.isArray(walletData.transactions) ? walletData.transactions : [])
      } else {
        setWallet(null)
        setTransactions([])
      }
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load wallet")
      toast.error("Failed to load wallet data")
    } finally {
      setLoading(false)
    }
  }, [apiSource])

  useEffect(() => {
    fetchWalletData({ force: true })
  }, [fetchWalletData])

  useEffect(() => {
    setSelectedFilter(TRANSACTION_TYPES.ALL)
  }, [moduleKey])

  const currentBalance = wallet?.balance || 0

  const moduleTransactions = useMemo(() => {
    // Always scope history: default Food flow excludes other services.
    return transactions.filter((tx) => isModuleWalletTransaction(tx, moduleKey || "food"))
  }, [transactions, moduleKey])

  const referralEarnings = useMemo(() => {
    if (moduleKey) return 0
    if (wallet?.referralEarnings != null) {
      return Number(wallet.referralEarnings) || 0
    }
    return transactions
      .filter(
        (transaction) =>
          transaction.type === "addition" &&
          transaction.status === "Completed" &&
          (transaction?.metadata?.source === "referral_signup" ||
            String(transaction.description || "").toLowerCase().startsWith("referral reward")),
      )
      .reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0)
  }, [wallet, transactions, moduleKey])

  const filteredTransactions = useMemo(() => {
    if (selectedFilter === TRANSACTION_TYPES.ALL) return moduleTransactions
    return moduleTransactions.filter((transaction) => {
      if (selectedFilter === TRANSACTION_TYPES.ADDITIONS) {
        // Bike credits are stored as refunds in the shared ledger.
        if (isBikeModule) {
          return transaction.type === "addition" || transaction.type === "refund"
        }
        return transaction.type === "addition"
      }
      if (selectedFilter === TRANSACTION_TYPES.DEDUCTIONS) return transaction.type === "deduction"
      if (selectedFilter === TRANSACTION_TYPES.REFUNDS) return transaction.type === "refund"
      return true
    })
  }, [selectedFilter, moduleTransactions, isBikeModule])

  const isReferralTransaction = (transaction) =>
    transaction?.metadata?.source === "referral_signup" ||
    String(transaction.description || "").toLowerCase().startsWith("referral reward")

  const getTitle = (transaction) => {
    if (isBikeModule) return formatBikeRentTransactionTitle(transaction)
    return transaction.description || "Wallet transaction"
  }

  const getSubtitle = (transaction) => {
    if (isBikeModule) return formatBikeRentTransactionSubtitle(transaction)
    return null
  }

  const filterChips = useMemo(() => {
    if (isBikeModule) {
      return [
        { id: TRANSACTION_TYPES.ALL, label: "All" },
        { id: TRANSACTION_TYPES.ADDITIONS, label: "Credits" },
        { id: TRANSACTION_TYPES.DEDUCTIONS, label: "Debits" },
        { id: TRANSACTION_TYPES.REFUNDS, label: "Refunds" },
      ]
    }
    return [
      { id: TRANSACTION_TYPES.ALL, label: "All" },
      { id: TRANSACTION_TYPES.ADDITIONS, label: "Added" },
      { id: TRANSACTION_TYPES.DEDUCTIONS, label: "Spent" },
      { id: TRANSACTION_TYPES.REFUNDS, label: "Refunds" },
    ]
  }, [isBikeModule])

  const emptyCopy = (() => {
    if (selectedFilter !== TRANSACTION_TYPES.ALL) {
      return "No transactions match this filter."
    }
    if (isBikeModule) {
      return "Bike rental payments, late charges, and deposit refunds will show up here."
    }
    if (moduleKey) {
      return `${moduleLabel} wallet activity will show up here.`
    }
    return "Your wallet activity will show up here once you add money or place orders."
  })()

  return (
    <AnimatedPage className="wallet-page min-h-screen w-full min-w-0 overflow-x-hidden bg-[#fcfcff] dark:bg-[#08080a]">
      <ShimmerStyles />

      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-0 right-0 w-[min(45vw,280px)] aspect-square rounded-full bg-gradient-to-br from-orange-500/6 to-transparent blur-[100px]" />
        <div className="absolute bottom-[20%] left-0 w-[min(40vw,240px)] aspect-square rounded-full bg-gradient-to-tr from-[#FF6A00]/5 to-transparent blur-[100px]" />
      </div>

      <div className="sticky top-0 z-40 w-full min-w-0 bg-white/90 dark:bg-[#08080a]/90 backdrop-blur-md border-b border-gray-100 dark:border-gray-900">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 sm:px-6 py-3.5 min-w-0">
          <button
            type="button"
            onClick={goBack}
            className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-900 rounded-xl transition-colors shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-white" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-extrabold text-gray-900 dark:text-white tracking-tight truncate">
              {moduleKey ? `${moduleLabel} Wallet` : "Wallet"}
            </h1>
            <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500 truncate">
              {moduleKey
                ? `Shared ${companyName} balance · ${moduleLabel} activity`
                : `${companyName} Money`}
            </p>
          </div>
        </div>
      </div>

      <div className="relative max-w-3xl mx-auto w-full min-w-0 px-4 sm:px-6 py-5 sm:py-6 space-y-5 sm:space-y-6 pb-10">
        {loading && (
          <div className="space-y-6">
            <BalanceSkeleton />
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <TransactionSkeleton key={i} />
              ))}
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-4">
            <p className="text-red-600 dark:text-red-400 text-sm font-medium">{error}</p>
            <button
              type="button"
              onClick={() => fetchWalletData({ force: true })}
              className="mt-3 text-sm font-bold text-[#FF6A00] hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden shadow-[0_16px_48px_-16px_rgba(255,106,0,0.35)] border border-orange-200/30 dark:border-orange-900/30">
              <div className="absolute inset-0 bg-gradient-to-br from-[#FF6A00] via-[#E85D04] to-[#C84B00]" />
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-60" />

              <div className="relative p-4 sm:p-6">
                <div className="flex items-start justify-between gap-3 sm:gap-4 mb-4 sm:mb-5">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm border border-white/20 rounded-xl px-2.5 py-1 mb-3">
                      <WalletIcon className="h-3.5 w-3.5 text-white shrink-0" />
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-white/90">
                        Available balance
                      </span>
                    </div>
                    <p className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-none break-all">
                      {formatAmount(currentBalance)}
                    </p>
                  </div>
                  <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center shrink-0">
                    <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-white/90" />
                  </div>
                </div>

                {moduleKey ? (
                  <p className="text-white/75 text-xs font-medium mb-4">
                    Showing {moduleLabel.toLowerCase()} refunds, deductions, and credits. Balance is shared across {companyName}.
                  </p>
                ) : (
                  <>
                    {referralEarnings > 0 && (
                      <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl px-3.5 py-2.5 mb-4">
                        <Gift className="h-4 w-4 text-white/80 shrink-0" />
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-white/70">Referral earnings</p>
                          <p className="text-sm font-extrabold text-white">{formatAmount(referralEarnings)}</p>
                        </div>
                      </div>
                    )}
                    <p className="text-white/70 text-xs font-medium mb-4">
                      Add money for one-tap, seamless payments across {companyName}
                    </p>
                  </>
                )}

                <Button
                  className="w-full h-11 sm:h-12 rounded-2xl bg-white text-[#FF6A00] hover:bg-white/95 font-extrabold text-sm shadow-lg border-0"
                  onClick={() => setAddMoneyModalOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add money
                </Button>
              </div>
            </div>

            <section className="space-y-3 sm:space-y-4 min-w-0">
              <div className="flex items-center justify-between gap-3 min-w-0">
                <h2 className="text-sm font-extrabold text-gray-900 dark:text-white tracking-tight truncate">
                  {moduleKey ? `${moduleLabel} activity` : "Transaction history"}
                </h2>
                <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 shrink-0">
                  {filteredTransactions.length} record{filteredTransactions.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div
                className="flex gap-2 overflow-x-auto no-scrollbar overscroll-x-contain pb-0.5 -mx-1 px-1"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {filterChips.map((filter) => {
                  const isSelected = selectedFilter === filter.id
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setSelectedFilter(filter.id)}
                      className={`px-3.5 py-2 rounded-xl border text-[12px] font-bold whitespace-nowrap shrink-0 transition-all duration-200 ${
                        isSelected
                          ? "bg-[#FF6A00] border-[#FF6A00] text-white shadow-md shadow-orange-500/10"
                          : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:border-[#FF6A00] hover:text-[#FF6A00]"
                      }`}
                    >
                      {filter.label}
                    </button>
                  )
                })}
              </div>

              {filteredTransactions.length > 0 ? (
                <div className="space-y-2.5">
                  {filteredTransactions.map((transaction) => {
                    const meta = getTransactionMeta(transaction.type)
                    const Icon = meta.icon
                    const subtitle = getSubtitle(transaction)
                    return (
                      <div
                        key={transaction.id || transaction._id}
                        className="flex items-start sm:items-center gap-3 p-3.5 sm:p-4 rounded-2xl border border-gray-100 dark:border-gray-800/60 bg-white dark:bg-gray-900/60 hover:border-[#FF6A00]/20 hover:shadow-sm transition-all duration-200 min-w-0"
                      >
                        <div className={`h-10 w-10 sm:h-11 sm:w-11 rounded-xl flex items-center justify-center shrink-0 ${meta.iconBg}`}>
                          <Icon className={`h-4.5 w-4.5 sm:h-5 sm:w-5 ${meta.iconColor}`} strokeWidth={2} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900 dark:text-white break-words">
                            {getTitle(transaction)}
                          </p>
                          {isReferralTransaction(transaction) && !moduleKey && (
                            <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                              <Gift className="h-3 w-3" />
                              Referral reward
                            </span>
                          )}
                          {subtitle ? (
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium mt-0.5 truncate">
                              {subtitle}
                            </p>
                          ) : null}
                          <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium mt-0.5">
                            {formatDate(transaction.date || transaction.createdAt)}
                          </p>
                        </div>

                        <p className={`text-sm font-extrabold shrink-0 tabular-nums ${meta.amountColor}`}>
                          {meta.prefix}
                          {formatAmount(transaction.amount)}
                        </p>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 sm:py-14 px-5 sm:px-6 text-center rounded-3xl border border-dashed border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/30">
                  <div className="w-14 h-14 rounded-2xl bg-orange-50 dark:bg-orange-950/20 flex items-center justify-center mb-4">
                    <WalletIcon className="h-7 w-7 text-[#FF6A00]/60" />
                  </div>
                  <h3 className="text-sm font-extrabold text-gray-900 dark:text-white mb-1">
                    No transactions yet
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 max-w-[280px]">
                    {emptyCopy}
                  </p>
                  {selectedFilter !== TRANSACTION_TYPES.ALL && (
                    <button
                      type="button"
                      onClick={() => setSelectedFilter(TRANSACTION_TYPES.ALL)}
                      className="mt-4 text-xs font-bold text-[#FF6A00] hover:underline"
                    >
                      Show all transactions
                    </button>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <AddMoneyModal
        open={addMoneyModalOpen}
        onOpenChange={setAddMoneyModalOpen}
        sourceModule={apiSource || "FOOD"}
        onSuccess={() => fetchWalletData({ force: true })}
      />
    </AnimatedPage>
  )
}
