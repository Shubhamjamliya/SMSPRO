import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, X, Shapes, Search } from "lucide-react";
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey";
import { loadGoogleMaps as loadGoogleMapsSingleton } from "@core/services/googleMapsLoader";
import { Loader } from "@googlemaps/js-api-loader";
import { formInputClass } from "@/shared/components/admin/FormField";
import { cn } from "@food/utils/utils";

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
    } catch {
      /* ignore — falls through to the AutocompleteService check below */
    }
  }
  return Boolean(window.google?.maps?.places?.AutocompleteService);
};

/**
 * Reusable Google-Maps polygon draw/edit field for admin "service area" zone forms.
 * Generic across modules — no bike-rent (or any module) business logic baked in.
 *
 * Props:
 *  - coordinates: [{latitude, longitude}] — controlled current polygon value
 *  - onCoordinatesChange: (coords: [{latitude, longitude}]) => void
 *  - existingZones: [{_id|id, name, country, coordinates}] — drawn as non-interactive blue reference
 *    overlays (click → info window with the zone's name)
 *  - isEditMode: bootstraps the existing polygon from `coordinates` once the map is ready
 *  - selectedZoneId: matches an `existingZones` entry by `_id`/`id` — when set, that zone is drawn with
 *    a highlighted (brand-orange) style instead of the default blue, and the map bounds are fit to its
 *    complete polygon whenever the id changes. Optional — purely additive, no effect when omitted.
 *  - readOnly: hides the draw/clear/location-search controls and ignores map clicks, leaving a pure
 *    view-only map (used for admin's zone-request review, where nothing should be editable). Optional,
 *    defaults to false — no effect on existing callers that don't pass it.
 */
export default function ZonePolygonMapField({
  coordinates = [],
  onCoordinatesChange,
  existingZones = [],
  isEditMode = false,
  selectedZoneId = null,
  readOnly = false,
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const polygonRef = useRef(null);
  const pathMarkersRef = useRef([]);
  const mapClickListenerRef = useRef(null);
  const drawPointsRef = useRef([]);
  const isDrawingRef = useRef(false);
  const existingZonesPolygonsRef = useRef([]);

  const autocompleteInputRef = useRef(null);
  const searchWrapRef = useRef(null);
  const autocompleteServiceRef = useRef(null);
  const placesServiceRef = useRef(null);
  const geocoderRef = useRef(null);
  const searchMarkerRef = useRef(null);
  const latestSearchRequestRef = useRef(0);
  const isSelectingPlaceRef = useRef(false);

  const [googleMapsApiKey, setGoogleMapsApiKey] = useState("");
  const [mapLoading, setMapLoading] = useState(true);
  const [isDrawing, setIsDrawing] = useState(false);
  const [locationSearch, setLocationSearch] = useState("");
  const [placePredictions, setPlacePredictions] = useState([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchError, setSearchError] = useState("");

  const bootstrappedRef = useRef(false);
  const emitChange = useCallback((coords) => {
    onCoordinatesChange?.(coords);
  }, [onCoordinatesChange]);

  useEffect(() => {
    loadGoogleMaps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      const google = window.google;
      if (google && mapClickListenerRef.current) {
        google.maps.event.removeListener(mapClickListenerRef.current);
      }
      if (polygonRef.current) polygonRef.current.setMap(null);
      pathMarkersRef.current?.forEach((m) => m.setMap(null));
      existingZonesPolygonsRef.current?.forEach((p) => p?.setMap(null));
      if (searchMarkerRef.current) {
        searchMarkerRef.current.setMap(null);
        searchMarkerRef.current = null;
      }
    };
  }, []);

  const initPlacesServices = useCallback(async () => {
    const placesReady = await ensurePlacesLibrary();
    if (!placesReady || !window.google?.maps?.places) return false;
    if (!autocompleteServiceRef.current) {
      autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
    }
    if (!geocoderRef.current) {
      geocoderRef.current = new window.google.maps.Geocoder();
    }
    if (!placesServiceRef.current && mapInstanceRef.current) {
      placesServiceRef.current = new window.google.maps.places.PlacesService(mapInstanceRef.current);
    }
    return Boolean(autocompleteServiceRef.current);
  }, []);

  const clearSearchMarker = useCallback(() => {
    if (searchMarkerRef.current) {
      searchMarkerRef.current.setMap(null);
      searchMarkerRef.current = null;
    }
  }, []);

  const resetMapToDefaultView = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    clearSearchMarker();
    map.setCenter(DEFAULT_MAP_CENTER);
    map.setZoom(DEFAULT_MAP_ZOOM);
  }, [clearSearchMarker]);

  const focusMapOnLocation = useCallback((latLng, label = "", geometry = null) => {
    const map = mapInstanceRef.current;
    const google = window.google;
    if (!map || !google?.maps || !latLng) return;

    clearSearchMarker();

    const viewport = geometry?.viewport;
    if (viewport && typeof map.fitBounds === "function") {
      map.fitBounds(viewport);
      google.maps.event.addListenerOnce(map, "idle", () => {
        const zoom = map.getZoom();
        if (typeof zoom === "number" && zoom > 14) map.setZoom(14);
      });
    } else {
      map.panTo(latLng);
      const types = Array.isArray(geometry?.types) ? geometry.types : [];
      const isCityLike = types.some((t) =>
        ["locality", "administrative_area_level_1", "administrative_area_level_2", "postal_code", "political"].includes(t),
      );
      map.setZoom(isCityLike ? 12 : 14);
    }

    searchMarkerRef.current = new google.maps.Marker({
      map,
      position: latLng,
      title: label || "Selected location",
      animation: google.maps.Animation.DROP,
    });
  }, [clearSearchMarker]);

  // Real-time Places predictions
  useEffect(() => {
    if (mapLoading) return undefined;
    if (isSelectingPlaceRef.current) return undefined;

    const query = locationSearch.trim();
    if (query.length < SEARCH_MIN_CHARS) {
      latestSearchRequestRef.current += 1;
      setPlacePredictions([]);
      setIsSearchingPlaces(false);
      setSearchError("");
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      if (isSelectingPlaceRef.current) return;
      const ready = await initPlacesServices();
      if (cancelled || !ready || !autocompleteServiceRef.current) {
        if (!cancelled) {
          setSearchError("Location search is unavailable. Check Google Maps Places API.");
          setPlacePredictions([]);
          setIsSearchingPlaces(false);
        }
        return;
      }

      const requestId = ++latestSearchRequestRef.current;
      setIsSearchingPlaces(true);
      setSearchError("");

      autocompleteServiceRef.current.getPlacePredictions(
        { input: query, componentRestrictions: { country: "in" } },
        (predictions, status) => {
          if (cancelled || requestId !== latestSearchRequestRef.current) return;
          if (isSelectingPlaceRef.current) {
            setIsSearchingPlaces(false);
            return;
          }
          setIsSearchingPlaces(false);

          const ok = status === window.google.maps.places.PlacesServiceStatus.OK;
          const zero = status === window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS;
          if (ok && Array.isArray(predictions)) {
            setPlacePredictions(predictions.slice(0, MAX_SEARCH_RESULTS));
            setShowSearchResults(true);
            setSearchError("");
          } else if (zero) {
            setPlacePredictions([]);
            setShowSearchResults(true);
            setSearchError("No matching locations found");
          } else {
            setPlacePredictions([]);
            setShowSearchResults(true);
            setSearchError("Unable to search locations right now");
          }
        },
      );
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [locationSearch, mapLoading, initPlacesServices]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!searchWrapRef.current?.contains(event.target)) setShowSearchResults(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const handleSelectPlacePrediction = useCallback(async (prediction) => {
    if (!prediction?.place_id) return;

    isSelectingPlaceRef.current = true;
    latestSearchRequestRef.current += 1;
    setShowSearchResults(false);
    setPlacePredictions([]);
    setIsSearchingPlaces(false);
    setSearchError("");

    const ready = await initPlacesServices();
    if (!ready) {
      isSelectingPlaceRef.current = false;
      setSearchError("Location search is unavailable");
      return;
    }

    if (!placesServiceRef.current && mapInstanceRef.current && window.google?.maps?.places) {
      placesServiceRef.current = new window.google.maps.places.PlacesService(mapInstanceRef.current);
    }

    const label = prediction.description || prediction.structured_formatting?.main_text || locationSearch;

    const applyGeometry = (geometry, displayName, types = []) => {
      if (!geometry?.location) return false;
      focusMapOnLocation(geometry.location, displayName, { ...geometry, types });
      setLocationSearch(displayName || label);
      setPlacePredictions([]);
      setShowSearchResults(false);
      setSearchError("");
      window.setTimeout(() => {
        isSelectingPlaceRef.current = false;
      }, 400);
      return true;
    };

    const fail = (message) => {
      isSelectingPlaceRef.current = false;
      setSearchError(message);
    };

    if (placesServiceRef.current) {
      placesServiceRef.current.getDetails(
        { placeId: prediction.place_id, fields: ["geometry", "formatted_address", "name", "address_components", "types"] },
        (place, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
            const displayName = place.formatted_address || place.name || label;
            if (applyGeometry(place.geometry, displayName, place.types || [])) return;
          }
          geocoderRef.current?.geocode({ placeId: prediction.place_id }, (results, geoStatus) => {
            if (geoStatus === "OK" && results?.[0]?.geometry) {
              applyGeometry(results[0].geometry, results[0].formatted_address || label, results[0].types || []);
            } else {
              fail("Could not locate that place on the map");
            }
          });
        },
      );
      return;
    }

    geocoderRef.current?.geocode({ placeId: prediction.place_id }, (results, geoStatus) => {
      if (geoStatus === "OK" && results?.[0]?.geometry) {
        applyGeometry(results[0].geometry, results[0].formatted_address || label, results[0].types || []);
      } else {
        fail("Could not locate that place on the map");
      }
    });
  }, [focusMapOnLocation, initPlacesServices, locationSearch]);

  const handleLocationSearchChange = (value) => {
    isSelectingPlaceRef.current = false;
    setLocationSearch(value);
    setShowSearchResults(true);
    if (!value.trim()) {
      latestSearchRequestRef.current += 1;
      setPlacePredictions([]);
      setIsSearchingPlaces(false);
      setSearchError("");
      resetMapToDefaultView();
    }
  };

  const handleClearLocationSearch = () => {
    setLocationSearch("");
    setPlacePredictions([]);
    setShowSearchResults(false);
    setIsSearchingPlaces(false);
    setSearchError("");
    resetMapToDefaultView();
  };

  const handleLocationSearchKeyDown = async (event) => {
    if (event.key === "Escape") {
      setShowSearchResults(false);
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();

    if (placePredictions[0]) {
      await handleSelectPlacePrediction(placePredictions[0]);
      return;
    }

    const query = locationSearch.trim();
    if (query.length < SEARCH_MIN_CHARS) return;

    const ready = await initPlacesServices();
    if (!ready || !geocoderRef.current) {
      setSearchError("Location search is unavailable");
      return;
    }

    geocoderRef.current.geocode(
      { address: query, componentRestrictions: { country: "IN" } },
      (results, status) => {
        if (status === "OK" && results?.[0]?.geometry?.location) {
          const displayName = results[0].formatted_address || query;
          focusMapOnLocation(results[0].geometry.location, displayName, { ...results[0].geometry, types: results[0].types || [] });
          setLocationSearch(displayName);
          setPlacePredictions([]);
          setShowSearchResults(false);
          setSearchError("");
        } else {
          setSearchError("No matching locations found");
          setShowSearchResults(true);
        }
      },
    );
  };

  const drawExistingZonesOnMap = useCallback((google, map) => {
    existingZonesPolygonsRef.current.forEach((polygon) => polygon?.setMap(null));
    existingZonesPolygonsRef.current = [];

    (existingZones || []).forEach((zone) => {
      if (!zone.coordinates || zone.coordinates.length < 3) return;
      const path = zone.coordinates
        .map((coord) => {
          const lat = typeof coord === "object" ? (coord.latitude ?? coord.lat) : null;
          const lng = typeof coord === "object" ? (coord.longitude ?? coord.lng) : null;
          if (lat === null || lng === null) return null;
          return new google.maps.LatLng(lat, lng);
        })
        .filter(Boolean);
      if (path.length < 3) return;

      const zoneId = zone._id || zone.id;
      const isSelected = selectedZoneId != null && zoneId != null && String(zoneId) === String(selectedZoneId);

      const polygon = new google.maps.Polygon({
        paths: path,
        strokeColor: isSelected ? "#FF6A00" : "#3b82f6",
        strokeOpacity: isSelected ? 0.9 : 0.6,
        strokeWeight: isSelected ? 3 : 2,
        fillColor: isSelected ? "#FF6A00" : "#3b82f6",
        fillOpacity: isSelected ? 0.28 : 0.15,
        editable: false,
        draggable: false,
        clickable: true,
        zIndex: isSelected ? 5 : 0,
      });
      polygon.setMap(map);
      existingZonesPolygonsRef.current.push(polygon);

      const infoWindow = new google.maps.InfoWindow({
        content: `<div style="padding:8px;"><strong>${zone.name || "Unnamed Zone"}</strong><br/><small>Country: ${zone.country || "N/A"}</small></div>`,
      });
      polygon.addListener("click", () => {
        infoWindow.setPosition(polygon.getPath().getAt(0));
        infoWindow.open(map);
      });
    });
  }, [existingZones, selectedZoneId]);

  const renderVertexMarkers = (google, map, latLngs) => {
    pathMarkersRef.current?.forEach((m) => m.setMap(null));
    pathMarkersRef.current = latLngs.map((latLng, i) => new google.maps.Marker({
      position: latLng,
      map,
      clickable: false,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: "#9333ea",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2,
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
    emitChange(ordered.map((p) => ({ latitude: parseFloat(p.lat.toFixed(6)), longitude: parseFloat(p.lng.toFixed(6)) })));
  };

  const finishDrawing = () => {
    const google = window.google;
    const map = mapInstanceRef.current;
    if (!google || !map) return false;

    const points = drawPointsRef.current;
    if (points.length < MIN_POINTS) {
      alert(`Please click at least ${MIN_POINTS} points on the map.`);
      return false;
    }

    if (polygonRef.current) {
      polygonRef.current.setMap(null);
      polygonRef.current = null;
    }
    pathMarkersRef.current?.forEach((m) => m.setMap(null));
    pathMarkersRef.current = [];

    const ordered = points.map((p) => ({ lat: p.lat(), lng: p.lng() }));
    const coords = ordered.map((p) => ({ latitude: parseFloat(p.lat.toFixed(6)), longitude: parseFloat(p.lng.toFixed(6)) }));
    emitChange(coords);
    drawEditablePolygon(google, map, coords);
    return true;
  };

  const drawEditablePolygon = (google, map, coords) => {
    const path = coords.map((c) => {
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
    pathMarkersRef.current = [];

    const sync = () => {
      const p = polygon.getPath();
      const out = [];
      p.forEach((ll) => out.push({ latitude: parseFloat(ll.lat().toFixed(6)), longitude: parseFloat(ll.lng().toFixed(6)) }));
      emitChange(out);
      drawPointsRef.current = p.getArray();
    };
    const pp = polygon.getPath();
    google.maps.event.addListener(pp, "set_at", sync);
    google.maps.event.addListener(pp, "insert_at", sync);
    google.maps.event.addListener(pp, "remove_at", sync);
  };

  const drawExistingPolygon = useCallback((google, map, coords) => {
    if (!coords || coords.length < 3) return;

    if (polygonRef.current) polygonRef.current.setMap(null);
    if (pathMarkersRef.current?.length) {
      pathMarkersRef.current.forEach((marker) => marker.setMap(null));
      pathMarkersRef.current = [];
    }

    const googlePoints = coords
      .map((coord) => {
        const lat = typeof coord === "object" ? (coord.latitude ?? coord.lat) : null;
        const lng = typeof coord === "object" ? (coord.longitude ?? coord.lng) : null;
        if (lat !== null && lng !== null) return new google.maps.LatLng(lat, lng);
        return null;
      })
      .filter(Boolean);

    drawPointsRef.current = googlePoints;

    const bounds = new google.maps.LatLngBounds();
    googlePoints.forEach((latLng) => bounds.extend(latLng));
    map.fitBounds(bounds);

    drawEditablePolygon(google, map, coords);
  }, []);

  const toggleDrawingMode = () => {
    const google = window.google;
    const map = mapInstanceRef.current;
    if (!google || !map) {
      alert("Map is still loading.");
      return;
    }

    if (isDrawing) {
      if (finishDrawing() === false) return;
      isDrawingRef.current = false;
      setIsDrawing(false);
      map.setOptions({ draggableCursor: null });
      existingZonesPolygonsRef.current.forEach((p) => p?.setOptions?.({ clickable: true }));
    } else {
      clearDrawing();
      drawPointsRef.current = [];
      isDrawingRef.current = true;
      setIsDrawing(true);
      map.setOptions({ draggableCursor: "crosshair" });
      existingZonesPolygonsRef.current.forEach((p) => p?.setOptions?.({ clickable: false }));
    }
  };

  const clearDrawing = () => {
    drawPointsRef.current = [];
    if (polygonRef.current) {
      polygonRef.current.setMap(null);
      polygonRef.current = null;
    }
    pathMarkersRef.current?.forEach((m) => m.setMap(null));
    pathMarkersRef.current = [];
    emitChange([]);
  };

  const initializeMap = useCallback((google) => {
    if (!mapRef.current) return;

    const map = new google.maps.Map(mapRef.current, {
      center: DEFAULT_MAP_CENTER,
      zoom: DEFAULT_MAP_ZOOM,
      clickableIcons: false,
      mapTypeControl: true,
      mapTypeControlOptions: {
        style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
        position: google.maps.ControlPosition.TOP_RIGHT,
        mapTypeIds: [google.maps.MapTypeId.ROADMAP, google.maps.MapTypeId.SATELLITE],
      },
      zoomControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      scrollwheel: true,
      gestureHandling: "greedy",
      disableDoubleClickZoom: false,
    });

    mapInstanceRef.current = map;

    setTimeout(() => {
      google.maps.event.trigger(map, "resize");

      // A selected existing zone takes priority over the default India-wide view —
      // re-applied here (not just in the effect below) because triggering "resize"
      // can itself reset the viewport, which would otherwise undo the fit.
      const selectedZone = selectedZoneId != null
        ? (existingZones || []).find((z) => String(z._id || z.id) === String(selectedZoneId))
        : null;
      if (selectedZone?.coordinates?.length >= 3) {
        const bounds = new google.maps.LatLngBounds();
        selectedZone.coordinates.forEach((coord) => {
          const lat = typeof coord === "object" ? (coord.latitude ?? coord.lat) : null;
          const lng = typeof coord === "object" ? (coord.longitude ?? coord.lng) : null;
          if (lat !== null && lng !== null) bounds.extend(new google.maps.LatLng(lat, lng));
        });
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, 48);
          return;
        }
      }

      map.setCenter(DEFAULT_MAP_CENTER);
      map.setZoom(DEFAULT_MAP_ZOOM);
    }, 120);

    mapClickListenerRef.current = google.maps.event.addListener(map, "click", (event) => {
      if (readOnly || !isDrawingRef.current) return;
      if (drawPointsRef.current.length >= MAX_POINTS) {
        alert(`You can add at most ${MAX_POINTS} points. Click "Finish Drawing" to complete.`);
        return;
      }
      drawPointsRef.current.push(event.latLng);
      renderDrawingPolygon(google, map);
    });

    setMapLoading(false);
    initPlacesServices().catch(() => {});

    if (existingZones.length > 0) drawExistingZonesOnMap(google, map);

    if (isEditMode && coordinates.length >= 3 && !bootstrappedRef.current) {
      bootstrappedRef.current = true;
      setTimeout(() => {
        if (mapInstanceRef.current && window.google) drawExistingPolygon(window.google, mapInstanceRef.current, coordinates);
      }, 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadGoogleMaps = async () => {
    try {
      const apiKey = await getGoogleMapsApiKey();
      setGoogleMapsApiKey(apiKey || "loaded");

      if (apiKey) {
        try {
          await loadGoogleMapsSingleton(apiKey);
          await ensurePlacesLibrary();
          if (window.google?.maps) {
            initializeMap(window.google);
            return;
          }
        } catch {
          /* fall through to legacy loader below */
        }
      }

      let retries = 0;
      while (!window.google && retries < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        retries += 1;
      }

      if (window.google && window.google.maps) {
        await ensurePlacesLibrary();
        initializeMap(window.google);
        return;
      }

      if (apiKey) {
        const loader = new Loader({ apiKey, version: "weekly", libraries: ["places", "geometry"] });
        const google = await loader.load();
        await ensurePlacesLibrary();
        initializeMap(google);
      } else {
        setMapLoading(false);
      }
    } catch {
      setMapLoading(false);
    }
  };

  // Redraw existing zones when the data or map readiness changes
  useEffect(() => {
    if (!mapLoading && mapInstanceRef.current && existingZones.length > 0 && window.google) {
      drawExistingZonesOnMap(window.google, mapInstanceRef.current);
    }
  }, [existingZones, mapLoading, drawExistingZonesOnMap]);

  // Fit the map to the selected existing zone's complete polygon (not just its
  // first point) whenever the selection changes — smooth pan/zoom via fitBounds.
  useEffect(() => {
    if (mapLoading || !mapInstanceRef.current || !window.google || selectedZoneId == null) return;
    const zone = (existingZones || []).find((z) => String(z._id || z.id) === String(selectedZoneId));
    if (!zone?.coordinates || zone.coordinates.length < 3) return;

    const google = window.google;
    const map = mapInstanceRef.current;
    const bounds = new google.maps.LatLngBounds();
    zone.coordinates.forEach((coord) => {
      const lat = typeof coord === "object" ? (coord.latitude ?? coord.lat) : null;
      const lng = typeof coord === "object" ? (coord.longitude ?? coord.lng) : null;
      if (lat !== null && lng !== null) bounds.extend(new google.maps.LatLng(lat, lng));
    });
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 48);
    }
  }, [selectedZoneId, existingZones, mapLoading]);

  // Bootstrap existing polygon once coordinates arrive after the map is already ready (edit mode)
  useEffect(() => {
    if (isEditMode && coordinates.length >= 3 && mapInstanceRef.current && window.google && !mapLoading && !bootstrappedRef.current) {
      bootstrappedRef.current = true;
      setTimeout(() => {
        if (mapInstanceRef.current && window.google) {
          isDrawingRef.current = false;
          setIsDrawing(false);
          mapInstanceRef.current.setOptions({ draggableCursor: null });
          drawExistingPolygon(window.google, mapInstanceRef.current, coordinates);
        }
      }, 500);
    }
  }, [isEditMode, coordinates, mapLoading, drawExistingPolygon]);

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleDrawingMode}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 transition-colors",
              isDrawing ? "bg-red-600 text-white hover:bg-red-700" : "bg-blue-600 text-white hover:bg-blue-700",
            )}
          >
            <Shapes className="h-4 w-4" />
            <span>{isDrawing ? "Stop Drawing" : "Start Drawing"}</span>
          </button>
          {coordinates.length > 0 && (
            <button
              type="button"
              onClick={clearDrawing}
              className="flex items-center gap-2 rounded-lg bg-slate-600 px-4 py-2 text-white transition-colors hover:bg-slate-700"
            >
              <X className="h-4 w-4" />
              <span>Clear</span>
            </button>
          )}
        </div>
      )}

      {!readOnly && (
        <div className="relative z-20" ref={searchWrapRef}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            ref={autocompleteInputRef}
            type="text"
            placeholder="Search city, area, locality, address, landmark, or PIN..."
            value={locationSearch}
            onChange={(e) => handleLocationSearchChange(e.target.value)}
            onFocus={() => {
              if (locationSearch.trim().length >= SEARCH_MIN_CHARS || placePredictions.length > 0) setShowSearchResults(true);
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

          {showSearchResults && locationSearch.trim().length >= SEARCH_MIN_CHARS && (
            <div className="absolute left-0 right-0 top-full z-[1000] mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {isSearchingPlaces && <div className="px-3 py-2 text-sm text-slate-500">Searching locations...</div>}
              {!isSearchingPlaces && placePredictions.length === 0 && (
                <div className="px-3 py-2 text-sm text-slate-500">{searchError || "No matching locations found"}</div>
              )}
              {!isSearchingPlaces && placePredictions.map((prediction) => (
                <button
                  key={prediction.place_id}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleSelectPlacePrediction(prediction);
                  }}
                  className="flex w-full items-start gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50"
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-800">
                      {prediction.structured_formatting?.main_text || prediction.description}
                    </span>
                    {prediction.structured_formatting?.secondary_text ? (
                      <span className="block text-xs text-slate-500">{prediction.structured_formatting.secondary_text}</span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {coordinates.length > 0 && (
        <p className="text-xs text-slate-600">
          Points drawn: <strong>{coordinates.length}</strong>
          {coordinates.length < 3 && <span className="ml-2 text-red-600">(Minimum 3 points required)</span>}
        </p>
      )}

      <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
        <div ref={mapRef} className="h-[min(70vh,640px)] min-h-[420px] w-full" />

        {mapLoading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-100/90">
            <div className="text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
              <p className="text-slate-600">Loading map...</p>
            </div>
          </div>
        )}

        {!googleMapsApiKey && !mapLoading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-100">
            <div className="p-6 text-center">
              <MapPin className="mx-auto mb-4 h-12 w-12 text-slate-400" />
              <p className="text-sm text-slate-600">Google Maps API key not found</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
