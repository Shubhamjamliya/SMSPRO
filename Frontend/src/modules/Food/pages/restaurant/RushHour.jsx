import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { Zap, Clock, Users, PackageCheck } from "lucide-react"

const debugLog = (...args) => {}

const TIME_OPTIONS = [
  { value: "30",  label: "30 minutes",        desc: "Quick rush" },
  { value: "60",  label: "1 hour",            desc: "Standard rush" },
  { value: "90",  label: "1 hour 30 minutes", desc: "Extended rush" },
  { value: "120", label: "2 hours",           desc: "Long rush" },
]

const BENEFITS = [
  { icon: Clock,        text: "Get more time to prepare food" },
  { icon: Users,        text: "Show correct delivery time to customers" },
  { icon: PackageCheck, text: "Avoid crowding of riders at your restaurant" },
]

export default function RushHour() {
  const goBack = useRestaurantBackNavigation()
  const [selectedTime, setSelectedTime] = useState("30")

  const handleConfirm = () => {
    debugLog("Rush hour confirmed for:", selectedTime, "minutes")
    goBack()
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] flex flex-col">
      {/* Page header */}
      <div className="bg-white dark:bg-[#111] border-b border-gray-100 dark:border-gray-800 px-4 py-4">
        <h1 className="text-base font-bold text-gray-900 dark:text-white">Rush in Kitchen</h1>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Temporarily increase preparation time</p>
      </div>

      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-5 space-y-5">
        {/* Info banner */}
        <div className="bg-[#FF6A00]/5 dark:bg-[#FF6A00]/10 border border-[#FF6A00]/20 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-10 h-10 bg-[#FF6A00] rounded-xl flex items-center justify-center flex-shrink-0">
            <Zap className="w-5 h-5 text-white" strokeWidth={2.5} fill="white" />
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed pt-0.5">
            Inform customers when your kitchen is busy and needs more time to manage orders.
          </p>
        </div>

        {/* Benefits */}
        <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-800/60">
            <p className="text-sm font-bold text-gray-900 dark:text-white">How this helps you</p>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
            {BENEFITS.map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-[#FF6A00]" strokeWidth={2} />
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300">{text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Time selection */}
        <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-800/60">
            <p className="text-sm font-bold text-gray-900 dark:text-white">Increase preparation time for next</p>
          </div>
          <div className="p-3 grid grid-cols-2 gap-2">
            {TIME_OPTIONS.map((opt) => {
              const active = selectedTime === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => setSelectedTime(opt.value)}
                  className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all duration-150 ${
                    active
                      ? "bg-[#FF6A00]/5 border-[#FF6A00] dark:border-[#FF6A00]/60"
                      : "bg-gray-50 dark:bg-gray-800/40 border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700"
                  }`}
                >
                  <span className={`text-sm font-bold ${active ? "text-[#FF6A00]" : "text-gray-900 dark:text-white"}`}>
                    {opt.label}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{opt.desc}</span>
                  {active && (
                    <span className="mt-2 text-[10px] font-semibold text-[#FF6A00] bg-[#FF6A00]/10 px-2 py-0.5 rounded-full">
                      Selected
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Confirm */}
      <div className="bg-white dark:bg-[#111] border-t border-gray-100 dark:border-gray-800 px-4 py-4">
        <button
          onClick={handleConfirm}
          className="w-full h-12 bg-[#FF6A00] hover:bg-[#e05e00] text-white font-semibold text-sm rounded-2xl active:scale-[0.98] transition-all"
        >
          Confirm Rush Hour · {TIME_OPTIONS.find(o => o.value === selectedTime)?.label}
        </button>
      </div>
    </div>
  )
}
