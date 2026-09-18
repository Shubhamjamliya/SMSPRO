/**
 * Canonical wallet transaction sources for the multi-service super app.
 * One user → one wallet; modules only differ by `source` on each transaction.
 */
export const WALLET_SOURCES = Object.freeze({
    FOOD: 'FOOD',
    TAXI: 'TAXI',
    PORTER: 'PORTER',
    BIKE_RENTAL: 'BIKE_RENTAL',
    QUICK_COMMERCE: 'QUICK_COMMERCE',
    CONSTRUCTION: 'CONSTRUCTION',
    PROMOTION: 'PROMOTION',
    CASHBACK: 'CASHBACK',
    REFERRAL: 'REFERRAL',
    TOPUP: 'TOPUP',
    SYSTEM: 'SYSTEM',
});

export const WALLET_TXN_TYPES = Object.freeze({
    CREDIT: 'CREDIT',
    DEBIT: 'DEBIT',
});

export const WALLET_TXN_STATUS = Object.freeze({
    COMPLETED: 'completed',
    PENDING: 'pending',
    FAILED: 'failed',
});

/** Map legacy / module-specific source strings → canonical source. */
export function normalizeWalletSource(raw) {
    const key = String(raw || '').trim().toUpperCase();
    if (WALLET_SOURCES[key]) return WALLET_SOURCES[key];
    const lower = String(raw || '').trim().toLowerCase();
    if (
        lower.startsWith('bike_rent')
        || lower.startsWith('bike-rent')
        || lower.includes('bike_rent')
        || lower.includes('bike-rent')
        || lower.includes('bike rental')
        || lower === 'bike'
    ) {
        return WALLET_SOURCES.BIKE_RENTAL;
    }
    if (lower.includes('construction') || lower.includes('contractor')) {
        return WALLET_SOURCES.CONSTRUCTION;
    }
    if (lower.includes('taxi') || lower.includes('ride')) return WALLET_SOURCES.TAXI;
    if (lower.includes('porter')) return WALLET_SOURCES.PORTER;
    if (lower.includes('quick') || lower.includes('qc')) return WALLET_SOURCES.QUICK_COMMERCE;
    if (
        lower.includes('food')
        || lower.includes('order_payment')
        || lower.includes('order_refund')
        || lower === 'order'
    ) {
        return WALLET_SOURCES.FOOD;
    }
    if (lower.includes('referral')) return WALLET_SOURCES.REFERRAL;
    if (lower.includes('cashback')) return WALLET_SOURCES.CASHBACK;
    if (lower.includes('promo')) return WALLET_SOURCES.PROMOTION;
    if (lower.includes('topup') || lower.includes('top_up') || lower.includes('wallet_topup')) {
        return WALLET_SOURCES.TOPUP;
    }
    return WALLET_SOURCES.SYSTEM;
}

export const WALLET_REASONS = Object.freeze({
    ADD_MONEY: 'ADD_MONEY',
    BOOKING_PAYMENT: 'BOOKING_PAYMENT',
    ORDER_PAYMENT: 'ORDER_PAYMENT',
    REFUND: 'REFUND',
    CANCELLATION_REFUND: 'CANCELLATION_REFUND',
    SECURITY_DEPOSIT_REFUND: 'SECURITY_DEPOSIT_REFUND',
    EXTRA_CHARGE_DEDUCTION: 'EXTRA_CHARGE_DEDUCTION',
    REFERRAL_REWARD: 'REFERRAL_REWARD',
    /** Escrow: money reserved for a staged commitment, paid out, or given back. */
    ESCROW_HOLD: 'ESCROW_HOLD',
    ESCROW_RELEASE: 'ESCROW_RELEASE',
    ESCROW_REFUND: 'ESCROW_REFUND',
    SYSTEM: 'SYSTEM',
});

export function normalizeWalletReason(raw, fallback = WALLET_REASONS.SYSTEM) {
    const key = String(raw || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (WALLET_REASONS[key]) return WALLET_REASONS[key];
    const lower = String(raw || '').trim().toLowerCase();
    if (lower.includes('top') || lower.includes('add money')) return WALLET_REASONS.ADD_MONEY;
    if (lower.includes('deposit') && lower.includes('refund')) return WALLET_REASONS.SECURITY_DEPOSIT_REFUND;
    if (lower.includes('cancel')) return WALLET_REASONS.CANCELLATION_REFUND;
    if (lower.includes('late') || lower.includes('extra')) return WALLET_REASONS.EXTRA_CHARGE_DEDUCTION;
    if (lower.includes('refund')) return WALLET_REASONS.REFUND;
    if (lower.includes('booking') || lower.includes('rental')) return WALLET_REASONS.BOOKING_PAYMENT;
    if (lower.includes('order')) return WALLET_REASONS.ORDER_PAYMENT;
    if (lower.includes('referral')) return WALLET_REASONS.REFERRAL_REWARD;
    return fallback;
}

export function sourceLabel(source) {
    const map = {
        [WALLET_SOURCES.FOOD]: 'Food',
        [WALLET_SOURCES.TAXI]: 'Taxi',
        [WALLET_SOURCES.PORTER]: 'Porter',
        [WALLET_SOURCES.BIKE_RENTAL]: 'Bike Rental',
        [WALLET_SOURCES.QUICK_COMMERCE]: 'Quick Commerce',
        [WALLET_SOURCES.PROMOTION]: 'Promotion',
        [WALLET_SOURCES.CASHBACK]: 'Cashback',
        [WALLET_SOURCES.REFERRAL]: 'Referral',
        [WALLET_SOURCES.TOPUP]: 'Wallet Top-up',
        [WALLET_SOURCES.SYSTEM]: 'System',
    };
    return map[normalizeWalletSource(source)] || 'System';
}
