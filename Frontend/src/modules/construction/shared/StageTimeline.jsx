import {
  fullMoney,
  shortDate,
  STAGE_STATUS_LABEL,
  STAGE_STATUS_LABEL_CONTRACTOR,
  STAGE_STATUS_TONE,
} from "./format";
import { Check } from "lucide-react";

/**
 * BRD C16 — Vertical Timeline Component for Project Stages.
 */
export default function StageTimeline({ stages = [], side = "customer", onSelect, activeId }) {
  if (!stages.length) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-xs font-semibold text-slate-500 shadow-2xs">
        No milestone stages defined.
      </p>
    );
  }

  const labels = side === "contractor" ? STAGE_STATUS_LABEL_CONTRACTOR : STAGE_STATUS_LABEL;

  return (
    <ol className="relative space-y-1">
      {stages.map((stage, index) => {
        const done = stage.status === "payment_released" || stage.status === "approved";
        const active = String(stage._id || stage.id) === String(activeId);
        const isLast = index === stages.length - 1;

        return (
          <li key={stage._id || stage.id} className="relative flex gap-4">
            {/* Timeline Rail */}
            <div className="flex flex-col items-center">
              <span
                className={`mt-4 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black shadow-2xs ring-4 ring-slate-50 ${
                  done
                    ? "bg-emerald-500 text-white"
                    : stage.status === "submitted_for_approval" || stage.status === "completed_pending_approval"
                      ? "bg-amber-500 text-white animate-pulse"
                      : stage.status === "in_progress"
                        ? "bg-amber-500/80 text-white"
                        : "bg-slate-200 text-slate-500"
                }`}
              >
                {done ? <Check className="h-4 w-4 stroke-[3]" /> : stage.sequence}
              </span>
              {!isLast && <span className="w-0.5 flex-1 bg-slate-200/80 my-1" />}
            </div>

            <button
              type="button"
              onClick={() => onSelect?.(stage)}
              className={`mb-2 flex-1 rounded-xl border p-3.5 text-left transition-all ${
                active
                  ? "border-amber-400 bg-gradient-to-br from-amber-50/60 to-white shadow-sm ring-1 ring-amber-400/20"
                  : "border-slate-200 bg-white hover:border-slate-300 shadow-2xs active:scale-[0.99]"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-slate-900">{stage.name}</p>
                  {stage.isRetention && (
                    <p className="mt-0.5 text-xs font-bold text-amber-700">Defect Liability Retention Release</p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10.5px] font-extrabold ring-1 ring-inset ${
                    STAGE_STATUS_TONE[stage.status] || "bg-slate-100 text-slate-600 ring-slate-200"
                  }`}
                >
                  {labels[stage.status] || stage.status}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-500">
                <span className="font-extrabold text-slate-900 tabular-nums">{fullMoney(stage.amount)}</span>
                {stage.percentage != null && <span>· {stage.percentage}% of project</span>}
                {stage.targetDate && <span>· Target {shortDate(stage.targetDate)}</span>}
              </div>

              {stage.status === "payment_released" && stage.releasedAmount != null && (
                <p className="mt-2 text-xs font-extrabold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg inline-block">
                  ✓ {fullMoney(stage.releasedAmount)} Released to Contractor
                  {Number(stage.retainedAmount) > 0
                    ? ` · ${fullMoney(stage.retainedAmount)} in Retention`
                    : ""}
                </p>
              )}

              {stage.status === "rejected" && stage.rejectionReason && (
                <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 border border-rose-100">
                  Correction Requested: {stage.rejectionReason}
                </p>
              )}

              {stage.status === "in_progress" && Number(stage.progressPercent) > 0 && (
                <div className="mt-3 space-y-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all duration-300"
                      style={{ width: `${Math.min(100, stage.progressPercent)}%` }}
                    />
                  </div>
                  <p className="text-[11px] font-bold text-amber-700">
                    {stage.progressPercent}% work completed
                  </p>
                </div>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
