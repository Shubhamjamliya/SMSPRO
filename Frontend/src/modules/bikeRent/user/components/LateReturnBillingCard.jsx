import { formatInr } from "../utils/format";
import { PrimaryButton } from "./ui";

function Row({ label, value, emphasize = false, muted = false }) {
  return (
    <p className={`flex items-start justify-between gap-3 text-sm ${muted ? "text-gray-500" : ""}`}>
      <span>{label}</span>
      <b className={`shrink-0 text-right ${emphasize ? "text-[#FF6A00]" : ""}`}>{value}</b>
    </p>
  );
}

function formatWhen(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

/**
 * Displays server-calculated late return + deposit adjustment breakdown.
 * Optional pay handlers for remaining balance.
 */
export default function LateReturnBillingCard({
  booking,
  paying = false,
  onPayWallet,
  onPayOnline,
}) {
  const late = booking?.lateReturn;
  if (!late || (!late.isLate && !(Number(late.chargeAmount) > 0) && !(Number(late.remainingAmount) > 0))) {
    return null;
  }

  const deposit =
    booking?.securityDepositPayment?.originalAmount
    ?? booking?.securityDepositPayment?.depositAmount
    ?? booking?.money?.securityDeposit
    ?? late.securityDeposit
    ?? 0;
  const remaining = Number(late.remainingAmount || 0);
  const needsPay = remaining > 0 && late.paymentStatus === "pending";
  const refundable = Number(
    late.refundableAmount
      ?? booking?.securityDepositPayment?.refundableAmount
      ?? 0,
  );

  return (
    <section className="rounded-2xl border border-orange-100 bg-white p-4 text-left shadow-sm sm:p-5">
      <h2 className="text-sm font-black text-gray-900">Return billing</h2>
      <p className="mt-1 text-xs text-gray-500">
        Extra hour charges are calculated by the system from your scheduled vs actual return.
      </p>

      <div className="mt-4 space-y-2.5">
        <Row label="Rental amount" value={formatInr(booking?.money?.rentalFee ?? 0)} />
        <Row label="Security deposit" value={formatInr(deposit)} />
        <Row label="Scheduled return" value={formatWhen(late.scheduledReturnAt || booking?.endAt)} muted />
        <Row label="Actual return" value={formatWhen(late.actualReturnAt || booking?.actualEndAt)} muted />
        <Row
          label="Late duration"
          value={late.lateDurationLabel || (late.extraHours ? `${late.extraHours} hr` : "—")}
        />
        {late.graceMinutesApplied > 0 ? (
          <Row label="Grace applied" value={`${late.graceMinutesApplied} min`} muted />
        ) : null}
        <Row label="Extra charges" value={formatInr(late.chargeAmount || 0)} emphasize />
        {Number(late.damageFee || 0) > 0 ? (
          <Row label="Damage fee" value={formatInr(late.damageFee)} />
        ) : null}
        <Row
          label="Security deposit deduction"
          value={`-${formatInr(late.deductedFromDeposit || 0)}`}
        />
        {needsPay ? (
          <Row label="Remaining payable" value={formatInr(remaining)} emphasize />
        ) : (
          <Row label="Final refund" value={formatInr(refundable)} emphasize />
        )}
      </div>

      {needsPay ? (
        <div className="mt-4 space-y-2">
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            Extra charges exceed your deposit. Please pay the remaining balance to finish settlement.
          </p>
          {onPayOnline ? (
            <PrimaryButton disabled={paying} onClick={onPayOnline}>
              {paying ? "Processing…" : `Pay now ${formatInr(remaining)}`}
            </PrimaryButton>
          ) : null}
          {onPayWallet ? (
            <PrimaryButton
              disabled={paying}
              onClick={onPayWallet}
              className="bg-white text-[#FF6A00] ring-1 ring-orange-200"
            >
              Pay with wallet
            </PrimaryButton>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
