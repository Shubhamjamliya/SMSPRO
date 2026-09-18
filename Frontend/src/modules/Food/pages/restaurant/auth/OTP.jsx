import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, ShieldCheck, Timer, RefreshCw, X } from "lucide-react"
import loginBg from "@food/assets/loginbanner.png"
import { Button } from "@food/components/ui/button"
import { restaurantAPI } from "@food/api"
import {
  setAuthData as setRestaurantAuthData,
  setRestaurantPendingPhone,
} from "@food/utils/auth"
import { checkOnboardingStatus, isRestaurantOnboardingComplete } from "@food/utils/onboardingUtils"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { loadBusinessSettings, getAppLogo, getRestaurantLoginBanner } from "@common/utils/businessSettings"

export default function RestaurantOTP() {
  const companyName = useCompanyName()
  const navigate = useNavigate()

  const [logoUrl, setLogoUrl] = useState(() => getAppLogo("restaurant"))
  const [bannerUrl, setBannerUrl] = useState(() => {
    const b = getRestaurantLoginBanner()
    return b?.url && b?.active ? b.url : loginBg
  })
  const [otp, setOtp] = useState(["", "", "", ""])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [resendTimer, setResendTimer] = useState(0)
  const [authData, setAuthData] = useState(null)
  const [contactInfo, setContactInfo] = useState("")
  const [focusedIndex, setFocusedIndex] = useState(null)
  const [keyboardInset, setKeyboardInset] = useState(0)
  const [rejectionModalData, setRejectionModalData] = useState({ isOpen: false, reason: "", phone: "" })

  const inputRefs = useRef([])
  const hasSubmittedRef = useRef(false)
  const otpSectionRef = useRef(null)

  /* ── Settings ── */
  useEffect(() => {
    const load = async () => {
      try {
        await loadBusinessSettings()
        const logo = getAppLogo("restaurant")
        if (logo) setLogoUrl(logo)
        const b = getRestaurantLoginBanner()
        setBannerUrl(b?.url && b?.active ? b.url : loginBg)
      } catch {}
    }
    load()
    const handler = async () => { await load() }
    window.addEventListener("businessSettingsUpdated", handler)
    return () => window.removeEventListener("businessSettingsUpdated", handler)
  }, [])

  /* ── Auth data + resend timer ── */
  useEffect(() => {
    const stored = sessionStorage.getItem("restaurantAuthData")
    if (stored) {
      const data = JSON.parse(stored)
      setAuthData(data)
      if (data.method === "email" && data.email) {
        setContactInfo(data.email)
      } else if (data.phone) {
        const match = data.phone?.match(/(\+\d+)\s*(.+)/)
        setContactInfo(match ? `${match[1]} ${match[2].replace(/\D/g, "")}` : data.phone || "")
      }
    } else {
      navigate("/food/restaurant/login")
      return
    }

    setResendTimer(60)
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [navigate])

  /* ── Auto-focus first input ── */
  useEffect(() => {
    if (inputRefs.current[0]) inputRefs.current[0].focus()
  }, [])

  /* ── Keyboard inset (Flutter WebView safe) ── */
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return
    const update = () => {
      const vv = window.visualViewport
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      setKeyboardInset(inset > 80 ? inset : 0)
    }
    update()
    window.visualViewport.addEventListener("resize", update)
    window.visualViewport.addEventListener("scroll", update)
    return () => {
      window.visualViewport.removeEventListener("resize", update)
      window.visualViewport.removeEventListener("scroll", update)
    }
  }, [])

  /* ── Scroll OTP into view when keyboard opens ── */
  useEffect(() => {
    if (focusedIndex == null) return
    const target = inputRefs.current[focusedIndex]
    if (!target) return
    const id = window.setTimeout(() => {
      try {
        otpSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
      } catch {}
    }, 120)
    return () => window.clearTimeout(id)
  }, [focusedIndex, keyboardInset])

  /* ── Input handlers ── */
  const handleChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return
    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    setError("")
    if (value && index < 3) inputRefs.current[index + 1]?.focus()
    if (newOtp.every((d) => d !== "") && newOtp.length === 4) {
      if (!hasSubmittedRef.current) {
        hasSubmittedRef.current = true
        handleVerify(newOtp.join(""))
      }
    }
  }

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      if (otp[index]) {
        const newOtp = [...otp]
        newOtp[index] = ""
        setOtp(newOtp)
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus()
        const newOtp = [...otp]
        newOtp[index - 1] = ""
        setOtp(newOtp)
      }
    }
    if (e.key === "v" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      navigator.clipboard.readText().then((text) => {
        const digits = text.replace(/\D/g, "").slice(0, 4).split("")
        const newOtp = [...otp]
        digits.forEach((d, i) => { if (i < 4) newOtp[i] = d })
        setOtp(newOtp)
        if (digits.length === 4) handleVerify(newOtp.join(""))
        else inputRefs.current[digits.length]?.focus()
      })
    }
  }

  const handlePaste = (index, e) => {
    e.preventDefault()
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4).split("")
    const newOtp = [...otp]
    digits.forEach((d, i) => { if (i < 4) newOtp[i] = d })
    setOtp(newOtp)
    if (digits.length === 4) handleVerify(newOtp.join(""))
    else inputRefs.current[digits.length]?.focus()
  }

  const handleVerify = async (otpValue = null) => {
    const code = otpValue || otp.join("")
    if (hasSubmittedRef.current && !otpValue) return
    if (code.length !== 4) {
      setError("Please enter the complete 4-digit code")
      hasSubmittedRef.current = false
      return
    }

    setIsLoading(true)
    setError("")

    try {
      if (!authData) throw new Error("Session expired. Please try logging in again.")
      const phone = authData.method === "phone" ? authData.phone : null
      const email = authData.method === "email" ? authData.email : null
      const purpose = authData.isSignUp ? "register" : "login"

      const response = await restaurantAPI.verifyOTP(phone, code, purpose, null, email)
      const data = response?.data?.data || response?.data
      const needsRegistration = data?.needsRegistration === true
      const normalizedPhone = data?.phone || phone

      if (needsRegistration) {
        const displayPhone = String(normalizedPhone || phone || "").replace(/\D/g, "").slice(-10)
        setRestaurantPendingPhone(normalizedPhone || phone)
        sessionStorage.removeItem("restaurantAuthData")
        sessionStorage.removeItem("restaurantLoginPhone")
        const resumeStep = Number(data?.resumeStep)
        const onboardingPath = resumeStep >= 2 && resumeStep <= 4
          ? `/food/restaurant/onboarding?step=${resumeStep}`
          : "/food/restaurant/onboarding"
        navigate(onboardingPath, { replace: true, state: { verifiedPhone: displayPhone } })
        return
      }

      if (data?.isRejected === true) {
        setIsLoading(false)
        setRejectionModalData({ isOpen: true, reason: data.rejectionReason || "Please update your details and re-apply.", phone: normalizedPhone })
        return
      }

      const accessToken = data?.accessToken
      const refreshToken = data?.refreshToken ?? null
      const restaurant = data?.user ?? data?.restaurant

      if (accessToken && restaurant) {
        setRestaurantAuthData("restaurant", accessToken, restaurant, refreshToken)
        window.dispatchEvent(new Event("restaurantAuthChanged"))
        sessionStorage.removeItem("restaurantAuthData")
        sessionStorage.removeItem("restaurantLoginPhone")

        setTimeout(async () => {
          if (authData?.isSignUp) {
            navigate("/food/restaurant/onboarding", { replace: true })
          } else {
            try {
              const onboardingComplete = isRestaurantOnboardingComplete(restaurant)
              if (!onboardingComplete) {
                const incompleteStep = await checkOnboardingStatus()
                if (incompleteStep) {
                  navigate(`/food/restaurant/onboarding?step=${incompleteStep}`, { replace: true })
                  return
                }
              }
              navigate("/food/restaurant", { replace: true })
            } catch {
              navigate("/food/restaurant", { replace: true })
            }
          }
        }, 500)
      }
    } catch (err) {
      const message = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Invalid OTP. Please try again."
      if (/pending approval/i.test(message)) {
        const pendingPhone = authData?.phone || authData?.email || contactInfo
        if (pendingPhone) setRestaurantPendingPhone(pendingPhone)
        sessionStorage.removeItem("restaurantAuthData")
        sessionStorage.removeItem("restaurantLoginPhone")
        navigate("/food/restaurant/pending-verification", { replace: true, state: { phone: pendingPhone || "" } })
        return
      }
      setError(message)
      setOtp(["", "", "", ""])
      hasSubmittedRef.current = false
      inputRefs.current[0]?.focus()
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendTimer > 0) return
    setIsLoading(true)
    setError("")
    try {
      if (!authData) throw new Error("Session expired. Please go back and try again.")
      const purpose = authData.isSignUp ? "register" : "login"
      const phone = authData.method === "phone" ? authData.phone : null
      const email = authData.method === "email" ? authData.email : null
      await restaurantAPI.sendOTP(phone, purpose, email)
    } catch (err) {
      setError(err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to resend OTP. Please try again.")
    }
    setResendTimer(60)
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0 }
        return prev - 1
      })
    }, 1000)
    setIsLoading(false)
    setOtp(["", "", "", ""])
    inputRefs.current[0]?.focus()
  }

  const isOtpComplete = otp.every((d) => d !== "")

  if (!authData) return null

  return (
    <div className="min-h-screen w-full flex bg-white dark:bg-[#0a0a0a]">

      {/* ── Desktop left image panel ── */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] relative overflow-hidden flex-shrink-0">
        <img src={bannerUrl} alt="Restaurant partner" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-black/65 via-black/30 to-transparent" />
        <div className="absolute inset-0 flex items-end justify-start p-12 xl:p-16">
          <div className="bg-white/10 border border-white/20 backdrop-blur-xl rounded-3xl p-8 xl:p-10 max-w-sm">
            {logoUrl && (
              <img src={logoUrl} alt={companyName} className="h-10 w-auto object-contain mb-5 rounded-xl" />
            )}
            <h2 className="text-2xl xl:text-3xl font-bold text-white leading-tight mb-3">
              Grow your restaurant with {companyName}
            </h2>
            <p className="text-sm text-white/70 leading-relaxed">
              Manage orders, menus, and earnings — all from one place.
            </p>
          </div>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div
        className="flex-1 flex flex-col min-h-screen lg:min-h-0 lg:h-screen lg:overflow-y-auto"
        style={{ paddingBottom: keyboardInset ? `${keyboardInset}px` : undefined }}
      >
        {/* Form area */}
        <div className="flex-1 flex flex-col lg:items-center lg:justify-center px-5 sm:px-8 lg:px-12 xl:px-16 pt-16 pb-8 lg:py-0">
          {/* Back + heading */}
          <div className="mb-10 w-full max-w-sm">
            <button
              onClick={() => navigate("/food/restaurant/login")}
              className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-[#FF6A00] transition-colors mb-8 group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" strokeWidth={2} />
              Back to login
            </button>
            {logoUrl ? (
              <img src={logoUrl} alt={companyName} className="h-12 w-auto object-contain mb-6 rounded-xl" />
            ) : (
              <div className="w-12 h-12 bg-[#FF6A00] rounded-2xl flex items-center justify-center mb-6">
                <ShieldCheck className="w-6 h-6 text-white" strokeWidth={2} />
              </div>
            )}
            <h1 className="text-2xl xl:text-3xl font-bold text-gray-900 dark:text-white leading-tight mb-2">
              Verify OTP
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Sent to <span className="text-gray-900 dark:text-white font-semibold">{contactInfo}</span>
            </p>
          </div>

          <div ref={otpSectionRef} className="w-full max-w-sm space-y-6">
            {/* OTP boxes */}
            <div className="flex justify-center gap-3 sm:gap-4">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => (inputRefs.current[index] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={(e) => handlePaste(index, e)}
                  onFocus={() => setFocusedIndex(index)}
                  onBlur={() => setFocusedIndex(null)}
                  disabled={isLoading}
                  className={`w-[68px] h-[72px] sm:w-[76px] sm:h-[80px] rounded-2xl text-center text-2xl font-bold border-2 outline-none transition-all duration-150 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white caret-[#FF6A00] ${
                    error
                      ? "border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-950/20"
                      : focusedIndex === index
                      ? "border-[#FF6A00] ring-4 ring-[#FF6A00]/10 bg-white dark:bg-gray-800"
                      : digit
                      ? "border-[#FF6A00]/40 dark:border-[#FF6A00]/30"
                      : "border-gray-200 dark:border-gray-800"
                  }`}
                />
              ))}
            </div>

            {error && (
              <p className="text-xs font-medium text-red-500 dark:text-red-400 text-center flex items-center justify-center gap-1">
                <span>⚠</span> {error}
              </p>
            )}

            {/* Verify button */}
            <Button
              onClick={() => handleVerify()}
              disabled={isLoading || !isOtpComplete}
              className={`w-full rounded-2xl font-semibold text-sm tracking-wide transition-all duration-200 border-0 flex items-center justify-center gap-2 ${
                isOtpComplete && !isLoading
                  ? "bg-[#FF6A00] hover:bg-[#e05e00] text-white shadow-lg shadow-[#FF6A00]/25 active:scale-[0.98]"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed"
              }`}
              style={{ height: 52 }}
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Verifying…
                </>
              ) : (
                "Verify & Continue"
              )}
            </Button>

            {/* Resend */}
            <div className="flex justify-center">
              {resendTimer > 0 ? (
                <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 px-4 py-2 rounded-full">
                  <Timer className="w-3.5 h-3.5 text-[#FF6A00]" strokeWidth={2} />
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    Resend in{" "}
                    <span className="text-[#FF6A00] font-bold tabular-nums">{resendTimer}s</span>
                  </span>
                </div>
              ) : (
                <button
                  onClick={handleResend}
                  disabled={isLoading}
                  className="flex items-center gap-2 text-[#FF6A00] font-semibold text-sm bg-transparent border-0 p-0 cursor-pointer hover:underline"
                >
                  <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} />
                  Resend code
                </button>
              )}
            </div>
          </div>
        </div>

        <p className={`text-center text-[11px] text-gray-300 dark:text-gray-700 py-5 tracking-widest uppercase ${keyboardInset ? "hidden" : ""}`}>
          © {new Date().getFullYear()} {companyName} Partner
        </p>
      </div>

      {/* ── Rejection modal ── */}
      {rejectionModalData.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white dark:bg-[#111] rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-gray-100 dark:border-gray-800">
            {/* Header */}
            <div className="bg-gradient-to-br from-red-500 to-rose-600 px-6 py-8 text-center text-white relative">
              <div className="w-14 h-14 bg-white/20 rounded-2xl mx-auto flex items-center justify-center backdrop-blur-sm mb-3">
                <X className="w-7 h-7 text-white" strokeWidth={2.5} />
              </div>
              <h3 className="text-lg font-bold tracking-tight">Application Rejected</h3>
              <p className="text-white/75 text-xs mt-1">Our review team has rejected your onboarding request.</p>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Reason</p>
                <div className="bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-4 text-gray-700 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                  {rejectionModalData.reason || "No reason provided"}
                </div>
              </div>
              <div className="bg-sky-50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/30 rounded-2xl p-3 text-xs text-sky-800 dark:text-sky-300 leading-relaxed">
                <strong>Edit &amp; Resubmit</strong> keeps your previous details so you can fix only what is needed.
                Choose <strong>Create New Restaurant</strong> only if you want a brand-new application with a different phone/email.
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 pb-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  // Edit & Resubmit: keep phone, load previous data, update SAME record on submit.
                  localStorage.removeItem("restaurant_onboarding_data")
                  sessionStorage.removeItem("restaurantReonboard")
                  sessionStorage.removeItem("restaurantCreateNew")
                  sessionStorage.setItem("restaurantResubmit", "true")
                  if (rejectionModalData.phone) {
                    localStorage.setItem("restaurant_pendingPhone", rejectionModalData.phone)
                  }
                  setRejectionModalData({ isOpen: false, reason: "", phone: "" })
                  navigate("/food/restaurant/onboarding", {
                    replace: true,
                    state: {
                      verifiedPhone: rejectionModalData.phone || "",
                      isResubmit: true,
                      rejectionReason: rejectionModalData.reason || "",
                    },
                  })
                }}
                className="w-full h-12 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-semibold text-sm active:scale-[0.98] transition-all"
              >
                Edit &amp; Resubmit
              </button>
              <button
                type="button"
                onClick={() => {
                  // Create New: leave previous rejected application unchanged; force new identity.
                  localStorage.removeItem("restaurant_onboarding_data")
                  localStorage.removeItem("restaurant_pendingPhone")
                  sessionStorage.removeItem("restaurantResubmit")
                  sessionStorage.removeItem("restaurantReonboard")
                  sessionStorage.setItem("restaurantCreateNew", "true")
                  setRejectionModalData({ isOpen: false, reason: "", phone: "" })
                  navigate("/food/restaurant/auth/signup", { replace: true })
                }}
                className="w-full h-12 border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151515] hover:bg-slate-50 dark:hover:bg-white/5 text-slate-800 dark:text-slate-100 rounded-2xl font-semibold text-sm active:scale-[0.98] transition-all"
              >
                Create New Restaurant
              </button>
              <button
                type="button"
                onClick={() => setRejectionModalData({ isOpen: false, reason: "", phone: "" })}
                className="w-full h-11 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-2xl font-medium text-sm transition-all"
              >
                Cancel / Go Back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
