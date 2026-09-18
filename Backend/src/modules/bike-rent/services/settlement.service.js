import mongoose from 'mongoose';
import { Settlement } from '../models/settlement.model.js';
import { SettlementAdjustment } from '../models/settlementAdjustment.model.js';
import { BikeBooking } from '../models/bikeBooking.model.js';
import { BikeAuditLog } from '../models/bikeAuditLog.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import { resolveActionPerformerSnapshot } from '../../../core/utils/performer.js';
import { recordTransaction } from './financeTransaction.service.js';
import { parseListQuery, toBikeRentPagination, buildDateRangeFilter } from '../utils/pagination.util.js';

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function mapAdjustment(doc = {}) {
    return {
        id: String(doc._id),
        settlementId: String(doc.settlementId),
        bookingId: String(doc.bookingId),
        amount: Number(doc.amount || 0),
        type: doc.type || '',
        reason: doc.reason || '',
        performedBy: doc.performedBy || null,
        createdAt: doc.createdAt,
    };
}

/** Attaches the adjustment trail + effective (post-adjustment) payable to a mapped settlement. */
async function attachAdjustments(mapped) {
    const rows = await SettlementAdjustment.find({ settlementId: mapped.id })
        .sort({ createdAt: 1 })
        .lean();
    const adjustments = rows.map(mapAdjustment);
    const adjustmentTotal = roundMoney(adjustments.reduce((sum, a) => sum + a.amount, 0));
    return {
        ...mapped,
        adjustments,
        adjustmentTotal,
        effectiveVendorSettlementAmount: roundMoney(mapped.vendorSettlementAmount + adjustmentTotal),
    };
}

/**
 * Records an immutable delta against an already-generated settlement — never edits the
 * original `Settlement` row. Used when a booking's money changes after it's been settled
 * (late balance collected post-completion, a refund issued after settlement, an admin
 * correction during a dispute review). Audit-logged; reason is required.
 */
export async function recordSettlementAdjustment(settlementId, { amount, reason, type } = {}, reqUser = null) {
    if (!mongoose.Types.ObjectId.isValid(String(settlementId))) {
        throw new ValidationError('Invalid settlement id');
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount === 0) {
        throw new ValidationError('Adjustment amount must be a non-zero number');
    }
    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) {
        throw new ValidationError('A reason is required to adjust a settlement');
    }
    if (!['late_charge', 'refund', 'admin_correction'].includes(type)) {
        throw new ValidationError('Invalid adjustment type');
    }

    const settlement = await Settlement.findById(settlementId).lean();
    if (!settlement) throw new NotFoundError('Settlement not found');

    const performer = await resolveActionPerformerSnapshot(reqUser);
    const doc = await SettlementAdjustment.create({
        settlementId: settlement._id,
        bookingId: settlement.bookingId,
        vendorId: settlement.vendorId,
        amount: roundMoney(numericAmount),
        type,
        reason: trimmedReason,
        performedBy: performer,
    });

    try {
        await BikeAuditLog.create({
            entityType: 'settlement',
            entityId: settlement._id,
            action: 'settlement.adjusted',
            before: null,
            after: mapAdjustment(doc.toObject()),
            performedBy: performer,
            meta: { bookingId: String(settlement.bookingId), type, amount: numericAmount },
        });
    } catch {
        /* non-blocking */
    }

    await recordTransaction({
        bookingId: settlement.bookingId,
        vendorId: settlement.vendorId,
        amount: numericAmount,
        paymentMode: 'system',
        transactionType: type === 'admin_correction' ? 'admin_adjustment' : 'vendor_settlement',
        referenceId: `settlement-adjustment:${doc._id}`,
        performedBy: performer,
        meta: { settlementId: String(settlement._id), adjustmentType: type, reason: trimmedReason },
    });

    return mapAdjustment(doc.toObject());
}

/** Read-only lookup used by booking-detail enrichment (admin + vendor). */
export async function getSettlementByBookingId(bookingId) {
    if (!mongoose.Types.ObjectId.isValid(String(bookingId))) return null;
    const doc = await Settlement.findOne({ bookingId }).lean();
    if (!doc) return null;
    return attachAdjustments(mapSettlement(doc));
}

function mapSettlement(doc = {}) {
    return {
        id: String(doc._id),
        bookingId: String(doc.bookingId),
        vendorId: String(doc.vendorId),
        grossAmount: Number(doc.grossAmount || 0),
        taxAmount: Number(doc.taxAmount || 0),
        platformFeeAmount: Number(doc.platformFeeAmount || 0),
        platformFeePayer: doc.platformFeePayer || '',
        commissionRate: Number(doc.commissionRate || 0),
        commissionAmount: Number(doc.commissionAmount || 0),
        vendorSettlementAmount: Number(doc.vendorSettlementAmount || 0),
        status: doc.status || 'settled',
        settledAt: doc.settledAt,
        createdAt: doc.createdAt,
    };
}

/**
 * Persists the auditable settlement ledger record for a completed vendor booking — called
 * right after vendorWallet.service.js#creditVendorEarningForBooking, which has already
 * computed and written commissionRate/commissionAmount/vendorEarning onto booking.money.
 * This does not recompute commission math (single source of truth stays in vendorWallet
 * .service.js) — it only reads the already-settled figures and records the full waterfall,
 * additionally accounting for the platform fee when it's deducted from the vendor's share.
 * Idempotent — safe to call more than once for the same booking.
 */
export async function generateSettlement(bookingDoc) {
    if (!bookingDoc || bookingDoc.ownerType !== 'vendor' || !bookingDoc.vendorId) return null;

    const existing = await Settlement.findOne({ bookingId: bookingDoc._id }).lean();
    if (existing) return mapSettlement(existing);

    const money = bookingDoc.money || {};
    const grossAmount = roundMoney(money.totalPaid);
    if (grossAmount <= 0) return null;

    const platformFeeAmount = money.platformFeePayer === 'vendor' ? roundMoney(money.platformFee) : 0;
    const vendorSettlementAmount = roundMoney(Math.max(0, Number(money.vendorEarning || 0) - platformFeeAmount));

    const doc = await Settlement.create({
        bookingId: bookingDoc._id,
        vendorId: bookingDoc.vendorId,
        grossAmount,
        taxAmount: roundMoney(money.taxAmount),
        platformFeeAmount,
        platformFeePayer: money.platformFeePayer || '',
        commissionRate: Number(money.commissionRate || 0),
        commissionAmount: roundMoney(money.commissionAmount),
        vendorSettlementAmount,
        status: 'settled',
        settledAt: new Date(),
    });

    if (vendorSettlementAmount > 0) {
        await recordTransaction({
            bookingId: bookingDoc._id,
            userId: bookingDoc.userId,
            vendorId: bookingDoc.vendorId,
            amount: vendorSettlementAmount,
            paymentMode: 'system',
            transactionType: 'vendor_settlement',
            referenceId: `settlement:${doc._id}`,
            meta: { settlementId: String(doc._id) },
        });
    }

    return mapSettlement(doc.toObject());
}

export async function getSettlementById(id) {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid settlement id');
    }
    const doc = await Settlement.findById(id).lean();
    if (!doc) throw new NotFoundError('Settlement not found');
    return attachAdjustments(await enrichWithBooking(mapSettlement(doc), doc));
}

async function enrichWithBooking(mapped, doc) {
    const booking = await BikeBooking.findById(doc.bookingId)
        .select('bookingNumber status bikeSnapshot vendorId')
        .populate('vendorId', 'businessName ownerName vendorCode')
        .lean();
    return {
        ...mapped,
        bookingNumber: booking?.bookingNumber || '',
        bookingStatus: booking?.status || '',
        bikeName: booking?.bikeSnapshot?.name || '',
        vendor: booking?.vendorId && typeof booking.vendorId === 'object'
            ? {
                id: String(booking.vendorId._id),
                businessName: booking.vendorId.businessName || '',
                ownerName: booking.vendorId.ownerName || '',
                vendorCode: booking.vendorId.vendorCode || '',
            }
            : null,
    };
}

/** Admin: fleet-wide settlement list, optionally filtered by vendor. */
export async function listSettlements(query = {}) {
    const parsed = parseListQuery(query);
    const filter = {};
    if (query.vendorId && mongoose.Types.ObjectId.isValid(String(query.vendorId))) {
        filter.vendorId = query.vendorId;
    }
    const dateRange = buildDateRangeFilter(parsed.createdFrom, parsed.createdTo);
    if (dateRange) filter.settledAt = dateRange;

    const [docs, total] = await Promise.all([
        Settlement.find(filter)
            .populate('vendorId', 'businessName ownerName vendorCode')
            .sort({ settledAt: -1 })
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        Settlement.countDocuments(filter),
    ]);

    const bookingIds = docs.map((d) => d.bookingId);
    const bookings = await BikeBooking.find({ _id: { $in: bookingIds } })
        .select('bookingNumber status bikeSnapshot')
        .lean();
    const byId = Object.fromEntries(bookings.map((b) => [String(b._id), b]));

    return toBikeRentPagination({
        docs: docs.map((doc) => ({
            ...mapSettlement(doc),
            bookingNumber: byId[String(doc.bookingId)]?.bookingNumber || '',
            bikeName: byId[String(doc.bookingId)]?.bikeSnapshot?.name || '',
            vendor: doc.vendorId && typeof doc.vendorId === 'object'
                ? {
                    id: String(doc.vendorId._id),
                    businessName: doc.vendorId.businessName || '',
                    ownerName: doc.vendorId.ownerName || '',
                    vendorCode: doc.vendorId.vendorCode || '',
                }
                : null,
        })),
        total,
        page: parsed.page,
        limit: parsed.limit,
    });
}

/** Vendor: own settlement history only. */
export async function listVendorSettlements(vendorId, query = {}) {
    const parsed = parseListQuery(query);
    const filter = { vendorId };
    const dateRange = buildDateRangeFilter(parsed.createdFrom, parsed.createdTo);
    if (dateRange) filter.settledAt = dateRange;

    const [docs, total] = await Promise.all([
        Settlement.find(filter)
            .sort({ settledAt: -1 })
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        Settlement.countDocuments(filter),
    ]);

    const bookingIds = docs.map((d) => d.bookingId);
    const bookings = await BikeBooking.find({ _id: { $in: bookingIds } })
        .select('bookingNumber status bikeSnapshot')
        .lean();
    const byId = Object.fromEntries(bookings.map((b) => [String(b._id), b]));

    return toBikeRentPagination({
        docs: docs.map((doc) => ({
            ...mapSettlement(doc),
            bookingNumber: byId[String(doc.bookingId)]?.bookingNumber || '',
            bikeName: byId[String(doc.bookingId)]?.bikeSnapshot?.name || '',
        })),
        total,
        page: parsed.page,
        limit: parsed.limit,
    });
}

/** Vendor: single settlement, ownership-checked. */
export async function getVendorSettlementById(id, vendorId) {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid settlement id');
    }
    const doc = await Settlement.findOne({ _id: id, vendorId }).lean();
    if (!doc) throw new NotFoundError('Settlement not found');
    return attachAdjustments(await enrichWithBooking(mapSettlement(doc), doc));
}
