import { useState, useCallback, useEffect, useMemo, useRef, Suspense } from "react"
import { Link, useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  MapPin, Search, Mic, SlidersHorizontal, Star, ArrowDownUp,
  Timer, IndianRupee, Clock, Bookmark, UtensilsCrossed, ChevronDown, X
} from "lucide-react"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { useSearchOverlay, useLocationSelector } from "@food/components/user/UserLayout"
import { useLocation as useLocationHook } from "@food/hooks/useLocation"
import { useZone } from "@food/hooks/useZone"
import { useProfile } from "@food/context/ProfileContext"
import { diningAPI } from "@food/api"
import { API_BASE_URL } from "@food/api/config"
import PageNavbar from "@food/components/user/PageNavbar"
import OptimizedImage from "@food/components/OptimizedImage"
import BannerSection from "@food/components/user/home/BannerSection"
import { HeroBannerSkeleton } from "@food/components/ui/loading-skeletons"
import * as imgUtils from "@food/utils/imageUtils"
import {
  filterRestaurantsBySearch,
  sanitizeSearchQuery,
} from "@food/utils/foodSearchUtils"
import { useFoodUnifiedSearch } from "@food/hooks/useFoodSearch"

const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "")

const isMeaningfulLocationValue = (value) => {
  const normalized = String(value || "").trim().toLowerCase()
  return Boolean(
    normalized &&
    normalized !== "select location" &&
    normalized !== "current location"
  )
}

/** Same address title/subtitle rules as HomeHeader on `/food/user`. */
const buildLocationDisplay = (savedAddressText, location) => {
  if (isMeaningfulLocationValue(savedAddressText)) {
    const parts = String(savedAddressText)
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)

    if (parts.length >= 3) {
      return {
        title: parts.slice(0, 2).join(", "),
        subtitle: parts.slice(2).join(", "),
      }
    }

    if (parts.length === 2) {
      return {
        title: parts.join(", "),
        subtitle: "Tap to choose delivery location",
      }
    }

    return {
      title: String(savedAddressText).trim(),
      subtitle: "Tap to choose delivery location",
    }
  }

  const fallbackTitle =
    location?.area || location?.city || "Select Location"
  const fallbackSubtitle =
    location?.address || location?.city || "Tap to choose delivery location"

  return {
    title: fallbackTitle,
    subtitle: fallbackSubtitle,
  }
}

const slugifyValue = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

const getCoordinates = (restaurant) => {
  const latitude = restaurant?.location?.latitude
  const longitude = restaurant?.location?.longitude
  if (typeof latitude === "number" && typeof longitude === "number") {
    return { latitude, longitude }
  }
  const coords = restaurant?.location?.coordinates
  if (Array.isArray(coords) && coords.length === 2) {
    return { latitude: coords[1], longitude: coords[0] }
  }
  return null
}

const getDistanceKm = (userLocation, restaurant) => {
  const userLat = Number(userLocation?.latitude)
  const userLng = Number(userLocation?.longitude)
  const restaurantCoords = getCoordinates(restaurant)
  if (!Number.isFinite(userLat) || !Number.isFinite(userLng) || !restaurantCoords) {
    return Number.POSITIVE_INFINITY
  }
  const toRadians = (value) => (value * Math.PI) / 180
  const earthRadiusKm = 6371
  const dLat = toRadians(restaurantCoords.latitude - userLat)
  const dLng = toRadians(restaurantCoords.longitude - userLng)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(userLat)) *
      Math.cos(toRadians(restaurantCoords.latitude)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/* ─── Skeletons ─── */
function CategorySkeleton() {
  return (
    <div className="shimmer-bg rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/40 p-4 h-[120px] flex flex-col justify-between relative overflow-hidden">
      <div>
        <div className="h-4 w-[60%] rounded-lg bg-gray-250 dark:bg-gray-700/80 mb-2" />
        <div className="h-3 w-[40%] rounded-lg bg-gray-150 dark:bg-gray-850" />
      </div>
      <div className="h-10 w-10 rounded-xl bg-gray-250 dark:bg-gray-700/80 self-end" />
    </div>
  )
}

function RestaurantSkeleton() {
  return (
    <div className="shimmer-bg rounded-3xl overflow-hidden border border-gray-100/80 dark:border-gray-800/40 bg-white dark:bg-gray-900/80 p-0 relative flex flex-col h-full">
      <div className="relative aspect-[16/10] bg-gray-100 dark:bg-gray-850/60 w-full" />
      <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
        <div>
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <div className="h-4.5 w-[70%] rounded-lg bg-gray-250 dark:bg-gray-700/80" />
            <div className="h-6 w-12 rounded-lg bg-gray-250 dark:bg-gray-700/80" />
          </div>
          <div className="h-3.5 w-[50%] rounded-lg bg-gray-150 dark:bg-gray-800/60" />
        </div>
        <div className="flex justify-between items-center pt-3 border-t border-gray-100/65 dark:border-gray-800/45">
          <div className="h-3 w-16 rounded-md bg-gray-150 dark:bg-gray-800/60" />
          <div className="h-3 w-16 rounded-md bg-gray-150 dark:bg-gray-800/60" />
        </div>
      </div>
    </div>
  )
}

/* ─── Category Card ─── */
function CategoryCard({ category, index }) {
  return (
    <Link to={`/food/user/dining/${category.slug}`}>
      <motion.div
        className="relative rounded-2xl border border-gray-100/85 dark:border-gray-800/45 bg-white dark:bg-gray-900/50 backdrop-blur-md p-4 h-[120px] overflow-hidden cursor-pointer group flex flex-col justify-between"
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4, delay: index * 0.03 }}
        whileHover={{ 
          y: -4, 
          boxShadow: "0 12px 30px -10px rgba(255,106,0,0.18)",
          borderColor: "rgba(255, 106, 0, 0.45)"
        }}
      >
        <div>
          <p className="text-[14px] font-bold text-gray-900 dark:text-white leading-tight group-hover:text-[#FF6A00] transition-colors duration-200 max-w-[70%]">
            {category.name}
          </p>
          <span className="inline-flex items-center text-[10px] font-bold text-gray-400 dark:text-gray-500 mt-1.5 bg-gray-50 dark:bg-gray-800/60 px-2 py-0.5 rounded-md group-hover:bg-[#FF6A00]/10 group-hover:text-[#FF6A00] transition-colors duration-250">
            Explore
          </span>
        </div>

        <div className="absolute bottom-3 right-3 w-15 h-15 rounded-2xl overflow-hidden shadow-sm border border-gray-100/50 dark:border-gray-850/40">
          {category.imageUrl ? (
            <OptimizedImage
              src={category.imageUrl}
              alt={category.name}
              className="w-full h-full transition-transform duration-500 group-hover:scale-115 object-cover"
              objectFit="cover"
              sizes="60px"
              priority={index < 8}
            />
          ) : (
            <div className="w-full h-full bg-orange-50 dark:bg-orange-950/20 flex items-center justify-center">
              <UtensilsCrossed className="h-6 w-6 text-[#FF6A00]/80" strokeWidth={1.5} />
            </div>
          )}
        </div>

        {/* glassmorphic border highlights on hover */}
        <div className="absolute inset-0 border border-transparent group-hover:border-[#FF6A00]/20 rounded-2xl transition-all duration-300 pointer-events-none" />
      </motion.div>
    </Link>
  )
}

/* ─── Restaurant Card ─── */
function RestaurantCard({ restaurant, index, isFavorite, onToggleFavorite }) {
  const restaurantSlug = restaurant.slug || restaurant.name.toLowerCase().replace(/\s+/g, "-")
  const diningDetailPath = `/food/user/dining/${restaurant.diningType || "dining"}/${restaurantSlug}`
  const favorite = isFavorite(restaurantSlug)

  const handleToggleFavorite = (e) => {
    e.preventDefault()
    e.stopPropagation()
    onToggleFavorite(restaurantSlug, restaurant, favorite)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay: index * 0.04, type: "spring", stiffness: 100, damping: 15 }}
      className="group"
    >
      <Link to={diningDetailPath} state={{ restaurant }} className="block">
        <div className="relative rounded-3xl overflow-hidden border border-gray-100/90 dark:border-gray-800/50 bg-white dark:bg-gray-900/80 backdrop-blur-md transition-all duration-300 group-hover:shadow-[0_20px_50px_-20px_rgba(0,0,0,0.15)] group-hover:border-[#FF6A00]/30 group-hover:-translate-y-1.5 flex flex-col h-full">
          
          {/* Image Container with Aspect Ratio */}
          <div className="relative aspect-[16/10] w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
            {restaurant.image ? (
              <OptimizedImage
                src={restaurant.image}
                alt={restaurant.name}
                className="w-full h-full transition-transform duration-700 ease-out group-hover:scale-108"
                objectFit="cover"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                placeholder="blur"
                priority={index < 4}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-orange-100 to-amber-100 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center">
                <UtensilsCrossed className="h-10 w-10 text-orange-400 dark:text-gray-500 opacity-60" />
              </div>
            )}

            {/* Dark gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

            {/* Featured dish badge (styled beautifully) */}
            {restaurant.featuredDish && (
              <div className="absolute top-4 left-4 bg-black/45 backdrop-blur-md border border-white/10 text-white px-3 py-1 rounded-xl text-[11px] font-bold tracking-wide flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="truncate max-w-[120px]">{restaurant.featuredDish}</span>
                {restaurant.featuredPrice > 0 && (
                  <span className="font-extrabold text-amber-300 ml-0.5">· ₹{restaurant.featuredPrice}</span>
                )}
              </div>
            )}

            {/* Floating Heart/Bookmark with spring scale */}
            <button
              type="button"
              onClick={handleToggleFavorite}
              className="absolute top-4 right-4 w-9 h-9 bg-white/95 dark:bg-gray-900/90 backdrop-blur-md rounded-xl flex items-center justify-center shadow-lg transition-all duration-300 hover:scale-115 hover:bg-orange-500 dark:hover:bg-orange-500 group/btn"
              aria-label={favorite ? "Remove from saved" : "Save restaurant"}
            >
              <Bookmark
                className={`h-4.5 w-4.5 transition-colors duration-300 ${
                  favorite 
                    ? "fill-orange-500 text-orange-500 group-hover/btn:fill-white group-hover/btn:text-white" 
                    : "text-gray-600 dark:text-gray-300 group-hover/btn:text-white"
                }`}
                strokeWidth={favorite ? 0 : 2}
              />
            </button>

            {/* Offer strip - custom styling */}
            {restaurant.offer && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-r from-[#FF6A00] to-amber-500 px-4 py-2.5 flex items-center justify-between shadow-inner">
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-white/80 leading-none mb-0.5">Pre-book table</span>
                  <span className="text-white text-[13px] font-extrabold leading-tight tracking-wide truncate max-w-[200px]">
                    {restaurant.offer}
                  </span>
                </div>
                <div className="bg-white/20 backdrop-blur-sm border border-white/20 rounded-lg px-2 py-0.5 text-[10px] font-extrabold text-white">
                  BOOK NOW
                </div>
              </div>
            )}
          </div>

          {/* Info Details Section */}
          <div className="p-4 flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="text-[15px] font-bold text-gray-900 dark:text-white line-clamp-1 flex-1 tracking-tight group-hover:text-[#FF6A00] transition-colors duration-200">
                  {restaurant.name}
                </h3>
                <div className="flex-shrink-0 flex items-center gap-1 bg-[#128C7E] dark:bg-[#128C7E] text-white px-2 py-0.5 rounded-lg shadow-sm border border-[#128C7E]/20">
                  <span className="text-[12px] font-bold leading-none">{restaurant.rating ? restaurant.rating.toFixed(1) : "—"}</span>
                  <Star className="h-3 w-3 fill-white text-white" />
                </div>
              </div>

              {restaurant.cuisine && (
                <p className="text-[12px] text-gray-400 dark:text-gray-500 line-clamp-1 mb-3 font-medium">
                  {restaurant.cuisine}
                </p>
              )}
            </div>

            {/* Bottom time and location indicators */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-100/80 dark:border-gray-800/40 text-[11px] text-gray-400 dark:text-gray-500 font-semibold uppercase tracking-wider">
              <div className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-[#FF6A00]" strokeWidth={2} />
                <span>{restaurant.deliveryTime}</span>
              </div>
              <div className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-[#FF6A00]" strokeWidth={2} />
                <span>{restaurant.distance}</span>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

/* ─── Filter Chip ─── */
function FilterChip({ label, icon: Icon, isActive, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-[12px] font-bold whitespace-nowrap flex-shrink-0 transition-all duration-200 ${
        isActive
          ? "bg-[#FF6A00] border-[#FF6A00] text-white shadow-md shadow-orange-500/10"
          : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:border-[#FF6A00] hover:text-[#FF6A00]"
      }`}
    >
      {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} />}
      {label}
    </button>
  )
}

/* ─── Desktop Filter Dropdown ─── */
function FilterDropdown({ label, icon: Icon, isOpen, toggleOpen, children, activeCount }) {
  const dropdownRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        toggleOpen()
      }
    }
    document.addEventListener("mousedown", handleOutsideClick)
    return () => document.removeEventListener("mousedown", handleOutsideClick)
  }, [isOpen, toggleOpen])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={toggleOpen}
        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border text-[13px] font-bold transition-all duration-200 ${
          isOpen || activeCount > 0
            ? "border-[#FF6A00] bg-orange-50/50 dark:bg-orange-950/20 text-[#FF6A00] shadow-sm shadow-orange-500/5"
            : "border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:border-[#FF6A00] hover:text-[#FF6A00]"
        }`}
      >
        {Icon && <Icon className="h-4 w-4" strokeWidth={2} />}
        {label}
        {activeCount > 0 && (
          <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#FF6A00] text-white text-[10px] font-bold">
            {activeCount}
          </span>
        )}
        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-2 min-w-[220px] bg-white dark:bg-[#111] border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xl z-50 p-3"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Main Component ─── */
export default function Dining() {
  const navigate = useNavigate()
  const [heroSearch, setHeroSearch] = useState("")
  const [activeFilters, setActiveFilters] = useState(new Set())
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [activeFilterTab, setActiveFilterTab] = useState("sort")
  const [sortBy, setSortBy] = useState(null)
  const [selectedCuisine, setSelectedCuisine] = useState(null)
  const [openDropdown, setOpenDropdown] = useState(null)
  const { openSearch, setSearchValue } = useSearchOverlay()
  const { openLocationSelector } = useLocationSelector()
  const { location, loading: locationLoading } = useLocationHook()
  const { zoneId } = useZone(location)
  const { addFavorite, removeFavorite, isFavorite } = useProfile()

  const {
    setQuery: setRemoteSearchQuery,
    data: remoteSearchHits,
  } = useFoodUnifiedSearch({
    delay: 400,
    minChars: 2,
    zoneId,
    lat: location?.latitude,
    lng: location?.longitude,
    limit: 24,
  })

  // Debounced menu/dish enrichment only — restaurant name/cuisine filter is client-side.
  useEffect(() => {
    setRemoteSearchQuery(heroSearch)
  }, [heroSearch, setRemoteSearchQuery])

  const dishMatchedRestaurantIds = useMemo(() => {
    const ids = new Set()
    for (const hit of remoteSearchHits || []) {
      if (hit?.restaurantId) ids.add(String(hit.restaurantId))
    }
    return ids
  }, [remoteSearchHits])

  const [categories, setCategories] = useState([])
  const [restaurantList, setRestaurantList] = useState([])
  const [loading, setLoading] = useState(true)
  const [diningHeroBanners, setDiningHeroBanners] = useState([])
  const [bannersLoading, setBannersLoading] = useState(true)
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0)
  const autoSlideIntervalRef = useRef(null)
  const heroShellRef = useRef(null)
  const isBannerSwipingRef = useRef(false)

  const savedAddressText = useMemo(
    () => imgUtils.formatSavedAddress(location),
    [location],
  )
  const { title: locationTitle, subtitle: locationSubtitle } = useMemo(
    () => buildLocationDisplay(savedAddressText, location),
    [savedAddressText, location],
  )
  const heroBannerImages = useMemo(
    () => diningHeroBanners.map((b) => b.imageUrl).filter(Boolean),
    [diningHeroBanners],
  )

  // City-independent dining data (hero banners + categories): fetch once on mount.
  // Kept separate from the city-filtered restaurant list below so it is not refetched
  // every time the resolved location changes.
  useEffect(() => {
    let cancelled = false
    const fetchStaticDiningData = async () => {
      try {
        setBannersLoading(true)
        const [bannerResponse, cats] = await Promise.all([
          diningAPI.getHeroBanners().catch(() => ({ data: { success: false, data: { banners: [] } } })),
          diningAPI.getCategories(),
        ])
        if (cancelled) return

        // Same response-shape handling + field mapping as Home (`useFoodHomeData`).
        const raw = bannerResponse
        const payload =
          raw?.data?.data ??
          raw?.data ??
          raw
        const list = Array.isArray(payload?.banners)
          ? payload.banners
          : Array.isArray(payload)
            ? payload
            : []

        const heroBanners = list
          .filter((b) => b && (b.isActive === undefined || b.isActive !== false))
          .map((b, index) => {
            const imageUrl = imgUtils.normalizeImageUrl(
              b?.imageUrl || b?.image || b?.url || "",
              BACKEND_ORIGIN,
            )
            if (!imageUrl) return null
            return {
              ...b,
              _id: b?._id || b?.id || `dining-banner-${index}`,
              imageUrl,
              title: b?.title || "",
              subtitle: b?.subtitle || "",
              description: b?.description || "",
              ctaText: b?.ctaText || b?.action || "",
              ctaLink: b?.ctaLink || "",
              action: b?.action || b?.ctaText || "",
              linkedRestaurants: Array.isArray(b?.linkedRestaurants)
                ? b.linkedRestaurants
                : [],
              sortOrder: Number(b?.sortOrder ?? b?.order ?? index),
            }
          })
          .filter(Boolean)
          .sort((a, b) => a.sortOrder - b.sortOrder)

        setDiningHeroBanners(heroBanners)
        setCategories(cats?.data?.success ? (cats.data.data || []) : [])
      } catch {
        if (!cancelled) {
          setDiningHeroBanners([])
          setCategories([])
        }
      } finally {
        if (!cancelled) setBannersLoading(false)
      }
    }
    fetchStaticDiningData()
    return () => {
      cancelled = true
    }
  }, [])

  // City-filtered restaurant list: wait until the location has finished resolving so we
  // fetch once with the final city, instead of once with no city and again once it loads.
  useEffect(() => {
    if (locationLoading) return
    let cancelled = false
    const fetchDiningRestaurants = async () => {
      try {
        setLoading(true)
        const rests = await diningAPI.getRestaurants(location?.city ? { city: location.city } : {})
        if (cancelled) return
        setRestaurantList(rests?.data?.success ? (rests.data.data || []) : [])
      } catch {
        if (!cancelled) setRestaurantList([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchDiningRestaurants()
    return () => {
      cancelled = true
    }
  }, [location?.city, locationLoading])

  const safeCategories = useMemo(() => {
    return (Array.isArray(categories) ? categories : [])
      .filter((c) => String(c?.name || "").trim().length > 0)
      .map((c) => ({
        ...c,
        name: String(c?.name || "").trim(),
        slug: slugifyValue(c?.slug || c?.name || ""),
        imageUrl: String(c?.imageUrl || "").trim(),
      }))
  }, [categories])

  const normalizedRestaurantList = useMemo(() => {
    return (Array.isArray(restaurantList) ? restaurantList : [])
      .filter((r) => {
        const hasName = String(r?.restaurantName || r?.name || "").trim().length > 0
        return hasName && r?.diningSettings?.isEnabled !== false && r?.isAcceptingOrders !== false
      })
      .map((r, index) => {
        const distanceKm = getDistanceKm(location, r)
        const restaurantName = String(r?.restaurantName || r?.name || "").trim()
        return {
          ...r,
          id: r?._id || r?.id || `restaurant-${index}`,
          name: restaurantName,
          slug: String(r?.restaurantNameNormalized || "").trim() || slugifyValue(restaurantName),
          cuisine: Array.isArray(r?.cuisines) && r.cuisines.length > 0 ? r.cuisines.join(", ") : "Multi-cuisine",
          image: String(
            r?.coverImages?.[0]?.url || r?.coverImages?.[0] || r?.coverImage ||
            r?.menuImages?.[0]?.url || r?.menuImages?.[0] || r?.profileImage?.url || r?.profileImage || ""
          ).trim(),
          offer: String(r?.offer || "Pre-book table").trim(),
          featuredDish: String(r?.featuredDish || "Chef's special").trim(),
          featuredPrice: Number(r?.featuredPrice || 0),
          rating: Number(r?.rating || r?.avgRating || 0),
          deliveryTime: String(r?.estimatedDeliveryTime || r?.deliveryTime || (r?.estimatedDeliveryTimeMinutes ? `${r.estimatedDeliveryTimeMinutes} mins` : "30–40 mins")).trim(),
          distanceValue: distanceKm,
          distance: Number.isFinite(distanceKm) ? `${distanceKm.toFixed(1)} km` : "—",
          diningType: r?.diningSettings?.diningType || r?.categories?.[0]?.slug || "dining",
        }
      })
  }, [restaurantList, location])

  const categoryRestaurantKeys = useMemo(() => {
    const keySet = new Set()
    normalizedRestaurantList.forEach((r) => {
      const raw = []
      if (Array.isArray(r?.categories)) raw.push(...r.categories)
      if (r?.diningSettings?.diningType) raw.push(r.diningSettings.diningType)
      raw.forEach((c) => {
        if (typeof c === "string") { const n = slugifyValue(c); if (n) keySet.add(n); return }
        if (c && typeof c === "object") { const s = slugifyValue(c?.slug || c?.name || c?.title || ""); if (s) keySet.add(s) }
      })
    })
    return keySet
  }, [normalizedRestaurantList])

  const filteredCategories = useMemo(() =>
    safeCategories.filter((c) => categoryRestaurantKeys.has(c.slug)),
    [safeCategories, categoryRestaurantKeys]
  )

  const nearbyPopularRestaurants = useMemo(() => {
    const within10 = normalizedRestaurantList
      .filter((r) => Number.isFinite(r.distanceValue) && r.distanceValue <= 10)
      .sort((a, b) => a.distanceValue - b.distanceValue)
    return within10.length > 0 ? within10 : normalizedRestaurantList
  }, [normalizedRestaurantList])

  const toggleFilter = (id) => {
    setActiveFilters((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filteredRestaurants = useMemo(() => {
    let filtered = [...nearbyPopularRestaurants]
    const searchTerm = sanitizeSearchQuery(heroSearch)

    if (searchTerm) {
      // Instant client-side match on name / cuisine / category / featured dish / tags.
      const clientMatched = filterRestaurantsBySearch(filtered, searchTerm)
      const clientIds = new Set(
        clientMatched.map((r) => String(r.id || r._id || "")),
      )

      // Merge restaurants that matched via menu-item search (debounced API).
      const dishMatched = filtered.filter((r) => {
        const id = String(r.id || r._id || "")
        return id && dishMatchedRestaurantIds.has(id) && !clientIds.has(id)
      })

      filtered = [...clientMatched, ...dishMatched]
    }

    if (activeFilters.has("delivery-under-30")) filtered = filtered.filter((r) => { const m = r.deliveryTime.match(/(\d+)/); return m && parseInt(m[1]) <= 30 })
    if (activeFilters.has("delivery-under-45")) filtered = filtered.filter((r) => { const m = r.deliveryTime.match(/(\d+)/); return m && parseInt(m[1]) <= 45 })
    if (activeFilters.has("distance-under-1km")) filtered = filtered.filter((r) => { const m = r.distance.match(/(\d+\.?\d*)/); return m && parseFloat(m[1]) <= 1.0 })
    if (activeFilters.has("distance-under-2km")) filtered = filtered.filter((r) => { const m = r.distance.match(/(\d+\.?\d*)/); return m && parseFloat(m[1]) <= 2.0 })
    if (activeFilters.has("rating-35-plus")) filtered = filtered.filter((r) => r.rating >= 3.5)
    if (activeFilters.has("rating-4-plus")) filtered = filtered.filter((r) => r.rating >= 4.0)
    if (activeFilters.has("rating-45-plus")) filtered = filtered.filter((r) => r.rating >= 4.5)
    if (activeFilters.has("price-under-200")) filtered = filtered.filter((r) => r.featuredPrice > 0 && r.featuredPrice <= 200)
    if (activeFilters.has("price-under-500")) filtered = filtered.filter((r) => r.featuredPrice > 0 && r.featuredPrice <= 500)
    if (selectedCuisine) filtered = filtered.filter((r) => r.cuisine.toLowerCase().includes(selectedCuisine.toLowerCase()))
    if (sortBy === "rating-high") filtered.sort((a, b) => b.rating - a.rating)
    else if (sortBy === "rating-low") filtered.sort((a, b) => a.rating - b.rating)
    return filtered
  }, [nearbyPopularRestaurants, activeFilters, selectedCuisine, sortBy, heroSearch, dishMatchedRestaurantIds])

  /* Banner auto-slide (same cadence as Home) */
  useEffect(() => {
    setCurrentBannerIndex((p) => (diningHeroBanners.length === 0 ? 0 : Math.min(p, diningHeroBanners.length - 1)))
  }, [diningHeroBanners.length])

  useEffect(() => {
    if (typeof window === "undefined") return
    diningHeroBanners.forEach((b) => { if (b?.imageUrl) { const img = new window.Image(); img.src = b.imageUrl } })
  }, [diningHeroBanners])

  const startBannerAutoSlide = useCallback(() => {
    if (autoSlideIntervalRef.current) clearInterval(autoSlideIntervalRef.current)
    if (diningHeroBanners.length <= 1) return
    autoSlideIntervalRef.current = setInterval(() => {
      if (!isBannerSwipingRef.current) setCurrentBannerIndex((p) => (p + 1) % diningHeroBanners.length)
    }, 3500)
  }, [diningHeroBanners.length])

  useEffect(() => {
    startBannerAutoSlide()
    return () => { if (autoSlideIntervalRef.current) clearInterval(autoSlideIntervalRef.current) }
  }, [startBannerAutoSlide])

  const handleSearchFocus = useCallback(() => {
    if (heroSearch) setSearchValue(heroSearch)
    openSearch()
  }, [heroSearch, openSearch, setSearchValue])

  const handleDiningSearchSubmit = useCallback(() => {
    const term = sanitizeSearchQuery(heroSearch)
    if (!term) return
    // Full catalog search (restaurants + menu items) via results page.
    navigate(`/food/user/search?q=${encodeURIComponent(term)}`)
  }, [heroSearch, navigate])

  const handleToggleFavorite = useCallback((slug, restaurant, isFav) => {
    if (isFav) {
      removeFavorite(slug)
    } else {
      addFavorite({ slug, name: restaurant.name, cuisine: restaurant.cuisine, rating: restaurant.rating, deliveryTime: restaurant.deliveryTime, distance: restaurant.distance, image: restaurant.image })
    }
  }, [addFavorite, removeFavorite])

  const filterChips = [
    { id: "delivery-under-30", label: "Under 30 mins", icon: Timer },
    { id: "delivery-under-45", label: "Under 45 mins", icon: Timer },
    { id: "distance-under-1km", label: "Under 1 km", icon: MapPin },
    { id: "distance-under-2km", label: "Under 2 km", icon: MapPin },
    { id: "rating-35-plus", label: "3.5+ rating", icon: Star },
    { id: "rating-4-plus", label: "4.0+ rating", icon: Star },
    { id: "rating-45-plus", label: "4.5+ rating", icon: Star },
    { id: "price-under-200", label: "Under ₹200", icon: IndianRupee },
    { id: "price-under-500", label: "Under ₹500", icon: IndianRupee },
  ]

  const filterTabs = [
    { id: "sort", label: "Sort by", icon: ArrowDownUp },
    { id: "time", label: "Time", icon: Timer },
    { id: "rating", label: "Rating", icon: Star },
    { id: "distance", label: "Distance", icon: MapPin },
    { id: "price", label: "Price", icon: IndianRupee },
    { id: "cuisine", label: "Cuisine", icon: UtensilsCrossed },
  ]

  const activeFilterCount = activeFilters.size + (sortBy ? 1 : 0) + (selectedCuisine ? 1 : 0)

  return (
    <AnimatedPage className="bg-[#fcfcff] dark:bg-[#08080a] text-gray-900 dark:text-gray-100 transition-colors duration-300 relative overflow-hidden" style={{ minHeight: "100vh", paddingBottom: "80px" }}>
      
      {/* Premium Shimmer and utility animations */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .shimmer-bg {
          position: relative;
          overflow: hidden;
        }
        .shimmer-bg::after {
          position: absolute;
          top: 0;
          right: 0;
          bottom: 0;
          left: 0;
          transform: translateX(-100%);
          background-image: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0.08) 20%,
            rgba(255, 255, 255, 0.15) 60%,
            rgba(255, 255, 255, 0) 100%
          );
          content: '';
          animation: shimmer 2s infinite;
        }
        .dark .shimmer-bg::after {
          background-image: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0.02) 20%,
            rgba(255, 255, 255, 0.05) 60%,
            rgba(255, 255, 255, 0) 100%
          );
        }
        /* Hide scrollbars but keep functionality */
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      {/* Decorative backdrop gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] aspect-square rounded-full bg-gradient-to-br from-orange-500/5 to-amber-500/0 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[20%] right-[-10%] w-[50%] aspect-square rounded-full bg-gradient-to-tr from-[#FF6A00]/5 to-transparent blur-[120px] pointer-events-none" />

      {/* ── Sticky Header (Mobile Only) — single address like Home ── */}
      <div className="sticky top-0 z-40 w-full bg-white/90 dark:bg-[#08080a]/90 backdrop-blur-md border-b border-gray-100 dark:border-gray-900 md:hidden">
        {/* Location row */}
        <div className="flex items-center justify-between px-4 pt-3.5 pb-1.5">
          <button
            type="button"
            onClick={openLocationSelector}
            className="flex items-center gap-2 cursor-pointer bg-transparent border-0 p-0 text-left outline-none shrink min-w-0"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-xl shrink-0 bg-[#FF6A00]/15">
              <MapPin className="h-4 w-4 shrink-0 text-[#FF6A00]" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-0.5">
                <span className="font-extrabold text-sm truncate max-w-[150px] text-gray-900 dark:text-white">
                  {locationTitle}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70 text-gray-900 dark:text-white" strokeWidth={2.5} />
              </div>
              <span className="text-[10px] truncate max-w-[170px] mt-0.5 text-gray-500 dark:text-gray-400">
                {locationSubtitle}
              </span>
            </div>
          </button>

          <PageNavbar
            textColor="dark"
            zIndex={20}
            showLogo={false}
            showLocation={false}
            compact
            onNavClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* Search bar — types filter this page client-side; Enter opens full menu search */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-900 rounded-xl px-3 py-2 border border-transparent focus-within:border-[#FF6A00]/40 transition-colors">
            <button
              type="button"
              onClick={handleSearchFocus}
              className="flex-shrink-0 p-0.5"
              aria-label="Open full search"
              title="Search restaurants and dishes"
            >
              <Search className="h-4.5 w-4.5 text-[#FF6A00]" strokeWidth={2.5} />
            </button>
            <Input
              value={heroSearch}
              onChange={(e) => setHeroSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  handleDiningSearchSubmit()
                }
              }}
              className="flex-1 bg-transparent border-0 h-auto p-0 text-[13px] font-bold text-gray-700 dark:text-white focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-gray-400 dark:placeholder:text-gray-500 placeholder:font-medium"
              placeholder="Search restaurants, cuisines…"
            />
            {heroSearch ? (
              <button
                type="button"
                onClick={() => setHeroSearch("")}
                className="flex-shrink-0 p-0.5"
                aria-label="Clear search"
              >
                <X className="h-4 w-4 text-gray-400" strokeWidth={2.5} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleSearchFocus}
              className="flex-shrink-0 p-0.5"
              aria-label="Voice / full search"
            >
              <Mic className="h-4.5 w-4.5 text-gray-400 dark:text-gray-500" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Hero Banner Slider (Hero Banner Management → dining) ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative w-full h-[220px] sm:h-[260px] md:h-[320px] rounded-3xl overflow-hidden shadow-lg border border-gray-150/10 dark:border-gray-800/20 bg-neutral-900"
        >
          {bannersLoading || diningHeroBanners.length > 0 ? (
            <Suspense fallback={<HeroBannerSkeleton className="h-full w-full" />}>
              <BannerSection
                showBannerSkeleton={bannersLoading}
                heroBannerImages={heroBannerImages}
                heroBannersData={diningHeroBanners}
                currentBannerIndex={currentBannerIndex}
                setCurrentBannerIndex={setCurrentBannerIndex}
                heroShellRef={heroShellRef}
                navigate={navigate}
                backendOrigin={BACKEND_ORIGIN}
                hideOverlay={false}
              />
            </Suspense>
          ) : (
            <div className="relative h-full w-full bg-gradient-to-br from-[#2b1000] via-[#541f00] to-[#2b1000] flex items-center px-8 sm:px-12">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(255,106,0,0.15),rgba(0,0,0,0))]" />
              <div className="relative z-10 max-w-lg">
                <span className="inline-block bg-white/10 backdrop-blur-md border border-white/20 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white mb-3">
                  Dining Out
                </span>
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white leading-tight mb-2 tracking-tight">
                  {loading ? "Finding dining spots near you…" : "Premium dining picks near you"}
                </h2>
                <p className="text-[12px] sm:text-[14px] text-white/75 font-medium leading-relaxed">
                  {loading ? "Discovering the best tables, bookings, and cuisine selections..." : "Explore curated restaurants with exclusive table pre-booking offers."}
                </p>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Main Content Container ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">

        {/* ── Categories Section ── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-6 rounded-full bg-[#FF6A00]" />
              <h2 className="text-[17px] font-black text-gray-900 dark:text-white tracking-tight">Explore categories</h2>
            </div>
            <Link to="/food/user/categories" className="text-[12px] text-[#FF6A00] font-bold hover:underline transition-all">
              See all
            </Link>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {loading
              ? Array.from({ length: 6 }, (_, i) => <CategorySkeleton key={i} />)
              : filteredCategories.map((cat, i) => (
                  <CategoryCard key={cat._id || cat.id} category={cat} index={i} />
                ))
            }
          </div>
        </section>

        {/* ── Filter Section ── */}
        <section className="mb-6">
          {/* Mobile Scrollable Filter Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1.5 md:hidden no-scrollbar">
            <button
              type="button"
              onClick={() => setIsFilterOpen(true)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-[12px] font-bold whitespace-nowrap flex-shrink-0 transition-all duration-200 ${
                activeFilterCount > 0
                  ? "bg-[#FF6A00] border-[#FF6A00] text-white shadow-sm"
                  : "bg-white dark:bg-gray-905 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2.5} />
              Filters
              {activeFilterCount > 0 && (
                <span className="flex items-center justify-center w-4.5 h-4.5 rounded-full bg-white/25 text-[10px] font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {filterChips.map((chip) => (
              <FilterChip
                key={chip.id}
                label={chip.label}
                icon={chip.icon}
                isActive={activeFilters.has(chip.id)}
                onClick={() => toggleFilter(chip.id)}
              />
            ))}
          </div>

          {/* Desktop Dropdown Filters */}
          <div className="hidden md:flex items-center justify-between gap-4 py-3 border-y border-gray-150/80 dark:border-gray-850/60 bg-white/20 dark:bg-gray-900/10 backdrop-blur-md rounded-2xl px-4">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Sort Dropdown */}
              <FilterDropdown
                label={
                  sortBy === "rating-high"
                    ? "Rating: High to Low"
                    : sortBy === "rating-low"
                    ? "Rating: Low to High"
                    : "Sort by"
                }
                icon={ArrowDownUp}
                isOpen={openDropdown === "sort"}
                toggleOpen={() => setOpenDropdown(openDropdown === "sort" ? null : "sort")}
                activeCount={sortBy ? 1 : 0}
              >
                <div className="flex flex-col gap-1 min-w-[170px]">
                  {[
                    { id: null, label: "Relevance" },
                    { id: "rating-high", label: "Rating: High to Low" },
                    { id: "rating-low", label: "Rating: Low to High" }
                  ].map((opt) => (
                    <button
                      key={opt.id || "relevance"}
                      type="button"
                      onClick={() => {
                        setSortBy(opt.id)
                        setOpenDropdown(null)
                      }}
                      className={`w-full px-3 py-2 rounded-xl text-left text-[12px] font-bold transition-colors ${
                        sortBy === opt.id
                          ? "bg-[#FF6A00]/10 text-[#FF6A00]"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-850/50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </FilterDropdown>

              {/* Cuisine Dropdown */}
              <FilterDropdown
                label={selectedCuisine || "Cuisine"}
                icon={UtensilsCrossed}
                isOpen={openDropdown === "cuisine"}
                toggleOpen={() => setOpenDropdown(openDropdown === "cuisine" ? null : "cuisine")}
                activeCount={selectedCuisine ? 1 : 0}
              >
                <div className="grid grid-cols-2 gap-1 w-[260px]">
                  {["Continental", "Italian", "Asian", "Indian", "Chinese", "American", "Seafood", "Cafe"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setSelectedCuisine(selectedCuisine === c ? null : c)
                        setOpenDropdown(null)
                      }}
                      className={`px-3 py-2 rounded-xl text-center text-[12px] font-bold transition-colors truncate ${
                        selectedCuisine === c
                          ? "bg-[#FF6A00]/10 text-[#FF6A00]"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-850/50"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </FilterDropdown>

              {/* Rating Dropdown */}
              <FilterDropdown
                label="Rating"
                icon={Star}
                isOpen={openDropdown === "rating"}
                toggleOpen={() => setOpenDropdown(openDropdown === "rating" ? null : "rating")}
                activeCount={
                  (activeFilters.has("rating-35-plus") ? 1 : 0) +
                  (activeFilters.has("rating-4-plus") ? 1 : 0) +
                  (activeFilters.has("rating-45-plus") ? 1 : 0)
                }
              >
                <div className="flex flex-col gap-1 min-w-[170px]">
                  {[
                    { id: "rating-35-plus", label: "3.5 and above" },
                    { id: "rating-4-plus", label: "4.0 and above" },
                    { id: "rating-45-plus", label: "4.5 and above" }
                  ].map((opt) => {
                    const isSelected = activeFilters.has(opt.id)
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          toggleFilter(opt.id)
                        }}
                        className={`w-full px-3 py-2 rounded-xl text-left text-[12px] font-bold flex items-center justify-between transition-colors ${
                          isSelected
                            ? "bg-[#FF6A00]/10 text-[#FF6A00]"
                            : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-850/50"
                        }`}
                      >
                        <span>{opt.label}</span>
                        {isSelected && <Star className="h-3 w-3 fill-[#FF6A00] text-[#FF6A00]" />}
                      </button>
                    )
                  })}
                </div>
              </FilterDropdown>

              {/* Distance & Time Dropdown */}
              <FilterDropdown
                label="Distance & Time"
                icon={Timer}
                isOpen={openDropdown === "distance-time"}
                toggleOpen={() => setOpenDropdown(openDropdown === "distance-time" ? null : "distance-time")}
                activeCount={
                  (activeFilters.has("delivery-under-30") ? 1 : 0) +
                  (activeFilters.has("delivery-under-45") ? 1 : 0) +
                  (activeFilters.has("distance-under-1km") ? 1 : 0) +
                  (activeFilters.has("distance-under-2km") ? 1 : 0)
                }
              >
                <div className="flex flex-col gap-3 min-w-[190px]">
                  <div>
                    <h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5 px-1">Distance</h4>
                    <div className="flex flex-col gap-0.5">
                      {[
                        { id: "distance-under-1km", label: "Under 1 km" },
                        { id: "distance-under-2km", label: "Under 2 km" }
                      ].map((opt) => {
                        const isSelected = activeFilters.has(opt.id)
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => toggleFilter(opt.id)}
                            className={`w-full px-3 py-1.5 rounded-xl text-left text-[12px] font-bold flex items-center justify-between transition-colors ${
                              isSelected
                                ? "bg-[#FF6A00]/10 text-[#FF6A00]"
                                : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-855/50"
                            }`}
                          >
                            <span>{opt.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5 px-1">Time</h4>
                    <div className="flex flex-col gap-0.5">
                      {[
                        { id: "delivery-under-30", label: "Under 30 mins" },
                        { id: "delivery-under-45", label: "Under 45 mins" }
                      ].map((opt) => {
                        const isSelected = activeFilters.has(opt.id)
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => toggleFilter(opt.id)}
                            className={`w-full px-3 py-1.5 rounded-xl text-left text-[12px] font-bold flex items-center justify-between transition-colors ${
                              isSelected
                                ? "bg-[#FF6A00]/10 text-[#FF6A00]"
                                : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-855/50"
                            }`}
                          >
                            <span>{opt.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </FilterDropdown>

              {/* Price Dropdown */}
              <FilterDropdown
                label="Price"
                icon={IndianRupee}
                isOpen={openDropdown === "price"}
                toggleOpen={() => setOpenDropdown(openDropdown === "price" ? null : "price")}
                activeCount={
                  (activeFilters.has("price-under-200") ? 1 : 0) +
                  (activeFilters.has("price-under-500") ? 1 : 0)
                }
              >
                <div className="flex flex-col gap-1 min-w-[160px]">
                  {[
                    { id: "price-under-200", label: "Under ₹200" },
                    { id: "price-under-500", label: "Under ₹500" }
                  ].map((opt) => {
                    const isSelected = activeFilters.has(opt.id)
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleFilter(opt.id)}
                        className={`w-full px-3 py-2 rounded-xl text-left text-[12px] font-bold flex items-center justify-between transition-colors ${
                          isSelected
                            ? "bg-[#FF6A00]/10 text-[#FF6A00]"
                            : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-850/50"
                        }`}
                      >
                        <span>{opt.label}</span>
                      </button>
                    )
                  })}
                </div>
              </FilterDropdown>
            </div>

            {/* Clear All Desktop Button */}
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setActiveFilters(new Set())
                  setSortBy(null)
                  setSelectedCuisine(null)
                  setOpenDropdown(null)
                }}
                className="text-[12px] font-extrabold text-[#FF6A00] hover:text-[#e05e00] transition-colors whitespace-nowrap bg-[#FF6A00]/10 px-3.5 py-2 rounded-xl flex items-center gap-1"
              >
                Clear all
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </section>

        {/* ── Section Divider ── */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-gray-150 dark:bg-gray-850" />
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 dark:text-gray-500 whitespace-nowrap">
            {loading ? "Loading…" : `${filteredRestaurants.length} places nearby`}
          </span>
          <div className="flex-1 h-px bg-gray-150 dark:bg-gray-850" />
        </div>

        {/* ── Restaurant Grid ── */}
        <section className="mb-10">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {Array.from({ length: 4 }, (_, i) => <RestaurantSkeleton key={i} />)}
            </div>
          ) : filteredRestaurants.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/60 backdrop-blur-md px-6 py-16 text-center max-w-md mx-auto shadow-sm">
              <div className="w-16 h-16 rounded-full bg-orange-50 dark:bg-orange-950/20 flex items-center justify-center mx-auto mb-4 border border-orange-100 dark:border-orange-900/30">
                <UtensilsCrossed className="h-7 w-7 text-[#FF6A00]" strokeWidth={1.5} />
              </div>
              <h3 className="text-[16px] font-bold text-gray-850 dark:text-gray-200 mb-2">
                {sanitizeSearchQuery(heroSearch) ? "No restaurants found" : "No dining places found"}
              </h3>
              <p className="text-[13px] text-gray-400 dark:text-gray-500 mb-6 max-w-xs mx-auto leading-relaxed">
                {sanitizeSearchQuery(heroSearch)
                  ? `No matches for "${sanitizeSearchQuery(heroSearch)}". Try another name, cuisine, or dish.`
                  : "We couldn't find any restaurants matching your active filters or location settings."}
              </p>
              <button
                type="button"
                onClick={() => {
                  setActiveFilters(new Set())
                  setSortBy(null)
                  setSelectedCuisine(null)
                  setOpenDropdown(null)
                  setHeroSearch("")
                }}
                className="px-6 py-2.5 bg-[#FF6A00] hover:bg-[#e05e00] text-white text-[13px] font-bold rounded-xl transition-all duration-200 shadow-md hover:shadow-lg"
              >
                {sanitizeSearchQuery(heroSearch) ? "Clear search" : "Clear all filters"}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filteredRestaurants.map((restaurant, index) => (
                <RestaurantCard
                  key={restaurant._id || restaurant.id}
                  restaurant={restaurant}
                  index={index}
                  isFavorite={isFavorite}
                  onToggleFavorite={handleToggleFavorite}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Mobile Filter Modal (AnimatePresence) ── */}
      <AnimatePresence>
        {isFilterOpen && (
          <div className="fixed inset-0 z-[100]">
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFilterOpen(false)}
            />

            <motion.div
              className="absolute bottom-0 left-0 right-0 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-[560px] bg-white dark:bg-[#111] rounded-t-[32px] md:rounded-3xl md:bottom-8 max-h-[88vh] flex flex-col overflow-hidden shadow-2xl border border-gray-150/10 dark:border-gray-800/30"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 280, damping: 30 }}
            >
              {/* Mobile drag handle indicator */}
              <div className="flex justify-center pt-3 pb-1 md:hidden">
                <div className="w-12 h-1.5 rounded-full bg-gray-200 dark:bg-gray-800" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-850">
                <h2 className="text-[16px] font-black text-gray-900 dark:text-white tracking-tight">Filters &amp; sorting</h2>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => { setActiveFilters(new Set()); setSortBy(null); setSelectedCuisine(null) }}
                    className="text-[12px] font-bold text-[#FF6A00] bg-orange-50 dark:bg-orange-950/20 px-2.5 py-1 rounded-lg"
                  >
                    Clear all
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFilterOpen(false)}
                    className="p-1 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    aria-label="Close filters"
                  >
                    <X className="h-5 w-5 text-gray-500 dark:text-gray-400" strokeWidth={2.5} />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="flex flex-1 overflow-hidden">
                {/* Sidebar tabs */}
                <div className="w-24 sm:w-28 bg-gray-50 dark:bg-[#0a0a0c] border-r border-gray-100 dark:border-gray-850 flex flex-col overflow-y-auto">
                  {filterTabs.map(({ id, label, icon: Icon }) => {
                    const isActive = activeFilterTab === id
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setActiveFilterTab(id)}
                        className={`relative flex flex-col items-center gap-1 py-4.5 px-2 text-center transition-colors ${
                          isActive ? "bg-white dark:bg-[#111] text-[#FF6A00]" : "text-gray-400 dark:text-gray-500 hover:text-gray-650 dark:hover:text-gray-300"
                        }`}
                      >
                        {isActive && <div className="absolute left-0 top-3 bottom-3 w-1 bg-[#FF6A00] rounded-r-lg" />}
                        <Icon className="h-5 w-5" strokeWidth={1.8} />
                        <span className="text-[11px] font-bold leading-tight mt-0.5">{label}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Tab content panel */}
                <div className="flex-1 overflow-y-auto p-5">
                  {activeFilterTab === "sort" && (
                    <div className="space-y-2">
                      <h3 className="text-[14px] font-black text-gray-900 dark:text-white mb-4">Sort by</h3>
                      {[{ id: null, label: "Relevance" }, { id: "rating-high", label: "Rating: high to low" }, { id: "rating-low", label: "Rating: low to high" }].map((opt) => (
                        <button
                          key={opt.id || "relevance"}
                          type="button"
                          onClick={() => setSortBy(opt.id)}
                          className={`w-full px-4 py-3.5 rounded-2xl border text-left text-[13px] font-bold transition-all duration-200 ${
                            sortBy === opt.id
                              ? "border-[#FF6A00] bg-orange-50/50 dark:bg-orange-950/20 text-[#FF6A00]"
                              : "border-gray-150 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:border-[#FF6A00]"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {activeFilterTab === "time" && (
                    <div>
                      <h3 className="text-[14px] font-black text-gray-900 dark:text-white mb-4">Estimated time</h3>
                      <div className="grid grid-cols-2 gap-2.5">
                        {[{ id: "delivery-under-30", label: "Under 30 mins" }, { id: "delivery-under-45", label: "Under 45 mins" }].map(({ id, label }) => (
                          <button key={id} type="button" onClick={() => toggleFilter(id)}
                            className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all duration-200 ${activeFilters.has(id) ? "border-[#FF6A00] bg-orange-50/50 dark:bg-orange-950/20 text-[#FF6A00]" : "border-gray-150 dark:border-gray-800 hover:border-[#FF6A00] text-gray-600 dark:text-gray-300"}`}>
                            <Timer className={`h-5.5 w-5.5 ${activeFilters.has(id) ? "text-[#FF6A00]" : "text-gray-400"}`} strokeWidth={1.8} />
                            <span className="text-[12px] font-bold">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeFilterTab === "rating" && (
                    <div>
                      <h3 className="text-[14px] font-black text-gray-900 dark:text-white mb-4">Restaurant rating</h3>
                      <div className="grid grid-cols-2 gap-2.5">
                        {[{ id: "rating-35-plus", label: "3.5 and above" }, { id: "rating-4-plus", label: "4.0 and above" }, { id: "rating-45-plus", label: "4.5 and above" }].map(({ id, label }) => (
                          <button key={id} type="button" onClick={() => toggleFilter(id)}
                            className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all duration-200 ${activeFilters.has(id) ? "border-[#FF6A00] bg-orange-50/50 dark:bg-orange-950/20 text-[#FF6A00]" : "border-gray-150 dark:border-gray-800 hover:border-[#FF6A00] text-gray-600 dark:text-gray-300"}`}>
                            <Star className={`h-5.5 w-5.5 ${activeFilters.has(id) ? "text-[#FF6A00] fill-[#FF6A00]" : "text-gray-400"}`} strokeWidth={1.8} />
                            <span className="text-[12px] font-bold">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeFilterTab === "distance" && (
                    <div>
                      <h3 className="text-[14px] font-black text-gray-900 dark:text-white mb-4">Distance</h3>
                      <div className="grid grid-cols-2 gap-2.5">
                        {[{ id: "distance-under-1km", label: "Under 1 km" }, { id: "distance-under-2km", label: "Under 2 km" }].map(({ id, label }) => (
                          <button key={id} type="button" onClick={() => toggleFilter(id)}
                            className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all duration-200 ${activeFilters.has(id) ? "border-[#FF6A00] bg-orange-50/50 dark:bg-orange-950/20 text-[#FF6A00]" : "border-gray-150 dark:border-gray-800 hover:border-[#FF6A00] text-gray-600 dark:text-gray-300"}`}>
                            <MapPin className={`h-5.5 w-5.5 ${activeFilters.has(id) ? "text-[#FF6A00]" : "text-gray-400"}`} strokeWidth={1.8} />
                            <span className="text-[12px] font-bold">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeFilterTab === "price" && (
                    <div>
                      <h3 className="text-[14px] font-black text-gray-900 dark:text-white mb-4">Dish price</h3>
                      <div className="flex flex-col gap-2.5">
                        {[{ id: "price-under-200", label: "Under ₹200" }, { id: "price-under-500", label: "Under ₹500" }].map(({ id, label }) => (
                          <button key={id} type="button" onClick={() => toggleFilter(id)}
                            className={`px-4 py-3.5 rounded-2xl border text-left text-[13px] font-bold transition-all duration-200 ${activeFilters.has(id) ? "border-[#FF6A00] bg-orange-50/50 dark:bg-orange-950/20 text-[#FF6A00]" : "border-gray-155 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:border-[#FF6A00]"}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeFilterTab === "cuisine" && (
                    <div>
                      <h3 className="text-[14px] font-black text-gray-900 dark:text-white mb-4">Cuisine</h3>
                      <div className="grid grid-cols-2 gap-2.5">
                        {["Continental", "Italian", "Asian", "Indian", "Chinese", "American", "Seafood", "Cafe"].map((c) => (
                          <button key={c} type="button" onClick={() => setSelectedCuisine(selectedCuisine === c ? null : c)}
                            className={`px-4 py-3 rounded-2xl border text-center text-[13px] font-bold transition-all duration-200 ${selectedCuisine === c ? "border-[#FF6A00] bg-orange-50/50 dark:bg-orange-950/20 text-[#FF6A00]" : "border-gray-155 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:border-[#FF6A00]"}`}>
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center gap-3.5 px-5 py-4 border-t border-gray-100 dark:border-gray-855 bg-white dark:bg-[#111]">
                <button
                  type="button"
                  onClick={() => setIsFilterOpen(false)}
                  className="flex-1 py-3.5 text-center text-[14px] font-bold text-gray-700 dark:text-gray-300 rounded-2xl border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-850 transition-colors"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => setIsFilterOpen(false)}
                  className={`flex-1 py-3.5 text-center text-[14px] font-bold rounded-2xl transition-all duration-250 ${
                    activeFilterCount > 0
                      ? "bg-[#FF6A00] text-white hover:bg-[#e05e00] shadow-md shadow-orange-500/20"
                      : "bg-gray-100 dark:bg-gray-900 text-gray-400 dark:text-gray-650"
                  }`}
                >
                  {activeFilterCount > 0 ? `Show ${filteredRestaurants.length} results` : "Show results"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AnimatedPage>
  )
}
