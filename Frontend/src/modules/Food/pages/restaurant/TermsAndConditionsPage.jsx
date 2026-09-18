import { motion } from "framer-motion"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import RestaurantPageShell from "@food/components/restaurant/RestaurantPageShell"
import { useEffect, useState } from "react"
import api, { API_ENDPOINTS } from "@food/api"

export default function TermsAndConditionsPage() {
  const goBack = useRestaurantBackNavigation()
  const [loading, setLoading] = useState(true)
  const [termsData, setTermsData] = useState({ title: "Terms and Conditions", content: "", updatedAt: "" })

  useEffect(() => {
    const fetchTerms = async () => {
      try {
        const response = await api.get(`${API_ENDPOINTS.ADMIN.TERMS_PUBLIC}?role=restaurant`)
        if (response?.data?.success) {
          const payload = response?.data?.data || {}
          setTermsData({
            title: payload?.title || "Terms and Conditions",
            content: payload?.content || "",
            updatedAt: payload?.updatedAt || ""
          })
        }
      } catch (_) {
      } finally {
        setLoading(false)
      }
    }

    fetchTerms()
  }, [])

  return (
    <RestaurantPageShell
      title="Terms & Conditions"
      onBack={goBack}
      maxWidth="2xl"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-white dark:bg-[#111] rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 space-y-6"
      >
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{termsData.title || "Terms and Conditions"}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Last updated: {(termsData.updatedAt ? new Date(termsData.updatedAt) : new Date()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Loading terms...</p>
        ) : termsData.content ? (
          <div
            className="prose prose-sm max-w-none text-sm text-gray-700 dark:text-gray-300 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: termsData.content }}
          />
        ) : (
          <p className="text-sm text-gray-500">No terms content available.</p>
        )}
      </motion.div>
    </RestaurantPageShell>
  )
}
