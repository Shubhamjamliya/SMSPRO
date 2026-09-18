import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/**
 * Unified, append-only read-side ledger — every rupee movement in the Bike Rent module gets a
 * row here, in addition to (never instead of) whatever domain-specific record already owns
 * that movement (BikeDepositLedger, FoodUserWallet.transactions, Settlement, Invoice). Written
 * non-blocking, alongside the operations that actually move money, so the proven wallet/
 * deposit/settlement logic stays the single source of truth for correctness — this collection
 * exists purely so "show me everything that happened to this booking's money" has one place to
 * query, for the admin finance dashboard and reconciliation tooling.
 *
 * Never updated in place — a correction is a new row (`admin_adjustment` / `status: 'reversed'`
 * on the original referenced by a new row's `meta.reversesTransactionId`), never an edit.
 */
const financeTransactionSchema = new mongoose.Schema(
    {
        transactionId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            index: true,
        },
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeBooking',
            default: null,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
            index: true,
        },
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeVendor',
            default: null,
            index: true,
        },
        amount: { type: Number, required: true },
        paymentMode: {
            type: String,
            enum: ['razorpay', 'wallet', 'cash', 'upi', 'card', 'system'],
            required: true,
        },
        transactionType: {
            type: String,
            enum: [
                'booking_payment',
                'deposit_collection',
                'refund',
                'damage_deduction',
                'late_charge',
                'vendor_earning',
                'platform_commission',
                'vendor_settlement',
                'admin_adjustment',
            ],
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: ['pending', 'success', 'failed', 'reversed'],
            default: 'success',
            index: true,
        },
        /** Razorpay payment id / wallet ref / settlement id — whatever is authoritative for this type. */
        referenceId: { type: String, default: '', trim: true },
        performedBy: { type: actionPerformerSchema, default: null },
        meta: { type: mongoose.Schema.Types.Mixed, default: null },
    },
    {
        collection: 'bike_rent_finance_transactions',
        timestamps: true,
    },
);

// Defense-in-depth idempotency: the same event type firing twice with the same reference
// should never create two rows.
financeTransactionSchema.index(
    { transactionType: 1, referenceId: 1 },
    { unique: true, partialFilterExpression: { referenceId: { $type: 'string', $gt: '' } } },
);
financeTransactionSchema.index({ bookingId: 1, createdAt: -1 });
financeTransactionSchema.index({ vendorId: 1, createdAt: -1 });
financeTransactionSchema.index({ createdAt: -1 });

export const FinanceTransaction = mongoose.models.FinanceTransaction
    || mongoose.model('FinanceTransaction', financeTransactionSchema, 'bike_rent_finance_transactions');
