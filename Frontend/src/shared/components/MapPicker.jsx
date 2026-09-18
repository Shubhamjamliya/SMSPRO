import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  GoogleMap,
  Marker,
  Autocomplete,
  Polygon,
} from "@react-google-maps/api";
import { Search, Navigation, Loader2 } from "lucide-react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import { loadGoogleMaps } from "@core/services/googleMapsLoader";
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey";
import { isPointInZone } from "@shared/utils/pointInZone";

const defaultCenter = {
  lat: 20.5937,
  lng: 78.9629,
};

/**
 * Shared location picker.
 * Uses the singleton `loadGoogleMaps` loader so it does not conflict with
 * other screens that already loaded the Maps JS API (Places autocomplete, etc.).
 *
 * When `zoneCoordinates` has ≥3 points, the pin must be inside that polygon.
 */
const MapPicker = ({
  isOpen,
  onClose,
  onConfirm,
  initialLocation = null,
  zoneCoordinates = [],
  zoneLabel = "",
  title = "Select Location",
  searchPlaceholder = "Search area, landmark, or address…",
}) => {
  const [isLoaded, setIsLoaded] = useState(() => Boolean(window.google?.maps));
  const [loadError, setLoadError] = useState("");
  const [center, setCenter] = useState(initialLocation || defaultCenter);
  const [marker, setMarker] = useState(initialLocation);
  const [address, setAddress] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [zoneError, setZoneError] = useState("");
  const autocompleteRef = useRef(null);
  const mapRef = useRef(null);
  const lastValidMarkerRef = useRef(null);

  const zonePath = React.useMemo(
    () =>
      Array.isArray(zoneCoordinates)
        ? zoneCoordinates
            .map((coord) => ({
              lat: Number(coord?.latitude ?? coord?.lat),
              lng: Number(coord?.longitude ?? coord?.lng),
            }))
            .filter(
              (coord) =>
                Number.isFinite(coord.lat) && Number.isFinite(coord.lng),
            )
        : [],
    [zoneCoordinates],
  );

  const hasZoneConstraint = zonePath.length >= 3;

  const outsideZoneMessage = zoneLabel
    ? `Location must be inside ${zoneLabel}. Pin only within the highlighted zone.`
    : "Location must be inside the selected service zone.";

  const isInsideZone = useCallback(
    (lat, lng) => {
      if (!hasZoneConstraint) return true;
      return isPointInZone(lat, lng, zonePath);
    },
    [hasZoneConstraint, zonePath],
  );

  const trySetMarker = useCallback(
    (newPos, { addressText = "", pan = false, zoom = null } = {}) => {
      if (!isInsideZone(newPos.lat, newPos.lng)) {
        setZoneError(outsideZoneMessage);
        return false;
      }
      setZoneError("");
      setMarker(newPos);
      lastValidMarkerRef.current = newPos;
      if (addressText !== undefined) setAddress(addressText);
      if (pan && mapRef.current) {
        mapRef.current.panTo(newPos);
        if (zoom != null) mapRef.current.setZoom(zoom);
      } else if (pan) {
        setCenter(newPos);
      }
      return true;
    },
    [isInsideZone, outsideZoneMessage],
  );

  // Load Maps via singleton (safe even if already loaded elsewhere)
  useEffect(() => {
    if (!isOpen) return undefined;

    let cancelled = false;

    (async () => {
      try {
        setLoadError("");
        if (window.google?.maps) {
          if (!cancelled) setIsLoaded(true);
          return;
        }
        const apiKey = await getGoogleMapsApiKey();
        if (!apiKey) {
          if (!cancelled) {
            setLoadError("Google Maps API key is missing");
            setIsLoaded(false);
          }
          return;
        }
        await loadGoogleMaps(apiKey);
        if (!cancelled) setIsLoaded(Boolean(window.google?.maps));
      } catch (err) {
        if (!cancelled) {
          setLoadError(err?.message || "Failed to load Google Maps");
          setIsLoaded(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Keep Places autocomplete dropdown above the dialog
  useEffect(() => {
    if (!isOpen) return undefined;
    const style = document.createElement("style");
    style.setAttribute("data-map-picker-pac", "true");
    style.textContent = `
      .pac-container {
        z-index: 100000 !important;
        border-radius: 12px;
        border: 1px solid #e5e7eb;
        box-shadow: 0 12px 40px rgba(15, 23, 42, 0.14);
        margin-top: 4px;
        font-family: inherit;
      }
      .pac-item { cursor: pointer; padding: 8px 12px; }
      .pac-item:hover { background: #fff7f0; }
    `;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, [isOpen]);

  // Initialize map state when modal opens
  useEffect(() => {
    if (!isOpen) return;

    setZoneError("");

    const lat = Number(initialLocation?.lat ?? initialLocation?.latitude);
    const lng = Number(initialLocation?.lng ?? initialLocation?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const pos = { lat, lng };
      if (hasZoneConstraint && !isPointInZone(lat, lng, zonePath)) {
        // Previous pin outside zone — clear it and center on zone
        const avgLat =
          zonePath.reduce((sum, point) => sum + point.lat, 0) / zonePath.length;
        const avgLng =
          zonePath.reduce((sum, point) => sum + point.lng, 0) / zonePath.length;
        setCenter({ lat: avgLat, lng: avgLng });
        setMarker(null);
        setAddress("");
        setZoneError(outsideZoneMessage);
        return;
      }
      setCenter(pos);
      setMarker(pos);
      lastValidMarkerRef.current = pos;
      setAddress(
        initialLocation?.address ||
          initialLocation?.formattedAddress ||
          "",
      );
      return;
    }

    if (zonePath.length > 0) {
      const avgLat =
        zonePath.reduce((sum, point) => sum + point.lat, 0) / zonePath.length;
      const avgLng =
        zonePath.reduce((sum, point) => sum + point.lng, 0) / zonePath.length;
      setCenter({ lat: avgLat, lng: avgLng });
      setMarker(null);
      lastValidMarkerRef.current = null;
      setAddress("");
      return;
    }

    setCenter(defaultCenter);
    setMarker(null);
    lastValidMarkerRef.current = null;
    setAddress("");
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isLoaded || !isOpen || !mapRef.current || zonePath.length < 3 || !window.google) {
      return;
    }
    const bounds = new window.google.maps.LatLngBounds();
    zonePath.forEach((point) => bounds.extend(point));
    mapRef.current.fitBounds(bounds);
  }, [isLoaded, isOpen, zonePath]);

  // Resize map after modal animation / layout
  useEffect(() => {
    if (!isLoaded || !isOpen || !mapRef.current || !window.google?.maps) return undefined;
    const timer = setTimeout(() => {
      window.google.maps.event.trigger(mapRef.current, "resize");
      if (marker) mapRef.current.panTo(marker);
      else mapRef.current.panTo(center);
    }, 250);
    return () => clearTimeout(timer);
  }, [isLoaded, isOpen, marker, center]);

  const onMapClick = useCallback(
    (e) => {
      const newPos = {
        lat: e.latLng.lat(),
        lng: e.latLng.lng(),
      };
      trySetMarker(newPos, { addressText: "" });
    },
    [trySetMarker],
  );

  const onMarkerDragEnd = useCallback(
    (e) => {
      const newPos = {
        lat: e.latLng.lat(),
        lng: e.latLng.lng(),
      };
      if (!isInsideZone(newPos.lat, newPos.lng)) {
        setZoneError(outsideZoneMessage);
        const snap = lastValidMarkerRef.current;
        if (snap) {
          // Force Marker remount/snap back inside zone
          setMarker(null);
          requestAnimationFrame(() => {
            setMarker({ lat: snap.lat, lng: snap.lng });
          });
        }
        return;
      }
      setZoneError("");
      setMarker(newPos);
      lastValidMarkerRef.current = newPos;
      setAddress("");
    },
    [isInsideZone, outsideZoneMessage],
  );

  const handlePlaceChanged = () => {
    if (!autocompleteRef.current) return;
    const place = autocompleteRef.current.getPlace();
    if (!place?.geometry?.location) return;

    const newPos = {
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
    };
    const ok = trySetMarker(newPos, {
      addressText: place.formatted_address || place.name || "",
      pan: true,
      zoom: 16,
    });
    if (!ok && mapRef.current && hasZoneConstraint) {
      // Keep map focused on zone if search landed outside
      const bounds = new window.google.maps.LatLngBounds();
      zonePath.forEach((point) => bounds.extend(point));
      mapRef.current.fitBounds(bounds);
    }
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported on this device.");
      return;
    }

    setIsFetchingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newPos = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setIsFetchingLocation(false);

        const ok = trySetMarker(newPos, { addressText: "", pan: true, zoom: 16 });
        if (!ok) return;

        if (window.google?.maps?.Geocoder) {
          const geocoder = new window.google.maps.Geocoder();
          geocoder.geocode({ location: newPos }, (results, status) => {
            if (status === "OK" && results[0]) {
              setAddress(results[0].formatted_address);
            }
          });
        }
      },
      () => {
        setIsFetchingLocation(false);
        alert(
          "Unable to retrieve your current location. Please allow location access and try again.",
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  };

  const handleConfirm = async () => {
    if (!marker) {
      alert("Please select a location on the map.");
      return;
    }

    if (!isInsideZone(marker.lat, marker.lng)) {
      setZoneError(outsideZoneMessage);
      alert(outsideZoneMessage);
      return;
    }

    setIsGeocoding(true);
    try {
      let formatted = address;
      if (!formatted && window.google?.maps?.Geocoder) {
        const geocoder = new window.google.maps.Geocoder();
        const result = await new Promise((resolve, reject) => {
          geocoder.geocode({ location: marker }, (results, status) => {
            if (status === "OK") resolve(results[0]);
            else reject(status);
          });
        });
        formatted = result?.formatted_address || "";
      }

      onConfirm({
        ...marker,
        latitude: marker.lat,
        longitude: marker.lng,
        address: formatted || address || "Custom Location",
        formattedAddress: formatted || address || "Custom Location",
      });
      onClose();
    } catch (error) {
      console.error("Geocoding failed:", error);
      onConfirm({
        ...marker,
        latitude: marker.lat,
        longitude: marker.lng,
        address: address || "Custom Location",
        formattedAddress: address || "Custom Location",
      });
      onClose();
    } finally {
      setIsGeocoding(false);
    }
  };

  if (loadError) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={title}>
        <div className="p-8 text-center text-red-500 text-sm">
          {loadError}
          <p className="mt-2 text-xs text-slate-500">
            Check that `VITE_GOOGLE_MAPS_API_KEY` is set and Maps JavaScript API is enabled.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-sm text-gray-500">
            {marker ? (
              address ? (
                <span className="block max-w-full truncate font-medium text-slate-700 sm:max-w-xs">
                  {address}
                </span>
              ) : (
                `${marker.lat.toFixed(4)}, ${marker.lng.toFixed(4)}`
              )
            ) : (
              "Tap the map or search to set a pin"
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={!marker || isGeocoding}>
              {isGeocoding ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Confirm Location
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            {isLoaded && window.google?.maps?.places ? (
              <Autocomplete
                onLoad={(ref) => {
                  autocompleteRef.current = ref;
                }}
                onPlaceChanged={handlePlaceChanged}
                options={{
                  componentRestrictions: { country: "in" },
                  fields: ["geometry", "formatted_address", "name"],
                }}
              >
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder={searchPlaceholder}
                    className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm font-medium outline-none focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00]/30"
                  />
                </div>
              </Autocomplete>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  disabled
                  placeholder={isLoaded ? "Places search unavailable" : "Loading map…"}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-400"
                />
              </div>
            )}
          </div>
          <Button
            variant="outline"
            type="button"
            onClick={getCurrentLocation}
            disabled={isFetchingLocation || !isLoaded}
            className="shrink-0 whitespace-nowrap px-4"
            title="Use current location"
          >
            {isFetchingLocation ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Navigation className="mr-2 h-4 w-4" />
            )}
            {isFetchingLocation ? "Fetching…" : "Current location"}
          </Button>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-gray-200 shadow-inner">
          {!isLoaded ? (
            <div className="flex h-[400px] max-h-[55vh] min-h-[260px] items-center justify-center bg-gray-50">
              <Loader2 className="h-8 w-8 animate-spin text-[#FF6A00]" />
            </div>
          ) : (
            <div className="h-[400px] max-h-[55vh] min-h-[260px]">
            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "100%" }}
              center={center}
              zoom={15}
              onClick={onMapClick}
              onLoad={(map) => {
                mapRef.current = map;
                setTimeout(() => {
                  window.google?.maps?.event?.trigger(map, "resize");
                }, 100);
              }}
              options={{
                disableDefaultUI: true,
                zoomControl: true,
                streetViewControl: false,
                mapTypeControl: false,
                fullscreenControl: false,
                gestureHandling: "greedy",
                clickableIcons: false,
              }}
            >
              {zonePath.length >= 3 && (
                <Polygon
                  path={zonePath}
                  options={{
                    fillColor: "#10b981",
                    fillOpacity: 0.14,
                    strokeColor: "#059669",
                    strokeOpacity: 0.9,
                    strokeWeight: 2,
                    clickable: false,
                    editable: false,
                    zIndex: 1,
                  }}
                />
              )}
              {marker && (
                <Marker
                  position={marker}
                  draggable
                  onDragEnd={onMarkerDragEnd}
                />
              )}
            </GoogleMap>
            </div>
          )}
        </div>

        {zoneError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            {zoneError}
          </div>
        ) : zoneLabel ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
            Pin your storefront only inside the selected zone: {zoneLabel}
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Search, use current location, or tap the map to place the pickup pin.
          </p>
        )}
      </div>
    </Modal>
  );
};

export default MapPicker;
