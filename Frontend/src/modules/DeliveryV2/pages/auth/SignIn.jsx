import { useState, useEffect, useRef } from "react"
import { useNavigate, Link, useLocation } from "react-router-dom"
import { ChevronRight } from "lucide-react"
import { deliveryAPI } from "@food/api"
import { clearModuleAuth } from "@food/utils/auth"
import { useCompanyName } from "@food/hooks/useCompanyName"
import {
  loadBusinessSettings,
  getCachedSettings,
  getAppFavicon,
  updateBrowserFavicon,
  getAppLogo,
} from "@common/utils/businessSettings"
import {
  DeliveryPage,
  DeliveryAuthHeader,
  DeliveryPhoneInput,
  DeliveryPrimaryButton,
} from "../../components/ui/deliveryUi"
import { resetOnboardingClientStateForPhone } from "../../utils/signupSubmit"

export default function DeliverySignIn() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const location = useLocation()
  const phoneInputRef = useRef(null)
  const searchParams = new URLSearchParams(location.search)
  const referralCode = searchParams.get("ref") || ""

  const [formData, setFormData] = useState({
    phone: "",
    countryCode: "+91",
  })
  const [logoUrl, setLogoUrl] = useState(() => getAppLogo("delivery"))
  const [error, setError] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [keyboardInset, setKeyboardInset] = useState(0)

  useEffect(() => {
    const stored = sessionStorage.getItem("deliveryAuthData")
    if (stored) {
      try {
        const data = JSON.parse(stored)
        if (data.phone) {
          const phoneDigits = data.phone.replace("+91", "").trim()
          setFormData((prev) => ({ ...prev, phone: phoneDigits }))
        }
      } catch {
        /* ignore */
      }
    }
  }, [])

  useEffect(() => {
    const applyDeliveryBranding = () => {
      const deliveryFavicon = getAppFavicon("delivery")
      if (deliveryFavicon) updateBrowserFavicon(deliveryFavicon)
      const deliveryLogo = getAppLogo("delivery")
      if (deliveryLogo) setLogoUrl(deliveryLogo)
    }

    if (getCachedSettings()) {
      applyDeliveryBranding()
    } else {
      loadBusinessSettings().then(applyDeliveryBranding)
    }

    const handleSettingsUpdate = (event) => {
      const settings = event?.detail
      if (!settings) return
      const favicon = settings.deliveryFavicon?.url || settings.favicon?.url || ""
      if (favicon) updateBrowserFavicon(favicon)
      const deliveryLogo = getAppLogo("delivery")
      if (deliveryLogo) setLogoUrl(deliveryLogo)
    }

    window.addEventListener("businessSettingsUpdated", handleSettingsUpdate)
    return () => window.removeEventListener("businessSettingsUpdated", handleSettingsUpdate)
  }, [])

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
    if (!phone || phone.trim() === "") return "Phone number is required"
    const digitsOnly = phone.replace(/\D/g, "")
    if (digitsOnly.length < 7) return "Phone number must be at least 7 digits"
    if (digitsOnly.length !== 10) return "Phone number must be exactly 10 digits"
    return ""
  }

  const handleSendOTP = async () => {
    setError("")
    const phoneError = validatePhone(formData.phone)
    if (phoneError) {
      setError(phoneError)
      return
    }

    const fullPhone = `${formData.countryCode} ${formData.phone}`.trim()

    try {
      setIsSending(true)
      clearModuleAuth("delivery")
      // Drop any previous account's onboarding cache before OTP for this phone
      resetOnboardingClientStateForPhone(formData.phone)
      await deliveryAPI.sendOTP(fullPhone, "login")

      sessionStorage.setItem(
        "deliveryAuthData",
        JSON.stringify({
          method: "phone",
          phone: fullPhone,
          isSignUp: false,
          purpose: "login",
          module: "delivery",
        })
      )

      if (referralCode) {
        sessionStorage.setItem("deliveryPendingReferralRef", referralCode)
      } else {
        sessionStorage.removeItem("deliveryPendingReferralRef")
      }

      navigate("/food/delivery/otp")
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to send OTP. Please try again."
      setError(message)
    } finally {
      setIsSending(false)
    }
  }

  const handlePhoneChange = (e) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 10)
    setFormData({ ...formData, phone: value })
    if (error) setError(validatePhone(value))
  }

  const isValid = !validatePhone(formData.phone)

  return (
    <DeliveryPage className="bg-white justify-between" padded={false}>
      <div
        className="flex-1 flex flex-col px-5 pt-14 pb-6"
        style={{ paddingBottom: keyboardInset ? keyboardInset + 24 : undefined }}
      >
        <DeliveryAuthHeader
          logoUrl={logoUrl}
          companyName={companyName}
          title="Welcome back"
          subtitle="Sign in to your delivery partner account"
        />

        <div className="space-y-5 delivery-animate-in">
          <DeliveryPhoneInput
            value={formData.phone}
            onChange={handlePhoneChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" && isValid) handleSendOTP()
            }}
            error={error}
            inputRef={phoneInputRef}
          />

          <DeliveryPrimaryButton
            onClick={handleSendOTP}
            disabled={!isValid}
            loading={isSending}
          >
            {!isSending && (
              <>
                Continue
                <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
              </>
            )}
          </DeliveryPrimaryButton>

          <p className={`text-center text-xs text-slate-500 leading-relaxed ${keyboardInset ? "hidden" : ""}`}>
            By continuing you agree to our{" "}
            <Link to="/food/delivery/terms" className="text-primary-orange font-semibold hover:underline">
              Terms &amp; Conditions
            </Link>{" "}
            and{" "}
            <Link to="/food/delivery/privacy" className="text-primary-orange font-semibold hover:underline">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>

      <p
        className={`text-center text-[11px] text-slate-400 py-5 tracking-widest uppercase ${keyboardInset ? "hidden" : ""}`}
      >
        © {new Date().getFullYear()} {companyName} Partner
      </p>
    </DeliveryPage>
  )
}
