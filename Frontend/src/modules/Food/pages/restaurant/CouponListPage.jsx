import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useNavigate } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import Lenis from "lenis"
import { 
  ArrowLeft,
  MoreVertical,
  Plus,
  Flame
} from "lucide-react"
import { Card, CardContent } from "@food/components/ui/card"
import BottomNavbar from "@food/components/restaurant/BottomNavbar"
import MenuOverlay from "@food/components/restaurant/MenuOverlay"
import { formatCurrency, usdToInr } from "@food/utils/currency"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}
import { restaurantAPI } from "@food/api"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

export default function CouponListPage() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [showMenu, setShowMenu] = useState(false)
  const [openMenuId, setOpenMenuId] = useState(null)

  // Lenis smooth scrolling
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    })

    function raf(time) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }

    requestAnimationFrame(raf)

    return () => {
      lenis.destroy()
    }
  }, [])

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openMenuId && !event.target.closest(`[data-menu-id="${openMenuId}"]`)) {
        setOpenMenuId(null)
      }
    }

    if (openMenuId) {
      document.addEventListener("mousedown", handleClickOutside)
      document.addEventListener("touchstart", handleClickOutside)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("touchstart", handleClickOutside)
    }
  }, [openMenuId])

  const queryClient = useQueryClient()
  
  const { data, isLoading } = useQuery({
    queryKey: ['restaurantCoupons'],
    queryFn: async () => {
      const res = await restaurantAPI.getCoupons()
      return res.data?.data || []
    }
  })

  const coupons = data || []

  const deleteMutation = useMutation({
    mutationFn: (id) => restaurantAPI.deleteCoupon(id),
    onSuccess: () => {
      toast.success("Coupon deleted successfully")
      queryClient.invalidateQueries(['restaurantCoupons'])
    },
    onError: (error) => {
      toast.error(error?.response?.data?.message || "Failed to delete coupon")
    }
  })

  return (
    <div className="min-h-screen bg-[#f6e9dc] overflow-x-hidden pb-24 md:pb-6">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50 flex items-center gap-3">
        <button 
          onClick={goBack}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 flex-1">Coupon List</h1>
      </div>

      {/* Coupon List */}
      <div className="px-4 py-4 space-y-4">
        {coupons.map((coupon, index) => (
          <motion.div
            key={coupon.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.1, ease: [0.4, 0, 0.2, 1] }}
            whileHover={{ y: -4, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            className="relative"
          >
            <Card className="bg-white shadow-md border border-gray-200 overflow-hidden relative">
              <CardContent className="p-0">
                {/* Menu Button - Top Right */}
                <div className="absolute top-2 right-2 z-10">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpenMenuId(openMenuId === coupon.id ? null : coupon.id)
                    }}
                    className="p-1.5 bg-red-100 hover:bg-red-200 rounded transition-colors"
                    data-menu-id={coupon.id}
                  >
                    <MoreVertical className="w-4 h-4 text-[#ff8100]" />
                  </motion.button>
                  
                  {/* Context Menu */}
                  <AnimatePresence>
                    {openMenuId === coupon.id && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="absolute top-full right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-200 py-2 z-50 min-w-[180px]"
                        data-menu-id={coupon.id}
                      >
                              { 
                                label: "Edit Coupon", 
                                action: () => navigate(`/food/restaurant/coupon/${coupon._id || coupon.id}/edit`) 
                              },
                              { 
                                label: "Delete Coupon", 
                                action: () => {
                                  if (window.confirm("Are you sure you want to delete this coupon?")) {
                                    deleteMutation.mutate(coupon._id || coupon.id)
                                  }
                                }, 
                                isDanger: true 
                              }
                            ].map((option, idx) => (
                              <motion.button
                                key={option.label}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.03, duration: 0.2 }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  option.action()
                                  setOpenMenuId(null)
                                }}
                                whileHover={{ x: 4 }}
                                whileTap={{ scale: 0.95 }}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
                                  option.isDanger
                                    ? "text-red-600 hover:bg-red-50"
                                    : "text-gray-700 hover:bg-gray-50"
                                }`}
                              >
                                <span>{option.label}</span>
                              </motion.button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                </div>

                <div className="flex">
                  {/* Left Section */}
                  <div className="flex-1 p-4 flex flex-col items-center justify-center bg-gradient-to-br from-red-50 to-red-100/50">
                    <div className="mb-3">
                      <div className="w-16 h-16 bg-[#ff8100] rounded-full flex items-center justify-center shadow-md">
                        <Flame className="w-8 h-8 text-white" />
                      </div>
                    </div>
                    <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
                      {coupon.discountType === 'percentage' ? `${coupon.discountValue}% OFF` : `₹${coupon.discountValue} FLAT`}
                    </h2>
                    <p className="text-sm font-semibold text-gray-600 text-center tracking-wide uppercase">
                      {coupon.couponCode}
                    </p>
                    
                    {/* Status Badge */}
                    <div className="mt-3">
                      {coupon.approvalStatus === 'approved' && (
                        <span className="px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase bg-emerald-100 text-emerald-700 rounded-full border border-emerald-200 shadow-sm">
                          Active
                        </span>
                      )}
                      {(coupon.approvalStatus === 'pending' || !coupon.approvalStatus) && (
                        <span className="px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase bg-amber-100 text-amber-700 rounded-full border border-amber-200 shadow-sm flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" /> Pending Approval
                        </span>
                      )}
                      {coupon.approvalStatus === 'rejected' && (
                        <span className="px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase bg-rose-100 text-rose-700 rounded-full border border-rose-200 shadow-sm">
                          Rejected
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Perforated Line */}
                  <div className="relative w-8 flex-shrink-0">
                    <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 border-l-2 border-dashed border-gray-300"></div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-[#f6e9dc] rounded-full border-2 border-gray-300"></div>
                    <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#f6e9dc] rounded-full border border-gray-300"></div>
                    <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#f6e9dc] rounded-full border border-gray-300"></div>
                  </div>

                  {/* Right Section */}
                  <div className="flex-1 p-4 flex flex-col justify-center">
                    {/* Coupon Name */}
                    <h3 className="text-lg font-bold text-gray-900 mb-2 truncate">
                      {coupon.couponName || "Coupon"}
                    </h3>

                    {/* Validity */}
                    <p className="text-xs text-gray-600 mb-2 font-medium">
                      {new Date(coupon.startDate || coupon.createdAt).toLocaleDateString()} to {new Date(coupon.endDate || coupon.expiryDate).toLocaleDateString()}
                    </p>

                    {/* Min Purchase */}
                    <p className="text-xs">
                      <span className="text-red-600 font-medium">*Min order</span>{" "}
                      <span className="text-gray-700 font-semibold text-sm">₹{coupon.minOrderAmount || 0}</span>
                    </p>
                  </div>
                </div>

                {/* Rejection Reason Footer */}
                {coupon.approvalStatus === 'rejected' && coupon.rejectionReason && (
                  <div className="bg-rose-50 px-4 py-3 border-t border-rose-100 flex items-start gap-2">
                    <div className="flex-1">
                      <p className="text-[11px] font-bold text-rose-700 uppercase tracking-wide mb-0.5">Admin Feedback</p>
                      <p className="text-sm text-rose-900 leading-snug font-medium">{coupon.rejectionReason}</p>
                    </div>
                    <button
                      onClick={() => navigate(`/food/restaurant/coupon/${coupon._id || coupon.id}/edit`)}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-md shadow-sm transition-colors whitespace-nowrap"
                    >
                      Fix & Resubmit
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}

        {/* Empty State */}
        {!isLoading && coupons.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-sm">No coupons found</p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-[#ff8100] animate-spin" />
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => {
          navigate("/food/restaurant/coupon/new")
        }}
        className="fixed bottom-20 md:bottom-6 right-4 md:right-6 w-14 h-14 bg-[#ff8100] hover:bg-[#e67300] text-white rounded-full shadow-lg flex items-center justify-center z-40 transition-colors"
      >
        <Plus className="w-6 h-6" />
      </motion.button>

      {/* Bottom Navigation Bar */}
      <BottomNavbar onMenuClick={() => setShowMenu(true)} />
      
      {/* Menu Overlay */}
      <MenuOverlay showMenu={showMenu} setShowMenu={setShowMenu} />
    </div>
  )
}


