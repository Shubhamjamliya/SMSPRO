import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  Check,
  Crosshair,
  Loader2,
  MapPin,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { loadGoogleMaps } from "@core/services/googleMapsLoader";
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey";
import "./taxiMapClean.css";

const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };
const DEFAULT_ZOOM = 14;
const MIN_QUERY = 2;
const DEBOUNCE_MS = 280;

function toLatLng(loc) {
  if (!loc) return null;
  const lat = Number(loc.lat ?? loc.latitude);
  const lng = Number(loc.lng ?? loc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

const PickupMapCard = forwardRef(function PickupMapCard({
  addressLabel = "Move the pin, then confirm pickup",
  initialLocation = null,
  onConfirm,
  onPickupChange,
  confirming = false,
  locked = false,
  /** When true, immersive mode shows a compact confirmed pill instead of Confirm CTA */
  confirmed = false,
  /** card = classic stacked UI; immersive = full-bleed map (Uber-style home) */
  variant = "card",
  /** Extra bottom space so floating controls clear the home deck / nav */
  bottomInset = 0,
  className = "",
  /** Immersive: show/hide the floating confirm strip (parent can own confirm UI) */
  showConfirmStrip = true,
  /** Immersive: live center address while map pans (before confirm) */
  onPreviewChange,
}, ref) {
  const immersive = variant === "immersive";
  const mapHostRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const geocoderRef = useRef(null);
  const autocompleteRef = useRef(null);
  const placesHostRef = useRef(null);
  const placesServiceRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const latestRequestRef = useRef(0);
  const pinRef = useRef(null);
  const programmaticRef = useRef(false);
  const userMovedRef = useRef(false);
  const geocodeReqRef = useRef(0);
  const onPreviewChangeRef = useRef(onPreviewChange);
  onPreviewChangeRef.current = onPreviewChange;
  const updateFromMapCenterRef = useRef(null);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [pin, setPin] = useState(() => toLatLng(initialLocation));
  const [address, setAddress] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [predictions, setPredictions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  pinRef.current = pin;

  const displayAddress = address || addressLabel;

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

  const reverseGeocode = useCallback(async (pos) => {
    if (!geocoderRef.current || !pos) return "";
    setIsGeocoding(true);
    try {
      const result = await new Promise((resolve) => {
        geocoderRef.current.geocode({ location: pos }, (results, status) => {
          if (status === "OK" && results?.[0]) resolve(results[0]);
          else resolve(null);
        });
      });
      const formatted = result?.formatted_address || "";
      setAddress(formatted);
      return formatted;
    } finally {
      setIsGeocoding(false);
    }
  }, []);

  const publishPreview = useCallback((pos, address = "") => {
    if (!pos) return;
    onPreviewChangeRef.current?.({
      lat: pos.lat,
      lng: pos.lng,
      address: address || "",
      formattedAddress: address || "",
    });
  }, []);

  const updateFromMapCenter = useCallback(
    (map, { force = false } = {}) => {
      if (!map || (!force && programmaticRef.current)) return;
      const center = map.getCenter();
      if (!center) return;
      const next = { lat: center.lat(), lng: center.lng() };
      const prev = pinRef.current;
      if (
        !force &&
        prev &&
        Math.abs(prev.lat - next.lat) < 1e-7 &&
        Math.abs(prev.lng - next.lng) < 1e-7
      ) {
        return;
      }

      userMovedRef.current = true;
      pinRef.current = next;
      setPin(next);
      // Update parent immediately so UI reacts before geocode finishes
      publishPreview(next, "");

      const reqId = ++geocodeReqRef.current;
      reverseGeocode(next).then((formatted) => {
        if (reqId !== geocodeReqRef.current) return;
        publishPreview(next, formatted || "");
      });
    },
    [publishPreview, reverseGeocode],
  );

  updateFromMapCenterRef.current = updateFromMapCenter;

  const placeMarker = useCallback(
    (pos, { pan = true, geocode = true } = {}) => {
      if (!mapRef.current || !window.google?.maps || !pos) return;

      pinRef.current = pos;
      setPin(pos);

      if (immersive) {
        // Fixed center pin: move the map under the pin (no Google Marker)
        if (markerRef.current) {
          markerRef.current.setMap(null);
          markerRef.current = null;
        }
        if (pan) {
          const center = mapRef.current.getCenter();
          const alreadyCentered =
            center &&
            Math.abs(center.lat() - pos.lat) < 1e-7 &&
            Math.abs(center.lng() - pos.lng) < 1e-7;

          if (!alreadyCentered) {
            programmaticRef.current = true;
            mapRef.current.panTo(pos);
            if (mapRef.current.getZoom() < 14) mapRef.current.setZoom(15);
            window.google.maps.event.addListenerOnce(mapRef.current, "idle", () => {
              programmaticRef.current = false;
            });
            window.setTimeout(() => {
              programmaticRef.current = false;
            }, 600);
          }
        }
        if (geocode) {
          publishPreview(pos, "");
          const reqId = ++geocodeReqRef.current;
          reverseGeocode(pos).then((formatted) => {
            if (reqId !== geocodeReqRef.current) return;
            publishPreview(pos, formatted || "");
          });
        } else {
          publishPreview(pos, "");
        }
        return;
      }

      if (!markerRef.current) {
        markerRef.current = new window.google.maps.Marker({
          map: mapRef.current,
          position: pos,
          draggable: true,
          animation: window.google.maps.Animation.DROP,
        });
        markerRef.current.addListener("dragend", () => {
          const next = {
            lat: markerRef.current.getPosition().lat(),
            lng: markerRef.current.getPosition().lng(),
          };
          pinRef.current = next;
          setPin(next);
          reverseGeocode(next);
        });
      } else {
        markerRef.current.setPosition(pos);
      }

      if (pan) {
        mapRef.current.panTo(pos);
        if (mapRef.current.getZoom() < 14) mapRef.current.setZoom(15);
      }
      if (geocode) reverseGeocode(pos);
    },
    [reverseGeocode, immersive, publishPreview],
  );

  // Init real Google Map
  useEffect(() => {
    let cancelled = false;
    let resizeObserver = null;

    (async () => {
      try {
        setMapError("");
        const apiKey = await getGoogleMapsApiKey();
        if (!apiKey) {
          if (!cancelled) setMapError("Google Maps API key is missing");
          return;
        }
        await loadGoogleMaps(apiKey);
        if (cancelled || !mapHostRef.current || !window.google?.maps) return;

        geocoderRef.current = new window.google.maps.Geocoder();
        if (!placesHostRef.current) {
          placesHostRef.current = document.createElement("div");
        }
        if (window.google.maps.places) {
          autocompleteRef.current =
            new window.google.maps.places.AutocompleteService();
          placesServiceRef.current = new window.google.maps.places.PlacesService(
            placesHostRef.current,
          );
        }

        const start = toLatLng(initialLocation) || DEFAULT_CENTER;
        const map = new window.google.maps.Map(mapHostRef.current, {
          center: start,
          zoom: toLatLng(initialLocation) ? 15 : DEFAULT_ZOOM,
          disableDefaultUI: true,
          zoomControl: false,
          gestureHandling: "greedy",
          clickableIcons: false,
          fullscreenControl: false,
          streetViewControl: false,
          mapTypeControl: false,
          rotateControl: false,
          scaleControl: false,
          keyboardShortcuts: false,
        });
        mapRef.current = map;

        if (immersive) {
          // Fixed pin: whenever the map settles after a user gesture, publish center
          map.addListener("dragend", () => {
            programmaticRef.current = false;
            updateFromMapCenterRef.current?.(map, { force: true });
          });
          map.addListener("idle", () => {
            updateFromMapCenterRef.current?.(map);
          });
          map.addListener("click", (event) => {
            if (!event?.latLng) return;
            userMovedRef.current = true;
            placeMarker(
              { lat: event.latLng.lat(), lng: event.latLng.lng() },
              { pan: true, geocode: true },
            );
          });
          // Seed center under the fixed pin
          placeMarker(start, { pan: true, geocode: true });
        } else {
          map.addListener("click", (event) => {
            if (!event?.latLng) return;
            placeMarker(
              { lat: event.latLng.lat(), lng: event.latLng.lng() },
              { pan: false, geocode: true },
            );
          });
          if (toLatLng(initialLocation)) {
            placeMarker(start, { pan: true, geocode: !address });
          }
        }

        resizeObserver = new ResizeObserver(() => {
          window.google.maps.event.trigger(map, "resize");
        });
        resizeObserver.observe(mapHostRef.current);

        if (!cancelled) setMapReady(true);
        setTimeout(() => {
          window.google.maps.event.trigger(map, "resize");
          if (pinRef.current) map.panTo(pinRef.current);
        }, 200);
      } catch (err) {
        if (!cancelled) {
          setMapError(err?.message || "Failed to load map");
        }
      }
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      if (markerRef.current) {
        markerRef.current.setMap(null);
        markerRef.current = null;
      }
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync when parent location becomes available / jumps (search via setPickupAt).
  // After the user drags the map, stop yanking the pin back to GPS.
  useEffect(() => {
    const next = toLatLng(initialLocation);
    if (!next || !mapReady || !mapRef.current) return;

    if (immersive && userMovedRef.current) return;

    const current = pinRef.current;
    if (current) {
      const dLat = Math.abs(current.lat - next.lat);
      const dLng = Math.abs(current.lng - next.lng);
      if (dLat < 0.00001 && dLng < 0.00001) return;
      if (immersive && dLat < 0.00035 && dLng < 0.00035) return;
    }
    placeMarker(next, { pan: true, geocode: true });
  }, [initialLocation, mapReady, placeMarker, immersive]);

  // Places search
  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < MIN_QUERY || !searchOpen) {
      latestRequestRef.current += 1;
      setPredictions([]);
      setIsSearching(false);
      return undefined;
    }

    const timer = setTimeout(() => {
      if (!autocompleteRef.current) return;
      const requestId = ++latestRequestRef.current;
      setIsSearching(true);

      const request = {
        input: query,
        componentRestrictions: { country: "in" },
        sessionToken: getSessionToken(),
      };
      const bias = pinRef.current || toLatLng(initialLocation);
      if (bias && window.google?.maps) {
        request.location = new window.google.maps.LatLng(bias.lat, bias.lng);
        request.radius = 35000;
      }

      autocompleteRef.current.getPlacePredictions(request, (results, status) => {
        if (requestId !== latestRequestRef.current) return;
        setIsSearching(false);
        if (status === window.google.maps.places.PlacesServiceStatus.OK) {
          setPredictions((results || []).slice(0, 5));
        } else {
          setPredictions([]);
        }
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchQuery, searchOpen, getSessionToken, initialLocation]);

  const selectPrediction = (prediction) => {
    if (!prediction?.place_id || !placesServiceRef.current) return;

    placesServiceRef.current.getDetails(
      {
        placeId: prediction.place_id,
        fields: ["geometry", "formatted_address", "name"],
        sessionToken: getSessionToken(),
      },
      (place, status) => {
        sessionTokenRef.current = null;
        if (
          status !== window.google.maps.places.PlacesServiceStatus.OK ||
          !place?.geometry?.location
        ) {
          toast.error("Could not resolve that place");
          return;
        }
        const pos = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        };
        const formatted =
          place.formatted_address || place.name || prediction.description;
        setAddress(formatted);
        // Clear search box so last query / dropdown don't stick after selection
        setSearchQuery("");
        setPredictions([]);
        setSearchOpen(false);
        placeMarker(pos, { pan: true, geocode: false });
      },
    );
  };

  // After pickup is confirmed / during live ride — no leftover search UI
  useEffect(() => {
    if (!locked && !confirmed) return;
    setSearchQuery("");
    setPredictions([]);
    setSearchOpen(false);
    setIsSearching(false);
  }, [locked, confirmed]);

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported on this device");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const pos = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        userMovedRef.current = true;
        placeMarker(pos, { pan: true, geocode: true });
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
        toast.error("Allow location access to use current location");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const handleConfirm = async () => {
    const pos = pinRef.current;
    if (!pos) {
      toast.message("Set your pickup pin", {
        description: "Tap the map or search a place first.",
      });
      return;
    }

    let formatted = address;
    if (!formatted) {
      formatted = await reverseGeocode(pos);
    }

    const payload = {
      lat: pos.lat,
      lng: pos.lng,
      latitude: pos.lat,
      longitude: pos.lng,
      address: formatted || "Pickup location",
      formattedAddress: formatted || "Pickup location",
    };

    onPickupChange?.(payload);
    onConfirm?.(payload);
    setSearchQuery("");
    setPredictions([]);
    setSearchOpen(false);
  };

  useImperativeHandle(ref, () => ({
    confirmPickup: () => handleConfirm(),
    hasPin: () => Boolean(pinRef.current),
    setPickupAt: (pos, address = "") => {
      if (!pos) return;
      const next = {
        lat: Number(pos.lat ?? pos.latitude),
        lng: Number(pos.lng ?? pos.longitude),
      };
      if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return;
      userMovedRef.current = true;
      if (address) {
        setAddress(address);
        placeMarker(next, { pan: true, geocode: false });
        publishPreview(next, address);
      } else {
        placeMarker(next, { pan: true, geocode: true });
      }
    },
  }));

  const searchField = (
    <div className="relative">
      <label htmlFor="taxi-pickup-search" className="sr-only">
        Search pickup area
      </label>
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#FF6A00]"
        aria-hidden
      />
      <input
        id="taxi-pickup-search"
        type="search"
        value={searchQuery}
        disabled={locked}
        onChange={(e) => {
          if (locked) return;
          setSearchQuery(e.target.value);
          setSearchOpen(true);
        }}
        onFocus={() => {
          if (locked) return;
          setSearchOpen(true);
        }}
        placeholder={locked ? "Pickup selected" : "Search pickup area…"}
        autoComplete="off"
        className={`h-11 w-full rounded-2xl border border-slate-200/90 bg-white pl-10 pr-11 text-sm font-medium text-slate-900 outline-none transition-colors duration-200 placeholder:text-slate-400 focus:border-[#FF6A00]/45 focus:ring-2 focus:ring-[#FF6A00]/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 ${
          immersive
            ? "shadow-[0_12px_36px_rgba(15,23,42,0.16)] ring-1 ring-black/[0.04]"
            : "bg-slate-50/60"
        }`}
      />
      {searchQuery && !locked ? (
        <button
          type="button"
          onClick={() => {
            setSearchQuery("");
            setPredictions([]);
            setSearchOpen(false);
          }}
          className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}

      {!locked && searchOpen && (isSearching || predictions.length > 0) ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-[80] max-h-[min(42vh,280px)] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200/90 bg-white shadow-[0_16px_48px_rgba(15,23,42,0.22)]">
          {isSearching ? (
            <div className="flex items-center gap-2 px-3.5 py-3 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#FF6A00]" aria-hidden />
              Searching…
            </div>
          ) : null}
          {!isSearching
            ? predictions.map((p) => (
                <button
                  key={p.place_id}
                  type="button"
                  onClick={() => selectPrediction(p)}
                  className="flex min-h-[48px] w-full cursor-pointer items-start gap-2.5 border-b border-slate-100 px-3.5 py-3 text-left transition-colors duration-150 last:border-b-0 hover:bg-[#FFF8F3]"
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6A00]" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900">
                      {p.structured_formatting?.main_text || p.description}
                    </span>
                    {p.structured_formatting?.secondary_text ? (
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {p.structured_formatting.secondary_text}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))
            : null}
        </div>
      ) : null}
    </div>
  );

  const mapBody = (
    <>
      <div ref={mapHostRef} className="absolute inset-0 h-full w-full" />

      {!mapReady && !mapError ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/90">
          <div className="text-center">
            <Loader2 className="mx-auto mb-2 h-7 w-7 animate-spin text-[#FF6A00]" aria-hidden />
            <p className="text-sm font-medium text-slate-600">Loading live map…</p>
          </div>
        </div>
      ) : null}

      {mapError ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100 px-6 text-center">
          <div>
            <MapPin className="mx-auto mb-2 h-8 w-8 text-slate-400" aria-hidden />
            <p className="text-sm font-semibold text-slate-700">Map unavailable</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{mapError}</p>
          </div>
        </div>
      ) : null}
    </>
  );

  if (immersive) {
    const fabBottom =
      bottomInset +
      (showConfirmStrip && !confirmed && !locked ? 84 : 16);
    return (
      <div className={`taxi-map-clean relative h-full w-full bg-[#E8ECF0] ${className}`}>
        <div className="absolute inset-0 overflow-hidden">{mapBody}</div>

        {/* Fixed center pin — tip = map center; map pans underneath */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-[15] -translate-x-1/2 -translate-y-full"
          aria-hidden
        >
          <div className="relative flex flex-col items-center">
            <span className="absolute left-1/2 top-[2px] h-11 w-11 -translate-x-1/2 rounded-full bg-[#E879A8]/50 blur-[8px]" />
            <span className="relative flex h-7 w-7 items-center justify-center rounded-full border-[2.5px] border-white bg-white/5 shadow-[0_2px_10px_rgba(0,0,0,0.45)]">
              <span className="h-[7px] w-[7px] rounded-full bg-white" />
            </span>
            <svg
              width="12"
              height="24"
              viewBox="0 0 12 24"
              fill="none"
              className="-mt-0.5 drop-shadow-[0_2px_3px_rgba(0,0,0,0.4)]"
            >
              <path
                d="M6 1V20"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M6 20L3.2 16.8M6 20L8.8 16.8"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-32 bg-gradient-to-b from-white/55 via-white/20 to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] bg-gradient-to-t from-black/35 via-black/10 to-transparent"
          style={{ height: Math.max(160, bottomInset + 72) }}
          aria-hidden
        />

        {!locked ? (
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={isLocating || !mapReady}
            className="absolute right-3 z-20 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white text-[#FF6A00] shadow-[0_8px_28px_rgba(15,23,42,0.18)] outline-none ring-1 ring-black/[0.05] transition duration-200 hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-[#FF6A00]/40 disabled:cursor-not-allowed disabled:opacity-50 sm:right-4"
            style={{ bottom: fabBottom }}
            aria-label="Use current location"
          >
            {isLocating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Crosshair className="h-4 w-4" aria-hidden />
            )}
          </button>
        ) : null}

        {showConfirmStrip && !confirmed && !locked ? (
          <div
            className="absolute inset-x-4 z-20"
            style={{ bottom: bottomInset + 10 }}
          >
            <div className="flex items-center gap-3 rounded-[1.35rem] bg-white p-2.5 pl-3.5 shadow-[0_16px_48px_rgba(15,23,42,0.2)] ring-1 ring-black/[0.04]">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                {isGeocoding ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <MapPin className="h-4 w-4" aria-hidden />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-neutral-500">Confirm pickup</p>
                <p className="truncate text-[13px] font-semibold tracking-[-0.01em] text-neutral-900">
                  {displayAddress}
                </p>
              </div>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirming || !pin}
                className="inline-flex min-h-[44px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-[#FF6A00] px-4 text-[13px] font-semibold text-white shadow-[0_6px_18px_rgba(255,106,0,0.35)] transition duration-200 hover:bg-[#E85F00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/45 disabled:cursor-not-allowed disabled:opacity-55"
              >
                <Check className="h-4 w-4" aria-hidden />
                Confirm
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }


  return (
    <div
      className={`overflow-hidden rounded-[1.25rem] border border-slate-200/90 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.06)] ${className}`}
    >
      <div className="relative z-20 space-y-2.5 border-b border-slate-100 p-3.5">
        {searchField}
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={locked || isLocating || !mapReady}
          className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition-colors duration-200 hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/35 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLocating ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#FF6A00]" aria-hidden />
          ) : (
            <Crosshair className="h-4 w-4 text-[#FF6A00]" aria-hidden />
          )}
          {isLocating ? "Getting location…" : "Use current location"}
        </button>
      </div>

      <div className="relative h-[240px] w-full bg-slate-100 sm:h-[280px]">
        {mapBody}
        {mapReady ? (
          <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full border border-slate-200/80 bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm backdrop-blur-sm">
            Tap map or drag pin
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3 px-3.5 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
          {isGeocoding ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <MapPin className="h-4 w-4" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Pickup pin
          </p>
          <p className="truncate text-sm font-semibold text-slate-900">
            {displayAddress}
          </p>
        </div>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={locked || confirming || !pin}
          className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl bg-[#FF6A00] px-4 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(255,106,0,0.28)] transition-colors duration-200 hover:bg-[#E85F00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
        >
          <Check className="h-4 w-4" aria-hidden />
          {locked ? "Locked" : "Confirm"}
        </button>
      </div>
    </div>
  );
});

export default PickupMapCard;
