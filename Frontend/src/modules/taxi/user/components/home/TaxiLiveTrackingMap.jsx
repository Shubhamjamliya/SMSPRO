import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Crosshair, Loader2, Minus, Plus, Route } from "lucide-react";
import { loadGoogleMaps } from "@core/services/googleMapsLoader";
import { getGoogleMapsApiKey } from "@food/utils/googleMapsApiKey";
import { getOrderSocket } from "@core/services/orderSocket";
import { isTaxiUserLoggedIn } from "../../utils/authUser";
import "./taxiMapClean.css";

const PRE_ASSIGN_STATUSES = new Set(["", "pending", "requested", "searching"]);
const POST_ASSIGN_STATUSES = new Set([
  "assigned",
  "arriving",
  "arrived",
  "in_progress",
  "awaiting_payment",
  "completed",
  "cancelled",
]);

function toLatLng(point) {
  if (!point) return null;
  const lat = Number(
    point.lat ?? point.latitude ?? point?.location?.lat ?? point?.coordinates?.[1],
  );
  const lng = Number(
    point.lng ?? point.longitude ?? point?.location?.lng ?? point?.coordinates?.[0],
  );
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function isPreAssign(ride, forcePreview) {
  if (forcePreview) return true;
  const status = String(ride?.status || "").toLowerCase();
  if (POST_ASSIGN_STATUSES.has(status)) return false;
  if (PRE_ASSIGN_STATUSES.has(status)) return true;
  // No driver yet → always preview (dotted arc), never road polyline
  if (!ride?.driver && !ride?.driverId && !ride?.driver?._id) return true;
  return false;
}

/**
 * Compass bearing from → to (degrees, 0 = north, clockwise).
 */
function bearingDegrees(from, to) {
  const φ1 = (from.lat * Math.PI) / 180;
  const φ2 = (to.lat * Math.PI) / 180;
  const Δλ = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Smooth circular arc (rainbow shape) in local meters — not road geometry.
 * Bulges toward map "up" when mapHeadingDeg is set (after horizontal align).
 */
function buildArcPath(from, to, mapHeadingDeg = null, samples = 80) {
  if (!from || !to) return [];

  const midLat = (from.lat + to.lat) / 2;
  const mLat = 111320;
  const mLng = 111320 * Math.cos((midLat * Math.PI) / 180) || 1;

  // Local ENU meters relative to `from` (east = x, north = y)
  const x2 = (to.lng - from.lng) * mLng;
  const y2 = (to.lat - from.lat) * mLat;
  const chord = Math.hypot(x2, y2) || 1;
  const ux = x2 / chord;
  const uy = y2 / chord;

  // Perpendicular (left of travel)
  let px = -uy;
  let py = ux;

  if (mapHeadingDeg != null && Number.isFinite(mapHeadingDeg)) {
    // Screen-up in ENU when map heading is H
    const h = (mapHeadingDeg * Math.PI) / 180;
    const upE = Math.sin(h);
    const upN = Math.cos(h);
    if (px * upE + py * upN < 0) {
      px = -px;
      py = -py;
    }
  } else if (py < 0) {
    px = -px;
    py = -py;
  }

  // Arc height ≈ 28% of chord → clean rainbow curve
  const height = chord * 0.28;
  const R = (chord * chord) / (8 * height) + height / 2;
  const midX = x2 / 2;
  const midY = y2 / 2;
  const cx = midX - px * (R - height);
  const cy = midY - py * (R - height);

  const startAng = Math.atan2(0 - cy, 0 - cx);
  let endAng = Math.atan2(y2 - cy, x2 - cx);
  const apexAng = Math.atan2(midY + py * height - cy, midX + px * height - cx);

  let sweep = endAng - startAng;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -Math.PI) sweep += 2 * Math.PI;

  let apexRel = apexAng - startAng;
  while (apexRel > Math.PI) apexRel -= 2 * Math.PI;
  while (apexRel < -Math.PI) apexRel += 2 * Math.PI;
  if (Math.sign(apexRel) !== Math.sign(sweep) && Math.abs(sweep) > 1e-6) {
    sweep += sweep > 0 ? -2 * Math.PI : 2 * Math.PI;
  }

  const path = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const ang = startAng + sweep * t;
    const lx = cx + R * Math.cos(ang);
    const ly = cy + R * Math.sin(ang);
    path.push({
      lat: from.lat + ly / mLat,
      lng: from.lng + lx / mLng,
    });
  }
  return path;
}

/** Heading so pickup→drop reads left→right (horizontal) on screen. */
function horizontalHeading(from, to) {
  return (bearingDegrees(from, to) - 90 + 360) % 360;
}

function pinSvgIcon(fill, { pulse = false, size = 52, letter = "" } = {}) {
  const pulseRing = pulse
    ? `<circle cx="24" cy="20" r="16" fill="${fill}" fill-opacity="0.2">
         <animate attributeName="r" values="12;18;12" dur="1.8s" repeatCount="indefinite"/>
         <animate attributeName="fill-opacity" values="0.28;0.06;0.28" dur="1.8s" repeatCount="indefinite"/>
       </circle>`
    : "";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 56">
      <defs>
        <filter id="s" x="-30%" y="-10%" width="160%" height="150%">
          <feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-color="#000" flood-opacity="0.28"/>
        </filter>
      </defs>
      ${pulseRing}
      <path filter="url(#s)" fill="${fill}" d="M24 2C14.06 2 6 10.06 6 20c0 12.5 18 32 18 32s18-19.5 18-32C42 10.06 33.94 2 24 2z"/>
      <circle cx="24" cy="20" r="9" fill="#fff"/>
      ${
        letter
          ? `<text x="24" y="24.5" text-anchor="middle" font-size="12" font-weight="800" font-family="system-ui,Segoe UI,sans-serif" fill="${fill}">${letter}</text>`
          : `<circle cx="24" cy="20" r="3.8" fill="${fill}"/>`
      }
    </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: { width: size, height: size },
    // Anchor at pin tip
    anchor: { x: size / 2, y: size - 2 },
  };
}

function clearPolylines(listRef) {
  (listRef.current || []).forEach((line) => {
    try {
      line.setMap(null);
    } catch {
      /* ignore */
    }
  });
  listRef.current = [];
}

/**
 * Live map for rider tracking: pickup, drop, driver marker + route.
 * Awaiting driver → black dotted arc (not road) + highlighted pins.
 * After accept → sharp dark black road polyline.
 */
export default function TaxiLiveTrackingMap({
  ride = null,
  driverLocation = null,
  className = "",
  onMetrics = null,
  bottomPaddingRatio = 0.12,
  showControls = true,
  controlsPlacement = "bottom-right",
  /** Force black dotted arc (vehicles / finding) — never road polyline */
  previewRoute = false,
  /** Disable pan/zoom gestures (vehicle list scroll shouldn't move the map) */
  lockMapGestures = false,
}) {
  const mapHostRef = useRef(null);
  const mapRef = useRef(null);
  const driverMarkerRef = useRef(null);
  const pickupMarkerRef = useRef(null);
  const dropMarkerRef = useRef(null);
  const routeLinesRef = useRef([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const pickup = useMemo(() => toLatLng(ride?.pickup), [ride?.pickup]);
  const drop = useMemo(() => toLatLng(ride?.drop), [ride?.drop]);
  const driver = useMemo(() => toLatLng(driverLocation), [driverLocation]);
  const awaiting = useMemo(
    () => isPreAssign(ride, previewRoute),
    [ride, previewRoute],
  );

  const routeOrigin = useMemo(() => {
    if (awaiting && pickup) return pickup;
    if (driver) return driver;
    if (pickup && drop) return pickup;
    return null;
  }, [awaiting, driver, pickup, drop]);

  const routeTarget = useMemo(() => {
    const status = String(ride?.status || "").toLowerCase();
    if (awaiting && drop) return drop;
    if (status === "in_progress") return drop;
    if (driver) return pickup;
    if (pickup && drop) return drop;
    return null;
  }, [awaiting, ride?.status, pickup, drop, driver]);

  const trackingIds = useMemo(() => {
    const ids = [ride?.id, ride?._id, ride?.rideNumber]
      .map((x) => String(x || "").trim())
      .filter(Boolean);
    return [...new Set(ids)];
  }, [ride?.id, ride?._id, ride?.rideNumber]);

  useEffect(() => {
    let cancelled = false;
    let resizeObserver = null;
    (async () => {
      try {
        const key = await getGoogleMapsApiKey();
        if (!key) throw new Error("Maps key missing");
        await loadGoogleMaps(key);
        if (cancelled || !mapHostRef.current || !window.google?.maps) return;

        const center = driver || pickup || drop || { lat: 20.59, lng: 78.96 };
        const mapOptions = {
          center,
          zoom: 14,
          disableDefaultUI: true,
          zoomControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          rotateControl: false,
          scaleControl: false,
          clickableIcons: false,
          gestureHandling: lockMapGestures ? "none" : "greedy",
          draggable: !lockMapGestures,
          scrollwheel: !lockMapGestures,
          disableDoubleClickZoom: lockMapGestures,
          keyboardShortcuts: false,
          heading: 0,
          tilt: 0,
          styles: [
            { elementType: "geometry", stylers: [{ color: "#f3f4f6" }] },
            { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
            { featureType: "poi", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
            {
              featureType: "road.arterial",
              elementType: "geometry",
              stylers: [{ color: "#ffffff" }],
            },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#dbe4ee" }] },
          ],
        };
        // Vector maps support heading rotation (horizontal pickup↔drop framing)
        if (window.google.maps.RenderingType?.VECTOR) {
          mapOptions.renderingType = window.google.maps.RenderingType.VECTOR;
        }
        const map = new window.google.maps.Map(mapHostRef.current, mapOptions);
        mapRef.current = map;
        setReady(true);
        window.setTimeout(() => {
          if (cancelled || !mapRef.current || !window.google?.maps) return;
          window.google.maps.event.trigger(mapRef.current, "resize");
        }, 120);

        if (typeof ResizeObserver !== "undefined" && mapHostRef.current) {
          resizeObserver = new ResizeObserver(() => {
            if (!mapRef.current || !window.google?.maps) return;
            window.google.maps.event.trigger(mapRef.current, "resize");
          });
          resizeObserver.observe(mapHostRef.current);
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || "Map failed to load");
      }
    })();
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      clearPolylines(routeLinesRef);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Lock / unlock map pan-zoom when vehicle sheet is scrolling
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    mapRef.current.setOptions({
      gestureHandling: lockMapGestures ? "none" : "greedy",
      draggable: !lockMapGestures,
      scrollwheel: !lockMapGestures,
      disableDoubleClickZoom: lockMapGestures,
    });
  }, [ready, lockMapGestures]);

  // Markers — pulse highlight while awaiting driver
  useEffect(() => {
    if (!ready || !mapRef.current || !window.google?.maps) return;
    const map = mapRef.current;
    const gSize = (w, h) => new window.google.maps.Size(w, h);
    const gPoint = (x, y) => new window.google.maps.Point(x, y);

    const toIcon = (raw) => ({
      url: raw.url,
      scaledSize: gSize(raw.scaledSize.width, raw.scaledSize.height),
      anchor: gPoint(raw.anchor.x, raw.anchor.y),
    });

    if (pickup) {
      const icon = toIcon(
        pinSvgIcon("#10B981", {
          pulse: awaiting,
          size: awaiting ? 56 : 48,
          letter: "P",
        }),
      );
      if (!pickupMarkerRef.current) {
        pickupMarkerRef.current = new window.google.maps.Marker({
          map,
          position: pickup,
          zIndex: 4,
          icon,
          optimized: false,
        });
      } else {
        pickupMarkerRef.current.setPosition(pickup);
        pickupMarkerRef.current.setIcon(icon);
      }
    }

    if (drop) {
      const icon = toIcon(
        pinSvgIcon(awaiting ? "#EF4444" : "#FF6A00", {
          pulse: awaiting,
          size: awaiting ? 56 : 48,
          letter: "D",
        }),
      );
      if (!dropMarkerRef.current) {
        dropMarkerRef.current = new window.google.maps.Marker({
          map,
          position: drop,
          zIndex: 4,
          icon,
          optimized: false,
        });
      } else {
        dropMarkerRef.current.setPosition(drop);
        dropMarkerRef.current.setIcon(icon);
      }
    }

    if (driver && !awaiting) {
      if (!driverMarkerRef.current) {
        driverMarkerRef.current = new window.google.maps.Marker({
          map,
          position: driver,
          zIndex: 5,
          icon: {
            path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 5,
            fillColor: "#111827",
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
            rotation: Number(driverLocation?.heading || 0),
          },
        });
      } else {
        driverMarkerRef.current.setMap(map);
        driverMarkerRef.current.setPosition(driver);
        const icon = driverMarkerRef.current.getIcon();
        if (icon && typeof icon === "object") {
          driverMarkerRef.current.setIcon({
            ...icon,
            rotation: Number(driverLocation?.heading || 0),
          });
        }
      }
    } else if (driverMarkerRef.current) {
      driverMarkerRef.current.setMap(null);
    }
  }, [ready, pickup, drop, driver, driverLocation?.heading, awaiting]);

  const fitPadding = useCallback(() => {
    const host = mapHostRef.current;
    const h =
      host?.clientHeight ||
      (typeof window !== "undefined" ? window.innerHeight * 0.48 : 320);
    const bottom = Math.max(24, Math.round(h * bottomPaddingRatio));
    return { top: 56, right: 56, bottom, left: 40 };
  }, [bottomPaddingRatio]);

  const drawDottedArc = useCallback((map, from, to) => {
    clearPolylines(routeLinesRef);
    if (!from || !to || !window.google?.maps || !map) return;

    const heading = horizontalHeading(from, to);
    const path = buildArcPath(from, to, heading);
    if (path.length < 2) return;

    const line = new window.google.maps.Polyline({
      map,
      path,
      geodesic: false,
      strokeOpacity: 0,
      strokeWeight: 1,
      zIndex: 2,
      icons: [
        {
          icon: {
            path: "M 0,-1 0,1",
            strokeOpacity: 1,
            strokeColor: "#111111",
            strokeWeight: 4,
            scale: 3,
          },
          offset: "0",
          repeat: "14px",
        },
      ],
    });
    routeLinesRef.current.push(line);
    return { path, heading };
  }, []);

  const drawBlackPolyline = useCallback((map, path) => {
    clearPolylines(routeLinesRef);
    if (!path?.length || !window.google?.maps) return;

    try {
      map.setHeading(0);
      map.setTilt(0);
    } catch {
      /* ignore */
    }

    const glow = new window.google.maps.Polyline({
      map,
      path,
      geodesic: true,
      strokeColor: "#000000",
      strokeOpacity: 0.18,
      strokeWeight: 10,
      zIndex: 1,
    });
    const line = new window.google.maps.Polyline({
      map,
      path,
      geodesic: true,
      strokeColor: "#0A0A0A",
      strokeOpacity: 1,
      strokeWeight: 5,
      zIndex: 2,
    });
    routeLinesRef.current.push(glow, line);
  }, []);

  // Route: awaiting → black dotted arc; after accept → sharp black road polyline
  useEffect(() => {
    if (!ready || !window.google?.maps || !mapRef.current) return;
    let idleListener = null;

    const fitPath = (points, heading = null) => {
      const bounds = new window.google.maps.LatLngBounds();
      let hasPoint = false;
      (points || []).forEach((p) => {
        if (p?.lat != null && p?.lng != null) {
          bounds.extend(p);
          hasPoint = true;
        }
      });
      if (!hasPoint) return;

      mapRef.current.fitBounds(bounds, fitPadding());

      // fitBounds resets heading — re-apply after camera settles so pins sit horizontal
      if (heading == null || !Number.isFinite(heading)) return;
      if (idleListener) {
        window.google.maps.event.removeListener(idleListener);
        idleListener = null;
      }
      idleListener = window.google.maps.event.addListenerOnce(
        mapRef.current,
        "idle",
        () => {
          try {
            mapRef.current.setTilt(0);
            mapRef.current.setHeading(heading);
            if (typeof mapRef.current.moveCamera === "function") {
              mapRef.current.moveCamera({
                heading,
                tilt: 0,
              });
            }
          } catch {
            /* raster maps may ignore heading */
          }
        },
      );
    };

    if (awaiting) {
      if (!pickup || !drop) {
        clearPolylines(routeLinesRef);
        return;
      }
      const drawn = drawDottedArc(mapRef.current, pickup, drop);
      const arcPath = drawn?.path || [];
      fitPath([pickup, drop, ...arcPath], drawn?.heading ?? null);
      return () => {
        if (idleListener) {
          window.google.maps.event.removeListener(idleListener);
        }
      };
    }

    if (!routeOrigin || !routeTarget) {
      clearPolylines(routeLinesRef);
      return;
    }

    let cancelled = false;
    const service = new window.google.maps.DirectionsService();
    service.route(
      {
        origin: routeOrigin,
        destination: routeTarget,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (cancelled) return;
        if (status !== "OK" || !result) {
          clearPolylines(routeLinesRef);
          return;
        }

        const path = result.routes?.[0]?.overview_path || [];
        drawBlackPolyline(mapRef.current, path);
        fitPath([routeOrigin, routeTarget, pickup, drop, ...path], 0);

        const leg = result.routes?.[0]?.legs?.[0];
        if (leg && onMetrics) {
          onMetrics({
            distanceMeters: leg.distance?.value ?? null,
            durationSec: leg.duration?.value ?? null,
            distanceText: leg.distance?.text || null,
            durationText: leg.duration?.text || null,
          });
        }
      },
    );

    return () => {
      cancelled = true;
      if (idleListener) {
        window.google.maps.event.removeListener(idleListener);
      }
    };
  }, [
    ready,
    awaiting,
    pickup?.lat,
    pickup?.lng,
    drop?.lat,
    drop?.lng,
    routeOrigin?.lat,
    routeOrigin?.lng,
    routeTarget?.lat,
    routeTarget?.lng,
    fitPadding,
    drawDottedArc,
    drawBlackPolyline,
    onMetrics,
  ]);

  useEffect(() => {
    if (!trackingIds.length || !isTaxiUserLoggedIn()) return undefined;
    const token =
      localStorage.getItem("user_accessToken") ||
      localStorage.getItem("accessToken") ||
      "";
    const socket = getOrderSocket(() => token);
    if (!socket) return undefined;

    const join = () => {
      trackingIds.forEach((id) => {
        socket.emit("join-tracking", id);
        socket.emit("join_order", id);
      });
    };
    if (socket.connected) join();
    socket.on("connect", join);

    return () => {
      socket.off("connect", join);
      trackingIds.forEach((id) => {
        socket.emit("leave-tracking", id);
        socket.emit("leave_order", id);
      });
    };
  }, [trackingIds.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const recenterOnDriver = useCallback(() => {
    if (!mapRef.current || !driver) return;
    mapRef.current.panTo(driver);
    mapRef.current.setZoom(16);
  }, [driver]);

  const fitRoute = useCallback(() => {
    if (!mapRef.current || !window.google?.maps) return;
    const bounds = new window.google.maps.LatLngBounds();
    let hasPoint = false;
    [driver, routeTarget, pickup, drop].forEach((p) => {
      if (!p) return;
      bounds.extend(p);
      hasPoint = true;
    });
    if (hasPoint) {
      mapRef.current.fitBounds(bounds, fitPadding());
    }
  }, [driver, routeTarget, pickup, drop, fitPadding]);

  const zoomBy = useCallback((delta) => {
    if (!mapRef.current) return;
    const z = mapRef.current.getZoom() || 14;
    mapRef.current.setZoom(Math.max(3, Math.min(20, z + delta)));
  }, []);

  return (
    <div className={`taxi-map-clean relative h-full w-full overflow-hidden bg-neutral-100 ${className}`}>
      <div ref={mapHostRef} className="absolute inset-0" />

      {ready && showControls ? (
        <div
          className={`pointer-events-none absolute z-20 flex flex-col gap-2 ${
            controlsPlacement === "bottom-right"
              ? "bottom-3 right-3"
              : "inset-y-0 right-3 justify-center py-3"
          }`}
        >
          <div className="pointer-events-auto flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_8px_24px_rgba(15,23,42,0.14)] ring-1 ring-black/[0.04]">
            <button
              type="button"
              onClick={() => zoomBy(1)}
              className="flex h-10 w-10 cursor-pointer items-center justify-center text-neutral-700 hover:bg-neutral-50"
              aria-label="Zoom in"
            >
              <Plus className="h-4 w-4" />
            </button>
            <div className="h-px bg-neutral-100" />
            <button
              type="button"
              onClick={() => zoomBy(-1)}
              className="flex h-10 w-10 cursor-pointer items-center justify-center text-neutral-700 hover:bg-neutral-50"
              aria-label="Zoom out"
            >
              <Minus className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={recenterOnDriver}
            disabled={!driver || awaiting}
            className={`pointer-events-auto flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl bg-white shadow-[0_8px_24px_rgba(15,23,42,0.14)] ring-1 ring-black/[0.04] ${
              driver && !awaiting ? "text-[#FF6A00]" : "text-neutral-300"
            }`}
            aria-label="Recenter on driver"
            title="Recenter on driver"
          >
            <Crosshair className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={fitRoute}
            className="pointer-events-auto flex h-10 w-10 cursor-pointer items-center justify-center rounded-2xl bg-white text-neutral-800 shadow-[0_8px_24px_rgba(15,23,42,0.14)] ring-1 ring-black/[0.04]"
            aria-label="Fit full route"
            title="Show full route"
          >
            <Route className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {!ready && !error ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
          <Loader2 className="h-7 w-7 animate-spin text-[#FF6A00]" />
        </div>
      ) : null}
      {error ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white px-4 text-center text-sm text-red-600">
          {error}
        </div>
      ) : null}
    </div>
  );
}
