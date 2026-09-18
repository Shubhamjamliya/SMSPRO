/**
 * Reusable late-return billing calculator for bike rentals.
 * All money math for overtime belongs here — callers must not invent rates.
 */

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

function toDate(value, label = 'timestamp') {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error(`Invalid ${label}`);
    }
    return date;
}

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function formatDuration(ms) {
    const totalMinutes = Math.max(0, Math.ceil(ms / MS_PER_MINUTE));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours <= 0) return `${minutes} min`;
    if (minutes <= 0) return `${hours} hr${hours === 1 ? '' : 's'}`;
    return `${hours} hr${hours === 1 ? '' : 's'} ${minutes} min`;
}

/**
 * Calculate late return charges against security deposit.
 *
 * Partial hours bill as the next full hour after grace (ceil).
 * Example: 61 minutes late with 0 grace → 2 billable hours.
 *
 * @param {object} input
 * @returns {object}
 */
export function calculateLateReturnCharges({
    scheduledReturnTime,
    actualReturnTime,
    securityDeposit = 0,
    hourlyCharge = 0,
    gracePeriodMinutes = 0,
    maxLateCharge = null,
    damageFee = 0,
} = {}) {
    const scheduled = toDate(scheduledReturnTime, 'scheduledReturnTime');
    const actual = toDate(actualReturnTime, 'actualReturnTime');
    const deposit = Math.max(0, Number(securityDeposit) || 0);
    const chargePerHour = Math.max(0, Number(hourlyCharge) || 0);
    const graceMinutes = Math.max(0, Number(gracePeriodMinutes) || 0);
    const damage = Math.max(0, Number(damageFee) || 0);

    const rawLateMs = Math.max(0, actual.getTime() - scheduled.getTime());
    const graceMs = graceMinutes * MS_PER_MINUTE;
    const billableMs = Math.max(0, rawLateMs - graceMs);
    const isLate = billableMs > 0;

    const extraHours = isLate ? Math.ceil(billableMs / MS_PER_HOUR) : 0;
    let totalLateCharge = roundMoney(extraHours * chargePerHour);

    // A cap of exactly 0 is indistinguishable from "not configured" and would otherwise zero
    // out every late fee — only a positive cap is treated as an active maximum.
    const maxCap = maxLateCharge == null || maxLateCharge === ''
        ? null
        : Math.max(0, Number(maxLateCharge));
    if (maxCap != null && Number.isFinite(maxCap) && maxCap > 0) {
        totalLateCharge = Math.min(totalLateCharge, roundMoney(maxCap));
    }

    const totalCharges = roundMoney(totalLateCharge + damage);
    const depositDeduction = roundMoney(Math.min(deposit, totalCharges));
    const remainingPayable = roundMoney(Math.max(0, totalCharges - depositDeduction));
    const refundableAmount = roundMoney(Math.max(0, deposit - depositDeduction));

    return {
        isLate,
        scheduledReturnAt: scheduled.toISOString(),
        actualReturnAt: actual.toISOString(),
        lateDurationMs: rawLateMs,
        lateDurationLabel: formatDuration(rawLateMs),
        graceMinutesApplied: graceMinutes,
        billableDurationMs: billableMs,
        billableDurationLabel: formatDuration(billableMs),
        extraHours,
        chargePerHour: roundMoney(chargePerHour),
        totalLateCharge,
        damageFee: roundMoney(damage),
        totalCharges,
        securityDeposit: roundMoney(deposit),
        depositDeduction,
        remainingPayable,
        refundableAmount,
        paymentStatus: remainingPayable > 0 ? 'pending' : 'settled',
    };
}

/**
 * Build a durable booking.lateReturn snapshot from calculator output.
 */
export function buildLateReturnSnapshot(calc, {
    note = '',
    performedBy = null,
    previous = null,
} = {}) {
    const history = Array.isArray(previous?.billingHistory) ? [...previous.billingHistory] : [];
    history.push({
        at: new Date(),
        note: note || 'Late return charges calculated',
        totalLateCharge: calc.totalLateCharge,
        damageFee: calc.damageFee,
        depositDeduction: calc.depositDeduction,
        remainingPayable: calc.remainingPayable,
        refundableAmount: calc.refundableAmount,
        performedBy: performedBy || null,
    });

    return {
        isLate: Boolean(calc.isLate),
        scheduledReturnAt: new Date(calc.scheduledReturnAt),
        actualReturnAt: new Date(calc.actualReturnAt),
        lateDurationMs: calc.lateDurationMs,
        lateDurationLabel: calc.lateDurationLabel,
        graceMinutesApplied: calc.graceMinutesApplied,
        billableDurationMs: calc.billableDurationMs,
        billableDurationLabel: calc.billableDurationLabel,
        extraHours: calc.extraHours,
        chargePerHour: calc.chargePerHour,
        chargeAmount: calc.totalLateCharge,
        damageFee: calc.damageFee,
        totalCharges: calc.totalCharges,
        deductedFromDeposit: calc.depositDeduction,
        remainingAmount: calc.remainingPayable,
        refundableAmount: calc.refundableAmount,
        paymentStatus: calc.paymentStatus,
        remainingPaidAt: null,
        remainingPaymentMethod: '',
        remainingTransactionId: '',
        calculatedAt: new Date(),
        billingHistory: history.slice(-30),
    };
}

export default {
    calculateLateReturnCharges,
    buildLateReturnSnapshot,
};
