import { z } from 'zod';
import { ValidationError } from '../../../core/auth/errors.js';
import { GSTIN_REGEX } from './taxSettings.validator.js';

const addressSchema = z.object({
    line1: z.string().max(200).optional(),
    line2: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    pincode: z.string().max(10).optional(),
}).optional();

const vendorTaxProfileSchema = z.object({
    isGstRegistered: z.boolean().optional(),
    gstin: z.string().max(15).optional(),
    legalBusinessName: z.string().max(200).optional(),
    registeredAddress: addressSchema,
    panNumber: z.string().max(10).optional(),
});

export const validateVendorTaxProfileDto = (body = {}) => {
    const result = vendorTaxProfileSchema.safeParse(body);
    if (!result.success) throw new ValidationError(result.error.errors[0].message);
    const data = { ...result.data };

    if (data.gstin !== undefined) data.gstin = data.gstin.trim().toUpperCase();
    if (data.panNumber !== undefined) data.panNumber = data.panNumber.trim().toUpperCase();
    if (data.legalBusinessName !== undefined) data.legalBusinessName = data.legalBusinessName.trim();

    if (data.isGstRegistered && !data.gstin) {
        throw new ValidationError('GSTIN is required when GST registered is enabled');
    }
    if (data.gstin && !GSTIN_REGEX.test(data.gstin)) {
        throw new ValidationError('Enter a valid GSTIN');
    }

    if (data.registeredAddress) {
        data.registeredAddress = { ...data.registeredAddress };
        Object.keys(data.registeredAddress).forEach((key) => {
            if (typeof data.registeredAddress[key] === 'string') {
                data.registeredAddress[key] = data.registeredAddress[key].trim();
            }
        });
    }

    return data;
};
