import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Bell, RefreshCw, X, ShoppingBag, Megaphone, Loader2, Trash2 } from "lucide-react"
import { restaurantAPI } from "@food/api"
import useNotificationInbox from "@food/hooks/useNotificationInbox"
import RestaurantPageShell from "@food/components/restaurant/RestaurantPageShell"

const debugLog  = (...args) => {}
const debugError = (...args) => {}
const DISMISSED_KEY = "restaurant_dismissed_notifications"

const STATUS_LABEL = {
  confirmed:        "New order received",
  preparing:        "Order is preparing",
  ready:            "Order is ready for pickup",
  out_for_delivery: "Order out for delivery",
  delivered:        "Order delivered",
  cancelled:        "Order cancelled",
  rejected:         "Order rejected",
}

const getStatusLabel = (s = "") => STATUS_LABEL[String(s).toLowerCase()] || "Order update"

const STATUS_COLOR = {
  confirmed:        "bg-blue-100 text-blue-700",
  preparing:        "bg-orange-100 text-orange-700",
  ready:            "bg-purple-100 text-purple-700",
  out_for_delivery: "bg-cyan-100 text-cyan-700",
  delivered:        "bg-green-100 text-green-700",
  cancelled:        "bg-red-100 text-red-700",
}

export default function Notifications() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [dismissedIds, setDismissedIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]") } catch { return [] }
  })

  const {
    items: broadcastNotifications,
    loading: broadcastLoading,
    markAsRead: markBroadcastAsRead,
    dismiss: dismissBroadcast,
    dismissAll: dismissAllBroadcast,
    refresh: refreshBroadcast,
  } = useNotificationInbox("restaurant", { limit: 100, pollMs: 5 * 60 * 1000 })

  const fetchOrders = async () => {
    try {
      setLoading(true)
      const res = await restaurantAPI.getOrders({ page: 1, limit: 30 })
      setOrders(res?.data?.data?.orders || res?.data?.data?.data?.orders || [])
    } catch { setOrders([]) } finally { setLoading(false) }
  }

  useEffect(() => { fetchOrders() }, [])
  useEffect(() => { localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissedIds)) }, [dismissedIds])

  const notifications = useMemo(() => {
    const orderRows = (orders || [])
      .map(o => {
        const id = o._id || o.orderId
        const ts = o.updatedAt || o.createdAt
        const status = (o.orderStatus || o.status || "").toLowerCase()
        return {
          id, type: "order", status,
          orderId: o.orderId || "N/A",
          message: getStatusLabel(status),
          timeValue: ts ? new Date(ts).getTime() : 0,
          time: ts ? new Date(ts).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }) : "",
        }
      })
      .filter(n => n.id && !dismissedIds.includes(n.id))

    const broadcastRows = (broadcastNotifications || []).map(n => ({
      id: n.id, type: "broadcast",
      message: n.title || "Notification",
      detail: n.message || "",
      read: n.read,
      timeValue: n.createdAt ? new Date(n.createdAt).getTime() : 0,
      time: n.createdAt ? new Date(n.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }) : "",
    }))

    return [...broadcastRows, ...orderRows].sort((a, b) => b.timeValue - a.timeValue)
  }, [broadcastNotifications, dismissedIds, orders])

  const remove = (id, type) => {
    if (type === "broadcast") { dismissBroadcast(id); return }
    setDismissedIds(p => p.includes(id) ? p : [...p, id])
  }

  const clearAll = () => {
    dismissAllBroadcast()
    const ids = notifications.filter(n => n.type !== "broadcast").map(n => n.id).filter(Boolean)
    setDismissedIds(p => [...new Set([...p, ...ids])])
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await Promise.all([fetchOrders(), refreshBroadcast()])
    setRefreshing(false)
  }

  const isLoading = loading || broadcastLoading

  return (
    <RestaurantPageShell
      title="Notifications"
      subtitle={!isLoading ? (notifications.length > 0 ? `${notifications.length} notification${notifications.length !== 1 ? "s" : ""}` : "All caught up") : undefined}
      maxWidth="2xl"
      actions={(
        <>
          {notifications.length > 0 && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1.5 text-xs font-semibold text-red-500 hover:text-red-600 px-3 py-1.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear all
            </button>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} strokeWidth={2} />
          </button>
        </>
      )}
    >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-gray-300 animate-spin mb-3" />
            <p className="text-sm text-gray-400">Loading notifications…</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4">
              <Bell className="w-8 h-8 text-gray-300 dark:text-gray-600" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">No notifications</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">You're all caught up! New updates will appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((item) => {
              const isBroadcast = item.type === "broadcast"
              const statusColor = item.status ? (STATUS_COLOR[item.status] || "bg-gray-100 text-gray-600") : ""
              return (
                <div
                  key={item.id}
                  onClick={() => isBroadcast && !item.read ? markBroadcastAsRead(item.id) : undefined}
                  className={`bg-white dark:bg-[#111] rounded-2xl border transition-colors ${
                    isBroadcast && !item.read
                      ? "border-[#FF6A00]/30 dark:border-[#FF6A00]/20 cursor-pointer"
                      : "border-gray-100 dark:border-gray-800"
                  }`}
                >
                  <div className="flex items-start gap-3 p-4">
                    {/* Icon */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      isBroadcast
                        ? "bg-[#FF6A00]/10 dark:bg-[#FF6A00]/10"
                        : "bg-blue-50 dark:bg-blue-900/20"
                    }`}>
                      {isBroadcast
                        ? <Megaphone className="w-4 h-4 text-[#FF6A00]" strokeWidth={2} />
                        : <ShoppingBag className="w-4 h-4 text-blue-600 dark:text-blue-400" strokeWidth={2} />
                      }
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-semibold leading-tight ${isBroadcast && !item.read ? "text-gray-900 dark:text-white" : "text-gray-800 dark:text-gray-200"}`}>
                          {item.message}
                        </p>
                        <button
                          onClick={e => { e.stopPropagation(); remove(item.id, item.type) }}
                          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 flex-shrink-0 -mt-0.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {isBroadcast && item.detail && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{item.detail}</p>
                      )}

                      {!isBroadcast && (
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">#{String(item.orderId).slice(-6).toUpperCase()}</span>
                          {item.status && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor}`}>
                              {STATUS_LABEL[item.status] || item.status}
                            </span>
                          )}
                        </div>
                      )}

                      <p className="text-[11px] text-gray-400 dark:text-gray-600 mt-1.5">{item.time}</p>
                    </div>
                  </div>

                  {isBroadcast && !item.read && (
                    <div className="h-0.5 bg-gradient-to-r from-[#FF6A00]/40 via-[#FF6A00]/20 to-transparent rounded-b-2xl" />
                  )}
                </div>
              )
            })}
          </div>
        )}
    </RestaurantPageShell>
  )
}
