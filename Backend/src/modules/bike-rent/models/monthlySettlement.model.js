import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/**
 * One row per vendor per calendar period (`YYYY-MM`) — aggregates that period's per-booking
 * `Settlement` rows (+ their `SettlementAdjustment`s) into a single payout figure. The unique
 * `(vendorId, period)` index is the actual duplicate-generation guard, enforced by the
 * database — not just an application-level check.
 */
const monthlySettlementSchema = new mongoose.Schema(
    {
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeVendor',
            required: true,
            index: true,
        },
        /** Calendar period this settlement covers, e.g. "2026-08". */
        period: { type: String, required: true, trim: true },
        periodStart: { type: Date, required: true },
        periodEnd: { type: Date, required: true },
        totalBookings: { type: Number, default: 0, min: 0 },
        grossRevenue: { type: Number, default: 0, min: 0 },
        platformCommission: { type: Number, default: 0, min: 0 },
        gstCollected: { type: Number, default: 0, min: 0 },
        platformFeeAmount: { type: Number, default: 0, min: 0 },
        /** Net of any late-charge/refund/admin-correction adjustments recorded during the period. */
        refundAdjustments: { type: Number, default: 0 },
        vendorPayableAmount: { type: Number, default: 0, min: 0 },
        status: {
            type: String,
            enum: ['pending', 'generated', 'approved', 'processing', 'paid', 'failed'],
            default: 'generated',
            index: true,
        },
        settlementIds: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Settlement' }],
            default: () => ([]),
        },
        generatedAt: { type: Date, default: Date.now },
        approvedAt: { type: Date, default: null },
        approvedBy: { type: actionPerformerSchema, default: null },
        processingAt: { type: Date, default: null },
        paidAt: { type: Date, default: null },
        paymentReference: { type: String, default: '', trim: true },
        failureReason: { type: String, default: '', trim: true },
        note: { type: String, default: '', trim: true },
        updatedBy: { type: actionPerformerSchema, default: null },
    },
    {
        collection: 'bike_rent_monthly_settlements',
        timestamps: true,
    },
);

monthlySettlementSchema.index({ vendorId: 1, period: 1 }, { unique: true });
monthlySettlementSchema.index({ period: 1, status: 1 });

export const MonthlySettlement = mongoose.models.MonthlySettlement
    || mongoose.model('MonthlySettlement', monthlySettlementSchema, 'bike_rent_monthly_settlements');
