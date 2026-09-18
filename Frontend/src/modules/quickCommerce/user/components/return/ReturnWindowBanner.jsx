import React, { memo, useEffect, useMemo, useState } from "react";
import { Clock, AlertTriangle } from "lucide-react";
import {
  formatReturnWindowCountdown,
  getReturnWindowWarningLevel,
  hoursToReturnWindowDays,
  resolveLiveItemReturnEligibility,
} from "@/shared/utils/returnWindow";

/**
 * The countdown ticks inside this component so a delivered order screen does not
 * re-render its whole tree once per second.
 */
const useCountdownTick = (active) => {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [active]);
  return now;
};

const secondsUntil = (isoDate, now) => {
  if (!isoDate) return 0;
  const ms = new Date(isoDate).getTime();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor((ms - now) / 1000));
};

const formatDeliveredAt = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const warningStyles = {
  normal: {
    container: "border-emerald-100 bg-emerald-50",
    title: "text-emerald-900",
    subtitle: "text-emerald-700",
    icon: "text-emerald-600",
  },
  warning: {
    container: "border-amber-200 bg-amber-50",
    title: "text-amber-900",
    subtitle: "text-amber-700",
    icon: "text-amber-600",
  },
  critical: {
    container: "border-rose-200 bg-rose-50",
    title: "text-rose-900",
    subtitle: "text-rose-700",
    icon: "text-rose-600",
  },
  expired: {
    container: "border-slate-200 bg-slate-50",
    title: "text-slate-800",
    subtitle: "text-slate-600",
    icon: "text-slate-500",
  },
};

const ReturnWindowBanner = memo(({ eligibility, deliveredAt, className = "" }) => {
  const returnsDisabled = eligibility?.returnsEnabled === false;
  const now = useCountdownTick(Boolean(eligibility) && !returnsDisabled);

  // Each item's window closes on its own schedule, so the banner summarizes them
  // instead of assuming a single order-wide expiry.
  const liveItems = useMemo(
    () =>
      (Array.isArray(eligibility?.items) ? eligibility.items : []).map((item) =>
        resolveLiveItemReturnEligibility(item, now),
      ),
    [eligibility?.items, now],
  );

  const openItems = liveItems.filter((item) => item.returnEligible);
  const expiredItemCount = liveItems.length - openItems.length;

  if (!eligibility) return null;

  const resolvedDeliveredAt =
    deliveredAt || eligibility.deliveredAt || eligibility.deliveredAtIso;
  const deliveredLabel = formatDeliveredAt(resolvedDeliveredAt);
  const windowDays = hoursToReturnWindowDays(eligibility.returnWindowHours);

  // Prefer the soonest still-open item window; fall back to the order-level value
  // for legacy responses that carry no per-item data.
  const remainingSeconds = openItems.length
    ? Math.min(...openItems.map((item) => secondsUntil(item.returnEligibleUntil, now)))
    : liveItems.length
      ? 0
      : secondsUntil(eligibility.returnExpiryAt, now) ||
        Math.max(0, Number(eligibility.remainingSeconds || 0));

  const warningLevel = getReturnWindowWarningLevel(remainingSeconds);
  const styles = warningStyles[warningLevel] || warningStyles.normal;
  const isExpired = liveItems.length
    ? openItems.length === 0
    : warningLevel === "expired" || eligibility.returnWindowExpired;

  if (returnsDisabled) {
    return (
      <div className={`rounded-xl border border-slate-200 bg-slate-50 p-4 ${className}`}>
        {deliveredLabel && (
          <p className="text-xs text-slate-500">
            Delivered <span className="font-semibold text-slate-700">{deliveredLabel}</span>
          </p>
        )}
        <p className="text-sm font-bold text-slate-800 mt-2">Returns unavailable</p>
        <p className="text-xs text-slate-600 mt-1">Returns are currently disabled by the store.</p>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className={`rounded-xl border ${styles.container} p-4 ${className}`}>
        {deliveredLabel && (
          <p className="text-xs text-slate-500">
            Delivered <span className="font-semibold text-slate-700">{deliveredLabel}</span>
          </p>
        )}
        <div className="mt-3 border-t border-slate-200 pt-3">
          <p className={`text-sm font-bold ${styles.title}`}>Return window expired</p>
          <p className={`text-xs mt-1 ${styles.subtitle}`}>
            Returns were available for {windowDays} day{windowDays === 1 ? "" : "s"} after delivery.
          </p>
        </div>
      </div>
    );
  }

  const countdown = formatReturnWindowCountdown(remainingSeconds);
  const Icon = warningLevel === "critical" || warningLevel === "warning" ? AlertTriangle : Clock;
  const hasMixedWindows =
    openItems.length > 0 &&
    new Set(openItems.map((item) => item.returnEligibleUntil)).size > 1;

  return (
    <div className={`rounded-xl border p-4 ${styles.container} ${className}`}>
      {deliveredLabel && (
        <p className="text-xs text-slate-500">
          Delivered <span className="font-semibold text-slate-700">{deliveredLabel}</span>
        </p>
      )}
      <div className={`${deliveredLabel ? "mt-3 border-t border-current/10 pt-3" : ""}`}>
        <div className="flex items-start gap-3">
          <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${styles.icon}`} />
          <div>
            <p className={`text-sm font-bold ${styles.title}`}>
              {openItems.length > 0
                ? `${openItems.length} item${openItems.length === 1 ? "" : "s"} returnable`
                : "Return available"}
            </p>
            <p className={`text-sm font-semibold mt-1 ${styles.subtitle}`}>
              {hasMixedWindows ? "Earliest window closes in " : ""}
              {countdown} left
            </p>
            {expiredItemCount > 0 && (
              <p className="text-xs mt-1 text-slate-500">
                {expiredItemCount} item{expiredItemCount === 1 ? "'s" : "s'"} return window has
                already closed.
              </p>
            )}
            {warningLevel === "warning" && (
              <p className="text-xs mt-1 text-amber-700">Return window closing soon.</p>
            )}
            {warningLevel === "critical" && (
              <p className="text-xs mt-1 text-rose-700">Hurry! Return window ends very soon.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

ReturnWindowBanner.displayName = "ReturnWindowBanner";

export default ReturnWindowBanner;
