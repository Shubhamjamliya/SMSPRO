import { useNavigate, useLocation as useRouterLocation } from "react-router-dom"
import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { Tag } from "lucide-react"
import { toast } from "sonner"
import { useLocation } from "@food/hooks/useLocation"
import { useZone } from "@food/hooks/useZone"
import { useCart } from "@food/context/CartContext"
import AddToCartAnimation from "@food/components/user/AddToCartAnimation"
import api from "@food/api"
import { restaurantAPI, adminAPI } from "@food/api"
import { API_BASE_URL } from "@food/api/config"
import { isModuleAuthenticated } from "@food/utils/auth"
import { getQuantityLimits } from "@food/utils/orderQuantity"
import { navigateToLogin } from "@core/utils/postLoginRedirect"
import { flattenMenuItems, getMenuFromResponse } from "@food/utils/menuItems"
import { calculateDistance, formatDistance } from "@food/utils/common"
import * as imgUtils from "@food/utils/imageUtils"
import Under250Banner from "@food/components/user/under250/Under250Banner"
import Under250CategoryRail from "@food/components/user/under250/Under250CategoryRail"
import Under250FilterBar from "@food/components/user/under250/Under250FilterBar"
import Under250RestaurantSection from "@food/components/user/under250/Under250RestaurantSection"
import Under250SortSheet from "@food/components/user/under250/Under250SortSheet"
import Under250ItemDetailSheet from "@food/components/user/under250/Under250ItemDetailSheet"
import Under250ShareSheet from "@food/components/user/under250/Under250ShareSheet"
import { RestaurantSectionSkeleton, ShimmerStyles } from "@food/components/user/under250/Skeletons"

const BACKEND_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "")
const RUPEE_SYMBOL = "\u20B9"
const UNDER_250_FILTERS_STORAGE_KEY = "food-under-250-filters"

const readUnder250Filters = () => {
  if (typeof window === "undefined") {
    return { selectedSort: null, activeCategory: null, under30MinsFilter: false }
  }
  try {
    const raw = window.localStorage.getItem(UNDER_250_FILTERS_STORAGE_KEY)
    if (!raw) return { selectedSort: null, activeCategory: null, under30MinsFilter: false }
    const parsed = JSON.parse(raw)
    return {
      selectedSort: typeof parsed?.selectedSort === "string" ? parsed.selectedSort : null,
      activeCategory: typeof parsed?.activeCategory === "string" ? parsed.activeCategory : null,
      under30MinsFilter: parsed?.under30MinsFilter === true,
    }
  } catch {
    return { selectedSort: null, activeCategory: null, under30MinsFilter: false }
  }
}

const parseDeliveryTime = (deliveryTime) => {
  if (typeof deliveryTime === "number" && Number.isFinite(deliveryTime)) return deliveryTime
  if (!deliveryTime) return 999
  const value = String(deliveryTime)
  const rangeMatch = value.match(/(\d+)\s*-\s*(\d+)/)
  if (rangeMatch) return (parseInt(rangeMatch[1]) + parseInt(rangeMatch[2])) / 2
  const match = value.match(/(\d+)/)
  if (match) return parseInt(match[1])
  return 999
}

const parseDistance = (distance) => {
  if (typeof distance === "number" && Number.isFinite(distance)) return distance
  if (!distance) return 999
  const value = String(distance)
  const match = value.match(/(\d+\.?\d*)/)
  if (match) {
    const numericValue = parseFloat(match[1])
    return value.toLowerCase().includes("m") && !value.toLowerCase().includes("km")
      ? numericValue / 1000
      : numericValue
  }
  return 999
}

export default function Under250() {
  const initialFiltersRef = useRef(readUnder250Filters())
  const { location } = useLocation()
  const { zoneId, isOutOfService } = useZone(location)
  const navigate = useNavigate()
  const routerLocation = useRouterLocation()
  const { addToCart, updateQuantity, removeFromCart, getCartItem, cart } = useCart()

  const [activeCategory, setActiveCategory] = useState(initialFiltersRef.current.activeCategory)
  const [showSortPopup, setShowSortPopup] = useState(false)
  const [selectedSort, setSelectedSort] = useState(initialFiltersRef.current.selectedSort)
  const [draftSelectedSort, setDraftSelectedSort] = useState(initialFiltersRef.current.selectedSort)
  const [under30MinsFilter, setUnder30MinsFilter] = useState(initialFiltersRef.current.under30MinsFilter)
  const [showItemDetail, setShowItemDetail] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [selectedItemImageIndex, setSelectedItemImageIndex] = useState(0)
  const [itemDetailQuantity, setItemDetailQuantity] = useState(1)
  const [showShareOptions, setShowShareOptions] = useState(false)
  const [quantities, setQuantities] = useState({})
  const [bookmarkedItems, setBookmarkedItems] = useState(new Set())
  const [viewCartButtonBottom, setViewCartButtonBottom] = useState("bottom-20")
  const lastScrollY = useRef(0)
  const scrollLockYRef = useRef(0)
  const itemDetailContentRef = useRef(null)
  const itemDetailGestureRef = useRef({ startY: 0, dragging: false })
  const [categories, setCategories] = useState([])
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [bannerImages, setBannerImages] = useState([])
  const [banners, setBanners] = useState([])
  const [loadingBanner, setLoadingBanner] = useState(true)
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0)
  const [under250Restaurants, setUnder250Restaurants] = useState([])
  const [loadingRestaurants, setLoadingRestaurants] = useState(true)
  const bannerShellRef = useRef(null)
  const autoSlideIntervalRef = useRef(null)
  const isBannerSwipingRef = useRef(false)

  const sortOptions = [
    { id: null, label: "Relevance" },
    { id: "rating-high", label: "Rating: High to Low" },
    { id: "delivery-time-low", label: "Estimated Time: Low to High" },
    { id: "distance-low", label: "Distance: Low to High" },
  ]

  const handleClearAll = useCallback(() => {
    setSelectedSort(null)
    setDraftSelectedSort(null)
    setUnder30MinsFilter(false)
    setActiveCategory(null)
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(UNDER_250_FILTERS_STORAGE_KEY)
    }
  }, [])

  const handleApply = useCallback(() => {
    setSelectedSort(draftSelectedSort)
    setShowSortPopup(false)
  }, [draftSelectedSort])

  const sortedAndFilteredRestaurants = useMemo(() => {
    let filtered = under250Restaurants.map((r) => ({ ...r, menuItems: [...(r.menuItems || [])] }))

    if (activeCategory) {
      const selectedCat = categories.find((cat) => cat.id === activeCategory)
      if (selectedCat) {
        const catNameLower = selectedCat.name.toLowerCase()
        filtered = filtered
          .map((restaurant) => {
            const matches = restaurant.menuItems.filter(
              (item) =>
                (item.category || "").toLowerCase() === catNameLower ||
                (item.sectionName || "").toLowerCase() === catNameLower ||
                (item.subsectionName || "").toLowerCase() === catNameLower
            )
            return matches.length > 0 ? { ...restaurant, menuItems: matches } : null
          })
          .filter(Boolean)
      }
    }

    if (under30MinsFilter) {
      filtered = filtered.filter((restaurant) => parseDeliveryTime(restaurant.deliveryTime) <= 30)
    }

    if (selectedSort === "rating-high") {
      filtered.sort((a, b) => {
        if ((b.rating || 0) !== (a.rating || 0)) return (b.rating || 0) - (a.rating || 0)
        return (b.menuItems?.length || 0) - (a.menuItems?.length || 0)
      })
    } else if (selectedSort === "delivery-time-low") {
      filtered.sort((a, b) => {
        const timeA = parseDeliveryTime(a.deliveryTime)
        const timeB = parseDeliveryTime(b.deliveryTime)
        if (timeA !== timeB) return timeA - timeB
        if ((b.rating || 0) !== (a.rating || 0)) return (b.rating || 0) - (a.rating || 0)
        return (a.originalIndex || 0) - (b.originalIndex || 0)
      })
    } else if (selectedSort === "distance-low") {
      filtered.sort((a, b) => {
        const distA = Number.isFinite(a.distanceInKm) ? a.distanceInKm : parseDistance(a.distance)
        const distB = Number.isFinite(b.distanceInKm) ? b.distanceInKm : parseDistance(b.distance)
        if (distA !== distB) return distA - distB
        if ((b.rating || 0) !== (a.rating || 0)) return (b.rating || 0) - (a.rating || 0)
        return (a.originalIndex || 0) - (b.originalIndex || 0)
      })
    }

    return filtered
  }, [under250Restaurants, selectedSort, under30MinsFilter, activeCategory, categories])

  // Banner fetch — Under ₹250 banners from Hero Banner Management
  useEffect(() => {
    let cancelled = false
    setLoadingBanner(true)
    api
      .get("/food/hero-banners/under-250/public")
      .then((res) => {
        if (cancelled) return
        // Same response-shape handling + field mapping as Home (`useFoodHomeData`).
        const raw = res
        const payload =
          raw?.data?.data ??
          raw?.data ??
          raw
        const list = Array.isArray(payload?.banners)
          ? payload.banners
          : Array.isArray(payload)
            ? payload
            : []

        const normalized = list
          .filter((b) => b && (b.isActive === undefined || b.isActive !== false))
          .map((b, index) => {
            const imageUrl = imgUtils.normalizeImageUrl(
              b?.imageUrl || b?.image || b?.url || "",
              BACKEND_ORIGIN,
            )
            if (!imageUrl) return null
            return {
              ...b,
              _id: b?._id || b?.id || `under250-banner-${index}`,
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

        setBanners(normalized)
        setBannerImages(normalized.map((banner) => banner.imageUrl))
      })
      .catch(() => {
        if (!cancelled) {
          setBanners([])
          setBannerImages([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingBanner(false)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    setCurrentBannerIndex((prev) => {
      if (bannerImages.length === 0) return 0
      return Math.min(prev, bannerImages.length - 1)
    })
  }, [bannerImages.length])

  useEffect(() => {
    if (typeof window === "undefined") return
    bannerImages.forEach((src) => {
      if (!src) return
      const img = new window.Image()
      img.src = src
    })
  }, [bannerImages])

  const startBannerAutoSlide = useCallback(() => {
    if (autoSlideIntervalRef.current) clearInterval(autoSlideIntervalRef.current)
    if (bannerImages.length <= 1) return
    autoSlideIntervalRef.current = setInterval(() => {
      if (!isBannerSwipingRef.current) {
        setCurrentBannerIndex((prev) => (prev + 1) % bannerImages.length)
      }
    }, 3500)
  }, [bannerImages.length])

  useEffect(() => {
    startBannerAutoSlide()
    return () => {
      if (autoSlideIntervalRef.current) clearInterval(autoSlideIntervalRef.current)
    }
  }, [startBannerAutoSlide])

  // Restaurants fetch
  useEffect(() => {
    const fetchRestaurantsUnder250 = async () => {
      try {
        setLoadingRestaurants(true)
        const response = await restaurantAPI.getRestaurants(zoneId ? { zoneId } : {})
        const restaurantsRaw = Array.isArray(response?.data?.data?.restaurants)
          ? response.data.data.restaurants
          : []
        const userLat = Number(location?.latitude)
        const userLng = Number(location?.longitude)

        const restaurantsWithUnder250Dishes = await Promise.all(
          restaurantsRaw.map(async (restaurant, index) => {
            const restaurantId = restaurant?.restaurantId || restaurant?._id
            if (!restaurantId) return null
            try {
              const menuResponse = await restaurantAPI.getMenuByRestaurantId(restaurantId)
              const menu = getMenuFromResponse(menuResponse)
              const menuItems = flattenMenuItems(menu)
                .filter((item) => Number(item?.price || 0) <= 250 && item?.isAvailable !== false)
                .map((item) => {
                  const foodType = String(item?.foodType || "").toLowerCase()
                  const isVeg = foodType.includes("veg") && !foodType.includes("non")
                  return {
                    ...item,
                    id: String(item?.id || item?._id || `${restaurantId}-${item?.name || "dish"}`),
                    price: Number(item?.price || 0),
                    isVeg,
                    image:
                      item?.image ||
                      restaurant?.coverImages?.[0]?.url ||
                      restaurant?.coverImages?.[0] ||
                      restaurant?.menuImages?.[0]?.url ||
                      restaurant?.menuImages?.[0] ||
                      restaurant?.profileImage?.url ||
                      "",
                  }
                })
              if (menuItems.length === 0) return null

              const deliveryMinutes =
                Number(restaurant?.estimatedDeliveryTimeMinutes) ||
                Number(restaurant?.estimatedDeliveryTime) ||
                null
              const restaurantLocation = restaurant?.location
              const restaurantLat = Number(
                restaurantLocation?.latitude ??
                  (Array.isArray(restaurantLocation?.coordinates)
                    ? restaurantLocation.coordinates[1]
                    : null)
              )
              const restaurantLng = Number(
                restaurantLocation?.longitude ??
                  (Array.isArray(restaurantLocation?.coordinates)
                    ? restaurantLocation.coordinates[0]
                    : null)
              )
              const distanceInKm =
                Number.isFinite(userLat) &&
                Number.isFinite(userLng) &&
                Number.isFinite(restaurantLat) &&
                Number.isFinite(restaurantLng)
                  ? calculateDistance(userLat, userLng, restaurantLat, restaurantLng)
                  : null

              return {
                id: String(restaurantId),
                restaurantId: String(restaurantId),
                slug:
                  restaurant?.slug ||
                  String(restaurant?.restaurantName || restaurant?.name || "")
                    .toLowerCase()
                    .replace(/\s+/g, "-"),
                name: restaurant?.restaurantName || restaurant?.name || "Restaurant",
                rating: Number(restaurant?.rating || 0),
                totalRatings: Number(restaurant?.totalRatings || restaurant?.ratingCount || 0),
                deliveryTime:
                  restaurant?.estimatedDeliveryTime ||
                  (deliveryMinutes ? `${deliveryMinutes} mins` : "30 mins"),
                distance:
                  distanceInKm !== null
                    ? formatDistance(distanceInKm)
                    : typeof restaurant?.distance === "number"
                      ? formatDistance(restaurant.distance)
                      : restaurant?.distance || "",
                distanceInKm,
                originalIndex: index,
                menuItems,
              }
            } catch {
              return null
            }
          })
        )
        setUnder250Restaurants(restaurantsWithUnder250Dishes.filter(Boolean))
      } catch {
        setUnder250Restaurants([])
      } finally {
        setLoadingRestaurants(false)
      }
    }
    fetchRestaurantsUnder250()
  }, [zoneId, isOutOfService, location?.latitude, location?.longitude])

  // Categories fetch
  useEffect(() => {
    let cancelled = false
    const fetchCategories = async () => {
      try {
        setLoadingCategories(true)
        const response = await adminAPI.getPublicCategories(zoneId ? { zoneId } : {})
        const categoriesRaw = Array.isArray(response?.data?.data?.categories)
          ? response.data.data.categories
          : []
        const mapped = categoriesRaw
          .map((cat, index) => {
            const name = String(cat?.name || "").trim()
            if (!name) return null
            return {
              id: String(cat?.id || cat?._id || cat?.slug || `cat-${index}`),
              name,
              slug: String(cat?.slug || name.toLowerCase().replace(/\s+/g, "-")),
              image: cat?.imageUrl || cat?.image || cat?.icon || "",
            }
          })
          .filter(Boolean)
        if (!cancelled) setCategories(mapped)
      } catch {
        if (!cancelled) setCategories([])
      } finally {
        if (!cancelled) setLoadingCategories(false)
      }
    }
    fetchCategories()
    return () => { cancelled = true }
  }, [zoneId])

  useEffect(() => {
    const cartQuantities = {}
    cart.forEach((item) => { cartQuantities[item.id] = item.quantity || 0 })
    setQuantities(cartQuantities)
  }, [cart])

  useEffect(() => {
    if (!selectedItem || !showItemDetail) return
    const existingQuantity = quantities[selectedItem.id] || 0
    if (existingQuantity > 0) setItemDetailQuantity(existingQuantity)
  }, [quantities, selectedItem, showItemDetail])

  useEffect(() => {
    if (!showSortPopup) return
    setDraftSelectedSort(selectedSort)
  }, [showSortPopup, selectedSort])

  useEffect(() => {
    if (!showSortPopup && !showItemDetail && !showShareOptions) return
    if (typeof window === "undefined") return
    const bodyStyle = document.body.style
    scrollLockYRef.current = window.scrollY
    const originalOverflow = bodyStyle.overflow
    const originalPosition = bodyStyle.position
    const originalTop = bodyStyle.top
    const originalWidth = bodyStyle.width
    bodyStyle.overflow = "hidden"
    bodyStyle.position = "fixed"
    bodyStyle.top = `-${scrollLockYRef.current}px`
    bodyStyle.width = "100%"
    return () => {
      bodyStyle.overflow = originalOverflow
      bodyStyle.position = originalPosition
      bodyStyle.top = originalTop
      bodyStyle.width = originalWidth
      window.scrollTo(0, scrollLockYRef.current)
    }
  }, [showSortPopup, showItemDetail, showShareOptions])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!selectedSort && !activeCategory && !under30MinsFilter) {
      window.localStorage.removeItem(UNDER_250_FILTERS_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(
      UNDER_250_FILTERS_STORAGE_KEY,
      JSON.stringify({ selectedSort, activeCategory, under30MinsFilter })
    )
  }, [selectedSort, activeCategory, under30MinsFilter])

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      if (Math.abs(currentScrollY - lastScrollY.current) < 5) return
      setViewCartButtonBottom(currentScrollY > lastScrollY.current ? "bottom-0" : "bottom-20")
      lastScrollY.current = currentScrollY
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const updateItemQuantity = async (item, newQuantity, event = null, restaurantName = null) => {
    if (!isModuleAuthenticated("user")) {
      toast.error("Please login to add items to cart")
      navigateToLogin(navigate, routerLocation)
      return
    }
    if (isOutOfService) {
      toast.error("You are outside the service zone. Please select a location within the service area.")
      return
    }

    // Per-item order quantity limits: a first add jumps to the minimum, stepping
    // below it removes the line, and the cap is refused. Server re-checks.
    const quantityLimits = getQuantityLimits(item)
    if (newQuantity > 0) {
      const currentQuantity = Number(quantities[item.id]) || 0
      if (newQuantity > quantityLimits.max) {
        toast.error(`You can order at most ${quantityLimits.max} of ${item?.name || "this item"}`)
        return
      }
      if (newQuantity < quantityLimits.min) {
        newQuantity = currentQuantity > 0 ? 0 : quantityLimits.min
      }
    }

    setQuantities((prev) => ({ ...prev, [item.id]: newQuantity }))
    const restaurant = restaurantName || item.restaurant || "Under 250"
    const cartItem = {
      id: item.id,
      itemId: item.id,
      name: item.name,
      price: item.price,
      otherPrice: item.otherPrice || item.originalPrice || 0,
      image: item.image,
      restaurant,
      restaurantId: item.restaurantId || item.restaurant?._id || item.restaurant?.restaurantId,
      description: item.description || "",
      originalPrice: item.originalPrice || item.price,
      minOrderQuantity: quantityLimits.min,
      maxOrderQuantity: quantityLimits.hasMax ? quantityLimits.max : 0,
    }

    let sourcePosition = null
    if (event) {
      let buttonElement = event.currentTarget
      if (!buttonElement && event.target) {
        buttonElement = event.target.closest("button") || event.target
      }
      if (buttonElement) {
        const rect = buttonElement.getBoundingClientRect()
        sourcePosition = {
          viewportX: rect.left + rect.width / 2,
          viewportY: rect.top + rect.height / 2,
          scrollX: window.pageXOffset || window.scrollX || 0,
          scrollY: window.pageYOffset || window.scrollY || 0,
          itemId: item.id,
        }
      }
    }

    if (newQuantity <= 0) {
      removeFromCart(item.id, sourcePosition, {
        id: item.id,
        name: item.name,
        imageUrl: item.image,
      })
    } else {
      const existingCartItem = getCartItem(item.id)
      if (existingCartItem) {
        const productInfo = { id: item.id, name: item.name, imageUrl: item.image }
        const result = await updateQuantity(item.id, newQuantity, sourcePosition, productInfo)
        if (result?.ok === false) {
          toast.error(result.error || "Could not update quantity")
          return
        }
      } else {
        const result = await addToCart(
          { ...cartItem, quantity: newQuantity > 0 ? newQuantity : 1 },
          sourcePosition,
        )
        if (result?.ok === false) {
          toast.error(result.error || "Cannot add item from different restaurant. Please clear cart first.")
          return
        }
      }
    }
  }

  const closeItemDetail = useCallback(() => {
    setShowItemDetail(false)
    setShowShareOptions(false)
  }, [])

  const handleItemClick = useCallback(
    (item, restaurant) => {
      const itemWithRestaurant = {
        ...item,
        restaurant: restaurant.name,
        restaurantSlug: restaurant.slug || restaurant.restaurantId || "",
        description: item.description || `${item.name} from ${restaurant.name}`,
        customisable: item.customisable || false,
        notEligibleForCoupons: item.notEligibleForCoupons || false,
      }
      const existingQuantity = quantities[item.id] || 0
      setItemDetailQuantity(existingQuantity > 0 ? existingQuantity : 1)
      setSelectedItem(itemWithRestaurant)
      setSelectedItemImageIndex(0)
      setShowShareOptions(false)
      setShowItemDetail(true)
    },
    [quantities]
  )

  const handleAddFromCard = useCallback(
    (item, restaurant, e) => {
      e.stopPropagation()
      if (isOutOfService) return
      updateItemQuantity(item, 1, e, restaurant.name)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOutOfService]
  )

  const handleIncrementFromCard = useCallback(
    (item, restaurant, e) => {
      e.stopPropagation()
      const current = quantities[item.id] || 0
      updateItemQuantity(item, current + 1, e, restaurant.name)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quantities, isOutOfService]
  )

  const handleDecrementFromCard = useCallback(
    (item, restaurant, e) => {
      e.stopPropagation()
      const current = quantities[item.id] || 0
      updateItemQuantity(item, Math.max(0, current - 1), e, restaurant.name)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quantities, isOutOfService]
  )

  const handleBookmarkClick = useCallback((itemId) => {
    setBookmarkedItems((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(itemId)) newSet.delete(itemId)
      else newSet.add(itemId)
      return newSet
    })
  }, [])

  const handleShareItem = useCallback(async (item) => {
    if (!item) return
    const itemId = item.id || item._id
    const restaurantSlug = item.restaurantSlug || item.slug || ""
    const shareUrl = restaurantSlug
      ? `${window.location.origin}/user/restaurants/${restaurantSlug}${itemId ? `?dish=${encodeURIComponent(itemId)}` : ""}`
      : window.location.href
    try {
      if (navigator.share) {
        await navigator.share({
          title: item.name || "Dish",
          text: `Check out ${item.name || "this dish"} from ${item.restaurant || "Under 250"}`,
          url: shareUrl,
        })
        return
      }
    } catch (error) {
      if (error?.name === "AbortError") return
    }
    setShowShareOptions(true)
  }, [])

  const handleShareOption = async (type) => {
    if (!selectedItem) return
    const itemId = selectedItem.id || selectedItem._id
    const restaurantSlug = selectedItem.restaurantSlug || selectedItem.slug || ""
    const shareUrl = restaurantSlug
      ? `${window.location.origin}/user/restaurants/${restaurantSlug}${itemId ? `?dish=${encodeURIComponent(itemId)}` : ""}`
      : window.location.href
    const shareText = `Check out ${selectedItem.name || "this dish"} from ${selectedItem.restaurant || "Under 250"}`
    const encodedUrl = encodeURIComponent(shareUrl)
    const encodedText = encodeURIComponent(`${shareText} ${shareUrl}`)
    try {
      if (type === "copy") {
        await navigator.clipboard.writeText(shareUrl)
        toast.success("Link copied to clipboard!")
      } else if (type === "whatsapp") {
        window.open(`https://wa.me/?text=${encodedText}`, "_blank", "noopener,noreferrer")
      } else if (type === "telegram") {
        window.open(
          `https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(shareText)}`,
          "_blank",
          "noopener,noreferrer"
        )
      } else if (type === "sms") {
        window.location.href = `sms:?&body=${encodedText}`
      } else if (type === "email") {
        window.location.href = `mailto:?subject=${encodeURIComponent(selectedItem.name || "Dish")}&body=${encodedText}`
      }
      setShowShareOptions(false)
    } catch {
      toast.error("Failed to share link")
    }
  }

  const handleItemDetailTouchStart = (e) => {
    if (!showItemDetail) return
    itemDetailGestureRef.current = { startY: e.touches?.[0]?.clientY || 0, dragging: true }
  }

  const handleItemDetailTouchEnd = (e) => {
    if (!showItemDetail || !itemDetailGestureRef.current.dragging) return
    const endY = e.changedTouches?.[0]?.clientY || 0
    const deltaY = endY - itemDetailGestureRef.current.startY
    const contentScrollTop = itemDetailContentRef.current?.scrollTop || 0
    itemDetailGestureRef.current.dragging = false
    if (contentScrollTop <= 0 && deltaY > 80) closeItemDetail()
  }

  const handleItemDetailWheel = (e) => {
    if (!showItemDetail) return
    const contentScrollTop = itemDetailContentRef.current?.scrollTop || 0
    if (contentScrollTop <= 0 && e.deltaY < -20) closeItemDetail()
  }

  const shouldShowGrayscale = isOutOfService

  return (
    <div
      className={`under250-page relative w-full min-w-0 overflow-x-hidden min-h-screen bg-[#fcfcff] dark:bg-[#08080a] transition-colors duration-300 ${
        shouldShowGrayscale ? "grayscale opacity-75" : ""
      }`}
      style={{ paddingBottom: "88px" }}
    >
      <ShimmerStyles />

      {/* Decorative backdrop — clipped so it never causes page scroll */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-0 right-0 w-[min(45vw,280px)] aspect-square rounded-full bg-gradient-to-br from-orange-500/6 to-amber-500/0 blur-[100px]" />
        <div className="absolute bottom-[30%] left-0 w-[min(40vw,240px)] aspect-square rounded-full bg-gradient-to-tr from-[#FF6A00]/5 to-transparent blur-[100px]" />
      </div>

      <Under250Banner
        banners={banners}
        bannerImages={bannerImages}
        loadingBanner={loadingBanner}
        currentBannerIndex={currentBannerIndex}
        setCurrentBannerIndex={setCurrentBannerIndex}
        bannerShellRef={bannerShellRef}
      />

      <Under250CategoryRail
        categories={categories}
        activeCategory={activeCategory}
        onSelectCategory={setActiveCategory}
        loading={loadingCategories}
      />

      <Under250FilterBar
        selectedSort={selectedSort}
        sortOptions={sortOptions}
        under30MinsFilter={under30MinsFilter}
        onOpenSort={() => setShowSortPopup(true)}
        onToggleUnder30={() => setUnder30MinsFilter((prev) => !prev)}
        resultCount={sortedAndFilteredRestaurants.length}
      />

      {/* Restaurant list */}
      <div className="max-w-7xl mx-auto w-full min-w-0 space-y-8 py-6 overflow-hidden">
        {loadingRestaurants ? (
          <div className="space-y-8 px-4 sm:px-6 lg:px-8">
            {[0, 1, 2].map((i) => (
              <RestaurantSectionSkeleton key={i} />
            ))}
          </div>
        ) : sortedAndFilteredRestaurants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-orange-50 dark:bg-orange-950/20 flex items-center justify-center mb-4">
              <Tag className="h-8 w-8 text-[#FF6A00]/60" />
            </div>
            <h3 className="text-base font-extrabold text-gray-900 dark:text-white mb-1">
              No dishes found
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
              {under250Restaurants.length === 0
                ? `No restaurants with dishes under ${RUPEE_SYMBOL}250 in your area.`
                : "No restaurants match your filters. Try clearing them."}
            </p>
            {(activeCategory || under30MinsFilter || selectedSort) && (
              <button
                type="button"
                onClick={handleClearAll}
                className="mt-4 px-5 py-2.5 rounded-xl bg-[#FF6A00] text-white text-sm font-bold hover:bg-[#E85D04] transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          sortedAndFilteredRestaurants.map((restaurant, index) => (
            <Under250RestaurantSection
              key={restaurant.id}
              restaurant={restaurant}
              sectionIndex={index}
              quantities={quantities}
              disabled={shouldShowGrayscale}
              onItemClick={handleItemClick}
              onAdd={handleAddFromCard}
              onIncrement={handleIncrementFromCard}
              onDecrement={handleDecrementFromCard}
            />
          ))
        )}
      </div>

      <Under250SortSheet
        isOpen={showSortPopup}
        sortOptions={sortOptions}
        draftSelectedSort={draftSelectedSort}
        onSelectSort={setDraftSelectedSort}
        onClearAll={handleClearAll}
        onClose={() => setShowSortPopup(false)}
        onApply={handleApply}
      />

      <Under250ItemDetailSheet
        isOpen={showItemDetail}
        selectedItem={selectedItem}
        selectedItemImageIndex={selectedItemImageIndex}
        itemDetailQuantity={itemDetailQuantity}
        bookmarkedItems={bookmarkedItems}
        disabled={shouldShowGrayscale}
        contentRef={itemDetailContentRef}
        onClose={closeItemDetail}
        onTouchStart={handleItemDetailTouchStart}
        onTouchEnd={handleItemDetailTouchEnd}
        onWheel={handleItemDetailWheel}
        onBookmark={handleBookmarkClick}
        onShare={handleShareItem}
        onImagePrev={(len) => setSelectedItemImageIndex((prev) => (prev - 1 + len) % len)}
        onImageNext={(len) => setSelectedItemImageIndex((prev) => (prev + 1) % len)}
        onImageDot={setSelectedItemImageIndex}
        onQuantityDecrement={() => setItemDetailQuantity((prev) => Math.max(1, prev - 1))}
        onQuantityIncrement={() => setItemDetailQuantity((prev) => prev + 1)}
        onAddItem={(e) => {
          if (!shouldShowGrayscale) {
            updateItemQuantity(selectedItem, itemDetailQuantity, e)
            closeItemDetail()
          }
        }}
      />

      <Under250ShareSheet
        isOpen={showShareOptions}
        onClose={() => setShowShareOptions(false)}
        onShareOption={handleShareOption}
      />

      <AddToCartAnimation dynamicBottom={viewCartButtonBottom} />
    </div>
  )
}
