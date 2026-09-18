import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Building2,
  Check,
  Clock,
  Crosshair,
  Landmark,
  Loader2,
  LocateFixed,
  MapPin,
  Plane,
  Plus,
  ShoppingBag,
  TrainFront,
  TrendingUp,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getPlacesForCity } from "../../utils/mock/places";
import { loadGoogleMaps } from "@core/services/googleMapsLoader";
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey";

const RECENT_LOCATIONS_KEY = "taxi_recent_locations";

function iconForPlaceType(type = "") {
  const t = String(type).toLowerCase();
  if (t.includes("airport")) return Plane;
  if (t.includes("railway") || t.includes("station")) return TrainFront;
  if (t.includes("mall") || t.includes("market") || t.includes("shop")) return ShoppingBag;
  if (t.includes("it") || t.includes("park") || t.includes("office")) return Building2;
  if (t.includes("attraction") || t.includes("monument")) return Landmark;
  return MapPin;
}

function SuggestionIcon({ kind, placeType }) {
  let Icon = MapPin;
  if (kind === "recent") Icon = Clock;
  else if (kind === "popular") Icon = iconForPlaceType(placeType);
  else if (kind === "prediction") Icon = MapPin;

  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600">
      <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
    </span>
  );
}

function toLatLng(loc) {
  if (!loc) return null;
  const lat = Number(loc.lat ?? loc.latitude);
  const lng = Number(loc.lng ?? loc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

const DEFAULT_MAP_CENTER = { lat: 22.7196, lng: 75.8577 };

function DropPinMap({
  initialCenter,
  onBack,
  onConfirmPin,
}) {
  const mapHostRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const geocoderRef = useRef(null);
  const programmaticRef = useRef(false);
  const geocodeReqRef = useRef(0);
  const pinRef = useRef(toLatLng(initialCenter) || DEFAULT_MAP_CENTER);
  const listenersRef = useRef([]);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [pin, setPin] = useState(pinRef.current);
  const [address, setAddress] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [confirming, setConfirming] = useState(false);

  pinRef.current = pin;

  const reverseGeocode = useCallback(async (pos) => {
    if (!geocoderRef.current || !pos) return "";
    const reqId = ++geocodeReqRef.current;
    setIsGeocoding(true);
    try {
      const result = await new Promise((resolve) => {
        geocoderRef.current.geocode({ location: pos }, (results, status) => {
          if (status === "OK" && results?.[0]) resolve(results[0]);
          else resolve(null);
        });
      });
      if (reqId !== geocodeReqRef.current) return "";
      const formatted = result?.formatted_address || "";
      setAddress(formatted);
      return formatted;
    } finally {
      if (reqId === geocodeReqRef.current) setIsGeocoding(false);
    }
  }, []);

  const applyPin = useCallback((pos, { pan = false, zoom } = {}) => {
    if (!pos) return;
    pinRef.current = pos;
    setPin(pos);
    if (markerRef.current) markerRef.current.setPosition(pos);
    if (pan && mapRef.current) {
      programmaticRef.current = true;
      mapRef.current.panTo(pos);
      if (zoom) mapRef.current.setZoom(zoom);
      window.setTimeout(() => {
        programmaticRef.current = false;
      }, 400);
    }
    reverseGeocode(pos);
  }, [reverseGeocode]);

  useEffect(() => {
    let cancelled = false;
    let resizeObserver = null;

    (async () => {
      try {
        const apiKey = await getGoogleMapsApiKey();
        if (!apiKey) {
          setMapError("Maps unavailable");
          return;
        }
        await loadGoogleMaps(apiKey);
        if (cancelled || !mapHostRef.current || !window.google?.maps) {
          setMapError("Maps unavailable");
          return;
        }

        const center = toLatLng(initialCenter) || DEFAULT_MAP_CENTER;
        const map = new window.google.maps.Map(mapHostRef.current, {
          center,
          zoom: 16,
          disableDefaultUI: true,
          zoomControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          rotateControl: false,
          clickableIcons: false,
          keyboardShortcuts: false,
          gestureHandling: "greedy",
          draggable: true,
          scrollwheel: true,
        });
        mapRef.current = map;
        geocoderRef.current = new window.google.maps.Geocoder();

        const marker = new window.google.maps.Marker({
          map,
          position: center,
          draggable: true,
          animation: window.google.maps.Animation.DROP,
        });
        markerRef.current = marker;

        const onUserCenter = () => {
          if (programmaticRef.current) return;
          const c = map.getCenter();
          if (!c) return;
          const next = { lat: c.lat(), lng: c.lng() };
          const prev = pinRef.current;
          if (
            prev &&
            Math.abs(prev.lat - next.lat) < 1e-7 &&
            Math.abs(prev.lng - next.lng) < 1e-7
          ) {
            return;
          }
          applyPin(next);
        };

        listenersRef.current = [
          map.addListener("dragend", onUserCenter),
          map.addListener("idle", onUserCenter),
          map.addListener("click", (event) => {
            if (!event?.latLng) return;
            applyPin(
              { lat: event.latLng.lat(), lng: event.latLng.lng() },
              { pan: true },
            );
          }),
          marker.addListener("dragstart", () => {
            programmaticRef.current = true;
          }),
          marker.addListener("dragend", () => {
            const pos = marker.getPosition();
            programmaticRef.current = false;
            if (!pos) return;
            applyPin({ lat: pos.lat(), lng: pos.lng() }, { pan: true });
          }),
        ];

        resizeObserver = new ResizeObserver(() => {
          if (!mapRef.current || !window.google?.maps) return;
          window.google.maps.event.trigger(mapRef.current, "resize");
        });
        resizeObserver.observe(mapHostRef.current);

        window.requestAnimationFrame(() => {
          if (cancelled || !mapRef.current) return;
          window.google.maps.event.trigger(mapRef.current, "resize");
          mapRef.current.setCenter(center);
        });

        setMapReady(true);
        applyPin(center);
      } catch {
        setMapError("Failed to load map");
      }
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      listenersRef.current.forEach((listener) => {
        window.google?.maps?.event?.removeListener?.(listener);
      });
      listenersRef.current = [];
      if (markerRef.current) {
        markerRef.current.setMap(null);
        markerRef.current = null;
      }
      mapRef.current = null;
    };
    // Mount-only: pin updates come from map / marker gestures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyPin(
          { lat: pos.coords.latitude, lng: pos.coords.longitude },
          { pan: true, zoom: 17 },
        );
        setIsLocating(false);
      },
      () => setIsLocating(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const handleConfirm = async () => {
    const pos = pinRef.current;
    if (!pos) return;
    setConfirming(true);
    let formatted = address;
    if (!formatted) formatted = await reverseGeocode(pos);
    const title = String(formatted || "Pinned location").split(",")[0]?.trim() || "Pinned location";
    onConfirmPin?.({
      name: title,
      address: formatted || title,
      lat: pos.lat,
      lng: pos.lng,
    });
    setConfirming(false);
  };

  const overlay = (
    <div
      className="flex h-[100dvh] w-full flex-col bg-[#E8ECF0]"
      style={{ position: "fixed", inset: 0, zIndex: 10060, transform: "none" }}
    >
      <div className="relative min-h-0 flex-1">
        <div
          ref={mapHostRef}
          className="absolute inset-0"
          style={{ touchAction: "none" }}
        />
        {!mapReady && !mapError ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#E8ECF0]">
            <Loader2 className="h-7 w-7 animate-spin text-[#FF6A00]" />
          </div>
        ) : null}
        {mapError ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center px-6 text-center text-sm text-neutral-600">
            {mapError}
          </div>
        ) : null}

        <button
          type="button"
          onClick={onBack}
          className="absolute left-3 top-[max(0.65rem,env(safe-area-inset-top))] z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-[0_8px_24px_rgba(15,23,42,0.16)]"
          aria-label="Back to search"
        >
          <ArrowLeft className="h-5 w-5 text-neutral-900" strokeWidth={2.25} />
        </button>

        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={isLocating || !mapReady}
          className="absolute bottom-36 right-3 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#FF6A00] shadow-[0_8px_24px_rgba(15,23,42,0.16)] disabled:opacity-50"
          aria-label="Use current location"
        >
          {isLocating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Crosshair className="h-4 w-4" />
          )}
        </button>
      </div>

      <div className="shrink-0 border-t border-neutral-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
          {isGeocoding ? "Updating address…" : "Pinned drop"}
        </p>
        <p className="mt-1 truncate text-[14px] font-semibold text-neutral-950">
          {address || "Drag the map or pin to set drop"}
        </p>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={confirming || !pin}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FF6A00] text-[15px] font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.28)] disabled:opacity-55"
        >
          {confirming ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
          Confirm drop pin
        </button>
      </div>
    </div>
  );

  if (typeof document === "undefined") return overlay;
  return createPortal(overlay, document.body);
}

export default function LocationSearchFullScreen({
  isOpen,
  onClose,
  initialPickup,
  initialDrop,
  initialPickupLocation = null,
  onConfirm,
  cityName,
}) {
  const [pickup, setPickup] = useState(initialPickup || "Current location");
  const [drop, setDrop] = useState(initialDrop || "");
  const [focusedInput, setFocusedInput] = useState("drop");
  const [recentLocations, setRecentLocations] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [resolvedPickupState, setResolvedPickupState] = useState(null);
  const [showDropMap, setShowDropMap] = useState(false);

  const autocompleteServiceRef = useRef(null);
  const geocoderRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const mapsReadyRef = useRef(false);
  const latestRequestRef = useRef(0);
  const dropInputRef = useRef(null);

  const getSessionToken = useCallback(() => {
    if (
      !sessionTokenRef.current &&
      window.google?.maps?.places?.AutocompleteSessionToken
    ) {
      sessionTokenRef.current =
        new window.google.maps.places.AutocompleteSessionToken();
    }
    return sessionTokenRef.current;
  }, []);

  const initGooglePlaces = useCallback(async () => {
    if (mapsReadyRef.current && autocompleteServiceRef.current) return true;
    try {
      const apiKey = await getGoogleMapsApiKey();
      if (!apiKey) return false;
      await loadGoogleMaps(apiKey);
      if (!window.google?.maps?.places) return false;
      autocompleteServiceRef.current =
        new window.google.maps.places.AutocompleteService();
      geocoderRef.current = new window.google.maps.Geocoder();
      mapsReadyRef.current = true;
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (isOpen) initGooglePlaces();
  }, [isOpen, initGooglePlaces]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    const query = focusedInput === "pickup" ? pickup : drop;
    const trimmed = String(query || "").trim();

    if (trimmed.length < 2 || trimmed.toLowerCase() === "current location") {
      latestRequestRef.current += 1;
      setPredictions([]);
      setIsSearching(false);
      return undefined;
    }

    const timer = setTimeout(async () => {
      const ready = await initGooglePlaces();
      if (!ready || !autocompleteServiceRef.current) return;

      const requestId = ++latestRequestRef.current;
      setIsSearching(true);

      autocompleteServiceRef.current.getPlacePredictions(
        {
          input: trimmed,
          componentRestrictions: { country: "in" },
          sessionToken: getSessionToken(),
        },
        (results, status) => {
          if (requestId !== latestRequestRef.current) return;
          setIsSearching(false);
          if (
            status === window.google.maps.places.PlacesServiceStatus.OK &&
            Array.isArray(results)
          ) {
            setPredictions(results.slice(0, 8));
          } else {
            setPredictions([]);
          }
        },
      );
    }, 280);

    return () => clearTimeout(timer);
  }, [pickup, drop, focusedInput, initGooglePlaces, getSessionToken]);

  useEffect(() => {
    if (!isOpen) return;
    setPickup(initialPickup || "Current location");
    setDrop(initialDrop || "");
    setFocusedInput("drop");
    setPredictions([]);
    setShowDropMap(false);
    try {
      const stored = localStorage.getItem(RECENT_LOCATIONS_KEY);
      if (stored) setRecentLocations(JSON.parse(stored));
    } catch {
      /* ignore */
    }
    const t = window.setTimeout(() => dropInputRef.current?.focus(), 280);
    return () => window.clearTimeout(t);
  }, [isOpen, initialPickup, initialDrop]);

  const saveRecentLocation = (name, address) => {
    try {
      const stored = localStorage.getItem(RECENT_LOCATIONS_KEY);
      let locations = stored ? JSON.parse(stored) : [];
      locations = locations.filter((loc) => loc.name !== name);
      locations.unshift({ name, address: address || name });
      if (locations.length > 10) locations.length = 10;
      localStorage.setItem(RECENT_LOCATIONS_KEY, JSON.stringify(locations));
      setRecentLocations(locations);
    } catch {
      /* ignore */
    }
  };

  const handleSelect = async (item) => {
    saveRecentLocation(item.name, item.address);
    let resolvedPlace = { address: item.name };

    if (item.place_id && geocoderRef.current) {
      setIsSearching(true);
      try {
        const results = await new Promise((resolve) => {
          geocoderRef.current.geocode({ placeId: item.place_id }, (res, status) => {
            if (status === "OK" && res?.[0]) resolve(res[0]);
            else resolve(null);
          });
        });
        if (results?.geometry?.location) {
          resolvedPlace = {
            address: results.formatted_address || item.name,
            lat: results.geometry.location.lat(),
            lng: results.geometry.location.lng(),
            placeId: item.place_id,
          };
        }
      } catch {
        /* ignore */
      }
      setIsSearching(false);
    } else if (geocoderRef.current) {
      setIsSearching(true);
      try {
        const searchAddress = `${item.name}, ${cityName || "India"}`;
        const results = await new Promise((resolve) => {
          geocoderRef.current.geocode({ address: searchAddress }, (res, status) => {
            if (status === "OK" && res?.[0]) resolve(res[0]);
            else resolve(null);
          });
        });
        if (results?.geometry?.location) {
          resolvedPlace = {
            address: results.formatted_address || item.name,
            lat: results.geometry.location.lat(),
            lng: results.geometry.location.lng(),
          };
        }
      } catch {
        /* ignore */
      }
      setIsSearching(false);
    }

    if (focusedInput === "drop") {
      setDrop(item.name);
      onConfirm?.({
        pickup,
        drop: item.name,
        resolvedDrop: resolvedPlace,
        resolvedPickup: resolvedPickupState,
      });
    } else {
      setPickup(item.name);
      setResolvedPickupState(resolvedPlace);
      setFocusedInput("drop");
      window.setTimeout(() => dropInputRef.current?.focus(), 50);
    }
  };

  const handleCurrentLocation = async () => {
    setPickup("Locating...");
    setIsSearching(true);
    setPredictions([]);

    if (!navigator.geolocation) {
      setPickup(initialPickup || "Current location");
      setIsSearching(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const ready = await initGooglePlaces();
        if (!ready || !geocoderRef.current) {
          setPickup(initialPickup || "Current location");
          setIsSearching(false);
          return;
        }

        geocoderRef.current.geocode(
          { location: { lat: latitude, lng: longitude } },
          (results, status) => {
            setIsSearching(false);
            if (status === "OK" && results?.[0]) {
              const formatted = results[0].formatted_address;
              setPickup(formatted);
              setResolvedPickupState({
                address: formatted,
                lat: latitude,
                lng: longitude,
              });
              saveRecentLocation(formatted, "Current Location");
              setFocusedInput("drop");
              window.setTimeout(() => dropInputRef.current?.focus(), 50);
            } else {
              setPickup(initialPickup || "Current location");
            }
          },
        );
      },
      () => {
        setIsSearching(false);
        setPickup(initialPickup || "Current location");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const popularPlaces = getPlacesForCity(cityName).map((p) => ({
    name: p.name,
    address: p.type,
    placeType: p.type,
    kind: "popular",
  }));

  const displayList =
    predictions.length > 0
      ? predictions.map((p) => ({
          name: p.structured_formatting?.main_text || p.description,
          address: p.structured_formatting?.secondary_text || "",
          kind: "prediction",
          place_id: p.place_id,
        }))
      : recentLocations.length > 0
        ? recentLocations.map((r) => ({
            ...r,
            kind: "recent",
          }))
        : popularPlaces;

  const listTitle =
    predictions.length > 0
      ? "Suggestions"
      : recentLocations.length > 0
        ? "Recent"
        : "Popular near you";

  const overlay = (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          key="taxi-drop-search"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "tween", duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#F7F7F8]"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10050,
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Choose destination"
        >
          {/* Own header only — no Food/Taxi module chrome */}
          <header className="shrink-0 border-b border-neutral-200/80 bg-white pt-[max(0.5rem,env(safe-area-inset-top))]">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-neutral-900 transition hover:bg-neutral-100"
                aria-label="Go back"
              >
                <ArrowLeft className="h-5 w-5" strokeWidth={2.25} />
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-[17px] font-bold tracking-[-0.02em] text-neutral-950">
                  Where to?
                </h1>
                <p className="truncate text-[11px] text-neutral-500">
                  Search or pick a suggested place
                </p>
              </div>
            </div>

            <div className="px-4 pb-3">
              <div className="rounded-2xl bg-neutral-50 ring-1 ring-neutral-200/90">
                <div className="flex gap-3 px-3.5 py-3">
                  <div className="flex w-4 flex-col items-center pt-2.5 pb-2.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/15" />
                    <span className="my-1 w-px flex-1 bg-neutral-300" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#FF6A00] ring-4 ring-[#FF6A00]/15" />
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1 border-b border-neutral-200/80 pb-2">
                      <input
                        type="text"
                        value={pickup}
                        onChange={(e) => setPickup(e.target.value)}
                        onFocus={() => setFocusedInput("pickup")}
                        placeholder="Pickup location"
                        className={`min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-neutral-400 ${
                          focusedInput === "pickup"
                            ? "font-semibold text-neutral-950"
                            : "font-medium text-neutral-700"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={handleCurrentLocation}
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-neutral-400 transition hover:bg-white hover:text-[#FF6A00]"
                        aria-label="Use current location for pickup"
                      >
                        <LocateFixed className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1 pt-1.5">
                      <input
                        ref={dropInputRef}
                        type="text"
                        value={drop}
                        onChange={(e) => setDrop(e.target.value)}
                        onFocus={() => {
                          setFocusedInput("drop");
                          if (!pickup || !String(pickup).trim()) {
                            handleCurrentLocation();
                          }
                        }}
                        placeholder="Destination"
                        autoComplete="off"
                        className={`min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-neutral-400 ${
                          focusedInput === "drop"
                            ? "font-semibold text-neutral-950"
                            : "font-medium text-neutral-700"
                        }`}
                      />
                      {drop ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDrop("");
                            setPredictions([]);
                            dropInputRef.current?.focus();
                          }}
                          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-neutral-400 transition hover:bg-white hover:text-neutral-700"
                          aria-label="Clear destination"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : (
                        <span className="flex h-8 w-8 items-center justify-center text-neutral-300" aria-hidden>
                          <Plus className="h-4 w-4" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowDropMap(true)}
                className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[13px] font-semibold text-[#FF6A00] ring-1 ring-neutral-200/90 transition hover:bg-[#FFF8F3] active:scale-[0.99]"
              >
                <MapPin className="h-4 w-4" strokeWidth={2.4} />
                Set destination on map
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="px-4 pt-4">
              <div className="mb-2 flex items-center justify-between px-0.5">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500">
                  {listTitle}
                </h2>
                {predictions.length === 0 && recentLocations.length === 0 ? (
                  <TrendingUp className="h-3.5 w-3.5 text-neutral-400" aria-hidden />
                ) : null}
              </div>

              {isSearching ? (
                <div className="mb-2 flex items-center gap-2 rounded-2xl bg-white px-4 py-3.5 text-sm text-neutral-500 ring-1 ring-neutral-200/80">
                  <Loader2 className="h-4 w-4 animate-spin text-[#FF6A00]" aria-hidden />
                  Searching places…
                </div>
              ) : null}

              <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-200/80">
                {!isSearching && displayList.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-neutral-500">
                    No places found. Try another search.
                  </div>
                ) : null}

                {!isSearching
                  ? displayList.map((item, idx) => (
                      <button
                        key={`${item.kind}-${item.place_id || item.name}-${idx}`}
                        type="button"
                        onClick={() => handleSelect(item)}
                        className="flex w-full cursor-pointer items-center gap-3 border-b border-neutral-100 px-3.5 py-3.5 text-left last:border-b-0 transition hover:bg-[#FFF8F3] active:bg-[#FFF4ED]"
                      >
                        <SuggestionIcon
                          kind={item.kind}
                          placeType={item.placeType || item.address}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-semibold tracking-[-0.01em] text-neutral-950">
                            {item.name}
                          </span>
                          {item.address ? (
                            <span className="mt-0.5 block truncate text-[12px] text-neutral-500">
                              {item.address}
                            </span>
                          ) : null}
                        </span>
                        <MapPin
                          className="h-3.5 w-3.5 shrink-0 text-neutral-300"
                          aria-hidden
                        />
                      </button>
                    ))
                  : null}
              </div>
            </div>
          </div>

          <AnimatePresence>
            {showDropMap ? (
              <DropPinMap
                initialCenter={
                  toLatLng(resolvedPickupState) || toLatLng(initialPickupLocation)
                }
                onBack={() => setShowDropMap(false)}
                onConfirmPin={(place) => {
                  saveRecentLocation(place.name, place.address);
                  setDrop(place.name);
                  setShowDropMap(false);
                  onConfirm?.({
                    pickup,
                    drop: place.name,
                    resolvedDrop: {
                      address: place.address,
                      lat: place.lat,
                      lng: place.lng,
                    },
                    resolvedPickup: resolvedPickupState,
                  });
                }}
              />
            ) : null}
          </AnimatePresence>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return overlay;
  return createPortal(overlay, document.body);
}
