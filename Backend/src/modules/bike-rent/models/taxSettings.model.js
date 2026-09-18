import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

const DEFAULTS = {
    gstPercent: 0,
    taxableComponents: {
        rentalAmount: true,
        platformFee: true,
        lateCharges: true,
        damageCharges: true,
        securityDeposit: false,
    },
    platformFee: {
        enabled: false,
        /** fixed | percent */
        type: 'fixed',
        amount: 0,
        /** customer | vendor */
        payer: 'customer',
    },
    invoice: {
        companyName: '',
        companyAddress: '',
        companyGSTIN: '',
        companyPAN: '',
        invoicePrefix: 'INV',
        nextInvoiceNumber: 1,
        footerNote: '',
    },
};

const taxableComponentsSchema = new mongoose.Schema(
    {
        rentalAmount: { type: Boolean, default: DEFAULTS.taxableComponents.rentalAmount },
        platformFee: { type: Boolean, default: DEFAULTS.taxableComponents.platformFee },
        lateCharges: { type: Boolean, default: DEFAULTS.taxableComponents.lateCharges },
        damageCharges: { type: Boolean, default: DEFAULTS.taxableComponents.damageCharges },
        securityDeposit: { type: Boolean, default: DEFAULTS.taxableComponents.securityDeposit },
    },
    { _id: false },
);

const platformFeeSchema = new mongoose.Schema(
    {
        enabled: { type: Boolean, default: DEFAULTS.platformFee.enabled },
        type: { type: String, enum: ['fixed', 'percent'], default: DEFAULTS.platformFee.type },
        amount: { type: Number, default: DEFAULTS.platformFee.amount, min: 0 },
        payer: { type: String, enum: ['customer', 'vendor'], default: DEFAULTS.platformFee.payer },
    },
    { _id: false },
);

const invoiceConfigSchema = new mongoose.Schema(
    {
        companyName: { type: String, default: DEFAULTS.invoice.companyName, trim: true },
        companyAddress: { type: String, default: DEFAULTS.invoice.companyAddress, trim: true },
        companyGSTIN: { type: String, default: DEFAULTS.invoice.companyGSTIN, trim: true, uppercase: true },
        companyPAN: { type: String, default: DEFAULTS.invoice.companyPAN, trim: true, uppercase: true },
        invoicePrefix: { type: String, default: DEFAULTS.invoice.invoicePrefix, trim: true },
        nextInvoiceNumber: { type: Number, default: DEFAULTS.invoice.nextInvoiceNumber, min: 1 },
        footerNote: { type: String, default: DEFAULTS.invoice.footerNote, trim: true },
    },
    { _id: false },
);

const taxSettingsSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            default: 'default',
            unique: true,
            index: true,
        },
        gstPercent: { type: Number, default: DEFAULTS.gstPercent, min: 0, max: 100 },
        taxableComponents: { type: taxableComponentsSchema, default: () => ({}) },
        platformFee: { type: platformFeeSchema, default: () => ({}) },
        invoice: { type: invoiceConfigSchema, default: () => ({}) },
        updatedBy: { type: actionPerformerSchema, default: null },
    },
    {
        collection: 'bike_rent_tax_settings',
        timestamps: true,
    },
);

export const TaxSettings = mongoose.models.TaxSettings
    || mongoose.model('TaxSettings', taxSettingsSchema, 'bike_rent_tax_settings');

export const TAX_SETTINGS_DEFAULTS = DEFAULTS;
