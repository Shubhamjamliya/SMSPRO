import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Bike,
  Fuel,
  Gauge,
  HardHat,
  IdCard,
  Star,
  Users,
} from "lucide-react";
import { useLocation as useAppLocation } from "@food/hooks/useLocation";
import bikeRentUserApi from "../services/userApi";
import BikeCard from "../components/BikeCard";
import BikeImageCarousel from "../components/BikeImageCarousel";
import AvailabilityTimeline from "../components/AvailabilityTimeline";
import PickupLocationCard, {
  getPickupHub,
  getPickupZoneName,
} from "../components/PickupLocationCard";
import {
  BikeRentPageHeader,
  BikeRentPageShell,
  EmptyState,
  PrimaryButton,
} from "../components/ui";
import { getBikeRentBookingPath, getBikeRentCheckoutPath, getBikeRentPayPath } from "../utils/routes";
import { formatInr } from "../utils/format";
import {
  bikeAvailabilityLabel,
  bikeAvgRating,
  bikeBookingCount,
  bikeCategoryName,
  bikeIdOf,
  bikeImages,
  bikeReviewCount,
  bikeSubtitle,
  bikeTitle,
} from "../utils/bikeDisplay";
import {
  bookingIdOf,
  formatRemainingTime,
  isAwaitingApprovalStatus,
  isPaymentPendingStatus,
} from "../utils/bookingDisplay";
import { useMyPendingBookings } from "../hooks/useMyPendingBookings";
import { useBikeRentZone } from "../hooks/useBikeRentZone";
import { useBikeAvailabilityCalendar } from "../hooks/useBikeAvailability";
import { resolveRequiredDocTypes } from "../components/CheckoutRequiredDocuments";
import { cn } from "@/lib/utils";

function Chip({ children }) {
  if (!children) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-1 text-[11px] font-semibold capitalize text-gray-700">
      {children}
    </span>
  );
}

export default function BikeDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { location } = useAppLocation();
  const { userLat, userLng } = useBikeRentZone(location);
  const { data: availabilityCalendar } = useBikeAvailabilityCalendar(id, {
    enabled: Boolean(id),
    durationHours: 4,
  });
  const [bike, setBike] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failedImages, setFailedImages] = useState(() => new Set());
  const [documentCatalog, setDocumentCatalog] = useState([]);

  useEffect(() => {
    let cancelled = false;
    bikeRentUserApi
      .getPublicSettings(id)
      .then((settings) => {
        if (!cancelled) setDocumentCatalog(settings?.documentTypes || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  const requiredDocumentLabels = useMemo(() => {
    const keys = Array.isArray(bike?.requiredDocuments) ? bike.requiredDocuments : [];
    return resolveRequiredDocTypes(documentCatalog, keys).map((d) => d.label);
  }, [bike?.requiredDocuments, documentCatalog]);
  const { getPendingForBike } = useMyPendingBookings();
  const pendingBooking = getPendingForBike(id);
  const pendingId = bookingIdOf(pendingBooking);
  const awaitingApproval = isAwaitingApprovalStatus(pendingBooking?.status);
  const pendingPay = isPaymentPendingStatus(pendingBooking?.status);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailedImages(new Set());
    bikeRentUserApi
      .getBikeById(id)
      .then(async (result) => {
        if (cancelled) return;
        setBike(result);
        const categoryId = result?.category?.id || result?.categoryId;
        const zoneId = result?.zone?.id || result?.zoneId;
        if (!categoryId) {
          setSimilar([]);
          return;
        }
        try {
          const list = await bikeRentUserApi.getBikes({
            categoryId,
            zoneId: zoneId || undefined,
            limit: 6,
          });
          if (!cancelled) {
            setSimilar(
              (list.records || [])
                .filter((item) => {
                  if (String(bikeIdOf(item)) === String(id)) return false;
                  if (!zoneId) return true;
                  const itemZone = String(item.zoneId || item.zone?.id || "");
                  return !itemZone || itemZone === String(zoneId);
                })
                .slice(0, 4),
            );
          }
        } catch {
          if (!cancelled) setSimilar([]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBike(null);
          setSimilar([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const images = useMemo(
    () => bikeImages(bike).filter((url) => !failedImages.has(url)),
    [bike, failedImages],
  );

  const markImageFailed = (url) => {
    if (!url) return;
    setFailedImages((current) => {
      if (current.has(url)) return current;
      const next = new Set(current);
      next.add(url);
      return next;
    });
  };

  const availability = bikeAvailabilityLabel(bike);
  const category = bikeCategoryName(bike);
  const zoneName = getPickupZoneName(bike);
  const pickupHub = getPickupHub(bike);
  const avgRating = bikeAvgRating(bike);
  const reviewCount = bikeReviewCount(bike);
  const completedBookings = bikeBookingCount(bike);
  const hasRatings = avgRating > 0 || reviewCount > 0;
  const canBook =
    !pendingId
    && bike?.isActive
    && String(bike?.maintenanceStatus || "").toLowerCase() !== "maintenance"
    && !["maintenance", "disabled"].includes(String(bike?.availabilityStatus || "").toLowerCase());

  if (loading) {
    return (
      <BikeRentPageShell showBottomNav>
        <BikeRentPageHeader title="Bike details" />
        <main className="space-y-3 px-4 py-3">
          <div className="aspect-[16/10] animate-pulse rounded-2xl bg-gray-200" />
          <div className="h-28 animate-pulse rounded-2xl bg-gray-200" />
          <div className="h-20 animate-pulse rounded-2xl bg-gray-200" />
        </main>
      </BikeRentPageShell>
    );
  }

  if (!bike) {
    return (
      <BikeRentPageShell showBottomNav>
        <BikeRentPageHeader title="Bike details" />
        <main className="px-4 py-4">
          <EmptyState
            icon={Bike}
            title="Bike unavailable"
            subtitle="This bike may no longer be available."
          />
        </main>
      </BikeRentPageShell>
    );
  }

  return (
    <BikeRentPageShell showBottomNav>
      <BikeRentPageHeader title={bikeTitle(bike)} />
      <main className="space-y-3 px-4 py-3 pb-32 md:pb-6">
        {pendingId ? (
          <section className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-amber-900">
                  {awaitingApproval ? "Booking awaiting approval" : "Payment pending"}
                </p>
                <p className="text-[11px] text-amber-800">
                  {awaitingApproval ? "Wait for admin confirmation" : "Finish payment to reserve"}
                  {pendingBooking?.expiresAt
                    ? ` · ${formatRemainingTime(pendingBooking.expiresAt)}`
                    : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                {pendingPay ? (
                  <PrimaryButton
                    className="h-8 w-auto px-3 py-0 text-[11px]"
                    onClick={() => navigate(getBikeRentPayPath(pendingId))}
                  >
                    Pay now
                  </PrimaryButton>
                ) : null}
                <button
                  type="button"
                  onClick={() => navigate(getBikeRentBookingPath(pendingId))}
                  className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-amber-900"
                >
                  View
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {/* Hero + identity */}
        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <BikeImageCarousel
            images={images}
            alt={bikeTitle(bike)}
            onImageError={markImageFailed}
            badge={(
              <span
                className={cn(
                  "absolute left-2.5 top-2.5 z-10 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize shadow-sm",
                  availability.tone === "success"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-white/95 text-gray-700",
                )}
              >
                {availability.label}
              </span>
            )}
          />

          <div className="space-y-2.5 border-t border-gray-50 px-3 py-3">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-black text-gray-900">{bikeTitle(bike)}</h1>
              <p className="truncate text-xs text-gray-500">
                {[bikeSubtitle(bike), category].filter(Boolean).join(" · ") || "Rental bike"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {hasRatings ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-bold text-amber-800">
                    <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                    {avgRating.toFixed(1)}
                    {reviewCount > 0 ? (
                      <span className="font-semibold text-amber-700/80">
                        ({reviewCount})
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2.5 py-1 font-semibold text-gray-600">
                    <Star className="h-3.5 w-3.5 text-gray-400" />
                    New
                  </span>
                )}
                <span className="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-1 font-semibold text-[#FF6A00]">
                  {completedBookings} {completedBookings === 1 ? "Booking" : "Bookings"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Chip>
                <Fuel className="h-3 w-3 text-[#FF6A00]" />
                {bike.fuelType || "—"}
              </Chip>
              <Chip>
                <Gauge className="h-3 w-3 text-[#FF6A00]" />
                {bike.transmission || "—"}
              </Chip>
              {bike.seatingCapacity ? (
                <Chip>
                  <Users className="h-3 w-3 text-[#FF6A00]" />
                  {bike.seatingCapacity} seats
                </Chip>
              ) : null}
              <Chip>
                <HardHat className="h-3 w-3 text-[#FF6A00]" />
                {bike.helmetIncluded ? "Helmet" : "No helmet"}
              </Chip>
            </div>

            <div className="space-y-1.5 rounded-xl bg-orange-50/80 p-2">
              <div className="grid grid-cols-2 gap-1.5">
                <div className="text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-orange-400">
                    Hourly
                  </p>
                  <p className="text-sm font-black text-[#FF6A00]">{formatInr(bike.hourlyPrice)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-orange-400">
                    Full day
                  </p>
                  <p className="text-sm font-black text-gray-900">{formatInr(bike.dailyPrice)}</p>
                  <p className="text-[9px] text-gray-400">24 hours</p>
                </div>
              </div>
              <p className="border-t border-orange-100/80 pt-1.5 text-center text-[10px] font-semibold text-gray-600">
                Security deposit · {formatInr(bike.securityDeposit)}
              </p>
            </div>

            {bike.description ? (
              <p className="line-clamp-2 text-xs leading-relaxed text-gray-500">{bike.description}</p>
            ) : null}
          </div>
        </section>

        <PickupLocationCard
          zoneName={zoneName}
          pickupHub={pickupHub}
          compact
          userLat={userLat}
          userLng={userLng}
        />

        <section className="rounded-2xl border border-gray-100 bg-white px-3 py-3 shadow-sm">
          <h2 className="mb-2 text-xs font-extrabold text-gray-900">Availability (next 7 days)</h2>
          <AvailabilityTimeline
            from={availabilityCalendar?.from}
            to={availabilityCalendar?.to}
            busy={availabilityCalendar?.busy || []}
          />
          {availabilityCalendar?.nextSlot?.startAt ? (
            <p className="mt-2 text-[11px] text-gray-500">
              Next open slot from{" "}
              {new Date(availabilityCalendar.nextSlot.startAt).toLocaleString(undefined, {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white px-3 py-3 shadow-sm">
          <h2 className="mb-2 text-xs font-extrabold text-gray-900">Documents required</h2>
          {requiredDocumentLabels.length ? (
            <ul className="grid grid-cols-1 gap-1.5 text-[11px] text-gray-600 sm:grid-cols-2">
              {requiredDocumentLabels.map((label, index) => (
                <li key={`${label}-${index}`} className="flex items-start gap-1.5">
                  <IdCard className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FF6A00]" />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] leading-relaxed text-gray-500">
              No additional documents are required.
            </p>
          )}
        </section>

        {similar.length ? (
          <section>
            <h2 className="mb-2 text-xs font-extrabold text-gray-900">Similar bikes</h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
              {similar.map((item) => (
                <BikeCard
                  key={bikeIdOf(item)}
                  bike={item}
                  userLat={userLat}
                  userLng={userLng}
                />
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <div className="fixed inset-x-0 bottom-[64px] z-40 border-t border-gray-100 bg-white/95 px-4 py-2.5 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur md:static md:bottom-auto md:border-0 md:bg-transparent md:px-4 md:pb-6 md:shadow-none">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-gray-500">
              {pendingId ? "Pending" : "From"}
            </p>
            <p className="truncate text-base font-black text-[#FF6A00]">
              {formatInr(bike.hourlyPrice)}
              <span className="text-[10px] font-bold text-orange-400">/hr</span>
            </p>
          </div>
          {pendingId ? (
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => navigate(getBikeRentBookingPath(pendingId))}
                className="rounded-xl border border-gray-200 px-3 py-2.5 text-xs font-bold text-gray-700"
              >
                View
              </button>
              {pendingPay ? (
                <PrimaryButton
                  className="w-auto min-w-[8.5rem] px-4 py-2.5"
                  onClick={() => navigate(getBikeRentPayPath(pendingId))}
                >
                  Continue payment
                </PrimaryButton>
              ) : (
                <PrimaryButton
                  className="w-auto min-w-[8.5rem] px-4 py-2.5"
                  onClick={() => navigate(getBikeRentBookingPath(pendingId))}
                >
                  Awaiting approval
                </PrimaryButton>
              )}
            </div>
          ) : (
            <PrimaryButton
              className="w-auto min-w-[8.5rem] px-4 py-2.5"
              disabled={!canBook}
              onClick={() =>
                navigate(`${getBikeRentCheckoutPath()}?bikeId=${encodeURIComponent(id)}`)
              }
            >
              {canBook ? "Book now" : "Unavailable"}
            </PrimaryButton>
          )}
        </div>
      </div>
    </BikeRentPageShell>
  );
}
