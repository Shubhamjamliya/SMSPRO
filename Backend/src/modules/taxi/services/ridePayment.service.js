import { TaxiRide } from '../models/taxiRide.model.js';
import { TaxiPricing } from '../models/taxiPricing.model.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../../../core/auth/errors.js';
import { getIO, rooms } from '../../../config/socket.js';
import { clearDriverBusy } from '../../../core/dispatch/driverBusyLock.service.js';
import { logger } from '../../../utils/logger.js';
import { mapRide } from '../utils/mappers.util.js';
import { validateRideId } from '../validators/ride.validator.js';
import { assertTransition } from '../state/rideStateMachine.js';
import { computeFare, selectPricingSlab, applyAdminCommission, computePickupWaitingMinutes } from '../utils/fare.util.js';
import { applyLockedTimeSlotSurge } from '../utils/surge.util.js';
import { applyCouponToFare } from './coupon.service.js';
import { assertCanCollectTaxiCash } from './cashLimit.service.js';
import {
    createRazorpayOrder,
    createPaymentLink,
    verifyPaymentSignature,
    fetchRazorpayPaymentLink,
    getRazorpayKeyId,
    isRazorpayConfigured,
} from '../../food/orders/helpers/razorpay.helper.js';

const baseFilter = { isDeleted: { $ne: true } };

function emitRidePayment(ride, extra = {}) {
    const io = getIO();
    if (!io || !ride) return;
    const payload = {
        module: 'taxi',
        jobType: 'ride',
        rideId: String(ride._id),
        rideNumber: ride.rideNumber,
        status: ride.status,
        payment: {
            method: ride.payment?.method,
            status: ride.payment?.status,
            shortUrl: ride.payment?.shortUrl || ride.payment?.qr?.shortUrl || null,
            paidAt: ride.payment?.paidAt || null,
        },
        fare: ride.fare,
        fareBreakdown: ride.fareBreakdown,
        coupon: ride.coupon || null,
        waitingMin: ride.waitingMin,
        ...extra,
    };
    if (ride.userId) {
        io.to(rooms.user(ride.userId)).emit('ride_status_update', payload);
        io.to(rooms.user(ride.userId)).emit('ride_payment_update', payload);
    }
    const driverId = ride.dispatch?.deliveryPartnerId;
    if (driverId) {
        io.to(rooms.delivery(driverId)).emit('ride_status_update', payload);
        io.to(rooms.delivery(driverId)).emit('ride_payment_update', payload);
    }
}

async function loadPricing(ride) {
    let pricing = null;
    if (ride.zoneId) {
        pricing = await TaxiPricing.findOne({
            vehicleTypeId: ride.vehicleTypeId,
            zoneId: ride.zoneId,
            isDeleted: { $ne: true },
            status: 'active',
        }).lean();
    }
    if (!pricing) {
        pricing = await TaxiPricing.findOne({
            vehicleTypeId: ride.vehicleTypeId,
            zoneId: null,
            isDeleted: { $ne: true },
            status: 'active',
        }).lean();
    }
    if (!pricing) {
        pricing = await TaxiPricing.findOne({
            vehicleTypeId: ride.vehicleTypeId,
            isDeleted: { $ne: true },
            status: 'active',
        })
            .sort({ updatedAt: -1 })
            .lean();
    }
    return pricing;
}

function buildFareBreakdown(fare, { distanceKm, durationMin, waitingMin, slab, coupon = null }) {
    return {
        base: Number(fare.base || 0),
        distance: Number(fare.distance || 0),
        time: Number(fare.time || 0),
        waiting: Number(fare.waiting || 0),
        platformFee: Number(fare.platformFee || 0),
        surgeMultiplier: Number(fare.surgeMultiplier ?? 1),
        timeSlotSurge: Number(fare.timeSlotSurge || 0),
        surgeSlotId: fare.surgeSlotId || null,
        surgeSlotName: fare.surgeSlotName || null,
        adminCommissionPercent: Number(fare.adminCommissionPercent || 0),
        adminCommissionAmount: Number(fare.adminCommissionAmount || 0),
        driverShare: Number(fare.driverShare || 0),
        subtotal: Number(fare.subtotal || 0),
        total: Number(fare.total || 0),
        originalTotal: Number(fare.originalTotal || fare.total || 0),
        discount: Number(fare.discount || coupon?.discountAmount || 0),
        couponCode: coupon?.code || null,
        couponName: coupon?.name || null,
        currency: fare.currency || 'INR',
        distanceKm: Number(distanceKm || 0),
        durationMin: Number(durationMin || 0),
        waitingMin: Number(waitingMin ?? fare.waitingMin ?? 0),
        freeWaitMinutes: Number(fare.freeWaitMinutes || 0),
        billableWaitMin: Number(fare.billableWaitMin || 0),
        perMinWaitRate: Number(fare.perMinWaitRate || 0),
        slabFromKm: slab?.fromKm ?? fare?.slab?.fromKm ?? null,
        slabToKm: slab?.toKm ?? fare?.slab?.toKm ?? null,
    };
}

async function creditDriverEarnings(ride) {
    if (ride.earningsCreditedAt) return;
    const fare = ride.fare || {};
    const driverShare = Math.max(
        0,
        Number(
            fare.driverShare
            ?? (Number(fare.total || 0) - Number(fare.platformFee || 0)),
        ),
    );
    if (driverShare <= 0) {
        ride.earningsCreditedAt = new Date();
        return;
    }
    try {
        const { creditWallet } = await import('../../../core/payments/wallet.service.js');
        await creditWallet({
            entityType: 'deliveryBoy',
            entityId: ride.dispatch.deliveryPartnerId,
            amount: driverShare,
            description: `Taxi ride ${ride.rideNumber} earnings`,
            category: 'delivery_earning',
            orderId: String(ride._id),
            module: 'taxi',
            metadata: {
                module: 'taxi',
                rideId: String(ride._id),
                rideNumber: ride.rideNumber,
                adminCommissionPercent: Number(fare.adminCommissionPercent || 0),
                adminCommissionAmount: Number(fare.adminCommissionAmount || 0),
                platformFee: Number(fare.platformFee || 0),
            },
        });
        ride.earningsCreditedAt = new Date();
    } catch (err) {
        logger.warn(`[TaxiPayment] earnings credit failed: ${err?.message || err}`);
    }
}

async function findPartnerRide(driverId, rideId) {
    const id = validateRideId(rideId);
    const ride = await TaxiRide.findOne({
        _id: id,
        ...baseFilter,
        'dispatch.deliveryPartnerId': driverId,
    });
    if (!ride) throw new NotFoundError('Ride not found');
    return ride;
}

async function findUserRide(userId, rideId) {
    const id = validateRideId(rideId);
    const ride = await TaxiRide.findOne({
        _id: id,
        ...baseFilter,
        userId,
    });
    if (!ride) throw new NotFoundError('Ride not found');
    return ride;
}

/**
 * Driver reached drop → finalize fare → awaiting_payment.
 */
export async function reachDrop(driverId, rideId, body = {}) {
    if (!driverId) throw new ValidationError('Driver is required');
    const ride = await findPartnerRide(driverId, rideId);
    assertTransition(ride.status, 'awaiting_payment');

    // Waiting = pickup idle only (arrived → OTP start), never whole trip duration
    const computedWait = computePickupWaitingMinutes(ride.arrivedAt, ride.startedAt);
    const waitingMin = Number(
        body.waitingMin != null && Number.isFinite(Number(body.waitingMin))
            ? body.waitingMin
            : (ride.waitingMin > 0 ? ride.waitingMin : computedWait),
    );
    const distanceKm = Number(body.distanceKm ?? ride.distanceKm ?? 0);
    const durationMin = Number(
        body.durationMin
        ?? (ride.startedAt
            ? Math.max(1, Math.round((Date.now() - new Date(ride.startedAt).getTime()) / 60000))
            : ride.durationMin || 0),
    );

    const pricing = await loadPricing(ride);
    const lockedFare = ride.fare?.toObject?.() || ride.fare || {};
    let fare = pricing
        ? computeFare({ distanceKm, durationMin, waitingMin, pricing })
        : {
            ...lockedFare,
            total: ride.fareEstimateTotal || lockedFare.total || 0,
            currency: 'INR',
        };

    // Recompute distance/wait, but keep quote/book time-slot surge locked
    fare = applyLockedTimeSlotSurge(fare, lockedFare);

    const commissionPercent = Number(
        lockedFare.adminCommissionPercent
        ?? pricing?.adminCommissionPercent
        ?? 0,
    );
    fare = applyAdminCommission(fare, commissionPercent);

    // Re-apply booked promo on final fare (waiting included in discount base)
    const lockedCoupon = ride.coupon?.toObject?.() || ride.coupon || null;
    let couponSnapshot = lockedCoupon;
    if (lockedCoupon?.code) {
        const applied = applyCouponToFare(fare, {
            _id: lockedCoupon.couponId,
            code: lockedCoupon.code,
            name: lockedCoupon.name,
            discountType: lockedCoupon.discountType || 'flat',
            discountValue: lockedCoupon.discountValue,
            maxDiscount: lockedCoupon.maxDiscount,
            waivePlatformFee: lockedCoupon.waivePlatformFee,
        });
        fare = applied.fare;
        couponSnapshot = applied.snapshot || lockedCoupon;
    } else {
        fare = {
            ...fare,
            originalTotal: Number(fare.total || 0),
            discount: 0,
        };
    }

    const slab = pricing ? selectPricingSlab(pricing, distanceKm) : null;
    const breakdown = buildFareBreakdown(fare, {
        distanceKm,
        durationMin,
        waitingMin,
        slab,
        coupon: couponSnapshot,
    });

    ride.status = 'awaiting_payment';
    ride.reachedDropAt = new Date();
    ride.distanceKm = distanceKm;
    ride.durationMin = durationMin;
    ride.waitingMin = waitingMin;
    ride.fare = fare;
    ride.fareBreakdown = breakdown;
    if (couponSnapshot) ride.coupon = couponSnapshot;
    ride.fareEstimateTotal = Number(fare.total || 0);
    if (!ride.payment) ride.payment = {};
    ride.payment.status = ride.payment.status === 'paid' ? 'paid' : 'pending';
    await ride.save();

    emitRidePayment(ride);
    return mapRide(ride.toObject());
}

export async function markRidePaid(ride, {
    method,
    razorpayOrderId = null,
    razorpayPaymentId = null,
    paymentLinkId = null,
    collectedBy = null,
} = {}) {
    if (String(ride.payment?.status || '') === 'paid') {
        return ride;
    }
    ride.payment = ride.payment || {};
    ride.payment.method = method || ride.payment.method || 'razorpay';
    ride.payment.status = 'paid';
    ride.payment.paidAt = new Date();
    if (razorpayOrderId) ride.payment.razorpayOrderId = razorpayOrderId;
    if (razorpayPaymentId) {
        ride.payment.razorpayPaymentId = razorpayPaymentId;
        ride.payment.paymentId = razorpayPaymentId;
    }
    if (paymentLinkId) ride.payment.paymentLinkId = paymentLinkId;
    if (collectedBy) ride.payment.collectedBy = collectedBy;
    if (ride.payment.qr) {
        ride.payment.qr.status = 'paid';
    }
    await ride.save();
    emitRidePayment(ride);
    return ride;
}

/**
 * User pays with wallet.
 */
export async function payWithWallet(userId, rideId) {
    const ride = await findUserRide(userId, rideId);
    if (ride.status !== 'awaiting_payment') {
        throw new ValidationError('Ride is not awaiting payment');
    }
    if (ride.payment?.status === 'paid') {
        return mapRide(ride.toObject());
    }

    const amount = Number(ride.fare?.total || 0);
    if (!(amount > 0)) throw new ValidationError('Invalid fare amount');

    const { deductWalletBalance } = await import('../../food/user/services/userWallet.service.js');
    await deductWalletBalance(userId, amount, `Taxi ride ${ride.rideNumber}`, {
        orderId: String(ride._id),
        module: 'taxi',
        rideNumber: ride.rideNumber,
    });

    await markRidePaid(ride, { method: 'wallet', collectedBy: 'user' });
    return mapRide(ride.toObject());
}

/**
 * Create Razorpay order for user checkout.
 */
export async function createUserRazorpayOrder(userId, rideId) {
    if (!isRazorpayConfigured()) throw new ValidationError('Razorpay is not configured');
    const ride = await findUserRide(userId, rideId);
    if (ride.status !== 'awaiting_payment') {
        throw new ValidationError('Ride is not awaiting payment');
    }
    if (ride.payment?.status === 'paid') {
        throw new ValidationError('Ride is already paid');
    }

    const amount = Number(ride.fare?.total || 0);
    if (!(amount > 0)) throw new ValidationError('Invalid fare amount');
    const amountPaise = Math.round(amount * 100);

    const order = await createRazorpayOrder(
        amountPaise,
        'INR',
        `taxi_${String(ride._id).slice(-12)}`,
        {
            type: 'taxi_ride',
            rideId: String(ride._id),
            rideNumber: ride.rideNumber || '',
            userId: String(userId),
        },
    );

    ride.payment = ride.payment || {};
    ride.payment.method = 'razorpay';
    ride.payment.status = 'pending';
    ride.payment.razorpayOrderId = order.id;
    await ride.save();

    return {
        ride: mapRide(ride.toObject()),
        razorpay: {
            keyId: getRazorpayKeyId(),
            orderId: order.id,
            amount: amountPaise,
            currency: 'INR',
            rideId: String(ride._id),
            rideNumber: ride.rideNumber,
        },
    };
}

export async function verifyUserRazorpayPayment(userId, rideId, body = {}) {
    const ride = await findUserRide(userId, rideId);
    if (ride.status !== 'awaiting_payment' && ride.payment?.status !== 'paid') {
        throw new ValidationError('Ride is not awaiting payment');
    }
    if (ride.payment?.status === 'paid') {
        return mapRide(ride.toObject());
    }

    const orderId = String(body.razorpayOrderId || body.razorpay_order_id || '').trim();
    const paymentId = String(body.razorpayPaymentId || body.razorpay_payment_id || '').trim();
    const signature = String(body.razorpaySignature || body.razorpay_signature || '').trim();

    if (!orderId || !paymentId || !signature) {
        throw new ValidationError('Missing Razorpay verification fields');
    }
    if (ride.payment?.razorpayOrderId && ride.payment.razorpayOrderId !== orderId) {
        throw new ValidationError('Razorpay order mismatch');
    }
    if (!verifyPaymentSignature(orderId, paymentId, signature)) {
        throw new ValidationError('Invalid payment signature');
    }

    await markRidePaid(ride, {
        method: 'razorpay',
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        collectedBy: 'user',
    });
    return mapRide(ride.toObject());
}

/**
 * Driver generates Razorpay dynamic payment link / QR.
 */
export async function createDriverCollectQr(driverId, rideId) {
    if (!isRazorpayConfigured()) throw new ValidationError('Razorpay is not configured');
    const ride = await findPartnerRide(driverId, rideId);
    if (ride.status !== 'awaiting_payment') {
        throw new ValidationError('Ride is not awaiting payment');
    }
    if (ride.payment?.status === 'paid') {
        return mapRide(ride.toObject());
    }

    const amount = Number(ride.fare?.total || 0);
    if (!(amount > 0)) throw new ValidationError('Invalid fare amount');
    const amountPaise = Math.round(amount * 100);

    let customerName = 'Rider';
    let customerPhone = '9999999999';
    try {
        const mongoose = (await import('mongoose')).default;
        const User = mongoose.models.FoodUser || mongoose.models.User;
        if (User) {
            const user = await User.findById(ride.userId).select('name phone email').lean();
            if (user) {
                customerName = user.name || customerName;
                customerPhone = user.phone || customerPhone;
            }
        }
    } catch {
        /* optional */
    }

    const link = await createPaymentLink({
        amountPaise,
        currency: 'INR',
        description: `Taxi ${ride.rideNumber}`,
        orderId: String(ride._id),
        customerName,
        customerPhone,
        notes: {
            type: 'taxi_ride_qr',
            rideId: String(ride._id),
            rideNumber: ride.rideNumber || '',
            driverId: String(driverId),
        },
    });

    ride.payment = ride.payment || {};
    ride.payment.method = 'razorpay_qr';
    ride.payment.status = 'pending_qr';
    ride.payment.paymentLinkId = link.id;
    ride.payment.shortUrl = link.short_url;
    ride.payment.qr = {
        paymentLinkId: link.id,
        shortUrl: link.short_url,
        status: link.status || 'created',
        amountPaise,
        createdAt: new Date(),
    };
    await ride.save();
    emitRidePayment(ride);

    return {
        ride: mapRide(ride.toObject()),
        qr: {
            paymentLinkId: link.id,
            shortUrl: link.short_url,
            amountPaise,
            amount,
        },
    };
}

export async function syncRideQrPayment(ride) {
    if (!ride || ride.payment?.status === 'paid') return ride;
    const paymentLinkId = ride.payment?.paymentLinkId || ride.payment?.qr?.paymentLinkId;
    if (!paymentLinkId || !isRazorpayConfigured()) return ride;

    let link;
    try {
        link = await fetchRazorpayPaymentLink(paymentLinkId);
    } catch (err) {
        logger.warn(`[TaxiPayment] QR sync failed: ${err?.message || err}`);
        return ride;
    }

    const linkStatus = String(link?.status || '').toLowerCase();
    if (ride.payment?.qr) ride.payment.qr.status = linkStatus;

    if (['paid', 'captured'].includes(linkStatus)) {
        const paymentId = link?.payments?.[0]?.payment_id || link?.payment_id || null;
        await markRidePaid(ride, {
            method: 'razorpay_qr',
            paymentLinkId,
            razorpayPaymentId: paymentId,
            collectedBy: 'qr',
        });
        return ride;
    }

    if (['expired', 'cancelled', 'canceled'].includes(linkStatus)) {
        ride.payment.status = 'failed';
        await ride.save();
        emitRidePayment(ride);
    } else {
        await ride.save();
    }
    return ride;
}

export async function getPaymentStatus(actorId, rideId, { asPartner = false } = {}) {
    const ride = asPartner
        ? await findPartnerRide(actorId, rideId)
        : await findUserRide(actorId, rideId);

    if (
        ride.status === 'awaiting_payment' &&
        ride.payment?.method === 'razorpay_qr' &&
        ride.payment?.status !== 'paid'
    ) {
        await syncRideQrPayment(ride);
    }

    const fresh = await TaxiRide.findById(ride._id).lean();
    return mapRide(fresh);
}

/**
 * Mark paid via webhook (idempotent).
 */
export async function markPaidFromWebhook({
    rideId,
    razorpayOrderId,
    razorpayPaymentId,
    paymentLinkId,
    method = 'razorpay',
}) {
    let ride = null;
    if (rideId) {
        ride = await TaxiRide.findOne({ _id: rideId, ...baseFilter });
    }
    if (!ride && razorpayOrderId) {
        ride = await TaxiRide.findOne({ 'payment.razorpayOrderId': razorpayOrderId, ...baseFilter });
    }
    if (!ride && paymentLinkId) {
        ride = await TaxiRide.findOne({
            $or: [
                { 'payment.paymentLinkId': paymentLinkId },
                { 'payment.qr.paymentLinkId': paymentLinkId },
            ],
            ...baseFilter,
        });
    }
    if (!ride) return null;
    if (ride.payment?.status === 'paid') return mapRide(ride.toObject ? ride.toObject() : ride);

    await markRidePaid(ride, {
        method,
        razorpayOrderId,
        razorpayPaymentId,
        paymentLinkId,
        collectedBy: 'webhook',
    });
    return mapRide(ride.toObject());
}

/**
 * Cash collect → paid + completed.
 */
export async function collectCash(driverId, rideId) {
    const ride = await findPartnerRide(driverId, rideId);
    if (ride.status !== 'awaiting_payment') {
        throw new ValidationError('Ride is not awaiting payment');
    }
    if (ride.payment?.status === 'paid' && ride.status === 'completed') {
        return mapRide(ride.toObject());
    }

    const amount = Number(ride.fare?.total || 0);
    await assertCanCollectTaxiCash(driverId, amount);

    await markRidePaid(ride, { method: 'cash', collectedBy: 'driver' });

    assertTransition(ride.status, 'completed');
    ride.status = 'completed';
    ride.completedAt = new Date();
    await creditDriverEarnings(ride);
    await ride.save();
    await clearDriverBusy(driverId);

    const io = getIO();
    if (io) {
        const payload = {
            module: 'taxi',
            jobType: 'ride',
            rideId: String(ride._id),
            status: 'completed',
            fare: ride.fare,
            payment: { method: 'cash', status: 'paid' },
        };
        if (ride.userId) {
            io.to(rooms.user(ride.userId)).emit('ride_status_update', payload);
            io.to(rooms.user(ride.userId)).emit('ride_completed', payload);
            io.to(rooms.user(ride.userId)).emit('ride_payment_update', payload);
        }
        io.to(rooms.delivery(driverId)).emit('ride_completed', payload);
        io.to(rooms.delivery(driverId)).emit('ride_payment_update', payload);
    }

    return mapRide(ride.toObject());
}

/**
 * Complete after online/QR payment is paid.
 */
export async function completePaidRide(driverId, rideId) {
    const ride = await findPartnerRide(driverId, rideId);
    if (ride.status === 'completed') {
        return mapRide(ride.toObject());
    }
    if (ride.status !== 'awaiting_payment') {
        throw new ValidationError('Ride must be awaiting payment before complete');
    }
    if (String(ride.payment?.status || '') !== 'paid') {
        throw new ValidationError('Payment is still pending. Collect payment first.');
    }
    if (ride.payment?.method === 'cash') {
        // cash path should use collectCash
    }

    assertTransition(ride.status, 'completed');
    ride.status = 'completed';
    ride.completedAt = new Date();
    await creditDriverEarnings(ride);
    await ride.save();
    await clearDriverBusy(driverId);

    const io = getIO();
    if (io) {
        const payload = {
            module: 'taxi',
            jobType: 'ride',
            rideId: String(ride._id),
            status: 'completed',
            fare: ride.fare,
            payment: {
                method: ride.payment?.method,
                status: ride.payment?.status,
            },
        };
        if (ride.userId) {
            io.to(rooms.user(ride.userId)).emit('ride_status_update', payload);
            io.to(rooms.user(ride.userId)).emit('ride_completed', payload);
        }
        io.to(rooms.delivery(driverId)).emit('ride_completed', payload);
    }

    return mapRide(ride.toObject());
}

export async function listPartnerRides(driverId, query = {}) {
    if (!driverId) throw new ValidationError('Driver is required');
    const limit = Math.min(100, Math.max(1, Number(query.limit || 30)));
    const docs = await TaxiRide.find({
        ...baseFilter,
        'dispatch.deliveryPartnerId': driverId,
        status: { $in: ['completed', 'awaiting_payment', 'cancelled_by_rider', 'cancelled_by_driver', 'cancelled_by_system'] },
    })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .lean();
    return docs.map((d) => mapRide(d));
}
