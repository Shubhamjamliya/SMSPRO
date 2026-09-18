import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import {
  Pencil,
  Plus,
  MapPin,
  Trash2,
  AlertCircle,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@food/components/ui/dialog"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { restaurantAPI } from "@food/api"
import { toast } from "sonner"
import RestaurantPageShell from "@food/components/restaurant/RestaurantPageShell"
import { ImageSourcePicker } from "@food/components/ImageSourcePicker"
import { isFlutterBridgeAvailable, convertBase64ToFile } from "@food/utils/imageUploadUtils"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


const CUISINES_STORAGE_KEY = "restaurant_cuisines"

export default function OutletInfo() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  
  // State management
  const [restaurantData, setRestaurantData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [restaurantName, setRestaurantName] = useState("")
  const [isPureVeg, setIsPureVeg] = useState(false)
  const [cuisineTags, setCuisineTags] = useState("")
  const [address, setAddress] = useState("")
  const [primaryPhone, setPrimaryPhone] = useState("")
  const [ownerInfo, setOwnerInfo] = useState({ name: "", phone: "", email: "" })
  const [legalInfo, setLegalInfo] = useState({ fssai: "", gst: "", pan: "" })
  const [bankInfo, setBankInfo] = useState({ account: "", type: "", holder: "", ifsc: "" })
  const [mainImage, setMainImage] = useState("")
  const [thumbnailImage, setThumbnailImage] = useState("")
  const [coverImages, setCoverImages] = useState([])
  const [showEditNameDialog, setShowEditNameDialog] = useState(false)
  const [editNameValue, setEditNameValue] = useState("")
  const [showEditFoodTypeDialog, setShowEditFoodTypeDialog] = useState(false)
  const [editFoodTypeValue, setEditFoodTypeValue] = useState(false)
  const [pendingUpdateStatus, setPendingUpdateStatus] = useState("none")
  const [pendingUpdateReason, setPendingUpdateReason] = useState("")
  const [pendingUpdates, setPendingUpdates] = useState(null)
  const [showEditPhoneDialog, setShowEditPhoneDialog] = useState(false)
  const [editPhoneValue, setEditPhoneValue] = useState("")
  const [restaurantId, setRestaurantId] = useState("")
  const [restaurantMongoId, setRestaurantMongoId] = useState("")
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageType, setImageType] = useState(null)
  const [uploadingCount, setUploadingCount] = useState(0)
  const [showExpiryAlert, setShowExpiryAlert] = useState(false)
  const [daysToExpiry, setDaysToExpiry] = useState(null)
  
  const profileImageInputRef = useRef(null)
  const menuImageInputRef = useRef(null)
  const [activePicker, setActivePicker] = useState(null) // { type: 'profile' | 'cover', ref: any, title: string, multiple: boolean }

  // Format address from location object
  const formatAddress = (location) => {
    if (!location) return ""
    
    // Priority 1: Full formatted address
    if (location.formattedAddress && location.formattedAddress.trim() !== "" && location.formattedAddress !== "Select location") {
      return location.formattedAddress.trim()
    }

    if (location.address && location.address.trim() !== "") {
      return location.address.trim()
    }

    // Priority 2: Structured address parts
    const parts = []
    if (location.addressLine1) parts.push(location.addressLine1.trim())
    if (location.addressLine2) parts.push(location.addressLine2.trim())
    if (location.area) parts.push(location.area.trim())
    if (location.landmark) parts.push(location.landmark.trim())
    if (location.city) {
      const city = location.city.trim()
      if (!parts.some(p => p.includes(city))) {
        parts.push(city)
      }
    }
    if (location.state) {
      const state = location.state.trim()
      if (!parts.some(p => p.includes(state))) {
        parts.push(state)
      }
    }
    if (location.pincode || location.zipCode) {
      parts.push(String(location.pincode || location.zipCode).trim())
    }
    
    return parts.join(", ") || ""
  }

  // Fetch restaurant data on mount
  useEffect(() => {
    const fetchRestaurantData = async () => {
      try {
        setLoading(true)
        const response = await restaurantAPI.getCurrentRestaurant()
        const data = response?.data?.data?.restaurant || response?.data?.restaurant
        if (data) {
          setRestaurantData(data)
          
          // Set restaurant name
          setRestaurantName(data.restaurantName || data.name || "")
          setIsPureVeg(data.pureVegRestaurant || false)
          
          // Set restaurant ID
          setRestaurantId(data.restaurantId || data.id || "")
          const mongoId = String(data.id || data._id || "")
          setRestaurantMongoId(mongoId)
          
          // Format and set address
          const formattedAddress = formatAddress(data.location || data)
          setAddress(formattedAddress)
          setPrimaryPhone(data.primaryContactNumber || data.ownerPhone || "")
          
          // Set Owner Info
          setOwnerInfo({
            name: data.ownerName || "",
            phone: data.ownerPhone || "",
            email: data.ownerEmail || ""
          })

          // Set pending updates
          setPendingUpdateStatus(data.pendingUpdateStatus || "none")
          setPendingUpdateReason(data.pendingUpdateReason || "")
          setPendingUpdates(data.pendingUpdates || null)

          // Set Legal Info
          setLegalInfo({
            fssai: data.fssaiNumber || "",
            gst: data.gstNumber || "",
            pan: data.panNumber || ""
          })

          // Set Bank Info
          setBankInfo({
            account: data.accountNumber || "",
            type: data.accountType || "",
            holder: data.accountHolderName || "",
            ifsc: data.ifscCode || ""
          })
          
          // Format cuisines
          if (data.cuisines && Array.isArray(data.cuisines)) {
            setCuisineTags(data.cuisines.join(", "))
          }
          
          // Set images
          if (data.profileImage?.url) {
            setThumbnailImage(data.profileImage.url)
          } else if (typeof data.profileImage === 'string') {
            setThumbnailImage(data.profileImage)
          }

          if (data.coverImages && Array.isArray(data.coverImages) && data.coverImages.length > 0) {
            const formattedCovers = data.coverImages.map(img => typeof img === 'string' ? { url: img } : img)
            setCoverImages(formattedCovers)
            setMainImage(formattedCovers[0].url)
          } else if (data.menuImages && Array.isArray(data.menuImages) && data.menuImages.length > 0) {
            const formattedMenus = data.menuImages.map(img => typeof img === 'string' ? { url: img } : img)
            setCoverImages(formattedMenus)
            setMainImage(formattedMenus[0].url)
          } else {
            setCoverImages([])
          }
        }
      } catch (error) {
        if (error.code !== 'ERR_NETWORK' && error.code !== 'ECONNABORTED' && !error.message?.includes('timeout')) {
          debugError("Error fetching restaurant data:", error)
        }
      } finally {
        if (restaurantData?.fssaiExpiry) {
          const expiry = new Date(restaurantData.fssaiExpiry)
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          const diffTime = expiry - today
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
          setDaysToExpiry(diffDays)
          
          if (diffDays <= 4) {
            setShowExpiryAlert(true)
          }
        }
        setLoading(false)
      }
    }

    fetchRestaurantData()

    // Listen for updates from edit pages
    const handleCuisinesUpdate = () => {
      fetchRestaurantData()
    }
    const handleAddressUpdate = () => {
      fetchRestaurantData()
    }

    window.addEventListener("cuisinesUpdated", handleCuisinesUpdate)
    window.addEventListener("addressUpdated", handleAddressUpdate)
    
    return () => {
      window.removeEventListener("cuisinesUpdated", handleCuisinesUpdate)
      window.removeEventListener("addressUpdated", handleAddressUpdate)
    }
  }, [])

  const pendingSummaryLabels = (() => {
    if (!pendingUpdates || typeof pendingUpdates !== "object") return []
    const labels = []
    if (pendingUpdates.location || pendingUpdates.addressLine1 !== undefined) labels.push("Address")
    const legalKeys = [
      "fssaiNumber", "fssaiExpiry", "fssaiImage",
      "panNumber", "nameOnPan", "panImage",
      "gstRegistered", "gstNumber", "gstLegalName", "gstAddress", "gstImage",
    ]
    if (legalKeys.some((key) => Object.prototype.hasOwnProperty.call(pendingUpdates, key))) {
      labels.push("Legal & Compliance")
    }
    const bankKeys = [
      "accountHolderName", "accountNumber", "ifscCode", "accountType", "upiId", "upiQrImage",
    ]
    if (bankKeys.some((key) => Object.prototype.hasOwnProperty.call(pendingUpdates, key))) {
      labels.push("Bank Account")
    }
    return labels
  })()

  // Handle profile image replacement
  const handleProfileImageReplace = async (file) => {
    if (!file) return

    try {
      setUploadingImage(true)
      setImageType('profile')

      // Upload image to Cloudinary
      const uploadResponse = await restaurantAPI.uploadProfileImage(file)
      const uploadedImage = uploadResponse?.data?.data?.profileImage

      if (uploadedImage) {
        if (uploadedImage.url) {
          setThumbnailImage(uploadedImage.url)
        }
        
        // Refresh restaurant data
        const response = await restaurantAPI.getCurrentRestaurant()
        const data = response?.data?.data?.restaurant || response?.data?.restaurant
        if (data) {
          setRestaurantData(data)
          if (data.profileImage?.url) {
            setThumbnailImage(data.profileImage.url)
          }
        }
      }
    } catch (error) {
      debugError("Error uploading profile image:", error)
      toast.error("Failed to upload image. Please try again.")
    } finally {
      setUploadingImage(false)
      setImageType(null)
    }
  }

  // Handle multiple cover images addition
  const handleCoverImageAdd = async (files) => {
    if (!files || (Array.isArray(files) && files.length === 0)) return
    const fileArray = Array.isArray(files) ? files : [files]

    try {
      setUploadingImage(true)
      setImageType('menu')
      setUploadingCount(fileArray.length)

      // Get current images
      const currentResponse = await restaurantAPI.getCurrentRestaurant()
      const currentData = currentResponse?.data?.data?.restaurant || currentResponse?.data?.restaurant
      const existingImages = currentData?.menuImages && Array.isArray(currentData.menuImages)
        ? currentData.menuImages.map(img => ({
            url: img.url,
            publicId: img.publicId
          }))
        : []

      const uploadedImageData = []
      const failedUploads = []
      
      for (let i = 0; i < fileArray.length; i++) {
        try {
          const uploadResponse = await restaurantAPI.uploadMenuImage(fileArray[i])
          const uploadedImage = uploadResponse?.data?.data?.menuImage
          if (uploadedImage?.url) {
            uploadedImageData.push({
              url: uploadedImage.url,
              publicId: uploadedImage.publicId || null
            })
          }
        } catch (error) {
          failedUploads.push({ fileName: fileArray[i]?.name || "image", error: error.message })
        }
      }

      if (uploadedImageData.length > 0) {
        const allImages = [...existingImages]
        uploadedImageData.forEach(uploaded => {
          if (!allImages.find(img => img.url === uploaded.url)) {
            allImages.push(uploaded)
          }
        })

        try {
          await restaurantAPI.updateProfile({ menuImages: allImages })
          toast.success(`Successfully uploaded ${uploadedImageData.length} image(s)`)
        } catch (updateError) {
          toast.error("Images uploaded but failed to save.")
        }

        setCoverImages(allImages)
        if (allImages.length > 0) setMainImage(allImages[0].url)
      }
    } catch (error) {
      toast.error("Failed to upload images.")
    } finally {
      setUploadingImage(false)
      setImageType(null)
      setUploadingCount(0)
    }
  }

  const handleImageClick = (type, ref, title, multiple = false) => {
    if (isFlutterBridgeAvailable()) {
      setActivePicker({ type, ref, title, multiple })
    } else {
      ref.current?.click()
    }
  }

  // Handle cover image deletion
  const handleCoverImageDelete = async (indexToDelete) => {
    if (!window.confirm("Are you sure you want to delete this cover image?")) return

    try {
      setUploadingImage(true)
      setImageType('menu')

      const updatedImages = coverImages.filter((_, index) => index !== indexToDelete)
      const menuImagesForBackend = updatedImages.map(img => ({
        url: img.url,
        publicId: img.publicId || null
      }))

      await restaurantAPI.updateProfile({ menuImages: menuImagesForBackend })
      setCoverImages(updatedImages)
      if (indexToDelete === 0 && updatedImages.length > 0) {
        setMainImage(updatedImages[0].url)
      } else if (updatedImages.length === 0) {
        setMainImage("https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&h=400&fit=crop")
      }
      toast.success("Image deleted successfully")
    } catch (error) {
      toast.error("Failed to delete image.")
    } finally {
      setUploadingImage(false)
      setImageType(null)
    }
  }

  // Handle edit name dialog
  const handleOpenEditDialog = () => {
    setEditNameValue(restaurantName)
    setShowEditNameDialog(true)
  }

  const handleSaveName = async () => {
    const newName = editNameValue.trim()
    if (!newName) return
    try {
      const response = await restaurantAPI.updateProfile({ name: newName })
      const data = response?.data?.data?.restaurant || response?.data?.restaurant
      setRestaurantName(data?.restaurantName || data?.name || newName)
      if (data?.pendingUpdateStatus) setPendingUpdateStatus(data.pendingUpdateStatus)
      if (data?.pendingUpdateReason !== undefined) setPendingUpdateReason(data.pendingUpdateReason || "")
      if (data?.pendingUpdates !== undefined) setPendingUpdates(data.pendingUpdates || null)
      setShowEditNameDialog(false)
      toast.success("Restaurant name updated")
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update name")
    }
  }

  // Handle edit food type dialog
  const handleOpenFoodTypeDialog = () => {
    setEditFoodTypeValue(isPureVeg)
    setShowEditFoodTypeDialog(true)
  }

  const handleSaveFoodType = async () => {
    try {
      const response = await restaurantAPI.updateProfile({ pureVegRestaurant: editFoodTypeValue })
      const data = response?.data?.data?.restaurant || response?.data?.restaurant
      setIsPureVeg(Boolean(data?.pureVegRestaurant ?? editFoodTypeValue))
      if (data?.pendingUpdateStatus) setPendingUpdateStatus(data.pendingUpdateStatus)
      if (data?.pendingUpdateReason !== undefined) setPendingUpdateReason(data.pendingUpdateReason || "")
      if (data?.pendingUpdates !== undefined) setPendingUpdates(data.pendingUpdates || null)
      setShowEditFoodTypeDialog(false)
      toast.success("Food type updated")
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update food type")
    }
  }

  // Handle edit phone dialog
  const handleOpenPhoneDialog = () => {
    setEditPhoneValue(primaryPhone)
    setShowEditPhoneDialog(true)
  }

  const handleSavePhone = async () => {
    const newPhone = editPhoneValue.trim()
    if (!newPhone) return
    
    // Basic validation: Check if 10 digits
    if (!/^\d{10}$/.test(newPhone)) {
      toast.error("Please enter a valid 10-digit phone number")
      return
    }

    try {
      await restaurantAPI.updateProfile({ primaryContactNumber: newPhone })
      setPrimaryPhone(newPhone)
      setShowEditPhoneDialog(false)
      toast.success("Phone number updated successfully")
    } catch (error) {
      toast.error("Failed to update phone number")
    }
  }

  return (
    <>
      <RestaurantPageShell
        title="Outlet info"
        onBack={goBack}
        flush
        maxWidth="full"
        actions={(
          <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">
            Restaurant id: {loading ? "Loading..." : (restaurantMongoId && restaurantMongoId.length >= 5 ? restaurantMongoId.slice(-5) : (restaurantId || "N/A"))}
          </span>
        )}
      >
        {pendingUpdateStatus === "pending" && (
          <div className="bg-orange-50 border border-orange-200 p-4 m-4 rounded-xl flex flex-col gap-2">
            <h4 className="text-orange-800 font-bold text-sm uppercase flex items-center gap-2">
              <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
              Pending Approval
            </h4>
            <p className="text-orange-700 text-sm">
              Changes to {pendingSummaryLabels.length ? pendingSummaryLabels.join(", ") : "Address, Legal & Compliance, or Bank Account"} were sent for admin approval. Approved live values stay active until then.
            </p>
          </div>
        )}

        {pendingUpdateStatus === "rejected" && (
          <div className="bg-red-50 border border-red-200 p-4 m-4 rounded-xl flex flex-col gap-2">
            <h4 className="text-red-800 font-bold text-sm uppercase">Update Rejected</h4>
            <p className="text-red-700 text-sm font-medium">
              {pendingUpdateReason || "Your outlet update was rejected. Please edit and resubmit."}
            </p>
            <p className="text-xs text-red-600">
              Edit Address, Legal & Compliance, or Bank Account to update the same request and resubmit.
            </p>
          </div>
        )}

        <div className="relative w-full h-[200px] overflow-hidden">
          <img src={mainImage} alt="Restaurant banner" className="w-full h-full object-cover" />
          
          <button
            onClick={() => handleImageClick('cover', menuImageInputRef, "Add Cover Image", true)}
            disabled={uploadingImage}
            className="absolute bottom-4 right-4 bg-black/90 hover:bg-black px-3.5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium text-white transition-colors shadow-lg z-20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            <span>{uploadingImage && imageType === 'menu' ? `Uploading ${uploadingCount}...` : 'Add image'}</span>
          </button>
          <input
            ref={menuImageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleCoverImageAdd(Array.from(e.target.files || []))}
          />
          
          {/* Cover Images Gallery */}
          {coverImages.length > 0 && (
            <div className="absolute bottom-16 right-4 flex gap-2.5 z-10">
              {coverImages.slice(0, 4).map((img, index) => (
                <div
                  key={index}
                  className={`relative w-14 h-14 rounded-xl border-2 overflow-hidden bg-gray-200 shadow-md transition-all ${
                    mainImage === img.url ? "border-black scale-105" : "border-white"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setMainImage(img.url)}
                    className="w-full h-full"
                  >
                    <img src={img.url} alt={`Cover ${index + 1}`} className="w-full h-full object-cover" />
                  </button>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCoverImageDelete(index); }}
                    disabled={uploadingImage}
                    className="absolute top-1 right-1 bg-red-500/95 hover:bg-red-600 p-1 rounded-full transition-colors z-10"
                  >
                    <Trash2 className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
              {coverImages.length > 4 && (
                <div className="w-14 h-14 rounded-xl border-2 border-white bg-black/70 flex items-center justify-center shadow-md">
                  <span className="text-white text-sm font-bold">+{coverImages.length - 4}</span>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Restaurant Header Info */}
        <div className="px-4 -mt-12 mb-8 relative z-30">
          <div className="flex items-end gap-4">
            <div className="relative group">
              <div className="w-24 h-24 rounded-2xl border-4 border-white bg-white shadow-lg overflow-hidden">
                <img 
                  src={thumbnailImage} 
                  alt="Restaurant thumbnail" 
                  className="w-full h-full object-cover" 
                />
                {uploadingImage && imageType === 'profile' && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              <button
                onClick={() => handleImageClick('profile', profileImageInputRef, "Update Profile Photo")}
                disabled={uploadingImage}
                className="absolute -bottom-1 -right-1 bg-white p-2 rounded-full shadow-md hover:bg-gray-50 transition-colors border border-gray-100"
                title="Edit photo"
              >
                <Pencil className="w-4 h-4 text-[#FF6A00]" />
              </button>
              <input
                ref={profileImageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleProfileImageReplace(e.target.files?.[0])}
              />
            </div>
            
            <div className="pb-6 flex-1 min-w-0">
              <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight truncate">
                {restaurantName || "Restaurant Name"}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <div className="h-1 w-8 bg-[#FF6A00] rounded-full" />
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                  Information
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Info Sections */}
        <div className="px-4 pb-24 space-y-8">
          {/* Basic Information */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 ml-1">
               <div className="w-1 h-4 bg-gray-300 rounded-full" />
               <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Details</h3>
            </div>
            <div className="bg-white dark:bg-[#111] border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400 font-medium mb-1">Restaurant Name</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{restaurantName || "N/A"}</p>
                </div>
                <button onClick={handleOpenEditDialog} className="p-2 hover:bg-gray-50 rounded-full transition-colors">
                  <Pencil className="w-4 h-4 text-[#FF6A00]" />
                </button>
              </div>
              
              <div className="p-4 flex justify-between items-center">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400 font-medium mb-1">Food Type</p>
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 border-2 ${isPureVeg ? "border-green-600" : "border-red-600"} flex items-center justify-center p-0.5`}>
                      <div className={`w-full h-full rounded-full ${isPureVeg ? "bg-green-600" : "bg-red-600"}`} />
                    </div>
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{isPureVeg ? "Pure Veg" : "Veg & Non-Veg"}</span>
                  </div>
                </div>
                <button onClick={handleOpenFoodTypeDialog} className="p-2 hover:bg-gray-50 rounded-full transition-colors">
                  <Pencil className="w-4 h-4 text-[#FF6A00]" />
                </button>
              </div>
            </div>
          </section>

          {/* Location & Contact */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider ml-1">Location & Contact</h3>
            <div className="bg-white dark:bg-[#111] border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <MapPin className="w-3.5 h-3.5 text-gray-400" />
                    <p className="text-xs text-gray-400 font-medium">Outlet Address</p>
                  </div>
                  <p className="text-sm font-semibold text-gray-800 leading-relaxed">{address || "Address not set"}</p>
                  {pendingUpdateStatus === "pending" && pendingUpdates?.location ? (
                    <p className="text-xs text-orange-600 mt-1 font-medium">
                      Pending approval: {pendingUpdates.location?.formattedAddress || pendingUpdates.location?.address || "New address submitted"}
                    </p>
                  ) : null}
                  {pendingUpdateStatus === "rejected" && pendingUpdates?.location ? (
                    <p className="text-xs text-red-600 mt-1 font-medium">
                      Rejected request: {pendingUpdates.location?.formattedAddress || pendingUpdates.location?.address || "Previous address submission"}
                    </p>
                  ) : null}
                </div>
                <button onClick={() => navigate("/food/restaurant/edit-address")} className="p-2 hover:bg-gray-50 rounded-full transition-colors">
                  <Pencil className="w-4 h-4 text-[#FF6A00]" />
                </button>
              </div>

              <div className="p-4 flex justify-between items-center">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400 font-medium mb-1">Primary Phone</p>
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{primaryPhone || "Not provided"}</p>
                </div>
                <button onClick={handleOpenPhoneDialog} className="p-2 hover:bg-gray-50 rounded-full transition-colors">
                  <Pencil className="w-4 h-4 text-[#FF6A00]" />
                </button>
              </div>
            </div>
          </section>

          {/* Owner Details */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider ml-1">Owner Details</h3>
            <div className="bg-white dark:bg-[#111] border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400 font-medium mb-1">Owner Name</p>
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{restaurantData?.ownerName || "Not provided"}</p>
                </div>
                <button onClick={() => navigate("/food/restaurant/edit-owner")} className="p-2 hover:bg-gray-50 rounded-full transition-colors">
                  <Pencil className="w-4 h-4 text-[#FF6A00]" />
                </button>
              </div>
              
              <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                <p className="text-xs text-gray-400 font-medium mb-1">Owner Phone</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{ownerInfo.phone || "N/A"}</p>
              </div>

              <div className="p-4">
                <p className="text-xs text-gray-400 font-medium mb-1">Owner Email</p>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{restaurantData?.ownerEmail || "Not provided"}</p>
              </div>
            </div>
          </section>

          {/* Legal & Compliance */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider ml-1">Legal & Compliance</h3>
            <div className="bg-white dark:bg-[#111] border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400 font-medium mb-1">FSSAI License</p>
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{restaurantData?.fssaiNumber || "Not provided"}</p>
                  {pendingUpdateStatus === "pending" && pendingUpdates?.fssaiNumber ? (
                    <p className="text-xs text-orange-600 mt-1 font-medium">
                      Pending approval: {pendingUpdates.fssaiNumber}
                    </p>
                  ) : null}
                </div>
                <button onClick={() => navigate("/food/restaurant/fssai")} className="p-2 hover:bg-gray-50 rounded-full transition-colors">
                  <Pencil className="w-4 h-4 text-[#FF6A00]" />
                </button>
              </div>

              <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                  <p className="text-xs text-gray-400 font-medium mb-1">GST Number</p>
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{restaurantData?.gstNumber || "Not provided"}</p>
                  {pendingUpdateStatus === "pending" && pendingUpdates?.gstNumber ? (
                    <p className="text-xs text-orange-600 mt-1 font-medium">
                      Pending approval: {pendingUpdates.gstNumber}
                    </p>
                  ) : null}
              </div>

              <div className="p-4">
                  <p className="text-xs text-gray-400 font-medium mb-1">PAN Number</p>
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{restaurantData?.panNumber || "Not provided"}</p>
                  {pendingUpdateStatus === "pending" && pendingUpdates?.panNumber ? (
                    <p className="text-xs text-orange-600 mt-1 font-medium">
                      Pending approval: {pendingUpdates.panNumber}
                    </p>
                  ) : null}
              </div>
            </div>
          </section>

          {/* Service Zone */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider ml-1">Service Zone</h3>
            <div className="bg-white dark:bg-[#111] border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden">
              <div className="p-4">
                <p className="text-xs text-gray-400 font-medium mb-1">Assigned Zone</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{restaurantData?.zoneName || "Not assigned"}</p>
              </div>
            </div>
          </section>

          {/* Bank Account */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider ml-1">Bank Account</h3>
            <div className="bg-white dark:bg-[#111] border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400 font-medium mb-1">Account Number</p>
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{restaurantData?.accountNumber || "Not provided"}</p>
                  {pendingUpdateStatus === "pending" && pendingUpdates?.accountNumber ? (
                    <p className="text-xs text-orange-600 mt-1 font-medium">
                      Pending approval: {pendingUpdates.accountNumber}
                    </p>
                  ) : null}
                </div>
                <button onClick={() => navigate("/food/restaurant/update-bank-details")} className="p-2 hover:bg-gray-50 rounded-full transition-colors">
                  <Pencil className="w-4 h-4 text-[#FF6A00]" />
                </button>
              </div>

              <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                <p className="text-xs text-gray-400 font-medium mb-1">Account Holder Name</p>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{restaurantData?.accountHolderName || "Not provided"}</p>
              </div>

              <div className="p-4">
                  <p className="text-xs text-gray-400 font-medium mb-1">IFSC Code</p>
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{restaurantData?.ifscCode || "Not provided"}</p>
              </div>
            </div>
          </section>
        </div>
      </RestaurantPageShell>

      <Dialog open={showEditNameDialog} onOpenChange={setShowEditNameDialog}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-xl w-[90%]">
          <DialogHeader className="p-4 border-b border-gray-100 dark:border-gray-800"><DialogTitle className="text-lg font-bold">Edit restaurant name</DialogTitle></DialogHeader>
          <div className="p-4"><Input value={editNameValue} onChange={(e) => setEditNameValue(e.target.value)} placeholder="Enter restaurant name" className="w-full" /></div>
          <DialogFooter className="p-4 bg-gray-50 flex flex-row gap-3">
            <Button variant="outline" onClick={() => setShowEditNameDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveName} disabled={!editNameValue.trim()} className="bg-[#FF6A00] text-white">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditPhoneDialog} onOpenChange={setShowEditPhoneDialog}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-xl w-[90%]">
          <DialogHeader className="p-4 border-b border-gray-100 dark:border-gray-800">
            <DialogTitle className="text-lg font-bold">Edit primary phone</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <Input 
              value={editPhoneValue} 
              onChange={(e) => setEditPhoneValue(e.target.value.replace(/\D/g, '').slice(0, 10))} 
              placeholder="Enter 10-digit phone number" 
              className="w-full"
              type="tel"
              maxLength={10}
            />
          </div>
          <DialogFooter className="p-4 bg-gray-50 flex flex-row gap-3">
            <Button variant="outline" onClick={() => setShowEditPhoneDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleSavePhone} 
              disabled={!editPhoneValue.trim() || editPhoneValue.length !== 10} 
              className="bg-[#FF6A00] hover:bg-[#e05e00] text-white"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImageSourcePicker
        isOpen={!!activePicker}
        onClose={() => setActivePicker(null)}
        onFileSelect={(file) => {
          if (activePicker?.type === 'profile') {
            handleProfileImageReplace(file)
          } else {
            handleCoverImageAdd(file)
          }
        }}
        title={activePicker?.title}
        description={`Choose how to upload your ${activePicker?.type} photo`}
        fileNamePrefix={`outlet-${activePicker?.type}`}
        galleryInputRef={activePicker?.ref}
      />

      {/* FSSAI Expiry Alert Modal */}
      <Dialog open={showExpiryAlert} onOpenChange={setShowExpiryAlert}>
        <DialogContent className="sm:max-w-md bg-white rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-[#fff4f4] p-6 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <DialogTitle className="text-xl font-bold text-gray-900 mb-2">
              FSSAI License Expiring
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600 px-4">
              {daysToExpiry <= 0 
                ? "Your FSSAI license has expired. Please update it immediately to continue your business operations."
                : `Your FSSAI license is expiring in ${daysToExpiry} days. Please update it now to avoid any interruption in service.`}
            </DialogDescription>
          </div>
          <DialogFooter className="p-4 bg-white flex flex-col gap-2 sm:flex-col">
            <Button 
              className="w-full bg-[#FF6A00] hover:bg-[#e05e00] text-white rounded-full py-6 text-base font-semibold"
              onClick={() => {
                setShowExpiryAlert(false)
                navigate("/food/restaurant/fssai/update")
              }}
            >
              Update License Now
            </Button>
            <Button 
              variant="ghost"
              className="w-full text-gray-500 rounded-full hover:bg-gray-100"
              onClick={() => setShowExpiryAlert(false)}
            >
              Remind me later
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Edit Food Type Dialog */}
      <Dialog open={showEditFoodTypeDialog} onOpenChange={setShowEditFoodTypeDialog}>
        <DialogContent className="sm:max-w-md w-[90%] rounded-2xl mx-auto border-0 shadow-2xl p-0 overflow-hidden bg-white">
          <div className="px-6 pt-6 pb-4 border-b border-gray-100">
            <DialogTitle className="text-xl font-bold text-gray-900">Food Type</DialogTitle>
            <DialogDescription className="text-sm text-gray-500 mt-1">
              Select the type of food served at your restaurant.
            </DialogDescription>
          </div>
          
          <div className="p-6">
            <div className="space-y-4">
              <label className={`flex items-center p-4 border rounded-xl cursor-pointer transition-colors ${editFoodTypeValue === true ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-green-200'}`}>
                <div className="flex-1 flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-green-600 flex items-center justify-center p-0.5">
                    <div className="w-full h-full rounded-full bg-green-600" />
                  </div>
                  <span className="font-semibold text-gray-900">Pure Veg</span>
                </div>
                <input 
                  type="radio" 
                  name="foodType" 
                  checked={editFoodTypeValue === true} 
                  onChange={() => setEditFoodTypeValue(true)}
                  className="w-4 h-4 text-green-600 focus:ring-green-500 border-gray-300"
                />
              </label>

              <label className={`flex items-center p-4 border rounded-xl cursor-pointer transition-colors ${editFoodTypeValue === false ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-red-200'}`}>
                <div className="flex-1 flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-red-600 flex items-center justify-center p-0.5">
                    <div className="w-full h-full rounded-full bg-red-600" />
                  </div>
                  <span className="font-semibold text-gray-900">Veg & Non-Veg</span>
                </div>
                <input 
                  type="radio" 
                  name="foodType" 
                  checked={editFoodTypeValue === false} 
                  onChange={() => setEditFoodTypeValue(false)}
                  className="w-4 h-4 text-[#FF6A00] focus:ring-[#FF6A00] border-gray-300"
                />
              </label>
            </div>
            
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setShowEditFoodTypeDialog(false)}
                className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveFoodType}
                className="flex-1 px-4 py-3 bg-black hover:bg-gray-900 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-black/20"
              >
                Save Changes
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
