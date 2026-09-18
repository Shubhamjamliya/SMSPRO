import { BikeUnit } from '../models/bikeUnit.model.js';
import { BikeCategory } from '../models/bikeCategory.model.js';
import { BikeRentZone } from '../models/bikeRentZone.model.js';
import { BikeReview } from '../models/bikeReview.model.js';
import { BikeBooking } from '../models/bikeBooking.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import { toBikeRentPagination, escapeRegex, parseListQuery } from '../utils/pagination.util.js';
import { mapBike, mapCategory } from '../utils/mappers.util.js';
import { resolvePrimaryZoneForPoint } from './zone.service.js';
import { validateListQuery } from '../validators/listQuery.validator.js';
import { validateRentalWindow, getBookingDurationLimits } from './bookingValidation.service.js';
import { toFiniteNumber, isPointInPolygon } from '../utils/geo.util.js';
import {
    getTaxSettings,
    computeTaxFromSettings,
    resolvePlatformFeeFromSettings,
} from './taxCalculation.service.js';
import mongoose from 'mongoose';

const browseFilter = {
    isDeleted: { $ne: true },
    isActive: true,
    maintenanceStatus: 'none',
    // Bookable catalog — never list maintenance / disabled inventory.
    availabilityStatus: { $nin: ['maintenance', 'disabled', 'unavailable'] },
    // Vendor-submitted bikes only appear once admin approves them. Docs missing the field
    // (pre-approval-workflow legacy rows) are treated as approved for backward compatibility.
    approvalStatus: { $nin: ['pending', 'rejected'] },
};

const COMPLETED_BOOKING_STATUSES = ['completed', 'deposit_refunded', 'refund_processing'];

async function attachBikeRatings(docs = []) {
    if (!docs.length) return [];
    const bikeIds = docs.map((doc) => doc._id).filter(Boolean);
    if (!bikeIds.length) {
        return docs.map((doc) => ({
            ...mapBike(doc),
            avgRating: 0,
            reviewCount: 0,
            bookingCount: 0,
        }));
    }

    const [ratingAggregates, bookingAggregates] = await Promise.all([
        BikeReview.aggregate([
            {
                $match: {
                    bikeId: { $in: bikeIds },
                    isVisible: { $ne: false },
                },
            },
            {
                $group: {
                    _id: '$bikeId',
                    avgRating: { $avg: '$rating' },
                    reviewCount: { $sum: 1 },
                },
            },
        ]),
        BikeBooking.aggregate([
            {
                $match: {
                    bikeId: { $in: bikeIds },
                    isDeleted: { $ne: true },
                    status: { $in: COMPLETED_BOOKING_STATUSES },
                },
            },
            {
                $group: {
                    _id: '$bikeId',
                    bookingCount: { $sum: 1 },
                },
            },
        ]),
    ]);

    const ratingByBike = new Map(
        ratingAggregates.map((row) => [
            String(row._id),
            {
                avgRating: Math.round(Number(row.avgRating || 0) * 10) / 10,
                reviewCount: Number(row.reviewCount || 0),
            },
        ]),
    );
    const bookingsByBike = new Map(
        bookingAggregates.map((row) => [String(row._id), Number(row.bookingCount || 0)]),
    );

    return docs.map((doc) => {
        const rating = ratingByBike.get(String(doc._id)) || { avgRating: 0, reviewCount: 0 };
        return {
            ...mapBike(doc),
            avgRating: rating.avgRating,
            reviewCount: rating.reviewCount,
            bookingCount: bookingsByBike.get(String(doc._id)) || 0,
        };
    });
}

/**
 * Resolve exactly ONE Bike Rent zone for catalog browsing.
 *
 * Production rules:
 * 1. Explicit `zoneId` (from /zones/detect) wins — never expand to overlapping zones.
 * 2. If only lat/lng: detect the primary (smallest containing) zone — same as detectZone.
 * 3. Outside all zones → empty list (caller shows Out of Service).
 * 4. Never return bikes from another zone.
 */
async function resolveZoneIds({ zoneId, lat, lng }) {
    const latN = toFiniteNumber(lat);
    const lngN = toFiniteNumber(lng);
    const requestedZoneId = zoneId ? String(zoneId).trim() : '';

    if (requestedZoneId) {
        if (!mongoose.Types.ObjectId.isValid(requestedZoneId)) {
            throw new ValidationError('Invalid zone id');
        }
        const zone = await BikeRentZone.findOne({
            _id: requestedZoneId,
            isDeleted: { $ne: true },
            status: 'active',
        }).select('_id coordinates').lean();
        if (!zone) {
            throw new ValidationError('Bike Rent zone not available');
        }

        // If coordinates are also provided, ensure the point still belongs to this zone.
        // Mismatch (stale client zoneId) → re-detect primary zone from lat/lng.
        if (latN !== null && lngN !== null) {
            const coords = Array.isArray(zone.coordinates) ? zone.coordinates : [];
            const stillInside = coords.length >= 3 && isPointInPolygon(latN, lngN, coords);
            if (!stillInside) {
                const resolved = await resolvePrimaryZoneForPoint(latN, lngN);
                return resolved ? [String(resolved.zone._id)] : [];
            }
        }

        return [requestedZoneId];
    }

    if (latN !== null && lngN !== null) {
        // Single primary zone only, matching detectZone's bike-aware selection —
        // never $in across overlapping polygons.
        const resolved = await resolvePrimaryZoneForPoint(latN, lngN);
        return resolved ? [String(resolved.zone._id)] : [];
    }

    throw new ValidationError('zoneId or lat/lng is required');
}

export async function listPublicBikes(query = {}) {
    validateListQuery(query);
    const parsed = parseListQuery(query);
    const zoneIds = await resolveZoneIds({
        zoneId: query.zoneId,
        lat: query.lat,
        lng: query.lng,
    });

    if (!zoneIds.length) {
        return {
            ...toBikeRentPagination({
                docs: [],
                total: 0,
                page: parsed.page,
                limit: parsed.limit,
            }),
            zoneId: null,
        };
    }

    const filter = {
        ...browseFilter,
        // Always a single zone — never $in across overlapping polygons.
        zoneId: new mongoose.Types.ObjectId(String(zoneIds[0])),
    };

    if (query.categoryId && query.categoryId !== 'all') {
        filter.categoryId = query.categoryId;
    }
    if (query.fuelType && query.fuelType !== 'all') {
        filter.fuelType = String(query.fuelType);
    }
    if (query.transmission && query.transmission !== 'all') {
        filter.transmission = String(query.transmission);
    }
    if (query.helmetIncluded === 'true' || query.helmetIncluded === true) {
        filter.helmetIncluded = true;
    }
    // User filter label is Max ₹/hour — match hourlyPrice (not daily).
    if (query.minPrice) filter.hourlyPrice = { ...(filter.hourlyPrice || {}), $gte: Number(query.minPrice) };
    if (query.maxPrice) filter.hourlyPrice = { ...(filter.hourlyPrice || {}), $lte: Number(query.maxPrice) };

    if (parsed.search) {
        const term = escapeRegex(parsed.search);
        filter.$or = [
            { name: { $regex: term, $options: 'i' } },
            { brand: { $regex: term, $options: 'i' } },
            { model: { $regex: term, $options: 'i' } },
            { registrationNumber: { $regex: term, $options: 'i' } },
        ];
    }

    const sortKey = ['hourlyPrice', 'dailyPrice', 'createdAt', 'name'].includes(parsed.sortBy)
        ? parsed.sortBy
        : 'dailyPrice';

    const [docs, total] = await Promise.all([
        BikeUnit.find(filter)
            .populate('categoryId', 'name slug icon')
            .populate('zoneId', 'name country status pickupHub')
            .populate('hubId', 'name address landmark instructions lat lng status zoneId')
            .sort({ [sortKey]: parsed.sortOrder })
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        BikeUnit.countDocuments(filter),
    ]);

    // Single resolved zone for the client response.
    const primaryZoneId = zoneIds[0];
    let mapped = await attachBikeRatings(docs);

    // Defense in depth: never leak bikes from another zone if data is inconsistent.
    mapped = mapped.filter((bike) => {
        const bikeZone = String(bike.zoneId || bike.zone?.id || '');
        return bikeZone === String(primaryZoneId);
    });

    if (query.startAt && query.endAt) {
        const { assertWindowAvailable } = await import('./availability.service.js');
        const annotated = [];
        for (const bike of mapped) {
            const check = await assertWindowAvailable({
                bikeId: bike.id,
                startAt: query.startAt,
                endAt: query.endAt,
                throwOnConflict: false,
                includeAlternates: false,
            });
            annotated.push({
                ...bike,
                isAvailableForWindow: Boolean(check.available),
                nextAvailableAt: check.nextSlot?.startAt || null,
                windowConflictCode: check.code || null,
                windowConflictMessage: check.message || null,
            });
        }
        mapped = annotated;
        if (query.onlyAvailable === 'true' || query.onlyAvailable === true) {
            mapped = mapped.filter((bike) => bike.isAvailableForWindow);
        }
    }

    return {
        ...toBikeRentPagination({
            docs: mapped,
            total: query.startAt && query.endAt && (query.onlyAvailable === 'true' || query.onlyAvailable === true)
                ? mapped.length
                : total,
            page: parsed.page,
            limit: parsed.limit,
        }),
        zoneId: primaryZoneId,
        matchedZoneIds: zoneIds,
    };
}

export async function getPublicBikeById(id, query = {}) {
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError('Invalid bike id');
    }

    const doc = await BikeUnit.findOne({
        _id: id,
        isDeleted: { $ne: true },
        isActive: true,
        approvalStatus: { $nin: ['pending', 'rejected'] },
    })
        .populate('categoryId', 'name slug icon description defaultSecurityDeposit')
        .populate('zoneId', 'name country status pickupHub')
        .populate('hubId', 'name address landmark instructions lat lng status zoneId')
        .lean();

    if (!doc) throw new NotFoundError('Bike not found');

    // Optional zone check when lat/lng or zoneId provided
    if (query.lat || query.lng || query.zoneId) {
        const zoneIds = await resolveZoneIds({
            zoneId: query.zoneId,
            lat: query.lat,
            lng: query.lng,
        });
        const bikeZoneId = String(doc.zoneId?._id || doc.zoneId);
        if (zoneIds.length && !zoneIds.includes(bikeZoneId)) {
            throw new ValidationError('Bike is not available in your Bike Rent zone');
        }
    }

    if (doc.maintenanceStatus === 'maintenance' || doc.availabilityStatus !== 'available') {
        // Still return details but mark not bookable
        const [mapped] = await attachBikeRatings([doc]);
        return { ...mapped, bookable: false };
    }

    const [mapped] = await attachBikeRatings([doc]);
    return { ...mapped, bookable: true };
}

export async function listPublicCategories(query = {}) {
    const docs = await BikeCategory.find({
        isDeleted: { $ne: true },
        status: 'active',
        // Vendor-submitted categories only appear once admin approves them.
        approvalStatus: 'approved',
    })
        .sort({ displayOrder: 1, name: 1 })
        .lean();

    if (!docs.length) return [];

    // When location/zone is known, restrict bike-count matching to that zone.
    const hasZoneContext = Boolean(query.zoneId || query.lat || query.lng);
    const bikeMatch = { ...browseFilter, categoryId: { $ne: null } };
    if (hasZoneContext) {
        let zoneIds = [];
        try {
            zoneIds = await resolveZoneIds({
                zoneId: query.zoneId,
                lat: query.lat,
                lng: query.lng,
            });
        } catch {
            return [];
        }
        if (!zoneIds.length) return [];
        bikeMatch.zoneId = new mongoose.Types.ObjectId(String(zoneIds[0]));
    }

    // A category only shows on the storefront while it has at least one bookable bike.
    const usedCategories = await BikeUnit.aggregate([
        { $match: bikeMatch },
        { $group: { _id: '$categoryId' } },
    ]);
    const usedSet = new Set(usedCategories.map((row) => String(row._id)));

    return docs
        .filter((doc) => usedSet.has(String(doc._id)))
        .map(mapCategory);
}

export function calculateQuote(bike, startAt, endAt, {
    allowPastStart = false,
    minDurationHours,
    maxDurationHours,
    skipDurationLimits = false,
} = {}) {
    const { start, end, durationHours } = validateRentalWindow(startAt, endAt, {
        allowPastStart,
        minDurationHours,
        maxDurationHours,
        skipDurationLimits: skipDurationLimits || allowPastStart,
    });

    const ms = end.getTime() - start.getTime();
    const hours = Math.max(1, Math.ceil(ms / (60 * 60 * 1000)) || durationHours);
    const hourRate = Number(bike.hourlyPrice || 0);
    const dayRate = Number(bike.dailyPrice || 0);
    const configuredWeekRate = Number(bike.weeklyPrice);
    const weekRate = Number.isFinite(configuredWeekRate) && configuredWeekRate > 0
        ? configuredWeekRate
        : dayRate * 7;

    let weeks = 0;
    let days = 0;
    let billedHours = 0;
    let weekAmount = 0;
    let dayAmount = 0;
    let hourAmount = 0;
    let tier = 'hourly';
    let units = hours;
    let rentalFee = 0;

    if (hours < 24) {
        billedHours = hours;
        hourAmount = billedHours * hourRate;
        rentalFee = hourAmount;
        tier = 'hourly';
        units = billedHours;
    } else if (hours < 24 * 7) {
        days = Math.ceil(hours / 24);
        dayAmount = days * dayRate;
        rentalFee = dayAmount;
        tier = 'daily';
        units = days;
    } else {
        weeks = Math.floor(hours / (24 * 7));
        const remainderHours = hours - (weeks * 24 * 7);
        weekAmount = weeks * weekRate;
        rentalFee = weekAmount;
        tier = 'weekly';
        units = weeks;

        if (remainderHours > 0) {
            if (remainderHours < 24) {
                billedHours = remainderHours;
                hourAmount = billedHours * hourRate;
                rentalFee += hourAmount;
                tier = 'weekly_mixed';
            } else {
                days = Math.ceil(remainderHours / 24);
                dayAmount = days * dayRate;
                rentalFee += dayAmount;
                tier = 'weekly_mixed';
            }
        }
    }

    const lines = [];
    if (weeks > 0) {
        lines.push({
            key: 'weekly',
            label: weeks === 1 ? 'Full week (7 days)' : `${weeks} full weeks`,
            units: weeks,
            unitPrice: weekRate,
            amount: Math.round(weekAmount * 100) / 100,
        });
    }
    if (days > 0) {
        lines.push({
            key: 'daily',
            label: days === 1 ? 'Full day (24 hours)' : `${days} full days`,
            units: days,
            unitPrice: dayRate,
            amount: Math.round(dayAmount * 100) / 100,
        });
    }
    if (billedHours > 0) {
        lines.push({
            key: 'hourly',
            label: billedHours === 1 ? '1 hour' : `${billedHours} hours`,
            units: billedHours,
            unitPrice: hourRate,
            amount: Math.round(hourAmount * 100) / 100,
        });
    }

    const securityDepositOriginal = Number(bike.securityDeposit || 0);
    const discountAmount = 0;
    const taxAmount = 0;
    const rentalPayable = Math.max(0, rentalFee + taxAmount - discountAmount);
    const totalPayable = rentalPayable + securityDepositOriginal;

    return {
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        hours,
        tier,
        units,
        rentalFee: Math.round(rentalFee * 100) / 100,
        taxAmount,
        discountAmount,
        securityDeposit: Math.round(securityDepositOriginal * 100) / 100,
        securityDepositOriginal: Math.round(securityDepositOriginal * 100) / 100,
        rentalPayable: Math.round(rentalPayable * 100) / 100,
        /** Grand total if deposit is paid online with the rental. */
        totalPayable: Math.round(totalPayable * 100) / 100,
        /** Payable after approval when deposit is paid at pickup. */
        totalPayableWithoutDeposit: Math.round(rentalPayable * 100) / 100,
        currency: 'INR',
        rates: {
            hourlyPrice: hourRate,
            dailyPrice: dayRate,
            weeklyPrice: weekRate,
        },
        pricingBreakdown: {
            weeks,
            days,
            hours: billedHours,
            weekAmount: Math.round(weekAmount * 100) / 100,
            dayAmount: Math.round(dayAmount * 100) / 100,
            hourAmount: Math.round(hourAmount * 100) / 100,
            lines,
        },
    };
}

export async function quoteBike(body = {}) {
    const bikeId = body.bikeId;
    if (!mongoose.Types.ObjectId.isValid(String(bikeId))) {
        throw new ValidationError('Valid bikeId is required');
    }

    const limits = await getBookingDurationLimits({ bikeId });
    validateRentalWindow(body.startAt, body.endAt, limits);

    const bike = await BikeUnit.findOne({
        _id: bikeId,
        ...browseFilter,
    }).lean();
    if (!bike) throw new NotFoundError('Bike not available for rental');

    if (body.zoneId && String(bike.zoneId) !== String(body.zoneId)) {
        throw new ValidationError('Bike is not available in the selected Bike Rent zone', 'ZONE_MISMATCH');
    }

    const { assertWindowAvailable } = await import('./availability.service.js');
    await assertWindowAvailable({
        bikeId: bike._id,
        startAt: body.startAt,
        endAt: body.endAt,
        throwOnConflict: true,
        includeAlternates: true,
    });

    let quote = calculateQuote(bike, body.startAt, body.endAt, limits);
    let couponApplied = null;
    const couponCode = String(body.couponCode || body.coupon || '').trim();

    if (couponCode) {
        const { validateAndApplyCoupon } = await import('./coupon.service.js');
        const applied = await validateAndApplyCoupon({
            code: couponCode,
            rentalFee: quote.rentalFee,
            securityDeposit: quote.securityDepositOriginal ?? quote.securityDeposit,
            userId: body.userId || null,
            bikeVendorId: bike.vendorId || null,
        });

        const taxAmount = Number(quote.taxAmount || 0);
        const rentalPayable = Math.max(0, applied.finalRentalAmount + taxAmount);
        const securityDeposit = applied.finalDepositAmount;
        const totalPayable = rentalPayable + securityDeposit;

        quote = {
            ...quote,
            discountAmount: applied.discountAmount,
            rentalDiscount: applied.rentalDiscount,
            depositDiscount: applied.depositDiscount,
            securityDeposit,
            rentalPayable: Math.round(rentalPayable * 100) / 100,
            totalPayable: Math.round(totalPayable * 100) / 100,
            totalPayableWithoutDeposit: Math.round(rentalPayable * 100) / 100,
        };

        couponApplied = {
            couponId: applied.couponId,
            couponCode: applied.couponCode,
            name: applied.name,
            description: applied.description,
            discountType: applied.discountType,
            discountValue: applied.discountValue,
            applicableOn: applied.applicableOn,
            discountAmount: applied.discountAmount,
            rentalDiscount: applied.rentalDiscount,
            depositDiscount: applied.depositDiscount,
            finalRentalAmount: applied.finalRentalAmount,
            finalDepositAmount: applied.finalDepositAmount,
            ownerType: applied.ownerType || 'admin',
            vendorId: applied.couponVendorId || null,
        };
    }

    // Platform fee + GST — computed here (not inside calculateQuote, which must stay sync for
    // its other callers) on the discount-adjusted rental amount, mirroring how coupons are
    // layered on above. Extension-quote callers of calculateQuote() never read these fields,
    // so they're unaffected.
    const netRentalAmount = Math.max(0, Number(quote.rentalFee || 0) - Number(quote.discountAmount || 0));
    const taxSettings = await getTaxSettings();
    const platformFeeResolved = resolvePlatformFeeFromSettings(netRentalAmount, taxSettings);
    const customerFacingPlatformFee = platformFeeResolved.payer === 'customer' ? platformFeeResolved.amount : 0;
    const taxResult = computeTaxFromSettings(
        { rentalAmount: netRentalAmount, platformFee: customerFacingPlatformFee },
        taxSettings,
    );
    const rentalPayable = Math.max(0, netRentalAmount + customerFacingPlatformFee + taxResult.gstAmount);
    const totalPayable = rentalPayable + Number(quote.securityDeposit || 0);

    quote = {
        ...quote,
        taxAmount: taxResult.gstAmount,
        gstRate: taxResult.gstRate,
        taxBreakdown: taxResult.breakdown,
        platformFee: platformFeeResolved.amount,
        platformFeePayer: platformFeeResolved.payer,
        rentalPayable: Math.round(rentalPayable * 100) / 100,
        totalPayable: Math.round(totalPayable * 100) / 100,
        totalPayableWithoutDeposit: Math.round(rentalPayable * 100) / 100,
    };

    return {
        bikeId: String(bike._id),
        bike: mapBike(bike),
        quote,
        durationLimits: limits,
        couponApplied,
        paymentRequired: true,
    };
}
