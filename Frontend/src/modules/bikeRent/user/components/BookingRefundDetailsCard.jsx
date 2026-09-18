import { formatInr } from "../utils/format";
import { getBookingRefundDetails } from "../utils/bookingDisplay";

function Row({ label, value, emphasize = false, tone }) {
  const toneClass =
    tone === "completed"
      ? "text-emerald-600"
      : tone === "processing"
        ? "text-amber-700"
        : tone === "pending"
          ? "text-sky-700"
          : tone === "failed"
            ? "text-rose-600"
            : emphasize
              ? "text-[#FF6A00]"
              : "text-gray-900";

  return (
    <p className="flex items-start justify-between gap-3 text-sm">
      <span className="text-gray-500">{label}</span>
      <b className={`shrink-0 text-right tabular-nums ${toneClass}`}>{value}</b>
    </p>
  );
}

/**
 * Clear refund status for cancelled / deposit / no-show settlements.
 * Uses booking.cancellation, depositRefund, noShow from the API.
 */
export default function BookingRefundDetailsCard({ booking }) {
  const details = getBookingRefundDetails(booking);
  if (!details) return null;

  const showCredited =
    details.statusTone === "completed"
    && details.creditedLabel
    && details.creditedLabel !== "—";

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-4 text-left shadow-sm sm:p-5">
      <h2 className="text-sm font-black text-gray-900">{details.title}</h2>
      <p className="mt-1 text-xs text-gray-500">
        Refund amounts and status come from your booking transaction.
      </p>

      <div className="mt-4 space-y-2.5">
        <Row
          label="Amount"
          value={formatInr(details.amount)}
          emphasize
        />
        <Row
          label="Status"
          value={details.status}
          tone={details.statusTone}
        />
        <Row label="Refund initiated" value={details.initiatedLabel} />
        <Row label="Expected credit" value={details.expectedLabel} />
        {showCredited ? (
          <Row label="Credited on" value={details.creditedLabel} tone="completed" />
        ) : null}
        <Row label="Refund method" value={details.method} />
      </div>

      {details.breakdown?.length ? (
        <div className="mt-4 space-y-2 border-t border-gray-100 pt-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
            Breakdown
          </p>
          {details.breakdown.map((row) => (
            <Row
              key={row.label}
              label={row.label}
              value={
                row.amount < 0
                  ? `−${formatInr(Math.abs(row.amount))}`
                  : formatInr(row.amount)
              }
              tone={row.amount < 0 ? "failed" : "completed"}
            />
          ))}
        </div>
      ) : null}

      {details.note ? (
        <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
          {details.note}
        </p>
      ) : null}
      {details.reference ? (
        <p className="mt-2 text-[11px] text-gray-400">Ref · {details.reference}</p>
      ) : null}
    </section>
  );
}
