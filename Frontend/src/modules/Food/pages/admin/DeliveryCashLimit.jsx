import { useCallback, useEffect, useRef, useState } from "react"
import { IndianRupee, Loader2, Wallet } from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export default function DeliveryCashLimit() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingWithdrawal, setSavingWithdrawal] = useState(false)
  const [savingMinWallet, setSavingMinWallet] = useState(false)
  const [deliveryCashLimit, setDeliveryCashLimit] = useState("")
  const [deliveryWithdrawalLimit, setDeliveryWithdrawalLimit] = useState("")
  const [minWalletToReceiveOrders, setMinWalletToReceiveOrders] = useState("")
  const isMountedRef = useRef(true)

  const fetchLimit = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true)
      }
      const response = await adminAPI.getDeliveryCashLimit()
      const data = response?.data?.data || response?.data || {}
      const limit = data.deliveryCashLimit
      const wl = data.deliveryWithdrawalLimit ?? 100
      const minWallet = data.minWalletToReceiveOrders ?? 0
      if (!isMountedRef.current) return
      setDeliveryCashLimit(limit !== undefined && limit !== null ? String(limit) : "")
      setDeliveryWithdrawalLimit(wl !== undefined && wl !== null ? String(wl) : "100")
      setMinWalletToReceiveOrders(minWallet !== undefined && minWallet !== null ? String(minWallet) : "0")
    } catch (error) {
      debugError("Error fetching delivery cash limit:", error)
      if (!isMountedRef.current) return
      if (!silent) {
        toast.error(error.response?.data?.message || "Failed to load delivery cash limit")
      }
      setDeliveryCashLimit("")
      setDeliveryWithdrawalLimit("100")
      setMinWalletToReceiveOrders("0")
    } finally {
      if (!silent && isMountedRef.current) {
        setLoading(false)
      }
    }
  }, [])

  const saveLimit = async () => {
    const value = Number(deliveryCashLimit)
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Cash limit must be a number (>= 0)")
      return
    }
    const withdrawalValue = Number(deliveryWithdrawalLimit)
    if (!Number.isFinite(withdrawalValue) || withdrawalValue < 0) {
      toast.error("Withdrawal limit must be a number (>= 0)")
      return
    }

    try {
      setSaving(true)
      // Send both fields to avoid unintentionally overwriting the other value
      const response = await adminAPI.updateDeliveryCashLimit({
        deliveryCashLimit: value,
        deliveryWithdrawalLimit: withdrawalValue,
        minWalletToReceiveOrders: Number(minWalletToReceiveOrders) || 0,
      })
      const saved =
        response?.data?.data?.deliveryCashLimit ??
        response?.data?.deliveryCashLimit ??
        value
      setDeliveryCashLimit(String(saved))
      toast.success("Delivery cash limit updated successfully")
      await fetchLimit({ silent: true })
    } catch (error) {
      debugError("Error saving delivery cash limit:", error)
      toast.error(error.response?.data?.message || "Failed to update delivery cash limit")
    } finally {
      setSaving(false)
    }
  }

  const saveMinWallet = async () => {
    const value = Number(minWalletToReceiveOrders)
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Minimum wallet amount must be a number (>= 0)")
      return
    }
    const cashValue = Number(deliveryCashLimit)
    const withdrawalValue = Number(deliveryWithdrawalLimit)
    if (!Number.isFinite(cashValue) || cashValue < 0) {
      toast.error("Cash limit must be a number (>= 0)")
      return
    }
    if (!Number.isFinite(withdrawalValue) || withdrawalValue < 0) {
      toast.error("Withdrawal limit must be a number (>= 0)")
      return
    }

    try {
      setSavingMinWallet(true)
      const response = await adminAPI.updateDeliveryCashLimit({
        deliveryCashLimit: cashValue,
        deliveryWithdrawalLimit: withdrawalValue,
        minWalletToReceiveOrders: value,
      })
      const saved =
        response?.data?.data?.minWalletToReceiveOrders ??
        response?.data?.minWalletToReceiveOrders ??
        value
      setMinWalletToReceiveOrders(String(saved))
      toast.success("Minimum wallet amount updated successfully")
      await fetchLimit({ silent: true })
    } catch (error) {
      debugError("Error saving min wallet amount:", error)
      toast.error(error.response?.data?.message || "Failed to update minimum wallet amount")
    } finally {
      setSavingMinWallet(false)
    }
  }

  const saveWithdrawalLimit = async () => {
    const value = Number(deliveryWithdrawalLimit)
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Withdrawal limit must be a number (>= 0)")
      return
    }
    const cashValue = Number(deliveryCashLimit)
    if (!Number.isFinite(cashValue) || cashValue < 0) {
      toast.error("Cash limit must be a number (>= 0)")
      return
    }

    try {
      setSavingWithdrawal(true)
      // Send both fields to avoid unintentionally overwriting the other value
      const response = await adminAPI.updateDeliveryCashLimit({
        deliveryCashLimit: cashValue,
        deliveryWithdrawalLimit: value,
        minWalletToReceiveOrders: Number(minWalletToReceiveOrders) || 0,
      })
      const saved =
        response?.data?.data?.deliveryWithdrawalLimit ??
        response?.data?.deliveryWithdrawalLimit ??
        value
      setDeliveryWithdrawalLimit(String(saved))
      toast.success("Withdrawal limit updated successfully")
      await fetchLimit({ silent: true })
    } catch (error) {
      debugError("Error saving withdrawal limit:", error)
      toast.error(error.response?.data?.message || "Failed to update withdrawal limit")
    } finally {
      setSavingWithdrawal(false)
    }
  }

  useEffect(() => {
    isMountedRef.current = true
    fetchLimit()

    return () => {
      isMountedRef.current = false
    }
  }, [fetchLimit])

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <IndianRupee className="w-5 h-5 text-slate-700" />
            <h1 className="text-2xl font-bold text-slate-900">Delivery Cash & Wallet Limits</h1>
          </div>

          <p className="text-sm text-slate-600 mb-6">
            Set a <strong>global COD cash limit</strong>, <strong>minimum wallet balance to receive orders</strong>, and{" "}
            <strong>minimum withdrawal amount</strong> for all delivery partners across food, taxi, and porter.
          </p>

          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg mb-6">
            <div className="flex items-start gap-3">
              <IndianRupee className="w-5 h-5 text-emerald-700 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-emerald-900 mb-1">
                  Delivery Boy Available Cash Limit (Global)
                </div>
                <div className="text-sm text-emerald-800/80 mb-3">
                  When COD cash is collected, delivery partner&apos;s remaining limit will decrease automatically.
                </div>

                <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                  <div className="flex-1">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={deliveryCashLimit}
                      onChange={(e) => setDeliveryCashLimit(e.target.value)}
                      className="w-full px-4 py-2.5 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm border-emerald-200"
                      placeholder={loading ? "Loading..." : "e.g., 2000"}
                      disabled={loading || saving}
                    />
                    {loading && (
                      <p className="text-xs text-emerald-700/80 mt-1 flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Loading current limitù
                      </p>
                    )}
                  </div>
                  <button
                    onClick={saveLimit}
                    disabled={loading || saving}
                    className="px-4 py-2.5 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-sky-50 border border-sky-200 rounded-lg mb-6">
            <div className="flex items-start gap-3">
              <Wallet className="w-5 h-5 text-sky-700 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-sky-900 mb-1">
                  Minimum Wallet Balance To Receive Orders (Global)
                </div>
                <div className="text-sm text-sky-800/80 mb-3">
                  Every delivery partner must keep at least this amount in their pocket wallet.
                  If wallet balance is below this, they will not receive food, taxi, or porter jobs.
                  Set <strong>0</strong> to disable. New drivers can deposit this amount to start taking orders.
                </div>

                <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                  <div className="flex-1">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={minWalletToReceiveOrders}
                      onChange={(e) => setMinWalletToReceiveOrders(e.target.value)}
                      className="w-full px-4 py-2.5 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm border-sky-200"
                      placeholder={loading ? "Loading..." : "e.g., 500"}
                      disabled={loading || savingMinWallet}
                    />
                    {loading && (
                      <p className="text-xs text-sky-700/80 mt-1 flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        LoadingÖ
                      </p>
                    )}
                  </div>
                  <button
                    onClick={saveMinWallet}
                    disabled={loading || savingMinWallet}
                    className="px-4 py-2.5 text-sm font-medium rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {savingMinWallet && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-3">
              <Wallet className="w-5 h-5 text-amber-700 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-amber-900 mb-1">
                  Minimum Withdrawal Amount (Global)
                </div>
                <div className="text-sm text-amber-800/80 mb-3">
                  Delivery boy can withdraw only when withdrawable amount is <strong>above</strong> this value. Utni
                  amount ke upar rahega tabhi withdrawal hoga.
                </div>

                <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                  <div className="flex-1">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={deliveryWithdrawalLimit}
                      onChange={(e) => setDeliveryWithdrawalLimit(e.target.value)}
                      className="w-full px-4 py-2.5 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm border-amber-200"
                      placeholder={loading ? "Loading..." : "e.g., 100"}
                      disabled={loading || savingWithdrawal}
                    />
                    {loading && (
                      <p className="text-xs text-amber-700/80 mt-1 flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Loadingù
                      </p>
                    )}
                  </div>
                  <button
                    onClick={saveWithdrawalLimit}
                    disabled={loading || savingWithdrawal}
                    className="px-4 py-2.5 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {savingWithdrawal && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


