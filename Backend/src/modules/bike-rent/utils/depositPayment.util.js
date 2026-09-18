export const DEPOSIT_STATUS = Object.freeze({
    NOT_REQUIRED: 'not_required',
    PENDING_ONLINE: 'pending_online',
    PENDING_COLLECTION: 'pending_collection',
    PAID: 'paid',
    REFUNDED: 'refunded',
});

/** Admin setting: which deposit payment options are available to users. */
export const DEPOSIT_PAYMENT_MODE = Object.freeze({
    ONLINE: 'online',
    PAY_AT_PICKUP: 'pay_at_pickup',
    BOTH: 'both',
});

/** User choice at booking time (or collection rail after). */
export const DEPOSIT_PAYMENT_METHOD = Object.freeze({
    ONLINE: 'online',
    PAY_AT_PICKUP: 'pay_at_pickup',
    RAZORPAY: 'razorpay',
    WALLET: 'wallet',
    CASH: 'cash',
    UPI: 'upi',
    COD: 'cod',
});

export const DEPOSIT_COLLECTION_METHODS = Object.freeze([
    DEPOSIT_PAYMENT_METHOD.CASH,
    DEPOSIT_PAYMENT_METHOD.UPI,
    DEPOSIT_PAYMENT_METHOD.COD,
]);

export function rentalPayableFromMoney(money = {}) {
    return Math.max(
        0,
        Number(money.rentalFee || 0)
            + Number(money.taxAmount || 0)
            - Number(money.discountAmount || 0),
    );
}

/**
 * Resolve the deposit payment plan for a new booking.
 *
 * Business rule (final): the security deposit is always collected online, bundled into the
 * same payment as the rest of the booking amount — "pay at pickup" no longer exists for new
 * bookings. `settingsMode`/`userChoice` are accepted but intentionally ignored (kept in the
 * signature so existing call sites don't need to change, and so a client can't force a
 * pending-collection deposit by sending an old `pay_at_pickup` value). Bookings created before
 * this change that are still sitting in `pending_collection` are unaffected — the collection
 * flow (`adminCollectDeposit`) that resolves them is untouched.
 * @returns {{
 *   choice: string|null,
 *   status: string,
 *   includeDepositInPayable: boolean,
 *   depositAmount: number,
 * }}
 */
export function resolveDepositPaymentPlan({ depositAmount = 0 } = {}) {
    const amount = Math.max(0, Number(depositAmount) || 0);
    if (amount <= 0) {
        return {
            choice: null,
            status: DEPOSIT_STATUS.NOT_REQUIRED,
            includeDepositInPayable: false,
            depositAmount: 0,
        };
    }

    return {
        choice: DEPOSIT_PAYMENT_METHOD.ONLINE,
        status: DEPOSIT_STATUS.PENDING_ONLINE,
        includeDepositInPayable: true,
        depositAmount: amount,
    };
}

export function buildSecurityDepositPayment({
    depositAmount,
    status,
    depositPaymentMethod = '',
    transactionId = '',
    paidAt = null,
    collectedBy = null,
    historyEntry = null,
}) {
    const history = [];
    if (historyEntry) history.push(historyEntry);
    return {
        depositAmount: Number(depositAmount) || 0,
        depositStatus: status,
        depositPaymentMethod: depositPaymentMethod || '',
        transactionId: transactionId || '',
        paidAt: paidAt || null,
        collectedBy: collectedBy || null,
        history,
    };
}

export function appendDepositPaymentHistory(booking, entry) {
    if (!booking.securityDepositPayment) {
        booking.securityDepositPayment = buildSecurityDepositPayment({
            depositAmount: Number(booking.money?.securityDeposit || 0),
            status: DEPOSIT_STATUS.NOT_REQUIRED,
        });
    }
    if (!Array.isArray(booking.securityDepositPayment.history)) {
        booking.securityDepositPayment.history = [];
    }
    booking.securityDepositPayment.history.push({
        status: entry.status || booking.securityDepositPayment.depositStatus,
        method: entry.method || '',
        transactionId: entry.transactionId || '',
        note: entry.note || '',
        at: entry.at || new Date(),
        performedBy: entry.performedBy || null,
    });
    if (typeof booking.markModified === 'function') {
        booking.markModified('securityDepositPayment');
    }
}

export function markDepositPaid(booking, {
    method,
    transactionId = '',
    performedBy = null,
    note = '',
} = {}) {
    const amount = Number(
        booking.securityDepositPayment?.depositAmount
            ?? booking.money?.securityDeposit
            ?? 0,
    );
    if (amount <= 0) {
        booking.securityDepositPayment = buildSecurityDepositPayment({
            depositAmount: 0,
            status: DEPOSIT_STATUS.NOT_REQUIRED,
            depositPaymentMethod: '',
        });
        return booking;
    }

    const existing = booking.securityDepositPayment || {};
    booking.securityDepositPayment = {
        depositAmount: amount,
        depositStatus: DEPOSIT_STATUS.PAID,
        depositPaymentMethod: method || existing.depositPaymentMethod || '',
        transactionId: transactionId || existing.transactionId || '',
        paidAt: new Date(),
        collectedBy: performedBy || existing.collectedBy || null,
        history: Array.isArray(existing.history) ? existing.history : [],
    };
    appendDepositPaymentHistory(booking, {
        status: DEPOSIT_STATUS.PAID,
        method: method || '',
        transactionId: transactionId || '',
        note: note || 'Security deposit paid',
        performedBy,
    });
    return booking;
}

export function isDepositClearedForHandover(booking) {
    const amount = Number(
        booking.securityDepositPayment?.depositAmount
            ?? booking.money?.securityDeposit
            ?? 0,
    );
    if (amount <= 0) return true;
    const status = String(booking.securityDepositPayment?.depositStatus || '').toLowerCase();
    return status === DEPOSIT_STATUS.PAID || status === DEPOSIT_STATUS.NOT_REQUIRED;
}

export function depositStatusLabel(status) {
    const key = String(status || '').toLowerCase();
    const labels = {
        [DEPOSIT_STATUS.NOT_REQUIRED]: 'Not required',
        [DEPOSIT_STATUS.PENDING_ONLINE]: 'Pending online payment',
        [DEPOSIT_STATUS.PENDING_COLLECTION]: 'Pending collection',
        [DEPOSIT_STATUS.PAID]: 'Paid',
        [DEPOSIT_STATUS.REFUNDED]: 'Refunded',
    };
    return labels[key] || key || 'Unknown';
}
