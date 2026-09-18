import { PorterTrip } from '../models/porterTrip.model.js';
import { PorterPricing } from '../models/porterPricing.model.js';
import { Driver } from '../../../core/models/driver.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import { getIO, rooms } from '../../../config/socket.js';
import { haversineKm } from '../../../core/location/location.service.js';
import {
    setDriverBusy,
    clearDriverBusy,
    getRedisBusyDriverIds,
} from '../../../core/dispatch/driverBusyLock.service.js';
import { logger } from '../../../utils/logger.js';
import { mapTrip, mapVehicle } from '../utils/mappers.util.js';
import { validateTripId, validateStartTripDto } from '../validators/trip.validator.js';
import { assertTransition } from '../state/tripStateMachine.js';
import { computeFare, applyAdminCommission, generateDeliveryOtp, computeLoadingMinutes, round2 } from '../utils/fare.util.js';
import { getMappedPorterVehicleOrThrow } from './vehicle.service.js';
import { getSearchRadiusKm } from './settings.service.js';

const baseFilter = { isDeleted: { $ne: true } };
const STALE_GPS_MS = 30 * 60 * 1000; // Match taxi: more forgiving GPS freshness
const PORTER_MODULE_KEYS = ['porter', 'parcel'];

const allowedDriverStatuses =
    process.env.NODE_ENV === 'production' ? ['approved'] : ['approved', 'pending'];

/** Porter enrollment vehicle IDs only — never fall back to taxi top-level config. */
export function resolvePorterVehicleConfigIds(driver = {}) {
    const ids = [];
    const push = (raw) => {
        if (raw == null || raw === '') return;
        const id = String(raw);
        if (!ids.includes(id)) ids.push(id);
    };
    push(driver.registeredServices?.porter?.vehicleConfigurationId);
    push(driver.registeredServices?.parcel?.vehicleConfigurationId);
    return ids;
}

/**
 * Resolve the Porter vehicle config id to use for matching.
 * When `allowedIds` is provided, only return an id that is Porter-mapped.
 */
export function resolvePorterVehicleConfigId(driver = {}, { allowedIds } = {}) {
    const ids = resolvePorterVehicleConfigIds(driver);
    if (!ids.length) return null;
    if (allowedIds?.size) {
        return ids.find((id) => allowedIds.has(id)) || null;
    }
    return ids[0];
}

function resolvePorterVehicleName(driver = {}) {
    return String(
        driver.registeredServices?.porter?.vehicleName
        || driver.registeredServices?.parcel?.vehicleName
        || '',
    ).trim().toLowerCase();
}

/**
 * Find nearby porter/parcel-eligible drivers near pickup.
 * Radius comes from admin Porter Settings (fallback 5 km), or maxKm override.
 * Only partners enrolled for Porter with a Porter-mapped vehicle are returned.
 * Partners currently working taxi (or another non-porter module) are excluded.
 */
export async function findNearbyPorterDrivers(pickup, {
    maxKm,
    vehicleTypeId,
    allowedVehicleIds,
} = {}) {
    if (pickup?.lat == null || pickup?.lng == null) return [];

    const radiusKm = Number.isFinite(Number(maxKm))
        ? Number(maxKm)
        : await getSearchRadiusKm();

    const allowedIds = allowedVehicleIds?.size
        ? allowedVehicleIds
        : (Array.isArray(allowedVehicleIds) ? new Set(allowedVehicleIds.map(String)) : null);

    const query = {
        availabilityStatus: 'online',
        authorizedServices: { $in: PORTER_MODULE_KEYS },
        status: { $in: allowedDriverStatuses },
        lastLat: { $ne: null },
        lastLng: { $ne: null },
        // Same pattern as taxi: only partners actively on this module (or unset).
        // Excludes drivers currently online as taxi / food / etc.
        $or: [
            { activeWorkModule: { $in: PORTER_MODULE_KEYS } },
            { activeWorkModule: null },
            { activeWorkModule: { $exists: false } },
            { activeWorkModule: '' },
        ],
    };

    const drivers = await Driver.find(query)
        .select(
            '_id name lastLat lastLng lastLocationAt availabilityStatus status phone vehicleNumber vehicleName vehicleType vehicleModel vehicleConfigurationId registeredServices.porter registeredServices.parcel activeWorkModule',
        )
        .lean();

    if (!drivers.length) return [];

    const busyIds = await getRedisBusyDriverIds(drivers.map((d) => d._id));
    const now = Date.now();
    const wantVehicle = vehicleTypeId ? String(vehicleTypeId) : null;

    return drivers
        .map((d) => {
            const distanceKm = haversineKm(pickup.lat, pickup.lng, d.lastLat, d.lastLng);
            const candidateVehicleIds = resolvePorterVehicleConfigIds(d);
            const vehicleConfigurationId = resolvePorterVehicleConfigId(d, {
                allowedIds: allowedIds || undefined,
            });
            return {
                partnerId: d._id,
                name: d.name || '',
                phone: d.phone || '',
                vehicleNumber: d.vehicleNumber || '',
                vehicleName: resolvePorterVehicleName(d),
                vehicleConfigurationId,
                candidateVehicleIds,
                lastLat: d.lastLat,
                lastLng: d.lastLng,
                distanceKm: Number.isFinite(distanceKm) ? Number(distanceKm.toFixed(2)) : null,
                lastLocationAt: d.lastLocationAt,
            };
        })
        .filter((p) => {
            if (busyIds.has(String(p.partnerId))) return false;
            if (p.distanceKm == null || p.distanceKm > radiusKm) return false;
            if (!p.lastLocationAt || now - new Date(p.lastLocationAt).getTime() > STALE_GPS_MS) {
                return false;
            }
            // Must have a Porter-enrolled vehicle
            if (!p.candidateVehicleIds?.length) return false;
            if (allowedIds?.size) {
                if (!p.vehicleConfigurationId || !allowedIds.has(String(p.vehicleConfigurationId))) {
                    return false;
                }
            } else if (!p.vehicleConfigurationId) {
                return false;
            }
            if (wantVehicle) {
                const matchesWanted =
                    p.vehicleConfigurationId === wantVehicle
                    || (p.candidateVehicleIds || []).includes(wantVehicle);
                if (!matchesWanted) return false;
            }
            return true;
        })
        .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
}

async function buildTripOfferPayload(trip, extras = {}) {
    let vehicle = null;
    try {
        const resolved = await getMappedPorterVehicleOrThrow(trip.vehicleId);
        vehicle = mapVehicle(resolved.shaped);
    } catch {
        vehicle = null;
    }

    return {
        module: 'porter',
        jobType: 'parcel',
        tripId: String(trip._id),
        tripNumber: trip.tripNumber,
        status: trip.status,
        pickup: trip.pickup,
        drop: trip.drop,
        parcel: trip.parcel,
        distanceKm: trip.distanceKm,
        durationMin: trip.durationMin,
        fareEstimateTotal: trip.fareEstimateTotal,
        fare: trip.fare,
        vehicle: vehicle || null,
        paymentMethod: trip.payment?.method || 'cash',
        ...extras,
    };
}

/**
 * Offer trip to nearby drivers via socket `new_parcel_available`.
 * Optional maxKm expands search radius (used by retry cron, same as taxi).
 */
export async function tryAssignTrip(tripId, maxKm = undefined) {
    const id = validateTripId(tripId);
    const trip = await PorterTrip.findOne({
        _id: id,
        ...baseFilter,
        status: { $in: ['quoted', 'searching'] },
        'dispatch.status': 'unassigned',
    });

    if (!trip) {
        logger.info(`[PorterDispatch] tryAssignTrip skip — trip ${id} not searchable`);
        return { offered: 0, partners: [] };
    }

    // Prepaid trips must be paid before offering to drivers
    const method = String(trip.payment?.method || 'cash').toLowerCase();
    const prepaid = ['wallet', 'upi', 'razorpay'].includes(method);
    if (prepaid && trip.payment?.status !== 'paid') {
        logger.info(`[PorterDispatch] tryAssignTrip skip — trip ${id} unpaid prepaid`);
        return { offered: 0, partners: [] };
    }

    const radiusKm = Number.isFinite(Number(maxKm))
        ? Number(maxKm)
        : await getSearchRadiusKm();

    const nearbyPartners = await findNearbyPorterDrivers(trip.pickup, {
        maxKm: radiusKm,
        vehicleTypeId: trip.vehicleId,
        allowedVehicleIds: new Set([String(trip.vehicleId)]),
    });
    const { filterPartnersByMinWallet } = await import('../../../core/wallet/driverMinWallet.service.js');
    const partners = await filterPartnersByMinWallet(nearbyPartners);

    // COD: only offer to partners whose remaining cash limit covers the trip value
    let eligiblePartners = partners;
    if (!prepaid) {
        const orderCash = Number(
            trip.fareEstimateTotal
            ?? trip.fare?.total
            ?? 0,
        );
        const { canOfferPorterCodToDriver } = await import('./cashLimit.service.js');
        const checks = await Promise.all(
            partners.map(async (p) => ({
                partner: p,
                ok: await canOfferPorterCodToDriver(p.partnerId, orderCash).catch(() => false),
            })),
        );
        eligiblePartners = checks.filter((c) => c.ok).map((c) => c.partner);
        if (partners.length && !eligiblePartners.length) {
            logger.info(
                `[PorterDispatch] All ${partners.length} nearby partners blocked by cash limit for COD trip ${id} (need ₹${orderCash})`,
            );
        }
    }

    const now = new Date();
    trip.dispatch = trip.dispatch || {};

    if (!eligiblePartners.length) {
        // Still count the attempt so cron can expand radius / auto-cancel (taxi-like loop)
        trip.dispatch.currentAttempt = (trip.dispatch.currentAttempt || 0) + 1;
        trip.dispatch.lastAttemptAt = now;
        if (trip.status === 'quoted') {
            assertTransition(trip.status, 'searching');
            trip.status = 'searching';
        }
        await trip.save();
        logger.info(
            `[PorterDispatch] No nearby porter drivers for trip ${id} within ${radiusKm} km (attempt ${trip.dispatch.currentAttempt})`,
        );
        return { offered: 0, partners: [], attempt: trip.dispatch.currentAttempt, radiusKm };
    }

    const alreadyOffered = new Set(
        (trip.dispatch?.offeredTo || []).map((o) => String(o.partnerId)),
    );
    const fresh = eligiblePartners.filter((p) => !alreadyOffered.has(String(p.partnerId)));
    const targets = fresh.length ? fresh : eligiblePartners;

    const payload = await buildTripOfferPayload(trip);
    const io = getIO();
    const offerEntries = [];

    for (const p of targets) {
        const roomName = rooms.delivery(p.partnerId);
        if (io) {
            io.to(roomName).emit('new_parcel_available', {
                ...payload,
                pickupDistanceKm: p.distanceKm,
            });
        }
        if (!alreadyOffered.has(String(p.partnerId))) {
            offerEntries.push({
                partnerId: p.partnerId,
                at: now,
                action: 'offered',
            });
        }
    }

    trip.dispatch.currentAttempt = (trip.dispatch.currentAttempt || 0) + 1;
    trip.dispatch.lastAttemptAt = now;
    if (offerEntries.length) {
        trip.dispatch.offeredTo = [...(trip.dispatch.offeredTo || []), ...offerEntries];
    }
    if (trip.status === 'quoted') {
        assertTransition(trip.status, 'searching');
        trip.status = 'searching';
    }
    await trip.save();

    logger.info(
        `[PorterDispatch] tryAssignTrip trip=${id} attempt=${trip.dispatch.currentAttempt} radius=${radiusKm}km offered=${targets.length} fresh=${offerEntries.length}`,
    );

    return {
        offered: targets.length,
        partners: targets.map((p) => String(p.partnerId)),
        attempt: trip.dispatch.currentAttempt,
        radiusKm,
    };
}

/**
 * Atomic first-accept wins.
 */
export async function acceptTrip(driverId, tripId) {
    if (!driverId) throw new ValidationError('Driver is required');
    const { assertDriverCanReceiveOrders } = await import('../../../core/wallet/driverMinWallet.service.js');
    await assertDriverCanReceiveOrders(driverId);
    const id = validateTripId(tripId);

    const preview = await PorterTrip.findOne({ _id: id, ...baseFilter })
        .select('payment fare fareEstimateTotal status dispatch')
        .lean();
    if (!preview) throw new NotFoundError('Trip not found');

    const method = String(preview.payment?.method || 'cash').toLowerCase();
    const prepaid = ['wallet', 'upi', 'razorpay'].includes(method);
    if (!prepaid) {
        const orderCash = Number(
            preview.fareEstimateTotal
            ?? preview.fare?.total
            ?? 0,
        );
        const { canOfferPorterCodToDriver } = await import('./cashLimit.service.js');
        const ok = await canOfferPorterCodToDriver(driverId, orderCash);
        if (!ok) {
            throw new ValidationError(
                `Cash limit too low for this COD trip (needs ₹${Math.round(orderCash)}). Deposit cash or switch payment method.`,
            );
        }
    }

    const now = new Date();
    const otp = generateDeliveryOtp();

    const trip = await PorterTrip.findOneAndUpdate(
        {
            _id: id,
            isDeleted: { $ne: true },
            status: { $in: ['quoted', 'searching', 'assigned'] },
            'dispatch.status': { $in: ['unassigned', 'assigned'] },
            $or: [
                { 'dispatch.deliveryPartnerId': null },
                { 'dispatch.deliveryPartnerId': { $exists: false } },
                { 'dispatch.deliveryPartnerId': driverId },
            ],
        },
        {
            $set: {
                status: 'en_route_pickup',
                deliveryOtp: otp,
                assignedAt: now,
                'dispatch.status': 'accepted',
                'dispatch.deliveryPartnerId': driverId,
                'dispatch.assignedAt': now,
                'dispatch.acceptedAt': now,
            },
            $push: {
                'dispatch.offeredTo': {
                    partnerId: driverId,
                    at: now,
                    action: 'accepted',
                },
            },
        },
        { new: true },
    );

    if (!trip) {
        const existing = await PorterTrip.findOne({ _id: id, ...baseFilter })
            .select('status dispatch')
            .lean();
        if (!existing) throw new NotFoundError('Trip not found');
        if (existing.dispatch?.deliveryPartnerId
            && String(existing.dispatch.deliveryPartnerId) !== String(driverId)) {
            throw new ValidationError('Trip already accepted by another driver');
        }
        throw new ValidationError(`Trip cannot be accepted in status ${existing.status}`);
    }

    await setDriverBusy(driverId);

    const io = getIO();
    if (io) {
        const payload = {
            module: 'porter',
            jobType: 'parcel',
            tripId: String(trip._id),
            tripNumber: trip.tripNumber,
            status: trip.status,
            driverId: String(driverId),
        };
        if (trip.userId) {
            io.to(rooms.user(trip.userId)).emit('parcel_accepted', payload);
            io.to(rooms.user(trip.userId)).emit('parcel_status_update', payload);
        }
        const offeredIds = (trip.dispatch?.offeredTo || [])
            .map((o) => String(o.partnerId))
            .filter((pid) => pid && pid !== String(driverId));
        for (const pid of [...new Set(offeredIds)]) {
            io.to(rooms.delivery(pid)).emit('parcel_claimed', payload);
        }
    }

    return mapTrip(trip.toObject(), { includeOtp: true });
}

export async function markArrived(driverId, tripId) {
    if (!driverId) throw new ValidationError('Driver is required');
    const id = validateTripId(tripId);

    const trip = await PorterTrip.findOne({
        _id: id,
        ...baseFilter,
        'dispatch.deliveryPartnerId': driverId,
    });
    if (!trip) throw new NotFoundError('Trip not found');

    assertTransition(trip.status, 'at_pickup');
    trip.status = 'at_pickup';
    trip.arrivedAt = new Date();
    await trip.save();

    const io = getIO();
    if (io && trip.userId) {
        const payload = {
            module: 'porter',
            jobType: 'parcel',
            tripId: String(trip._id),
            status: 'at_pickup',
        };
        io.to(rooms.user(trip.userId)).emit('parcel_status_update', payload);
        io.to(rooms.user(trip.userId)).emit('driver_arrived', payload);
    }

    return mapTrip(trip.toObject(), { includeOtp: true });
}

export async function startTrip(driverId, tripId, body = {}) {
    if (!driverId) throw new ValidationError('Driver is required');
    const id = validateTripId(tripId);
    const { otp } = validateStartTripDto(body);

    const trip = await PorterTrip.findOne({
        _id: id,
        ...baseFilter,
        'dispatch.deliveryPartnerId': driverId,
    });
    if (!trip) throw new NotFoundError('Trip not found');

    if (String(trip.deliveryOtp || '') !== otp) {
        throw new ValidationError('Invalid delivery OTP');
    }

    // OTP verified → loading phase (timer starts). Transit starts after markLoaded.
    assertTransition(trip.status, 'loading');
    const now = new Date();
    trip.status = 'loading';
    trip.loadingStartedAt = now;
    trip.startedAt = now;
    await trip.save();

    const io = getIO();
    if (io && trip.userId) {
        const payload = {
            module: 'porter',
            jobType: 'parcel',
            tripId: String(trip._id),
            status: 'loading',
            loadingStartedAt: trip.loadingStartedAt,
            freeLoadingMinutes: Number(trip.freeLoadingMinutes ?? 60),
            extraLoadingPerMinCharge: Number(trip.extraLoadingPerMinCharge ?? 3),
        };
        io.to(rooms.user(trip.userId)).emit('parcel_status_update', payload);
        io.to(rooms.user(trip.userId)).emit('parcel_loading', payload);
    }

    return mapTrip(trip.toObject(), { includeOtp: false });
}

async function loadTripPricing(trip) {
    let pricing = null;
    if (trip.zoneId) {
        pricing = await PorterPricing.findOne({
            vehicleId: trip.vehicleId,
            zoneId: trip.zoneId,
            isDeleted: { $ne: true },
        }).lean();
    }
    if (!pricing) {
        pricing = await PorterPricing.findOne({
            vehicleId: trip.vehicleId,
            zoneId: null,
            isDeleted: { $ne: true },
        }).lean();
    }
    return pricing;
}

/**
 * Driver confirms parcel finished loading → in_transit + lock loading minutes.
 */
export async function markLoaded(driverId, tripId) {
    if (!driverId) throw new ValidationError('Driver is required');
    const id = validateTripId(tripId);

    const trip = await PorterTrip.findOne({
        _id: id,
        ...baseFilter,
        'dispatch.deliveryPartnerId': driverId,
    });
    if (!trip) throw new NotFoundError('Trip not found');

    assertTransition(trip.status, 'in_transit');

    const now = new Date();
    const loadingStartedAt = trip.loadingStartedAt || trip.startedAt || now;
    const loadingMin = computeLoadingMinutes(loadingStartedAt, now);
    const freeLoad = Math.max(0, Number(trip.freeLoadingMinutes ?? 60));
    const loadRate = Math.max(0, Number(trip.extraLoadingPerMinCharge ?? 3));
    const billableLoadingMin = Math.max(0, loadingMin - freeLoad);

    trip.status = 'in_transit';
    trip.loadedAt = now;
    trip.loadingStartedAt = loadingStartedAt;
    trip.loadingMin = loadingMin;
    trip.billableLoadingMin = billableLoadingMin;

    // Keep fare preview with loading overtime so both sides can see running extras
    const pricing = await loadTripPricing(trip);
    const lockedPercent = Number(
        trip.fare?.adminCommissionPercent ?? pricing?.adminCommissionPercent ?? 0,
    );
    if (pricing) {
        trip.fare = applyAdminCommission(
            computeFare({
                distanceKm: trip.distanceKm,
                weightKg: trip.parcel?.weightKg || 0,
                loadingMin,
                freeLoadingMinutes: freeLoad,
                extraLoadingPerMinCharge: loadRate,
                pricing,
            }),
            lockedPercent,
        );
    } else {
        const prev = trip.fare?.toObject?.() || trip.fare || {};
        const waiting = round2(billableLoadingMin * loadRate);
        const baseParts = Number(prev.base || 0)
            + Number(prev.distance || 0)
            + Number(prev.weight || 0)
            + waiting;
        const platformFee = Number(prev.platformFee || 0);
        trip.fare = applyAdminCommission(
            {
                ...prev,
                waiting,
                loadingMin,
                billableLoadingMin,
                freeLoadingMinutes: freeLoad,
                extraLoadingPerMinCharge: loadRate,
                subtotal: round2(baseParts),
                total: round2(baseParts + platformFee),
                platformFee,
            },
            lockedPercent,
        );
    }

    await trip.save();

    const io = getIO();
    if (io && trip.userId) {
        const payload = {
            module: 'porter',
            jobType: 'parcel',
            tripId: String(trip._id),
            status: 'in_transit',
            loadingMin,
            billableLoadingMin,
            fare: trip.fare,
        };
        io.to(rooms.user(trip.userId)).emit('parcel_status_update', payload);
        io.to(rooms.user(trip.userId)).emit('parcel_loaded', payload);
    }

    return mapTrip(trip.toObject());
}

/**
 * Partner trip history (completed / cancelled / awaiting payment) — used by DeliveryV2 History.
 */
export async function listPartnerTrips(driverId, query = {}) {
    if (!driverId) throw new ValidationError('Driver is required');
    const limit = Math.min(100, Math.max(1, Number(query.limit || 50)));
    const docs = await PorterTrip.find({
        ...baseFilter,
        'dispatch.deliveryPartnerId': driverId,
        status: {
            $in: [
                'completed',
                'awaiting_payment',
                'cancelled_by_user',
                'cancelled_by_driver',
                'cancelled_by_system',
            ],
        },
    })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .lean();

    return docs.map((d) => mapTrip(d));
}

const PARTNER_ACTIVE_STATUSES = [
    'assigned',
    'en_route_pickup',
    'at_pickup',
    'loading',
    'in_transit',
    'at_drop',
    'awaiting_payment',
];

/**
 * Active Porter trip for the signed-in delivery partner (hydrate / resume after refresh).
 */
export async function getActiveTripForPartner(driverId) {
    if (!driverId) throw new ValidationError('Driver is required');

    const partnerId = String(driverId);
    const trip = await PorterTrip.findOne({
        ...baseFilter,
        'dispatch.deliveryPartnerId': partnerId,
        status: { $in: PARTNER_ACTIVE_STATUSES },
    })
        .sort({ updatedAt: -1 })
        .lean();

    if (!trip) return null;

    let vehicle = null;
    try {
        const resolved = await getMappedPorterVehicleOrThrow(trip.vehicleId);
        vehicle = mapVehicle(resolved.shaped);
    } catch {
        vehicle = null;
    }

    let rider = null;
    try {
        const mongoose = (await import('mongoose')).default;
        const User = mongoose.models.FoodUser || mongoose.models.User;
        if (User && trip.userId) {
            const u = await User.findById(trip.userId).select('name phone').lean();
            if (u) {
                rider = {
                    id: String(u._id),
                    name: u.name || 'Customer',
                    phone: u.phone || '',
                };
            }
        }
    } catch {
        /* ignore */
    }

    const includeOtp = ['en_route_pickup', 'at_pickup', 'assigned'].includes(trip.status);
    const mapped = mapTrip(trip, { includeOtp, vehicle });
    return {
        ...mapped,
        rider,
        userName: rider?.name || null,
        userPhone: rider?.phone || null,
    };
}

function resolvePaidAmount(trip) {
    const method = String(trip.payment?.method || 'cash').toLowerCase();
    const prepaid = ['wallet', 'upi', 'razorpay'].includes(method);
    if (!prepaid) return 0;
    if (Number(trip.payment?.amountPaid) > 0) return Number(trip.payment.amountPaid);
    if (trip.payment?.status === 'paid') {
        return Number(trip.fareEstimateTotal || trip.fare?.total || 0);
    }
    return 0;
}

function finalizeTripFare(trip, pricing, { distanceKm, durationMin, loadingMin } = {}) {
    const freeLoad = Math.max(0, Number(trip.freeLoadingMinutes ?? pricing?.freeLoadingMinutes ?? 60));
    const loadRate = Math.max(0, Number(trip.extraLoadingPerMinCharge ?? pricing?.extraLoadingPerMinCharge ?? 3));
    const lockedLoading = Number(
        loadingMin != null
            ? loadingMin
            : (trip.loadingMin || 0),
    );
    const lockedPercent = Number(
        trip.fare?.adminCommissionPercent ?? pricing?.adminCommissionPercent ?? 0,
    );

    const rawFare = pricing
        ? computeFare({
            distanceKm,
            weightKg: trip.parcel?.weightKg || 0,
            loadingMin: lockedLoading,
            freeLoadingMinutes: freeLoad,
            extraLoadingPerMinCharge: loadRate,
            pricing,
        })
        : {
            ...(trip.fare?.toObject?.() || trip.fare || {}),
            total: trip.fareEstimateTotal || trip.fare?.total || 0,
            waiting: Number(trip.fare?.waiting || 0),
            loadingMin: lockedLoading,
            billableLoadingMin: Math.max(0, lockedLoading - freeLoad),
            freeLoadingMinutes: freeLoad,
            extraLoadingPerMinCharge: loadRate,
        };

    const fare = applyAdminCommission(rawFare, lockedPercent);

    const paidAmount = resolvePaidAmount(trip);
    const method = String(trip.payment?.method || 'cash').toLowerCase();
    const prepaid = ['wallet', 'upi', 'razorpay'].includes(method);
    // Prepaid: only overtime still owed. COD: full fare still owed until collected.
    const amountDue = prepaid
        ? round2(Math.max(0, Number(fare.total || 0) - paidAmount))
        : (String(trip.payment?.status || '') === 'paid'
            ? 0
            : round2(Math.max(0, Number(fare.total || 0))));

    return {
        fare,
        paidAmount,
        extraDue: amountDue,
        amountDue,
        prepaid,
        freeLoad,
        loadRate,
        lockedLoading,
    };
}

export async function completeTrip(driverId, tripId, body = {}) {
    if (!driverId) throw new ValidationError('Driver is required');
    const id = validateTripId(tripId);

    const trip = await PorterTrip.findOne({
        _id: id,
        ...baseFilter,
        'dispatch.deliveryPartnerId': driverId,
    });
    if (!trip) throw new NotFoundError('Trip not found');

    if (trip.status === 'completed') {
        return mapTrip(trip.toObject());
    }

    if (!['awaiting_payment', 'at_drop'].includes(trip.status)) {
        throw new ValidationError(`Trip cannot be completed in status ${trip.status}`);
    }

    const otp = String(body.otp || body.dropOtp || '').trim();
    if (!/^\d{6}$/.test(otp) || String(trip.dropOtp || '') !== otp) {
        throw new ValidationError('Invalid drop OTP');
    }

    const due = Number(trip.payment?.extraDue || 0);
    if (due > 0.009) {
        throw new ValidationError(
            `₹${due} is still pending. Collect cash/QR or wait for customer payment.`,
        );
    }

    assertTransition(trip.status, 'completed');
    trip.status = 'completed';
    trip.completedAt = new Date();
    if (!trip.payment) trip.payment = {};
    trip.payment.extraDue = 0;
    if (trip.payment.status !== 'paid') {
        trip.payment.status = 'paid';
        trip.payment.paidAt = new Date();
    }
    await trip.save();

    await clearDriverBusy(driverId);
    await creditPorterDriverEarnings(trip, driverId);
    emitPorterCompleted(trip, driverId);

    return mapTrip(trip.toObject());
}

async function creditPorterDriverEarnings(trip, driverId) {
    try {
        if (trip.earningsCreditedAt) return;

        const { creditWallet } = await import('../../../core/payments/wallet.service.js');
        const fare = trip.fare?.toObject?.() || trip.fare || {};
        // Prefer locked driverShare (after platform fee + vehicle commission %). Fallback for legacy trips.
        const driverShare = Math.max(
            0,
            Number(
                fare.driverShare
                ?? (Number(fare.total || 0) - Number(fare.platformFee || 0)),
            ),
        );
        if (driverShare > 0) {
            await creditWallet({
                entityType: 'deliveryBoy',
                entityId: driverId,
                amount: driverShare,
                description: `Porter trip ${trip.tripNumber} earnings`,
                category: 'delivery_earning',
                orderId: String(trip._id),
                metadata: {
                    module: 'porter',
                    tripId: String(trip._id),
                    tripNumber: trip.tripNumber,
                    platformFee: Number(fare.platformFee || 0),
                    adminCommissionPercent: Number(fare.adminCommissionPercent || 0),
                    adminCommissionAmount: Number(fare.adminCommissionAmount || 0),
                    driverShare,
                    fareTotal: Number(fare.total || 0),
                },
            });
        }

        trip.earningsCreditedAt = new Date();
        await trip.save();
    } catch (err) {
        logger.warn(`[PorterDispatch] wallet credit failed: ${err?.message || err}`);
    }
}

function emitPorterCompleted(trip, driverId) {
    const io = getIO();
    if (!io) return;
    const payload = {
        module: 'porter',
        jobType: 'parcel',
        tripId: String(trip._id),
        status: 'completed',
        fare: trip.fare,
        payment: trip.payment,
    };
    if (trip.userId) {
        io.to(rooms.user(trip.userId)).emit('parcel_status_update', payload);
        io.to(rooms.user(trip.userId)).emit('parcel_completed', payload);
    }
    if (driverId) {
        io.to(rooms.delivery(driverId)).emit('parcel_completed', payload);
    }
}

/**
 * Partner reached drop → finalize fare + drop OTP → awaiting_payment (taxi-like).
 * COD: amountDue = full fare. Prepaid: amountDue = loading overtime only.
 */
export async function markAtDrop(driverId, tripId, body = {}) {
    if (!driverId) throw new ValidationError('Driver is required');
    const id = validateTripId(tripId);
    const trip = await PorterTrip.findOne({
        _id: id,
        ...baseFilter,
        'dispatch.deliveryPartnerId': driverId,
    });
    if (!trip) throw new NotFoundError('Trip not found');

    if (!['in_transit', 'at_drop', 'awaiting_payment'].includes(trip.status)) {
        throw new ValidationError(`Cannot mark at drop in status ${trip.status}`);
    }

    const distanceKm = Number(body.distanceKm ?? trip.distanceKm ?? 0);
    const durationMin = Number(
        body.durationMin
        ?? (trip.loadedAt || trip.startedAt
            ? Math.max(
                1,
                Math.round(
                    (Date.now() - new Date(trip.loadedAt || trip.startedAt).getTime()) / 60000,
                ),
            )
            : trip.durationMin || 0),
    );

    const pricing = await loadTripPricing(trip);
    const { fare, paidAmount, amountDue, prepaid } = finalizeTripFare(trip, pricing, {
        distanceKm,
        durationMin,
        loadingMin: trip.loadingMin,
    });

    trip.distanceKm = distanceKm;
    trip.durationMin = durationMin;
    trip.fare = fare;
    trip.billableLoadingMin = Number(fare.billableLoadingMin || trip.billableLoadingMin || 0);
    if (!trip.payment) trip.payment = {};
    trip.payment.amountPaid = paidAmount;
    trip.payment.extraDue = amountDue;

    if (!trip.dropOtp) {
        trip.dropOtp = generateDeliveryOtp();
    }

    if (trip.status !== 'awaiting_payment') {
        assertTransition(trip.status, 'awaiting_payment');
        trip.status = 'awaiting_payment';
    }

    // Any remaining balance (COD full fare or prepaid overtime) stays pending
    if (amountDue > 0.009) {
        trip.payment.status = 'pending';
    } else if (prepaid || String(trip.payment.status || '') === 'paid') {
        trip.payment.status = 'paid';
    }

    await trip.save();

    const io = getIO();
    if (io) {
        const payload = {
            module: 'porter',
            jobType: 'parcel',
            tripId: String(trip._id),
            status: 'awaiting_payment',
            fare,
            extraDue: amountDue,
            payment: trip.payment,
            prepaid,
        };
        if (trip.userId) {
            io.to(rooms.user(trip.userId)).emit('parcel_status_update', payload);
            io.to(rooms.user(trip.userId)).emit('parcel_awaiting_payment', payload);
        }
        io.to(rooms.delivery(driverId)).emit('parcel_awaiting_payment', payload);
    }

    return mapTrip(trip.toObject());
}

/** Used by payment collect after OTP — completes trip once dues are cleared. */
export async function finalizePartnerTripAfterPayment(trip, driverId) {
    assertTransition(trip.status, 'completed');
    trip.status = 'completed';
    trip.completedAt = new Date();
    trip.payment = trip.payment || {};
    trip.payment.extraDue = 0;
    trip.payment.status = 'paid';
    trip.payment.paidAt = trip.payment.paidAt || new Date();
    await trip.save();
    await clearDriverBusy(driverId);
    await creditPorterDriverEarnings(trip, driverId);
    emitPorterCompleted(trip, driverId);
    return mapTrip(trip.toObject());
}
