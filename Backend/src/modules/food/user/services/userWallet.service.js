import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import { FoodUserWallet } from '../models/userWallet.model.js';
import { createRazorpayOrder, getRazorpayKeyId, isRazorpayConfigured, verifyPaymentSignature } from '../../orders/helpers/razorpay.helper.js';
import {
    normalizeWalletSource,
    normalizeWalletReason,
    WALLET_SOURCES,
    WALLET_REASONS,
} from '../../../../core/wallet/sources.js';

const syncUserWalletBalance = async (userId, balance) => {
    const numericBalance = Math.max(0, Number(balance) || 0);
    await FoodUser.updateOne(
        { _id: userId },
        { $set: { walletBalance: numericBalance } }
    );
};

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const buildTxnMeta = (defaults = {}, metadata = {}) => {
    const merged = { ...defaults, ...(metadata || {}) };
    const canonicalSource = normalizeWalletSource(
        merged.source || merged.module || merged.service || defaults.source,
    );
    merged.source = canonicalSource;
    merged.module = canonicalSource;
    if (!merged.reasonCode) {
        merged.reasonCode = normalizeWalletReason(merged.reason || merged.kind || defaults.reasonCode);
    }
    return merged;
};

const ensureWallet = async (userId) => {
    const id = String(userId || '');
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('User not found');
    }
    const oid = new mongoose.Types.ObjectId(id);
    const existing = await FoodUserWallet.findOne({ userId: oid });
    if (existing) return existing;
    const created = await FoodUserWallet.create({ userId: oid, balance: 0, transactions: [] });
    await syncUserWalletBalance(oid, created.balance);
    return created;
};

export const creditReferralReward = async (userId, amountInr, metadata = {}) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { wallet: await getUserWallet(userId) };
    }
    const wallet = await ensureWallet(userId);
    wallet.transactions.unshift({
        type: 'addition',
        amount,
        status: 'Completed',
        description: 'Referral reward',
        metadata: { source: 'referral_reward', ...(metadata || {}) }
    });
    wallet.balance = Number(wallet.balance || 0) + amount;
    wallet.referralEarnings = Number(wallet.referralEarnings || 0) + amount;
    await wallet.save();
    await syncUserWalletBalance(userId, wallet.balance);
    return { wallet: await getUserWallet(userId) };
};

export const getUserWallet = async (userId, { source = null } = {}) => {
    const id = String(userId || '');
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('User not found');
    }
    const oid = new mongoose.Types.ObjectId(id);
    const wallet = await FoodUserWallet.findOne({ userId: oid });
    if (!wallet) {
        return { balance: 0, referralEarnings: 0, transactions: [] };
    }
    // Return newest first (UI expects recent transactions on top)
    let tx = Array.isArray(wallet.transactions)
        ? [...wallet.transactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        : [];

    if (source) {
        const want = normalizeWalletSource(source);
        tx = tx.filter((t) => {
            const meta = t.metadata || {};
            const fromMeta = normalizeWalletSource(meta.source || meta.module || meta.service);
            if (fromMeta === want) return true;
            // Legacy bike-rent rows may only be identifiable via description / order prefixes.
            if (want === WALLET_SOURCES.BIKE_RENTAL) {
                const hay = [
                    t.description,
                    t.reason,
                    meta.orderId,
                    meta.kind,
                    meta.referenceId,
                ]
                    .map((part) => String(part || '').toLowerCase())
                    .join(' ');
                return /bike.?rent|deposit-refund:|cancel-deposit:|cancel-rental:|no-show-refund:/.test(hay);
            }
            return false;
        });
    }

    return {
        balance: Number(wallet.balance) || 0,
        referralEarnings: Number(wallet.referralEarnings) || 0,
        transactions: tx.map((t) => ({
            id: String(t._id),
            _id: t._id,
            type: t.type,
            amount: Number(t.amount) || 0,
            status: t.status || 'Completed',
            description: t.description || '',
            reason: t.reason || t.metadata?.reasonCode || '',
            openingBalance: t.openingBalance ?? null,
            closingBalance: t.closingBalance ?? null,
            date: t.createdAt,
            createdAt: t.createdAt,
            metadata: t.metadata || {}
        }))
    };
};

export const createWalletTopupOrder = async (userId, amountInr) => {
    if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
        throw new ValidationError('User not found');
    }
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new ValidationError('Amount must be greater than 0');
    }
    if (amount > 50000) {
        throw new ValidationError('Maximum amount is 50,000');
    }

    const amountPaise = Math.round(amount * 100);

    if (!isRazorpayConfigured()) {
        // Dev fallback: return a compatible shape without writing to DB.
        const orderId = `order_dev_${Date.now()}`;
        return {
            razorpay: {
                key: getRazorpayKeyId() || 'rzp_test_dummy',
                orderId,
                amount: amountPaise,
                currency: 'INR'
            }
        };
    }

    const receipt = `wallet_topup_${String(userId).slice(-8)}_${Date.now()}`;
    
    try {
        const order = await createRazorpayOrder(amountPaise, 'INR', receipt);

        return {
            razorpay: {
                key: getRazorpayKeyId(),
                orderId: String(order.id),
                amount: Number(order.amount) || amountPaise,
                currency: order.currency || 'INR'
            }
        };
    } catch (error) {
        console.error('Razorpay Wallet Topup Error:', error);
        throw new Error(error.description || error.message || 'Failed to create payment order');
    }
};

export const verifyWalletTopupPayment = async (userId, payload) => {
    const orderId = String(payload?.razorpayOrderId || '').trim();
    const paymentId = String(payload?.razorpayPaymentId || '').trim();
    const signature = String(payload?.razorpaySignature || '').trim();
    const amount = Number(payload?.amount);
    const initiatedFrom = normalizeWalletSource(
        payload?.sourceModule || payload?.source || payload?.module || WALLET_SOURCES.TOPUP,
    );

    if (!orderId) throw new ValidationError('razorpayOrderId is required');
    if (!paymentId) throw new ValidationError('razorpayPaymentId is required');
    if (!signature) throw new ValidationError('razorpaySignature is required');
    if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('amount is required');

    const wallet = await ensureWallet(userId);
    const existing = wallet.transactions.find((t) => String(t.razorpayOrderId || '') === orderId);
    if (existing && String(existing.status).toLowerCase() === 'completed') {
        return { wallet: await getUserWallet(userId) };
    }

    // If razorpay not configured (dev), accept and credit wallet.
    const ok = isRazorpayConfigured()
        ? verifyPaymentSignature(orderId, paymentId, signature)
        : true;
    if (!ok) {
        throw new ValidationError('Payment verification failed');
    }

    const openingBalance = roundMoney(wallet.balance);
    const closingBalance = roundMoney(openingBalance + amount);
    // Tag with initiating module when provided (e.g. BIKE_RENTAL), else TOPUP.
    const ledgerSource = initiatedFrom === WALLET_SOURCES.TOPUP
        ? WALLET_SOURCES.TOPUP
        : initiatedFrom;

    wallet.transactions.unshift({
        type: 'addition',
        amount,
        status: 'Completed',
        description: isRazorpayConfigured() ? 'Wallet top-up' : 'Wallet top-up (dev)',
        reason: WALLET_REASONS.ADD_MONEY,
        openingBalance,
        closingBalance,
        metadata: buildTxnMeta(
            {
                source: ledgerSource,
                reasonCode: WALLET_REASONS.ADD_MONEY,
                initiatedFrom: ledgerSource,
                mode: isRazorpayConfigured() ? 'razorpay' : 'dev',
            },
            {},
        ),
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature
    });

    wallet.balance = closingBalance;
    await wallet.save();
    await syncUserWalletBalance(userId, wallet.balance);

    return { wallet: await getUserWallet(userId) };
};

export const deductWalletBalance = async (userId, amountInr, description = 'Order payment', metadata = {}) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new ValidationError('Invalid deduction amount');
    }

    const id = String(userId || '');
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('User not found');
    }
    const oid = new mongoose.Types.ObjectId(id);
    await ensureWallet(userId);

    const snap = await FoodUserWallet.findOne({ userId: oid }).select('balance').lean();
    const openingBalance = roundMoney(snap?.balance);
    const closingBalance = roundMoney(openingBalance - amount);

    const orderId = String(metadata?.orderId || '').trim();
    const meta = buildTxnMeta(
        {
            source: WALLET_SOURCES.FOOD,
            reasonCode: WALLET_REASONS.ORDER_PAYMENT,
        },
        metadata,
    );
    const txn = {
        type: 'deduction',
        amount,
        status: 'Completed',
        description,
        reason: meta.reasonCode || WALLET_REASONS.ORDER_PAYMENT,
        openingBalance,
        closingBalance,
        metadata: meta,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    // Spendable balance is `balance - lockedAmount`, never `balance` alone —
    // escrow holds (wallet_holds) reserve money for a specific commitment and it
    // must not be spendable in any other module. Because this compares two fields
    // of the same document it has to be an `$expr`, and `$ifNull` is mandatory:
    // wallets written before `lockedAmount` existed have no such key, `$subtract`
    // against a missing field yields null, and every debit platform-wide would
    // silently start failing. The check stays inside findOneAndUpdate so it
    // remains atomic against concurrent debits.
    const debitFilter = {
        userId: oid,
        $expr: {
            $gte: [
                { $subtract: ['$balance', { $ifNull: ['$lockedAmount', 0] }] },
                amount,
            ],
        },
    };
    // Prevent concurrent double-debit for the same orderId.
    if (orderId) {
        debitFilter.transactions = {
            $not: {
                $elemMatch: {
                    type: 'deduction',
                    'metadata.orderId': orderId,
                },
            },
        };
    }

    const updated = await FoodUserWallet.findOneAndUpdate(
        debitFilter,
        {
            $inc: { balance: -amount },
            $push: { transactions: { $each: [txn], $position: 0 } },
        },
        { new: true }
    );

    if (updated) {
        await syncUserWalletBalance(userId, updated.balance);
        return { wallet: await getUserWallet(userId), alreadyProcessed: false };
    }

    if (orderId) {
        const alreadyDeducted = await FoodUserWallet.findOne({
            userId: oid,
            transactions: {
                $elemMatch: {
                    type: 'deduction',
                    'metadata.orderId': orderId,
                },
            },
        })
            .select('_id')
            .lean();
        if (alreadyDeducted) {
            return { wallet: await getUserWallet(userId), alreadyProcessed: true };
        }
    }

    // The debit failed the balance guard. Distinguish "you don't have it" from
    // "you have it but it's committed elsewhere" — otherwise a customer funding a
    // construction project is told they have no money, which is both wrong and
    // alarming.
    const current = await FoodUserWallet.findOne({ userId: oid })
        .select('balance lockedAmount')
        .lean();
    const balance = roundMoney(current?.balance);
    const locked = roundMoney(current?.lockedAmount);
    if (locked > 0 && balance >= amount) {
        throw new ValidationError(
            `Insufficient available balance. ₹${locked.toFixed(2)} of your ₹${balance.toFixed(2)} `
            + 'is reserved for an ongoing commitment and cannot be spent until it is released.',
        );
    }

    throw new ValidationError('Insufficient wallet balance');
};

export const refundWalletBalance = async (userId, amountInr, description = 'Order refund', metadata = {}) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { wallet: await getUserWallet(userId) };
    }

    const wallet = await ensureWallet(userId);
    const returnId = String(metadata?.returnId || '').trim();
    const refundTransactionId = String(metadata?.refundTransactionId || '').trim();
    const existingRefund = (Array.isArray(wallet.transactions) ? wallet.transactions : []).find((txn) => {
        if (txn?.type !== 'refund') return false;
        const txnReturnId = String(txn?.metadata?.returnId || '').trim();
        const txnRefundId = String(txn?.metadata?.refundTransactionId || '').trim();
        if (returnId && txnReturnId === returnId) return true;
        if (refundTransactionId && txnRefundId === refundTransactionId) return true;
        return false;
    });
    if (existingRefund) {
        return { wallet: await getUserWallet(userId), alreadyProcessed: true };
    }

    const openingBalance = roundMoney(wallet.balance);
    const closingBalance = roundMoney(openingBalance + amount);
    const meta = buildTxnMeta(
        {
            source: WALLET_SOURCES.FOOD,
            reasonCode: WALLET_REASONS.REFUND,
        },
        metadata,
    );

    wallet.transactions.unshift({
        type: 'refund',
        amount,
        status: 'Completed',
        description,
        reason: meta.reasonCode || WALLET_REASONS.REFUND,
        openingBalance,
        closingBalance,
        metadata: meta,
    });

    wallet.balance = closingBalance;
    await wallet.save();
    await syncUserWalletBalance(userId, wallet.balance);

    return { wallet: await getUserWallet(userId) };
};

