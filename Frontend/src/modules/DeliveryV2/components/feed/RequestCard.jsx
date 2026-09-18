import {
  Banknote,
  Clock3,
  CreditCard,
  MapPin,
  Navigation,
  Route,
} from "lucide-react";
import { cn } from "@food/utils/utils";
import { buildFeedRequestViewModel } from "@/modules/DeliveryV2/utils/feedRequestFormatters";
import {
  getReturnPickupStopLabels,
  isReturnPickupTrip,
} from "@/modules/DeliveryV2/utils/orderRouting";
import { ServiceBadge, StatusBadge } from "./StatusBadge";
import { FeedActionButton } from "./FeedActionButton";

function RouteStop({ tone, label, title, address, taxi }) {
  const toneClass = taxi
    ? tone === "drop"
      ? "bg-red-500 ring-red-100"
      : "bg-emerald-500 ring-emerald-100"
    : tone === "drop"
      ? "bg-sky-500 ring-sky-100"
      : "bg-primary-orange ring-orange-100";

  return (
    <div className="flex min-w-0 gap-2.5">
      <div className="flex flex-col items-center pt-1">
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full ring-4", toneClass)} />
        {tone === "pickup" ? (
          taxi ? (
            <span
              className="my-1 w-px flex-1 min-h-5 border-l border-dashed border-neutral-300"
              aria-hidden
            />
          ) : (
            <span className="my-1 min-h-4 w-px flex-1 bg-slate-200" />
          )
        ) : null}
      </div>
      <div className="min-w-0 flex-1 pb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {label}
        </p>
        <p className="truncate text-sm font-bold leading-snug text-slate-900">
          {title}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500">
          {address}
        </p>
      </div>
    </div>
  );
}

function StatChip({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase leading-none tracking-wide text-slate-400">
          {label}
        </p>
        <p className="mt-0.5 truncate text-[11px] font-bold text-slate-800">
          {value}
        </p>
      </div>
    </div>
  );
}

/**
 * Compact request card for Driver Feed.
 * Taxi rides get fare-forward layout + dotted route connector.
 */
export function RequestCard({
  order,
  viewModel: viewModelProp,
  expiresInSec,
  riderLocation,
  highlighted = false,
  expanded = false,
  accepting = false,
  declining = false,
  onAccept,
  onDecline,
  onViewDetails,
  className,
  variant = "default",
}) {
  const vm =
    viewModelProp ||
    buildFeedRequestViewModel(order, { expiresInSec, riderLocation });
  if (!vm) return null;

  const isTaxi = variant === "taxi" || vm.serviceKey === "taxi";
  const isReturn = isReturnPickupTrip(order || vm.raw);
  const returnLabels = isReturn ? getReturnPickupStopLabels() : null;

  if (isTaxi) {
    return (
      <article
        className={cn(
          "overflow-hidden rounded-2xl border bg-white shadow-sm",
          highlighted
            ? "border-[#FF6A00]/45 shadow-[0_8px_28px_rgba(255,106,0,0.12)] ring-1 ring-[#FF6A00]/20"
            : "border-black/[0.06]",
          className,
        )}
      >
        <div className="space-y-3 px-3.5 pb-2.5 pt-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center rounded-md bg-[#FFF1E6] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#FF6A00]">
                Taxi ride
              </span>
              <StatusBadge statusKey={vm.statusKey} />
              {vm.expiresInSec != null && vm.expiresInSec <= 30 ? (
                <StatusBadge
                  statusKey="expiring"
                  label={`${Math.max(0, vm.expiresInSec)}s`}
                />
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                Fare
              </p>
              <p className="text-xl font-black tabular-nums leading-none text-neutral-950">
                {vm.earningsLabel || "—"}
              </p>
            </div>
          </div>

          {/* Stops */}
          <div className="space-y-0">
            <RouteStop
              taxi
              tone="pickup"
              label="Pickup"
              title={vm.pickup.title}
              address={vm.pickup.address}
            />
            <RouteStop
              taxi
              tone="drop"
              label="Drop"
              title={vm.drop.title}
              address={vm.drop.address}
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <StatChip icon={Navigation} label="To pickup" value={vm.pickupDistanceLabel} />
            <StatChip icon={Route} label="Trip" value={vm.tripDistanceLabel} />
            <StatChip icon={Clock3} label="ETA" value={vm.etaLabel} />
            <StatChip icon={CreditCard} label="Pay" value={vm.paymentLabel} />
          </div>

          <div className="flex items-center justify-between gap-2 text-[10px] font-medium text-neutral-400">
            <span className="truncate">
              ID{" "}
              {vm.requestId
                ? String(vm.requestId).slice(-8).toUpperCase()
                : "—"}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <Clock3 className="h-3 w-3" />
              {vm.receivedLabel || vm.receivedClock || "Just received"}
            </span>
          </div>

          {expanded ? (
            <div className="space-y-1.5 rounded-xl border border-black/[0.05] bg-neutral-50 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                Ride details
              </p>
              <p className="text-xs leading-relaxed text-neutral-600">
                <span className="font-semibold text-neutral-800">Pickup:</span>{" "}
                {vm.pickup.address}
              </p>
              <p className="text-xs leading-relaxed text-neutral-600">
                <span className="font-semibold text-neutral-800">Drop:</span>{" "}
                {vm.drop.address}
              </p>
              <p className="flex items-center gap-1.5 text-xs text-neutral-600">
                <Banknote className="h-3.5 w-3.5 text-neutral-400" />
                Fare {vm.earningsLabel || "—"} · {vm.paymentLabel}
              </p>
              <p className="flex items-center gap-1.5 text-xs text-neutral-600">
                <MapPin className="h-3.5 w-3.5 text-neutral-400" />
                Taxi
                {vm.requestId ? ` · #${vm.requestId}` : ""}
              </p>
            </div>
          ) : null}
        </div>

        {(onAccept || onDecline || onViewDetails) && (
          <div className="px-3.5 pb-3.5 pt-0">
            {onAccept || onDecline ? (
              <div className="grid grid-cols-3 gap-2">
                {onDecline ? (
                  <FeedActionButton
                    variant="danger"
                    onClick={onDecline}
                    loading={declining}
                    disabled={accepting}
                  >
                    Decline
                  </FeedActionButton>
                ) : (
                  <span />
                )}
                {onViewDetails ? (
                  <FeedActionButton
                    variant="secondary"
                    onClick={onViewDetails}
                    disabled={accepting || declining}
                  >
                    {expanded ? "Hide" : "Details"}
                  </FeedActionButton>
                ) : (
                  <span />
                )}
                {onAccept ? (
                  <FeedActionButton
                    variant="primary"
                    onClick={onAccept}
                    loading={accepting}
                    disabled={declining}
                  >
                    Accept
                  </FeedActionButton>
                ) : (
                  <span />
                )}
              </div>
            ) : (
              <FeedActionButton
                variant="secondary"
                className="w-full"
                onClick={onViewDetails}
              >
                {expanded ? "Hide details" : "View details"}
              </FeedActionButton>
            )}
          </div>
        )}
      </article>
    );
  }

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border bg-white shadow-sm",
        highlighted
          ? "border-primary-orange/40 shadow-orange-500/10 ring-1 ring-primary-orange/20"
          : "border-slate-200",
        className,
      )}
    >
      <div className="space-y-3 px-3.5 pb-2.5 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <ServiceBadge label={vm.serviceLabel} />
            <StatusBadge statusKey={vm.statusKey} />
            {vm.expiresInSec != null && vm.expiresInSec <= 30 ? (
              <StatusBadge
                statusKey="expiring"
                label={`${Math.max(0, vm.expiresInSec)}s`}
              />
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Earn
            </p>
            <p className="text-lg font-black tabular-nums leading-none text-emerald-600">
              {vm.earningsLabel || "—"}
            </p>
          </div>
        </div>

        <div className="space-y-0">
          <RouteStop
            tone="pickup"
            label={isReturn ? returnLabels.pickupLabel : "Pickup"}
            title={vm.pickup.title}
            address={vm.pickup.address}
          />
          <RouteStop
            tone="drop"
            label={isReturn ? returnLabels.dropLabel : "Drop"}
            title={vm.drop.title}
            address={vm.drop.address}
          />
        </div>

        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <StatChip
            icon={Navigation}
            label={isReturn ? "You → Customer" : "To pickup"}
            value={vm.pickupDistanceLabel}
          />
          <StatChip
            icon={Route}
            label={isReturn ? "Customer → Seller" : "Trip"}
            value={vm.tripDistanceLabel}
          />
          <StatChip icon={Clock3} label="ETA" value={vm.etaLabel} />
          <StatChip icon={CreditCard} label="Pay" value={vm.paymentLabel} />
        </div>

        <div className="flex items-center justify-between gap-2 text-[10px] font-medium text-slate-400">
          <span className="truncate">
            ID{" "}
            {vm.requestId
              ? String(vm.requestId).slice(-8).toUpperCase()
              : "—"}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <Clock3 className="h-3 w-3" />
            {vm.receivedLabel || vm.receivedClock || "Just received"}
          </span>
        </div>

        {expanded ? (
          <div className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Details
            </p>
            <p className="text-xs leading-relaxed text-slate-600">
              <span className="font-semibold text-slate-800">Pickup:</span>{" "}
              {vm.pickup.address}
            </p>
            <p className="text-xs leading-relaxed text-slate-600">
              <span className="font-semibold text-slate-800">Drop:</span>{" "}
              {vm.drop.address}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-slate-600">
              <Banknote className="h-3.5 w-3.5 text-slate-400" />
              Estimated earnings {vm.earningsLabel || "—"} · {vm.paymentLabel}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-slate-600">
              <MapPin className="h-3.5 w-3.5 text-slate-400" />
              Service {vm.serviceLabel}
              {vm.requestId ? ` · #${vm.requestId}` : ""}
            </p>
          </div>
        ) : null}
      </div>

      {(onAccept || onDecline || onViewDetails) && (
        <div className="px-3.5 pb-3.5 pt-0">
          {onAccept || onDecline ? (
            <div className="grid grid-cols-3 gap-2">
              {onDecline ? (
                <FeedActionButton
                  variant="danger"
                  onClick={onDecline}
                  loading={declining}
                  disabled={accepting}
                >
                  Decline
                </FeedActionButton>
              ) : (
                <span />
              )}
              {onViewDetails ? (
                <FeedActionButton
                  variant="secondary"
                  onClick={onViewDetails}
                  disabled={accepting || declining}
                >
                  {expanded ? "Hide" : "Details"}
                </FeedActionButton>
              ) : (
                <span />
              )}
              {onAccept ? (
                <FeedActionButton
                  variant="primary"
                  onClick={onAccept}
                  loading={accepting}
                  disabled={declining}
                >
                  Accept
                </FeedActionButton>
              ) : (
                <span />
              )}
            </div>
          ) : (
            <FeedActionButton
              variant="secondary"
              className="w-full"
              onClick={onViewDetails}
            >
              {expanded ? "Hide details" : "View details"}
            </FeedActionButton>
          )}
        </div>
      )}
    </article>
  );
}
