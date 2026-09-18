import { formatInr } from "../utils/format";
import {
  bookingPaymentLines,
  depositStatusLabel,
} from "../utils/bookingDisplay";

function Row({ label, value, emphasize = false, muted = false, credit = false }) {
  return (
    <p className={`flex items-start justify-between gap-3 text-sm ${muted ? "text-gray-500" : ""}`}>
      <span className="min-w-0 pr-2">{label}</span>
      <b
        className={`shrink-0 tabular-nums text-right ${
          emphasize
            ? "text-[#FF6A00]"
            : credit
              ? "text-emerald-600"
              : "text-gray-900"
        }`}
      >
        {value}
      </b>
    </p>
  );
}

/**
 * Payment breakdown for booking details — displays backend money fields only.
 */
export default function BookingPaymentSummaryCard({ booking }) {
  const { summary, lines } = bookingPaymentLines(booking);
  if (!booking) return null;

  const hasAny =
    lines.length > 0
    || summary.totalPayable > 0
    || summary.totalPaid > 0;

  if (!hasAny) return null;

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm sm:p-5">
      <h2 className="text-sm font-black text-gray-900">Payment summary</h2>
      <p className="mt-1 text-xs text-gray-500">
        Amounts from your booking record. Totals are not recalculated on this device.
      </p>

      <div className="mt-4 space-y-2.5">
        {lines.map((line) => (
          <Row
            key={line.key}
            label={line.label}
            value={
              line.credit || line.amount < 0
                ? `−${formatInr(Math.abs(line.amount))}`
                : formatInr(line.amount)
            }
            muted={Boolean(line.muted)}
            credit={Boolean(line.credit) || line.amount < 0}
          />
        ))}

        <div className="border-t border-gray-100 pt-3 space-y-2.5">
          <Row
            label="Final payable"
            value={formatInr(summary.totalPayable)}
            emphasize
          />
          <Row
            label="Amount paid"
            value={formatInr(summary.totalPaid)}
          />
        </div>

        {summary.depositStatus ? (
          <Row
            label="Deposit status"
            value={depositStatusLabel(summary.depositStatus)}
            muted
          />
        ) : null}
        {summary.paymentMethod ? (
          <Row
            label="Payment method"
            value={summary.paymentMethod.replace(/_/g, " ")}
            muted
          />
        ) : null}
      </div>
    </section>
  );
}
