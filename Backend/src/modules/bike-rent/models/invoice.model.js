import mongoose from 'mongoose';

const lineItemSchema = new mongoose.Schema(
    {
        label: { type: String, required: true, trim: true },
        /** rentalAmount | platformFee | lateCharges | damageCharges | securityDeposit */
        type: { type: String, required: true, trim: true },
        amount: { type: Number, default: 0, min: 0 },
        taxable: { type: Boolean, default: false },
        gstAmount: { type: Number, default: 0, min: 0 },
    },
    { _id: false },
);

/** Vendor identity frozen at issue time — invoices must stay immutable even if the vendor
 *  later edits their VendorTaxProfile. */
const vendorSnapshotSchema = new mongoose.Schema(
    {
        legalBusinessName: { type: String, default: '', trim: true },
        gstin: { type: String, default: '', trim: true },
        isGstRegistered: { type: Boolean, default: false },
        address: { type: String, default: '', trim: true },
        panNumber: { type: String, default: '', trim: true },
    },
    { _id: false },
);

const invoiceSchema = new mongoose.Schema(
    {
        invoiceNumber: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            index: true,
        },
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeBooking',
            required: true,
            index: true,
        },
        /**
         * 'original' is the frozen snapshot issued at first-payment-success — never edited or
         * regenerated. Each extension gets its own 'extension' invoice (a follow-up debit
         * note) linked via `parentInvoiceId`, rather than reopening the original.
         */
        invoiceType: {
            type: String,
            enum: ['original', 'extension'],
            default: 'original',
            index: true,
        },
        parentInvoiceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Invoice',
            default: null,
        },
        /** Idempotency key for extension invoices — the extension event's payment id. */
        extensionReference: { type: String, default: '', trim: true },
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'BikeVendor',
            default: null,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        issuedAt: { type: Date, default: Date.now },
        lineItems: { type: [lineItemSchema], default: () => ([]) },
        taxableAmount: { type: Number, default: 0, min: 0 },
        gstRate: { type: Number, default: 0, min: 0, max: 100 },
        gstAmount: { type: Number, default: 0, min: 0 },
        platformFee: { type: Number, default: 0, min: 0 },
        securityDeposit: { type: Number, default: 0, min: 0 },
        totalPayable: { type: Number, default: 0, min: 0 },
        vendorSnapshot: { type: vendorSnapshotSchema, default: () => ({}) },
        status: { type: String, enum: ['issued', 'void'], default: 'issued', index: true },
    },
    {
        collection: 'bike_rent_invoices',
        timestamps: true,
    },
);

invoiceSchema.index({ vendorId: 1, issuedAt: -1 });
invoiceSchema.index(
    { bookingId: 1, invoiceType: 1 },
    { unique: true, partialFilterExpression: { invoiceType: 'original' } },
);
invoiceSchema.index(
    { bookingId: 1, extensionReference: 1 },
    { unique: true, partialFilterExpression: { invoiceType: 'extension' } },
);

export const Invoice = mongoose.models.Invoice
    || mongoose.model('Invoice', invoiceSchema, 'bike_rent_invoices');
