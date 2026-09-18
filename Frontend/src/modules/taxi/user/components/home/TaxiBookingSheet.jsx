import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Bike,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  Shield,
  Star,
  Wallet,
  X,
} from "lucide-react";
import BottomSheet from "../ui/BottomSheet";
import RideCouponPanel from "./RideCouponPanel";
import { formatInr } from "../../utils/mock/vehicles";
import { googleMapsNavUrl } from "../../utils/activeRide";

const SEARCHING = new Set(["requested", "searching"]);
const ASSIGNED = new Set(["assigned", "arriving", "arrived"]);
const LIVE = new Set(["in_progress"]);

function formatWaitClock(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** Live wait timer after driver arrived, before OTP start */
function PassengerWaitTimer({ arrivedAt, freeWaitMinutes = 0, perMinWaitRate = 0 }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const startedMs = arrivedAt ? new Date(arrivedAt).getTime() : NaN;
  if (!Number.isFinite(startedMs)) return null;

  const elapsedSec = Math.max(0, Math.floor((now - startedMs) / 1000));
  const freeSec = Math.max(0, Math.round(Number(freeWaitMinutes || 0) * 60));
  const overFree = elapsedSec > freeSec;
  const remainingFreeSec = Math.max(0, freeSec - elapsedSec);
  const billableMin = overFree ? Math.ceil((elapsedSec - freeSec) / 60) : 0;
  const rate = Number(perMinWaitRate || 0);

  return (
    <div
      className={`rounded-2xl px-4 py-3.5 ring-1 ${
        overFree
          ? "bg-amber-50 ring-amber-200/80"
          : "bg-neutral-50 ring-neutral-200/80"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-500">
            <Clock className="h-3.5 w-3.5 text-[#FF6A00]" />
            Waiting for you
          </p>
          <p className="mt-1.5 font-mono text-[28px] font-bold tracking-[0.12em] text-neutral-950">
            {formatWaitClock(elapsedSec)}
          </p>
          {!overFree && freeSec > 0 ? (
            <p className="mt-1 text-[12px] text-neutral-500">
              Free wait left · {formatWaitClock(remainingFreeSec)}
              {freeWaitMinutes > 0 ? ` of ${freeWaitMinutes} min` : ""}
            </p>
          ) : null}
          {!overFree && freeSec === 0 ? (
            <p className="mt-1 text-[12px] text-neutral-500">Driver is waiting at pickup</p>
          ) : null}
        </div>
      </div>

      {overFree ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-white px-3 py-2.5 ring-1 ring-amber-200/70">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="min-w-0 text-[12px] text-amber-950">
            <p className="font-semibold">Waiting charges apply</p>
            <p className="mt-0.5 text-amber-800/90">
              Free wait of {freeWaitMinutes || 0} min is over.
              {rate > 0
                ? ` Extra wait is ${formatInr(rate)}/min${
                    billableMin > 0 ? ` (~${formatInr(billableMin * rate)} so far)` : ""
                  }.`
                : " Extra waiting time may be added to your fare."}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OtpPinCard({ otp, arrived = false }) {
  const digits = String(otp || "").split("");
  return (
    <div
      className={`relative overflow-hidden rounded-[1.35rem] ${
        arrived
          ? "bg-gradient-to-b from-emerald-50 to-white ring-1 ring-emerald-200/80"
          : "bg-gradient-to-b from-[#FFF4ED] to-white ring-1 ring-[#FF6A00]/20"
      }`}
    >
      <div
        className={`absolute inset-x-0 top-0 h-1 ${
          arrived ? "bg-emerald-500" : "bg-[#FF6A00]"
        }`}
        aria-hidden
      />
      <div className="px-4 pb-4 pt-4 text-center">
        <div
          className={`mx-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${
            arrived
              ? "bg-emerald-600 text-white"
              : "bg-[#FF6A00] text-white"
          }`}
        >
          <Shield className="h-3 w-3" aria-hidden />
          {arrived ? "Driver arrived" : "Share to start"}
        </div>
        <p className="mt-2.5 text-[13px] font-medium text-neutral-600">
          Show this PIN to your driver
        </p>
        <div className="mt-3.5 flex items-center justify-center gap-2">
          {digits.length
            ? digits.map((d, i) => (
                <span
                  key={`${d}-${i}`}
                  className="flex h-[52px] w-11 items-center justify-center rounded-2xl bg-white font-mono text-[24px] font-bold text-neutral-950 shadow-[0_8px_20px_rgba(15,23,42,0.08)] ring-1 ring-black/[0.06]"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  {d}
                </span>
              ))
            : (
              <span className="font-mono text-[32px] font-bold tracking-[0.2em] text-neutral-950">
                {otp}
              </span>
            )}
        </div>
        {!arrived ? (
          <p className="mt-3 text-[11px] text-neutral-400">
            Keep this ready when your driver arrives
          </p>
        ) : (
          <p className="mt-3 text-[11px] font-medium text-emerald-700">
            Driver is waiting at pickup
          </p>
        )}
      </div>
    </div>
  );
}

function FindingRidePanel({ tick, activeRide, onCancelRide, pickupLabel, dropLabel, fare }) {
  const steps = ["Searching nearby", "Notifying drivers", "Confirming ride"];
  const activeStep = tick % steps.length;

  return (
    <div className="relative overflow-hidden px-4 py-5">
      <div
        className="pointer-events-none absolute -right-10 -top-8 h-36 w-36 rounded-full bg-[#FF6A00]/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-8 bottom-4 h-28 w-28 rounded-full bg-amber-300/15 blur-3xl"
        aria-hidden
      />

      <div className="relative flex flex-col items-center text-center">
        {/* Radar search visual */}
        <div className="relative flex h-[108px] w-[108px] items-center justify-center">
          <span className="absolute inset-0 rounded-full border border-[#FF6A00]/15" />
          <span className="absolute inset-2 animate-ping rounded-full bg-[#FF6A00]/10" />
          <span className="absolute inset-4 animate-pulse rounded-full border border-dashed border-[#FF6A00]/35" />
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#FF6A00] to-[#E85F00] text-white shadow-[0_12px_28px_rgba(255,106,0,0.35)]">
            <Navigation className="h-6 w-6" aria-hidden />
          </span>
          {/* Orbiting dots */}
          <span
            className="absolute h-2 w-2 rounded-full bg-[#FF6A00]"
            style={{
              top: "8%",
              left: "50%",
              transform: `rotate(${(tick * 40) % 360}deg) translateY(-42px) rotate(-${(tick * 40) % 360}deg)`,
            }}
            aria-hidden
          />
        </div>

        <h3 className="mt-4 text-[19px] font-bold tracking-[-0.03em] text-neutral-950">
          Finding your ride
        </h3>
        <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-neutral-500">
          Matching you with the closest available driver nearby.
        </p>

        {/* Live step indicators */}
        <div className="mt-5 flex w-full max-w-sm items-center justify-between gap-1 px-1">
          {steps.map((label, i) => {
            const on = i <= activeStep;
            return (
              <div key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span
                  className={`h-1.5 w-full rounded-full transition-colors duration-300 ${
                    on ? "bg-[#FF6A00]" : "bg-neutral-200"
                  }`}
                />
                <span
                  className={`truncate text-[10px] font-semibold ${
                    on ? "text-[#FF6A00]" : "text-neutral-400"
                  }`}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {(pickupLabel || dropLabel) ? (
          <div className="mt-5 w-full overflow-hidden rounded-[1.25rem] bg-white text-left shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-neutral-200/80">
            <div className="flex gap-3 px-3.5 py-3.5">
              <div className="flex w-3 flex-col items-center pt-1 pb-1">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/15" />
                <span className="my-1 w-px flex-1 bg-gradient-to-b from-emerald-400 to-[#FF6A00]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#FF6A00] ring-4 ring-[#FF6A00]/15" />
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-600/80">
                    Pickup
                  </p>
                  <p className="mt-0.5 truncate text-[13px] font-semibold text-neutral-900">
                    {pickupLabel || "Pickup"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#FF6A00]/80">
                    Drop
                  </p>
                  <p className="mt-0.5 truncate text-[13px] font-semibold text-neutral-900">
                    {dropLabel || "Drop"}
                  </p>
                </div>
              </div>
            </div>
            {Number.isFinite(fare) && fare > 0 ? (
              <div className="flex items-center justify-between border-t border-neutral-100 bg-[#FFF8F3] px-3.5 py-2.5">
                <span className="text-[12px] font-medium text-neutral-500">Estimated fare</span>
                <span className="text-[14px] font-bold text-neutral-950">{formatInr(fare)}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeRide?.rideNumber ? (
          <p className="mt-3 text-[11px] font-medium text-neutral-400">
            Ride {activeRide.rideNumber}
          </p>
        ) : null}

        <button
          type="button"
          onClick={onCancelRide}
          className="mt-5 inline-flex h-11 w-full max-w-sm cursor-pointer items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white text-sm font-semibold text-neutral-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
        >
          <X className="h-4 w-4" />
          Cancel request
        </button>
      </div>
    </div>
  );
}

function VehicleGlyph({ vehicle }) {
  if (vehicle?.iconUrl) {
    return (
      <img
        src={vehicle.iconUrl}
        alt=""
        className="h-8 w-8 object-contain"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
    );
  }
  const cat = String(vehicle?.category || vehicle?.name || "").toLowerCase();
  if (/\bbike\b/.test(cat)) return <Bike className="h-5 w-5 text-[#FF6A00]" />;
  if (/\bauto\b/.test(cat)) return <Car className="h-5 w-5 text-[#FF6A00]" />;
  if (/\bsuv\b/.test(cat)) return <Car className="h-5 w-5 text-[#FF6A00]" />;
  return <Car className="h-5 w-5 text-[#FF6A00]" />;
}

function formatKm(meters) {
  if (meters == null || !Number.isFinite(meters)) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatRouteDistanceKm(km, fallbackKm) {
  const n = Number(km > 0 ? km : fallbackKm);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 10) return `${n.toFixed(1)} km`;
  return `${Math.round(n * 10) / 10} km`;
}

/**
 * Multi-step booking sheet:
 * vehicles → confirm → finding → driver → trip → payment
 * Supports minimize / maximize for live ride phases.
 */
export default function TaxiBookingSheet({
  open,
  phase, // 'vehicles' | 'confirm' | 'finding' | 'driver' | 'trip' | 'payment'
  minimized = false,
  inline = false,
  onMinimize,
  onExpand,
  onClose,
  onSelectVehicle,
  onConfirmBook,
  onCancelRide,
  onPayWallet,
  onPayRazorpay,
  paymentBusy = false,
  pickupLabel = "",
  dropLabel = "",
  vehicles = [],
  quotesByVehicle = {},
  quotesLoading = false,
  selectedVehicle = null,
  selectedQuote = null,
  booking = false,
  activeRide = null,
  liveDistanceMeters = null,
  liveEtaMinutes = null,
  appliedCoupon = null,
  onApplyCoupon,
  onClearCoupon,
  routeDistanceKm = null,
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (phase !== "finding") return undefined;
    const t = setInterval(() => setTick((n) => n + 1), 900);
    return () => clearInterval(t);
  }, [phase]);

  const minDuration = useMemo(() => {
    if (!vehicles?.length || !quotesByVehicle) return null;
    let min = Infinity;
    vehicles.forEach(v => {
      const q = quotesByVehicle[v.id];
      if (q?.ok && q.durationMin < min) min = q.durationMin;
    });
    return min === Infinity ? null : min;
  }, [vehicles, quotesByVehicle]);

  const sortedVehicles = useMemo(() => {
    if (!vehicles) return [];
    return [...vehicles].sort((a, b) => {
      const qA = quotesByVehicle[a.id];
      const qB = quotesByVehicle[b.id];
      
      // Push unavailable vehicles to the bottom
      if (!qA?.ok && qB?.ok) return 1;
      if (qA?.ok && !qB?.ok) return -1;
      
      // Sort by fare ascending
      const fareA = qA?.fare || Infinity;
      const fareB = qB?.fare || Infinity;
      return fareA - fareB;
    });
  }, [vehicles, quotesByVehicle]);

  const title = useMemo(() => {
    if (phase === "vehicles") return "Choose a ride";
    if (phase === "confirm") return "Confirm booking";
    if (phase === "finding") return "Finding your ride";
    if (phase === "driver") {
      if (activeRide?.status === "arrived") return "Driver arrived";
      return "Driver on the way";
    }
    if (phase === "trip") return "Trip in progress";
    if (phase === "payment") return "Pay for your ride";
    return "Book ride";
  }, [phase, activeRide?.status]);

  const canDismiss = phase === "vehicles" || phase === "confirm";
  const isLivePhase =
    phase === "finding" ||
    phase === "driver" ||
    phase === "trip" ||
    phase === "payment";

  const baseFare = Number(selectedQuote?.fare ?? selectedQuote?.quote?.fareEstimateTotal ?? 0);
  const displayFare =
    appliedCoupon && Number.isFinite(Number(appliedCoupon.finalTotal))
      ? Number(appliedCoupon.finalTotal)
      : baseFare;
  const couponSaved = Number(appliedCoupon?.discountAmount || 0);
  const platformFee = Number(selectedQuote?.quote?.fare?.platformFee || 0);
  const quoteZoneId = selectedQuote?.quote?.zoneId || null;

  const fare = Number(
    activeRide?.fare?.total ??
      activeRide?.fareBreakdown?.total ??
      activeRide?.fareEstimateTotal ??
      selectedQuote?.fare ??
      0,
  );

  const mapsTarget = useMemo(() => {
    if (!activeRide) return null;
    if (LIVE.has(activeRide.status)) {
      return {
        lat: activeRide.drop?.lat,
        lng: activeRide.drop?.lng,
        label: activeRide.drop?.address || "Drop",
      };
    }
    return {
      lat: activeRide.pickup?.lat,
      lng: activeRide.pickup?.lng,
      label: activeRide.pickup?.address || "Pickup",
    };
  }, [activeRide]);

  const mapsUrl = mapsTarget
    ? googleMapsNavUrl(mapsTarget.lat, mapsTarget.lng, mapsTarget.label)
    : null;

  const statusBanner = useMemo(() => {
    if (!activeRide) return null;
    if (activeRide.status === "awaiting_payment") {
      return activeRide.payment?.status === "paid"
        ? "Payment received — driver will complete the ride"
        : "Trip finished — please pay to complete";
    }
    if (activeRide.status === "arrived") return "Driver has arrived";
    if (ASSIGNED.has(activeRide.status)) return "Driver is on the way to pickup";
    if (LIVE.has(activeRide.status)) return "You're on the trip — enjoy the ride";
    if (SEARCHING.has(activeRide.status)) return "Looking for nearby drivers";
    return null;
  }, [activeRide]);

  // Minimized floating bar for live phases
  if (open && minimized && isLivePhase && !inline) {
    return (
      <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[600] px-3">
        <button
          type="button"
          onClick={onExpand}
          className="mx-auto flex w-full max-w-lg items-center gap-3 rounded-[1.35rem] bg-neutral-950 px-4 py-3.5 text-left text-white shadow-[0_16px_40px_rgba(15,23,42,0.28)]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-sm font-bold">
            {activeRide?.driver?.photo ? (
              <img src={activeRide.driver.photo} alt="" className="h-full w-full object-cover" />
            ) : (
              (activeRide?.driver?.name || "R").charAt(0).toUpperCase()
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45">
              {title}
            </p>
            <p className="truncate text-[14px] font-semibold">
              {activeRide?.driver?.name || "Your ride"}
              {Number.isFinite(fare) && fare > 0 ? ` · ${formatInr(fare)}` : ""}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-white/65">
              {activeRide?.status === "arrived"
                ? "Waiting · share your PIN"
                : activeRide?.rideOtp && ASSIGNED.has(activeRide.status)
                  ? `PIN ${activeRide.rideOtp}`
                  : `${formatKm(liveDistanceMeters)}${
                      liveEtaMinutes != null ? ` · ~${liveEtaMinutes} min` : ""
                    }`}
            </p>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FF6A00]">
            <ChevronUp className="h-5 w-5" />
          </span>
        </button>
      </div>
    );
  }

  const liveRideBody =
    (phase === "driver" || phase === "trip" || phase === "payment") && activeRide ? (
      <div className="space-y-3 px-4 pb-3 pt-1">
        {/* OTP / status (hidden on payment — receipt already explains the state) */}
        {phase !== "payment" &&
        activeRide.rideOtp &&
        (activeRide.status === "arrived" || ASSIGNED.has(activeRide.status)) ? (
          <OtpPinCard
            otp={activeRide.rideOtp}
            arrived={activeRide.status === "arrived"}
          />
        ) : phase !== "payment" && statusBanner ? (
          <div
            className={`rounded-2xl px-3.5 py-3 text-center text-[13px] font-semibold ${
              activeRide.status === "awaiting_payment"
                ? "bg-[#FFF4ED] text-[#FF6A00] ring-1 ring-[#FF6A00]/20"
                : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70"
            }`}
          >
            {statusBanner}
          </div>
        ) : null}

        {String(activeRide.status || "").toLowerCase() === "arrived" ? (
          <PassengerWaitTimer
            arrivedAt={activeRide.arrivedAt}
            freeWaitMinutes={activeRide.waitPolicy?.freeWaitMinutes}
            perMinWaitRate={activeRide.waitPolicy?.perMinWaitRate}
          />
        ) : null}

        {phase === "payment" ? (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-[1.35rem] bg-neutral-950 text-white shadow-[0_16px_40px_rgba(15,23,42,0.18)]">
              <div className="px-4 pb-1 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/45">
                  Total payable
                </p>
                <p className="mt-1 text-[34px] font-bold tracking-[-0.03em] leading-none">
                  {formatInr(fare)}
                </p>
                {activeRide.rideNumber ? (
                  <p className="mt-2 text-[12px] text-white/50">
                    Ride {activeRide.rideNumber}
                  </p>
                ) : null}
              </div>
              <div className="mt-3 space-y-1.5 rounded-t-[1.2rem] bg-white px-4 py-3.5 text-[13px] text-neutral-600">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-400">
                  Fare breakdown
                </p>
                {[
                  ["Base fare", activeRide.fareBreakdown?.base ?? activeRide.fare?.base],
                  ["Distance", activeRide.fareBreakdown?.distance ?? activeRide.fare?.distance],
                  [
                    Number(activeRide.fareBreakdown?.waitingMin ?? activeRide.waitingMin ?? 0) > 0
                      ? `Waiting (${Number(activeRide.fareBreakdown?.waitingMin ?? activeRide.waitingMin)} min)`
                      : "Waiting",
                    activeRide.fareBreakdown?.waiting ?? activeRide.fare?.waiting,
                  ],
                  [
                    (activeRide.fareBreakdown?.surgeSlotName || activeRide.fare?.surgeSlotName)
                      ? `${activeRide.fareBreakdown?.surgeSlotName || activeRide.fare?.surgeSlotName} surge`
                      : "Peak surge",
                    activeRide.fareBreakdown?.timeSlotSurge ?? activeRide.fare?.timeSlotSurge,
                  ],
                  ["Platform fee", activeRide.fareBreakdown?.platformFee ?? activeRide.fare?.platformFee],
                ]
                  .filter(([, v]) => v != null && Number(v) !== 0)
                  .map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-2">
                      <span className="min-w-0 pr-2">{label}</span>
                      <span className="shrink-0 font-semibold text-neutral-900">
                        {formatInr(value)}
                      </span>
                    </div>
                  ))}
                {Number(
                  activeRide.fareBreakdown?.discount ??
                    activeRide.fare?.discount ??
                    activeRide.coupon?.discountAmount ??
                    0,
                ) > 0 ? (
                  <div className="flex justify-between gap-2 text-emerald-700">
                    <span className="min-w-0 pr-2">
                      Offer
                      {activeRide.coupon?.code || activeRide.fareBreakdown?.couponCode
                        ? ` · ${activeRide.coupon?.code || activeRide.fareBreakdown?.couponCode}`
                        : ""}
                    </span>
                    <span className="shrink-0 font-semibold">
                      −
                      {formatInr(
                        activeRide.fareBreakdown?.discount ??
                          activeRide.fare?.discount ??
                          activeRide.coupon?.discountAmount,
                      )}
                    </span>
                  </div>
                ) : null}
                {Number(activeRide.fareBreakdown?.originalTotal ?? activeRide.fare?.originalTotal) >
                  Number(fare) &&
                Number(
                  activeRide.fareBreakdown?.discount ?? activeRide.fare?.discount ?? 0,
                ) > 0 ? (
                  <div className="flex justify-between gap-2 text-neutral-400">
                    <span>Before offer</span>
                    <span className="line-through">
                      {formatInr(
                        activeRide.fareBreakdown?.originalTotal ?? activeRide.fare?.originalTotal,
                      )}
                    </span>
                  </div>
                ) : null}
                <div className="flex justify-between gap-2 border-t border-neutral-100 pt-2 text-[14px] font-bold text-neutral-950">
                  <span>Total payable</span>
                  <span>{formatInr(fare)}</span>
                </div>
              </div>
            </div>

            {activeRide.payment?.status === "paid" ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-50 px-3 py-3.5 text-[13px] font-semibold text-emerald-700 ring-1 ring-emerald-200/70">
                <CheckCircle2 className="h-4 w-4" />
                Paid via {String(activeRide.payment?.method || "").replace(/_/g, " ")}
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={paymentBusy}
                    onClick={onPayWallet}
                    className="inline-flex h-[52px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-2xl bg-[#FF6A00] px-2 text-white shadow-[0_10px_28px_rgba(255,106,0,0.32)] transition hover:bg-[#E85F00] disabled:opacity-50"
                  >
                    {paymentBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wallet className="h-4 w-4" aria-hidden />
                    )}
                    <span className="text-[12px] font-semibold">Pay via wallet</span>
                  </button>
                  <button
                    type="button"
                    disabled={paymentBusy}
                    onClick={onPayRazorpay}
                    className="inline-flex h-[52px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-2xl border border-neutral-200 bg-white px-2 text-neutral-900 transition hover:bg-neutral-50 disabled:opacity-50"
                  >
                    <CreditCard className="h-4 w-4 text-[#FF6A00]" aria-hidden />
                    <span className="text-[12px] font-semibold">Pay online</span>
                  </button>
                </div>
                <p className="text-center text-[11px] leading-relaxed text-neutral-500">
                  Prefer cash or driver’s QR? Pay there — this screen updates automatically.
                </p>
              </div>
            )}
          </div>
        ) : null}

        {phase !== "payment" ? (
          <>
            {/* Live metrics strip */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Fare", value: formatInr(fare), icon: null },
                { label: "Left", value: formatKm(liveDistanceMeters), icon: null },
                {
                  label: phase === "trip" ? "ETA drop" : "ETA",
                  value: liveEtaMinutes != null ? `${liveEtaMinutes} min` : "—",
                  accent: true,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`rounded-2xl px-2 py-2.5 text-center ring-1 ${
                    item.accent
                      ? "bg-[#FFF4ED] ring-[#FF6A00]/20"
                      : "bg-neutral-50 ring-neutral-200/70"
                  }`}
                >
                  <p
                    className={`text-[15px] font-bold leading-tight tracking-[-0.02em] ${
                      item.accent ? "text-[#FF6A00]" : "text-neutral-950"
                    }`}
                  >
                    {item.value}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>

            {/* Driver card */}
            <div className="relative overflow-hidden rounded-[1.35rem] bg-white p-3.5 shadow-[0_10px_28px_rgba(15,23,42,0.06)] ring-1 ring-neutral-200/80">
              {phase === "trip" ? (
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-2.5 py-2 text-[11px] font-semibold text-emerald-700">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-60" />
                    <span className="relative h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  Live trip · heading to your drop
                </div>
              ) : activeRide.status === "arrived" ? (
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-2.5 py-2 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Driver is at your pickup point
                </div>
              ) : (
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-[#FFF4ED] px-2.5 py-2 text-[11px] font-semibold text-[#FF6A00]">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inset-0 animate-ping rounded-full bg-[#FF6A00] opacity-50" />
                    <span className="relative h-2 w-2 rounded-full bg-[#FF6A00]" />
                  </span>
                  Driver en route to pickup
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#FFF4ED] to-neutral-100 text-lg font-bold text-[#FF6A00] ring-1 ring-[#FF6A00]/15">
                    {activeRide.driver?.photo ? (
                      <img
                        src={activeRide.driver.photo}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      (activeRide.driver?.name || "D").charAt(0).toUpperCase()
                    )}
                  </div>
                  <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06]">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-semibold tracking-[-0.02em] text-neutral-950">
                    {activeRide.driver?.name || "Your driver"}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] font-medium text-neutral-500">
                    {Number(activeRide.driver?.rating || 0).toFixed(1)} rating
                    {" · "}
                    {activeRide.driver?.vehicleType ||
                      activeRide.vehicleType?.name ||
                      "Vehicle"}
                  </p>
                </div>
                <div className="shrink-0 rounded-xl bg-neutral-950 px-2.5 py-2 text-center shadow-sm">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-white">
                    {activeRide.driver?.vehicleNumber || "—"}
                  </span>
                </div>
              </div>
            </div>

            {(() => {
              const status = String(activeRide.status || "").toLowerCase();
              const hideCall = status === "arrived" || phase === "trip" || LIVE.has(status);
              const showMaps = phase === "trip" && mapsUrl;

              if (hideCall && !showMaps) return null;

              if (hideCall && showMaps) {
                return (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#FFF4ED] text-sm font-semibold text-[#FF6A00] ring-1 ring-[#FF6A00]/20 transition hover:bg-[#FFE8D6]"
                  >
                    <Navigation className="h-4 w-4" />
                    Open in Maps
                  </a>
                );
              }

              return (
                <div className={`grid gap-2.5 ${showMaps ? "grid-cols-2" : "grid-cols-1"}`}>
                  {activeRide.driver?.phone ? (
                    <a
                      href={`tel:${activeRide.driver.phone}`}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#FF6A00] text-sm font-semibold text-white shadow-[0_8px_22px_rgba(255,106,0,0.28)] transition hover:bg-[#E85F00]"
                    >
                      <Phone className="h-4 w-4" />
                      Call driver
                    </a>
                  ) : (
                    <div className="inline-flex h-12 items-center justify-center rounded-2xl bg-neutral-100 text-sm font-semibold text-neutral-400">
                      Call unavailable
                    </div>
                  )}
                  {showMaps ? (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white text-sm font-semibold text-neutral-800"
                    >
                      <Navigation className="h-4 w-4 text-[#FF6A00]" />
                      Maps
                    </a>
                  ) : null}
                </div>
              );
            })()}

            <div className="rounded-[1.25rem] bg-neutral-50 px-3.5 py-3 ring-1 ring-neutral-200/70">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-[#FF6A00] shadow-sm ring-1 ring-black/[0.04]">
                  <MapPin className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
                    {LIVE.has(activeRide.status) ? "Dropping at" : "Picking up from"}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[13px] font-semibold text-neutral-900">
                    {LIVE.has(activeRide.status)
                      ? activeRide.drop?.address || dropLabel
                      : activeRide.pickup?.address || pickupLabel}
                  </p>
                  {activeRide.rideNumber ? (
                    <p className="mt-1 text-[11px] font-medium text-neutral-400">
                      Ride {activeRide.rideNumber}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            {SEARCHING.has(activeRide.status) || ASSIGNED.has(activeRide.status) ? (
              <button
                type="button"
                onClick={onCancelRide}
                className="h-11 w-full cursor-pointer rounded-2xl border border-neutral-200 text-sm font-semibold text-neutral-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              >
                Cancel ride
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    ) : null;

  // Compact inline panel under tracking map (full booking flow when parent owns layout)
  if (inline && open) {
    const canGrowPanel = phase === "vehicles" || phase === "confirm";

    // Keep sheet scroll isolated so the map behind never pans / resizes
    const stopMapBleed = (event) => {
      event.stopPropagation();
    };

    return (
      <div
        className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white"
        onWheel={stopMapBleed}
        onTouchMove={stopMapBleed}
        onScroll={stopMapBleed}
      >
        {canGrowPanel ? (
          <div className="flex w-full flex-col items-center pt-2 pb-1" aria-hidden>
            <span className="h-1 w-10 rounded-full bg-neutral-300" />
          </div>
        ) : null}

        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-100 px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="truncate text-[17px] font-bold tracking-[-0.02em] text-neutral-950">
              {title}
            </h2>
            {(pickupLabel || dropLabel) && canGrowPanel ? (
              <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                {[pickupLabel, dropLabel].filter(Boolean).join(" → ")}
              </p>
            ) : phase === "payment" ? (
              <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                Complete payment to finish your ride
              </p>
            ) : phase === "finding" ? (
              <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                Matching nearby drivers…
              </p>
            ) : phase === "driver" ? (
              <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                {activeRide?.status === "arrived"
                  ? "Share your PIN to begin"
                  : "Track your driver on the map"}
              </p>
            ) : phase === "trip" ? (
              <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                Enjoy the ride · ETA updating live
              </p>
            ) : null}
          </div>
          {phase === "payment" ? (
            <button
              type="button"
              onClick={onMinimize}
              className="flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-neutral-100 px-3.5 text-[12px] font-semibold text-neutral-700 transition hover:bg-neutral-200"
              aria-label="Minimize payment"
            >
              Later
            </button>
          ) : isLivePhase ? (
            <button
              type="button"
              onClick={onMinimize}
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-neutral-100 text-neutral-600 transition hover:bg-neutral-200"
              aria-label="Minimize"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          ) : canDismiss ? (
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-neutral-100 text-neutral-600 transition hover:bg-neutral-200"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <span className="h-9 w-9 shrink-0" />
          )}
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y"
          style={{ overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}
          onWheel={stopMapBleed}
          onTouchMove={stopMapBleed}
        >
          {(phase === "vehicles" || phase === "confirm") && (
            <div className="flex min-h-0 flex-col pb-2">
              {quotesLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-neutral-500">
                  <Loader2 className="h-4 w-4 animate-spin text-[#FF6A00]" />
                  Calculating fares…
                </div>
              ) : null}

              {!quotesLoading && !vehicles.length ? (
                <p className="py-8 text-center text-sm text-neutral-500">
                  No vehicle types available. Add them in Taxi Admin.
                </p>
              ) : null}

              <div className="space-y-0.5 px-3 py-2">
                {!quotesLoading &&
                  sortedVehicles.map((vehicle, index) => {
                    const quote = quotesByVehicle[vehicle.id];
                    const available = quote?.ok;
                    const isSelected = selectedVehicle?.id === vehicle.id;
                    const showTag = available && index === 0;
                    const dropTime = available
                      ? new Date(Date.now() + quote.durationMin * 60000)
                          .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
                          .toLowerCase()
                      : "";
                    const distanceLabel = available
                      ? formatRouteDistanceKm(routeDistanceKm, quote.distanceKm)
                      : null;

                    return (
                      <button
                        key={vehicle.id}
                        type="button"
                        disabled={!available}
                        onClick={() => available && onSelectVehicle?.(vehicle)}
                        className={`flex w-full cursor-pointer items-center gap-3.5 p-3.5 text-left transition-all ${
                          !available
                            ? "cursor-not-allowed opacity-50 grayscale"
                            : isSelected
                              ? "rounded-2xl border-2 border-neutral-900 bg-neutral-50 shadow-sm"
                              : "rounded-2xl border-2 border-transparent hover:bg-neutral-50"
                        }`}
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-100">
                          <VehicleGlyph vehicle={vehicle} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="block truncate text-[16px] font-semibold text-neutral-900">
                              {vehicle.name}
                            </span>
                            {showTag ? (
                              <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                Best
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-[12px] font-medium text-neutral-500">
                            {available
                              ? [
                                  distanceLabel,
                                  `${Math.max(1, Math.round(quote.durationMin || 0))} mins`,
                                  `Drop ${dropTime}`,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")
                              : quote?.message || "Pricing not configured"}
                          </span>
                        </span>
                        <span className="shrink-0 pl-2 text-right">
                          {available ? (
                            isSelected && couponSaved > 0 ? (
                              <span className="block">
                                <span className="block text-[11px] font-medium text-neutral-400 line-through">
                                  {formatInr(quote.fare)}
                                </span>
                                <span className="text-[17px] font-bold text-emerald-700">
                                  {formatInr(displayFare)}
                                </span>
                              </span>
                            ) : (
                              <span className="text-[17px] font-bold text-neutral-950">
                                {formatInr(quote.fare)}
                              </span>
                            )
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {phase === "finding" && (
            <FindingRidePanel
              tick={tick}
              activeRide={activeRide}
              onCancelRide={onCancelRide}
              pickupLabel={pickupLabel}
              dropLabel={dropLabel}
              fare={fare}
            />
          )}

          {liveRideBody}
        </div>

        {selectedVehicle && selectedQuote?.ok && (phase === "vehicles" || phase === "confirm") ? (
          <div className="shrink-0 border-t border-neutral-100 bg-white px-4 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-3">
            <RideCouponPanel
              vehicleTypeId={selectedVehicle?.id}
              zoneId={quoteZoneId}
              baseFare={baseFare}
              platformFee={platformFee}
              appliedCoupon={appliedCoupon}
              onApply={onApplyCoupon}
              onClear={onClearCoupon}
              disabled={booking}
            />
            {Number(selectedQuote?.quote?.fare?.timeSlotSurge || 0) > 0 ? (
              <p className="mb-2 text-center text-[12px] font-medium text-amber-700">
                Includes {(selectedQuote.quote.fare.surgeSlotName || "peak")} surge:{" "}
                {formatInr(selectedQuote.quote.fare.timeSlotSurge)}
              </p>
            ) : null}
            {couponSaved > 0 ? (
              <p className="mb-2 text-center text-[12px] font-semibold text-emerald-700">
                Promo saves {formatInr(couponSaved)} · pay {formatInr(displayFare)}
              </p>
            ) : null}
            <button
              type="button"
              disabled={booking}
              onClick={onConfirmBook}
              className="flex h-12 w-full cursor-pointer items-center justify-center rounded-2xl bg-[#FF6A00] text-[15px] font-semibold text-white shadow-[0_8px_22px_rgba(255,106,0,0.28)] transition hover:bg-[#E85F00] disabled:opacity-70"
            >
              {booking ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              Book {selectedVehicle.name}
              {displayFare > 0 ? ` · ${formatInr(displayFare)}` : ""}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <BottomSheet
      open={open && !minimized}
      onClose={canDismiss ? onClose : () => onMinimize?.()}
      title={title}
      className="flex flex-col max-h-[60vh] overflow-hidden"
      showClose={canDismiss}
      dismissOnBackdrop={canDismiss}
      hasBackdrop={false}
      headerRight={
        phase === "payment" ? (
          <button
            type="button"
            onClick={onMinimize}
            className="flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-gray-100 px-3 text-[12px] font-semibold text-gray-700"
            aria-label="Minimize payment"
          >
            Later
          </button>
        ) : isLivePhase ? (
          <button
            type="button"
            onClick={onMinimize}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-600"
            aria-label="Minimize"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        ) : null
      }
    >
      {/* Route summary removed as per screenshot design (it's part of map behind sheet in UI, so no longer needed here) */}

      {/* Vehicles list & Booking Footer */}
      {(phase === "vehicles" || phase === "confirm") && (
        <div className="flex min-h-0 flex-1 flex-col pb-2">
          {quotesLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin text-[#FF6A00]" />
              Calculating fares…
            </div>
          ) : null}

          {!quotesLoading && !vehicles.length ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No vehicle types available. Add them in Taxi Admin.
            </p>
          ) : null}

          <div className="flex-1 overflow-y-auto overscroll-y-contain space-y-0.5 pb-2 px-3">
            {!quotesLoading &&
              sortedVehicles.map((vehicle, index) => {
                const quote = quotesByVehicle[vehicle.id];
                const available = quote?.ok;
                const isSelected = selectedVehicle?.id === vehicle.id;
                // Only show tag on the lowest price vehicle
                const showTag = available && index === 0;
                
                const dropTime = available 
                  ? new Date(Date.now() + (quote.durationMin * 60000))
                      .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                      .toLowerCase() 
                  : "";
                const distanceLabel = available
                  ? formatRouteDistanceKm(routeDistanceKm, quote.distanceKm)
                  : null;

                return (
                  <button
                    key={vehicle.id}
                    type="button"
                    disabled={!available}
                    onClick={() => available && onSelectVehicle?.(vehicle)}
                    className={`flex w-full items-center gap-4 p-3.5 text-left transition-all ${
                      !available
                        ? "cursor-not-allowed opacity-50 grayscale"
                        : isSelected
                          ? "rounded-xl border-2 border-slate-900 bg-slate-50/50 shadow-sm"
                          : "rounded-xl border-2 border-transparent bg-transparent hover:bg-slate-50 active:bg-slate-100"
                    }`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center">
                      <VehicleGlyph vehicle={vehicle} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="block truncate text-[17px] font-semibold text-slate-800">
                          {vehicle.name}
                        </span>
                        {showTag && (
                          <span className="rounded bg-[#E5F5EC] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0E703A]">
                            FASTEST
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[13px] font-medium text-slate-500">
                        {available
                          ? [
                              distanceLabel,
                              `${Math.max(1, Math.round(quote.durationMin || 0))} mins`,
                              `Drop ${dropTime}`,
                            ]
                              .filter(Boolean)
                              .join(" • ")
                          : quote?.message || "Pricing not configured"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right pl-2">
                      {available ? (
                        isSelected && couponSaved > 0 ? (
                          <span className="block">
                            <span className="block text-[11px] font-medium text-slate-400 line-through">
                              {formatInr(quote.fare)}
                            </span>
                            <span className="text-[18px] font-bold text-emerald-700">
                              {formatInr(displayFare)}
                            </span>
                          </span>
                        ) : (
                          <span className="flex items-center justify-end text-[18px] font-bold text-slate-900">
                            {formatInr(quote.fare)}
                          </span>
                        )
                      ) : null}
                    </span>
                  </button>
                );
              })}
          </div>

          {selectedVehicle && selectedQuote?.ok && (
            <div className="mt-1 shrink-0 bg-white px-4 pb-4 pt-2">
              <RideCouponPanel
                vehicleTypeId={selectedVehicle?.id}
                zoneId={quoteZoneId}
                baseFare={baseFare}
                platformFee={platformFee}
                appliedCoupon={appliedCoupon}
                onApply={onApplyCoupon}
                onClear={onClearCoupon}
                disabled={booking}
              />
              {Number(selectedQuote?.quote?.fare?.timeSlotSurge || 0) > 0 ? (
                <p className="mb-2 text-center text-[12px] font-medium text-amber-700">
                  Includes {(selectedQuote.quote.fare.surgeSlotName || "peak")} surge:{" "}
                  {formatInr(selectedQuote.quote.fare.timeSlotSurge)}
                </p>
              ) : null}
              {couponSaved > 0 ? (
                <p className="mb-2 text-center text-[12px] font-semibold text-emerald-700">
                  Promo saves {formatInr(couponSaved)} · pay {formatInr(displayFare)}
                </p>
              ) : null}
              <button
                type="button"
                disabled={booking}
                onClick={onConfirmBook}
                className="flex w-full items-center justify-center rounded-xl bg-[#FFCC00] py-3.5 text-[17px] font-semibold text-black transition-colors active:bg-[#E5B700] disabled:opacity-70"
              >
                {booking ? <Loader2 className="mr-2 h-5 w-5 animate-spin text-black" /> : null}
                Book {selectedVehicle.name}
                {displayFare > 0 ? ` · ${formatInr(displayFare)}` : ""}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Finding */}
      {phase === "finding" && (
        <FindingRidePanel
          tick={tick}
          activeRide={activeRide}
          onCancelRide={onCancelRide}
          pickupLabel={pickupLabel}
          dropLabel={dropLabel}
          fare={fare}
        />
      )}

      {liveRideBody}
    </BottomSheet>
  );
}
