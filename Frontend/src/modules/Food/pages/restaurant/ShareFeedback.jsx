import { useState } from "react"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { motion } from "framer-motion"
import { CheckCircle2, Smile } from "lucide-react"
import api from "@food/api"
import { API_ENDPOINTS } from "@food/api/config"
import { toast } from "sonner"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { Modal } from "@food/components/restaurant/Modal"
import RestaurantPageShell from "@food/components/restaurant/RestaurantPageShell"

const debugError = (...args) => {}

const LABELS = ["😞", "😕", "😐", "🙂", "😊", "😁", "😄", "🤩", "⭐", "🔥", "💯"]

export default function ShareFeedback() {
  const companyName = useCompanyName()
  const goBack = useRestaurantBackNavigation()
  const [rating, setRating] = useState(null)
  const [showThanks, setShowThanks] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleContinue = async () => {
    if (rating === null) return
    try {
      setIsSubmitting(true)
      const response = await api.post(API_ENDPOINTS.ADMIN.FEEDBACK_EXPERIENCE_CREATE, {
        rating: Math.ceil(rating / 2) || 1,
        module: "restaurant",
        comment: `User rated ${rating}/10 overall experience`,
      })
      if (response.data?.success) {
        setShowThanks(true)
      } else {
        throw new Error(response.data?.message || "Failed to submit")
      }
    } catch (error) {
      debugError("Error submitting feedback:", error)
      toast.error(error.message || "Failed to save feedback")
    } finally {
      setIsSubmitting(false)
    }
  }

  const emoji = LABELS[rating ?? 5]

  return (
    <RestaurantPageShell
      title="Share Feedback"
      subtitle="Help us improve your experience"
      onBack={goBack}
      maxWidth="lg"
      contentClassName="flex flex-col"
    >
      <div className="py-4 flex flex-col">
        {/* Emoji */}
        <div className="flex flex-col items-center mb-10">
          <motion.div
            key={rating ?? "default"}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className="text-7xl mb-4 select-none"
          >
            {rating !== null ? emoji : <Smile className="w-20 h-20 text-gray-200 dark:text-gray-700" strokeWidth={1} />}
          </motion.div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Overall experience with</p>
          <p className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">{companyName}</p>
        </div>

        {/* Rating grid */}
        <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 p-4 mb-4">
          <p className="text-xs font-bold text-gray-400 dark:text-gray-600 uppercase tracking-widest mb-4 text-center">
            How would you rate us? (0–10)
          </p>
          <div className="grid grid-cols-11 gap-1">
            {Array.from({ length: 11 }, (_, i) => i).map((num) => {
              const isActive = rating === num
              return (
                <motion.button
                  key={num}
                  type="button"
                  onClick={() => setRating(num)}
                  whileTap={{ scale: 0.85 }}
                  className={`aspect-square rounded-xl text-sm font-bold transition-colors ${
                    isActive
                      ? "bg-[#FF6A00] text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {num}
                </motion.button>
              )
            })}
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-[10px] text-red-400 font-medium">Very Bad</span>
            <span className="text-[10px] text-green-500 font-medium">Very Good</span>
          </div>
        </div>

        {rating !== null && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <p className="text-sm text-gray-500 dark:text-gray-400">
              You selected <span className="font-bold text-[#FF6A00]">{rating}/10</span>
            </p>
          </motion.div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
        <button
          onClick={handleContinue}
          disabled={rating === null || isSubmitting}
          className="w-full h-12 bg-[#FF6A00] hover:bg-[#e05e00] disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white font-semibold text-sm rounded-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {isSubmitting
            ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Submitting…</>
            : "Submit Feedback"
          }
        </button>
      </div>

      {/* Thank you modal */}
      <Modal
        open={showThanks}
        onClose={() => { setShowThanks(false); goBack() }}
        size="sm"
        showClose={false}
      >
        <div className="text-center pt-2">
          <div className="w-16 h-16 bg-green-50 dark:bg-green-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-9 h-9 text-green-600 dark:text-green-400" strokeWidth={1.5} />
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Thanks for sharing!</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Your feedback helps us improve {companyName} for everyone.
          </p>
          <button
            onClick={() => { setShowThanks(false); goBack() }}
            className="w-full h-12 bg-[#FF6A00] text-white font-semibold text-sm rounded-2xl"
          >
            Done
          </button>
        </div>
      </Modal>
    </RestaurantPageShell>
  )
}
