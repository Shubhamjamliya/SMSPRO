import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { motion } from "framer-motion"
import {
  BadgeCheck,
  Clock3,
  Edit2,
  Loader2,
  Plus,
  Trash2,
  AlertCircle,
  Truck,
} from "lucide-react"
import { restaurantAPI } from "@food/api"
import { toast } from "sonner"
import RestaurantPageShell from "@food/components/restaurant/RestaurantPageShell"

const PAGE_WRAP = "px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4"
const PANEL_CARD =
  "rounded-2xl border border-white/80 dark:border-gray-800 bg-white dark:bg-[#111] p-4 sm:p-5 shadow-[0_20px_48px_-34px_rgba(15,23,42,0.45)]"

const statusBadgeClass = (status) => {
  const value = String(status || "Pending").toLowerCase()
  if (value === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (value === "rejected") return "bg-rose-50 text-rose-700 border-rose-200"
  return "bg-amber-50 text-amber-700 border-amber-200"
}

const normalizeStatus = (status) => {
  const value = String(status || "pending").toLowerCase()
  if (value === "approved") return "Approved"
  if (value === "rejected") return "Rejected"
  return "Pending"
}

export default function CreateCouponsPage() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [coupons, setCoupons] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCoupons()
  }, [])

  const fetchCoupons = async () => {
    try {
      setLoading(true)
      const response = await restaurantAPI.getCoupons()
      const list = response?.data?.data || []
      setCoupons(Array.isArray(list) ? list : [])
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load coupons")
      setCoupons([])
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteCoupon = async (coupon) => {
    if (!window.confirm(`Are you sure you want to delete coupon "${coupon.couponCode}"?`)) return

    try {
      await restaurantAPI.deleteCoupon(coupon._id || coupon.id)
      toast.success("Coupon deleted successfully")
      fetchCoupons()
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete coupon")
    }
  }

  return (
    <RestaurantPageShell
      title="Create Coupons"
      subtitle="Submit campaigns for admin review & approval."
      onBack={goBack}
      flush
      maxWidth="full"
      contentClassName={PAGE_WRAP}
    >
      <div className={PANEL_CARD}>
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-slate-950 dark:text-white">Campaign Approval System</p>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-gray-400 leading-relaxed">
              Every coupon remains pending until approved by the admin. Once approved, users can apply it to orders from your outlet. Editing resets status to pending.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end w-full mb-6 mt-2">
        <button
          type="button"
          onClick={() => navigate("/food/restaurant/coupon/new")}
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8533] hover:from-[#e05e00] hover:to-[#FF6A00] px-6 py-2.5 text-sm font-semibold text-white transition-all shadow-lg shadow-[#FF6A00]/25 hover:shadow-xl hover:shadow-[#FF6A00]/40 transform hover:-translate-y-0.5"
        >
          <Plus className="h-5 w-5" />
          Create New Coupon
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : coupons.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-slate-200 dark:border-gray-700 bg-white/70 dark:bg-[#111]/70 px-4 py-16 sm:py-20 text-center shadow-[0_18px_40px_-34px_rgba(15,23,42,0.35)]">
          <p className="text-base sm:text-lg font-semibold text-slate-700 dark:text-white">No coupons yet</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">
            Create a custom campaign code and boost your orders.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {coupons.map((coupon) => {
            const status = normalizeStatus(coupon?.approvalStatus || coupon?.status)
            const startFormatted = coupon?.startDate
              ? new Date(coupon.startDate).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
              : "N/A"
            const endFormatted = (coupon?.endDate || coupon?.expiryDate)
              ? new Date(coupon.endDate || coupon.expiryDate).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
              : "N/A"

            return (
              <motion.div
                key={coupon._id || coupon.id}
                layout
                className={`${PANEL_CARD} flex flex-col justify-between group hover:border-[#FF6A00]/50 transition-colors relative overflow-hidden`}
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#FF6A00]/10 to-transparent rounded-bl-full -z-10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <span className="text-sm font-extrabold text-slate-950 dark:text-white tracking-wider bg-slate-100 dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-gray-700">
                      {coupon.couponCode}
                    </span>
                    <div className="flex items-center gap-2">
                      {status === "Pending" && coupon.previousApproved ? (
                        <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                          Resubmitted
                        </span>
                      ) : null}
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusBadgeClass(status)}`}>
                        {status === "Approved" ? <BadgeCheck className="mr-1 h-3.5 w-3.5" /> : <Clock3 className="mr-1 h-3.5 w-3.5" />}
                        {status}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5 mb-6">
                    <p className="text-base font-bold text-slate-950 dark:text-white truncate">
                      {coupon.couponName || "Coupon"}
                    </p>
                    <p className="text-lg font-extrabold text-[#FF6A00]">
                      {coupon.discountType === "percentage" ? `${coupon.discountValue}% OFF` : `₹${coupon.discountValue} FLAT OFF`}
                    </p>
                    <div className="text-xs sm:text-sm text-slate-500 dark:text-gray-400 mt-2 space-y-1">
                      <p>Min. Order: <span className="font-semibold text-slate-700 dark:text-slate-300">₹{coupon.minOrderAmount || 0}</span></p>
                      <p>Valid: {startFormatted} to {endFormatted}</p>
                      {coupon.usageLimit ? (
                        <p>{coupon.usedCount || 0} / {coupon.usageLimit} uses</p>
                      ) : null}
                    </div>
                    {coupon.freeDelivery ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 mt-2 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 w-max">
                        <Truck className="h-3.5 w-3.5" />
                        Free delivery
                      </span>
                    ) : null}
                    {coupon.description ? (
                      <p className="text-xs text-slate-500 dark:text-gray-400 italic mt-2 line-clamp-2">
                        &ldquo;{coupon.description}&rdquo;
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-auto">
                  {String(status).toLowerCase() === "rejected" && coupon.rejectionReason ? (
                    <div className="mb-4 bg-rose-50 dark:bg-rose-900/10 rounded-xl p-3 border border-rose-100 dark:border-rose-900/30">
                      <p className="text-[10px] font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider mb-1">Admin Feedback</p>
                      <p className="text-xs text-rose-900 dark:text-rose-200 line-clamp-2" title={coupon.rejectionReason}>{coupon.rejectionReason}</p>
                    </div>
                  ) : null}
                  <div className="flex gap-3 border-t border-slate-100 dark:border-gray-800 pt-4">
                    <button
                      type="button"
                      onClick={() => navigate(`/food/restaurant/coupon/${coupon._id || coupon.id}/edit`)}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-slate-50 dark:bg-gray-800/50 p-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-800 transition-colors"
                      title="Edit Coupon"
                    >
                      <Edit2 className="h-4 w-4" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCoupon(coupon)}
                      className="flex items-center justify-center rounded-xl bg-red-50 dark:bg-red-900/20 p-2.5 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                      title="Delete Coupon"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </RestaurantPageShell>
  )
}
