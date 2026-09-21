import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey";
import { loadGoogleMaps } from "@core/services/googleMapsLoader";

/**
 * Where the site is: search-as-you-type suggestions, plus a map pin the customer can tap or drag.
 *
 * A typed address is only ever a guess; contractors travel to a plot, so the pin is what makes it
 * exact. Choosing a suggestion, tapping the map, dragging the pin or pressing "Use my current
 * location" all end the same way — the place is reverse-geocoded and reported through `onPick`
 * as `{ address, lat, lng, city, area, state, pincode }`, which the form uses to fill the city,
 * locality and pincode fields (still editable, since Google can be wrong about a locality).
 *
 * If the map cannot load (no key, blocked, offline) it says so and calls `onAvailability(false)`,
 * so the form can fall back to typing the address rather than stopping the booking.
 */

const DEFAULT_CENTER = { lat: 22.7196, lng: 75.8577 }; // Indore, until we know better
const PIN_ZOOM = 17;

/** Google's address components, boiled down to the fields the booking stores. */
function parseComponents(components = []) {
  const pick = (...types) => {
    for (const type of types) {
      const hit = components.find((c) => c.types.includes(type));
      if (hit) return hit.long_name;
    }
    return "";
  };
  return {
    city: pick("locality", "administrative_area_level_3", "administrative_area_level_2"),
    area: pick("sublocality_level_1", "sublocality", "neighborhood"),
    state: pick("administrative_area_level_1"),
    pincode: pick("postal_code"),
  };
}

export default function SiteLocationPicker({ value, onPick, onAvailability, disabled = false }) {
  const mapElRef = useRef(null);
  const inputRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const geocoderRef = useRef(null);
  const onPickRef = useRef(onPick);
  const valueRef = useRef(value);

  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [errorText, setErrorText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const setInputText = (text) => {
    if (inputRef.current) inputRef.current.value = text || "";
  };

  /** Move the pin, centre the map on it, and (unless the address is already known) look the address up. */
  const placeAt = useCallback(async (lat, lng, known = null) => {
    const google = window.google;
    const map = mapRef.current;
    if (!google?.maps || !map) return;

    const position = { lat, lng };
    if (markerRef.current) {
      markerRef.current.setPosition(position);
    } else {
      const marker = new google.maps.Marker({
        map,
        position,
        draggable: true,
        animation: google.maps.Animation.DROP,
        title: "Drag to the exact spot",
      });
      marker.addListener("dragend", () => {
        const at = marker.getPosition();
        if (at) placeAt(at.lat(), at.lng());
      });
      markerRef.current = marker;
    }
    map.panTo(position);
    if ((map.getZoom() || 0) < 16) map.setZoom(PIN_ZOOM);

    let place = known;
    if (!place) {
      setBusy(true);
      place = await new Promise((resolve) => {
        geocoderRef.current?.geocode({ location: position }, (results, geoStatus) => {
          if (geoStatus === "OK" && results?.[0]) {
            resolve({ address: results[0].formatted_address, ...parseComponents(results[0].address_components) });
          } else {
            resolve({ address: "", city: "", area: "", state: "", pincode: "" });
          }
        });
      });
      setBusy(false);
    }

    setInputText(place.address);
    onPickRef.current?.({ ...place, lat, lng });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const apiKey = await getGoogleMapsApiKey();
        if (!apiKey) throw new Error("The map is not set up on this app.");
        await loadGoogleMaps(apiKey);
        if (cancelled || !mapElRef.current || !window.google?.maps) return;

        const google = window.google;
        const start = valueRef.current;
        const hasStart = Number.isFinite(Number(start?.lat)) && Number.isFinite(Number(start?.lng));

        const map = new google.maps.Map(mapElRef.current, {
          center: hasStart ? { lat: Number(start.lat), lng: Number(start.lng) } : DEFAULT_CENTER,
          zoom: hasStart ? PIN_ZOOM : 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: "greedy",
        });
        mapRef.current = map;
        geocoderRef.current = new google.maps.Geocoder();

        map.addListener("click", (event) => {
          if (event.latLng) placeAt(event.latLng.lat(), event.latLng.lng());
        });

        if (inputRef.current && google.maps.places?.Autocomplete) {
          const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
            fields: ["formatted_address", "geometry", "name", "address_components"],
            componentRestrictions: { country: "in" },
          });
          autocomplete.bindTo("bounds", map);
          autocomplete.addListener("place_changed", () => {
            const place = autocomplete.getPlace();
            const location = place?.geometry?.location;
            if (!location) {
              toast.error("Pick one of the suggestions, or tap the map.");
              return;
            }
            // A named place ("Treasure Island Mall") reads better with its name in front of the address.
            const address = place.formatted_address || place.name || "";
            placeAt(location.lat(), location.lng(), {
              address: place.name && !address.startsWith(place.name) ? `${place.name}, ${address}` : address,
              ...parseComponents(place.address_components || []),
            });
          });
        }

        if (hasStart) {
          placeAt(Number(start.lat), Number(start.lng), {
            address: start.address || "",
            city: "", area: "", state: "", pincode: "",
          }).then(() => setInputText(start.address || ""));
        }

        setStatus("ready");
        onAvailability?.(true);
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        setErrorText(error?.message || "The map could not be loaded.");
        onAvailability?.(false);
      }
    };
    init();

    return () => {
      cancelled = true;
      if (window.google?.maps?.event) {
        if (mapRef.current) window.google.maps.event.clearInstanceListeners(mapRef.current);
        if (markerRef.current) window.google.maps.event.clearInstanceListeners(markerRef.current);
      }
      if (markerRef.current) markerRef.current.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
    };
    // The map is created once; later value changes are read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error("This device cannot share its location. Search for the address instead.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        placeAt(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setBusy(false);
        toast.error("We could not get your location. Allow location access, or search for the address.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const hasPin = Number.isFinite(Number(value?.lat)) && Number.isFinite(Number(value?.lng));

  if (status === "error") {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
        The map is not available right now ({errorText}). Type the full site address below instead — our team will
        confirm the exact spot with you.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div>
        <input
          ref={inputRef}
          type="text"
          defaultValue={value?.address || ""}
          disabled={disabled || status === "loading"}
          autoComplete="off"
          placeholder={status === "loading" ? "Loading the map…" : "Search the site address, area or landmark"}
          aria-label="Search the site address"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <p className="mt-1 text-xs text-gray-500">
          Choose a suggestion, then tap the map or drag the pin onto the exact plot.
        </p>
      </div>

      <div className="relative overflow-hidden rounded-md border border-gray-300 bg-gray-100">
        <div ref={mapElRef} className="h-64 w-full sm:h-72" />
        {status === "loading" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-sm text-gray-500">
            Loading the map…
          </div>
        ) : null}
        {busy ? (
          <div className="pointer-events-none absolute left-2 top-2 rounded bg-white/95 px-2 py-1 text-xs font-medium text-gray-700 shadow">
            Finding the address…
          </div>
        ) : null}
        <button
          type="button"
          onClick={useMyLocation}
          disabled={disabled || status !== "ready" || busy}
          className="absolute bottom-2 left-2 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 shadow ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
        >
          Use my current location
        </button>
      </div>

      <div
        className={`rounded-md border px-3 py-2.5 text-sm ${
          hasPin ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-gray-200 bg-gray-50 text-gray-500"
        }`}
      >
        {hasPin ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Pinned location</p>
            <p className="mt-0.5">{value?.address || "Address not found — the pin is saved, add details below."}</p>
          </>
        ) : (
          "No location pinned yet."
        )}
      </div>
    </div>
  );
}
