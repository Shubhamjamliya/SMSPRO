import mongoose from 'mongoose';

/**
 * One record per booking, written alongside vendorWallet.service.js#creditVendorEarningForBooking
 * — the auditable, queryable ledger explaining how each booking's vendor payout was derived
 * (gross -> tax -> platform fee -> commission -> net), since BikeVendorWallet only tracks a
 * running balance with no persisted per-transaction breakdown.
 */
const settlementSchema = new mongoose.Schema(
    {
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeBooking',
            required: true,
            unique: true,
            index: true,
        },
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeVendor',
            required: true,
            index: true,
        },
        /** booking.money.totalPaid at settlement time */
        grossAmount: { type: Number, default: 0, min: 0 },
        /** Pass-through to government — never platform or vendor revenue. */
        taxAmount: { type: Number, default: 0, min: 0 },
        platformFeeAmount: { type: Number, default: 0, min: 0 },
        platformFeePayer: { type: String, enum: ['customer', 'vendor', ''], default: '' },
        commissionRate: { type: Number, default: 0, min: 0, max: 100 },
        commissionAmount: { type: Number, default: 0, min: 0 },
        vendorSettlementAmount: { type: Number, default: 0, min: 0 },
        status: { type: String, enum: ['pending', 'settled'], default: 'settled', index: true },
        settledAt: { type: Date, default: Date.now },
    },
    {
        collection: 'bike_rent_settlements',
        timestamps: true,
    },
);

settlementSchema.index({ vendorId: 1, settledAt: -1 });

export const Settlement = mongoose.models.Settlement
    || mongoose.model('Settlement', settlementSchema, 'bike_rent_settlements');
