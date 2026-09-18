import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronRight, ShieldCheck } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { restaurantAPI } from "@food/api"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { loadBusinessSettings, getAppLogo, getRestaurantLoginBanner } from "@common/utils/businessSettings"
import loginBg from "@food/assets/loginbanner.png"

const DEFAULT_COUNTRY_CODE = "+91"

export default function RestaurantLogin() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const phoneInputRef = useRef(null)

  const [logoUrl, setLogoUrl] = useState(() => getAppLogo("restaurant"))
  const [bannerUrl, setBannerUrl] = useState(() => {
    const b = getRestaurantLoginBanner()
    return b?.url && b?.active ? b.url : loginBg
  })
  const [formData, setFormData] = useState(() => {
    const saved = sessionStorage.getItem("restaurantLoginPhone")
    return { phone: saved || "", countryCode: DEFAULT_COUNTRY_CODE }
  })
  const [error, setError] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [keyboardInset, setKeyboardInset] = useState(0)

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

  const validatePhone = (phone) => {
    if (!phone?.trim()) return "Phone number is required"
    const d = phone.replace(/\D/g, "")
    if (d.length !== 10) return "Enter a valid 10-digit mobile number"
    if (!["6", "7", "8", "9"].includes(d[0])) return "Invalid Indian mobile number"
    return ""
  }

  const handlePhoneChange = (e) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 10)
    setFormData((p) => ({ ...p, phone: value }))
    sessionStorage.setItem("restaurantLoginPhone", value)
    if (error) setError(validatePhone(value))
  }

  const handleSendOTP = async () => {
    const phoneError = validatePhone(formData.phone)
    setError(phoneError)
    if (phoneError) return

    const fullPhone = `${formData.countryCode} ${formData.phone}`.trim()
    try {
      setIsSending(true)
      await restaurantAPI.sendOTP(fullPhone, "login")
      sessionStorage.setItem("restaurantAuthData", JSON.stringify({ method: "phone", phone: fullPhone, isSignUp: false, module: "restaurant" }))
      navigate("/food/restaurant/otp")
    } catch (err) {
      setError(err?.response?.data?.message || err?.response?.data?.error || "Failed to send OTP. Please try again.")
    } finally {
      setIsSending(false)
    }
  }

  const isValid = !validatePhone(formData.phone)

  return (
    <div className="min-h-screen w-full flex bg-white dark:bg-[#0a0a0a]">
      {/* ── Desktop left image panel ── */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] relative overflow-hidden flex-shrink-0">
        <img
          src={bannerUrl}
          alt="Restaurant partner"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/65 via-black/30 to-transparent" />

        {/* Glass card */}
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
          {/* Heading */}
          <div className="mb-10 w-full max-w-sm">
            {logoUrl ? (
              <img src={logoUrl} alt={companyName} className="h-12 w-auto object-contain mb-6 rounded-xl" />
            ) : (
              <div className="w-12 h-12 bg-[#FF6A00] rounded-2xl flex items-center justify-center mb-6">
                <ShieldCheck className="w-6 h-6 text-white" strokeWidth={2} />
              </div>
            )}
            <h1 className="text-2xl xl:text-3xl font-bold text-gray-900 dark:text-white leading-tight mb-2">
              Welcome back
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Sign in to your partner dashboard
            </p>
          </div>

          <div className="w-full max-w-sm space-y-5">
            {/* Phone input */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                Mobile number
              </label>
              <div className={`flex items-center gap-3 h-14 bg-gray-50 dark:bg-gray-900 border rounded-2xl px-4 transition-all duration-200 ${
                error
                  ? "border-red-400 dark:border-red-600 ring-2 ring-red-100 dark:ring-red-900/30"
                  : "border-gray-200 dark:border-gray-800 focus-within:border-[#FF6A00] focus-within:ring-2 focus-within:ring-[#FF6A00]/10"
              }`}>
                <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 flex-shrink-0">
                  {DEFAULT_COUNTRY_CODE}
                </span>
                <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                <input
                  ref={phoneInputRef}
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  autoComplete="tel-national"
                  enterKeyHint="done"
                  placeholder="Enter 10-digit number"
                  value={formData.phone}
                  onChange={handlePhoneChange}
                  onKeyDown={(e) => { if (e.key === "Enter" && isValid) handleSendOTP() }}
                  className="flex-1 bg-transparent border-0 outline-none ring-0 text-base font-semibold text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 caret-[#FF6A00] min-w-0"
                />
              </div>
              {error && (
                <p className="text-xs font-medium text-red-500 dark:text-red-400 flex items-center gap-1 pl-1">
                  <span>⚠</span> {error}
                </p>
              )}
            </div>

            {/* CTA */}
            <Button
              onClick={handleSendOTP}
              disabled={!isValid || isSending}
              className={`w-full h-13 rounded-2xl font-semibold text-sm tracking-wide transition-all duration-200 border-0 flex items-center justify-center gap-2 ${
                isValid && !isSending
                  ? "bg-[#FF6A00] hover:bg-[#e05e00] text-white shadow-lg shadow-[#FF6A00]/25 active:scale-[0.98]"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed"
              }`}
              style={{ height: 52 }}
            >
              {isSending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Sending OTP…
                </>
              ) : (
                <>
                  Continue
                  <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
                </>
              )}
            </Button>

            {/* Terms */}
            <p className={`text-center text-xs text-gray-400 dark:text-gray-500 leading-relaxed ${keyboardInset ? "hidden" : ""}`}>
              By continuing you agree to our{" "}
              <button
                type="button"
                onClick={() => navigate("/food/restaurant/terms")}
                className="text-[#FF6A00] font-semibold bg-transparent border-0 p-0 cursor-pointer hover:underline"
              >
                Terms &amp; Conditions
              </button>
              {" "}and{" "}
              <button
                type="button"
                onClick={() => navigate("/food/restaurant/privacy")}
                className="text-[#FF6A00] font-semibold bg-transparent border-0 p-0 cursor-pointer hover:underline"
              >
                Privacy Policy
              </button>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className={`text-center text-[11px] text-gray-300 dark:text-gray-700 py-5 tracking-widest uppercase ${keyboardInset ? "hidden" : ""}`}>
          © {new Date().getFullYear()} {companyName} Partner
        </p>
      </div>
    </div>
  )
}
