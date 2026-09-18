import { TaxiCoupon } from '../models/taxiCoupon.model.js';
import { TaxiRide } from '../models/taxiRide.model.js';
import { TaxiZone } from '../models/taxiZone.model.js';
import { GlobalSettings } from '../../../modules/common/models/settings.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import { resolveActionPerformerSnapshot } from '../../../core/utils/performer.js';
import { parseListQuery, buildDateRangeFilter, toTaxiPagination, escapeRegex } from '../utils/pagination.util.js';
import { mapCoupon } from '../utils/mappers.util.js';
import { applyAdminCommission, round2 } from '../utils/fare.util.js';
import {
    validateCreateCouponDto,
    validateUpdateCouponDto,
    validateCouponId,
    validateCouponStatusDto,
    validatePreviewCouponDto,
    validateAvailableCouponsQuery,
} from '../validators/coupon.validator.js';
import { validateListQuery } from '../validators/listQuery.validator.js';
import { applySoftDelete } from '../utils/softDelete.util.js';

const baseFilter = { isDeleted: { $ne: true } };

const CANCELLED = new Set([
    'cancelled_by_rider',
    'cancelled_by_driver',
    'cancelled_by_system',
]);

const buildSort = (sortBy, sortOrder) => {
    const allowed = [
        'code', 'name', 'discountValue', 'usedCount', 'minFare',
        'validFrom', 'validUntil', 'status', 'createdAt',
    ];
    const key = allowed.includes(sortBy) ? sortBy : 'createdAt';
    return { [key]: sortOrder };
};

async function enrichCoupons(docs) {
    const zoneIdSet = new Set();
    const vehicleIdSet = new Set();
    docs.forEach((d) => {
        (d.zoneIds || []).forEach((id) => zoneIdSet.add(String(id)));
        (d.vehicleTypeIds || []).forEach((id) => vehicleIdSet.add(String(id)));
    });

    const [zones, settings] = await Promise.all([
        zoneIdSet.size
            ? TaxiZone.find({ _id: { $in: [...zoneIdSet] } }).select('name').lean()
            : Promise.resolve([]),
        vehicleIdSet.size
            ? GlobalSettings.findOne().lean()
            : Promise.resolve(null),
    ]);

    const zoneMap = new Map(zones.map((z) => [String(z._id), z]));
    const vehicles = settings?.vehicleConfigurations || [];
    const vehicleMap = new Map(vehicles.map((v) => [String(v._id), v]));

    return docs.map((doc) => mapCoupon(
        doc,
        (doc.zoneIds || []).map((id) => zoneMap.get(String(id))).filter(Boolean),
        (doc.vehicleTypeIds || []).map((id) => vehicleMap.get(String(id))).filter(Boolean),
    ));
}

function publicCouponCard(doc, discountAmount = 0, finalTotal = null) {
    const label = doc.discountType === 'percentage'
        ? `${Number(doc.discountValue || 0)}% off`
        : `₹${Number(doc.discountValue || 0)} off`;
    return {
        id: String(doc._id),
        code: doc.code || '',
        name: doc.name || '',
        description: doc.description || '',
        discountType: doc.discountType || 'percentage',
        discountValue: Number(doc.discountValue || 0),
        maxDiscount: Number(doc.maxDiscount || 0),
        minFare: Number(doc.minFare || 0),
        waivePlatformFee: Boolean(doc.waivePlatformFee),
        autoApply: Boolean(doc.autoApply),
        firstRideOnly: Boolean(doc.firstRideOnly) || doc.customerScope === 'first-time',
        label,
        discountAmount: Number(discountAmount || 0),
        finalTotal: finalTotal == null ? null : Number(finalTotal),
        validUntil: doc.validUntil,
    };
}

async function countCompletedRides(userId) {
    if (!userId) return 0;
    return TaxiRide.countDocuments({
        ...baseFilter,
        userId,
        status: 'completed',
    });
}

async function countCouponUsesByUser(userId, code) {
    if (!userId || !code) return 0;
    return TaxiRide.countDocuments({
        ...baseFilter,
        userId,
        'coupon.code': String(code).toUpperCase(),
        status: { $nin: [...CANCELLED] },
    });
}

/**
 * Soft eligibility check — returns reason string when not eligible, else null.
 */
async function getIneligibilityReason(coupon, {
    userId = null,
    fareTotal = 0,
    zoneId = null,
    vehicleTypeId = null,
    requireShowInBooking = false,
} = {}) {
    if (!coupon) return 'Coupon not found';
    if (coupon.isDeleted) return 'Coupon not found';

    const now = Date.now();
    const from = coupon.validFrom ? new Date(coupon.validFrom).getTime() : 0;
    const until = coupon.validUntil ? new Date(coupon.validUntil).getTime() : 0;

    if (coupon.status === 'inactive') return 'This coupon is inactive';
    if (coupon.status === 'expired' || (until && now > until)) return 'This coupon has expired';
    if (coupon.status === 'scheduled' || (from && now < from)) {
        return 'This coupon is not active yet';
    }
    if (coupon.status !== 'active') return 'This coupon is not available';

    if (requireShowInBooking && coupon.showInBooking === false) {
        return 'Coupon not listed for booking';
    }

    if (Number(coupon.usageLimit) > 0 && Number(coupon.usedCount || 0) >= Number(coupon.usageLimit)) {
        return 'Coupon usage limit reached';
    }

    if (Number(fareTotal) < Number(coupon.minFare || 0)) {
        return `Minimum fare ₹${Number(coupon.minFare || 0)} required`;
    }

    const zones = Array.isArray(coupon.zoneIds) ? coupon.zoneIds.map(String) : [];
    if (zones.length && zoneId && !zones.includes(String(zoneId))) {
        return 'Coupon not valid in this zone';
    }

    const vehicles = Array.isArray(coupon.vehicleTypeIds)
        ? coupon.vehicleTypeIds.map(String)
        : [];
    if (vehicles.length && vehicleTypeId && !vehicles.includes(String(vehicleTypeId))) {
        return 'Coupon not valid for this vehicle';
    }

    const firstOnly = Boolean(coupon.firstRideOnly) || coupon.customerScope === 'first-time';
    if (firstOnly && userId) {
        const completed = await countCompletedRides(userId);
        if (completed > 0) return 'First-ride coupon only';
    }

    const perUser = Number(coupon.perUserLimit || 0);
    if (perUser > 0 && userId) {
        const used = await countCouponUsesByUser(userId, coupon.code);
        if (used >= perUser) return 'You have already used this coupon';
    }

    return null;
}

/**
 * Apply coupon math onto a fare object (mutates a copy).
 * Recalculates admin commission / driver share after discount.
 */
export function applyCouponToFare(fare, coupon) {
    const original = { ...(fare || {}) };
    const originalTotal = round2(Number(original.total || 0));
    let next = {
        ...original,
        originalTotal: original.originalTotal > 0 ? original.originalTotal : originalTotal,
        discount: 0,
    };

    let workingTotal = originalTotal;
    let waivedPlatformFee = false;

    if (coupon?.waivePlatformFee && Number(next.platformFee || 0) > 0) {
        const fee = round2(Number(next.platformFee || 0));
        workingTotal = round2(Math.max(0, workingTotal - fee));
        next.platformFee = 0;
        waivedPlatformFee = true;
    }

    let discount = 0;
    if (coupon?.discountType === 'percentage') {
        const pct = Math.max(0, Number(coupon.discountValue || 0));
        discount = round2(workingTotal * (pct / 100));
        const cap = Number(coupon.maxDiscount || 0);
        if (cap > 0) discount = Math.min(discount, cap);
    } else if (coupon) {
        discount = round2(Math.max(0, Number(coupon.discountValue || 0)));
    }
    discount = Math.min(discount, workingTotal);

    next.discount = discount;
    next.total = round2(Math.max(0, workingTotal - discount));
    next = applyAdminCommission(next, original.adminCommissionPercent);

    return {
        fare: next,
        discountAmount: discount,
        waivedPlatformFee,
        originalTotal,
        finalTotal: next.total,
        snapshot: coupon
            ? {
                couponId: coupon._id || coupon.id || null,
                code: String(coupon.code || '').toUpperCase(),
                name: coupon.name || '',
                discountType: coupon.discountType || 'flat',
                discountValue: Number(coupon.discountValue || 0),
                discountAmount: discount,
                waivePlatformFee: waivedPlatformFee || Boolean(coupon.waivePlatformFee),
            }
            : null,
    };
}

/**
 * Resolve + validate a coupon code for the given booking context.
 * Throws ValidationError when invalid.
 */
export async function resolveApplicableCoupon({
    code,
    userId = null,
    fareTotal,
    platformFee = 0,
    zoneId = null,
    vehicleTypeId = null,
}) {
    const normalized = String(code || '').trim().toUpperCase();
    if (!normalized) return null;

    const coupon = await TaxiCoupon.findOne({
        code: normalized,
        ...baseFilter,
    }).lean();

    if (!coupon) throw new ValidationError('Invalid coupon code');

    const reason = await getIneligibilityReason(coupon, {
        userId,
        fareTotal,
        zoneId,
        vehicleTypeId,
    });
    if (reason) throw new ValidationError(reason);

    const fakeFare = {
        total: Number(fareTotal) || 0,
        platformFee: Number(platformFee) || 0,
        adminCommissionPercent: 0,
        subtotal: Number(fareTotal) || 0,
    };
    const applied = applyCouponToFare(fakeFare, coupon);
    if (applied.discountAmount <= 0 && !applied.waivedPlatformFee) {
        throw new ValidationError('Coupon does not reduce this fare');
    }

    return { coupon, ...applied };
}

export async function previewUserCoupon(userId, body = {}) {
    const payload = validatePreviewCouponDto(body);
    const result = await resolveApplicableCoupon({
        code: payload.code,
        userId,
        fareTotal: payload.fareTotal,
        platformFee: payload.platformFee,
        zoneId: payload.zoneId,
        vehicleTypeId: payload.vehicleTypeId,
    });

    return {
        valid: true,
        ...publicCouponCard(result.coupon, result.discountAmount, result.finalTotal),
        originalTotal: result.originalTotal,
        waivedPlatformFee: result.waivedPlatformFee,
    };
}

export async function listAvailableUserCoupons(userId, query = {}) {
    const payload = validateAvailableCouponsQuery(query);
    const now = new Date();

    const docs = await TaxiCoupon.find({
        ...baseFilter,
        status: 'active',
        showInBooking: { $ne: false },
        validFrom: { $lte: now },
        validUntil: { $gte: now },
    })
        .sort({ autoApply: -1, discountValue: -1, createdAt: -1 })
        .limit(40)
        .lean();

    const out = [];
    for (const doc of docs) {
        const fareTotal = payload.fareTotal == null
            ? Number(doc.minFare || 0)
            : payload.fareTotal;
        const reason = await getIneligibilityReason(doc, {
            userId,
            fareTotal,
            zoneId: payload.zoneId,
            vehicleTypeId: payload.vehicleTypeId,
            requireShowInBooking: true,
        });
        if (reason) continue;

        if (payload.fareTotal == null) {
            out.push(publicCouponCard(doc));
            continue;
        }

        const applied = applyCouponToFare(
            {
                total: payload.fareTotal,
                platformFee: payload.platformFee,
                adminCommissionPercent: 0,
                subtotal: payload.fareTotal,
            },
            doc,
        );
        if (applied.discountAmount <= 0 && !applied.waivedPlatformFee) continue;
        out.push(publicCouponCard(doc, applied.discountAmount, applied.finalTotal));
    }

    out.sort((a, b) => Number(b.discountAmount || 0) - Number(a.discountAmount || 0));
    return { coupons: out };
}

/**
 * Apply coupon onto a fully computed ride fare. Returns fare + snapshot.
 */
export async function applyCouponCodeToFare({
    code,
    userId,
    fare,
    zoneId = null,
    vehicleTypeId = null,
}) {
    if (!code) {
        return {
            fare: {
                ...fare,
                originalTotal: round2(Number(fare?.total || 0)),
                discount: 0,
            },
            snapshot: null,
        };
    }

    const result = await resolveApplicableCoupon({
        code,
        userId,
        fareTotal: Number(fare?.total || 0),
        platformFee: Number(fare?.platformFee || 0),
        zoneId,
        vehicleTypeId,
    });

    const applied = applyCouponToFare(fare, result.coupon);
    return {
        fare: applied.fare,
        snapshot: applied.snapshot,
    };
}

export async function recordCouponRedemption(couponId, discountAmount) {
    if (!couponId) return;
    await TaxiCoupon.updateOne(
        { _id: couponId, ...baseFilter },
        {
            $inc: {
                usedCount: 1,
                totalDiscountGiven: round2(Number(discountAmount) || 0),
            },
        },
    );
}

export async function listCoupons(query = {}) {
    validateListQuery(query);
    const parsed = parseListQuery(query);
    const filter = { ...baseFilter };

    if (parsed.status) filter.status = parsed.status;
    if (parsed.discountType) filter.discountType = parsed.discountType;

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

    const sort = buildSort(parsed.sortBy, parsed.sortOrder);

    const [docs, total] = await Promise.all([
        TaxiCoupon.find(filter)
            .sort(sort)
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        TaxiCoupon.countDocuments(filter),
    ]);

    const records = await enrichCoupons(docs);
    return toTaxiPagination({ docs: records, total, page: parsed.page, limit: parsed.limit });
}

export async function getCouponById(id) {
    const couponId = validateCouponId(id);
    const doc = await TaxiCoupon.findOne({ _id: couponId, ...baseFilter }).lean();
    if (!doc) throw new NotFoundError('Coupon not found');
    const [mapped] = await enrichCoupons([doc]);
    return mapped;
}

export async function createCoupon(body, reqUser) {
    const payload = validateCreateCouponDto(body);
    const performer = await resolveActionPerformerSnapshot(reqUser);

    const existing = await TaxiCoupon.findOne({
        code: payload.code,
        isDeleted: { $ne: true },
    }).select('_id').lean();
    if (existing) throw new ValidationError('Coupon code already exists');

    const doc = await TaxiCoupon.create({
        ...payload,
        createdBy: performer,
        updatedBy: performer,
        statusHistory: [{ status: payload.status, changedBy: performer }],
    });

    const [mapped] = await enrichCoupons([doc.toObject()]);
    return mapped;
}

export async function updateCoupon(id, body, reqUser) {
    const couponId = validateCouponId(id);
    const payload = validateUpdateCouponDto(body);
    const doc = await TaxiCoupon.findOne({ _id: couponId, ...baseFilter });
    if (!doc) throw new NotFoundError('Coupon not found');

    if (payload.code && payload.code !== doc.code) {
        const duplicate = await TaxiCoupon.findOne({
            code: payload.code,
            _id: { $ne: doc._id },
            isDeleted: { $ne: true },
        }).select('_id').lean();
        if (duplicate) throw new ValidationError('Coupon code already exists');
    }

    const performer = await resolveActionPerformerSnapshot(reqUser);
    Object.assign(doc, payload);
    doc.updatedBy = performer;
    await doc.save();

    const [mapped] = await enrichCoupons([doc.toObject()]);
    return mapped;
}

export async function updateCouponStatus(id, body, reqUser) {
    const couponId = validateCouponId(id);
    const { status } = validateCouponStatusDto(body);
    const doc = await TaxiCoupon.findOne({ _id: couponId, ...baseFilter });
    if (!doc) throw new NotFoundError('Coupon not found');

    const performer = await resolveActionPerformerSnapshot(reqUser);
    doc.status = status;
    doc.updatedBy = performer;
    doc.statusHistory.push({ status, changedBy: performer });
    await doc.save();

    const [mapped] = await enrichCoupons([doc.toObject()]);
    return mapped;
}

export async function deleteCoupon(id, reqUser) {
    const couponId = validateCouponId(id);
    const doc = await TaxiCoupon.findOne({ _id: couponId, ...baseFilter });
    if (!doc) throw new NotFoundError('Coupon not found');

    const performer = await resolveActionPerformerSnapshot(reqUser);
    applySoftDelete(doc, performer);
    await doc.save();

    return { id: couponId };
}

export async function getCouponSummary() {
    const [active, scheduled, expired, inactive, total, agg] = await Promise.all([
        TaxiCoupon.countDocuments({ ...baseFilter, status: 'active' }),
        TaxiCoupon.countDocuments({ ...baseFilter, status: 'scheduled' }),
        TaxiCoupon.countDocuments({ ...baseFilter, status: 'expired' }),
        TaxiCoupon.countDocuments({ ...baseFilter, status: 'inactive' }),
        TaxiCoupon.countDocuments(baseFilter),
        TaxiCoupon.aggregate([
            { $match: { isDeleted: { $ne: true } } },
            {
                $group: {
                    _id: null,
                    totalRedemption: { $sum: '$usedCount' },
                    totalDiscountGiven: { $sum: '$totalDiscountGiven' },
                },
            },
        ]),
    ]);

    const stats = agg[0] || {};
    return {
        active,
        scheduled,
        expired,
        inactive,
        total,
        totalRedemption: Number(stats.totalRedemption || 0),
        totalDiscountGiven: Number(stats.totalDiscountGiven || 0),
    };
}
