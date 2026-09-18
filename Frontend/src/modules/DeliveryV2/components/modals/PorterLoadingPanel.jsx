import React, { useEffect, useState } from "react";
import { Clock3, Package } from "lucide-react";
import {
  getPorterLoadingElapsedMin,
  getPorterLoadingOvertimeCharge,
} from "@/modules/DeliveryV2/utils/porterTripFlow";

const PORTER_BLUE = "#2F6BFF";

function formatClock(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Live loading timer for driver + user during Porter `loading` status.
 */
export default function PorterLoadingTimer({
  trip,
  className = "",
  title = "Parcel is being loaded",
  subtitle = "Free loading time is set by admin. Extra minutes are charged.",
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (trip?.loadedAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [trip?.loadedAt, trip?.loadingStartedAt]);

  const free = Math.max(0, Number(trip?.freeLoadingMinutes ?? 60));
  const rate = Math.max(0, Number(trip?.extraLoadingPerMinCharge ?? 3));
  const startedMs = trip?.loadingStartedAt
    ? new Date(trip.loadingStartedAt).getTime()
    : null;
  const endMs = trip?.loadedAt ? new Date(trip.loadedAt).getTime() : now;
  const elapsedSec =
    startedMs && Number.isFinite(startedMs)
      ? Math.max(0, Math.floor((endMs - startedMs) / 1000))
      : getPorterLoadingElapsedMin(trip, now) * 60;
  const overtime = getPorterLoadingOvertimeCharge(trip, now);
  const freeSec = free * 60;
  const remainingFreeSec = Math.max(0, freeSec - elapsedSec);
  const overFree = elapsedSec > freeSec;

  return (
    <div
      className={`rounded-2xl border border-[#E8EEF7] bg-white p-4 shadow-sm ${className}`}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${PORTER_BLUE}14`, color: PORTER_BLUE }}
        >
          <Package className="h-5 w-5" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-extrabold text-[#0F172A]">{title}</p>
          <p className="mt-0.5 text-[12px] text-[#64748B]">{subtitle}</p>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
            Elapsed
          </p>
          <p
            className="mt-1 font-mono text-[32px] font-extrabold leading-none tracking-tight"
            style={{ color: overFree ? "#DC2626" : "#0F172A" }}
          >
            {formatClock(elapsedSec)}
          </p>
        </div>
        <div className="text-right">
          <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#64748B]">
            <Clock3 className="h-3.5 w-3.5" />
            {overFree ? "Overtime" : "Free left"}
          </p>
          <p
            className={`mt-1 text-[18px] font-bold ${
              overFree ? "text-red-600" : "text-[#2F6BFF]"
            }`}
          >
            {overFree
              ? `+${overtime.billable} min`
              : formatClock(remainingFreeSec)}
          </p>
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#EEF3FF]">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.min(100, freeSec > 0 ? (elapsedSec / freeSec) * 100 : 100)}%`,
            background: overFree ? "#DC2626" : PORTER_BLUE,
          }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-[12px]">
        <span className="font-medium text-[#64748B]">
          Free {free} min · ₹{rate}/min after
        </span>
        <span
          className={`font-bold ${
            overtime.charge > 0 ? "text-red-600" : "text-[#0F172A]"
          }`}
        >
          Extra ₹{overtime.charge.toFixed(0)}
        </span>
      </div>
    </div>
  );
}
