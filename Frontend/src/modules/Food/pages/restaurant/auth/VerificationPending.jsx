import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { CheckCircle2, Clock, Mail, Phone, ShieldCheck, Store, ChevronRight } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { useCompanyName } from "@food/hooks/useCompanyName"
import apiClient, { restaurantAPI } from "@food/api"
import {
  clearRestaurantPendingPhone,
  clearRestaurantSessionClaimToken,
  getModuleToken,
  getRestaurantPendingPhone,
  getRestaurantSessionClaimToken,
  setAuthData,
} from "@food/utils/auth"

const steps = [
  {
    icon: CheckCircle2,
    label: "Application submitted",
    desc: "Your details and documents have been received.",
    done: true,
  },
  {
    icon: ShieldCheck,
    label: "Document verification",
    desc: "Our team is reviewing your PAN, FSSAI & bank details.",
    done: false,
    active: true,
  },
  {
    icon: Store,
    label: "Restaurant activation",
    desc: "Your dashboard goes live after approval.",
    done: false,
  },
]

const POLL_INTERVAL_MS = 8000

export default function VerificationPending() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const location = useLocation()
  const [checkingStatus, setCheckingStatus] = useState(true)
  const [activating, setActivating] = useState(false)
  const [dotCount, setDotCount] = useState(1)
  const activatingRef = useRef(false)

  const pendingPhone = useMemo(() => {
    return location.state?.phone || getRestaurantPendingPhone() || ""
  }, [location.state?.phone])

  useEffect(() => {
    if (!checkingStatus) return
    const id = setInterval(() => setDotCount((d) => (d % 3) + 1), 600)
    return () => clearInterval(id)
  }, [checkingStatus])

  useEffect(() => {
    let cancelled = false

    const enterDashboard = (restaurant, accessToken, refreshToken) => {
      if (accessToken && restaurant) {
        setAuthData("restaurant", accessToken, restaurant, refreshToken || null)
        try {
          window.dispatchEvent(new Event("restaurantAuthChanged"))
        } catch { }
      } else if (restaurant) {
        // Refresh stored profile status when a pending session token already exists.
        try {
          const existing = localStorage.getItem("restaurant_user")
          const parsed = existing ? JSON.parse(existing) : {}
          localStorage.setItem(
            "restaurant_user",
            JSON.stringify({ ...parsed, ...restaurant, status: "approved" }),
          )
          window.dispatchEvent(new Event("restaurantAuthChanged"))
        } catch { }
      }

      clearRestaurantPendingPhone()
      clearRestaurantSessionClaimToken()
      navigate("/food/restaurant", { replace: true })
    }

    const activateApprovedSession = async (restaurantHint = null) => {
      if (activatingRef.current) return
      activatingRef.current = true
      if (!cancelled) setActivating(true)

      try {
        const token = getModuleToken("restaurant")
        if (token) {
          // Pending JWT is already valid after approval — refresh profile and open dashboard.
          let restaurant = restaurantHint
          try {
            const response = await restaurantAPI.getCurrentRestaurant()
            restaurant =
              response?.data?.data?.restaurant ||
              response?.data?.restaurant ||
              restaurantHint
          } catch { }
          if (!cancelled) {
            enterDashboard(restaurant || { status: "approved" }, token, localStorage.getItem("restaurant_refreshToken"))
          }
          return
        }

        const phone = pendingPhone || getRestaurantPendingPhone()
        if (!phone) {
          // No phone / claim available — stay on page; user can use Back to login.
          return
        }

        const response = await restaurantAPI.activateSessionAfterApproval({
          phone,
          sessionClaimToken: getRestaurantSessionClaimToken(),
        })
        const payload = response?.data?.data || response?.data || {}
        const restaurant =
          payload.restaurant ||
          payload.user ||
          restaurantHint ||
          { status: "approved" }
        const accessToken = payload.accessToken
        const refreshToken = payload.refreshToken || null

        if (!accessToken) {
          throw new Error("Failed to activate restaurant session")
        }

        if (!cancelled) {
          enterDashboard(restaurant, accessToken, refreshToken)
        }
      } catch (_) {
        // Keep waiting UI visible; next poll retries.
      } finally {
        activatingRef.current = false
        if (!cancelled) {
          setActivating(false)
          setCheckingStatus(false)
        }
      }
    }

    const checkApprovalStatus = async () => {
      const token = getModuleToken("restaurant")
      const pendingPhoneStr = pendingPhone || getRestaurantPendingPhone() || ""

      if (!token && !pendingPhoneStr) {
        if (!cancelled) setCheckingStatus(false)
        return
      }

      if (!cancelled) setCheckingStatus(true)

      try {
        let restaurant = null
        if (token) {
          const response = await restaurantAPI.getCurrentRestaurant()
          restaurant =
            response?.data?.data?.restaurant ||
            response?.data?.restaurant ||
            response?.data?.data?.user ||
            response?.data?.user
        } else {
          const response = await apiClient.get(
            `/food/restaurant/onboarding/draft?phone=${encodeURIComponent(pendingPhoneStr)}`,
          )
          restaurant =
            response?.data?.data?.restaurant ||
            response?.data?.restaurant ||
            response?.data?.data?.user ||
            response?.data?.user
        }

        if (cancelled) return

        if (String(restaurant?.status || "").toLowerCase() === "approved") {
          await activateApprovedSession(restaurant)
          return
        }

        if (String(restaurant?.status || "").toLowerCase() === "rejected") {
          clearRestaurantPendingPhone()
          navigate("/food/restaurant/login", {
            replace: true,
            state: { rejectedWhileWaiting: true },
          })
          return
        }
      } catch (_) {
        // Keep pending screen visible on error
      } finally {
        if (!cancelled) setCheckingStatus(false)
      }
    }

    checkApprovalStatus()
    const pollId = setInterval(checkApprovalStatus, POLL_INTERVAL_MS)

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") checkApprovalStatus()
    }

    window.addEventListener("focus", handleVisibilityOrFocus)
    document.addEventListener("visibilitychange", handleVisibilityOrFocus)

    return () => {
      cancelled = true
      clearInterval(pollId)
      window.removeEventListener("focus", handleVisibilityOrFocus)
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus)
    }
  }, [navigate, pendingPhone])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400 text-xs font-semibold px-4 py-1.5 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
            Under review
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white leading-tight mb-3">
            Your application is<br />being verified
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-sm mx-auto">
            {companyName} received your onboarding details. Our team will verify your documents and activate your dashboard once approved.
          </p>
          {(checkingStatus || activating) && (
            <p className="mt-3 text-xs font-medium text-gray-400 dark:text-gray-500">
              {activating
                ? `Opening your dashboard${".".repeat(dotCount)}`
                : `Checking approval status${".".repeat(dotCount)}`}
            </p>
          )}
        </div>

        <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 p-5 mb-4">
          <div className="space-y-0">
            {steps.map((s, i) => {
              const Icon = s.icon
              const isLast = i === steps.length - 1
              return (
                <div key={i} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        s.done
                          ? "bg-green-100 dark:bg-green-900/30"
                          : s.active
                          ? "bg-amber-100 dark:bg-amber-900/30"
                          : "bg-gray-100 dark:bg-gray-800"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 ${
                          s.done
                            ? "text-green-600 dark:text-green-400"
                            : s.active
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-gray-400 dark:text-gray-500"
                        }`}
                        strokeWidth={2}
                      />
                    </div>
                    {!isLast && (
                      <div
                        className={`w-px flex-1 my-1 ${
                          s.done ? "bg-green-200 dark:bg-green-800/50" : "bg-gray-200 dark:bg-gray-700"
                        }`}
                        style={{ minHeight: 24 }}
                      />
                    )}
                  </div>

                  <div className={`pb-5 ${isLast ? "pb-0" : ""}`}>
                    <p
                      className={`text-sm font-semibold leading-tight ${
                        s.done
                          ? "text-green-700 dark:text-green-400"
                          : s.active
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-gray-400 dark:text-gray-500"
                      }`}
                    >
                      {s.label}
                      {s.active && (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-widest bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">
                          In progress
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">
                      {s.desc}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 p-4 mb-4 space-y-3">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-widest">
            You will be notified via
          </p>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center flex-shrink-0">
              <Phone className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-400 dark:text-gray-500">Registered phone</p>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                {pendingPhone ? `+91 ${pendingPhone}` : "—"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center flex-shrink-0">
              <Mail className="h-3.5 w-3.5 text-[#FF6A00]" strokeWidth={2} />
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Email & in-app notification</p>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Once approval is complete</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 bg-gray-100 dark:bg-gray-800/60 rounded-xl px-4 py-3 mb-6">
          <Clock className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0" strokeWidth={1.5} />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Keep this page open — when approved, you will be taken to the dashboard automatically (no re-login needed).
          </p>
        </div>

        <Button
          className="w-full h-12 rounded-xl bg-[#FF6A00] hover:bg-[#e05e00] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#FF6A00]/20 border-0"
          onClick={() => {
            navigate("/food/restaurant/login", { replace: true })
          }}
        >
          Back to login
          <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
        </Button>

        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-4">
          Need help?{" "}
          <a
            href="mailto:support@smspro.in"
            className="text-[#FF6A00] font-medium hover:underline"
          >
            Contact support
          </a>
        </p>
      </div>
    </div>
  )
}
