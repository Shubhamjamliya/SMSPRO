import mongoose from 'mongoose';
import { MonthlySettlement } from '../models/monthlySettlement.model.js';
import { Settlement } from '../models/settlement.model.js';
import { SettlementAdjustment } from '../models/settlementAdjustment.model.js';
import { BikeAuditLog } from '../models/bikeAuditLog.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import { resolveActionPerformerSnapshot } from '../../../core/utils/performer.js';
import { recordTransaction } from './financeTransaction.service.js';
import { parseListQuery, toBikeRentPagination } from '../utils/pagination.util.js';

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function periodBounds(period) {
    if (!PERIOD_RE.test(String(period || ''))) {
        throw new ValidationError('Invalid period — expected format YYYY-MM');
    }
    const [year, month] = period.split('-').map(Number);
    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(year, month, 1));
    return { periodStart, periodEnd };
}

/** Current calendar period in YYYY-MM, UTC. */
export function currentPeriod(now = new Date()) {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function mapMonthlySettlement(doc = {}) {
    return {
        id: String(doc._id),
        vendorId: String(doc.vendorId),
        period: doc.period,
        periodStart: doc.periodStart,
        periodEnd: doc.periodEnd,
        totalBookings: Number(doc.totalBookings || 0),
        grossRevenue: Number(doc.grossRevenue || 0),
        platformCommission: Number(doc.platformCommission || 0),
        gstCollected: Number(doc.gstCollected || 0),
        platformFeeAmount: Number(doc.platformFeeAmount || 0),
        refundAdjustments: Number(doc.refundAdjustments || 0),
        vendorPayableAmount: Number(doc.vendorPayableAmount || 0),
        status: doc.status || 'generated',
        settlementCount: Array.isArray(doc.settlementIds) ? doc.settlementIds.length : 0,
        generatedAt: doc.generatedAt,
        approvedAt: doc.approvedAt,
        approvedBy: doc.approvedBy || null,
        processingAt: doc.processingAt,
        paidAt: doc.paidAt,
        paymentReference: doc.paymentReference || '',
        failureReason: doc.failureReason || '',
        note: doc.note || '',
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}

/**
 * Aggregates one vendor's per-booking `Settlement` rows settled within the period, plus any
 * `SettlementAdjustment` rows created during the period (regardless of which period the
 * underlying booking originally settled in — an adjustment is this period's cash event).
 * Idempotent via the `(vendorId, period)` unique index: a duplicate-key error here means the
 * settlement already exists, so it's fetched and returned rather than treated as a failure.
 */
export async function generateMonthlySettlement(vendorId, period) {
    if (!mongoose.Types.ObjectId.isValid(String(vendorId))) {
        throw new ValidationError('Invalid vendor id');
    }
    const { periodStart, periodEnd } = periodBounds(period);

    const existing = await MonthlySettlement.findOne({ vendorId, period }).lean();
    if (existing) return mapMonthlySettlement(existing);

    const settlements = await Settlement.find({
        vendorId,
        settledAt: { $gte: periodStart, $lt: periodEnd },
    }).lean();

    const settlementIds = settlements.map((s) => s._id);
    const adjustments = await SettlementAdjustment.find({
        vendorId,
        createdAt: { $gte: periodStart, $lt: periodEnd },
    }).lean();

    if (!settlements.length && !adjustments.length) return null;

    const grossRevenue = roundMoney(settlements.reduce((sum, s) => sum + Number(s.grossAmount || 0), 0));
    const platformCommission = roundMoney(settlements.reduce((sum, s) => sum + Number(s.commissionAmount || 0), 0));
    const gstCollected = roundMoney(settlements.reduce((sum, s) => sum + Number(s.taxAmount || 0), 0));
    const platformFeeAmount = roundMoney(settlements.reduce((sum, s) => sum + Number(s.platformFeeAmount || 0), 0));
    const settlementPayable = roundMoney(settlements.reduce((sum, s) => sum + Number(s.vendorSettlementAmount || 0), 0));
    const refundAdjustments = roundMoney(adjustments.reduce((sum, a) => sum + Number(a.amount || 0), 0));
    const vendorPayableAmount = roundMoney(settlementPayable + refundAdjustments);

    try {
        const doc = await MonthlySettlement.create({
            vendorId,
            period,
            periodStart,
            periodEnd,
            totalBookings: settlements.length,
            grossRevenue,
            platformCommission,
            gstCollected,
            platformFeeAmount,
            refundAdjustments,
            vendorPayableAmount,
            status: 'generated',
            settlementIds,
            generatedAt: new Date(),
        });
        return mapMonthlySettlement(doc.toObject());
    } catch (err) {
        if (err?.code === 11000) {
            const raced = await MonthlySettlement.findOne({ vendorId, period }).lean();
            if (raced) return mapMonthlySettlement(raced);
        }
        throw err;
    }
}

/** Runs generation for every vendor with settlement/adjustment activity in the period. */
export async function generateAllMonthlySettlements(period) {
    const { periodStart, periodEnd } = periodBounds(period);
    const [settledVendorIds, adjustedVendorIds] = await Promise.all([
        Settlement.distinct('vendorId', { settledAt: { $gte: periodStart, $lt: periodEnd } }),
        SettlementAdjustment.distinct('vendorId', { createdAt: { $gte: periodStart, $lt: periodEnd } }),
    ]);
    const vendorIds = [...new Set([...settledVendorIds, ...adjustedVendorIds].map(String))];

    const results = [];
    for (const vendorId of vendorIds) {
        try {
            const result = await generateMonthlySettlement(vendorId, period);
            if (result) results.push(result);
        } catch {
            /* continue with the next vendor — one bad vendor shouldn't block the batch */
        }
    }
    return results;
}

const STATUS_TRANSITIONS = {
    generated: ['approved'],
    approved: ['processing'],
    processing: ['paid', 'failed'],
    failed: ['processing'],
};

async function transitionStatus(id, toStatus, reqUser, extra = {}) {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid settlement id');
    }
    const doc = await MonthlySettlement.findById(id);
    if (!doc) throw new NotFoundError('Monthly settlement not found');
    const allowed = STATUS_TRANSITIONS[doc.status] || [];
    if (!allowed.includes(toStatus)) {
        throw new ValidationError(`Cannot move settlement from '${doc.status}' to '${toStatus}'`);
    }

    const performer = await resolveActionPerformerSnapshot(reqUser);
    const before = doc.status;
    doc.status = toStatus;
    doc.updatedBy = performer;
    if (toStatus === 'approved') {
        doc.approvedAt = new Date();
        doc.approvedBy = performer;
    }
    if (toStatus === 'processing') doc.processingAt = new Date();
    if (toStatus === 'paid') {
        doc.paidAt = new Date();
        doc.paymentReference = String(extra.paymentReference || '').trim();
    }
    if (toStatus === 'failed') {
        doc.failureReason = String(extra.failureReason || extra.note || '').trim() || 'Payout failed';
    }
    if (extra.note) doc.note = String(extra.note).trim();
    await doc.save();

    try {
        await BikeAuditLog.create({
            entityType: 'monthly_settlement',
            entityId: doc._id,
            action: `monthly_settlement.${toStatus}`,
            before: { status: before },
            after: { status: toStatus },
            performedBy: performer,
            meta: { vendorId: String(doc.vendorId), period: doc.period, ...extra },
        });
    } catch {
        /* non-blocking */
    }

    if (toStatus === 'paid' && Number(doc.vendorPayableAmount) > 0) {
        await recordTransaction({
            vendorId: doc.vendorId,
            amount: Number(doc.vendorPayableAmount),
            paymentMode: 'system',
            transactionType: 'vendor_settlement',
            referenceId: `monthly-settlement:${doc._id}`,
            performedBy: performer,
            meta: { period: doc.period, monthlySettlementId: String(doc._id) },
        });
    }

    return mapMonthlySettlement(doc.toObject());
}

export const approveMonthlySettlement = (id, reqUser, extra) => transitionStatus(id, 'approved', reqUser, extra);
export const markMonthlySettlementProcessing = (id, reqUser, extra) => transitionStatus(id, 'processing', reqUser, extra);
export const markMonthlySettlementPaid = (id, reqUser, extra) => transitionStatus(id, 'paid', reqUser, extra);
export const markMonthlySettlementFailed = (id, reqUser, extra) => transitionStatus(id, 'failed', reqUser, extra);

export async function getMonthlySettlementById(id) {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid settlement id');
    }
    const doc = await MonthlySettlement.findById(id)
        .populate('vendorId', 'businessName ownerName vendorCode')
        .lean();
    if (!doc) throw new NotFoundError('Monthly settlement not found');
    return {
        ...mapMonthlySettlement(doc),
        vendor: doc.vendorId && typeof doc.vendorId === 'object'
            ? {
                id: String(doc.vendorId._id),
                businessName: doc.vendorId.businessName || '',
                ownerName: doc.vendorId.ownerName || '',
                vendorCode: doc.vendorId.vendorCode || '',
            }
            : null,
    };
}

export async function listMonthlySettlements(query = {}) {
    const parsed = parseListQuery(query);
    const filter = {};
    if (query.vendorId && mongoose.Types.ObjectId.isValid(String(query.vendorId))) {
        filter.vendorId = query.vendorId;
    }
    if (query.period) filter.period = String(query.period);
    if (query.status && query.status !== 'all') filter.status = query.status;

    const [docs, total] = await Promise.all([
        MonthlySettlement.find(filter)
            .populate('vendorId', 'businessName ownerName vendorCode')
            .sort({ period: -1, createdAt: -1 })
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        MonthlySettlement.countDocuments(filter),
    ]);

    return toBikeRentPagination({
        docs: docs.map((doc) => ({
            ...mapMonthlySettlement(doc),
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

export async function listVendorMonthlySettlements(vendorId, query = {}) {
    return listMonthlySettlements({ ...query, vendorId });
}

export async function getVendorMonthlySettlementById(id, vendorId) {
    const doc = await getMonthlySettlementById(id);
    if (String(doc.vendorId) !== String(vendorId)) throw new NotFoundError('Monthly settlement not found');
    return doc;
}

/**
 * Cron entry point — auto-generates the previous period's settlements once the admin-configured
 * settlement day of month arrives (0 = last day of month). Safe to call daily: idempotent per
 * vendor+period via the unique index, so calling it every day of the month past the trigger day
 * just keeps returning the same already-generated rows.
 */
export async function runMonthlySettlementIfDue(settingsDayOfMonth = 0, now = new Date()) {
    const lastDayOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
    const triggerDay = settingsDayOfMonth > 0 && settingsDayOfMonth <= lastDayOfThisMonth
        ? settingsDayOfMonth
        : lastDayOfThisMonth;
    if (now.getUTCDate() < triggerDay) return { ran: false, period: null, results: [] };

    // Settle the period that just closed relative to the trigger day.
    const targetMonth = now.getUTCDate() >= triggerDay
        ? now.getUTCMonth()
        : now.getUTCMonth() - 1;
    const period = currentPeriod(new Date(Date.UTC(now.getUTCFullYear(), targetMonth, 1)));
    const results = await generateAllMonthlySettlements(period);
    return { ran: true, period, results };
}
