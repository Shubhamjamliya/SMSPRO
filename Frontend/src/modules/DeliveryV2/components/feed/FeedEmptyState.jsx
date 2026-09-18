import { AlertCircle, CarTaxiFront, Inbox, Radio, RefreshCw, WifiOff } from "lucide-react";
import { FeedActionButton } from "./FeedActionButton";

/**
 * Empty / offline states for the driver feed.
 * `variant="taxi"` → ride-specific copy + radar waiting visual.
 */
export function FeedEmptyState({ isOnline, onGoOnline, variant = "default" }) {
  const isTaxi = variant === "taxi";

  if (!isOnline) {
    return (
      <div
        className={
          isTaxi
            ? "relative overflow-hidden rounded-2xl border border-black/[0.06] bg-gradient-to-b from-[#FFF7F0] to-white px-4 py-8 text-center"
            : "rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center"
        }
      >
        {isTaxi ? (
          <div
            className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[#FF6A00]/10 blur-2xl"
            aria-hidden
          />
        ) : null}
        <div
          className={`relative mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl ${
            isTaxi ? "bg-neutral-900 text-white" : "bg-slate-100 text-slate-500"
          }`}
        >
          {isTaxi ? <CarTaxiFront className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
        </div>
        <h3 className="relative text-sm font-bold text-slate-900">You're offline</h3>
        <p className="relative mx-auto mt-1.5 max-w-[16rem] text-xs leading-relaxed text-slate-500">
          {isTaxi
            ? "Go online to start receiving nearby ride requests from passengers."
            : "Go online to start receiving nearby delivery and ride requests."}
        </p>
        {onGoOnline ? (
          <FeedActionButton
            className="relative mx-auto mt-4 w-full max-w-xs"
            onClick={onGoOnline}
          >
            Go Online
          </FeedActionButton>
        ) : null}
      </div>
    );
  }

  if (isTaxi) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-dashed border-[#FF6A00]/25 bg-gradient-to-b from-[#FFFBF7] to-white px-4 py-9 text-center">
        <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#FF6A00]/15" />
          <span className="absolute inset-2 animate-pulse rounded-full border border-dashed border-[#FF6A00]/40" />
          <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-[#FF6A00] text-white shadow-[0_8px_20px_rgba(255,106,0,0.35)]">
            <Radio className="h-5 w-5" />
          </span>
        </div>
        <h3 className="text-sm font-bold tracking-tight text-neutral-950">
          Scanning for rides
        </h3>
        <p className="mx-auto mt-1.5 max-w-[17rem] text-xs leading-relaxed text-neutral-500">
          Stay in your zone. New taxi requests will pop up here the moment a passenger books.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/90 px-4 py-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
        <Inbox className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-bold text-slate-900">No requests yet</h3>
      <p className="mx-auto mt-1.5 max-w-[16rem] text-xs leading-relaxed text-slate-500">
        Stay nearby. New orders and rides will appear here as they come in.
      </p>
    </div>
  );
}

export function FeedErrorState({ message, onRetry }) {
  return (
    <div className="rounded-2xl border border-red-100 bg-red-50/80 px-4 py-7 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-red-100 bg-white text-red-500">
        <AlertCircle className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-bold text-slate-900">Couldn't load requests</h3>
      <p className="mx-auto mt-1.5 max-w-[16rem] text-xs leading-relaxed text-slate-600">
        {message || "Check your connection and try again."}
      </p>
      {onRetry ? (
        <FeedActionButton
          variant="secondary"
          className="mx-auto mt-4 w-full max-w-xs"
          onClick={onRetry}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </FeedActionButton>
      ) : null}
    </div>
  );
}
