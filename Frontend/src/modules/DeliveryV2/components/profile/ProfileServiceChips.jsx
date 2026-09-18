import { Loader2, Edit2 } from "lucide-react";
import {
  enrollmentStatusLabel,
  formatModuleDate,
  getEnrollmentAppliedAt,
  getEnrollmentLastUpdated,
  getModuleDisplayName,
} from "@/modules/DeliveryV2/utils/driverModuleAccess";
import { cn } from "@food/utils/utils";

const toneFor = (status) => {
  if (status === "approved")
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "rejected") return "bg-red-50 text-red-700 border-red-200";
  if (status === "documents_required")
    return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-orange-50 text-orange-800 border-orange-200";
};

/**
 * Compact module status chips/cards for Food, Taxi, Porter, etc.
 */
export function ProfileServiceChips({
  enrollments = [],
  compact = false,
  resubmitting = "",
  onResubmit,
  className,
}) {
  if (!Array.isArray(enrollments) || enrollments.length === 0) return null;

  if (compact) {
    return (
      <div className={cn("flex flex-wrap gap-1.5", className)}>
        {enrollments.map((item) => {
          const status = item.status || "pending";
          return (
            <span
              key={item.module}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-bold",
                toneFor(status),
              )}
            >
              <span className="opacity-80">{getModuleDisplayName(item.module)}</span>
              <span className="uppercase tracking-wide">
                {enrollmentStatusLabel(item)}
              </span>
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {enrollments.map((item) => {
        const status = item.status || "pending";
        const canResubmit = ["rejected", "documents_required"].includes(status);
        const appliedAt = formatModuleDate(getEnrollmentAppliedAt(item));
        const lastUpdated = formatModuleDate(getEnrollmentLastUpdated(item));
        return (
          <div
            key={item.module}
            className={cn(
              "rounded-xl border px-3 py-2",
              toneFor(status),
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold">
                {getModuleDisplayName(item.module)}
              </p>
              <span className="text-[10px] font-bold uppercase tracking-wide text-right">
                {enrollmentStatusLabel(item)}
              </span>
            </div>
            {(appliedAt || lastUpdated) && (
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] opacity-75">
                {appliedAt ? <span>Applied {appliedAt}</span> : null}
                {lastUpdated ? <span>Updated {lastUpdated}</span> : null}
              </div>
            )}
            {canResubmit && item.rejectionReason ? (
              <p className="mt-1 text-[11px] opacity-90 leading-snug">
                {item.rejectionReason}
              </p>
            ) : null}
            {canResubmit && onResubmit ? (
              <button
                type="button"
                onClick={() => onResubmit(item)}
                disabled={Boolean(resubmitting)}
                className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-white/80 border border-black/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide disabled:opacity-60"
              >
                {resubmitting === item.module ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Edit2 className="h-3 w-3" />
                )}
                Edit & Resubmit
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
