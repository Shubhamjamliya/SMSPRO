import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, ArrowLeft, Search } from "lucide-react";
import { toast } from "sonner";
import serviceProviderAdminApi from "../services/adminApi";
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey";
import { Loader } from "@googlemaps/js-api-loader";

const ZONES_BASE = "/admin/service-provider/zones";

const ZONE_COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#84cc16"];

const toLatLng = (coord) => {
  if (!coord || typeof coord !== "object") return null;
  const lat = Number(coord.latitude ?? coord.lat);
  const lng = Number(coord.longitude ?? coord.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};

const normalizeZonePath = (coordinates = []) => (Array.isArray(coordinates) ? coordinates : []).map(toLatLng).filter(Boolean);

const getZoneCenter = (path) => {
  if (!path?.length) return null;
  const sum = path.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / path.length, lng: sum.lng / path.length };
};

export default function ServiceProviderAllZonesMap() {
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const zonesPolygonsRef = useRef([]);
  const infoWindowsRef = useRef([]);
  const zoneCenterMarkersRef = useRef([]);
  const autocompleteInputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const zonesRef = useRef([]);

  const [googleMapsApiKey, setGoogleMapsApiKey] = useState("");
  const [mapLoading, setMapLoading] = useState(true);
  const [zones, setZones] = useState([]);
  const [zonesDrawn, setZonesDrawn] = useState(0);
  const [loading, setLoading] = useState(true);
  const [locationSearch, setLocationSearch] = useState("");

  const clearOverlays = useCallback(() => {
    zonesPolygonsRef.current.forEach((polygon) => polygon?.setMap(null));
    zonesPolygonsRef.current = [];
    zoneCenterMarkersRef.current.forEach((marker) => marker?.setMap(null));
    zoneCenterMarkersRef.current = [];
    infoWindowsRef.current.forEach((iw) => iw?.close());
    infoWindowsRef.current = [];
  }, []);

  const drawAllZonesOnMap = useCallback((google, map, zoneList) => {
    clearOverlays();

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
    if (!bounds.isEmpty()) map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
  }, [clearOverlays]);

  const redrawMapOverlays = useCallback(() => {
    const google = window.google;
    const map = mapInstanceRef.current;
    if (!google?.maps || !map) return;
    google.maps.event.trigger(map, "resize");
    drawAllZonesOnMap(google, map, zonesRef.current);
  }, [drawAllZonesOnMap]);

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
          const loader = new Loader({ apiKey, version: "weekly", libraries: ["places", "geometry"] });
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
        const result = await serviceProviderAdminApi.getZones({ limit: 100 });
        if (cancelled) return;
        const nextZones = result.records || [];
        zonesRef.current = nextZones;
        setZones(nextZones);
      } catch {
        if (!cancelled) {
          toast.error("Failed to load Service Provider zones");
          zonesRef.current = [];
          setZones([]);
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
    if (!mapLoading && mapInstanceRef.current && window.google) redrawMapOverlays();
  }, [zones, mapLoading, redrawMapOverlays]);

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

    const autocomplete = new window.google.maps.places.Autocomplete(autocompleteInputRef.current, {
      componentRestrictions: { country: "in" },
    });
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
    <div className="min-h-screen overflow-x-hidden bg-slate-50">
      <div className="p-4 lg:p-6">
        <div className="mb-6 flex items-center gap-4">
          <button type="button" onClick={() => navigate(ZONES_BASE)} className="rounded-lg p-2 transition-colors hover:bg-slate-200">
            <ArrowLeft className="h-5 w-5 text-slate-600" />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500">
              <MapPin className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">All Service Provider Zones Map</h1>
              <p className="text-sm text-slate-600">View all service areas on map</p>
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              ref={autocompleteInputRef}
              type="text"
              placeholder="Search location on map..."
              value={locationSearch}
              onChange={(e) => setLocationSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="relative" style={{ height: "calc(100vh - 250px)", minHeight: "600px" }}>
            <div ref={mapRef} className="h-full w-full rounded-lg" />

            {mapLoading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-slate-100/90">
                <div className="text-center">
                  <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
                  <p className="text-slate-600">Loading map...</p>
                </div>
              </div>
            )}

            {loading && !mapLoading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-slate-100/80">
                <div className="text-center">
                  <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
                  <p className="text-slate-600">Loading zones...</p>
                </div>
              </div>
            )}

            {!googleMapsApiKey && !mapLoading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-slate-100">
                <div className="p-6 text-center">
                  <MapPin className="mx-auto mb-4 h-12 w-12 text-slate-400" />
                  <p className="text-sm text-slate-600">Google Maps API key not found</p>
                </div>
              </div>
            )}

            {!loading && !mapLoading && zones.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-slate-100/80">
                <div className="p-6 text-center">
                  <MapPin className="mx-auto mb-4 h-12 w-12 text-slate-400" />
                  <p className="text-sm text-slate-600">No Service Provider zones found</p>
                </div>
              </div>
            )}

            {!loading && !mapLoading && zones.length > 0 && zonesDrawn === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-slate-100/80">
                <div className="p-6 text-center">
                  <MapPin className="mx-auto mb-4 h-12 w-12 text-slate-400" />
                  <p className="text-sm text-slate-600">Zones exist but have no drawable polygon coordinates</p>
                </div>
              </div>
            )}
          </div>

          {!mapLoading && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Map Information</h3>
              <div className="space-y-1 text-xs text-slate-600">
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
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
