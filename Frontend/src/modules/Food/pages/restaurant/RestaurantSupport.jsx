import { useEffect, useMemo, useState } from "react"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { Loader2, Send, TicketX, MessageSquarePlus } from "lucide-react"
import { restaurantAPI } from "@food/api"
import { toast } from "sonner"
import RestaurantPageShell from "@food/components/restaurant/RestaurantPageShell"

const CATEGORY_OPTIONS = [
  { value: "orders", label: "Orders" },
  { value: "payments", label: "Payments" },
  { value: "menu", label: "Menu" },
  { value: "restaurant", label: "Restaurant Profile" },
  { value: "technical", label: "Technical" },
  { value: "other", label: "Other" },
]

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
]

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "in-progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
]

const getStatusStyle = (status) => {
  if (status === "resolved")   return "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/30"
  if (status === "in-progress") return "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/30"
  return "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/30"
}

const inputCls = "w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00]/30 transition-colors"

export default function RestaurantSupport() {
  const goBack = useRestaurantBackNavigation()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [statusFilter, setStatusFilter] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ category: "orders", issueType: "", subject: "", orderRef: "", priority: "medium", description: "" })

  const stats = useMemo(() => {
    const total = tickets.length
    const open = tickets.filter(t => t.status === "open").length
    const inProgress = tickets.filter(t => t.status === "in-progress").length
    const resolved = tickets.filter(t => t.status === "resolved").length
    return { total, open, inProgress, resolved }
  }, [tickets])

  const loadTickets = async () => {
    try {
      setLoading(true)
      const response = await restaurantAPI.getSupportTickets({ status: statusFilter || undefined, limit: 100, page: 1 })
      setTickets(response?.data?.data?.tickets || [])
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load tickets")
      setTickets([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTickets() }, [statusFilter])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.issueType.trim()) { toast.error("Issue type is required"); return }
    try {
      setSubmitting(true)
      await restaurantAPI.createSupportTicket({
        category: form.category, issueType: form.issueType.trim(), subject: form.subject.trim(),
        orderRef: form.orderRef.trim(), priority: form.priority, description: form.description.trim(),
      })
      toast.success("Support ticket submitted")
      setForm(prev => ({ ...prev, issueType: "", subject: "", orderRef: "", description: "" }))
      setShowForm(false)
      await loadTickets()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to submit ticket")
    } finally {
      setSubmitting(false)
    }
  }

  const setField = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }))

  return (
    <RestaurantPageShell
      title="Support"
      subtitle="Raise and track your support requests"
      onBack={goBack}
      maxWidth="2xl"
      contentClassName="space-y-4"
      actions={(
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-[#FF6A00] text-white text-xs font-bold rounded-xl"
        >
          <MessageSquarePlus className="w-3.5 h-3.5" strokeWidth={2.5} />
          New Ticket
        </button>
      )}
    >
        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Total",       value: stats.total,      cls: "text-gray-900 dark:text-white" },
            { label: "Open",        value: stats.open,       cls: "text-amber-600 dark:text-amber-400" },
            { label: "In Progress", value: stats.inProgress, cls: "text-blue-600 dark:text-blue-400" },
            { label: "Resolved",    value: stats.resolved,   cls: "text-green-600 dark:text-green-400" },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-white dark:bg-[#111] rounded-xl border border-gray-100 dark:border-gray-800 p-3 text-center">
              <p className={`text-xl font-black ${cls}`}>{value}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* New ticket form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 p-4 space-y-3">
            <p className="text-sm font-bold text-gray-900 dark:text-white">New support ticket</p>

            <div className="grid grid-cols-2 gap-3">
              <select value={form.category} onChange={setField("category")} className={inputCls}>
                {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select value={form.priority} onChange={setField("priority")} className={inputCls}>
                {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <input value={form.issueType} onChange={setField("issueType")} placeholder="Issue type (required)" className={inputCls} maxLength={120} />
            <input value={form.subject} onChange={setField("subject")} placeholder="Short subject" className={inputCls} maxLength={180} />
            <input value={form.orderRef} onChange={setField("orderRef")} placeholder="Order ID (optional)" className={inputCls} maxLength={80} />
            <textarea
              value={form.description} onChange={setField("description")}
              placeholder="Describe your issue in detail…"
              className={`${inputCls} min-h-[96px] resize-none`}
              maxLength={1000}
            />

            <button
              type="submit" disabled={submitting}
              className="w-full h-11 bg-[#FF6A00] hover:bg-[#e05e00] disabled:opacity-60 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" strokeWidth={2.5} />}
              Submit Ticket
            </button>
          </form>
        )}

        {/* Ticket list */}
        <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-800/60 flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-gray-900 dark:text-white">My Tickets</p>
            <select
              value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            >
              {STATUS_OPTIONS.map(o => <option key={o.value || "all"} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2">
              <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <TicketX className="w-10 h-10 text-gray-200 dark:text-gray-700 mb-3" strokeWidth={1.5} />
              <p className="text-sm text-gray-400 dark:text-gray-500">No tickets found</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
              {tickets.map((ticket) => (
                <div key={ticket._id} className="px-4 py-3.5">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500">
                      #{String(ticket._id).slice(-6)} · {new Date(ticket.createdAt).toLocaleDateString("en-IN")}
                    </p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold capitalize ${getStatusStyle(ticket.status)}`}>
                      {ticket.status}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{ticket.issueType}</p>
                  {ticket.subject && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{ticket.subject}</p>}
                  {ticket.orderRef && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Order: {ticket.orderRef}</p>}
                  {ticket.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
                  )}
                  {ticket.adminResponse && (
                    <div className="mt-3 rounded-xl border border-blue-200 dark:border-blue-800/30 bg-blue-50 dark:bg-blue-900/10 p-3">
                      <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">Admin Response</p>
                      <p className="text-sm text-blue-900 dark:text-blue-300 whitespace-pre-wrap">{ticket.adminResponse}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
    </RestaurantPageShell>
  )
}
