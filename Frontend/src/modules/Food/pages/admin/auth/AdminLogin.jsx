import { useState, useEffect, useRef } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { adminAPI } from "@food/api"
import { setAuthData } from "@food/utils/auth"
import { getDefaultAdminLandingPath, resolveAdminPermissionsForUser } from "@food/utils/adminPermissions"
import { loadBusinessSettings, getCachedSettings, getAppLogo } from "@common/utils/businessSettings"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { Label } from "@food/components/ui/label"
import { Eye, EyeOff, UserCircle, ShieldCheck, ArrowRight, Loader2, Mail, Hash } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@food/components/ui/select"
import { z } from "zod"
import { toast } from "sonner"

const emailLoginSchema = z.object({
  email: z.string()
    .trim()
    .min(1, "Email Address is required")
    .max(100, "Email must not exceed 100 characters")
    .email("Please enter a valid email address"),
  password: z.string()
    .min(1, "Password is required")
    .min(6, "Password must be at least 6 characters")
    .max(50, "Password must not exceed 50 characters"),
})

const employeeLoginSchema = z.object({
  employeeId: z.string()
    .trim()
    .min(1, "Employee ID is required")
    .max(20, "Employee ID must not exceed 20 characters")
    .regex(/^EMPL\d+$/i, "Please enter a valid Employee ID format (e.g., EMPL0001)"),
  password: z.string()
    .min(1, "Password is required")
    .min(6, "Password must be at least 6 characters")
    .max(50, "Password must not exceed 50 characters"),
})

const debugLog = (...args) => { }
const debugWarn = (...args) => { }
const debugError = (...args) => { }

export default function AdminLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const [activeTab, setActiveTab] = useState("email")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  
  const [emailError, setEmailError] = useState("")
  const [passwordError, setPasswordError] = useState("")
  
  const [logoUrl, setLogoUrl] = useState(() => getAppLogo('admin'))
  const [companyName, setCompanyName] = useState(() => getCachedSettings()?.companyName || null)
  const submittingRef = useRef(false)
  const [roles, setRoles] = useState([])
  const [selectedRoleId, setSelectedRoleId] = useState("ADMIN")

  useEffect(() => {
    const message = location.state?.message
    if (message) {
      toast.success(message)
      window.history.replaceState({}, document.title, location.pathname)
    }
  }, [location.state?.message, location.pathname])

  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const response = await adminAPI.getPublicRoles()
        if (response?.data?.data) {
          setRoles(response.data.data)
        }
      } catch (err) {
        debugWarn("Failed to fetch roles:", err)
      }
    }
    fetchRoles()
  }, [])

  // Fetch business settings logo on mount
  useEffect(() => {
    const fetchLogo = async () => {
      try {
        const settings = await loadBusinessSettings()
        const adminLogo = getAppLogo('admin')
        if (adminLogo) {
          setLogoUrl(adminLogo)
        }
        if (settings?.companyName) {
          setCompanyName(settings.companyName)
        }
      } catch (error) {
        debugWarn("Failed to load business settings logo:", error)
      }
    }
    fetchLogo()

    const handleSettingsUpdate = async () => {
      const settings = await loadBusinessSettings();
      const adminLogo = getAppLogo('admin');
      if (adminLogo) {
        setLogoUrl(adminLogo);
      }
    };
    window.addEventListener('businessSettingsUpdated', handleSettingsUpdate);
    return () => window.removeEventListener('businessSettingsUpdated', handleSettingsUpdate);
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submittingRef.current) return

    setEmailError("")
    setPasswordError("")

    const trimmedEmail = email.trim()
    const trimmedPassword = password.trim()
    
    let hasError = false;

    if (activeTab === "email") {
      const validation = emailLoginSchema.safeParse({
        email: trimmedEmail,
        password: trimmedPassword
      })
      if (!validation.success) {
        validation.error.issues.forEach(issue => {
          if (issue.path[0] === 'email') setEmailError(issue.message)
          if (issue.path[0] === 'password') setPasswordError(issue.message)
        })
        hasError = true;
      }
    } else {
      const validation = employeeLoginSchema.safeParse({
        employeeId: trimmedEmail,
        password: trimmedPassword
      })
      if (!validation.success) {
        validation.error.issues.forEach(issue => {
          if (issue.path[0] === 'employeeId') setEmailError(issue.message)
          if (issue.path[0] === 'password') setPasswordError(issue.message)
        })
        hasError = true;
      }
    }
    
    if (hasError) return;

    submittingRef.current = true
    setIsLoading(true)

    try {
      const response = await adminAPI.login(trimmedEmail, trimmedPassword, selectedRoleId)
      const data = response?.data?.data || response?.data || {}

      const accessToken = data.accessToken
      const adminUser = data.user || data.admin
      const refreshToken = data.refreshToken ?? null

      if (!accessToken || !adminUser) {
        throw new Error("Invalid response from server")
      }
      if (!refreshToken) {
        throw new Error("Invalid response from server: missing refresh token")
      }
      toast.success("Login successful")
      setAuthData("admin", accessToken, adminUser, refreshToken)
      const resolvedPermissions = await resolveAdminPermissionsForUser(adminUser)
      const landingPath = getDefaultAdminLandingPath(adminUser, resolvedPermissions)
      window.location.href = landingPath
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Login failed. Please check your credentials."
      toast.error(message)
    } finally {
      setIsLoading(false)
      submittingRef.current = false
    }
  }

  return (
    <div className="flex min-h-screen bg-white md:bg-gray-50 flex-col md:flex-row">
      {/* Left Panel - Branding (Hidden on mobile) */}
      <div className="hidden md:flex md:w-1/2 lg:w-[55%] relative overflow-hidden bg-neutral-900 flex-col justify-between p-12 text-white">
        {/* Background elements */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 left-0 w-full h-full bg-linear-to-br from-neutral-900 to-black opacity-90" />
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full mix-blend-screen filter blur-3xl opacity-50 animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full mix-blend-screen filter blur-3xl opacity-30" />
          
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.05) 1px, transparent 0)', backgroundSize: '32px 32px' }}></div>
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md border border-white/10">
            <ShieldCheck className="h-8 w-8 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">{companyName || 'Administration'}</h2>
            <p className="text-xs text-neutral-400 uppercase tracking-wider font-semibold">Secure Portal</p>
          </div>
        </div>

        <div className="relative z-10 max-w-xl">
          <h1 className="text-4xl lg:text-5xl font-bold tracking-tight leading-tight mb-6">
            Manage your <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-400">
              business operations
            </span>
          </h1>
          <p className="text-lg text-neutral-300 leading-relaxed mb-8">
            Access the administrative dashboard to monitor performance, manage resources, and oversee daily operations from a single unified interface.
          </p>
          
          <div className="flex items-center gap-4 text-sm font-medium text-neutral-400">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              System Operational
            </div>
            <div className="w-1 h-1 rounded-full bg-neutral-700"></div>
            <div>Authorized Access Only</div>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 md:p-12 relative min-h-screen md:min-h-0 bg-white">
        
        {/* Mobile Header (Only visible on small screens) */}
        <div className="md:hidden absolute top-0 left-0 right-0 p-6 flex justify-between items-center">
           <div className="flex items-center gap-2">
            <div className="p-1.5 bg-neutral-900 rounded-lg">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg">{companyName || 'Admin'}</span>
          </div>
        </div>

        <div className="w-full max-w-md mt-16 md:mt-0">
          <div className="text-center mb-8">
            <div className="mx-auto w-16 h-16 bg-neutral-50 rounded-2xl border border-neutral-100 flex items-center justify-center mb-6 shadow-sm">
              <img
                src={logoUrl || "/logo.jpg"}
                alt="Logo"
                className="w-10 h-10 object-contain"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'block';
                }}
              />
              <ShieldCheck className="w-8 h-8 text-neutral-700 hidden" />
            </div>
            
            <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 tracking-tight">Admin Sign In</h2>
            <p className="text-neutral-500 mt-2">Enter your credentials to access the portal</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            
            {/* Login Method Toggle */}
            <div className="flex p-1 bg-neutral-100 rounded-lg mb-6">
              <button
                type="button"
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                  activeTab === 'email' 
                    ? 'bg-white text-neutral-900 shadow-sm' 
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
                onClick={() => {
                  setActiveTab('email');
                  setEmail('');
                  setEmailError('');
                  setPasswordError('');
                }}
                disabled={isLoading}
              >
                Email Address
              </button>
              <button
                type="button"
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                  activeTab === 'employee' 
                    ? 'bg-white text-neutral-900 shadow-sm' 
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
                onClick={() => {
                  setActiveTab('employee');
                  setEmail('');
                  setEmailError('');
                  setPasswordError('');
                }}
                disabled={isLoading}
              >
                Employee ID
              </button>
            </div>

            {/* Role Selector */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-neutral-700">Access Role</Label>
              <Select
                value={selectedRoleId}
                onValueChange={setSelectedRoleId}
                disabled={isLoading}
              >
                <SelectTrigger className="h-12 border-neutral-200 bg-neutral-50/50 text-base w-full focus:ring-primary/20 focus:border-primary">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">
                    <div className="flex items-center gap-2">
                      <UserCircle className="h-4 w-4 text-primary" />
                      Administrator
                    </div>
                  </SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r._id} value={r._id}>
                      {r.roleName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Identifier Input */}
            <div className="space-y-1.5">
              <Label htmlFor="identifier" className="text-sm font-medium text-neutral-700">
                {activeTab === 'email' ? 'Email Address' : 'Employee ID'}
              </Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  {activeTab === 'email' ? (
                     <Mail className="h-5 w-5 text-neutral-400" />
                  ) : (
                     <Hash className="h-5 w-5 text-neutral-400" />
                  )}
                </div>
                <Input
                  id="identifier"
                  type={activeTab === 'email' ? 'email' : 'text'}
                  placeholder={activeTab === 'email' ? 'admin@company.com' : 'EMPL001'}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (emailError) setEmailError("")
                  }}
                  disabled={isLoading}
                  autoComplete="off"
                  maxLength={100}
                  className={`h-12 pl-11 text-base bg-neutral-50/50 border-neutral-200 focus:bg-white focus:ring-primary/20 focus:border-primary transition-colors ${emailError ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                />
              </div>
              {emailError && (
                <p className="text-sm text-red-500 mt-1 font-medium">{emailError}</p>
              )}
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium text-neutral-700">Password</Label>
                <button
                  type="button"
                  onClick={() => navigate("/admin/forgot-password")}
                  className="text-sm text-primary font-medium hover:text-primary/80 transition-colors"
                  disabled={isLoading}
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                 <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <ShieldCheck className="h-5 w-5 text-neutral-400" />
                </div>
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (passwordError) setPasswordError("")
                  }}
                  disabled={isLoading}
                  autoComplete="current-password"
                  maxLength={50}
                  className={`h-12 pl-11 pr-11 text-base bg-neutral-50/50 border-neutral-200 focus:bg-white focus:ring-primary/20 focus:border-primary transition-colors [&::-ms-reveal]:hidden [&::-webkit-password-reveal-button]:hidden ${passwordError ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-0 top-0 h-full px-3.5 text-neutral-400 hover:text-neutral-600 focus:outline-none flex items-center justify-center"
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              {passwordError && (
                <p className="text-sm text-red-500 mt-1 font-medium">{passwordError}</p>
              )}
            </div>

            <Button
              type="submit"
              className="h-12 w-full mt-4 bg-neutral-900 text-white hover:bg-neutral-800 transition-colors text-base font-medium"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Authenticating...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2 w-full">
                  Sign In to Dashboard
                  <ArrowRight className="h-5 w-5" />
                </span>
              )}
            </Button>
            
          </form>

          <p className="text-center text-sm text-neutral-500 mt-8">
            Secure login provided by Dukaanwallah Admin Gateway
          </p>
        </div>
      </div>
    </div>
  )
}
