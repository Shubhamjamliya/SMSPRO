import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  ArrowDown,
  Heart,
  Home,
  Loader2,
  Maximize2,
  Search,
  Store,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { loadGoogleMaps } from "@/core/services/googleMapsLoader";
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey";
import { saveBookingDraft, loadBookingDraft } from "@/shared/utils/bookingDraft";
import { useBooking } from "../context/BookingContext";
import { getPorterBookPath, getPorterVehiclePath } from "../utils/routes";

const ACCENT = "#2F6BFF";
const DEFAULT_CENTER = { lat: 22.7196, lng: 75.8577 };
const MIN_QUERY = 2;
const SEARCH_DEBOUNCE_MS = 280;

const SAVE_AS_OPTIONS = [
  { id: "home", label: "Home", Icon: Home },
  { id: "shop", label: "Shop", Icon: Store },
  { id: "other", label: "Other", Icon: Heart },
];

function toLatLng(loc) {
  if (!loc) return null;
  const lat = Number(loc.lat ?? loc.latitude);
  const lng = Number(loc.lng ?? loc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function titleFromAddress(formatted = "") {
  const parts = String(formatted)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return parts[0] || "Selected location";
}

export default function DropLocation() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo || getPorterVehiclePath();
  const { pickup, delivery, setDelivery } = useBooking();

  const mapHostRef = useRef(null);
  const mapRef = useRef(null);
  const geocoderRef = useRef(null);
  const autocompleteRef = useRef(null);
  const placesServiceRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const programmaticRef = useRef(false);
  const geocodeReqRef = useRef(0);
  const latestSearchRef = useRef(0);
  const searchTimerRef = useRef(null);

  const initial = toLatLng(delivery) || DEFAULT_CENTER;

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [coords, setCoords] = useState(initial);
  const [placeTitle, setPlaceTitle] = useState(delivery?.title || "Current location");
  const [placeAddress, setPlaceAddress] = useState(delivery?.address || "");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [addressDetails, setAddressDetails] = useState(delivery?.addressDetails || "");
  const [receiverName, setReceiverName] = useState(delivery?.receiverName || "");
  const [receiverPhone, setReceiverPhone] = useState(delivery?.receiverPhone || "");
  const [sameAsSender, setSameAsSender] = useState(false);
  const [saveAs, setSaveAs] = useState(delivery?.saveAs || "home");

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [predictions, setPredictions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

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
    if (!geocoderRef.current || !pos) return;
    const reqId = ++geocodeReqRef.current;
    setIsGeocoding(true);
    try {
      const result = await new Promise((resolve) => {
        geocoderRef.current.geocode({ location: pos }, (results, status) => {
          if (status === "OK" && results?.[0]) resolve(results[0]);
          else resolve(null);
        });
      });
      if (reqId !== geocodeReqRef.current) return;
      if (result) {
        const formatted = result.formatted_address || "";
        setPlaceAddress(formatted);
        setPlaceTitle(titleFromAddress(formatted));
      }
    } finally {
      if (reqId === geocodeReqRef.current) setIsGeocoding(false);
    }
  }, []);

  const panTo = useCallback((pos, zoom = 16) => {
    if (!mapRef.current || !pos) return;
    programmaticRef.current = true;
    mapRef.current.panTo(pos);
    if (zoom) mapRef.current.setZoom(zoom);
    setCoords(pos);
    setTimeout(() => {
      programmaticRef.current = false;
    }, 350);
  }, []);

  const initMap = useCallback(async () => {
    try {
      setMapError("");
      const apiKey = await getGoogleMapsApiKey();
      if (!apiKey) {
        setMapError("Maps unavailable");
        return;
      }
      await loadGoogleMaps(apiKey);
      if (!mapHostRef.current || !window.google?.maps) {
        setMapError("Maps unavailable");
        return;
      }

      const center = toLatLng(delivery) || DEFAULT_CENTER;
      const map = new window.google.maps.Map(mapHostRef.current, {
        center,
        zoom: 16,
        disableDefaultUI: true,
        zoomControl: false,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        clickableIcons: false,
        gestureHandling: "greedy",
      });
      mapRef.current = map;
      geocoderRef.current = new window.google.maps.Geocoder();

      if (window.google.maps.places) {
        autocompleteRef.current = new window.google.maps.places.AutocompleteService();
        placesServiceRef.current = new window.google.maps.places.PlacesService(map);
      }

      map.addListener("idle", () => {
        if (programmaticRef.current) return;
        const c = map.getCenter();
        if (!c) return;
        const next = { lat: c.lat(), lng: c.lng() };
        setCoords(next);
        reverseGeocode(next);
      });

      setMapReady(true);
      setCoords(center);
      if (!delivery?.address) {
        reverseGeocode(center);
      }

      if (navigator.geolocation && !toLatLng(delivery)) {
        setIsLocating(true);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const next = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            };
            panTo(next, 17);
            reverseGeocode(next);
            setIsLocating(false);
          },
          () => setIsLocating(false),
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
        );
      }
    } catch {
      setMapError("Failed to load map");
    }
  }, [panTo, delivery, reverseGeocode]);

  useEffect(() => {
    initMap();
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [initMap]);

  const runSearch = useCallback(
    (query) => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      const q = String(query || "").trim();
      if (q.length < MIN_QUERY || !autocompleteRef.current) {
        setPredictions([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      searchTimerRef.current = setTimeout(() => {
        const reqId = ++latestSearchRef.current;
        autocompleteRef.current.getPlacePredictions(
          {
            input: q,
            sessionToken: getSessionToken(),
            componentRestrictions: { country: "in" },
          },
          (results, status) => {
            if (reqId !== latestSearchRef.current) return;
            setIsSearching(false);
            if (status !== window.google.maps.places.PlacesServiceStatus.OK || !results) {
              setPredictions([]);
              return;
            }
            setPredictions(results);
          },
        );
      }, SEARCH_DEBOUNCE_MS);
    },
    [getSessionToken],
  );

  const selectPrediction = (prediction) => {
    if (!placesServiceRef.current || !prediction?.place_id) return;
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
          toast.error("Could not open that location");
          return;
        }
        const next = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        };
        const formatted = place.formatted_address || prediction.description || "";
        setPlaceAddress(formatted);
        setPlaceTitle(place.name || titleFromAddress(formatted));
        panTo(next, 17);
        setSearchOpen(false);
        setSearchQuery("");
        setPredictions([]);
      },
    );
  };

  const recenter = () => {
    if (!navigator.geolocation) {
      toast.error("Location not available");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        panTo(next, 17);
        reverseGeocode(next);
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
        toast.error("Unable to get current location");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };

  const applySenderDetails = () => {
    const name = String(pickup?.senderName || "").trim();
    const phone = String(pickup?.senderPhone || "").trim();
    if (!name && !phone) {
      toast.error("Add sender details on pickup first");
      return false;
    }
    setReceiverName(name);
    setReceiverPhone(phone);
    return true;
  };

  const toggleSameAsSender = () => {
    if (sameAsSender) {
      setSameAsSender(false);
      return;
    }
    if (applySenderDetails()) setSameAsSender(true);
  };

  const handleConfirm = () => {
    if (!placeAddress && !coords) {
      toast.error("Select a delivery location on the map");
      return;
    }
    const finalName = sameAsSender
      ? String(pickup?.senderName || "").trim()
      : receiverName.trim();
    const finalPhone = sameAsSender
      ? String(pickup?.senderPhone || "").trim()
      : String(receiverPhone || "").trim();

    setConfirming(true);
    const nextDrop = {
      title: placeTitle || titleFromAddress(placeAddress),
      address: placeAddress || `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
      lat: coords.lat,
      lng: coords.lng,
      addressDetails: addressDetails.trim(),
      receiverName: finalName,
      receiverPhone: finalPhone,
      saveAs,
    };
    setDelivery(nextDrop);
    const draft = loadBookingDraft("porter") || {};
    saveBookingDraft("porter", { ...draft, delivery: nextDrop });
    toast.success("Drop location saved");
    navigate(returnTo, { replace: true });
  };

  return (
    <div className="relative flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-[#F4F7FC]">
      {/* Map */}
      <div className="relative h-[42%] min-h-[240px] shrink-0">
        <div ref={mapHostRef} className="absolute inset-0 bg-[#E8EEF7]" />

        {!mapReady && !mapError ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#E8EEF7]/90">
            <Loader2 className="h-7 w-7 animate-spin text-[#2F6BFF]" />
          </div>
        ) : null}

        {mapError ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#E8EEF7] px-6 text-center">
            <p className="text-sm font-medium text-slate-600">{mapError}</p>
          </div>
        ) : null}

        {/* Back */}
        <button
          type="button"
          onClick={() => navigate(location.state?.returnTo || getPorterBookPath())}
          className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-[0_6px_20px_rgba(15,23,42,0.14)]"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5 text-slate-800" strokeWidth={2.2} />
        </button>

        {/* Fixed center pin + tooltip */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-[88%]">
          <div className="mb-2 whitespace-nowrap rounded-lg bg-[#0F172A] px-3 py-2 text-[12px] font-semibold text-white shadow-lg">
            Your goods will be dropped here
            <span className="absolute left-1/2 top-full -translate-x-1/2 border-x-[6px] border-t-[7px] border-x-transparent border-t-[#0F172A]" />
          </div>
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#EF4444] shadow-[0_8px_20px_rgba(239,68,68,0.45)] ring-4 ring-white">
            <ArrowDown className="h-5 w-5 text-white" strokeWidth={2.8} />
          </div>
        </div>

        {/* Recenter */}
        <button
          type="button"
          onClick={recenter}
          disabled={isLocating}
          className="absolute bottom-4 right-3 z-20 flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-[0_6px_18px_rgba(15,23,42,0.12)] disabled:opacity-60"
          aria-label="Use current location"
        >
          {isLocating ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-600" />
          ) : (
            <Maximize2 className="h-4 w-4 text-slate-700" strokeWidth={2.2} />
          )}
        </button>
      </div>

      {/* Bottom sheet */}
      <div className="relative z-30 -mt-4 flex min-h-0 flex-1 flex-col rounded-t-[22px] bg-white shadow-[0_-10px_40px_rgba(15,23,42,0.08)]">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-4">
          {/* Selected location */}
          <div className="flex items-center gap-3 rounded-2xl border border-[#E8EEF7] bg-white p-3 shadow-sm">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EF4444] shadow-[0_4px_12px_rgba(239,68,68,0.3)]">
              <ArrowDown className="h-5 w-5 text-white" strokeWidth={2.6} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold text-[#0F172A]">
                {isGeocoding ? "Updating location…" : placeTitle}
              </p>
              <p className="truncate text-[12px] text-[#6B7280]">
                {placeAddress || "Move the map to choose delivery"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="shrink-0 rounded-xl border border-[#2F6BFF] px-3 py-1.5 text-[12px] font-bold text-[#2F6BFF]"
            >
              Change
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <input
              value={addressDetails}
              onChange={(e) => setAddressDetails(e.target.value)}
              placeholder="House / Apartment / Shop (optional)"
              className="h-12 w-full rounded-xl border-0 bg-[#F3F5F8] px-3.5 text-[14px] text-[#0F172A] outline-none placeholder:text-[#9AA3B2] focus:ring-2 focus:ring-[#2F6BFF]/20"
            />

            <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-[#F3F5F8] px-3.5 py-3">
              <input
                type="checkbox"
                checked={sameAsSender}
                onChange={toggleSameAsSender}
                className="h-4 w-4 shrink-0 rounded border-[#CBD5E1] text-[#2F6BFF] accent-[#2F6BFF]"
              />
              <span className="text-[13px] font-semibold text-[#0F172A]">
                Same as sender details
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#6B7280]">
                Receiver&apos;s Name
              </span>
              <div className="relative">
                <input
                  value={receiverName}
                  onChange={(e) => {
                    setSameAsSender(false);
                    setReceiverName(e.target.value);
                  }}
                  disabled={sameAsSender}
                  placeholder="Enter receiver name"
                  className="h-12 w-full rounded-xl border-0 bg-[#F3F5F8] px-3.5 pr-11 text-[14px] font-medium text-[#0F172A] outline-none placeholder:text-[#9AA3B2] focus:ring-2 focus:ring-[#2F6BFF]/20 disabled:opacity-60"
                />
                <UserRound className="pointer-events-none absolute right-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[#2F6BFF]" size={18} />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-[#6B7280]">
                Receiver&apos;s Mobile number
              </span>
              <input
                value={receiverPhone}
                onChange={(e) => {
                  setSameAsSender(false);
                  setReceiverPhone(e.target.value.replace(/[^\d+]/g, "").slice(0, 13));
                }}
                disabled={sameAsSender}
                inputMode="tel"
                placeholder="Enter mobile number"
                className="h-12 w-full rounded-xl border-0 bg-[#F3F5F8] px-3.5 text-[14px] font-medium text-[#0F172A] outline-none placeholder:text-[#9AA3B2] focus:ring-2 focus:ring-[#2F6BFF]/20 disabled:opacity-60"
              />
            </label>

            <div>
              <p className="mb-2 text-[12px] font-semibold text-[#6B7280]">
                Save as (optional):
              </p>
              <div className="flex flex-wrap gap-2">
                {SAVE_AS_OPTIONS.map(({ id, label, Icon }) => {
                  const active = saveAs === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSaveAs(id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12px] font-semibold transition ${
                        active
                          ? "border-[#2F6BFF]/30 bg-[#EEF3FF] text-[#2F6BFF]"
                          : "border-[#E5E7EB] bg-white text-[#6B7280]"
                      }`}
                    >
                      <Icon size={14} strokeWidth={2.2} />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-[#F1F5F9] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirming || (!placeAddress && !coords)}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-[#2F6BFF] text-[15px] font-bold text-white shadow-[0_10px_24px_rgba(47,107,255,0.35)] transition active:scale-[0.99] disabled:opacity-60"
            style={{ backgroundColor: ACCENT }}
          >
            {confirming ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              "Confirm and Proceed"
            )}
          </button>
        </div>
      </div>

      {/* Search overlay */}
      {searchOpen ? (
        <div className="absolute inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center gap-2 border-b border-[#E8EEF7] px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={() => {
                setSearchOpen(false);
                setSearchQuery("");
                setPredictions([]);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F5F8]"
              aria-label="Close search"
            >
              <X className="h-5 w-5 text-slate-700" />
            </button>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  runSearch(e.target.value);
                }}
                placeholder="Search delivery location"
                className="h-11 w-full rounded-xl border-0 bg-[#F3F5F8] pl-10 pr-3 text-[14px] font-medium outline-none focus:ring-2 focus:ring-[#2F6BFF]/25"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2">
            {isSearching ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-[#2F6BFF]" />
              </div>
            ) : predictions.length === 0 ? (
              <p className="px-2 py-8 text-center text-[13px] text-slate-500">
                {searchQuery.trim().length < MIN_QUERY
                  ? "Type at least 2 characters to search"
                  : "No matching places"}
              </p>
            ) : (
              <ul className="space-y-1">
                {predictions.map((p) => (
                  <li key={p.place_id}>
                    <button
                      type="button"
                      onClick={() => selectPrediction(p)}
                      className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left hover:bg-[#F4F7FC]"
                    >
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF3FF] text-[#2F6BFF]">
                        <Search size={15} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-semibold text-[#0F172A]">
                          {p.structured_formatting?.main_text || p.description}
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] text-[#6B7280]">
                          {p.structured_formatting?.secondary_text || p.description}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
