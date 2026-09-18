import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Loader2,
  MapPin,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { loadGoogleMaps } from "@/core/services/googleMapsLoader";
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey";
import { saveBookingDraft, loadBookingDraft } from "@/shared/utils/bookingDraft";
import { useBooking } from "../context/BookingContext";
import {
  getPorterDropPath,
  getPorterHomePath,
  getPorterPickupPath,
  getPorterBookPath,
  getPorterVehiclePath,
} from "../utils/routes";

const MIN_QUERY = 2;
const SEARCH_DEBOUNCE_MS = 280;

function titleFromAddress(formatted = "") {
  const parts = String(formatted)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return parts[0] || "Selected location";
}

export default function BookDelivery() {
  const navigate = useNavigate();
  const { pickup, setPickup, delivery, setDelivery } = useBooking();

  const autocompleteRef = useRef(null);
  const placesServiceRef = useRef(null);
  const placesHostRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const searchTimerRef = useRef(null);
  const latestSearchRef = useRef(0);
  const pickupInputRef = useRef(null);
  const dropInputRef = useRef(null);

  const [pickupQuery, setPickupQuery] = useState(
    pickup?.title || pickup?.address || "",
  );
  const [dropQuery, setDropQuery] = useState(
    delivery?.title || delivery?.address || "",
  );
  const [focusedField, setFocusedField] = useState("drop");
  const [predictions, setPredictions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [resolvingPlace, setResolvingPlace] = useState(false);
  const [placesReady, setPlacesReady] = useState(false);

  const dropReady = delivery?.lat != null;
  const pickupReady = pickup?.lat != null;

  useEffect(() => {
    setPickupQuery(pickup?.title || pickup?.address || "");
  }, [pickup?.title, pickup?.address]);

  useEffect(() => {
    setDropQuery(delivery?.title || delivery?.address || "");
  }, [delivery?.title, delivery?.address]);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const apiKey = await getGoogleMapsApiKey();
        if (!apiKey) return;
        await loadGoogleMaps(apiKey);
        if (cancelled || !window.google?.maps?.places) return;
        autocompleteRef.current =
          new window.google.maps.places.AutocompleteService();
        const host = placesHostRef.current || document.createElement("div");
        placesServiceRef.current = new window.google.maps.places.PlacesService(
          host,
        );
        setPlacesReady(true);
      } catch {
        /* search stays disabled; map page still works */
      }
    })();
    return () => {
      cancelled = true;
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

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
            if (
              status !== window.google.maps.places.PlacesServiceStatus.OK ||
              !results
            ) {
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

  const persistPlace = useCallback(
    (field, place) => {
      const draft = loadBookingDraft("porter") || {};
      if (field === "pickup") {
        const nextPickup = {
          ...(pickup || {}),
          title: place.title,
          address: place.address,
          lat: place.lat,
          lng: place.lng,
        };
        setPickup(nextPickup);
        saveBookingDraft("porter", { ...draft, pickup: nextPickup });
        return;
      }
      const nextDrop = {
        ...(delivery || {}),
        title: place.title,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
      };
      setDelivery(nextDrop);
      saveBookingDraft("porter", { ...draft, delivery: nextDrop });
    },
    [pickup, delivery, setPickup, setDelivery],
  );

  const selectPrediction = (prediction) => {
    if (!placesServiceRef.current || !prediction?.place_id) return;
    setResolvingPlace(true);
    placesServiceRef.current.getDetails(
      {
        placeId: prediction.place_id,
        fields: ["geometry", "formatted_address", "name"],
        sessionToken: getSessionToken(),
      },
      (place, status) => {
        sessionTokenRef.current = null;
        setResolvingPlace(false);
        if (
          status !== window.google.maps.places.PlacesServiceStatus.OK ||
          !place?.geometry?.location
        ) {
          toast.error("Could not open that location");
          return;
        }
        const formatted = place.formatted_address || prediction.description || "";
        const next = {
          title: place.name || titleFromAddress(formatted),
          address: formatted,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        };
        persistPlace(focusedField, next);
        if (focusedField === "pickup") setPickupQuery(next.title);
        else setDropQuery(next.title);
        setPredictions([]);
      },
    );
  };

  const openDropMap = () =>
    navigate(getPorterDropPath(), { state: { returnTo: getPorterBookPath() } });
  const openPickupMap = () =>
    navigate(getPorterPickupPath(), { state: { returnTo: getPorterBookPath() } });

  const goNext = () => {
    if (dropReady && pickupReady) {
      navigate(getPorterVehiclePath());
      return;
    }
    if (!pickupReady) {
      openPickupMap();
      return;
    }
    // Keep existing CTA path: pin drop then continue to vehicles.
    navigate(getPorterDropPath());
  };

  const showSuggestions =
    focusedField &&
    (isSearching || predictions.length > 0 || resolvingPlace);

  return (
    <div className="min-h-[100dvh] bg-[#F7F8FA]">
      <div ref={placesHostRef} className="hidden" aria-hidden />
      <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mb-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(getPorterHomePath())}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#0F172A] shadow-sm ring-1 ring-black/[0.04] transition active:scale-95"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2.2} />
          </button>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2F6BFF]">
              Porter
            </p>
            <h1 className="text-[20px] font-bold tracking-tight text-[#0F172A]">
              Set route
            </h1>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/[0.04]">
          {/* Pickup search */}
          <div
            className={`flex items-center gap-3 rounded-xl px-2 py-2 ${
              focusedField === "pickup" ? "bg-[#F4F7FC]" : ""
            }`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#22C55E]">
              <ArrowUp className="h-4 w-4 text-white" strokeWidth={2.6} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-[#64748B]">Pickup</p>
              <input
                ref={pickupInputRef}
                value={pickupQuery}
                onChange={(e) => {
                  setPickupQuery(e.target.value);
                  setFocusedField("pickup");
                  runSearch(e.target.value);
                }}
                onFocus={() => {
                  setFocusedField("pickup");
                  if (pickupQuery.trim().length >= MIN_QUERY) runSearch(pickupQuery);
                }}
                placeholder="Search pickup location"
                className="mt-0.5 w-full bg-transparent text-[15px] font-semibold text-[#0F172A] outline-none placeholder:font-medium placeholder:text-[#94A3B8]"
              />
            </div>
            {pickupQuery ? (
              <button
                type="button"
                onClick={() => {
                  setPickupQuery("");
                  setPredictions([]);
                  pickupInputRef.current?.focus();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#94A3B8]"
                aria-label="Clear pickup"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="mx-6 border-b border-[#F1F5F9]" />

          {/* Drop search */}
          <div
            className={`mt-1 flex items-center gap-3 rounded-xl px-2 py-2 ${
              focusedField === "drop" ? "bg-[#F4F7FC]" : ""
            }`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EF4444]">
              <ArrowDown className="h-4 w-4 text-white" strokeWidth={2.6} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-[#64748B]">Drop</p>
              <input
                ref={dropInputRef}
                value={dropQuery}
                onChange={(e) => {
                  setDropQuery(e.target.value);
                  setFocusedField("drop");
                  runSearch(e.target.value);
                }}
                onFocus={() => {
                  setFocusedField("drop");
                  if (dropQuery.trim().length >= MIN_QUERY) runSearch(dropQuery);
                }}
                placeholder="Search drop location"
                className="mt-0.5 w-full bg-transparent text-[15px] font-semibold text-[#0F172A] outline-none placeholder:font-medium placeholder:text-[#94A3B8]"
              />
            </div>
            {dropQuery ? (
              <button
                type="button"
                onClick={() => {
                  setDropQuery("");
                  setPredictions([]);
                  dropInputRef.current?.focus();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#94A3B8]"
                aria-label="Clear drop"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={openDropMap}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-[13px] font-semibold text-[#2F6BFF] shadow-sm ring-1 ring-black/[0.04] transition active:opacity-80"
        >
          <MapPin className="h-4 w-4" strokeWidth={2.3} />
          Select drop on map
        </button>

        <p className="mt-2 px-1 text-[11px] leading-relaxed text-[#94A3B8]">
          Search both locations here, or pin the drop point on the map.
          {!placesReady ? " Map pin still works if search is loading." : ""}
        </p>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {showSuggestions ? (
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
              {isSearching || resolvingPlace ? (
                <div className="flex items-center justify-center gap-2 px-4 py-8 text-[13px] text-[#64748B]">
                  <Loader2 className="h-4 w-4 animate-spin text-[#2F6BFF]" />
                  {resolvingPlace ? "Setting location…" : "Searching places…"}
                </div>
              ) : (
                <ul>
                  {predictions.map((p) => (
                    <li key={p.place_id}>
                      <button
                        type="button"
                        onClick={() => selectPrediction(p)}
                        className="flex w-full items-start gap-3 border-b border-[#F1F5F9] px-3.5 py-3 text-left last:border-b-0 hover:bg-[#F8FAFC]"
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
          ) : null}
        </div>

        <button
          type="button"
          onClick={goNext}
          className="mt-4 flex w-full items-center justify-center rounded-xl bg-[#2F6BFF] px-4 py-3.5 text-[15px] font-semibold text-white transition active:scale-[0.99]"
        >
          {dropReady && pickupReady ? "Continue to vehicles" : "Add drop location"}
        </button>
      </div>
    </div>
  );
}
