import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Loader2, X } from "lucide-react"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { Input } from "@food/components/ui/input"
import {
  DeliveryPageHeader,
  DeliveryPrimaryButton,
  DeliveryField,
} from "../../components/ui/deliveryUi"
import { deliveryAPI } from "@food/api"
import { setAuthData as storeAuthData, clearModuleAuth } from "@food/utils/auth"
import {
  clearDeliveryOnboardingOnlyGate,
  setDeliveryOnboardingOnlyGate,
} from "../../utils/driverModuleAccess"
import {
  clearSignupSession,
  resetOnboardingClientStateForPhone,
} from "../../utils/signupSubmit"
import { applyServerOnboardingToClient } from "../../utils/onboardingDraftApi"
import { emptySignupDetails, saveSignupDetails } from "../../utils/signupDraft"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


export default function DeliveryOTP() {
  const navigate = useNavigate()
  const [otp, setOtp] = useState(["", "", "", ""])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)
  const [authData, setAuthData] = useState(null)
  const [showNameInput, setShowNameInput] = useState(false)
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState("")
  const [verifiedOtp, setVerifiedOtp] = useState("")
  const [pendingMessage, setPendingMessage] = useState("")
  const [isRejected, setIsRejected] = useState(false)
  const [documentsRequired, setDocumentsRequired] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const [deviceToken, setDeviceToken] = useState(null)
  const [activePlatform, setActivePlatform] = useState("web")
  const inputRefs = useRef([])

  useEffect(() => {
    // Get auth data from sessionStorage (delivery module key)
    const stored = sessionStorage.getItem("deliveryAuthData")
    if (stored) {
      const data = JSON.parse(stored)
      setAuthData(data)
    } else {
      // No active OTP flow: if already authenticated, go to delivery home
      const token = localStorage.getItem("delivery_accessToken")
      const authenticated = localStorage.getItem("delivery_authenticated") === "true"
      if (token && authenticated) {
        try {
          const parts = token.split('.')
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
            const now = Math.floor(Date.now() / 1000)
            if (payload.exp && payload.exp > now) {
              navigate("/food/delivery", { replace: true })
              return
            }
          }
        } catch (e) {
          // Ignore token parse errors and continue to sign-in redirect
        }
      }

      // No auth data, redirect to sign in
      navigate("/food/delivery/login", { replace: true })
      return
    }

    // OTP field should be empty - delivery boy needs to enter it manually
    // No auto-fill for delivery OTP

    // Start resend timer (60 seconds)
    setResendTimer(60)
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Don't auto-focus - let user manually enter OTP
    // Focus first input only if all fields are empty (small delay to ensure inputs are rendered)
    if (inputRefs.current[0] && otp.every(digit => digit === "")) {
      setTimeout(() => {
        inputRefs.current[0]?.focus()
      }, 100)
    }
  }, [otp])

  const handleChange = (index, value) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) {
      return
    }

    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    setError("")

    // Auto-focus next input
    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus()
    }

    // Auto-submit when all 4 digits are entered and we are in OTP step
    if (!showNameInput && newOtp.every((digit) => digit !== "") && newOtp.length === 4) {
      handleVerify(newOtp.join(""))
    }
  }

  const handleKeyDown = (index, e) => {
    // Handle backspace
    if (e.key === "Backspace") {
      if (otp[index]) {
        // If current input has value, clear it
        const newOtp = [...otp]
        newOtp[index] = ""
        setOtp(newOtp)
      } else if (index > 0) {
        // If current input is empty, move to previous and clear it
        inputRefs.current[index - 1]?.focus()
        const newOtp = [...otp]
        newOtp[index - 1] = ""
        setOtp(newOtp)
      }
    }
    // Handle paste
    if (e.key === "v" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      navigator.clipboard.readText().then((text) => {
        const digits = text.replace(/\D/g, "").slice(0, 4).split("")
        const newOtp = [...otp]
        digits.forEach((digit, i) => {
          if (i < 4) {
            newOtp[i] = digit
          }
        })
        setOtp(newOtp)
        if (digits.length === 4) {
          handleVerify(newOtp.join(""))
        } else {
          inputRefs.current[digits.length]?.focus()
        }
      })
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData("text")
    const digits = pastedData.replace(/\D/g, "").slice(0, 4).split("")
    const newOtp = [...otp]
    digits.forEach((digit, i) => {
      if (i < 4) {
        newOtp[i] = digit
      }
    })
    setOtp(newOtp)
    if (!showNameInput && digits.length === 4) {
      handleVerify(newOtp.join(""))
      return
    }
    inputRefs.current[digits.length]?.focus()
  }

  const handleVerify = async (otpValue = null) => {
    if (showNameInput) {
      // In name collection step, ignore OTP auto-submit
      return
    }

    const code = otpValue || otp.join("")

    if (code.length !== 4) {
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const phone = authData?.phone
      const purpose = authData?.purpose || "login"
      const providedName = authData?.isSignUp ? authData?.name || null : null
      if (!phone) {
        setError("Phone number not found. Please try again.")
        setIsLoading(false)
        return
      }

      // Try to get FCM token before verifying OTP
      let fcmToken = null;
      let platform = "web";
      try {
        if (typeof window !== "undefined") {
          if (window.flutter_inappwebview) {
            platform = "mobile";
            const handlerNames = ["getFcmToken", "getFCMToken", "getPushToken", "getFirebaseToken"];
            for (const handlerName of handlerNames) {
              try {
                const t = await Promise.race([
                  window.flutter_inappwebview.callHandler(handlerName, { module: "delivery" }),
                  new Promise((resolve) => setTimeout(() => resolve(null), 800))
                ]);
                if (t && typeof t === "string" && t.length > 20) {
                  fcmToken = t.trim();
                  break;
                }
              } catch (e) {}
            }
          } else {
            fcmToken = localStorage.getItem("fcm_web_registered_token_delivery") || null;
          }
        }
      } catch (e) {
        debugWarn("Failed to get FCM token during login", e);
      }

      setDeviceToken(fcmToken);
      setActivePlatform(platform);

      // Backend: POST /auth/delivery/verify-otp returns either:
      // - { needsRegistration: true } when no partner exists yet
      // - or { accessToken, refreshToken, user } for existing partners
      const response = await deliveryAPI.verifyOTP(phone, code, purpose, providedName, fcmToken, platform)
      debugLog("Delivery OTP Response:", response)
      const data = response?.data?.data || response?.data || {}
      debugLog("Parsed Delivery OTP Data:", data)

      if (data.pendingApproval === true) {
        const digits = String(phone || "").replace(/\D/g, "").slice(-10)
        clearSignupSession()
        resetOnboardingClientStateForPhone(digits)
        sessionStorage.removeItem("deliveryAuthData")
        setIsLoading(false)
        setError("")
        setPendingMessage(data.message || "Your account is pending admin verification. You will be notified once approved.")
        setIsRejected(data.isRejected || false)
        setDocumentsRequired(Boolean(data.documentsRequired))
        setRejectionReason(data.rejectionReason || "")
        if (data.rejectionReason) {
          sessionStorage.setItem("deliveryRejectionReason", data.rejectionReason)
        }
        if (Array.isArray(data.documentsRequested) && data.documentsRequested.length) {
          sessionStorage.setItem("deliveryDocumentsRequested", JSON.stringify(data.documentsRequested))
        } else {
          sessionStorage.removeItem("deliveryDocumentsRequested")
        }
        if (data.docsResubmitToken) {
          sessionStorage.setItem("deliveryDocsResubmitToken", data.docsResubmitToken)
        } else {
          sessionStorage.removeItem("deliveryDocsResubmitToken")
        }
        if (data.documentsRequired) {
          sessionStorage.setItem("deliveryDocumentsRequired", "true")
        } else {
          sessionStorage.removeItem("deliveryDocumentsRequired")
        }
        // Restricted onboarding access: allow status + resubmit without full work access
        if (data.accessToken && data.user) {
          try {
            storeAuthData("delivery", data.accessToken, data.user, null)
            setDeliveryOnboardingOnlyGate()
            applyServerOnboardingToClient(data.user)
            if (Array.isArray(data.enrollments)) {
              sessionStorage.setItem(
                "deliveryEnrollments",
                JSON.stringify(data.enrollments),
              )
            }
            sessionStorage.setItem("deliveryPendingPhone", digits)
            navigate("/food/delivery/verification", {
              replace: true,
              state: { phone: digits, enrollments: data.enrollments || [] },
            })
            return
          } catch (e) {
            debugWarn("Failed to persist onboarding token", e)
          }
        }
        return
      }

      const needsRegistration = data.needsRegistration === true

      if (needsRegistration) {
        const digits = String(phone || "").replace(/\D/g, "").slice(-10)
        // Always drop any previous driver's client draft before starting anew
        clearSignupSession()
        resetOnboardingClientStateForPhone(digits)

        sessionStorage.removeItem("deliveryAuthData")
        sessionStorage.setItem("deliveryNeedsRegistration", "true")

        if (data.accessToken && data.user) {
          try {
            storeAuthData("delivery", data.accessToken, data.user, null)
            setDeliveryOnboardingOnlyGate()
            applyServerOnboardingToClient(data.user)
          } catch (e) {
            debugWarn("Failed to persist onboarding draft token", e)
            saveSignupDetails(
              emptySignupDetails({
                phone: digits,
                countryCode: "+91",
              }),
            )
          }
        } else {
          saveSignupDetails(
            emptySignupDetails({
              phone: digits,
              countryCode: "+91",
            }),
          )
        }

        setIsLoading(false)
        navigate("/food/delivery/signup/details", { replace: true })
        return
      }

      const accessToken = data.accessToken
      const refreshToken = data.refreshToken || null
      const user = data.user

      if (!accessToken || !user) {
        throw new Error("Invalid response from server")
      }

      sessionStorage.removeItem("deliveryAuthData")
      const digits = String(phone || "").replace(/\D/g, "").slice(-10)
      clearSignupSession()
      resetOnboardingClientStateForPhone(digits)

      try {
        debugLog("Storing auth data for delivery:", { hasToken: !!accessToken, hasUser: !!user })
        storeAuthData("delivery", accessToken, user, refreshToken)
        clearDeliveryOnboardingOnlyGate()
        if (Array.isArray(data.enrollments)) {
          sessionStorage.setItem(
            "deliveryEnrollments",
            JSON.stringify(data.enrollments),
          )
        }
        debugLog("Auth data stored successfully")
      } catch (storageError) {
        debugError("Failed to store authentication data:", storageError)
        setError("Failed to save authentication. Please try again or clear your browser storage.")
        setIsLoading(false)
        return
      }

      window.dispatchEvent(new Event("deliveryAuthChanged"))

      setSuccess(true)
      setIsLoading(false)

      let retryCount = 0
      const maxRetries = 10
      const verifyAndNavigate = () => {
        const storedToken = localStorage.getItem("delivery_accessToken")
        const storedAuth = localStorage.getItem("delivery_authenticated")

        if (storedToken && storedAuth === "true") {
          navigate("/food/delivery", { replace: true })
        } else if (retryCount < maxRetries) {
          retryCount++
          setTimeout(verifyAndNavigate, 100)
        } else {
          setError("Failed to save authentication. Please try again.")
          setIsLoading(false)
        }
      }
      setTimeout(verifyAndNavigate, 200)
    } catch (err) {
      debugError("OTP Verification Error:", err)
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to verify OTP. Please try again."
      setError(message)
      setIsLoading(false)
    }
  }

  const handleSubmitName = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setNameError("Name is required")
      return
    }

    if (!verifiedOtp) {
      setError("OTP verification step missing. Please request a new OTP.")
      return
    }

    setIsLoading(true)
    setError("")
    setNameError("")

    try {
      const phone = authData?.phone
      const purpose = authData?.purpose || "login"
      if (!phone) {
        setError("Phone number not found. Please try again.")
        return
      }

      // Second call with name to auto-register and login
      const response = await deliveryAPI.verifyOTP(phone, verifiedOtp, purpose, trimmedName, deviceToken, activePlatform)
      const data = response?.data?.data || response?.data || {}

      const accessToken = data.accessToken
      const refreshToken = data.refreshToken || null
      const user = data.user

      if (!accessToken || !user) {
        throw new Error("Invalid response from server")
      }

      // Clear auth data from sessionStorage
      sessionStorage.removeItem("deliveryAuthData")

      // Store auth data using utility function to ensure proper role handling
      // The setAuthData function includes error handling and verification
      try {
        debugLog("Storing auth data for delivery (with name):", { hasToken: !!accessToken, hasUser: !!user })
        storeAuthData("delivery", accessToken, user, refreshToken)
        clearDeliveryOnboardingOnlyGate()
        debugLog("Auth data stored successfully")
      } catch (storageError) {
        debugError("Failed to store authentication data:", storageError)
        setError("Failed to save authentication. Please try again or clear your browser storage.")
        setIsLoading(false)
        return
      }

      // Dispatch custom event for same-tab updates
      window.dispatchEvent(new Event("deliveryAuthChanged"))

      setSuccess(true)
      setIsLoading(false)

      // Verify token is stored and then navigate
      let retryCount = 0
      const maxRetries = 10
      const verifyAndNavigate = () => {
        const storedToken = localStorage.getItem("delivery_accessToken")
        const storedAuth = localStorage.getItem("delivery_authenticated")

        debugLog("Verifying token storage (with name):", { hasToken: !!storedToken, authenticated: storedAuth, retryCount })

        if (storedToken && storedAuth === "true") {
          // Token is stored, navigate to delivery home
          debugLog("Token verified, navigating to /delivery")
          navigate("/food/delivery", { replace: true })
        } else if (retryCount < maxRetries) {
          // Token not stored yet, retry after short delay
          retryCount++
          setTimeout(verifyAndNavigate, 100)
        } else {
          // Max retries reached, show error
          debugError("Token storage verification failed after max retries")
          setError("Failed to save authentication. Please try again.")
          setIsLoading(false)
        }
      }

      // Start verification after a small delay
      setTimeout(verifyAndNavigate, 200)
    } catch (err) {
      debugError("Name Submission Error:", err)
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to complete registration. Please try again."
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendTimer > 0) return

    setIsLoading(true)
    setError("")

    try {
      const phone = authData?.phone
      const purpose = authData?.purpose || "login"
      if (!phone) {
        setError("Phone number not found. Please go back and try again.")
        return
      }

      // Call backend to resend OTP
      await deliveryAPI.sendOTP(phone, purpose)
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to resend OTP. Please try again."
      setError(message)
    } finally {
      setIsLoading(false)
    }

    // Reset timer to 60 seconds
    setResendTimer(60)
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    setOtp(["", "", "", ""])
    setShowNameInput(false)
    setName("")
    setNameError("")
    setVerifiedOtp("")
    inputRefs.current[0]?.focus()
  }

  const getPhoneNumber = () => {
    if (!authData) return ""
    if (authData.method === "phone") {
      // Format phone number as +91-9098569620
      const phone = authData.phone || ""
      // Remove spaces and format
      const cleaned = phone.replace(/\s/g, "")
      // Add hyphen after country code if not present
      if (cleaned.startsWith("+91") && cleaned.length > 3) {
        return cleaned.slice(0, 3) + "-" + cleaned.slice(3)
      }
      return cleaned
    }
    return authData.email || ""
  }

  if (!authData) {
    return null
  }

  return (
    <>
      <AnimatedPage className="min-h-screen bg-slate-50 flex flex-col">
      <DeliveryPageHeader title="OTP Verification" onBack={() => navigate("/food/delivery/login")} />

      {/* Main Content */}
      <div className="flex flex-col justify-center px-6 pt-8 pb-12">
        <div className="max-w-md mx-auto w-full space-y-8">
          {/* Message */}
          <div className="text-center space-y-2">
            <p className="text-base text-slate-600">
              {showNameInput
                ? "You're almost done! Please tell us your name to complete registration."
                : "We have sent a verification code to"}
            </p>
            {!showNameInput && (
              <p className="text-base text-slate-900 font-semibold">
                {getPhoneNumber()}
              </p>
            )}
          </div>

          {/* Pending / documents-required message */}
          {!isRejected && pendingMessage && (
            <div className={`rounded-xl border p-5 text-center space-y-4 shadow-sm ${documentsRequired ? "bg-orange-50 border-orange-100" : "bg-amber-50 border-amber-100"}`}>
              <div className="space-y-2">
                <p className={`text-sm font-semibold ${documentsRequired ? "text-orange-800" : "text-amber-800"}`}>
                  {documentsRequired ? "Documents Required" : "Pending Verification"}
                </p>
                <p className={`text-sm leading-relaxed ${documentsRequired ? "text-orange-700" : "text-amber-700"}`}>
                  {pendingMessage}
                </p>
                {documentsRequired && rejectionReason && (
                  <div className="mt-2 p-3 bg-white/50 rounded-lg border border-orange-200">
                    <p className="text-xs font-medium text-orange-600 uppercase tracking-wider mb-1">Reason</p>
                    <p className="text-sm text-orange-900 italic">"{rejectionReason}"</p>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 pt-2">
                {documentsRequired ? (
                  <DeliveryPrimaryButton
                    type="button"
                    onClick={() => {
                      const phone = authData?.phone
                      const digits = String(phone || "").replace(/\D/g, "").slice(-10)
                      sessionStorage.setItem("deliveryNeedsRegistration", "true")
                      sessionStorage.setItem("deliveryIsRejected", "true")
                      sessionStorage.setItem("deliveryDocumentsRequired", "true")
                      if (rejectionReason) {
                        sessionStorage.setItem("deliveryRejectionReason", rejectionReason)
                      }
                      // Keep existing draft; never wipe to empty name/phone-only
                      const existingRaw = sessionStorage.getItem("deliverySignupDetails")
                      let existing = {}
                      try {
                        existing = existingRaw ? JSON.parse(existingRaw) : {}
                      } catch {
                        existing = {}
                      }
                      sessionStorage.setItem(
                        "deliverySignupDetails",
                        JSON.stringify({
                          ...existing,
                          phone: existing.phone || digits,
                          countryCode: existing.countryCode || "+91",
                        }),
                      )
                      sessionStorage.setItem("deliveryPendingPhone", digits)
                      navigate("/food/delivery/verification", {
                        replace: true,
                        state: { phone: digits },
                      })
                    }}
                  >
                    Re-upload Documents
                  </DeliveryPrimaryButton>
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    clearModuleAuth("delivery")
                    clearDeliveryOnboardingOnlyGate()
                    sessionStorage.removeItem("deliveryPendingPhone")
                    sessionStorage.removeItem("deliveryAuthData")
                    navigate("/food/delivery/login", { replace: true })
                  }}
                  className={`text-sm font-medium underline transition-colors ${documentsRequired ? "text-orange-700 hover:text-orange-900" : "text-amber-700 hover:text-amber-900"}`}
                >
                  Back to login
                </button>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <p className="text-sm text-red-500 text-center">
              {error}
            </p>
          )}

          {/* OTP Input Fields */}
          {!showNameInput && !pendingMessage && (
            <>
              <div className="flex justify-center gap-2">
                {otp.map((digit, index) => (
                  <Input
                    key={index}
                    ref={(el) => (inputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={index === 0 ? handlePaste : undefined}
                    disabled={isLoading}
                    autoComplete="off"
                    autoFocus={false}
                    className="w-12 h-12 text-center text-lg font-semibold p-0 border border-slate-200 rounded-xl focus-visible:ring-2 focus-visible:ring-primary-orange/30 focus-visible:border-primary-orange bg-white"
                  />
                ))}
              </div>

              {/* Resend Section */}
              <div className="text-center space-y-1">
                <p className="text-sm text-slate-600">
                  Didn't get the OTP?
                </p>
                {resendTimer > 0 ? (
                  <p className="text-sm text-slate-500">
                    Resend SMS in {resendTimer}s
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={isLoading}
                    className="text-sm text-primary-orange font-semibold hover:underline disabled:opacity-50"
                  >
                    Resend SMS
                  </button>
                )}
              </div>
            </>
          )}

          {/* Name Input (shown only after OTP verified and user is new) */}
          {showNameInput && (
            <div className="space-y-3">
              <DeliveryField label="Full name" required error={nameError} htmlFor="delivery-name">
                <Input
                  id="delivery-name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    if (nameError) setNameError("")
                  }}
                  disabled={isLoading}
                  placeholder="Enter your name"
                  className={`h-11 rounded-xl ${nameError ? "border-red-500" : "border-slate-200"}`}
                />
              </DeliveryField>

              <DeliveryPrimaryButton onClick={handleSubmitName} loading={isLoading} disabled={isLoading}>
                Continue
              </DeliveryPrimaryButton>
            </div>
          )}

          {/* Loading Spinner */}
          {isLoading && !showNameInput && (
            <div className="flex justify-center pt-4">
              <Loader2 className="h-6 w-6 text-primary-orange animate-spin" />
            </div>
          )}
        </div>
      </div>

    </AnimatedPage>

      {isRejected && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-100 transform transition-all duration-300 animate-in zoom-in-95 duration-300 flex flex-col font-sans">
            {/* Top Red Gradient Banner */}
            <div className="bg-gradient-to-r from-red-500 to-rose-600 px-6 py-8 text-center text-white relative">
              <div className="w-16 h-16 bg-white/20 rounded-2xl mx-auto flex items-center justify-center backdrop-blur-sm mb-3">
                <X className="w-8 h-8 text-white stroke-[3px]" />
              </div>
              <h3 className="text-xl font-black tracking-tight uppercase">Application Rejected</h3>
              <p className="text-white/80 text-xs font-semibold mt-1">Our review team has rejected your delivery partner request.</p>
            </div>
            
            {/* Reason content */}
            <div className="p-6 space-y-4 flex-1">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Rejection Reason</span>
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-700 text-sm font-medium italic relative overflow-hidden">
                  <span className="absolute -left-1 -top-2 text-7xl text-slate-200/50 pointer-events-none select-none font-serif">“</span>
                  <p className="relative z-10 leading-relaxed font-sans">{rejectionReason}</p>
                </div>
              </div>
              
              <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 flex gap-3">
                <div className="flex-1 text-xs text-amber-800 leading-relaxed font-medium">
                  <strong>Please note:</strong> You can edit only the fields or
                  documents that need correction. Everything else stays as you
                  previously submitted.
                </div>
              </div>
            </div>
            
            {/* Buttons */}
            <div className="px-6 pb-6 pt-2 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  const phone = authData?.phone;
                  const digits = String(phone || "").replace(/\D/g, "").slice(-10);
                  sessionStorage.setItem("deliveryNeedsRegistration", "true");
                  sessionStorage.setItem("deliveryIsRejected", "true");
                  if (rejectionReason) {
                    sessionStorage.setItem("deliveryRejectionReason", rejectionReason);
                  }
                  // Prefer verification page Edit & Resubmit (keeps auth + full profile)
                  sessionStorage.setItem("deliveryPendingPhone", digits);
                  setIsRejected(false);
                  setPendingMessage("");
                  navigate("/food/delivery/verification", {
                    replace: true,
                    state: { phone: digits },
                  });
                }}
                className="w-full h-14 bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-700 hover:to-red-600 text-white rounded-2xl font-black text-sm tracking-widest uppercase shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all"
              >
                Edit & Resubmit
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsRejected(false);
                  setPendingMessage("");
                  navigate("/food/delivery/login", { replace: true });
                }}
                className="w-full h-12 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-700 rounded-2xl font-bold text-sm tracking-wider transition-all"
              >
                Cancel / Go Back
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

