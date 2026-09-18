import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import Lenis from "lenis"
import { ArrowLeft, ChevronUp, ChevronDown, Clock, Edit2 } from "lucide-react"
import { Switch } from "@food/components/ui/switch"
import { MobileTimePicker } from "@mui/x-date-pickers/MobileTimePicker"
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider"
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { restaurantAPI } from "@food/api"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

// Helper function to convert "HH:mm" string to Date object
const stringToTime = (timeString) => {
  if (!timeString || !timeString.includes(":")) {
    return new Date(2000, 0, 1, 9, 0) // Default to 9:00 AM
  }
  const [hours, minutes] = timeString.split(":").map(Number)
  // Ensure valid hours (0-23) and minutes (0-59)
  const validHours = Math.max(0, Math.min(23, hours || 9))
  const validMinutes = Math.max(0, Math.min(59, minutes || 0))
  return new Date(2000, 0, 1, validHours, validMinutes)
}

// Helper function to convert Date object to "HH:mm" string
const timeToString = (date) => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return "09:00"
  }
  const hours = date.getHours().toString().padStart(2, "0")
  const minutes = date.getMinutes().toString().padStart(2, "0")
  return `${hours}:${minutes}`
}

// Format time from 24-hour to 12-hour format for display
const formatTime12Hour = (time24) => {
  if (!time24) return "09:00 AM"
  const [hours, minutes] = time24.split(":").map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const hours12 = hours % 12 || 12
  const minutesStr = minutes.toString().padStart(2, '0')
  return `${hours12}:${minutesStr} ${period}`
}

const getDefaultDays = () => ({
  Monday: { isOpen: true, openingTime: "09:00", closingTime: "22:00" },
  Tuesday: { isOpen: true, openingTime: "09:00", closingTime: "22:00" },
  Wednesday: { isOpen: true, openingTime: "09:00", closingTime: "22:00" },
  Thursday: { isOpen: true, openingTime: "09:00", closingTime: "22:00" },
  Friday: { isOpen: true, openingTime: "09:00", closingTime: "22:00" },
  Saturday: { isOpen: true, openingTime: "09:00", closingTime: "22:00" },
  Sunday: { isOpen: true, openingTime: "09:00", closingTime: "22:00" },
})

export default function OutletTimings() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const [expandedDay, setExpandedDay] = useState("Monday")
  const isInternalUpdate = useRef(false)
  const [days, setDays] = useState(getDefaultDays)
  const [loading, setLoading] = useState(true)
  const saveTimerRef = useRef(null)

  // Load from backend on mount.
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        const res = await restaurantAPI.getOutletTimings()
        const outletTimings = res?.data?.data?.outletTimings || res?.data?.outletTimings
        if (mounted && outletTimings && typeof outletTimings === "object") {
          setDays({ ...getDefaultDays(), ...outletTimings })
        }
      } catch (error) {
        debugError("Error loading outlet timings from backend:", error)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  // Save to backend whenever days change (debounced).
  useEffect(() => {
    if (loading) return
    if (!isInternalUpdate.current) return // Skip saving if the update wasn't initiated by the user

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        await restaurantAPI.saveOutletTimings(days)
        window.dispatchEvent(new Event("outletTimingsUpdated"))
        isInternalUpdate.current = false // Reset after successful save
      } catch (error) {
        debugError("Error saving outlet timings to backend:", error)
      }
    }, 500)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [days, loading])

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

  const toggleDay = (day) => {
    setExpandedDay(expandedDay === day ? null : day)
  }

  const toggleDayOpen = (day) => {
    isInternalUpdate.current = true
    setDays(prev => {
      const newOpen = !prev[day].isOpen
      return {
        ...prev,
        [day]: {
          ...prev[day],
          isOpen: newOpen,
          openingTime: newOpen ? (prev[day].openingTime || "09:00") : "",
          closingTime: newOpen ? (prev[day].closingTime || "22:00") : ""
        }
      }
    })
  }

  const handleTimeChange = (day, timeType, newTime) => {
    if (!newTime) {
      debugWarn('?? No time value received in handleTimeChange')
      return
    }
    
    isInternalUpdate.current = true
    const timeString = timeToString(newTime)
    
    // Validate time string format
    if (!timeString || !timeString.includes(":")) {
      debugWarn('?? Invalid time string generated:', timeString)
      return
    }
    
    debugLog(`?? Time changed for ${day} - ${timeType}: ${timeString}`)
    
    setDays(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [timeType]: timeString
      }
    }))
  }

  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-sm text-gray-400">Loading outlet timings…</div>
      </div>
    )
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a]">
        {/* Header */}
        <div className="bg-white dark:bg-[#111] border-b border-gray-100 dark:border-gray-800 px-4 py-4 sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/food/restaurant/explore")}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            </button>
            <div>
              <h1 className="text-base font-bold text-gray-900 dark:text-white">Outlet Timings</h1>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Set when your restaurant is open</p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-lg mx-auto px-4 py-5">
          {/* Section header */}
          <div className="mb-4 flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
            <span className="text-xs font-bold text-[#FF6A00] uppercase tracking-widest">{companyName} delivery</span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
          </div>

          {/* Day-wise Accordion */}
          <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            {dayNames.map((day, index) => {
              const dayData = days[day] || { isOpen: true, openingTime: "09:00", closingTime: "22:00" }
              const isExpanded = expandedDay === day
              const isLast = index === dayNames.length - 1

              return (
                <motion.div
                  key={day}
                  className={!isLast ? "border-b border-gray-50 dark:border-gray-800/60" : ""}
                >
                  {/* Day Header */}
                  <div className={`w-full flex items-center justify-between px-4 py-3.5 transition-colors ${isExpanded ? "bg-gray-50 dark:bg-gray-800/30" : ""}`}>
                    <button
                      onClick={() => toggleDay(day)}
                      className="flex items-center gap-3 flex-1 text-left"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-[#FF6A00]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                      <span className={`text-sm font-semibold ${isExpanded ? "text-[#FF6A00]" : "text-gray-900 dark:text-white"}`}>{day}</span>
                    </button>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-semibold ${dayData.isOpen ? "text-green-600 dark:text-green-400" : "text-gray-400"}`}>
                        {dayData.isOpen ? "Open" : "Closed"}
                      </span>
                      <div onClick={(e) => e.stopPropagation()}>
                        <Switch
                          checked={dayData.isOpen}
                          onCheckedChange={() => toggleDayOpen(day)}
                          className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-gray-300"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="p-4 space-y-4 border-t border-gray-100">
                          {dayData.isOpen ? (
                            <>
                              {/* Opening Time */}
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                  <Clock className="w-4 h-4" />
                                  Opening time
                                </label>
                                <div className="border border-gray-200 rounded-md px-3 py-2 bg-gray-50/60">
                                  <MobileTimePicker
                                    value={stringToTime(dayData.openingTime)}
                                    onChange={(newValue) => {
                                      debugLog('?? Opening time picker onChange:', newValue)
                                      if (newValue) {
                                        handleTimeChange(day, "openingTime", newValue)
                                      }
                                    }}
                                    onAccept={(newValue) => {
                                      debugLog('? Opening time picker onAccept:', newValue)
                                      if (newValue) {
                                        handleTimeChange(day, "openingTime", newValue)
                                      }
                                    }}
                                    slotProps={{
                                      textField: {
                                        variant: "outlined",
                                        size: "small",
                                        placeholder: "Select opening time",
                                        sx: {
                                          "& .MuiOutlinedInput-root": {
                                            height: "36px",
                                            fontSize: "12px",
                                            backgroundColor: "white",
                                            "& fieldset": {
                                              borderColor: "#e5e7eb",
                                            },
                                            "&:hover fieldset": {
                                              borderColor: "#d1d5db",
                                            },
                                            "&.Mui-focused fieldset": {
                                              borderColor: "#000",
                                            },
                                          },
                                          "& .MuiInputBase-input": {
                                            padding: "8px 12px",
                                            fontSize: "12px",
                                          },
                                        },
                                      },
                                    }}
                                    format="hh:mm a"
                                  />
                                </div>
                                <p className="text-xs text-gray-500">
                                  Current: {formatTime12Hour(dayData.openingTime)}
                                </p>
                              </div>

                              {/* Closing Time */}
                              <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                  <Clock className="w-4 h-4" />
                                  Closing time
                                </label>
                                <div className="border border-gray-200 rounded-md px-3 py-2 bg-gray-50/60">
                                  <MobileTimePicker
                                    value={stringToTime(dayData.closingTime)}
                                    onChange={(newValue) => {
                                      debugLog('?? Closing time picker onChange:', newValue)
                                      if (newValue) {
                                        handleTimeChange(day, "closingTime", newValue)
                                      }
                                    }}
                                    onAccept={(newValue) => {
                                      debugLog('? Closing time picker onAccept:', newValue)
                                      if (newValue) {
                                        handleTimeChange(day, "closingTime", newValue)
                                      }
                                    }}
                                    slotProps={{
                                      textField: {
                                        variant: "outlined",
                                        size: "small",
                                        placeholder: "Select closing time",
                                        sx: {
                                          "& .MuiOutlinedInput-root": {
                                            height: "36px",
                                            fontSize: "12px",
                                            backgroundColor: "white",
                                            "& fieldset": {
                                              borderColor: "#e5e7eb",
                                            },
                                            "&:hover fieldset": {
                                              borderColor: "#d1d5db",
                                            },
                                            "&.Mui-focused fieldset": {
                                              borderColor: "#000",
                                            },
                                          },
                                          "& .MuiInputBase-input": {
                                            padding: "8px 12px",
                                            fontSize: "12px",
                                          },
                                        },
                                      },
                                    }}
                                    format="hh:mm a"
                                  />
                                </div>
                                <p className="text-xs text-gray-500">
                                  Current: {formatTime12Hour(dayData.closingTime)}
                                </p>
                              </div>
                            </>
                          ) : (
                            <p className="text-sm text-gray-500 pl-6">This day is closed</p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </div>
        </div>
      </div>
    </LocalizationProvider>
  )
}

