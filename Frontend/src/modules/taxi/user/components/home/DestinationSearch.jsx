import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, Loader2, MapPin, Search, X } from "lucide-react";
import { loadGoogleMaps } from "@core/services/googleMapsLoader";
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey";

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 280;
const MAX_SUGGESTIONS = 6;

export default function DestinationSearch({
  value = "",
  onChange,
  onSelectPlace,
  onUseCurrentLocation,
  biasLocation = null,
  placeholder = "Where are you going?",
  placeSelected = false,
  disabled = false,
  onInputClick = null,
}) {
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const autocompleteServiceRef = useRef(null);
  const placesServiceRef = useRef(null);
  const geocoderRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const mapsReadyRef = useRef(false);
  const latestRequestRef = useRef(0);
  const placesHostRef = useRef(null);
  const selectedAddressRef = useRef("");

  const [isFocused, setIsFocused] = useState(false);
  const [predictions, setPredictions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");
  const [resolvingId, setResolvingId] = useState(null);

  // Keep selected lock in sync when parent sets place (e.g. after book / hydrate)
  useEffect(() => {
    if (placeSelected && value) {
      selectedAddressRef.current = String(value).trim();
      setPredictions([]);
      setIsSearching(false);
      setIsFocused(false);
      setError("");
    }
  }, [placeSelected, value]);

  useEffect(() => {
    if (!disabled) return;
    setPredictions([]);
    setIsSearching(false);
    setIsFocused(false);
    setError("");
  }, [disabled]);

  const resetSession = useCallback(() => {
    sessionTokenRef.current = null;
  }, []);

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
      if (!apiKey) {
        setError("Google Maps API key is missing");
        return false;
      }

      await loadGoogleMaps(apiKey);
      if (!window.google?.maps?.places) {
        setError("Google Places is unavailable");
        return false;
      }

      autocompleteServiceRef.current =
        new window.google.maps.places.AutocompleteService();
      geocoderRef.current = new window.google.maps.Geocoder();

      // PlacesService needs a DOM node (can be hidden)
      if (!placesHostRef.current) {
        placesHostRef.current = document.createElement("div");
      }
      placesServiceRef.current = new window.google.maps.places.PlacesService(
        placesHostRef.current,
      );

      mapsReadyRef.current = true;
      setError("");
      return true;
    } catch (err) {
      setError(err?.message || "Unable to load location search");
      return false;
    }
  }, []);

  // Prefetch Places on first focus for snappier typing
  useEffect(() => {
    if (!isFocused) return undefined;
    initGooglePlaces();
    return undefined;
  }, [isFocused, initGooglePlaces]);

  // Debounced predictions — only while actively typing a new query
  useEffect(() => {
    if (disabled) return undefined;

    const query = String(value || "").trim();

    if (query.length < MIN_QUERY_LENGTH) {
      latestRequestRef.current += 1;
      setPredictions([]);
      setIsSearching(false);
      if (query.length === 0) setError("");
      return undefined;
    }

    // Don't re-open suggestions for an already selected place address
    if (
      placeSelected ||
      (selectedAddressRef.current && query === selectedAddressRef.current)
    ) {
      latestRequestRef.current += 1;
      setPredictions([]);
      setIsSearching(false);
      return undefined;
    }

    if (!isFocused) return undefined;

    const timer = setTimeout(async () => {
      const ready = await initGooglePlaces();
      if (!ready || !autocompleteServiceRef.current) return;

      const requestId = ++latestRequestRef.current;
      setIsSearching(true);
      setError("");

      const request = {
        input: query,
        componentRestrictions: { country: "in" },
        sessionToken: getSessionToken(),
      };

      const lat = Number(biasLocation?.lat ?? biasLocation?.latitude);
      const lng = Number(biasLocation?.lng ?? biasLocation?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng) && window.google?.maps) {
        request.location = new window.google.maps.LatLng(lat, lng);
        request.radius = 35000;
      }

      autocompleteServiceRef.current.getPlacePredictions(
        request,
        (results, status) => {
          if (requestId !== latestRequestRef.current) return;
          setIsSearching(false);

          const ok = status === window.google.maps.places.PlacesServiceStatus.OK;
          const zero =
            status === window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS;

          if (ok && Array.isArray(results)) {
            setPredictions(results.slice(0, MAX_SUGGESTIONS));
          } else {
            setPredictions([]);
            if (!zero) setError("Unable to fetch location suggestions");
          }
        },
      );
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [
    value,
    biasLocation,
    getSessionToken,
    initGooglePlaces,
    placeSelected,
    disabled,
    isFocused,
  ]);

  // Close dropdown on outside click
  useEffect(() => {
    const onPointerDown = (event) => {
      if (!wrapRef.current?.contains(event.target)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const resolvePlace = useCallback(
    (prediction) => {
      if (!prediction?.place_id) return;
      setResolvingId(prediction.place_id);

      const finish = (payload) => {
        selectedAddressRef.current = payload.address || "";
        onChange?.(payload.address);
        onSelectPlace?.(payload);
        setPredictions([]);
        setIsFocused(false);
        setResolvingId(null);
        setError("");
        resetSession();
      };

      const fail = (message) => {
        setResolvingId(null);
        setError(message || "Could not resolve this location");
      };

      const applyGeometry = (geometry, formattedAddress) => {
        if (!geometry) {
          fail("Coordinates not available for this place");
          return;
        }
        finish({
          address: formattedAddress || prediction.description,
          lat: geometry.lat(),
          lng: geometry.lng(),
          placeId: prediction.place_id,
          mainText:
            prediction.structured_formatting?.main_text || prediction.description,
          secondaryText: prediction.structured_formatting?.secondary_text || "",
        });
      };

      // Prefer Places Details (keeps Autocomplete session billing correct)
      if (placesServiceRef.current) {
        placesServiceRef.current.getDetails(
          {
            placeId: prediction.place_id,
            fields: ["geometry", "formatted_address", "name"],
            sessionToken: getSessionToken(),
          },
          (place, status) => {
            if (
              status === window.google.maps.places.PlacesServiceStatus.OK &&
              place?.geometry?.location
            ) {
              applyGeometry(
                place.geometry.location,
                place.formatted_address || place.name || prediction.description,
              );
              return;
            }

            // Fallback: Geocoder
            if (!geocoderRef.current) {
              fail("Could not resolve selected location");
              return;
            }
            geocoderRef.current.geocode(
              { placeId: prediction.place_id },
              (results, geoStatus) => {
                if (geoStatus === "OK" && results?.[0]?.geometry?.location) {
                  applyGeometry(
                    results[0].geometry.location,
                    results[0].formatted_address || prediction.description,
                  );
                } else {
                  fail("Could not resolve selected location");
                }
              },
            );
          },
        );
        return;
      }

      if (!geocoderRef.current) {
        fail("Location services not ready");
        return;
      }

      geocoderRef.current.geocode(
        { placeId: prediction.place_id },
        (results, geoStatus) => {
          if (geoStatus === "OK" && results?.[0]?.geometry?.location) {
            applyGeometry(
              results[0].geometry.location,
              results[0].formatted_address || prediction.description,
            );
          } else {
            fail("Could not resolve selected location");
          }
        },
      );
    },
    [getSessionToken, onChange, onSelectPlace, resetSession],
  );

  const queryTrimmed = String(value || "").trim();
  const isLockedSelection =
    placeSelected ||
    (Boolean(selectedAddressRef.current) &&
      queryTrimmed === selectedAddressRef.current);

  const showDropdown =
    !disabled &&
    isFocused &&
    !isLockedSelection &&
    (isSearching ||
      predictions.length > 0 ||
      error ||
      queryTrimmed.length >= MIN_QUERY_LENGTH);

  return (
    <div className="relative" ref={wrapRef}>
      <label htmlFor="taxi-destination-search" className="sr-only">
        Destination
      </label>
      <div
        className={`relative flex items-center rounded-[1.25rem] border bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition-all duration-200 ${
          isFocused && !disabled
            ? "border-[#FF6A00]/45 ring-2 ring-[#FF6A00]/15"
            : placeSelected
              ? "border-emerald-200"
              : "border-slate-200/90"
        }`}
      >
        <Search
          className="pointer-events-none absolute left-4 h-[18px] w-[18px] text-[#FF6A00]"
          aria-hidden
        />
        <input
          id="taxi-destination-search"
          ref={inputRef}
          type="search"
          value={value}
          disabled={disabled}
          onClick={onInputClick}
          onChange={(e) => {
            selectedAddressRef.current = "";
            onChange?.(e.target.value);
            setIsFocused(true);
          }}
          onFocus={() => {
            if (disabled) return;
            if (onInputClick) return; // let the click handler handle it
            setIsFocused(true);
          }}
          placeholder={placeholder}
          autoComplete="off"
          readOnly={Boolean(onInputClick)}
          className="h-14 w-full cursor-pointer rounded-[1.25rem] bg-transparent pl-11 pr-[5.5rem] text-base font-medium text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-500"
        />
        <div className="absolute right-2 flex items-center gap-1.5">
          {value && !disabled ? (
            <button
              type="button"
              onClick={() => {
                selectedAddressRef.current = "";
                onChange?.("");
                onSelectPlace?.(null);
                setPredictions([]);
                setError("");
                inputRef.current?.focus();
              }}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/35"
              aria-label="Clear destination"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onUseCurrentLocation}
            disabled={disabled}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl bg-[#FFF4ED] text-[#FF6A00] transition-colors duration-200 hover:bg-[#FFE8D6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/35 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Use current location"
            title="Use current location"
          >
            <Crosshair className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showDropdown ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[60] overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_16px_48px_rgba(15,23,42,0.14)]">
          {isSearching ? (
            <div className="flex items-center gap-2.5 px-4 py-3.5 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-[#FF6A00]" aria-hidden />
              Searching places…
            </div>
          ) : null}

          {!isSearching && predictions.length === 0 ? (
            <div className="px-4 py-3.5 text-sm leading-relaxed text-slate-500">
              {error ||
                (String(value || "").trim().length >= MIN_QUERY_LENGTH
                  ? "No matching places found"
                  : "Type at least 2 characters")}
            </div>
          ) : null}

          {!isSearching
            ? predictions.map((prediction) => {
                const main =
                  prediction.structured_formatting?.main_text ||
                  prediction.description;
                const secondary =
                  prediction.structured_formatting?.secondary_text || "";
                const busy = resolvingId === prediction.place_id;

                return (
                  <button
                    key={prediction.place_id}
                    type="button"
                    disabled={Boolean(resolvingId)}
                    onClick={() => resolvePlace(prediction)}
                    className="flex min-h-[52px] w-full cursor-pointer items-start gap-3 border-b border-slate-100 px-4 py-3.5 text-left transition-colors duration-150 last:border-b-0 hover:bg-[#FFF8F3] focus-visible:bg-[#FFF8F3] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF4ED] text-[#FF6A00]">
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <MapPin className="h-4 w-4" aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">
                        {main}
                      </span>
                      {secondary ? (
                        <span className="mt-0.5 block truncate text-xs leading-relaxed text-slate-500">
                          {secondary}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })
            : null}

          {error && predictions.length > 0 ? (
            <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-red-600" role="alert">
              {error}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
