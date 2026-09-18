import { useState, useRef, useEffect, useMemo } from "react"
import { useLocation } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, ChevronUp, Download, Mail, Info } from "lucide-react"
import { Modal } from "@food/components/restaurant/Modal"
import RestaurantPageShell from "@food/components/restaurant/RestaurantPageShell"

export default function FinanceDetailsPage() {
  const goBack = useRestaurantBackNavigation()
  const location = useLocation()
  const financeData = location.state?.financeData || null
  const restaurantData = location.state?.restaurantData || null
  
  const [activeTab, setActiveTab] = useState("summary")
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [showDownloadPopup, setShowDownloadPopup] = useState(false)
  const [showEmailPopup, setShowEmailPopup] = useState(false)
  const [expandedSections, setExpandedSections] = useState({
    netOrderValue: true,
    additions: true,
    orderLevelDeductions: true,
    taxDeductions: true,
    investmentsInGrowth: true,
  })
  const topTabBarRef = useRef(null)

  const tabs = [
    { id: "summary", label: "Summary" },
    { id: "orders", label: "Orders" },
    { id: "expenses", label: "Expenses" },
  ]

  const scrollToTopTab = (index) => {
    if (topTabBarRef.current) {
      const buttons = topTabBarRef.current.querySelectorAll("button")
      if (buttons[index]) {
        const button = buttons[index]
        const container = topTabBarRef.current
        const buttonLeft = button.offsetLeft
        const buttonWidth = button.offsetWidth
        const containerWidth = container.offsetWidth
        const scrollLeft = buttonLeft - containerWidth / 2 + buttonWidth / 2

        container.scrollTo({
          left: scrollLeft,
          behavior: "smooth",
        })
      }
    }
  }

  useEffect(() => {
    const index = tabs.findIndex((tab) => tab.id === activeTab)
    if (index >= 0) {
      requestAnimationFrame(() => scrollToTopTab(index))
    }
  }, [activeTab])

  const handleDownload = () => {
    setShowDownloadPopup(true)
    // In a real app, this would trigger PDF download
    setTimeout(() => {
      setShowDownloadPopup(false)
    }, 2000)
  }

  const handleEmail = () => {
    setShowEmailPopup(true)
    // In a real app, this would send email
    setTimeout(() => {
      setShowEmailPopup(false)
    }, 2000)
  }

  // Settlement data with real values from financeData
  const settlementData = useMemo(() => {
    const cycle = financeData?.currentCycle || {};
    const summary = financeData?.invoiceSummary || {};
    
    return {
      totalOrders: cycle.totalOrders || 0,
      netOrderValue: {
        itemSubtotal: summary.subtotal || 0,
        totalGSTCollected: summary.taxes || 0,
        restaurantDiscountPromos: 0,
        restaurantDiscountOthers: 0,
        total: summary.subtotal || 0
      },
      additions: {
        tds194H: 0,
        tds194C: 0,
        total: 0
      },
      orderLevelDeductions: {
        total: 0
      },
      taxDeductions: {
        gstOnServiceFees: 0,
        tds194O: 0,
        gstPaidByZomato: 0,
        total: summary.taxes || 0
      },
      investmentsInGrowth: {
        onlineOrderingAds: 0,
        total: 0
      },
      estimatedPayout: cycle.estimatedPayout || 0,
      start: cycle.start?.day || "15",
      end: cycle.end?.day || "21",
      month: cycle.start?.month || "Dec",
      year: cycle.start?.year || "25"
    }
  }, [financeData])

  const estimatedPayout = settlementData.estimatedPayout;

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  const tabButtons = (
    <div
      ref={topTabBarRef}
      className="flex gap-2 overflow-x-auto scrollbar-hide bg-transparent rounded-full py-2"
      style={{
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        WebkitOverflowScrolling: 'touch'
      }}
    >
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <motion.button
            key={tab.id}
            onClick={() => {
              if (!isTransitioning) {
                setIsTransitioning(true)
                setActiveTab(tab.id)
                setTimeout(() => setIsTransitioning(false), 300)
              }
            }}
            className={`shrink-0 px-6 py-3.5 rounded-full font-medium text-sm whitespace-nowrap relative overflow-hidden ${
              isActive ? 'text-white' : 'bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-300'
            }`}
            animate={{
              scale: isActive ? 1.05 : 1,
              opacity: isActive ? 1 : 0.7,
            }}
            transition={{
              duration: 0.3,
              ease: [0.25, 0.1, 0.25, 1],
            }}
            whileTap={{ scale: 0.95 }}
          >
            {isActive && (
              <motion.div
                layoutId="financeTopTabActive"
                className="absolute inset-0 bg-[#FF6A00] rounded-full -z-10"
                initial={false}
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 30,
                }}
              />
            )}
            <span className="relative z-10">{tab.label}</span>
          </motion.button>
        )
      })}
    </div>
  )

  return (
    <RestaurantPageShell
      title={restaurantData?.name || "Your Restaurant"}
      subtitle={`ID: ${restaurantData?.restaurantId || "N/A"} • ${restaurantData?.address || "Location"}`}
      onBack={goBack}
      maxWidth="6xl"
      tabs={tabButtons}
      contentClassName="py-4"
    >
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {activeTab === "summary" && (
              <div className="space-y-6">
                {/* Estimated Payout Card */}
                <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Active Earnings</p>
                      <p className="text-2xl font-bold text-[#FF6A00] mb-1">
                        ₹{estimatedPayout.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">from {settlementData.start} - {settlementData.end} {settlementData.month}'{settlementData.year}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Payout date: -</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Payout for</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{settlementData.start} - {settlementData.end} {settlementData.month}'{settlementData.year}</p>
                    </div>
                  </div>
                </div>

                {/* Settlement Summary */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-base font-bold text-gray-900 dark:text-white">Settlement summary</h2>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleDownload}
                        className="p-2 bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <Download className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                      </button>
                      <button
                        onClick={handleEmail}
                        className="p-2 bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <Mail className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                      </button>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                    {/* Total Orders */}
                    <div className="px-4 py-3 border-b border-gray-100">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-900 dark:text-white">Total orders</span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">{settlementData.totalOrders}</span>
                      </div>
                    </div>

                    {/* Net order value (A) */}
                    <div className="border-b border-gray-100">
                      <button
                        onClick={() => toggleSection('netOrderValue')}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">Net order value (A)</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-gray-900">
                            ₹{(settlementData.netOrderValue?.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                          {expandedSections.netOrderValue ? (
                            <ChevronUp className="w-4 h-4 text-gray-500" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-500" />
                          )}
                        </div>
                      </button>
                      <AnimatePresence>
                        {expandedSections.netOrderValue && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-3 space-y-2 border-t border-dashed border-gray-200">
                              <div className="flex items-center justify-between py-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm text-gray-700">Item subtotal</span>
                                  <Info className="w-3.5 h-3.5 text-gray-400" />
                                </div>
                                <span className="text-sm font-medium text-gray-900">
                                  ₹{settlementData.netOrderValue.itemSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div className="flex items-center justify-between py-2 border-t border-dashed border-gray-200">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm text-gray-700">Total GST collected from customers</span>
                                  <Info className="w-3.5 h-3.5 text-gray-400" />
                                </div>
                                <span className="text-sm font-medium text-gray-900">
                                  ₹{(settlementData.netOrderValue?.totalGSTCollected || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div className="flex items-center justify-between py-2 border-t border-dashed border-gray-200">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm text-gray-700">Restaurant discount (Promos)</span>
                                  <Info className="w-3.5 h-3.5 text-gray-400" />
                                </div>
                                <span className="text-sm font-medium text-gray-900">
                                  ₹{settlementData.netOrderValue.restaurantDiscountPromos.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div className="flex items-center justify-between py-2 border-t border-dashed border-gray-200">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm text-gray-700">Restaurant discount (Flat offs, Freebies, Gold, relisted orders and others)</span>
                                  <Info className="w-3.5 h-3.5 text-gray-400" />
                                </div>
                                <span className="text-sm font-medium text-gray-900">
                                  ₹{(settlementData.netOrderValue?.restaurantDiscountOthers || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Additions (B) */}
                    <div className="border-b border-gray-100">
                      <button
                        onClick={() => toggleSection('additions')}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">Additions (B)</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-gray-900">
                            ₹{settlementData.additions.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                          {expandedSections.additions ? (
                            <ChevronUp className="w-4 h-4 text-gray-500" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-500" />
                          )}
                        </div>
                      </button>
                      <AnimatePresence>
                        {expandedSections.additions && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-3 space-y-2 border-t border-dashed border-gray-200">
                              <div className="flex items-center justify-between py-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm text-gray-700">TDS 194H</span>
                                  <Info className="w-3.5 h-3.5 text-gray-400" />
                                </div>
                                <span className="text-sm font-medium text-gray-900">
                                  ₹{(settlementData.additions?.tds194H || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div className="flex items-center justify-between py-2 border-t border-dashed border-gray-200">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm text-gray-700">TDS 194C</span>
                                  <Info className="w-3.5 h-3.5 text-gray-400" />
                                </div>
                                <span className="text-sm font-medium text-gray-900">
                                  ₹{settlementData.additions.tds194C.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Order level deductions (C) */}
                    <div className="border-b border-gray-100">
                      <button
                        onClick={() => toggleSection('orderLevelDeductions')}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">Order level deductions (C)</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-gray-900">
                            ₹{(settlementData.orderLevelDeductions?.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                          {expandedSections.orderLevelDeductions ? (
                            <ChevronUp className="w-4 h-4 text-gray-500" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-500" />
                          )}
                        </div>
                      </button>
                    </div>

                    {/* Tax deductions (D) */}
                    <div className="border-b border-gray-100">
                      <button
                        onClick={() => toggleSection('taxDeductions')}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">Tax deductions (D)</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-gray-900">
                            ₹{settlementData.taxDeductions.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                          {expandedSections.taxDeductions ? (
                            <ChevronUp className="w-4 h-4 text-gray-500" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-500" />
                          )}
                        </div>
                      </button>
                      <AnimatePresence>
                        {expandedSections.taxDeductions && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-3 space-y-2 border-t border-dashed border-gray-200">
                              <div className="flex items-center justify-between py-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm text-gray-700">GST on service and payment mechanism fees @18%</span>
                                  <Info className="w-3.5 h-3.5 text-gray-400" />
                                </div>
                                <span className="text-sm font-medium text-gray-900">
                                  ₹{(settlementData.taxDeductions?.gstOnServiceFees || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div className="flex items-center justify-between py-2 border-t border-dashed border-gray-200">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm text-gray-700">TDS 194O</span>
                                  <Info className="w-3.5 h-3.5 text-gray-400" />
                                </div>
                                <span className="text-sm font-medium text-gray-900">
                                  ₹{settlementData.taxDeductions.tds194O.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div className="flex items-center justify-between py-2 border-t border-dashed border-gray-200">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm text-gray-700">GST paid by Zomato on behalf of the restaurant u/s 9(5) of GST</span>
                                  <Info className="w-3.5 h-3.5 text-gray-400" />
                                </div>
                                <span className="text-sm font-medium text-gray-900">
                                  ₹{(settlementData.taxDeductions?.gstPaidByZomato || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Investments in growth (E) */}
                    <div className="border-b border-gray-100">
                      <button
                        onClick={() => toggleSection('investmentsInGrowth')}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">Investments in growth (E)</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-gray-900">
                            ₹{settlementData.investmentsInGrowth.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                          {expandedSections.investmentsInGrowth ? (
                            <ChevronUp className="w-4 h-4 text-gray-500" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-500" />
                          )}
                        </div>
                      </button>
                      <AnimatePresence>
                        {expandedSections.investmentsInGrowth && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-3 space-y-2 border-t border-dashed border-gray-200">
                              <div className="flex items-center justify-between py-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm text-gray-700">Online ordering ads</span>
                                  <Info className="w-3.5 h-3.5 text-gray-400" />
                                </div>
                                <span className="text-sm font-medium text-gray-900">
                                  ₹{(settlementData.investmentsInGrowth?.onlineOrderingAds || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Est. payout */}
                    <div className="px-4 py-3 border-t-2 border-[#FF6A00] bg-[#FF6A00]/5 dark:bg-[#FF6A00]/10">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-gray-900 dark:text-white">Est. payout (A + B - C - D - E)</span>
                        <span className="text-sm font-bold text-[#FF6A00]">
                          ₹{estimatedPayout.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "orders" && (
              <div className=" rounded-lg p-4">
                <p className="text-sm text-gray-800 text-center py-8">
                  Orders data will be displayed here
                </p>
              </div>
            )}

            {activeTab === "expenses" && (
              <div className=" rounded-lg p-4">
                <p className="text-sm text-gray-800 text-center py-8">
                  Expenses data will be displayed here
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

      {/* Download Popup */}
      <Modal
        open={showDownloadPopup}
        onClose={() => setShowDownloadPopup(false)}
        title="Download Report"
        icon={Download}
        size="sm"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Your settlement report is being downloaded as PDF...
        </p>
        <button
          onClick={() => setShowDownloadPopup(false)}
          className="w-full py-3 bg-[#FF6A00] hover:bg-[#e05e00] text-white rounded-xl font-semibold transition-colors"
        >
          Close
        </button>
      </Modal>

      {/* Email Popup */}
      <Modal
        open={showEmailPopup}
        onClose={() => setShowEmailPopup(false)}
        title="Email Report"
        icon={Mail}
        size="sm"
      >
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Your settlement report has been sent to your registered email address.
        </p>
        <button
          onClick={() => setShowEmailPopup(false)}
          className="w-full py-3 bg-[#FF6A00] hover:bg-[#e05e00] text-white rounded-xl font-semibold transition-colors"
        >
          Close
        </button>
      </Modal>
    </RestaurantPageShell>
  )
}
