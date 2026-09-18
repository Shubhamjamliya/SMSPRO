import { formatInr } from "../utils/format";

function Row({ label, value, emphasize = false, muted = false, credit = false, danger = false }) {
  return (
    <p className={`flex items-start justify-between gap-3 text-sm ${muted ? "text-gray-500" : ""}`}>
      <span className="min-w-0 pr-2 text-left">{label}</span>
      <b
        className={`shrink-0 text-right tabular-nums ${
          emphasize
            ? "text-[#FF6A00]"
            : credit
              ? "text-emerald-600"
              : danger
                ? "text-rose-600"
                : "text-gray-900"
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
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function durationLabel(hours, startAt, endAt) {
  if (Number(hours) > 0) {
    const n = Number(hours);
    if (n === Math.floor(n)) return `${n} hour${n === 1 ? "" : "s"}`;
    return `${n} hours`;
  }
  if (startAt && endAt) {
    return `${when(startAt)} → ${when(endAt)}`;
  }
  return "—";
}

/**
 * Return settlement breakdown — amounts from GET /return/preview (backend).
 */
export default function ReturnSettlementSummaryCard({
  preview,
  loading = false,
  className = "",
}) {
  if (loading) {
    return (
      <section className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ${className}`.trim()}>
        <div className="h-40 animate-pulse rounded-xl bg-gray-100" />
      </section>
    );
  }

  if (!preview) return null;

  const rental = preview.rental || {};
  const late = preview.late || {};
  const refund = preview.refund || {};
  const deductions = Array.isArray(preview.deductions) ? preview.deductions : [];

  return (
    <section
      className={`rounded-2xl border border-orange-100 bg-white p-4 text-left shadow-sm sm:p-5 ${className}`.trim()}
    >
      <h2 className="text-sm font-black text-gray-900">Return calculation</h2>
      <p className="mt-1 text-xs text-gray-500">
        {preview.estimateNote
          || (preview.confirmed
            ? "Confirmed settlement from your booking."
            : "Estimate from booking rules. Final after hub inspection.")}
      </p>

      <div className="mt-4 space-y-2.5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Rental</p>
        <Row
          label="Total rental amount"
          value={formatInr(rental.rentalFee)}
        />
        <Row
          label="Booking duration"
          value={durationLabel(rental.durationHours, rental.startAt, rental.endAt)}
          muted
        />
        {Number(rental.extensionFee || 0) > 0 ? (
          <Row label="Extension charges" value={formatInr(rental.extensionFee)} />
        ) : null}
        {Number(rental.discountAmount || 0) > 0 ? (
          <Row
            label="Discount"
            value={`−${formatInr(rental.discountAmount)}`}
            credit
          />
        ) : null}

        <div className="border-t border-gray-100 pt-3 space-y-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
            Deposit & charges
          </p>
          <Row label="Security deposit" value={formatInr(preview.securityDeposit)} />
          {late.isLate || Number(late.totalLateCharge || 0) > 0 ? (
            <>
              <Row
                label="Extra hours"
                value={
                  late.extraHours
                    ? `${late.extraHours} hr${late.extraHours === 1 ? "" : "s"}`
                    : (late.lateDurationLabel || "Yes")
                }
                muted
              />
              {late.lateDurationLabel ? (
                <Row label="Late duration" value={late.lateDurationLabel} muted />
              ) : null}
              <Row
                label="Extra hours charges"
                value={formatInr(late.totalLateCharge)}
                danger={Number(late.totalLateCharge || 0) > 0}
              />
            </>
          ) : (
            <Row label="Extra hours charges" value={formatInr(0)} muted />
          )}
        </div>

        {deductions.length > 0 ? (
          <div className="border-t border-gray-100 pt-3 space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
              Deductions
            </p>
            {deductions.map((row) => (
              <div key={row.key || row.label}>
                <Row
                  label={row.label}
                  value={`−${formatInr(row.amount)}`}
                  danger
                />
                {row.reason ? (
                  <p className="mt-0.5 text-[11px] text-gray-400">{row.reason}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="border-t border-gray-100 pt-3 space-y-2.5">
          <Row
            label="Total deducted from deposit"
            value={formatInr(preview.totalDeducted)}
            danger={Number(preview.totalDeducted || 0) > 0}
          />
          <Row
            label="Final refundable amount"
            value={formatInr(preview.finalRefundable)}
            emphasize
          />
          {Number(preview.remainingPayable || 0) > 0 ? (
            <Row
              label="Remaining payable"
              value={formatInr(preview.remainingPayable)}
              danger
            />
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/80 p-3 space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800/80">
          Refund details
        </p>
        <Row label="Refund amount" value={formatInr(refund.amount)} emphasize />
        <Row label="Refund status" value={refund.status || "—"} />
        <Row label="Refund timeline" value={refund.timeline || "—"} muted />
        <Row label="Refund method" value={refund.method || "Wallet"} muted />
        {refund.creditedAt ? (
          <Row label="Credited on" value={when(refund.creditedAt)} credit />
        ) : null}
        {refund.eligibleAt && refund.status === "Processing" ? (
          <Row label="Expected by" value={when(refund.eligibleAt)} muted />
        ) : null}
      </div>
    </section>
  );
}
