import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { motion, AnimatePresence } from "framer-motion"
import Lenis from "lenis"
import { ArrowLeft, Truck, CheckCircle, AlertCircle } from "lucide-react"
import { Switch } from "@food/components/ui/switch"
import { Card, CardContent } from "@food/components/ui/card"
import { restaurantAPI } from "@food/api"
import { Modal, ModalFooter } from "@food/components/restaurant/Modal"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


const DELIVERY_STATUS_KEY = "restaurant_delivery_status"
const RESTAURANT_ONLINE_STATUS_KEY = "restaurant_online_status"

export default function DeliverySettings() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [deliveryStatus, setDeliveryStatus] = useState(false)
  const [showWarning, setShowWarning] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [pendingStatus, setPendingStatus] = useState(false)
  const [showSuccessToast, setShowSuccessToast] = useState(false)
  const [toastMessage, setToastMessage] = useState("")
  const [savingStatus, setSavingStatus] = useState(false)

  // Lenis smooth scrolling
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    })

    function raf(time) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }

    requestAnimationFrame(raf)

    return () => {
      lenis.destroy()
    }
  }, [])

  const syncStatusLocally = (status) => {
    const value = Boolean(status)
    try {
      localStorage.setItem(DELIVERY_STATUS_KEY, JSON.stringify(value))
      localStorage.setItem(RESTAURANT_ONLINE_STATUS_KEY, JSON.stringify(value))
    } catch (error) {
      debugError("Error saving delivery status locally:", error)
    }

    window.dispatchEvent(new CustomEvent("restaurantStatusChanged", {
      detail: { isOnline: value }
    }))
  }

  // Load delivery status from backend on mount
  useEffect(() => {
    let cancelled = false

    const loadDeliveryStatus = async () => {
      try {
        const response = await restaurantAPI.getCurrentRestaurant()
        const restaurant =
          response?.data?.data?.restaurant ||
          response?.data?.restaurant ||
          null
        const nextStatus = restaurant?.isAcceptingOrders === true
        if (!cancelled) {
          setDeliveryStatus(nextStatus)
          syncStatusLocally(nextStatus)
        }
      } catch (error) {
        try {
          const savedStatus = localStorage.getItem(DELIVERY_STATUS_KEY)
          if (!cancelled && savedStatus !== null) {
            setDeliveryStatus(JSON.parse(savedStatus))
          }
        } catch (_) {}

        if (error.code !== 'ERR_NETWORK' && error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
          debugError("Error loading delivery status:", error)
        }
      }
    }

    loadDeliveryStatus()

    return () => {
      cancelled = true
    }
  }, [])

  // Keep backward-compatible local key in sync if another screen updates it.
  useEffect(() => {
    try {
      const savedStatus = localStorage.getItem(DELIVERY_STATUS_KEY)
      if (savedStatus !== null) {
        setDeliveryStatus(JSON.parse(savedStatus))
      }
    } catch (error) {
      // Only log error if it's not a network/timeout error (backend might be down/slow)
      if (error.code !== 'ERR_NETWORK' && error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
        debugError("Error loading delivery status:", error)
      }
    }
  }, [])

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (showConfirmDialog) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [showConfirmDialog])

  // Outlet timings are stored in DB now; this screen no longer gates delivery toggle by local schedule.
  const canEnableDelivery = true

  const showToast = (message) => {
    setToastMessage(message)
    setShowSuccessToast(true)
    setTimeout(() => setShowSuccessToast(false), 3000)
  }

  const saveDeliveryStatus = (status) => {
    const value = Boolean(status)
    setDeliveryStatus(value)
    syncStatusLocally(value)

    if (value) {
      showToast("Delivery is now ON - You're receiving orders")
    } else {
      showToast("Delivery is now OFF - Not receiving orders")
    }
  }

  const handleDeliveryStatusChange = (checked) => {
    if (savingStatus) return

    // If turning ON and outside outlet timings, show warning
    if (checked && !canEnableDelivery) {
      setPendingStatus(checked)
      setShowConfirmDialog(true)
      return
    }

    // If turning OFF, show confirmation
    if (!checked && deliveryStatus) {
      setPendingStatus(checked)
      setShowConfirmDialog(true)
      return
    }

    // Otherwise, update directly
    void saveDeliveryStatusToBackend(checked)
  }

  const saveDeliveryStatusToBackend = async (status) => {
    const previousStatus = deliveryStatus
    const nextStatus = Boolean(status)

    try {
      setSavingStatus(true)
      saveDeliveryStatus(nextStatus)
      await restaurantAPI.updateAcceptingOrders(nextStatus)
    } catch (error) {
      setDeliveryStatus(previousStatus)
      syncStatusLocally(previousStatus)
      debugError("Error updating delivery status:", error)
      showToast(error?.response?.data?.message || "Error updating delivery status")
      return
    } finally {
      setSavingStatus(false)
    }
  }

  const handleConfirmStatusChange = () => {
    void saveDeliveryStatusToBackend(pendingStatus)
    setShowConfirmDialog(false)
    
    // Show warning if enabled outside timings
    if (pendingStatus && !canEnableDelivery) {
      setShowWarning(true)
      setTimeout(() => setShowWarning(false), 5000)
    }
  }

  const handleCancelStatusChange = () => {
    setShowConfirmDialog(false)
    setPendingStatus(deliveryStatus)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] flex flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-[#111] border-b border-gray-100 dark:border-gray-800 px-4 py-4 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-bold text-gray-900 dark:text-white">Delivery Settings</h1>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Manage your delivery status</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 px-4 py-5 max-w-lg mx-auto w-full space-y-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-[#FF6A00]/10 rounded-xl flex items-center justify-center">
                  <Truck className="w-5 h-5 text-[#FF6A00]" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">Delivery Status</h2>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Control when you receive delivery orders</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900 dark:text-white mb-1.5">Accept delivery orders</p>
                  <motion.div className="flex items-center gap-2" initial={false} animate={{ scale: deliveryStatus ? 1.03 : 1 }} transition={{ duration: 0.2 }}>
                    <div className={`w-2 h-2 rounded-full ${deliveryStatus ? "bg-green-500 animate-pulse" : "bg-gray-300 dark:bg-gray-600"}`} />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {deliveryStatus ? "Receiving orders" : "Not receiving orders"}
                    </p>
                  </motion.div>
                  <AnimatePresence>
                    {!canEnableDelivery && !deliveryStatus && (
                      <motion.p 
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="text-xs text-red-600 mt-2 flex items-center gap-1"
                      >
                        <AlertCircle className="w-3 h-3" />
                        You are outside outlet timings
                      </motion.p>
                    )}
                    {showWarning && deliveryStatus && (
                      <motion.p 
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="text-xs text-red-600 mt-2 animate-pulse flex items-center gap-1"
                      >
                        <AlertCircle className="w-3 h-3" />
                        Warning: Delivery enabled outside outlet timings!
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
                <Switch
                  checked={deliveryStatus}
                  onCheckedChange={handleDeliveryStatusChange}
                  disabled={savingStatus}
                  className="ml-4 data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-gray-300"
                />
              </div>
          </div>
        </motion.div>

        {/* Info Card */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 rounded-2xl p-4">
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              When delivery is turned off, customers won't be able to place delivery orders. You can turn it back on anytime.
            </p>
          </div>
        </motion.div>
      </div>

      {/* Confirmation Dialog */}
      <Modal
        open={showConfirmDialog}
        onClose={handleCancelStatusChange}
        size="sm"
        showClose={false}
        footer={
          <ModalFooter>
            <button onClick={handleCancelStatusChange} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300">
              Cancel
            </button>
            <button
              onClick={handleConfirmStatusChange}
              className={`flex-1 py-3 rounded-xl text-sm font-bold text-white ${pendingStatus ? "bg-green-500" : "bg-red-500"}`}
            >
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
            {pendingStatus
              ? !canEnableDelivery
                ? "You are outside outlet timings. Enable anyway?"
                : "You'll start receiving delivery orders."
              : "Customers won't be able to place delivery orders."
            }
          </p>
        </div>
      </Modal>

      {/* Success Toast */}
      <AnimatePresence>
        {showSuccessToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] px-4 w-full max-w-md"
          >
            <div className="bg-gray-900 text-white px-4 py-3 rounded-lg shadow-2xl flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
              <p className="text-sm font-medium flex-1">{toastMessage}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

