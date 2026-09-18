import mongoose from 'mongoose';
import { FinanceTransaction } from '../models/financeTransaction.model.js';
import { BikeAuditLog } from '../models/bikeAuditLog.model.js';
import { ValidationError } from '../../../core/auth/errors.js';
import { resolveActionPerformerSnapshot } from '../../../core/utils/performer.js';
import { parseListQuery, toBikeRentPagination, buildDateRangeFilter } from '../utils/pagination.util.js';

function genTransactionId() {
    return `TXN-${new mongoose.Types.ObjectId().toHexString().toUpperCase()}`;
}

function mapTransaction(doc = {}) {
    return {
        id: String(doc._id),
        transactionId: doc.transactionId,
        bookingId: doc.bookingId ? String(doc.bookingId) : null,
        userId: doc.userId ? String(doc.userId) : null,
        vendorId: doc.vendorId ? String(doc.vendorId) : null,
        amount: Number(doc.amount || 0),
        paymentMode: doc.paymentMode || '',
        transactionType: doc.transactionType || '',
        status: doc.status || 'success',
        referenceId: doc.referenceId || '',
        performedBy: doc.performedBy || null,
        meta: doc.meta || null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}

/**
 * Records one row in the unified finance ledger. Non-blocking by contract — callers wrap this
 * in try/catch (or it self-swallows here) so a ledger-write hiccup never fails the actual money
 * movement that already happened. Idempotent on `(transactionType, referenceId)` when a
 * referenceId is given — a duplicate-key error here just means the row already exists, so it's
 * treated as a non-error.
 */
export async function recordTransaction({
    bookingId = null,
    userId = null,
    vendorId = null,
    amount,
    paymentMode,
    transactionType,
    status = 'success',
    referenceId = '',
    performedBy = null,
    meta = null,
} = {}) {
    try {
        if (!Number.isFinite(Number(amount)) || !paymentMode || !transactionType) return null;
        const doc = await FinanceTransaction.create({
            transactionId: genTransactionId(),
            bookingId,
            userId,
            vendorId,
            amount: Math.round(Number(amount) * 100) / 100,
            paymentMode,
            transactionType,
            status,
            referenceId: referenceId || '',
            performedBy,
            meta,
        });
        return mapTransaction(doc.toObject());
    } catch (err) {
        if (err?.code === 11000) return null; // already recorded for this reference — fine
        return null; // ledger write must never break the caller's actual money-moving operation
    }
}

/** Admin-only manual correction — the explicit "admin adjustment" entry point. Reason required. */
export async function recordAdminAdjustment({
    bookingId = null,
    userId = null,
    vendorId = null,
    amount,
    reason,
    reqUser = null,
} = {}) {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount === 0) {
        throw new ValidationError('Adjustment amount must be a non-zero number');
    }
    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) {
        throw new ValidationError('A reason is required for a manual finance adjustment');
    }
    const performer = await resolveActionPerformerSnapshot(reqUser);
    const doc = await FinanceTransaction.create({
        transactionId: genTransactionId(),
        bookingId,
        userId,
        vendorId,
        amount: Math.round(numericAmount * 100) / 100,
        paymentMode: 'system',
        transactionType: 'admin_adjustment',
        status: 'success',
        referenceId: '',
        performedBy: performer,
        meta: { reason: trimmedReason },
    });

    try {
        await BikeAuditLog.create({
            entityType: 'finance_transaction',
            entityId: doc._id,
            action: 'finance_transaction.admin_adjustment',
            before: null,
            after: mapTransaction(doc.toObject()),
            performedBy: performer,
            meta: { bookingId: bookingId ? String(bookingId) : null, vendorId: vendorId ? String(vendorId) : null, reason: trimmedReason },
        });
    } catch {
        /* non-blocking */
    }

    return mapTransaction(doc.toObject());
}

/** Full transaction trail for one booking, oldest first — the "audit every amount" view. */
export async function listBookingTransactions(bookingId) {
    if (!mongoose.Types.ObjectId.isValid(String(bookingId))) return [];
    const docs = await FinanceTransaction.find({ bookingId }).sort({ createdAt: 1 }).lean();
    return docs.map(mapTransaction);
}

/** Admin: fleet-wide transaction ledger with filters. */
export async function listTransactions(query = {}) {
    const parsed = parseListQuery(query);
    const filter = {};
    if (query.vendorId && mongoose.Types.ObjectId.isValid(String(query.vendorId))) {
        filter.vendorId = query.vendorId;
    }
    if (query.userId && mongoose.Types.ObjectId.isValid(String(query.userId))) {
        filter.userId = query.userId;
    }
    if (query.bookingId && mongoose.Types.ObjectId.isValid(String(query.bookingId))) {
        filter.bookingId = query.bookingId;
    }
    if (query.transactionType && query.transactionType !== 'all') {
        filter.transactionType = query.transactionType;
    }
    if (query.paymentMode && query.paymentMode !== 'all') {
        filter.paymentMode = query.paymentMode;
    }
    if (query.status && query.status !== 'all') {
        filter.status = query.status;
    }
    const dateRange = buildDateRangeFilter(parsed.createdFrom, parsed.createdTo);
    if (dateRange) filter.createdAt = dateRange;

    const [docs, total] = await Promise.all([
        FinanceTransaction.find(filter)
            .sort({ createdAt: -1 })
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        FinanceTransaction.countDocuments(filter),
    ]);

    return toBikeRentPagination({
        docs: docs.map(mapTransaction),
        total,
        page: parsed.page,
        limit: parsed.limit,
    });
}

/** Vendor: own transaction history only. */
export async function listVendorTransactions(vendorId, query = {}) {
    return listTransactions({ ...query, vendorId });
}
