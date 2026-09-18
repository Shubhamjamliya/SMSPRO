import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bike,
  CalendarClock,
  ChevronRight,
  Clock3,
  Headphones,
  MapPin,
  TimerReset,
  Undo2,
} from "lucide-react";
import bikeRentUserApi from "../services/userApi";
import { isBikeRentUserLoggedIn } from "../utils/authUser";
import { bikePrimaryImage, bikeTitle } from "../utils/bikeDisplay";
import {
  bookingIdOf,
  formatRideDateTime,
  isLiveRideStatus,
  liveRideStatusLabel,
  pickPrimaryLiveBooking,
  rideCountdown,
  rideProgressIndex,
  RIDE_PROGRESS_STAGES,
} from "../utils/bookingDisplay";
import { getPickupHub, getPickupZoneName } from "./PickupLocationCard";
import {
  getBikeRentActivePath,
  getBikeRentReturnPath,
  getBikeRentSupportPath,
} from "../utils/routes";
import { cn } from "@/lib/utils";

function bookingBikeSource(booking) {
  return booking?.bike || booking?.bikeSnapshot || {};
}

function pickupLabel(booking) {
  const hub = getPickupHub(booking) || getPickupHub(booking?.bike) || getPickupHub(booking?.zoneSnapshot);
  const zone = getPickupZoneName(booking) || booking?.zoneName || booking?.hubName || "";
  const parts = [hub?.name, hub?.address || zone].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return booking?.locationLabel || zone || "Pickup hub";
}

/**
 * Sticky "Your Active Ride" card for Bike Rent home — Food live-order vibe,
 * with rental-specific details, progress, and actions.
 */
export default function ActiveRideCard({ className, stickyOffset }) {
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isBikeRentUserLoggedIn()) {
      setBooking(null);
      setLoading(false);
      return null;
    }
    try {
      const data = await bikeRentUserApi.getMyBookings({
        scope: "active",
        limit: 20,
      });
      const next = pickPrimaryLiveBooking(data.records || []);
      setBooking(next && isLiveRideStatus(next.status) ? next : null);
      return next;
    } catch {
      setBooking(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-fetch booking status while a live ride is shown.
  useEffect(() => {
    if (!booking) return undefined;
    const timer = setInterval(() => {
      refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [booking?.id, booking?._id, refresh]);

  // Tick countdown every second.
  useEffect(() => {
    if (!booking) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [booking?.id, booking?._id]);

  // Refresh when tab becomes visible again.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const id = bookingIdOf(booking);
  const bike = bookingBikeSource(booking);
  const image = bikePrimaryImage(bike) || booking?.bikeSnapshot?.primaryImage || "";
  const name = bikeTitle(bike) || booking?.bikeName || "Your bike";
  const status = String(booking?.status || "").toLowerCase();
  const statusLabel = liveRideStatusLabel(status);
  const progressIndex = rideProgressIndex(status);
  const countdown = useMemo(
    () => (booking ? rideCountdown(booking, now) : null),
    [booking, now],
  );
  const isOnTrip = ["active", "rental_started", "pickup_completed"].includes(status);
  const canExtend = isOnTrip;
  const canReturn = isOnTrip;
  const bookingRef = booking?.bookingNumber || id;

  if (loading || !booking || !id) return null;

  const goView = () => {
    navigate(getBikeRentActivePath(id));
  };

  return (
    <AnimatePresence>
      <motion.section
        key={id}
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ type: "spring", damping: 24, stiffness: 220 }}
        className={cn(
          "sticky z-30 -mx-4 bg-[#F7F7F8]/95 px-4 pb-1 pt-0 backdrop-blur-md",
          stickyOffset || "top-[calc(3.5rem+env(safe-area-inset-top))]",
          className,
        )}
      >
        <div className="relative overflow-hidden rounded-[20px] border border-orange-100/70 bg-white/95 shadow-[0_8px_30px_rgba(255,106,0,0.14)] backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-orange-50/70 via-white/50 to-white/90 opacity-80" />

          <div className="relative z-10 p-3.5 sm:p-4">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#FF6A00]">
                Your Active Ride
              </p>
              <span className="rounded-full bg-[#FF6A00]/10 px-2 py-0.5 text-[10px] font-bold text-[#FF6A00]">
                {statusLabel}
              </span>
            </div>

            <button
              type="button"
              onClick={goView}
              className="flex w-full items-center gap-3 text-left"
            >
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-orange-100 bg-orange-50 shadow-[0_4px_15px_rgba(255,106,0,0.12)] sm:h-16 sm:w-16">
                {image ? (
                  <img src={image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[#FF6A00]">
                    <Bike className="h-6 w-6" />
                  </div>
                )}
                <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/95 text-[#FF6A00] shadow-sm">
                  <motion.span
                    animate={{ rotate: [0, -8, 8, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                    className="flex"
                  >
                    <Bike className="h-3 w-3" />
                  </motion.span>
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold tracking-tight text-gray-900 sm:text-lg">
                  {name}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-gray-500">
                  <span className="truncate">ID {bookingRef}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#FF6A00]" />
                </p>
                <p className="mt-1 flex items-start gap-1 text-[11px] text-gray-500">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-[#FF6A00]" />
                  <span className="line-clamp-2">{pickupLabel(booking)}</span>
                </p>
              </div>

              <div
                className={cn(
                  "flex shrink-0 flex-col items-center justify-center rounded-xl border px-3 py-2 shadow-lg sm:px-3.5",
                  countdown?.late
                    ? "border-red-200 bg-gradient-to-br from-red-500 to-red-600 shadow-red-500/25"
                    : "border-orange-200 bg-gradient-to-br from-[#FF6A00] to-[#C83C00] shadow-orange-500/20",
                )}
              >
                <p className="text-[9px] font-bold uppercase tracking-wider text-white/90">
                  {countdown?.late
                    ? "Late return"
                    : countdown?.phase === "until_pickup"
                      ? "Pickup in"
                      : countdown?.phase === "settling"
                        ? "Status"
                        : "Time left"}
                </p>
                {countdown?.late ? (
                  <p className="mt-0.5 text-center text-xs font-bold leading-tight text-white sm:text-sm">
                    {countdown.overdueLabel
                      ? `+${countdown.overdueLabel}`
                      : "Overdue"}
                  </p>
                ) : countdown?.phase === "settling" ? (
                  <p className="mt-0.5 max-w-[4.5rem] text-center text-[10px] font-bold leading-tight text-white">
                    In progress
                  </p>
                ) : (
                  <p className="mt-0.5 text-sm font-bold leading-tight text-white sm:text-[15px]">
                    {countdown?.label || "—"}
                  </p>
                )}
              </div>
            </button>

            {countdown?.late ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                Late Return — please return the bike or request return ASAP. Extra charges may apply.
              </div>
            ) : null}

            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-gray-600">
              <div className="flex items-start gap-1.5 rounded-xl bg-gray-50 px-2.5 py-2">
                <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FF6A00]" />
                <div className="min-w-0">
                  <p className="font-semibold text-gray-400">Pickup</p>
                  <p className="font-bold text-gray-800">{formatRideDateTime(booking.startAt)}</p>
                </div>
              </div>
              <div className="flex items-start gap-1.5 rounded-xl bg-gray-50 px-2.5 py-2">
                <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FF6A00]" />
                <div className="min-w-0">
                  <p className="font-semibold text-gray-400">Return by</p>
                  <p className="font-bold text-gray-800">{formatRideDateTime(booking.endAt)}</p>
                </div>
              </div>
            </div>

            {/* Progress tracker */}
            <div className="mt-3.5">
              <div className="relative px-1">
                <div className="absolute left-3 right-3 top-[7px] h-0.5 bg-gray-100">
                  <div
                    className="h-full bg-[#FF6A00] transition-all duration-500"
                    style={{
                      width: `${(progressIndex / Math.max(1, RIDE_PROGRESS_STAGES.length - 1)) * 100}%`,
                    }}
                  />
                </div>
                <ol className="relative z-[1] flex justify-between gap-1">
                  {RIDE_PROGRESS_STAGES.map((stage, index) => {
                    const done = index < progressIndex;
                    const current = index === progressIndex;
                    return (
                      <li key={stage.key} className="flex w-10 flex-col items-center gap-1.5 sm:w-auto sm:flex-1">
                        <span
                          className={cn(
                            "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 bg-white",
                            done || current
                              ? "border-[#FF6A00] bg-[#FF6A00]"
                              : "border-gray-200",
                            current && "ring-4 ring-[#FF6A00]/20",
                          )}
                        />
                        <p
                          className={cn(
                            "hidden text-center text-[9px] font-bold leading-tight sm:block sm:text-[10px]",
                            current ? "text-[#FF6A00]" : done ? "text-gray-700" : "text-gray-400",
                          )}
                        >
                          {stage.label}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              </div>
              <p className="mt-2 text-center text-[11px] font-bold text-[#FF6A00] sm:hidden">
                {RIDE_PROGRESS_STAGES[progressIndex]?.label || statusLabel}
              </p>
            </div>

            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <ActionButton
                icon={ChevronRight}
                label="View Booking"
                onClick={goView}
              />
              <ActionButton
                icon={TimerReset}
                label="Extend Rental"
                disabled={!canExtend}
                onClick={() => navigate(`${getBikeRentActivePath(id)}?extend=1`)}
              />
              <ActionButton
                icon={Undo2}
                label="Return Bike"
                disabled={!canReturn}
                onClick={() => navigate(getBikeRentReturnPath(id))}
              />
              <ActionButton
                icon={Headphones}
                label="Contact Support"
                onClick={() => navigate(getBikeRentSupportPath())}
              />
            </div>
          </div>
        </div>
      </motion.section>
    </AnimatePresence>
  );
}

function ActionButton({ icon: Icon, label, onClick, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-1 rounded-xl border px-2 py-2 text-[11px] font-bold transition",
        disabled
          ? "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300"
          : "border-orange-100 bg-orange-50/80 text-[#FF6A00] hover:bg-[#FF6A00] hover:text-white active:scale-[0.98]",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}
