import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MapPin, Save, X, Shapes, Search } from "lucide-react";
import { toast } from "sonner";
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey";
import { loadGoogleMaps as loadGoogleMapsSingleton } from "@core/services/googleMapsLoader";
import { Loader } from "@googlemaps/js-api-loader";
import VendorLayout from "../components/VendorLayout";
import { bikeVendorApi } from "../services/vendorApi";

const MIN_POINTS = 3;
const MAX_POINTS = 10;
const DEFAULT_MAP_CENTER = { lat: 20.5937, lng: 78.9629 };
const DEFAULT_MAP_ZOOM = 5;
const SEARCH_MIN_CHARS = 2;
const SEARCH_DEBOUNCE_MS = 280;
const MAX_SEARCH_RESULTS = 8;
const inputClass = "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm";

const ensurePlacesLibrary = async () => {
  if (window.google?.maps?.places?.AutocompleteService) return true;
  if (typeof window.google?.maps?.importLibrary === "function") {
    try {
      await window.google.maps.importLibrary("places");
    } catch {
      /* ignore */
    }
  }
  return Boolean(window.google?.maps?.places?.AutocompleteService);
};

export default function VendorAddZone() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = Boolean(id);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const polygonRef = useRef(null);
  const pathMarkersRef = useRef([]);
  const mapClickListenerRef = useRef(null);
  const drawPointsRef = useRef([]);
  const isDrawingRef = useRef(false);

  const [mapLoading, setMapLoading] = useState(true);
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ zoneName: "", unit: "kilometer" });
  const [coordinates, setCoordinates] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [locationSearch, setLocationSearch] = useState("");
  const [placePredictions, setPlacePredictions] = useState([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [existingZones, setExistingZones] = useState([]);
  const searchWrapRef = useRef(null);
  const autocompleteServiceRef = useRef(null);
  const placesServiceRef = useRef(null);
  const geocoderRef = useRef(null);
  const searchMarkerRef = useRef(null);
  const latestSearchRequestRef = useRef(0);
  const isSelectingPlaceRef = useRef(false);
  const existingZonesPolygonsRef = useRef([]);

  useEffect(() => {
    fetchExistingZones();
    loadGoogleMaps();
    if (isEditMode) fetchZone();
    return () => {
      const google = window.google;
      if (google && mapClickListenerRef.current) {
        google.maps.event.removeListener(mapClickListenerRef.current);
      }
      if (polygonRef.current) polygonRef.current.setMap(null);
      pathMarkersRef.current?.forEach((m) => m.setMap(null));
      existingZonesPolygonsRef.current?.forEach((p) => p?.setMap(null));
      if (searchMarkerRef.current) searchMarkerRef.current.setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchExistingZones = async () => {
    try {
      const result = await bikeVendorApi.getZones({ limit: 100 });
      const zones = result.records || [];
      setExistingZones(isEditMode ? zones.filter((z) => String(z.id) !== String(id)) : zones);
    } catch {
      setExistingZones([]);
    }
  };

  const fetchZone = async () => {
    try {
      const zone = await bikeVendorApi.getZoneById(id);
      if (zone) {
        setFormData({ zoneName: zone.name || "", unit: zone.unit || "kilometer" });
        if (zone.coordinates?.length) setCoordinates(zone.coordinates);
      }
    } catch {
      toast.error("Failed to load zone");
      navigate("/bike-rent/vendor/zones");
    }
  };

  const initPlacesServices = useCallback(async () => {
    const ready = await ensurePlacesLibrary();
    if (!ready || !window.google?.maps?.places) return false;
    if (!autocompleteServiceRef.current) {
      autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
    }
    if (!geocoderRef.current) geocoderRef.current = new window.google.maps.Geocoder();
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

  const focusMapOnLocation = useCallback(
    (latLng, label = "", geometry = null) => {
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
        map.setZoom(14);
      }
      searchMarkerRef.current = new google.maps.Marker({
        map,
        position: latLng,
        title: label || "Selected location",
        animation: google.maps.Animation.DROP,
      });
    },
    [clearSearchMarker],
  );

  useEffect(() => {
    if (mapLoading || isSelectingPlaceRef.current) return undefined;
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
          setSearchError("Location search is unavailable.");
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
          setIsSearchingPlaces(false);
          const ok = status === window.google.maps.places.PlacesServiceStatus.OK;
          if (ok && Array.isArray(predictions)) {
            setPlacePredictions(predictions.slice(0, MAX_SEARCH_RESULTS));
            setShowSearchResults(true);
            setSearchError("");
          } else {
            setPlacePredictions([]);
            setShowSearchResults(true);
            setSearchError("No matching locations found");
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

  const handleSelectPlacePrediction = useCallback(
    async (prediction) => {
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
      geocoderRef.current?.geocode({ placeId: prediction.place_id }, (results, geoStatus) => {
        if (geoStatus === "OK" && results?.[0]?.geometry) {
          applyGeometry(results[0].geometry, results[0].formatted_address || label, results[0].types || []);
        } else {
          isSelectingPlaceRef.current = false;
          setSearchError("Could not locate that place on the map");
        }
      });
    },
    [focusMapOnLocation, initPlacesServices, locationSearch],
  );

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
          /* fall through */
        }
      }
      let retries = 0;
      while (!window.google && retries < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        retries++;
      }
      if (window.google?.maps) {
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

  const initializeMap = (google) => {
    if (!mapRef.current) return;
    const map = new google.maps.Map(mapRef.current, {
      center: DEFAULT_MAP_CENTER,
      zoom: DEFAULT_MAP_ZOOM,
      clickableIcons: false,
      mapTypeControl: true,
      zoomControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      gestureHandling: "greedy",
    });
    mapInstanceRef.current = map;
    setTimeout(() => {
      google.maps.event.trigger(map, "resize");
      map.setCenter(DEFAULT_MAP_CENTER);
      map.setZoom(DEFAULT_MAP_ZOOM);
    }, 120);

    mapClickListenerRef.current = google.maps.event.addListener(map, "click", (event) => {
      if (!isDrawingRef.current) return;
      if (drawPointsRef.current.length >= MAX_POINTS) {
        toast.error(`You can add at most ${MAX_POINTS} points. Click "Stop Drawing" to finish.`);
        return;
      }
      drawPointsRef.current.push(event.latLng);
      renderDrawingPolygon(google, map);
    });

    setMapLoading(false);
    initPlacesServices().catch(() => {});
    if (existingZones.length > 0) drawExistingZonesOnMap(google, map);
    if (isEditMode && coordinates.length >= 3) {
      setTimeout(() => {
        if (mapInstanceRef.current && window.google) {
          drawExistingPolygon(window.google, mapInstanceRef.current, coordinates);
        }
      }, 500);
    }
  };

  const drawExistingZonesOnMap = (google, map) => {
    existingZonesPolygonsRef.current.forEach((p) => p?.setMap(null));
    existingZonesPolygonsRef.current = [];
    existingZones.forEach((zone) => {
      if (!zone.coordinates || zone.coordinates.length < 3) return;
      const path = zone.coordinates
        .map((c) => new google.maps.LatLng(c.lat ?? c.latitude, c.lng ?? c.longitude))
        .filter(Boolean);
      if (path.length < 3) return;
      const polygon = new google.maps.Polygon({
        paths: path,
        strokeColor: "#3b82f6",
        strokeOpacity: 0.6,
        strokeWeight: 2,
        fillColor: "#3b82f6",
        fillOpacity: 0.15,
        editable: false,
        draggable: false,
        clickable: true,
        zIndex: 0,
      });
      polygon.setMap(map);
      existingZonesPolygonsRef.current.push(polygon);
      const infoWindow = new google.maps.InfoWindow({
        content: `<div style="padding:8px;"><strong>${zone.name || "Zone"}</strong></div>`,
      });
      polygon.addListener("click", () => {
        infoWindow.setPosition(polygon.getPath().getAt(0));
        infoWindow.open(map);
      });
    });
  };

  useEffect(() => {
    if (!mapLoading && mapInstanceRef.current && existingZones.length > 0 && window.google) {
      drawExistingZonesOnMap(window.google, mapInstanceRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingZones, mapLoading]);

  const renderVertexMarkers = (google, map, latLngs) => {
    pathMarkersRef.current?.forEach((m) => m.setMap(null));
    pathMarkersRef.current = latLngs.map(
      (latLng, i) =>
        new google.maps.Marker({
          position: latLng,
          map,
          clickable: false,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#FF6A00",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
          zIndex: 1000,
          title: `Point ${i + 1}`,
        }),
    );
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
        fillColor: "#FF6A00",
        fillOpacity: 0.35,
        strokeColor: "#FF6A00",
        strokeWeight: 2,
        clickable: false,
        editable: false,
        zIndex: 1,
      });
      polygonRef.current.setMap(map);
    }
    renderVertexMarkers(google, map, points);
    setCoordinates(ordered.map((p) => ({ lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)) })));
  };

  const drawEditablePolygon = (google, map, coords) => {
    const path = coords.map((c) => new google.maps.LatLng(Number(c.lat ?? c.latitude), Number(c.lng ?? c.longitude)));
    const polygon = new google.maps.Polygon({
      paths: path,
      strokeColor: "#FF6A00",
      strokeOpacity: 0.8,
      strokeWeight: 3,
      fillColor: "#FF6A00",
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
      p.forEach((ll) => out.push({ lat: Number(ll.lat().toFixed(6)), lng: Number(ll.lng().toFixed(6)) }));
      setCoordinates(out);
      drawPointsRef.current = p.getArray();
    };
    const pp = polygon.getPath();
    google.maps.event.addListener(pp, "set_at", sync);
    google.maps.event.addListener(pp, "insert_at", sync);
    google.maps.event.addListener(pp, "remove_at", sync);
  };

  const drawExistingPolygon = (google, map, coords) => {
    if (!coords || coords.length < 3) return;
    if (polygonRef.current) polygonRef.current.setMap(null);
    pathMarkersRef.current?.forEach((m) => m.setMap(null));
    pathMarkersRef.current = [];
    const googlePoints = coords
      .map((c) => (c.lat != null && c.lng != null ? new google.maps.LatLng(c.lat, c.lng) : null))
      .filter(Boolean);
    drawPointsRef.current = googlePoints;
    const bounds = new google.maps.LatLngBounds();
    googlePoints.forEach((ll) => bounds.extend(ll));
    map.fitBounds(bounds);
    drawEditablePolygon(google, map, coords);
  };

  const clearDrawing = () => {
    drawPointsRef.current = [];
    if (polygonRef.current) {
      polygonRef.current.setMap(null);
      polygonRef.current = null;
    }
    pathMarkersRef.current?.forEach((m) => m.setMap(null));
    pathMarkersRef.current = [];
    setCoordinates([]);
  };

  const finishDrawing = () => {
    const google = window.google;
    const map = mapInstanceRef.current;
    if (!google || !map) return false;
    const points = drawPointsRef.current;
    if (points.length < MIN_POINTS) {
      toast.error(`Please click at least ${MIN_POINTS} points on the map.`);
      return false;
    }
    if (polygonRef.current) {
      polygonRef.current.setMap(null);
      polygonRef.current = null;
    }
    pathMarkersRef.current?.forEach((m) => m.setMap(null));
    pathMarkersRef.current = [];
    const ordered = points.map((p) => ({ lat: p.lat(), lng: p.lng() }));
    const coords = ordered.map((p) => ({ lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)) }));
    setCoordinates(coords);
    drawEditablePolygon(google, map, coords);
    return true;
  };

  const toggleDrawingMode = () => {
    const google = window.google;
    const map = mapInstanceRef.current;
    if (!google || !map) {
      toast.error("Map is still loading.");
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.zoneName.trim()) return toast.error("Enter a zone name");
    if (coordinates.length < 3) return toast.error("Draw at least 3 points on the map");

    const payload = {
      name: formData.zoneName.trim(),
      country: "India",
      unit: formData.unit || "kilometer",
      coordinates,
      status: "active",
    };

    setSaving(true);
    try {
      if (isEditMode) {
        await bikeVendorApi.updateZone(id, payload);
        toast.success("Zone updated");
      } else {
        await bikeVendorApi.createZone(payload);
        toast.success("Zone created");
      }
      navigate("/bike-rent/vendor/zones");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not save zone");
    } finally {
      setSaving(false);
    }
  };

  return (
    <VendorLayout
      title={isEditMode ? "Edit zone" : "New zone"}
      subtitle="Draw the service area on the map, then save."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-bold text-gray-600">
              Zone name <span className="text-[#FF6A00]">*</span>
            </label>
            <input
              value={formData.zoneName}
              onChange={(e) => setFormData((f) => ({ ...f, zoneName: e.target.value }))}
              className={inputClass}
              placeholder="Enter zone name"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-gray-600">Unit</label>
            <select
              value={formData.unit}
              onChange={(e) => setFormData((f) => ({ ...f, unit: e.target.value }))}
              className={inputClass}
            >
              <option value="kilometer">Kilometers (km)</option>
              <option value="mile">Miles (mi)</option>
            </select>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-gray-900">Draw zone on map</h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleDrawingMode}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-white transition-colors ${
                  isDrawing ? "bg-red-600 hover:bg-red-700" : "bg-[#FF6A00] hover:bg-[#e05f00]"
                }`}
              >
                <Shapes className="h-3.5 w-3.5" />
                {isDrawing ? "Stop drawing" : "Start drawing"}
              </button>
              {coordinates.length > 0 && (
                <button
                  type="button"
                  onClick={clearDrawing}
                  className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="relative z-20 mb-3" ref={searchWrapRef}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search city, area, locality, address..."
              value={locationSearch}
              onChange={(e) => {
                isSelectingPlaceRef.current = false;
                setLocationSearch(e.target.value);
                setShowSearchResults(true);
              }}
              onFocus={() => {
                if (locationSearch.trim().length >= SEARCH_MIN_CHARS) setShowSearchResults(true);
              }}
              autoComplete="off"
              className={`${inputClass} pl-9`}
            />
            {showSearchResults && locationSearch.trim().length >= SEARCH_MIN_CHARS && (
              <div className="absolute left-0 right-0 top-full z-[1000] mt-1 max-h-64 overflow-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                {isSearchingPlaces && <div className="px-3 py-2 text-sm text-gray-500">Searching…</div>}
                {!isSearchingPlaces && placePredictions.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-500">{searchError || "No matching locations"}</div>
                )}
                {!isSearchingPlaces &&
                  placePredictions.map((prediction) => (
                    <button
                      key={prediction.place_id}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        handleSelectPlacePrediction(prediction);
                      }}
                      className="flex w-full items-start gap-2 border-b border-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-gray-50"
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                      <span className="text-sm text-gray-800">
                        {prediction.structured_formatting?.main_text || prediction.description}
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </div>

          {coordinates.length > 0 && (
            <p className="mb-2 text-xs text-gray-600">
              Points drawn: <strong>{coordinates.length}</strong>
              {coordinates.length < 3 && <span className="ml-2 text-red-600">(minimum 3 required)</span>}
            </p>
          )}

          <div className="relative w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
            <div ref={mapRef} className="h-[min(65vh,560px)] min-h-[380px] w-full" />
            {mapLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100/90">
                <div className="text-center">
                  <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[#FF6A00] border-t-transparent" />
                  <p className="text-sm text-gray-600">Loading map…</p>
                </div>
              </div>
            )}
            {!googleMapsApiKey && !mapLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                <div className="p-6 text-center">
                  <MapPin className="mx-auto mb-3 h-10 w-10 text-gray-400" />
                  <p className="text-sm text-gray-600">Google Maps API key not found</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => navigate("/bike-rent/vendor/zones")}
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 sm:w-auto"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || coordinates.length < 3 || !formData.zoneName.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF6A00] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60 sm:w-auto"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save zone"}
          </button>
        </div>
      </form>
    </VendorLayout>
  );
}
