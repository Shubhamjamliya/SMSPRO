import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { createPortal } from "react-dom"
import { Link, useNavigate, useLocation } from "react-router-dom"
import { Plus, Minus, ArrowLeft, ChevronRight, Clock, MapPin, Phone, FileText, Utensils, Tag, Percent, Share2, ChevronUp, ChevronDown, X, Check, Settings, CreditCard, Wallet, Building2, Sparkles, Banknote, Zap, CheckCircle2, MessageCircle, Send, Mail, Copy } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import confetti from "canvas-confetti"

import AnimatedPage from "@food/components/user/AnimatedPage"
import { Button } from "@food/components/ui/button"
import { useCart } from "@food/context/CartContext"
import { useProfile } from "@food/context/ProfileContext"
import { useOrders } from "@food/context/OrdersContext"
import QuickSharedCart from "@food/pages/user/cart/QuickSharedCart"
import MixedSharedCart from "@food/pages/user/cart/MixedSharedCart"
import { useLocation as useUserLocation } from "@food/hooks/useLocation"
import { useZone } from "@food/hooks/useZone"
import { useLocationSelector } from "@food/components/user/UserLayout"
import { orderAPI, restaurantAPI, userAPI, foodCartAPI, API_ENDPOINTS } from "@food/api"
import { getCartSubtotal, getLineTotal, getLineUnitPrice } from "@food/utils/cartTotals"
import { API_BASE_URL } from "@food/api/config"
import { initRazorpayPayment, isFlutterWebView, handleFlutterRazorpayPayment, pollOrderPaidAfterDismiss } from "@food/utils/razorpay"
import { sanitizeOrderImage, sanitizeOrderNotes } from "@food/utils/orderPayload"
import { getMaxDeliveryTime, getHighestPricedItem } from "@food/utils/cartUtils"
import { toast } from "sonner"
import { getCompanyNameAsync } from "@common/utils/businessSettings"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { getRestaurantAvailabilityStatus } from "@food/utils/restaurantAvailability"
import { navigateToLogin } from "@core/utils/postLoginRedirect"
import {
  normalizeDeliverySpeedOptions,
  pickDefaultDeliverySpeedCode,
  extractDeliverySpeedOptionsFromResponse,
} from "@food/utils/deliverySpeedOptions"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import zoopSound from "@food/assets/audio/zomato_sms.mp3"
import CartItemRow from "@food/components/user/cart/CartItemRow"
import CartBillSummary from "@food/components/user/cart/CartBillSummary"
import CartCouponSection from "@food/components/user/cart/CartCouponSection"
import CartCouponSheet from "@food/components/user/cart/CartCouponSheet"
import CartAddressCard from "@food/components/user/cart/CartAddressCard"
const debugLog = (...args) => { }
const debugWarn = (...args) => { }
const debugError = (...args) => { }



// Removed hardcoded suggested items - now fetching approved addons from backend
// Coupons will be fetched from backend based on items in cart

/**
 * Format full address string from address object
 * @param {Object} address - Address object with street, additionalDetails, city, state, zipCode, or formattedAddress
 * @returns {String} Formatted address string
 */
const formatFullAddress = (address) => {
  if (!address) return ""

  const looksLikeLatLng = (s) => {
    if (!s) return false
    const v = String(s).trim()
    // Matches "12.34, 56.78" (lat,lng) with optional decimals/spaces
    return /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(v)
  }

  // Priority 1: Use formattedAddress if available (for live location addresses)
  if (address.formattedAddress && address.formattedAddress !== "Select location") {
    // If formattedAddress is still raw coordinates, don't show it as-is.
    // Fall back to composing from city/state/area instead.
    if (!looksLikeLatLng(address.formattedAddress)) {
      return address.formattedAddress
    }
  }

  // Priority 2: Build address from parts
  const addressParts = []
  if (address.street) addressParts.push(address.street)
  if (address.additionalDetails) addressParts.push(address.additionalDetails)
  if (address.city) addressParts.push(address.city)
  if (address.state) addressParts.push(address.state)
  if (address.zipCode) addressParts.push(address.zipCode)

  if (addressParts.length > 0) {
    return addressParts.join(', ')
  }

  // Priority 3: Use address field if available
  if (address.address && address.address !== "Select location") {
    return address.address
  }

  return ""
}

const RUPEE_SYMBOL = "\u20B9"
// Mirrors MAX_ADDON_QUANTITY in Backend shared/addonPricing.js
const MAX_ADDON_QUANTITY = 10
const CART_RECIPIENT_DETAILS_STORAGE_KEY = "food-cart-recipient-details-v1"
const CART_ORDER_NOTE_STORAGE_KEY = "food-cart-order-note-v1"
const mapOrderItem = (item) => ({
  itemId: item.itemId || item.id,
  name: item.name,
  type: item.type || (item.orderType === "quick" ? "quick" : "food"),
  sourceId:
    item.sourceId ||
    (item.orderType === "quick"
      ? item.quickStoreId || item.storeId || item.sellerId || item.restaurantId || ""
      : item.restaurantId),
  sourceName:
    item.sourceName ||
    (item.orderType === "quick"
      ? item.quickStoreName || item.storeName || "Quick Commerce"
      : item.restaurant || item.restaurantName || "Restaurant"),
  price: item.price,
  variantId: item.variantId || undefined,
  variantName: item.variantName || undefined,
  variantPrice: item.variantPrice || item.price,
  quantity: item.quantity || 1,
  image: sanitizeOrderImage(item.image || item.imageUrl || ""),
  isVeg: item.isVeg !== false,
  notes: sanitizeOrderNotes(item.notes || ""),
  preparationTime: item.preparationTime,
})

const normalizeOrderAddress = (address, { recipientName = "", recipientPhone = "" } = {}) => {
  if (!address || typeof address !== "object") return null

  const resolvedStreet =
    String(address.street || "").trim() ||
    String(address.address || "").trim() ||
    String(address.formattedAddress || "").trim()

  const resolvedCity =
    String(address.city || "").trim() ||
    String(address.area || "").trim()

  const resolvedState =
    String(address.state || "").trim() ||
    resolvedCity

  return {
    ...address,
    label: address.label || "Home",
    street: resolvedStreet,
    city: resolvedCity,
    state: resolvedState,
    zipCode: address.zipCode || address.postalCode || "",
    phone: recipientPhone || address.phone || "",
    name: recipientName || address.name || "",
    fullName: recipientName || address.fullName || address.name || "",
  }
}

export default function Cart() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const location = useLocation()
  const goBack = useAppBackNavigation()
  const orderSuccessAudioRef = useRef(null)
  const hasRestoredRecipientRef = useRef(false)
  const hasRestoredNoteRef = useRef(false)

  // Defensive check: Ensure CartProvider is available
  const cartContext = useCart() || {};
  const { cart = [], updateQuantity, addToCart, getCartCount = () => 0, clearCart, cleanCartForRestaurant, setCartCoupon, refreshCart, cartReady = true } = cartContext;
  const hasQuickItems = cart.some((item) => (item?.orderType || "food") === "quick")
  const hasFoodItems = cart.some((item) => (item?.orderType || "food") === "food")
  const isQuickCart = cart.length > 0 && cart.every((item) => (item?.orderType || "food") === "quick")

  const { getDefaultAddress, getDefaultPaymentMethod, setDefaultAddress, addresses, paymentMethods, userProfile, vegMode } = useProfile()
  const { createOrder } = useOrders()
  const { openLocationSelector } = useLocationSelector()
  const { location: currentLocation, loading: currentLocationLoading } = useUserLocation() // Get live location address

  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const [couponCode, setCouponCode] = useState("")
  const [manualCouponCode, setManualCouponCode] = useState("")
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("cash")
  const [showPaymentSheet, setShowPaymentSheet] = useState(false)
  const [walletBalance, setWalletBalance] = useState(0)
  const [isLoadingWallet, setIsLoadingWallet] = useState(false)
  const [note, setNote] = useState(() => {
    try {
      if (typeof window === "undefined") return ""
      const raw = window.localStorage.getItem(CART_ORDER_NOTE_STORAGE_KEY)
      if (!raw) return ""
      const stored = JSON.parse(raw)
      return String(stored?.note || "")
    } catch {
      return ""
    }
  })
  const [showNoteInput, setShowNoteInput] = useState(() => {
    try {
      if (typeof window === "undefined") return false
      const raw = window.localStorage.getItem(CART_ORDER_NOTE_STORAGE_KEY)
      if (!raw) return false
      const stored = JSON.parse(raw)
      const storedNote = String(stored?.note || "")
      return Boolean(stored?.showNoteInput) || storedNote.trim().length > 0
    } catch {
      return false
    }
  })
  const [showShareModal, setShowShareModal] = useState(false)
  const [sharePayload, setSharePayload] = useState(null)
  const [isEditingRecipient, setIsEditingRecipient] = useState(false)
  const [recipientDetails, setRecipientDetails] = useState({
    name: "",
    phone: "",
  })

  const [sendCutlery, setSendCutlery] = useState(true)
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [showBillDetails, setShowBillDetails] = useState(true)
  const [showPlacingOrder, setShowPlacingOrder] = useState(false)
  const [isScheduled, setIsScheduled] = useState(false)
  const [scheduledDate, setScheduledDate] = useState("")
  const [scheduledTime, setScheduledTime] = useState("")
  const [orderProgress, setOrderProgress] = useState(0)
  const [showOrderSuccess, setShowOrderSuccess] = useState(false)
  const [placedOrderId, setPlacedOrderId] = useState(null)
  const [placedOrderData, setPlacedOrderData] = useState(null)
  const [selectedAddressId, setSelectedAddressId] = useState(null)
  const [deliveryAddressMode, setDeliveryAddressMode] = useState(() => {
    try {
      if (typeof window === "undefined") return "saved"
      return localStorage.getItem("deliveryAddressMode") || "saved"
    } catch {
      return "saved"
    }
  })

  useEffect(() => {
    const audio = new Audio(zoopSound)
    audio.preload = "auto"
    audio.volume = 0.8
    orderSuccessAudioRef.current = audio

    return () => {
      if (orderSuccessAudioRef.current) {
        orderSuccessAudioRef.current.pause()
        orderSuccessAudioRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!showOrderSuccess || !orderSuccessAudioRef.current) return

    orderSuccessAudioRef.current.currentTime = 0
    orderSuccessAudioRef.current.play().catch((error) => {
      debugWarn("Order success sound blocked by browser:", error?.message || error)
    })
  }, [showOrderSuccess])

  // Restaurant and pricing state
  const [restaurantData, setRestaurantData] = useState(null)
  const [loadingRestaurant, setLoadingRestaurant] = useState(false)
  const [pricing, setPricing] = useState(null)
  const [loadingPricing, setLoadingPricing] = useState(false)

  // Addons state
  const [addons, setAddons] = useState([])
  const [loadingAddons, setLoadingAddons] = useState(false)
  const [updatingAddonId, setUpdatingAddonId] = useState(null)

  // Coupons state - fetched from backend
  const [availableCoupons, setAvailableCoupons] = useState([])
  const [loadingCoupons, setLoadingCoupons] = useState(false)
  const [userOrderCount, setUserOrderCount] = useState(0)
  const [showCouponSheet, setShowCouponSheet] = useState(false)
  const [showAddressPicker, setShowAddressPicker] = useState(false)
  const [applyingCouponCode, setApplyingCouponCode] = useState("")
  const couponsFetchedKeyRef = useRef("")

  // Fee settings from database (used for platform fee and GST fallback only)
  const [feeSettings, setFeeSettings] = useState({
    baseDistanceKm: 3,
    baseDeliveryFee: 25,
    perKmCharge: 10,
    platformFee: 5,
    gstRate: 5,
  })

  // Delivery speed tiers - loaded from admin Delivery Speed Options (public API).
  const [deliverySpeedOptions, setDeliverySpeedOptions] = useState([])
  const [loadingDeliverySpeedOptions, setLoadingDeliverySpeedOptions] = useState(true)
  const [selectedDeliveryFleet, setSelectedDeliveryFleet] = useState(null)

  const applyDeliverySpeedOptions = useCallback((rawOptions) => {
    const options = normalizeDeliverySpeedOptions(rawOptions)
    if (options.length === 0) return

    setDeliverySpeedOptions(options)
    setSelectedDeliveryFleet((prev) => {
      if (prev && options.some((option) => option.code === prev)) return prev
      return pickDefaultDeliverySpeedCode(options)
    })
  }, [])


  const availableTimeSlots = useMemo(() => {
    if (!isScheduled || !scheduledDate || !restaurantData) return []

    try {
      const targetDate = new Date(scheduledDate)
      const status = getRestaurantAvailabilityStatus(restaurantData, targetDate)

      let openingHour = 9
      let closingHour = 22

      if (status.openingTime) {
        const [h] = status.openingTime.split(':')
        openingHour = parseInt(h, 10)
      }

      if (status.closingTime) {
        const [h] = status.closingTime.split(':')
        closingHour = parseInt(h, 10)
      }

      if (closingHour < openingHour) {
        closingHour += 24 // Handle overnight slots
      }

      const slots = []
      const now = new Date()
      // Fix timezone date comparison by comparing date strings YYYY-MM-DD
      const nowStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0]
      const targetStr = scheduledDate
      const isToday = targetStr === nowStr
      const currentHour = now.getHours()

      for (let h = openingHour; h <= closingHour; h++) {
        const actualHour = h % 24
        // Skip past hours if today. Add 1 hour buffer so they can't order right at the boundary
        if (isToday && h <= currentHour) continue

        const period = actualHour >= 12 ? 'PM' : 'AM'
        const display12 = actualHour % 12 || 12
        const timeString = `${String(actualHour).padStart(2, '0')}:00`
        const displayString = `${display12}:00 ${period}`

        slots.push({ value: timeString, label: displayString })
      }

      return slots
    } catch {
      return []
    }
  }, [isScheduled, scheduledDate, restaurantData])

  // Reset scheduledTime if it's no longer valid in the new slots
  useEffect(() => {
    if (isScheduled && availableTimeSlots.length > 0) {
      const isValid = availableTimeSlots.some(slot => slot.value === scheduledTime)
      if (!isValid) {
        setScheduledTime(availableTimeSlots[0].value)
      }
    } else if (!isScheduled) {
      setScheduledDate("")
      setScheduledTime("")
    }
  }, [isScheduled, availableTimeSlots, scheduledTime])

  const cartCount = getCartCount()
  const getAddressId = (address) => address?.id || address?._id || null
  const normalizeAddressLabel = (label) => {
    if (!label) return ""
    const value = String(label).trim().toLowerCase()
    if (value === "work" || value === "office") return "office"
    if (value === "home") return "home"
    if (value === "other") return "other"
    return value
  }
  const getDisplayAddressLabel = (label) => {
    const normalized = normalizeAddressLabel(label)
    if (normalized === "office") return "Work"
    if (normalized === "home") return "Home"
    if (normalized === "other") return "Other"
    return label || "Saved address"
  }
  const sanitizeRecipientPhone = (value) => String(value || "").replace(/[^\d+]/g, "").slice(0, 14)
  const savedAddress = getDefaultAddress()
  const selectedAddress = addresses.find((addr) => getAddressId(addr) && getAddressId(addr) === selectedAddressId)

  const currentLocationAddress = useMemo(() => {
    // `LocationSelectorOverlay` updates backend + localStorage, but Cart's live hook might lag.
    // So we fall back to `localStorage.userLocation` when `currentLocation` doesn't have a usable payload yet.
    let locFromStorage = null
    try {
      const storedRaw = localStorage.getItem("userLocation")
      locFromStorage = storedRaw ? JSON.parse(storedRaw) : null
    } catch {
      locFromStorage = null
    }

    const loc = currentLocation?.latitude && currentLocation?.longitude ? currentLocation : locFromStorage
    if (!loc?.latitude || !loc?.longitude) return null

    const formattedAddress = loc?.formattedAddress || loc?.address || ""
    if (!formattedAddress || formattedAddress === "Select location") return null

    return {
      // Backend deliveryAddressSchema expects label in ['Home','Office','Other'].
      label: "Home",
      formattedAddress,
      address: formattedAddress,
      street: loc?.street || loc?.address || loc?.area || "Current Location",
      additionalDetails: loc?.area || "",
      city: loc?.city || loc?.area || "Current City",
      state: loc?.state || loc?.city || "Current State",
      zipCode: loc?.postalCode || loc?.zipCode || "",
      phone: userProfile?.phone || "",
      location: {
        type: "Point",
        coordinates: [loc.longitude, loc.latitude], // [lng, lat]
      },
    }
  }, [
    currentLocation?.latitude,
    currentLocation?.longitude,
    currentLocation?.formattedAddress,
    currentLocation?.address,
    currentLocation?.street,
    currentLocation?.area,
    currentLocation?.city,
    currentLocation?.state,
    currentLocation?.postalCode,
    currentLocation?.zipCode,
    userProfile?.phone,
    // Re-evaluate derived address when mode changes (overlay closes -> Cart rerenders).
    deliveryAddressMode,
  ])

  const defaultAddress = useMemo(() => {
    return deliveryAddressMode === "current"
      ? currentLocationAddress || selectedAddress || savedAddress || null
      : selectedAddress || savedAddress || currentLocationAddress || null
  }, [deliveryAddressMode, currentLocationAddress, selectedAddress, savedAddress])

  const hasSavedAddress = Boolean(defaultAddress && formatFullAddress(defaultAddress))
  const recipientName = String(recipientDetails.name || "").trim() || userProfile?.name || "Your Name"
  const recipientPhone = sanitizeRecipientPhone(recipientDetails.phone || "") || userProfile?.phone || ""
  const selectedAddressCoordinates = defaultAddress?.location?.coordinates
  const zoneLocation = selectedAddressCoordinates?.length === 2
    ? {
      latitude: selectedAddressCoordinates[1],
      longitude: selectedAddressCoordinates[0]
    }
    : currentLocation
  const { zoneId } = useZone(zoneLocation) // Prefer selected/saved address zone
  const defaultPayment = getDefaultPaymentMethod()

  useEffect(() => {
    // Sync delivery mode from overlay/localStorage changes.
    // No dependency array: overlay open/close re-renders Cart via provider state update,
    // even when GPS coords don't move enough to update `currentLocation`.
    try {
      const mode = localStorage.getItem("deliveryAddressMode") || "saved"
      setDeliveryAddressMode((prev) => (prev === mode ? prev : mode))
    } catch {
      // ignore
    }
  })

  useEffect(() => {
    if (typeof window === "undefined") return

    try {
      const raw = window.localStorage.getItem(CART_RECIPIENT_DETAILS_STORAGE_KEY)
      if (!raw) {
        hasRestoredRecipientRef.current = true
        return
      }

      const stored = JSON.parse(raw)
      setRecipientDetails({
        name: stored?.name || "",
        phone: sanitizeRecipientPhone(stored?.phone || ""),
      })
      setIsEditingRecipient(Boolean(stored?.isEditingRecipient))
    } catch {
      setRecipientDetails({ name: "", phone: "" })
      setIsEditingRecipient(false)
    } finally {
      hasRestoredRecipientRef.current = true
    }
  }, [])

  useEffect(() => {
    setRecipientDetails((prev) => ({
      name: prev.name || userProfile?.name || "",
      phone: prev.phone || userProfile?.phone || "",
    }))
  }, [userProfile?.name, userProfile?.phone])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!hasRestoredRecipientRef.current) return

    try {
      window.localStorage.setItem(
        CART_RECIPIENT_DETAILS_STORAGE_KEY,
        JSON.stringify({
          name: recipientDetails.name || "",
          phone: sanitizeRecipientPhone(recipientDetails.phone || ""),
          isEditingRecipient,
        })
      )
    } catch {
      // Ignore storage errors and keep cart flow working.
    }
  }, [recipientDetails, isEditingRecipient])

  useEffect(() => {
    hasRestoredNoteRef.current = true
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!hasRestoredNoteRef.current) return

    try {
      window.localStorage.setItem(
        CART_ORDER_NOTE_STORAGE_KEY,
        JSON.stringify({
          note,
          showNoteInput,
        })
      )
    } catch {
      // Ignore storage errors and keep note flow working.
    }
  }, [note, showNoteInput])

  useEffect(() => {
    if (deliveryAddressMode === "current") {
      setSelectedAddressId(null)
    }
  }, [deliveryAddressMode])

  useEffect(() => {
    const defaultId = getAddressId(savedAddress)
    if (deliveryAddressMode !== "current" && !selectedAddressId && defaultId) {
      setSelectedAddressId(defaultId)
    }
  }, [savedAddress, selectedAddressId, deliveryAddressMode])

  // Get restaurant ID from cart or restaurant data
  // Priority: restaurantData > cart[0].restaurantId
  // DO NOT use cart[0].restaurant as slug fallback - it creates wrong slugs
  const restaurantId = cart.length > 0
    ? (restaurantData?._id || restaurantData?.restaurantId || cart[0]?.restaurantId || null)
    : null

  // Stable restaurant ID for addons fetch (memoized to prevent dependency array issues)
  // Prefer restaurantData IDs (more reliable) over slug from cart
  const restaurantIdForAddons = useMemo(() => {
    // Only use restaurantData if it's loaded, otherwise wait
    if (restaurantData) {
      return restaurantData._id || restaurantData.restaurantId || null
    }
    // If restaurantData is not loaded yet, return null to wait
    return null
  }, [restaurantData])



  // Lock body scroll and scroll to top when any full-screen modal opens
  useEffect(() => {
    if (showPlacingOrder || showOrderSuccess) {
      // Lock body scroll
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
      document.body.style.top = `-${window.scrollY}px`

      // Scroll window to top
      window.scrollTo({ top: 0, behavior: 'instant' })
    } else {
      // Restore body scroll
      const scrollY = document.body.style.top
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
      document.body.style.top = ''
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1)
      }
    }

    return () => {
      // Cleanup on unmount
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
      document.body.style.top = ''
    }
  }, [showPlacingOrder, showOrderSuccess])

  // Fetch restaurant data when cart has items
  useEffect(() => {
    const fetchRestaurantData = async () => {
      if (isQuickCart) {
        setRestaurantData(null)
        setLoadingRestaurant(false)
        return
      }

      if (cart.length === 0) {
        setRestaurantData(null)
        return
      }

      // If we already have restaurantData, don't fetch again
      if (restaurantData) {
        return
      }

      setLoadingRestaurant(true)

      // Strategy 1: Try using restaurantId from cart if available
      if (cart[0]?.restaurantId) {
        try {
          const cartRestaurantId = cart[0].restaurantId;
          const cartRestaurantName = cart[0].restaurant;

          debugLog("?? Fetching restaurant data by restaurantId from cart:", cartRestaurantId)
          const response = await restaurantAPI.getRestaurantById(cartRestaurantId)
          const data = response?.data?.data?.restaurant || response?.data?.restaurant

          if (data) {
            // CRITICAL: Validate that fetched restaurant matches cart items
            const fetchedRestaurantId = data.restaurantId || data._id?.toString();
            const fetchedRestaurantName = data.name;

            // Check if restaurantId matches
            const restaurantIdMatches =
              fetchedRestaurantId === cartRestaurantId ||
              data._id?.toString() === cartRestaurantId ||
              data.restaurantId === cartRestaurantId;

            // Check if restaurant name matches (if available in cart)
            const restaurantNameMatches =
              !cartRestaurantName ||
              fetchedRestaurantName?.toLowerCase().trim() === cartRestaurantName.toLowerCase().trim();

            if (!restaurantIdMatches) {
              debugError('? CRITICAL: Fetched restaurant ID does not match cart restaurantId!', {
                cartRestaurantId: cartRestaurantId,
                fetchedRestaurantId: fetchedRestaurantId,
                fetched_id: data._id?.toString(),
                fetched_restaurantId: data.restaurantId,
                cartRestaurantName: cartRestaurantName,
                fetchedRestaurantName: fetchedRestaurantName
              });
              // Don't set restaurantData if IDs don't match - this prevents wrong restaurant assignment
              setLoadingRestaurant(false);
              return;
            }

            if (!restaurantNameMatches) {
              debugWarn('?? WARNING: Restaurant name mismatch:', {
                cartRestaurantName: cartRestaurantName,
                fetchedRestaurantName: fetchedRestaurantName
              });
              // Still proceed but log warning
            }

            debugLog("? Restaurant data loaded from cart restaurantId:", {
              _id: data._id,
              restaurantId: data.restaurantId,
              name: data.name,
              cartRestaurantId: cartRestaurantId,
              cartRestaurantName: cartRestaurantName
            })
            setRestaurantData(data)
            setLoadingRestaurant(false)
            return
          }
        } catch (error) {
          debugWarn("?? Failed to fetch by cart restaurantId, trying fallback...", error)
        }
      }

      // Strategy 2: If no restaurantId in cart, search by restaurant name
      if (cart[0]?.restaurant && !restaurantData) {
        try {
          debugLog("?? Searching restaurant by name:", cart[0].restaurant)
          const searchResponse = await restaurantAPI.getRestaurants({ limit: 100 })
          const restaurants = searchResponse?.data?.data?.restaurants || searchResponse?.data?.data || []
          debugLog("?? Fetched", restaurants.length, "restaurants for name search")

          // Try exact match first
          let matchingRestaurant = restaurants.find(r =>
            r.name?.toLowerCase().trim() === cart[0].restaurant?.toLowerCase().trim()
          )

          // If no exact match, try partial match
          if (!matchingRestaurant) {
            debugLog("?? No exact match, trying partial match...")
            matchingRestaurant = restaurants.find(r =>
              r.name?.toLowerCase().includes(cart[0].restaurant?.toLowerCase().trim()) ||
              cart[0].restaurant?.toLowerCase().trim().includes(r.name?.toLowerCase())
            )
          }

          if (matchingRestaurant) {
            // CRITICAL: Validate that the found restaurant matches cart items
            const cartRestaurantName = cart[0]?.restaurant?.toLowerCase().trim();
            const foundRestaurantName = matchingRestaurant.name?.toLowerCase().trim();

            if (cartRestaurantName && foundRestaurantName && cartRestaurantName !== foundRestaurantName) {
              debugError("? CRITICAL: Restaurant name mismatch!", {
                cartRestaurantName: cart[0]?.restaurant,
                foundRestaurantName: matchingRestaurant.name,
                cartRestaurantId: cart[0]?.restaurantId,
                foundRestaurantId: matchingRestaurant.restaurantId || matchingRestaurant._id
              });
              // Don't set restaurantData if names don't match - this prevents wrong restaurant assignment
              setLoadingRestaurant(false);
              return;
            }

            debugLog("? Found restaurant by name:", {
              name: matchingRestaurant.name,
              _id: matchingRestaurant._id,
              restaurantId: matchingRestaurant.restaurantId,
              slug: matchingRestaurant.slug,
              cartRestaurantName: cart[0]?.restaurant
            })
            setRestaurantData(matchingRestaurant)
            setLoadingRestaurant(false)
            return
          } else {
            debugWarn("?? Restaurant not found even by name search. Searched in", restaurants.length, "restaurants")
            if (restaurants.length > 0) {
              debugLog("?? Available restaurant names:", restaurants.map(r => r.name).slice(0, 10))
            }
          }
        } catch (searchError) {
          debugWarn("?? Error searching restaurants by name:", searchError)
        }
      }

      // If all strategies fail, set to null
      setRestaurantData(null)
      setLoadingRestaurant(false)
    }

    fetchRestaurantData()
  }, [cart.length, cart[0]?.restaurantId, cart[0]?.restaurant, isQuickCart])

  // Fetch approved addons for the restaurant
  useEffect(() => {
    const fetchAddonsWithId = async (idToUse) => {

      debugLog("?? Addons fetch - Using ID:", {
        restaurantData: restaurantData ? {
          _id: restaurantData._id,
          restaurantId: restaurantData.restaurantId,
          name: restaurantData.name
        } : 'Not loaded',
        cartRestaurantId: restaurantId,
        idToUse: idToUse
      })

      // Convert to string for validation
      const idString = String(idToUse)
      debugLog("?? Restaurant ID string:", idString, "Type:", typeof idString, "Length:", idString.length)

      // Validate ID format (should be ObjectId or restaurantId format)
      const isValidIdFormat = /^[a-zA-Z0-9\-_]+$/.test(idString) && idString.length >= 3

      if (!isValidIdFormat) {
        debugWarn("?? Restaurant ID format invalid:", idString)
        setAddons([])
        return
      }

      try {
        setLoadingAddons(true)
        debugLog("?? Fetching addons for restaurant ID:", idString)
        const response = await restaurantAPI.getAddonsByRestaurantId(idString)
        debugLog("? Addons API response received:", response?.data)
        debugLog("?? Response structure:", {
          success: response?.data?.success,
          data: response?.data?.data,
          addons: response?.data?.data?.addons,
          directAddons: response?.data?.addons
        })

        const data = response?.data?.data?.addons || response?.data?.addons || []
        debugLog("?? Fetched addons count:", data.length)
        debugLog("?? Fetched addons data:", JSON.stringify(data, null, 2))

        if (data.length === 0) {
          debugWarn("?? No addons returned from API. Response:", response?.data)
        } else {
          debugLog("? Successfully fetched", data.length, "addons:", data.map(a => a.name))
        }

        setAddons(data)
      } catch (error) {
        // Log error for debugging
        debugError("? Addons fetch error:", {
          code: error.code,
          status: error.response?.status,
          message: error.message,
          url: error.config?.url,
          data: error.response?.data
        })
        // Silently handle network errors and 404 errors
        // Network errors (ERR_NETWORK) happen when backend is not running - this is OK for development
        // 404 errors mean restaurant might not have addons or restaurant not found - also OK
        if (error.code !== 'ERR_NETWORK' && error.response?.status !== 404) {
          debugError("Error fetching addons:", error)
        }
        // Continue with cart even if addons fetch fails
        setAddons([])
      } finally {
        setLoadingAddons(false)
      }
    }

    const fetchAddons = async () => {
      if (isQuickCart) {
        setAddons([])
        setLoadingAddons(false)
        return
      }

      if (cart.length === 0) {
        setAddons([])
        return
      }

      // Wait for restaurantData to be loaded (including fallback search)
      if (loadingRestaurant) {
        debugLog("? Waiting for restaurantData to load (including fallback search)...")
        return
      }

      // Must have restaurantData to fetch addons
      if (!restaurantData) {
        debugWarn("?? No restaurantData available for addons fetch")
        setAddons([])
        return
      }

      // Use restaurantData ID (most reliable)
      const idToUse = restaurantData._id || restaurantData.restaurantId
      if (!idToUse) {
        debugWarn("?? No valid restaurant ID in restaurantData")
        setAddons([])
        return
      }

      debugLog("? Using restaurantData ID for addons:", idToUse)
      fetchAddonsWithId(idToUse)
    }

    fetchAddons()
  }, [restaurantData, cart.length, loadingRestaurant, isQuickCart])

  // Fetch coupons once per restaurant + unique item-id set (not on every qty change).
  const cartCouponItemsKey = useMemo(() => {
    if (isQuickCart) return "quick"
    const ids = cart
      .map((item) => String(item.itemId || item.id || "").trim())
      .filter(Boolean)
    return `${restaurantId || ""}::${[...new Set(ids)].sort().join(",")}`
  }, [cart, restaurantId, isQuickCart])

  useEffect(() => {
    const fetchCouponsForCartItems = async () => {
      if (isQuickCart) {
        setAvailableCoupons([])
        setLoadingCoupons(false)
        couponsFetchedKeyRef.current = cartCouponItemsKey
        return
      }

      if (cart.length === 0 || !restaurantId) {
        setAvailableCoupons([])
        couponsFetchedKeyRef.current = ""
        return
      }

      if (couponsFetchedKeyRef.current === cartCouponItemsKey) {
        return
      }

      debugLog(`[CART-COUPONS] Fetching coupons for ${cart.length} items in cart`)
      setLoadingCoupons(true)

      const allCoupons = []
      const uniqueCouponCodes = new Set()
      const itemIds = [...new Set(
        cart.map((item) => item.itemId || item.id).filter(Boolean),
      )]

      for (const couponItemId of itemIds) {
        const cartItem = cart.find((item) => (item.itemId || item.id) === couponItemId)
        try {
          debugLog(`[CART-COUPONS] Fetching coupons for itemId: ${couponItemId}`)
          const response = await restaurantAPI.getCouponsByItemIdPublic(restaurantId, couponItemId)

          if (response?.data?.success && response?.data?.data?.coupons) {
            const coupons = response.data.data.coupons
            coupons.forEach((coupon) => {
              if (!uniqueCouponCodes.has(coupon.couponCode)) {
                uniqueCouponCodes.add(coupon.couponCode)
                const isPct = coupon.discountType === "percentage"
                const discountValue = Number(coupon.discountValue ?? coupon.discountPercentage ?? coupon.originalPrice ?? 0) || 0
                const fixedDiscount = isPct
                  ? 0
                  : Math.max(0, Number(coupon.originalPrice || discountValue || 0) - Number(coupon.discountedPrice || 0))
                allCoupons.push({
                  code: coupon.couponCode,
                  discount: isPct ? discountValue : fixedDiscount,
                  discountPercentage: isPct ? (Number(coupon.discountPercentage) || discountValue) : 0,
                  discountDisplay: isPct
                    ? `${Number(coupon.discountPercentage) || discountValue}% OFF`
                    : `${RUPEE_SYMBOL}${fixedDiscount} OFF`,
                  minOrder: coupon.minOrderValue || coupon.minOrder || 0,
                  description: isPct
                    ? `${Number(coupon.discountPercentage) || discountValue}% OFF with '${coupon.couponCode}'`
                    : `Save ${RUPEE_SYMBOL}${fixedDiscount} with '${coupon.couponCode}'`,
                  originalPrice: coupon.originalPrice,
                  discountedPrice: coupon.discountedPrice,
                  customerGroup: coupon.customerGroup || "all",
                  isGlobalCoupon: Boolean(coupon.isGlobalCoupon),
                  freeDelivery: Boolean(coupon.freeDelivery),
                  maxDiscount: coupon.maxDiscount != null ? Number(coupon.maxDiscount) : null,
                  startDate: coupon.startDate || null,
                  endDate: coupon.endDate || null,
                  terms: coupon.terms || coupon.termsAndConditions || "",
                  restaurantEligible: coupon.restaurantEligible,
                  restaurantNotEligible: coupon.restaurantNotEligible,
                  categoryRestricted: coupon.categoryRestricted,
                  categoryEligible: coupon.categoryEligible,
                  alreadyUsed: coupon.alreadyUsed || coupon.isUsed,
                  eligible: coupon.eligible,
                  ineligibilityReason: coupon.ineligibilityReason || coupon.reason || "",
                  itemId: couponItemId,
                  itemName: cartItem?.name,
                })
              }
            })
          }
        } catch (error) {
          debugError(`[CART-COUPONS] Error fetching coupons for item ${couponItemId}:`, error)
        }
      }

      debugLog(`[CART-COUPONS] Total unique coupons found: ${allCoupons.length}`, allCoupons)
      setAvailableCoupons(allCoupons)
      couponsFetchedKeyRef.current = cartCouponItemsKey
      setLoadingCoupons(false)
    }

    fetchCouponsForCartItems()
    // Intentionally omit availableCoupons from deps — guarded by couponsFetchedKeyRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartCouponItemsKey, isQuickCart, restaurantId])

  // Calculate pricing from backend whenever cart, address, or coupon changes.
  // Debounced + aborted to avoid rapid-click / StrictMode duplicate storms.
  useEffect(() => {
    if (!cartReady) return undefined

    let cancelled = false
    const timer = setTimeout(async () => {
      if (cart.length === 0 || !hasSavedAddress || (hasQuickItems && hasFoodItems) || isQuickCart) {
        if (!cancelled) setPricing(null)
        return
      }

      try {
        if (!cancelled) setLoadingPricing(true)

        const resolvedCouponCode = appliedCoupon?.code || couponCode || undefined

        const response = await orderAPI.calculateOrder({
          orderType: "food",
          useCart: true,
          restaurantId: restaurantData?.restaurantId || restaurantData?._id || restaurantId || undefined,
          address: defaultAddress,
          couponCode: resolvedCouponCode,
          deliveryFleet: selectedDeliveryFleet || undefined,
        })

        if (cancelled) return

        if (response?.data?.success && response?.data?.data?.pricing) {
          const nextPricing = response.data.data.pricing
          setPricing(nextPricing)

          if (Array.isArray(nextPricing.deliverySpeedOptions) && nextPricing.deliverySpeedOptions.length > 0) {
            applyDeliverySpeedOptions(extractDeliverySpeedOptionsFromResponse({
              data: { success: true, data: { options: nextPricing.deliverySpeedOptions } },
            }))
          }

          const backendApplied = response.data.data.pricing.appliedCoupon
          if (backendApplied) {
            setAppliedCoupon((prev) => {
              if (prev?.code === backendApplied.code) {
                return prev
              }
              const coupon = availableCoupons.find(c => c.code === backendApplied.code)
              return coupon || {
                code: backendApplied.code,
                discount: backendApplied.discount || 0,
                freeDelivery: Boolean(backendApplied.freeDelivery),
              }
            })
            setCouponCode((prev) =>
              prev === (backendApplied.code || "") ? prev : (backendApplied.code || ""),
            )
          } else if (appliedCoupon || couponCode) {
            setAppliedCoupon(null)
            setCouponCode("")
          }
        }
      } catch (error) {
        if (cancelled) return
        if (error.code !== 'ERR_NETWORK' && error.response?.status !== 404) {
          debugError("Error calculating pricing:", error)
        }
        setPricing(null)
      } finally {
        if (!cancelled) setLoadingPricing(false)
      }
    }, 280)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [cart, cartReady, defaultAddress, appliedCoupon, couponCode, restaurantId, selectedDeliveryFleet, applyDeliverySpeedOptions, hasSavedAddress, hasQuickItems, hasFoodItems, isQuickCart, restaurantData, availableCoupons])

  // Fetch wallet balance
  useEffect(() => {
    const fetchWalletBalance = async () => {
      try {
        setIsLoadingWallet(true)
        const response = await userAPI.getWallet()
        if (response?.data?.success && response?.data?.data?.wallet) {
          setWalletBalance(response.data.data.wallet.balance || 0)
        }
      } catch (error) {
        debugError("Error fetching wallet balance:", error)
        setWalletBalance(0)
      } finally {
        setIsLoadingWallet(false)
      }
    }
    fetchWalletBalance()
  }, [])

  // Fetch user order count (used for first-time coupon eligibility)
  useEffect(() => {
    const fetchOrderCount = async () => {
      try {
        const response = await userAPI.getOrders({ page: 1, limit: 1 })
        if (response?.data?.success) {
          const totalOrders = response?.data?.data?.pagination?.total || 0
          setUserOrderCount(totalOrders)
        }
      } catch (error) {
        debugError("Error fetching user order count:", error)
        setUserOrderCount(0)
      }
    }

    fetchOrderCount()
  }, [])

  // Fetch delivery speed options from admin settings (public API).
  useEffect(() => {
    const fetchDeliverySpeedOptions = async () => {
      try {
        setLoadingDeliverySpeedOptions(true)

        const endpoints = [
          () => orderAPI.getPublicDeliverySpeedOptions(),
          () => orderAPI.getPublicFeeSummary(),
        ]

        for (const loadOptions of endpoints) {
          try {
            const response = await loadOptions()
            if (!response?.data?.success) continue

            const options = extractDeliverySpeedOptionsFromResponse(response)
            if (options.length > 0) {
              applyDeliverySpeedOptions(options)
              return
            }
          } catch (innerError) {
            debugError("Delivery speed options fetch attempt failed:", innerError)
          }
        }
      } catch (error) {
        debugError("Error fetching delivery speed options:", error)
      } finally {
        setLoadingDeliverySpeedOptions(false)
      }
    }

    const handleFocus = () => {
      fetchDeliverySpeedOptions()
    }

    fetchDeliverySpeedOptions()
    window.addEventListener("focus", handleFocus)
    const intervalId = setInterval(fetchDeliverySpeedOptions, 30000)

    return () => {
      window.removeEventListener("focus", handleFocus)
      clearInterval(intervalId)
    }
  }, [applyDeliverySpeedOptions])

  // Fetch platform fee / GST fallback for cart totals.
  useEffect(() => {
    const fetchFeeSettings = async () => {
      try {
        const response = await orderAPI.getPublicFeeSummary()
        const data = response?.data?.data
        if (!response?.data?.success || !data) return

        setFeeSettings((prev) => ({
          ...prev,
          platformFee: data.platformFee ?? prev.platformFee,
          gstRate: data.gstRate ?? prev.gstRate,
        }))
      } catch (error) {
        debugError('Error fetching fee settings:', error)
      }
    }

    fetchFeeSettings()
  }, [])

  // Use backend pricing if available, otherwise fallback to database fee settings
  // ── "Complete your meal" extras ────────────────────────────────────────────
  // An add-on belongs to a cart line, so the carousel targets the first food
  // line. Quantities are read back off that line, which is why the buttons can
  // show a live count instead of a blind "+".
  const addonTargetLine = useMemo(
    () => cart.find((line) => (line?.orderType || "food") === "food") || null,
    [cart],
  )

  const getAddonQuantity = useCallback(
    (addonId) => {
      const match = (addonTargetLine?.addons || []).find(
        (entry) => String(entry.addonId) === String(addonId),
      )
      return Number(match?.quantity) || 0
    },
    [addonTargetLine],
  )

  const changeAddonQuantity = useCallback(
    async (addon, delta) => {
      if (!addonTargetLine) {
        toast.error("Add a dish first, then add extras to it.")
        return
      }

      const addonId = String(addon.id || addon._id)
      const existing = (addonTargetLine.addons || []).map((entry) => ({
        addonId: String(entry.addonId),
        quantity: Number(entry.quantity) || 1,
      }))
      const current = existing.find((entry) => entry.addonId === addonId)
      const nextQuantity = (current?.quantity || 0) + delta

      if (nextQuantity > MAX_ADDON_QUANTITY) {
        toast.error(`You can add at most ${MAX_ADDON_QUANTITY} ${addon.name}`)
        return
      }

      const nextAddons =
        nextQuantity <= 0
          ? existing.filter((entry) => entry.addonId !== addonId)
          : current
            ? existing.map((entry) =>
                entry.addonId === addonId ? { ...entry, quantity: nextQuantity } : entry,
              )
            : [...existing, { addonId, quantity: nextQuantity }]

      try {
        setUpdatingAddonId(addonId)
        const response = await foodCartAPI.updateItem(
          addonTargetLine.lineItemId || addonTargetLine.id,
          { addons: nextAddons },
        )
        if (response?.data?.success) {
          await refreshCart()
          if (nextQuantity <= 0) toast.success(`${addon.name} removed`)
        } else {
          toast.error(response?.data?.message || "Could not update this extra")
        }
      } catch (error) {
        toast.error(error?.response?.data?.message || "Could not update this extra")
      } finally {
        setUpdatingAddonId(null)
      }
    },
    [addonTargetLine, refreshCart],
  )

  // Backend pricing is authoritative; the local fallback (no address yet, or the
  // calculate call hasn't resolved) must also count add-ons or the bill jumps
  // once pricing lands.
  const subtotal = pricing?.subtotal ?? getCartSubtotal(cart)
  const fallbackDeliveryFee = (() => {
    if (appliedCoupon?.freeDelivery) {
      return 0
    }

    return Number(feeSettings.baseDeliveryFee || 0)
  })()
  const deliveryFee =
    pricing?.deliveryFee !== undefined && pricing?.deliveryFee !== null
      ? Number(pricing.deliveryFee || 0)
      : fallbackDeliveryFee
  const deliveryFeeBreakdown = pricing?.deliveryFeeBreakdown || null
  const hasDistanceDeliveryBreakdown =
    deliveryFeeBreakdown?.source === "distance" &&
    Number.isFinite(Number(deliveryFeeBreakdown?.distanceKm))
  const deliveryFeeBreakdownText = hasDistanceDeliveryBreakdown
    ? `Distance ${Number(deliveryFeeBreakdown.distanceKm).toFixed(1)} km: ${RUPEE_SYMBOL}${Number(deliveryFeeBreakdown.basePayout || 0).toFixed(0)} base + ${Number(deliveryFeeBreakdown.extraDistanceKm || 0).toFixed(1)} km x ${RUPEE_SYMBOL}${Number(deliveryFeeBreakdown.commissionPerKm || 0).toFixed(0)}`
    : null
  const platformFee = pricing?.platformFee ?? feeSettings.platformFee
  const gstCharges = pricing?.tax ?? Math.round(subtotal * (feeSettings.gstRate / 100))
  const discount = pricing?.discount ?? (appliedCoupon ? Math.min(appliedCoupon.discount, subtotal * 0.5) : 0)
  const deliverySpeedFee = Number(pricing?.deliverySpeedFee || 0)
  const selectedDeliverySpeedOption =
    pricing?.deliverySpeed || deliverySpeedOptions.find((option) => option.code === selectedDeliveryFleet) || null
  // Server-computed packaging charge (admin per-order or restaurant per-item —
  // see food fee settings). Always comes from the order calculate API.
  const packagingFee = Number(pricing?.packagingFee ?? 0)
  // Who owns the packaging charge, so the breakdown can name it accurately.
  const packagingMode = String(pricing?.packagingMode ?? "")
  const totalBeforeDiscount = subtotal + deliveryFee + deliverySpeedFee + platformFee + gstCharges + packagingFee
  const total = pricing?.total ?? (totalBeforeDiscount - discount)

  // Calculate other platform total for comparison
  // Compare-at total. Add-ons cost the same either way, so they ride along here
  // too — otherwise the "you save" figure would silently include add-on money.
  const otherPlatformSubtotal = cart.reduce((sum, item) => {
    const itemOtherPrice = Number(item.otherPrice || item.price || 0);
    const unit = itemOtherPrice + (getLineUnitPrice(item) - Number(item.price || 0));
    return sum + unit * (item.quantity || 1);
  }, 0);

  const otherPlatformSavings = Math.max(0, otherPlatformSubtotal - subtotal);

  const savings = pricing?.savings ?? Math.max(0, totalBeforeDiscount - total)
  const isUserCodAllowed = userProfile?.isCodAllowed !== false
  const paymentOptions = [
    {
      id: 'razorpay',
      name: 'Online Payment',
      description: 'UPI, Cards, Netbanking',
      icon: <Zap className="w-5 h-5" />,
      color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
      selectedColor: 'bg-emerald-500 text-white',
      badge: 'SECURE'
    },
    {
      id: 'wallet',
      name: 'Quick Wallet',
      description: 'Pay from your wallet',
      icon: <Wallet className="w-5 h-5" />,
      color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
      selectedColor: 'bg-blue-500 text-white',
      subInfo: `Bal: ${RUPEE_SYMBOL}${walletBalance.toFixed(0)}`,
      disabled: walletBalance < total,
      disabledText: 'Low Balance'
    },
    ...(isUserCodAllowed
      ? [{
        id: 'cash',
        name: 'Cash on Delivery',
        description: 'Pay when order arrives',
        icon: <Banknote className="w-5 h-5" />,
        color: 'bg-red-50 text-red-600 dark:bg-red-900/40 dark:text-red-400',
        selectedColor: 'bg-red-500 text-white'
      }]
      : [])
  ]
  const selectedPaymentLabel =
    selectedPaymentMethod === "wallet"
      ? "Wallet"
      : selectedPaymentMethod === "razorpay"
        ? "Online Payment"
        : "Cash on Delivery"

  useEffect(() => {
    const hasSelectedPayment = paymentOptions.some((option) => option.id === selectedPaymentMethod)
    if (!hasSelectedPayment && paymentOptions.length > 0) {
      setSelectedPaymentMethod(paymentOptions[0].id)
    }
  }, [paymentOptions, selectedPaymentMethod])

  // Restaurant name from data or cart
  const restaurantName = restaurantData?.name || cart[0]?.restaurant || "Restaurant"

  const handleShare = async () => {
    const restaurantNameStr = restaurantName || companyName || "this restaurant"
    const shareUrl = window.location.href
    const shareText = `Check out what I'm ordering from ${restaurantNameStr}! ${shareUrl}`

    const payload = {
      title: `My Cart at ${restaurantNameStr}`,
      text: shareText,
      url: shareUrl,
    }

    if (isMobileDevice()) {
      openShareModal(payload)
      return
    }

    const shared = await tryNativeShare(payload)
    if (shared) {
      toast.success("Link shared successfully")
      return
    }

    openShareModal(payload)
  }

  const openShareModal = (payload) => {
    setSharePayload(payload)
    setShowShareModal(true)
  }

  const tryNativeShare = async (payload) => {
    if (typeof navigator === "undefined" || !navigator.share) return false
    try {
      await navigator.share(payload)
      return true
    } catch (error) {
      if (error?.name === "AbortError") return true
      return false
    }
  }

  const isMobileDevice = () => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return false
    const mobileUA = /Android|iPhone|iPad|iPod|Windows Phone|Opera Mini|IEMobile/i.test(navigator.userAgent)
    const smallViewport = window.matchMedia?.("(max-width: 768px)")?.matches
    return Boolean(mobileUA || smallViewport)
  }

  const openShareTarget = (target) => {
    if (!sharePayload?.url) return

    const text = sharePayload.text || ""
    const url = sharePayload.url
    const encodedText = encodeURIComponent(text)
    const encodedUrl = encodeURIComponent(url)

    let shareLink = ""

    if (target === "whatsapp") {
      shareLink = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`
    } else if (target === "telegram") {
      shareLink = `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`
    } else if (target === "email") {
      shareLink = `mailto:?subject=${encodeURIComponent(sharePayload.title || "Check this out")}&body=${encodeURIComponent(`${text}\n\n${url}`)}`
    }

    if (shareLink) {
      window.open(shareLink, "_blank", "noopener,noreferrer")
      setShowShareModal(false)
    }
  }

  const copyShareLink = async () => {
    if (!sharePayload?.url) return
    await copyToClipboard(sharePayload.url)
    setShowShareModal(false)
  }

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Link copied to clipboard!")
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement("textarea")
      textArea.value = text
      textArea.style.position = "fixed"
      textArea.style.opacity = "0"
      document.body.appendChild(textArea)
      textArea.select()
      try {
        document.execCommand("copy")
        toast.success("Link copied to clipboard!")
      } catch (err) {
        toast.error("Failed to copy link")
      }
      document.body.removeChild(textArea)
    }
  }

  const handleSystemShareFromModal = async () => {
    if (!sharePayload) return
    const shared = await tryNativeShare(sharePayload)
    if (shared) {
      setShowShareModal(false)
      toast.success("Shared successfully")
    }
  }

  const handleBack = () => {
    // Priority: slug > restaurantId (both work for the restaurant details route)
    const idOrSlug = restaurantData?.slug || restaurantId
    if (idOrSlug) {
      navigate(`/food/user/restaurants/${idOrSlug}`)
    } else {
      goBack()
    }
  }

  // Handler to select address by label (Home, Office, Other)
  const handleSelectAddressByLabel = async (label) => {
    try {
      // Find address with matching label
      const targetLabel = normalizeAddressLabel(label)
      const address = addresses.find(addr => normalizeAddressLabel(addr.label) === targetLabel)

      if (!address) {
        toast.error(`No ${label} address found. Please add an address first.`)
        return
      }

      await handleSelectSavedAddress(address)
    } catch (error) {
      debugError(`Error selecting ${label} address:`, error)
      toast.error(`Failed to select ${label} address. Please try again.`)
    }
  }

  const handleSelectSavedAddress = async (address) => {
    try {
      const addressId = getAddressId(address)
      if (addressId) {
        setSelectedAddressId(addressId)
        await setDefaultAddress(addressId)
      }

      // Get coordinates from address location
      const coordinates = address.location?.coordinates || []
      const longitude = coordinates[0]
      const latitude = coordinates[1]

      if (!latitude || !longitude) {
        toast.error(`Invalid coordinates for ${address.label || "saved"} address`)
        return
      }

      // Update location in backend
      await userAPI.updateLocation({
        latitude,
        longitude,
        address: `${address.street}, ${address.city}`,
        city: address.city,
        state: address.state,
        area: address.additionalDetails || "",
        formattedAddress: address.additionalDetails
          ? `${address.additionalDetails}, ${address.street}, ${address.city}, ${address.state}${address.zipCode ? ` ${address.zipCode}` : ''}`
          : `${address.street}, ${address.city}, ${address.state}${address.zipCode ? ` ${address.zipCode}` : ''}`
      })

      // Update the location in localStorage
      const locationData = {
        city: address.city,
        state: address.state,
        address: `${address.street}, ${address.city}`,
        area: address.additionalDetails || "",
        zipCode: address.zipCode,
        latitude,
        longitude,
        formattedAddress: address.additionalDetails
          ? `${address.additionalDetails}, ${address.street}, ${address.city}, ${address.state}${address.zipCode ? ` ${address.zipCode}` : ''}`
          : `${address.street}, ${address.city}, ${address.state}${address.zipCode ? ` ${address.zipCode}` : ''}`
      }
      localStorage.setItem("userLocation", JSON.stringify(locationData))
      // User selected a saved address from Cart; prefer saved mode.
      try {
        localStorage.setItem("deliveryAddressMode", "saved")
        setDeliveryAddressMode("saved")
      } catch { }

      toast.success(`${address.label || "Saved"} address selected!`)
    } catch (error) {
      debugError("Error selecting saved address:", error)
      toast.error("Failed to select address. Please try again.")
    }
  }

  const handleApplyCoupon = async (coupon) => {
    if (coupon?.customerGroup === "new" && userOrderCount > 0) {
      toast.error("This coupon is only for first-time users")
      return
    }

    if (subtotal < (Number(coupon.minOrder) || 0)) {
      toast.error(`Min order ${RUPEE_SYMBOL}${Number(coupon.minOrder || 0)}`)
      return
    }

    // Validate with backend first; only set applied if backend accepts
    if (cart.length > 0 && hasSavedAddress) {
      try {
        setApplyingCouponCode(coupon.code)
        const response = await orderAPI.calculateOrder({
          orderType: "food",
          useCart: true,
          restaurantId: restaurantData?.restaurantId || restaurantData?._id || restaurantId || null,
          address: defaultAddress,
          couponCode: coupon.code
        })

        const pricingData = response?.data?.data?.pricing
        if (!pricingData || !pricingData.appliedCoupon) {
          toast.error("Coupon not applicable")
          return
        }

        setPricing(pricingData)
        setAppliedCoupon(coupon)
        setCouponCode(coupon.code)
        setManualCouponCode(coupon.code)
        setShowCouponSheet(false)
        if (typeof setCartCoupon === "function") {
          await setCartCoupon(coupon.code)
        }
      } catch (error) {
        debugError("Error recalculating pricing:", error)
        toast.error("Failed to apply coupon")
      } finally {
        setApplyingCouponCode("")
      }
    }
  }

  const handleApplyCouponCode = async () => {
    const inputCode = manualCouponCode.trim().toUpperCase()
    if (!inputCode) {
      toast.error("Enter coupon code")
      return
    }

    if (cart.length === 0 || !hasSavedAddress) {
      toast.error("Add items and delivery address first")
      return
    }

    const matchedCoupon = availableCoupons.find(
      (coupon) => String(coupon.code || "").toUpperCase() === inputCode,
    )

    // If we know this is first-time only and user already ordered, block early.
    if (matchedCoupon?.customerGroup === "new" && userOrderCount > 0) {
      toast.error("This coupon is only for first-time users")
      return
    }

    try {
      setApplyingCouponCode(inputCode)
      const response = await orderAPI.calculateOrder({
        orderType: "food",
        useCart: true,
        restaurantId: restaurantData?.restaurantId || restaurantData?._id || restaurantId || null,
        address: defaultAddress,
        couponCode: inputCode
      })

      const pricingData = response?.data?.data?.pricing
      if (!pricingData) {
        toast.error("Unable to validate coupon")
        return
      }

      if (!pricingData.appliedCoupon) {
        toast.error("Invalid or unavailable coupon code")
        setCouponCode("")
        return
      }

      setPricing(pricingData)
      setCouponCode(inputCode)
      setAppliedCoupon(
        matchedCoupon || {
          code: inputCode,
          discount: pricingData.appliedCoupon.discount || 0,
          minOrder: 0,
          customerGroup: "all",
        },
      )
      setShowCouponSheet(false)
      if (typeof setCartCoupon === "function") {
        await setCartCoupon(inputCode)
      }
      toast.success("Coupon applied")
    } catch (error) {
      debugError("Error applying coupon code:", error)
      toast.error("Failed to apply coupon")
    } finally {
      setApplyingCouponCode("")
    }
  }


  const handleRemoveCoupon = async () => {
    setAppliedCoupon(null)
    setCouponCode("")
    setManualCouponCode("")
    if (typeof setCartCoupon === "function") {
      await setCartCoupon("")
    }

    // Recalculate pricing without coupon
    if (cart.length > 0 && hasSavedAddress) {
      try {
        const response = await orderAPI.calculateOrder({
          orderType: "food",
          useCart: true,
          restaurantId: restaurantData?.restaurantId || restaurantData?._id || restaurantId || null,
          address: defaultAddress,
          couponCode: ""
        })

        if (response?.data?.success && response?.data?.data?.pricing) {
          setPricing(response.data.data.pricing)
        }
      } catch (error) {
        debugError("Error recalculating pricing:", error)
      }
    }
  }


  const handlePlaceOrder = async () => {
    // Check authentication first
    const isAuthenticated = !!localStorage.getItem('accessToken') || !!localStorage.getItem('user_accessToken');
    if (!isAuthenticated) {
      toast.error("Please login to place an order");
      navigateToLogin(navigate, location || "/cart");
      return;
    }

    if (!hasSavedAddress) {
      toast.error("Please choose a delivery location to continue")
      openLocationSelector()
      return
    }

    if (isScheduled) {
      if (!scheduledDate || !scheduledTime) {
        toast.error("Please select both date and time to schedule your order")
        return
      }
      const scheduleString = `${scheduledDate}T${scheduledTime}:00`
      const scheduleDateObj = new Date(scheduleString)
      if (scheduleDateObj < new Date()) {
        toast.error("Scheduled time must be in the future")
        return
      }
    }

    if (cart.length === 0) {
      alert("Your cart is empty")
      return
    }

    setIsPlacingOrder(true)

    // Use API_BASE_URL from config (supports both dev and production)

    try {
      debugLog("?? Starting order placement process...")
      debugLog("?? Cart items:", cart.map(item => ({ id: item.id, name: item.name, quantity: item.quantity, price: item.price })))
      debugLog("?? Applied coupon:", appliedCoupon?.code || "None")
      debugLog("?? Delivery address:", defaultAddress?.label || defaultAddress?.city)

      // Ensure we place the order with backend-calculated pricing when available.
      let resolvedPricing = pricing
      if (!resolvedPricing) {
        const pricingResponse = await orderAPI.calculateOrder({
          orderType: "food",
          useCart: true,
          restaurantId: restaurantData?.restaurantId || restaurantData?._id || restaurantId || undefined,
          address: defaultAddress,
          couponCode: appliedCoupon?.code || couponCode || undefined,
          deliveryFleet: selectedDeliveryFleet || undefined,
        })
        resolvedPricing = pricingResponse?.data?.data?.pricing || null
        if (resolvedPricing) {
          setPricing(resolvedPricing)
        }
      }

      // Ensure couponCode is included in pricing
      const orderPricing = resolvedPricing || {
        subtotal,
        deliveryFee,
        tax: gstCharges,
        platformFee,
        discount,
        total,
        totalDeliveryFee: deliveryFee,
        userDeliveryFee: deliveryFee,
        restaurantDeliveryFee: 0,
        sponsoredDelivery: false,
        sponsoredKm: 0,
        couponCode: appliedCoupon?.code || null
      };

      // Add couponCode if not present but coupon is applied
      if (!orderPricing.couponCode && appliedCoupon?.code) {
        orderPricing.couponCode = appliedCoupon.code;
      }

      // Include all cart items (main items + addons)
      // Note: Addons are added as separate cart items when user clicks the + button
      // Checkout items come from DB cart on the server — client items are not trusted.
      const orderItems = cart.map(mapOrderItem)

      debugLog("?? Order items to send:", orderItems)
      debugLog("?? Order pricing:", orderPricing)

      // Check API base URL before making request (for debugging)
      const fullUrl = `${API_BASE_URL}${API_ENDPOINTS.ORDER.CREATE}`;
      debugLog("?? Making request to:", fullUrl)
      debugLog("?? Authentication token present:", !!localStorage.getItem('accessToken') || !!localStorage.getItem('user_accessToken'))

      // CRITICAL: Validate restaurant ID before placing order
      // Ensure we're using the correct restaurant from restaurantData (most reliable)
      const finalRestaurantId = restaurantData?.restaurantId || restaurantData?._id || null;
      const finalRestaurantName = restaurantData?.name || null;

      if (!finalRestaurantId) {
        debugError('? CRITICAL: Cannot place order - Restaurant ID is missing!');
        debugError('?? Debug info:', {
          restaurantData: restaurantData ? {
            _id: restaurantData._id,
            restaurantId: restaurantData.restaurantId,
            name: restaurantData.name
          } : 'Not loaded',
          cartRestaurantId: restaurantId,
          cartRestaurantName: cart[0]?.restaurant,
          cartItems: cart.map(item => ({
            id: item.id,
            name: item.name,
            restaurant: item.restaurant,
            restaurantId: item.restaurantId
          }))
        });
        alert('Error: Restaurant information is missing. Please refresh the page and try again.');
        setIsPlacingOrder(false);
        return;
      }

      // CRITICAL: Validate that ALL cart items belong to the SAME restaurant
      const cartRestaurantIds = cart
        .map(item => item.restaurantId)
        .filter(Boolean)
        .map(id => String(id).trim()); // Normalize to string and trim

      const cartRestaurantNames = cart
        .map(item => item.restaurant)
        .filter(Boolean)
        .map(name => name.trim().toLowerCase()); // Normalize names

      // Get unique values (after normalization)
      const uniqueRestaurantIds = [...new Set(cartRestaurantIds)];
      const uniqueRestaurantNames = [...new Set(cartRestaurantNames)];

      // Check if cart has items from multiple restaurants
      // Note: If restaurant names match, allow even if IDs differ (same restaurant, different ID format)
      if (uniqueRestaurantNames.length > 1) {
        // Different restaurant names = definitely different restaurants
        debugError('? CRITICAL ERROR: Cart contains items from multiple restaurants!', {
          restaurantIds: uniqueRestaurantIds,
          restaurantNames: uniqueRestaurantNames,
          cartItems: cart.map(item => ({
            id: item.id,
            name: item.name,
            restaurant: item.restaurant,
            restaurantId: item.restaurantId
          }))
        });

        // Automatically clean cart to keep items from the restaurant matching restaurantData
        if (finalRestaurantId && finalRestaurantName) {
          debugLog('?? Auto-cleaning cart to keep items from:', finalRestaurantName);
          cleanCartForRestaurant(finalRestaurantId, finalRestaurantName);
          toast.error('Cart contained items from different restaurants. Items from other restaurants have been removed.');
        } else {
          // If restaurantData is not available, keep items from first restaurant in cart
          const firstRestaurantId = cart[0]?.restaurantId;
          const firstRestaurantName = cart[0]?.restaurant;
          if (firstRestaurantId && firstRestaurantName) {
            debugLog('?? Auto-cleaning cart to keep items from first restaurant:', firstRestaurantName);
            cleanCartForRestaurant(firstRestaurantId, firstRestaurantName);
            toast.error('Cart contained items from different restaurants. Items from other restaurants have been removed.');
          } else {
            toast.error('Cart contains items from different restaurants. Please clear cart and try again.');
          }
        }

        setIsPlacingOrder(false);
        return;
      }

      // If restaurant names match but IDs differ, that's OK (same restaurant, different ID format)
      // But log a warning in development
      if (uniqueRestaurantIds.length > 1 && uniqueRestaurantNames.length === 1) {
        if (process.env.NODE_ENV === 'development') {
          debugWarn('?? Cart items have different restaurant IDs but same name. This is OK if IDs are in different formats.', {
            restaurantIds: uniqueRestaurantIds,
            restaurantName: uniqueRestaurantNames[0]
          });
        }
      }

      // Validate that cart items' restaurantId matches the restaurantData
      if (cartRestaurantIds.length > 0) {
        const cartRestaurantId = cartRestaurantIds[0];

        // Check if cart restaurantId matches restaurantData
        const restaurantIdMatches =
          cartRestaurantId === finalRestaurantId ||
          cartRestaurantId === restaurantData?._id?.toString() ||
          cartRestaurantId === restaurantData?.restaurantId;

        if (!restaurantIdMatches) {
          debugError('? CRITICAL ERROR: Cart restaurantId does not match restaurantData!', {
            cartRestaurantId: cartRestaurantId,
            finalRestaurantId: finalRestaurantId,
            restaurantDataId: restaurantData?._id?.toString(),
            restaurantDataRestaurantId: restaurantData?.restaurantId,
            restaurantDataName: restaurantData?.name,
            cartRestaurantName: cartRestaurantNames[0]
          });
          alert(`Error: Cart items belong to "${cartRestaurantNames[0] || 'Unknown Restaurant'}" but restaurant data doesn't match. Please refresh the page and try again.`);
          setIsPlacingOrder(false);
          return;
        }
      }

      // Validate restaurant name matches
      if (cartRestaurantNames.length > 0 && finalRestaurantName) {
        const cartRestaurantName = cartRestaurantNames[0];
        if (cartRestaurantName.toLowerCase().trim() !== finalRestaurantName.toLowerCase().trim()) {
          debugError('? CRITICAL ERROR: Restaurant name mismatch!', {
            cartRestaurantName: cartRestaurantName,
            finalRestaurantName: finalRestaurantName
          });
          alert(`Error: Cart items belong to "${cartRestaurantName}" but restaurant data shows "${finalRestaurantName}". Please refresh the page and try again.`);
          setIsPlacingOrder(false);
          return;
        }
      }

      // Log order details for debugging
      debugLog('? Order validation passed - Placing order with restaurant:', {
        restaurantId: finalRestaurantId,
        restaurantName: finalRestaurantName,
        restaurantDataId: restaurantData?._id,
        restaurantDataRestaurantId: restaurantData?.restaurantId,
        cartRestaurantId: cartRestaurantIds[0],
        cartRestaurantName: cartRestaurantNames[0],
        cartItemCount: cart.length
      });

      // FINAL VALIDATION: Double-check restaurantId before sending to backend
      const cartRestaurantId = cart[0]?.restaurantId;
      if (cartRestaurantId && cartRestaurantId !== finalRestaurantId &&
        cartRestaurantId !== restaurantData?._id?.toString() &&
        cartRestaurantId !== restaurantData?.restaurantId) {
        debugError('? CRITICAL: Final validation failed - restaurantId mismatch!', {
          cartRestaurantId: cartRestaurantId,
          finalRestaurantId: finalRestaurantId,
          restaurantDataId: restaurantData?._id?.toString(),
          restaurantDataRestaurantId: restaurantData?.restaurantId,
          cartRestaurantName: cart[0]?.restaurant,
          finalRestaurantName: finalRestaurantName
        });
        alert('Error: Restaurant information mismatch detected. Please refresh the page and try again.');
        setIsPlacingOrder(false);
        return;
      }

      const normalizedAddress = normalizeOrderAddress(defaultAddress, {
        recipientName,
        recipientPhone: recipientPhone || defaultAddress?.phone || "",
      })

      const orderPayload = {
        orderType: "food",
        useCart: true,
        // Server loads items from DB food cart; do not trust client cart lines.
        items: [],
        address: normalizedAddress,
        customerName: recipientName,
        customerPhone: normalizedAddress?.phone || "",
        restaurantId: finalRestaurantId,
        restaurantName: finalRestaurantName || undefined,
        pricing: orderPricing,
        couponCode: appliedCoupon?.code || couponCode || undefined,
        deliveryFleet: selectedDeliveryFleet || undefined,
        note: note || "",
        sendCutlery: sendCutlery !== false,
        paymentMethod: selectedPaymentMethod,
        // `useZone()` can return `null`. Zod expects string/undefined, not null.
        zoneId: zoneId || undefined,
        scheduledAt: isScheduled ? new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString() : undefined,
      };
      // Log final order details (including paymentMethod for COD debugging)
      debugLog('?? FINAL: Sending order to backend with:', {
        restaurantId: finalRestaurantId,
        restaurantName: finalRestaurantName,
        itemCount: orderItems.length,
        totalAmount: orderPricing.total,
        paymentMethod: orderPayload.paymentMethod
      });

      // Check wallet balance if wallet payment selected
      if (selectedPaymentMethod === "wallet" && walletBalance < total) {
        toast.error(`Insufficient wallet balance. Required: ${RUPEE_SYMBOL}${total.toFixed(0)}, Available: ${RUPEE_SYMBOL}${walletBalance.toFixed(0)}`)
        setIsPlacingOrder(false)
        return
      }

      // Create order in backend
      const orderResponse = await orderAPI.createOrder(orderPayload)

      debugLog("? Order created successfully:", orderResponse.data)

      const { order, razorpay } = orderResponse.data.data

      // Cash flow: order placed without online payment
      if (selectedPaymentMethod === "cash") {
        toast.success("Order placed with Cash on Delivery")
        setPlacedOrderId(order?._id || order?.orderId || order?.id || null)
        setPlacedOrderData(order || null)
        setShowOrderSuccess(true)
        window.dispatchEvent(new CustomEvent('order-placed', { detail: { order } }))
        clearCart()
        setNote("")
        setShowNoteInput(false)
        try {
          window.localStorage.removeItem(CART_ORDER_NOTE_STORAGE_KEY)
        } catch {
          // ignore
        }
        setIsPlacingOrder(false)
        return
      }

      // Wallet flow: order placed with wallet payment (already processed in backend)
      if (selectedPaymentMethod === "wallet") {
        toast.success("Order placed with Wallet payment")
        setPlacedOrderId(order?._id || order?.orderId || order?.id || null)
        setPlacedOrderData(order || null)
        setShowOrderSuccess(true)
        window.dispatchEvent(new CustomEvent('order-placed', { detail: { order } }))
        clearCart()
        setNote("")
        setShowNoteInput(false)
        try {
          window.localStorage.removeItem(CART_ORDER_NOTE_STORAGE_KEY)
        } catch {
          // ignore
        }
        setIsPlacingOrder(false)
        // Refresh wallet balance
        try {
          const walletResponse = await userAPI.getWallet()
          if (walletResponse?.data?.success && walletResponse?.data?.data?.wallet) {
            setWalletBalance(walletResponse.data.data.wallet.balance || 0)
          }
        } catch (error) {
          debugError("Error refreshing wallet balance:", error)
        }
        return
      }

      if (!razorpay || !razorpay.orderId || !razorpay.key) {
        debugError("? Razorpay initialization failed:", { razorpay, order })
        throw new Error(razorpay ? "Razorpay payment gateway is not configured. Please contact support." : "Failed to initialize payment")
      }

      debugLog("?? Razorpay order created:", {
        orderId: razorpay.orderId,
        amount: razorpay.amount,
        currency: razorpay.currency,
        keyPresent: !!razorpay.key
      })

      // Get user info for Razorpay prefill
      const userInfo = userProfile || {}
      const userPhone = recipientPhone || userInfo.phone || defaultAddress?.phone || ""
      const userEmail = userInfo.email || ""
      const userName = recipientName || userInfo.name || ""

      // Format phone number (remove non-digits, take last 10 digits)
      const formattedPhone = userPhone.replace(/\D/g, "").slice(-10)

      debugLog("?? User info for payment:", {
        name: userName,
        email: userEmail,
        phone: formattedPhone
      })

      // Get company name for Razorpay
      const companyName = await getCompanyNameAsync()

      // ─── Payment: Flutter WebView → native Razorpay, Web → JS checkout ───
      if (isFlutterWebView()) {
        // Native Flutter Razorpay SDK via JS bridge
        setIsPlacingOrder(true)
        try {
          const flutterResult = await handleFlutterRazorpayPayment({
            key: razorpay.key,
            order_id: razorpay.orderId,
            amount: razorpay.amount, // already in paise
            currency: razorpay.currency || 'INR',
            name: companyName,
            description: `Order ${order._id || order.orderId} - ${RUPEE_SYMBOL}${(razorpay.amount / 100).toFixed(2)}`,
            prefill: { name: userName, email: userEmail, contact: formattedPhone },
            notes: {
              orderId: order._id || order.orderId,
              userId: userInfo.id || '',
              restaurantId: restaurantId || 'unknown',
            },
          })

          // Verify payment with backend (same as web flow)
          const verifyOrderId = order?._id || order?.id || order?.orderMongoId
          if (!verifyOrderId) throw new Error('Unable to verify payment: missing order id')
          const verifyResponse = await orderAPI.verifyPayment({
            orderId: verifyOrderId,
            razorpayOrderId: flutterResult.razorpay_order_id,
            razorpayPaymentId: flutterResult.razorpay_payment_id,
            razorpaySignature: flutterResult.razorpay_signature,
          })

          if (verifyResponse.data.success) {
            setPlacedOrderId(order._id || order.orderId)
            setPlacedOrderData(order || null)
            setShowOrderSuccess(true)
            window.dispatchEvent(new CustomEvent('order-placed', { detail: { order } }))
            clearCart()
          } else {
            throw new Error(verifyResponse.data.message || 'Payment verification failed')
          }
        } catch (payErr) {
          const msg = payErr?.message || 'Payment failed or cancelled'
          const trackingId = order?._id || order?.id || order?.orderMongoId || order?.orderId
          const isUserCancel = /cancel/i.test(msg)
          if (!isUserCancel && trackingId) {
            try {
              await orderAPI.markPaymentFailed(trackingId, { note: msg })
            } catch {
              // non-blocking — order stays unpaid for retry either way
            }
          }
          if (trackingId) {
            clearCart()
            toast.message(
              isUserCancel
                ? "Payment not completed. You can retry from My Orders."
                : "Payment failed. You can retry from the order page.",
            )
            navigate(`/food/user/orders/${trackingId}`, {
              state: { prefetchedOrder: order, awaitPayment: true },
            })
          } else if (!isUserCancel) {
            alert(msg)
          }
        } finally {
          setIsPlacingOrder(false)
        }
      } else {
        // Standard web Razorpay checkout modal (unchanged)
        await initRazorpayPayment({
          key: razorpay.key,
          amount: razorpay.amount, // Already in paise from backend
          currency: razorpay.currency || 'INR',
          order_id: razorpay.orderId,
          name: companyName,
          description: `Order ${order._id || order.orderId} - ${RUPEE_SYMBOL}${(razorpay.amount / 100).toFixed(2)}`,
          prefill: {
            name: userName,
            email: userEmail,
            contact: formattedPhone
          },
          notes: {
            orderId: order._id || order.orderId,
            userId: userInfo.id || "",
            restaurantId: restaurantId || "unknown"
          },
          handler: async (response) => {
            try {
              debugLog("? Payment successful, verifying...", {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id
              })

              // Verify payment with backend
              const verifyOrderId = order?._id || order?.id || order?.orderMongoId
              if (!verifyOrderId) {
                throw new Error("Unable to verify payment: missing order id from create-order response")
              }
              const verifyResponse = await orderAPI.verifyPayment({
                orderId: verifyOrderId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature
              })

              debugLog("? Payment verification response:", verifyResponse.data)

              if (verifyResponse.data.success) {
                debugLog("?? Order placed successfully:", {
                  orderId: order._id || order.orderId,
                  paymentId: verifyResponse.data.data?.payment?.paymentId
                })
                setPlacedOrderId(order._id || order.orderId)
                setPlacedOrderData(order || null)
                setShowOrderSuccess(true)
                window.dispatchEvent(new CustomEvent('order-placed', { detail: { order } }))
                clearCart()
                setIsPlacingOrder(false)
              } else {
                throw new Error(verifyResponse.data.message || "Payment verification failed")
              }
            } catch (error) {
              debugError("? Payment verification error:", error)
              const errorMessage =
                error?.response?.data?.message ||
                error?.response?.data?.error?.message ||
                error?.response?.data?.errors?.[0]?.message ||
                error?.message ||
                "Payment verification failed. Please contact support."
              alert(errorMessage)
              setIsPlacingOrder(false)
            }
          },
          onError: async (error) => {
            debugError("? Razorpay payment error:", error)
            // Method picker errors are recoverable — do not abandon the payment session.
            if (error?.code === "METHOD_SELECTION_FAILED") {
              toast.error(error?.description || "Please select another payment method.")
              return
            }
            const trackingId = order?._id || order?.id || order?.orderMongoId || order?.orderId
            const isUserCancel =
              error?.code === "PAYMENT_CANCELLED" || error?.message === "PAYMENT_CANCELLED"
            // Keep unpaid order alive for Retry Payment — never auto-cancel.
            if (!isUserCancel && trackingId) {
              try {
                await orderAPI.markPaymentFailed(trackingId, {
                  note: error?.description || error?.message || "Online payment failed",
                })
              } catch (markErr) {
                debugError("? Failed to mark payment failed:", markErr)
              }
              if (error?.code !== "PAYMENT_CANCELLED" && error?.message !== "PAYMENT_CANCELLED") {
                const errorMessage =
                  error?.description || error?.message || "Payment failed. Please try again."
                toast.error(errorMessage)
              }
            }
            if (trackingId) {
              clearCart()
              navigate(`/food/user/orders/${trackingId}`, {
                state: { prefetchedOrder: order, awaitPayment: true },
              })
            }
            setIsPlacingOrder(false)
          },
          onClose: async () => {
            debugLog("?? Payment modal closed by user")
            const trackingId = order?._id || order?.id || order?.orderMongoId || order?.orderId
            if (!trackingId) {
              setIsPlacingOrder(false)
              return
            }

            // Closing Razorpay's leftover about:blank / 3DS window often fires dismiss
            // AFTER a successful capture. Poll before treating as unpaid.
            setIsPlacingOrder(true)
            try {
              const paid = await pollOrderPaidAfterDismiss(async () => {
                const res = await orderAPI.getOrderDetails(trackingId, { force: true })
                return res?.data?.data?.order || res?.data?.data || null
              })
              if (paid) {
                setPlacedOrderId(order._id || order.orderId)
                setPlacedOrderData(order || null)
                setShowOrderSuccess(true)
                window.dispatchEvent(new CustomEvent('order-placed', { detail: { order } }))
                clearCart()
                toast.success("Payment successful")
                return
              }
            } catch (pollErr) {
              debugError("? Payment dismiss status poll failed:", pollErr)
            } finally {
              setIsPlacingOrder(false)
            }

            // Do NOT cancel the unpaid order — user can Retry Payment from order page.
            clearCart()
            toast.message("Payment not completed. You can retry from this order.")
            navigate(`/food/user/orders/${trackingId}`, {
              state: { prefetchedOrder: order, awaitPayment: true },
            })
          }
        })
      }
    } catch (error) {
      debugError("? Order creation error:", error)

      let errorMessage = "Failed to create order. Please try again."

      // Handle network errors
      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        const backendUrl = API_BASE_URL.replace('/api', '');
        errorMessage = `Network Error: Cannot connect to backend server.\n\n` +
          `Expected backend URL: ${backendUrl}\n\n` +
          `Please check:\n` +
          `1. Backend server is running\n` +
          `2. Backend is accessible at ${backendUrl}\n` +
          `3. Check browser console (F12) for more details\n\n` +
          `If backend is not running, start it with:\n` +
          `cd appzetofood/backend && npm start`

        debugError("?? Network Error Details:", {
          code: error.code,
          message: error.message,
          config: {
            url: error.config?.url,
            baseURL: error.config?.baseURL,
            fullUrl: error.config?.baseURL + error.config?.url,
            method: error.config?.method
          },
          backendUrl: backendUrl,
          apiBaseUrl: API_BASE_URL
        })

        // Backend disconnected - no health check (new backend in progress)
      }
      // Handle timeout errors
      else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        errorMessage = "Request timed out. The server is taking too long to respond. Please try again."
      }
      // Handle other axios errors
      else if (error.response) {
        // Server responded with error status
        errorMessage = error.response.data?.message || `Server error: ${error.response.status}`
      }
      // Handle other errors
      else if (error.message) {
        errorMessage = error.message
      }

      alert(errorMessage)
      setIsPlacingOrder(false)
    }
  }

  const handleGoToOrders = () => {
    setShowOrderSuccess(false)
    navigate(`/user/orders/${placedOrderId}?confirmed=true`, {
      state: placedOrderData ? { prefetchedOrder: placedOrderData } : undefined,
    })
  }

  const isCartContextMissing = !cartContext || Object.keys(cartContext).length === 0;
  if (isCartContextMissing) {
    debugError('? CartProvider not found. Make sure Cart component is rendered within UserLayout.');
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] dark:bg-[#0a0a0a]">
        <div className="text-center p-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Cart Error</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Cart functionality is not available. Please refresh the page.
          </p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  if (hasQuickItems && hasFoodItems) {
    return (
      <MixedSharedCart
        initialAddress={defaultAddress}
        addressMode={deliveryAddressMode}
      />
    )
  }

  if (isQuickCart) {
    return (
      <QuickSharedCart
        initialAddress={defaultAddress}
        addressMode={deliveryAddressMode}
      />
    )
  }

  // Empty cart state - but don't show if order success or placing order modal is active
  if (cart.length === 0 && !showOrderSuccess && !showPlacingOrder) {
    return (
      <AnimatedPage className="min-h-screen bg-[#f6f6f6] dark:bg-[#080808]">
        <div className="sticky top-0 z-10 border-b border-black/5 bg-white/95 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-[#121212]/95">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/15"
              onClick={handleBack}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#FF6A00]">Checkout</p>
              <span className="text-sm font-black text-gray-950 dark:text-white">Your cart</span>
            </div>
          </div>
        </div>
        <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-5 py-16 text-center">
          <div className="mb-5 flex h-28 w-28 items-center justify-center rounded-[32px] bg-white shadow-[0_12px_36px_rgba(15,23,42,0.08)] dark:bg-[#151515]">
            <Utensils className="h-12 w-12 text-[#FF6A00]" />
          </div>
          <h2 className="text-2xl font-black text-gray-950 dark:text-white">Your cart is empty</h2>
          <p className="mt-2 text-sm font-medium leading-6 text-gray-500 dark:text-gray-400">
            Looks like you haven’t added anything yet. Browse restaurants and build your perfect meal.
          </p>
          <Link to="/food/user" className="mt-7 w-full">
            <Button className="h-12 w-full rounded-2xl bg-[#FF6A00] text-sm font-black text-white shadow-lg shadow-orange-500/25 hover:bg-[#e85d04]">
              Browse Restaurants
            </Button>
          </Link>
        </div>
      </AnimatedPage>
    )
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#f6f6f6] text-gray-900 dark:bg-[#080808] dark:text-white">
      {/* Header - Sticky at top */}
      <div className="sticky top-0 z-20 flex-shrink-0 border-b border-black/5 bg-white/95 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-[#121212]/95">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5 lg:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/15"
                onClick={handleBack}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0 leading-tight">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#FF6A00]">Secure checkout</p>
                <p className="mt-0.5 truncate text-sm font-extrabold text-gray-950 dark:text-white sm:text-base">
                  {restaurantName}
                </p>
                <p className="mt-0.5 truncate text-[11px] font-medium text-gray-500 dark:text-gray-400 sm:text-xs">
                  {getMaxDeliveryTime(cart, restaurantData)} delivery
                  <span className="mx-1 text-gray-300">•</span>
                  {defaultAddress ? (formatFullAddress(defaultAddress) || defaultAddress?.formattedAddress || defaultAddress?.address || defaultAddress?.city || "Select address") : "Select address"}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/15"
              onClick={handleShare}
            >
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden pb-40 md:pb-44 lg:pb-10">
        {/* Savings Banner */}
        {otherPlatformSavings > 0 && (
          <div className="flex-shrink-0 bg-[#fff7ed] px-3 py-2 dark:bg-[#2b1408] sm:px-5">
            <div className="mx-auto flex max-w-6xl items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-[#FF6A00]" />
              <p className="text-xs font-extrabold text-[#c2410c] dark:text-orange-200">
                You're saving {RUPEE_SYMBOL}{Math.round(otherPlatformSavings)} compared to other platforms!
              </p>
            </div>
          </div>
        )}

        <div className="mx-auto max-w-6xl px-3 py-2.5 sm:px-5 sm:py-3 lg:px-6">
          <div className="mx-auto max-w-3xl">
            {/* Main Cart Content */}
            <div className="space-y-2.5 sm:space-y-3">
              {/* Cart Items */}
              <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm dark:border-white/10 dark:bg-[#151515]">
                <div className="flex items-center justify-between border-b border-dashed border-gray-100 px-3 py-2.5 dark:border-white/10 sm:px-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">Your order</p>
                    <h2 className="text-sm font-black text-gray-950 dark:text-white">{cart.length} item{cart.length === 1 ? "" : "s"}</h2>
                  </div>
                  <button
                    onClick={handleBack}
                    className="inline-flex items-center gap-1 rounded-full bg-[#fff3eb] px-2.5 py-1 text-[11px] font-black text-[#FF6A00] transition active:scale-95 dark:bg-[#FF6A00]/10"
                  >
                    <Plus className="h-3 w-3" />
                    Add items
                  </button>
                </div>

                <div className="divide-y divide-gray-100 dark:divide-white/10">
                  {cart.map((item) => (
                    <CartItemRow
                      key={item.id}
                      item={item}
                      onDecrement={async (row) => {
                        // At the item's minimum this removes the line (CartContext).
                        const result = await updateQuantity(row.id, row.quantity - 1)
                        if (result?.ok === false) toast.error(result.error)
                      }}
                      onIncrement={async (row) => {
                        const result = await updateQuantity(row.id, row.quantity + 1)
                        if (result?.ok === false) toast.error(result.error)
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Delivery Time + Speed */}
              <div className="rounded-2xl border border-black/5 bg-white px-3.5 py-3 shadow-sm dark:border-white/10 dark:bg-[#151515]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#FF6A00]/10 text-[#FF6A00]">
                      <Zap className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-gray-900 dark:text-white">
                        Delivery in{" "}
                        <span className="text-[#FF6A00]">
                          {selectedDeliverySpeedOption
                            ? `${selectedDeliverySpeedOption.etaMinutesMin}-${selectedDeliverySpeedOption.etaMinutesMax} min`
                            : getMaxDeliveryTime(cart, restaurantData)}
                        </span>
                      </p>
                      <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">Choose delivery speed</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsScheduled(!isScheduled)}
                    className="shrink-0 rounded-full border border-dashed border-[#FF6A00]/50 bg-[#fff3eb] px-2.5 py-1 text-[11px] font-black text-[#FF6A00] transition active:scale-95 dark:bg-[#FF6A00]/10"
                  >
                    {isScheduled ? "Deliver now" : "Schedule"}
                  </button>
                </div>

                {loadingDeliverySpeedOptions ? (
                  <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">Loading delivery speed options...</p>
                ) : deliverySpeedOptions.length > 0 ? (
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5">
                    {deliverySpeedOptions.map((option) => {
                      const isSelected = option.code === selectedDeliveryFleet
                      return (
                        <button
                          key={option.code}
                          onClick={() => setSelectedDeliveryFleet(option.code)}
                          className={`flex shrink-0 flex-col items-start rounded-lg border px-2.5 py-1.5 text-left transition-colors ${isSelected
                            ? "border-[#FF6A00] bg-[#FF6A00]/10"
                            : "border-gray-200 dark:border-gray-700"
                            }`}
                        >
                          <span className={`text-[11px] font-bold ${isSelected ? "text-[#FF6A00]" : "text-gray-800 dark:text-gray-200"}`}>
                            {option.label}
                          </span>
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">
                            {option.etaMinutesMin}-{option.etaMinutesMax}m ·{" "}
                            {Number(option.extraFee || 0) > 0 ? `+${RUPEE_SYMBOL}${Number(option.extraFee).toFixed(0)}` : "Free"}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                    Delivery speed options are not configured yet.
                  </p>
                )}

                {isScheduled && (
                  <div className="relative mt-2.5 flex flex-col gap-2.5 border-t border-gray-100 pt-2.5 dark:border-gray-800 sm:flex-row">
                    <div className="flex-1">
                      <label className="mb-1 block text-[11px] font-medium text-gray-500 dark:text-gray-400">Date (Up to Tomorrow)</label>
                      <input
                        type="date"
                        min={new Date().toLocaleDateString('en-CA')}
                        max={new Date(Date.now() + 86400000).toLocaleDateString('en-CA')}
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        className="w-full rounded-xl border border-red-200 bg-white/90 p-2 text-sm text-gray-800 focus:outline-none focus:border-[#FF6A00] dark:border-red-900/50 dark:bg-[#0f0f0f] dark:text-gray-200"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-[11px] font-medium text-gray-500 dark:text-gray-400">Time</label>
                      {availableTimeSlots.length > 0 ? (
                        <div className="relative">
                          <select
                            value={scheduledTime}
                            onChange={(e) => setScheduledTime(e.target.value)}
                            className="w-full appearance-none rounded-xl border border-red-200 bg-white/90 p-2 pr-8 text-sm text-gray-800 focus:outline-none focus:border-[#FF6A00] dark:border-red-900/50 dark:bg-[#0f0f0f] dark:text-gray-200"
                          >
                            {availableTimeSlots.map(slot => (
                              <option key={slot.value} value={slot.value}>{slot.label}</option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                        </div>
                      ) : (
                        <div className="w-full rounded-xl border border-dashed border-red-200 bg-white/70 p-2 text-center text-sm text-gray-500 dark:border-red-900/50 dark:bg-white/5 dark:text-gray-400">
                          {scheduledDate ? "No slots available" : "Select date first"}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>


              {/* Note & Cutlery */}
              <div className="flex flex-col gap-2 rounded-2xl border border-black/5 bg-white px-3 py-2.5 shadow-sm dark:border-white/10 dark:bg-[#151515] sm:flex-row">
                <button
                  onClick={() => setShowNoteInput(!showNoteInput)}
                  className="flex flex-1 items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 px-2.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{note || "Add a note for the delivery partner"}</span>
                </button>
                <button
                  onClick={() => setSendCutlery(!sendCutlery)}
                  className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-semibold ${sendCutlery ? 'border-gray-100 bg-gray-50 text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300' : 'border-[#FF6A00]/50 bg-[#fff3eb] text-[#FF6A00] dark:bg-[#FF6A00]/10'}`}
                >
                  <Utensils className="h-3.5 w-3.5" />
                  <span className="whitespace-nowrap">
                    {sendCutlery ? "Send cutlery" : "Don't send cutlery"}
                  </span>
                </button>
              </div>

              {/* Note Input */}
              {showNoteInput && (
                <div className="rounded-2xl border border-black/5 bg-white px-3.5 py-3 shadow-sm dark:border-white/10 dark:bg-[#151515]">
                  <p className="mb-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                    Delivery instructions
                  </p>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Eg. Call when outside, ring bell once, leave at gate"
                    className="h-20 w-full resize-none rounded-xl border border-gray-100 bg-gray-50 p-2.5 text-sm text-gray-900 outline-none focus:border-[#FF6A00] dark:border-white/10 dark:bg-[#0f0f0f] dark:text-gray-100"
                    maxLength={240}
                  />
                  <div className="mt-1.5 flex items-center justify-between gap-3">
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      Visible to the delivery partner.
                    </p>
                    <span className="whitespace-nowrap text-[10px] text-gray-400 dark:text-gray-500">
                      {note.length}/240
                    </span>
                  </div>
                </div>
              )}

              {/* Complete your meal section - Approved Addons */}
              {addons.length > 0 && (
                <div className="rounded-2xl border border-black/5 bg-white px-3.5 py-3 shadow-sm dark:border-white/10 dark:bg-[#151515]">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded bg-gray-100 dark:bg-gray-800">
                      <Sparkles className="h-3.5 w-3.5 text-[#FF6A00]" />
                    </div>
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Complete your meal</span>
                  </div>
                  {loadingAddons ? (
                    <div className="flex gap-3 md:gap-4 overflow-x-auto pb-2 -mx-4 md:-mx-6 px-4 md:px-6 scrollbar-hide">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex-shrink-0 w-28 md:w-36 animate-pulse">
                          <div className="w-full h-28 md:h-36 bg-gray-200 dark:bg-gray-700 rounded-lg md:rounded-xl" />
                          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mt-2" />
                          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded mt-1 w-2/3" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex gap-3 md:gap-4 overflow-x-auto pb-2 -mx-4 md:-mx-6 px-4 md:px-6 scrollbar-hide">
                      {addons
                        .filter(addon => !vegMode || addon.foodType === 'Veg' || addon.foodType !== 'Non-Veg')
                        .map((addon) => {
                        const addonId = String(addon.id || addon._id)
                        const addonQty = getAddonQuantity(addonId)
                        const addonBusy = updatingAddonId === addonId
                        return (
                          <div key={addon.id} className="flex-shrink-0 w-28 md:w-36">
                            <div className="relative bg-gray-100 dark:bg-gray-800 rounded-lg md:rounded-xl overflow-hidden">
                              <img
                                src={addon.image || (addon.images && addon.images[0]) || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&h=200&fit=crop"}
                                alt={addon.name}
                                className="w-full h-28 md:h-36 object-cover rounded-lg md:rounded-xl"
                                onError={(e) => {
                                  e.target.onerror = null
                                  e.target.src = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&h=200&fit=crop"
                                }}
                              />
                              <div className="absolute top-1 md:top-2 left-1 md:left-2">
                                <div className={`w-3.5 h-3.5 md:w-4 md:h-4 bg-white border flex items-center justify-center rounded ${addon.foodType === 'Non-Veg' ? 'border-red-600' : 'border-green-600'}`}>
                                  <div className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${addon.foodType === 'Non-Veg' ? 'bg-red-600' : 'bg-green-600'}`} />
                                </div>
                              </div>
                              {addonQty > 0 ? (
                                <div className="absolute bottom-1 md:bottom-2 right-1 md:right-2 flex items-center rounded border border-[#FF6A00] bg-white shadow-sm dark:bg-[#151515]">
                                  <button
                                    type="button"
                                    aria-label={`Remove one ${addon.name}`}
                                    disabled={addonBusy}
                                    onClick={() => changeAddonQuantity(addon, -1)}
                                    className="px-1 py-0.5 text-[#FF6A00] disabled:opacity-40"
                                  >
                                    <Minus className="h-3 w-3" />
                                  </button>
                                  <span className="min-w-[0.9rem] text-center text-[11px] font-bold tabular-nums text-[#FF6A00]">
                                    {addonQty}
                                  </span>
                                  <button
                                    type="button"
                                    aria-label={`Add one more ${addon.name}`}
                                    disabled={addonBusy || addonQty >= MAX_ADDON_QUANTITY}
                                    onClick={() => changeAddonQuantity(addon, 1)}
                                    className="px-1 py-0.5 text-[#FF6A00] disabled:opacity-40"
                                  >
                                    <Plus className="h-3 w-3" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  aria-label={`Add ${addon.name}`}
                                  disabled={addonBusy}
                                  onClick={() => changeAddonQuantity(addon, 1)}
                                  className="absolute bottom-1 md:bottom-2 right-1 md:right-2 w-6 h-6 md:w-7 md:h-7 bg-white border border-[#FF6A00] rounded flex items-center justify-center shadow-sm hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-900/20 transition-colors"
                                >
                                  <Plus className="h-3.5 w-3.5 md:h-4 md:w-4 text-[#FF6A00]" />
                                </button>
                              )}
                            </div>
                            <p className="text-xs md:text-sm font-medium text-gray-800 dark:text-gray-200 mt-1.5 md:mt-2 line-clamp-2 leading-tight">{addon.name}</p>
                            {addon.description && (
                              <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{addon.description}</p>
                            )}
                            <p className="text-xs md:text-sm text-gray-800 dark:text-gray-200 font-semibold mt-0.5">{RUPEE_SYMBOL}{addon.price}</p>
                          </div>
                        )
                        })}
                    </div>
                  )}
                </div>
              )}

              {/* Coupon Section */}
              <CartCouponSection
                appliedCoupon={appliedCoupon}
                discount={discount}
                deliveryFee={deliveryFee}
                deliveryFeeSavedLabel={deliveryFee === 0 ? `You saved ${RUPEE_SYMBOL}${Number((pricing?.totalDeliveryFee ?? feeSettings.baseDeliveryFee) || 0).toFixed(2)} on delivery` : null}
                availableCoupons={availableCoupons}
                loadingCoupons={loadingCoupons}
                subtotal={subtotal}
                userOrderCount={userOrderCount}
                onRemoveCoupon={handleRemoveCoupon}
                onOpenAllCoupons={() => setShowCouponSheet(true)}
                onApplyCoupon={handleApplyCoupon}
              />

              {/* Delivery Address + Contact */}
              <CartAddressCard
                addressTypeLabel={
                  deliveryAddressMode === "current"
                    ? "Current location"
                    : getDisplayAddressLabel(defaultAddress?.label) || "Home"
                }
                addressLine={
                  deliveryAddressMode === "current"
                    ? (formatFullAddress(currentLocationAddress) || currentLocationAddress?.formattedAddress || currentLocationAddress?.address || "")
                    : (defaultAddress ? (formatFullAddress(defaultAddress) || defaultAddress?.formattedAddress || defaultAddress?.address || "") : "")
                }
                recipientName={recipientName}
                recipientPhone={recipientPhone || ""}
                hasAddress={hasSavedAddress}
                isCurrentLocation={deliveryAddressMode === "current"}
                isLoadingLocation={deliveryAddressMode === "current" && (currentLocationLoading || !currentLocationAddress)}
                showPicker={showAddressPicker || isEditingRecipient}
                onTogglePicker={() => {
                  setShowAddressPicker((prev) => !prev)
                  setIsEditingRecipient(false)
                }}
                onChangeAddress={() => {
                  setShowAddressPicker(true)
                }}
                pickerContent={(
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {["Home", "Work", "Other"].map((label) => {
                        const normalizedLabel = normalizeAddressLabel(label)
                        const addressExists = addresses.some((addr) => normalizeAddressLabel(addr.label) === normalizedLabel)
                        return (
                          <button
                            key={label}
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              handleSelectAddressByLabel(label)
                            }}
                            disabled={!addressExists}
                            className={`text-[11px] px-3 py-1 rounded-full font-semibold transition-all ${addressExists
                              ? "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300"
                              : "bg-gray-50 text-gray-400 border border-gray-100 cursor-not-allowed dark:bg-gray-900"
                              }`}
                          >
                            {label}
                          </button>
                        )
                      })}
                      <button
                        type="button"
                        onClick={openLocationSelector}
                        className="text-[11px] px-3 py-1 rounded-full font-semibold bg-[#fff3eb] text-[#FF6A00]"
                      >
                        New / Map
                      </button>
                    </div>
                    {addresses.length > 0 ? (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {addresses.map((address) => {
                          const addressId = getAddressId(address)
                          const isSelected = addressId && addressId === selectedAddressId
                          return (
                            <button
                              key={addressId || `${address.label}-${address.street}-${address.city}`}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                handleSelectSavedAddress(address)
                                setShowAddressPicker(false)
                              }}
                              className={`w-full text-left rounded-xl border p-2.5 transition-colors ${isSelected
                                ? "border-[#FF6A00] bg-[#fff3eb]/60 dark:bg-[#FF6A00]/5"
                                : "border-slate-100 dark:border-gray-800 hover:border-slate-200"
                                }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-gray-900 dark:text-gray-100">
                                    {getDisplayAddressLabel(address.label)}
                                  </p>
                                  <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
                                    {formatFullAddress(address) || address.address || "Address details"}
                                  </p>
                                </div>
                                {isSelected ? (
                                  <span className="text-[9px] bg-[#FF6A00] text-white px-1.5 py-0.5 rounded uppercase font-bold tracking-wider whitespace-nowrap">
                                    Selected
                                  </span>
                                ) : null}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                )}
                contactEditor={(
                  <div className="mt-3 pt-3 border-t border-dashed border-gray-200 dark:border-gray-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Recipient</p>
                      <button
                        type="button"
                        onClick={() => setIsEditingRecipient((prev) => !prev)}
                        className="text-[11px] font-bold text-[#FF6A00]"
                      >
                        {isEditingRecipient ? "Done" : "Edit"}
                      </button>
                    </div>
                    {isEditingRecipient ? (
                      <>
                        <input
                          type="text"
                          value={recipientDetails.name}
                          onChange={(e) =>
                            setRecipientDetails((prev) => ({
                              ...prev,
                              name: e.target.value,
                            }))
                          }
                          placeholder="Enter recipient name"
                          className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111111] px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-[#FF6A00]"
                        />
                        <input
                          type="tel"
                          value={recipientDetails.phone}
                          onChange={(e) =>
                            setRecipientDetails((prev) => ({
                              ...prev,
                              phone: sanitizeRecipientPhone(e.target.value),
                            }))
                          }
                          placeholder="Enter recipient phone"
                          className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111111] px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-[#FF6A00]"
                        />
                      </>
                    ) : (
                      <p className="text-xs text-gray-600 dark:text-gray-300">
                        {recipientName || "Recipient"}, {recipientPhone || "+91-XXXXXXXXXX"}
                      </p>
                    )}
                  </div>
                )}
              />

              {/* Bill Details */}
              <CartBillSummary
                showBillDetails={showBillDetails}
                onToggle={() => setShowBillDetails(!showBillDetails)}
                subtotal={subtotal}
                deliveryFee={deliveryFee}
                deliveryFeeBreakdownText={deliveryFeeBreakdownText}
                deliverySpeedFee={deliverySpeedFee}
                deliverySpeedLabel={selectedDeliverySpeedOption?.label}
                platformFee={platformFee}
                packagingFee={packagingFee}
                packagingMode={packagingMode}
                gstCharges={gstCharges}
                discount={discount}
                savings={savings}
                total={total}
                totalBeforeDiscount={totalBeforeDiscount}
                otherPlatformSubtotal={otherPlatformSubtotal}
                otherPlatformSavings={otherPlatformSavings}
              />


            </div>
          </div>
        </div>
      </div>

      {/* Bottom Sticky - Place Order */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 flex-shrink-0 border-t border-black/5 bg-white/95 shadow-[0_-10px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-[#151515]/95 lg:left-1/2 lg:w-full lg:-translate-x-1/2"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto max-w-3xl px-3 py-2.5 sm:px-5">
          <div className="w-full space-y-2">
            {/* Pay Using - Slim Pro UI */}
            <div
              className="flex cursor-pointer items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-2.5 py-2 transition active:scale-[0.99] dark:border-white/10 dark:bg-white/5"
              onClick={() => setShowPaymentSheet(true)}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#fff3eb] dark:bg-[#FF6A00]/10">
                  {selectedPaymentMethod === "wallet" ? (
                    <Wallet className="h-4 w-4 text-[#FF6A00]" />
                  ) : selectedPaymentMethod === "razorpay" ? (
                    <Zap className="h-4 w-4 text-[#FF6A00]" />
                  ) : (
                    <Banknote className="h-4 w-4 text-[#FF6A00]" />
                  )}
                </div>
                <div className="leading-tight">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em] text-gray-400">
                    PAYING WITH
                  </p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-black text-gray-950 dark:text-gray-100">
                      {selectedPaymentLabel}
                    </p>
                    {selectedPaymentMethod === "wallet" && (
                      <p className="text-[10px] text-green-600 dark:text-green-400 font-bold bg-green-50 dark:bg-green-900/20 px-1 rounded">
                        {RUPEE_SYMBOL}{walletBalance.toFixed(0)}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-0.5 rounded-lg bg-[#fff3eb] px-2 py-1 text-[10px] font-black uppercase tracking-widest text-[#FF6A00] dark:bg-[#FF6A00]/10">
                CHANGE <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </div>

            {/* Place Order Button */}
            <button
              onClick={handlePlaceOrder}
              disabled={isPlacingOrder || (selectedPaymentMethod === "wallet" && walletBalance < total)}
              className="flex h-12 w-full items-center justify-between rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#f97316] px-3.5 font-black text-white shadow-lg shadow-orange-500/25 transition-transform active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
            >
              <div className="flex flex-col justify-center border-r border-white/25 pr-3 text-left">
                <span className="text-sm font-black tabular-nums text-white">{RUPEE_SYMBOL}{total.toFixed(0)}</span>
                {savings > 0 ? (
                  <span className="mt-[-1px] text-[9px] font-bold uppercase tracking-wide text-white/80">
                    Saved {RUPEE_SYMBOL}{savings.toFixed(0)}
                  </span>
                ) : (
                  <span className="mt-[-1px] text-[9px] font-black uppercase tracking-wider text-white/75">To pay</span>
                )}
              </div>
              <div className="mx-auto flex items-center gap-1 text-sm tracking-wide sm:text-base">
                {isPlacingOrder
                  ? "Processing..."
                  : !hasSavedAddress
                    ? "Select Address"
                    : "Proceed to Checkout"}
                <ChevronRight className="h-4 w-4" />
              </div>
            </button>
          </div>
        </div>
      </div>

      <CartCouponSheet
        open={showCouponSheet}
        onClose={() => setShowCouponSheet(false)}
        coupons={availableCoupons}
        subtotal={subtotal}
        userOrderCount={userOrderCount}
        appliedCode={appliedCoupon?.code || couponCode || ""}
        applyingCode={applyingCouponCode}
        manualCouponCode={manualCouponCode}
        onManualCodeChange={setManualCouponCode}
        onApplyManual={handleApplyCouponCode}
        onApplyCoupon={handleApplyCoupon}
      />

      {/* Placing Order Modal */}
      {showPlacingOrder && (
        <div className="fixed inset-0 z-[60] h-screen w-full overflow-hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          {/* Modal Sheet */}
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl overflow-hidden"
            style={{ animation: 'slideUpModal 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
          >
            <div className="px-6 py-8">
              {/* Title */}
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Placing your order</h2>

              {/* Payment Info */}
              <div className="flex items-center gap-4 mb-5">
                <div className="w-14 h-14 rounded-xl border border-gray-200 flex items-center justify-center bg-white shadow-sm">
                  <CreditCard className="w-6 h-6 text-gray-600" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-900">
                    {selectedPaymentMethod === "razorpay"
                      ? `Pay ${RUPEE_SYMBOL}${total.toFixed(2)} online (Razorpay)`
                      : selectedPaymentMethod === "wallet"
                        ? `Pay ${RUPEE_SYMBOL}${total.toFixed(2)} from Wallet`
                        : `Pay on delivery (COD)`}
                  </p>
                </div>
              </div>

              {/* Delivery Address */}
              <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 rounded-xl border border-gray-200 flex items-center justify-center bg-gray-50">
                  <svg className="w-7 h-7 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path d="M9 22V12h6v10" />
                  </svg>
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-900">Delivering to Location</p>
                  <p className="text-sm text-gray-600 mt-1">
                    {defaultAddress ? (formatFullAddress(defaultAddress) || defaultAddress?.formattedAddress || defaultAddress?.address || "Address") : "Add address"}
                  </p>
                  <p className="text-sm text-gray-500">
                    {defaultAddress ? (formatFullAddress(defaultAddress) || "Address") : "Address"}
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="relative mb-6">
                <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#FF6A00] to-[#C83C00] rounded-full transition-all duration-100 ease-linear"
                    style={{
                      width: `${orderProgress}%`,
                      boxShadow: '0 0 10px rgba(235, 89, 14, 0.5)'
                    }}
                  />
                </div>
                {/* Animated shimmer effect */}
                <div
                  className="absolute inset-0 h-2.5 rounded-full overflow-hidden pointer-events-none"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                    animation: 'shimmer 1.5s infinite',
                    width: `${orderProgress}%`
                  }}
                />
              </div>

              {/* Cancel Button */}
              <button
                onClick={() => {
                  setShowPlacingOrder(false)
                  setIsPlacingOrder(false)
                }}
                className="w-full text-right"
              >
                <span className="text-[#FF6A00] font-semibold text-base hover:text-[#C83C00] transition-colors">
                  CANCEL
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Success Celebration Page */}
      {showOrderSuccess && (
        <div
          className="fixed inset-0 z-[70] bg-white dark:bg-[#0a0a0a] flex h-screen w-full flex-col items-center justify-center overflow-hidden"
          style={{ animation: 'fadeIn 0.3s ease-out' }}
        >
          {/* Confetti Background */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {/* Animated confetti pieces */}
            {[...Array(50)].map((_, i) => (
              <div
                key={i}
                className="absolute w-3 h-3 rounded-sm"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `-10%`,
                  backgroundColor: ['#FF6A00', '#3b82f6', '#f59e0b', '#ef4444', '#C83C00', '#ec4899'][Math.floor(Math.random() * 6)],
                  animation: `confettiFall ${2 + Math.random() * 2}s linear ${Math.random() * 2}s infinite`,
                  transform: `rotate(${Math.random() * 360}deg)`,
                }}
              />
            ))}
          </div>

          {/* Success Content */}
          <div className="relative z-10 flex flex-col items-center px-6">
            {/* Success Tick Circle */}
            <div
              className="relative mb-8"
              style={{ animation: 'scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both' }}
            >
              {/* Outer ring animation */}
              <div
                className="absolute inset-0 w-32 h-32 rounded-full border-4 border-green-500 dark:border-green-400"
                style={{
                  animation: 'ringPulse 1.5s ease-out infinite',
                  opacity: 0.3
                }}
              />
              {/* Main circle */}
              <div className="w-32 h-32 bg-gradient-to-br from-green-500 to-green-600 dark:from-green-500 dark:to-emerald-500 rounded-full flex items-center justify-center shadow-2xl shadow-green-200/60 dark:shadow-green-900/40">
                <svg
                  className="w-16 h-16 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ animation: 'checkDraw 0.5s ease-out 0.5s both' }}
                >
                  <path d="M5 12l5 5L19 7" className="check-path" />
                </svg>
              </div>
              {/* Sparkles */}
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-2 h-2 bg-yellow-400 dark:bg-yellow-300 rounded-full"
                  style={{
                    top: '50%',
                    left: '50%',
                    animation: `sparkle 0.6s ease-out ${0.3 + i * 0.1}s both`,
                    transform: `rotate(${i * 60}deg) translateY(-80px)`,
                  }}
                />
              ))}
            </div>

            {/* Location Info */}
            <div
              className="text-center"
              style={{ animation: 'slideUp 0.5s ease-out 0.6s both' }}
            >
              <div className="flex items-center justify-center gap-2 mb-2">
                <div className="w-5 h-5 text-red-500 dark:text-red-400">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {defaultAddress?.city || "Your Location"}
                </h2>
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-base">
                {defaultAddress ? (formatFullAddress(defaultAddress) || defaultAddress?.formattedAddress || defaultAddress?.address || "Delivery Address") : "Delivery Address"}
              </p>
            </div>

            {/* Order Placed Message */}
            <div
              className="mt-12 text-center"
              style={{ animation: 'slideUp 0.5s ease-out 0.8s both' }}
            >
              <h3 className="text-3xl font-bold text-[#FF6A00] dark:text-red-400 mb-2">Order Placed!</h3>
              <p className="text-gray-600 dark:text-gray-300">Your delicious food is on its way</p>
            </div>

            {/* Action Button */}
            <button
              onClick={handleGoToOrders}
              className="mt-10 bg-[#FF6A00] hover:bg-[#C83C00] text-white font-semibold py-4 px-12 rounded-xl shadow-lg shadow-red-200/70 dark:shadow-red-950/40 transition-all hover:shadow-xl hover:scale-105"
              style={{ animation: 'slideUp 0.5s ease-out 1s both' }}
            >
              Track Your Order
            </button>
          </div>
        </div>
      )}

      {/* Payment Selection Bottom Sheet */}
      <AnimatePresence>
        {showPaymentSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPaymentSheet(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 350 }}
              className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#1a1a1a] rounded-t-[2rem] z-[101] shadow-2xl overflow-hidden max-h-[82vh] md:max-h-[60vh] flex flex-col"
              style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            >
              <div className="p-5 md:p-6 flex flex-col h-full min-h-0">
                {/* Compact Drag handle */}
                <div className="w-10 h-1 bg-gray-200 dark:bg-gray-800 rounded-full mx-auto mb-5" />

                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white leading-none">Payment Method</h2>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-tighter mt-1">Select how you want to pay</p>
                  </div>
                  <button
                    onClick={() => setShowPaymentSheet(false)}
                    className="w-8 h-8 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>

                <div className="space-y-3 overflow-y-auto pr-1 custom-scrollbar pb-4 flex-1 min-h-0">
                  {paymentOptions.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => {
                        if (!option.disabled) {
                          setSelectedPaymentMethod(option.id)
                          setShowPaymentSheet(false)
                        }
                      }}
                      className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all duration-300 group ${selectedPaymentMethod === option.id
                        ? 'border-[#FF6A00] bg-[#FF6A00] shadow-lg shadow-orange-500/30'
                        : 'border-gray-100 dark:border-gray-800/80 bg-white dark:bg-[#222222] hover:border-red-200 dark:hover:border-red-900/30 shadow-sm'
                        } ${option.disabled ? 'opacity-40 grayscale-[0.8] cursor-not-allowed' : 'cursor-pointer active:scale-[0.98]'}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 ${selectedPaymentMethod === option.id
                          ? 'bg-white/20 text-white'
                          : option.color
                          }`}>
                          {option.icon}
                        </div>
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold tracking-tight leading-none transition-colors ${selectedPaymentMethod === option.id ? 'text-white' : 'text-gray-900 dark:text-gray-100'
                              }`}>
                              {option.name}
                            </span>
                            {option.badge && (
                              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full shadow-sm tracking-wider ${selectedPaymentMethod === option.id
                                ? 'bg-white/20 text-white'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                }`}>
                                {option.badge}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <p className={`text-[11px] font-bold transition-colors ${selectedPaymentMethod === option.id ? 'text-white/80' : 'text-gray-400'
                              }`}>
                              {option.description}
                            </p>
                            {option.subInfo && !option.disabled && (
                              <>
                                <span className={`w-1 h-1 rounded-full ${selectedPaymentMethod === option.id ? 'bg-white/40' : 'bg-red-300 dark:bg-red-700'
                                  }`} />
                                <p className={`text-[10px] font-bold uppercase tracking-tighter transition-colors ${selectedPaymentMethod === option.id ? 'text-white' : 'text-green-600 dark:text-green-500'
                                  }`}>
                                  {option.subInfo}
                                </p>
                              </>
                            )}
                          </div>
                          {option.disabled && (
                            <p className="text-[9px] font-bold text-red-500 mt-1 uppercase tracking-wide">
                              {option.disabledText}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${selectedPaymentMethod === option.id
                        ? 'bg-white border-white'
                        : 'border-gray-200 dark:border-gray-700'
                        }`}>
                        {selectedPaymentMethod === option.id && <Check className="w-3.5 h-3.5 text-[#FF6A00]" strokeWidth={4} />}
                      </div>
                    </button>
                  ))}
                </div>

                <div
                  className="mt-auto pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center gap-4 bg-white dark:bg-[#1a1a1a]"
                  style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom, 0px))" }}
                >
                  <div className="flex-shrink-0">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Total Pay</p>
                    <p className="text-xl font-bold text-[#FF6A00] tabular-nums">{RUPEE_SYMBOL}{total.toFixed(0)}</p>
                  </div>
                  <Button
                    onClick={() => setShowPaymentSheet(false)}
                    className="flex-1 bg-[#FF6A00] hover:bg-[#C83C00] text-white h-11 rounded-xl text-sm font-bold shadow-lg shadow-orange-500/20 transition-all active:scale-[0.98]"
                  >
                    Confirm Order
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Animation Styles */}
      <style>{`
        @keyframes fadeInBackdrop {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUpBannerSmooth {
          from { transform: translateY(100%) scale(0.95); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes slideUpBanner {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes shimmerBanner {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes scaleInBounce {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes pulseRing {
          0% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.4); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
        @keyframes checkMarkDraw {
          0% { stroke-dasharray: 100; stroke-dashoffset: 100; opacity: 0; }
          50% { opacity: 1; }
          100% { stroke-dasharray: 100; stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes slideUpFull {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes slideUpModal {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes checkDraw {
          0% { stroke-dasharray: 100; stroke-dashoffset: 100; }
          100% { stroke-dasharray: 100; stroke-dashoffset: 0; }
        }
        @keyframes ringPulse {
          0% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.3); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
        @keyframes sparkle {
          0% { transform: rotate(var(--rotation, 0deg)) translateY(0) scale(0); opacity: 1; }
          100% { transform: rotate(var(--rotation, 0deg)) translateY(-80px) scale(1); opacity: 0; }
        }
        @keyframes slideUp {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes confettiFall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
        .animate-slideUpFull {
          animation: slideUpFull 0.3s ease-out;
        }
        .check-path {
          stroke-dasharray: 100;
          stroke-dashoffset: 0;
        }
      `}</style>

      {/* Share Modal */}
      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {showShareModal && sharePayload && (
              <>
                <motion.div
                  className="fixed inset-0 bg-black/50 z-[10020]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowShareModal(false)}
                />
                <motion.div
                  className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10021] w-[92vw] max-w-md bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.16 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-5 pt-5 pb-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">Share</h3>
                    <button
                      className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                      onClick={() => setShowShareModal(false)}
                      aria-label="Close share modal"
                    >
                      <X className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                    </button>
                  </div>

                  <div className="px-5 py-4 space-y-2">
                    {typeof navigator !== "undefined" && navigator.share && (
                      <button
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-left"
                        onClick={handleSystemShareFromModal}
                      >
                        <Share2 className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">Share via system apps</span>
                      </button>
                    )}
                    <button
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-left"
                      onClick={() => openShareTarget("whatsapp")}
                    >
                      <MessageCircle className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">WhatsApp</span>
                    </button>
                    <button
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-left"
                      onClick={() => openShareTarget("telegram")}
                    >
                      <Send className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">Telegram</span>
                    </button>
                    <button
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-left"
                      onClick={() => openShareTarget("email")}
                    >
                      <Mail className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">Email</span>
                    </button>
                    <button
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-left"
                      onClick={copyShareLink}
                    >
                      <Copy className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">Copy link</span>
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  )
}      
