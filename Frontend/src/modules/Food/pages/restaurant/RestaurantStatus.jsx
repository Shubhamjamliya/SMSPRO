import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import {
  Power, Clock, ChevronRight, AlertTriangle, MapPin,
  Zap, Calendar, CheckCircle2, XCircle,
} from "lucide-react"
import { Switch } from "@food/components/ui/switch"
import { toast } from "react-hot-toast"
import { restaurantAPI } from "@food/api"
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@food/components/ui/dialog"
import { Button } from "@food/components/ui/button"
import RestaurantPageShell from "@food/components/restaurant/RestaurantPageShell"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}
const RESTAURANT_ONLINE_STATUS_KEY = "restaurant_online_status"

const persistRestaurantOnlineStatus = (isOnline) => {
  try { localStorage.setItem(RESTAURANT_ONLINE_STATUS_KEY, JSON.stringify(Boolean(isOnline))) } catch {}
}

export default function RestaurantStatus() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()

  const [deliveryStatus, setDeliveryStatus]               = useState(false)
  const [restaurantData, setRestaurantData]               = useState(null)
  const [loading, setLoading]                             = useState(true)
  const [currentDateTime, setCurrentDateTime]             = useState(new Date())
  const [isWithinTimings, setIsWithinTimings]             = useState(null)
  const [showOutletClosedDialog, setShowOutletClosedDialog]     = useState(false)
  const [showOutsideTimingsDialog, setShowOutsideTimingsDialog] = useState(false)
  const [isDayClosed, setIsDayClosed]                     = useState(false)
  const [outletTimings, setOutletTimings]                 = useState(null)
  const [showDailyPassConfirmModal, setShowDailyPassConfirmModal] = useState(false)
  const [showLowBalanceModal, setShowLowBalanceModal]     = useState(false)
  const [eligibilityData, setEligibilityData]             = useState(null)
  const [pendingToggle, setPendingToggle]                 = useState(false)
  const [toggling, setToggling]                           = useState(false)

  useEffect(() => {
    const interval = setInterval(() => setCurrentDateTime(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true)
        const res = await restaurantAPI.getCurrentRestaurant()
        const data = res?.data?.data?.restaurant || res?.data?.restaurant
        if (data) setRestaurantData(data)
      } catch {} finally { setLoading(false) }
    }
    fetch()
  }, [])

  useEffect(() => {
    const load = () => {
      restaurantAPI.getOutletTimings()
        .then(res => {
          const data = res?.data?.data?.outletTimings || res?.data?.outletTimings
          if (data) setOutletTimings(data)
        })
        .catch(() => {})
    }
    load()
    window.addEventListener("outletTimingsUpdated", load)
    return () => window.removeEventListener("outletTimingsUpdated", load)
  }, [])

  useEffect(() => {
    const handleAutoTurnOff = async () => {
      setDeliveryStatus(false)
      try {
        await restaurantAPI.updateAcceptingOrders(false)
        persistRestaurantOnlineStatus(false)
        window.dispatchEvent(new CustomEvent("restaurantStatusChanged", { detail: { isOnline: false } }))
      } catch {}
    }

    const checkIfOpen = () => {
      const now = new Date()
      const currentDayFull = now.toLocaleDateString("en-US", { weekday: "long" })
      const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes()

      if (!outletTimings?.[currentDayFull]) {
        setIsDayClosed(false); setIsWithinTimings(true); return
      }
      const dayData = outletTimings[currentDayFull]
      if (dayData.isOpen === false) {
        setIsDayClosed(true); setIsWithinTimings(false)
        if (deliveryStatus) { setShowOutletClosedDialog(true); handleAutoTurnOff() }
        return
      }
      if (!dayData.openingTime || !dayData.closingTime) {
        setIsDayClosed(false); setIsWithinTimings(true); return
      }
      const [oh, om] = dayData.openingTime.split(":").map(Number)
      const [ch, cm] = dayData.closingTime.split(":").map(Number)
      const open = oh * 60 + om, close = ch * 60 + cm
      const isWithin = close > open
        ? currentTimeInMinutes >= open && currentTimeInMinutes <= close
        : currentTimeInMinutes >= open || currentTimeInMinutes <= close
      setIsDayClosed(false); setIsWithinTimings(isWithin)
      if (!isWithin && deliveryStatus) handleAutoTurnOff()
    }

    checkIfOpen()
    const id = setInterval(checkIfOpen, 60000)
    window.addEventListener("outletTimingsUpdated", checkIfOpen)
    return () => { clearInterval(id); window.removeEventListener("outletTimingsUpdated", checkIfOpen) }
  }, [currentDateTime, outletTimings, deliveryStatus])

  useEffect(() => {
    const load = async () => {
      try {
        const res = await restaurantAPI.getCurrentRestaurant()
        const r = res?.data?.data?.restaurant || res?.data?.restaurant
        const isOn = r?.isAcceptingOrders ?? false
        setDeliveryStatus(isOn)
        persistRestaurantOnlineStatus(isOn)
        window.dispatchEvent(new CustomEvent("restaurantStatusChanged", { detail: { isOnline: isOn } }))
      } catch {
        setDeliveryStatus(false); persistRestaurantOnlineStatus(false)
        window.dispatchEvent(new CustomEvent("restaurantStatusChanged", { detail: { isOnline: false } }))
      }
    }
    load()
  }, [])

  const handleDeliveryStatusChange = async (checked) => {
    if (toggling) return
    if (!checked) {
      setToggling(true)
      setDeliveryStatus(false)
      try {
        await restaurantAPI.updateAcceptingOrders(false)
        persistRestaurantOnlineStatus(false)
        window.dispatchEvent(new CustomEvent("restaurantStatusChanged", { detail: { isOnline: false } }))
      } catch {
        setDeliveryStatus(true); persistRestaurantOnlineStatus(true)
      } finally { setToggling(false) }
      return
    }
    if (isDayClosed) { setShowOutletClosedDialog(true); return }
    if (isWithinTimings === false && !isDayClosed) { setShowOutsideTimingsDialog(true); return }
    setToggling(true)
    try {
      setDeliveryStatus(true)
      await restaurantAPI.updateAcceptingOrders(true)
      persistRestaurantOnlineStatus(true)
      window.dispatchEvent(new CustomEvent("restaurantStatusChanged", { detail: { isOnline: true } }))
    } catch {
      toast.error("Failed to update delivery status")
      setDeliveryStatus(false); persistRestaurantOnlineStatus(false)
    } finally { setToggling(false) }
  }

  const handleConfirmDailyPass = async () => {
    setShowDailyPassConfirmModal(false); setDeliveryStatus(true)
    try {
      await restaurantAPI.updateAcceptingOrders(true)
      persistRestaurantOnlineStatus(true)
      window.dispatchEvent(new CustomEvent("restaurantStatusChanged", { detail: { isOnline: true } }))
      toast.success("Daily pass activated! You are now online.")
    } catch (e) {
      setDeliveryStatus(false); persistRestaurantOnlineStatus(false)
      toast.error(e?.response?.data?.message || "Failed to activate daily pass")
    }
    setPendingToggle(false); setEligibilityData(null)
  }

  const fmt12 = (t) => {
    if (!t) return ""
    const [h, m] = t.split(":").map(Number)
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`
  }

  const getCurrentDayTimings = () => {
    const day = new Date().toLocaleDateString("en-US", { weekday: "long" })
    const d = outletTimings?.[day]
    if (d?.isOpen && d.openingTime && d.closingTime)
      return { open: fmt12(d.openingTime), close: fmt12(d.closingTime) }
    return null
  }

  const formatAddress = (loc) => {
    if (!loc) return ""
    return [loc.area, loc.city].filter(Boolean).join(", ")
  }

  const timings = getCurrentDayTimings()
  const dayLabel = currentDateTime.toLocaleDateString("en-US", { weekday: "long" })
  const dateLabel = currentDateTime.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
  const timeLabel = currentDateTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })

  return (
    <RestaurantPageShell
      title="Restaurant Status"
      subtitle={`${dateLabel} · ${timeLabel} · ${dayLabel}`}
      onBack={goBack}
      maxWidth="lg"
      contentClassName="space-y-4"
    >

        {/* Main toggle card */}
        <div className={`rounded-2xl border p-5 transition-colors ${
          deliveryStatus
            ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800/30"
            : "bg-white dark:bg-[#111] border-gray-100 dark:border-gray-800"
        }`}>
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors ${
              deliveryStatus ? "bg-green-100 dark:bg-green-900/30" : "bg-gray-100 dark:bg-gray-800"
            }`}>
              <Power className={`w-7 h-7 transition-colors ${
                deliveryStatus ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-gray-500"
              }`} strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-gray-900 dark:text-white">
                {deliveryStatus ? "You are online" : "You are offline"}
              </p>
              <p className={`text-sm mt-0.5 ${
                deliveryStatus ? "text-green-600 dark:text-green-400" : "text-gray-500 dark:text-gray-400"
              }`}>
                {deliveryStatus ? "Accepting new orders" : "Not accepting orders"}
              </p>
              {loading && <p className="text-xs text-gray-400 mt-0.5">Loading status…</p>}
            </div>
            <Switch
              checked={deliveryStatus}
              disabled={toggling || loading}
              onCheckedChange={handleDeliveryStatusChange}
              className="data-[state=unchecked]:bg-gray-200 dark:data-[state=unchecked]:bg-gray-700 data-[state=checked]:bg-green-500 flex-shrink-0"
            />
          </div>
        </div>

        {/* Outside timings warning */}
        {!isWithinTimings && restaurantData && !isDayClosed && (
          <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-2xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" strokeWidth={2} />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              You are outside your scheduled delivery timings. Update timings to go online.
            </p>
          </div>
        )}

        {/* Today's slot card */}
        <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 dark:border-gray-800/60">
            <div className="w-8 h-8 rounded-xl bg-[#FF6A00]/10 flex items-center justify-center flex-shrink-0">
              <Clock className="w-4 h-4 text-[#FF6A00]" strokeWidth={2} />
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white flex-1">Today's delivery slot</p>
            <button
              onClick={() => navigate("/food/restaurant/outlet-timings")}
              className="text-xs font-semibold text-[#FF6A00] flex items-center gap-0.5 hover:underline"
            >
              Edit <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="px-4 py-4">
            {isDayClosed ? (
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <p className="text-sm font-semibold text-red-600 dark:text-red-400">Today is marked as closed</p>
              </div>
            ) : timings ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{timings.open} – {timings.close}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{dayLabel}</p>
                </div>
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                  isWithinTimings
                    ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                    : "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isWithinTimings ? "bg-green-500" : "bg-amber-500"}`} />
                  {isWithinTimings ? "Within hours" : "Outside hours"}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <p className="text-sm text-gray-600 dark:text-gray-400">No timings configured for today</p>
              </div>
            )}
          </div>
        </div>

        {/* Restaurant info card */}
        {!loading && restaurantData && (
          <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 dark:border-gray-800/60">
              <div className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                <Zap className="w-4 h-4 text-gray-500" strokeWidth={2} />
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Outlet details</p>
            </div>
            <div className="px-4 py-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400 dark:text-gray-500">Name</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white text-right">{restaurantData.name}</span>
              </div>
              {restaurantData.id && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400 dark:text-gray-500">Outlet ID</span>
                  <span className="text-sm font-mono font-semibold text-gray-900 dark:text-white">
                    #{String(restaurantData.id).slice(-5).toUpperCase()}
                  </span>
                </div>
              )}
              {formatAddress(restaurantData.location) && (
                <div className="flex justify-between items-start gap-3">
                  <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">Location</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300 text-right">{formatAddress(restaurantData.location)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate("/food/restaurant/outlet-timings")}
            className="flex items-center gap-3 bg-white dark:bg-[#111] border border-gray-100 dark:border-gray-800 rounded-2xl px-4 py-3.5 hover:border-gray-200 dark:hover:border-gray-700 transition-colors"
          >
            <Calendar className="w-4 h-4 text-[#FF6A00] flex-shrink-0" strokeWidth={2} />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Timings</span>
          </button>
          <button
            onClick={() => navigate("/food/restaurant/outlet-info")}
            className="flex items-center gap-3 bg-white dark:bg-[#111] border border-gray-100 dark:border-gray-800 rounded-2xl px-4 py-3.5 hover:border-gray-200 dark:hover:border-gray-700 transition-colors"
          >
            <MapPin className="w-4 h-4 text-[#FF6A00] flex-shrink-0" strokeWidth={2} />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Outlet Info</span>
          </button>
        </div>

      {/* ── Dialogs ── */}
      <Dialog open={showOutletClosedDialog} onOpenChange={setShowOutletClosedDialog}>
        <DialogContent className="sm:max-w-sm rounded-2xl p-6 gap-0">
          <DialogHeader className="text-center mb-4">
            <div className="w-14 h-14 bg-red-100 dark:bg-red-900/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <XCircle className="w-7 h-7 text-red-500" strokeWidth={2} />
            </div>
            <DialogTitle className="text-base font-bold text-gray-900 dark:text-white">Outlet is closed today</DialogTitle>
            <DialogDescription className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Today is marked as closed in your outlet timings. Update your schedule to go online.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 mt-2">
            <Button onClick={() => setShowOutletClosedDialog(false)} variant="outline" className="w-full rounded-xl h-11">Cancel</Button>
            <Button onClick={() => { setShowOutletClosedDialog(false); navigate("/food/restaurant/outlet-timings") }} className="w-full rounded-xl h-11 bg-[#FF6A00] hover:bg-[#e05e00] text-white border-0">
              Update Timings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showOutsideTimingsDialog} onOpenChange={setShowOutsideTimingsDialog}>
        <DialogContent className="sm:max-w-sm rounded-2xl p-6 gap-0">
          <DialogHeader className="text-center mb-4">
            <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-7 h-7 text-amber-500" strokeWidth={2} />
            </div>
            <DialogTitle className="text-base font-bold text-gray-900 dark:text-white">Outside delivery hours</DialogTitle>
            <DialogDescription className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              You're outside your scheduled delivery window. Please update your outlet timings to go online.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 mt-2">
            <Button onClick={() => setShowOutsideTimingsDialog(false)} variant="outline" className="w-full rounded-xl h-11">Cancel</Button>
            <Button onClick={() => { setShowOutsideTimingsDialog(false); navigate("/food/restaurant/outlet-timings") }} className="w-full rounded-xl h-11 bg-[#FF6A00] hover:bg-[#e05e00] text-white border-0">
              Change Timings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDailyPassConfirmModal} onOpenChange={setShowDailyPassConfirmModal}>
        <DialogContent className="sm:max-w-sm rounded-2xl p-6 gap-0">
          <DialogHeader className="text-center mb-4">
            <div className="w-14 h-14 bg-green-100 dark:bg-green-900/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-7 h-7 text-green-500" strokeWidth={2} />
            </div>
            <DialogTitle className="text-base font-bold text-gray-900 dark:text-white">Activate one-day pass?</DialogTitle>
            <DialogDescription className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              A small daily fee will be deducted from your Subscription Wallet. You'll be able to receive orders until midnight tonight.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 mt-2">
            <Button onClick={() => { setShowDailyPassConfirmModal(false); setPendingToggle(false); setEligibilityData(null) }} variant="outline" className="w-full rounded-xl h-11">Cancel</Button>
            <Button onClick={handleConfirmDailyPass} className="w-full rounded-xl h-11 bg-green-600 hover:bg-green-700 text-white border-0">
              Activate &amp; Go Online
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLowBalanceModal} onOpenChange={setShowLowBalanceModal}>
        <DialogContent className="sm:max-w-sm rounded-2xl p-6 gap-0">
          <DialogHeader className="text-center mb-4">
            <div className="w-14 h-14 bg-red-100 dark:bg-red-900/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-7 h-7 text-red-500" strokeWidth={2} />
            </div>
            <DialogTitle className="text-base font-bold text-gray-900 dark:text-white">Insufficient balance</DialogTitle>
            <DialogDescription className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              A minimum balance of ₹1,000 is required in your Subscription Wallet to receive orders.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 mt-2">
            <Button onClick={() => { setShowLowBalanceModal(false); setPendingToggle(false) }} variant="outline" className="w-full rounded-xl h-11">Cancel</Button>
            <Button onClick={() => { setShowLowBalanceModal(false); setPendingToggle(false); navigate("/food/restaurant/wallet") }} className="w-full rounded-xl h-11 bg-[#FF6A00] hover:bg-[#e05e00] text-white border-0">
              Recharge Wallet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RestaurantPageShell>
  )
}
