import { useState, useEffect, useCallback } from "react"
import { Outlet, useNavigate, useLocation, NavLink } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import {
  LayoutDashboard, ShoppingBag, ClipboardList, CalendarCheck,
  UtensilsCrossed, Package, Tag, Store, Clock, Zap, Truck, MapPin,
  Wallet, BarChart2, ArrowDownToLine, FileDown,
  Star, ChefHat, MessageSquare, User, Landmark,
  LifeBuoy, Bell, ChevronRight, LogOut, X, Menu, Home,
  MoreHorizontal, ChevronLeft, Settings,
} from "lucide-react"
import { restaurantAPI } from "@food/api"
import { loadBusinessSettings, getAppLogo, getCompanyName } from "@common/utils/businessSettings"
import { clearModuleAuth } from "@food/utils/auth"
import useNotificationInbox from "@food/hooks/useNotificationInbox"
import { RestaurantLayoutContext } from "./RestaurantLayoutContext"
import { RestaurantRealtimeProvider } from "@food/context/RestaurantRealtimeContext"

/* ─── Navigation structure ─────────────────────────────────────── */
const NAV_GROUPS = [
  {
    label: "Operations",
    items: [
      { label: "Dashboard",      icon: LayoutDashboard, path: "" },
      { label: "Live Orders",    icon: ShoppingBag,     path: "live-orders",  badge: true },
      { label: "All Orders",     icon: ClipboardList,   path: "orders/all" },
      { label: "Reservations",   icon: CalendarCheck,   path: "reservations" },
    ],
  },
  {
    label: "Menu & Catalog",
    items: [
      { label: "Menu Categories", icon: UtensilsCrossed, path: "menu-categories" },
      { label: "Inventory",        icon: Package,         path: "inventory" },
      { label: "Coupons",          icon: Tag,             path: "create-coupons" },
    ],
  },
  {
    label: "Outlet",
    items: [
      { label: "Outlet Info",        icon: Store,    path: "outlet-info" },
      { label: "Outlet Operations",   icon: Clock,    path: "outlet-operations" },
      { label: "Zone Setup",         icon: MapPin,   path: "zone-setup" },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Hub Finance",          icon: Wallet,          path: "hub-finance" },
      { label: "Finance Details",      icon: BarChart2,       path: "finance-details" },
      { label: "Withdrawal History",   icon: ArrowDownToLine, path: "withdrawal-history" },
      { label: "Download Report",      icon: FileDown,        path: "download-report" },
      { label: "Bank Details",         icon: Landmark,        path: "update-bank-details" },
    ],
  },
  {
    label: "Feedback",
    items: [
      { label: "Ratings & Reviews", icon: Star,          path: "ratings-reviews" },
      { label: "Dish Ratings",       icon: ChefHat,       path: "dish-ratings" },
      { label: "Customer Feedback",  icon: MessageSquare, path: "feedback" },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Account",       icon: User,        path: "account" },
      { label: "Support",      icon: LifeBuoy,    path: "help-centre/support" },
    ],
  },
]

/* Bottom nav tabs (mobile) */
const BOTTOM_TABS = [
  { label: "Home",    icon: Home,         path: "" },
  { label: "Orders",  icon: ShoppingBag,  path: "live-orders" },
  { label: "Menu",    icon: UtensilsCrossed, path: "menu-categories" },
  { label: "Finance", icon: Wallet,       path: "hub-finance" },
  { label: "More",    icon: MoreHorizontal, path: null },
]

const BASE = "/food/restaurant"

function isPathActive(path, pathname) {
  const full = path === "" ? BASE : `${BASE}/${path}`
  if (path === "") return pathname === BASE || pathname === `${BASE}/`
  return pathname === full || pathname.startsWith(full + "/")
}

/* ─── Sidebar nav item ─────────────────────────────────────────── */
function SidebarItem({ item, collapsed, pendingOrders = 0, onClick }) {
  const { pathname } = useLocation()
  const active = isPathActive(item.path, pathname)
  const full = item.path === "" ? BASE : `${BASE}/${item.path}`
  const Icon = item.icon

  return (
    <NavLink
      to={full}
      onClick={onClick}
      className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${
        active
          ? "bg-[#FF6A00]/10 text-[#FF6A00]"
          : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/60 hover:text-gray-800 dark:hover:text-gray-200"
      }`}
    >
      <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${active ? "text-[#FF6A00]" : ""}`} strokeWidth={active ? 2.2 : 1.8} />
      {!collapsed && (
        <span className="truncate flex-1">{item.label}</span>
      )}
      {!collapsed && item.badge && pendingOrders > 0 && (
        <span className="ml-auto text-[10px] font-bold bg-[#FF6A00] text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
          {pendingOrders > 99 ? "99+" : pendingOrders}
        </span>
      )}
      {collapsed && item.badge && pendingOrders > 0 && (
        <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-[#FF6A00] border-2 border-white dark:border-[#111]" />
      )}
      {collapsed && (
        <div className="absolute left-full ml-2 px-2.5 py-1 bg-gray-900 dark:bg-gray-700 text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl">
          {item.label}
        </div>
      )}
    </NavLink>
  )
}

/* ─── Main layout ──────────────────────────────────────────────── */
export default function RestaurantLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const [collapsed, setCollapsed]         = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false)
  const [restaurantData, setRestaurantData] = useState(null)
  const [logoUrl, setLogoUrl]             = useState(() => getAppLogo("restaurant"))
  const [companyName, setCompanyName]     = useState(() => getCompanyName())
  const [pendingOrders, setPendingOrders] = useState(0)
  const [status, setStatus]               = useState("Offline")
  const [isDesktop, setIsDesktop]         = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024)

  const { unreadCount } = useNotificationInbox("restaurant", { limit: 20, pollMs: 5 * 60 * 1000 })

  /* Pending onboarding sessions must stay on the waiting page until approved. */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("restaurant_user")
      const user = raw ? JSON.parse(raw) : null
      if (String(user?.status || "").toLowerCase() === "pending") {
        navigate("/food/restaurant/pending-verification", { replace: true })
      }
    } catch {
      // ignore
    }
  }, [navigate])

  /* Close mobile menu/drawer on route change */
  useEffect(() => {
    setMobileMenuOpen(false)
    setMoreDrawerOpen(false)
  }, [pathname])

  /* Track desktop breakpoint */
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)")
    const handler = (e) => setIsDesktop(e.matches)
    mq.addEventListener("change", handler)
    setIsDesktop(mq.matches)
    return () => mq.removeEventListener("change", handler)
  }, [])

  /* Business settings */
  useEffect(() => {
    const load = async () => {
      try {
        await loadBusinessSettings()
        const logo = getAppLogo("restaurant")
        if (logo) setLogoUrl(logo)
        const name = getCompanyName()
        if (name) setCompanyName(name)
      } catch {}
    }
    load()
    const handler = () => load()
    window.addEventListener("businessSettingsUpdated", handler)
    return () => window.removeEventListener("businessSettingsUpdated", handler)
  }, [])

  /* Restaurant data */
  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await restaurantAPI.getCurrentRestaurant()
        const data =
          res?.data?.data?.restaurant ||
          res?.data?.restaurant ||
          res?.data?.data?.user ||
          res?.data?.user ||
          res?.data?.data
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
    }
    fetch()
  }, [])

  /* Online/offline status */
  useEffect(() => {
    const update = () => {
      try {
        const saved = localStorage.getItem("restaurant_online_status")
        setStatus(saved !== null ? (JSON.parse(saved) ? "Online" : "Offline") : "Offline")
      } catch {
        setStatus("Offline")
      }
    }
    update()
    const handler = (e) => setStatus(e.detail?.isOnline ? "Online" : "Offline")
    window.addEventListener("restaurantStatusChanged", handler)
    return () => window.removeEventListener("restaurantStatusChanged", handler)
  }, [])

  /* Pending orders count (for badge) */
  useEffect(() => {
    const load = async () => {
      try {
        const res = await restaurantAPI.getOrders({ status: "pending,confirmed,preparing", limit: 1 })
        const meta = res?.data?.data?.meta || res?.data?.meta
        if (meta?.total !== undefined) setPendingOrders(meta.total)
      } catch {}
    }
    load()
    const id = setInterval(load, 60_000)
    const onRefresh = () => load()
    window.addEventListener("restaurantOrdersRefresh", onRefresh)
    return () => {
      clearInterval(id)
      window.removeEventListener("restaurantOrdersRefresh", onRefresh)
    }
  }, [])

  const handleLogout = useCallback(() => {
    clearModuleAuth("restaurant")
    window.dispatchEvent(new Event("restaurantAuthChanged"))
    navigate("/food/restaurant/login", { replace: true })
  }, [navigate])

  const restaurantName = restaurantData?.name || "My Restaurant"
  const sidebarW = collapsed ? 72 : 260

  /* ── Sidebar content (shared between desktop fixed + mobile drawer) ── */
  const SidebarContent = ({ onItemClick }) => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Logo + brand */}
      <div className={`flex items-center gap-3 px-4 py-5 border-b border-gray-100 dark:border-gray-800 flex-shrink-0 ${collapsed ? "justify-center" : ""}`}>
        {logoUrl ? (
          <img src={logoUrl} alt={companyName} className="w-8 h-8 rounded-lg object-contain flex-shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-[#FF6A00] flex items-center justify-center flex-shrink-0">
            <Store className="w-4 h-4 text-white" strokeWidth={2} />
          </div>
        )}
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest leading-none mb-0.5 truncate">
              {companyName}
            </p>
            <p className="text-sm font-bold text-gray-900 dark:text-white truncate leading-tight">
              {restaurantName}
            </p>
          </div>
        )}
      </div>

      {/* Status pill */}
      {!collapsed && (
        <div className="px-4 py-2.5 flex-shrink-0">
          <button
            onClick={() => { navigate(`${BASE}/status`); onItemClick?.() }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
              status === "Online"
                ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/40"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700"
            }`}
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${status === "Online" ? "bg-green-500" : "bg-gray-400"}`} />
            <span className="flex-1 text-left">{status === "Online" ? "Accepting orders" : "Currently offline"}</span>
            <ChevronRight className="w-3.5 h-3.5 opacity-50 flex-shrink-0" />
          </button>
        </div>
      )}
      {collapsed && (
        <div className="flex justify-center py-3 flex-shrink-0">
          <button
            onClick={() => { navigate(`${BASE}/status`); onItemClick?.() }}
            className="relative group"
            title={status === "Online" ? "Online" : "Offline"}
          >
            <span className={`w-3 h-3 rounded-full block ${status === "Online" ? "bg-green-500" : "bg-gray-400"}`} />
            <div className="absolute left-full ml-2 px-2.5 py-1 bg-gray-900 text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
              {status}
            </div>
          </button>
        </div>
      )}

      {/* Nav groups */}
      <div className="flex-1 overflow-y-auto py-2 scrollbar-hide">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className={`${collapsed ? "px-2" : "px-3"} mb-4`}>
            {!collapsed && (
              <p className="text-[10px] font-bold text-gray-400 dark:text-gray-600 uppercase tracking-widest px-3 mb-1.5">
                {group.label}
              </p>
            )}
            {collapsed && <div className="border-t border-gray-100 dark:border-gray-800 mb-2 mt-1" />}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <SidebarItem
                  key={item.path}
                  item={item}
                  collapsed={collapsed}
                  pendingOrders={pendingOrders}
                  onClick={onItemClick}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Logout */}
      <div className={`border-t border-gray-100 dark:border-gray-800 p-3 flex-shrink-0 ${collapsed ? "flex justify-center" : ""}`}>
        <button
          onClick={handleLogout}
          className={`flex items-center gap-3 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors rounded-xl px-3 py-2.5 hover:bg-red-50 dark:hover:bg-red-900/10 group ${collapsed ? "" : "w-full"}`}
          title="Logout"
        >
          <LogOut className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.8} />
          {!collapsed && <span>Logout</span>}
          {collapsed && (
            <div className="absolute left-full ml-2 px-2.5 py-1 bg-gray-900 text-white text-xs font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
              Logout
            </div>
          )}
        </button>
      </div>
    </div>
  )

  /* ── "More" drawer items (mobile) ── */
  const MoreDrawerItems = () => (
    <div className="flex flex-col">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="mb-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-5 py-2">
            {group.label}
          </p>
          <div className="space-y-0.5 px-3">
            {group.items.map((item) => {
              const Icon = item.icon
              const full = item.path === "" ? BASE : `${BASE}/${item.path}`
              const active = isPathActive(item.path, pathname)
              return (
                <button
                  key={item.path}
                  onClick={() => { navigate(full); setMoreDrawerOpen(false) }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    active
                      ? "bg-[#FF6A00]/10 text-[#FF6A00]"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <Icon className="w-4.5 h-4.5 flex-shrink-0" style={{ width: 18, height: 18 }} strokeWidth={active ? 2.2 : 1.8} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.badge && pendingOrders > 0 && (
                    <span className="text-[10px] font-bold bg-[#FF6A00] text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                      {pendingOrders > 99 ? "99+" : pendingOrders}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <div className="border-t border-gray-100 dark:border-gray-800 mt-2 px-3 py-3">
        <button
          onClick={() => { handleLogout() }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
        >
          <LogOut style={{ width: 18, height: 18 }} strokeWidth={1.8} />
          Logout
        </button>
      </div>
    </div>
  )

  return (
    <RestaurantLayoutContext.Provider value={true}>
      <RestaurantRealtimeProvider restaurantName={restaurantName}>
      <div className="h-screen bg-gray-50 dark:bg-[#0a0a0a] flex overflow-hidden">

        {/* ════════════════════════════════════════════
            Desktop sidebar — fixed left panel
        ════════════════════════════════════════════ */}
        <aside
          className="hidden lg:flex flex-col fixed top-0 left-0 bottom-0 bg-white dark:bg-[#111] border-r border-gray-100 dark:border-gray-800 z-40 transition-[width] duration-200"
          style={{ width: sidebarW }}
        >
          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed((p) => !p)}
            className="absolute -right-3 top-[72px] w-6 h-6 bg-white dark:bg-[#222] border border-gray-200 dark:border-gray-700 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors z-50"
          >
            {collapsed
              ? <ChevronRight className="w-3 h-3 text-gray-500" />
              : <ChevronLeft className="w-3 h-3 text-gray-500" />
            }
          </button>
          <SidebarContent onItemClick={null} />
        </aside>

        {/* ════════════════════════════════════════════
            Mobile sidebar drawer
        ════════════════════════════════════════════ */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="lg:hidden fixed inset-0 bg-black/40 z-50"
                onClick={() => setMobileMenuOpen(false)}
              />
              <motion.aside
                initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
                transition={{ type: "spring", damping: 30, stiffness: 350 }}
                className="lg:hidden fixed top-0 left-0 bottom-0 w-[280px] bg-white dark:bg-[#111] border-r border-gray-100 dark:border-gray-800 z-50 flex flex-col"
              >
                <div className="absolute top-3 right-3">
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <SidebarContent onItemClick={() => setMobileMenuOpen(false)} />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* ════════════════════════════════════════════
            Main content column
        ════════════════════════════════════════════ */}
        <div
          className="flex-1 flex flex-col h-screen min-h-0 overflow-hidden transition-[margin] duration-200"
          style={{ marginLeft: isDesktop ? sidebarW : 0 }}
        >
          {/* ── Header ── */}
          <header className="flex-shrink-0 z-30 bg-white dark:bg-[#111] border-b border-gray-100 dark:border-gray-800 h-14 flex items-center px-4 gap-3">
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 flex-shrink-0"
            >
              <Menu className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
            </button>

            {/* Restaurant info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 dark:text-white truncate leading-tight">
                {restaurantName}
              </p>
              {restaurantData?.location?.city && (
                <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate leading-tight flex items-center gap-1">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  {restaurantData.location.city}
                </p>
              )}
            </div>

            {/* Status pill */}
            <button
              onClick={() => navigate(`${BASE}/status`)}
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors flex-shrink-0 ${
                status === "Online"
                  ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/40"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${status === "Online" ? "bg-green-500" : "bg-gray-400"}`} />
              {status}
            </button>

            {/* Notifications */}
            <button
              onClick={() => navigate(`${BASE}/notifications`)}
              className="relative w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
            >
              <Bell className="w-[18px] h-[18px]" strokeWidth={1.8} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#FF6A00] border-2 border-white dark:border-[#111]" />
              )}
            </button>

            {/* Settings / Profile avatar */}
            <button
              onClick={() => navigate(`${BASE}/profile`)}
              className="w-9 h-9 rounded-xl bg-[#FF6A00]/10 flex items-center justify-center text-[#FF6A00] hover:bg-[#FF6A00]/20 transition-colors flex-shrink-0"
            >
              <User className="w-[18px] h-[18px]" strokeWidth={2} />
            </button>
          </header>

          {/* ── Page content ── */}
          <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-20 lg:pb-0 bg-gray-50 dark:bg-[#0a0a0a]">
            <Outlet />
          </main>
        </div>

        {/* ════════════════════════════════════════════
            Mobile bottom tab bar
        ════════════════════════════════════════════ */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-[#111] border-t border-gray-100 dark:border-gray-800 h-16 flex items-center px-2 safe-bottom">
          {BOTTOM_TABS.map((tab) => {
            const Icon = tab.icon
            const active = tab.path !== null && isPathActive(tab.path, pathname)
            const isMore = tab.path === null
            return (
              <button
                key={tab.label}
                onClick={() => {
                  if (isMore) { setMoreDrawerOpen(true) }
                  else { navigate(tab.path === "" ? BASE : `${BASE}/${tab.path}`) }
                }}
                className={`flex-1 flex flex-col items-center justify-center gap-1 h-full relative transition-colors ${
                  active ? "text-[#FF6A00]" : "text-gray-400 dark:text-gray-500"
                }`}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" strokeWidth={active ? 2.2 : 1.8} />
                  {tab.path === "live-orders" && pendingOrders > 0 && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#FF6A00] border-2 border-white dark:border-[#111]" />
                  )}
                </div>
                <span className={`text-[10px] font-semibold leading-none ${active ? "text-[#FF6A00]" : ""}`}>
                  {tab.label}
                </span>
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-[#FF6A00]" />
                )}
              </button>
            )
          })}
        </nav>

        {/* ════════════════════════════════════════════
            Mobile "More" bottom drawer
        ════════════════════════════════════════════ */}
        <AnimatePresence>
          {moreDrawerOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="lg:hidden fixed inset-0 bg-black/40 z-50"
                onClick={() => setMoreDrawerOpen(false)}
              />
              <motion.div
                initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 35, stiffness: 400 }}
                className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-[#111] rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col"
              >
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                  <div className="w-10 h-1 rounded-full bg-gray-200 dark:bg-gray-700" />
                </div>
                <div className="flex items-center justify-between px-5 pb-3 flex-shrink-0">
                  <p className="text-base font-bold text-gray-900 dark:text-white">All sections</p>
                  <button
                    onClick={() => setMoreDrawerOpen(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="overflow-y-auto flex-1 pb-8">
                  <MoreDrawerItems />
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
      </RestaurantRealtimeProvider>
    </RestaurantLayoutContext.Provider>
  )
}
