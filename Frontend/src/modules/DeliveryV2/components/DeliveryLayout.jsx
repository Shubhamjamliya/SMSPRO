import { useNavigate, useLocation } from "react-router-dom"
import { useEffect, useState } from "react"
import { User, Loader2 } from "lucide-react"
import { loadBusinessSettings, setAppType } from "@common/utils/businessSettings"
import BottomNavigation from "./BottomNavigation"
import { getUnreadDeliveryNotificationCount } from "@food/utils/deliveryNotifications"
import { deliveryAPI } from "@food/api"
import { clearModuleAuth } from "@food/utils/auth"
import { clearDeliveryOnboardingOnlyGate } from "../utils/driverModuleAccess"

export default function DeliveryLayout({
  children,
  showGig = false,
  showPocket = false,
  onHomeClick,
  onGigClick
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const [requestBadgeCount, setRequestBadgeCount] = useState(() =>
    getUnreadDeliveryNotificationCount()
  )
  const [approvalStatus, setApprovalStatus] = useState("loading")

  useEffect(() => {
    setAppType("delivery")
    loadBusinessSettings()

    let cancelled = false
    deliveryAPI
      .getMe()
      .then((res) => {
        if (cancelled) return
        const user = res?.data?.data?.user ?? res?.data?.user
        const status = user?.status ?? "approved"
        setApprovalStatus(status)
        if (user && typeof localStorage !== "undefined") {
          try {
            localStorage.setItem("delivery_user", JSON.stringify(user))
          } catch (_) {}
        }
      })
      .catch(() => {
        if (!cancelled) setApprovalStatus("pending")
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    setRequestBadgeCount(getUnreadDeliveryNotificationCount())
    const handleNotificationUpdate = () => {
      setRequestBadgeCount(getUnreadDeliveryNotificationCount())
    }
    window.addEventListener("deliveryNotificationsUpdated", handleNotificationUpdate)
    window.addEventListener("storage", handleNotificationUpdate)
    return () => {
      window.removeEventListener("deliveryNotificationsUpdated", handleNotificationUpdate)
      window.removeEventListener("storage", handleNotificationUpdate)
    }
  }, [location.pathname])

  const showBottomNav = [
    "/food/delivery",
    "/food/delivery/feed",
    "/food/delivery/pocket",
    "/food/delivery/history",
    "/food/delivery/profile",
  ].includes(location.pathname)

  if (approvalStatus === "loading") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3">
        <Loader2 className="w-8 h-8 text-primary-orange animate-spin" />
        <p className="text-sm text-slate-500">Loading your account…</p>
      </main>
    )
  }

  if (approvalStatus !== "approved") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full text-center space-y-4 rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
          <div className="w-14 h-14 rounded-2xl bg-orange-50 text-primary-orange flex items-center justify-center mx-auto">
            <User className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Pending Admin Approval</h1>
          <p className="text-slate-600 text-sm leading-relaxed">
            Your profile has been submitted. You will get full access once admin approves your account.
          </p>
          <button
            type="button"
            onClick={() => {
              clearModuleAuth("delivery")
              clearDeliveryOnboardingOnlyGate()
              sessionStorage.removeItem("deliveryPendingPhone")
              sessionStorage.removeItem("deliveryAuthData")
              navigate("/food/delivery/login", { replace: true })
            }}
            className="w-full h-11 rounded-xl bg-primary-orange text-white text-sm font-semibold hover:bg-primary-orange/90"
          >
            Back to login
          </button>
        </div>
      </main>
    )
  }

  return (
    <>
      <main>{children}</main>
      {showBottomNav && (
        <BottomNavigation
          showGig={showGig}
          showPocket={showPocket}
          onHomeClick={onHomeClick}
          onGigClick={onGigClick}
          requestBadgeCount={requestBadgeCount}
        />
      )}
    </>
  )
}
