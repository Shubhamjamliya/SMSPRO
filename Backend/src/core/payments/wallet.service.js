import mongoose from 'mongoose';
import { recordTransaction, getBalance, getTransactionsByEntity } from './transaction.service.js';
import { FoodUserWallet } from '../../modules/food/user/models/userWallet.model.js';

/**
 * Universal wallet service — facade over transaction.service for
 * common wallet operations (credit, debit, lock, unlock, get balance).
 *
 * Each entity type has its own Mongoose model, but this service
 * provides a unified interface.
 */

/**
 * Credit an entity's wallet.
 */
export async function creditWallet({
    entityType, entityId, amount, description,
    category = 'other', orderId, paymentId, metadata, module = 'food',
    countAsEarning = true,
}) {
    return recordTransaction({
        entityType,
        entityId: String(entityId),
        type: 'credit',
        amount: Number(amount),
        description,
        category,
        orderId: orderId ? String(orderId) : null,
        paymentId: paymentId ? String(paymentId) : null,
        metadata,
        module,
        countAsEarning,
    });
}

/**
 * Debit an entity's wallet.
 */
export async function debitWallet({
    entityType, entityId, amount, description,
    category = 'other', orderId, paymentId, metadata, module = 'food',
}) {
    return recordTransaction({
        entityType,
        entityId: String(entityId),
        type: 'debit',
        amount: Number(amount),
        description,
        category,
        orderId: orderId ? String(orderId) : null,
        paymentId: paymentId ? String(paymentId) : null,
        metadata,
        module,
    });
}

/**
 * Get wallet info for any entity.
 */
export async function getWalletBalance(entityType, entityId) {
    return getBalance(entityType, entityId);
}

/**
 * Get wallet + recent transactions for any entity.
 */
export async function getWalletWithTransactions(entityType, entityId, { page = 1, limit = 20 } = {}) {
    const [balance, txns] = await Promise.all([
        getBalance(entityType, entityId),
        getTransactionsByEntity(entityType, entityId, { page, limit })
    ]);

    return {
        ...balance,
        ...txns
    };
}

/*
 * `lockWalletAmount` / `unlockWalletAmount` used to live here. They were removed
 * because they never worked and were never called: `FoodUserWallet` had no
 * `lockedAmount` field, so Mongoose strict mode silently discarded the write and
 * the "lock" was a no-op. Two mechanisms for reserving money — one real, one
 * imaginary — is exactly how money leaks.
 *
 * Reserving a CUSTOMER's money now goes through `core/wallet/hold.service.js`
 * (createHold / releaseHold / refundHold), which is transactional, append-only
 * and idempotent, and which the shared debit path actually honours.
 *
 * Reserving a PAYEE's money against a pending settlement was never implemented
 * (the `lockedAmount` field on the restaurant / delivery / contractor wallets is
 * unused). If that becomes a requirement, model it on the hold service rather
 * than reviving a read-modify-write helper.
 */

/**
 * USER WALLET: Get wallet with transactions in the format the existing frontend expects.
 * This maintains backward compatibility with the existing FoodUserWallet embedded transactions.
 */
export async function getUserWalletForFrontend(userId) {
    const id = String(userId || '');
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return { balance: 0, referralEarnings: 0, transactions: [] };
    }

    // Read from the existing FoodUserWallet for backward compat
    const oid = new mongoose.Types.ObjectId(id);
    const wallet = await FoodUserWallet.findOne({ userId: oid });

    // Also read from new Transaction collection
    const newTxns = await getTransactionsByEntity('user', id, { page: 1, limit: 50 });

    // Merge: prefer new Transaction data, fallback to embedded
    const embeddedTx = wallet?.transactions
        ? [...wallet.transactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        : [];

    // Convert new transactions to frontend format
    const convertedNewTxns = (newTxns.transactions || []).map(t => ({
        id: String(t._id),
        _id: t._id,
        type: t.type === 'credit' ? 'addition' : 'deduction',
        amount: Number(t.amount) || 0,
        status: t.status === 'completed' ? 'Completed' : t.status,
        description: t.description || '',
        date: t.createdAt,
        createdAt: t.createdAt,
        metadata: t.metadata || {},
        category: t.category,
        balanceAfter: t.balanceAfter
    }));

    // Convert embedded txns
    const convertedEmbedded = embeddedTx.map(t => ({
        id: String(t._id),
        _id: t._id,
        type: t.type,
        amount: Number(t.amount) || 0,
        status: t.status || 'Completed',
        description: t.description || '',
        date: t.createdAt,
        createdAt: t.createdAt,
        metadata: t.metadata || {}
    }));

    // Deduplicate by checking if an embedded txn has a matching new txn (same amount + order within 5s)
    const allTxns = [...convertedNewTxns, ...convertedEmbedded];
    // Sort newest first
    allTxns.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return {
        balance: Number(wallet?.balance) || 0,
        referralEarnings: Number(wallet?.referralEarnings) || 0,
        transactions: allTxns
    };
}
