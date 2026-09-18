import { useState, useEffect } from "react"
import { UserPlus, Eye, EyeOff, Upload, ChevronDown } from "lucide-react"
import { toast } from "react-hot-toast"
import { useNavigate, useParams, useLocation } from "react-router-dom"
import axiosInstance from "@food/api"
import { cn } from "@food/utils/utils"
import FormPageShell from "@/shared/components/admin/FormPageShell"
import FormSection from "@/shared/components/admin/FormSection"
import FormField, { formInputClass } from "@/shared/components/admin/FormField"
import FormActions from "@/shared/components/admin/FormActions"

const NAME_REGEX = /^[A-Za-z][A-Za-z\s.'-]{0,49}$/
const EMAIL_REGEX = /^[a-z0-9._%+-]+@gmail\.com$/
const PHONE_REGEX = /^\d{10}$/
const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/gif"]

export default function AddEmployee() {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [roles, setRoles] = useState([])
  const [zones, setZones] = useState([])
  const [errors, setErrors] = useState({})
  const { id } = useParams()
  const location = useLocation()
  const isEditMode = !!id

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    zone: "All",
    role: "",
    phone: "",
    phoneCode: "+91",
    employeeImage: null,
    email: "",
    password: "",
    confirmPassword: "",
    workType: "Work From Office",
  })

  useEffect(() => {
    if (isEditMode && location.state?.employee) {
      const emp = location.state.employee;
      const nameParts = (emp.name || "").split(" ");
      setFormData(prev => ({
        ...prev,
        firstName: nameParts[0] || "",
        lastName: nameParts.slice(1).join(" ") || "",
        email: emp.email || "",
        phone: emp.phone?.replace("+91", "") || "",
        phoneCode: "+91",
        role: emp.adminRoleId?._id || emp.adminRoleId || "",
        zone: emp.zoneId || "All",
        workType: emp.workType || "Work From Office",
      }));
    }
  }, [isEditMode, location.state])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [rolesRes, zonesRes] = await Promise.all([
          axiosInstance.get("/food/admin/roles"),
          axiosInstance.get("/food/admin/zones")
        ])
        if (rolesRes.data.success) {
          setRoles(rolesRes.data.data || [])
        }
        if (zonesRes.data.success) {
          setZones(zonesRes.data.data.zones || [])
        }
      } catch (error) {
        toast.error("Failed to load roles and zones")
      }
    }
    fetchData()
  }, [])

  const handleInputChange = (field, value) => {
    let nextValue = value

    if (field === "firstName" || field === "lastName") {
      nextValue = value.replace(/[^A-Za-z\s.'-]/g, "").replace(/\s{2,}/g, " ").slice(0, 50)
    }

    if (field === "phone") {
      nextValue = value.replace(/\D/g, "").slice(0, 10)
    }

    if (field === "email") {
      nextValue = value.trim().toLowerCase()
    }

    setFormData(prev => ({ ...prev, [field]: nextValue }))
    setErrors(prev => ({ ...prev, [field]: "" }))
  }

  const handleFileUpload = (field, file) => {
    if (!file) return
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Please upload a JPG, PNG, or GIF image")
      return
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      toast.error("Image size must be 2 MB or less")
      return
    }
    setFormData(prev => ({ ...prev, [field]: file }))
    setErrors(prev => ({ ...prev, [field]: "" }))
  }

  const validateForm = () => {
    const nextErrors = {}
    const firstName = formData.firstName.trim()
    const lastName = formData.lastName.trim()
    const email = formData.email.trim().toLowerCase()
    const phone = formData.phone.trim()
    const password = formData.password
    const confirmPassword = formData.confirmPassword

    if (!firstName) {
      nextErrors.firstName = "First name is required"
    } else if (!NAME_REGEX.test(firstName)) {
      nextErrors.firstName = "First name can contain only letters and basic punctuation"
    }

    if (!lastName) {
      nextErrors.lastName = "Last name is required"
    } else if (!NAME_REGEX.test(lastName)) {
      nextErrors.lastName = "Last name can contain only letters and basic punctuation"
    }

    if (!formData.role) {
      nextErrors.role = "Please select a role"
    }

    if (!phone) {
      nextErrors.phone = "Phone number is required"
    } else if (!PHONE_REGEX.test(phone)) {
      nextErrors.phone = "Phone number must be exactly 10 digits"
    }

    if (!email) {
      nextErrors.email = "Email is required"
    } else if (!EMAIL_REGEX.test(email)) {
      nextErrors.email = "Enter a valid Gmail address"
    }

    if (!isEditMode) {
      if (!password) {
        nextErrors.password = "Password is required"
      } else if (password.length < 8) {
        nextErrors.password = "Password must be at least 8 characters"
      }

      if (!confirmPassword) {
        nextErrors.confirmPassword = "Confirm password is required"
      } else if (password !== confirmPassword) {
        nextErrors.confirmPassword = "Passwords do not match"
      }
    } else if (password || confirmPassword) {
      if (password.length < 8) {
        nextErrors.password = "Password must be at least 8 characters"
      }
      if (password !== confirmPassword) {
        nextErrors.confirmPassword = "Passwords do not match"
      }
    }

    setErrors(nextErrors)
    return nextErrors
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const validationErrors = validateForm()
    if (Object.keys(validationErrors).length > 0) {
      toast.error(Object.values(validationErrors)[0])
      return
    }

    try {
      setLoading(true)
      const data = new FormData()
      data.append('firstName', formData.firstName.trim())
      data.append('lastName', formData.lastName.trim())
      data.append('email', formData.email.trim().toLowerCase())
      if (formData.password) {
        data.append('password', formData.password)
      }
      data.append('phone', formData.phoneCode + formData.phone.trim())
      data.append('roleId', formData.role)
      data.append('zoneId', formData.zone)
      data.append('workType', formData.workType)

      if (formData.employeeImage) {
        data.append('employeeImage', formData.employeeImage)
      }

      let res;
      if (isEditMode) {
        res = await axiosInstance.patch(`/food/admin/employees/${id}`, data, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      } else {
        res = await axiosInstance.post("/food/admin/employees", data, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      }

      if (res.data.success) {
        toast.success(res.data.message)
        navigate("/admin/food/employees")
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to add employee")
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setFormData({
      firstName: "",
      lastName: "",
      zone: "All",
      role: "",
      phone: "",
      phoneCode: "+91",
      employeeImage: null,
      email: "",
      password: "",
      confirmPassword: "",
      workType: "Work From Office",
    })
    setErrors({})
  }

  return (
    <FormPageShell
      title={isEditMode ? "Update Employee" : "Add New Employee"}
      icon={<UserPlus className="h-5 w-5" />}
    >
      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          {/* General Information */}
          <FormSection title="General Information" bodyClassName="grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Side - Form Fields */}
            <div className="lg:col-span-2 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField label="First name" error={errors.firstName}>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => handleInputChange("firstName", e.target.value)}
                    placeholder="Ex: John"
                    className={cn(formInputClass, errors.firstName && "border-rose-500")}
                  />
                </FormField>

                <FormField label="Last name" error={errors.lastName}>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => handleInputChange("lastName", e.target.value)}
                    placeholder="Ex: Doe"
                    className={cn(formInputClass, errors.lastName && "border-rose-500")}
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField label="Zone">
                  <div className="relative">
                    <select
                      value={formData.zone}
                      onChange={(e) => handleInputChange("zone", e.target.value)}
                      className={cn(formInputClass, "pr-8 appearance-none cursor-pointer")}
                    >
                      <option value="All">All</option>
                      {zones.map(z => (
                        <option key={z._id} value={z._id}>{z.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  </div>
                </FormField>

                <FormField label="Role" error={errors.role}>
                  <div className="relative">
                    <select
                      value={formData.role}
                      onChange={(e) => handleInputChange("role", e.target.value)}
                      className={cn(formInputClass, "pr-8 appearance-none cursor-pointer", errors.role && "border-rose-500")}
                    >
                      <option value="">Select Role</option>
                      {roles.filter(r => r.status === 'active').map(r => (
                        <option key={r._id} value={r._id}>{r.roleName}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  </div>
                </FormField>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField label="Phone" error={errors.phone}>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <select
                        value={formData.phoneCode}
                        onChange={(e) => handleInputChange("phoneCode", e.target.value)}
                        className={cn(formInputClass, "pr-8 appearance-none cursor-pointer w-auto")}
                      >
                        <option value="+91">🇮🇳 +91</option>
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    </div>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => handleInputChange("phone", e.target.value)}
                      placeholder="Phone number"
                      inputMode="numeric"
                      maxLength={10}
                      className={cn(formInputClass, "flex-1", errors.phone && "border-rose-500")}
                    />
                  </div>
                </FormField>

                <FormField label="Work Type">
                  <div className="relative">
                    <select
                      value={formData.workType}
                      onChange={(e) => handleInputChange("workType", e.target.value)}
                      className={cn(formInputClass, "pr-8 appearance-none cursor-pointer")}
                    >
                      <option value="Work From Home">Work From Home</option>
                      <option value="Work From Office">Work From Office</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  </div>
                </FormField>
              </div>
            </div>

            {/* Right Side - Employee Image */}
            <FormField label="Employee image">
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer">
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif"
                  onChange={(e) => handleFileUpload("employeeImage", e.target.files[0])}
                  className="hidden"
                  id="employee-image-upload"
                />
                <label htmlFor="employee-image-upload" className="cursor-pointer">
                  {formData.employeeImage ? (
                    <div className="w-full h-32 flex justify-center object-cover">
                      <img
                        src={URL.createObjectURL(formData.employeeImage)}
                        alt="Preview"
                        className="h-full rounded object-contain"
                      />
                    </div>
                  ) : (
                    <>
                      <Upload className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                      <p className="text-sm font-medium text-slate-700 mb-1">Upload Image</p>
                      <div className="text-xs text-slate-500 space-y-1 mt-2">
                        <p>Image format - jpg png jpeg gif</p>
                        <p>Image Size - maximum size 2 MB</p>
                        <p>Image Ratio - 1:1</p>
                      </div>
                    </>
                  )}
                </label>
              </div>
            </FormField>
          </FormSection>

          {/* Account Info */}
          <FormSection title="Account Info" bodyClassName="grid-cols-1 gap-6">
            <FormField label="Email" error={errors.email}>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                placeholder="Ex: ex@gmail.com"
                className={cn(formInputClass, errors.email && "border-rose-500")}
              />
            </FormField>

            <FormField
              label={<>Password {isEditMode && <span className="text-xs text-slate-400 font-normal">(Leave blank to keep current)</span>}</>}
              error={errors.password}
            >
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => handleInputChange("password", e.target.value)}
                  placeholder="Password length 8+"
                  className={cn(formInputClass, "pr-10", errors.password && "border-rose-500")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </FormField>

            <FormField
              label={<>Confirm Password {isEditMode && <span className="text-xs text-slate-400 font-normal">(Leave blank to keep current)</span>}</>}
              error={errors.confirmPassword}
            >
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={formData.confirmPassword}
                  onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                  placeholder="Password length 8+"
                  className={cn(formInputClass, "pr-10", errors.confirmPassword && "border-rose-500")}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </FormField>
          </FormSection>

          {/* Action Buttons */}
          <FormActions
            onCancel={handleReset}
            cancelLabel="Reset"
            submitLabel={loading ? "Submitting..." : isEditMode ? "Update" : "Submit"}
            submitting={loading}
          />
        </div>
      </form>
    </FormPageShell>
  )
}
