import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { Eye, Loader2, ShieldCheck, FileImage, Calendar, Hash, AlertCircle, X } from "lucide-react"
import { restaurantAPI } from "@food/api"
import { toast } from "sonner"

export default function FssaiDetails() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [restaurantData, setRestaurantData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showViewer, setShowViewer] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const response = await restaurantAPI.getCurrentRestaurant()
        const data = response?.data?.data?.restaurant || response?.data?.restaurant
        if (data) setRestaurantData(data)
      } catch (error) {
        toast.error("Failed to load FSSAI details")
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const formatDate = (dateString) => {
    if (!dateString) return "Not available"
    try {
      return new Date(dateString).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    } catch { return dateString }
  }

  const hasFssai = restaurantData?.fssaiNumber && restaurantData.fssaiNumber.trim() !== ""
  const imgSrc = restaurantData?.fssaiImage
    ? (typeof restaurantData.fssaiImage === "string" ? restaurantData.fssaiImage : restaurantData.fssaiImage?.url)
    : null

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-gray-300 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] flex flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-[#111] border-b border-gray-100 dark:border-gray-800 px-4 py-4">
        <h1 className="text-base font-bold text-gray-900 dark:text-white">FSSAI License</h1>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Your food safety registration details</p>
      </div>

      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-5 space-y-4">
        {/* Status banner */}
        {!hasFssai && (
          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" strokeWidth={2} />
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">FSSAI details not available</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Upload your license to complete compliance.</p>
            </div>
          </div>
        )}

        {/* Detail card */}
        <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          {/* Registration number */}
          <div className="px-4 py-4 flex items-center gap-3 border-b border-gray-50 dark:border-gray-800/60">
            <div className="w-9 h-9 bg-[#FF6A00]/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <Hash className="w-4.5 h-4.5 text-[#FF6A00]" style={{ width: 18, height: 18 }} strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400 dark:text-gray-500">Registration number</p>
              <p className={`text-sm font-bold mt-0.5 ${hasFssai ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-600"}`}>
                {restaurantData?.fssaiNumber || "Not available"}
              </p>
            </div>
          </div>

          {/* Document */}
          <div className="px-4 py-4 flex items-center gap-3 border-b border-gray-50 dark:border-gray-800/60">
            <div className="w-9 h-9 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <FileImage className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" style={{ width: 18, height: 18 }} strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400 dark:text-gray-500">License document</p>
              <p className={`text-sm font-bold mt-0.5 ${imgSrc ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-600"}`}>
                {imgSrc ? "FSSAI License Document" : "No document uploaded"}
              </p>
            </div>
            {imgSrc && (
              <button
                onClick={() => setShowViewer(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
              >
                <Eye className="w-3 h-3" />
                View
              </button>
            )}
          </div>

          {/* Expiry */}
          <div className="px-4 py-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-green-50 dark:bg-green-900/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <Calendar className="w-4.5 h-4.5 text-green-600 dark:text-green-400" style={{ width: 18, height: 18 }} strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400 dark:text-gray-500">Valid until</p>
              <p className={`text-sm font-bold mt-0.5 ${restaurantData?.fssaiExpiry ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-600"}`}>
                {formatDate(restaurantData?.fssaiExpiry)}
              </p>
            </div>
          </div>
        </div>

        {/* Compliance note */}
        <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-[#FF6A00] flex-shrink-0 mt-0.5" strokeWidth={2} />
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            FSSAI registration is mandatory for all food businesses in India. Keep your license up to date to continue receiving orders.
          </p>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-white dark:bg-[#111] border-t border-gray-100 dark:border-gray-800 px-4 py-4">
        <button
          onClick={() => navigate("/food/restaurant/fssai/update")}
          className="w-full h-12 bg-[#FF6A00] hover:bg-[#e05e00] text-white font-semibold text-sm rounded-2xl active:scale-[0.98] transition-all"
        >
          {hasFssai ? "Update FSSAI license" : "Add FSSAI license"}
        </button>
      </div>

      {/* Image viewer */}
      {showViewer && imgSrc && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
          <div className="px-4 py-4 flex items-center justify-between border-b border-white/10">
            <h3 className="text-sm font-semibold text-white">FSSAI License Document</h3>
            <button onClick={() => setShowViewer(false)} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
            <img src={imgSrc} alt="FSSAI License" className="max-w-full max-h-full object-contain rounded-xl" />
          </div>
        </div>
      )}
    </div>
  )
}
