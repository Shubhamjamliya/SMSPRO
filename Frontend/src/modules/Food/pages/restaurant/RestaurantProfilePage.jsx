import { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import {
  User, Edit, LogOut, ShieldCheck, ChevronRight,
  Settings, HelpCircle, FileText, Lock, Globe, Phone, Mail
} from "lucide-react"
import { motion } from "framer-motion"
import { restaurantAPI } from "@food/api"
import { clearModuleAuth, getCurrentUser } from "@food/utils/auth"
import { firebaseAuth, ensureFirebaseInitialized } from "@food/firebase"

const debugError = (...args) => {}

export default function RestaurantProfilePage() {
  const navigate = useNavigate()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [restaurantData, setRestaurantData] = useState(null)
  const [loadingRestaurant, setLoadingRestaurant] = useState(true)

  useEffect(() => {
    const fetchRestaurantData = async () => {
      try {
        setLoadingRestaurant(true)
        const response = await restaurantAPI.getCurrentRestaurant()
        const data = response?.data?.data?.restaurant || response?.data?.restaurant
        if (data) setRestaurantData(data)
      } catch (error) {
        if (error.code !== "ERR_NETWORK" && error.code !== "ECONNABORTED" && !error.message?.includes("timeout")) {
          debugError("Error fetching restaurant data:", error)
        }
      } finally {
        setLoadingRestaurant(false)
      }
    }
    fetchRestaurantData()
  }, [])

  const userData = useMemo(() => {
    const sessionUser = getCurrentUser("restaurant")
    if (sessionUser && sessionUser.name && sessionUser.role) {
      return {
        name: sessionUser.name,
        phone: sessionUser.phone || restaurantData?.ownerPhone || restaurantData?.phone || "",
        email: sessionUser.email || restaurantData?.ownerEmail || restaurantData?.email || "",
        role: sessionUser.role.toUpperCase(),
        profileImage: sessionUser.profileImage || restaurantData?.profileImage,
      }
    }
    if (restaurantData) {
      return {
        name: restaurantData.ownerName || restaurantData.name || "Restaurant Owner",
        phone: restaurantData.ownerPhone || restaurantData.phone || "",
        email: restaurantData.ownerEmail || restaurantData.email || "",
        role: "OWNER",
        profileImage: restaurantData.profileImage,
      }
    }
    return { name: loadingRestaurant ? "Loading…" : "Restaurant Owner", phone: "", email: "", role: "OWNER" }
  }, [restaurantData, loadingRestaurant])

  const handleLogout = async () => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try {
      try { await restaurantAPI.logout() } catch {}
      try {
        const { signOut } = await import("firebase/auth")
        ensureFirebaseInitialized({ enableAuth: true, enableRealtimeDb: false })
        if (firebaseAuth.currentUser) await signOut(firebaseAuth)
      } catch {}
      clearModuleAuth("restaurant")
      localStorage.removeItem("restaurant_onboarding")
      window.dispatchEvent(new Event("restaurantAuthChanged"))
      navigate("/food/restaurant/login", { replace: true })
    } catch {
      clearModuleAuth("restaurant")
      navigate("/food/restaurant/login", { replace: true })
    } finally {
      setIsLoggingOut(false)
    }
  }

  const menuGroups = [
    {
      title: "Account",
      items: [
        { icon: Settings, label: "Settings", route: "/food/restaurant/onboarding?step=1" },
        { icon: Globe, label: "Language", value: "English", route: null },
      ]
    },
    {
      title: "Help & Legal",
      items: [
        { icon: HelpCircle, label: "Help Centre", route: "/food/restaurant/help-centre/support" },
        { icon: FileText, label: "Terms & Conditions", route: "/food/restaurant/terms" },
        { icon: Lock, label: "Privacy Policy", route: "#" },
      ]
    }
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a]">
      {/* Header */}
      <div className="bg-white dark:bg-[#111] border-b border-gray-100 dark:border-gray-800 px-4 py-4">
        <h1 className="text-base font-bold text-gray-900 dark:text-white">My Profile</h1>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Account information and settings</p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">
        {/* Profile card */}
        <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 overflow-hidden flex items-center justify-center">
                {userData.profileImage?.url ? (
                  <img src={userData.profileImage.url} alt={userData.name} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-8 h-8 text-gray-300 dark:text-gray-600" strokeWidth={1.5} />
                )}
              </div>
              <button
                onClick={() => navigate("/food/restaurant/onboarding?step=1")}
                className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#FF6A00] rounded-full flex items-center justify-center shadow-sm"
              >
                <Edit className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900 dark:text-white truncate">{userData.name}</h2>
              <div className="flex items-center gap-1.5 mt-1 mb-2">
                <ShieldCheck className="w-3.5 h-3.5 text-[#FF6A00]" strokeWidth={2} />
                <span className="text-[11px] font-bold text-[#FF6A00] uppercase tracking-wider">{userData.role}</span>
              </div>
              <div className="space-y-0.5">
                {userData.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">{userData.phone}</span>
                  </div>
                )}
                {userData.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{userData.email}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Menu groups */}
        {menuGroups.map((group) => (
          <div key={group.title} className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-600 uppercase tracking-widest px-4 pt-3 pb-2">{group.title}</p>
            {group.items.map((item, idx, arr) => (
              <button
                key={idx}
                onClick={() => item.route && navigate(item.route)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors text-left ${
                  idx < arr.length - 1 ? "border-b border-gray-50 dark:border-gray-800/60" : ""
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                  <item.icon className="w-4 h-4 text-gray-600 dark:text-gray-400" strokeWidth={2} />
                </div>
                <span className="flex-1 text-sm font-semibold text-gray-800 dark:text-gray-200">{item.label}</span>
                {item.value && <span className="text-xs text-gray-400 dark:text-gray-500">{item.value}</span>}
                <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
              </button>
            ))}
          </div>
        ))}

        {/* Logout */}
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="w-full flex items-center justify-center gap-2.5 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 font-bold py-4 rounded-2xl border border-red-100 dark:border-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
        >
          <LogOut className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} strokeWidth={2} />
          {isLoggingOut ? "Logging out…" : "Logout"}
        </button>

        <p className="text-center text-xs text-gray-300 dark:text-gray-700 pb-4">App Version 1.0.0</p>
      </div>
    </motion.div>
  )
}
