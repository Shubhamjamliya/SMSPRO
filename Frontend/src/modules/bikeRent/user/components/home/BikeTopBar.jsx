import { Link } from "react-router-dom";
import { ChevronDown, MapPin, Wallet } from "lucide-react";
import { getBikeRentWalletPath } from "../../utils/routes";
import { formatInr } from "../../utils/format";

export default function BikeTopBar({
  title = "Current location",
  subtitle = "Tap to set pickup",
  onLocationClick,
  walletBalance = null,
  walletLoading = false,
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/95 px-4 py-3 backdrop-blur-md pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onLocationClick}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FF6A00]/10 text-[#FF6A00]">
            <MapPin className="h-4 w-4" strokeWidth={2.5} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-0.5">
              <span className="truncate text-sm font-extrabold text-gray-900">
                {title}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-500" />
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-gray-500">
              {subtitle}
            </span>
          </span>
        </button>

        <Link
          to={getBikeRentWalletPath()}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-100 bg-gray-50 px-2.5 py-2 active:scale-95 transition"
        >
          <Wallet className="h-4 w-4 text-[#FF6A00]" strokeWidth={2.2} />
          <span className="text-xs font-extrabold text-gray-900">
            {walletLoading
              ? "…"
              : walletBalance == null
                ? "Wallet"
                : formatInr(walletBalance)}
          </span>
        </Link>
      </div>
    </header>
  );
}
