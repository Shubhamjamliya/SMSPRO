import { useState } from "react"
import RestaurantPageShell from "@food/components/restaurant/RestaurantPageShell"
import { motion, AnimatePresence } from "framer-motion"
import { Star, ChevronDown, ThumbsUp, ThumbsDown, MessageSquare } from "lucide-react"

const accordionItems = [
  { id: 1, question: "How is my restaurant's rating calculated?", answer: "Your rating is the average of all customer ratings received from delivery and dining orders. More recent reviews are weighted slightly higher." },
  { id: 2, question: "Why am I not getting ratings on all orders?", answer: "Not all customers leave ratings. About 30–40% of customers typically provide feedback. Some may skip the step or have different order types." },
  { id: 3, question: "Can I contact a customer about a rating?", answer: "You can reach customers via the order details page if they shared a phone number. Please be respectful and professional in all interactions." },
  { id: 4, question: "How to raise a concern about a delivery-related rating?", answer: "Navigate to the specific order details, tap 'Raise Concern', and select 'Delivery Partner Issue' to flag it for review." },
  { id: 5, question: "What if I disagree with a rating?", answer: "You can reply publicly to a review to address concerns professionally, or raise a concern if you believe the rating violates our guidelines." },
  { id: 6, question: "How can I reply to a customer review?", answer: "Go to the Reviews section in your dashboard, find the review, and tap 'Reply'. Write a courteous and professional response." },
]

export default function RatingsReviews() {
  const [expandedItems, setExpandedItems] = useState(new Set())
  const [feedback, setFeedback] = useState(null) // null | "helpful" | "not_helpful"

  const toggleAccordion = (id) => {
    setExpandedItems(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <RestaurantPageShell
      title="Ratings & Reviews"
      subtitle="Manage customer feedback and your rating"
      onBack={goBack}
      maxWidth="2xl"
      contentClassName="space-y-4"
    >
      {/* Rating summary card */}
      <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex items-center gap-4">
        <div className="w-16 h-16 bg-green-500 rounded-2xl flex flex-col items-center justify-center flex-shrink-0">
          <span className="text-2xl font-bold text-white leading-none">4.0</span>
          <Star className="w-4 h-4 text-white mt-0.5" fill="white" strokeWidth={0} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 dark:text-white">Your restaurant rating</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Based on customer orders</p>
          <button className="mt-2 text-xs font-semibold text-[#FF6A00] flex items-center gap-1">
            <MessageSquare className="w-3 h-3" strokeWidth={2} />
            View all reviews
          </button>
        </div>
      </div>

      {/* FAQ accordion */}
      <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-800/60">
          <p className="text-sm font-bold text-gray-900 dark:text-white">Common questions</p>
        </div>

        {accordionItems.map((item, idx) => {
          const isExpanded = expandedItems.has(item.id)
          const isLast = idx === accordionItems.length - 1
          return (
            <div key={item.id} className={!isLast ? "border-b border-gray-50 dark:border-gray-800/60" : ""}>
              <button
                onClick={() => toggleAccordion(item.id)}
                className="w-full flex items-center justify-between px-4 py-3.5 text-left gap-3"
              >
                <span className="text-sm text-gray-800 dark:text-gray-200 font-medium leading-snug">{item.question}</span>
                <ChevronDown
                  className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                  strokeWidth={2.5}
                />
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <p className="px-4 pb-4 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                      {item.answer}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>

      {/* Feedback on FAQ */}
      <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
        {feedback === null ? (
          <>
            <p className="text-sm font-semibold text-gray-900 dark:text-white text-center mb-4">Was this helpful?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setFeedback("helpful")}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-[#FF6A00]/30 bg-[#FF6A00]/5 text-[#FF6A00] text-sm font-semibold hover:bg-[#FF6A00]/10 transition-colors"
              >
                <ThumbsUp className="w-4 h-4" strokeWidth={2} />
                Yes, helpful
              </button>
              <button
                onClick={() => setFeedback("not_helpful")}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <ThumbsDown className="w-4 h-4" strokeWidth={2} />
                Not helpful
              </button>
            </div>
          </>
        ) : feedback === "helpful" ? (
          <div className="flex items-center justify-center gap-2 py-1">
            <ThumbsUp className="w-5 h-5 text-green-500" strokeWidth={2} />
            <p className="text-sm font-semibold text-green-600 dark:text-green-400">Thanks for your feedback!</p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Sorry to hear that. Need more help?</p>
            <button className="h-10 px-5 bg-[#FF6A00] text-white text-sm font-semibold rounded-xl">
              Contact Support
            </button>
          </div>
        )}
      </div>
    </RestaurantPageShell>
  )
}
