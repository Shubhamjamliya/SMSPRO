import { useState, useRef, useEffect } from "react"
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey"
import { useNavigate, useParams } from "react-router-dom"
import { Building2, Upload, Calendar, FileText, MapPin, CheckCircle2, X, Image as ImageIcon, Clock, Loader2, ArrowLeft, User, Phone, Mail, Star, CreditCard, ExternalLink } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@food/components/ui/dialog"
import { Input } from "@food/components/ui/input"
import { Label } from "@food/components/ui/label"
import { Button } from "@food/components/ui/button"
import { adminAPI, uploadAPI, zoneAPI } from "@food/api"
import { filterValidOnboardingImages, ONBOARDING_IMAGE_ACCEPT, validateOnboardingImageFile } from "@food/utils/onboardingImageValidation"
import { toast } from "sonner"
import { MobileTimePicker } from "@mui/x-date-pickers/MobileTimePicker"
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider"
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns"
import FormPageShell from "@/shared/components/admin/FormPageShell"
import FormSection from "@/shared/components/admin/FormSection"
import { formInputClass } from "@/shared/components/admin/FormField"
import FormActions from "@/shared/components/admin/FormActions"
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
const MAX_COVER_FILES = 10
const IMAGE_FILE_ACCEPT = ONBOARDING_IMAGE_ACCEPT
const PLACEHOLDER_128 = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128'%3E%3Crect fill='%23e2e8f0' width='128' height='128'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='32' font-family='sans-serif'%3E?%3C/text%3E%3C/svg%3E"

const formatRestaurantId = (restaurant) => {
  if (restaurant?.restaurantId) return `#${restaurant.restaurantId}`
  const id = restaurant?._id || restaurant?.id || (typeof restaurant === "string" ? restaurant : null)
  if (!id) return "#REST000000"
  const idString = String(id)
  if (idString.startsWith("REST") && idString.length === 10) return `#${idString}`
  const parts = idString.split(/[-.]/)
  let lastDigits = ""
  if (parts.length > 0) {
    const lastPart = parts[parts.length - 1]
    const digits = lastPart.match(/\d+/g)
    if (digits?.length) lastDigits = digits.join("").slice(-6).padStart(6, "0")
  }
  if (!lastDigits) {
    const hash = idString.split("").reduce((acc, char) => ((acc << 5) - acc) + char.charCodeAt(0) | 0, 0)
    lastDigits = Math.abs(hash).toString().slice(-6).padStart(6, "0")
  }
  return `#REST${lastDigits}`
}

const approvalStatusLabel = (status) => {
  const raw = String(status || "").trim().toLowerCase()
  if (raw === "approved") return "Approved"
  if (raw === "rejected") return "Rejected"
  return "Pending"
}

const approvalStatusBadgeClass = (status) => {
  const raw = String(status || "").trim().toLowerCase()
  if (raw === "approved") return "bg-emerald-100 text-emerald-700"
  if (raw === "rejected") return "bg-rose-100 text-rose-700"
  return "bg-amber-100 text-amber-700"
}

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

export default function EditRestaurant() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [restaurantMeta, setRestaurantMeta] = useState(null)
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [fieldErrors, setFieldErrors] = useState({})
  const [zones, setZones] = useState([])
  const [zonesLoading, setZonesLoading] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

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
    coverImages: [],
    isVisibleToUsers: true,
    isAcceptingOrders: true,
    commissionPercentage: "",
    offer: "",
    featuredDish: "",
    featuredPrice: "",
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

  const [loadingInitialData, setLoadingInitialData] = useState(true)

  const clearPersistedFormData = async () => {
    // No draft logic needed for edit page
  }
  useEffect(() => {
    let cancelled = false

    const loadRestaurantData = async () => {
      try {
        setLoadingInitialData(true)
        if (!id) return
        
        const res = await adminAPI.getRestaurantById(id)
        const draft = res?.data?.data || res?.data || null
        if (!draft || cancelled) return

        setRestaurantMeta({
          _id: draft._id || id,
          restaurantId: draft.restaurantId,
          slug: draft.slug,
          createdAt: draft.createdAt,
          updatedAt: draft.updatedAt,
          status: draft.status,
          phoneVerified: draft.phoneVerified,
          signupMethod: draft.signupMethod,
          ratings: draft.ratings,
        })
        setLocationSearchValue(draft.location?.formattedAddress || draft.location?.address || draft.addressLine1 || "")

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
            addressLine1: draft.location?.addressLine1 || draft.addressLine1 || draft.location?.address || "",
            addressLine2: draft.location?.addressLine2 || draft.addressLine2 || "",
            area: draft.location?.area || draft.area || "",
            city: draft.location?.city || draft.city || "",
            state: draft.location?.state || draft.state || "",
            pincode: draft.location?.pincode || draft.pincode || "",
            landmark: draft.location?.landmark || draft.landmark || "",
            formattedAddress: draft.location?.formattedAddress || draft.location?.address || "",
            latitude: draft.location?.latitude ?? draft.location?.coordinates?.[1] ?? "",
            longitude: draft.location?.longitude ?? draft.location?.coordinates?.[0] ?? "",
          },
        }))

        const existingOpenDays = Array.isArray(draft.openDays) && draft.openDays.length > 0 ? draft.openDays.map(d => d.slice(0,3).charAt(0).toUpperCase() + d.slice(1,3).toLowerCase()) : [];
        const defaultOpening = draft.openingTime || draft.deliveryTimings?.openingTime || "09:00";
        const defaultClosing = draft.closingTime || draft.deliveryTimings?.closingTime || "23:59";
        
        let resolvedDayTimings = defaultDayTimings;
        if (Array.isArray(draft.dayTimings) && draft.dayTimings.length > 0) {
          resolvedDayTimings = draft.dayTimings;
        } else if (existingOpenDays.length > 0) {
          resolvedDayTimings = defaultDayTimings.map(dt => ({
            ...dt,
            isOpen: existingOpenDays.includes(dt.day),
            openingTime: defaultOpening,
            closingTime: defaultClosing,
          }));
        }

        setStep2((prev) => ({
          ...prev,
          menuImages: Array.isArray(draft.menuImages) ? draft.menuImages.map(img => typeof img === 'string' ? { url: img } : img) : [],
          profileImage: draft.profileImage ? (typeof draft.profileImage === 'string' ? { url: draft.profileImage } : draft.profileImage) : null,
          cuisines: Array.isArray(draft.cuisines) && draft.cuisines.length
            ? draft.cuisines
            : (Array.isArray(draft.onboarding?.step2?.cuisines) ? draft.onboarding.step2.cuisines : []),
          estimatedDeliveryTime: draft.estimatedDeliveryTime || "",
          openingTime: defaultOpening,
          closingTime: defaultClosing,
          openDays: Array.isArray(draft.openDays) ? draft.openDays : [],
          showRestaurantToUsersWithoutItems: !!draft.showRestaurantToUsersWithoutItems,
          dayTimings: resolvedDayTimings,
          coverImages: Array.isArray(draft.coverImages) ? draft.coverImages.map((img) => (typeof img === "string" ? { url: img } : img)) : [],
          isVisibleToUsers: draft.isVisibleToUsers !== false,
          isAcceptingOrders: draft.isAcceptingOrders !== false,
          commissionPercentage: draft.commissionPercentage ?? "",
          offer: draft.offer || "",
          featuredDish: draft.featuredDish || "",
          featuredPrice: draft.featuredPrice ?? "",
        }))
        setStep3((prev) => ({
          ...prev,
          panNumber: draft.panNumber || draft.onboarding?.step3?.pan?.panNumber || "",
          nameOnPan: draft.nameOnPan || draft.onboarding?.step3?.pan?.nameOnPan || "",
          panImage: draft.panImage || draft.onboarding?.step3?.pan?.image || null,
          gstRegistered: draft.gstRegistered != null ? !!draft.gstRegistered : !!draft.onboarding?.step3?.gst?.isRegistered,
          gstNumber: draft.gstNumber || draft.onboarding?.step3?.gst?.gstNumber || "",
          gstLegalName: draft.gstLegalName || draft.onboarding?.step3?.gst?.legalName || "",
          gstAddress: draft.gstAddress || draft.onboarding?.step3?.gst?.address || "",
          gstImage: draft.gstImage || draft.onboarding?.step3?.gst?.image || null,
          fssaiNumber: draft.fssaiNumber || draft.onboarding?.step3?.fssai?.registrationNumber || "",
          fssaiExpiry: (draft.fssaiExpiry || draft.onboarding?.step3?.fssai?.expiryDate) ? String(draft.fssaiExpiry || draft.onboarding?.step3?.fssai?.expiryDate).slice(0, 10) : "",
          fssaiImage: draft.fssaiImage || draft.onboarding?.step3?.fssai?.image || null,
          accountNumber: draft.accountNumber || draft.onboarding?.step3?.bank?.accountNumber || "",
          confirmAccountNumber: draft.accountNumber || draft.onboarding?.step3?.bank?.accountNumber || "",
          ifscCode: draft.ifscCode || draft.onboarding?.step3?.bank?.ifscCode || "",
          accountHolderName: draft.accountHolderName || draft.onboarding?.step3?.bank?.accountHolderName || "",
          accountType: draft.accountType || draft.onboarding?.step3?.bank?.accountType || "",
        }))
      } catch (err) {
        if (cancelled) return
        if (err?.response?.status !== 404) {
          debugError("Failed to restore admin restaurant data:", err)
        }
      } finally {
        if (!cancelled) {
          setIsHydrated(true)
          setLoadingInitialData(false)
        }
      }
    }

    loadRestaurantData()

    return () => {
      cancelled = true
    }
  }, [id])

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

  const resolveCoverImagesForDraft = async () => {
    const coverImages = []
    for (const image of (step2.coverImages || []).slice(0, MAX_COVER_FILES)) {
      if (isUploadableFile(image)) {
        coverImages.push(await handleUpload(image, "appzeto/restaurant/cover"))
      } else {
        const existing = normalizeImageAsset(image)
        if (existing) coverImages.push(existing)
      }
    }
    return coverImages
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

  const buildRestaurantUpdatePayload = ({ images = {} } = {}) => ({
    restaurantName: step1.restaurantName,
    pureVegRestaurant: step1.pureVegRestaurant,
    ownerName: step1.ownerName,
    ownerEmail: step1.ownerEmail,
    ownerPhone: step1.ownerPhone,
    primaryContactNumber: step1.primaryContactNumber,
    menuImages: images.menuImages ?? step2.menuImages.filter((img) => !isUploadableFile(img)),
    coverImages: images.coverImages ?? step2.coverImages.filter((img) => !isUploadableFile(img)),
    profileImage: images.profileImage ?? normalizeImageAsset(step2.profileImage),
    cuisines: step2.cuisines,
    estimatedDeliveryTime: step2.estimatedDeliveryTime,
    openingTime: step2.openingTime,
    closingTime: step2.closingTime,
    openDays: step2.openDays,
    dayTimings: step2.dayTimings,
    showRestaurantToUsersWithoutItems: step2.showRestaurantToUsersWithoutItems,
    isVisibleToUsers: step2.isVisibleToUsers,
    isAcceptingOrders: step2.isAcceptingOrders,
    commissionPercentage: step2.commissionPercentage === "" ? undefined : Number(step2.commissionPercentage),
    offer: step2.offer,
    featuredDish: step2.featuredDish,
    featuredPrice: step2.featuredPrice === "" ? undefined : Number(step2.featuredPrice),
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

  const buildLocationPayload = () => ({
    zoneId: step1.zoneId,
    latitude: step1.location.latitude,
    longitude: step1.location.longitude,
    formattedAddress: step1.location.formattedAddress || step1.location.addressLine1 || "",
    address: step1.location.formattedAddress || step1.location.addressLine1 || "",
    addressLine1: step1.location.addressLine1 || step1.location.formattedAddress || "",
    addressLine2: step1.location.addressLine2 || "",
    area: step1.location.area || "",
    city: step1.location.city || "",
    state: step1.location.state || "",
    landmark: step1.location.landmark || "",
    pincode: step1.location.pincode || "",
    zipCode: step1.location.pincode || "",
    postalCode: step1.location.pincode || "",
  })

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

  const handleSave = async () => {
    setFormErrors({})
    const validationErrors = [
      ...validateStep1(),
      ...validateStep2(),
      ...validateStep3(),
    ]

    if (validationErrors.length > 0) {
      toast.error("Please fill all required fields correctly")
      return
    }

    await handleSubmit()
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setFormErrors({})

    try {
      if (!id) throw new Error("Restaurant ID is required")
      
      const images = {}
      Object.assign(images, await resolveStep2ImagesForDraft())
      images.coverImages = await resolveCoverImagesForDraft()
      Object.assign(images, await resolveStep3ImagesForDraft())

      const payload = buildRestaurantUpdatePayload({ images })

      await adminAPI.updateRestaurantLocation(id, buildLocationPayload())
      const response = await adminAPI.updateRestaurant(id, payload)

      const data = response?.data?.data ?? response?.data
      if (response?.data?.success !== false && data) {
        toast.success("Restaurant updated successfully!")
        setShowSuccessDialog(true)
        setTimeout(() => {
          navigate("/admin/food/restaurants")
        }, 2000)
      } else {
        throw new Error(response?.data?.message || "Failed to update restaurant")
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
    if (!isHydrated) return
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
  }, [isHydrated])

  // Initialize Google Places Autocomplete for location search.
  useEffect(() => {
    if (!isHydrated) return

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
  }, [isHydrated])

  // Hybrid Search Fallback (Nominatim)
  useEffect(() => {
    if (!isHydrated) return
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
  }, [locationSearchValue, isHydrated])

  const profilePreviewSrc = step2.profileImage
    ? getStoredImageSrc(step2.profileImage)
    : PLACEHOLDER_128

  const renderEditForm = () => (
    <>
    <FormSection title="Basic Details" bodyClassName="block space-y-10">
      <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
        <div className="relative w-32 h-32 rounded-3xl overflow-hidden bg-slate-50 shrink-0 shadow-inner group">
          <img
            src={profilePreviewSrc}
            alt={step1.restaurantName || "Restaurant"}
            className="w-full h-full object-cover"
            onError={(e) => { e.target.src = PLACEHOLDER_128 }}
          />
          <label htmlFor="profileImageInputHero" className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
            <Upload className="w-6 h-6 text-white" />
          </label>
          <input
            id="profileImageInputHero"
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
              e.target.value = ""
            }}
          />
        </div>
        <div className="flex-1 text-center md:text-left pt-2 space-y-4 w-full">
          <div className="space-y-2">
            <Label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Restaurant Name</Label>
            <Input
              value={step1.restaurantName || ""}
              onChange={(e) => setStep1({ ...step1, restaurantName: e.target.value })}
              className={`text-2xl font-extrabold text-slate-900 h-12 ${fieldErrors.restaurantName ? "border-red-500" : "border-slate-200"}`}
              placeholder="Restaurant name"
              maxLength={100}
            />
            {fieldErrors.restaurantName && <p className="text-red-500 text-xs">{fieldErrors.restaurantName}</p>}
          </div>
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
            <button type="button" onClick={() => setStep1({ ...step1, pureVegRestaurant: true })} className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${step1.pureVegRestaurant === true ? "bg-green-100 text-green-700 border-green-200" : "bg-slate-50 text-slate-600 border-slate-200"}`}>Pure Veg</button>
            <button type="button" onClick={() => setStep1({ ...step1, pureVegRestaurant: false })} className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${step1.pureVegRestaurant === false ? "bg-slate-900 text-white border-slate-900" : "bg-slate-50 text-slate-600 border-slate-200"}`}>Mixed Menu</button>
            <button type="button" onClick={() => setStep2((prev) => ({ ...prev, isVisibleToUsers: !prev.isVisibleToUsers }))} className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${step2.isVisibleToUsers ? "bg-green-100 text-green-700 border-green-200" : "bg-red-100 text-red-700 border-red-200"}`}>
              {step2.isVisibleToUsers ? "Visible" : "Hidden"}
            </button>
          </div>
          {fieldErrors.pureVegRestaurant && <p className="text-red-500 text-xs">{fieldErrors.pureVegRestaurant}</p>}
          <div className="flex items-center justify-center md:justify-start gap-2 text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 w-fit mx-auto md:mx-0">
            <Building2 className="w-4 h-4" />
            <span className="text-xs font-bold tracking-wider">{formatRestaurantId(restaurantMeta || { _id: id })}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
        <div className="space-y-6">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <User className="w-4 h-4 text-blue-600" />
            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Owner Information</h4>
          </div>
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-blue-50/30 border border-blue-100/30 space-y-2">
              <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">Full Name</p>
              <Input value={step1.ownerName || ""} onChange={(e) => setStep1({ ...step1, ownerName: normalizeName(e.target.value) })} className={`bg-white text-sm ${fieldErrors.ownerName ? "border-red-500" : ""}`} placeholder="Owner full name" maxLength={50} />
              {fieldErrors.ownerName && <p className="text-red-500 text-xs">{fieldErrors.ownerName}</p>}
            </div>
            <div className="p-4 rounded-2xl bg-emerald-50/30 border border-emerald-100/30 space-y-2">
              <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Owner Phone (Informational)</p>
              <Input value={step1.ownerPhone || ""} onChange={(e) => setStep1({ ...step1, ownerPhone: sanitizeDigits(e.target.value).slice(0, 10) })} className={`bg-white text-sm ${fieldErrors.ownerPhone ? "border-red-500" : ""}`} placeholder="10-digit mobile" inputMode="numeric" maxLength={10} />
              {fieldErrors.ownerPhone && <p className="text-red-500 text-xs">{fieldErrors.ownerPhone}</p>}
              <p className="text-[10px] text-slate-500">Also works for restaurant login. Must be unique.</p>
            </div>
            <div className="p-4 rounded-2xl bg-indigo-50/30 border border-indigo-100/30 space-y-2">
              <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">Email Address</p>
              <Input type="email" value={step1.ownerEmail || ""} onChange={(e) => setStep1({ ...step1, ownerEmail: e.target.value })} className={`bg-white text-sm ${fieldErrors.ownerEmail ? "border-red-500" : ""}`} placeholder="owner@example.com" />
              {fieldErrors.ownerEmail && <p className="text-red-500 text-xs">{fieldErrors.ownerEmail}</p>}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <MapPin className="w-4 h-4 text-blue-600" />
            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Location & Contact</h4>
          </div>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-slate-500">Primary contact number (Login)*</Label>
              <Input value={step1.primaryContactNumber || ""} onChange={(e) => setStep1({ ...step1, primaryContactNumber: sanitizeDigits(e.target.value).slice(0, 10) })} className={`mt-1 bg-white text-sm ${fieldErrors.primaryContactNumber ? "border-red-500" : ""}`} placeholder="10-digit login number" inputMode="numeric" maxLength={10} />
              {fieldErrors.primaryContactNumber && <p className="text-red-500 text-xs mt-1">{fieldErrors.primaryContactNumber}</p>}
              <p className="text-[10px] text-slate-500 mt-1">Login works with this number or the owner phone. Must be unique.</p>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Service zone*</Label>
              <select value={step1.zoneId || ""} onChange={(e) => setStep1({ ...step1, zoneId: e.target.value })} className={`mt-1 ${formInputClass} ${fieldErrors.zoneId ? "border-red-500" : ""}`} disabled={zonesLoading}>
                <option value="">{zonesLoading ? "Loading zones..." : "Select a zone"}</option>
                {zones.map((z) => {
                  const zoneId = String(z?._id || z?.id || "")
                  const label = z?.name || z?.zoneName || z?.serviceLocation || zoneId
                  return <option key={zoneId} value={zoneId}>{label}</option>
                })}
              </select>
              {fieldErrors.zoneId && <p className="text-red-500 text-xs mt-1">{fieldErrors.zoneId}</p>}
            </div>
            <div className="relative">
          <Label className="text-xs text-slate-500">Search location</Label>
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
              className={`mt-1 bg-white text-sm disabled:opacity-50 disabled:cursor-not-allowed ${fieldErrors.locationSearch ? 'border-red-500' : ''}`}
              placeholder={step1.zoneId ? "Search and select restaurant address..." : "Please select a Service zone first"}
              disabled={!step1.zoneId}
            />
            {isSearchingLocation && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="h-4 w-4 animate-spin text-red-500" />
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
                  className="w-full px-4 py-2 text-left text-[13px] font-medium text-gray-700 hover:bg-red-50 border-b border-gray-100 last:border-none"
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
          {fieldErrors.locationSearch && <p className="text-red-500 text-xs mt-1">{fieldErrors.locationSearch}</p>}
        </div>
        <div className="space-y-3">
          <div>
            <Input
              value={step1.location?.area || ""}
              onChange={(e) => setStep1({ ...step1, location: { ...step1.location, area: e.target.value } })}
              className={`bg-white text-sm ${fieldErrors.area ? 'border-red-500' : ''}`}
              placeholder="Area / Sector / Locality*"
            />
            {fieldErrors.area && <p className="text-red-500 text-xs mt-1">{fieldErrors.area}</p>}
          </div>
          <div>
            <Input
              value={step1.location?.city || ""}
              onChange={(e) => setStep1({ ...step1, location: { ...step1.location, city: e.target.value } })}
              className={`bg-white text-sm ${fieldErrors.city ? 'border-red-500' : ''}`}
              placeholder="City*"
            />
            {fieldErrors.city && <p className="text-red-500 text-xs mt-1">{fieldErrors.city}</p>}
          </div>
          <div>
            <Input
              value={step1.location?.addressLine1 || ""}
              onChange={(e) => setStep1({ ...step1, location: { ...step1.location, addressLine1: e.target.value } })}
              className={`bg-white text-sm ${fieldErrors.addressLine1 ? 'border-red-500' : ''}`}
              placeholder="Shop no. / building no. (optional)"
            />
            {fieldErrors.addressLine1 && <p className="text-red-500 text-xs mt-1">{fieldErrors.addressLine1}</p>}
          </div>
          <Input
            value={step1.location?.addressLine2 || ""}
            onChange={(e) => setStep1({ ...step1, location: { ...step1.location, addressLine2: e.target.value } })}
            className="bg-white text-sm"
            placeholder="Floor / tower (optional)"
          />
          <div>
            <Input
              value={step1.location?.state || ""}
              onChange={(e) => setStep1({ ...step1, location: { ...step1.location, state: e.target.value } })}
              className={`bg-white text-sm ${fieldErrors.state ? 'border-red-500' : ''}`}
              placeholder="State (optional)"
            />
            {fieldErrors.state && <p className="text-red-500 text-xs mt-1">{fieldErrors.state}</p>}
          </div>
          <div>
            <Input
              value={step1.location?.pincode || ""}
              onChange={(e) => setStep1({ ...step1, location: { ...step1.location, pincode: e.target.value } })}
              className={`bg-white text-sm ${fieldErrors.pincode ? 'border-red-500' : ''}`}
              placeholder="Pin code (optional)"
            />
            {fieldErrors.pincode && <p className="text-red-500 text-xs mt-1">{fieldErrors.pincode}</p>}
          </div>
          <Input
            value={step1.location?.landmark || ""}
            onChange={(e) => setStep1({ ...step1, location: { ...step1.location, landmark: e.target.value } })}
            className="bg-white text-sm"
            placeholder="Nearby landmark (optional)"
          />
        </div>
          </div>
        </div>
      </div>
    </FormSection>

    <FormSection title="Media" bodyClassName="block space-y-5">
        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-700">Menu images*</Label>
          <div className="mt-1 border border-dashed border-gray-300 rounded-md bg-gray-50/70 px-4 py-3">
            <label htmlFor="menuImagesInput" className="inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-slate-900 border border-slate-300 text-xs font-medium cursor-pointer w-full items-center">
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
          {fieldErrors.menuImages && <p className="text-red-500 text-xs mt-1">{fieldErrors.menuImages}</p>}
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-slate-500">Restaurant photos (cover)</Label>
          <div className="mt-1 border border-dashed border-slate-300 rounded-lg bg-slate-50/70 px-4 py-3">
            <label htmlFor="coverImagesInput" className="inline-flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-sm bg-white text-slate-900 border border-slate-300 text-xs font-medium cursor-pointer w-full">
              <Upload className="w-4 h-4" />
              <span>Choose cover photos</span>
            </label>
            <input
              id="coverImagesInput"
              type="file"
              multiple
              accept={IMAGE_FILE_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || [])
                if (files.length) {
                  const { valid, errors } = filterValidOnboardingImages(files, "menu", "Cover image")
                  errors.forEach((error) => toast.error(error))
                  setStep2((prev) => ({ ...prev, coverImages: [...(prev.coverImages || []), ...valid].slice(0, MAX_COVER_FILES) }))
                  e.target.value = ""
                }
              }}
            />
          </div>
          {step2.coverImages.length > 0 && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {step2.coverImages.map((file, idx) => {
                const imageUrl = file instanceof File ? URL.createObjectURL(file) : (file?.url || file)
                return (
                  <div key={idx} className="relative aspect-4/5 rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                    {imageUrl && <img src={imageUrl} alt={`Cover ${idx + 1}`} className="w-full h-full object-cover" />}
                    <button type="button" onClick={() => setStep2((prev) => ({ ...prev, coverImages: prev.coverImages.filter((_, i) => i !== idx) }))} className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {fieldErrors.profileImage && <p className="text-red-500 text-xs mt-1">{fieldErrors.profileImage}</p>}
    </FormSection>

    <FormSection title="Cuisines" bodyClassName="block">
          <div className="mt-2 flex flex-wrap gap-2">
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
          {fieldErrors.cuisines && <p className="text-red-500 text-xs mt-1">{fieldErrors.cuisines}</p>}
    </FormSection>

    <FormSection title="Timings & Status" bodyClassName="block space-y-5">
        <Label className="text-xs font-bold text-slate-700">Weekly Timings</Label>
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
        {fieldErrors.dayTimings && <p className="text-red-500 text-xs mt-1">{fieldErrors.dayTimings}</p>}

        <div>
          <Label className="text-xs text-gray-700">Estimated delivery time*</Label>
          <select
            value={step2.estimatedDeliveryTime || ""}
            onChange={(e) => setStep2({ ...step2, estimatedDeliveryTime: e.target.value })}
            className={`mt-1 ${formInputClass} ${fieldErrors.estimatedDeliveryTime ? 'border-red-500' : ''}`}
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
          {fieldErrors.estimatedDeliveryTime && <p className="text-red-500 text-xs mt-1">{fieldErrors.estimatedDeliveryTime}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-slate-500">Commission %</Label>
            <Input type="number" min="0" max="100" value={step2.commissionPercentage} onChange={(e) => setStep2({ ...step2, commissionPercentage: e.target.value })} className="mt-1 bg-white text-sm" placeholder="e.g. 15" />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Offer</Label>
            <Input value={step2.offer} onChange={(e) => setStep2({ ...step2, offer: e.target.value })} className="mt-1 bg-white text-sm" placeholder="Special offer text" />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Featured dish</Label>
            <Input value={step2.featuredDish} onChange={(e) => setStep2({ ...step2, featuredDish: e.target.value })} className="mt-1 bg-white text-sm" />
          </div>
          <div>
            <Label className="text-xs text-slate-500">Featured price</Label>
            <Input type="number" min="0" value={step2.featuredPrice} onChange={(e) => setStep2({ ...step2, featuredPrice: e.target.value })} className="mt-1 bg-white text-sm" />
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={step2.isAcceptingOrders} onChange={(e) => setStep2({ ...step2, isAcceptingOrders: e.target.checked })} className="rounded border-slate-300" />
            Accepting orders
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={step2.showRestaurantToUsersWithoutItems} onChange={(e) => setStep2({ ...step2, showRestaurantToUsersWithoutItems: e.target.checked })} className="rounded border-slate-300" />
            Show without menu items
          </label>
        </div>

        {restaurantMeta?.status && (
          <div>
            <p className="text-xs text-slate-500 mb-1">Approval Status</p>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${approvalStatusBadgeClass(restaurantMeta.status)}`}>
              {approvalStatusLabel(restaurantMeta.status)}
            </span>
          </div>
        )}
    </FormSection>

    <FormSection title="Registration Documents" bodyClassName="block space-y-6">
        <div className="bg-slate-50 rounded-lg p-4 space-y-4">
        <h5 className="font-semibold text-slate-900 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          PAN Details
        </h5>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-gray-700">PAN number*</Label>
            <Input
              value={step3.panNumber || ""}
              onChange={(e) => setStep3({ ...step3, panNumber: sanitizePan(e.target.value) })}
              className={`mt-1 bg-white text-sm text-black placeholder-black ${fieldErrors.panNumber ? 'border-red-500' : ''}`}
              placeholder="ABCDE1234F"
              maxLength={10}
            />
            {fieldErrors.panNumber && <p className="text-red-500 text-xs mt-1">{fieldErrors.panNumber}</p>}
          </div>
          <div>
            <Label className="text-xs text-gray-700">Name on PAN*</Label>
            <Input
              value={step3.nameOnPan || ""}
              onChange={(e) => setStep3({ ...step3, nameOnPan: normalizeName(e.target.value) })}
              className={`mt-1 bg-white text-sm text-black placeholder-black ${fieldErrors.nameOnPan ? 'border-red-500' : ''}`}
            />
            {fieldErrors.nameOnPan && <p className="text-red-500 text-xs mt-1">{fieldErrors.nameOnPan}</p>}
          </div>
        </div>
        <div>
          <Label className="text-xs text-gray-700">PAN image*</Label>
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
            className="mt-1 bg-white text-sm text-black placeholder-black"
          />
          {step3.panImage && (
            <div className="mt-2 flex items-center gap-3">
              <div className="h-14 w-14 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                <img src={getStoredImageSrc(step3.panImage)} alt="PAN document" className="h-full w-full object-cover" />
              </div>
              <p className="text-xs text-gray-600">Selected: {getStoredFileLabel(step3.panImage)}</p>
            </div>
          )}
          {fieldErrors.panImage && <p className="text-red-500 text-xs mt-1">{fieldErrors.panImage}</p>}
        </div>
        </div>

        <div className="bg-slate-50 rounded-lg p-4 space-y-4">
        <h5 className="font-semibold text-slate-900 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          GST Details
        </h5>
        <div className="flex gap-4 items-center text-sm">
          <span className="text-gray-700">GST registered?</span>
          <button
            type="button"
            onClick={() => setStep3({ ...step3, gstRegistered: true })}
            className={`px-3 py-1.5 text-xs rounded-full ${step3.gstRegistered ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setStep3({ ...step3, gstRegistered: false })}
            className={`px-3 py-1.5 text-xs rounded-full ${!step3.gstRegistered ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}
          >
            No
          </button>
        </div>
        {step3.gstRegistered && (
          <div className="space-y-3">
            <div>
              <Input value={step3.gstNumber || ""} onChange={(e) => setStep3({ ...step3, gstNumber: sanitizeGst(e.target.value) })} className={`bg-white text-sm ${fieldErrors.gstNumber ? 'border-red-500' : ''}`} placeholder="GST number*" maxLength={15} />
              {fieldErrors.gstNumber && <p className="text-red-500 text-xs mt-1">{fieldErrors.gstNumber}</p>}
            </div>
            <div>
              <Input value={step3.gstLegalName || ""} onChange={(e) => setStep3({ ...step3, gstLegalName: normalizeName(e.target.value) })} className={`bg-white text-sm ${fieldErrors.gstLegalName ? 'border-red-500' : ''}`} placeholder="Legal name*" />
              {fieldErrors.gstLegalName && <p className="text-red-500 text-xs mt-1">{fieldErrors.gstLegalName}</p>}
            </div>
            <div>
              <Input value={step3.gstAddress || ""} onChange={(e) => setStep3({ ...step3, gstAddress: e.target.value })} className={`bg-white text-sm ${fieldErrors.gstAddress ? 'border-red-500' : ''}`} placeholder="Registered address*" />
              {fieldErrors.gstAddress && <p className="text-red-500 text-xs mt-1">{fieldErrors.gstAddress}</p>}
            </div>
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
              className="bg-white text-sm"
            />
            {step3.gstImage && (
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                  <img src={getStoredImageSrc(step3.gstImage)} alt="GST document" className="h-full w-full object-cover" />
                </div>
                <p className="text-xs text-gray-600">Selected: {getStoredFileLabel(step3.gstImage)}</p>
              </div>
            )}
            {fieldErrors.gstImage && <p className="text-red-500 text-xs mt-1">{fieldErrors.gstImage}</p>}
          </div>
        )}
        </div>

        <div className="bg-slate-50 rounded-lg p-4 space-y-4">
        <h5 className="font-semibold text-slate-900 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          FSSAI Details
        </h5>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Input value={step3.fssaiNumber || ""} onChange={(e) => setStep3({ ...step3, fssaiNumber: sanitizeFssai(e.target.value) })} className={`bg-white text-sm ${fieldErrors.fssaiNumber ? 'border-red-500' : ''}`} placeholder="FSSAI number*" inputMode="numeric" maxLength={14} />
            {fieldErrors.fssaiNumber && <p className="text-red-500 text-xs mt-1">{fieldErrors.fssaiNumber}</p>}
          </div>
          <div>
            <Label className="text-xs text-gray-700 mb-1 block">FSSAI expiry date*</Label>
            <Input
              type="date"
              value={step3.fssaiExpiry || ""}
              onChange={(e) => setStep3({ ...step3, fssaiExpiry: e.target.value })}
              min={getTodayLocalYMD()}
              autoComplete="off"
              className={`bg-white text-sm ${fieldErrors.fssaiExpiry ? 'border-red-500' : ''}`}
            />
            {fieldErrors.fssaiExpiry && <p className="text-red-500 text-xs mt-1">{fieldErrors.fssaiExpiry}</p>}
          </div>
        </div>
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
          className="bg-white text-sm"
        />
        {step3.fssaiImage && (
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
              <img src={getStoredImageSrc(step3.fssaiImage)} alt="FSSAI document" className="h-full w-full object-cover" />
            </div>
            <p className="text-xs text-gray-600">Selected: {getStoredFileLabel(step3.fssaiImage)}</p>
          </div>
        )}
        {fieldErrors.fssaiImage && <p className="text-red-500 text-xs mt-1">{fieldErrors.fssaiImage}</p>}
        </div>

        <div className="bg-slate-50 rounded-lg p-4 space-y-4">
        <h5 className="font-semibold text-slate-900 flex items-center gap-2">
          <CreditCard className="w-4 h-4" />
          Bank Details
        </h5>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Input value={step3.accountNumber || ""} onChange={(e) => setStep3({ ...step3, accountNumber: sanitizeDigits(e.target.value).slice(0, 18) })} className={`bg-white text-sm ${fieldErrors.accountNumber ? 'border-red-500' : ''}`} placeholder="Account number*" inputMode="numeric" maxLength={18} />
            {fieldErrors.accountNumber && <p className="text-red-500 text-xs mt-1">{fieldErrors.accountNumber}</p>}
          </div>
          <div>
            <Input value={step3.confirmAccountNumber || ""} onChange={(e) => setStep3({ ...step3, confirmAccountNumber: sanitizeDigits(e.target.value).slice(0, 18) })} className={`bg-white text-sm ${fieldErrors.confirmAccountNumber ? 'border-red-500' : ''}`} placeholder="Re-enter account number*" inputMode="numeric" maxLength={18} />
            {fieldErrors.confirmAccountNumber && <p className="text-red-500 text-xs mt-1">{fieldErrors.confirmAccountNumber}</p>}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Input value={step3.ifscCode || ""} onChange={(e) => setStep3({ ...step3, ifscCode: sanitizeIfsc(e.target.value) })} className={`bg-white text-sm ${fieldErrors.ifscCode ? 'border-red-500' : ''}`} placeholder="IFSC code*" maxLength={11} />
            {fieldErrors.ifscCode && <p className="text-red-500 text-xs mt-1">{fieldErrors.ifscCode}</p>}
          </div>
          <div>
            <select value={step3.accountType || ""} onChange={(e) => setStep3({ ...step3, accountType: e.target.value })} className={`${formInputClass} ${fieldErrors.accountType ? 'border-red-500' : ''}`}>
              <option value="">Select account type</option>
              <option value="Saving">Saving</option>
              <option value="Current">Current</option>
            </select>
            {fieldErrors.accountType && <p className="text-red-500 text-xs mt-1">{fieldErrors.accountType}</p>}
          </div>
        </div>
        <div>
          <Input value={step3.accountHolderName || ""} onChange={(e) => setStep3({ ...step3, accountHolderName: normalizeName(e.target.value) })} className={`bg-white text-sm ${fieldErrors.accountHolderName ? 'border-red-500' : ''}`} placeholder="Account holder name*" />
          {fieldErrors.accountHolderName && <p className="text-red-500 text-xs mt-1">{fieldErrors.accountHolderName}</p>}
        </div>
        </div>
    </FormSection>

    {restaurantMeta && (restaurantMeta.createdAt || restaurantMeta.updatedAt) && (
      <FormSection title="Registration Information" bodyClassName="text-sm">
            {restaurantMeta.createdAt && (
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-500 mb-1">Registration Date & Time</p>
                  <p className="font-medium text-slate-900">{new Date(restaurantMeta.createdAt).toLocaleString("en-IN")}</p>
                </div>
              </div>
            )}
            {restaurantMeta.updatedAt && (
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-500 mb-1">Last Updated</p>
                  <p className="font-medium text-slate-900">{new Date(restaurantMeta.updatedAt).toLocaleString("en-IN")}</p>
                </div>
              </div>
            )}
            {restaurantMeta.slug && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Slug</p>
                <p className="font-medium text-slate-900">{restaurantMeta.slug}</p>
              </div>
            )}
      </FormSection>
    )}
    </>
  )

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <FormPageShell
        title="Edit Restaurant"
        description={step1.restaurantName || "Update all restaurant details"}
        icon={<Building2 className="w-5 h-5" />}
        onBack={() => navigate("/admin/food/restaurants")}
      >
        {loadingInitialData ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
            <p className="text-slate-600 font-medium">Loading restaurant details...</p>
          </div>
        ) : (
          <>
            <div ref={mainContentRef} className="space-y-6">
              {renderEditForm()}
            </div>

            {formErrors.submit && (
              <div className="text-xs text-red-600 text-center">{formErrors.submit}</div>
            )}

            <FormActions
              sticky
              submitLabel={isSubmitting ? "Saving..." : "Save Changes"}
              submitting={isSubmitting}
              submitDisabled={isSubmitting}
              submitType="button"
              onSubmit={handleSave}
            />
          </>
        )}
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
              <DialogTitle className="text-2xl font-bold text-slate-900 mb-2">Restaurant Updated Successfully!</DialogTitle>
              <DialogDescription className="text-sm text-slate-600">
                The restaurant has been updated successfully.
              </DialogDescription>
            </DialogHeader>
          </div>
        </DialogContent>
      </Dialog>
    </LocalizationProvider>
  )
}



