import React, { useEffect, useState, useRef, useMemo } from "react"
import { motion } from "framer-motion"
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from "react-router-dom"
import { Phone, Lock, ArrowRight, ArrowLeft, ShieldCheck, Loader2, UserRound, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { authAPI, userAPI } from "@food/api"
import { isModuleAuthenticated, setAuthData } from "@food/utils/auth"
import { loadBusinessSettings, getCachedSettings, getAppLogo, getCompanyName, setAppType } from "@common/utils/businessSettings"
import loginBg from "@food/assets/loginbanner.png"
import {
  resolvePostLoginRedirect,
  clearPostLoginRedirect,
  rememberPostLoginRedirect,
} from "@core/utils/postLoginRedirect"

export default function UnifiedOTPFastLogin() {
  const RESEND_COOLDOWN_SECONDS = 60
  const [loginType, setLoginType] = useState("phone") // "phone" | "email"
  const [phoneNumber, setPhoneNumber] = useState("")
  const [emailAddress, setEmailAddress] = useState("")
  const [otp, setOtp] = useState("")
  const [step, setStep] = useState(1)

  const getIdentifier = () => {
    return loginType === "email" ? emailAddress.trim().toLowerCase() : phoneNumber;
  }
  const [loading, setLoading] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)
  const [showNameInput, setShowNameInput] = useState(false)
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState("")
  const [phoneError, setPhoneError] = useState("")
  const [emailError, setEmailError] = useState("")
  const [logoUrl, setLogoUrl] = useState(() => getAppLogo('user'))
  const [companyName, setCompanyName] = useState(() => getCompanyName())
  const [bannerUrl, setBannerUrl] = useState(() => {
    const b = getCachedSettings()?.loginBanner?.url
    return b || loginBg
  })
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setAppType('user')
        const settings = await loadBusinessSettings()
        if (settings) {
          setLogoUrl(getAppLogo('user'))
          setCompanyName(getCompanyName())
          if (settings.loginBanner?.url) {
            setBannerUrl(settings.loginBanner.url)
          }
        }
      } catch (error) {}
    }
    fetchSettings()
  }, [])
  const searchParams = new URLSearchParams(location.search)
  const referralCode = searchParams.get("ref") || ""
  
  const submitting = useRef(false)
  // Honor redirectTo, from (string|location), ?redirect=, and sessionStorage (refresh-safe).
  const redirectTo = useMemo(
    () =>
      resolvePostLoginRedirect({
        location,
        searchParams,
        defaultPath: "/portal",
      }),
    [location],
  )

  useEffect(() => {
    // Persist so a refresh on the login page still returns to the prior route.
    if (redirectTo && redirectTo !== "/portal") {
      rememberPostLoginRedirect(redirectTo)
    }
  }, [redirectTo])

  const finishLoginAndRedirect = () => {
    clearPostLoginRedirect()
    navigate(redirectTo, { replace: true })
  }

  useEffect(() => {
    if (!isModuleAuthenticated("user")) return
    finishLoginAndRedirect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot when already auth
  }, [])

  const clearNameFlow = () => {
    setShowNameInput(false)
    setName("")
    setNameError("")
  }

  const normalizedPhone = () => {
    const digits = String(phoneNumber).replace(/\D/g, "").slice(-15)
    return digits.length >= 8 ? digits : ""
  }

  const handleSendOTP = async (e) => {
    e.preventDefault()
    const identifier = getIdentifier()
    if (loginType === "email") {
      if (!emailAddress.trim()) {
        setEmailError("Email address is required")
        return
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(identifier)) {
        setEmailError("Please enter a valid email address")
        return
      }
    } else {
      if (!phoneNumber.trim()) {
        setPhoneError("Phone number is required")
        return
      }
      const phoneDigits = String(identifier).replace(/\D/g, "").slice(-15)
      if (phoneDigits.length < 10) {
        setPhoneError("Please enter a valid 10-digit phone number")
        return
      }
    }

    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    try {
      clearNameFlow()
      await authAPI.sendOTP(identifier, "login", null)
      setOtpSent(true)
      setOtp("")
      setStep(2)
      setResendTimer(RESEND_COOLDOWN_SECONDS)
      toast.success(loginType === "email" ? "Verification code sent to your email!" : "OTP sent! Check your phone.")
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to send OTP."
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  const handleResendOTP = async () => {
    const identifier = getIdentifier()
    if (loginType === "email") {
      if (!emailAddress.trim()) {
        setEmailError("Email address is required")
        return
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(identifier)) {
        setEmailError("Please enter a valid email address")
        return
      }
    } else {
      if (!phoneNumber.trim()) {
        setPhoneError("Phone number is required")
        return
      }
      const phoneDigits = String(identifier).replace(/\D/g, "").slice(-15)
      if (phoneDigits.length < 10) {
        setPhoneError("Please enter a valid 10-digit phone number")
        return
      }
    }
    if (resendTimer > 0 || submitting.current) return
    submitting.current = true
    setLoading(true)
    try {
      clearNameFlow()
      await authAPI.sendOTP(identifier, "login", null)
      setOtp("")
      setOtpSent(true)
      setResendTimer(RESEND_COOLDOWN_SECONDS)
      toast.success("Verification code resent successfully.")
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to resend OTP."
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  const handleEditNumber = () => {
    setStep(1)
    setOtp("")
    setResendTimer(0)
    clearNameFlow()
  }

  const handleVerifyOTP = async (e) => {
    e.preventDefault()
    const identifier = getIdentifier()
    const otpDigits = String(otp).replace(/\D/g, "").slice(0, 4)
    if (otpDigits.length !== 4) {
      toast.error("Please enter the 4-digit OTP")
      return
    }
    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    try {
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
                  window.flutter_inappwebview.callHandler(handlerName, { module: "user" }),
                  new Promise((resolve) => setTimeout(() => resolve(null), 800))
                ]);
                if (t && typeof t === "string" && t.length > 20) {
                  fcmToken = t.trim();
                  break;
                }
              } catch (e) {}
            }
          } else {
            fcmToken = localStorage.getItem("fcm_web_registered_token_user") || null;
          }
        }
      } catch (e) {
        console.warn("Failed to get FCM token during login", e);
      }

      const response = await authAPI.verifyOTP(
        identifier, 
        otpDigits, 
        "login", 
        null, 
        null, 
        "user", 
        null, 
        referralCode, 
        fcmToken, 
        platform
      )
      const data = response?.data?.data || response?.data || {}
      const accessToken = data.accessToken
      const refreshToken = data.refreshToken || null
      const user = data.user

      if (!accessToken || !user) {
        throw new Error("Invalid response from server")
      }

      const hasName =
        user.name &&
        String(user.name).trim().length > 0 &&
        String(user.name).toLowerCase() !== "null"
      const needsName = data.isNewUser === true || !hasName

      if (needsName) {
        setAuthData("user", accessToken, user, refreshToken)
        window.dispatchEvent(new Event("userAuthChanged"))
        setShowNameInput(true)
        setLoading(false)
        submitting.current = false
        return
      }

      setAuthData("user", accessToken, user, refreshToken)
      window.dispatchEvent(new Event("userAuthChanged"))
      toast.success("Login successful!")
      finishLoginAndRedirect()
    } catch (err) {
      const status = err?.response?.status
      let msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Invalid OTP. Please try again."
      if (status === 401) {
        if (/deactivat(ed|e)/i.test(String(msg))) {
          msg = "Your account is deactivated. Please contact support."
        } else {
          msg = "Invalid or expired code, or account not active."
        }
      }
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  const handleSubmitName = async (e) => {
    e.preventDefault()

    const trimmedName = name.trim()
    if (!trimmedName) {
      setNameError("Please enter your name")
      return
    }

    if (trimmedName.length < 2) {
      setNameError("Name must be at least 2 characters")
      return
    }

    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    setNameError("")

    try {
      const response = await userAPI.updateProfile({ name: trimmedName })
      const updatedUser =
        response?.data?.data?.user ||
        response?.data?.user ||
        response?.data?.data ||
        response?.data
      const storedToken = localStorage.getItem("user_accessToken") || localStorage.getItem("accessToken")
      const storedRefreshToken = localStorage.getItem("user_refreshToken") || null

      if (!storedToken || !updatedUser) {
        throw new Error("Invalid response from server")
      }

      setAuthData("user", storedToken, updatedUser, storedRefreshToken)
      window.dispatchEvent(new Event("userAuthChanged"))
      clearNameFlow()
      toast.success("Profile saved successfully!")
      finishLoginAndRedirect()
    } catch (err) {
      const status = err?.response?.status
      let msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to save your name."
      if (status === 401) {
        msg = "Invalid or expired code, or account not active."
      }
      toast.error(msg)
    } finally {
      setLoading(false)
      submitting.current = false
    }
  }

  useEffect(() => {
    if (step !== 2 || resendTimer <= 0) return
    const intervalId = setInterval(() => {
      setResendTimer((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(intervalId)
  }, [step, resendTimer])

  const formatResendTimer = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
  }

  // Service images (served from public folder)
  const foodIcon = "/super-app/food.png"

  const groceryIcon = "/super-app/grocery.png"


  const services = [
    { id: 'food', name: 'Food Delivery', icon: foodIcon, label: 'Zomato', color: 'bg-red-500', shadow: 'shadow-red-200' },

    { id: 'grocery', name: 'Quick Commerce', icon: groceryIcon, label: 'Blinkit', color: 'bg-green-500', shadow: 'shadow-green-200' },

  ]

  return (
    <div className="min-h-screen w-full flex bg-white dark:bg-[#0a0a0a] text-slate-900 dark:text-slate-100 font-sans transition-colors duration-300">
      
      {/* ── Desktop left image panel ── */}
      <div className="hidden lg:flex lg:w-[52%] xl:w-[55%] relative overflow-hidden flex-shrink-0">
        <img
          src={bannerUrl}
          alt="Partner banner"
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
              Taste the best, <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF6A00] to-orange-400">
                forget the rest
              </span>
            </h2>
            <p className="text-sm text-white/70 leading-relaxed">
              Order delicious meals from your favorite restaurants and get groceries delivered to your doorstep in minutes.
            </p>
          </div>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div
        className="flex-1 flex flex-col min-h-screen lg:min-h-0 lg:h-screen lg:overflow-y-auto"
      >
        {/* Form area */}
        <div className="flex-1 flex flex-col items-center justify-center px-5 sm:px-8 lg:px-12 xl:px-16 pt-16 pb-8 lg:py-0">
          
          {/* Back button (Only when step is 2 or showNameInput) */}
          {(step === 2 || showNameInput) && (
            <div className="w-full max-w-sm mb-4 flex justify-start">
              <button
                type="button"
                onClick={handleEditNumber}
                className="flex items-center gap-2 text-sm text-slate-500 dark:text-zinc-400 hover:text-[#FF6A00] transition-colors mb-6 group cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" strokeWidth={2} />
                Back
              </button>
            </div>
          )}

          {/* Logo & Header info */}
          <div className="mb-8 w-full max-w-sm text-center">
            {logoUrl ? (
              <img src={logoUrl} alt={companyName} className="h-12 w-auto object-contain mx-auto mb-6 rounded-xl" />
            ) : (
              <div className="w-12 h-12 bg-[#FF6A00] rounded-2xl flex mx-auto items-center justify-center mb-6">
                <ShieldCheck className="w-6 h-6 text-white" strokeWidth={2} />
              </div>
            )}
            <h1 className="text-2xl xl:text-3xl font-bold text-gray-900 dark:text-white leading-tight mb-2">
              {step === 1 ? "Welcome back" : showNameInput ? "Create Account" : "Verify OTP"}
            </h1>
            <p className="text-sm text-gray-500 dark:text-zinc-400">
              {step === 1 
                ? "Sign in to your account to continue" 
                : showNameInput 
                  ? "Tell us your name to set up your profile"
                  : `We sent a verification code to +91 ${phoneNumber}`}
            </p>
          </div>

          <div className="w-full max-w-sm">
            <form 
              onSubmit={showNameInput ? handleSubmitName : step === 1 ? handleSendOTP : handleVerifyOTP} 
              noValidate 
              className="space-y-5"
            >
              {step === 1 ? (
                <div className="space-y-5">
                  <div className="space-y-4">
                    <div className="space-y-1.5 group">
                      <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Phone Number</label>
                      <div className={`flex items-center gap-3 h-14 bg-gray-50 dark:bg-zinc-900 border rounded-2xl px-4 transition-all duration-200 ${
                        phoneError 
                          ? "border-red-500 ring-2 ring-red-100 dark:ring-red-900/30" 
                          : "border-gray-200 dark:border-zinc-800 focus-within:border-[#FF6A00] focus-within:ring-2 focus-within:ring-[#FF6A00]/10"
                      }`}>
                        <span className="text-sm font-semibold text-slate-500 dark:text-zinc-400 flex-shrink-0">+91</span>
                        <div className="w-px h-5 bg-gray-200 dark:bg-zinc-800 flex-shrink-0" />
                        <input
                          type="tel"
                          required
                          autoFocus
                          value={phoneNumber}
                          onChange={(e) => {
                            setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 10));
                            if (phoneError) setPhoneError("");
                          }}
                          maxLength={10}
                          className="flex-1 bg-transparent border-0 outline-none ring-0 text-base font-semibold text-gray-900 dark:text-white placeholder-gray-350 dark:placeholder-gray-650 caret-[#FF6A00] min-w-0"
                          placeholder="Enter 10-digit number"
                        />
                      </div>
                      {phoneError && (
                        <p className="text-xs font-semibold text-red-500 animate-fade-in">{phoneError}</p>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-zinc-500 text-center leading-relaxed">
                    We will send verification code to your device
                  </p>
                </div>
              ) : showNameInput ? (
                <div className="space-y-5">
                  {/* Unified verified block */}
                  <div className="flex items-center justify-between bg-slate-50 dark:bg-zinc-900/50 p-4 rounded-xl border border-slate-200/50 dark:border-zinc-800/80">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-500">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 tracking-wider">Verified</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          +91 {phoneNumber}
                        </p>
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={handleEditNumber} 
                      className="text-xs text-[#FF6A00] hover:text-[#E85D04] font-bold underline cursor-pointer transition-colors"
                    >
                      Change
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Your Full Name</label>
                    <div className={`flex items-center gap-3 h-14 bg-gray-50 dark:bg-zinc-900 border rounded-2xl px-4 transition-all duration-200 ${
                      nameError 
                        ? "border-red-500 ring-2 ring-red-100 dark:ring-red-900/30" 
                        : "border-gray-200 dark:border-zinc-800 focus-within:border-[#FF6A00] focus-within:ring-2 focus-within:ring-[#FF6A00]/10"
                    }`}>
                      <input
                        type="text"
                        required
                        autoFocus
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value)
                          if (nameError) setNameError("")
                        }}
                        className="flex-1 bg-transparent border-0 outline-none ring-0 text-base font-semibold text-gray-900 dark:text-white placeholder-gray-350 dark:placeholder-gray-655 caret-[#FF6A00] min-w-0"
                        placeholder="John Doe"
                      />
                    </div>
                    {nameError ? (
                      <p className="text-xs font-semibold text-red-500 animate-fade-in">{nameError}</p>
                    ) : (
                      <p className="text-[11px] text-slate-400 dark:text-zinc-500 text-center leading-relaxed">
                        Please enter your name so we can save it to your profile.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* OTP info block */}
                  <div className="flex items-center justify-between bg-slate-50 dark:bg-zinc-900/50 p-4 rounded-xl border border-slate-200/50 dark:border-zinc-800/80">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-[#FF6A00]/10 rounded-lg flex items-center justify-center text-[#FF6A00]">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 tracking-wider">Verifying</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          +91 {phoneNumber}
                        </p>
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={handleEditNumber} 
                      className="text-xs text-[#FF6A00] hover:text-[#E85D04] font-bold underline cursor-pointer transition-colors"
                    >
                      Change
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-center gap-3">
                      {[0, 1, 2, 3].map((index) => (
                        <input
                          key={index}
                          id={`otp-${index}`}
                          type="tel"
                          inputMode="numeric"
                          required
                          autoFocus={index === 0}
                          value={otp[index] || ""}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, "").slice(-1);
                            if (!val) return;
                            const newOtp = otp.split("");
                            newOtp[index] = val;
                            const combined = newOtp.join("").slice(0, 4);
                            setOtp(combined);
                            
                            // Focus next
                            if (index < 3 && val) {
                              document.getElementById(`otp-${index + 1}`)?.focus();
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Backspace") {
                              if (!otp[index] && index > 0) {
                                document.getElementById(`otp-${index - 1}`)?.focus();
                              } else {
                                const newOtp = otp.split("");
                                newOtp[index] = "";
                                setOtp(newOtp.join(""));
                              }
                            }
                          }}
                          onPaste={(e) => {
                            e.preventDefault();
                            const pasteData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
                            if (pasteData) {
                              setOtp(pasteData);
                              document.getElementById(`otp-${Math.min(pasteData.length, 3)}`)?.focus();
                            }
                          }}
                          className="w-14 h-14 sm:w-16 sm:h-16 text-center text-2xl sm:text-3xl font-extrabold bg-gray-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 focus:border-[#FF6A00] focus:ring-4 focus:ring-[#FF6A00]/10 rounded-2xl outline-none transition-all text-slate-900 dark:text-white caret-[#FF6A00]"
                          placeholder="-"
                        />
                      ))}
                    </div>

                    <div className="text-center">
                      {resendTimer > 0 ? (
                        <p className="text-xs font-semibold text-slate-400 dark:text-zinc-500">
                          Resend code in <span className="text-[#FF6A00] font-bold">{formatResendTimer(resendTimer)}</span>
                        </p>
                      ) : (
                        <button
                          type="button"
                          onClick={handleResendOTP}
                          disabled={loading}
                          className="text-xs font-bold text-[#FF6A00] hover:text-[#E85D04] hover:underline disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                        >
                          Resend OTP
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className={`w-full py-3.5 rounded-2xl font-bold text-sm tracking-wide transition-all duration-200 border-0 flex items-center justify-center gap-2 ${
                  loading
                    ? "bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-zinc-600 cursor-not-allowed"
                    : "bg-[#FF6A00] hover:bg-[#e05e00] text-white shadow-lg shadow-[#FF6A00]/25 active:scale-[0.98]"
                }`}
                style={{ height: 52 }}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Processing…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2 w-full">
                    {step === 1 ? "Get Verification Code" : showNameInput ? "Save Name & Continue" : "Verify & Continue"}
                    <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Footer Terms & Conditions */}
        <div className="text-center max-w-sm mx-auto pt-4 pb-5 md:pt-0">
          <p className="text-[10px] text-slate-400 dark:text-zinc-500 leading-relaxed font-semibold">
            By continuing, you agree to our <br className="sm:hidden" />
            <Link to="/food/user/profile/terms" className="text-slate-500 dark:text-zinc-400 font-bold underline hover:text-[#FF6A00] transition-colors">Terms of Service</Link> & <Link to="/food/user/profile/privacy" className="text-slate-500 dark:text-zinc-400 font-bold underline hover:text-[#FF6A00] transition-colors">Privacy Policy</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
