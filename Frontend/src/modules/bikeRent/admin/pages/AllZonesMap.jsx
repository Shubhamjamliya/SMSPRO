import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, ArrowLeft, Search } from "lucide-react";
import bikeRentAdminApi from "../services/adminApi";
import { toast } from "sonner";
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey";
import { Loader } from "@googlemaps/js-api-loader";

const ZONES_BASE = "/admin/bike-rent/zones";

const ZONE_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
];

/** Normalize any zone/bike coordinate shape to { lat, lng }. */
const toLatLng = (coord) => {
  if (!coord || typeof coord !== "object") return null;

  // GeoJSON Point: { type, coordinates: [lng, lat] }
  if (Array.isArray(coord.coordinates) && coord.coordinates.length >= 2) {
    const lng = Number(coord.coordinates[0]);
    const lat = Number(coord.coordinates[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  // Plain [lng, lat] or [lat, lng]
  if (Array.isArray(coord) && coord.length >= 2) {
    const a = Number(coord[0]);
    const b = Number(coord[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    if (Math.abs(a) > 90 && Math.abs(b) <= 90) return { lat: b, lng: a };
    return { lat: a, lng: b };
  }

  const lat = Number(coord.latitude ?? coord.lat);
  const lng = Number(coord.longitude ?? coord.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};

const normalizeZonePath = (coordinates = []) =>
  (Array.isArray(coordinates) ? coordinates : [])
    .map(toLatLng)
    .filter(Boolean);

const extractBikeLatLng = (source) => {
  if (!source || typeof source !== "object") return null;
  return (
    toLatLng(source)
    || toLatLng(source.location)
    || toLatLng(source.coordinates)
    || toLatLng(source.geo)
    || toLatLng(source.position)
  );
};

const getZoneCenter = (path) => {
  if (!path?.length) return null;
  const sum = path.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 },
  );
  return { lat: sum.lat / path.length, lng: sum.lng / path.length };
};

export default function AllZonesMap() {
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const zonesPolygonsRef = useRef([]);
  const infoWindowsRef = useRef([]);
  const bikeMarkersRef = useRef([]);
  const zoneCenterMarkersRef = useRef([]);
  const autocompleteInputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const zonesRef = useRef([]);
  const bikesRef = useRef([]);

  const [googleMapsApiKey, setGoogleMapsApiKey] = useState("");
  const [mapLoading, setMapLoading] = useState(true);
  const [zones, setZones] = useState([]);
  const [bikes, setBikes] = useState([]);
  const [bikesWithCoords, setBikesWithCoords] = useState(0);
  const [zonesDrawn, setZonesDrawn] = useState(0);
  const [loading, setLoading] = useState(true);
  const [locationSearch, setLocationSearch] = useState("");

  const clearOverlays = useCallback(() => {
    zonesPolygonsRef.current.forEach((polygon) => polygon?.setMap(null));
    zonesPolygonsRef.current = [];
    zoneCenterMarkersRef.current.forEach((marker) => marker?.setMap(null));
    zoneCenterMarkersRef.current = [];
    bikeMarkersRef.current.forEach((marker) => marker?.setMap(null));
    bikeMarkersRef.current = [];
    infoWindowsRef.current.forEach((iw) => iw?.close());
    infoWindowsRef.current = [];
  }, []);

  const drawBikeMarkers = useCallback((google, map, bikeList) => {
    bikeMarkersRef.current.forEach((marker) => marker?.setMap(null));
    bikeMarkersRef.current = [];

    if (!bikeList?.length) {
      setBikesWithCoords(0);
      return;
    }

    let plotted = 0;
    bikeList.forEach((bike) => {
      const coords = extractBikeLatLng(bike);
      if (!coords) return;

      const marker = new google.maps.Marker({
        position: coords,
        map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#ef4444",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
        title: bike.name || bike.registrationNumber || bike.plateNumber || "Bike",
        zIndex: 1000,
      });

      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="padding: 12px; min-width: 200px;">
            <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #1e293b;">
              ${bike.name || bike.registrationNumber || bike.plateNumber || "Unnamed Bike"}
            </h3>
            <div style="font-size: 13px; color: #64748b; line-height: 1.6;">
              ${bike.registrationNumber || bike.plateNumber ? `<div style="margin-bottom: 4px;"><strong>Reg:</strong> ${bike.registrationNumber || bike.plateNumber}</div>` : ""}
              ${bike.availabilityStatus ? `<div style="margin-bottom: 4px;"><strong>Status:</strong> ${bike.availabilityStatus}</div>` : ""}
              ${bike.zoneName || bike.zoneId ? `<div><strong>Zone:</strong> ${bike.zoneName || (typeof bike.zoneId === "object" ? (bike.zoneId.name || "") : bike.zoneId)}</div>` : ""}
            </div>
          </div>
        `,
      });

      marker.addListener("click", () => {
        infoWindowsRef.current.forEach((iw) => {
          if (iw && iw !== infoWindow) iw.close();
        });
        infoWindow.open(map, marker);
        infoWindowsRef.current.push(infoWindow);
      });

      bikeMarkersRef.current.push(marker);
      plotted += 1;
    });

    setBikesWithCoords(plotted);
  }, []);

  const drawAllZonesOnMap = useCallback((google, map, zoneList) => {
    zonesPolygonsRef.current.forEach((polygon) => polygon?.setMap(null));
    zonesPolygonsRef.current = [];
    zoneCenterMarkersRef.current.forEach((marker) => marker?.setMap(null));
    zoneCenterMarkersRef.current = [];
    infoWindowsRef.current.forEach((iw) => iw?.close());
    infoWindowsRef.current = [];

    if (!zoneList?.length) {
      setZonesDrawn(0);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    let drawn = 0;

    zoneList.forEach((zone, index) => {
      const pathPoints = normalizeZonePath(zone.coordinates);
      if (pathPoints.length < 3) return;

      const path = pathPoints.map((p) => {
        const latLng = new google.maps.LatLng(p.lat, p.lng);
        bounds.extend(latLng);
        return latLng;
      });

      const color = ZONE_COLORS[index % ZONE_COLORS.length];
      const polygon = new google.maps.Polygon({
        paths: path,
        strokeColor: color,
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: color,
        fillOpacity: 0.25,
        editable: false,
        draggable: false,
        clickable: true,
        zIndex: 1,
      });

      polygon.setMap(map);
      zonesPolygonsRef.current.push(polygon);
      drawn += 1;

      const center = getZoneCenter(pathPoints);
      if (center) {
        const centerMarker = new google.maps.Marker({
          position: center,
          map,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 6,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
          title: zone.name || "Zone center",
          zIndex: 500,
        });
        zoneCenterMarkersRef.current.push(centerMarker);
      }

      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="padding: 12px; min-width: 200px;">
            <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #1e293b;">
              ${zone.name || "Unnamed Zone"}
            </h3>
            <div style="font-size: 13px; color: #64748b; line-height: 1.6;">
              <div style="margin-bottom: 4px;"><strong>Country:</strong> ${zone.country || "N/A"}</div>
              <div style="margin-bottom: 4px;"><strong>Unit:</strong> ${zone.unit || "km"}</div>
              <div style="margin-bottom: 4px;"><strong>Points:</strong> ${pathPoints.length}</div>
              <div>
                <strong>Status:</strong>
                <span style="color: ${zone.status === "active" ? "#10b981" : "#ef4444"}; font-weight: 600;">
                  ${zone.status === "active" ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
          </div>
        `,
      });

      polygon.addListener("click", () => {
        infoWindowsRef.current.forEach((iw) => {
          if (iw && iw !== infoWindow) iw.close();
        });
        infoWindow.setPosition(path[0]);
        infoWindow.open(map);
        infoWindowsRef.current.push(infoWindow);
      });
    });

    setZonesDrawn(drawn);

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
    }
  }, []);

  const redrawMapOverlays = useCallback(() => {
    const google = window.google;
    const map = mapInstanceRef.current;
    if (!google?.maps || !map) return;

    google.maps.event.trigger(map, "resize");
    drawAllZonesOnMap(google, map, zonesRef.current);
    drawBikeMarkers(google, map, bikesRef.current);
  }, [drawAllZonesOnMap, drawBikeMarkers]);

  const redrawMapOverlaysRef = useRef(redrawMapOverlays);
  useEffect(() => {
    redrawMapOverlaysRef.current = redrawMapOverlays;
  }, [redrawMapOverlays]);

  useEffect(() => {
    let cancelled = false;
    let idleFallbackTimer = null;

    const initializeMap = (google) => {
      if (cancelled) return;

      if (!mapRef.current) {
        setTimeout(() => initializeMap(google), 200);
        return;
      }

      const container = mapRef.current;
      if (container.offsetWidth === 0 || container.offsetHeight === 0) {
        setTimeout(() => initializeMap(google), 200);
        return;
      }

      if (mapInstanceRef.current) {
        setMapLoading(false);
        redrawMapOverlaysRef.current();
        return;
      }

      const map = new google.maps.Map(container, {
        center: { lat: 20.5937, lng: 78.9629 },
        zoom: 5,
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

      google.maps.event.addListenerOnce(map, "idle", () => {
        if (cancelled) return;
        setMapLoading(false);
        setTimeout(() => redrawMapOverlaysRef.current(), 150);
      });

      idleFallbackTimer = setTimeout(() => {
        if (cancelled) return;
        setMapLoading(false);
        redrawMapOverlaysRef.current();
      }, 2000);
    };

    const loadGoogleMaps = async () => {
      try {
        const apiKey = await getGoogleMapsApiKey();
        if (cancelled) return;
        setGoogleMapsApiKey(apiKey || "loaded");

        let retries = 0;
        while (!window.google && retries < 50) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          if (cancelled) return;
          retries += 1;
        }

        if (window.google?.maps) {
          initializeMap(window.google);
          return;
        }

        if (apiKey) {
          const loader = new Loader({
            apiKey,
            version: "weekly",
            libraries: ["places", "drawing", "geometry"],
          });
          const google = await loader.load();
          if (!cancelled) initializeMap(google);
        } else if (!cancelled) {
          setMapLoading(false);
        }
      } catch {
        if (!cancelled) {
          setMapLoading(false);
          toast.error("Failed to load Google Maps");
        }
      }
    };

    (async () => {
      setLoading(true);
      try {
        const [zonesResult, bikesResult] = await Promise.all([
          bikeRentAdminApi.getZones({ limit: 100, sortBy: "name", sortOrder: "asc" }),
          bikeRentAdminApi.getBikes({ limit: 100 }),
        ]);
        if (cancelled) return;

        const nextZones = zonesResult.records || [];
        const nextBikes = bikesResult.records || [];
        zonesRef.current = nextZones;
        bikesRef.current = nextBikes;
        setZones(nextZones);
        setBikes(nextBikes);
      } catch {
        if (!cancelled) {
          toast.error("Failed to load Bike Rent zones");
          zonesRef.current = [];
          bikesRef.current = [];
          setZones([]);
          setBikes([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    loadGoogleMaps();

    return () => {
      cancelled = true;
      if (idleFallbackTimer) clearTimeout(idleFallbackTimer);
      clearOverlays();
      mapInstanceRef.current = null;
    };
  }, [clearOverlays]);

  useEffect(() => {
    zonesRef.current = zones;
    bikesRef.current = bikes;
    if (!mapLoading && mapInstanceRef.current && window.google) {
      redrawMapOverlays();
    }
  }, [zones, bikes, mapLoading, redrawMapOverlays]);

  useEffect(() => {
    if (
      mapLoading
      || !mapInstanceRef.current
      || !autocompleteInputRef.current
      || !window.google?.maps?.places
      || autocompleteRef.current
    ) {
      return;
    }

    const autocomplete = new window.google.maps.places.Autocomplete(
      autocompleteInputRef.current,
      { componentRestrictions: { country: "in" } },
    );

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (place.geometry?.location && mapInstanceRef.current) {
        mapInstanceRef.current.setCenter(place.geometry.location);
        mapInstanceRef.current.setZoom(12);
        setLocationSearch(place.formatted_address || place.name || "");
      }
    });

    autocompleteRef.current = autocomplete;
  }, [mapLoading]);

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
      <div className="p-4 lg:p-6">
        <div className="flex items-center gap-4 mb-6">
          <button
            type="button"
            onClick={() => navigate(ZONES_BASE)}
            className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">All Bike Rent Zones Map</h1>
              <p className="text-sm text-slate-600">View all Bike Rent service zones on map</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              ref={autocompleteInputRef}
              type="text"
              placeholder="Search location on map..."
              value={locationSearch}
              onChange={(e) => setLocationSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
          <div className="relative" style={{ height: "calc(100vh - 250px)", minHeight: "600px" }}>
            <div ref={mapRef} className="w-full h-full rounded-lg" />

            {mapLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-100/90 rounded-lg">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
                  <p className="text-slate-600">Loading map...</p>
                </div>
              </div>
            )}

            {loading && !mapLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 rounded-lg">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
                  <p className="text-slate-600">Loading zones...</p>
                </div>
              </div>
            )}

            {!googleMapsApiKey && !mapLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-100 rounded-lg">
                <div className="text-center p-6">
                  <MapPin className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                  <p className="text-sm text-slate-600">Google Maps API key not found</p>
                </div>
              </div>
            )}

            {!loading && !mapLoading && zones.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 rounded-lg pointer-events-none">
                <div className="text-center p-6">
                  <MapPin className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                  <p className="text-sm text-slate-600">No Bike Rent zones found</p>
                </div>
              </div>
            )}

            {!loading && !mapLoading && zones.length > 0 && zonesDrawn === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 rounded-lg pointer-events-none">
                <div className="text-center p-6">
                  <MapPin className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                  <p className="text-sm text-slate-600">
                    Zones exist but have no drawable polygon coordinates
                  </p>
                </div>
              </div>
            )}
          </div>

          {!mapLoading && (
            <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Map Information</h3>
              <div className="text-xs text-slate-600 space-y-1">
                <p>
                  Total zones: <strong>{zones.length}</strong>
                  {" · "}
                  Drawn on map: <strong>{zonesDrawn}</strong>
                </p>
                {zonesDrawn > 0 && (
                  <p>
                    Click any <span className="font-semibold text-blue-600">zone polygon</span> for details.
                  </p>
                )}
                {bikesWithCoords > 0 && (
                  <p>
                    Click any <span className="font-semibold text-red-600">red marker</span> for bike details.
                    {" "}
                    Bikes with coordinates: <strong>{bikesWithCoords}</strong>
                  </p>
                )}
                {bikes.length > 0 && bikesWithCoords === 0 && (
                  <p>
                    Bikes are zone-assigned only (no lat/lng). Zone polygons and centers are shown.
                    {" "}
                    Total bikes: <strong>{bikes.length}</strong>
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
