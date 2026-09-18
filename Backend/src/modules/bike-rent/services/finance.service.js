import { BikeBooking } from '../models/bikeBooking.model.js';
import { Settlement } from '../models/settlement.model.js';
import { MonthlySettlement } from '../models/monthlySettlement.model.js';
import { FinanceTransaction } from '../models/financeTransaction.model.js';
import { buildDateRangeFilter } from '../utils/pagination.util.js';

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

async function sumField(Model, filter, field) {
    const rows = await Model.aggregate([
        { $match: filter },
        { $group: { _id: null, total: { $sum: `$${field}` } } },
    ]);
    return roundMoney(rows[0]?.total || 0);
}

/**
 * Admin finance dashboard KPIs. Each figure is sourced from whichever collection already owns
 * that number — no separate recomputation, so this can never drift from what the booking/
 * settlement/transaction detail views show for the same underlying data.
 */
export async function getFinanceOverview(query = {}) {
    const dateRange = buildDateRangeFilter(query.from, query.to);

    const bookingFilter = { isDeleted: { $ne: true }, 'money.totalPaid': { $gt: 0 } };
    if (dateRange) bookingFilter['payment.paidAt'] = dateRange;

    const settlementFilter = {};
    if (dateRange) settlementFilter.settledAt = dateRange;

    const txnFilter = {};
    if (dateRange) txnFilter.createdAt = dateRange;

    const [
        totalRevenue,
        gstCollected,
        commission,
        onlineCollections,
        refunds,
        pendingSettlements,
        completedSettlements,
        vendorPayableAgg,
    ] = await Promise.all([
        sumField(BikeBooking, bookingFilter, 'money.totalPaid'),
        sumField(Settlement, settlementFilter, 'taxAmount'),
        sumField(Settlement, settlementFilter, 'commissionAmount'),
        sumField(FinanceTransaction, {
            ...txnFilter,
            transactionType: { $in: ['booking_payment', 'deposit_collection'] },
            paymentMode: { $in: ['razorpay', 'wallet'] },
        }, 'amount'),
        sumField(FinanceTransaction, { ...txnFilter, transactionType: 'refund' }, 'amount'),
        MonthlySettlement.countDocuments({ status: { $in: ['generated', 'approved', 'processing'] } }),
        MonthlySettlement.countDocuments({ status: 'paid' }),
        MonthlySettlement.aggregate([
            { $match: { status: { $ne: 'paid' } } },
            { $group: { _id: null, total: { $sum: '$vendorPayableAmount' } } },
        ]),
    ]);

    return {
        totalRevenue,
        vendorPayable: roundMoney(vendorPayableAgg[0]?.total || 0),
        pendingSettlements,
        completedSettlements,
        onlineCollections,
        refunds,
        gstCollected,
        commission,
        rangeApplied: Boolean(dateRange),
    };
}
