import { useNavigate, useLocation } from "react-router-dom"
import { useEffect, useState } from "react"
import { User } from "lucide-react"
import { deliveryAPI } from "@food/api"
import { cn } from "@food/utils/utils"

import {
  HomeIcon as HomeOutline,
  WalletIcon as WalletOutline,
  ClockIcon as ClockOutline,
} from "@heroicons/react/24/outline"

import {
  HomeIcon as HomeSolid,
  WalletIcon as WalletSolid,
  ClockIcon as ClockSolid,
} from "@heroicons/react/24/solid"

const TABS = [
  { path: "/food/delivery", label: "Feed", Outline: HomeOutline, Solid: HomeSolid, exact: true },
  { path: "/food/delivery/pocket", label: "Pocket", Outline: WalletOutline, Solid: WalletSolid },
  { path: "/food/delivery/history", label: "History", Outline: ClockOutline, Solid: ClockSolid },
  { path: "/food/delivery/profile", label: "Profile", Outline: null, Solid: null },
]

export default function BottomNavigation() {
  const navigate = useNavigate()
  const location = useLocation()
  const [profileImage, setProfileImage] = useState(null)
  const [imageError, setImageError] = useState(false)

  const isActive = (path, exact = false) => {
    if (exact) return location.pathname === path || location.pathname === `${path}/feed`
    return location.pathname.startsWith(path)
  }

  useEffect(() => {
    const fetchProfileImage = async () => {
      try {
        const response = await deliveryAPI.getProfile()
        if (response?.data?.success && response?.data?.data?.profile) {
          const profile = response.data.data.profile
          const imageUrl = profile.profileImage?.url || profile.documents?.photo
          if (imageUrl) setProfileImage(imageUrl)
        }
      } catch (error) {
        if (
          error.code !== "ECONNABORTED" &&
          error.code !== "ERR_NETWORK" &&
          error.message !== "Network Error" &&
          !error.message?.includes("timeout")
        ) {
          /* ignore */
        }
      }
    }

    fetchProfileImage()
    const handleProfileRefresh = () => fetchProfileImage()
    window.addEventListener("deliveryProfileRefresh", handleProfileRefresh)
    return () => window.removeEventListener("deliveryProfileRefresh", handleProfileRefresh)
  }, [])

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-slate-200 shadow-lg lg:max-w-[430px] lg:left-1/2 lg:-translate-x-1/2">
      <div className="flex items-center justify-around py-2 px-2 safe-area-pb">
        {TABS.map((tab) => {
          const active = isActive(tab.path, tab.exact)
          const isProfile = tab.path === "/food/delivery/profile"

          return (
            <button
              key={tab.path}
              type="button"
              onClick={() => navigate(tab.path)}
              className="flex flex-col items-center gap-0.5 p-2 min-w-[64px]"
            >
              {isProfile ? (
                profileImage && !imageError ? (
                  <img
                    src={profileImage}
                    alt="Profile"
                    className={cn(
                      "w-7 h-7 rounded-full border-2 object-cover",
                      active ? "border-primary-orange" : "border-slate-300"
                    )}
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <div
                    className={cn(
                      "w-7 h-7 rounded-full border-2 flex items-center justify-center",
                      active ? "border-primary-orange bg-orange-50" : "border-slate-300 bg-slate-100"
                    )}
                  >
                    <User className={cn("w-4 h-4", active ? "text-primary-orange" : "text-slate-500")} />
                  </div>
                )
              ) : (
                (() => {
                  const Icon = active ? tab.Solid : tab.Outline
                  return <Icon className={cn("w-6 h-6", active ? "text-primary-orange" : "text-slate-400")} />
                })()
              )}
              <span
                className={cn(
                  "text-[10px] font-medium",
                  active ? "text-primary-orange" : "text-slate-500"
                )}
              >
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
