import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ExternalLink, Loader2, X } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { restaurantAPI } from "@food/api"
import { normalizeRestaurantOrder } from "@food/components/restaurant/orderDetails/normalizeRestaurantOrder"
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
import ResendNotificationButton from "@food/components/restaurant/ResendNotificationButton"

/**
 * Full order details modal for Live Orders — same sections as Order Details page.
 */
export default function LiveOrderDetailsModal({
  open,
  orderId,
  mongoId,
  onClose,
}) {
  const navigate = useNavigate()
  const [model, setModel] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const lookupId = mongoId || orderId

  useEffect(() => {
    if (!open) {
      setModel(null)
      setError(null)
      setLoading(false)
      return undefined
    }
    if (!lookupId) return undefined

    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await restaurantAPI.getOrderById(lookupId)
        const order = response?.data?.data?.order || response?.data?.order
        if (cancelled) return
        if (!order) {
          setModel(null)
          setError("Order not found")
          return
        }
        setModel(normalizeRestaurantOrder(order))
      } catch (err) {
        if (cancelled) return
        setError(err?.response?.data?.message || err?.message || "Failed to load order")
        setModel(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [open, lookupId])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.()
    }
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = ""
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  const openFullPage = () => {
    const id = model?.mongoId || mongoId || orderId
    onClose?.()
    navigate(`/food/restaurant/orders/${id}`)
  }

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Mobile: bottom sheet. Desktop: centered modal */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Order details"
            className="fixed inset-x-0 bottom-0 z-[61] flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl border border-gray-100 bg-white shadow-2xl dark:border-gray-800 dark:bg-[#111] lg:inset-0 lg:m-auto lg:h-[min(88vh,820px)] lg:w-full lg:max-w-4xl lg:rounded-2xl"
            initial={{ y: "100%", opacity: 0.96 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 lg:hidden">
              <div className="h-1 w-10 rounded-full bg-gray-200" />
            </div>

            <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:px-5 dark:border-gray-800">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-gray-900 dark:text-white truncate">
                  {model ? `Order #${model.orderId}` : "Order details"}
                </h2>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Full order overview for the restaurant
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {model?.canResendNotification ? (
                  <ResendNotificationButton
                    orderId={model.orderId}
                    mongoId={model.mongoId}
                  />
                ) : null}
                <button
                  type="button"
                  onClick={openFullPage}
                  className="inline-flex h-9 items-center gap-1 rounded-xl border border-gray-200 px-2.5 text-xs font-bold text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Full page</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
              {loading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
                  <Loader2 className="h-7 w-7 animate-spin text-[#FF6A00]" />
                  <p className="text-sm">Loading order…</p>
                </div>
              ) : error ? (
                <EmptyBlock title="Couldn’t load order" subtitle={error} />
              ) : !model ? (
                <EmptyBlock title="Order not found" subtitle="Try again from the live list." />
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-4">
                    <OrderOverviewSection model={model} />
                    <OrderedItemsSection items={model.items} />
                    <CustomerDetailsSection model={model} />
                    <DeliveryInfoSection delivery={model.delivery} />
                    <CancellationDetailsSection cancellation={model.cancellation} />
                  </div>
                  <div className="space-y-4">
                    <RestaurantEarningsSection earnings={model.earnings} />
                    <AmountBreakdownSection model={model} />
                    <OrderTimelineSection journey={model.journey} />
                    <ActivityLogSection activityLog={model.activityLog} />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
