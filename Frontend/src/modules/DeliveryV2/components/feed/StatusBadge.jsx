import { cn } from "@food/utils/utils";
import { FEED_STATUS_META } from "@/modules/DeliveryV2/utils/feedRequestFormatters";

export function StatusBadge({ statusKey = "new", label, className }) {
  const meta = FEED_STATUS_META[statusKey] || FEED_STATUS_META.new;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        meta.className,
        className,
      )}
    >
      {label || meta.label}
    </span>
  );
}

export function ServiceBadge({ label, className }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-slate-900 text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        className,
      )}
    >
      {label}
    </span>
  );
}
