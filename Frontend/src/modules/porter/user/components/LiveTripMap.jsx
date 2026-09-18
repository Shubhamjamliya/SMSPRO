import React, { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { loadGoogleMaps } from "@/core/services/googleMapsLoader";
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey";

const PORTER_BLUE = "#2F6BFF";

function toLatLng(place) {
  const lat = Number(place?.lat ?? place?.latitude);
  const lng = Number(place?.lng ?? place?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function makePinIcon(g, color) {
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">
        <path d="M18 0C8.6 0 1 7.6 1 17c0 12.4 17 31 17 31s17-18.6 17-31C35 7.6 27.4 0 18 0z" fill="${color}"/>
        <circle cx="18" cy="17" r="7" fill="#fff"/>
      </svg>`,
    )}`,
    scaledSize: new g.Size(32, 42),
    anchor: new g.Point(16, 42),
  };
}

function makeDriverIcon(g) {
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="20" fill="white" stroke="${PORTER_BLUE}" stroke-width="4"/>
        <path d="M22 12l8 16H14l8-16z" fill="${PORTER_BLUE}"/>
      </svg>`,
    )}`,
    scaledSize: new g.Size(40, 40),
    anchor: new g.Point(20, 20),
  };
}

async function waitForHost(ref, cancelled, tries = 20) {
  for (let i = 0; i < tries; i += 1) {
    if (cancelled()) return null;
    if (ref.current) return ref.current;
    await new Promise((r) => setTimeout(r, 50));
  }
  return ref.current;
}

/**
 * Live Porter trip map — pickup, drop, partner position, route.
 */
export default function LiveTripMap({
  pickup,
  drop,
  driverLocation,
  height = 220,
  className = "",
  rounded = "rounded-2xl",
}) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({ pickup: null, drop: null, driver: null });
  const routeRef = useRef(null);
  const iconsRef = useRef(null);
  const fittedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const pickupLL = toLatLng(pickup);
  const dropLL = toLatLng(drop);
  const driverLL = toLatLng(driverLocation);

  useEffect(() => {
    let cancelled = false;
    let resizeObserver = null;

    (async () => {
      try {
        setError("");
        const apiKey = await getGoogleMapsApiKey();
        if (cancelled) return;
        if (!apiKey) {
          setError("Maps unavailable");
          return;
        }

        await loadGoogleMaps(apiKey);
        if (cancelled) return;

        const host = await waitForHost(hostRef, () => cancelled);
        if (cancelled || !host || !window.google?.maps) return;

        const g = window.google.maps;
        const center = pickupLL || dropLL || driverLL || { lat: 28.6139, lng: 77.209 };
        const map = new g.Map(host, {
          center,
          zoom: 14,
          disableDefaultUI: true,
          zoomControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: "greedy",
          styles: [
            { featureType: "poi", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] },
          ],
        });
        mapRef.current = map;
        iconsRef.current = {
          pickup: makePinIcon(g, "#22C55E"),
          drop: makePinIcon(g, PORTER_BLUE),
          driver: makeDriverIcon(g),
        };
        setReady(true);

        window.setTimeout(() => {
          if (cancelled || !mapRef.current) return;
          g.event.trigger(mapRef.current, "resize");
        }, 120);

        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => {
            if (!mapRef.current || !window.google?.maps) return;
            window.google.maps.event.trigger(mapRef.current, "resize");
          });
          resizeObserver.observe(host);
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || "Failed to load map");
      }
    })();

    return () => {
      cancelled = true;
      if (resizeObserver) resizeObserver.disconnect();
      Object.values(markersRef.current).forEach((m) => m?.setMap?.(null));
      markersRef.current = { pickup: null, drop: null, driver: null };
      if (routeRef.current) {
        if (routeRef.current.setMap) routeRef.current.setMap(null);
        routeRef.current = null;
      }
      mapRef.current = null;
      fittedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const g = window.google?.maps;
    const icons = iconsRef.current;
    if (!ready || !map || !g || !icons) return;

    const upsert = (key, position, icon, zIndex = 3) => {
      if (!position) {
        markersRef.current[key]?.setMap(null);
        markersRef.current[key] = null;
        return;
      }
      if (!markersRef.current[key]) {
        markersRef.current[key] = new g.Marker({
          map,
          position,
          icon,
          zIndex,
        });
      } else {
        markersRef.current[key].setPosition(position);
        markersRef.current[key].setMap(map);
      }
    };

    upsert("pickup", pickupLL, icons.pickup, 3);
    upsert("drop", dropLL, icons.drop, 3);
    upsert("driver", driverLL, icons.driver, 5);

    if (pickupLL && dropLL && !routeRef.current) {
      const service = new g.DirectionsService();
      service.route(
        {
          origin: pickupLL,
          destination: dropLL,
          travelMode: g.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === "OK" && result) {
            routeRef.current = new g.DirectionsRenderer({
              map,
              suppressMarkers: true,
              preserveViewport: true,
              polylineOptions: {
                strokeColor: PORTER_BLUE,
                strokeOpacity: 0.85,
                strokeWeight: 5,
              },
            });
            routeRef.current.setDirections(result);
          } else {
            routeRef.current = new g.Polyline({
              path: [pickupLL, dropLL],
              strokeColor: PORTER_BLUE,
              strokeOpacity: 0.7,
              strokeWeight: 4,
              map,
            });
          }
        },
      );
    }

    const bounds = new g.LatLngBounds();
    let has = false;
    [pickupLL, dropLL, driverLL].forEach((p) => {
      if (p) {
        bounds.extend(p);
        has = true;
      }
    });

    if (has && !fittedRef.current) {
      if (pickupLL && dropLL) {
        map.fitBounds(bounds, 56);
      } else {
        map.panTo(pickupLL || dropLL || driverLL);
        map.setZoom(15);
      }
      fittedRef.current = true;
      window.setTimeout(() => {
        if (mapRef.current) g.event.trigger(mapRef.current, "resize");
      }, 80);
    } else if (driverLL) {
      const currentBounds = map.getBounds();
      if (currentBounds && !currentBounds.contains(driverLL)) {
        map.panTo(driverLL);
      }
    }
  }, [
    ready,
    pickupLL?.lat,
    pickupLL?.lng,
    dropLL?.lat,
    dropLL?.lng,
    driverLL?.lat,
    driverLL?.lng,
  ]);

  return (
    <div
      className={`relative overflow-hidden bg-[#E8EEF7] ${rounded} ${className}`}
      style={{ height }}
    >
      <div ref={hostRef} className="absolute inset-0 h-full w-full" />
      {!ready && !error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#E8EEF7]">
          <Loader2 className="h-6 w-6 animate-spin text-[#2F6BFF]" />
        </div>
      ) : null}
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#E8EEF7] px-4 text-center">
          <MapPin className="h-7 w-7 text-[#2F6BFF]" />
          <p className="text-[12px] font-medium text-slate-500">{error}</p>
        </div>
      ) : null}
    </div>
  );
}
