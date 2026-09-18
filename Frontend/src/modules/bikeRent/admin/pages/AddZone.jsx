import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { MapPin, Save, X, Hand, Shapes, Search } from "lucide-react"
import bikeRentAdminApi from "../services/adminApi"
import { toast } from "sonner"
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey"
import { loadGoogleMaps as loadGoogleMapsSingleton } from "@core/services/googleMapsLoader"
import { Loader } from "@googlemaps/js-api-loader"
import FormPageShell from "@/shared/components/admin/FormPageShell"
import FormSection from "@/shared/components/admin/FormSection"
import FormField, { formInputClass } from "@/shared/components/admin/FormField"
import FormActions from "@/shared/components/admin/FormActions"
import { cn } from "@food/utils/utils"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const MIN_POINTS = 3;
const MAX_POINTS = 10;
const DEFAULT_MAP_CENTER = { lat: 20.5937, lng: 78.9629 };
const DEFAULT_MAP_ZOOM = 5;
const SEARCH_MIN_CHARS = 2;
const SEARCH_DEBOUNCE_MS = 280;
const MAX_SEARCH_RESULTS = 8;

const ensurePlacesLibrary = async () => {
  if (window.google?.maps?.places?.AutocompleteService) return true;
  if (typeof window.google?.maps?.importLibrary === "function") {
    try {
      await window.google.maps.importLibrary("places");
    } catch (err) {
      debugWarn("Failed to import places library", err);
    }
  }
  return Boolean(window.google?.maps?.places?.AutocompleteService);
};

export default function AddZone() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEditMode = !!id && !window.location.pathname.includes('/view/')
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const polygonRef = useRef(null)
  const pathMarkersRef = useRef([])
  
  const mapClickListenerRef = useRef(null)
  const drawPointsRef = useRef([])
  const isDrawingRef = useRef(false)
  
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState("")
  const [mapLoading, setMapLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  
  // Form state
  const [formData, setFormData] = useState({
    country: "India",
    zoneName: "",
    unit: "kilometer",
  })
  
  const [coordinates, setCoordinates] = useState([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [locationSearch, setLocationSearch] = useState("")
  const [placePredictions, setPlacePredictions] = useState([])
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [searchError, setSearchError] = useState("")
  const [existingZones, setExistingZones] = useState([])
  const autocompleteInputRef = useRef(null)
  const searchWrapRef = useRef(null)
  const autocompleteServiceRef = useRef(null)
  const placesServiceRef = useRef(null)
  const geocoderRef = useRef(null)
  const searchMarkerRef = useRef(null)
  const latestSearchRequestRef = useRef(0)
  /** Skip autocomplete refetch while applying a selected place */
  const isSelectingPlaceRef = useRef(false)
  const existingZonesPolygonsRef = useRef([])

  useEffect(() => {
    fetchExistingZones()
    loadGoogleMaps()
    if (isEditMode && id) {
      fetchZone()
    }
  }, [id, isEditMode])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const google = window.google;
      if (google && mapClickListenerRef.current) {
        google.maps.event.removeListener(mapClickListenerRef.current);
      }
      if (polygonRef.current) {
        polygonRef.current.setMap(null);
      }
      pathMarkersRef.current?.forEach(m => m.setMap(null));
      existingZonesPolygonsRef.current?.forEach(p => p?.setMap(null));
      if (searchMarkerRef.current) {
        searchMarkerRef.current.setMap(null);
        searchMarkerRef.current = null;
      }
    };
  }, []);

  // Center map on India when country is selected (do not override while searching)
  useEffect(() => {
    if (formData.country === "India" && mapInstanceRef.current && !locationSearch.trim()) {
      mapInstanceRef.current.setCenter(DEFAULT_MAP_CENTER)
      mapInstanceRef.current.setZoom(DEFAULT_MAP_ZOOM)
    }
  }, [formData.country])

  const initPlacesServices = useCallback(async () => {
    const placesReady = await ensurePlacesLibrary()
    if (!placesReady || !window.google?.maps?.places) return false

    if (!autocompleteServiceRef.current) {
      autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService()
    }
    if (!geocoderRef.current) {
      geocoderRef.current = new window.google.maps.Geocoder()
    }
    if (!placesServiceRef.current && mapInstanceRef.current) {
      placesServiceRef.current = new window.google.maps.places.PlacesService(mapInstanceRef.current)
    }
    return Boolean(autocompleteServiceRef.current)
  }, [])

  const clearSearchMarker = useCallback(() => {
    if (searchMarkerRef.current) {
      searchMarkerRef.current.setMap(null)
      searchMarkerRef.current = null
    }
  }, [])

  const resetMapToDefaultView = useCallback(() => {
    const map = mapInstanceRef.current
    if (!map) return
    clearSearchMarker()
    map.setCenter(DEFAULT_MAP_CENTER)
    map.setZoom(DEFAULT_MAP_ZOOM)
  }, [clearSearchMarker])

  const focusMapOnLocation = useCallback((latLng, label = "", geometry = null) => {
    const map = mapInstanceRef.current
    const google = window.google
    if (!map || !google?.maps || !latLng) return

    clearSearchMarker()

    // Prefer place viewport so cities zoom to city level, not street level
    const viewport = geometry?.viewport
    if (viewport && typeof map.fitBounds === "function") {
      map.fitBounds(viewport)
      google.maps.event.addListenerOnce(map, "idle", () => {
        const zoom = map.getZoom()
        if (typeof zoom === "number" && zoom > 14) {
          map.setZoom(14)
        }
      })
    } else {
      map.panTo(latLng)
      // City / locality default; pin-level only when no viewport
      const types = Array.isArray(geometry?.types) ? geometry.types : []
      const isCityLike = types.some((t) =>
        ["locality", "administrative_area_level_1", "administrative_area_level_2", "postal_code", "political"].includes(t),
      )
      map.setZoom(isCityLike ? 12 : 14)
    }

    searchMarkerRef.current = new google.maps.Marker({
      map,
      position: latLng,
      title: label || "Selected location",
      animation: google.maps.Animation.DROP,
    })
  }, [clearSearchMarker])

  // Real-time Places predictions (area / locality / address / landmark / city / PIN)
  useEffect(() => {
    if (mapLoading) return undefined

    // Don't re-open suggestions when we just applied a selected place name
    if (isSelectingPlaceRef.current) {
      return undefined
    }

    const query = locationSearch.trim()
    if (query.length < SEARCH_MIN_CHARS) {
      latestSearchRequestRef.current += 1
      setPlacePredictions([])
      setIsSearchingPlaces(false)
      setSearchError("")
      return undefined
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      if (isSelectingPlaceRef.current) return

      const ready = await initPlacesServices()
      if (cancelled || !ready || !autocompleteServiceRef.current) {
        if (!cancelled) {
          setSearchError("Location search is unavailable. Check Google Maps Places API.")
          setPlacePredictions([])
          setIsSearchingPlaces(false)
        }
        return
      }

      const requestId = ++latestSearchRequestRef.current
      setIsSearchingPlaces(true)
      setSearchError("")

      // No `types` restriction so predictions cover addresses, localities, landmarks, and postal codes.
      autocompleteServiceRef.current.getPlacePredictions(
        {
          input: query,
          componentRestrictions: { country: "in" },
        },
        (predictions, status) => {
          if (cancelled || requestId !== latestSearchRequestRef.current) return
          if (isSelectingPlaceRef.current) {
            setIsSearchingPlaces(false)
            return
          }
          setIsSearchingPlaces(false)

          const ok = status === window.google.maps.places.PlacesServiceStatus.OK
          const zero = status === window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS
          if (ok && Array.isArray(predictions)) {
            setPlacePredictions(predictions.slice(0, MAX_SEARCH_RESULTS))
            setShowSearchResults(true)
            setSearchError("")
          } else if (zero) {
            setPlacePredictions([])
            setShowSearchResults(true)
            setSearchError("No matching locations found")
          } else {
            setPlacePredictions([])
            setShowSearchResults(true)
            setSearchError("Unable to search locations right now")
          }
        },
      )
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [locationSearch, mapLoading, initPlacesServices])

  // Close suggestions on outside click
  useEffect(() => {
    const onPointerDown = (event) => {
      if (!searchWrapRef.current?.contains(event.target)) {
        setShowSearchResults(false)
      }
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [])

  const handleSelectPlacePrediction = useCallback(async (prediction) => {
    if (!prediction?.place_id) return

    // Close dropdown immediately so first click feels final
    isSelectingPlaceRef.current = true
    latestSearchRequestRef.current += 1
    setShowSearchResults(false)
    setPlacePredictions([])
    setIsSearchingPlaces(false)
    setSearchError("")

    const ready = await initPlacesServices()
    if (!ready) {
      isSelectingPlaceRef.current = false
      setSearchError("Location search is unavailable")
      return
    }

    // Ensure PlacesService is bound to the map (needed for getDetails)
    if (!placesServiceRef.current && mapInstanceRef.current && window.google?.maps?.places) {
      placesServiceRef.current = new window.google.maps.places.PlacesService(mapInstanceRef.current)
    }

    const label =
      prediction.description ||
      prediction.structured_formatting?.main_text ||
      locationSearch

    const applyGeometry = (geometry, displayName, types = []) => {
      if (!geometry?.location) return false
      focusMapOnLocation(geometry.location, displayName, { ...geometry, types })
      setLocationSearch(displayName || label)
      setPlacePredictions([])
      setShowSearchResults(false)
      setSearchError("")
      // Keep suppressing autocomplete briefly after we set the display name
      window.setTimeout(() => {
        isSelectingPlaceRef.current = false
      }, 400)
      return true
    }

    const fail = (message) => {
      isSelectingPlaceRef.current = false
      setSearchError(message)
    }

    if (placesServiceRef.current) {
      placesServiceRef.current.getDetails(
        {
          placeId: prediction.place_id,
          fields: ["geometry", "formatted_address", "name", "address_components", "types"],
        },
        (place, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
            const displayName = place.formatted_address || place.name || label
            if (applyGeometry(place.geometry, displayName, place.types || [])) return
          }

          geocoderRef.current?.geocode({ placeId: prediction.place_id }, (results, geoStatus) => {
            if (geoStatus === "OK" && results?.[0]?.geometry) {
              applyGeometry(
                results[0].geometry,
                results[0].formatted_address || label,
                results[0].types || [],
              )
            } else {
              fail("Could not locate that place on the map")
            }
          })
        },
      )
      return
    }

    geocoderRef.current?.geocode({ placeId: prediction.place_id }, (results, geoStatus) => {
      if (geoStatus === "OK" && results?.[0]?.geometry) {
        applyGeometry(
          results[0].geometry,
          results[0].formatted_address || label,
          results[0].types || [],
        )
      } else {
        fail("Could not locate that place on the map")
      }
    })
  }, [focusMapOnLocation, initPlacesServices, locationSearch])

  const handleLocationSearchChange = (value) => {
    isSelectingPlaceRef.current = false
    setLocationSearch(value)
    setShowSearchResults(true)
    if (!value.trim()) {
      latestSearchRequestRef.current += 1
      setPlacePredictions([])
      setIsSearchingPlaces(false)
      setSearchError("")
      resetMapToDefaultView()
    }
  }

  const handleClearLocationSearch = () => {
    setLocationSearch("")
    setPlacePredictions([])
    setShowSearchResults(false)
    setIsSearchingPlaces(false)
    setSearchError("")
    resetMapToDefaultView()
  }

  const handleLocationSearchKeyDown = async (event) => {
    if (event.key === "Escape") {
      setShowSearchResults(false)
      return
    }
    if (event.key !== "Enter") return
    event.preventDefault()

    if (placePredictions[0]) {
      await handleSelectPlacePrediction(placePredictions[0])
      return
    }

    const query = locationSearch.trim()
    if (query.length < SEARCH_MIN_CHARS) return

    const ready = await initPlacesServices()
    if (!ready || !geocoderRef.current) {
      setSearchError("Location search is unavailable")
      return
    }

    geocoderRef.current.geocode(
      { address: query, componentRestrictions: { country: "IN" } },
      (results, status) => {
        if (status === "OK" && results?.[0]?.geometry?.location) {
          const displayName = results[0].formatted_address || query
          focusMapOnLocation(results[0].geometry.location, displayName, {
            ...results[0].geometry,
            types: results[0].types || [],
          })
          setLocationSearch(displayName)
          setPlacePredictions([])
          setShowSearchResults(false)
          setSearchError("")
        } else {
          setSearchError("No matching locations found")
          setShowSearchResults(true)
        }
      },
    )
  }

  // Draw existing polygon when in edit mode and coordinates are loaded
  useEffect(() => {
    if (isEditMode && coordinates.length >= 3 && mapInstanceRef.current && window.google && !mapLoading) {
      debugLog("Drawing existing polygon in edit mode, coordinates:", coordinates.length)
      setTimeout(() => {
        if (mapInstanceRef.current && window.google) {
          // Ensure drawing mode is off when editing existing polygon
          isDrawingRef.current = false
          setIsDrawing(false)
          if (mapInstanceRef.current) {
            mapInstanceRef.current.setOptions({ draggableCursor: null })
          }
          drawExistingPolygon(window.google, mapInstanceRef.current, coordinates)
        }
      }, 500)
    }
  }, [isEditMode, coordinates.length, mapLoading])


  const fetchExistingZones = async () => {
    try {
      const result = await bikeRentAdminApi.getZones({ limit: 100 })
      const zones = result.records || []
      setExistingZones(
        isEditMode && id
          ? zones.filter((zone) => String(zone.id || zone._id) !== String(id))
          : zones,
      )
    } catch (error) {
      debugError("Error fetching existing zones:", error)
      setExistingZones([])
    }
  }

  const fetchZone = async () => {
    try {
      setLoading(true)
      const zoneData = await bikeRentAdminApi.getZoneById(id)
      if (zoneData) {
        setFormData({
          country: zoneData.country || "India",
          zoneName: zoneData.name || zoneData.zoneName || "",
          unit: zoneData.unit || "kilometer",
        })
        if (zoneData.coordinates && zoneData.coordinates.length > 0) {
          setCoordinates(zoneData.coordinates)
        }
      }
    } catch (error) {
      debugError("Error fetching zone:", error)
      toast.error("Failed to load zone")
      navigate("/admin/bike-rent/zones")
    } finally {
      setLoading(false)
    }
  }

  const loadGoogleMaps = async () => {
    try {
      const apiKey = await getGoogleMapsApiKey()
      setGoogleMapsApiKey(apiKey || "loaded")

      // Prefer singleton loader (includes places) when we have a key
      if (apiKey) {
        try {
          await loadGoogleMapsSingleton(apiKey)
          await ensurePlacesLibrary()
          if (window.google?.maps) {
            initializeMap(window.google)
            return
          }
        } catch (err) {
          debugWarn("Singleton Google Maps load failed, falling back", err)
        }
      }
      
      // Wait for Google Maps to be loaded from main.jsx if it's loading
      let retries = 0
      const maxRetries = 50 // Wait up to 5 seconds (50 * 100ms)
      
      while (!window.google && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100))
        retries++
      }

      // If Google Maps is already loaded (from main.jsx), use it directly
      if (window.google && window.google.maps) {
        await ensurePlacesLibrary()
        initializeMap(window.google)
        return
      }

      // If Google Maps is not loaded yet and we have an API key, use Loader as fallback
      if (apiKey) {
        const loader = new Loader({
          apiKey: apiKey,
          version: "weekly",
          libraries: ["places", "geometry"]
        })

        const google = await loader.load()
        await ensurePlacesLibrary()
        initializeMap(google)
      } else {
        setMapLoading(false)
      }
    } catch (error) {
      debugError("Error loading Google Maps:", error)
      setMapLoading(false)
    }
  }

  const initializeMap = (google) => {
    if (!mapRef.current) return

    // Initial location (India center)
    const initialLocation = DEFAULT_MAP_CENTER

    // Create map
    const map = new google.maps.Map(mapRef.current, {
      center: initialLocation,
      zoom: DEFAULT_MAP_ZOOM,
      clickableIcons: false, // POI labels must NOT capture clicks while drawing
      mapTypeControl: true,
      mapTypeControlOptions: {
        style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
        position: google.maps.ControlPosition.TOP_RIGHT,
        mapTypeIds: [google.maps.MapTypeId.ROADMAP, google.maps.MapTypeId.SATELLITE]
      },
      zoomControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      scrollwheel: true, // Enable mouse wheel zoom
      gestureHandling: 'greedy', // Allow zoom with mouse wheel and touch gestures
      disableDoubleClickZoom: false, // Allow double-click zoom
    })

    mapInstanceRef.current = map

    // Ensure tiles fill the full-width container after layout
    setTimeout(() => {
      google.maps.event.trigger(map, "resize")
      map.setCenter(initialLocation)
      map.setZoom(DEFAULT_MAP_ZOOM)
    }, 120)

    // Setup map click listener for drawing points
    mapClickListenerRef.current = google.maps.event.addListener(map, 'click', (event) => {
      if (!isDrawingRef.current) return;
      if (drawPointsRef.current.length >= MAX_POINTS) {
        alert(`You can add at most ${MAX_POINTS} points. Click "Finish Drawing" to complete.`);
        return;
      }
      drawPointsRef.current.push(event.latLng);
      renderDrawingPolygon(google, map);
    });

    setMapLoading(false)

    // Warm Places services once the map exists (non-blocking)
    initPlacesServices().catch(() => {})

    // Existing zones will be drawn by useEffect when data is ready
    if (existingZones.length > 0) {
      drawExistingZonesOnMap(google, map)
    }

    // If in edit mode and coordinates are already loaded, draw the polygon
    if (isEditMode && coordinates.length >= 3) {
      setTimeout(() => {
        if (mapInstanceRef.current && window.google) {
          drawExistingPolygon(window.google, mapInstanceRef.current, coordinates)
        }
      }, 500) // Small delay to ensure map is fully loaded
    }
  }

  // Draw existing zones on the map
  const drawExistingZonesOnMap = (google, map) => {
    if (!existingZones || existingZones.length === 0) return

    // Clear previous existing zone polygons
    existingZonesPolygonsRef.current.forEach(polygon => {
      if (polygon) polygon.setMap(null)
    })
    existingZonesPolygonsRef.current = []

    existingZones.forEach((zone, index) => {
      if (!zone.coordinates || zone.coordinates.length < 3) return

      // Convert coordinates to LatLng array
      const path = zone.coordinates.map(coord => {
        const lat = typeof coord === 'object' ? (coord.latitude || coord.lat) : null
        const lng = typeof coord === 'object' ? (coord.longitude || coord.lng) : null
        if (lat === null || lng === null) return null
        return new google.maps.LatLng(lat, lng)
      }).filter(Boolean)

      if (path.length < 3) return

      // Create polygon for existing zone with different color (gray/blue)
      const polygon = new google.maps.Polygon({
        paths: path,
        strokeColor: "#3b82f6", // Blue color for existing zones
        strokeOpacity: 0.6,
        strokeWeight: 2,
        fillColor: "#3b82f6",
        fillOpacity: 0.15, // Lighter opacity so new zone stands out
        editable: false, // Not editable
        draggable: false,
        clickable: true,
        zIndex: 0 // Lower z-index so new zone appears on top
      })

      polygon.setMap(map)
      existingZonesPolygonsRef.current.push(polygon)

      // Add info window on click
      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="padding: 8px;">
            <strong>${zone.name || zone.zoneName || 'Unnamed Zone'}</strong><br/>
            <small>Country: ${zone.country || 'N/A'}</small>
          </div>
        `
      })

      polygon.addListener('click', () => {
        infoWindow.setPosition(polygon.getPath().getAt(0))
        infoWindow.open(map)
      })
    })
  }

  // Redraw existing zones when zones data changes or map is ready
  useEffect(() => {
    if (!mapLoading && mapInstanceRef.current && existingZones.length > 0 && window.google) {
      drawExistingZonesOnMap(window.google, mapInstanceRef.current)
    }
  }, [existingZones, mapLoading])

  const renderVertexMarkers = (google, map, latLngs) => {
    pathMarkersRef.current?.forEach(m => m.setMap(null));
    pathMarkersRef.current = latLngs.map((latLng, i) => new google.maps.Marker({
      position: latLng,
      map,
      clickable: false, // must not block map clicks
      icon: { 
        path: google.maps.SymbolPath.CIRCLE, 
        scale: 8, 
        fillColor: "#9333ea",
        fillOpacity: 1, 
        strokeColor: "#ffffff", 
        strokeWeight: 2 
      },
      zIndex: 1000,
      title: `Point ${i + 1}`,
    }));
  };

  const renderDrawingPolygon = (google, map) => {
    const points = drawPointsRef.current;
    if (polygonRef.current) { 
      polygonRef.current.setMap(null); 
      polygonRef.current = null; 
    }

    // Keep click order — radial reorder can reshape the zone and exclude the real pin.
    const ordered = points.map((p) => ({ lat: p.lat(), lng: p.lng() }));

    if (ordered.length >= 2) {
      polygonRef.current = new google.maps.Polygon({
        paths: ordered, 
        fillColor: "#9333ea", 
        fillOpacity: 0.35,
        strokeColor: "#9333ea", 
        strokeWeight: 2,
        clickable: false, 
        editable: false, 
        zIndex: 1,
      });
      polygonRef.current.setMap(map);
    }

    renderVertexMarkers(google, map, points);
    setCoordinates(ordered.map(p => ({
      latitude: parseFloat(p.lat.toFixed(6)),
      longitude: parseFloat(p.lng.toFixed(6)),
    })));
  };

  const finishDrawing = () => {
    const google = window.google, map = mapInstanceRef.current;
    if (!google || !map) return false;

    const points = drawPointsRef.current;
    if (points.length < MIN_POINTS) {
      alert(`Please click at least ${MIN_POINTS} points on the map.`);
      return false;
    }

    if (polygonRef.current) { polygonRef.current.setMap(null); polygonRef.current = null; }
    pathMarkersRef.current?.forEach(m => m.setMap(null));
    pathMarkersRef.current = [];

    const ordered = points.map((p) => ({ lat: p.lat(), lng: p.lng() }));
    const coords = ordered.map((p) => ({
      latitude: parseFloat(p.lat.toFixed(6)),
      longitude: parseFloat(p.lng.toFixed(6)),
    }));
    setCoordinates(coords);
    drawEditablePolygon(google, map, coords); // creates editable polygon + path listeners, NO markers
    return true;
  };

  const drawEditablePolygon = (google, map, coords) => {
    const path = coords.map(c => {
      const lat = Number(c.latitude ?? c.lat);
      const lng = Number(c.longitude ?? c.lng);
      return new google.maps.LatLng(lat, lng);
    });
    const polygon = new google.maps.Polygon({
      paths: path, 
      strokeColor: "#9333ea", 
      strokeOpacity: 0.8, 
      strokeWeight: 3,
      fillColor: "#9333ea", 
      fillOpacity: 0.35,
      editable: true, 
      draggable: false, 
      clickable: false,
    });
    polygon.setMap(map);
    polygonRef.current = polygon;
    pathMarkersRef.current = []; // IMPORTANT: no circle markers — they block the drag handles

    const sync = () => {
      const p = polygon.getPath();
      const out = [];
      p.forEach(ll => out.push({ latitude: parseFloat(ll.lat().toFixed(6)), longitude: parseFloat(ll.lng().toFixed(6)) }));
      setCoordinates(out);
      drawPointsRef.current = p.getArray();
    };
    const pp = polygon.getPath();
    google.maps.event.addListener(pp, 'set_at', sync);
    google.maps.event.addListener(pp, 'insert_at', sync);
    google.maps.event.addListener(pp, 'remove_at', sync);
  };

  const drawExistingPolygon = (google, map, coords) => {
    if (!coords || coords.length < 3) {
      debugLog("drawExistingPolygon: Not enough coordinates", coords?.length)
      return
    }

    debugLog("drawExistingPolygon: Drawing polygon with", coords.length, "coordinates")

    // Clear existing polygon
    if (polygonRef.current) {
      polygonRef.current.setMap(null)
    }

    // Clear existing markers
    if (pathMarkersRef.current && pathMarkersRef.current.length > 0) {
      pathMarkersRef.current.forEach(marker => marker.setMap(null))
      pathMarkersRef.current = []
    }

    // Convert coords array to LatLng array and populate drawPointsRef
    const googlePoints = coords.map(coord => {
      const lat = typeof coord === 'object' ? (coord.latitude || coord.lat) : null
      const lng = typeof coord === 'object' ? (coord.longitude || coord.lng) : null
      if (lat !== null && lng !== null) {
        return new google.maps.LatLng(lat, lng)
      }
      return null
    }).filter(Boolean)

    drawPointsRef.current = googlePoints

    // Fit map to polygon bounds
    const bounds = new google.maps.LatLngBounds()
    googlePoints.forEach(latLng => bounds.extend(latLng))
    map.fitBounds(bounds)
    debugLog("Map fitted to polygon bounds")

    // Draw editable polygon and sync coordinates
    drawEditablePolygon(google, map, coords)
  }

  const toggleDrawingMode = () => {
    const google = window.google, map = mapInstanceRef.current;
    if (!google || !map) { alert("Map is still loading."); return; }

    if (isDrawing) {                       // FINISH
      if (finishDrawing() === false) return; // not enough points → stay in drawing mode
      isDrawingRef.current = false;
      setIsDrawing(false);
      map.setOptions({ draggableCursor: null });
      existingZonesPolygonsRef.current.forEach(p => p?.setOptions?.({ clickable: true }));
    } else {                               // START
      clearDrawing();
      drawPointsRef.current = [];
      isDrawingRef.current = true;
      setIsDrawing(true);
      map.setOptions({ draggableCursor: 'crosshair' });
      // make other zones non-clickable so taps over them add points, not open info windows
      existingZonesPolygonsRef.current.forEach(p => p?.setOptions?.({ clickable: false }));
    }
  };

  const clearDrawing = () => {
    drawPointsRef.current = [];
    if (polygonRef.current) { polygonRef.current.setMap(null); polygonRef.current = null; }
    pathMarkersRef.current?.forEach(m => m.setMap(null));
    pathMarkersRef.current = [];
    setCoordinates([]);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.zoneName) {
      alert("Please enter a zone name")
      return
    }

    if (!formData.country) {
      alert("Please select a country")
      return
    }

    if (coordinates.length < 3) {
      alert("Please draw at least 3 points on the map to create a zone")
      return
    }

    try {
      setLoading(true)
      
      // Validate coordinates format
      if (!coordinates || coordinates.length < 3) {
        alert("Please draw at least 3 points on the map")
        setLoading(false)
        return
      }

      // Ensure coordinates have correct format
      const validCoordinates = coordinates.map((coord) => {
        if (typeof coord === "object") {
          return {
            latitude: parseFloat(coord.latitude ?? coord.lat),
            longitude: parseFloat(coord.longitude ?? coord.lng),
          };
        }
        return coord;
      }).filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude));

      const zoneData = {
        name: formData.zoneName,
        country: formData.country,
        unit: formData.unit || "kilometer",
        coordinates: validCoordinates,
        status: "active",
      }

      debugLog("Sending zone data:", zoneData)

      if (isEditMode && id) {
        await bikeRentAdminApi.updateZone(id, zoneData)
        toast.success("Zone updated successfully")
      } else {
        await bikeRentAdminApi.createZone(zoneData)
        toast.success("Zone created successfully")
      }
      navigate("/admin/bike-rent/zones")
    } catch (error) {
      debugError("Error creating zone:", error)
      let errorMessage = "Failed to save zone. Please try again."
      if (error.code === "ERR_NETWORK" || error.message === "Network Error" || !error.response) {
        errorMessage = "Cannot connect to server. Please make sure the backend server is running."
      } else if (error.response) {
        errorMessage =
          error.response.data?.message ||
          error.response.data?.error ||
          error.message ||
          `Server error: ${error.response.status}`
      } else {
        errorMessage = error.message || errorMessage
      }
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <FormPageShell
      title={isEditMode ? "Edit Zone" : "Add New Zone"}
      description={isEditMode ? "Update Bike Rent service zone" : "Create a Bike Rent service zone"}
      icon={<MapPin className="h-5 w-5" />}
      iconClassName="bg-red-500"
      onBack={() => navigate("/admin/bike-rent/zones")}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <FormSection title="Zone Details" bodyClassName="grid-cols-1 gap-4 md:grid-cols-3">
          <FormField label="Country" required>
            <select
              value={formData.country}
              onChange={(e) => handleInputChange("country", e.target.value)}
              className={formInputClass}
              required
            >
              <option value="India">India</option>
            </select>
          </FormField>

          <FormField label="Create Zone name" required>
            <input
              type="text"
              value={formData.zoneName}
              onChange={(e) => handleInputChange("zoneName", e.target.value)}
              placeholder="Enter zone name"
              className={formInputClass}
              required
            />
          </FormField>

          <FormField label="Select Unit" required>
            <select
              value={formData.unit}
              onChange={(e) => handleInputChange("unit", e.target.value)}
              className={formInputClass}
              required
            >
              <option value="kilometer">Kilometers (km)</option>
              <option value="miles">Miles (mi)</option>
            </select>
          </FormField>
        </FormSection>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Search a city below to zoom the map, then draw the service polygon.
          After saving, open <strong>View Zone</strong> to add pickup hubs.
        </div>

        {/* Full-width map — not cramped in a side column */}
        <FormSection
          title="Draw Zone on Map"
          className="overflow-visible"
          bodyClassName="!grid-cols-1 gap-4"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleDrawingMode}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  isDrawing
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                <Shapes className="w-4 h-4" />
                <span>{isDrawing ? "Stop Drawing" : "Start Drawing"}</span>
              </button>
              {coordinates.length > 0 && (
                <button
                  type="button"
                  onClick={clearDrawing}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
                >
                  <X className="w-4 h-4" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          }
        >
          <div className="relative z-20" ref={searchWrapRef}>
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none z-10" />
            <input
              ref={autocompleteInputRef}
              type="text"
              placeholder="Search city, area, locality, address, landmark, or PIN..."
              value={locationSearch}
              onChange={(e) => handleLocationSearchChange(e.target.value)}
              onFocus={() => {
                if (locationSearch.trim().length >= SEARCH_MIN_CHARS || placePredictions.length > 0) {
                  setShowSearchResults(true)
                }
              }}
              onKeyDown={handleLocationSearchKeyDown}
              autoComplete="off"
              className={cn(formInputClass, "pl-10 pr-10")}
            />
            {locationSearch ? (
              <button
                type="button"
                onClick={handleClearLocationSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label="Clear location search"
              >
                <X className="w-4 h-4" />
              </button>
            ) : null}

            {showSearchResults && locationSearch.trim().length >= SEARCH_MIN_CHARS && (
              <div className="absolute left-0 right-0 top-full z-[1000] mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {isSearchingPlaces && (
                  <div className="px-3 py-2 text-sm text-slate-500">Searching locations...</div>
                )}
                {!isSearchingPlaces && placePredictions.length === 0 && (
                  <div className="px-3 py-2 text-sm text-slate-500">
                    {searchError || "No matching locations found"}
                  </div>
                )}
                    {!isSearchingPlaces &&
                      placePredictions.map((prediction) => (
                        <button
                          key={prediction.place_id}
                          type="button"
                          onMouseDown={(event) => {
                            // Prevent input blur from swallowing the first click
                            event.preventDefault()
                            handleSelectPlacePrediction(prediction)
                          }}
                          className="flex w-full items-start gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50"
                        >
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-slate-800">
                              {prediction.structured_formatting?.main_text || prediction.description}
                            </span>
                            {prediction.structured_formatting?.secondary_text ? (
                              <span className="block text-xs text-slate-500">
                                {prediction.structured_formatting.secondary_text}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      ))}
              </div>
            )}
          </div>

          {coordinates.length > 0 && (
            <p className="text-xs text-slate-600">
              Points drawn: <strong>{coordinates.length}</strong>
              {coordinates.length < 3 && (
                <span className="text-red-600 ml-2">(Minimum 3 points required)</span>
              )}
            </p>
          )}

          <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            <div
              ref={mapRef}
              className="h-[min(70vh,640px)] min-h-[420px] w-full"
            />

            {mapLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-100/90 rounded-xl">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-slate-600">Loading map...</p>
                </div>
              </div>
            )}

            {!googleMapsApiKey && !mapLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-100 rounded-xl">
                <div className="text-center p-6">
                  <MapPin className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                  <p className="text-sm text-slate-600">Google Maps API key not found</p>
                </div>
              </div>
            )}
          </div>
        </FormSection>

        <FormActions
          onCancel={() => navigate("/admin/bike-rent/zones")}
          submitLabel={
            <span className="inline-flex items-center gap-2">
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Zone</span>
                </>
              )}
            </span>
          }
          submitDisabled={
            loading
            || coordinates.length < 3
            || !formData.zoneName
            || !formData.country
          }
        />
      </form>
    </FormPageShell>
  )
}


