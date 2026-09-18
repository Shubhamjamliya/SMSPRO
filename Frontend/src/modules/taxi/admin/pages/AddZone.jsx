import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { MapPin, Save, X, Shapes, Search } from "lucide-react"
import { taxiAdminApi } from "../../services/api"
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

// Order points by angle around their centroid so polygon edges never self-intersect,
// while KEEPING every clicked point (unlike a convex hull).
const orderPointsRadially = (pts) => {
  const points = pts
    .map(p => ({
      lat: typeof p.lat === 'function' ? p.lat() : p.lat,
      lng: typeof p.lng === 'function' ? p.lng() : p.lng,
    }))
    .filter(p => typeof p.lat === 'number' && typeof p.lng === 'number');

  if (points.length < 3) return points;

  const cx = points.reduce((s, p) => s + p.lng, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.lat, 0) / points.length;

  return [...points].sort((a, b) =>
    Math.atan2(a.lat - cy, a.lng - cx) - Math.atan2(b.lat - cy, b.lng - cx)
  );
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
    status: "active",
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
      if (mapRef.current?.__taxiZoneResizeObserver) {
        mapRef.current.__taxiZoneResizeObserver.disconnect();
        delete mapRef.current.__taxiZoneResizeObserver;
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

  const focusMapOnLocation = useCallback((latLng, label = "") => {
    const map = mapInstanceRef.current
    const google = window.google
    if (!map || !google?.maps || !latLng) return

    map.panTo(latLng)
    map.setZoom(15)
    clearSearchMarker()
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

    const ready = await initPlacesServices()
    if (!ready) {
      setSearchError("Location search is unavailable")
      return
    }

    const label =
      prediction.description ||
      prediction.structured_formatting?.main_text ||
      locationSearch

    const applyGeometry = (geometry, displayName) => {
      if (!geometry?.location) return false
      focusMapOnLocation(geometry.location, displayName)
      setLocationSearch(displayName || label)
      setPlacePredictions([])
      setShowSearchResults(false)
      setSearchError("")
      return true
    }

    if (placesServiceRef.current) {
      placesServiceRef.current.getDetails(
        {
          placeId: prediction.place_id,
          fields: ["geometry", "formatted_address", "name", "address_components"],
        },
        (place, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
            const displayName = place.formatted_address || place.name || label
            if (applyGeometry(place.geometry, displayName)) return
          }

          // Fallback: geocode the prediction text
          geocoderRef.current?.geocode({ placeId: prediction.place_id }, (results, geoStatus) => {
            if (geoStatus === "OK" && results?.[0]?.geometry) {
              applyGeometry(
                results[0].geometry,
                results[0].formatted_address || label,
              )
            } else {
              setSearchError("Could not locate that place on the map")
            }
          })
        },
      )
      return
    }

    geocoderRef.current?.geocode({ placeId: prediction.place_id }, (results, geoStatus) => {
      if (geoStatus === "OK" && results?.[0]?.geometry) {
        applyGeometry(results[0].geometry, results[0].formatted_address || label)
      } else {
        setSearchError("Could not locate that place on the map")
      }
    })
  }, [focusMapOnLocation, initPlacesServices, locationSearch])

  const handleLocationSearchChange = (value) => {
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
          focusMapOnLocation(results[0].geometry.location, displayName)
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
      const data = await taxiAdminApi.getZones({ limit: 1000 })
      const zones = (data.records || []).filter((zone) => {
        if (!isEditMode || !id) return true
        return String(zone.id) !== String(id)
      })
      setExistingZones(zones)
    } catch (error) {
      debugError("Error fetching existing zones:", error)
      setExistingZones([])
    }
  }

  const fetchZone = async () => {
    try {
      setLoading(true)
      const zoneData = await taxiAdminApi.getZoneById(id)
      if (zoneData) {
        setFormData({
          country: zoneData.country || "India",
          zoneName: zoneData.name || zoneData.zoneName || "",
          unit: zoneData.unit || "kilometer",
          status: zoneData.status || "active",
        })
        
        if (zoneData.coordinates && zoneData.coordinates.length > 0) {
          setCoordinates(zoneData.coordinates)
        }
      }
    } catch (error) {
      debugError("Error fetching zone:", error)
      toast.error("Failed to load zone")
      navigate("/admin/taxi/zones")
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

    // Keep tiles sharp when the responsive container resizes
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          google.maps.event.trigger(map, "resize")
        })
      : null
    if (resizeObserver && mapRef.current) {
      resizeObserver.observe(mapRef.current)
      mapRef.current.__taxiZoneResizeObserver = resizeObserver
    }

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

    const ordered = points.length >= 3
      ? orderPointsRadially(points)
      : points.map(p => ({ lat: p.lat(), lng: p.lng() }));

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

    const ordered = orderPointsRadially(points);
    const coords = ordered.map(p => ({
      latitude: parseFloat(p.lat.toFixed(6)),
      longitude: parseFloat(p.lng.toFixed(6)),
    }));
    setCoordinates(coords);
    drawEditablePolygon(google, map, coords); // creates editable polygon + path listeners, NO markers
    return true;
  };

  const drawEditablePolygon = (google, map, coords) => {
    const path = coords.map(c => new google.maps.LatLng(c.latitude ?? c.lat, c.longitude ?? c.lng));
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
      toast.error("Please enter a zone name")
      return
    }

    if (!formData.country) {
      toast.error("Please select a country")
      return
    }

    if (coordinates.length < 3) {
      toast.error("Please draw at least 3 points on the map to create a zone")
      return
    }

    try {
      setLoading(true)
      
      // Validate coordinates format
      if (!coordinates || coordinates.length < 3) {
        toast.error("Please draw at least 3 points on the map")
        setLoading(false)
        return
      }

      const validCoordinates = coordinates.map((coord) => {
        const latitude = parseFloat(coord.latitude ?? coord.lat)
        const longitude = parseFloat(coord.longitude ?? coord.lng)
        return { latitude, longitude, lat: latitude, lng: longitude }
      }).filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude))

      if (validCoordinates.length < 3) {
        toast.error("Please draw at least 3 points on the map")
        setLoading(false)
        return
      }

      const zoneData = {
        name: formData.zoneName.trim(),
        country: formData.country,
        unit: formData.unit || "kilometer",
        status: formData.status || "active",
        coordinates: validCoordinates,
        polygon: `${validCoordinates.length}-point polygon`,
      }

      debugLog("Sending zone data:", zoneData)

      if (isEditMode && id) {
        await taxiAdminApi.updateZone(id, zoneData)
        toast.success("Zone updated successfully")
      } else {
        await taxiAdminApi.createZone(zoneData)
        toast.success("Zone created successfully")
      }
      navigate("/admin/taxi/zones")
    } catch (error) {
      debugError("Error creating zone:", error)
      
      // Handle different types of errors
      let errorMessage = "Failed to create zone. Please try again."
      
      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error' || !error.response) {
        // Network error - backend not running or CORS issue
        errorMessage = "Cannot connect to server. Please make sure the backend server is running."
        debugError("Network error: Backend server might not be running")
      } else if (error.response) {
        // API error with response
        errorMessage = error.response.data?.message || 
                      error.response.data?.error || 
                      error.message || 
                      `Server error: ${error.response.status}`
        debugError("API error:", error.response.data)
        debugError("Error status:", error.response.status)
      } else {
        // Other errors
        errorMessage = error.message || errorMessage
      }
      
      toast.error(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <FormPageShell
      title={isEditMode ? "Edit taxi zone" : "Add taxi zone"}
      description={isEditMode ? "Adjust the service area polygon on the map" : "Name the zone, then draw its service area on the map"}
      icon={<MapPin className="h-5 w-5" />}
      iconClassName="bg-amber-500"
      onBack={() => navigate("/admin/taxi/zones")}
      className="just-order-theme-scope"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 xl:items-start">
          {/* Details sidebar */}
          <div className="xl:col-span-4 xl:sticky xl:top-4 space-y-4">
            <FormSection title="Zone details" bodyClassName="grid-cols-1 gap-4">
              <FormField label="Zone name" required>
                <input
                  type="text"
                  value={formData.zoneName}
                  onChange={(e) => handleInputChange("zoneName", e.target.value)}
                  placeholder="e.g. Vijay Nagar"
                  className={formInputClass}
                  required
                />
              </FormField>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                <FormField label="Unit" required>
                  <select
                    value={formData.unit}
                    onChange={(e) => handleInputChange("unit", e.target.value)}
                    className={formInputClass}
                    required
                  >
                    <option value="kilometer">Kilometers</option>
                    <option value="mile">Miles</option>
                  </select>
                </FormField>
              </div>

              <FormField label="Status" required>
                <select
                  value={formData.status || "active"}
                  onChange={(e) => handleInputChange("status", e.target.value)}
                  className={formInputClass}
                  required
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </FormField>
            </FormSection>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Drawing tips</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>Search a city or landmark to zoom in.</li>
                <li>Click <strong>Start drawing</strong>, then tap the map (3–10 points).</li>
                <li>Finish drawing, then drag handles to fine-tune.</li>
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                  coordinates.length >= 3 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
                )}>
                  {coordinates.length} / {MAX_POINTS} points
                </span>
                {isDrawing ? (
                  <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                    Drawing mode on
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Map canvas */}
          <div className="xl:col-span-8">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Service area map</h2>
                  <p className="text-xs text-slate-500">Draw the polygon that defines this taxi zone</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleDrawingMode}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-white transition-colors",
                      isDrawing ? "bg-red-600 hover:bg-red-700" : "bg-slate-900 hover:bg-slate-800",
                    )}
                  >
                    <Shapes className="h-4 w-4" />
                    {isDrawing ? "Finish drawing" : "Start drawing"}
                  </button>
                  {coordinates.length > 0 ? (
                    <button
                      type="button"
                      onClick={clearDrawing}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <X className="h-4 w-4" />
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3 p-3 sm:p-4">
                <div className="relative" ref={searchWrapRef}>
                  <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={autocompleteInputRef}
                    type="text"
                    placeholder="Search area, address, landmark, or PIN…"
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
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}

                  {showSearchResults && locationSearch.trim().length >= SEARCH_MIN_CHARS ? (
                    <div className="absolute left-0 right-0 top-full z-[1000] mt-1 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                      {isSearchingPlaces ? (
                        <div className="px-3 py-2.5 text-sm text-slate-500">Searching…</div>
                      ) : null}
                      {!isSearchingPlaces && placePredictions.length === 0 ? (
                        <div className="px-3 py-2.5 text-sm text-slate-500">
                          {searchError || "No matching locations found"}
                        </div>
                      ) : null}
                      {!isSearchingPlaces
                        ? placePredictions.map((prediction) => (
                            <button
                              key={prediction.place_id}
                              type="button"
                              onClick={() => handleSelectPlacePrediction(prediction)}
                              className="flex w-full items-start gap-2 border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-slate-50"
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
                          ))
                        : null}
                    </div>
                  ) : null}
                </div>

                <div className="relative h-[min(68vh,640px)] min-h-[280px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 sm:min-h-[360px]">
                  <div ref={mapRef} className="absolute inset-0 h-full w-full" />

                  {mapLoading ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/90">
                      <div className="text-center">
                        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-amber-500" />
                        <p className="text-sm text-slate-600">Loading map…</p>
                      </div>
                    </div>
                  ) : null}

                  {!googleMapsApiKey && !mapLoading ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100">
                      <div className="px-6 text-center">
                        <MapPin className="mx-auto mb-3 h-10 w-10 text-slate-400" />
                        <p className="text-sm font-medium text-slate-700">Google Maps is unavailable</p>
                        <p className="mt-1 text-xs text-slate-500">Check that the Maps API key is configured.</p>
                      </div>
                    </div>
                  ) : null}

                  {isDrawing ? (
                    <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-lg bg-slate-900/85 px-3 py-1.5 text-xs font-medium text-white shadow-sm backdrop-blur">
                      Click the map to add points (3–{MAX_POINTS} required)
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    {coordinates.length >= 3
                      ? "Polygon ready — drag vertices on the map to adjust."
                      : "At least 3 points are required to save this zone."}
                  </span>
                  {existingZones.length > 0 ? (
                    <span className="text-slate-400">{existingZones.length} other zone{existingZones.length === 1 ? "" : "s"} shown</span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        <FormActions
          className="sticky bottom-0 z-20 -mx-1 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none"
          onCancel={() => navigate("/admin/taxi/zones")}
          submitLabel={
            <span className="inline-flex items-center gap-2">
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  <span>Saving…</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>{isEditMode ? "Update zone" : "Save zone"}</span>
                </>
              )}
            </span>
          }
          submitDisabled={loading || coordinates.length < 3 || !formData.zoneName || !formData.country}
        />
      </form>
    </FormPageShell>
  )
}


