import mongoose from 'mongoose';

/**
 * Singleton taxi cash-in-hand limit for delivery partners (separate from food COD).
 */
const taxiCashLimitSchema = new mongoose.Schema(
    {
        key: { type: String, default: 'default', unique: true, index: true },
        cashLimit: { type: Number, default: 2000, min: 0 },
        isActive: { type: Boolean, default: true },
    },
    {
        collection: 'taxi_cash_limits',
        timestamps: true,
    },
);

export const TaxiCashLimit = mongoose.models.TaxiCashLimit
    || mongoose.model('TaxiCashLimit', taxiCashLimitSchema, 'taxi_cash_limits');
