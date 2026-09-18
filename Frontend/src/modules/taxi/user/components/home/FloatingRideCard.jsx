import { useEffect, useState } from "react";
import { ArrowRight, Crosshair, Navigation2 } from "lucide-react";
import PlaceAutocompleteInput from "./PlaceAutocompleteInput";

/**
 * Single booking card over the map seam.
 *
 * Both locations are entered here — pickup and drop each have their own
 * typeahead, so the rider never leaves the home screen to set a route.
 * The map underneath stays in sync: dragging it updates the pickup field, and
 * picking a pickup suggestion recentres the map.
 */
export default function FloatingRideCard({
  isLiveRide = false,
  rideStatus = "",
  onOpenActiveRide,
  locationTitle = "Current location",
  locationSubtitle = "",
  onUseMapPickup,
  canUseMapPickup = false,
  mapMoved = false,
  destination = "",
  destinationPlace = null,
  onDestinationChange,
  onSelectDropPlace,
  onClearDrop,
  routeReady = false,
  onViewRides,
  onSelectPickupPlace,
  biasLocation = null,
  locked = false,
}) {
  const [pickupQuery, setPickupQuery] = useState("");
  const [pickupFocused, setPickupFocused] = useState(false);

  // Mirror the resolved pickup (or the live map centre) into the field unless
  // the rider is actively typing their own text.
  useEffect(() => {
    if (pickupFocused) return;
    setPickupQuery(locationSubtitle || locationTitle || "");
  }, [locationSubtitle, locationTitle, pickupFocused]);

  if (isLiveRide) {
    const finding = rideStatus === "searching" || rideStatus === "requested";
    return (
      <div className="overflow-hidden rounded-[1.75rem] bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.18)] ring-1 ring-black/[0.04]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[20px] font-bold tracking-[-0.03em] text-neutral-950">
              {finding ? "Finding a driver" : "Ride in progress"}
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              {finding
                ? "Your ride request is still active — tap to continue"
                : "Resume tracking for your current trip"}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-xl px-2.5 py-2 text-center text-[12px] font-bold leading-tight text-white ${
              finding ? "bg-[#FF6A00]" : "bg-emerald-500"
            }`}
          >
            {finding ? "Finding" : "Live"}
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenActiveRide}
          className="mt-4 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-neutral-950 text-sm font-semibold text-white transition duration-200 hover:bg-neutral-800"
        >
          <Navigation2 className="h-4 w-4" aria-hidden />
          {finding
            ? "Back to finding drivers"
            : rideStatus === "assigned" || rideStatus === "arriving"
              ? "Back to live tracking"
              : rideStatus === "awaiting_payment"
                ? "Open payment"
                : "Open ride details"}
        </button>
      </div>
    );
  }

  return (
    <div className="relative overflow-visible rounded-[1.75rem] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.18)] ring-1 ring-black/[0.04]">
      <div className="px-4 pb-4 pt-4">
        <h2 className="text-[19px] font-bold tracking-[-0.03em] text-neutral-950">
          Where are you going?
        </h2>
        <p className="mt-0.5 text-[12px] text-neutral-500">
          Set both stops to see fares
        </p>

        {/* Pickup → drop, joined by the route rail */}
        <div className="relative mt-3.5">
          <span
            className="pointer-events-none absolute left-[1.15rem] top-[1.6rem] bottom-[1.6rem] w-px border-l border-dashed border-neutral-300"
            aria-hidden
          />

          <div className="space-y-2.5">
            <div onFocusCapture={() => setPickupFocused(true)} onBlurCapture={() => setPickupFocused(false)}>
              <PlaceAutocompleteInput
                id="taxi-pickup-input"
                value={pickupQuery}
                onValueChange={setPickupQuery}
                onResolvePlace={onSelectPickupPlace}
                placeholder="Pickup location"
                ariaLabel="Pickup location"
                disabled={locked}
                biasLocation={biasLocation}
                dotClassName="bg-emerald-500"
              />
            </div>

            <PlaceAutocompleteInput
              id="taxi-drop-input"
              value={destination}
              onValueChange={onDestinationChange}
              onResolvePlace={onSelectDropPlace}
              onClear={onClearDrop}
              placeholder="Where to?"
              ariaLabel="Drop location"
              disabled={locked}
              biasLocation={biasLocation}
              dotClassName="bg-[#FF6A00]"
            />
          </div>
        </div>

        {/* Offer the map centre as pickup only once the rider has moved it */}
        {mapMoved && canUseMapPickup && !locked ? (
          <button
            type="button"
            onClick={onUseMapPickup}
            className="mt-2.5 flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#FFF4ED] text-[13px] font-semibold text-[#C2410C] ring-1 ring-[#FF6A00]/20 transition hover:bg-[#FFE8D6]"
          >
            <Crosshair className="h-3.5 w-3.5" aria-hidden />
            Use map location as pickup
          </button>
        ) : null}

        <button
          type="button"
          onClick={onViewRides}
          disabled={!routeReady}
          className="mt-3 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-[#FF6A00] text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.3)] transition duration-200 hover:bg-[#E85F00] disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400 disabled:shadow-none"
        >
          {routeReady
            ? "See rides"
            : destinationPlace || destination
              ? "Set a pickup location"
              : "Enter your destination"}
          {routeReady ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
        </button>
      </div>
    </div>
  );
}
