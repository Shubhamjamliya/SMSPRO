import { TaxiRide } from '../models/taxiRide.model.js';
import { GlobalSettings } from '../../../modules/common/models/settings.model.js';
import { TaxiRideEvent } from '../models/taxiRideEvent.model.js';
import { TaxiPricing } from '../models/taxiPricing.model.js';
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
import { resolveDeliveryDistanceKm } from '../../food/orders/services/order.service.js';
import { mapRide, mapVehicleType } from '../utils/mappers.util.js';
import { validateRideId, validateStartRideDto } from '../validators/ride.validator.js';
import { assertTransition } from '../state/rideStateMachine.js';
import { computeFare, generateRideOtp, computePickupWaitingMinutes } from '../utils/fare.util.js';
import { getSearchRadiusKm } from './settings.service.js';
import { notifyOwnersSafely } from '../../../core/notifications/firebase.service.js';
import { newEventId } from '../../../core/notifications/orderEvents.service.js';

const baseFilter = { isDeleted: { $ne: true } };
const STALE_GPS_MS = 30 * 60 * 1000; // Increased to 30 mins to be more forgiving
/** Must match NewOrderModal OFFER_SECONDS / rideDispatch cron DRIVER_OFFER_SECONDS */
const DRIVER_OFFER_SECONDS = 30;

async function loadRiderBrief(userId) {
    if (!userId) return null;
    try {
        const mongoose = (await import('mongoose')).default;
        const User = mongoose.models.FoodUser || mongoose.models.User;
        if (!User) return null;
        const u = await User.findById(userId).select('name phone').lean();
        if (!u) return null;
        return {
            id: String(u._id),
            name: u.name || 'Rider',
            phone: u.phone || '',
        };
    } catch {
        return null;
    }
}

async function mapPartnerRide(rideDoc, extras = {}) {
    const plain = rideDoc?.toObject ? rideDoc.toObject() : rideDoc;
    if (!plain) return null;
    const rider = extras.rider || (await loadRiderBrief(plain.userId));
    return mapRide(plain, { ...extras, rider });
}

const allowedDriverStatuses =
    process.env.NODE_ENV === 'production' ? ['approved'] : ['approved', 'pending'];

/**
 * Resolve taxi vehicleConfigurationId from root or registeredServices.taxi.
 */
function resolveTaxiVehicleConfigId(driver = {}) {
    const root = driver.vehicleConfigurationId
        ? String(driver.vehicleConfigurationId)
        : '';
    const nested = driver.registeredServices?.taxi?.vehicleConfigurationId
        ? String(driver.registeredServices.taxi.vehicleConfigurationId)
        : '';
    return nested || root || '';
}

/**
 * Find nearby taxi-eligible drivers near pickup.
 * Radius comes from admin Taxi Settings (fallback 8 km).
 * Haversine gates radius; optional road distance is used for sorting only.
 */
export async function findNearbyTaxiDrivers(pickup, vehicleTypeId, { maxKm } = {}) {
    if (pickup?.lat == null || pickup?.lng == null) return [];

    const radiusKm = Number.isFinite(Number(maxKm))
        ? Number(maxKm)
        : await getSearchRadiusKm();

    const wantVehicle = vehicleTypeId ? String(vehicleTypeId) : null;

    const query = {
        availabilityStatus: 'online',
        authorizedServices: 'taxi',
        status: { $in: allowedDriverStatuses },
        lastLat: { $ne: null },
        lastLng: { $ne: null },
        $or: [
            { activeWorkModule: 'taxi' },
            { activeWorkModule: null },
            { activeWorkModule: { $exists: false } },
        ],
    };

    const drivers = await Driver.find(query)
        .select(
            '_id name lastLat lastLng lastLocationAt availabilityStatus status phone vehicleNumber vehicleConfigurationId registeredServices.taxi',
        )
        .lean();

    if (!drivers.length) return [];

    const busyIds = await getRedisBusyDriverIds(drivers.map((d) => d._id));
    const now = Date.now();

    const candidates = drivers
        .map((d) => {
            const distanceKm = haversineKm(pickup.lat, pickup.lng, d.lastLat, d.lastLng);
            const vehicleConfigurationId = resolveTaxiVehicleConfigId(d);
            return {
                partnerId: d._id,
                name: d.name || '',
                phone: d.phone || '',
                vehicleNumber: d.vehicleNumber || '',
                vehicleConfigurationId,
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
            if (wantVehicle && p.vehicleConfigurationId !== wantVehicle) return false;
            return true;
        });

    // Road distance improves sort order only — do not hard-cut (roads often > straight-line)
    const enhancedCandidates = await Promise.all(
        candidates.map(async (c) => {
            try {
                const roadDistance = await resolveDeliveryDistanceKm(
                    { lat: pickup.lat, lng: pickup.lng },
                    { lat: c.lastLat, lng: c.lastLng },
                );
                if (roadDistance != null && roadDistance > 0) {
                    c.sortKm = Number(roadDistance.toFixed(2));
                } else {
                    c.sortKm = c.distanceKm;
                }
            } catch {
                c.sortKm = c.distanceKm;
            }
            return c;
        }),
    );

    return enhancedCandidates.sort((a, b) => (a.sortKm ?? 999) - (b.sortKm ?? 999));
}

async function buildRideOfferPayload(ride, extras = {}) {
    const settings = await GlobalSettings.findOne().lean();
    const vehicleType = settings?.vehicleConfigurations?.find(
        (v) => String(v._id) === String(ride.vehicleTypeId),
    );

    return {
        module: 'taxi',
        jobType: 'ride',
        rideId: String(ride._id),
        rideNumber: ride.rideNumber,
        status: ride.status,
        pickup: ride.pickup,
        drop: ride.drop,
        distanceKm: ride.distanceKm,
        durationMin: ride.durationMin,
        fareEstimateTotal: ride.fareEstimateTotal,
        fare: ride.fare,
        vehicleType: vehicleType ? mapVehicleType(vehicleType) : null,
        paymentMethod: ride.payment?.method || 'cash',
        ...extras,
    };
}

/**
 * Offer ride to nearby drivers via socket `new_ride_available`.
 * Retries (cron) pass an expanded maxKm and re-ping all eligible drivers.
 */
export async function tryAssignRide(rideId, maxKm = undefined) {
    const id = validateRideId(rideId);
    const ride = await TaxiRide.findOne({
        _id: id,
        ...baseFilter,
        status: { $in: ['requested', 'searching'] },
        'dispatch.status': 'unassigned',
    });

    if (!ride) {
        logger.info(`[TaxiDispatch] tryAssignRide skip — ride ${id} not searchable`);
        return { offered: 0, partners: [] };
    }

    const radiusKm = Number.isFinite(Number(maxKm))
        ? Number(maxKm)
        : await getSearchRadiusKm();

    const nearbyPartners = await findNearbyTaxiDrivers(ride.pickup, ride.vehicleTypeId, {
        maxKm: radiusKm,
    });
    const { filterPartnersByMinWallet } = await import('../../../core/wallet/driverMinWallet.service.js');
    const partners = await filterPartnersByMinWallet(nearbyPartners);

    const now = new Date();
    ride.dispatch = ride.dispatch || {};
    const nextAttempt = (ride.dispatch.currentAttempt || 0) + 1;
    ride.dispatch.currentAttempt = nextAttempt;
    ride.dispatch.lastAttemptAt = now;

    if (ride.status === 'requested') {
        assertTransition(ride.status, 'searching');
        ride.status = 'searching';
    }

    if (!partners.length) {
        await ride.save();
        await TaxiRideEvent.create({
            rideId: ride._id,
            eventType: 'DISPATCH_ATTEMPT',
            metadata: {
                attemptNumber: nextAttempt,
                radiusKm,
                totalEligible: 0,
                freshNotified: 0,
                driverIds: [],
            },
        });
        logger.info(
            `[TaxiDispatch] No nearby taxi drivers for ride ${id} within ${radiusKm} km (attempt ${nextAttempt})`,
        );
        return { offered: 0, partners: [], attempt: nextAttempt, radiusKm };
    }

    const alreadyOffered = new Set(
        (ride.dispatch?.offeredTo || []).map((o) => String(o.partnerId)),
    );
    // Always rebroadcast to every eligible driver in the (expanded) radius so
    // timed-out/declined partners get the offer again on the next attempt.
    const targets = partners;
    const freshIds = targets
        .filter((p) => !alreadyOffered.has(String(p.partnerId)))
        .map((p) => p.partnerId);

    const offerEventId = newEventId();
    const offerExpiresAt = new Date(Date.now() + DRIVER_OFFER_SECONDS * 1000).toISOString();
    const payload = await buildRideOfferPayload(ride, {
        dispatchAttempt: nextAttempt,
        attemptNumber: nextAttempt,
        searchRadiusKm: radiusKm,
        event_id: offerEventId,
        type: 'NEW_RIDE',
        ring: true,
        expires_at: offerExpiresAt,
        orderId: ride.rideNumber || String(ride._id),
        orderMongoId: String(ride._id),
    });
    const io = getIO();
    const offerEntries = [];

    for (const p of targets) {
        const roomName = rooms.delivery(p.partnerId);
        if (io) {
            const offerPayload = {
                ...payload,
                pickupDistanceKm: p.sortKm ?? p.distanceKm,
            };
            io.to(roomName).emit('new_ride_available', offerPayload);
            // Same dedicated ring event food dispatch uses so the partner app
            // starts the alert even if the ride popup path is delayed.
            io.to(roomName).emit('play_notification_sound', {
                module: 'taxi',
                jobType: 'ride',
                rideId: String(ride._id),
                rideNumber: ride.rideNumber,
                orderId: ride.rideNumber || String(ride._id),
                orderMongoId: String(ride._id),
                order_id: ride.rideNumber || String(ride._id),
                order_mongo_id: String(ride._id),
                status: ride.status,
                dispatchStatus: ride.dispatch?.status || 'unassigned',
                event_id: offerEventId,
                ring: true,
                expires_at: offerExpiresAt,
            });
        }
        if (!alreadyOffered.has(String(p.partnerId))) {
            offerEntries.push({
                partnerId: p.partnerId,
                at: now,
                action: 'offered',
            });
        } else {
            offerEntries.push({
                partnerId: p.partnerId,
                at: now,
                action: 'reoffered',
            });
        }
    }

    try {
        await notifyOwnersSafely(
            targets.map((p) => ({ ownerType: 'DELIVERY_PARTNER', ownerId: p.partnerId })),
            {
                title: 'New taxi ride nearby!',
                body: `Tap to accept ride ${ride.rideNumber || ride._id} — first to accept gets it (~${DRIVER_OFFER_SECONDS}s).`,
                data: {
                    type: 'new_ride_available',
                    event_id: offerEventId,
                    event_type: 'NEW_RIDE',
                    ring: 'true',
                    expires_at: offerExpiresAt,
                    module: 'taxi',
                    rideId: String(ride._id),
                    order_id: ride.rideNumber || String(ride._id),
                    orderId: ride.rideNumber || String(ride._id),
                    orderMongoId: String(ride._id),
                    link: '/food/delivery',
                },
            },
        );
    } catch (err) {
        logger.warn(
            `[TaxiDispatch] FCM ring broadcast failed for ride ${id}: ${err?.message || err}`,
        );
    }

    if (offerEntries.length) {
        ride.dispatch.offeredTo = [...(ride.dispatch.offeredTo || []), ...offerEntries];
    }
    await ride.save();

    await TaxiRideEvent.create({
        rideId: ride._id,
        eventType: 'DISPATCH_ATTEMPT',
        metadata: {
            attemptNumber: nextAttempt,
            radiusKm,
            totalEligible: targets.length,
            freshNotified: freshIds.length,
            reoffered: targets.length - freshIds.length,
            driverIds: targets.map((p) => p.partnerId),
        },
    });

    logger.info(
        `[TaxiDispatch] tryAssignRide ride=${id} attempt=${nextAttempt} radius=${radiusKm}km offered=${targets.length} fresh=${freshIds.length}`,
    );

    return {
        offered: targets.length,
        partners: targets.map((p) => String(p.partnerId)),
        attempt: nextAttempt,
        radiusKm,
    };
}

/**
 * Atomic first-accept wins.
 */
export async function acceptRide(driverId, rideId) {
    if (!driverId) throw new ValidationError('Driver is required');
    const { assertDriverCanReceiveOrders } = await import('../../../core/wallet/driverMinWallet.service.js');
    await assertDriverCanReceiveOrders(driverId);
    const id = validateRideId(rideId);
    const now = new Date();
    const otp = generateRideOtp();

    const ride = await TaxiRide.findOneAndUpdate(
        {
            _id: id,
            isDeleted: { $ne: true },
            status: { $in: ['requested', 'searching', 'assigned'] },
            'dispatch.status': { $in: ['unassigned', 'assigned'] },
            $or: [
                { 'dispatch.deliveryPartnerId': null },
                { 'dispatch.deliveryPartnerId': { $exists: false } },
                { 'dispatch.deliveryPartnerId': driverId },
            ],
        },
        {
            $set: {
                status: 'arriving',
                rideOtp: otp,
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

    if (!ride) {
        const existing = await TaxiRide.findOne({ _id: id, ...baseFilter })
            .select('status dispatch')
            .lean();
        if (!existing) throw new NotFoundError('Ride not found');
        if (existing.dispatch?.deliveryPartnerId
            && String(existing.dispatch.deliveryPartnerId) !== String(driverId)) {
            throw new ValidationError('Ride already accepted by another driver');
        }
        throw new ValidationError(`Ride cannot be accepted in status ${existing.status}`);
    }

    const driver = await Driver.findById(driverId)
        .select('vehicleConfigurationId registeredServices.taxi')
        .lean();
    if (driver) {
        const driverVehicle =
            (driver.registeredServices?.taxi?.vehicleConfigurationId
                ? String(driver.registeredServices.taxi.vehicleConfigurationId)
                : '')
            || (driver.vehicleConfigurationId ? String(driver.vehicleConfigurationId) : '');
        if (driverVehicle && driverVehicle !== String(ride.vehicleTypeId)) {
            throw new ValidationError('Your vehicle type does not match the requested ride.');
        }
    }

    await setDriverBusy(driverId);

    await TaxiRideEvent.create({
        rideId: ride._id,
        eventType: 'DRIVER_ACCEPTED',
        metadata: { driverId }
    });

    const io = getIO();
    if (io) {
        const payload = {
            module: 'taxi',
            jobType: 'ride',
            rideId: String(ride._id),
            rideNumber: ride.rideNumber,
            status: ride.status,
            driverId: String(driverId),
        };
        if (ride.userId) {
            io.to(rooms.user(ride.userId)).emit('ride_accepted', payload);
            io.to(rooms.user(ride.userId)).emit('ride_status_update', payload);
        }
        // Notify other offered drivers that ride was claimed
        const offeredIds = (ride.dispatch?.offeredTo || [])
            .map((o) => String(o.partnerId))
            .filter((pid) => pid && pid !== String(driverId));
        for (const pid of [...new Set(offeredIds)]) {
            io.to(rooms.delivery(pid)).emit('ride_claimed', payload);
        }
    }

    return mapPartnerRide(ride, { includeOtp: true });
}

export async function markArrived(driverId, rideId) {
    if (!driverId) throw new ValidationError('Driver is required');
    const id = validateRideId(rideId);

    const ride = await TaxiRide.findOne({
        _id: id,
        ...baseFilter,
        'dispatch.deliveryPartnerId': driverId,
    });
    if (!ride) throw new NotFoundError('Ride not found');

    assertTransition(ride.status, 'arrived');
    ride.status = 'arrived';
    ride.arrivedAt = new Date();
    await ride.save();

    const io = getIO();
    if (io && ride.userId) {
        const payload = {
            module: 'taxi',
            jobType: 'ride',
            rideId: String(ride._id),
            status: 'arrived',
        };
        io.to(rooms.user(ride.userId)).emit('ride_status_update', payload);
        io.to(rooms.user(ride.userId)).emit('driver_arrived', payload);
    }

    return mapPartnerRide(ride, { includeOtp: true });
}

export async function startRide(driverId, rideId, body = {}) {
    if (!driverId) throw new ValidationError('Driver is required');
    const id = validateRideId(rideId);
    const { otp } = validateStartRideDto(body);

    const ride = await TaxiRide.findOne({
        _id: id,
        ...baseFilter,
        'dispatch.deliveryPartnerId': driverId,
    });
    if (!ride) throw new NotFoundError('Ride not found');

    if (String(ride.rideOtp || '') !== otp) {
        throw new ValidationError('Invalid ride OTP');
    }

    assertTransition(ride.status, 'in_progress');
    ride.status = 'in_progress';
    ride.startedAt = new Date();
    // Lock pickup waiting minutes at trip start (used when finalizing fare)
    if (ride.arrivedAt) {
        ride.waitingMin = computePickupWaitingMinutes(ride.arrivedAt, ride.startedAt);
    }
    await ride.save();

    const io = getIO();
    if (io && ride.userId) {
        io.to(rooms.user(ride.userId)).emit('ride_status_update', {
            module: 'taxi',
            jobType: 'ride',
            rideId: String(ride._id),
            status: 'in_progress',
        });
    }

    return mapPartnerRide(ride);
}

const PARTNER_ACTIVE_STATUSES = ['assigned', 'arriving', 'arrived', 'in_progress', 'awaiting_payment'];

/**
 * Active ride for the signed-in delivery partner (for app hydrate / resume).
 */
export async function getActiveRideForPartner(driverId) {
    if (!driverId) throw new ValidationError('Driver is required');

    const ride = await TaxiRide.findOne({
        isDeleted: { $ne: true },
        'dispatch.deliveryPartnerId': driverId,
        status: { $in: PARTNER_ACTIVE_STATUSES },
    })
        .sort({ updatedAt: -1 })
        .lean();

    if (!ride) return null;
    return mapPartnerRide(ride, { includeOtp: ride.status === 'arrived' });
}

export async function completeRide(driverId, rideId, body = {}) {
    // Legacy callers: if still in_progress, reach drop first then require payment.
    // Preferred path: reachDrop → pay → completePaidRide / collectCash.
    const { reachDrop, completePaidRide, collectCash } = await import('./ridePayment.service.js');

    const id = validateRideId(rideId);
    const ride = await TaxiRide.findOne({
        _id: id,
        ...baseFilter,
        'dispatch.deliveryPartnerId': driverId,
    });
    if (!ride) throw new NotFoundError('Ride not found');

    if (ride.status === 'in_progress') {
        await reachDrop(driverId, rideId, body);
        throw new ValidationError(
            'Drop reached. Collect payment (QR / cash / wait for rider online pay), then complete.',
        );
    }

    if (ride.status === 'awaiting_payment') {
        if (String(body.paymentMode || body.method || '').toLowerCase() === 'cash') {
            return collectCash(driverId, rideId);
        }
        return completePaidRide(driverId, rideId);
    }

    if (ride.status === 'completed') {
        return mapRide(ride.toObject());
    }

    throw new ValidationError(`Cannot complete ride from status ${ride.status}`);
}
