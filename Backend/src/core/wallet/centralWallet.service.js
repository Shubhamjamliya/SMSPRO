/**
 * Centralized user wallet facade — service-independent.
 *
 * Backing store: FoodUserWallet (single shared customer wallet).
 * Modules must call this API (or existing deduct/refund helpers) and never
 * invent per-module wallet collections for end users.
 */
import mongoose from 'mongoose';
import { ValidationError } from '../auth/errors.js';
import { FoodUser } from '../users/user.model.js';
import { FoodUserWallet } from '../../modules/food/user/models/userWallet.model.js';
import {
    deductWalletBalance,
    refundWalletBalance,
    getUserWallet,
} from '../../modules/food/user/services/userWallet.service.js';
import {
    WALLET_SOURCES,
    WALLET_TXN_TYPES,
    WALLET_TXN_STATUS,
    normalizeWalletSource,
    sourceLabel,
} from './sources.js';

function assertUserId(userId) {
    const id = String(userId || '').trim();
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('User not found');
    }
    return new mongoose.Types.ObjectId(id);
}

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

async function syncUserWalletBalance(userId, balance) {
    await FoodUser.updateOne(
        { _id: userId },
        { $set: { walletBalance: Math.max(0, Number(balance) || 0) } },
    );
}

/**
 * Ensure a wallet document exists for the user (idempotent).
 */
export async function createWallet(userId) {
    const oid = assertUserId(userId);
    const existing = await FoodUserWallet.findOne({ userId: oid });
    if (existing) {
        return {
            userId: String(oid),
            walletId: String(existing._id),
            balance: roundMoney(existing.balance),
            currency: 'INR',
            createdAt: existing.createdAt,
            updatedAt: existing.updatedAt,
            alreadyExisted: true,
        };
    }
    const created = await FoodUserWallet.create({
        userId: oid,
        balance: 0,
        transactions: [],
    });
    await syncUserWalletBalance(oid, 0);
    return {
        userId: String(oid),
        walletId: String(created._id),
        balance: 0,
        currency: 'INR',
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        alreadyExisted: false,
    };
}

export async function getWalletBalance(userId) {
    await createWallet(userId);
    const wallet = await getUserWallet(userId);
    const doc = await FoodUserWallet.findOne({ userId: assertUserId(userId) }).select('_id').lean();
    return {
        userId: String(userId),
        walletId: doc?._id ? String(doc._id) : null,
        balance: roundMoney(wallet.balance),
        currency: 'INR',
        referralEarnings: roundMoney(wallet.referralEarnings),
    };
}

/**
 * Credit the central wallet. Idempotent when `idempotencyKey` or `referenceId` is provided.
 */
export async function addWalletCredit({
    userId,
    amount,
    source = WALLET_SOURCES.SYSTEM,
    reason = 'Wallet credit',
    referenceId = '',
    idempotencyKey = '',
    metadata = {},
} = {}) {
    const creditAmount = roundMoney(amount);
    if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
        throw new ValidationError('Credit amount must be greater than 0');
    }
    const canonicalSource = normalizeWalletSource(source);
    const ref = String(referenceId || idempotencyKey || '').trim();
    const key = String(idempotencyKey || referenceId || '').trim();

    const result = await refundWalletBalance(
        userId,
        creditAmount,
        String(reason || 'Wallet credit').trim().slice(0, 500),
        {
            source: canonicalSource,
            module: canonicalSource,
            referenceId: ref,
            refundTransactionId: key || undefined,
            ...metadata,
        },
    );

    const balance = await getWalletBalance(userId);
    return {
        type: WALLET_TXN_TYPES.CREDIT,
        amount: creditAmount,
        source: canonicalSource,
        sourceLabel: sourceLabel(canonicalSource),
        reason,
        referenceId: ref,
        transactionStatus: WALLET_TXN_STATUS.COMPLETED,
        alreadyProcessed: Boolean(result?.alreadyProcessed),
        wallet: balance,
    };
}

/**
 * Debit the central wallet. Idempotent when `idempotencyKey` / orderId-like reference is set.
 */
export async function deductWalletAmount({
    userId,
    amount,
    source = WALLET_SOURCES.SYSTEM,
    reason = 'Wallet debit',
    referenceId = '',
    idempotencyKey = '',
    metadata = {},
} = {}) {
    const debitAmount = roundMoney(amount);
    if (!Number.isFinite(debitAmount) || debitAmount <= 0) {
        throw new ValidationError('Debit amount must be greater than 0');
    }
    const canonicalSource = normalizeWalletSource(source);
    const ref = String(referenceId || idempotencyKey || '').trim();
    const key = String(idempotencyKey || referenceId || '').trim();

    const result = await deductWalletBalance(
        userId,
        debitAmount,
        String(reason || 'Wallet debit').trim().slice(0, 500),
        {
            source: canonicalSource,
            module: canonicalSource,
            referenceId: ref,
            orderId: key || undefined,
            ...metadata,
        },
    );

    const balance = await getWalletBalance(userId);
    return {
        type: WALLET_TXN_TYPES.DEBIT,
        amount: debitAmount,
        source: canonicalSource,
        sourceLabel: sourceLabel(canonicalSource),
        reason,
        referenceId: ref,
        transactionStatus: WALLET_TXN_STATUS.COMPLETED,
        alreadyProcessed: Boolean(result?.alreadyProcessed),
        wallet: balance,
    };
}

function mapEmbeddedTxn(txn, walletId) {
    const meta = txn.metadata || {};
    const rawType = String(txn.type || '').toLowerCase();
    const isCredit = rawType === 'addition' || rawType === 'refund' || rawType === 'credit';
    const source = normalizeWalletSource(meta.source || meta.module || meta.service);
    return {
        id: String(txn._id || txn.id || ''),
        walletId: walletId ? String(walletId) : null,
        userId: null,
        type: isCredit ? WALLET_TXN_TYPES.CREDIT : WALLET_TXN_TYPES.DEBIT,
        amount: roundMoney(txn.amount),
        source,
        sourceLabel: sourceLabel(source),
        reason: txn.reason || meta.reasonCode || txn.description || meta.reason || '',
        openingBalance: txn.openingBalance ?? null,
        closingBalance: txn.closingBalance ?? null,
        referenceId: String(meta.referenceId || meta.bookingId || meta.orderId || meta.refundTransactionId || ''),
        transactionStatus: String(txn.status || WALLET_TXN_STATUS.COMPLETED).toLowerCase(),
        createdAt: txn.createdAt || txn.date || null,
        metadata: meta,
    };
}

/**
 * Paginated transaction history for a user (newest first).
 */
export async function getWalletTransactions(userId, {
    page = 1,
    limit = 20,
    source = null,
    type = null,
    from = null,
    to = null,
} = {}) {
    const oid = assertUserId(userId);
    await createWallet(userId);
    const wallet = await FoodUserWallet.findOne({ userId: oid }).lean();
    if (!wallet) {
        return {
            balance: 0,
            currency: 'INR',
            records: [],
            page: 1,
            pages: 1,
            total: 0,
            limit,
        };
    }

    let rows = (Array.isArray(wallet.transactions) ? wallet.transactions : [])
        .map((txn) => {
            const mapped = mapEmbeddedTxn(txn, wallet._id);
            mapped.userId = String(oid);
            return mapped;
        });

    if (source) {
        const want = normalizeWalletSource(source);
        rows = rows.filter((row) => {
            if (row.source === want) return true;
            if (want === WALLET_SOURCES.BIKE_RENTAL) {
                const hay = [
                    row.reason,
                    row.referenceId,
                    row.metadata?.orderId,
                    row.metadata?.kind,
                    row.metadata?.reasonCode,
                ]
                    .map((part) => String(part || '').toLowerCase())
                    .join(' ');
                return /bike.?rent|deposit-refund:|cancel-deposit:|cancel-rental:|no-show-refund:/.test(hay);
            }
            return false;
        });
    }
    if (type) {
        const wantType = String(type).toUpperCase();
        rows = rows.filter((row) => row.type === wantType);
    }
    if (from) {
        const fromMs = new Date(from).getTime();
        if (!Number.isNaN(fromMs)) {
            rows = rows.filter((row) => new Date(row.createdAt).getTime() >= fromMs);
        }
    }
    if (to) {
        const toMs = new Date(to).getTime();
        if (!Number.isNaN(toMs)) {
            rows = rows.filter((row) => new Date(row.createdAt).getTime() <= toMs);
        }
    }

    rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const total = rows.length;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const pages = Math.max(1, Math.ceil(total / limitNum));
    const start = (pageNum - 1) * limitNum;

    return {
        balance: roundMoney(wallet.balance),
        currency: 'INR',
        walletId: String(wallet._id),
        userId: String(oid),
        records: rows.slice(start, start + limitNum),
        page: pageNum,
        pages,
        total,
        limit: limitNum,
    };
}

/**
 * Admin: search wallet activity across users (recent slice per matching wallets).
 * For production scale this should move to a dedicated Transaction collection query.
 */
export async function listWalletTransactionsAdmin({
    source = null,
    type = null,
    from = null,
    to = null,
    userId = null,
    search = '',
    page = 1,
    limit = 20,
} = {}) {
    const filter = {};
    if (userId && mongoose.Types.ObjectId.isValid(String(userId))) {
        filter.userId = new mongoose.Types.ObjectId(String(userId));
    }

    const wallets = await FoodUserWallet.find(filter)
        .select('userId balance transactions')
        .limit(userId ? 1 : 500)
        .lean();

    let rows = [];
    for (const wallet of wallets) {
        const txns = Array.isArray(wallet.transactions) ? wallet.transactions : [];
        for (const txn of txns) {
            const mapped = mapEmbeddedTxn(txn, wallet._id);
            mapped.userId = String(wallet.userId);
            mapped.walletBalance = roundMoney(wallet.balance);
            rows.push(mapped);
        }
    }

    if (source) {
        const want = normalizeWalletSource(source);
        rows = rows.filter((row) => row.source === want);
    }
    if (type) {
        const wantType = String(type).toUpperCase();
        rows = rows.filter((row) => row.type === wantType);
    }
    if (from) {
        const fromMs = new Date(from).getTime();
        if (!Number.isNaN(fromMs)) {
            rows = rows.filter((row) => new Date(row.createdAt).getTime() >= fromMs);
        }
    }
    if (to) {
        const toMs = new Date(to).getTime();
        if (!Number.isNaN(toMs)) {
            rows = rows.filter((row) => new Date(row.createdAt).getTime() <= toMs);
        }
    }
    const q = String(search || '').trim().toLowerCase();
    if (q) {
        rows = rows.filter((row) => (
            String(row.reason || '').toLowerCase().includes(q)
            || String(row.referenceId || '').toLowerCase().includes(q)
            || String(row.userId || '').toLowerCase().includes(q)
        ));
    }

    rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const total = rows.length;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const pages = Math.max(1, Math.ceil(total / limitNum));
    const start = (pageNum - 1) * limitNum;

    return {
        records: rows.slice(start, start + limitNum),
        page: pageNum,
        pages,
        total,
        limit: limitNum,
    };
}

export default {
    createWallet,
    addWalletCredit,
    deductWalletAmount,
    getWalletBalance,
    getWalletTransactions,
    listWalletTransactionsAdmin,
    WALLET_SOURCES,
};
