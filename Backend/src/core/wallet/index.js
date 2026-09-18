export {
    createWallet,
    addWalletCredit,
    deductWalletAmount,
    getWalletBalance,
    getWalletTransactions,
    listWalletTransactionsAdmin,
} from './centralWallet.service.js';

/** Alias matching product API naming. */
export { addWalletCredit as addWalletBalance } from './centralWallet.service.js';

export {
    WALLET_SOURCES,
    WALLET_TXN_TYPES,
    WALLET_TXN_STATUS,
    WALLET_REASONS,
    normalizeWalletSource,
    normalizeWalletReason,
    sourceLabel,
} from './sources.js';

/**
 * Escrow holds — reserve a customer's money against a staged commitment, then
 * release it piece by piece as work is approved. See `hold.service.js`.
 *
 * This is the ONLY supported way to reserve customer funds. Do not reintroduce
 * a per-module lock: the shared debit path honours `lockedAmount` and nothing
 * else.
 */
export {
    getAvailableBalance,
    createHold,
    releaseHold,
    refundHold,
    cancelHold,
    getHoldForRef,
    getHoldById,
    listHoldLedger,
    listActiveHoldsForUser,
    reconcileHold,
    reconcileUserLock,
} from './hold.service.js';
