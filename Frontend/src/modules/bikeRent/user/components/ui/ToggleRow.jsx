import { cn } from "@/lib/utils";

export default function ToggleRow({
  icon: Icon,
  title,
  subtitle,
  checked,
  onChange,
  className,
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-3.5 py-3 shadow-sm",
        className,
      )}
    >
      {Icon ? (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF6A00]/10 text-[#FF6A00]">
          <Icon className="h-[18px] w-[18px]" />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-gray-900">{title}</p>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] text-gray-500">{subtitle}</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange?.(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-[#FF6A00]" : "bg-gray-200",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-5",
          )}
        />
      </button>
    </div>
  );
}
