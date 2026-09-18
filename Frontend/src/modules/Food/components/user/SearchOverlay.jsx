import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { X, Search, Clock, Loader2, Mic } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { useLocation as useGeoLocation } from "@food/hooks/useLocation"
import { useZone } from "@food/hooks/useZone"
import {
  useHybridFoodSearch,
  fetchFoodSearchTrending,
} from "@food/hooks/useFoodSearch"
import { sanitizeSearchQuery } from "@food/utils/foodSearchUtils"

const SEARCH_HISTORY_KEY = "food_recent_searches_v1"

export default function SearchOverlay({ isOpen, onClose, searchValue, onSearchChange }) {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const { location: userCoords } = useGeoLocation()
  const { zoneId } = useZone(userCoords)

  const [recentSuggestions, setRecentSuggestions] = useState([])
  const [trending, setTrending] = useState([])
  const [loadingTrending, setLoadingTrending] = useState(false)
  const [isListening, setIsListening] = useState(false)

  const {
    suggestions,
    loading: loadingSuggestions,
  } = useHybridFoodSearch({
    zoneId,
    lat: userCoords?.latitude,
    lng: userCoords?.longitude,
    query: searchValue,
    limit: 18,
  })

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    try {
      const raw = localStorage.getItem(SEARCH_HISTORY_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      setRecentSuggestions(
        Array.isArray(parsed)
          ? parsed.filter((item) => typeof item === "string" && item.trim()).slice(0, 8)
          : [],
      )
    } catch {
      setRecentSuggestions([])
    }
  }, [isOpen])

  // Browse list for empty query — fetched once per open (cached), never per keystroke.
  useEffect(() => {
    if (!isOpen) return

    const controller = new AbortController()
    let cancelled = false
    setLoadingTrending(true)

    fetchFoodSearchTrending({ zoneId, signal: controller.signal })
      .then((list) => {
        if (!cancelled) setTrending(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        if (!cancelled) setTrending([])
      })
      .finally(() => {
        if (!cancelled) setLoadingTrending(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [isOpen, zoneId])

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && isOpen) onClose()
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscape)
      document.body.style.overflow = "hidden"
    }

    return () => {
      document.removeEventListener("keydown", handleEscape)
      document.body.style.overflow = "unset"
    }
  }, [isOpen, onClose])

  const isSearching = sanitizeSearchQuery(searchValue).length > 0
  const displayedItems = useMemo(
    () => (isSearching ? suggestions : trending),
    [isSearching, suggestions, trending],
  )
  // Loading spinner only for real network work (API debounce / trending fetch).
  const isLoadingDisplayed = isSearching
    ? loadingSuggestions && displayedItems.length === 0
    : loadingTrending

  const saveRecentSearch = (term) => {
    const value = sanitizeSearchQuery(term)
    if (!value) return

    setRecentSuggestions((prev) => {
      const next = [value, ...prev.filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, 8)
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next))
      return next
    })
  }

  const goToResults = (term, { clearInput = false } = {}) => {
    const value = sanitizeSearchQuery(term)
    if (!value) return
    saveRecentSearch(value)
    navigate(`/food/user/search?q=${encodeURIComponent(value)}`)
    onClose()
    if (clearInput) onSearchChange("")
  }

  const handleSuggestionClick = (suggestion) => {
    onSearchChange(suggestion)
    inputRef.current?.focus()
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    goToResults(searchValue)
  }

  const handleFoodClick = (food) => {
    goToResults(food?.name || searchValue)
  }

  const handleVoiceSearch = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert("Voice search is not supported in this browser.")
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = "en-IN"
    recognition.onstart = () => setIsListening(true)
    recognition.onend = () => setIsListening(false)
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript
      if (transcript) {
        onSearchChange(transcript)
        saveRecentSearch(transcript)
      }
    }
    recognition.start()
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-white dark:bg-[#0a0a0a]"
      style={{ animation: "fadeIn 0.3s ease-out" }}
    >
      <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground dark:text-gray-400 z-10" />
              <Input
                ref={inputRef}
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search restaurants, dishes, cuisines..."
                className="pl-12 pr-12 h-12 w-full bg-white dark:bg-[#1a1a1a] border-gray-100 dark:border-gray-800 focus:border-[#FF6A00] dark:focus:border-[#FF6A00] rounded-full text-lg dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
              />
              <button
                type="button"
                onClick={handleVoiceSearch}
                className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all ${isListening ? "text-[#FF6A00] scale-110 animate-pulse" : "text-gray-400 hover:text-gray-600"}`}
              >
                <Mic className="h-5 w-5" />
              </button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="h-5 w-5 text-gray-700 dark:text-gray-300" />
            </Button>
          </form>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 scrollbar-hide bg-white dark:bg-[#0a0a0a]">
        {!isSearching && (
          <div className="mb-6" style={{ animation: "slideDown 0.3s ease-out 0.1s both" }}>
            <h3 className="text-sm sm:text-base font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#FF6A00]" />
              Recent Searches
            </h3>
            <div className="flex gap-2 sm:gap-3 flex-wrap">
              {recentSuggestions.slice(0, 8).map((suggestion, index) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800 hover:border-red-300 dark:hover:border-red-700 text-gray-700 dark:text-gray-300 hover:text-[#FF6A00] dark:hover:text-red-400 transition-all duration-200 text-xs sm:text-sm font-medium shadow-sm hover:shadow-md"
                  style={{ animation: `scaleIn 0.3s ease-out ${0.1 + index * 0.02}s both` }}
                >
                  <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-[#FF6A00] flex-shrink-0" />
                  <span>{suggestion}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ animation: "fadeIn 0.3s ease-out 0.2s both" }}>
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6">
            {isSearching
              ? `Search Results (${displayedItems.length})${loadingSuggestions ? "…" : ""}`
              : "Popular near you"}
          </h3>
          {displayedItems.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4 md:gap-5 lg:gap-6">
              {displayedItems.map((food, index) => (
                <div
                  key={`${food.type}-${food.id}`}
                  className="flex flex-col items-center gap-2 sm:gap-3 cursor-pointer group"
                  style={{ animation: `slideUp 0.3s ease-out ${0.25 + 0.05 * (index % 12)}s both` }}
                  onClick={() => handleFoodClick(food)}
                >
                  <div className="relative w-full aspect-square rounded-full overflow-hidden transition-all duration-200 shadow-md group-hover:shadow-lg bg-white dark:bg-[#1a1a1a] p-1 sm:p-1.5">
                    {food.image ? (
                      <img
                        src={food.image}
                        alt={food.name}
                        className="w-full h-full object-cover rounded-full"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                        <Search className="h-5 w-5 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <div className="px-1 sm:px-2 text-center">
                    <span className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200 group-hover:text-[#FF6A00] dark:group-hover:text-red-400 transition-colors line-clamp-2">
                      {food.name}
                    </span>
                    {food.subtitle && (
                      <span className="block text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 line-clamp-1">
                        {food.subtitle}
                      </span>
                    )}
                    {food.type === "dish" && (
                      <span className="block text-[9px] font-bold uppercase tracking-wide text-[#FF6A00] mt-0.5">
                        Dish
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 sm:py-16">
              {isLoadingDisplayed ? (
                <>
                  <Loader2 className="h-12 w-12 sm:h-16 sm:w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4 animate-spin" />
                  <p className="text-gray-600 dark:text-gray-400 text-base sm:text-lg font-semibold">Loading...</p>
                </>
              ) : (
                <>
                  <Search className="h-12 w-12 sm:h-16 sm:w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400 text-base sm:text-lg font-semibold">
                    {isSearching
                      ? `No restaurants found for "${sanitizeSearchQuery(searchValue)}"`
                      : "No restaurants found"}
                  </p>
                  <p className="text-sm sm:text-base text-gray-500 dark:text-gray-500 mt-2">
                    {isSearching
                      ? "Try a restaurant name, dish, cuisine, or category"
                      : "Check back soon for popular picks near you"}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <style>{`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideDown {
            from { opacity: 0; transform: translateY(-20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes scaleIn {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
          }
        `}</style>
    </div>
  )
}
