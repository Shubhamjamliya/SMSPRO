import { useMemo, useState } from "react";
import { ChevronUp, Radio } from "lucide-react";
import { useDeliveryStore } from "@/modules/DeliveryV2/store/useDeliveryStore";
import { buildFeedRequestViewModel } from "@/modules/DeliveryV2/utils/feedRequestFormatters";
import { RequestCard } from "./RequestCard";
import { FeedRequestSkeleton } from "./FeedRequestSkeleton";
import { FeedEmptyState, FeedErrorState } from "./FeedEmptyState";

/**
 * Bottom feed panel shown over the map when the driver has no active trip.
 * Lists queued offers with compact cards; does not own accept/reject logic.
 */
export function DriverFeedPanel({
  isOnline,
  offers = [],
  loading = false,
  error = null,
  onRetry,
  onGoOnline,
  onAccept,
  onDecline,
  onOpenOffer,
  busyOrderId = null,
  className = "",
  variant = "default",
}) {
  const riderLocation = useDeliveryStore((s) => s.riderLocation);
  const [expandedId, setExpandedId] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const isTaxi = variant === "taxi";

  const viewModels = useMemo(
    () =>
      (offers || [])
        .map((order) => buildFeedRequestViewModel(order, { riderLocation }))
        .filter(Boolean),
    [offers, riderLocation],
  );

  const countLabel =
    viewModels.length === 0
      ? isTaxi
        ? "Listening"
        : "Waiting"
      : `${viewModels.length} ${
          isTaxi
            ? viewModels.length === 1
              ? "ride"
              : "rides"
            : viewModels.length === 1
              ? "request"
              : "requests"
        }`;

  return (
    <section
      className={`pointer-events-auto mx-auto w-full max-w-lg ${className}`}
      aria-label={isTaxi ? "Taxi ride feed" : "Driver request feed"}
    >
      <div
        className={
          isTaxi
            ? "overflow-hidden rounded-t-[1.75rem] border border-black/[0.06] bg-white/95 shadow-[0_-16px_48px_rgba(15,23,42,0.14)] backdrop-blur-md"
            : "overflow-hidden rounded-t-3xl border border-slate-200/80 bg-white/95 shadow-[0_-12px_40px_rgba(15,23,42,0.12)] backdrop-blur-md"
        }
      >
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className={`flex w-full flex-col items-center px-4 pb-2 pt-2.5 ${
            isTaxi ? "active:bg-[#FFF7F0]" : "active:bg-slate-50"
          }`}
          aria-expanded={!collapsed}
        >
          <span
            className={`mb-2 h-1 w-10 rounded-full ${
              isTaxi ? "bg-[#FF6A00]/35" : "bg-slate-300"
            }`}
          />
          <div className="flex w-full items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  isOnline
                    ? isTaxi
                      ? "animate-pulse bg-[#FF6A00]"
                      : "animate-pulse bg-emerald-500"
                    : "bg-slate-400"
                }`}
              />
              <div className="min-w-0 text-left">
                <p className="truncate text-sm font-bold text-slate-900">
                  {isOnline
                    ? isTaxi
                      ? "Nearby rides"
                      : "Nearby requests"
                    : isTaxi
                      ? "Ride feed paused"
                      : "Feed paused"}
                </p>
                <p className="truncate text-[11px] text-slate-500">{countLabel}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 text-slate-400">
              <Radio className="h-3.5 w-3.5" />
              <ChevronUp
                className={`h-4 w-4 transition-transform ${
                  collapsed ? "rotate-180" : ""
                }`}
              />
            </div>
          </div>
        </button>

        {!collapsed ? (
          <div className="no-scrollbar max-h-[42vh] space-y-2.5 overflow-y-auto overscroll-contain px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {loading ? <FeedRequestSkeleton count={2} /> : null}

            {!loading && error ? (
              <FeedErrorState message={error} onRetry={onRetry} />
            ) : null}

            {!loading && !error && viewModels.length === 0 ? (
              <FeedEmptyState
                isOnline={isOnline}
                onGoOnline={onGoOnline}
                variant={variant}
              />
            ) : null}

            {!loading &&
              !error &&
              viewModels.map((vm, index) => {
                const orderKey = vm.id;
                const busy =
                  busyOrderId != null &&
                  String(busyOrderId) === String(vm.requestId || vm.id);
                return (
                  <RequestCard
                    key={orderKey}
                    viewModel={vm}
                    order={vm.raw}
                    variant={variant}
                    highlighted={index === 0 && isOnline}
                    expanded={expandedId === orderKey}
                    accepting={busy}
                    onAccept={onAccept ? () => onAccept(vm.raw) : undefined}
                    onDecline={onDecline ? () => onDecline(vm.raw) : undefined}
                    onViewDetails={() => {
                      setExpandedId((prev) =>
                        prev === orderKey ? null : orderKey,
                      );
                      onOpenOffer?.(vm.raw);
                    }}
                  />
                );
              })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
