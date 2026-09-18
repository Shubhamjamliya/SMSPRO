import { ExternalLink, MapPin, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";
import { haversineKm } from "@/core/location/locationService";
import { formatDistanceLabel } from "../utils/bikeDisplay";

export function getPickupHub(source) {
  if (!source) return null;
  if (source.hub && (source.hub.address || source.hub.name || source.hub.lat != null)) {
    return source.hub;
  }
  if (source.pickupHub && (source.pickupHub.address || source.pickupHub.name || source.pickupHub.lat != null)) {
    return source.pickupHub;
  }
  if (
    source.zone?.pickupHub
    && (source.zone.pickupHub.address || source.zone.pickupHub.name || source.zone.pickupHub.lat != null)
  ) {
    return source.zone.pickupHub;
  }
  if (
    source.zoneSnapshot?.pickupHub
    && (
      source.zoneSnapshot.pickupHub.address
      || source.zoneSnapshot.pickupHub.name
      || source.zoneSnapshot.pickupHub.lat != null
    )
  ) {
    return source.zoneSnapshot.pickupHub;
  }
  return null;
}

export function getPickupZoneName(source) {
  return (
    source?.zone?.name
    || source?.zoneName
    || source?.zoneSnapshot?.name
    || source?.pickupLabel
    || ""
  );
}

export function hasPickupDetails(source) {
  const hub = getPickupHub(source);
  if (!hub) return false;
  return Boolean(
    hub.name
    || hub.address
    || hub.landmark
    || hub.instructions
    || (Number.isFinite(Number(hub.lat)) && Number.isFinite(Number(hub.lng))),
  );
}

export function mapsUrlForPickup(hub) {
  if (!hub) return null;
  const lat = Number(hub.lat);
  const lng = Number(hub.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
  }
  const query = [hub.name, hub.address, hub.landmark].filter(Boolean).join(", ");
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function distanceToPickupHub(hub, userLat, userLng) {
  const hubLat = Number(hub?.lat);
  const hubLng = Number(hub?.lng);
  const lat = Number(userLat);
  const lng = Number(userLng);
  if (
    !Number.isFinite(hubLat)
    || !Number.isFinite(hubLng)
    || !Number.isFinite(lat)
    || !Number.isFinite(lng)
  ) {
    return "";
  }
  return formatDistanceLabel(haversineKm(lat, lng, hubLat, hubLng));
}

export default function PickupLocationCard({
  zoneName,
  pickupHub,
  className,
  compact = false,
  userLat = null,
  userLng = null,
  distanceLabel: distanceLabelProp = "",
}) {
  const hub = pickupHub || {};
  const title = hub.name || zoneName || "Pickup hub";
  const mapsUrl = mapsUrlForPickup(hub);
  const distanceLabel = distanceLabelProp || distanceToPickupHub(hub, userLat, userLng);
  const hasDetails = Boolean(
    hub.name || hub.address || hub.landmark || hub.instructions || mapsUrl,
  );

  return (
    <section
      className={cn(
        "rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-amber-50/50 shadow-sm",
        compact ? "p-2.5" : "p-4",
        className,
      )}
    >
      <div className={cn("flex items-start", compact ? "gap-2.5" : "gap-3")}>
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl bg-[#FF6A00] text-white",
            compact ? "h-8 w-8" : "h-10 w-10",
          )}
        >
          <MapPin className={compact ? "h-4 w-4" : "h-5 w-5"} strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#FF6A00]">
                Pickup location
              </p>
              <h3
                className={cn(
                  "mt-0.5 font-extrabold text-gray-900",
                  compact ? "truncate text-sm" : "text-sm sm:text-base",
                )}
              >
                {title}
              </h3>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {distanceLabel ? (
                <span
                  className={cn(
                    "inline-flex items-center rounded-full bg-white font-bold text-gray-800 shadow-sm ring-1 ring-orange-100",
                    compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
                  )}
                >
                  {distanceLabel} away
                </span>
              ) : null}
              {mapsUrl ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-lg bg-white font-bold text-[#FF6A00] shadow-sm ring-1 ring-[#FF6A00]/20",
                    compact ? "px-2 py-1 text-[10px]" : "mt-0 gap-1.5 rounded-xl px-3 py-2 text-xs",
                    !compact && "hidden",
                  )}
                >
                  <Navigation className="h-3 w-3" />
                  Maps
                </a>
              ) : null}
            </div>
          </div>
          {zoneName && hub.name ? (
            <p className={cn("text-gray-500", compact ? "mt-0.5 truncate text-[11px]" : "mt-0.5 text-xs")}>
              Zone: {zoneName}
            </p>
          ) : null}

          {hub.address ? (
            <p
              className={cn(
                "leading-relaxed text-gray-700",
                compact ? "mt-1 line-clamp-2 text-xs" : "mt-2 text-sm",
              )}
            >
              {hub.address}
            </p>
          ) : null}
          {hub.landmark ? (
            <p className={cn("text-gray-500", compact ? "mt-0.5 truncate text-[11px]" : "mt-1 text-xs")}>
              Landmark: {hub.landmark}
            </p>
          ) : null}
          {hub.instructions && !compact ? (
            <p className="mt-2 rounded-xl bg-white/80 px-3 py-2 text-xs leading-relaxed text-gray-600">
              {hub.instructions}
            </p>
          ) : null}
          {hub.instructions && compact ? (
            <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-gray-600">
              {hub.instructions}
            </p>
          ) : null}

          {!hasDetails ? (
            <p className={cn("leading-relaxed text-gray-500", compact ? "mt-1 text-[11px]" : "mt-2 text-xs")}>
              Collect from the Bike Rent hub in{" "}
              <b className="text-gray-800">{zoneName || "your zone"}</b>
              {compact ? "." : ". Exact hub address will be confirmed with your pickup code after booking."}
            </p>
          ) : null}

          {mapsUrl && !compact ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-[#FF6A00] shadow-sm ring-1 ring-[#FF6A00]/20"
            >
              <Navigation className="h-3.5 w-3.5" />
              Open in Maps
              <ExternalLink className="h-3 w-3 opacity-70" />
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
