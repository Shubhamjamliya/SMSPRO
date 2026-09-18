import { useState, useEffect } from "react"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { ArrowDownToLine, Loader2, CheckCircle2, Clock, XCircle } from "lucide-react"
import { restaurantAPI } from "@food/api"
import RestaurantPageShell from "@food/components/restaurant/RestaurantPageShell"

const debugError = (...args) => {}

function fmt(amount) {
  return `₹${Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(iso) {
  if (!iso) return "N/A"
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

const STATUS_CFG = {
  Pending:   { label: "Pending",   icon: Clock,         bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-400", border: "border-amber-200 dark:border-amber-800/40" },
  Approved:  { label: "Approved",  icon: CheckCircle2,  bg: "bg-green-50 dark:bg-green-900/20",  text: "text-green-700 dark:text-green-400",  border: "border-green-200 dark:border-green-800/40" },
  Processed: { label: "Processed", icon: CheckCircle2,  bg: "bg-green-50 dark:bg-green-900/20",  text: "text-green-700 dark:text-green-400",  border: "border-green-200 dark:border-green-800/40" },
  Rejected:  { label: "Rejected",  icon: XCircle,       bg: "bg-red-50 dark:bg-red-900/20",      text: "text-red-700 dark:text-red-400",      border: "border-red-200 dark:border-red-800/40" },
}

export default function WithdrawalHistoryPage() {
  const goBack = useRestaurantBackNavigation()
  const [tab, setTab] = useState("pending")
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const res = await restaurantAPI.getWithdrawalHistory()
        const history = res?.data?.data || []
        setRequests(history.map(h => ({
          id: h._id,
          amount: h.amount,
          status: h.status === "approved" ? "Approved" : h.status === "rejected" ? "Rejected" : "Pending",
          requestedAt: h.createdAt,
          processedAt: h.processedAt,
        })))
      } catch (e) {
        if (e.response?.status !== 401) debugError("Error:", e)
      } finally { setLoading(false) }
    }
    load()
  }, [])

  const pending   = requests.filter(r => r.status === "Pending")
  const completed = requests.filter(r => r.status === "Approved" || r.status === "Processed" || r.status === "Rejected")

  const list = tab === "pending" ? pending : completed

  const Empty = ({ label }) => (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4">
        <ArrowDownToLine className="w-7 h-7 text-gray-300 dark:text-gray-600" strokeWidth={1.5} />
      </div>
      <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  )

  const tabButtons = (
    <div className="flex gap-4">
      {[
        { id: "pending",   label: "Pending", count: pending.length },
        { id: "completed", label: "Completed", count: completed.length },
      ].map(t => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={`relative pb-3 text-sm font-semibold transition-colors flex items-center gap-2 ${
            tab === t.id
              ? "text-[#FF6A00]"
              : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
          }`}
        >
          {t.label}
          {t.count > 0 && (
            <span className={`text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 ${
              tab === t.id ? "bg-[#FF6A00] text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
            }`}>{t.count}</span>
          )}
          {tab === t.id && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FF6A00] rounded-t-full" />
          )}
        </button>
      ))}
    </div>
  )

  return (
    <RestaurantPageShell
      title="Withdrawal History"
      subtitle="Track your withdrawal requests"
      onBack={goBack}
      maxWidth="2xl"
      tabs={tabButtons}
    >
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 text-gray-300 animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <Empty label={tab === "pending" ? "No pending withdrawals" : "No completed withdrawals"} />
        ) : (
          <div className="space-y-3">
            {list.map(req => {
              const cfg = STATUS_CFG[req.status] || STATUS_CFG.Pending
              const Icon = cfg.icon
              return (
                <div key={req.id} className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xl font-bold text-gray-900 dark:text-white">{fmt(req.amount)}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {tab === "pending"
                          ? `Requested: ${fmtDate(req.requestedAt)}`
                          : `Processed: ${fmtDate(req.processedAt || req.requestedAt)}`
                        }
                      </p>
                    </div>
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                      <Icon className="w-3.5 h-3.5" strokeWidth={2} />
                      {cfg.label}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
    </RestaurantPageShell>
  )
}
