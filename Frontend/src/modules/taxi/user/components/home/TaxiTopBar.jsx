import { Link } from "react-router-dom";
import { ChevronDown, MapPin, Wallet } from "lucide-react";
import { getTaxiWalletPath } from "../../utils/routes";
import { formatInr } from "../../utils/mock/vehicles";

export default function TaxiTopBar({
  title = "Current location",
  subtitle = "Tap to set pickup",
  onLocationClick,
  walletBalance = null,
  walletLoading = false,
  variant = "sticky",
}) {
  const floating = variant === "floating";
  const walletLabel = walletLoading
    ? "…"
    : walletBalance == null
      ? null
      : formatInr(walletBalance);

  if (floating) {
    return (
      <header
        id="taxi-standalone-topbar"
        className="pointer-events-none absolute inset-x-0 top-0 z-40 px-4 pt-[max(0.85rem,env(safe-area-inset-top))] transition-[opacity,transform] duration-300 ease-out will-change-transform"
      >
        <div className="mx-auto flex max-w-lg items-center gap-2.5">
          <button
            type="button"
            onClick={onLocationClick}
            className="pointer-events-auto group flex min-h-[48px] min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-full bg-white px-3.5 py-2 text-left shadow-[0_10px_40px_rgba(15,23,42,0.14)] outline-none ring-1 ring-black/[0.04] transition duration-200 hover:shadow-[0_12px_44px_rgba(15,23,42,0.18)] focus-visible:ring-2 focus-visible:ring-[#FF6A00]/40"
            aria-label={`Change pickup location. Current: ${title}`}
          >
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-[#FF6A00]/15" aria-hidden />
              <span className="absolute inset-1.5 animate-pulse rounded-full bg-[#FF6A00]/25 motion-reduce:animate-none" aria-hidden />
              <MapPin className="relative h-3.5 w-3.5 text-[#FF6A00]" strokeWidth={2.6} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-0.5">
                <span className="truncate text-[13px] font-semibold tracking-[-0.01em] text-neutral-900">
                  {title}
                </span>
                <ChevronDown
                  className="h-3.5 w-3.5 shrink-0 text-neutral-400 transition duration-200 group-hover:text-neutral-600"
                  aria-hidden
                />
              </span>
              <span className="mt-px block truncate text-[11px] leading-snug text-neutral-500">
                {subtitle}
              </span>
            </span>
          </button>

          <Link
            to={getTaxiWalletPath()}
            className="pointer-events-auto flex min-h-[48px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-neutral-950 px-3.5 py-2 text-white shadow-[0_10px_40px_rgba(15,23,42,0.22)] outline-none transition duration-200 hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-[#FF6A00]/40"
            aria-label={
              walletLoading
                ? "Wallet loading"
                : walletLabel
                  ? `Wallet balance ${walletLabel}`
                  : "Open wallet"
            }
          >
            <Wallet className="h-3.5 w-3.5 text-[#FF8A3D]" strokeWidth={2.4} aria-hidden />
            <span className="text-[13px] font-semibold tabular-nums tracking-tight">
              {walletLoading ? "…" : walletLabel || "Wallet"}
            </span>
          </Link>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-100 bg-white/90 px-4 py-3 backdrop-blur-xl pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex max-w-lg items-center gap-3">
        <button
          type="button"
          onClick={onLocationClick}
          className="flex min-h-[44px] min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/35"
          aria-label={`Change pickup location. Current: ${title}`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FFF4ED] text-[#FF6A00]">
            <MapPin className="h-4 w-4" strokeWidth={2.4} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-0.5">
              <span className="truncate text-sm font-semibold text-neutral-900">{title}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden />
            </span>
            <span className="mt-0.5 block truncate text-xs text-neutral-500">{subtitle}</span>
          </span>
        </button>
        <Link
          to={getTaxiWalletPath()}
          className="flex min-h-[44px] shrink-0 cursor-pointer items-center gap-2 rounded-full bg-neutral-950 px-3.5 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/35"
        >
          <Wallet className="h-4 w-4 text-[#FF8A3D]" aria-hidden />
          <span className="text-sm font-semibold tabular-nums">
            {walletLoading ? "…" : walletLabel || "Wallet"}
          </span>
        </Link>
      </div>
    </header>
  );
}
