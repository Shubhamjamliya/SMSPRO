import { formatInr } from "../utils/format";

export function bikeIdOf(bike) {
  return bike?.id || bike?._id || "";
}

/** Keep only real, displayable image URLs — skip empty / blob / junk values. */
export function isUsableBikeImageUrl(url) {
  const value = String(url || "").trim();
  if (!value) return false;
  if (/^(null|undefined)$/i.test(value)) return false;
  if (value.startsWith("blob:")) return false;
  if (value.startsWith("data:image/")) return true;
  if (/^https?:\/\//i.test(value)) return true;
  if (value.startsWith("//")) return true;
  if (value.startsWith("/")) return true;
  return false;
}

export function bikeImages(bike) {
  const images = Array.isArray(bike?.images) ? bike.images : [];
  const urls = [];
  const seen = new Set();

  images.forEach((image) => {
    const url = typeof image === "string" ? image : image?.url;
    const clean = String(url || "").trim();
    if (!isUsableBikeImageUrl(clean) || seen.has(clean)) return;
    seen.add(clean);
    urls.push(clean);
  });

  return urls;
}

export function bikePrimaryImage(bike) {
  const images = Array.isArray(bike?.images) ? bike.images : [];
  const primary = images.find(
    (image) => image?.isPrimary && isUsableBikeImageUrl(image?.url),
  );
  if (primary?.url) return String(primary.url).trim();
  return bikeImages(bike)[0] || "";
}

export function bikeCategoryName(bike) {
  return bike?.category?.name || bike?.categoryName || "";
}

export function bikeCategoryId(bike) {
  return bike?.category?.id || bike?.categoryId || bike?.category?._id || "";
}

export function bikeAvailabilityLabel(bike) {
  if (bike?.isAvailableForWindow === false) {
    return {
      label: bike?.nextAvailableAt ? "Booked window" : "Unavailable",
      tone: "warning",
    };
  }
  if (bike?.isAvailableForWindow === true) {
    return { label: "Available", tone: "success" };
  }
  const status = String(bike?.availabilityStatus || "").toLowerCase();
  if (!bike?.isActive) return { label: "Unavailable", tone: "muted" };
  if (status === "available") return { label: "Available", tone: "success" };
  if (status === "reserved") return { label: "Reserved", tone: "warning" };
  if (status === "rented") return { label: "On rent", tone: "info" };
  if (status === "maintenance" || bike?.maintenanceStatus === "maintenance") {
    return { label: "Maintenance", tone: "danger" };
  }
  return { label: status ? status.replace(/_/g, " ") : "Check availability", tone: "muted" };
}

export function bikeTitle(bike) {
  return bike?.name || [bike?.brand, bike?.model].filter(Boolean).join(" ") || "Bike";
}

export function bikeSubtitle(bike) {
  return [bike?.brand, bike?.model].filter(Boolean).join(" · ");
}

export function bikeQuickSpecs(bike) {
  return [
    bike?.fuelType ? String(bike.fuelType) : null,
    bike?.transmission ? String(bike.transmission) : null,
    bike?.seatingCapacity ? `${bike.seatingCapacity} seat` : null,
    bike?.helmetIncluded ? "Helmet" : null,
  ].filter(Boolean);
}

export function bikePriceLabel(bike) {
  return `${formatInr(bike?.hourlyPrice)}/hr`;
}

export function bikeDepositLabel(bike) {
  return formatInr(bike?.securityDeposit);
}

export function brandKey(bike) {
  return String(bike?.brand || "Other").trim() || "Other";
}

/** Short hub location for cards — landmark or first address segment (not hub name). */
export function bikeHubShortLocation(bike) {
  const hub = bike?.hub || bike?.pickupHub || {};
  const landmark = String(hub.landmark || "").trim();
  if (landmark) {
    return landmark.length > 36 ? `${landmark.slice(0, 34)}…` : landmark;
  }
  const address = String(hub.address || "").trim();
  if (!address) return "";
  const short = address.split(",")[0].trim() || address;
  return short.length > 36 ? `${short.slice(0, 34)}…` : short;
}

export function bikeHubCoords(bike) {
  const hub = bike?.hub || bike?.pickupHub || {};
  const lat = Number(hub.lat ?? bike?.hubLat);
  const lng = Number(hub.lng ?? bike?.hubLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function bikeAvgRating(bike) {
  const value = Number(bike?.avgRating ?? bike?.rating ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function bikeReviewCount(bike) {
  const value = Number(bike?.reviewCount ?? bike?.ratingsCount ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function bikeBookingCount(bike) {
  const value = Number(bike?.bookingCount ?? bike?.completedBookings ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function formatDistanceLabel(km) {
  if (!Number.isFinite(km) || km < 0) return "";
  if (km < 1) return `${Math.max(1, Math.round(km * 1000))} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
