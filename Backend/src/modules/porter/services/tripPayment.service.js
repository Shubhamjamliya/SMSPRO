import { PorterTrip } from '../models/porterTrip.model.js';
import { NotFoundError, ValidationError } from '../../../core/auth/errors.js';
import { mapTrip, mapVehicle } from '../utils/mappers.util.js';
import { validateTripId } from '../validators/trip.validator.js';
import { assertTransition } from '../state/tripStateMachine.js';
import { getMappedPorterVehicleOrThrow } from './vehicle.service.js';
import { getIO, rooms } from '../../../config/socket.js';
import {
    createRazorpayOrder,
    verifyPaymentSignature,
    getRazorpayKeyId,
    isRazorpayConfigured,
} from '../../food/orders/helpers/razorpay.helper.js';

const baseFilter = { isDeleted: { $ne: true } };

const PREPAID_METHODS = new Set(['wallet', 'upi', 'razorpay']);

export function isPrepaidMethod(method) {
    return PREPAID_METHODS.has(String(method || '').toLowerCase());
}

function emitParcelPaymentUpdate(trip, extra = {}) {
    const io = getIO();
    if (!io || !trip) return;
    const payload = {
        module: 'porter',
        jobType: 'parcel',
        tripId: String(trip._id),
        tripNumber: trip.tripNumber,
        status: trip.status,
        payment: {
            method: trip.payment?.method,
            status: trip.payment?.status,
            extraDue: trip.payment?.extraDue,
            shortUrl: trip.payment?.shortUrl || trip.payment?.qr?.shortUrl || null,
            paidAt: trip.payment?.paidAt || null,
            collectedBy: trip.payment?.collectedBy || null,
        },
        fare: trip.fare,
        extraDue: Number(trip.payment?.extraDue || 0),
        ...extra,
    };
    if (trip.userId) {
        io.to(rooms.user(trip.userId)).emit('parcel_status_update', payload);
        io.to(rooms.user(trip.userId)).emit('parcel_payment_update', payload);
    }
    const driverId = trip.dispatch?.deliveryPartnerId;
    if (driverId) {
        io.to(rooms.delivery(driverId)).emit('parcel_status_update', payload);
        io.to(rooms.delivery(driverId)).emit('parcel_payment_update', payload);
    }
}

async function markDropPaymentPaid(trip, {
    method,
    razorpayOrderId = null,
    razorpayPaymentId = null,
    collectedBy = 'user',
} = {}) {
    const due = Number(trip.payment?.extraDue || 0);
    trip.payment = trip.payment || {};
    if (due > 0) {
        trip.payment.amountPaid = Number(trip.payment.amountPaid || 0) + due;
        trip.payment.extraDue = 0;
    }
    trip.payment.status = 'paid';
    trip.payment.paidAt = new Date();
    trip.payment.collectedBy = collectedBy;
    if (method) trip.payment.method = method;
    if (razorpayOrderId) trip.payment.razorpayOrderId = razorpayOrderId;
    if (razorpayPaymentId) {
        trip.payment.razorpayPaymentId = razorpayPaymentId;
        trip.payment.paymentId = razorpayPaymentId;
    }
    await trip.save();
    emitParcelPaymentUpdate(trip);
    return trip;
}

async function findUserTrip(userId, tripId) {
    const id = validateTripId(tripId);
    const trip = await PorterTrip.findOne({ _id: id, userId, ...baseFilter });
    if (!trip) throw new NotFoundError('Trip not found');
    return trip;
}

async function mapTripWithVehicle(trip) {
    const doc = trip.toObject ? trip.toObject() : trip;
    let vehicle = null;
    try {
        const { shaped } = await getMappedPorterVehicleOrThrow(doc.vehicleId);
        vehicle = mapVehicle(shaped);
    } catch {
        vehicle = null;
    }
    const includeDropOtp =
        ['at_drop', 'awaiting_payment'].includes(String(doc.status || ''))
        && Boolean(doc.dropOtp);
    return mapTrip(doc, { vehicle, includeDropOtp });
}

async function startSearchingAfterPayment(trip) {
    if (trip.status === 'quoted') {
        assertTransition(trip.status, 'searching');
        trip.status = 'searching';
    }
    await trip.save();

    try {
        const { tryAssignTrip } = await import('./tripDispatch.service.js');
        setImmediate(() => {
            tryAssignTrip(String(trip._id)).catch(() => {});
        });
    } catch {
        /* dispatch optional */
    }

    return trip;
}

async function markTripPaid(trip, {
    method,
    razorpayOrderId = null,
    razorpayPaymentId = null,
    collectedBy = 'user',
} = {}) {
    if (trip.payment?.status === 'paid') {
        return trip;
    }
    trip.payment = trip.payment || {};
    trip.payment.method = method || trip.payment.method || 'cash';
    trip.payment.status = 'paid';
    trip.payment.paidAt = new Date();
    trip.payment.collectedBy = collectedBy;
    trip.payment.amountPaid = Number(
        trip.payment.amountPaid
        || trip.fareEstimateTotal
        || trip.fare?.total
        || 0,
    );
    trip.payment.extraDue = 0;
    if (razorpayOrderId) trip.payment.razorpayOrderId = razorpayOrderId;
    if (razorpayPaymentId) {
        trip.payment.razorpayPaymentId = razorpayPaymentId;
        trip.payment.paymentId = razorpayPaymentId;
    }
    return startSearchingAfterPayment(trip);
}

/**
 * Wallet checkout — prepaid at booking (`quoted`) or amount due at drop (`awaiting_payment`).
 */
export async function payWithWallet(userId, tripId) {
    const trip = await findUserTrip(userId, tripId);
    const extraDue = Number(trip.payment?.extraDue || 0);
    if (trip.payment?.status === 'paid' && extraDue <= 0) {
        return mapTripWithVehicle(trip);
    }

    if (trip.status === 'awaiting_payment') {
        if (!(extraDue > 0)) {
            return mapTripWithVehicle(trip);
        }
        const { deductWalletBalance } = await import('../../food/user/services/userWallet.service.js');
        await deductWalletBalance(userId, extraDue, `Porter trip ${trip.tripNumber}`, {
            orderId: String(trip._id),
            module: 'porter',
            tripNumber: trip.tripNumber,
            type: 'drop_payment',
        });
        await markDropPaymentPaid(trip, { method: 'wallet', collectedBy: 'user' });
        return mapTripWithVehicle(trip);
    }

    if (trip.status !== 'quoted') {
        throw new ValidationError('Trip is not awaiting payment');
    }

    const amount = Number(trip.fareEstimateTotal || trip.fare?.total || 0);
    if (!(amount > 0)) throw new ValidationError('Invalid fare amount');

    const { deductWalletBalance } = await import('../../food/user/services/userWallet.service.js');
    await deductWalletBalance(userId, amount, `Porter trip ${trip.tripNumber}`, {
        orderId: String(trip._id),
        module: 'porter',
        tripNumber: trip.tripNumber,
    });

    await markTripPaid(trip, { method: 'wallet', collectedBy: 'user' });
    return mapTripWithVehicle(trip);
}

export async function createUserRazorpayOrder(userId, tripId) {
    if (!isRazorpayConfigured()) throw new ValidationError('Razorpay is not configured');
    const trip = await findUserTrip(userId, tripId);
    if (trip.payment?.status === 'paid' && Number(trip.payment?.extraDue || 0) <= 0) {
        throw new ValidationError('Trip is already paid');
    }

    const isDropPayment = trip.status === 'awaiting_payment';
    if (!isDropPayment && trip.status !== 'quoted') {
        throw new ValidationError('Trip is not awaiting payment');
    }

    const amount = isDropPayment
        ? Number(trip.payment?.extraDue || 0)
        : Number(trip.fareEstimateTotal || trip.fare?.total || 0);
    if (!(amount > 0)) throw new ValidationError('Invalid fare amount');
    const amountPaise = Math.round(amount * 100);

    const order = await createRazorpayOrder(
        amountPaise,
        'INR',
        `porter_${String(trip._id).slice(-12)}`,
        {
            type: isDropPayment ? 'porter_trip_drop' : 'porter_trip',
            tripId: String(trip._id),
            tripNumber: trip.tripNumber || '',
            userId: String(userId),
        },
    );

    trip.payment = trip.payment || {};
    trip.payment.method = 'upi';
    trip.payment.status = 'pending';
    trip.payment.razorpayOrderId = order.id;
    await trip.save();

    return {
        trip: await mapTripWithVehicle(trip),
        razorpay: {
            keyId: getRazorpayKeyId(),
            orderId: order.id,
            amount: amountPaise,
            currency: 'INR',
            tripId: String(trip._id),
            tripNumber: trip.tripNumber,
        },
    };
}

export async function verifyUserRazorpayPayment(userId, tripId, body = {}) {
    const trip = await findUserTrip(userId, tripId);
    const extraDue = Number(trip.payment?.extraDue || 0);
    if (trip.payment?.status === 'paid' && extraDue <= 0) {
        return mapTripWithVehicle(trip);
    }

    const isDropPayment = trip.status === 'awaiting_payment';
    if (!isDropPayment && trip.status !== 'quoted') {
        throw new ValidationError('Trip is not awaiting payment');
    }

    const orderId = String(body.razorpayOrderId || body.razorpay_order_id || '').trim();
    const paymentId = String(body.razorpayPaymentId || body.razorpay_payment_id || '').trim();
    const signature = String(body.razorpaySignature || body.razorpay_signature || '').trim();

    if (!orderId || !paymentId || !signature) {
        throw new ValidationError('Missing Razorpay verification fields');
    }
    if (trip.payment?.razorpayOrderId && trip.payment.razorpayOrderId !== orderId) {
        throw new ValidationError('Razorpay order mismatch');
    }
    if (!verifyPaymentSignature(orderId, paymentId, signature)) {
        throw new ValidationError('Invalid payment signature');
    }

    if (isDropPayment) {
        await markDropPaymentPaid(trip, {
            method: 'upi',
            razorpayOrderId: orderId,
            razorpayPaymentId: paymentId,
            collectedBy: 'user',
        });
    } else {
        await markTripPaid(trip, {
            method: 'upi',
            razorpayOrderId: orderId,
            razorpayPaymentId: paymentId,
            collectedBy: 'user',
        });
    }
    return mapTripWithVehicle(trip);
}

/**
 * Re-broadcast offer to nearby drivers of the selected vehicle type.
 * Uses the same radius expansion formula as the dispatch cron.
 */
export async function requestTripSearch(userId, tripId) {
    const trip = await findUserTrip(userId, tripId);
    if (!['searching', 'quoted'].includes(trip.status)) {
        throw new ValidationError('Trip is not searchable');
    }
    if (trip.status === 'quoted' && isPrepaidMethod(trip.payment?.method)
        && trip.payment?.status !== 'paid') {
        throw new ValidationError('Complete payment before searching for a partner');
    }
    if (trip.status === 'quoted' && trip.payment?.status === 'paid') {
        assertTransition(trip.status, 'searching');
        trip.status = 'searching';
        await trip.save();
    }

    const { getSearchRadiusKm } = await import('./settings.service.js');
    const { tryAssignTrip } = await import('./tripDispatch.service.js');
    const baseRadius = await getSearchRadiusKm();
    const currentAttempt = Number(trip.dispatch?.currentAttempt || 0);
    const radiusKm = baseRadius + (currentAttempt * 2);
    const result = await tryAssignTrip(String(trip._id), radiusKm);
    const fresh = await findUserTrip(userId, tripId);
    return {
        trip: await mapTripWithVehicle(fresh),
        offered: result.offered,
        attempt: result.attempt,
        radiusKm: result.radiusKm,
    };
}

/**
 * Pay amount due at drop with wallet (COD full fare or prepaid overtime).
 * Does not auto-complete — partner confirms with drop OTP (taxi-like).
 */
export async function payExtraLoadingWithWallet(userId, tripId) {
    return payWithWallet(userId, tripId);
}

/**
 * User polls payment status at drop (QR sync + latest dues).
 */
export async function getUserPaymentStatus(userId, tripId) {
    const trip = await findUserTrip(userId, tripId);
    if (trip.status === 'awaiting_payment') {
        await syncTripQrPayment(trip);
        const fresh = await findUserTrip(userId, tripId);
        return mapTripWithVehicle(fresh);
    }
    return mapTripWithVehicle(trip);
}

async function findPartnerTrip(driverId, tripId) {
    const id = validateTripId(tripId);
    const trip = await PorterTrip.findOne({
        _id: id,
        ...baseFilter,
        'dispatch.deliveryPartnerId': driverId,
    });
    if (!trip) throw new NotFoundError('Trip not found');
    return trip;
}

function assertDropOtp(trip, body = {}) {
    const otp = String(body.otp || body.dropOtp || '').trim();
    if (!/^\d{6}$/.test(otp) || String(trip.dropOtp || '') !== otp) {
        throw new ValidationError('Invalid drop OTP. Ask the customer.');
    }
    return otp;
}

/**
 * Driver collects cash for COD full fare or prepaid loading overtime.
 * Requires drop OTP. Completes the trip (taxi-like).
 */
export async function collectCash(driverId, tripId, body = {}) {
    if (!driverId) throw new ValidationError('Driver is required');
    const trip = await findPartnerTrip(driverId, tripId);
    if (trip.status !== 'awaiting_payment') {
        throw new ValidationError('Trip is not awaiting payment');
    }
    assertDropOtp(trip, body);

    const due = Number(trip.payment?.extraDue || 0);
    if (due > 0) {
        const { assertCanCollectPorterCash, enforcePorterDriverCashLimitAfterCollect } = await import(
            './cashLimit.service.js'
        );
        await assertCanCollectPorterCash(driverId, due);

        trip.payment = trip.payment || {};
        const method = String(trip.payment.method || 'cash').toLowerCase();
        if (!['wallet', 'upi', 'razorpay'].includes(method)) {
            trip.payment.method = 'cash';
        }
        trip.payment.amountPaid = Number(trip.payment.amountPaid || 0) + due;
        trip.payment.extraDue = 0;
        // Track physical cash held so shared cash-limit / deposits stay correct
        trip.payment.cashCollectedAmount = Number(trip.payment.cashCollectedAmount || 0) + due;
        trip.payment.status = 'paid';
        trip.payment.paidAt = new Date();
        trip.payment.collectedBy = 'driver';
        if (trip.payment.qr) trip.payment.qr.status = 'paid';

        const { finalizePartnerTripAfterPayment } = await import('./tripDispatch.service.js');
        const completed = await finalizePartnerTripAfterPayment(trip, driverId);
        // Fire-and-forget: force offline if limit exhausted (same as food)
        enforcePorterDriverCashLimitAfterCollect(driverId).catch(() => {});
        return completed;
    }

    const { finalizePartnerTripAfterPayment } = await import('./tripDispatch.service.js');
    return finalizePartnerTripAfterPayment(trip, driverId);
}

/**
 * Driver creates Razorpay payment link / QR for amount due at drop.
 */
export async function createDriverCollectQr(driverId, tripId, body = {}) {
    if (!driverId) throw new ValidationError('Driver is required');
    if (!isRazorpayConfigured()) throw new ValidationError('Razorpay is not configured');

    const trip = await findPartnerTrip(driverId, tripId);
    if (trip.status !== 'awaiting_payment') {
        throw new ValidationError('Trip is not awaiting payment');
    }
    assertDropOtp(trip, body);

    const amount = Number(trip.payment?.extraDue || 0);
    if (!(amount > 0)) throw new ValidationError('No amount due to collect');

    const amountPaise = Math.round(amount * 100);
    let customerName = 'Customer';
    let customerPhone = '9999999999';
    try {
        const mongoose = (await import('mongoose')).default;
        const User = mongoose.models.FoodUser || mongoose.models.User;
        if (User) {
            const user = await User.findById(trip.userId).select('name phone').lean();
            if (user) {
                customerName = user.name || customerName;
                customerPhone = user.phone || customerPhone;
            }
        }
    } catch {
        /* optional */
    }

    const { createPaymentLink } = await import('../../food/orders/helpers/razorpay.helper.js');
    const link = await createPaymentLink({
        amountPaise,
        currency: 'INR',
        description: `Porter ${trip.tripNumber}`,
        orderId: String(trip._id),
        customerName,
        customerPhone,
        notes: {
            type: 'porter_trip_qr',
            tripId: String(trip._id),
            tripNumber: trip.tripNumber || '',
            driverId: String(driverId),
        },
    });

    trip.payment = trip.payment || {};
    trip.payment.paymentLinkId = link.id;
    trip.payment.shortUrl = link.short_url;
    trip.payment.qr = {
        paymentLinkId: link.id,
        shortUrl: link.short_url,
        status: link.status || 'created',
        amountPaise,
        createdAt: new Date(),
    };
    await trip.save();

    return {
        trip: await mapTripWithVehicle(trip),
        qr: {
            paymentLinkId: link.id,
            shortUrl: link.short_url,
            amountPaise,
            amount,
        },
    };
}

async function syncTripQrPayment(trip) {
    if (!trip || Number(trip.payment?.extraDue || 0) <= 0) return trip;

    const paymentLinkId = trip.payment?.paymentLinkId || trip.payment?.qr?.paymentLinkId;
    if (!paymentLinkId || !isRazorpayConfigured()) return trip;

    const { fetchRazorpayPaymentLink } = await import('../../food/orders/helpers/razorpay.helper.js');
    let link;
    try {
        link = await fetchRazorpayPaymentLink(paymentLinkId);
    } catch {
        return trip;
    }

    const linkStatus = String(link?.status || '').toLowerCase();
    if (trip.payment?.qr) trip.payment.qr.status = linkStatus;

    if (['paid', 'captured'].includes(linkStatus)) {
        const due = Number(trip.payment?.extraDue || 0);
        trip.payment.amountPaid = Number(trip.payment.amountPaid || 0) + due;
        trip.payment.extraDue = 0;
        trip.payment.status = 'paid';
        trip.payment.paidAt = new Date();
        trip.payment.collectedBy = 'qr';
        trip.payment.razorpayPaymentId = link?.payments?.[0]?.payment_id || link?.payment_id || null;
        await trip.save();
        emitParcelPaymentUpdate(trip);
    }
    return trip;
}

/**
 * Partner polls payment status at drop (QR sync).
 */
export async function getPartnerPaymentStatus(driverId, tripId) {
    const trip = await findPartnerTrip(driverId, tripId);
    if (trip.status === 'awaiting_payment') {
        await syncTripQrPayment(trip);
        const fresh = await findPartnerTrip(driverId, tripId);
        return mapTripWithVehicle(fresh);
    }
    return mapTripWithVehicle(trip);
}
