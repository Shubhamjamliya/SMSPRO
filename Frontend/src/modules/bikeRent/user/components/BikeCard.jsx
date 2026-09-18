import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { Bike, ChevronRight, MapPin, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { haversineKm } from "@/core/location/locationService";
import { getBikeRentBikePath, getBikeRentBookingPath, getBikeRentPayPath } from "../utils/routes";
import { formatInr } from "../utils/format";
import {
  bikeAvailabilityLabel,
  bikeAvgRating,
  bikeHubCoords,
  bikeHubShortLocation,
  bikeIdOf,
  bikePrimaryImage,
  bikeReviewCount,
  bikeTitle,
  formatDistanceLabel,
} from "../utils/bikeDisplay";
import {
  bookingIdOf,
  isAwaitingApprovalStatus,
  isPaymentPendingStatus,
} from "../utils/bookingDisplay";

const DOT = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  info: "bg-sky-500",
  danger: "bg-rose-500",
  muted: "bg-gray-400",
};

function useBikeCardMeta(bike, userLat, userLng) {
  const title = bikeTitle(bike);
  const locationLabel = bikeHubShortLocation(bike);
  const rating = bikeAvgRating(bike);
  const reviewCount = bikeReviewCount(bike);
  const distanceLabel = useMemo(() => {
    const coords = bikeHubCoords(bike);
    const lat = Number(userLat);
    const lng = Number(userLng);
    if (!coords || !Number.isFinite(lat) || !Number.isFinite(lng)) return "";
    return formatDistanceLabel(haversineKm(lat, lng, coords.lat, coords.lng));
  }, [bike, userLat, userLng]);

  return { title, locationLabel, rating, reviewCount, distanceLabel };
}

/**
 * Compact bike card — photo, name, rating, hub location, distance, price.
 */
export default function BikeCard({
  bike,
  variant = "grid",
  className,
  pendingBooking = null,
  userLat = null,
  userLng = null,
}) {
  const id = bikeIdOf(bike);
  const pendingId = bookingIdOf(pendingBooking);
  const awaitingApproval = isAwaitingApprovalStatus(pendingBooking?.status);
  const pendingPay = isPaymentPendingStatus(pendingBooking?.status);
  const href = pendingId
    ? (pendingPay ? getBikeRentPayPath(pendingId) : getBikeRentBookingPath(pendingId))
    : getBikeRentBikePath(id);
  const imageUrl = bikePrimaryImage(bike);
  const [imageBroken, setImageBroken] = useState(false);
  const image = imageUrl && !imageBroken ? imageUrl : "";
  const availability = pendingId
    ? {
      label: awaitingApproval ? "Pending" : "Pay now",
      tone: awaitingApproval ? "warning" : "info",
    }
    : bikeAvailabilityLabel(bike);
  const pending = Boolean(pendingId);
  const cta = pending ? (pendingPay ? "Pay" : "Open") : "Rent";
  const { title, locationLabel, rating, reviewCount, distanceLabel } = useBikeCardMeta(
    bike,
    userLat,
    userLng,
  );
  const showRating = rating > 0 || reviewCount > 0;

  if (variant === "list") {
    return (
      <Link
        to={href}
        className={cn(
          "group flex min-w-0 items-center gap-3 rounded-2xl border border-gray-100 bg-white p-2 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition",
          "hover:border-orange-200 hover:shadow-md active:scale-[0.99]",
          pending ? "border-amber-200" : "",
          className,
        )}
      >
        <div className="relative h-[4.25rem] w-[4.75rem] shrink-0 overflow-hidden rounded-xl bg-gray-100 sm:h-20 sm:w-24">
          {image ? (
            <img
              src={image}
              alt={title}
              loading="lazy"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
              onError={() => setImageBroken(true)}
            />
          ) : (
            <div className="grid h-full place-items-center bg-gradient-to-br from-gray-50 to-orange-50/40 text-gray-300">
              <Bike className="h-6 w-6" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 py-0.5">
          <div className="flex items-center gap-1.5">
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[availability.tone] || DOT.muted)} />
            <p className="truncate text-[11px] font-semibold text-gray-500">
              {availability.label}
            </p>
            {showRating ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-bold text-amber-600">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {rating.toFixed(1)}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-sm font-bold text-gray-900">{title}</p>
          {(locationLabel || distanceLabel) ? (
            <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-gray-500">
              <MapPin className="h-3 w-3 shrink-0 text-gray-400" />
              <span className="truncate">
                {[locationLabel, distanceLabel].filter(Boolean).join(" · ")}
              </span>
            </p>
          ) : null}
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="text-[15px] font-black tracking-tight text-[#FF6A00]">
              {formatInr(bike.hourlyPrice)}
              <span className="ml-0.5 text-[10px] font-bold text-orange-400">/hr</span>
            </p>
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-gray-400 group-hover:text-[#FF6A00]">
              {cta}
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to={href}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white",
        "shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition",
        "hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md active:scale-[0.99]",
        pending ? "border-amber-200" : "",
        className,
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
        {image ? (
          <img
            src={image}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
            onError={() => setImageBroken(true)}
          />
        ) : (
          <div className="grid h-full place-items-center bg-gradient-to-br from-gray-50 to-orange-50/50 text-gray-300">
            <Bike className="h-8 w-8" />
          </div>
        )}

        <div className="absolute left-2 top-2 right-2 flex items-start justify-between gap-1">
          {showRating ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-white/95 px-1.5 py-0.5 text-[10px] font-bold text-gray-800 shadow-sm backdrop-blur-sm">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {rating.toFixed(1)}
            </span>
          ) : (
            <span />
          )}
          <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-1.5 py-0.5 shadow-sm backdrop-blur-sm">
            <span className={cn("h-1.5 w-1.5 rounded-full", DOT[availability.tone] || DOT.muted)} />
            <span className="text-[9px] font-bold uppercase tracking-wide text-gray-700">
              {availability.label}
            </span>
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1 px-2.5 pb-2.5 pt-2">
        <p className="truncate text-[13px] font-bold leading-tight text-gray-900">
          {title}
        </p>
        {(locationLabel || distanceLabel) ? (
          <p className="flex min-w-0 items-center gap-1 text-[10px] leading-tight text-gray-500">
            <MapPin className="h-3 w-3 shrink-0 text-gray-400" />
            <span className="truncate">{locationLabel || "Pickup hub"}</span>
            {distanceLabel ? (
              <span className="shrink-0 font-semibold text-gray-600">· {distanceLabel}</span>
            ) : null}
          </p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-2 pt-0.5">
          <p className="min-w-0 truncate text-[15px] font-black tracking-tight text-[#FF6A00]">
            {formatInr(bike.hourlyPrice)}
            <span className="ml-0.5 text-[10px] font-bold text-orange-400">/hr</span>
          </p>
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#FF6A00] px-2 py-1 text-[10px] font-extrabold text-white shadow-sm transition group-hover:bg-[#e85f00]">
            {cta}
            <ChevronRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}
