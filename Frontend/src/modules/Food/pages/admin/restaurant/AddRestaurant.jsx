import { useState, useRef, useEffect } from "react"
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey"
import { useNavigate } from "react-router-dom"
import { Building2, Info, Tag, Upload, Calendar, FileText, MapPin, CheckCircle2, X, Image as ImageIcon, Clock, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@food/components/ui/dialog"
import { Input } from "@food/components/ui/input"
import { adminAPI, uploadAPI, zoneAPI } from "@food/api"
import { filterValidOnboardingImages, ONBOARDING_IMAGE_ACCEPT, validateOnboardingImageFile } from "@food/utils/onboardingImageValidation"
import { toast } from "sonner"
import { MobileTimePicker } from "@mui/x-date-pickers/MobileTimePicker"
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider"
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns"
import FormPageShell from "@/shared/components/admin/FormPageShell"
import FormSection from "@/shared/components/admin/FormSection"
import FormField, { formInputClass } from "@/shared/components/admin/FormField"
import FormActions from "@/shared/components/admin/FormActions"
import { cn } from "@food/utils/utils"
const debugLog = (...args) => {}
const debugWarn = (...args) => { console.warn(...args) }
const debugError = (...args) => { console.error(...args) }


const ESTIMATED_DELIVERY_TIME_OPTIONS = [
  "10-15 mins",
  "15-20 mins",
  "20-25 mins",
  "25-30 mins",
  "30-35 mins",
  "35-40 mins",
  "40-45 mins",
  "45-50 mins",
  "50-60 mins",
]

const ALL_CUISINES = [
  "Burger", "Chinese", "Momos", "North Indian", "Pizza", "Rolls", 
  "Sandwich", "Shawarma", "South Indian", "Biryani", "Desserts", 
  "Ice Cream", "Fast Food", "Cafe", "Italian", "Mexican", "Thai", 
  "Seafood", "Salad", "Healthy Food", "Juices", "Beverages", 
  "Punjabi", "Gujarati", "Rajasthani", "Mughlai", "Street Food", "Bakery",
]

const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_REGEX = /^\d{10}$/
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const FSSAI_REGEX = /^\d{14}$/
const ACCOUNT_NUMBER_REGEX = /^\d{9,18}$/
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const NAME_REGEX = /^[A-Za-z][A-Za-z\s.'-]*$/
const sanitizeDigits = (value = "") => value.replace(/\D/g, "")
const sanitizePan = (value = "") => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10)
const sanitizeFssai = (value = "") => value.replace(/\D/g, "").slice(0, 14)
const sanitizeIfsc = (value = "") => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11)
const sanitizeGst = (value = "") => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 15)
const normalizeName = (value = "") => value.replace(/\s+/g, " ").trimStart()
const hasLetters = (value = "") => /[A-Za-z]/.test(value)
const getTodayLocalYMD = () => new Date().toISOString().split("T")[0]
const timeStringToMinutes = (value = "") => {
  const raw = String(value || "").trim()
  if (!/^\d{2}:\d{2}$/.test(raw)) return null
  const [hours, minutes] = raw.split(":").map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}
const getStoredFileLabel = (value) => {
  if (!value) return ""
  if (value instanceof File) return value.name
  if (typeof value === "string") return value.split("/").pop() || "Uploaded document"
  if (value?.url) return value.url.split("/").pop() || "Uploaded document"
  return "Uploaded document"
}
const getStoredImageSrc = (value) => {
  if (!value) return ""
  if (value instanceof File) return URL.createObjectURL(value)
  if (typeof value === "string") return value
  if (value?.url) return value.url
  return ""
}
const isUploadableFile = (value) => {
  if (!value || typeof value !== "object") return false
  if (typeof File !== "undefined" && value instanceof File) return true
  if (typeof Blob !== "undefined" && value instanceof Blob) return true
  return (
    typeof value.size === "number" &&
    (typeof value.slice === "function" || typeof value.arrayBuffer === "function")
  )
}

const MAX_MENU_FILES = 10
const IMAGE_FILE_ACCEPT = ONBOARDING_IMAGE_ACCEPT

// Time Utils
const normalizeTimeValue = (value) => {
  if (!value) return ""
  const raw = String(value).trim()
  if (!raw) return ""
  if (/^\d{2}:\d{2}$/.test(raw)) return raw
  if (/^\d{1}:\d{2}$/.test(raw)) {
    const [h, m] = raw.split(":")
    return `${h.padStart(2, "0")}:${m}`
  }
  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    return timeToString(parsed)
  }
  return ""
}
const stringToTime = (timeString) => {
  const normalized = normalizeTimeValue(timeString)
  if (!normalized || !normalized.includes(":")) return null
  const [hours, minutes] = normalized.split(":").map(Number)
  return new Date(2000, 0, 1, hours || 0, minutes || 0)
}
const timeToString = (date) => {
  if (!date) return ""
  const hours = date.getHours().toString().padStart(2, "0")
  const minutes = date.getMinutes().toString().padStart(2, "0")
  return `${hours}:${minutes}`
}

function TimeSelector({ label, value, onChange, error }) {
  const timeParsed = stringToTime(value)
  const handleTimeChange = (newValue) => {
    if (!newValue) {
      onChange("")
      return
    }
    onChange(timeToString(newValue))
  }
  return (
    <div className={`border rounded-md px-1.5 py-1 sm:px-2 sm:py-1.5 bg-gray-50 flex-1 flex flex-col justify-center min-w-0 ${error ? 'border-red-500' : 'border-gray-200'}`}>
      <div className="flex items-center gap-1 mb-1">
        <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-800" />
        <span className="text-[10px] sm:text-[11px] font-medium text-gray-900 truncate">{label}</span>
      </div>
      <MobileTimePicker
        value={timeParsed}
        onChange={handleTimeChange}
        onAccept={handleTimeChange}
        slotProps={{
          textField: {
            variant: "outlined",
            size: "small",
            placeholder: "Select time",
            sx: {
              width: "100%",
              "& .MuiOutlinedInput-root": {
                height: "30px",
                fontSize: "11px",
                backgroundColor: "white",
                "& fieldset": { borderColor: "#e5e7eb" },
                "&:hover fieldset": { borderColor: "#d1d5db" },
                "&.Mui-focused fieldset": { borderColor: "#000" },
              },
              "& .MuiInputBase-input": {
                padding: "4px 6px",
                fontSize: "11px",
              },
            },
            onBlur: (event) => {
              const normalized = normalizeTimeValue(event?.target?.value)
              if (normalized) onChange(normalized)
            },
          },
        }}
      />
      {error && <p className="text-red-500 text-[10px] mt-1 truncate">{error}</p>}
    </div>
  )
}

const defaultDayTimings = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => ({
  day,
  openingTime: "09:00",
  closingTime: "23:59",
  isOpen: true
}));

export default function AddRestaurant() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [fieldErrors, setFieldErrors] = useState({})
  const [zones, setZones] = useState([])
  const [zonesLoading, setZonesLoading] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [draftId, setDraftId] = useState("")

  // Step 1: Basic Info
  const [step1, setStep1] = useState({
    restaurantName: "",
    pureVegRestaurant: null,
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
    primaryContactNumber: "",
    zoneId: "",
    location: {
      addressLine1: "",
      addressLine2: "",
      area: "",
      city: "",
      state: "",
      pincode: "",
      landmark: "",
      formattedAddress: "",
      latitude: "",
      longitude: "",
    },
  })

  // Step 2: Images & Operational
  const [step2, setStep2] = useState({
    menuImages: [],
    profileImage: null,
    cuisines: [],
    estimatedDeliveryTime: "",
    openingTime: "",
    closingTime: "",
    openDays: [],
    dayTimings: defaultDayTimings,
    showRestaurantToUsersWithoutItems: false,
  })

  // Step 3: Documents
  const [step3, setStep3] = useState({
    panNumber: "",
    nameOnPan: "",
    panImage: null,
    gstRegistered: false,
    gstNumber: "",
    gstLegalName: "",
    gstAddress: "",
    gstImage: null,
    fssaiNumber: "",
    fssaiExpiry: "",
    fssaiImage: null,
    accountNumber: "",
    confirmAccountNumber: "",
    ifscCode: "",
    accountHolderName: "",
    accountType: "",
  })

  const languageTabs = [
    { key: "default", label: "Default" },
    { key: "en", label: "English(EN)" },
    { key: "bn", label: "Bengali - ?????(BN)" },
    { key: "ar", label: "Arabic - ??????? (AR)" },
    { key: "es", label: "Spanish - espa�ol(ES)" },
  ]

  const mainContentRef = useRef(null)

  const clearPersistedFormData = async () => {
    if (!draftId) return
    try {
      await adminAPI.discardRestaurantDraft(draftId)
    } catch (err) {
      if (err?.response?.status !== 404) {
        debugError("Failed to discard restaurant draft:", err)
      }
    }
  }

  useEffect(() => {
    let cancelled = false

    const restoreFormData = async () => {
      try {
        const res = await adminAPI.getRestaurantDraft()
        const draft = res?.data?.data?.restaurant || res?.data?.data?.draft || res?.data?.restaurant || null
        if (!draft || cancelled) return

        setDraftId(String(draft._id || draft.id || ""))
        setStep(Math.min(Math.max(Number(draft.onboardingStep || 1), 1), 3))
        setStep1((prev) => ({
          ...prev,
          restaurantName: draft.restaurantName || draft.name || "",
          pureVegRestaurant: typeof draft.pureVegRestaurant === "boolean" ? draft.pureVegRestaurant : null,
          ownerName: draft.ownerName || "",
          ownerEmail: draft.ownerEmail || "",
          ownerPhone: draft.ownerPhone || "",
          primaryContactNumber: draft.primaryContactNumber || draft.ownerPhone || "",
          zoneId: String(draft.zoneId?._id || draft.zoneId || ""),
          location: {
            ...prev.location,
            addressLine1: draft.location?.addressLine1 || draft.location?.address || "",
            addressLine2: draft.location?.addressLine2 || "",
            area: draft.location?.area || "",
            city: draft.location?.city || "",
            state: draft.location?.state || "",
            pincode: draft.location?.pincode || "",
            landmark: draft.location?.landmark || "",
            formattedAddress: draft.location?.formattedAddress || draft.location?.address || "",
            latitude: draft.location?.latitude ?? draft.location?.coordinates?.[1] ?? "",
            longitude: draft.location?.longitude ?? draft.location?.coordinates?.[0] ?? "",
          },
        }))
        setStep2((prev) => ({
          ...prev,
          menuImages: Array.isArray(draft.menuImages) ? draft.menuImages : [],
          profileImage: draft.profileImage || null,
          cuisines: Array.isArray(draft.cuisines) ? draft.cuisines : [],
          estimatedDeliveryTime: draft.estimatedDeliveryTime || "",
          openingTime: draft.openingTime || "",
          closingTime: draft.closingTime || "",
          openDays: Array.isArray(draft.openDays) ? draft.openDays : [],
          showRestaurantToUsersWithoutItems: !!draft.showRestaurantToUsersWithoutItems,
          dayTimings: Array.isArray(draft.dayTimings) && draft.dayTimings.length > 0 ? draft.dayTimings : defaultDayTimings,
        }))
        setStep3((prev) => ({
          ...prev,
          panNumber: draft.panNumber || "",
          nameOnPan: draft.nameOnPan || "",
          panImage: draft.panImage || null,
          gstRegistered: !!draft.gstRegistered,
          gstNumber: draft.gstNumber || "",
          gstLegalName: draft.gstLegalName || "",
          gstAddress: draft.gstAddress || "",
          gstImage: draft.gstImage || null,
          fssaiNumber: draft.fssaiNumber || "",
          fssaiExpiry: draft.fssaiExpiry ? String(draft.fssaiExpiry).slice(0, 10) : "",
          fssaiImage: draft.fssaiImage || null,
          accountNumber: draft.accountNumber || "",
          confirmAccountNumber: draft.accountNumber || "",
          ifscCode: draft.ifscCode || "",
          accountHolderName: draft.accountHolderName || "",
          accountType: draft.accountType || "",
        }))
      } catch (err) {
        if (err?.response?.status !== 404) {
          debugError("Failed to restore admin restaurant draft:", err)
        }
      } finally {
        if (!cancelled) setIsHydrated(true)
      }
    }

    restoreFormData()

    return () => {
      cancelled = true
    }
  }, [])

  // Keep UX consistent: each step opens from top after Next/Back.
  useEffect(() => {
    const contentEl = mainContentRef.current
    if (contentEl?.scrollTo) contentEl.scrollTo({ top: 0, behavior: "auto" })
    if (typeof window !== "undefined" && window.scrollTo) window.scrollTo({ top: 0, behavior: "auto" })
    if (typeof document !== "undefined") {
      if (document.documentElement) document.documentElement.scrollTop = 0
      if (document.body) document.body.scrollTop = 0
    }
  }, [step])

  // Upload handler for images
  const handleUpload = async (file, folder) => {
    try {
      const res = await uploadAPI.uploadMedia(file, { folder })
      const d = res?.data?.data || res?.data
      return { url: d.url, publicId: d.publicId }
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to upload image"
      debugError("Upload error:", errorMsg, err)
      throw new Error(`Image upload failed: ${errorMsg}`)
    }
  }

  const normalizeImageAsset = (value) => {
    if (!value) return null
    if (typeof value === "string") return value
    if (value?.url) return value
    return null
  }

  const resolveStep2ImagesForDraft = async () => {
    let profileImage = normalizeImageAsset(step2.profileImage)
    if (isUploadableFile(step2.profileImage)) {
      profileImage = await handleUpload(step2.profileImage, "appzeto/restaurant/profile")
    }

    const menuImages = []
    for (const image of (step2.menuImages || []).slice(0, MAX_MENU_FILES)) {
      if (isUploadableFile(image)) {
        menuImages.push(await handleUpload(image, "appzeto/restaurant/menu"))
      } else {
        const existing = normalizeImageAsset(image)
        if (existing) menuImages.push(existing)
      }
    }

    return { profileImage, menuImages }
  }

  const resolveStep3ImagesForDraft = async () => {
    let panImage = normalizeImageAsset(step3.panImage)
    if (isUploadableFile(step3.panImage)) {
      panImage = await handleUpload(step3.panImage, "appzeto/restaurant/pan")
    }

    let gstImage = normalizeImageAsset(step3.gstImage)
    if (step3.gstRegistered && isUploadableFile(step3.gstImage)) {
      gstImage = await handleUpload(step3.gstImage, "appzeto/restaurant/gst")
    }

    let fssaiImage = normalizeImageAsset(step3.fssaiImage)
    if (isUploadableFile(step3.fssaiImage)) {
      fssaiImage = await handleUpload(step3.fssaiImage, "appzeto/restaurant/fssai")
    }

    return {
      panImage,
      gstImage: step3.gstRegistered ? gstImage : null,
      fssaiImage,
    }
  }

  const buildAdminDraftPayload = ({ onboardingStep, images = {} } = {}) => ({
    draftId: draftId || undefined,
    onboardingStep: onboardingStep || step,
    step: onboardingStep || step,
    restaurantName: step1.restaurantName,
    pureVegRestaurant: step1.pureVegRestaurant,
    ownerName: step1.ownerName,
    ownerEmail: step1.ownerEmail,
    ownerPhone: step1.ownerPhone,
    primaryContactNumber: step1.primaryContactNumber,
    zoneId: step1.zoneId,
    location: step1.location,
    menuImages: images.menuImages ?? step2.menuImages.filter((img) => !isUploadableFile(img)),
    profileImage: images.profileImage ?? normalizeImageAsset(step2.profileImage),
    cuisines: step2.cuisines,
    estimatedDeliveryTime: step2.estimatedDeliveryTime,
    openingTime: step2.openingTime,
    closingTime: step2.closingTime,
    openDays: step2.openDays,
    dayTimings: step2.dayTimings,
    showRestaurantToUsersWithoutItems: step2.showRestaurantToUsersWithoutItems,
    panNumber: step3.panNumber,
    nameOnPan: step3.nameOnPan,
    panImage: images.panImage ?? normalizeImageAsset(step3.panImage),
    gstRegistered: step3.gstRegistered,
    gstNumber: step3.gstNumber,
    gstLegalName: step3.gstLegalName,
    gstAddress: step3.gstAddress,
    gstImage: step3.gstRegistered ? (images.gstImage ?? normalizeImageAsset(step3.gstImage)) : null,
    fssaiNumber: step3.fssaiNumber,
    fssaiExpiry: step3.fssaiExpiry,
    fssaiImage: images.fssaiImage ?? normalizeImageAsset(step3.fssaiImage),
    accountNumber: step3.accountNumber,
    ifscCode: step3.ifscCode,
    accountHolderName: step3.accountHolderName,
    accountType: step3.accountType,
  })

  const saveDraftStep = async (nextStep) => {
    const images = {}
    if (step >= 2) Object.assign(images, await resolveStep2ImagesForDraft())
    if (step >= 3) Object.assign(images, await resolveStep3ImagesForDraft())
    const response = await adminAPI.saveRestaurantDraft(buildAdminDraftPayload({ onboardingStep: nextStep, images }))
    const draft = response?.data?.data?.restaurant || response?.data?.data?.draft || response?.data?.restaurant
    if (draft?._id || draft?.id) setDraftId(String(draft._id || draft.id))
    if (step >= 2) {
      setStep2((prev) => ({
        ...prev,
        profileImage: images.profileImage ?? prev.profileImage,
        menuImages: images.menuImages ?? prev.menuImages,
      }))
    }
    if (step >= 3) {
      setStep3((prev) => ({
        ...prev,
        panImage: images.panImage ?? prev.panImage,
        gstImage: images.gstImage ?? prev.gstImage,
        fssaiImage: images.fssaiImage ?? prev.fssaiImage,
      }))
    }
    return draft
  }

  // Validation functions
  const validateStep1 = () => {
    const errors = []
    const fErrors = {}
    if (!step1.restaurantName?.trim()) { errors.push("Restaurant name is required"); fErrors.restaurantName = "Required"; }
    else if (step1.restaurantName.trim().length < 2) { errors.push("Restaurant name must be at least 2 characters"); fErrors.restaurantName = "Min 2 chars"; }
    else if (step1.restaurantName.trim().length > 100) { errors.push("Restaurant name must be max 100 characters"); fErrors.restaurantName = "Max 100 chars"; }
    if (typeof step1.pureVegRestaurant !== "boolean") { errors.push("Please select whether restaurant is pure veg"); fErrors.pureVegRestaurant = "Required"; }
    if (!step1.ownerName?.trim()) { errors.push("Owner name is required"); fErrors.ownerName = "Required"; }
    else if (step1.ownerName.trim().length < 2) { errors.push("Owner name must be at least 2 characters"); fErrors.ownerName = "Min 2 chars"; }
    else if (step1.ownerName.trim().length > 50) { errors.push("Owner name must be max 50 characters"); fErrors.ownerName = "Max 50 chars"; }
    else if (!NAME_REGEX.test(step1.ownerName.trim()) || !hasLetters(step1.ownerName)) { errors.push("Owner name must contain valid characters"); fErrors.ownerName = "Invalid name"; }
    if (!step1.ownerEmail?.trim()) { errors.push("Owner email is required"); fErrors.ownerEmail = "Required"; }
    else if (!EMAIL_REGEX.test(step1.ownerEmail.trim())) { errors.push("Please enter a valid email address"); fErrors.ownerEmail = "Invalid email"; }
    if (!step1.ownerPhone?.trim()) { errors.push("Owner phone number is required"); fErrors.ownerPhone = "Required"; }
    else if (!PHONE_REGEX.test(step1.ownerPhone.trim())) { errors.push("Owner phone number must be 10 digits"); fErrors.ownerPhone = "Must be 10 digits"; }
    if (!step1.primaryContactNumber?.trim()) { errors.push("Primary contact number is required"); fErrors.primaryContactNumber = "Required"; }
    else if (!PHONE_REGEX.test(step1.primaryContactNumber.trim())) { errors.push("Primary contact number must be 10 digits"); fErrors.primaryContactNumber = "Must be 10 digits"; }
    if (!step1.zoneId?.trim()) { errors.push("Service zone is required"); fErrors.zoneId = "Required"; }
    if (!step1.location?.addressLine1?.trim()) { errors.push("Address line 1 is required"); fErrors.addressLine1 = "Required"; }
    if (!step1.location?.area?.trim()) { errors.push("Area/Sector/Locality is required"); fErrors.area = "Required"; }
    if (!step1.location?.city?.trim()) { errors.push("City is required"); fErrors.city = "Required"; }
    if (!step1.location?.state?.trim()) { errors.push("State is required"); fErrors.state = "Required"; }
    if (!/^\d{6}$/.test(step1.location?.pincode || "")) { errors.push("Pincode must be exactly 6 digits"); fErrors.pincode = "Must be 6 digits"; }
    if (!step1.location?.latitude || !step1.location?.longitude) { errors.push("Map coordinates are required"); fErrors.locationSearch = "Coordinates required"; }
    setFieldErrors(prev => ({ ...prev, ...fErrors }))
    return errors
  }

  const validateStep2 = () => {
    const errors = []
    const fErrors = {}
    if (!step2.menuImages || step2.menuImages.length === 0) { errors.push("At least one menu image is required"); fErrors.menuImages = "Required"; }
    if (!step2.profileImage) { errors.push("Restaurant profile image is required"); fErrors.profileImage = "Required"; }
    if (!step2.cuisines || step2.cuisines.length === 0) { errors.push("Please select at least one cuisine"); fErrors.cuisines = "Select at least 1 cuisine"; }
    if (!step2.estimatedDeliveryTime?.trim()) { errors.push("Estimated delivery time is required"); fErrors.estimatedDeliveryTime = "Required"; }
    const isAnyDayOpen = step2.dayTimings.some(d => d.isOpen)
    if (!isAnyDayOpen) { errors.push("Please select at least one open day"); fErrors.dayTimings = "Select at least one open day"; }
    if (isAnyDayOpen) {
      step2.dayTimings.forEach(d => {
        if (d.isOpen && (!d.openingTime || !d.closingTime)) {
          if (!d.openingTime) fErrors[`openingTime_${d.day}`] = "Required";
          if (!d.closingTime) fErrors[`closingTime_${d.day}`] = "Required";
          if (!errors.includes("Opening and closing time are required for each open day")) {
            errors.push("Opening and closing time are required for each open day");
          }
        }
      });
    }
    setFieldErrors(prev => ({ ...prev, ...fErrors }))
    return errors
  }

  const validateStep3 = () => {
    const errors = []
    const fErrors = {}
    if (!step3.panNumber?.trim()) { errors.push("PAN number is required"); fErrors.panNumber = "Required"; }
    else if (!PAN_REGEX.test(step3.panNumber.trim())) { errors.push("PAN number must be in valid format"); fErrors.panNumber = "Invalid PAN"; }
    if (!step3.nameOnPan?.trim()) { errors.push("Name on PAN is required"); fErrors.nameOnPan = "Required"; }
    else if (!NAME_REGEX.test(step3.nameOnPan.trim()) || !hasLetters(step3.nameOnPan)) { errors.push("Name on PAN must contain characters only"); fErrors.nameOnPan = "Invalid name"; }
    if (!step3.panImage) { errors.push("PAN image is required"); fErrors.panImage = "Required"; }
    
    if (!step3.fssaiNumber?.trim()) { errors.push("FSSAI number is required"); fErrors.fssaiNumber = "Required"; }
    else if (!FSSAI_REGEX.test(step3.fssaiNumber.trim())) { errors.push("FSSAI number must be 14 digits"); fErrors.fssaiNumber = "Must be 14 digits"; }
    if (!step3.fssaiExpiry?.trim()) { errors.push("FSSAI expiry date is required"); fErrors.fssaiExpiry = "Required"; }
    else if (step3.fssaiExpiry < getTodayLocalYMD()) { errors.push("FSSAI expiry date cannot be in the past"); fErrors.fssaiExpiry = "Cannot be in past"; }
    if (!step3.fssaiImage) { errors.push("FSSAI image is required"); fErrors.fssaiImage = "Required"; }
    
    if (step3.gstRegistered) {
      if (!step3.gstNumber?.trim()) { errors.push("GST number is required when GST registered"); fErrors.gstNumber = "Required"; }
      else if (!GST_REGEX.test(step3.gstNumber.trim())) { errors.push("GST number must be in valid format"); fErrors.gstNumber = "Invalid GST"; }
      if (!step3.gstLegalName?.trim()) { errors.push("GST legal name is required when GST registered"); fErrors.gstLegalName = "Required"; }
      else if (!NAME_REGEX.test(step3.gstLegalName.trim()) || !hasLetters(step3.gstLegalName)) { errors.push("GST legal name must contain characters only"); fErrors.gstLegalName = "Invalid name"; }
      if (!step3.gstAddress?.trim()) { errors.push("GST registered address is required when GST registered"); fErrors.gstAddress = "Required"; }
      else if (/^\d+$/.test(step3.gstAddress.trim())) { errors.push("GST registered address cannot contain only numbers"); fErrors.gstAddress = "Invalid address"; }
      if (!step3.gstImage) { errors.push("GST image is required when GST registered"); fErrors.gstImage = "Required"; }
    }
    
    if (!step3.accountNumber?.trim()) { errors.push("Account number is required"); fErrors.accountNumber = "Required"; }
    else if (!ACCOUNT_NUMBER_REGEX.test(step3.accountNumber.trim())) { errors.push("Account number must be 9 to 18 digits"); fErrors.accountNumber = "Invalid account number"; }
    
    if (step3.accountNumber !== step3.confirmAccountNumber) { errors.push("Account number and confirmation do not match"); fErrors.confirmAccountNumber = "Does not match"; }
    
    if (!step3.ifscCode?.trim()) { errors.push("IFSC code is required"); fErrors.ifscCode = "Required"; }
    else if (!IFSC_REGEX.test(step3.ifscCode.trim())) { errors.push("IFSC code must be in valid format"); fErrors.ifscCode = "Invalid IFSC"; }
    
    if (!step3.accountHolderName?.trim()) { errors.push("Account holder name is required"); fErrors.accountHolderName = "Required"; }
    else if (!NAME_REGEX.test(step3.accountHolderName.trim()) || !hasLetters(step3.accountHolderName)) { errors.push("Account holder name must contain characters only"); fErrors.accountHolderName = "Invalid name"; }
    
    if (!step3.accountType?.trim()) { errors.push("Account type is required"); fErrors.accountType = "Required"; }
    else if (!["Saving", "Current"].includes(step3.accountType.trim())) { errors.push("Account type must be either Saving or Current"); fErrors.accountType = "Invalid type"; }
    
    setFieldErrors(prev => ({ ...prev, ...fErrors }))
    return errors
  }

  const handleNext = async () => {
    setFormErrors({})
    let validationErrors = []

    if (step === 1) {
      validationErrors = validateStep1()
    } else if (step === 2) {
      validationErrors = validateStep2()
    } else if (step === 3) {
      validationErrors = validateStep3()
    }

    if (validationErrors.length > 0) {
      toast.error("Please fill all required fields correctly")
      return
    }

    if (step < 3) {
      setIsSubmitting(true)
      try {
        const nextStep = step + 1
        await saveDraftStep(nextStep)
        setStep(nextStep)
      } catch (error) {
        debugError("Failed to save restaurant draft:", error)
        toast.error(error?.response?.data?.message || error?.message || "Failed to save restaurant draft")
      } finally {
        setIsSubmitting(false)
      }
    } else {
      await handleSubmit()
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setFormErrors({})

    try {
      const draft = await saveDraftStep(5)
      const id = String(draft?._id || draft?.id || draftId || "")
      if (!id) throw new Error("Draft id is required to finalize restaurant")
      const response = await adminAPI.finalizeRestaurantDraft(id)

      const data = response?.data?.data ?? response?.data
      if (response?.data?.success !== false && data) {
        toast.success("Restaurant created successfully!")
        setShowSuccessDialog(true)
        setTimeout(() => {
          navigate("/admin/food/restaurants")
        }, 2000)
      } else {
        throw new Error(response?.data?.message || "Failed to create restaurant")
      }
    } catch (error) {
      debugError("Error creating restaurant:", error)
      const errorMsg = error?.response?.data?.message || error?.message || "Failed to create restaurant. Please try again."
      toast.error(errorMsg)
      setFormErrors({ submit: errorMsg })
    } finally {
      setIsSubmitting(false)
    }
  }

  const locationSearchInputRef = useRef(null)
  const placesAutocompleteRef = useRef(null)
  const mapsScriptLoadedRef = useRef(false)

  // Manual search states for fallback
  const [locationSearchValue, setLocationSearchValue] = useState("")
  const [locationSuggestions, setLocationSuggestions] = useState([])
  const [isSearchingLocation, setIsSearchingLocation] = useState(false)
  const [locationPickedFromSuggestion, setLocationPickedFromSuggestion] = useState(true)

  useEffect(() => {
    if (step !== 1) return
    let cancelled = false
    setZonesLoading(true)
    zoneAPI
      .getPublicZones()
      .then((res) => {
        const list = res?.data?.data?.zones || res?.data?.zones || []
        if (!cancelled) setZones(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        if (!cancelled) setZones([])
      })
      .finally(() => {
        if (!cancelled) setZonesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [step])

  // Initialize Google Places Autocomplete for Step 1 location search.
  useEffect(() => {
    if (step !== 1) return

    let cancelled = false
    let autocomplete = null

    const init = async () => {
      // Wait for the input ref to be attached
      let inputElement = null
      for (let i = 0; i < 50; i++) {
        if (locationSearchInputRef.current) {
          inputElement = locationSearchInputRef.current
          break
        }
        await new Promise((r) => setTimeout(r, 100))
      }
      
      if (!inputElement || cancelled) return

      const loadMaps = async () => {
        // 1. If already fully loaded and available
        if (window.google?.maps?.places?.Autocomplete) {
          mapsScriptLoadedRef.current = true
          return true
        }

        // 2. Load API Key
        const apiKey = await getGoogleMapsApiKey()
        if (!apiKey) {
          debugError("Google Maps API Key missing or invalid")
          return false
        }

        // 3. Catch Google Maps authentication failures
        window.gm_authFailure = () => {
          debugError("Google Maps authentication failed.")
        }

        // 4. Check for any existing script and force libraries=places
        const scripts = Array.from(document.getElementsByTagName("script"))
        const mapsScript = scripts.find(s => s.src?.includes("maps.googleapis.com/maps/api/js"))
        
        if (mapsScript && !mapsScript.src.includes("libraries=places")) {
          mapsScript.remove()
        } else if (mapsScript && mapsScript.src.includes("libraries=places")) {
           for (let i = 0; i < 60; i++) {
              if (window.google?.maps?.places?.Autocomplete) return true
              if (cancelled) return false
              await new Promise(r => setTimeout(r, 100))
           }
        }

        // 5. Create and append new script
        return new Promise((resolve) => {
          const script = document.createElement("script")
          script.id = "google-maps-sdk"
          script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&v=weekly`
          script.async = true
          script.defer = true
          script.onload = () => {
            setTimeout(() => {
              const ok = !!window.google?.maps?.places?.Autocomplete
              mapsScriptLoadedRef.current = ok
              resolve(ok)
            }, 200)
          }
          script.onerror = () => resolve(false)
          document.head.appendChild(script)
        })
      }

      const parsePlace = (place) => {
        const formattedAddress = place?.formatted_address || ""
        const comps = Array.isArray(place?.address_components) ? place.address_components : []
        const get = (types) => comps.find((c) => types.some((t) => c.types?.includes(t)))?.long_name || ""
        
        const area = get(["sublocality_level_1", "sublocality", "neighborhood"]) || get(["locality"])
        const city = get(["locality"]) || get(["administrative_area_level_2"])
        const state = get(["administrative_area_level_1"]) || get(["administrative_area_level_2"])
        const pincode = get(["postal_code"])
        const lat = place?.geometry?.location?.lat?.()
        const lng = place?.geometry?.location?.lng?.()
        
        return {
          formattedAddress,
          area,
          city,
          state,
          pincode,
          latitude: typeof lat === 'number' ? Number(lat.toFixed(6)) : "",
          longitude: typeof lng === 'number' ? Number(lng.toFixed(6)) : "",
        }
      }

      const ok = await loadMaps()
      if (!ok || cancelled || !inputElement) return

      if (inputElement.hasAttribute('data-google-places-initialized')) return

      try {
        autocomplete = new window.google.maps.places.Autocomplete(
          inputElement,
          {
            fields: ["formatted_address", "address_components", "geometry"],
            componentRestrictions: { country: "in" },
            types: ["geocode", "establishment"]
          }
        )
        
        inputElement.setAttribute('data-google-places-initialized', 'true')
        placesAutocompleteRef.current = autocomplete

        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace()
          if (!place?.geometry) return
          
          const parsed = parsePlace(place)
          setStep1((prev) => ({
            ...prev,
            location: {
              ...prev.location,
              formattedAddress: parsed.formattedAddress || prev.location.formattedAddress,
              addressLine1: parsed.formattedAddress || prev.location.addressLine1 || "",
              area: parsed.area || prev.location.area,
              city: parsed.city || prev.location.city,
              state: parsed.state || prev.location.state,
              pincode: parsed.pincode || prev.location.pincode,
              latitude: parsed.latitude !== "" ? parsed.latitude : prev.location.latitude,
              longitude: parsed.longitude !== "" ? parsed.longitude : prev.location.longitude,
            },
          }))
          
          setLocationSearchValue(parsed.formattedAddress)
          setLocationPickedFromSuggestion(true)
          inputElement.blur()
        })
        
        const pacContainerFix = () => {
          const applyFix = () => {
            const containers = document.querySelectorAll('.pac-container');
            if (containers.length > 0) {
              containers.forEach(container => {
                container.style.zIndex = '999999';
                container.style.pointerEvents = 'auto';
                container.style.visibility = 'visible';
                container.style.display = 'block';
              });
            }
          };
          applyFix();
          setTimeout(applyFix, 100);
          setTimeout(applyFix, 300);
        };
        
        const handleScroll = (e) => {
           // Ignore scroll events from the dropdown itself if it has any
           if (e.target && e.target.classList && e.target.classList.contains('pac-container')) return;
           
           if (inputElement) {
             inputElement.blur();
           }
           // Forcefully hide all pac-containers to prevent the floating bug
           const containers = document.querySelectorAll('.pac-container');
           containers.forEach(container => {
             container.style.display = 'none';
           });
        };

        // Attach to window with capture phase to catch all scrolls in any scrollable child
        window.addEventListener('scroll', handleScroll, true);
        
        inputElement.addEventListener('focus', pacContainerFix);
        inputElement.addEventListener('input', pacContainerFix);
        
        // Save the scroll listener to remove it on cleanup
        inputElement._googleMapsScrollListener = handleScroll;
      } catch (e) {
        debugError("Autocomplete error:", e)
      }
    }

    init().catch(() => {})

    return () => {
      cancelled = true
      if (autocomplete) {
        try { window.google?.maps?.event?.clearInstanceListeners(autocomplete) } catch {}
      }
      if (locationSearchInputRef.current) {
        const inputElement = locationSearchInputRef.current;
        inputElement.removeAttribute('data-google-places-initialized')
        if (inputElement._googleMapsScrollListener) {
          window.removeEventListener('scroll', inputElement._googleMapsScrollListener, true);
        }
      }
      placesAutocompleteRef.current = null
    }
  }, [step])

  // Hybrid Search Fallback (Nominatim)
  useEffect(() => {
    if (step !== 1) return
    const q = String(locationSearchValue || "").trim()
    if (q.length < 3) {
      setLocationSuggestions([])
      setIsSearchingLocation(false)
      return
    }

    const t = setTimeout(async () => {
      try {
        setIsSearchingLocation(true)
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=4&q=${encodeURIComponent(q)}&countrycodes=in`
        const res = await fetch(url, { headers: { Accept: "application/json" } })
        const json = await res.json()
        const mapped = (Array.isArray(json) ? json : []).map(r => ({
          id: r.place_id,
          display: r.display_name || "",
          lat: Number(r.lat),
          lng: Number(r.lon),
          addr: r.address || {},
        }))
        setLocationSuggestions(mapped)
      } catch (e) {
        debugError("Nominatim search failed:", e)
      } finally {
        setIsSearchingLocation(false)
      }
    }, 400)

    return () => clearTimeout(t)
  }, [locationSearchValue, step])


  // Render functions for each step
  const renderStep1 = () => (
    <div className="space-y-6">
      <FormSection title="Restaurant information">
        <FormField label="Restaurant name" required span="full" error={fieldErrors.restaurantName}>
          <Input
            value={step1.restaurantName || ""}
            onChange={(e) => setStep1({ ...step1, restaurantName: e.target.value })}
            className={cn(formInputClass, fieldErrors.restaurantName && "border-red-500")}
            placeholder="Customers will see this name"
            maxLength={100}
            minLength={2}
          />
        </FormField>
        <FormField label="Pure veg restaurant?" required span="full" error={fieldErrors.pureVegRestaurant} helperText="This helps users filter restaurants by dietary preference.">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setStep1({ ...step1, pureVegRestaurant: true })}
              className={`px-3 py-1.5 text-xs rounded-full border ${
                step1.pureVegRestaurant === true
                  ? "bg-green-600 text-white border-green-600"
                  : "bg-white text-gray-700 border-gray-200"
              }`}
            >
              Yes, Pure Veg
            </button>
            <button
              type="button"
              onClick={() => setStep1({ ...step1, pureVegRestaurant: false })}
              className={`px-3 py-1.5 text-xs rounded-full border ${
                step1.pureVegRestaurant === false
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-gray-700 border-gray-200"
              }`}
            >
              No, Mixed Menu
            </button>
          </div>
        </FormField>
      </FormSection>

      <FormSection title="Owner details">
        <FormField label="Full name" required error={fieldErrors.ownerName}>
          <Input
            value={step1.ownerName || ""}
            onChange={(e) => setStep1({ ...step1, ownerName: normalizeName(e.target.value) })}
            className={cn(formInputClass, fieldErrors.ownerName && "border-red-500")}
            placeholder="Owner full name"
            maxLength={50}
            minLength={2}
          />
        </FormField>
        <FormField label="Email address" required error={fieldErrors.ownerEmail}>
          <Input
            type="email"
            value={step1.ownerEmail || ""}
            onChange={(e) => setStep1({ ...step1, ownerEmail: e.target.value })}
            className={cn(formInputClass, fieldErrors.ownerEmail && "border-red-500")}
            placeholder="owner@example.com"
          />
        </FormField>
        <FormField label="Owner phone number" required span="full" error={fieldErrors.ownerPhone} helperText="Also works for restaurant login. Must be unique across all restaurants.">
          <Input
            value={step1.ownerPhone || ""}
            onChange={(e) => setStep1({ ...step1, ownerPhone: sanitizeDigits(e.target.value).slice(0, 10) })}
            className={cn(formInputClass, fieldErrors.ownerPhone && "border-red-500")}
            placeholder="10-digit owner phone"
            inputMode="numeric"
            maxLength={10}
          />
        </FormField>
      </FormSection>

      <FormSection title="Restaurant contact & location">
        <FormField label="Primary contact number (Login)" required span="full" error={fieldErrors.primaryContactNumber} helperText="Restaurant contact number. Login works with this or the owner phone. Must be unique.">
          <Input
            value={step1.primaryContactNumber || ""}
            onChange={(e) => setStep1({ ...step1, primaryContactNumber: sanitizeDigits(e.target.value).slice(0, 10) })}
            className={cn(formInputClass, fieldErrors.primaryContactNumber && "border-red-500")}
            placeholder="Restaurant contact number (10 digits)"
            inputMode="numeric"
            maxLength={10}
          />
        </FormField>
        <FormField
          label="Service zone"
          required
          span="full"
          error={fieldErrors.zoneId}
          helperText="Choose the service zone where your restaurant will be available."
        >
          <select
            value={step1.zoneId || ""}
            onChange={(e) => setStep1({ ...step1, zoneId: e.target.value })}
            className={cn(formInputClass, fieldErrors.zoneId && "border-red-500")}
            disabled={zonesLoading}
          >
            <option value="">{zonesLoading ? "Loading zones..." : "Select a zone"}</option>
            {zones.map((z) => {
              const id = String(z?._id || z?.id || "")
              const label = z?.name || z?.zoneName || z?.serviceLocation || id
              return (
                <option key={id} value={id}>
                  {label}
                </option>
              )
            })}
          </select>
        </FormField>

        <FormField label="Search location" span="full" error={fieldErrors.locationSearch} className="relative">
          <div className="relative">
            <Input
              ref={locationSearchInputRef}
              value={locationSearchValue}
              onChange={(e) => {
                const typed = e.target.value
                setLocationSearchValue(typed)
                setLocationPickedFromSuggestion(false)
                if (typed) {
                  setStep1((prev) => ({
                    ...prev,
                    location: {
                      ...prev.location,
                      formattedAddress: typed,
                    }
                  }))
                }
              }}
              className={cn(formInputClass, fieldErrors.locationSearch && "border-red-500")}
              placeholder={step1.zoneId ? "Search and select restaurant address..." : "Please select a Service zone first"}
              disabled={!step1.zoneId}
            />
            {isSearchingLocation && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              </div>
            )}
          </div>

          {locationSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto">
              {locationSuggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    const { lat, lng, display, addr } = s
                    const area = addr.suburb || addr.neighbourhood || addr.city_district || addr.locality || ""
                    const city = addr.city || addr.town || addr.village || ""
                    const state = addr.state || ""
                    const pincode = addr.postcode || ""

                    setStep1((prev) => ({
                      ...prev,
                      location: {
                        ...prev.location,
                        formattedAddress: display,
                        addressLine1: display,
                        area: area || prev.location.area,
                        city: city || prev.location.city,
                        state: state || prev.location.state,
                        pincode: pincode || prev.location.pincode,
                        latitude: lat,
                        longitude: lng,
                      },
                    }))
                    setLocationSearchValue(display)
                    setLocationPickedFromSuggestion(true)
                    setLocationSuggestions([])
                  }}
                  className="w-full px-4 py-2 text-left text-[13px] font-medium text-gray-700 hover:bg-blue-50 border-b border-gray-100 last:border-none"
                >
                  <span className="truncate">{s.display}</span>
                </button>
              ))}
            </div>
          )}

          {step1.location?.formattedAddress &&
            !locationPickedFromSuggestion &&
            !step1.location?.latitude && (
              <p className="text-[11px] text-amber-600 mt-2 flex items-center gap-1.5 font-semibold">
                <span>⚠️</span>
                <span>Please select a suggestion from the dropdown for accurate geocoding.</span>
              </p>
            )}
          {locationPickedFromSuggestion && (
            <p className="text-[11px] text-green-600 mt-2 flex items-center gap-1.5 font-semibold">
              <span>✅</span>
              <span>Location confirmed from suggestion.</span>
            </p>
          )}
        </FormField>

        <FormField label="Area / Sector / Locality" error={fieldErrors.area}>
          <Input
            value={step1.location?.area || ""}
            onChange={(e) => setStep1({ ...step1, location: { ...step1.location, area: e.target.value } })}
            className={cn(formInputClass, fieldErrors.area && "border-red-500")}
            placeholder="Area / Sector / Locality"
          />
        </FormField>
        <FormField label="City" error={fieldErrors.city}>
          <Input
            value={step1.location?.city || ""}
            onChange={(e) => setStep1({ ...step1, location: { ...step1.location, city: e.target.value } })}
            className={cn(formInputClass, fieldErrors.city && "border-red-500")}
            placeholder="City"
          />
        </FormField>
        <FormField label="Shop / building no." error={fieldErrors.addressLine1}>
          <Input
            value={step1.location?.addressLine1 || ""}
            onChange={(e) => setStep1({ ...step1, location: { ...step1.location, addressLine1: e.target.value } })}
            className={cn(formInputClass, fieldErrors.addressLine1 && "border-red-500")}
            placeholder="Shop no. / building no. (optional)"
          />
        </FormField>
        <FormField label="Floor / tower">
          <Input
            value={step1.location?.addressLine2 || ""}
            onChange={(e) => setStep1({ ...step1, location: { ...step1.location, addressLine2: e.target.value } })}
            className={formInputClass}
            placeholder="Floor / tower (optional)"
          />
        </FormField>
        <FormField label="State" error={fieldErrors.state}>
          <Input
            value={step1.location?.state || ""}
            onChange={(e) => setStep1({ ...step1, location: { ...step1.location, state: e.target.value } })}
            className={cn(formInputClass, fieldErrors.state && "border-red-500")}
            placeholder="State (optional)"
          />
        </FormField>
        <FormField label="Pin code" error={fieldErrors.pincode}>
          <Input
            value={step1.location?.pincode || ""}
            onChange={(e) => setStep1({ ...step1, location: { ...step1.location, pincode: e.target.value } })}
            className={cn(formInputClass, fieldErrors.pincode && "border-red-500")}
            placeholder="Pin code (optional)"
          />
        </FormField>
        <FormField label="Nearby landmark" span="full">
          <Input
            value={step1.location?.landmark || ""}
            onChange={(e) => setStep1({ ...step1, location: { ...step1.location, landmark: e.target.value } })}
            className={formInputClass}
            placeholder="Nearby landmark (optional)"
          />
        </FormField>
      </FormSection>
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-6">
      <FormSection title="Menu & photos">
        <FormField label="Menu images" required span="full" error={fieldErrors.menuImages}>
          <div className="border border-dashed border-slate-300 rounded-lg bg-slate-50/70 px-4 py-3">
            <label htmlFor="menuImagesInput" className="inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-md bg-white text-slate-700 border border-slate-300 text-xs font-medium cursor-pointer w-full items-center hover:bg-slate-50">
              <Upload className="w-4.5 h-4.5" />
              <span>Choose files</span>
            </label>
            <input
              id="menuImagesInput"
              type="file"
              multiple
              accept={IMAGE_FILE_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || [])
                if (files.length) {
                  const { valid, errors } = filterValidOnboardingImages(files, "menu", "Menu image")
                  errors.forEach((error) => toast.error(error))
                  setStep2((prev) => ({ ...prev, menuImages: [...(prev.menuImages || []), ...valid].slice(0, MAX_MENU_FILES) }))
                  e.target.value = ''
                }
              }}
            />
          </div>
          {step2.menuImages.length > 0 && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {step2.menuImages.map((file, idx) => {
                const imageUrl = file instanceof File ? URL.createObjectURL(file) : (file?.url || file)
                return (
                  <div key={idx} className="relative aspect-[4/5] rounded-md overflow-hidden bg-gray-100">
                    {imageUrl && <img src={imageUrl} alt={`Menu ${idx + 1}`} className="w-full h-full object-cover" />}
                    <button
                      type="button"
                      onClick={() => setStep2((prev) => ({ ...prev, menuImages: prev.menuImages.filter((_, i) => i !== idx) }))}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </FormField>

        <FormField label="Restaurant profile image" required span="full" error={fieldErrors.profileImage}>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden">
              {step2.profileImage ? (
                (() => {
                  const imageSrc = step2.profileImage instanceof File ? URL.createObjectURL(step2.profileImage) : (step2.profileImage?.url || step2.profileImage)
                  return imageSrc ? <img src={imageSrc} alt="Profile" className="w-full h-full object-cover" /> : <ImageIcon className="w-6 h-6 text-gray-500" />
                })()
              ) : (
                <ImageIcon className="w-6 h-6 text-gray-500" />
              )}
            </div>
            <label htmlFor="profileImageInput" className="inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-md bg-white text-slate-700 border border-slate-300 text-xs font-medium cursor-pointer hover:bg-slate-50">
              <Upload className="w-4.5 h-4.5" />
              <span>Upload</span>
            </label>
            <input
              id="profileImageInput"
              type="file"
              accept={IMAGE_FILE_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] || null
                if (file) {
                  const error = validateOnboardingImageFile(file, "document", "Profile image")
                  if (error) toast.error(error)
                  else setStep2((prev) => ({ ...prev, profileImage: file }))
                }
                e.target.value = ''
              }}
            />
          </div>
        </FormField>
      </FormSection>

      <FormSection title="Cuisines & delivery">
        <FormField label="Select cuisines (at least one required)" required span="full" error={fieldErrors.cuisines}>
          <div className="flex flex-wrap gap-2">
            {ALL_CUISINES.map((cuisine) => {
              const isSelected = step2.cuisines?.includes(cuisine);
              return (
                <button
                  key={cuisine}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setStep2(prev => ({
                      ...prev,
                      cuisines: isSelected
                        ? prev.cuisines.filter(c => c !== cuisine)
                        : [...(prev.cuisines || []), cuisine]
                    }));
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                    isSelected
                      ? "bg-[#FF6A00] text-white border-[#FF6A00]"
                      : "bg-gray-50 text-gray-700 border-gray-200 hover:border-[#FF6A00] hover:text-[#FF6A00]"
                  }`}
                >
                  {cuisine}
                </button>
              )
            })}
          </div>
        </FormField>

        <FormField label="Delivery Timings" span="full" error={fieldErrors.dayTimings}>
          <div className="space-y-4">
            {(step2.dayTimings || []).map((dt, index) => (
              <div key={dt.day} className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 sm:p-3 border border-gray-200 rounded-xl bg-gray-50/40">
                <div className="flex items-center gap-2 sm:w-1/4">
                  <input
                    type="checkbox"
                    checked={dt.isOpen}
                    onChange={(e) => {
                      const newTimings = [...step2.dayTimings];
                      newTimings[index].isOpen = e.target.checked;
                      setStep2({ ...step2, dayTimings: newTimings });
                    }}
                    className="w-4 h-4 text-[#FF6A00] rounded focus:ring-[#FF6A00]"
                  />
                  <span className="text-sm font-semibold text-gray-900 w-10">{dt.day}</span>
                  <span className={`text-[10px] sm:text-xs ${dt.isOpen ? "text-green-600 font-bold bg-green-50 px-1.5 py-0.5 rounded-full border border-green-100" : "text-gray-400 font-medium"} ml-1`}>
                    {dt.isOpen ? "Open" : "Closed"}
                  </span>
                </div>
                {dt.isOpen && (
                  <div className="flex-1 flex flex-row items-center gap-2 sm:gap-3 mt-2 sm:mt-0">
                    <TimeSelector
                      label="Opens"
                      value={dt.openingTime || ""}
                      onChange={(val) => {
                        const newTimings = [...step2.dayTimings]
                        newTimings[index].openingTime = val
                        setStep2({ ...step2, dayTimings: newTimings })
                      }}
                      error={fieldErrors[`openingTime_${dt.day}`]}
                    />
                    <div className="w-2 sm:w-3 h-[1px] bg-gray-300 shrink-0"></div>
                    <TimeSelector
                      label="Closes"
                      value={dt.closingTime || ""}
                      onChange={(val) => {
                        const newTimings = [...step2.dayTimings]
                        newTimings[index].closingTime = val
                        setStep2({ ...step2, dayTimings: newTimings })
                      }}
                      error={fieldErrors[`closingTime_${dt.day}`]}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </FormField>

        <FormField label="Estimated delivery time" required span="full" error={fieldErrors.estimatedDeliveryTime}>
          <select
            value={step2.estimatedDeliveryTime || ""}
            onChange={(e) => setStep2({ ...step2, estimatedDeliveryTime: e.target.value })}
            className={cn(formInputClass, fieldErrors.estimatedDeliveryTime && "border-red-500")}
          >
            <option value="">Select estimated timing</option>
            {[
              ...ESTIMATED_DELIVERY_TIME_OPTIONS,
              ...(step2.estimatedDeliveryTime &&
                !ESTIMATED_DELIVERY_TIME_OPTIONS.includes(step2.estimatedDeliveryTime)
                ? [step2.estimatedDeliveryTime]
                : []),
            ].map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </FormField>
      </FormSection>
    </div>
  )

  const renderStep3 = () => (
    <div className="space-y-6">
      <FormSection title="PAN details">
        <FormField label="PAN number" required error={fieldErrors.panNumber}>
          <Input
            value={step3.panNumber || ""}
            onChange={(e) => setStep3({ ...step3, panNumber: sanitizePan(e.target.value) })}
            className={cn(formInputClass, fieldErrors.panNumber && "border-red-500")}
            placeholder="ABCDE1234F"
            maxLength={10}
          />
        </FormField>
        <FormField label="Name on PAN" required error={fieldErrors.nameOnPan}>
          <Input
            value={step3.nameOnPan || ""}
            onChange={(e) => setStep3({ ...step3, nameOnPan: normalizeName(e.target.value) })}
            className={cn(formInputClass, fieldErrors.nameOnPan && "border-red-500")}
          />
        </FormField>
        <FormField label="PAN image" required span="full" error={fieldErrors.panImage}>
          <Input
            type="file"
            accept={IMAGE_FILE_ACCEPT}
            onChange={(e) => {
              const file = e.target.files?.[0] || null
              if (file) {
                const error = validateOnboardingImageFile(file, "document", "PAN image")
                if (error) toast.error(error)
                else setStep3({ ...step3, panImage: file })
              }
              e.target.value = ''
            }}
            className={formInputClass}
          />
          {step3.panImage && (
            <div className="mt-2 flex items-center gap-3">
              <div className="h-14 w-14 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                <img src={getStoredImageSrc(step3.panImage)} alt="PAN document" className="h-full w-full object-cover" />
              </div>
              <p className="text-xs text-gray-600">Selected: {getStoredFileLabel(step3.panImage)}</p>
            </div>
          )}
        </FormField>
      </FormSection>

      <FormSection title="GST details">
        <FormField label="GST registered?" span="full">
          <div className="flex gap-2 items-center">
            <button
              type="button"
              onClick={() => setStep3({ ...step3, gstRegistered: true })}
              className={`px-3 py-1.5 text-xs rounded-full ${step3.gstRegistered ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-800"}`}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setStep3({ ...step3, gstRegistered: false })}
              className={`px-3 py-1.5 text-xs rounded-full ${!step3.gstRegistered ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-800"}`}
            >
              No
            </button>
          </div>
        </FormField>
        {step3.gstRegistered && (
          <>
            <FormField label="GST number" required error={fieldErrors.gstNumber}>
              <Input value={step3.gstNumber || ""} onChange={(e) => setStep3({ ...step3, gstNumber: sanitizeGst(e.target.value) })} className={cn(formInputClass, fieldErrors.gstNumber && "border-red-500")} placeholder="GST number" maxLength={15} />
            </FormField>
            <FormField label="Legal name" required error={fieldErrors.gstLegalName}>
              <Input value={step3.gstLegalName || ""} onChange={(e) => setStep3({ ...step3, gstLegalName: normalizeName(e.target.value) })} className={cn(formInputClass, fieldErrors.gstLegalName && "border-red-500")} placeholder="Legal name" />
            </FormField>
            <FormField label="Registered address" required span="full" error={fieldErrors.gstAddress}>
              <Input value={step3.gstAddress || ""} onChange={(e) => setStep3({ ...step3, gstAddress: e.target.value })} className={cn(formInputClass, fieldErrors.gstAddress && "border-red-500")} placeholder="Registered address" />
            </FormField>
            <FormField label="GST image" required span="full" error={fieldErrors.gstImage}>
              <Input
                type="file"
                accept={IMAGE_FILE_ACCEPT}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null
                  if (file) {
                    const error = validateOnboardingImageFile(file, "document", "GST image")
                    if (error) toast.error(error)
                    else setStep3({ ...step3, gstImage: file })
                  }
                  e.target.value = ''
                }}
                className={formInputClass}
              />
              {step3.gstImage && (
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-14 w-14 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                    <img src={getStoredImageSrc(step3.gstImage)} alt="GST document" className="h-full w-full object-cover" />
                  </div>
                  <p className="text-xs text-gray-600">Selected: {getStoredFileLabel(step3.gstImage)}</p>
                </div>
              )}
            </FormField>
          </>
        )}
      </FormSection>

      <FormSection title="FSSAI details">
        <FormField label="FSSAI number" required error={fieldErrors.fssaiNumber}>
          <Input value={step3.fssaiNumber || ""} onChange={(e) => setStep3({ ...step3, fssaiNumber: sanitizeFssai(e.target.value) })} className={cn(formInputClass, fieldErrors.fssaiNumber && "border-red-500")} placeholder="FSSAI number" inputMode="numeric" maxLength={14} />
        </FormField>
        <FormField label="FSSAI expiry date" required error={fieldErrors.fssaiExpiry}>
          <Input
            type="date"
            value={step3.fssaiExpiry || ""}
            onChange={(e) => setStep3({ ...step3, fssaiExpiry: e.target.value })}
            min={getTodayLocalYMD()}
            autoComplete="off"
            className={cn(formInputClass, fieldErrors.fssaiExpiry && "border-red-500")}
          />
        </FormField>
        <FormField label="FSSAI image" required span="full" error={fieldErrors.fssaiImage}>
          <Input
            type="file"
            accept={IMAGE_FILE_ACCEPT}
            onChange={(e) => {
              const file = e.target.files?.[0] || null
              if (file) {
                const error = validateOnboardingImageFile(file, "document", "FSSAI image")
                if (error) toast.error(error)
                else setStep3({ ...step3, fssaiImage: file })
              }
              e.target.value = ''
            }}
            className={formInputClass}
          />
          {step3.fssaiImage && (
            <div className="mt-2 flex items-center gap-3">
              <div className="h-14 w-14 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                <img src={getStoredImageSrc(step3.fssaiImage)} alt="FSSAI document" className="h-full w-full object-cover" />
              </div>
              <p className="text-xs text-gray-600">Selected: {getStoredFileLabel(step3.fssaiImage)}</p>
            </div>
          )}
        </FormField>
      </FormSection>

      <FormSection title="Bank account details">
        <FormField label="Account number" required error={fieldErrors.accountNumber}>
          <Input value={step3.accountNumber || ""} onChange={(e) => setStep3({ ...step3, accountNumber: sanitizeDigits(e.target.value).slice(0, 18) })} className={cn(formInputClass, fieldErrors.accountNumber && "border-red-500")} placeholder="Account number" inputMode="numeric" maxLength={18} />
        </FormField>
        <FormField label="Re-enter account number" required error={fieldErrors.confirmAccountNumber}>
          <Input value={step3.confirmAccountNumber || ""} onChange={(e) => setStep3({ ...step3, confirmAccountNumber: sanitizeDigits(e.target.value).slice(0, 18) })} className={cn(formInputClass, fieldErrors.confirmAccountNumber && "border-red-500")} placeholder="Re-enter account number" inputMode="numeric" maxLength={18} />
        </FormField>
        <FormField label="IFSC code" required error={fieldErrors.ifscCode}>
          <Input value={step3.ifscCode || ""} onChange={(e) => setStep3({ ...step3, ifscCode: sanitizeIfsc(e.target.value) })} className={cn(formInputClass, fieldErrors.ifscCode && "border-red-500")} placeholder="IFSC code" maxLength={11} />
        </FormField>
        <FormField label="Account type" required error={fieldErrors.accountType}>
          <select value={step3.accountType || ""} onChange={(e) => setStep3({ ...step3, accountType: e.target.value })} className={cn(formInputClass, fieldErrors.accountType && "border-red-500")}>
            <option value="">Select account type</option>
            <option value="Saving">Saving</option>
            <option value="Current">Current</option>
          </select>
        </FormField>
        <FormField label="Account holder name" required span="full" error={fieldErrors.accountHolderName}>
          <Input value={step3.accountHolderName || ""} onChange={(e) => setStep3({ ...step3, accountHolderName: normalizeName(e.target.value) })} className={cn(formInputClass, fieldErrors.accountHolderName && "border-red-500")} placeholder="Account holder name" />
        </FormField>
      </FormSection>
    </div>
  )

  const renderStep = () => {
    if (step === 1) return renderStep1()
    if (step === 2) return renderStep2()
    return renderStep3()
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <FormPageShell
        title="Add New Restaurant"
        icon={<Building2 className="w-5 h-5" />}
        actions={<div className="text-xs font-medium text-slate-500">Step {step} of 3</div>}
      >
        <div ref={mainContentRef} className="space-y-4">
          {renderStep()}
        </div>

        {formErrors.submit && (
          <div className="text-xs text-red-600">{formErrors.submit}</div>
        )}

        <FormActions
          sticky
          onCancel={step > 1 ? () => setStep((s) => Math.max(1, s - 1)) : undefined}
          cancelLabel="Back"
          submitLabel={step === 3 ? (isSubmitting ? "Creating..." : "Create Restaurant") : isSubmitting ? "Saving..." : "Continue"}
          submitting={isSubmitting}
          submitDisabled={isSubmitting}
          submitType="button"
          onSubmit={handleNext}
        />
      </FormPageShell>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="max-w-md bg-white p-0">
          <div className="p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="relative">
                <div className="absolute inset-0 bg-emerald-100 rounded-full animate-ping opacity-75"></div>
                <div className="relative bg-emerald-500 rounded-full p-4">
                  <CheckCircle2 className="w-12 h-12 text-white" />
                </div>
              </div>
            </div>
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-slate-900 mb-2">Restaurant Created Successfully!</DialogTitle>
              <DialogDescription className="text-sm text-slate-600">
                The restaurant has been created successfully.
              </DialogDescription>
            </DialogHeader>
          </div>
        </DialogContent>
      </Dialog>
    </LocalizationProvider>
  )
}



