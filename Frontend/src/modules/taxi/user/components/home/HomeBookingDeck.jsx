import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Navigation2,
  Search,
} from "lucide-react";
import ExploreCity from "./ExploreCity";

function greetingForNow(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return "Late night ride?";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Heading out?";
}

/**
 * Sparse, production booking deck for map-first taxi home.
 * Keeps one primary job: start a trip.
 */
export default function HomeBookingDeck({
  deckRef,
  isLiveRide,
  rideStatus,
  onOpenActiveRide,
  destination,
  destinationPlace,
  onOpenDestinationSearch,
  cityName,
  onSelectPlace,
  pickupConfirmed,
  dropReady,
  routeReady,
  locationTitle,
  onViewRides,
  onOpenWallet,
}) {
  const reduceMotion = useReducedMotion();
  const greeting = greetingForNow();
  const dropLabel = destinationPlace?.address || destination || "";
  const hasDrop = Boolean(destinationPlace?.address || destination);

  return (
    <motion.div
      ref={deckRef}
      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-auto mx-auto max-w-lg overflow-hidden rounded-[1.75rem] bg-white shadow-[0_20px_60px_rgba(15,23,42,0.22)] ring-1 ring-black/[0.06]"
    >
      <div className="flex justify-center pt-3" aria-hidden>
        <span className="h-1 w-9 rounded-full bg-neutral-200" />
      </div>

      <div className="space-y-4 px-4 pb-4 pt-2.5">
        {isLiveRide ? (
          <div className="rounded-2xl bg-neutral-950 px-3.5 py-3.5 text-white">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FF6A00]">
                <Navigation2 className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold tracking-tight">Ride in progress</p>
                <p className="mt-0.5 text-xs leading-relaxed text-white/65">
                  Resume tracking or payment for your current trip.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenActiveRide}
              className="mt-3 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-neutral-950 transition duration-200 hover:bg-neutral-100"
            >
              {rideStatus === "assigned" || rideStatus === "arriving"
                ? "Back to live tracking"
                : rideStatus === "awaiting_payment"
                  ? "Open payment"
                  : "Open ride details"}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : (
          <>
            <div className="px-0.5">
              <p className="text-[13px] font-medium text-neutral-500">{greeting}</p>
              <h1 className="mt-0.5 text-[22px] font-semibold tracking-[-0.03em] text-neutral-950">
                Where are you going?
              </h1>
            </div>

            {/* Journey steps — quiet status, not a dashed box */}
            <ol className="flex items-center gap-2 px-0.5" aria-label="Booking progress">
              <li className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    pickupConfirmed
                      ? "bg-emerald-500 text-white"
                      : "bg-neutral-950 text-white"
                  }`}
                >
                  {pickupConfirmed ? <Check className="h-3.5 w-3.5" aria-hidden /> : "1"}
                </span>
                <span className="truncate text-xs font-medium text-neutral-600">
                  {pickupConfirmed ? locationTitle || "Pickup set" : "Confirm pickup"}
                </span>
              </li>
              <span className="h-px w-4 shrink-0 bg-neutral-200" aria-hidden />
              <li className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    dropReady
                      ? "bg-emerald-500 text-white"
                      : pickupConfirmed
                        ? "bg-neutral-950 text-white"
                        : "bg-neutral-200 text-neutral-500"
                  }`}
                >
                  {dropReady ? <Check className="h-3.5 w-3.5" aria-hidden /> : "2"}
                </span>
                <span className="truncate text-xs font-medium text-neutral-600">
                  {dropReady ? "Drop set" : "Choose drop"}
                </span>
              </li>
            </ol>
          </>
        )}

        {/* Primary destination control */}
        <button
          type="button"
          onClick={onOpenDestinationSearch}
          disabled={isLiveRide}
          className="group flex min-h-[58px] w-full cursor-pointer items-center gap-3 rounded-2xl bg-neutral-100/90 px-3.5 text-left outline-none transition duration-200 hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-[#FF6A00]/40 disabled:cursor-not-allowed disabled:opacity-55"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FF6A00] text-white shadow-[0_8px_20px_rgba(255,106,0,0.35)] transition duration-200 group-hover:scale-[1.03] motion-reduce:group-hover:scale-100">
            <Search className="h-5 w-5" strokeWidth={2.4} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold tracking-[-0.015em] text-neutral-950">
              {hasDrop ? dropLabel : "Search destination"}
            </span>
            <span className="mt-0.5 block text-xs text-neutral-500">
              {hasDrop ? "Tap to change drop" : "Airport, mall, home, office…"}
            </span>
          </span>
          {dropReady ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
          ) : (
            <ArrowRight className="h-4 w-4 shrink-0 text-neutral-400 transition duration-200 group-hover:translate-x-0.5 group-hover:text-neutral-600 motion-reduce:group-hover:translate-x-0" aria-hidden />
          )}
        </button>

        {!isLiveRide ? (
          <ExploreCity
            variant="chips"
            city={cityName}
            onSelectPlace={onSelectPlace}
          />
        ) : null}

        {!isLiveRide && routeReady ? (
          <button
            type="button"
            onClick={onViewRides}
            className="flex h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[#FF6A00] text-[15px] font-semibold text-white shadow-[0_12px_28px_rgba(255,106,0,0.35)] transition duration-200 hover:bg-[#E85F00] focus-visible:ring-2 focus-visible:ring-[#FF6A00]/45 focus-visible:ring-offset-2"
          >
            See rides & fares
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        ) : null}

        {!isLiveRide ? (
          <div className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-3">
            <p className="text-[11px] leading-relaxed text-neutral-400">
              Transparent fares · verified partners
            </p>
            <button
              type="button"
              onClick={onOpenWallet}
              className="cursor-pointer text-[12px] font-semibold text-[#FF6A00] outline-none transition duration-200 hover:text-[#E85F00] focus-visible:underline"
            >
              Wallet offers
            </button>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
