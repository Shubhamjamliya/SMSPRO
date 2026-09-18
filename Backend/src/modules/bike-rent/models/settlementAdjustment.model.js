import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/**
 * Immutable delta record against an already-generated `Settlement`. The original settlement
 * row is never edited after creation — anything that changes a booking's money after it's
 * been settled (late balance collected post-completion, a refund issued after settlement, an
 * admin correction) is captured here instead. A settlement's effective payable is always
 * `vendorSettlementAmount + sum(adjustments)`, computed at read time.
 */
const settlementAdjustmentSchema = new mongoose.Schema(
    {
        settlementId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Settlement',
            required: true,
            index: true,
        },
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeBooking',
            required: true,
            index: true,
        },
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeVendor',
            required: true,
            index: true,
        },
        /** Signed — positive increases vendor payable (e.g. late charge collected), negative decreases it (e.g. refund). */
        amount: { type: Number, required: true },
        type: {
            type: String,
            enum: ['late_charge', 'refund', 'admin_correction'],
            required: true,
        },
        reason: { type: String, required: true, trim: true },
        performedBy: { type: actionPerformerSchema, default: null },
    },
    {
        collection: 'bike_rent_settlement_adjustments',
        timestamps: true,
    },
);

settlementAdjustmentSchema.index({ settlementId: 1, createdAt: -1 });

export const SettlementAdjustment = mongoose.models.SettlementAdjustment
    || mongoose.model('SettlementAdjustment', settlementAdjustmentSchema, 'bike_rent_settlement_adjustments');
