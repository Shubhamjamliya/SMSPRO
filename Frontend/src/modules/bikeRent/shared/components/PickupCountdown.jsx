import { useEffect, useState } from "react";
import { getPickupWindowInfo, formatCountdown } from "../utils/pickupWindow";

const TONE_CLASSES = {
  blue: "bg-blue-50 text-blue-700",
  amber: "bg-amber-50 text-amber-800",
  emerald: "bg-emerald-50 text-emerald-700",
  red: "bg-red-50 text-red-700",
  gray: "bg-gray-100 text-gray-600",
};

/**
 * Live pickup-window status badge, shared across User/Vendor/Admin so the states read
 * identically everywhere: Waiting for Pickup, Pickup Window Active, Pickup Window Expiring,
 * Ride Started, No-Show — plus an "Overridden" tag when a no-show was restored.
 * Renders nothing for statuses where the pickup window isn't relevant (cancelled, rejected, etc).
 */
export default function PickupCountdown({ booking, className = "" }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (booking?.status !== "reserved") return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [booking?.status]);

  const info = getPickupWindowInfo(booking, now);
  if (!info.key) return null;

  const countdownText =
    info.deadline == null
      ? ""
      : info.key === "waiting"
        ? `opens ${formatCountdown(info.deadline, now)}`
        : info.key === "window_expiring"
          ? `expired ${formatCountdown(info.deadline, now)}`
          : `closes ${formatCountdown(info.deadline, now)}`;

  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${TONE_CLASSES[info.tone]}`}
      >
        {info.label}
        {countdownText ? <span className="font-semibold opacity-75">· {countdownText}</span> : null}
      </span>
      {info.overridden ? (
        <span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-1 text-[10px] font-bold text-purple-700">
          Overridden
        </span>
      ) : null}
    </span>
  );
}
