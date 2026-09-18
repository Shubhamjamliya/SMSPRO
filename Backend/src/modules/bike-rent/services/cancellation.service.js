/**
 * Reusable bike-rental cancellation / refund calculator.
 * All fee math for cancel belongs here — callers must not invent rates.
 */

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function toDate(value, label = 'timestamp') {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error(`Invalid ${label}`);
    }
    return date;
}

/**
 * @param {object} input
 * @returns {object}
 */
export function calculateCancellationRefund({
    bookingId = null,
    serviceType = 'BIKE_RENTAL',
    cancellationTime = new Date(),
    pickupTime,
    bookingStatus = '',
    rentalFee = 0,
    totalPaid = 0,
    depositHeld = 0,
    securityDeposit = 0,
    freeCancelBeforePickupMinutes = 60,
    cancellationChargeType = 'percent', // 'percent' | 'fixed'
    cancellationChargePercent = 10,
    cancellationChargeFixed = 0,
} = {}) {
    const cancelledAt = toDate(cancellationTime, 'cancellationTime');
    const pickupAt = toDate(pickupTime, 'pickupTime');
    const freeMinutes = Math.max(0, Number(freeCancelBeforePickupMinutes) || 0);
    const freeCancelUntil = new Date(pickupAt.getTime() - freeMinutes * 60 * 1000);

    const status = String(bookingStatus || '').toLowerCase();
    const prePaymentStatuses = new Set([
        'requested',
        'pending_approval',
        'payment_pending',
    ]);
    const isPrePayment = prePaymentStatuses.has(status);
    const withinFreeWindow = cancelledAt.getTime() < freeCancelUntil.getTime();

    // Pre-payment / soft-hold cancels are always free.
    // Reserved (or paid) cancels are free only inside the free window.
    const freeCancel = isPrePayment || withinFreeWindow;

    let cancellationCharge = 0;
    if (!freeCancel) {
        const chargeType = String(cancellationChargeType || 'percent').toLowerCase();
        if (chargeType === 'fixed') {
            cancellationCharge = roundMoney(Math.max(0, Number(cancellationChargeFixed) || 0));
        } else {
            const pct = Math.max(0, Number(cancellationChargePercent) || 0);
            cancellationCharge = roundMoney((Number(rentalFee) || 0) * pct / 100);
        }
    }

    const paid = roundMoney(Math.max(0, Number(totalPaid) || 0));
    const heldDeposit = roundMoney(Math.max(0, Number(depositHeld) || 0));
    const depositSnapshot = heldDeposit > 0
        ? heldDeposit
        : roundMoney(Math.max(0, Number(securityDeposit) || 0));

    // Deposit held is always returned on pre-pickup cancel (fee comes from rental portion).
    const securityDepositRefund = heldDeposit;
    const rentalPortionPaid = Math.max(0, paid - heldDeposit);
    const rentalRefund = Math.max(0, roundMoney(rentalPortionPaid - cancellationCharge));
    const walletCreditAmount = roundMoney(rentalRefund + securityDepositRefund);
    const finalRefundAmount = walletCreditAmount;

    // If unpaid deposit was never collected, nothing to refund for deposit.
    const pendingDepositNotCollected = heldDeposit <= 0
        && depositSnapshot > 0
        && paid < depositSnapshot;

    return {
        bookingId: bookingId ? String(bookingId) : null,
        serviceType: String(serviceType || 'BIKE_RENTAL').toUpperCase(),
        cancellationAllowed: true,
        cancelledAt: cancelledAt.toISOString(),
        pickupTime: pickupAt.toISOString(),
        freeCancelUntil: freeCancelUntil.toISOString(),
        freeCancelBeforePickupMinutes: freeMinutes,
        withinFreeWindow: freeCancel,
        freeCancel,
        cancellationChargeType: String(cancellationChargeType || 'percent').toLowerCase() === 'fixed'
            ? 'fixed'
            : 'percent',
        cancellationCharge,
        rentalFee: roundMoney(rentalFee),
        rentalPortionPaid: roundMoney(rentalPortionPaid),
        rentalRefund,
        securityDeposit: depositSnapshot,
        securityDepositRefund,
        securityDepositPendingCollection: Boolean(pendingDepositNotCollected),
        walletCreditAmount,
        finalRefundAmount,
        breakdown: {
            rentalRefund,
            cancellationCharge,
            securityDepositRefund,
            walletCredit: walletCreditAmount,
        },
    };
}

export default { calculateCancellationRefund };
