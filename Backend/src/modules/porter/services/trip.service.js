import { PorterTrip } from '../models/porterTrip.model.js';
import { PorterPricing } from '../models/porterPricing.model.js';
import { PorterZone } from '../models/porterZone.model.js';
import { Counter } from '../../../core/models/counter.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import { assertModuleEnabled } from '../../../core/modules/moduleEnabled.service.js';
import { getRoadDistance, haversineKm, isPointInPolygon } from '../../../core/location/location.service.js';
import { parseListQuery, buildDateRangeFilter, toPorterPagination, escapeRegex } from '../utils/pagination.util.js';
import { mapTrip, mapVehicle } from '../utils/mappers.util.js';
import { computeFare, applyAdminCommission, round2 } from '../utils/fare.util.js';
import {
    validateQuoteDto,
    validateCreateTripDto,
    validateTripId,
    validateCancelTripDto,
} from '../validators/trip.validator.js';
import { validateListQuery } from '../validators/listQuery.validator.js';
import { assertTransition } from '../state/tripStateMachine.js';
import { getMappedPorterVehicleOrThrow } from './vehicle.service.js';

const baseFilter = { isDeleted: { $ne: true } };

export { computeFare, generateDeliveryOtp, applyAdminCommission } from '../utils/fare.util.js';

function withCommission(fare, pricingOrPercent) {
    const percent = typeof pricingOrPercent === 'number'
        ? pricingOrPercent
        : Number(pricingOrPercent?.adminCommissionPercent || 0);
    return applyAdminCommission(fare, percent);
}

async function resolveDistance(pickup, drop) {
    try {
        const road = await getRoadDistance(
            { lat: pickup.lat, lng: pickup.lng },
            { lat: drop.lat, lng: drop.lng },
        );
        if (road?.distanceKm != null) {
            return {
                distanceKm: Number(road.distanceKm),
                durationMin: Number(road.durationMinutes || Math.max(1, Math.round(road.distanceKm * 3))),
                source: road.source || 'google_routes',
            };
        }
    } catch {
        /* fall through to haversine */
    }

    const air = haversineKm(pickup.lat, pickup.lng, drop.lat, drop.lng);
    return {
        distanceKm: round2(air),
        durationMin: Math.max(1, Math.round(air * 3)),
        source: 'haversine',
    };
}

/** Same as taxi: both points must be inside an active zone, and the same zone. */
async function resolveAndValidateZone(pickup, drop, payloadZoneId) {
    const activeZones = await PorterZone.find({ status: 'active', isDeleted: { $ne: true } }).lean();

    if (!activeZones?.length) {
        throw new ValidationError('Location is out of service zone');
    }

    let pickupZone = null;
    let dropZone = null;

    for (const zone of activeZones) {
        if (zone.coordinates && zone.coordinates.length >= 3) {
            if (!pickupZone && isPointInPolygon(pickup, zone.coordinates)) pickupZone = zone._id;
            if (!dropZone && isPointInPolygon(drop, zone.coordinates)) dropZone = zone._id;
        }
    }

    if (!pickupZone || !dropZone) {
        throw new ValidationError('Location is out of service zone');
    }

    if (String(pickupZone) !== String(dropZone)) {
        throw new ValidationError('Pickup and drop must be in the same zone');
    }

    return payloadZoneId || pickupZone;
}

async function loadActivePricing(vehicleId, zoneId = null) {
    let pricing = null;
    if (zoneId) {
        pricing = await PorterPricing.findOne({
            vehicleId,
            zoneId,
            status: 'active',
            isDeleted: { $ne: true },
        }).lean();
    }
    if (!pricing) {
        pricing = await PorterPricing.findOne({
            vehicleId,
            zoneId: null,
            status: 'active',
            isDeleted: { $ne: true },
        }).lean();
    }
    if (!pricing) {
        throw new ValidationError('No active pricing configured for this vehicle');
    }
    return pricing;
}

async function nextTripNumber() {
    const counter = await Counter.findOneAndUpdate(
        { model: 'porter_trip' },
        { $inc: { seq: 1 } },
        { upsert: true, new: true },
    );
    const seq = counter?.seq || 1;
    return `PT${String(seq).padStart(6, '0')}`;
}

export async function quoteTrip(body) {
    await assertModuleEnabled('porter');
    const payload = validateQuoteDto(body);

    const { shaped: vehicle } = await getMappedPorterVehicleOrThrow(payload.vehicleId, {
        requireActive: true,
        requireCapacity: true,
    });

    const resolvedZoneId = await resolveAndValidateZone(payload.pickup, payload.drop, payload.zoneId);
    const pricing = await loadActivePricing(payload.vehicleId, resolvedZoneId);
    const route = await resolveDistance(payload.pickup, payload.drop);
    const fare = withCommission(
        computeFare({
            distanceKm: route.distanceKm,
            weightKg: Number(payload.parcel?.weightKg || 0),
            pricing,
        }),
        pricing,
    );

    const zoneId = pricing.zoneId ? String(pricing.zoneId) : String(resolvedZoneId);
    const mappedVehicle = mapVehicle(vehicle, pricing);
    const freeLoadingMinutes = Number(
        pricing.freeLoadingMinutes != null ? pricing.freeLoadingMinutes : 60,
    );
    const extraLoadingPerMinCharge = Number(
        pricing.extraLoadingPerMinCharge != null ? pricing.extraLoadingPerMinCharge : 3,
    );

    return {
        vehicle: mappedVehicle,
        zoneId,
        pickup: payload.pickup,
        drop: payload.drop,
        parcel: payload.parcel,
        distanceKm: route.distanceKm,
        durationMin: route.durationMin,
        distanceSource: route.source,
        fare,
        fareEstimateTotal: fare.total,
        currency: fare.currency,
        freeLoadingMinutes: Math.max(0, freeLoadingMinutes),
        extraLoadingPerMinCharge: Math.max(0, extraLoadingPerMinCharge),
        pricing: {
            freeLoadingMinutes: Math.max(0, freeLoadingMinutes),
            extraLoadingPerMinCharge: Math.max(0, extraLoadingPerMinCharge),
            adminCommissionPercent: Number(pricing.adminCommissionPercent || 0),
        },
    };
}

export async function createTrip(userId, body) {
    await assertModuleEnabled('porter');
    if (!userId) throw new ValidationError('User is required');

    const payload = validateCreateTripDto(body);
    const { shaped: vehicle } = await getMappedPorterVehicleOrThrow(payload.vehicleId, {
        requireActive: true,
        requireCapacity: true,
    });

    if (payload.parcel?.weightKg > 0) {
        const maxW = Number(vehicle.maxWeight || 0);
        if (maxW > 0 && payload.parcel.weightKg > maxW) {
            throw new ValidationError(`Parcel weight exceeds vehicle max (${maxW} kg)`);
        }
    }

    const resolvedZoneId = await resolveAndValidateZone(payload.pickup, payload.drop, payload.zoneId);
    const pricing = await loadActivePricing(payload.vehicleId, resolvedZoneId);
    const route = await resolveDistance(payload.pickup, payload.drop);
    const fare = withCommission(
        computeFare({
            distanceKm: route.distanceKm,
            weightKg: Number(payload.parcel?.weightKg || 0),
            pricing,
        }),
        pricing,
    );

    const tripNumber = await nextTripNumber();
    const paymentMethod = String(payload.paymentMethod || 'cash').toLowerCase();
    const prepaid = ['wallet', 'upi', 'razorpay'].includes(paymentMethod);
    // Cash: search immediately. Wallet/UPI: stay quoted until payment succeeds.
    const initialStatus = prepaid ? 'quoted' : 'searching';
    const freeLoadingMinutes = Math.max(0, Number(pricing.freeLoadingMinutes ?? 60));
    const extraLoadingPerMinCharge = Math.max(0, Number(pricing.extraLoadingPerMinCharge ?? 3));

    const doc = await PorterTrip.create({
        tripNumber,
        userId,
        vehicleId: payload.vehicleId,
        zoneId: pricing.zoneId || resolvedZoneId || null,
        pickup: payload.pickup,
        drop: payload.drop,
        parcel: payload.parcel,
        distanceKm: route.distanceKm,
        durationMin: route.durationMin,
        fare,
        fareEstimateTotal: fare.total,
        freeLoadingMinutes,
        extraLoadingPerMinCharge,
        payment: {
            method: paymentMethod === 'razorpay' ? 'upi' : paymentMethod,
            status: 'pending',
            paymentId: null,
            amountPaid: 0,
            extraDue: 0,
        },
        status: initialStatus,
        dispatch: {
            status: 'unassigned',
            deliveryPartnerId: null,
            offeredTo: [],
            assignedAt: null,
            acceptedAt: null,
            currentAttempt: 0,
            lastAttemptAt: null,
        },
        module: 'porter',
    });

    if (!prepaid) {
        try {
            const { tryAssignTrip } = await import('./tripDispatch.service.js');
            setImmediate(() => {
                tryAssignTrip(String(doc._id)).catch(() => {});
            });
        } catch {
            /* dispatch module may not be ready in isolation */
        }
    }

    return mapTrip(doc.toObject(), { vehicle: mapVehicle(vehicle, pricing) });
}

async function resolveTripDriver(partnerId) {
    if (!partnerId) return null;
    try {
        const { Driver } = await import('../../../core/models/driver.model.js');
        const d = await Driver.findById(partnerId)
            .select('name phone vehicleNumber vehicleType vehicleModel rating profileImage photo lastLat lastLng lastLocationAt')
            .lean();
        if (!d) return null;
        return {
            id: String(d._id),
            name: d.name || 'Partner',
            phone: d.phone || '',
            vehicleNumber: d.vehicleNumber || '',
            vehicleType: d.vehicleType || d.vehicleModel || '',
            vehicleModel: d.vehicleModel || '',
            rating: Number(d.rating || 0),
            photo: d.profileImage || d.photo || '',
            lastLat: d.lastLat ?? null,
            lastLng: d.lastLng ?? null,
            lastLocationAt: d.lastLocationAt || null,
        };
    } catch {
        return null;
    }
}

export async function getTripById(id, {
    userId = null,
    includeOtp = false,
    includeDriver = false,
} = {}) {
    const tripId = validateTripId(id);
    const filter = { _id: tripId, ...baseFilter };
    if (userId) filter.userId = userId;

    const doc = await PorterTrip.findOne(filter).lean();
    if (!doc) throw new NotFoundError('Trip not found');

    let vehicleMapped = null;
    try {
        const { shaped } = await getMappedPorterVehicleOrThrow(doc.vehicleId);
        vehicleMapped = mapVehicle(shaped);
    } catch {
        vehicleMapped = null;
    }

    // Rider needs OTP after partner accepts (until trip starts)
    const riderNeedsOtp =
        Boolean(userId)
        && ['assigned', 'en_route_pickup', 'at_pickup'].includes(doc.status)
        && Boolean(doc.deliveryOtp);
    const showOtp = includeOtp || riderNeedsOtp;
    const riderNeedsDropOtp =
        Boolean(userId)
        && ['at_drop', 'awaiting_payment'].includes(doc.status)
        && Boolean(doc.dropOtp);

    let driver = null;
    if (includeDriver && doc.dispatch?.deliveryPartnerId) {
        driver = await resolveTripDriver(doc.dispatch.deliveryPartnerId);
    }

    let lastDriverLocation = doc.lastDriverLocation || null;
    if (
        (!lastDriverLocation?.lat || !lastDriverLocation?.lng)
        && driver?.lastLat != null
        && driver?.lastLng != null
    ) {
        lastDriverLocation = {
            lat: driver.lastLat,
            lng: driver.lastLng,
            at: driver.lastLocationAt || null,
        };
    }

    return mapTrip(
        { ...doc, lastDriverLocation },
        {
            includeOtp: showOtp,
            includeDropOtp: riderNeedsDropOtp,
            vehicle: vehicleMapped,
            driver,
        },
    );
}

export async function listTripsForUser(userId, query = {}) {
    if (!userId) throw new ValidationError('User is required');
    validateListQuery(query);
    const parsed = parseListQuery(query);
    const filter = { ...baseFilter, userId };

    if (parsed.status) filter.status = parsed.status;

    const [docs, total] = await Promise.all([
        PorterTrip.find(filter)
            .sort({ createdAt: -1 })
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        PorterTrip.countDocuments(filter),
    ]);

    const records = await Promise.all(
        docs.map(async (doc) => {
            let vehicleMapped = null;
            try {
                const { shaped } = await getMappedPorterVehicleOrThrow(doc.vehicleId);
                vehicleMapped = mapVehicle(shaped);
            } catch {
                vehicleMapped = null;
            }
            return mapTrip(doc, { vehicle: vehicleMapped });
        }),
    );
    return toPorterPagination({ docs: records, total, page: parsed.page, limit: parsed.limit });
}

export async function cancelTripByUser(userId, id, body = {}) {
    const tripId = validateTripId(id);
    const { reason } = validateCancelTripDto(body);

    const doc = await PorterTrip.findOne({ _id: tripId, userId, ...baseFilter });
    if (!doc) throw new NotFoundError('Trip not found');

    if (['in_transit', 'at_drop'].includes(doc.status)) {
        throw new ValidationError('Cannot cancel trip after it has started transit');
    }
    if (['completed', 'cancelled_by_user', 'cancelled_by_driver', 'cancelled_by_system'].includes(doc.status)) {
        throw new ValidationError(`Trip is already ${doc.status}`);
    }

    assertTransition(doc.status, 'cancelled_by_user');
    doc.status = 'cancelled_by_user';
    doc.cancelReason = reason;
    doc.cancelledAt = new Date();
    doc.dispatch = doc.dispatch || {};
    doc.dispatch.status = 'cancelled';
    await doc.save();

    if (doc.dispatch?.deliveryPartnerId) {
        try {
            const { clearDriverBusy } = await import('../../../core/dispatch/driverBusyLock.service.js');
            await clearDriverBusy(doc.dispatch.deliveryPartnerId);
        } catch {
            /* ignore */
        }
    }

    return mapTrip(doc.toObject());
}

export async function listTripsAdmin(query = {}) {
    validateListQuery(query);
    const parsed = parseListQuery(query);
    const filter = { ...baseFilter };

    if (parsed.status) filter.status = parsed.status;
    if (parsed.userId) filter.userId = parsed.userId;
    if (parsed.vehicleId) filter.vehicleId = parsed.vehicleId;
    if (parsed.zoneId) filter.zoneId = parsed.zoneId;

    if (parsed.search) {
        const term = escapeRegex(parsed.search);
        filter.$or = [
            { tripNumber: { $regex: term, $options: 'i' } },
            { 'pickup.address': { $regex: term, $options: 'i' } },
            { 'drop.address': { $regex: term, $options: 'i' } },
            { 'parcel.description': { $regex: term, $options: 'i' } },
        ];
    }

    const dateRange = buildDateRangeFilter(parsed.createdFrom, parsed.createdTo);
    if (dateRange) filter.createdAt = dateRange;

    const allowedSort = ['createdAt', 'status', 'fareEstimateTotal', 'completedAt'];
    const sortKey = allowedSort.includes(parsed.sortBy) ? parsed.sortBy : 'createdAt';

    const [docs, total] = await Promise.all([
        PorterTrip.find(filter)
            .sort({ [sortKey]: parsed.sortOrder })
            .skip(parsed.skip)
            .limit(parsed.limit)
            .lean(),
        PorterTrip.countDocuments(filter),
    ]);

    const records = docs.map((doc) => mapTrip(doc));
    return toPorterPagination({ docs: records, total, page: parsed.page, limit: parsed.limit });
}
