/**
 * Bike Rental coupon engine (module-scoped — separate from Food/Taxi/Porter).
 */
import mongoose from 'mongoose';
import { BikeCoupon } from '../models/bikeCoupon.model.js';
import { BikeCouponUsage } from '../models/bikeCouponUsage.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import { resolveActionPerformerSnapshot } from '../../../core/utils/performer.js';
import {
    parseListQuery,
    buildDateRangeFilter,
    toBikeRentPagination,
    escapeRegex,
} from '../utils/pagination.util.js';
import { applySoftDelete } from '../utils/softDelete.util.js';
import {
    validateCreateCouponDto,
    validateUpdateCouponDto,
    validateCouponId,
    validateCouponStatusDto,
} from '../validators/coupon.validator.js';
import { validateListQuery } from '../validators/listQuery.validator.js';
import {
    notifyCouponSubmitted,
    notifyCouponResubmitted,
    notifyCouponApproved,
    notifyCouponRejected,
} from './bookingNotifications.service.js';

const baseFilter = { isDeleted: { $ne: true } };

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function toId(doc) {
    return doc?._id ? String(doc._id) : doc?.id ? String(doc.id) : null;
}

/** True when a ref field was actually .populate()'d (a real sub-doc), not just an unpopulated ObjectId. */
function isPopulated(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
        && typeof value.toHexString !== 'function';
}

/** doc.vendorId may be a raw ObjectId (unpopulated) or a populated {_id, businessName, ...} sub-doc. */
function resolveVendorId(vendorIdValue) {
    return isPopulated(vendorIdValue) ? vendorIdValue._id : vendorIdValue;
}

/** Plain-object snapshot of a coupon's editable fields, used to diff a resubmission against what the admin rejected. */
function snapshotCouponFields(doc) {
    return {
        code: doc.code || '',
        name: doc.name || '',
        description: doc.description || '',
        discountType: doc.discountType || 'percentage',
        discountValue: Number(doc.discountValue || 0),
        applicableOn: doc.applicableOn || 'rental',
        minimumAmount: Number(doc.minimumAmount || 0),
        maximumDiscount: Number(doc.maximumDiscount || 0),
        usageLimit: Number(doc.usageLimit || 0),
        perUserLimit: Number(doc.perUserLimit ?? 1),
        validFrom: doc.validFrom || null,
        validTill: doc.validTill || null,
    };
}

export function mapCoupon(doc = {}) {
    const now = Date.now();
    const validFrom = doc.validFrom ? new Date(doc.validFrom) : null;
    const validTill = doc.validTill ? new Date(doc.validTill) : null;
    let displayStatus = doc.status || 'inactive';
    if (doc.status === 'active') {
        if (validTill && validTill.getTime() < now) displayStatus = 'expired';
        else if (validFrom && validFrom.getTime() > now) displayStatus = 'scheduled';
    }

    return {
        id: toId(doc),
        code: doc.code || '',
        name: doc.name || '',
        description: doc.description || '',
        discountType: doc.discountType || 'percentage',
        discountValue: Number(doc.discountValue || 0),
        applicableOn: doc.applicableOn || 'rental',
        minimumAmount: Number(doc.minimumAmount || 0),
        maximumDiscount: Number(doc.maximumDiscount || 0),
        usageLimit: Number(doc.usageLimit || 0),
        usedCount: Number(doc.usedCount || 0),
        perUserLimit: Number(doc.perUserLimit ?? 1),
        remainingUses: Number(doc.usageLimit || 0) > 0
            ? Math.max(0, Number(doc.usageLimit) - Number(doc.usedCount || 0))
            : null,
        validFrom: doc.validFrom,
        validTill: doc.validTill,
        status: doc.status || 'inactive',
        displayStatus,
        totalDiscountGiven: Number(doc.totalDiscountGiven || 0),
        ownerType: doc.ownerType || 'admin',
        vendorId: toId(doc.vendorId),
        vendor: isPopulated(doc.vendorId)
            ? {
                id: toId(doc.vendorId),
                businessName: doc.vendorId.businessName || '',
                ownerName: doc.vendorId.ownerName || '',
                vendorCode: doc.vendorId.vendorCode || '',
            }
            : null,
        approvalStatus: doc.approvalStatus || 'approved',
        rejectionReason: doc.rejectionReason || '',
        rejectedSnapshot: doc.rejectedSnapshot || null,
        approvalHistory: Array.isArray(doc.approvalHistory)
            ? doc.approvalHistory.map((h) => ({
                status: h.status || '',
                reason: h.reason || '',
                changedAt: h.changedAt,
                changedByName: h.changedBy?.name || '',
            }))
            : [],
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}

function mapUsage(doc = {}) {
    return {
        id: toId(doc),
        couponId: toId(doc.couponId) || String(doc.couponId || ''),
        userId: String(doc.userId || ''),
        bookingId: toId(doc.bookingId) || String(doc.bookingId || ''),
        couponCode: doc.couponCode || '',
        discountAmount: Number(doc.discountAmount || 0),
        rentalDiscount: Number(doc.rentalDiscount || 0),
        depositDiscount: Number(doc.depositDiscount || 0),
        usedAt: doc.usedAt,
        releasedAt: doc.releasedAt,
        status: doc.status || 'consumed',
    };
}

function computeRawDiscount({ discountType, discountValue, maximumDiscount }, base) {
    const cappedBase = Math.max(0, Number(base) || 0);
    if (cappedBase <= 0) return 0;
    let amount = 0;
    if (discountType === 'fixed') {
        amount = Math.min(cappedBase, Math.max(0, Number(discountValue) || 0));
    } else {
        amount = cappedBase * (Math.max(0, Number(discountValue) || 0) / 100);
        const maxCap = Number(maximumDiscount || 0);
        if (maxCap > 0) amount = Math.min(amount, maxCap);
        amount = Math.min(amount, cappedBase);
    }
    return roundMoney(amount);
}

/**
 * Split a computed discount across rental / deposit according to applicableOn.
 */
export function splitCouponDiscount({
    rentalFee = 0,
    securityDeposit = 0,
    discountType = 'percentage',
    discountValue = 0,
    maximumDiscount = 0,
    applicableOn = 'rental',
} = {}) {
    const rental = Math.max(0, Number(rentalFee) || 0);
    const deposit = Math.max(0, Number(securityDeposit) || 0);
    const scope = String(applicableOn || 'rental');

    let eligibleBase = rental;
    if (scope === 'deposit') eligibleBase = deposit;
    if (scope === 'both') eligibleBase = rental + deposit;

    const totalDiscount = computeRawDiscount(
        { discountType, discountValue, maximumDiscount },
        eligibleBase,
    );

    let rentalDiscount = 0;
    let depositDiscount = 0;

    if (scope === 'rental') {
        rentalDiscount = Math.min(rental, totalDiscount);
    } else if (scope === 'deposit') {
        depositDiscount = Math.min(deposit, totalDiscount);
    } else {
        // Prefer rental reduction first, remainder on deposit.
        rentalDiscount = Math.min(rental, totalDiscount);
        depositDiscount = Math.min(deposit, Math.max(0, totalDiscount - rentalDiscount));
    }

    return {
        discountAmount: roundMoney(rentalDiscount + depositDiscount),
        rentalDiscount: roundMoney(rentalDiscount),
        depositDiscount: roundMoney(depositDiscount),
        finalRentalAmount: roundMoney(Math.max(0, rental - rentalDiscount)),
        finalDepositAmount: roundMoney(Math.max(0, deposit - depositDiscount)),
        eligibleBase: roundMoney(eligibleBase),
    };
}

async function countUserUses(couponId, userId) {
    if (!userId || !couponId) return 0;
    return BikeCouponUsage.countDocuments({
        couponId,
        userId,
        status: 'consumed',
    });
}

async function countUserUsesForCoupons(couponIds, userId) {
    if (!userId || !couponIds?.length) return new Map();
    if (!mongoose.Types.ObjectId.isValid(String(userId))) return new Map();
    const validCouponIds = couponIds
        .filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
        .map((id) => new mongoose.Types.ObjectId(String(id)));
    if (!validCouponIds.length) return new Map();

    const rows = await BikeCouponUsage.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(String(userId)),
                couponId: { $in: validCouponIds },
                status: 'consumed',
            },
        },
        {
            $group: {
                _id: '$couponId',
                count: { $sum: 1 },
            },
        },
    ]);
    return new Map(rows.map((row) => [String(row._id), Number(row.count || 0)]));
}

/**
 * Shared eligibility checks used by list + apply paths.
 * Returns null when eligible, otherwise a short reason code/message.
 */
export function getCouponIneligibilityReason(coupon, {
    rentalFee = 0,
    securityDeposit = 0,
    userUses = 0,
    now = Date.now(),
    bikeVendorId = null,
} = {}) {
    if (!coupon || coupon.isDeleted) {
        return { code: 'INVALID', message: 'Invalid coupon code' };
    }
    if (coupon.status !== 'active') {
        return { code: 'INACTIVE', message: 'This coupon is not active' };
    }
    if (coupon.approvalStatus && coupon.approvalStatus !== 'approved') {
        return { code: 'NOT_APPROVED', message: 'This coupon is not yet available' };
    }
    // Vendor-authored coupons only apply to that vendor's own bikes.
    if (coupon.ownerType === 'vendor' && bikeVendorId
        && String(coupon.vendorId) !== String(bikeVendorId)) {
        return { code: 'VENDOR_MISMATCH', message: 'Coupon is not valid for this bike' };
    }
    if (coupon.validFrom && new Date(coupon.validFrom).getTime() > now) {
        return { code: 'NOT_STARTED', message: 'This coupon is not yet valid' };
    }
    if (coupon.validTill && new Date(coupon.validTill).getTime() < now) {
        return { code: 'EXPIRED', message: 'Coupon expired' };
    }

    const rental = Math.max(0, Number(rentalFee) || 0);
    if (rental < Number(coupon.minimumAmount || 0)) {
        return {
            code: 'MIN_AMOUNT',
            message: `Minimum booking amount required is ₹${Number(coupon.minimumAmount || 0)}`,
        };
    }

    if (Number(coupon.usageLimit || 0) > 0
        && Number(coupon.usedCount || 0) >= Number(coupon.usageLimit)) {
        return { code: 'USAGE_LIMIT', message: 'Coupon usage limit reached' };
    }

    const perUserLimit = Number(coupon.perUserLimit || 0);
    if (perUserLimit > 0 && Number(userUses || 0) >= perUserLimit) {
        return {
            code: 'PER_USER_LIMIT',
            message: 'You have already used this coupon the maximum number of times',
        };
    }

    const split = splitCouponDiscount({
        rentalFee: rental,
        securityDeposit: Math.max(0, Number(securityDeposit) || 0),
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        maximumDiscount: coupon.maximumDiscount,
        applicableOn: coupon.applicableOn,
    });
    if (split.discountAmount <= 0) {
        return { code: 'NO_DISCOUNT', message: 'Coupon cannot be applied to this booking' };
    }

    return null;
}

/**
 * Validate + calculate discount for a quote / booking.
 * Throws ValidationError with user-friendly messages.
 */
export async function validateAndApplyCoupon({
    code,
    rentalFee = 0,
    securityDeposit = 0,
    userId = null,
    bikeVendorId = null,
} = {}) {
    const couponCode = String(code || '').trim().toUpperCase();
    if (!couponCode) {
        throw new ValidationError('Invalid coupon code');
    }

    const coupon = await BikeCoupon.findOne({
        code: couponCode,
        ...baseFilter,
    });
    if (!coupon) {
        throw new ValidationError('Invalid coupon code');
    }

    const userUses = userId
        ? await countUserUses(coupon._id, userId)
        : 0;

    // Require authenticated user when coupon has a per-user limit, to prevent misuse.
    if (!userId && Number(coupon.perUserLimit || 0) > 0) {
        throw new ValidationError('Please log in to apply this coupon');
    }

    const reason = getCouponIneligibilityReason(coupon, {
        rentalFee,
        securityDeposit,
        userUses,
        bikeVendorId,
    });
    if (reason) {
        throw new ValidationError(reason.message, reason.code);
    }

    const split = splitCouponDiscount({
        rentalFee: Math.max(0, Number(rentalFee) || 0),
        securityDeposit: Math.max(0, Number(securityDeposit) || 0),
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        maximumDiscount: coupon.maximumDiscount,
        applicableOn: coupon.applicableOn,
    });

    return {
        coupon,
        couponId: String(coupon._id),
        couponCode: coupon.code,
        name: coupon.name,
        description: coupon.description || '',
        discountType: coupon.discountType,
        discountValue: Number(coupon.discountValue || 0),
        applicableOn: coupon.applicableOn,
        maximumDiscount: Number(coupon.maximumDiscount || 0),
        minimumAmount: Number(coupon.minimumAmount || 0),
        ownerType: coupon.ownerType || 'admin',
        couponVendorId: coupon.vendorId ? String(coupon.vendorId) : null,
        ...split,
    };
}

/**
 * List only coupons the caller can actually use right now.
 * Exhausted / already-used / expired / under-min coupons are omitted (not shown as unavailable).
 */
export async function listPublicCoupons({
    rentalAmount = 0,
    securityDeposit = 0,
    userId = null,
    limit = 20,
    bikeVendorId = null,
} = {}) {
    const now = new Date();
    const rental = Math.max(0, Number(rentalAmount) || 0);
    const deposit = Math.max(0, Number(securityDeposit) || 0);
    const docs = await BikeCoupon.find({
        ...baseFilter,
        status: 'active',
        approvalStatus: { $nin: ['pending', 'rejected'] },
        validFrom: { $lte: now },
        validTill: { $gte: now },
        $expr: {
            $or: [
                { $eq: ['$usageLimit', 0] },
                { $lt: ['$usedCount', '$usageLimit'] },
            ],
        },
        // Vendor coupons only surface when browsing that specific vendor's bike.
        $or: bikeVendorId
            ? [{ ownerType: 'admin' }, { ownerType: 'vendor', vendorId: bikeVendorId }]
            : [{ ownerType: 'admin' }],
    })
        .sort({ createdAt: -1 })
        .limit(Math.min(100, Math.max(1, Number(limit) || 20) * 3))
        .lean();

    const usageByCoupon = userId
        ? await countUserUsesForCoupons(docs.map((row) => row._id), userId)
        : new Map();

    const eligible = [];
    for (const row of docs) {
        const userUses = usageByCoupon.get(String(row._id)) || 0;
        const reason = getCouponIneligibilityReason(row, {
            rentalFee: rental,
            securityDeposit: deposit,
            userUses,
            now: now.getTime(),
            bikeVendorId,
        });
        if (reason) continue;

        const mapped = mapCoupon(row);
        const preview = splitCouponDiscount({
            rentalFee: rental,
            securityDeposit: deposit,
            discountType: row.discountType,
            discountValue: row.discountValue,
            maximumDiscount: row.maximumDiscount,
            applicableOn: row.applicableOn,
        });
        eligible.push({
            ...mapped,
            previewDiscount: preview.discountAmount,
            label: row.discountType === 'fixed'
                ? `₹${Number(row.discountValue || 0)} OFF`
                : `${Number(row.discountValue || 0)}% OFF`,
        });
        if (eligible.length >= Math.min(50, Math.max(1, Number(limit) || 20))) break;
    }

    return eligible;
}

const buildSort = (sortBy, sortOrder) => {
    const allowed = [
        'code', 'name', 'discountValue', 'usedCount', 'minimumAmount',
        'validFrom', 'validTill', 'createdAt',
    ];
    const key = allowed.includes(sortBy) ? sortBy : 'createdAt';
    return { [key]: sortOrder };
};

export async function listCoupons(query = {}, vendorScope = null) {
    validateListQuery(query);
    const parsed = parseListQuery(query);
    const filter = { ...baseFilter };
    if (vendorScope) filter.vendorId = vendorScope;

    if (parsed.status) filter.status = parsed.status;
    if (query.discountType && String(query.discountType) !== 'all') {
        filter.discountType = String(query.discountType);
    }
    if (query.applicableOn && String(query.applicableOn) !== 'all') {
        filter.applicableOn = String(query.applicableOn);
    }

    if (parsed.search) {
        const term = escapeRegex(parsed.search);
        filter.$or = [
            { code: { $regex: term, $options: 'i' } },
            { name: { $regex: term, $options: 'i' } },
            { description: { $regex: term, $options: 'i' } },
        ];
    }

    const dateRange = buildDateRangeFilter(parsed.createdFrom, parsed.createdTo);
    if (dateRange) filter.createdAt = dateRange;

    const [docs, total] = await Promise.all([
        BikeCoupon.find(filter)
            .sort(buildSort(parsed.sortBy, parsed.sortOrder))
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        BikeCoupon.countDocuments(filter),
    ]);

    return toBikeRentPagination({
        docs: docs.map(mapCoupon),
        total,
        page: parsed.page,
        limit: parsed.limit,
    });
}

export async function getCouponById(id, vendorScope = null) {
    const couponId = validateCouponId(id);
    const doc = await BikeCoupon.findOne({ _id: couponId, ...baseFilter })
        .populate('vendorId', 'businessName ownerName vendorCode')
        .lean();
    if (!doc) throw new NotFoundError('Coupon not found');
    if (vendorScope && String(resolveVendorId(doc.vendorId)) !== String(vendorScope)) {
        throw new NotFoundError('Coupon not found');
    }
    return mapCoupon(doc);
}

export async function createCoupon(body, reqUser, vendorScope = null) {
    const payload = validateCreateCouponDto(body);
    const performer = await resolveActionPerformerSnapshot(reqUser);

    const existing = await BikeCoupon.findOne({
        code: payload.code,
        ...baseFilter,
    }).select('_id').lean();
    if (existing) throw new ValidationError('Coupon code already exists');

    const doc = await BikeCoupon.create({
        ...payload,
        ownerType: vendorScope ? 'vendor' : 'admin',
        vendorId: vendorScope || null,
        approvalStatus: vendorScope ? 'pending' : 'approved',
        approvalHistory: vendorScope ? [{ status: 'submitted', changedBy: performer }] : [],
        createdBy: performer,
        updatedBy: performer,
    });

    if (vendorScope) {
        const { BikeVendor } = await import('../models/bikeVendor.model.js');
        const vendor = await BikeVendor.findById(vendorScope).select('businessName').lean();
        await notifyCouponSubmitted(doc.toObject(), vendor);
    }

    return mapCoupon(doc.toObject());
}

export async function updateCoupon(id, body, reqUser) {
    const couponId = validateCouponId(id);
    const payload = validateUpdateCouponDto(body);
    const doc = await BikeCoupon.findOne({ _id: couponId, ...baseFilter });
    if (!doc) throw new NotFoundError('Coupon not found');

    if (payload.code && payload.code !== doc.code) {
        const duplicate = await BikeCoupon.findOne({
            code: payload.code,
            _id: { $ne: doc._id },
            ...baseFilter,
        }).select('_id').lean();
        if (duplicate) throw new ValidationError('Coupon code already exists');
    }

    const performer = await resolveActionPerformerSnapshot(reqUser);
    Object.assign(doc, payload);
    doc.updatedBy = performer;
    await doc.save();
    return mapCoupon(doc.toObject());
}

export async function updateCouponStatus(id, body, reqUser) {
    const couponId = validateCouponId(id);
    const { status } = validateCouponStatusDto(body);
    const doc = await BikeCoupon.findOne({ _id: couponId, ...baseFilter });
    if (!doc) throw new NotFoundError('Coupon not found');

    const performer = await resolveActionPerformerSnapshot(reqUser);
    doc.status = status;
    doc.updatedBy = performer;
    await doc.save();
    return mapCoupon(doc.toObject());
}

export async function deleteCoupon(id, reqUser) {
    const couponId = validateCouponId(id);
    const doc = await BikeCoupon.findOne({ _id: couponId, ...baseFilter });
    if (!doc) throw new NotFoundError('Coupon not found');

    const performer = await resolveActionPerformerSnapshot(reqUser);
    applySoftDelete(doc, performer);
    await doc.save();
    return { id: couponId };
}

export async function listPendingCoupons({ page = 1, limit = 20, search = '', status = 'pending' } = {}) {
    const parsed = parseListQuery({ page, limit, search });
    const filter = { ...baseFilter, ownerType: 'vendor' };
    const statusKey = String(status || '').toLowerCase();
    if (statusKey === 'all') {
        // no approvalStatus filter — every status
    } else if (['pending', 'approved', 'rejected'].includes(statusKey)) {
        filter.approvalStatus = statusKey;
    } else {
        filter.approvalStatus = 'pending';
    }
    if (parsed.search) {
        const term = escapeRegex(parsed.search);
        filter.$or = [
            { code: { $regex: term, $options: 'i' } },
            { name: { $regex: term, $options: 'i' } },
        ];
    }
    const [docs, total] = await Promise.all([
        BikeCoupon.find(filter)
            .populate('vendorId', 'businessName ownerName vendorCode')
            .sort({ updatedAt: -1 })
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        BikeCoupon.countDocuments(filter),
    ]);
    return toBikeRentPagination({
        docs: docs.map(mapCoupon),
        total,
        page: parsed.page,
        limit: parsed.limit,
    });
}

export async function approveCoupon(id, reqUser) {
    const couponId = validateCouponId(id);
    const doc = await BikeCoupon.findOne({ _id: couponId, ...baseFilter });
    if (!doc) throw new NotFoundError('Coupon not found');
    if (doc.approvalStatus === 'approved') return mapCoupon(doc.toObject());
    const performer = await resolveActionPerformerSnapshot(reqUser);
    doc.approvalStatus = 'approved';
    doc.rejectionReason = '';
    doc.rejectedSnapshot = null;
    doc.reviewedBy = performer?.userId || null;
    doc.reviewedAt = new Date();
    doc.updatedBy = performer;
    if (doc.ownerType === 'vendor') {
        doc.approvalHistory.push({ status: 'approved', changedBy: performer });
    }
    await doc.save();
    if (doc.ownerType === 'vendor' && doc.vendorId) {
        await notifyCouponApproved(doc.toObject());
    }
    return mapCoupon(doc.toObject());
}

export async function rejectCoupon(id, reason, reqUser) {
    const couponId = validateCouponId(id);
    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) throw new ValidationError('Rejection reason is required');
    const doc = await BikeCoupon.findOne({ _id: couponId, ...baseFilter });
    if (!doc) throw new NotFoundError('Coupon not found');
    const performer = await resolveActionPerformerSnapshot(reqUser);
    doc.rejectedSnapshot = { ...snapshotCouponFields(doc), rejectionReason: trimmedReason };
    doc.approvalStatus = 'rejected';
    doc.rejectionReason = trimmedReason;
    doc.reviewedBy = performer?.userId || null;
    doc.reviewedAt = new Date();
    doc.updatedBy = performer;
    if (doc.ownerType === 'vendor') {
        doc.approvalHistory.push({ status: 'rejected', reason: trimmedReason, changedBy: performer });
    }
    await doc.save();
    if (doc.ownerType === 'vendor' && doc.vendorId) {
        await notifyCouponRejected(doc.toObject(), trimmedReason);
    }
    return mapCoupon(doc.toObject());
}

export async function resubmitCoupon(id, body, reqUser, vendorScope) {
    const couponId = validateCouponId(id);
    const doc = await BikeCoupon.findOne({ _id: couponId, ...baseFilter });
    if (!doc) throw new NotFoundError('Coupon not found');
    if (doc.ownerType !== 'vendor' || String(doc.vendorId) !== String(vendorScope)) {
        throw new NotFoundError('Coupon not found');
    }
    if (doc.approvalStatus !== 'rejected') {
        throw new ValidationError('Only rejected coupons can be resubmitted');
    }

    const payload = validateUpdateCouponDto(body);
    if (payload.code && payload.code !== doc.code) {
        const duplicate = await BikeCoupon.findOne({
            code: payload.code,
            _id: { $ne: doc._id },
            ...baseFilter,
        }).select('_id').lean();
        if (duplicate) throw new ValidationError('Coupon code already exists');
    }

    const performer = await resolveActionPerformerSnapshot(reqUser);
    Object.assign(doc, payload);
    doc.approvalStatus = 'pending';
    doc.rejectionReason = '';
    doc.updatedBy = performer;
    doc.approvalHistory.push({ status: 'resubmitted', changedBy: performer });
    await doc.save();

    const { BikeVendor } = await import('../models/bikeVendor.model.js');
    const vendor = await BikeVendor.findById(vendorScope).select('businessName').lean();
    await notifyCouponResubmitted(doc.toObject(), vendor);

    return mapCoupon(doc.toObject());
}

export async function getCouponSummary() {
    const now = new Date();
    const [active, inactive, total, expired] = await Promise.all([
        BikeCoupon.countDocuments({
            ...baseFilter,
            status: 'active',
            validFrom: { $lte: now },
            validTill: { $gte: now },
        }),
        BikeCoupon.countDocuments({ ...baseFilter, status: 'inactive' }),
        BikeCoupon.countDocuments(baseFilter),
        BikeCoupon.countDocuments({
            ...baseFilter,
            status: 'active',
            validTill: { $lt: now },
        }),
    ]);
    const usageAgg = await BikeCoupon.aggregate([
        { $match: { ...baseFilter } },
        {
            $group: {
                _id: null,
                usedCount: { $sum: '$usedCount' },
                totalDiscountGiven: { $sum: '$totalDiscountGiven' },
            },
        },
    ]);
    return {
        active,
        inactive,
        expired,
        total,
        usedCount: Number(usageAgg[0]?.usedCount || 0),
        totalDiscountGiven: Number(usageAgg[0]?.totalDiscountGiven || 0),
    };
}

export async function listCouponUsage(couponId, query = {}) {
    const id = validateCouponId(couponId);
    validateListQuery(query);
    const parsed = parseListQuery(query);
    const filter = { couponId: new mongoose.Types.ObjectId(id) };
    if (query.status && String(query.status) !== 'all') {
        filter.status = String(query.status);
    }

    const [docs, total] = await Promise.all([
        BikeCouponUsage.find(filter)
            .sort({ usedAt: -1 })
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        BikeCouponUsage.countDocuments(filter),
    ]);

    return toBikeRentPagination({
        docs: docs.map(mapUsage),
        total,
        page: parsed.page,
        limit: parsed.limit,
    });
}

/**
 * Consume coupon once when booking payment succeeds (idempotent per booking).
 */
export async function consumeCouponForBooking(booking, { session = null } = {}) {
    const applied = booking?.couponApplied;
    const couponId = applied?.couponId;
    if (!couponId || applied?.consumed) {
        return { consumed: Boolean(applied?.consumed), alreadyProcessed: Boolean(applied?.consumed) };
    }

    const existing = await BikeCouponUsage.findOne({
        bookingId: booking._id,
        status: 'consumed',
    }).session(session || null).lean();
    if (existing) {
        booking.couponApplied = {
            ...(booking.couponApplied?.toObject?.() || booking.couponApplied || {}),
            consumed: true,
            consumedAt: existing.usedAt || new Date(),
        };
        if (typeof booking.markModified === 'function') booking.markModified('couponApplied');
        return { consumed: true, alreadyProcessed: true };
    }

    const coupon = await BikeCoupon.findOne({ _id: couponId, ...baseFilter }).session(session || null);
    if (!coupon) {
        return { consumed: false, alreadyProcessed: false };
    }

    if (Number(coupon.usageLimit || 0) > 0
        && Number(coupon.usedCount || 0) >= Number(coupon.usageLimit)) {
        throw new ValidationError('Coupon usage limit reached');
    }

    if (Number(coupon.perUserLimit || 0) > 0) {
        const usedByUser = await countUserUses(coupon._id, booking.userId);
        if (usedByUser >= Number(coupon.perUserLimit)) {
            throw new ValidationError('You have already used this coupon the maximum number of times');
        }
    }

    const discountAmount = Number(applied.discountAmount || booking.money?.discountAmount || 0);
    await BikeCouponUsage.create([{
        couponId: coupon._id,
        userId: booking.userId,
        bookingId: booking._id,
        couponCode: coupon.code,
        discountAmount,
        rentalDiscount: Number(applied.rentalDiscount || 0),
        depositDiscount: Number(applied.depositDiscount || 0),
        usedAt: new Date(),
        status: 'consumed',
    }], { session: session || undefined });

    coupon.usedCount = Number(coupon.usedCount || 0) + 1;
    coupon.totalDiscountGiven = roundMoney(
        Number(coupon.totalDiscountGiven || 0) + discountAmount,
    );
    await coupon.save(session ? { session } : undefined);

    booking.couponApplied = {
        ...(booking.couponApplied?.toObject?.() || booking.couponApplied || {}),
        consumed: true,
        consumedAt: new Date(),
    };
    if (typeof booking.markModified === 'function') booking.markModified('couponApplied');

    return { consumed: true, alreadyProcessed: false };
}

/**
 * Release consumed coupon when a paid booking is cancelled / rejected / expired after consume.
 */
export async function releaseCouponForBooking(booking, { session = null } = {}) {
    const applied = booking?.couponApplied;
    if (!applied?.couponId || !applied?.consumed) {
        return { released: false };
    }

    const usage = await BikeCouponUsage.findOne({
        bookingId: booking._id,
        status: 'consumed',
    }).session(session || null);
    if (!usage) {
        return { released: false };
    }

    usage.status = 'released';
    usage.releasedAt = new Date();
    await usage.save(session ? { session } : undefined);

    await BikeCoupon.updateOne(
        { _id: applied.couponId, usedCount: { $gt: 0 } },
        {
            $inc: {
                usedCount: -1,
                totalDiscountGiven: -Number(usage.discountAmount || 0),
            },
        },
        session ? { session } : undefined,
    );

    booking.couponApplied = {
        ...(booking.couponApplied?.toObject?.() || booking.couponApplied || {}),
        consumed: false,
        releasedAt: new Date(),
    };
    if (typeof booking.markModified === 'function') booking.markModified('couponApplied');

    return { released: true };
}

export default {
    listCoupons,
    getCouponById,
    createCoupon,
    updateCoupon,
    updateCouponStatus,
    deleteCoupon,
    getCouponSummary,
    listCouponUsage,
    listPublicCoupons,
    validateAndApplyCoupon,
    getCouponIneligibilityReason,
    splitCouponDiscount,
    consumeCouponForBooking,
    releaseCouponForBooking,
    mapCoupon,
    listPendingCoupons,
    approveCoupon,
    rejectCoupon,
    resubmitCoupon,
};
