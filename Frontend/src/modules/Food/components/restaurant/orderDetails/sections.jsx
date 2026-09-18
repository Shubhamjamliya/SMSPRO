import { memo } from "react"
import {
  Bike,
  ClipboardList,
  MapPin,
  Package,
  Phone,
  Receipt,
  ScrollText,
  UserRound,
  Wallet,
  Ban,
  History,
} from "lucide-react"
import {
  SectionCard,
  MetaRow,
  MoneyRow,
  StatusPill,
  CopyButton,
  TimelineIcon,
  EmptyBlock,
} from "./ui"
import { formatMoney } from "./normalizeRestaurantOrder"

const paymentToneClass = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50",
  amber: "bg-amber-50 text-amber-800 border-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50",
  red: "bg-red-50 text-red-700 border-red-100 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50",
  purple: "bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/50",
}

export const OrderOverviewSection = memo(function OrderOverviewSection({
  model,
  onCopy,
}) {
  return (
    <SectionCard
      title="Order overview"
      subtitle="Key identifiers and status"
      icon={ClipboardList}
      action={
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <StatusPill label={model.statusLabel} className={model.statusTone} />
          <StatusPill
            label={model.payment.statusMeta.label}
            className={paymentToneClass[model.payment.statusMeta.tone] || paymentToneClass.amber}
          />
        </div>
      }
    >
      <div className="grid gap-1 sm:grid-cols-2 sm:gap-x-8">
        <div className="flex items-center justify-between gap-2 py-1.5 sm:col-span-2">
          <span className="text-xs text-gray-500">Order ID</span>
          <div className="flex items-center gap-1">
            <span className="font-mono text-sm font-bold text-gray-900 dark:text-white">
              #{model.orderId}
            </span>
            <CopyButton value={model.orderId} onCopied={onCopy} />
          </div>
        </div>
        <MetaRow label="Order status" value={model.statusLabel} />
        <MetaRow label="Payment status" value={model.payment.statusMeta.label} />
        <MetaRow label="Payment method" value={model.payment.methodLabel} />
        <MetaRow label="Placed on" value={model.createdAtLabel} />
        <MetaRow label="Accepted at" value={model.acceptedAtLabel || "—"} />
        <MetaRow
          label="Prep time"
          value={
            model.preparationTime != null
              ? `${model.preparationTime} min`
              : "—"
          }
        />
        <MetaRow label="Est. ready by" value={model.estimatedReadyAtLabel || "—"} />
        {model.cancelled && model.cancellation ? (
          <MetaRow label="Cancelled at" value={model.cancellation.cancelledAtLabel || "—"} />
        ) : null}
      </div>
    </SectionCard>
  )
})

export const OrderTimelineSection = memo(function OrderTimelineSection({ journey }) {
  return (
    <SectionCard
      title="Order status timeline"
      subtitle="Complete journey with timestamps"
      icon={ScrollText}
    >
      {!journey?.length ? (
        <EmptyBlock title="No timeline yet" subtitle="Status updates will appear here." />
      ) : (
        <ol className="space-y-0">
          {journey.map((step, index) => (
            <li key={step.id} className="relative flex gap-3 pb-4 last:pb-0">
              {index < journey.length - 1 ? (
                <span className="absolute left-[9px] top-5 bottom-0 w-px bg-gray-100 dark:bg-gray-800" />
              ) : null}
              <span className="relative z-[1] mt-0.5 shrink-0">
                <TimelineIcon state={step.state} />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p
                    className={`text-sm font-bold ${
                      step.state === "upcoming" || step.state === "skipped"
                        ? "text-gray-400"
                        : "text-gray-900 dark:text-white"
                    }`}
                  >
                    {step.label}
                  </p>
                  <p className="text-[11px] tabular-nums text-gray-400">
                    {step.atLabel || (step.state === "upcoming" ? "Pending" : "—")}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  )
})

export const CustomerDetailsSection = memo(function CustomerDetailsSection({ model }) {
  return (
    <SectionCard title="Customer details" icon={UserRound}>
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-500 dark:bg-gray-900">
            <UserRound className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 dark:text-white">{model.customer.name}</p>
            {model.customer.phone ? (
              <a
                href={`tel:${model.customer.phone}`}
                className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#FF6A00]"
              >
                <Phone className="h-3.5 w-3.5" />
                {model.customer.phone}
              </a>
            ) : (
              <p className="mt-0.5 text-xs text-gray-400">Phone not available</p>
            )}
          </div>
        </div>

        <div className="rounded-xl bg-gray-50/80 p-3 dark:bg-gray-900/50">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
                Delivery address
              </p>
              <p className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-200 break-words">
                {model.address.full}
              </p>
              {model.address.instructions ? (
                <p className="mt-2 text-xs text-gray-500">
                  <span className="font-semibold text-gray-600 dark:text-gray-300">Instructions: </span>
                  {model.address.instructions}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {model.notes ? (
          <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
            <span className="font-bold">Order notes: </span>
            {model.notes}
          </div>
        ) : null}

        {model.cutlery ? (
          <p className="text-[11px] font-semibold text-gray-500">Cutlery requested</p>
        ) : null}
      </div>
    </SectionCard>
  )
})

export const OrderedItemsSection = memo(function OrderedItemsSection({ items }) {
  return (
    <SectionCard
      title="Ordered items"
      subtitle={`${items.length} line item${items.length === 1 ? "" : "s"}`}
      icon={Package}
    >
      {!items.length ? (
        <EmptyBlock title="No items" subtitle="This order has no item lines." />
      ) : (
        <ul className="divide-y divide-gray-50 dark:divide-gray-800/80">
          {items.map((item) => (
            <li key={item.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              <div
                className={`mt-1 h-3 w-3 shrink-0 rounded-sm border-2 ${
                  item.isVeg ? "border-emerald-600" : "border-red-600"
                }`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white">
                      {item.quantity}× {item.name}
                    </p>
                    {item.variant ? (
                      <p className="mt-0.5 text-[11px] text-gray-500">Variant: {item.variant}</p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-extrabold tabular-nums text-gray-900 dark:text-white">
                      {formatMoney(item.lineTotal)}
                    </p>
                    <p className="text-[11px] text-gray-400 tabular-nums">
                      {formatMoney(item.unitPrice)} each
                    </p>
                  </div>
                </div>

                {item.addons?.length ? (
                  <ul className="mt-2 space-y-1 rounded-lg bg-gray-50 px-2.5 py-2 dark:bg-gray-900/50">
                    {item.addons.map((addon, idx) => (
                      <li
                        key={`${addon.name}-${idx}`}
                        className="flex items-center justify-between gap-2 text-[11px] text-gray-600 dark:text-gray-400"
                      >
                        <span>
                          + {addon.quantity > 1 ? `${addon.quantity}× ` : ""}
                          {addon.name}
                        </span>
                        <span className="tabular-nums font-semibold">
                          {formatMoney(addon.total)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {item.notes ? (
                  <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                    Note: {item.notes}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
})

export const AmountBreakdownSection = memo(function AmountBreakdownSection({ model }) {
  const { bill, payment } = model
  return (
    <SectionCard title="Amount breakdown" icon={Receipt}>
      <div className="space-y-0.5">
        <MoneyRow label="Item subtotal" value={bill.itemSubtotal} />
        <MoneyRow label="Add-on charges" value={bill.addonCharges} muted />
        <MoneyRow label="Packaging charges" value={bill.packagingFee} muted />
        <MoneyRow label="Delivery charges" value={bill.deliveryCharges} muted />
        <MoneyRow label="Delivery speed fee" value={bill.deliverySpeedFee} muted />
        <MoneyRow label="Taxes / GST" value={bill.taxes} muted />
        <MoneyRow label="Platform charges" value={bill.platformCharges} muted />
        {bill.couponDiscount > 0 ? (
          <MoneyRow
            label={bill.couponCode ? `Coupon (${bill.couponCode})` : "Coupon discount"}
            value={-bill.couponDiscount}
            negative
          />
        ) : null}
        <MoneyRow label="Item discount" value={-bill.itemDiscount} muted negative />
        <MoneyRow label="Wallet discount" value={-bill.walletDiscount} muted negative />
        <MoneyRow label="Other discount" value={-bill.otherDiscount} muted negative />

        <div className="my-2 border-t border-dashed border-gray-100 dark:border-gray-800" />
        <MoneyRow label="Grand total" value={bill.grandTotal} strong />
        <MoneyRow label="Amount paid" value={payment.amountPaid} />
        <MoneyRow
          label="Amount pending"
          value={payment.statusMeta.key === "paid" || payment.statusMeta.key === "refunded" ? 0 : payment.amountPending}
          muted={payment.statusMeta.key === "paid"}
        />
      </div>
    </SectionCard>
  )
})

export const RestaurantEarningsSection = memo(function RestaurantEarningsSection({ earnings }) {
  return (
    <SectionCard
      title="Restaurant earnings"
      subtitle="How your payout is calculated for this order"
      icon={Wallet}
      className="border-[#FF6A00]/20"
    >
      <div className="mb-3 rounded-xl bg-gradient-to-br from-[#FF6A00] to-[#ff8a3d] p-4 text-white">
        <p className="text-[11px] font-bold uppercase tracking-wide text-white/80">
          Net restaurant earnings
        </p>
        <p className="mt-1 text-2xl font-black tabular-nums tracking-tight">
          {formatMoney(earnings.netEarnings)}
        </p>
        <p className="mt-1 text-[11px] text-white/80">{earnings.settlementStatus}</p>
      </div>

      <div className="space-y-0.5">
        <MoneyRow label="Order value (items + packaging)" value={earnings.orderValue} />
        <MetaRow
          label="Commission %"
          value={`${Number(earnings.commissionPct || 0).toLocaleString("en-IN", {
            maximumFractionDigits: 2,
          })}%`}
        />
        <MoneyRow label="Commission amount" value={earnings.commissionAmt} />
        {earnings.restaurantDeliveryFee > 0 ? (
          <MoneyRow label="Restaurant delivery fee (deducted)" value={earnings.restaurantDeliveryFee} />
        ) : null}
        {earnings.taxOnCommission > 0 ? (
          <MoneyRow label="Tax on commission" value={earnings.taxOnCommission} />
        ) : null}
        <div className="my-2 border-t border-dashed border-gray-100 dark:border-gray-800" />
        <MoneyRow label="Net restaurant earnings" value={earnings.netEarnings} strong />
        <MetaRow label="Settlement status" value={earnings.settlementStatus} />
        {earnings.settlementDateLabel ? (
          <MetaRow label="Settlement date" value={earnings.settlementDateLabel} />
        ) : null}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
        Net earnings = order value − restaurant delivery fee − commission. Final settlement
        appears in Hub Finance after the settlement cycle.
      </p>
    </SectionCard>
  )
})

export const DeliveryInfoSection = memo(function DeliveryInfoSection({ delivery }) {
  const hasPartner = Boolean(delivery.partnerName || delivery.partnerPhone)
  return (
    <SectionCard title="Delivery information" icon={Bike}>
      <div className="space-y-3">
        {hasPartner ? (
          <div className="flex items-start gap-3 rounded-xl bg-gray-50/80 p-3 dark:bg-gray-900/50">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#FF6A00] shadow-sm dark:bg-[#111]">
              <Bike className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 dark:text-white">
                {delivery.partnerName || "Delivery partner"}
              </p>
              {delivery.partnerPhone ? (
                <a
                  href={`tel:${delivery.partnerPhone}`}
                  className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-[#FF6A00]"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {delivery.partnerPhone}
                </a>
              ) : null}
              {delivery.partnerRating != null ? (
                <p className="mt-1 text-[11px] text-gray-500">
                  Rating {Number(delivery.partnerRating).toFixed(1)}★
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400">Delivery partner not assigned yet.</p>
        )}

        <div className="grid gap-1 sm:grid-cols-2 sm:gap-x-8">
          <MetaRow label="Dispatch status" value={delivery.dispatchStatus || "—"} />
          <MetaRow label="Distance" value={delivery.distanceLabel || "—"} />
          <MetaRow label="Pickup time" value={delivery.pickupAtLabel || "—"} />
          <MetaRow label="Delivery time" value={delivery.deliveredAtLabel || "—"} />
          <MetaRow label="Estimated ready / delivery" value={delivery.estimatedDeliveryLabel || "—"} />
          <MetaRow label="Actual delivery" value={delivery.actualDeliveryLabel || "—"} />
        </div>
      </div>
    </SectionCard>
  )
})

export const CancellationDetailsSection = memo(function CancellationDetailsSection({
  cancellation,
}) {
  if (!cancellation) return null
  return (
    <SectionCard title="Cancellation details" icon={Ban} className="border-red-100 dark:border-red-900/40">
      <div className="mb-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-300">
        {cancellation.summary || "This order was cancelled."}
      </div>
      <div className="space-y-1">
        <MetaRow label="Reason" value={cancellation.reason} emphasize />
        <MetaRow label="Cancelled by" value={cancellation.cancelledBy} />
        <MetaRow label="Cancellation time" value={cancellation.cancelledAtLabel || "—"} />
        <MetaRow label="Refund status" value={cancellation.refundStatus || "—"} />
        {cancellation.refundAmount > 0 ? (
          <MoneyRow label="Refund amount" value={cancellation.refundAmount} />
        ) : null}
        {cancellation.historyNote && cancellation.historyNote !== cancellation.reason ? (
          <MetaRow label="System note" value={cancellation.historyNote} />
        ) : null}
      </div>
    </SectionCard>
  )
})

export const ActivityLogSection = memo(function ActivityLogSection({ activityLog }) {
  return (
    <SectionCard
      title="Activity log"
      subtitle="Chronological audit of order events"
      icon={History}
    >
      {!activityLog?.length ? (
        <EmptyBlock
          title="No activity yet"
          subtitle="Status changes will be logged here automatically."
        />
      ) : (
        <ul className="space-y-2.5">
          {activityLog.map((entry) => (
            <li
              key={entry.id}
              className="rounded-xl border border-gray-100 px-3 py-2.5 dark:border-gray-800"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-bold text-gray-900 dark:text-white">
                  {entry.from} → {entry.to}
                </p>
                <p className="text-[11px] tabular-nums text-gray-400">{entry.atLabel}</p>
              </div>
              <p className="mt-1 text-[11px] text-gray-500">By {entry.byRole}</p>
              {entry.note ? (
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{entry.note}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
})
