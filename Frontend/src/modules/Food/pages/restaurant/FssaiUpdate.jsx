import { useState, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { ImageSourcePicker } from "@food/components/ImageSourcePicker"
import { isFlutterBridgeAvailable } from "@food/utils/imageUploadUtils"
import { toast } from "sonner"
import { restaurantAPI } from "@food/api"
import RestaurantPageShell from "@food/components/restaurant/RestaurantPageShell"

const formatExpiryInput = (value) => {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

const imageUrlFrom = (value) => {
  if (!value) return ""
  return typeof value === "string" ? value : String(value?.url || "")
}

export default function FssaiUpdate() {
  const navigate = useNavigate()
  const [fssaiNumber, setFssaiNumber] = useState("")
  const [fssaiExpiry, setFssaiExpiry] = useState("")
  const [uploadedFile, setUploadedFile] = useState(null)
  const [existingImageUrl, setExistingImageUrl] = useState("")
  const [isPhotoPickerOpen, setIsPhotoPickerOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [pendingUpdateStatus, setPendingUpdateStatus] = useState("none")
  const [pendingUpdateReason, setPendingUpdateReason] = useState("")
  const fileInputRef = useRef(null)

  useEffect(() => {
    const fetchCurrentData = async () => {
      try {
        setFetching(true)
        const response = await restaurantAPI.getCurrentRestaurant()
        const data = response?.data?.data?.restaurant || response?.data?.restaurant
        if (data) {
          const status = data.pendingUpdateStatus || "none"
          const pending = data.pendingUpdates || null
          setPendingUpdateStatus(status)
          setPendingUpdateReason(data.pendingUpdateReason || "")

          // Prefill last submitted values when pending/rejected; otherwise live approved values.
          const usePending =
            (status === "pending" || status === "rejected") &&
            pending &&
            (pending.fssaiNumber !== undefined ||
              pending.fssaiExpiry !== undefined ||
              pending.fssaiImage !== undefined)

          const number = usePending && pending.fssaiNumber !== undefined
            ? pending.fssaiNumber
            : data.fssaiNumber
          const expiry = usePending && pending.fssaiExpiry !== undefined
            ? pending.fssaiExpiry
            : data.fssaiExpiry
          const image = usePending && pending.fssaiImage !== undefined
            ? pending.fssaiImage
            : data.fssaiImage

          setFssaiNumber(number || "")
          setFssaiExpiry(formatExpiryInput(expiry))
          setExistingImageUrl(imageUrlFrom(image))
        }
      } catch (error) {
        console.error("Error fetching FSSAI data:", error)
      } finally {
        setFetching(false)
      }
    }
    fetchCurrentData()
  }, [])

  const handleFileSelect = (file) => {
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size too large. Max 5MB allowed.")
        return
      }
      setUploadedFile(file)
      toast.success("FSSAI license selected")
    }
  }

  const handleFileClick = () => {
    if (isFlutterBridgeAvailable()) {
      setIsPhotoPickerOpen(true)
    } else {
      fileInputRef.current?.click()
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!fssaiNumber.trim()) {
      toast.error("FSSAI number is required")
      return
    }

    if (!/^\d{14}$/.test(fssaiNumber.trim())) {
      toast.error("FSSAI number must be exactly 14 digits")
      return
    }

    if (!fssaiExpiry) {
      toast.error("Expiry date is required")
      return
    }

    const expiryDate = new Date(fssaiExpiry)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (expiryDate < today) {
      toast.error("Expiry date must be in the future")
      return
    }

    if (!uploadedFile && !existingImageUrl) {
      toast.error("FSSAI license document is required")
      return
    }

    try {
      setLoading(true)
      let imageUrl = existingImageUrl

      if (uploadedFile) {
        const uploadRes = await restaurantAPI.uploadMenuImage(uploadedFile)
        imageUrl = uploadRes?.data?.data?.menuImage?.url || uploadRes?.data?.menuImage?.url || ""
      }

      await restaurantAPI.updateProfile({
        fssaiNumber: fssaiNumber.trim(),
        fssaiExpiry: fssaiExpiry,
        fssaiImage: imageUrl,
      })

      toast.success(
        pendingUpdateStatus === "rejected"
          ? "FSSAI changes resubmitted for admin approval"
          : "FSSAI changes sent for admin approval"
      )
      navigate("/food/restaurant/account?tab=fssai")
    } catch (error) {
      console.error("Error updating FSSAI:", error)
      toast.error(error.response?.data?.message || "Failed to update FSSAI details")
    } finally {
      setLoading(false)
    }
  }

  if (fetching) {
    return (
      <RestaurantPageShell hideHeader maxWidth="lg">
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-[#FF6A00] animate-spin mb-2" />
          <p className="text-sm text-gray-500">Loading current details...</p>
        </div>
      </RestaurantPageShell>
    )
  }

  return (
    <RestaurantPageShell
      title="Update FSSAI"
      onBack={() => navigate("/food/restaurant/account?tab=fssai")}
      maxWidth="lg"
      contentClassName="flex flex-col"
    >
      {pendingUpdateStatus === "pending" && (
        <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
          Your previous Legal & Compliance update is <span className="font-semibold">Pending Approval</span>. Saving will update the same request.
        </div>
      )}
      {pendingUpdateStatus === "rejected" && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">Update rejected</p>
          <p className="mt-1">{pendingUpdateReason || "Please edit and resubmit."}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} id="fssai-form" className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            FSSAI registration number
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={fssaiNumber}
            onChange={(e) => setFssaiNumber(e.target.value.replace(/\D/g, "").slice(0, 14))}
            placeholder="14-digit registration number"
            className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111] text-gray-900 dark:text-white rounded-xl px-3 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF6A00]/30 focus:border-[#FF6A00]"
          />
          <p className="text-[10px] text-gray-500 mt-1">Exactly 14 digits required</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Valid up to
          </label>
          <input
            type="date"
            value={fssaiExpiry}
            min={new Date().toISOString().split("T")[0]}
            onChange={(e) => setFssaiExpiry(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111] text-gray-900 dark:text-white rounded-xl px-3 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF6A00]/30 focus:border-[#FF6A00]"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-700">
            Upload your FSSAI license
          </label>
          <div
            onClick={handleFileClick}
            className="w-full rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-gray-100 transition-colors"
          >
            {uploadedFile ? (
              <div className="space-y-2">
                <div className="text-2xl">✅</div>
                <p className="text-sm font-medium text-gray-900">{uploadedFile.name}</p>
                <p className="text-xs text-gray-500">Click to change</p>
              </div>
            ) : existingImageUrl ? (
              <div className="space-y-2">
                <img src={existingImageUrl} alt="Current FSSAI" className="h-20 w-auto mx-auto object-contain rounded-lg border" />
                <p className="text-xs text-gray-500">Current license document</p>
                <p className="text-[10px] text-blue-600 font-medium">Click to upload new</p>
              </div>
            ) : (
              <>
                <div className="mb-2 text-2xl">⬆️</div>
                <p className="text-sm font-medium text-gray-900 mb-1">
                  Upload your FSSAI license
                </p>
                <p className="text-xs text-gray-500">
                  jpeg, png, or pdf (up to 5MB)
                </p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
              accept="image/*,application/pdf"
            />
          </div>
        </div>
      </form>

      <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-800">
        <button
          type="submit"
          form="fssai-form"
          className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
            fssaiNumber
              ? "bg-[#FF6A00] hover:bg-[#e05e00] text-white"
              : "bg-gray-200 dark:bg-gray-800 text-gray-500 cursor-not-allowed"
          }`}
          disabled={!fssaiNumber || loading}
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {loading
            ? "Submitting..."
            : pendingUpdateStatus === "rejected"
              ? "Edit & Resubmit"
              : "Submit for Approval"}
        </button>
      </div>

      <ImageSourcePicker
        isOpen={isPhotoPickerOpen}
        onClose={() => setIsPhotoPickerOpen(false)}
        onFileSelect={handleFileSelect}
        title="Upload FSSAI License"
        description="Choose how to upload your FSSAI license"
        fileNamePrefix="fssai-license"
        galleryInputRef={fileInputRef}
      />
    </RestaurantPageShell>
  )
}
