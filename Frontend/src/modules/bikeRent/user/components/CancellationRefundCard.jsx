import { formatInr } from "../utils/format";
import {
  bookingStatusLabel,
  cancelledByLabel,
  formatCancellationDate,
} from "../utils/bookingDisplay";

function Row({ label, value, emphasize = false, danger = false }) {
  return (
    <p className="flex items-start justify-between gap-3 text-sm">
      <span className="text-gray-600">{label}</span>
      <b
        className={`shrink-0 text-right ${
          emphasize ? "text-[#FF6A00]" : danger ? "text-rose-600" : "text-gray-900"
        }`}
      >
        {value}
      </b>
    </p>
  );
}

function when(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

/**
 * Post-cancellation summary shown on My Bookings / booking details.
 */
export function CancellationDetailsCard({ booking, className = "" }) {
  if (!booking || String(booking.status || "").toLowerCase() !== "cancelled") {
    return null;
  }

  const reason = String(booking.cancellationReason || "").trim();

  return (
    <section
      className={`rounded-2xl border border-rose-100 bg-rose-50/70 p-4 text-left shadow-sm ${className}`.trim()}
    >
      <h2 className="text-sm font-black text-rose-950">Cancellation details</h2>
      <div className="mt-3 space-y-2.5">
        <Row label="Status" value={bookingStatusLabel(booking.status)} danger />
        <Row label="Cancelled by" value={cancelledByLabel(booking.cancelledBy)} />
        <Row label="Cancelled date" value={formatCancellationDate(booking.cancelledAt)} />
        <p className="text-sm">
          <span className="text-gray-600">Reason</span>
          <b className="mt-1 block break-words font-semibold text-gray-900">
            {reason || "No reason provided"}
          </b>
        </p>
      </div>
    </section>
  );
}

/**
 * Server-calculated cancellation refund breakdown.
 */
export default function CancellationRefundCard({
  preview,
  loading = false,
  confirming = false,
  onConfirm,
  onDismiss,
}) {
  if (loading) {
    return (
      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
      </section>
    );
  }

  if (!preview) return null;

  const free = Boolean(preview.withinFreeWindow || preview.freeCancel);

  return (
    <section className="rounded-2xl border border-orange-100 bg-white p-4 text-left shadow-sm sm:p-5">
      <h2 className="text-sm font-black text-gray-900">Cancellation refund</h2>
      <p className="mt-1 text-xs text-gray-500">
        Refund amounts are calculated by the server from admin cancellation rules.
      </p>

      <div className="mt-4 space-y-2.5">
        <Row label="Pickup time" value={when(preview.pickupTime)} />
        <Row label="Free cancellation until" value={when(preview.freeCancelUntil)} />
        <Row
          label="Window status"
          value={free ? "Within free window" : "Free window expired"}
          emphasize={free}
          danger={!free}
        />
        <Row label="Security deposit refund" value={formatInr(preview.securityDepositRefund || 0)} />
        <Row
          label="Cancellation charge"
          value={formatInr(preview.cancellationCharge || 0)}
          danger={Number(preview.cancellationCharge || 0) > 0}
        />
        <Row label="Rental refund" value={formatInr(preview.rentalRefund || 0)} />
        <Row
          label="Wallet credit"
          value={formatInr(preview.walletCreditAmount || preview.finalRefundAmount || 0)}
          emphasize
        />
      </div>

      {Number(preview.walletCreditAmount || 0) > 0 ? (
        <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
          Credited to your central wallet immediately after confirmation.
        </p>
      ) : (
        <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
          No paid amount to refund for this booking.
        </p>
      )}

      {(onConfirm || onDismiss) ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {onDismiss ? (
            <button
              type="button"
              disabled={confirming}
              onClick={onDismiss}
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-700"
            >
              Keep booking
            </button>
          ) : null}
          {onConfirm ? (
            <button
              type="button"
              disabled={confirming}
              onClick={onConfirm}
              className="w-full rounded-2xl bg-[#FF6A00] px-4 py-3 text-sm font-extrabold text-white disabled:opacity-50"
            >
              {confirming ? "Cancelling…" : "Confirm cancellation"}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
