import mongoose from 'mongoose';
import { Invoice } from '../models/invoice.model.js';
import { TransactionTaxBreakdown } from '../models/transactionTaxBreakdown.model.js';
import { TaxSettings, TAX_SETTINGS_DEFAULTS } from '../models/taxSettings.model.js';
import { BikeVendor } from '../models/bikeVendor.model.js';
import { VendorTaxProfile } from '../models/vendorTaxProfile.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function mapInvoice(doc = {}) {
    return {
        id: String(doc._id),
        invoiceNumber: doc.invoiceNumber,
        bookingId: String(doc.bookingId),
        invoiceType: doc.invoiceType || 'original',
        parentInvoiceId: doc.parentInvoiceId ? String(doc.parentInvoiceId) : null,
        vendorId: doc.vendorId ? String(doc.vendorId) : null,
        userId: String(doc.userId),
        issuedAt: doc.issuedAt,
        lineItems: (doc.lineItems || []).map((line) => ({
            label: line.label,
            type: line.type,
            amount: Number(line.amount || 0),
            taxable: Boolean(line.taxable),
            gstAmount: Number(line.gstAmount || 0),
        })),
        taxableAmount: Number(doc.taxableAmount || 0),
        gstRate: Number(doc.gstRate || 0),
        gstAmount: Number(doc.gstAmount || 0),
        platformFee: Number(doc.platformFee || 0),
        securityDeposit: Number(doc.securityDeposit || 0),
        totalPayable: Number(doc.totalPayable || 0),
        vendorSnapshot: doc.vendorSnapshot || null,
        status: doc.status || 'issued',
    };
}

async function nextInvoiceNumber() {
    const doc = await TaxSettings.findOneAndUpdate(
        { key: 'default' },
        { $inc: { 'invoice.nextInvoiceNumber': 1 } },
        { upsert: true, new: false, setDefaultsOnInsert: true },
    ).lean();
    const prefix = doc?.invoice?.invoicePrefix || TAX_SETTINGS_DEFAULTS.invoice.invoicePrefix;
    const number = doc?.invoice?.nextInvoiceNumber || TAX_SETTINGS_DEFAULTS.invoice.nextInvoiceNumber;
    return `${prefix}-${String(number).padStart(6, '0')}`;
}

async function buildVendorSnapshot(bookingDoc) {
    if (bookingDoc.ownerType !== 'vendor' || !bookingDoc.vendorId) {
        return { legalBusinessName: '', gstin: '', isGstRegistered: false, address: '', panNumber: '' };
    }
    const [vendor, profile] = await Promise.all([
        BikeVendor.findById(bookingDoc.vendorId).select('businessName').lean(),
        VendorTaxProfile.findOne({ vendorId: bookingDoc.vendorId }).lean(),
    ]);
    const address = profile?.registeredAddress
        ? [
            profile.registeredAddress.line1,
            profile.registeredAddress.line2,
            profile.registeredAddress.city,
            profile.registeredAddress.state,
            profile.registeredAddress.pincode,
        ].filter(Boolean).join(', ')
        : '';
    return {
        legalBusinessName: profile?.legalBusinessName || vendor?.businessName || '',
        gstin: profile?.isGstRegistered ? (profile?.gstin || '') : '',
        isGstRegistered: Boolean(profile?.isGstRegistered),
        address,
        panNumber: profile?.panNumber || '',
    };
}

/**
 * Builds an invoice from a booking's own frozen `money` fields (never live/current settings —
 * invoices must reflect exactly what was charged at the time) plus the TransactionTaxBreakdown
 * rows recorded alongside the original quote, which carry per-component taxability. Idempotent.
 */
export async function generateInvoice(bookingDoc) {
    if (!bookingDoc) return null;
    const existing = await Invoice.findOne({
        bookingId: bookingDoc._id,
        invoiceType: 'original',
    }).lean();
    if (existing) return mapInvoice(existing);

    const money = bookingDoc.money || {};
    const breakdownRows = await TransactionTaxBreakdown.find({ bookingId: bookingDoc._id }).lean();
    const gstByComponent = Object.fromEntries(breakdownRows.map((row) => [row.component, row]));

    const netRentalAmount = Math.max(0, Number(money.rentalFee || 0) - Number(money.discountAmount || 0));
    const customerFacingPlatformFee = money.platformFeePayer === 'customer' ? Number(money.platformFee || 0) : 0;

    const buildLine = (type, label, amount) => {
        const row = gstByComponent[type];
        return {
            label,
            type,
            amount: roundMoney(amount),
            taxable: Boolean(row),
            gstAmount: roundMoney(row?.gstAmount || 0),
        };
    };

    const lineItems = [
        buildLine('rentalAmount', 'Rental charges', netRentalAmount),
        buildLine('platformFee', 'Platform fee', customerFacingPlatformFee),
        buildLine('lateCharges', 'Late return charges', money.lateFee || 0),
        buildLine('damageCharges', 'Damage charges', money.damageFee || 0),
    ].filter((line) => line.amount > 0);

    const taxableAmount = roundMoney(
        lineItems.filter((line) => line.taxable).reduce((sum, line) => sum + line.amount, 0),
    );

    const invoiceNumber = await nextInvoiceNumber();
    const vendorSnapshot = await buildVendorSnapshot(bookingDoc);

    const doc = await Invoice.create({
        invoiceNumber,
        bookingId: bookingDoc._id,
        invoiceType: 'original',
        vendorId: bookingDoc.vendorId || null,
        userId: bookingDoc.userId,
        issuedAt: new Date(),
        lineItems,
        taxableAmount,
        gstRate: Number(money.gstRate || 0),
        gstAmount: roundMoney(money.taxAmount || 0),
        platformFee: customerFacingPlatformFee,
        securityDeposit: Number(money.securityDeposit || 0),
        totalPayable: Number(money.totalPayable || 0),
        vendorSnapshot,
        status: 'issued',
    });

    try {
        await TransactionTaxBreakdown.updateMany(
            { bookingId: bookingDoc._id, invoiceId: null },
            { $set: { invoiceId: doc._id } },
        );
    } catch {
        /* non-blocking */
    }

    return mapInvoice(doc.toObject());
}

export async function getInvoiceById(id) {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid invoice id');
    }
    const doc = await Invoice.findById(id).lean();
    if (!doc) throw new NotFoundError('Invoice not found');
    return mapInvoice(doc);
}

/** Returns null (not an error) when no original invoice exists yet for the booking. */
export async function getInvoiceByBooking(bookingId) {
    if (!mongoose.Types.ObjectId.isValid(String(bookingId))) {
        throw new ValidationError('Invalid booking id');
    }
    const doc = await Invoice.findOne({ bookingId, invoiceType: 'original' }).lean();
    return doc ? mapInvoice(doc) : null;
}

/** All follow-up extension debit-note invoices for a booking, oldest first. */
export async function getExtensionInvoicesByBooking(bookingId) {
    if (!mongoose.Types.ObjectId.isValid(String(bookingId))) return [];
    const docs = await Invoice.find({ bookingId, invoiceType: 'extension' })
        .sort({ issuedAt: 1 })
        .lean();
    return docs.map(mapInvoice);
}

/**
 * Follow-up debit-note invoice for a single extension event — never edits the original
 * invoice. Idempotent per extension event via `extensionReference` (the extension's own
 * payment id, unique per extension regardless of payment method).
 */
export async function generateExtensionInvoice(bookingDoc, {
    extensionPaymentId,
    rentalFeeDelta,
    gstRate = 0,
    taxDelta = 0,
    totalFee,
    newEndAt,
} = {}) {
    if (!bookingDoc || !extensionPaymentId) return null;
    const existing = await Invoice.findOne({
        bookingId: bookingDoc._id,
        invoiceType: 'extension',
        extensionReference: extensionPaymentId,
    }).lean();
    if (existing) return mapInvoice(existing);

    const original = await Invoice.findOne({
        bookingId: bookingDoc._id,
        invoiceType: 'original',
    }).lean();
    const vendorSnapshot = original?.vendorSnapshot || (await buildVendorSnapshot(bookingDoc));

    const taxable = Number(gstRate) > 0 && Number(taxDelta) > 0;
    const lineItems = [{
        label: `Rental extension until ${new Date(newEndAt).toLocaleString()}`,
        type: 'rentalAmount',
        amount: roundMoney(rentalFeeDelta),
        taxable,
        gstAmount: roundMoney(taxDelta),
    }];

    const invoiceNumber = await nextInvoiceNumber();
    const doc = await Invoice.create({
        invoiceNumber,
        bookingId: bookingDoc._id,
        invoiceType: 'extension',
        parentInvoiceId: original?._id || null,
        extensionReference: extensionPaymentId,
        vendorId: bookingDoc.vendorId || null,
        userId: bookingDoc.userId,
        issuedAt: new Date(),
        lineItems,
        taxableAmount: taxable ? roundMoney(rentalFeeDelta) : 0,
        gstRate: Number(gstRate) || 0,
        gstAmount: roundMoney(taxDelta),
        platformFee: 0,
        securityDeposit: 0,
        totalPayable: roundMoney(totalFee ?? (Number(rentalFeeDelta) + Number(taxDelta))),
        vendorSnapshot,
        status: 'issued',
    });

    return mapInvoice(doc.toObject());
}

/** User-scoped read — only the invoice's own customer may fetch it this way. */
export async function getUserInvoiceByBooking(bookingId, userId) {
    const invoice = await getInvoiceByBooking(bookingId);
    if (!invoice) throw new NotFoundError('Invoice not yet available for this booking');
    if (String(invoice.userId) !== String(userId)) throw new NotFoundError('Invoice not found');
    return invoice;
}

/** Vendor-scoped read — only the invoice's own vendor may fetch it this way. */
export async function getVendorInvoiceByBooking(bookingId, vendorId) {
    const invoice = await getInvoiceByBooking(bookingId);
    if (!invoice) throw new NotFoundError('Invoice not yet available for this booking');
    if (String(invoice.vendorId) !== String(vendorId)) throw new NotFoundError('Invoice not found');
    return invoice;
}

export async function getAdminInvoiceById(id) {
    return getInvoiceById(id);
}
