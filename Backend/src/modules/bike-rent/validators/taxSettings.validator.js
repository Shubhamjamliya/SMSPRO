import { z } from 'zod';
import { ValidationError } from '../../../core/auth/errors.js';

const taxableComponentsSchema = z.object({
    rentalAmount: z.boolean().optional(),
    platformFee: z.boolean().optional(),
    lateCharges: z.boolean().optional(),
    damageCharges: z.boolean().optional(),
    securityDeposit: z.boolean().optional(),
}).optional();

const platformFeeSchema = z.object({
    enabled: z.boolean().optional(),
    type: z.enum(['fixed', 'percent']).optional(),
    amount: z.coerce.number().min(0).optional(),
    payer: z.enum(['customer', 'vendor']).optional(),
}).optional();

const invoiceConfigSchema = z.object({
    companyName: z.string().max(200).optional(),
    companyAddress: z.string().max(500).optional(),
    companyGSTIN: z.string().max(15).optional(),
    companyPAN: z.string().max(10).optional(),
    invoicePrefix: z.string().max(20).optional(),
    nextInvoiceNumber: z.coerce.number().int().min(1).optional(),
    footerNote: z.string().max(500).optional(),
}).optional();

const taxSettingsSchema = z.object({
    gstPercent: z.coerce.number().min(0).max(100).optional(),
    taxableComponents: taxableComponentsSchema,
    platformFee: platformFeeSchema,
    invoice: invoiceConfigSchema,
});

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const validateTaxSettingsDto = (body = {}) => {
    const result = taxSettingsSchema.safeParse(body);
    if (!result.success) throw new ValidationError(result.error.errors[0].message);
    const data = { ...result.data };

    if (data.invoice) {
        data.invoice = { ...data.invoice };
        if (data.invoice.companyGSTIN !== undefined) {
            data.invoice.companyGSTIN = data.invoice.companyGSTIN.trim().toUpperCase();
            if (data.invoice.companyGSTIN && !GSTIN_REGEX.test(data.invoice.companyGSTIN)) {
                throw new ValidationError('Enter a valid company GSTIN');
            }
        }
        if (data.invoice.companyPAN !== undefined) {
            data.invoice.companyPAN = data.invoice.companyPAN.trim().toUpperCase();
        }
        if (data.invoice.companyName !== undefined) data.invoice.companyName = data.invoice.companyName.trim();
        if (data.invoice.companyAddress !== undefined) data.invoice.companyAddress = data.invoice.companyAddress.trim();
        if (data.invoice.invoicePrefix !== undefined) data.invoice.invoicePrefix = data.invoice.invoicePrefix.trim().toUpperCase();
        if (data.invoice.footerNote !== undefined) data.invoice.footerNote = data.invoice.footerNote.trim();
    }

    if (data.platformFee?.enabled && data.platformFee.type === 'percent' && Number(data.platformFee.amount) > 100) {
        throw new ValidationError('Percent-based platform fee cannot exceed 100%');
    }

    return data;
};

export { GSTIN_REGEX };
