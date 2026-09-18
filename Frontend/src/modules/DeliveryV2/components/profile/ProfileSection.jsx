import { cn } from "@food/utils/utils";
import { ChevronDown } from "lucide-react";

export function ProfileSection({
  title,
  icon: Icon,
  action,
  children,
  defaultOpen = true,
  className,
}) {
  return (
    <details
      defaultOpen={defaultOpen}
      className={cn(
        "group rounded-xl border border-slate-200 bg-white overflow-hidden",
        className,
      )}
    >
      <summary className="list-none flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer select-none [&::-webkit-details-marker]:hidden active:bg-slate-50">
        <div className="flex items-center gap-2 min-w-0">
          {Icon ? (
            <span className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-500 shrink-0">
              <Icon className="w-3.5 h-3.5" />
            </span>
          ) : null}
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide truncate">
            {title}
          </h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {action ? (
            <div onClick={(e) => e.preventDefault()}>{action}</div>
          ) : null}
          <ChevronDown className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" />
        </div>
      </summary>
      <div className="px-3 pb-3 pt-0.5 space-y-1.5 border-t border-slate-100">
        {children}
      </div>
    </details>
  );
}

export function ProfileInfoRow({
  label,
  value,
  icon: Icon,
  action,
  className,
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 py-2 border-b border-slate-50 last:border-0",
        className,
      )}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        {Icon ? (
          <Icon className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
        ) : null}
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {label}
          </p>
          <p className="text-sm font-semibold text-slate-900 break-words leading-snug mt-0.5">
            {value || "—"}
          </p>
        </div>
      </div>
      {action}
    </div>
  );
}
