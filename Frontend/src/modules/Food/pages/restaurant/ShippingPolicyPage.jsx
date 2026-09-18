import { motion } from "framer-motion"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import RestaurantPageShell from "@food/components/restaurant/RestaurantPageShell"
import { useEffect, useState } from "react"
import api, { API_ENDPOINTS } from "@food/api"

export default function ShippingPolicyPage() {
  const goBack = useRestaurantBackNavigation()
  const [loading, setLoading] = useState(true)
  const [shippingData, setShippingData] = useState({ title: "Shipping Policy", content: "", updatedAt: "" })

  useEffect(() => {
    const fetchShipping = async () => {
      try {
        const response = await api.get(`${API_ENDPOINTS.ADMIN.SHIPPING_PUBLIC}?role=restaurant`)
        if (response?.data?.success) {
          const payload = response?.data?.data || {}
          setShippingData({
            title: payload?.title || "Shipping Policy",
            content: payload?.content || "",
            updatedAt: payload?.updatedAt || ""
          })
        }
      } catch (_) {
      } finally {
        setLoading(false)
      }
    }

    fetchShipping()
  }, [])

  return (
    <RestaurantPageShell
      title="Shipping Policy"
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{shippingData.title || "Shipping Policy"}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Last updated: {(shippingData.updatedAt ? new Date(shippingData.updatedAt) : new Date()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Loading shipping policy...</p>
        ) : shippingData.content ? (
          <div
            className="prose prose-sm max-w-none text-sm text-gray-700 dark:text-gray-300 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: shippingData.content }}
          />
        ) : (
          <p className="text-sm text-gray-500">No shipping policy content available.</p>
        )}
      </motion.div>
    </RestaurantPageShell>
  )
}
