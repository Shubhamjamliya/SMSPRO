import { AlertTriangle, Bike, ChevronRight, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { getBikeRentBikePath } from "../utils/routes";
import { formatInr } from "../utils/format";
import { bikeIdOf, bikeTitle } from "../utils/bikeDisplay";

function formatSlot(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Shows booking conflict details + next slot CTA + alternate bikes.
 */
export default function ConflictBanner({
  check,
  className,
  onUseNextSlot,
}) {
  if (!check || check.available) return null;

  const message = check.message
    || check.details?.message
    || "This time slot is not available.";
  const nextSlot = check.nextSlot || check.details?.nextSlot;
  const alternates = check.alternateBikes || check.details?.alternateBikes || [];
  const buffer = check.bufferMinutes ?? check.details?.bufferMinutes;

  return (
    <div
      className={cn(
        "rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-amber-950 shadow-sm",
        className,
      )}
      role="alert"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-xs font-extrabold">Slot unavailable</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-amber-900/90">{message}</p>
            {buffer != null ? (
              <p className="mt-1 text-[10px] text-amber-800/80">
                Turnaround buffer: {buffer} min between rentals
              </p>
            ) : null}
          </div>

          {nextSlot?.startAt ? (
            <button
              type="button"
              onClick={() => onUseNextSlot?.(nextSlot)}
              className="inline-flex w-full items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-left text-[11px] font-bold text-gray-800 shadow-sm ring-1 ring-amber-100"
            >
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0 text-[#FF6A00]" />
                <span className="truncate">
                  Next available: {formatSlot(nextSlot.startAt)}
                  {nextSlot.endAt ? ` → ${formatSlot(nextSlot.endAt)}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-[#FF6A00]">Use</span>
            </button>
          ) : null}

          {alternates.length ? (
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-800/80">
                Alternate bikes
              </p>
              <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {alternates.map((bike) => {
                  const id = bikeIdOf(bike);
                  return (
                    <Link
                      key={id}
                      to={getBikeRentBikePath(id)}
                      className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-2.5 py-2 text-[11px] font-semibold text-gray-800 shadow-sm ring-1 ring-amber-100"
                    >
                      <Bike className="h-3.5 w-3.5 text-[#FF6A00]" />
                      <span className="max-w-[8rem] truncate">{bikeTitle(bike)}</span>
                      <span className="text-[#FF6A00]">{formatInr(bike.hourlyPrice)}/hr</span>
                      <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
