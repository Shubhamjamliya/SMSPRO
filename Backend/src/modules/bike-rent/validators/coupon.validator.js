import { z } from 'zod';
import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';

const couponBodySchema = z.object({
    code: z.string().min(1, 'Coupon code is required').max(40),
    name: z.string().min(1, 'Coupon name is required').max(120),
    description: z.string().max(500).optional(),
    discountType: z.enum(['percentage', 'fixed']).optional(),
    discountValue: z.coerce.number().positive('Valid discount required'),
    applicableOn: z.enum(['rental', 'deposit', 'both']).optional(),
    minimumAmount: z.coerce.number().min(0).optional(),
    maximumDiscount: z.coerce.number().min(0).optional(),
    usageLimit: z.coerce.number().min(0).optional(),
    perUserLimit: z.coerce.number().min(0).optional(),
    validFrom: z.string().min(1, 'Valid from date is required'),
    validTill: z.string().min(1, 'Valid till date is required'),
    status: z.enum(['active', 'inactive']).optional(),
});

const parseDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new ValidationError('Invalid date');
    }
    return date;
};

export const validateCreateCouponDto = (body = {}) => {
    const result = couponBodySchema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }
    const validFrom = parseDate(result.data.validFrom);
    const validTill = parseDate(result.data.validTill);
    if (validTill.getTime() <= validFrom.getTime()) {
        throw new ValidationError('Valid till must be after valid from');
    }
    const discountType = result.data.discountType || 'percentage';
    if (discountType === 'percentage' && Number(result.data.discountValue) > 100) {
        throw new ValidationError('Percentage discount cannot exceed 100');
    }
    return {
        code: result.data.code.trim().toUpperCase(),
        name: result.data.name.trim(),
        description: String(result.data.description || '').trim(),
        discountType,
        discountValue: Number(result.data.discountValue),
        applicableOn: result.data.applicableOn || 'rental',
        minimumAmount: Number(result.data.minimumAmount || 0),
        maximumDiscount: Number(result.data.maximumDiscount || 0),
        usageLimit: Number(result.data.usageLimit || 0),
        perUserLimit: Number(
            result.data.perUserLimit === undefined || result.data.perUserLimit === null
                ? 1
                : result.data.perUserLimit,
        ),
        validFrom,
        validTill,
        status: result.data.status || 'active',
    };
};

export const validateUpdateCouponDto = (body = {}) => {
    const partial = couponBodySchema.partial().safeParse(body);
    if (!partial.success) {
        throw new ValidationError(partial.error.errors[0].message);
    }
    const data = { ...partial.data };
    if (data.code !== undefined) data.code = data.code.trim().toUpperCase();
    if (data.name !== undefined) data.name = data.name.trim();
    if (data.description !== undefined) data.description = String(data.description).trim();
    if (data.validFrom) data.validFrom = parseDate(data.validFrom);
    if (data.validTill) data.validTill = parseDate(data.validTill);
    if (data.validFrom && data.validTill && data.validTill.getTime() <= data.validFrom.getTime()) {
        throw new ValidationError('Valid till must be after valid from');
    }
    if (data.discountType === 'percentage' && data.discountValue != null && Number(data.discountValue) > 100) {
        throw new ValidationError('Percentage discount cannot exceed 100');
    }
    if (data.discountValue !== undefined) data.discountValue = Number(data.discountValue);
    if (data.minimumAmount !== undefined) data.minimumAmount = Number(data.minimumAmount);
    if (data.maximumDiscount !== undefined) data.maximumDiscount = Number(data.maximumDiscount);
    if (data.usageLimit !== undefined) data.usageLimit = Number(data.usageLimit);
    if (data.perUserLimit !== undefined) data.perUserLimit = Number(data.perUserLimit);
    return data;
};

export const validateCouponId = (id) => {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid coupon id');
    }
    return String(id);
};

export const validateCouponStatusDto = (body = {}) => {
    const status = String(body.status || '').trim();
    if (!['active', 'inactive'].includes(status)) {
        throw new ValidationError('Invalid coupon status');
    }
    return { status };
};
