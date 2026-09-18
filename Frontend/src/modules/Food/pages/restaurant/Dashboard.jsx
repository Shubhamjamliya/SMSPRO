import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import {
  ShoppingBag, ClipboardList, UtensilsCrossed, Package, Tag,
  Store, Clock, Truck, Wallet, Star, ChefHat, MessageSquare,
  LifeBuoy, CalendarCheck, Zap, MapPin, BarChart2, ArrowDownToLine,
  Gift, TrendingUp, ChevronRight, AlertCircle, CheckCircle2,
  XCircle, Loader2, RefreshCw,
} from "lucide-react"
import { restaurantAPI } from "@food/api"
import RestaurantPageShell from "@food/components/restaurant/RestaurantPageShell"

const BASE = "/food/restaurant"

/* ─── Quick access tiles ─────────────────────────────────── */
const QUICK_TILES = [
  { label: "Live Orders",     icon: ShoppingBag,    path: "live-orders",     color: "#FF6A00", bg: "#FFF3EB" },
  { label: "All Orders",      icon: ClipboardList,  path: "orders/all",      color: "#6366F1", bg: "#EEEFFF" },
  { label: "Menu",            icon: UtensilsCrossed,path: "menu-categories", color: "#10B981", bg: "#ECFDF5" },
  { label: "Inventory",       icon: Package,        path: "inventory",       color: "#3B82F6", bg: "#EFF6FF" },
  { label: "Coupons",         icon: Tag,            path: "create-coupons",  color: "#F59E0B", bg: "#FFFBEB" },
  { label: "Outlet Info",     icon: Store,          path: "outlet-info",     color: "#8B5CF6", bg: "#F5F3FF" },
  { label: "Timings",         icon: Clock,          path: "outlet-timings",  color: "#EC4899", bg: "#FDF2F8" },
  { label: "Delivery",        icon: Truck,          path: "delivery-settings",color: "#0EA5E9", bg: "#F0F9FF" },
  { label: "Finance",         icon: Wallet,         path: "hub-finance",     color: "#14B8A6", bg: "#F0FDFA" },
  { label: "Ratings",         icon: Star,           path: "ratings-reviews", color: "#EAB308", bg: "#FEFCE8" },
  { label: "Reservations",    icon: CalendarCheck,  path: "reservations",    color: "#6D28D9", bg: "#F5F3FF" },
  { label: "Rush Hour",       icon: Zap,            path: "rush-hour",       color: "#F97316", bg: "#FFF7ED" },
  { label: "Zone Setup",      icon: MapPin,         path: "zone-setup",      color: "#0F766E", bg: "#F0FDFA" },
  { label: "Refer & Earn",    icon: Gift,           path: "refer-earn",      color: "#DB2777", bg: "#FDF2F8" },
  { label: "Dish Ratings",    icon: ChefHat,        path: "dish-ratings",    color: "#9333EA", bg: "#FAF5FF" },
  { label: "Support",         icon: LifeBuoy,       path: "help-centre/support", color: "#475569", bg: "#F8FAFC" },
]

/* ─── Order status chips ─────────────────────────────────── */
const STATUS_CONFIG = {
  pending:          { label: "Pending",       color: "text-amber-600",  bg: "bg-amber-50 dark:bg-amber-900/20",  border: "border-amber-200 dark:border-amber-800/40" },
  confirmed:        { label: "Confirmed",     color: "text-blue-600",   bg: "bg-blue-50 dark:bg-blue-900/20",    border: "border-blue-200 dark:border-blue-800/40" },
  preparing:        { label: "Preparing",     color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-900/20",border: "border-orange-200 dark:border-orange-800/40" },
  ready:            { label: "Ready",         color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-900/20",border: "border-purple-200 dark:border-purple-800/40" },
  out_for_delivery: { label: "Out",           color: "text-cyan-600",   bg: "bg-cyan-50 dark:bg-cyan-900/20",    border: "border-cyan-200 dark:border-cyan-800/40" },
  delivered:        { label: "Delivered",     color: "text-green-600",  bg: "bg-green-50 dark:bg-green-900/20",  border: "border-green-200 dark:border-green-800/40" },
  completed:        { label: "Completed",     color: "text-green-600",  bg: "bg-green-50 dark:bg-green-900/20",  border: "border-green-200 dark:border-green-800/40" },
  cancelled:        { label: "Cancelled",     color: "text-red-600",    bg: "bg-red-50 dark:bg-red-900/20",      border: "border-red-200 dark:border-red-800/40" },
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

function fmtCurrency(n) {
  if (typeof n !== "number" || isNaN(n)) return "—"
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n)
}

function fmtRevenue(n) {
  if (typeof n !== "number" || isNaN(n)) return "—"
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function fmtDate(iso) {
  if (!iso) return ""
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
}

/** Restaurant net revenue after commission (matches order-details earnings). */
function getOrderNetRevenue(order) {
  const pricing = order?.pricing || {}
  const subtotal = Number(pricing.subtotal ?? 0) || 0
  // Only restaurant-managed packaging is restaurant income; admin-managed stays
  // with the platform (mirrors computeEarnings in normalizeRestaurantOrder.js).
  const packagingFee =
    String(pricing.packagingMode ?? "") === "RESTAURANT"
      ? Number(pricing.packagingFee ?? 0) || 0
      : 0
  const restaurantDeliveryFee = Number(pricing.restaurantDeliveryFee ?? 0) || 0
  let commission = Number(pricing.restaurantCommission ?? 0) || 0
  if (!commission) {
    const pct = Number(pricing.restaurantCommissionPercentage ?? 0) || 0
    if (pct > 0) commission = Math.round(subtotal * (pct / 100) * 100) / 100
  }
  const computed = Math.max(
    0,
    subtotal + packagingFee - restaurantDeliveryFee - commission,
  )
  if (computed > 0) return computed

  // Fallback when pricing is incomplete but ledger payout exists
  const explicit = Number(
    order?.payout ??
      order?.restaurantEarning ??
      order?.restaurantShare ??
      pricing?.restaurantShare ??
      0,
  )
  return Number.isFinite(explicit) && explicit > 0 ? explicit : 0
}

function getMonthRange(reference = new Date()) {
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1, 0, 0, 0, 0)
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 0, 23, 59, 59, 999)
  return { start, end }
}

/* ─── Stat card ──────────────────────────────────────────── */
function StatCard({ label, value, sub, icon: Icon, color, loading }) {
  return (
    <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color + "18" }}>
        <Icon className="w-5 h-5" style={{ color }} strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-1 truncate">{label}</p>
        {loading ? (
          <div className="h-6 w-16 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        ) : (
          <p className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{value}</p>
        )}
        {sub && !loading && (
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">{sub}</p>
        )}
      </div>
    </div>
  )
}

/* ─── Recent order row ───────────────────────────────────── */
function OrderRow({ order, onClick }) {
  const status = (order.status || order.orderStatus || "pending").toLowerCase().replace(/ /g, "_")
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  const name = order.customer?.name || order.user?.name || "Customer"
  const id = String(order.orderId || order._id || "").slice(-6).toUpperCase()
  const amount = order.totalAmount ?? order.total ?? 0
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors text-left"
    >
      <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300 flex-shrink-0">
        {name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{name}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">#{id} · {fmtDate(order.createdAt)}</p>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <p className="text-sm font-bold text-gray-900 dark:text-white">{fmtCurrency(amount)}</p>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
          {cfg.label}
        </span>
      </div>
    </button>
  )
}

/* ─── Main component ─────────────────────────────────────── */
export default function Dashboard() {
  const navigate = useNavigate()

  const [restaurantData, setRestaurantData] = useState(null)
  const [stats, setStats] = useState({
    monthlyOrders: null,
    monthlyRevenue: null,
    pending: null,
    completed: null,
  })
  const [recentOrders, setRecentOrders] = useState([])
  const [statsLoading, setStatsLoading] = useState(true)
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [status, setStatus] = useState("Offline")
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const update = () => {
      try {
        const saved = localStorage.getItem("restaurant_online_status")
        setStatus(saved !== null ? (JSON.parse(saved) ? "Online" : "Offline") : "Offline")
      } catch { setStatus("Offline") }
    }
    update()
    const handler = (e) => setStatus(e.detail?.isOnline ? "Online" : "Offline")
    window.addEventListener("restaurantStatusChanged", handler)
    return () => window.removeEventListener("restaurantStatusChanged", handler)
  }, [])

  const loadData = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)

    try {
      const res = await restaurantAPI.getCurrentRestaurant()
      const data =
        res?.data?.data?.restaurant || res?.data?.restaurant ||
        res?.data?.data?.user || res?.data?.user || res?.data?.data
      if (data) {
        setRestaurantData(data)
        if (data.isAcceptingOrders !== undefined) {
          const isOnline = Boolean(data.isAcceptingOrders)
          setStatus(isOnline ? "Online" : "Offline")
          try {
            localStorage.setItem("restaurant_online_status", JSON.stringify(isOnline))
            window.dispatchEvent(new CustomEvent("restaurantStatusChanged", { detail: { isOnline } }))
          } catch {}
        }
      }
    } catch {}

    setStatsLoading(true)
    setOrdersLoading(true)

    try {
      const { start, end } = getMonthRange()
      const startOfMonth = start.toISOString()
      const endOfMonth = end.toISOString()
      const monthLabel = start.toLocaleDateString("en-IN", {
        month: "short",
        year: "numeric",
      })

      const [monthAllRes, monthCompletedRes, pendingRes, recentRes] =
        await Promise.allSettled([
          restaurantAPI.getOrders({
            startDate: startOfMonth,
            endDate: endOfMonth,
            limit: 1,
            page: 1,
          }),
          restaurantAPI.getOrders({
            status: "delivered,completed",
            startDate: startOfMonth,
            endDate: endOfMonth,
            limit: 500,
            page: 1,
          }),
          restaurantAPI.getOrders({
            status: "pending,confirmed,preparing,ready",
            limit: 1,
            page: 1,
          }),
          restaurantAPI.getOrders({
            limit: 8,
            sortBy: "createdAt",
            sortOrder: "desc",
          }),
        ])

      const monthAllMeta =
        monthAllRes.value?.data?.data?.meta || monthAllRes.value?.data?.meta
      const monthCompletedMeta =
        monthCompletedRes.value?.data?.data?.meta ||
        monthCompletedRes.value?.data?.meta
      const pendingMeta =
        pendingRes.value?.data?.data?.meta || pendingRes.value?.data?.meta
      const recentData =
        recentRes.value?.data?.data?.orders ||
        recentRes.value?.data?.orders ||
        []

      const completedOrders =
        monthCompletedRes.value?.data?.data?.orders ||
        monthCompletedRes.value?.data?.orders ||
        []
      const netRevenue = completedOrders.reduce(
        (sum, order) => sum + getOrderNetRevenue(order),
        0,
      )

      setStats({
        monthlyOrders: monthAllMeta?.total ?? null,
        monthlyRevenue: netRevenue,
        pending: pendingMeta?.total ?? null,
        completed: monthCompletedMeta?.total ?? completedOrders.length ?? null,
        monthLabel,
      })
      setRecentOrders(recentData.slice(0, 8))
    } catch {} finally {
      setStatsLoading(false)
      setOrdersLoading(false)
      if (showRefresh) setRefreshing(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const restaurantName = restaurantData?.name || "My Restaurant"
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })

  return (
    <RestaurantPageShell hideHeader maxWidth="6xl" contentClassName="!py-0 !px-0">
      <div className="bg-white dark:bg-[#111] border-b border-gray-100 dark:border-gray-800 px-4 sm:px-6 lg:px-8 pt-5 pb-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-1">{today}</p>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white leading-tight">
                {getGreeting()} 👋
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-xs">
                {restaurantName}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Status pill */}
              <button
                onClick={() => navigate(`${BASE}/status`)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  status === "Online"
                    ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/40"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${status === "Online" ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
                {status}
              </button>

              {/* Refresh */}
              <button
                onClick={() => loadData(true)}
                disabled={refreshing}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            <StatCard
              label="Monthly Orders" icon={ShoppingBag} color="#FF6A00"
              value={stats.monthlyOrders ?? "—"}
              sub={stats.monthLabel || "This month"}
              loading={statsLoading}
            />
            <StatCard
              label="Monthly Revenue" icon={TrendingUp} color="#10B981"
              value={
                stats.monthlyRevenue !== null && stats.monthlyRevenue !== undefined
                  ? fmtRevenue(stats.monthlyRevenue)
                  : "—"
              }
              sub="After commission"
              loading={statsLoading}
            />
            <StatCard
              label="Pending" icon={AlertCircle} color="#F59E0B"
              value={stats.pending ?? "—"}
              sub="Need action"
              loading={statsLoading}
            />
            <StatCard
              label="Completed" icon={CheckCircle2} color="#6366F1"
              value={stats.completed ?? "—"}
              sub={stats.monthLabel ? `Delivered · ${stats.monthLabel}` : "Delivered this month"}
              loading={statsLoading}
            />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Quick Access ───────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-widest">
            Quick access
          </h2>
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2 sm:gap-3">
            {QUICK_TILES.map((tile) => {
              const Icon = tile.icon
              return (
                <button
                  key={tile.path}
                  onClick={() => navigate(`${BASE}/${tile.path}`)}
                  className="flex flex-col items-center gap-2 p-3 bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 hover:shadow-sm active:scale-95 transition-all duration-150"
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: tile.bg }}
                  >
                    <Icon className="w-5 h-5" style={{ color: tile.color }} strokeWidth={2} />
                  </div>
                  <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400 text-center leading-tight">
                    {tile.label}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        {/* ── Two-col layout for desktop ─────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Recent orders — takes 2 cols */}
          <section className="lg:col-span-2">
            <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 dark:border-gray-800">
                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Recent orders</h2>
                <button
                  onClick={() => navigate(`${BASE}/orders/all`)}
                  className="flex items-center gap-1 text-xs font-semibold text-[#FF6A00] hover:underline"
                >
                  View all <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {ordersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
                </div>
              ) : recentOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-600">
                  <ShoppingBag className="w-10 h-10 mb-2 opacity-30" strokeWidth={1.5} />
                  <p className="text-sm">No orders yet today</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
                  {recentOrders.map((order) => (
                    <OrderRow
                      key={order._id || order.orderId}
                      order={order}
                      onClick={() => navigate(`${BASE}/orders/${order._id || order.orderId}`)}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Right column */}
          <section className="space-y-4">

            {/* Go live CTA */}
            <div
              className={`rounded-2xl p-4 border ${
                status === "Online"
                  ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800/30"
                  : "bg-[#FF6A00]/5 dark:bg-[#FF6A00]/10 border-[#FF6A00]/20"
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  status === "Online" ? "bg-green-100 dark:bg-green-900/30" : "bg-[#FF6A00]/10"
                }`}>
                  {status === "Online"
                    ? <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    : <XCircle className="w-5 h-5 text-[#FF6A00]" />
                  }
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    {status === "Online" ? "You're live!" : "You're offline"}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {status === "Online" ? "Accepting new orders" : "Not accepting orders"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate(`${BASE}/status`)}
                className={`w-full h-9 rounded-xl text-sm font-semibold transition-colors ${
                  status === "Online"
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : "bg-[#FF6A00] hover:bg-[#e05e00] text-white"
                }`}
              >
                {status === "Online" ? "Manage status" : "Go online"}
              </button>
            </div>

            {/* Quick navigation links */}
            <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
              <p className="text-xs font-bold text-gray-400 dark:text-gray-600 uppercase tracking-widest px-4 pt-4 pb-2">
                Quick links
              </p>
              {[
                { label: "Live Orders",     icon: ShoppingBag,    path: "live-orders",          badge: stats.pending },
                { label: "Outlet Timings",  icon: Clock,          path: "outlet-timings" },
                { label: "Rush Hour",       icon: Zap,            path: "rush-hour" },
                { label: "Withdrawal",      icon: ArrowDownToLine,path: "withdrawal-history" },
                { label: "Refer & Earn",    icon: Gift,           path: "refer-earn" },
              ].map(({ label, icon: Icon, path, badge }) => (
                <button
                  key={path}
                  onClick={() => navigate(`${BASE}/${path}`)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                >
                  <Icon className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" strokeWidth={1.8} />
                  <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300 text-left">{label}</span>
                  {badge > 0 && (
                    <span className="text-[10px] font-bold bg-[#FF6A00] text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                      {badge}
                    </span>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                </button>
              ))}
            </div>

            {/* Finance summary card */}
            <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-gray-900 dark:text-white">Finance</p>
                <button
                  onClick={() => navigate(`${BASE}/hub-finance`)}
                  className="text-xs font-semibold text-[#FF6A00] hover:underline"
                >
                  View
                </button>
              </div>
              {[
                { label: "Finance Details",    icon: BarChart2,       path: "finance-details" },
                { label: "Download Report",    icon: ArrowDownToLine, path: "download-report" },
                { label: "Bank Details",       icon: Store,           path: "update-bank-details" },
              ].map(({ label, icon: Icon, path }) => (
                <button
                  key={path}
                  onClick={() => navigate(`${BASE}/${path}`)}
                  className="w-full flex items-center gap-3 py-2 hover:opacity-70 transition-opacity"
                >
                  <Icon className="w-4 h-4 text-[#FF6A00] flex-shrink-0" strokeWidth={1.8} />
                  <span className="text-sm text-gray-600 dark:text-gray-400 text-left flex-1">{label}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </RestaurantPageShell>
  )
}
