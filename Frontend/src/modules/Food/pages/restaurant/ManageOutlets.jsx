import { useState } from "react"
import { useNavigate } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import {
  Clock, Phone, ShieldCheck, Landmark, Image, MapPin,
  Star, Navigation, ChevronRight, Info,
} from "lucide-react"
import { Modal } from "@food/components/restaurant/Modal"
import RestaurantPageShell, { RESTAURANT_CARD_CLASS } from "@food/components/restaurant/RestaurantPageShell"

const debugLog = (...args) => {}

const OPTIONS = [
  { label: "Outlet Operations",      icon: Clock,       path: "/food/restaurant/outlet-operations",     desc: "Timings, rush hour & delivery" },
  { label: "Contacts",              icon: Phone,       path: null,                                     desc: "Manage outlet contact info" },
  { label: "FSSAI Food License",    icon: ShieldCheck, path: "/food/restaurant/fssai",                desc: "View and update FSSAI details" },
  { label: "Bank Account Details",  icon: Landmark,    path: "/food/restaurant/update-bank-details",  desc: "Manage payout bank account" },
  { label: "Profile Picture",       icon: Image,       path: "/food/restaurant/outlet-info",          desc: "Update restaurant photo" },
  { label: "Name, Address & Location", icon: MapPin,   path: "/food/restaurant/outlet-info",          desc: "Edit outlet details" },
  { label: "Ratings & Reviews",     icon: Star,        path: "/food/restaurant/ratings-reviews",      desc: "View customer feedback" },
  { label: "Delivery Area",         icon: Navigation,  path: null,                                    desc: "Zone managed automatically", info: true },
]

export default function ManageOutlets() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [showInfo, setShowInfo] = useState(false)

  const handleClick = (opt) => {
    if (opt.info) { setShowInfo(true); return }
    if (opt.path) navigate(opt.path)
    else debugLog(`${opt.label} clicked`)
  }

  return (
    <RestaurantPageShell
      title="Manage Outlet"
      subtitle="Edit your restaurant details"
      onBack={goBack}
      maxWidth="lg"
    >
        <div className={`${RESTAURANT_CARD_CLASS} overflow-hidden`}>
          {OPTIONS.map((opt, i) => {
            const Icon = opt.icon
            const isLast = i === OPTIONS.length - 1
            return (
              <button
                key={opt.label}
                onClick={() => handleClick(opt)}
                className={`w-full flex items-center gap-4 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/40 active:bg-gray-100 transition-colors text-left ${!isLast ? "border-b border-gray-50 dark:border-gray-800/60" : ""}`}
              >
                <div className="w-9 h-9 rounded-xl bg-[#FF6A00]/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4.5 h-4.5 text-[#FF6A00]" style={{ width: 18, height: 18 }} strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{opt.label}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{opt.desc}</p>
                </div>
                {opt.info
                  ? <Info className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                }
              </button>
            )
          })}
        </div>

      <Modal
        open={showInfo}
        onClose={() => setShowInfo(false)}
        title="Delivery area is managed automatically"
        icon={Info}
        size="md"
      >
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
          Your delivery area is determined by the distance our delivery partners can travel efficiently. It may vary based on time of day or conditions like weather.
        </p>
      </Modal>
    </RestaurantPageShell>
  )
}
