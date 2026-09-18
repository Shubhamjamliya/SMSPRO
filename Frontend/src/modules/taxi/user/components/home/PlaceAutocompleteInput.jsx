import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MapPin, X } from "lucide-react";
import { loadGoogleMaps } from "@core/services/googleMapsLoader";
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey";

const MIN_QUERY = 2;
const DEBOUNCE_MS = 280;

/**
 * One Google Places typeahead field. Used twice on the taxi home screen so
 * pickup and drop can both be entered without leaving the page.
 *
 * The parent owns the value; this component only reports a resolved place
 * (address + coordinates) once the rider picks a suggestion.
 */
export default function PlaceAutocompleteInput({
  id,
  value = "",
  onValueChange,
  onResolvePlace,
  onClear,
  placeholder = "Search location",
  ariaLabel,
  disabled = false,
  biasLocation = null,
  dotClassName = "bg-[#FF6A00]",
  autoFocus = false,
}) {
  const [predictions, setPredictions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [focused, setFocused] = useState(false);

  const autocompleteRef = useRef(null);
  const placesServiceRef = useRef(null);
  const placesHostRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const latestRequestRef = useRef(0);
  const mapsReadyRef = useRef(false);
  const wrapRef = useRef(null);

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

  const initPlaces = useCallback(async () => {
    if (mapsReadyRef.current && autocompleteRef.current) return true;
    try {
      const apiKey = await getGoogleMapsApiKey();
      if (!apiKey) return false;
      await loadGoogleMaps(apiKey);
      if (!window.google?.maps?.places) return false;
      autocompleteRef.current = new window.google.maps.places.AutocompleteService();
      if (!placesHostRef.current) placesHostRef.current = document.createElement("div");
      placesServiceRef.current = new window.google.maps.places.PlacesService(
        placesHostRef.current,
      );
      mapsReadyRef.current = true;
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!focused || disabled) return undefined;
    const query = String(value || "").trim();
    if (query.length < MIN_QUERY) {
      latestRequestRef.current += 1;
      setPredictions([]);
      setIsSearching(false);
      return undefined;
    }

    const timer = setTimeout(async () => {
      const ready = await initPlaces();
      if (!ready || !autocompleteRef.current) return;
      const requestId = ++latestRequestRef.current;
      setIsSearching(true);

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

      autocompleteRef.current.getPlacePredictions(request, (results, status) => {
        if (requestId !== latestRequestRef.current) return;
        setIsSearching(false);
        setPredictions(
          status === window.google.maps.places.PlacesServiceStatus.OK
            ? (results || []).slice(0, 5)
            : [],
        );
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value, focused, disabled, biasLocation, getSessionToken, initPlaces]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!wrapRef.current?.contains(event.target)) setFocused(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const selectPrediction = (prediction) => {
    if (!prediction?.place_id || !placesServiceRef.current) return;
    setResolving(true);
    placesServiceRef.current.getDetails(
      {
        placeId: prediction.place_id,
        fields: ["geometry", "formatted_address", "name"],
        sessionToken: getSessionToken(),
      },
      (place, status) => {
        sessionTokenRef.current = null;
        setResolving(false);
        if (
          status !== window.google.maps.places.PlacesServiceStatus.OK ||
          !place?.geometry?.location
        ) {
          return;
        }
        const address = place.formatted_address || place.name || prediction.description;
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        setPredictions([]);
        setFocused(false);
        onValueChange?.(address);
        onResolvePlace?.({
          lat,
          lng,
          latitude: lat,
          longitude: lng,
          address,
          formattedAddress: address,
        });
      },
    );
  };

  const showSuggestions =
    focused && !disabled && (isSearching || predictions.length > 0 || resolving);

  return (
    <div ref={wrapRef} className="relative">
      <span
        className={`pointer-events-none absolute left-3.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${dotClassName}`}
        aria-hidden
      />
      <input
        id={id}
        type="search"
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(e) => {
          onValueChange?.(e.target.value);
          setFocused(true);
        }}
        onFocus={() => {
          if (!disabled) setFocused(true);
        }}
        placeholder={placeholder}
        autoComplete="off"
        aria-label={ariaLabel || placeholder}
        aria-expanded={showSuggestions}
        className="h-12 w-full rounded-xl border-0 bg-neutral-50 pl-8 pr-9 text-[13px] font-medium text-neutral-900 outline-none ring-1 ring-neutral-200/80 placeholder:text-neutral-400 focus:bg-white focus:ring-2 focus:ring-[#FF6A00]/35 disabled:opacity-60"
      />
      {value && !disabled ? (
        <button
          type="button"
          onClick={() => {
            onValueChange?.("");
            setPredictions([]);
            setFocused(true);
            onClear?.();
          }}
          className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100"
          aria-label="Clear"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}

      {showSuggestions ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-[120] max-h-[240px] overflow-y-auto overscroll-contain rounded-2xl border border-neutral-200/90 bg-white shadow-[0_16px_48px_rgba(15,23,42,0.2)]">
          {isSearching || resolving ? (
            <div className="flex items-center gap-2 px-3.5 py-3 text-xs text-neutral-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#FF6A00]" aria-hidden />
              {resolving ? "Setting location…" : "Searching…"}
            </div>
          ) : null}
          {!isSearching && !resolving
            ? predictions.map((prediction) => (
                <button
                  key={prediction.place_id}
                  type="button"
                  onClick={() => selectPrediction(prediction)}
                  className="flex min-h-[46px] w-full cursor-pointer items-start gap-2.5 border-b border-neutral-100 px-3.5 py-2.5 text-left last:border-b-0 hover:bg-[#FFF8F3]"
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FF6A00]" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-neutral-900">
                      {prediction.structured_formatting?.main_text || prediction.description}
                    </span>
                    {prediction.structured_formatting?.secondary_text ? (
                      <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
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
  );
}
