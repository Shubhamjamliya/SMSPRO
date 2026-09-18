import { useState, useEffect, useRef } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { Clock, Zap, Truck, ChevronUp, ChevronDown, Users, PackageCheck, AlertCircle, CheckCircle } from "lucide-react"
import { Switch } from "@food/components/ui/switch"
import { MobileTimePicker } from "@mui/x-date-pickers/MobileTimePicker"
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider"
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns"
import { Modal, ModalFooter } from "@food/components/restaurant/Modal"
import { restaurantAPI } from "@food/api"
import { useCompanyName } from "@food/hooks/useCompanyName"
import RestaurantPageShell from "@food/components/restaurant/RestaurantPageShell"

const debugLog = (...args) => {}
const debugError = (...args) => {}

/* ─── Shared time helpers ────────────────────────────────────────── */
const stringToTime = (s) => {
  if (!s || !s.includes(":")) return new Date(2000, 0, 1, 9, 0)
  const [h, m] = s.split(":").map(Number)
  return new Date(2000, 0, 1, Math.min(23, h || 9), Math.min(59, m || 0))
}
const timeToString = (d) => {
  if (!d || isNaN(d?.getTime())) return "09:00"
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`
}
const fmt12 = (t) => {
  if (!t) return "09:00 AM"
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
}

const getDefaultDays = () => ({
  Monday:    { isOpen: true, openingTime: "09:00", closingTime: "22:00" },
  Tuesday:   { isOpen: true, openingTime: "09:00", closingTime: "22:00" },
  Wednesday: { isOpen: true, openingTime: "09:00", closingTime: "22:00" },
  Thursday:  { isOpen: true, openingTime: "09:00", closingTime: "22:00" },
  Friday:    { isOpen: true, openingTime: "09:00", closingTime: "22:00" },
  Saturday:  { isOpen: true, openingTime: "09:00", closingTime: "22:00" },
  Sunday:    { isOpen: true, openingTime: "09:00", closingTime: "22:00" },
})

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

const RUSH_OPTIONS = [
  { value: "30",  label: "30 minutes",        desc: "Quick rush" },
  { value: "60",  label: "1 hour",            desc: "Standard rush" },
  { value: "90",  label: "1 hr 30 min",       desc: "Extended rush" },
  { value: "120", label: "2 hours",            desc: "Long rush" },
]

const RUSH_BENEFITS = [
  { icon: Clock,        text: "Get more time to prepare food" },
  { icon: Users,        text: "Show correct delivery time to customers" },
  { icon: PackageCheck, text: "Avoid crowding of riders at your restaurant" },
]

const DELIVERY_STATUS_KEY = "restaurant_delivery_status"
const RESTAURANT_ONLINE_STATUS_KEY = "restaurant_online_status"

const TABS = [
  { id: "timings",  label: "Opening Timings",   icon: Clock  },
  { id: "rush",     label: "Rush Hour",          icon: Zap   },
  { id: "delivery", label: "Delivery Settings",  icon: Truck },
]

/* ═══════════════════════════════════════════════════════════════════
   TAB 1 — Opening Timings
═══════════════════════════════════════════════════════════════════ */
function OpeningTimingsTab({ companyName }) {
  const [expandedDay, setExpandedDay] = useState("Monday")
  const [days, setDays] = useState(getDefaultDays)
  const [loading, setLoading] = useState(true)
  const isInternalUpdate = useRef(false)
  const saveTimer = useRef(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        const res = await restaurantAPI.getOutletTimings()
        const data = res?.data?.data?.outletTimings || res?.data?.outletTimings
        if (mounted && data) setDays({ ...getDefaultDays(), ...data })
      } catch (e) { debugError(e) }
      finally { if (mounted) setLoading(false) }
    })()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (loading || !isInternalUpdate.current) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await restaurantAPI.saveOutletTimings(days)
        window.dispatchEvent(new Event("outletTimingsUpdated"))
        isInternalUpdate.current = false
      } catch (e) { debugError(e) }
    }, 500)
    return () => clearTimeout(saveTimer.current)
  }, [days, loading])

  const toggleDay = (day) => setExpandedDay(d => d === day ? null : day)

  const toggleDayOpen = (day) => {
    isInternalUpdate.current = true
    setDays(prev => {
      const now = !prev[day].isOpen
      return { ...prev, [day]: { ...prev[day], isOpen: now, openingTime: now ? (prev[day].openingTime || "09:00") : "", closingTime: now ? (prev[day].closingTime || "22:00") : "" } }
    })
  }

  const handleTimeChange = (day, type, val) => {
    if (!val) return
    isInternalUpdate.current = true
    const str = timeToString(val)
    if (!str.includes(":")) return
    setDays(prev => ({ ...prev, [day]: { ...prev[day], [type]: str } }))
  }

  if (loading) {
    return (
      <div className="py-16 flex items-center justify-center">
        <div className="text-sm text-gray-400">Loading timings…</div>
      </div>
    )
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <div className="py-5 space-y-4">
        {/* Section divider */}
        <div className="flex items-center gap-3 px-1">
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
          <span className="text-[10px] font-bold text-[#FF6A00] uppercase tracking-widest">{companyName} delivery hours</span>
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
        </div>

        {/* Day accordion */}
        <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          {DAY_NAMES.map((day, i) => {
            const d = days[day] || { isOpen: true, openingTime: "09:00", closingTime: "22:00" }
            const expanded = expandedDay === day
            const isLast = i === DAY_NAMES.length - 1
            return (
              <motion.div key={day} className={!isLast ? "border-b border-gray-50 dark:border-gray-800/60" : ""}>
                <div className={`flex items-center justify-between px-4 py-3.5 transition-colors ${expanded ? "bg-gray-50 dark:bg-gray-800/30" : ""}`}>
                  <button onClick={() => toggleDay(day)} className="flex items-center gap-3 flex-1 text-left">
                    {expanded
                      ? <ChevronUp className="w-4 h-4 text-[#FF6A00]" />
                      : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    <span className={`text-sm font-semibold ${expanded ? "text-[#FF6A00]" : "text-gray-900 dark:text-white"}`}>{day}</span>
                  </button>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-semibold ${d.isOpen ? "text-green-600 dark:text-green-400" : "text-gray-400"}`}>
                      {d.isOpen ? (d.openingTime && d.closingTime ? `${fmt12(d.openingTime)} – ${fmt12(d.closingTime)}` : "Open") : "Closed"}
                    </span>
                    <div onClick={e => e.stopPropagation()}>
                      <Switch
                        checked={d.isOpen}
                        onCheckedChange={() => toggleDayOpen(day)}
                        className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-gray-300"
                      />
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 space-y-4 border-t border-gray-100 dark:border-gray-800">
                        {d.isOpen ? (
                          <>
                            {[["openingTime", "Opening time"], ["closingTime", "Closing time"]].map(([field, label]) => (
                              <div key={field} className="space-y-1.5">
                                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1.5 uppercase tracking-wide">
                                  <Clock className="w-3.5 h-3.5" /> {label}
                                </label>
                                <div className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 bg-gray-50 dark:bg-gray-800/50">
                                  <MobileTimePicker
                                    value={stringToTime(d[field])}
                                    onChange={(v) => v && handleTimeChange(day, field, v)}
                                    onAccept={(v) => v && handleTimeChange(day, field, v)}
                                    format="hh:mm a"
                                    slotProps={{
                                      textField: {
                                        variant: "outlined", size: "small",
                                        sx: {
                                          "& .MuiOutlinedInput-root": { height: "36px", fontSize: "13px", backgroundColor: "transparent", "& fieldset": { borderColor: "transparent" }, "&:hover fieldset": { borderColor: "transparent" }, "&.Mui-focused fieldset": { borderColor: "#FF6A00", borderWidth: "1px" } },
                                          "& .MuiInputBase-input": { padding: "8px 4px", fontSize: "13px", fontWeight: 600 },
                                        }
                                      }
                                    }}
                                  />
                                </div>
                                <p className="text-[11px] text-gray-400">Selected: <span className="font-semibold text-gray-600 dark:text-gray-300">{fmt12(d[field])}</span></p>
                              </div>
                            ))}
                          </>
                        ) : (
                          <p className="text-sm text-gray-500 pl-2">This day is marked as closed.</p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      </div>
    </LocalizationProvider>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   TAB 2 — Rush Hour
═══════════════════════════════════════════════════════════════════ */
function RushHourTab() {
  const [selectedTime, setSelectedTime] = useState("30")
  const [confirmed, setConfirmed] = useState(false)

  const handleConfirm = () => {
    debugLog("Rush hour set:", selectedTime, "min")
    setConfirmed(true)
    setTimeout(() => setConfirmed(false), 3000)
  }

  return (
    <div className="py-5 space-y-4">
      {/* Info banner */}
      <div className="bg-[#FF6A00]/5 dark:bg-[#FF6A00]/10 border border-[#FF6A00]/20 rounded-2xl p-4 flex items-start gap-3">
        <div className="w-10 h-10 bg-[#FF6A00] rounded-xl flex items-center justify-center flex-shrink-0">
          <Zap className="w-5 h-5 text-white" strokeWidth={2.5} fill="white" />
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed pt-1">
          Inform customers when your kitchen is busy and needs more time to manage orders.
        </p>
      </div>

      {/* Benefits */}
      <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-800/60">
          <p className="text-sm font-bold text-gray-900 dark:text-white">How this helps you</p>
        </div>
        <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
          {RUSH_BENEFITS.map(({ icon: Icon, text }, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-[#FF6A00]" strokeWidth={2} />
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300">{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Time selection */}
      <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-800/60">
          <p className="text-sm font-bold text-gray-900 dark:text-white">Increase preparation time for next</p>
        </div>
        <div className="p-3 grid grid-cols-2 gap-2">
          {RUSH_OPTIONS.map((opt) => {
            const active = selectedTime === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => setSelectedTime(opt.value)}
                className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all duration-150 ${
                  active
                    ? "bg-[#FF6A00]/5 border-[#FF6A00] dark:border-[#FF6A00]/60"
                    : "bg-gray-50 dark:bg-gray-800/40 border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700"
                }`}
              >
                <span className={`text-sm font-bold ${active ? "text-[#FF6A00]" : "text-gray-900 dark:text-white"}`}>{opt.label}</span>
                <span className="text-xs text-gray-400 mt-0.5">{opt.desc}</span>
                {active && <span className="mt-2 text-[10px] font-semibold text-[#FF6A00] bg-[#FF6A00]/10 px-2 py-0.5 rounded-full">Selected</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* CTA */}
      <AnimatePresence mode="wait">
        {confirmed ? (
          <motion.div
            key="confirmed"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
          >
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="text-sm font-semibold text-green-700 dark:text-green-400">Rush hour activated!</span>
          </motion.div>
        ) : (
          <motion.button
            key="btn"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleConfirm}
            className="w-full h-12 bg-[#FF6A00] hover:bg-[#e05e00] text-white font-semibold text-sm rounded-2xl active:scale-[0.98] transition-all"
          >
            Confirm Rush Hour · {RUSH_OPTIONS.find(o => o.value === selectedTime)?.label}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   TAB 3 — Delivery Settings
═══════════════════════════════════════════════════════════════════ */
function DeliverySettingsTab() {
  const [deliveryStatus, setDeliveryStatus] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [pendingStatus, setPendingStatus] = useState(false)
  const [showWarning, setShowWarning] = useState(false)
  const [toastMsg, setToastMsg] = useState("")
  const [showToast, setShowToast] = useState(false)
  const [saving, setSaving] = useState(false)

  const syncLocal = (val) => {
    const v = Boolean(val)
    try {
      localStorage.setItem(DELIVERY_STATUS_KEY, JSON.stringify(v))
      localStorage.setItem(RESTAURANT_ONLINE_STATUS_KEY, JSON.stringify(v))
    } catch {}
    window.dispatchEvent(new CustomEvent("restaurantStatusChanged", { detail: { isOnline: v } }))
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await restaurantAPI.getCurrentRestaurant()
        const r = res?.data?.data?.restaurant || res?.data?.restaurant
        if (!cancelled && r) { setDeliveryStatus(r.isAcceptingOrders === true); syncLocal(r.isAcceptingOrders === true) }
      } catch {
        try { const s = localStorage.getItem(DELIVERY_STATUS_KEY); if (!cancelled && s) setDeliveryStatus(JSON.parse(s)) } catch {}
      }
    })()
    return () => { cancelled = true }
  }, [])

  const toast = (msg) => { setToastMsg(msg); setShowToast(true); setTimeout(() => setShowToast(false), 3000) }

  const applyStatus = (val) => {
    setDeliveryStatus(Boolean(val))
    syncLocal(val)
    toast(val ? "Delivery is now ON – You're receiving orders" : "Delivery is now OFF – Not receiving orders")
  }

  const saveToBackend = async (val) => {
    const prev = deliveryStatus
    try {
      setSaving(true); applyStatus(val)
      await restaurantAPI.updateAcceptingOrders(Boolean(val))
    } catch (e) {
      setDeliveryStatus(prev); syncLocal(prev)
      toast(e?.response?.data?.message || "Error updating delivery status")
    } finally { setSaving(false) }
  }

  const handleToggle = (checked) => {
    if (saving) return
    if (!checked && deliveryStatus) { setPendingStatus(checked); setShowConfirmDialog(true); return }
    void saveToBackend(checked)
  }

  const handleConfirm = () => {
    void saveToBackend(pendingStatus)
    setShowConfirmDialog(false)
    if (pendingStatus) { setShowWarning(true); setTimeout(() => setShowWarning(false), 5000) }
  }

  return (
    <div className="py-5 space-y-4">
      {/* Status card */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-[#FF6A00]/10 rounded-xl flex items-center justify-center">
              <Truck className="w-5 h-5 text-[#FF6A00]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Delivery Status</h2>
              <p className="text-xs text-gray-400">Control when you receive delivery orders</p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-900 dark:text-white mb-1.5">Accept delivery orders</p>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${deliveryStatus ? "bg-green-500 animate-pulse" : "bg-gray-300 dark:bg-gray-600"}`} />
                <p className="text-xs text-gray-500 dark:text-gray-400">{deliveryStatus ? "Receiving orders" : "Not receiving orders"}</p>
              </div>
              <AnimatePresence>
                {showWarning && deliveryStatus && (
                  <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="text-xs text-red-600 mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Warning: Delivery enabled outside outlet timings!
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
            <Switch
              checked={deliveryStatus} onCheckedChange={handleToggle} disabled={saving}
              className="ml-4 data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-gray-300"
            />
          </div>
        </div>
      </motion.div>

      {/* Info */}
      <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 rounded-2xl p-4">
        <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
          When delivery is turned off, customers won't be able to place delivery orders. You can turn it back on anytime.
        </p>
      </div>

      {/* Confirm dialog */}
      <Modal
        open={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        size="sm"
        showClose={false}
        footer={
          <ModalFooter>
            <button onClick={() => setShowConfirmDialog(false)} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300">Cancel</button>
            <button onClick={handleConfirm} className={`flex-1 py-3 rounded-xl text-sm font-bold text-white ${pendingStatus ? "bg-green-500" : "bg-red-500"}`}>
              {pendingStatus ? "Enable" : "Disable"}
            </button>
          </ModalFooter>
        }
      >
        <div className="text-center pt-2">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-amber-50 dark:bg-amber-900/20">
            <AlertCircle className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
            {pendingStatus ? "Enable Delivery?" : "Disable Delivery?"}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {pendingStatus ? "You'll start receiving delivery orders." : "Customers won't be able to place delivery orders."}
          </p>
        </div>
      </Modal>

      {/* Toast */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-4 w-full max-w-md"
          >
            <div className="bg-gray-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
              <p className="text-sm font-medium flex-1">{toastMsg}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Main combined page
═══════════════════════════════════════════════════════════════════ */
export default function OutletOperations() {
  const [searchParams, setSearchParams] = useSearchParams()
  const companyName = useCompanyName()

  // Allow ?tab=rush or ?tab=delivery to deep-link into a specific tab
  const paramTab = searchParams.get("tab")
  const validTabs = TABS.map(t => t.id)
  const [activeTab, setActiveTab] = useState(validTabs.includes(paramTab) ? paramTab : "timings")

  const switchTab = (id) => {
    setActiveTab(id)
    setSearchParams({ tab: id }, { replace: true })
  }

  const activeTabData = TABS.find(t => t.id === activeTab)

  const tabBar = (
    <div className="flex gap-1 overflow-x-auto scrollbar-none -mb-px">
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = activeTab === id
        return (
          <button
            key={id}
            onClick={() => switchTab(id)}
            className={`flex items-center gap-1.5 px-4 py-3.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all flex-shrink-0 ${
              active
                ? "border-[#FF6A00] text-[#FF6A00]"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={active ? 2.5 : 2} />
            {label}
          </button>
        )
      })}
    </div>
  )

  return (
    <RestaurantPageShell
      title="Outlet Operations"
      subtitle="Manage timings, rush hour & delivery"
      maxWidth="lg"
      tabs={tabBar}
      contentClassName="py-4"
    >
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === "timings"  && <OpeningTimingsTab companyName={companyName} />}
            {activeTab === "rush"     && <RushHourTab />}
            {activeTab === "delivery" && <DeliverySettingsTab />}
          </motion.div>
        </AnimatePresence>
    </RestaurantPageShell>
  )
}
