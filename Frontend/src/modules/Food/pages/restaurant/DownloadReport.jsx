import { useState, useMemo, useEffect } from "react"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { Mail, CheckCircle2, FileDown, Store } from "lucide-react"
import { toast } from "sonner"
import RestaurantPageShell from "@food/components/restaurant/RestaurantPageShell"

const REPORT_VIEWS = [
  { id: "detailed", label: "Detailed report",    desc: "Full breakdown of all orders and revenue" },
  { id: "item",     label: "Item sales report",  desc: "Sales count and revenue by menu item" },
]

const VIEW_TYPES = [
  { id: "DAILY",   label: "Daily" },
  { id: "WEEKLY",  label: "Weekly" },
  { id: "MONTHLY", label: "Monthly" },
]

export default function DownloadReport() {
  const goBack = useRestaurantBackNavigation()
  const [reportView, setReportView] = useState("detailed")
  const [viewType, setViewType]     = useState("DAILY")
  const [duration, setDuration]     = useState("7")
  const [sending, setSending]       = useState(false)

  const durations = useMemo(() => {
    if (viewType === "WEEKLY")  return [{ id: "4w", label: "Last 4 weeks" }, { id: "8w", label: "Last 8 weeks" }, { id: "12w", label: "Last 12 weeks" }, { id: "custom", label: "Custom" }]
    if (viewType === "MONTHLY") return [{ id: "3m", label: "Last 3 months" }, { id: "6m", label: "Last 6 months" }, { id: "12m", label: "Last 12 months" }, { id: "custom", label: "Custom" }]
    return [{ id: "7", label: "Last 7 days" }, { id: "14", label: "Last 14 days" }, { id: "30", label: "Last 30 days" }, { id: "custom", label: "Custom" }]
  }, [viewType])

  useEffect(() => {
    if (!durations.find(d => d.id === duration)) setDuration(durations[0].id)
  }, [viewType, durations, duration])

  const handleSend = async () => {
    setSending(true)
    await new Promise(r => setTimeout(r, 800))
    setSending(false)
    toast.success("Report queued — we'll email it to you shortly.")
  }

  return (
    <RestaurantPageShell
      title="Download Report"
      subtitle="Export order and sales data via email"
      onBack={goBack}
      maxWidth="lg"
      contentClassName="flex flex-col space-y-5"
    >
      {/* Outlet banner */}
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-4 sm:-mt-6 bg-amber-50 dark:bg-amber-900/10 border-b border-amber-100 dark:border-amber-900/20 px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-2">
        <Store className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <p className="text-xs text-amber-800 dark:text-amber-300">
          Generating report for <span className="font-semibold">All Outlets</span>
        </p>
      </div>

      <div className="space-y-5">
        {/* Report view */}
        <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <p className="text-xs font-bold text-gray-400 dark:text-gray-600 uppercase tracking-widest px-4 pt-4 pb-3">Report type</p>
          <div className="space-y-0 pb-2">
            {REPORT_VIEWS.map(opt => {
              const active = reportView === opt.id
              return (
                <button
                  key={opt.id}
                  onClick={() => setReportView(opt.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                >
                  <div className={`w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    active ? "border-[#FF6A00] bg-[#FF6A00]" : "border-gray-300 dark:border-gray-600"
                  }`} style={{ width: 18, height: 18 }}>
                    {active && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <div className="text-left">
                    <p className={`text-sm font-semibold ${active ? "text-[#FF6A00]" : "text-gray-900 dark:text-white"}`}>{opt.label}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{opt.desc}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* View type */}
        <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
          <p className="text-xs font-bold text-gray-400 dark:text-gray-600 uppercase tracking-widest mb-3">View data by</p>
          <div className="grid grid-cols-3 gap-2">
            {VIEW_TYPES.map(t => {
              const active = viewType === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setViewType(t.id)}
                  className={`py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    active
                      ? "bg-[#FF6A00] text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Duration */}
        <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <p className="text-xs font-bold text-gray-400 dark:text-gray-600 uppercase tracking-widest px-4 pt-4 pb-3">Duration</p>
          <div className="space-y-0 pb-2">
            {durations.map(opt => {
              const active = duration === opt.id
              return (
                <button
                  key={opt.id}
                  onClick={() => setDuration(opt.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                >
                  <div className={`w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    active ? "border-[#FF6A00] bg-[#FF6A00]" : "border-gray-300 dark:border-gray-600"
                  }`} style={{ width: 18, height: 18 }}>
                    {active && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <p className={`text-sm font-semibold ${active ? "text-[#FF6A00]" : "text-gray-900 dark:text-white"}`}>{opt.label}</p>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="pt-4 mt-auto border-t border-gray-100 dark:border-gray-800">
        <button
          onClick={handleSend}
          disabled={sending}
          className="w-full h-12 bg-[#FF6A00] hover:bg-[#e05e00] disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white font-semibold text-sm rounded-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {sending ? (
            <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Sending…</>
          ) : (
            <><Mail className="w-4 h-4" strokeWidth={2} /> Send report via email</>
          )}
        </button>
      </div>
    </RestaurantPageShell>
  )
}
