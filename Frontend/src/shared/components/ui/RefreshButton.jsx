import { RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Consistent refresh icon button for list-page toolbars. Spins while loading.
 */
export default function RefreshButton({ onClick, loading = false, className, title = "Refresh" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title={title}
      aria-label={title}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600",
        "hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-60",
        "transition-colors",
        className,
      )}
    >
      <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
    </button>
  );
}
