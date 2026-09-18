import mongoose from 'mongoose';

export const TAX_BREAKDOWN_COMPONENTS = [
    'rentalAmount',
    'platformFee',
    'lateCharges',
    'damageCharges',
    'securityDeposit',
];

/**
 * Granular audit ledger — one row per taxable component per tax-calculation event.
 * Written by taxCalculation.service.js#computeTax every time it runs, so every GST figure
 * shown anywhere (quote, invoice, settlement) can be traced back to exactly how it was derived.
 */
const transactionTaxBreakdownSchema = new mongoose.Schema(
    {
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeBooking',
            required: true,
            index: true,
        },
        invoiceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Invoice',
            default: null,
            index: true,
        },
        component: {
            type: String,
            enum: TAX_BREAKDOWN_COMPONENTS,
            required: true,
        },
        baseAmount: { type: Number, default: 0, min: 0 },
        gstRate: { type: Number, default: 0, min: 0, max: 100 },
        gstAmount: { type: Number, default: 0, min: 0 },
        computedAt: { type: Date, default: Date.now },
    },
    {
        collection: 'bike_rent_transaction_tax_breakdowns',
        timestamps: true,
    },
);

transactionTaxBreakdownSchema.index({ bookingId: 1, computedAt: -1 });

export const TransactionTaxBreakdown = mongoose.models.TransactionTaxBreakdown
    || mongoose.model(
        'TransactionTaxBreakdown',
        transactionTaxBreakdownSchema,
        'bike_rent_transaction_tax_breakdowns',
    );
