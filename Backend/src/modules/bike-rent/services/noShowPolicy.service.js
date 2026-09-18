/**
 * Bike Rental no-show policy calculator.
 * Partial refund rule uses DEDUCTION semantics (admin configures what to withhold).
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
 * Calculate no-show eligibility + security-deposit refund amounts.
 *
 * Refund rules:
 * - full    → credit entire deposit
 * - none    → credit ₹0
 * - partial → withhold fixed ₹ or % (deduction), credit the remainder
 *
 * @param {object} input
 * @returns {object}
 */
export function calculateNoShowRefund({
    bookingId = null,
    serviceType = 'BIKE_RENTAL',
    now = new Date(),
    pickupTime,
    graceMinutes = 30,
    policyEnabled = true,
    refundRule = 'full', // full | partial | none
    refundMode = 'percent', // percent | fixed (deduction mode for partial)
    refundPercent = 20,
    refundFixed = 0,
    /** @deprecated Prefer partial deduction fields; still applied as an extra withhold if > 0 */
    penaltyAmount = 0,
    securityDeposit = 0,
    depositHeld = 0,
    rentalFee = 0,
    totalPaid = 0,
} = {}) {
    const evaluatedAt = toDate(now, 'now');
    const pickupAt = toDate(pickupTime, 'pickupTime');
    const grace = Math.max(0, Number(graceMinutes) || 0);
    const graceEndsAt = new Date(pickupAt.getTime() + grace * 60 * 1000);
    const enabled = policyEnabled !== false;

    const depositBase = roundMoney(
        Math.max(0, Number(depositHeld) || 0)
            || Math.max(0, Number(securityDeposit) || 0),
    );

    const legacyPenalty = roundMoney(
        Math.min(depositBase, Math.max(0, Number(penaltyAmount) || 0)),
    );
    const afterLegacyPenalty = roundMoney(Math.max(0, depositBase - legacyPenalty));

    const rule = String(refundRule || 'full').toLowerCase();
    const mode = String(refundMode || 'percent').toLowerCase() === 'fixed' ? 'fixed' : 'percent';

    let deductionAmount = 0;
    let depositRefund = 0;

    if (rule === 'none') {
        deductionAmount = afterLegacyPenalty;
        depositRefund = 0;
    } else if (rule === 'partial') {
        if (mode === 'fixed') {
            deductionAmount = roundMoney(
                Math.min(afterLegacyPenalty, Math.max(0, Number(refundFixed) || 0)),
            );
        } else {
            const pct = Math.max(0, Math.min(100, Number(refundPercent) || 0));
            deductionAmount = roundMoney(afterLegacyPenalty * pct / 100);
        }
        depositRefund = roundMoney(Math.max(0, afterLegacyPenalty - deductionAmount));
    } else {
        // full
        deductionAmount = 0;
        depositRefund = afterLegacyPenalty;
    }

    // Total retained = legacy penalty (if any) + policy deduction
    const depositCaptured = roundMoney(Math.max(0, depositBase - depositRefund));
    const isEligible = enabled && evaluatedAt.getTime() >= graceEndsAt.getTime();

    return {
        bookingId: bookingId ? String(bookingId) : null,
        serviceType: String(serviceType || 'BIKE_RENTAL').toUpperCase(),
        policyEnabled: enabled,
        isEligible,
        pickupTime: pickupAt.toISOString(),
        graceMinutes: grace,
        graceEndsAt: graceEndsAt.toISOString(),
        refundRule: ['full', 'partial', 'none'].includes(rule) ? rule : 'full',
        refundMode: mode,
        refundPercent: roundMoney(refundPercent),
        refundFixed: roundMoney(refundFixed),
        penaltyAmount: legacyPenalty,
        deductionAmount: roundMoney(deductionAmount + legacyPenalty),
        securityDeposit: depositBase,
        depositRefund,
        depositCaptured,
        walletCreditAmount: depositRefund,
        rentalForfeited: roundMoney(Math.max(0, Number(rentalFee) || 0)),
        totalPaid: roundMoney(totalPaid),
        evaluatedAt: evaluatedAt.toISOString(),
        message: !enabled
            ? 'No-show policy is disabled'
            : isEligible
                ? 'Pickup grace window has expired — eligible for no-show'
                : 'Still within pickup grace window',
    };
}

/**
 * Preview helper used by admin settings (same math as production).
 */
export function previewNoShowRefund({
    securityDeposit = 2000,
    refundRule = 'full',
    refundMode = 'percent',
    refundPercent = 20,
    refundFixed = 0,
    penaltyAmount = 0,
    graceMinutes = 30,
} = {}) {
    return calculateNoShowRefund({
        pickupTime: new Date(),
        now: new Date(Date.now() + (Math.max(0, Number(graceMinutes) || 0) + 1) * 60 * 1000),
        graceMinutes,
        policyEnabled: true,
        refundRule,
        refundMode,
        refundPercent,
        refundFixed,
        penaltyAmount,
        securityDeposit,
        depositHeld: securityDeposit,
    });
}

export function buildNoShowPolicyMessage({
    graceMinutes = 30,
    refundRule = 'full',
    refundPercent = 20,
    refundFixed = 0,
    refundMode = 'percent',
    policyEnabled = true,
} = {}) {
    if (!policyEnabled) {
        return 'No-show policy is currently disabled for bike rentals.';
    }
    const grace = Math.max(0, Number(graceMinutes) || 0);
    let refundText = 'the security deposit will be refunded to your wallet';
    const rule = String(refundRule || 'full').toLowerCase();
    if (rule === 'none') {
        refundText = 'the security deposit will not be refunded';
    } else if (rule === 'partial') {
        if (String(refundMode).toLowerCase() === 'fixed') {
            refundText = `₹${Number(refundFixed || 0)} may be deducted from the security deposit and the remaining amount credited to your wallet`;
        } else {
            refundText = `${Number(refundPercent || 0)}% may be deducted from the security deposit and the remaining amount credited to your wallet`;
        }
    }
    return `If you do not pick up the bike within ${grace} minutes of your scheduled pickup time, the refund will be processed according to the Bike Rental No Show Policy. ${refundText.charAt(0).toUpperCase()}${refundText.slice(1)}.`;
}

export default {
    calculateNoShowRefund,
    previewNoShowRefund,
    buildNoShowPolicyMessage,
};
