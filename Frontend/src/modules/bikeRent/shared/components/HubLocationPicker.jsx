import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, MapPin, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import Button from "@/shared/components/ui/Button";
import Input from "@/shared/components/ui/Input";
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey";
import { loadGoogleMaps } from "@core/services/googleMapsLoader";

const DEFAULT_CENTER = { lat: 22.7196, lng: 75.8577 };
const OUTSIDE_ZONE_MSG =
  "Selected location is outside the current Bike Rent Zone. Please choose a location within the zone.";

function toLatLngLiteral(coord) {
  if (!coord || typeof coord !== "object") return null;
  const lat = Number(coord.latitude ?? coord.lat);
  const lng = Number(coord.longitude ?? coord.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function polygonPathFromCoords(google, coordinates = []) {
  return coordinates
    .map((coord) => {
      const point = toLatLngLiteral(coord);
      if (!point) return null;
      return new google.maps.LatLng(point.lat, point.lng);
    })
    .filter(Boolean);
}

function centroidOfCoords(coordinates = []) {
  const points = coordinates.map(toLatLngLiteral).filter(Boolean);
  if (!points.length) return null;
  const sum = points.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 },
  );
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

/**
 * Force a comfortable "near the zone" overview zoom.
 * Admin should not need to zoom out manually to place hubs.
 */
function applyZoneOverviewZoom(google, map, path = []) {
  if (!google?.maps || !map || !path.length) return;

  const bounds = new google.maps.LatLngBounds();
  path.forEach((p) => bounds.extend(p));
  const center = bounds.getCenter();
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  const latSpan = Math.abs(ne.lat() - sw.lat());
  const lngSpan =
    Math.abs(ne.lng() - sw.lng())
    * Math.cos((center.lat() * Math.PI) / 180);
  // Floor span so tiny polygons don't open at street level
  const span = Math.max(latSpan, lngSpan, 0.045);

  let zoom = 12;
  if (span > 0.9) zoom = 9;
  else if (span > 0.4) zoom = 10;
  else if (span > 0.18) zoom = 11;
  else if (span > 0.08) zoom = 12;
  else zoom = 12;

  google.maps.event.trigger(map, "resize");
  map.setCenter(center);
  map.setZoom(zoom);
}

/**
 * Map-based hub location picker.
 * Emits { lat, lng, address } via onChange. Coordinates stay hidden in the parent form.
 * Shows existing hubs so admins don't place duplicates on top of them.
 */
export default function HubLocationPicker({
  coordinates = [],
  existingHubs = [],
  excludeHubId = null,
  value = { lat: null, lng: null, address: "" },
  onChange,
  disabled = false,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const polygonRef = useRef(null);
  const markerRef = useRef(null);
  const existingHubMarkersRef = useRef([]);
  const geocoderRef = useRef(null);
  const autocompleteRef = useRef(null);
  const searchInputRef = useRef(null);
  const listenersRef = useRef([]);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(disabled);
  const coordinatesRef = useRef(coordinates);
  const existingHubsRef = useRef(existingHubs);
  const excludeHubIdRef = useRef(excludeHubId);
  const placeMarkerRef = useRef(async () => false);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [locationError, setLocationError] = useState("");
  const [geocoding, setGeocoding] = useState(false);

  const coordinatesKey = JSON.stringify(
    (coordinates || [])
      .map(toLatLngLiteral)
      .filter(Boolean)
      .map((p) => [Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6))]),
  );

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    coordinatesRef.current = coordinates;
  }, [coordinates]);

  useEffect(() => {
    existingHubsRef.current = existingHubs;
  }, [existingHubs]);

  useEffect(() => {
    excludeHubIdRef.current = excludeHubId;
  }, [excludeHubId]);

  const renderExistingHubMarkers = useCallback((google, map) => {
    existingHubMarkersRef.current.forEach((m) => m.setMap(null));
    existingHubMarkersRef.current = [];

    const hubs = Array.isArray(existingHubsRef.current) ? existingHubsRef.current : [];
    const exclude = excludeHubIdRef.current != null ? String(excludeHubIdRef.current) : null;

    hubs.forEach((hub) => {
      const hubId = hub?.id || hub?._id;
      if (exclude && String(hubId) === exclude) return;
      const lat = Number(hub?.lat);
      const lng = Number(hub?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const marker = new google.maps.Marker({
        map,
        position: { lat, lng },
        title: hub.name || "Existing hub",
        label: {
          text: String(hub.name || "H").slice(0, 1).toUpperCase(),
          color: "#fff",
          fontSize: "11px",
          fontWeight: "700",
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#2563eb",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
        zIndex: 2,
      });

      const info = new google.maps.InfoWindow({
        content: `<div style="padding:6px 8px;max-width:220px">
          <strong>${hub.name || "Hub"}</strong><br/>
          <span style="font-size:12px;color:#475569">${hub.address || "Existing pickup hub"}</span>
        </div>`,
      });
      marker.addListener("click", () => info.open({ map, anchor: marker }));
      existingHubMarkersRef.current.push(marker);
    });
  }, []);

  const emit = useCallback((next) => {
    onChangeRef.current?.(next);
  }, []);

  const setSearchInputValue = useCallback((text) => {
    if (searchInputRef.current) {
      searchInputRef.current.value = text || "";
    }
  }, []);

  const isInsideZone = useCallback((latLng) => {
    const google = window.google;
    if (!google?.maps?.geometry?.poly || !polygonRef.current) return true;
    return google.maps.geometry.poly.containsLocation(latLng, polygonRef.current);
  }, []);

  const reverseGeocode = useCallback((lat, lng) => {
    const geocoder = geocoderRef.current;
    if (!geocoder) {
      return Promise.resolve(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    }
    setGeocoding(true);
    return new Promise((resolve) => {
      geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        setGeocoding(false);
        if (status === "OK" && results?.[0]?.formatted_address) {
          resolve(results[0].formatted_address);
          return;
        }
        resolve(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      });
    });
  }, []);

  const placeMarker = useCallback(
    async (lat, lng, { address, skipGeocode = false, silent = false } = {}) => {
      const google = window.google;
      const map = mapRef.current;
      if (!google?.maps || !map || disabledRef.current) return false;

      const latLng = new google.maps.LatLng(lat, lng);
      if (!isInsideZone(latLng)) {
        setLocationError(OUTSIDE_ZONE_MSG);
        if (!silent) toast.error(OUTSIDE_ZONE_MSG);
        return false;
      }

      setLocationError("");

      if (markerRef.current) {
        markerRef.current.setPosition(latLng);
      } else {
        const marker = new google.maps.Marker({
          map,
          position: latLng,
          draggable: true,
          animation: google.maps.Animation.DROP,
          title: "Hub pickup location",
        });
        markerRef.current = marker;
        const dragEnd = marker.addListener("dragend", async () => {
          const pos = marker.getPosition();
          if (!pos) return;
          const nextLat = pos.lat();
          const nextLng = pos.lng();
          if (!isInsideZone(pos)) {
            setLocationError(OUTSIDE_ZONE_MSG);
            toast.error(OUTSIDE_ZONE_MSG);
            const prev = valueRef.current;
            if (
              Number.isFinite(Number(prev?.lat))
              && Number.isFinite(Number(prev?.lng))
            ) {
              marker.setPosition({
                lat: Number(prev.lat),
                lng: Number(prev.lng),
              });
            }
            return;
          }
          setLocationError("");
          const formatted = await reverseGeocode(nextLat, nextLng);
          emit({
            lat: nextLat,
            lng: nextLng,
            address: formatted,
          });
          setSearchInputValue(formatted);
        });
        listenersRef.current.push(dragEnd);
      }

      map.panTo(latLng);
      // Do not change overview zoom when dropping a pin — stay near the zone

      let nextAddress = address || "";
      if (!skipGeocode || !nextAddress) {
        nextAddress = nextAddress || (await reverseGeocode(lat, lng));
      }

      emit({
        lat,
        lng,
        address: nextAddress,
      });
      setSearchInputValue(nextAddress);
      return true;
    },
    [emit, isInsideZone, reverseGeocode, setSearchInputValue],
  );

  useEffect(() => {
    placeMarkerRef.current = placeMarker;
  }, [placeMarker]);

  const clearMarker = useCallback(() => {
    if (markerRef.current) {
      markerRef.current.setMap(null);
      markerRef.current = null;
    }
    setLocationError("");
    setSearchInputValue("");
    emit({ lat: null, lng: null, address: "" });
  }, [emit, setSearchInputValue]);

  const useMapCenter = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    if (!center) return;
    await placeMarkerRef.current(center.lat(), center.lng());
  }, []);

  // Initialize map once the dialog mounts this picker
  useEffect(() => {
    let cancelled = false;
    const resizeTimers = [];

    const cleanup = () => {
      resizeTimers.forEach((id) => clearTimeout(id));
      listenersRef.current.forEach((listener) => {
        if (listener && window.google?.maps?.event) {
          window.google.maps.event.removeListener(listener);
        }
      });
      listenersRef.current = [];
      if (autocompleteRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
      if (markerRef.current) {
        markerRef.current.setMap(null);
        markerRef.current = null;
      }
      existingHubMarkersRef.current.forEach((m) => m.setMap(null));
      existingHubMarkersRef.current = [];
      if (polygonRef.current) {
        polygonRef.current.setMap(null);
        polygonRef.current = null;
      }
      mapRef.current = null;
      geocoderRef.current = null;
    };

    const waitForContainerSize = async (el, attempts = 40) => {
      for (let i = 0; i < attempts; i += 1) {
        if (cancelled) return false;
        const width = el.clientWidth;
        const height = el.clientHeight;
        if (width > 40 && height > 40) return true;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return el.clientWidth > 0 && el.clientHeight > 0;
    };

    const init = async () => {
      try {
        setMapError("");
        const apiKey = await getGoogleMapsApiKey();
        if (!apiKey) {
          setMapError("Google Maps API key is not configured.");
          return;
        }
        await loadGoogleMaps(apiKey);
        if (cancelled || !mapContainerRef.current || !window.google?.maps) return;

        // Dialog animation / layout: wait until container has real size
        const sized = await waitForContainerSize(mapContainerRef.current);
        if (cancelled || !mapContainerRef.current) return;
        if (!sized) {
          setMapError("Map container could not be sized. Close and reopen the hub form.");
          return;
        }

        const google = window.google;
        const initialLat = Number(valueRef.current?.lat);
        const initialLng = Number(valueRef.current?.lng);
        const hasInitial =
          Number.isFinite(initialLat) && Number.isFinite(initialLng);
        const zoneCenter = centroidOfCoords(coordinatesRef.current);
        const center = hasInitial
          ? { lat: initialLat, lng: initialLng }
          : zoneCenter || DEFAULT_CENTER;

        const map = new google.maps.Map(mapContainerRef.current, {
          center,
          zoom: 12,
          maxZoom: 18,
          minZoom: 8,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
        });
        mapRef.current = map;
        geocoderRef.current = new google.maps.Geocoder();

        const path = polygonPathFromCoords(google, coordinatesRef.current);
        if (path.length >= 3) {
          const polygon = new google.maps.Polygon({
            paths: path,
            strokeColor: "#ea580c",
            strokeOpacity: 0.95,
            strokeWeight: 2,
            fillColor: "#fb923c",
            fillOpacity: 0.22,
            clickable: false,
            editable: false,
            draggable: false,
          });
          polygon.setMap(map);
          polygonRef.current = polygon;
        }

        const clickListener = map.addListener("click", async (event) => {
          if (disabledRef.current || !event.latLng) return;
          await placeMarkerRef.current(event.latLng.lat(), event.latLng.lng());
        });
        listenersRef.current.push(clickListener);

        // Open already framed near the zone (no manual zoom-out needed)
        applyZoneOverviewZoom(google, map, path);
        renderExistingHubMarkers(google, map);

        const onIdle = google.maps.event.addListenerOnce(map, "idle", () => {
          applyZoneOverviewZoom(google, map, path);
          renderExistingHubMarkers(google, map);
          if (hasInitial) {
            placeMarkerRef.current(initialLat, initialLng, {
              address: valueRef.current?.address || "",
              skipGeocode: Boolean(valueRef.current?.address),
              silent: true,
            });
          }
        });
        listenersRef.current.push(onIdle);

        // Re-apply after modal layout settles (keeps zone-level zoom)
        [150, 350, 700].forEach((ms) => {
          resizeTimers.push(
            setTimeout(() => {
              if (cancelled || !mapRef.current) return;
              applyZoneOverviewZoom(google, mapRef.current, path);
            }, ms),
          );
        });

        if (searchInputRef.current && google.maps.places?.Autocomplete) {
          const autocomplete = new google.maps.places.Autocomplete(
            searchInputRef.current,
            {
              fields: ["formatted_address", "geometry", "name"],
              componentRestrictions: { country: "in" },
            },
          );
          autocomplete.bindTo("bounds", map);
          const placeListener = autocomplete.addListener("place_changed", async () => {
            const place = autocomplete.getPlace();
            const location = place?.geometry?.location;
            if (!location) {
              toast.error("Could not resolve that place. Try another search.");
              return;
            }
            await placeMarkerRef.current(location.lat(), location.lng(), {
              address: place.formatted_address || place.name || "",
            });
          });
          listenersRef.current.push(placeListener);
          autocompleteRef.current = autocomplete;
        }

        if (valueRef.current?.address) {
          setSearchInputValue(valueRef.current.address);
        }

        if (!cancelled) setMapReady(true);
      } catch (error) {
        if (!cancelled) {
          setMapError(error?.message || "Failed to load Google Maps");
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      cleanup();
      setMapReady(false);
    };
  }, [coordinatesKey, setSearchInputValue, renderExistingHubMarkers]);

  // Keep existing hub markers in sync if list changes while map is open
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.google?.maps) return;
    renderExistingHubMarkers(window.google, mapRef.current);
  }, [existingHubs, excludeHubId, mapReady, renderExistingHubMarkers]);

  const hasSelection =
    Number.isFinite(Number(value?.lat)) && Number.isFinite(Number(value?.lng));

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-sm font-medium text-slate-800">Pickup location on map *</p>
        <p className="mb-2 text-xs text-slate-500">
          Blue markers are existing hubs. Search or click inside the orange zone — do not place on top of an existing hub.
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            ref={searchInputRef}
            defaultValue={value?.address || ""}
            placeholder="Search address or place…"
            className="pl-9"
            disabled={disabled || !mapReady}
            autoComplete="off"
          />
        </div>
      </div>

      {Array.isArray(existingHubs) && existingHubs.length > 0 ? (
        <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2.5">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
            Existing hubs in this zone ({existingHubs.length})
          </p>
          <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto text-sm text-slate-700">
            {existingHubs.map((hub) => (
              <li key={hub.id || hub._id} className="truncate">
                <span className="font-semibold">{hub.name}</span>
                {hub.address ? (
                  <span className="text-slate-500"> — {hub.address}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm">
        <div
          ref={mapContainerRef}
          className="relative w-full bg-[#e5e7eb]"
          style={{
            height: 380,
            minHeight: 380,
            width: "100%",
          }}
        />
        {!mapReady && !mapError ? (
          <div className="border-t border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
            Loading map…
          </div>
        ) : null}
        {mapError ? (
          <div className="border-t border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
            {mapError}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1"
          disabled={disabled || !mapReady}
          onClick={useMapCenter}
        >
          <Crosshair size={14} />
          Use current map center
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1"
          disabled={disabled || !mapReady || !hasSelection}
          onClick={clearMarker}
        >
          <RotateCcw size={14} />
          Reset location
        </Button>
      </div>

      {locationError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {locationError}
        </p>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-700">Selected address</p>
            <p className="mt-0.5 text-sm text-slate-900">
              {geocoding
                ? "Fetching address…"
                : value?.address
                  ? value.address
                  : hasSelection
                    ? "Address unavailable — landmark/instructions still help riders find you."
                    : "No location selected yet"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
