import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "react-router-dom"
import { toast } from "sonner"
import {
  Check,
  Clock3,
  Loader2,
  Printer,
  RefreshCw,
  X,
} from "lucide-react"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { restaurantAPI } from "@food/api"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import RestaurantPageShell from "@food/components/restaurant/RestaurantPageShell"
import ResendNotificationButton from "@food/components/restaurant/ResendNotificationButton"
import { normalizeRestaurantOrder, formatMoney } from "@food/components/restaurant/orderDetails/normalizeRestaurantOrder"
import {
  OrderOverviewSection,
  OrderTimelineSection,
  CustomerDetailsSection,
  OrderedItemsSection,
  AmountBreakdownSection,
  RestaurantEarningsSection,
  DeliveryInfoSection,
  CancellationDetailsSection,
  ActivityLogSection,
} from "@food/components/restaurant/orderDetails/sections"
import { EmptyBlock } from "@food/components/restaurant/orderDetails/ui"

const REJECT_REASONS = [
  "Restaurant is too busy",
  "Item not available",
  "Outside delivery area",
  "Kitchen closing soon",
  "Technical issue",
  "Other reason",
]

const PREP_PRESETS = [15, 20, 25, 30, 40, 45]

function OrderActionsBar({
  model,
  busyAction,
  prepMinutes,
  setPrepMinutes,
  onAccept,
  onRejectOpen,
  onMarkReady,
  onUpdatePrep,
}) {
  if (!model) return null
  const { actions } = model
  if (!actions.canAccept && !actions.canReject && !actions.canMarkReady && !actions.canUpdatePrep) {
    return null
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-3 sm:p-4 dark:border-gray-800 dark:bg-[#111]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        {(actions.canAccept || actions.canUpdatePrep) && (
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">
              Preparation time
            </p>
            <div className="flex flex-wrap gap-2">
              {PREP_PRESETS.map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setPrepMinutes(mins)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
                    Number(prepMinutes) === mins
                      ? "border-[#FF6A00] bg-[#FF6A00] text-white"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-[#0c0c0c] dark:text-gray-300"
                  }`}
                >
                  {mins}m
                </button>
              ))}
              <div className="inline-flex items-center gap-1 rounded-xl border border-gray-200 px-2 dark:border-gray-700">
                <Clock3 className="h-3.5 w-3.5 text-gray-400" />
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={prepMinutes}
                  onChange={(e) => setPrepMinutes(Math.min(180, Math.max(1, Number(e.target.value) || 1)))}
                  className="w-14 bg-transparent py-1.5 text-xs font-bold text-gray-800 outline-none dark:text-gray-200"
                />
                <span className="text-[11px] text-gray-400">min</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {actions.canReject ? (
            <button
              type="button"
              disabled={Boolean(busyAction)}
              onClick={onRejectOpen}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-bold text-red-600 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
            >
              <X className="h-4 w-4" />
              Reject
            </button>
          ) : null}

          {actions.canUpdatePrep && !actions.canAccept ? (
            <button
              type="button"
              disabled={busyAction === "prep"}
              onClick={onUpdatePrep}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-[#0c0c0c] dark:text-gray-200"
            >
              {busyAction === "prep" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Update prep
            </button>
          ) : null}

          {actions.canMarkReady ? (
            <button
              type="button"
              disabled={busyAction === "ready"}
              onClick={onMarkReady}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busyAction === "ready" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Mark ready
            </button>
          ) : null}

          {actions.canAccept ? (
            <button
              type="button"
              disabled={busyAction === "accept"}
              onClick={onAccept}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#FF6A00] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#e85f00] disabled:opacity-50"
            >
              {busyAction === "accept" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Accept order
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function RejectModal({ open, reason, setReason, busy, onClose, onConfirm }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-[1] w-full max-w-md rounded-t-3xl border border-gray-100 bg-white p-4 shadow-2xl sm:rounded-2xl dark:border-gray-800 dark:bg-[#141414]">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">Reject order</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
        <p className="mb-3 text-xs text-gray-500">Select a reason for rejection.</p>
        <div className="max-h-[40vh] space-y-2 overflow-y-auto">
          {REJECT_REASONS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setReason(item)}
              className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                reason === item
                  ? "border-[#FF6A00] bg-[#FF6A00]/5 text-[#FF6A00]"
                  : "border-gray-100 text-gray-700 hover:border-gray-200 dark:border-gray-800 dark:text-gray-200"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-bold text-gray-700 dark:border-gray-700 dark:text-gray-200"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!reason || busy}
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "Rejecting…" : "Confirm reject"}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OrderDetails() {
  const { orderId } = useParams()
  const goBack = useRestaurantBackNavigation()

  const [model, setModel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyAction, setBusyAction] = useState("")
  const [prepMinutes, setPrepMinutes] = useState(20)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [printing, setPrinting] = useState(false)

  const loadOrder = useCallback(async () => {
    if (!orderId) return
    try {
      setLoading(true)
      setError(null)
      const response = await restaurantAPI.getOrderById(orderId)
      const order = response?.data?.data?.order || response?.data?.order
      if (!order) {
        setModel(null)
        setError("Order not found")
        return
      }
      const next = normalizeRestaurantOrder(order)
      setModel(next)
      if (next?.preparationTime) setPrepMinutes(next.preparationTime)
    } catch (err) {
      if (err?.response?.status !== 401) {
        setError(err?.response?.data?.message || err?.message || "Failed to load order")
      }
      setModel(null)
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    loadOrder()
  }, [loadOrder])

  const actionId = useMemo(
    () => model?.mongoId || model?.orderId || orderId,
    [model, orderId],
  )

  const handleAccept = async () => {
    try {
      setBusyAction("accept")
      await restaurantAPI.acceptOrder(actionId, prepMinutes)
      toast.success("Order accepted")
      await loadOrder()
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to accept order")
    } finally {
      setBusyAction("")
    }
  }

  const handleMarkReady = async () => {
    try {
      setBusyAction("ready")
      await restaurantAPI.markOrderReady(actionId)
      toast.success("Order marked ready")
      await loadOrder()
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to mark ready")
    } finally {
      setBusyAction("")
    }
  }

  const handleUpdatePrep = async () => {
    try {
      setBusyAction("prep")
      await restaurantAPI.updatePreparationTime(actionId, prepMinutes)
      toast.success("Preparation time updated")
      await loadOrder()
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to update prep time")
    } finally {
      setBusyAction("")
    }
  }

  const handleReject = async () => {
    try {
      setBusyAction("reject")
      await restaurantAPI.rejectOrder(actionId, rejectReason)
      toast.success("Order rejected")
      setRejectOpen(false)
      setRejectReason("")
      await loadOrder()
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to reject order")
    } finally {
      setBusyAction("")
    }
  }

  const handlePrintReceipt = async () => {
    if (!model) return
    try {
      setPrinting(true)
      const doc = new jsPDF()
      doc.setFontSize(14)
      doc.text("Order Receipt", 14, 18)
      doc.setFontSize(10)
      doc.text(`Order #${model.orderId}`, 14, 26)
      doc.text(`Status: ${model.statusLabel}`, 14, 32)
      doc.text(`Customer: ${model.customer.name}`, 14, 38)
      doc.text(`Placed: ${model.createdAtLabel}`, 14, 44)

      autoTable(doc, {
        startY: 50,
        head: [["Item", "Qty", "Amount"]],
        body: model.items.map((item) => [
          item.name + (item.variant ? ` (${item.variant})` : ""),
          String(item.quantity),
          formatMoney(item.lineTotal),
        ]),
      })

      const finalY = doc.lastAutoTable?.finalY || 60
      doc.text(`Grand total: ${formatMoney(model.bill.grandTotal)}`, 14, finalY + 10)
      doc.text(`Net earnings: ${formatMoney(model.earnings.netEarnings)}`, 14, finalY + 16)
      doc.save(`order-${model.orderId}.pdf`)
      toast.success("Receipt downloaded")
    } catch {
      toast.error("Could not generate receipt")
    } finally {
      setPrinting(false)
    }
  }

  return (
    <RestaurantPageShell
      title="Order details"
      subtitle={model ? `#${model.orderId}` : "Loading order"}
      onBack={goBack}
      maxWidth="6xl"
      contentClassName="py-4 sm:py-5 space-y-4"
      actions={
        model ? (
          <div className="flex items-center gap-2">
            {model.canResendNotification ? (
              <ResendNotificationButton
                orderId={model.orderId}
                mongoId={model.mongoId}
                onSuccess={loadOrder}
              />
            ) : null}
            <button
              type="button"
              onClick={handlePrintReceipt}
              disabled={printing}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-[#111] dark:text-gray-200"
            >
              {printing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Receipt</span>
            </button>
          </div>
        ) : null
      }
    >
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-gray-100 bg-gray-100/80 dark:border-gray-800 dark:bg-gray-900"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-100 bg-white px-6 py-14 text-center dark:border-red-900/40 dark:bg-[#111]">
          <EmptyBlock title="Couldn’t load order" subtitle={error} />
          <button
            type="button"
            onClick={loadOrder}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#FF6A00] px-4 py-2.5 text-sm font-bold text-white"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>
      ) : !model ? (
        <div className="rounded-2xl border border-gray-100 bg-white dark:border-gray-800 dark:bg-[#111]">
          <EmptyBlock title="Order not found" subtitle="This order may have been removed or you don’t have access." />
        </div>
      ) : (
        <>
          <OrderActionsBar
            model={model}
            busyAction={busyAction}
            prepMinutes={prepMinutes}
            setPrepMinutes={setPrepMinutes}
            onAccept={handleAccept}
            onRejectOpen={() => setRejectOpen(true)}
            onMarkReady={handleMarkReady}
            onUpdatePrep={handleUpdatePrep}
          />

          <div className="grid gap-4 xl:grid-cols-12">
            <div className="space-y-4 xl:col-span-7">
              <OrderOverviewSection
                model={model}
                onCopy={() => toast.success("Order ID copied")}
              />
              <OrderedItemsSection items={model.items} />
              <CustomerDetailsSection model={model} />
              <DeliveryInfoSection delivery={model.delivery} />
              <CancellationDetailsSection cancellation={model.cancellation} />
            </div>

            <div className="space-y-4 xl:col-span-5">
              <RestaurantEarningsSection earnings={model.earnings} />
              <AmountBreakdownSection model={model} />
              <OrderTimelineSection journey={model.journey} />
              <ActivityLogSection activityLog={model.activityLog} />
            </div>
          </div>
        </>
      )}

      <RejectModal
        open={rejectOpen}
        reason={rejectReason}
        setReason={setRejectReason}
        busy={busyAction === "reject"}
        onClose={() => {
          if (busyAction === "reject") return
          setRejectOpen(false)
        }}
        onConfirm={handleReject}
      />
    </RestaurantPageShell>
  )
}
