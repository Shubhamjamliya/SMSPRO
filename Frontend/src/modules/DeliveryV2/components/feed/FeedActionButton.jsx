import { Loader2 } from "lucide-react";
import { cn } from "@food/utils/utils";

export function FeedActionButton({
  children,
  variant = "primary",
  loading = false,
  disabled = false,
  className,
  type = "button",
  onClick,
  ...props
}) {
  const variants = {
    primary:
      "bg-primary-orange text-white shadow-md shadow-orange-500/20 active:bg-orange-600",
    secondary:
      "bg-white text-slate-800 border border-slate-200 active:bg-slate-50",
    danger:
      "bg-white text-red-600 border border-red-200 active:bg-red-50",
    ghost: "bg-transparent text-slate-500 active:bg-slate-100",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 h-11 min-h-11 px-3 rounded-xl text-xs font-bold uppercase tracking-wide transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
        variants[variant] || variants.primary,
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
      {children}
    </button>
  );
}
