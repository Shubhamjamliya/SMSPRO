import { z } from 'zod';
import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';

const objectIdList = z.array(z.string()).optional();

const couponBodySchema = z.object({
    code: z.string().min(1, 'Coupon code is required').max(40),
    name: z.string().min(1, 'Coupon name is required').max(120),
    description: z.string().max(500).optional(),
    discountType: z.enum(['percentage', 'flat']).optional(),
    discountValue: z.coerce.number().positive('Valid discount required'),
    maxDiscount: z.coerce.number().min(0).optional(),
    minFare: z.coerce.number().min(0).optional(),
    usageLimit: z.coerce.number().min(0).optional(),
    perUserLimit: z.coerce.number().min(0).optional(),
    validFrom: z.string().min(1, 'Start date required'),
    validUntil: z.string().min(1, 'End date required'),
    customerScope: z.enum(['all', 'first-time']).optional(),
    firstRideOnly: z.boolean().optional(),
    waivePlatformFee: z.boolean().optional(),
    autoApply: z.boolean().optional(),
    showInBooking: z.boolean().optional(),
    zoneIds: objectIdList,
    vehicleTypeIds: objectIdList,
    status: z.enum(['active', 'scheduled', 'expired', 'inactive']).optional(),
});

const parseDate = (value) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
        throw new ValidationError('Invalid date');
    }
    return d;
};

const normalizeIdList = (ids = []) => {
    const out = [];
    for (const raw of ids) {
        const id = String(raw || '').trim();
        if (!id) continue;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ValidationError('Invalid id in zone/vehicle list');
        }
        out.push(id);
    }
    return [...new Set(out)];
};

const deriveCouponStatus = (validFrom, validUntil, status) => {
    if (status === 'inactive') return 'inactive';
    const now = Date.now();
    if (validUntil.getTime() < now) return 'expired';
    if (validFrom.getTime() > now) return 'scheduled';
    if (status === 'scheduled' || status === 'expired') return 'active';
    return status || 'active';
};

export const validateCreateCouponDto = (body = {}) => {
    const result = couponBodySchema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0].message);
    }
    const validFrom = parseDate(result.data.validFrom);
    const validUntil = parseDate(result.data.validUntil);
    if (validUntil.getTime() <= validFrom.getTime()) {
        throw new ValidationError('End date must be after start date');
    }
    const discountType = result.data.discountType || 'percentage';
    if (discountType === 'percentage'
        && (result.data.maxDiscount === undefined || Number(result.data.maxDiscount) <= 0)) {
        throw new ValidationError('Max discount is required for percentage coupons');
    }

    const firstRideOnly = result.data.firstRideOnly === true
        || result.data.customerScope === 'first-time';

    return {
        code: result.data.code.trim().toUpperCase(),
        name: result.data.name.trim(),
        description: (result.data.description || '').trim(),
        discountType,
        discountValue: Number(result.data.discountValue),
        maxDiscount: Number(result.data.maxDiscount || 0),
        minFare: Number(result.data.minFare || 0),
        usageLimit: Number(result.data.usageLimit || 0),
        perUserLimit: Number(result.data.perUserLimit ?? 1),
        validFrom,
        validUntil,
        customerScope: firstRideOnly ? 'first-time' : (result.data.customerScope || 'all'),
        firstRideOnly,
        waivePlatformFee: result.data.waivePlatformFee === true,
        autoApply: result.data.autoApply === true,
        showInBooking: result.data.showInBooking !== false,
        zoneIds: normalizeIdList(result.data.zoneIds),
        vehicleTypeIds: normalizeIdList(result.data.vehicleTypeIds),
        status: deriveCouponStatus(validFrom, validUntil, result.data.status),
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
    if (data.description !== undefined) data.description = data.description.trim();
    if (data.validFrom) data.validFrom = parseDate(data.validFrom);
    if (data.validUntil) data.validUntil = parseDate(data.validUntil);
    if (data.validFrom && data.validUntil && data.validUntil.getTime() <= data.validFrom.getTime()) {
        throw new ValidationError('End date must be after start date');
    }
    if (data.zoneIds) data.zoneIds = normalizeIdList(data.zoneIds);
    if (data.vehicleTypeIds) data.vehicleTypeIds = normalizeIdList(data.vehicleTypeIds);
    if (data.firstRideOnly === true) data.customerScope = 'first-time';
    if (data.customerScope === 'first-time') data.firstRideOnly = true;
    if (data.discountType === 'percentage'
        && data.maxDiscount !== undefined
        && Number(data.maxDiscount) <= 0) {
        throw new ValidationError('Max discount is required for percentage coupons');
    }
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
    if (!['active', 'scheduled', 'expired', 'inactive'].includes(status)) {
        throw new ValidationError('Invalid coupon status');
    }
    return { status };
};

export const validatePreviewCouponDto = (body = {}) => {
    const code = String(body.code || body.couponCode || '').trim().toUpperCase();
    if (!code) throw new ValidationError('Coupon code is required');

    const fareTotal = Number(body.fareTotal ?? body.fare);
    if (!Number.isFinite(fareTotal) || fareTotal < 0) {
        throw new ValidationError('Valid fareTotal is required');
    }

    const vehicleTypeId = body.vehicleTypeId
        ? String(body.vehicleTypeId).trim()
        : null;
    if (vehicleTypeId && !mongoose.Types.ObjectId.isValid(vehicleTypeId)) {
        throw new ValidationError('Invalid vehicleTypeId');
    }

    const zoneId = body.zoneId ? String(body.zoneId).trim() : null;
    if (zoneId && !mongoose.Types.ObjectId.isValid(zoneId)) {
        throw new ValidationError('Invalid zoneId');
    }

    return {
        code,
        fareTotal,
        platformFee: Math.max(0, Number(body.platformFee || 0) || 0),
        vehicleTypeId,
        zoneId,
    };
};

export const validateAvailableCouponsQuery = (query = {}) => {
    const fareTotal = Number(query.fareTotal ?? query.fare);
    const vehicleTypeId = query.vehicleTypeId
        ? String(query.vehicleTypeId).trim()
        : null;
    if (vehicleTypeId && !mongoose.Types.ObjectId.isValid(vehicleTypeId)) {
        throw new ValidationError('Invalid vehicleTypeId');
    }
    const zoneId = query.zoneId ? String(query.zoneId).trim() : null;
    if (zoneId && !mongoose.Types.ObjectId.isValid(zoneId)) {
        throw new ValidationError('Invalid zoneId');
    }
    return {
        fareTotal: Number.isFinite(fareTotal) && fareTotal >= 0 ? fareTotal : null,
        platformFee: Math.max(0, Number(query.platformFee || 0) || 0),
        vehicleTypeId,
        zoneId,
    };
};
