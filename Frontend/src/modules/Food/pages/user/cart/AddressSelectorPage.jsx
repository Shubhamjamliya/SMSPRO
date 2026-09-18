import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate, useLocation as useRouterLocation } from "react-router-dom"
import { ChevronLeft, ChevronRight, Plus, MapPin, Navigation, Home, Building2, Briefcase, Search, Pencil } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { Label } from "@food/components/ui/label"
import { useLocation as useGeoLocation } from "@food/hooks/useLocation"
import { useProfile } from "@food/context/ProfileContext"
import { toast } from "sonner"
import { locationAPI } from "@food/api"
import AnimatedPage from "@food/components/user/AnimatedPage"
import { loadGoogleMaps } from "@/core/services/googleMapsLoader"
import {
  clearAddressSelectorContext,
  persistAddressSelectorContext,
  resolveAddressSelectorReturnPath,
} from "@food/utils/addressSelectorNavigation"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

// Enable Maps if API Key is available, otherwise fallback to coordinates-only mode
const MAPS_ENABLED = !!import.meta.env.VITE_GOOGLE_MAPS_API_KEY

/** Ignore tiny center drift from map resize/projection (~25m). */
const GEOCODE_MIN_MOVE_METERS = 25
/** Debounce reverse-geocode after user finishes dragging/zooming. */
const GEOCODE_DEBOUNCE_MS = 700

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3 // Earth's radius in meters
  const lat1Rad = lat1 * Math.PI / 180
  const lat2Rad = lat2 * Math.PI / 180
  const deltaLat = (lat2 - lat1) * Math.PI / 180
  const deltaLon = (lon2 - lon1) * Math.PI / 180

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // Distance in meters
}

// Get icon based on address type/label
const getAddressIcon = (address) => {
  const label = (address.label || address.additionalDetails || "").toLowerCase()
  if (label.includes("home")) return Home
  if (label.includes("work") || label.includes("office")) return Briefcase
  if (label.includes("building") || label.includes("apt")) return Building2
  return Home
}

const buildLocationPayloadFromAddress = (address) => {
  if (!address || typeof address !== "object") return null

  const coordinates = Array.isArray(address.location?.coordinates)
    ? address.location.coordinates
    : []
  const longitude = Number(
    coordinates[0] ?? address.longitude ?? address.lng ?? null,
  )
  const latitude = Number(
    coordinates[1] ?? address.latitude ?? address.lat ?? null,
  )

  const street = String(address.street || "").trim()
  const area = String(address.additionalDetails || address.area || "").trim()
  const city = String(address.city || "").trim()
  const state = String(address.state || "").trim()
  const zipCode = String(address.zipCode || address.postalCode || "").trim()
  const formattedAddress =
    String(address.formattedAddress || "").trim() ||
    [area, street, city, state, zipCode].filter(Boolean).join(", ") ||
    [street, city, state].filter(Boolean).join(", ")

  return {
    label: address.label || "Home",
    latitude: Number.isFinite(latitude) ? latitude : undefined,
    longitude: Number.isFinite(longitude) ? longitude : undefined,
    street,
    area,
    city,
    state,
    zipCode,
    postalCode: zipCode,
    address: [street, city].filter(Boolean).join(", ") || formattedAddress,
    formattedAddress,
  }
}

const persistSelectedLocation = (locationData) => {
  if (!locationData) return
  try {
    localStorage.setItem("userLocation", JSON.stringify(locationData))
    window.dispatchEvent(
      new CustomEvent("userLocationUpdated", {
        detail: { location: locationData },
      }),
    )
  } catch {
    // Ignore storage/event sync errors so selection still works.
  }
}

export default function AddressSelectorPage() {
  const navigate = useNavigate()
  const routerLocation = useRouterLocation()
  const { location, requestLocation, reverseGeocode } = useGeoLocation()
  const { addresses = [], addAddress, updateAddress, setDefaultAddress } = useProfile()
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [editingAddressId, setEditingAddressId] = useState(null)
  const [mapPosition, setMapPosition] = useState([22.7196, 75.8577]) // Default Indore coordinates [lat, lng]
  const [addressFormData, setAddressFormData] = useState({
    street: "",
    city: "",
    state: "",
    zipCode: "",
    additionalDetails: "",
    landmark: "",
    area: "",
    label: "Home",
    phone: "",
  })
  const [formErrors, setFormErrors] = useState({})
  const [loadingAddress, setLoadingAddress] = useState(false)
  const [mapLoading, setMapLoading] = useState(false)
  const mapContainerRef = useRef(null)
  const googleMapRef = useRef(null) // Google Maps instance
  const mapListenersRef = useRef([])
  const mapIdleTimeoutRef = useRef(null)
  const userGestureRef = useRef(false) // true only while user pans/zooms
  const skipNextGeocodeRef = useRef(false) // skip after programmatic panTo / resize
  const lastGeocodedCoordsRef = useRef({ lat: null, lng: null })
  const mapPositionRef = useRef(mapPosition)
  const handleMapMoveEndRef = useRef(null)
  const [currentAddress, setCurrentAddress] = useState("")
  const [addressAutocompleteValue, setAddressAutocompleteValue] = useState("")
  const [keywordAddressSuggestions, setKeywordAddressSuggestions] = useState([])
  const [isKeywordSearching, setIsKeywordSearching] = useState(false)
  const [GOOGLE_MAPS_API_KEY, setGOOGLE_MAPS_API_KEY] = useState(null)
  const [mapUnavailable, setMapUnavailable] = useState(false)
  const [keyboardInset, setKeyboardInset] = useState(0)
  const formBodyRef = useRef(null)
  const hasInitializedRef = useRef(false)
  const manualFieldRefs = useRef({})
  const openedEditFromStateRef = useRef(false)

  useEffect(() => {
    mapPositionRef.current = mapPosition
  }, [mapPosition])

  // Sync currentAddress and mapPosition with the useLocation hook's location address on load/update
  useEffect(() => {
    if (location && (location.formattedAddress || location.address)) {
      const addrText = location.formattedAddress || location.address || ""
      setCurrentAddress(addrText)
      
      if (!hasInitializedRef.current && location.latitude && location.longitude) {
        hasInitializedRef.current = true
        setMapPosition([location.latitude, location.longitude])
        lastGeocodedCoordsRef.current = { lat: location.latitude, lng: location.longitude }
        
        // Sync addressFormData on initial load/first set if form values are empty
        setAddressFormData(prev => {
          if (prev.street || prev.city) return prev
          return {
            ...prev,
            street: location.street || location.area || "",
            city: location.city || "",
            state: location.state || "",
            zipCode: location.postalCode || location.zipCode || "",
          }
        })
      }
    }
  }, [location])

  const ENABLE_LOCATION_REVERSE_GEOCODE = import.meta.env.VITE_ENABLE_LOCATION_REVERSE_GEOCODE !== "false"
  const ENABLE_NOMINATIM_SEARCH = import.meta.env.VITE_ENABLE_NOMINATIM_SEARCH !== "false"
  const getAddressId = (address) => address?.id || address?._id || null

  const emptyAddressForm = useCallback(() => ({
    street: "",
    city: "",
    state: "",
    zipCode: "",
    additionalDetails: "",
    landmark: "",
    area: "",
    label: "Home",
    phone: "",
  }), [])

  const extractCoords = (address) => {
    const coordinates = Array.isArray(address?.location?.coordinates)
      ? address.location.coordinates
      : []
    const longitude = Number(coordinates[0] ?? address?.longitude ?? address?.lng ?? NaN)
    const latitude = Number(coordinates[1] ?? address?.latitude ?? address?.lat ?? NaN)
    return {
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
    }
  }

  const buildFormFromAddress = useCallback((address) => {
    const labelRaw = String(address?.label || "Home")
    const label =
      labelRaw === "Office" || labelRaw.toLowerCase() === "work"
        ? "Work"
        : labelRaw === "Other"
          ? "Other"
          : "Home"
    return {
      street: String(address?.street || address?.area || "").trim(),
      city: String(address?.city || "").trim(),
      state: String(address?.state || "").trim(),
      zipCode: String(address?.zipCode || address?.postalCode || address?.pincode || "").trim(),
      additionalDetails: String(address?.additionalDetails || "").trim(),
      landmark: String(address?.landmark || "").trim(),
      area: String(address?.area || "").trim(),
      label,
      phone: String(address?.phone || "").trim(),
    }
  }, [])

  const openAddressForm = useCallback((address = null) => {
    setFormErrors({})
    setAddressAutocompleteValue("")
    setKeywordAddressSuggestions([])
    if (address) {
      const id = getAddressId(address)
      setEditingAddressId(id ? String(id) : null)
      setAddressFormData(buildFormFromAddress(address))
      const { latitude, longitude } = extractCoords(address)
      if (latitude != null && longitude != null) {
        setMapPosition([latitude, longitude])
        lastGeocodedCoordsRef.current = { lat: latitude, lng: longitude }
      }
      const display =
        address.formattedAddress
        || [address.additionalDetails, address.street, address.city, address.state]
          .filter(Boolean)
          .join(", ")
      setCurrentAddress(display || "")
    } else {
      setEditingAddressId(null)
      const hasHome = addresses.some((item) => String(item.label || "").toLowerCase() === "home")
      const hasOffice = addresses.some((item) => {
        const label = String(item.label || "").toLowerCase()
        return label === "office" || label === "work"
      })
      setAddressFormData({
        ...emptyAddressForm(),
        label: hasHome && hasOffice ? "Other" : hasHome ? "Work" : "Home",
        street: location?.street || location?.area || "",
        city: location?.city || "",
        state: location?.state || "",
        zipCode: location?.postalCode || location?.zipCode || "",
      })
      if (location?.latitude && location?.longitude) {
        setMapPosition([location.latitude, location.longitude])
        lastGeocodedCoordsRef.current = {
          lat: location.latitude,
          lng: location.longitude,
        }
      }
      setCurrentAddress(location?.formattedAddress || location?.address || "")
    }
    setShowAddressForm(true)
  }, [addresses, buildFormFromAddress, emptyAddressForm, location])

  const getReturnPath = useCallback(() => {
    return resolveAddressSelectorReturnPath({
      search: routerLocation.search,
      state: routerLocation.state,
    })
  }, [routerLocation.search, routerLocation.state])

  const navigateBackToOrigin = useCallback((options = {}) => {
    const target = getReturnPath()
    clearAddressSelectorContext()
    navigate(target, { replace: Boolean(options.replace) })
  }, [getReturnPath, navigate])

  useEffect(() => {
    const params = new URLSearchParams(routerLocation.search || "")
    persistAddressSelectorContext({
      module: routerLocation.state?.module || params.get("module"),
      from: routerLocation.state?.from,
      backTo: routerLocation.state?.backTo,
    })
  }, [routerLocation.state, routerLocation.search])

  // Deep-link / edit intent from profile Saved Addresses
  useEffect(() => {
    const editId = routerLocation.state?.editAddressId
    if (!editId || !addresses?.length || openedEditFromStateRef.current) return
    const match = addresses.find(
      (addr) => String(getAddressId(addr)) === String(editId),
    )
    if (match) {
      openedEditFromStateRef.current = true
      openAddressForm(match)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses, routerLocation.state?.editAddressId])

  const handleBack = () => {
    navigateBackToOrigin({ replace: true })
  }

  // Load Google Maps API key
  useEffect(() => {
    if (!MAPS_ENABLED) return
    import('@food/utils/googleMapsApiKey.js').then(({ getGoogleMapsApiKey }) => {
      getGoogleMapsApiKey().then(key => {
        setGOOGLE_MAPS_API_KEY(key)
      })
    })
  }, [])

  // Address search: centralized Places autocomplete first (backend key,
  // location-biased when we know the user's position), Nominatim as fallback.
  useEffect(() => {
    if (!showAddressForm) return
    const q = String(addressAutocompleteValue || "").trim()
    if (!ENABLE_NOMINATIM_SEARCH || q.length < 3) {
      setKeywordAddressSuggestions([])
      setIsKeywordSearching(false)
      return
    }

    const refLat = Number(location?.latitude)
    const refLng = Number(location?.longitude)
    const hasRef = Number.isFinite(refLat) && Number.isFinite(refLng)

    const t = setTimeout(async () => {
      try {
        setIsKeywordSearching(true)

        // 1) Backend Places autocomplete (coordinates resolved on selection)
        try {
          const res = await locationAPI.autocomplete(q, hasRef
            ? { latitude: refLat, longitude: refLng }
            : {})
          const suggestions = res?.data?.data?.suggestions || []
          if (suggestions.length > 0) {
            setKeywordAddressSuggestions(
              suggestions.slice(0, 4).map((p) => ({
                id: p.placeId,
                placeId: p.placeId,
                display: p.description || p.mainText || "",
                lat: null,
                lng: null,
                address: { city: p.secondaryText || "" },
              }))
            )
            return
          }
        } catch {
          // backend unavailable — fall through to Nominatim
        }

        // 2) Nominatim fallback
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=10&q=${encodeURIComponent(q)}`
        const res = await fetch(url, { headers: { Accept: "application/json" } })
        const json = await res.json()
        const mapped = (Array.isArray(json) ? json : []).map(r => ({
          id: r.place_id || r.osm_id,
          display: r.display_name || "",
          lat: Number(r.lat),
          lng: Number(r.lon),
          address: r.address || {},
        })).filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lng))
        const sorted = hasRef
          ? mapped
            .map(x => ({ ...x, distanceMeters: calculateDistance(refLat, refLng, x.lat, x.lng) }))
            .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))
          : mapped
        setKeywordAddressSuggestions(sorted.slice(0, 4))
      } catch (e) {
        setKeywordAddressSuggestions([])
      } finally {
        setIsKeywordSearching(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [addressAutocompleteValue, showAddressForm, location?.latitude, location?.longitude, ENABLE_NOMINATIM_SEARCH])

  // Map Initialization — reverse-geocode ONLY after intentional user pan/zoom, never on resize.
  useEffect(() => {
    if (!MAPS_ENABLED || mapUnavailable || !showAddressForm || !mapContainerRef.current || !GOOGLE_MAPS_API_KEY) return

    let isMounted = true
    setMapLoading(true)

    const clearMapListeners = () => {
      mapListenersRef.current.forEach((listener) => {
        try {
          if (listener?.remove) listener.remove()
          else if (window.google?.maps?.event?.removeListener) {
            window.google.maps.event.removeListener(listener)
          }
        } catch {
          // ignore
        }
      })
      mapListenersRef.current = []
      if (mapIdleTimeoutRef.current) {
        clearTimeout(mapIdleTimeoutRef.current)
        mapIdleTimeoutRef.current = null
      }
    }

    const initializeGoogleMap = async () => {
      try {
        const maps = await loadGoogleMaps(GOOGLE_MAPS_API_KEY)
        const google = typeof window !== "undefined" ? window.google : null
        if (!maps || !google?.maps?.Map) {
          throw new Error("Google Maps is unavailable")
        }
        if (!isMounted || !mapContainerRef.current) return

        // Destroy previous map instance if re-opening form
        clearMapListeners()
        googleMapRef.current = null

        const [lat0, lng0] = mapPositionRef.current
        const initialPos = { lat: lat0, lng: lng0 }

        const map = new google.maps.Map(mapContainerRef.current, {
          center: initialPos,
          zoom: 16,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          styles: [
            { featureType: "poi", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] }
          ]
        })
        googleMapRef.current = map
        lastGeocodedCoordsRef.current = { lat: initialPos.lat, lng: initialPos.lng }
        skipNextGeocodeRef.current = true // initial idle after create — do not geocode

        const markUserGesture = () => {
          userGestureRef.current = true
        }

        mapListenersRef.current.push(
          map.addListener("dragstart", markUserGesture),
          map.addListener("mousedown", markUserGesture),
          map.addListener("touchstart", markUserGesture),
          map.addListener("zoom_changed", () => {
            // Programmatic zoom sets skipNextGeocodeRef first; ignore those.
            if (!skipNextGeocodeRef.current) {
              userGestureRef.current = true
            }
          }),
        )

        mapListenersRef.current.push(
          map.addListener("idle", () => {
            // Resize / projection settle without user gesture → ignore reverse-geocode
            if (skipNextGeocodeRef.current) {
              skipNextGeocodeRef.current = false
              userGestureRef.current = false
              return
            }
            if (!userGestureRef.current) return

            clearTimeout(mapIdleTimeoutRef.current)
            mapIdleTimeoutRef.current = setTimeout(() => {
              userGestureRef.current = false
              const center = map.getCenter()
              if (!center) return
              const lat = center.lat()
              const lng = center.lng()
              const prev = lastGeocodedCoordsRef.current
              const moved =
                prev.lat == null || prev.lng == null
                  ? Infinity
                  : calculateDistance(prev.lat, prev.lng, lat, lng)

              if (moved < GEOCODE_MIN_MOVE_METERS) return

              lastGeocodedCoordsRef.current = { lat, lng }
              setMapPosition([lat, lng])
              handleMapMoveEndRef.current?.(lat, lng)
            }, GEOCODE_DEBOUNCE_MS)
          })
        )

        // Keep map center stable when container size changes (no reverse-geocode)
        let resizeDebounce = null
        const resizeObserver = typeof ResizeObserver !== "undefined"
          ? new ResizeObserver(() => {
              if (!googleMapRef.current || !window.google?.maps?.event) return
              clearTimeout(resizeDebounce)
              resizeDebounce = setTimeout(() => {
                const center = googleMapRef.current?.getCenter?.()
                skipNextGeocodeRef.current = true
                window.google.maps.event.trigger(googleMapRef.current, "resize")
                if (center) {
                  googleMapRef.current.setCenter(center)
                }
              }, 120)
            })
          : null

        if (resizeObserver && mapContainerRef.current) {
          resizeObserver.observe(mapContainerRef.current)
        }

        // Stash observer on map ref for cleanup via listeners array pattern
        mapListenersRef.current.push({
          remove: () => {
            clearTimeout(resizeDebounce)
            try { resizeObserver?.disconnect() } catch { /* ignore */ }
          }
        })

        setMapLoading(false)
      } catch (err) {
        debugError("Map init error:", err)
        setMapUnavailable(true)
        setMapLoading(false)
      }
    }
    initializeGoogleMap()
    return () => {
      isMounted = false
      clearMapListeners()
    }
  // handleMapMoveEnd is stable via useCallback below; intentionally omit mapPosition to avoid remount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddressForm, GOOGLE_MAPS_API_KEY, mapUnavailable])

  const panMapProgrammatically = useCallback((lat, lng, zoom = 17) => {
    if (!googleMapRef.current) return
    skipNextGeocodeRef.current = true
    userGestureRef.current = false
    googleMapRef.current.panTo({ lat, lng })
    if (zoom != null) googleMapRef.current.setZoom(zoom)
  }, [])

  const handleUseCurrentLocation = async () => {
    try {
      toast.loading("Getting location...", { id: "geo" })
      const loc = await requestLocation(true, true)
      
      if (loc?.latitude) {
        // Update state
        const newPos = [loc.latitude, loc.longitude]
        setMapPosition(newPos)
        lastGeocodedCoordsRef.current = { lat: loc.latitude, lng: loc.longitude }
        setCurrentAddress(loc.formattedAddress || loc.address || "")
        
        // Persist
        persistSelectedLocation(loc)
        try { localStorage.setItem("deliveryAddressMode", "current") } catch {}
        
        // Update map without triggering reverse-geocode (already have address)
        panMapProgrammatically(loc.latitude, loc.longitude, 17)
        
        // Update form data if form is open
        if (showAddressForm) {
          setAddressFormData(prev => ({
            ...prev,
            street: loc.street || loc.area || prev.street,
            city: loc.city || prev.city,
            state: loc.state || prev.state,
            zipCode: loc.postalCode || prev.zipCode,
          }))
          toast.success("Location updated", { id: "geo" })
          // Don't redirect if they are explicitly in the "Add Address" form
        } else {
          toast.success("Location updated", { id: "geo" })
          // Redirect back to the originating module (bike-rent / food / etc.)
          setTimeout(() => {
            navigateBackToOrigin({ replace: true })
          }, 800)
        }
      } else {
        toast.error("Could not determine location", { id: "geo" })
      }
    } catch (e) {
      toast.error("Failed to get location", { id: "geo" })
    }
  }

  const handleSelectSavedAddress = async (address) => {
    const id = getAddressId(address)
    if (id) {
      await setDefaultAddress(id)
      persistSelectedLocation(buildLocationPayloadFromAddress(address))
      try { localStorage.setItem("deliveryAddressMode", "saved") } catch {}
      toast.success("Address selected")
      
      setTimeout(() => {
        navigateBackToOrigin({ replace: true })
      }, 500)
    }
  }

  const handleAddAddressClick = () => {
    openAddressForm(null)
  }

  const handleEditAddressClick = (event, address) => {
    event.preventDefault()
    event.stopPropagation()
    openAddressForm(address)
  }

  const handleCancelAddressForm = () => {
    setShowAddressForm(false)
    setEditingAddressId(null)
    setFormErrors({})
    setAddressFormData(emptyAddressForm())
    setAddressAutocompleteValue("")
    setKeywordAddressSuggestions([])
  }

  const scrollFieldIntoView = useCallback((fieldName) => {
    const el = manualFieldRefs.current?.[fieldName]
    if (!el) return
    setTimeout(() => {
      try {
        const scrollHost = formBodyRef.current
        if (!scrollHost) {
          el.scrollIntoView({ behavior: "smooth", block: "center" })
          return
        }
        const hostRect = scrollHost.getBoundingClientRect()
        const elRect = el.getBoundingClientRect()
        const viewportHeight =
          typeof window !== "undefined" && window.visualViewport
            ? window.visualViewport.height
            : window.innerHeight
        const safeBottom = viewportHeight - keyboardInset - 90
        const overBy = elRect.bottom - safeBottom
        if (overBy > 0) {
          scrollHost.scrollTo({
            top: scrollHost.scrollTop + overBy + 24,
            behavior: "smooth",
          })
          return
        }
        if (elRect.top < hostRect.top + 70) {
          const upBy = hostRect.top + 70 - elRect.top
          scrollHost.scrollTo({
            top: Math.max(0, scrollHost.scrollTop - upBy - 12),
            behavior: "smooth",
          })
          return
        }
        el.scrollIntoView({ behavior: "smooth", block: "center" })
      } catch {
        // Ignore scrolling errors.
      }
    }, 120)
  }, [keyboardInset])

  const handleMapMoveEnd = useCallback(async (lat, lng) => {
    if (!ENABLE_LOCATION_REVERSE_GEOCODE) return
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

    // Dedupe identical pin (≈11m at 4 decimal places)
    const coordKey = `${lat.toFixed(4)},${lng.toFixed(4)}`
    if (manualFieldRefs.current._lastCoords === coordKey) return
    manualFieldRefs.current._lastCoords = coordKey

    try {
      // Do NOT forceFresh — reuse nearby cache / in-flight request from useLocation
      const parsed = await reverseGeocode(lat, lng, { forceFresh: false })
      if (parsed) {
        const formatted = parsed.formattedAddress || parsed.address || ""
        setCurrentAddress((prev) => (prev === formatted ? prev : formatted))
        setAddressFormData((prev) => {
          const street = parsed.street || parsed.area || prev.street
          const city = parsed.city || prev.city
          const state = parsed.state || prev.state
          const zipCode = parsed.postalCode || prev.zipCode
          if (
            prev.street === street &&
            prev.city === city &&
            prev.state === state &&
            prev.zipCode === zipCode
          ) {
            return prev
          }
          return { ...prev, street, city, state, zipCode }
        })
      }
    } catch (e) {
      debugError("Reverse geocode error:", e)
    }
  }, [ENABLE_LOCATION_REVERSE_GEOCODE, reverseGeocode])

  useEffect(() => {
    handleMapMoveEndRef.current = handleMapMoveEnd
  }, [handleMapMoveEnd])

  const validateAddressForm = () => {
    const errors = {}
    if (!String(addressFormData.street || "").trim()) {
      errors.street = "Street / area is required"
    }
    if (!String(addressFormData.city || "").trim()) {
      errors.city = "City is required"
    }
    if (!String(addressFormData.state || "").trim()) {
      errors.state = "State is required"
    }
    const lat = Number(mapPosition?.[0])
    const lng = Number(mapPosition?.[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      errors.location = "Pin a location on the map or use current location"
    }
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleAddressFormSubmit = async (e) => {
    e?.preventDefault?.()
    if (!validateAddressForm()) {
      toast.error("Please fill the required fields")
      return
    }
    setLoadingAddress(true)
    try {
      const lat = Number(mapPosition[0])
      const lng = Number(mapPosition[1])
      const label =
        addressFormData.label === "Work" ? "Office" : (addressFormData.label || "Home")
      const payload = {
        label,
        street: String(addressFormData.street || "").trim(),
        additionalDetails: String(addressFormData.additionalDetails || "").trim(),
        landmark: String(addressFormData.landmark || "").trim(),
        area: String(addressFormData.area || addressFormData.street || "").trim(),
        city: String(addressFormData.city || "").trim(),
        state: String(addressFormData.state || "").trim(),
        zipCode: String(addressFormData.zipCode || "").trim(),
        phone: String(addressFormData.phone || "").trim(),
        formattedAddress:
          currentAddress
          || [
            addressFormData.additionalDetails,
            addressFormData.street,
            addressFormData.landmark,
            addressFormData.city,
            addressFormData.state,
            addressFormData.zipCode,
          ]
            .filter(Boolean)
            .join(", "),
        latitude: lat,
        longitude: lng,
        location: { type: "Point", coordinates: [lng, lat] },
      }

      let saved = null
      if (editingAddressId) {
        saved = await updateAddress(editingAddressId, payload)
        toast.success("Address updated")
      } else {
        saved = await addAddress(payload)
        toast.success("Address saved")
      }

      if (!saved) {
        throw new Error("No address returned from server")
      }

      const id = getAddressId(saved) || editingAddressId
      if (id) await setDefaultAddress(id)
      persistSelectedLocation(buildLocationPayloadFromAddress(saved || payload))
      try { localStorage.setItem("deliveryAddressMode", "saved") } catch { /* ignore */ }

      setShowAddressForm(false)
      setEditingAddressId(null)
      setFormErrors({})
      setAddressAutocompleteValue("")
      setKeywordAddressSuggestions([])

      setTimeout(() => {
        navigateBackToOrigin({ replace: true })
      }, 400)
    } catch (error) {
      toast.error(
        error?.response?.data?.message
        || error?.message
        || (editingAddressId ? "Failed to update address" : "Failed to save address"),
      )
    } finally {
      setLoadingAddress(false)
    }
  }

  useEffect(() => {
    if (!showAddressForm || typeof window === "undefined" || !window.visualViewport) return
    const viewport = window.visualViewport
    let raf = 0
    const updateKeyboardInset = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        setKeyboardInset((prev) => {
          const next = inset > 0 ? inset : 0
          return prev === next ? prev : next
        })
      })
    }
    updateKeyboardInset()
    viewport.addEventListener("resize", updateKeyboardInset)
    viewport.addEventListener("scroll", updateKeyboardInset)
    return () => {
      cancelAnimationFrame(raf)
      viewport.removeEventListener("resize", updateKeyboardInset)
      viewport.removeEventListener("scroll", updateKeyboardInset)
    }
  }, [showAddressForm])

  if (showAddressForm) {
    return (
      <AnimatedPage
        className="fixed inset-0 z-50 bg-white dark:bg-[#0a0a0a] flex flex-col h-screen overflow-hidden"
      >
        <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleCancelAddressForm} className="rounded-full">
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <h1 className="text-lg font-bold">
            {editingAddressId ? "Edit delivery location" : "Add delivery location"}
          </h1>
        </div>

        <div
          ref={formBodyRef}
          className="flex-1 overflow-y-auto"
          style={{ paddingBottom: `${96 + keyboardInset}px` }}
        >
          {/* Fixed map height via CSS — avoids React resize→idle→reverse-geocode loops */}
          <div className="flex-shrink-0 relative z-0 h-[42vh] min-h-[260px] max-h-[420px]">
            <div className="absolute top-4 left-4 right-4 z-20">
              <div className="relative group shadow-2xl">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <Input
                  value={addressAutocompleteValue}
                  onChange={(e) => setAddressAutocompleteValue(e.target.value)}
                  placeholder="Search area, street, landmark..."
                  className="pl-10 h-12 bg-white/95 dark:bg-[#1a1a1a]/95 backdrop-blur-md border-none rounded-xl shadow-lg focus:ring-2 focus:ring-[#FF6A00] transition-all"
                />
                {isKeywordSearching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                     <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#FF6A00] border-t-transparent" />
                  </div>
                )}

                {keywordAddressSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#1a1a1a] rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden z-30 animate-in fade-in slide-in-from-top-2 duration-200">
                    <p className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50 dark:bg-gray-800/50">Suggestions</p>
                    {keywordAddressSuggestions.map((s) => (
                      <button
                        key={s.id}
                        onClick={async () => {
                          let { lat, lng, display, address: a } = s

                          // Places suggestions carry a placeId instead of
                          // coordinates — resolve via the backend (canonical
                          // address with lat/lng + structured components).
                          if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && s.placeId) {
                            try {
                              const res = await locationAPI.placeDetails(s.placeId)
                              const detail = res?.data?.data?.address
                              if (detail?.latitude && detail?.longitude) {
                                lat = detail.latitude
                                lng = detail.longitude
                                display = detail.formattedAddress || display
                                a = {
                                  city: detail.city,
                                  state: detail.state,
                                  postcode: detail.pincode,
                                }
                              }
                            } catch {
                              /* details unavailable — keep text-only fill below */
                            }
                          }

                          if (Number.isFinite(lat) && Number.isFinite(lng)) {
                            setMapPosition([lat, lng])
                            lastGeocodedCoordsRef.current = { lat, lng }
                            manualFieldRefs.current._lastCoords = `${lat.toFixed(4)},${lng.toFixed(4)}`
                            panMapProgrammatically(lat, lng, 17)
                          }
                          setAddressAutocompleteValue(display)
                          const city = a.city || a.town || a.village || a.county || ""
                          const state = a.state || ""
                          const zipCode = a.postcode || ""
                          setCurrentAddress(display || "")
                          setAddressFormData((prev) => ({
                            ...prev,
                            street: display || prev.street,
                            city: city || prev.city,
                            state: state || prev.state,
                            zipCode: zipCode || prev.zipCode,
                          }))
                          setKeywordAddressSuggestions([])
                        }}
                        className="w-full px-4 py-3 flex items-start gap-3 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors text-left border-b border-gray-50 dark:border-gray-800 last:border-none"
                      >
                        <MapPin className="h-4 w-4 text-gray-400 mt-1 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{s.display}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{s.address?.city || s.address?.state}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div ref={mapContainerRef} className="w-full h-full bg-gray-100 dark:bg-gray-800" />

            {mapUnavailable && (
              <div className="absolute inset-x-4 top-20 z-20 rounded-2xl border border-amber-200 bg-white/95 px-4 py-3 text-sm text-amber-900 shadow-lg backdrop-blur">
                Map preview could not load here. You can still enter and save the address manually below.
              </div>
            )}
            
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
               <div className="relative mb-8 flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center p-2 mb-[-6px] shadow-sm animate-bounce-short">
                     <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center border-2 border-white">
                        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                     </div>
                  </div>
                  <div className="w-1.5 h-6 bg-green-600 border-x border-white shadow-xl rounded-b-full shadow-green-900/40" />
                  <div className="w-3 h-1.5 bg-black/20 rounded-full blur-[1px] transform scale-x-150 absolute bottom-[-4px]" />
               </div>
            </div>

            {mapLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF6A00]" />
              </div>
            )}
            
            <div className="absolute bottom-10 right-4 z-10">
              <Button 
                  onClick={handleUseCurrentLocation} 
                  className="bg-white text-black hover:bg-gray-100 shadow-xl border border-gray-200 rounded-full h-12 px-6"
              >
                <Navigation className="h-4 w-4 mr-2 text-[#FF6A00]" /> Use My Location
              </Button>
            </div>
          </div>

          <div className="relative bg-white dark:bg-[#0a0a0a] rounded-t-[32px] -mt-8 z-10 p-4 space-y-6 shadow-[0_-12px_24px_-10px_rgba(0,0,0,0.1)]">
            <div className="bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-xl p-4 flex gap-3">
               <MapPin className="h-5 w-5 text-[#FF6A00] mt-0.5" />
               <div className="min-w-0">
                  <p className="text-xs font-bold text-red-800 dark:text-red-200 uppercase mb-1">Pinned Location</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">{currentAddress || "Select a location on map"}</p>
               </div>
            </div>

            <div>
              <Label className="text-sm font-bold mb-2 block">Primary Address (Street / Area / Landmark)</Label>
              <Input 
                placeholder="Search or drag to update street/area" 
                value={addressFormData.street} 
                onChange={e => {
                  setAddressFormData({...addressFormData, street: e.target.value})
                  if (formErrors.street) setFormErrors((prev) => ({ ...prev, street: "" }))
                }}
                onFocus={() => scrollFieldIntoView("street")}
                ref={(el) => { manualFieldRefs.current.street = el }}
                className="mb-1 h-12 rounded-xl bg-gray-50 dark:bg-gray-800/50"
                required
              />
              {formErrors.street ? (
                <p className="mb-3 text-xs font-medium text-red-600">{formErrors.street}</p>
              ) : <div className="mb-3" />}

              <Label className="text-sm font-bold mb-2 block text-red-600 dark:text-red-400">Secondary Address (House No. / Flat / Floor)</Label>
              <Input 
                placeholder="E.g. Flat 402, 4th Floor, AppZeto Building" 
                value={addressFormData.additionalDetails} 
                onChange={e => setAddressFormData({...addressFormData, additionalDetails: e.target.value})}
                onFocus={() => scrollFieldIntoView("additionalDetails")}
                ref={(el) => { manualFieldRefs.current.additionalDetails = el }}
                className="h-12 rounded-xl border-red-200 dark:border-red-900/40 focus:ring-red-500"
              />
            </div>

            <div>
              <Label className="text-sm font-bold mb-2 block">Landmark (optional)</Label>
              <Input
                placeholder="Near park, temple, mall…"
                value={addressFormData.landmark || ""}
                onChange={(e) => setAddressFormData({ ...addressFormData, landmark: e.target.value })}
                onFocus={() => scrollFieldIntoView("landmark")}
                ref={(el) => { manualFieldRefs.current.landmark = el }}
                className="h-12 rounded-xl bg-gray-50 dark:bg-gray-800/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs mb-1 block">City</Label>
                <Input 
                  value={addressFormData.city} 
                  onChange={e => {
                    setAddressFormData({...addressFormData, city: e.target.value})
                    if (formErrors.city) setFormErrors((prev) => ({ ...prev, city: "" }))
                  }} 
                  onFocus={() => scrollFieldIntoView("city")}
                  ref={(el) => { manualFieldRefs.current.city = el }}
                  className="h-12 rounded-xl"
                  required 
                />
                {formErrors.city ? (
                  <p className="mt-1 text-xs font-medium text-red-600">{formErrors.city}</p>
                ) : null}
              </div>
              <div>
                <Label className="text-xs mb-1 block">State</Label>
                <Input 
                  value={addressFormData.state} 
                  onChange={e => {
                    setAddressFormData({...addressFormData, state: e.target.value})
                    if (formErrors.state) setFormErrors((prev) => ({ ...prev, state: "" }))
                  }} 
                  onFocus={() => scrollFieldIntoView("state")}
                  ref={(el) => { manualFieldRefs.current.state = el }}
                  className="h-12 rounded-xl"
                  required 
                />
                {formErrors.state ? (
                  <p className="mt-1 text-xs font-medium text-red-600">{formErrors.state}</p>
                ) : null}
              </div>
            </div>

            <div>
              <Label className="text-xs mb-1 block">Pincode / ZIP</Label>
              <Input 
                placeholder="Pincode" 
                value={addressFormData.zipCode || ""} 
                onChange={e => setAddressFormData({...addressFormData, zipCode: e.target.value})} 
                onFocus={() => scrollFieldIntoView("zipCode")}
                ref={(el) => { manualFieldRefs.current.zipCode = el }}
                className="h-12 rounded-xl"
              />
            </div>

            <div>
               <Label className="text-sm font-bold mb-2 block">Save address as</Label>
               <div className="flex gap-2">
                 {["Home", "Work", "Other"].map(l => (
                   <Button 
                     key={l}
                     type="button"
                     variant={addressFormData.label === l ? "default" : "outline"}
                     onClick={() => setAddressFormData({...addressFormData, label: l})}
                     className="flex-1"
                     style={addressFormData.label === l ? {backgroundColor: '#FF6A00', color: 'white'} : {}}
                   >
                     {l}
                   </Button>
                 ))}
               </div>
            </div>
          </div>
        </div>

        <div
          className="fixed left-0 right-0 p-4 bg-white dark:bg-[#1a1a1a] border-t dark:border-gray-800 transition-[bottom] duration-150"
          style={{ bottom: `${keyboardInset}px` }}
        >
          <Button 
            className="w-full h-12 text-white font-bold text-lg" 
            style={{backgroundColor: '#FF6A00'}}
            onClick={handleAddressFormSubmit}
            disabled={loadingAddress}
          >
            {loadingAddress
              ? (editingAddressId ? "Updating…" : "Saving…")
              : (editingAddressId ? "Update Address & Continue" : "Save Address & Continue")}
          </Button>
          {formErrors.location ? (
            <p className="mt-2 text-center text-xs font-medium text-red-600">{formErrors.location}</p>
          ) : null}
        </div>
      </AnimatedPage>
    )
  }

  return (
    <AnimatedPage className="min-h-screen bg-white dark:bg-[#0a0a0a] flex flex-col">
      <div className="flex-shrink-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100 dark:border-gray-800 px-4 py-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={handleBack} className="rounded-full">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <h1 className="text-xl font-bold">Select Location</h1>
      </div>

      <div className="flex-1 overflow-y-auto pb-10">
        <div className="p-4 bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-800">
          <button 
            onClick={handleUseCurrentLocation}
            className="w-full flex items-center gap-4 p-4 bg-white dark:bg-[#1a1a1a] rounded-xl shadow-sm hover:shadow-md transition-all group"
          >
            <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <Navigation className="h-5 w-5 text-[#FF6A00]" />
            </div>
            <div className="text-left flex-1">
              <p className="font-bold text-[#FF6A00]">Use Current Location</p>
              <p className="text-xs text-gray-500 line-clamp-1">{currentAddress || "Enable GPS for accuracy"}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">Saved Addresses</h2>
            <Button variant="ghost" className="text-[#FF6A00] p-0 h-auto font-bold" onClick={handleAddAddressClick}>
              <Plus className="h-4 w-4 mr-1" /> Add New
            </Button>
          </div>

          <div className="space-y-4">
            {addresses.length === 0 ? (
              <div className="text-center py-10 opacity-50">
                <MapPin className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                <p>No addresses saved yet</p>
              </div>
            ) : (
              addresses.map((addr, idx) => {
                const Icon = getAddressIcon(addr)
                const isSelected = Boolean(addr.isDefault)
                return (
                  <div
                    key={getAddressId(addr) || idx}
                    className={`w-full rounded-xl p-4 transition-colors ${
                      isSelected
                        ? "bg-orange-50 dark:bg-orange-950/20 ring-1 ring-[#FF6A00]/40"
                        : "bg-slate-50 dark:bg-[#1a1a1a]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectSavedAddress(addr)}
                      className="w-full flex items-start gap-4 text-left group"
                    >
                      <div className="h-10 w-10 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center shadow-sm">
                        <Icon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-gray-900 dark:text-white capitalize">
                            {addr.label || "Address"}
                          </p>
                          {isSelected ? (
                            <span className="rounded-full bg-[#FF6A00]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#FF6A00]">
                              Selected
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
                          {[addr.additionalDetails, addr.street, addr.landmark, addr.city, addr.state, addr.zipCode]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      </div>
                      <div className="h-6 w-6 rounded-full border border-gray-200 dark:border-gray-700 mt-2 flex items-center justify-center group-hover:border-[#FF6A00]">
                        <ChevronRight className="h-3 w-3 text-gray-400 group-hover:text-[#FF6A00]" />
                      </div>
                    </button>
                    <div className="mt-3 flex gap-2 pl-14">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg border-orange-100 text-[#FF6A00] hover:bg-orange-50"
                        onClick={(event) => handleEditAddressClick(event, addr)}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-lg text-gray-600"
                        onClick={() => handleSelectSavedAddress(addr)}
                      >
                        Use this
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes bounce-short {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .animate-bounce-short {
          animation: bounce-short 1s infinite ease-in-out;
        }
      `}</style>
    </AnimatedPage>
  )
}
