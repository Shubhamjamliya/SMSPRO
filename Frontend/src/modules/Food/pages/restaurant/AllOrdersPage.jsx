import { useState, useEffect, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useNavigate } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import {
  Search,
  Filter,
  ChevronDown,
  Calendar,
  Copy,
  ChevronRight,
  ChevronLeft,
  X,
  ClipboardList,
  Package,
} from "lucide-react"
import { DateRangeCalendar } from "@food/components/ui/date-range-calendar"
import { restaurantAPI } from "@food/api"
import { useRestaurantRealtimeOptional } from "@food/context/RestaurantRealtimeContext"
import RestaurantPageShell, {
  RESTAURANT_CARD_CLASS,
} from "@food/components/restaurant/RestaurantPageShell"

const formatMoney = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`

const ORDERS_PER_PAGE = 10

const getCurrentWeek = () => {
  const today = new Date()
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - today.getDay() + 1)
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 6)
  return { start: startOfWeek, end: endOfWeek }
}

const getLastWeek = () => {
  const today = new Date()
  const startOfLastWeek = new Date(today)
  startOfLastWeek.setDate(today.getDate() - today.getDay() - 6)
  const endOfLastWeek = new Date(startOfLastWeek)
  endOfLastWeek.setDate(startOfLastWeek.getDate() + 6)
  return { start: startOfLastWeek, end: endOfLastWeek }
}

const getLast2Days = () => {
  const today = new Date()
  const twoDaysAgo = new Date(today)
  twoDaysAgo.setDate(today.getDate() - 2)
  return { start: twoDaysAgo, end: today }
}

const getLast30Days = () => {
  const today = new Date()
  const thirtyDaysAgo = new Date(today)
  thirtyDaysAgo.setDate(today.getDate() - 30)
  return { start: thirtyDaysAgo, end: today }
}

const last30Dates = getLast30Days()

const dateRangeOptions = [
  { label: "last 2 days", getDates: getLast2Days },
  { label: "this week", getDates: getCurrentWeek },
  { label: "last week", getDates: getLastWeek },
  { label: "last 30 days", getDates: getLast30Days },
  { label: "custom date range", custom: true },
]

const filterCategories = [
  { id: "Order status", label: "Order status" },
  { id: "Order type", label: "Order type" },
]

const filterOptions = {
  "Order status": [
    { id: "preparing", label: "Preparing", key: "orderStatus" },
    { id: "ready", label: "Ready", key: "orderStatus" },
    { id: "out-for-delivery", label: "Out for delivery", key: "orderStatus" },
    { id: "delivered", label: "Delivered", key: "orderStatus" },
    { id: "rejected", label: "Rejected by restaurant", key: "orderStatus" },
    { id: "cancelled", label: "Cancelled", key: "orderStatus" },
  ],
  "Order type": [
    { id: "home-delivery", label: "Home delivery", key: "orderType" },
    { id: "scheduled", label: "Scheduled", key: "orderType" },
    { id: "veg-only", label: "Veg only", key: "orderType" },
    { id: "cutlery", label: "Cutlery", key: "orderType" },
  ],
}

const STATUS_MAP = {
  preparing: "PREPARING",
  ready: "READY",
  "out-for-delivery": "OUT FOR DELIVERY",
  delivered: "DELIVERED",
  rejected: "CANCELLED BY RESTAURANT",
  cancelled: "CANCELLED",
}

const STATUS_QUICK = [
  { id: "all", label: "All" },
  { id: "preparing", label: "Preparing" },
  { id: "ready", label: "Ready" },
  { id: "out-for-delivery", label: "Out" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
]

function normalizeListStatus(raw) {
  const key = String(raw || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
  if (key.startsWith("cancelled") || key === "rejected") {
    if (key.includes("restaurant") || key === "rejected") return "CANCELLED BY RESTAURANT"
    if (key.includes("user")) return "CANCELLED BY CUSTOMER"
    if (key.includes("admin")) return "CANCELLED BY ADMIN"
    return "CANCELLED"
  }
  if (key === "ready_for_pickup") return "READY"
  if (key === "out_for_delivery" || key === "picked_up") return "OUT FOR DELIVERY"
  return String(raw || "CREATED")
    .toUpperCase()
    .replace(/_/g, " ")
}

function matchesStatusFilter(orderStatus, selectedIds) {
  if (!selectedIds?.length) return true
  const upper = String(orderStatus || "").toUpperCase()
  return selectedIds.some((id) => {
    if (id === "cancelled" || id === "rejected") return upper.includes("CANCEL")
    const mapped = STATUS_MAP[id]
    if (!mapped) return false
    if (mapped === "READY") return upper === "READY" || upper.includes("READY")
    if (mapped === "OUT FOR DELIVERY") {
      return upper === "OUT FOR DELIVERY" || upper === "PICKED UP"
    }
    return upper === mapped
  })
}

function extractListCancellation(order) {
  const statusKey = String(order.orderStatus || order.status || "").toLowerCase()
  if (!statusKey.includes("cancel") && statusKey !== "rejected") return null

  const history = Array.isArray(order.statusHistory) ? order.statusHistory : []
  const cancelEntry = [...history]
    .reverse()
    .find((entry) => {
      const to = String(entry?.to || "").toLowerCase()
      return to.includes("cancel") || to === "rejected"
    })

  const role = String(cancelEntry?.byRole || "").toUpperCase()
  let cancelledBy = "System"
  if (role === "USER" || role === "CUSTOMER" || statusKey.includes("user")) cancelledBy = "Customer"
  else if (role === "RESTAURANT" || statusKey.includes("restaurant") || statusKey === "rejected") {
    cancelledBy = "Restaurant"
  } else if (role === "ADMIN" || statusKey.includes("admin")) cancelledBy = "Admin"

  const reason =
    String(cancelEntry?.note || "").trim() ||
    String(order.cancellationReason || order.rejectionReason || order.payment?.refund?.reason || "").trim() ||
    "No specific reason was shared"

  const at = cancelEntry?.at ? new Date(cancelEntry.at) : null
  const when =
    at && !Number.isNaN(at.getTime())
      ? at.toLocaleString("en-IN", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      : ""

  return { reason, cancelledBy, when }
}

function getStatusClasses(status) {
  const upper = String(status || "").toUpperCase()
  if (upper.includes("CANCEL") || upper === "REJECTED") {
    return "bg-red-50 text-red-700 border-red-100 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50"
  }
  switch (upper) {
    case "DELIVERED":
      return "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50"
    case "PREPARING":
    case "CONFIRMED":
      return "bg-amber-50 text-amber-800 border-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50"
    case "READY":
    case "READY FOR PICKUP":
      return "bg-sky-50 text-sky-700 border-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900/50"
    case "OUT FOR DELIVERY":
    case "PICKED UP":
      return "bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/50"
    default:
      return "bg-gray-50 text-gray-700 border-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
  }
}

function shortOrderId(id) {
  const value = String(id || "")
  if (value.length <= 16) return value
  return `${value.slice(0, 8)}…${value.slice(-4)}`
}

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex max-w-full items-center truncate rounded-lg border px-2 py-0.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wide ${getStatusClasses(status)}`}
    >
      {status}
    </span>
  )
}

function OrderCard({ order, onOpen, onCopy }) {
  const itemPreview = order.items.slice(0, 2)
  const extra = Math.max(0, order.items.length - 2)

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${RESTAURANT_CARD_CLASS} w-full text-left p-3.5 sm:p-4 transition-all hover:border-[#FF6A00]/30 hover:shadow-sm active:scale-[0.99]`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={order.status} />
            {order.tags?.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-400"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-bold text-gray-900 dark:text-white">
              #{shortOrderId(order.id)}
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => onCopy(order.id, e)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onCopy(order.id, e)
              }}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
              aria-label="Copy order ID"
            >
              <Copy className="h-3.5 w-3.5" />
            </span>
          </div>

          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{order.customer}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-sm font-extrabold tabular-nums text-gray-900 dark:text-white">
            {formatMoney(order.totalPrice)}
          </p>
          <p className="mt-1 text-[11px] text-gray-400">
            {order.date}, {order.time}
          </p>
          <ChevronRight className="ml-auto mt-2 h-4 w-4 text-gray-300" />
        </div>
      </div>

      <div className="mt-3 space-y-1 border-t border-dashed border-gray-100 pt-3 dark:border-gray-800">
        {itemPreview.map((item, idx) => (
          <div key={`${item.name}-${idx}`} className="flex items-center justify-between gap-3">
            <span className="truncate text-xs text-gray-600 dark:text-gray-400">
              {item.quantity}× {item.name}
            </span>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-gray-800 dark:text-gray-200">
              {formatMoney(item.price)}
            </span>
          </div>
        ))}
        {extra > 0 ? (
          <p className="text-[11px] font-medium text-gray-400">+{extra} more items</p>
        ) : null}
      </div>

      {order.cancellation ? (
        <div className="mt-3 rounded-xl border border-red-100 bg-red-50/80 px-2.5 py-2 text-left dark:border-red-900/40 dark:bg-red-950/20">
          <p className="text-[11px] font-bold text-red-700 dark:text-red-300">
            Cancelled by {order.cancellation.cancelledBy}
            {order.cancellation.when ? ` · ${order.cancellation.when}` : ""}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[11px] text-red-600/90 dark:text-red-300/90">
            Reason: {order.cancellation.reason}
          </p>
        </div>
      ) : order.reason ? (
        <p className="mt-3 line-clamp-2 rounded-xl bg-red-50 px-2.5 py-2 text-[11px] text-red-600 dark:bg-red-950/30 dark:text-red-300">
          {order.reason}
        </p>
      ) : null}
    </button>
  )
}

function useIsLgUp() {
  const [isLg, setIsLg] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : false,
  )

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)")
    const onChange = () => setIsLg(media.matches)
    onChange()
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  return isLg
}

function SheetShell({ open, onClose, title, children, footer, tall }) {
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[min(88dvh,720px)] flex-col overflow-hidden rounded-t-3xl border border-gray-100 bg-white shadow-2xl dark:border-gray-800 dark:bg-[#141414] ${
              tall ? "" : "max-h-[min(72dvh,560px)]"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pb-1 pt-3">
              <div className="h-1 w-10 rounded-full bg-gray-200 dark:bg-gray-700" />
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Close"
              >
                <X className="h-[18px] w-[18px] text-gray-500" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
            {footer ? (
              <div className="border-t border-gray-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-gray-800 dark:bg-[#141414]">
                {footer}
              </div>
            ) : null}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  )
}

/** Mobile: bottom sheet. Desktop: centered modal dialog. */
function FilterOverlay({ open, onClose, title, children, footer }) {
  const isDesktop = useIsLgUp()

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {isDesktop ? (
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={title}
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-6"
              onClick={onClose}
            >
              <div
                className="flex max-h-[min(82vh,640px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl dark:border-gray-800 dark:bg-[#141414]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
                    <p className="mt-0.5 text-xs text-gray-400">Refine which orders appear in the list</p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                    aria-label="Close"
                  >
                    <X className="h-4.5 w-4.5" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
                {footer ? (
                  <div className="border-t border-gray-100 bg-gray-50/80 px-5 py-4 dark:border-gray-800 dark:bg-[#101010]">
                    <div className="flex items-center justify-end gap-3">{footer}</div>
                  </div>
                ) : null}
              </div>
            </motion.div>
          ) : (
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={title}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 320 }}
              className="fixed inset-x-0 bottom-0 z-50 flex max-h-[min(88dvh,720px)] flex-col overflow-hidden rounded-t-3xl border border-gray-100 bg-white shadow-2xl dark:border-gray-800 dark:bg-[#141414]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center pb-1 pt-3">
                <div className="h-1 w-10 rounded-full bg-gray-200 dark:bg-gray-700" />
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                <h2 className="text-base font-bold text-gray-900 dark:text-white">{title}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                  aria-label="Close"
                >
                  <X className="h-[18px] w-[18px] text-gray-500" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
              {footer ? (
                <div className="border-t border-gray-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-gray-800 dark:bg-[#141414]">
                  {footer}
                </div>
              ) : null}
            </motion.div>
          )}
        </>
      ) : null}
    </AnimatePresence>
  )
}

export default function AllOrdersPage() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [searchQuery, setSearchQuery] = useState("")
  const [showCalendar, setShowCalendar] = useState(false)
  const [showDateRangePopup, setShowDateRangePopup] = useState(false)
  const [selectedDateRange, setSelectedDateRange] = useState(dateRangeOptions[3]) // last 30 days
  const [startDate, setStartDate] = useState(last30Dates.start)
  const [endDate, setEndDate] = useState(last30Dates.end)

  const [showFilterPopup, setShowFilterPopup] = useState(false)
  const [activeFilterCategory, setActiveFilterCategory] = useState("Order status")
  const [filterSearch, setFilterSearch] = useState("")
  const [filters, setFilters] = useState({
    orderStatus: [],
    ratings: [],
    kptDelay: [],
    complaints: [],
    orderType: [],
  })

  const [showToast, setShowToast] = useState(false)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [restaurantData, setRestaurantData] = useState(null)
  const realtime = useRestaurantRealtimeOptional()
  const newOrder = realtime?.incomingOrder || null
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    const fetchRestaurantData = async () => {
      try {
        const response = await restaurantAPI.getCurrentRestaurant()
        const data = response?.data?.data?.restaurant || response?.data?.restaurant
        if (data) setRestaurantData(data)
      } catch {
        // Non-fatal: list still works without restaurant profile name.
      }
    }
    fetchRestaurantData()
  }, [])

  const transformOrder = useCallback(
    (order) => {
      const createdAt = new Date(order.createdAt)
      const date = createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
      const time = createdAt.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })

      const addr = order.deliveryAddress || order.address || null
      const address =
        addr?.formattedAddress ||
        addr?.address ||
        (addr?.street ? `${addr.street}, ${addr.city || ""}`.trim() : "") ||
        "Address not available"

      const restaurantName = restaurantData?.name || order.restaurantId?.name || "Restaurant"
      const customerName = order.userId?.name || order.customerName || "Customer"
      const items = (order.items || []).map((item) => ({
        name: item.name || "Item",
        quantity: item.quantity || 1,
        price: item.price || 0,
        isVeg: item.isVeg,
      }))

      let status = normalizeListStatus(order.orderStatus || order.status || "created")
      const cancellation = extractListCancellation(order)
      const reason = cancellation
        ? `Cancelled by ${cancellation.cancelledBy}: ${cancellation.reason}`
        : null

      const tags = []
      if (order.scheduledAt) tags.push("SCHEDULED")
      if (order.sendCutlery) tags.push("CUTLERY")
      tags.push("HOME DELIVERY")
      const allVeg = items.length > 0 && items.every((item) => item.isVeg !== false)
      if (allVeg) tags.push("VEG ONLY")

      return {
        id: order.orderId || order._id?.toString() || "",
        status,
        date,
        time,
        restaurant: restaurantName,
        address,
        customer: customerName,
        items,
        totalPrice: order.pricing?.total || 0,
        reason,
        cancellation,
        tags,
        createdAt: order.createdAt,
        mongoId: order._id?.toString() || "",
      }
    },
    [restaurantData],
  )

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await restaurantAPI.getOrders({ page: 1, limit: 1000 })
        if (response.data?.success && response.data.data?.orders) {
          const transformedOrders = response.data.data.orders.map(transformOrder)
          const filteredByDate = transformedOrders.filter((order) => {
            if (!order.createdAt) return false
            const orderDate = new Date(order.createdAt)
            const start = new Date(startDate)
            start.setHours(0, 0, 0, 0)
            const end = new Date(endDate)
            end.setHours(23, 59, 59, 999)
            return orderDate >= start && orderDate <= end
          })
          setOrders(filteredByDate)
        } else {
          setOrders([])
        }
      } catch (err) {
        if (err.response?.status !== 401) {
          setError(err.message || "Failed to fetch orders")
        }
        setOrders([])
      } finally {
        setLoading(false)
      }
    }
    fetchOrders()
  }, [startDate, endDate, transformOrder])

  useEffect(() => {
    if (!newOrder) return
    setOrders((prev) => {
      const id = String(newOrder?.orderId || newOrder?._id || "")
      if (!id) return prev
      if (prev.some((o) => String(o.id) === id || String(o.mongoId) === String(newOrder?._id))) {
        return prev
      }
      return [transformOrder(newOrder), ...prev]
    })
  }, [newOrder, transformOrder])

  useEffect(() => {
    if (showDateRangePopup || showCalendar || showFilterPopup) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = "unset"
    }
    return () => {
      document.body.style.overflow = "unset"
    }
  }, [showDateRangePopup, showCalendar, showFilterPopup])

  const handleDateRangeChange = (start, end) => {
    setStartDate(start)
    setEndDate(end)
    setSelectedDateRange({ label: "custom date range", start, end, custom: true })
    setShowCalendar(false)
  }

  const handleDateRangeSelect = (option) => {
    if (option.custom) {
      setShowDateRangePopup(false)
      setShowCalendar(true)
      return
    }
    const dates = option.getDates()
    setSelectedDateRange(option)
    setStartDate(dates.start)
    setEndDate(dates.end)
    setShowDateRangePopup(false)
  }

  const formatDateRange = () => {
    if (!startDate || !endDate) return "Select date range"
    const start = startDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    const end = endDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    const year = endDate.getFullYear().toString().slice(-2)
    return `${start} – ${end} ’${year}`
  }

  const handleCopyOrderId = (orderId, e) => {
    e.stopPropagation()
    e.preventDefault()
    navigator.clipboard.writeText(orderId)
    setShowToast(true)
    window.setTimeout(() => setShowToast(false), 1800)
  }

  const handleFilterToggle = (option) => {
    const key = option.key
    const value = option.id
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter((v) => v !== value)
        : [...prev[key], value],
    }))
  }

  const handleClearFilters = () => {
    setFilters({
      orderStatus: [],
      ratings: [],
      kptDelay: [],
      complaints: [],
      orderType: [],
    })
    setFilterSearch("")
  }

  const activeFilterCount = useMemo(
    () => Object.values(filters).reduce((sum, arr) => sum + arr.length, 0),
    [filters],
  )
  const hasActiveFilters = activeFilterCount > 0

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return orders.filter((order) => {
      if (q) {
        const haystack = [order.id, order.id.replace(/\D/g, ""), order.customer, order.address]
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }

      if (filters.orderStatus.length > 0) {
        if (!matchesStatusFilter(order.status, filters.orderStatus)) return false
      }

      if (filters.orderType.length > 0) {
        const hasMatchingTag = order.tags?.some((tag) => {
          const tagLower = tag.toLowerCase().replace(/\s+/g, "-")
          return filters.orderType.includes(tagLower)
        })
        if (!hasMatchingTag) return false
      }

      return true
    })
  }, [orders, searchQuery, filters])

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PER_PAGE))
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * ORDERS_PER_PAGE,
    currentPage * ORDERS_PER_PAGE,
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, filters, startDate, endDate])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  const openOrder = (order) => {
    navigate(`/restaurant/orders/${order.mongoId || order.id}`)
  }

  const quickStatus = filters.orderStatus.length === 1 ? filters.orderStatus[0] : "all"

  const setQuickStatus = (id) => {
    setFilters((prev) => ({
      ...prev,
      orderStatus: id === "all" ? [] : [id],
    }))
  }

  const categoryOptions = (filterOptions[activeFilterCategory] || []).filter((option) =>
    option.label.toLowerCase().includes(filterSearch.toLowerCase()),
  )

  return (
    <RestaurantPageShell
      title="All Orders"
      subtitle={restaurantData?.name ? `${restaurantData.name} · Order history` : "Order history"}
      onBack={goBack}
      maxWidth="6xl"
      contentClassName="py-4 sm:py-5 space-y-4"
    >
      <div className={`${RESTAURANT_CARD_CLASS} space-y-3 p-3 sm:p-4`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Search order ID or customer"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#FF6A00] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#FF6A00]/30 dark:border-gray-700 dark:bg-[#0c0c0c] dark:text-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDateRangePopup(true)}
              className="inline-flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left transition-colors hover:bg-gray-50 sm:min-w-[200px] sm:flex-none dark:border-gray-700 dark:bg-[#0c0c0c] dark:hover:bg-gray-900"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-bold capitalize text-gray-900 dark:text-white">
                  {selectedDateRange.label}
                </p>
                <p className="truncate text-[11px] text-gray-400">{formatDateRange()}</p>
              </div>
              <Calendar className="h-4 w-4 shrink-0 text-gray-400" />
            </button>

            <button
              type="button"
              onClick={() => setShowFilterPopup(true)}
              className={`relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                hasActiveFilters
                  ? "border-[#FF6A00] bg-[#FF6A00]/10 text-[#FF6A00]"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-[#0c0c0c] dark:text-gray-300"
              }`}
              aria-label="Filters"
            >
              <Filter className="h-5 w-5" />
              {hasActiveFilters ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF6A00] px-1 text-[10px] font-bold text-white">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {STATUS_QUICK.map((chip) => {
            const active = quickStatus === chip.id
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setQuickStatus(chip.id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                  active
                    ? "border-[#FF6A00] bg-[#FF6A00] text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-[#0c0c0c] dark:text-gray-300"
                }`}
              >
                {chip.label}
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-gray-400">
          <p>
            {loading
              ? "Loading…"
              : `${filteredOrders.length} order${filteredOrders.length === 1 ? "" : "s"}`}
          </p>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={handleClearFilters}
              className="font-bold text-[#FF6A00] hover:underline"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`${RESTAURANT_CARD_CLASS} h-28 animate-pulse bg-gray-100/80 dark:bg-gray-900`}
            />
          ))}
        </div>
      ) : error ? (
        <div className={`${RESTAURANT_CARD_CLASS} flex flex-col items-center gap-2 px-6 py-14 text-center`}>
          <p className="text-sm font-semibold text-red-500">Couldn’t load orders</p>
          <p className="text-xs text-gray-400">{error}</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className={`${RESTAURANT_CARD_CLASS} flex flex-col items-center gap-3 px-6 py-14 text-center`}>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-[#FF6A00] dark:bg-orange-950/30">
            <ClipboardList className="h-7 w-7" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">No orders found</p>
            <p className="mt-1 text-xs text-gray-400">
              Try another date range, status, or search term.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            <AnimatePresence mode="popLayout">
              {paginatedOrders.map((order, index) => (
                <motion.div
                  key={order.mongoId || order.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.15) }}
                >
                  <OrderCard
                    order={order}
                    onOpen={() => openOrder(order)}
                    onCopy={handleCopyOrderId}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className={`${RESTAURANT_CARD_CLASS} hidden overflow-hidden lg:block`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80 text-[11px] uppercase tracking-wide text-gray-400 dark:border-gray-800 dark:bg-gray-900/50">
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3 font-bold">Order</th>
                    <th className="px-4 py-3 font-bold">Customer</th>
                    <th className="px-4 py-3 font-bold">Items</th>
                    <th className="px-4 py-3 text-right font-bold">Total</th>
                    <th className="px-4 py-3 font-bold">When</th>
                    <th className="px-4 py-3 text-right font-bold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOrders.map((order) => {
                    const itemCount = order.items.reduce(
                      (sum, item) => sum + (Number(item.quantity) || 0),
                      0,
                    )
                    return (
                      <tr
                        key={order.mongoId || order.id}
                        onClick={() => openOrder(order)}
                        className="cursor-pointer border-b border-gray-50 transition-colors last:border-0 hover:bg-orange-50/40 dark:border-gray-800/80 dark:hover:bg-orange-950/10"
                      >
                        <td className="px-4 py-3.5 align-middle">
                          <StatusBadge status={order.status} />
                        </td>
                        <td className="px-4 py-3.5 align-middle">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-sm font-bold text-gray-900 dark:text-white">
                              #{shortOrderId(order.id)}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => handleCopyOrderId(order.id, e)}
                              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                              aria-label="Copy order ID"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 align-middle">
                          <p className="max-w-[180px] truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                            {order.customer}
                          </p>
                          <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-gray-400">
                            {order.address}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 align-middle">
                          <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
                            <Package className="h-3.5 w-3.5 text-gray-400" />
                            {itemCount} item{itemCount === 1 ? "" : "s"}
                          </div>
                          <p className="mt-0.5 max-w-[200px] truncate text-[11px] text-gray-400">
                            {order.items[0]?.name || "—"}
                            {order.items.length > 1 ? ` +${order.items.length - 1}` : ""}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 text-right align-middle text-sm font-extrabold tabular-nums text-gray-900 dark:text-white">
                          {formatMoney(order.totalPrice)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 align-middle text-xs text-gray-500">
                          {order.date}, {order.time}
                        </td>
                        <td className="px-4 py-3.5 text-right align-middle">
                          <span className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-bold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                            View <ChevronRight className="h-3.5 w-3.5" />
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {filteredOrders.length > ORDERS_PER_PAGE ? (
            <div className={`${RESTAURANT_CARD_CLASS} p-3 sm:p-4`}>
              <div className="mb-3 flex items-center justify-between gap-3 text-xs text-gray-400">
                <p>
                  {(currentPage - 1) * ORDERS_PER_PAGE + 1}–
                  {Math.min(currentPage * ORDERS_PER_PAGE, filteredOrders.length)} of{" "}
                  {filteredOrders.length}
                </p>
                <p className="font-semibold text-gray-500 dark:text-gray-400">
                  Page {currentPage}/{totalPages}
                </p>
              </div>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                    currentPage === 1
                      ? "cursor-not-allowed bg-gray-100 text-gray-300 dark:bg-gray-800 dark:text-gray-600"
                      : "bg-[#FF6A00] text-white"
                  }`}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Prev</span>
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .slice(Math.max(0, currentPage - 2), Math.min(totalPages, currentPage + 1))
                    .map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setCurrentPage(p)}
                        className={`h-9 min-w-9 rounded-xl px-2 text-sm font-bold transition-colors ${
                          currentPage === p
                            ? "bg-[#FF6A00] text-white"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                    currentPage === totalPages
                      ? "cursor-not-allowed bg-gray-100 text-gray-300 dark:bg-gray-800 dark:text-gray-600"
                      : "bg-[#FF6A00] text-white"
                  }`}
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <SheetShell
        open={showDateRangePopup}
        onClose={() => setShowDateRangePopup(false)}
        title="Select date range"
      >
        <div className="space-y-2 px-4 py-3">
          {dateRangeOptions.map((option) => {
            const isSelected =
              selectedDateRange?.label?.toLowerCase() === option.label.toLowerCase()
            return (
              <button
                key={option.label}
                type="button"
                onClick={() => handleDateRangeSelect(option)}
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                  isSelected
                    ? "border-[#FF6A00] bg-[#FF6A00]/5"
                    : "border-gray-100 bg-gray-50 hover:border-gray-200 dark:border-gray-800 dark:bg-gray-900/40 dark:hover:border-gray-700"
                }`}
              >
                <div>
                  <p
                    className={`text-sm font-semibold capitalize ${
                      isSelected ? "text-[#FF6A00]" : "text-gray-900 dark:text-white"
                    }`}
                  >
                    {option.label}
                  </p>
                  {!option.custom ? (
                    <p className="mt-0.5 text-xs text-gray-400">
                      {(() => {
                        const dates = option.getDates()
                        const start = dates.start.toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })
                        const end = dates.end.toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })
                        return `${start} – ${end}`
                      })()}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-gray-400">Pick exact start and end</p>
                  )}
                </div>
                {isSelected ? (
                  <span className="text-xs font-bold text-[#FF6A00]">Selected</span>
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-300" />
                )}
              </button>
            )
          })}
        </div>
      </SheetShell>

      <AnimatePresence>
        {showCalendar ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/50"
              onClick={() => setShowCalendar(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="fixed inset-0 z-[60] flex items-center justify-center p-4"
              onClick={() => setShowCalendar(false)}
            >
              <div className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
                <DateRangeCalendar
                  startDate={startDate}
                  endDate={endDate}
                  onDateRangeChange={handleDateRangeChange}
                  onClose={() => setShowCalendar(false)}
                />
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      <FilterOverlay
        open={showFilterPopup}
        onClose={() => setShowFilterPopup(false)}
        title="Filters"
        footer={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleClearFilters}
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 lg:flex-none lg:min-w-28 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={() => setShowFilterPopup(false)}
              className="flex-1 rounded-xl bg-[#FF6A00] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#e85f00] lg:min-w-36 lg:flex-none lg:px-6"
            >
              Apply{hasActiveFilters ? ` (${activeFilterCount})` : ""}
            </button>
          </div>
        }
      >
        <div className="flex min-h-[280px] h-full max-h-[min(60dvh,420px)] lg:max-h-none lg:min-h-[360px] flex-1 overflow-hidden">
          <div className="w-[7.5rem] shrink-0 overflow-y-auto border-r border-gray-100 bg-gray-50 lg:w-44 dark:border-gray-800 dark:bg-[#101010]">
            {filterCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => {
                  setActiveFilterCategory(category.id)
                  setFilterSearch("")
                }}
                className={`w-full border-b border-gray-100 px-3 py-3 text-left text-xs transition-colors lg:px-4 lg:py-3.5 lg:text-sm dark:border-gray-800 ${
                  activeFilterCategory === category.id
                    ? "border-l-[3px] border-l-[#FF6A00] bg-white font-bold text-gray-900 dark:bg-[#141414] dark:text-white"
                    : "text-gray-500 hover:bg-white/70 dark:text-gray-400 dark:hover:bg-gray-900"
                }`}
              >
                {category.label}
              </button>
            ))}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="border-b border-gray-100 p-3 lg:px-4 dark:border-gray-800">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  placeholder="Search filters"
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#FF6A00] focus:outline-none dark:border-gray-700 dark:bg-[#0c0c0c] dark:text-white"
                />
              </div>
            </div>

            <div className="flex-1 space-y-1 overflow-y-auto px-2 py-2 lg:px-3 lg:py-3">
              {categoryOptions.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-gray-400">No matching filters</p>
              ) : (
                categoryOptions.map((option) => {
                  const checked = filters[option.key]?.includes(option.id) || false
                  return (
                    <label
                      key={option.id}
                      className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-gray-50 lg:px-3 dark:hover:bg-gray-900/50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleFilterToggle(option)}
                        className="h-4 w-4 rounded border-gray-300 text-[#FF6A00] focus:ring-[#FF6A00]"
                      />
                      <span className="text-sm text-gray-800 dark:text-gray-200">{option.label}</span>
                    </label>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </FilterOverlay>

      <AnimatePresence>
        {showToast ? (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="fixed bottom-24 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-medium text-white shadow-lg lg:bottom-6"
          >
            <span className="text-emerald-400">✓</span>
            Order ID copied
          </motion.div>
        ) : null}
      </AnimatePresence>
    </RestaurantPageShell>
  )
}
