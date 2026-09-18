import { useMemo, useState } from "react"
import { Loader2, Wallet, X } from "lucide-react"
import { toast } from "sonner"
import { deliveryAPI } from "@food/api"
import { initRazorpayPayment } from "@food/utils/razorpay"
import { getCompanyNameAsync } from "@common/utils/businessSettings"

const PRESETS = [200, 500, 1000, 2000]

export default function WalletTopupPopup({
  open,
  onClose,
  onSuccess,
  pocketBalance = 0,
  minWalletToReceiveOrders = 0,
  shortfall = 0,
}) {
  const suggested = useMemo(() => {
    const need = Number(shortfall) || 0
    const required = Number(minWalletToReceiveOrders) || 0
    if (need > 0) return Math.ceil(need)
    if (required > 0) return Math.ceil(required)
    return 500
  }, [shortfall, minWalletToReceiveOrders])

  const [amount, setAmount] = useState(String(suggested))
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)

  if (!open) return null

  const numericAmount = Number(amount)
  const canSubmit =
    Number.isFinite(numericAmount) && numericAmount >= 1 && !loading && !processing

  const handlePay = async () => {
    if (!canSubmit) {
      toast.error("Enter an amount of at least ₹1")
      return
    }

    try {
      setLoading(true)
      const orderRes = await deliveryAPI.createWalletTopupOrder(numericAmount)
      const data = orderRes?.data?.data
      const rp = data?.razorpay
      if (!rp?.orderId || !rp?.key) {
        toast.error("Payment gateway not ready. Please try again.")
        setLoading(false)
        return
      }

      let profile = {}
      try {
        const pr = await deliveryAPI.getProfile()
        profile = pr?.data?.data?.profile || pr?.data?.profile || {}
      } catch {
        /* prefill is optional */
      }

      const phone = String(profile?.phone || "").replace(/\D/g, "").slice(-10)
      const email = profile?.email || ""
      const name = profile?.name || ""
      const companyName = await getCompanyNameAsync()

      setLoading(false)
      setProcessing(true)
      await initRazorpayPayment({
        key: rp.key,
        amount: rp.amount,
        currency: rp.currency || "INR",
        order_id: rp.orderId,
        name: companyName,
        description: `Wallet deposit - ₹${numericAmount.toFixed(2)}`,
        prefill: { name, email, contact: phone },
        handler: async (res) => {
          try {
            const verifyRes = await deliveryAPI.verifyWalletTopupPayment({
              razorpay_order_id: res.razorpay_order_id,
              razorpay_payment_id: res.razorpay_payment_id,
              razorpay_signature: res.razorpay_signature,
              amount: numericAmount,
            })
            if (verifyRes?.data?.success) {
              toast.success(`₹${numericAmount.toFixed(2)} added to your wallet`)
              window.dispatchEvent(new CustomEvent("deliveryWalletStateUpdated"))
              onSuccess?.(verifyRes?.data?.data?.wallet)
              onClose?.()
            } else {
              toast.error(verifyRes?.data?.message || "Verification failed")
            }
          } catch (err) {
            toast.error(err?.response?.data?.message || "Verification failed. Contact support.")
          } finally {
            setProcessing(false)
          }
        },
        onError: (e) => {
          toast.error(e?.description || "Payment failed")
          setProcessing(false)
        },
        onClose: () => setProcessing(false),
      })
    } catch (err) {
      setLoading(false)
      setProcessing(false)
      toast.error(err?.response?.data?.message || "Failed to create payment")
    }
  }

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-base font-black text-slate-900">Deposit to wallet</h3>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              Current balance ₹{Number(pocketBalance || 0).toFixed(2)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {Number(minWalletToReceiveOrders) > 0 ? (
            <div className="rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900">
              Keep at least <strong>₹{Number(minWalletToReceiveOrders).toFixed(0)}</strong> in
              your wallet to receive orders.
              {Number(shortfall) > 0 ? (
                <> Add <strong>₹{Number(shortfall).toFixed(0)}</strong> more to start taking jobs.</>
              ) : null}
            </div>
          ) : null}

          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-400">
              Amount
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-500">₹</span>
              <input
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-xl border border-slate-200 py-3 pl-8 pr-4 text-lg font-black outline-none focus:border-black focus:ring-1 focus:ring-black"
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {[suggested, ...PRESETS.filter((v) => v !== suggested)].slice(0, 4).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmount(String(preset))}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                  Number(amount) === preset
                    ? "bg-black text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                ₹{preset}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handlePay}
            disabled={!canSubmit}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FF6A00] text-sm font-bold text-white shadow-lg shadow-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {(loading || processing) && <Loader2 className="h-4 w-4 animate-spin" />}
            <Wallet className="h-4 w-4" />
            {processing ? "Processing…" : loading ? "Creating payment…" : "Deposit now"}
          </button>
        </div>
      </div>
    </div>
  )
}
