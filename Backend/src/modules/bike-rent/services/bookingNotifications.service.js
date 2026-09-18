/**
 * Bike Rent notification hooks + inbox persistence.
 */

import { logger } from '../../../utils/logger.js';
import { BikeRentNotification } from '../models/bikeRentNotification.model.js';

export const BIKE_RENT_NOTIFY_EVENTS = Object.freeze({
    BOOKING_CONFIRMATION: 'bike_rent.booking_confirmation',
    BOOKING_SUBMITTED: 'bike_rent.booking_submitted',
    BOOKING_APPROVED: 'bike_rent.booking_approved',
    BOOKING_REJECTED: 'bike_rent.booking_rejected',
    PAYMENT_SUCCESS: 'bike_rent.payment_success',
    PICKUP_REMINDER: 'bike_rent.pickup_reminder',
    RETURN_REMINDER: 'bike_rent.return_reminder',
    BOOKING_CANCELLED: 'bike_rent.booking_cancelled',
    DEPOSIT_REFUNDED: 'bike_rent.deposit_refunded',
    INSPECTION_COMPLETED: 'bike_rent.inspection_completed',
    BOOKING_EXPIRED: 'bike_rent.booking_expired',
    RENTAL_EXTENDED: 'bike_rent.rental_extended',
    RETURN_REQUESTED: 'bike_rent.return_requested',
    NO_SHOW: 'bike_rent.no_show',
    NO_SHOW_OVERRIDDEN: 'bike_rent.no_show_overridden',
    EXTENSION_REQUESTED: 'bike_rent.extension_requested',
    EXTENSION_APPROVED: 'bike_rent.extension_approved',
    EXTENSION_REJECTED: 'bike_rent.extension_rejected',
    BIKE_REASSIGNED: 'bike_rent.bike_reassigned',
    LATE_RETURN: 'bike_rent.late_return',
    PICKUP_DELAY: 'bike_rent.pickup_delay',
    DEPOSIT_DEDUCTED: 'bike_rent.deposit_deducted',
    CATEGORY_SUBMITTED: 'bike_rent.category_submitted',
    CATEGORY_APPROVED: 'bike_rent.category_approved',
    CATEGORY_REJECTED: 'bike_rent.category_rejected',
    CATEGORY_RESUBMITTED: 'bike_rent.category_resubmitted',
    BIKE_SUBMITTED: 'bike_rent.bike_submitted',
    BIKE_APPROVED: 'bike_rent.bike_approved',
    BIKE_REJECTED: 'bike_rent.bike_rejected',
    BIKE_RESUBMITTED: 'bike_rent.bike_resubmitted',
    COUPON_SUBMITTED: 'bike_rent.coupon_submitted',
    COUPON_APPROVED: 'bike_rent.coupon_approved',
    COUPON_REJECTED: 'bike_rent.coupon_rejected',
    COUPON_RESUBMITTED: 'bike_rent.coupon_resubmitted',
});

const ADMIN_EVENTS = new Set([
    BIKE_RENT_NOTIFY_EVENTS.EXTENSION_REQUESTED,
    BIKE_RENT_NOTIFY_EVENTS.RETURN_REQUESTED,
    BIKE_RENT_NOTIFY_EVENTS.LATE_RETURN,
    BIKE_RENT_NOTIFY_EVENTS.PICKUP_DELAY,
    BIKE_RENT_NOTIFY_EVENTS.CATEGORY_SUBMITTED,
    BIKE_RENT_NOTIFY_EVENTS.CATEGORY_RESUBMITTED,
    BIKE_RENT_NOTIFY_EVENTS.BIKE_SUBMITTED,
    BIKE_RENT_NOTIFY_EVENTS.BIKE_RESUBMITTED,
    BIKE_RENT_NOTIFY_EVENTS.COUPON_SUBMITTED,
    BIKE_RENT_NOTIFY_EVENTS.COUPON_RESUBMITTED,
]);

const handlers = new Set();

/** Register a listener (tests / future notification service). */
export function onBikeRentNotification(handler) {
    if (typeof handler === 'function') handlers.add(handler);
    return () => handlers.delete(handler);
}

/**
 * Emit a notification event. Never throws to callers.
 * @param {string} event
 * @param {object} payload
 */
export async function emitBikeRentNotification(event, payload = {}) {
    const envelope = {
        module: 'bike-rent',
        event,
        at: new Date().toISOString(),
        userId: payload.userId ? String(payload.userId) : null,
        bookingId: payload.bookingId ? String(payload.bookingId) : null,
        bookingNumber: payload.bookingNumber || null,
        meta: payload.meta || null,
        channels: payload.channels || ['push', 'inbox'],
        title: payload.title || null,
        body: payload.body || null,
        adminAudience: Boolean(payload.adminAudience) || ADMIN_EVENTS.has(event),
    };

    try {
        logger.info(`[bike-rent:notify] ${event} booking=${envelope.bookingId || '-'}`);
    } catch { /* ignore */ }

    try {
        if (envelope.userId || envelope.adminAudience) {
            await BikeRentNotification.create({
                userId: envelope.userId || null,
                adminAudience: envelope.adminAudience,
                event,
                title: envelope.title || '',
                body: envelope.body || '',
                bookingId: envelope.bookingId || null,
                bookingNumber: envelope.bookingNumber || '',
                meta: envelope.meta,
                channels: envelope.channels,
            });
        }
    } catch (err) {
        try {
            logger.error(`[bike-rent:notify] persist error: ${err.message}`);
        } catch { /* ignore */ }
    }

    for (const handler of handlers) {
        try {
            await handler(envelope);
        } catch (err) {
            try {
                logger.error(`[bike-rent:notify] handler error: ${err.message}`);
            } catch { /* ignore */ }
        }
    }

    return envelope;
}

export async function listUserNotifications(userId, { limit = 30 } = {}) {
    const docs = await BikeRentNotification.find({ userId })
        .sort({ createdAt: -1 })
        .limit(Math.min(100, Math.max(1, Number(limit) || 30)))
        .lean();
    return docs.map((d) => ({
        id: String(d._id),
        event: d.event,
        title: d.title,
        body: d.body,
        bookingId: d.bookingId ? String(d.bookingId) : null,
        bookingNumber: d.bookingNumber || '',
        read: Boolean(d.read),
        meta: d.meta,
        createdAt: d.createdAt,
    }));
}

export async function markNotificationRead(userId, notificationId) {
    await BikeRentNotification.updateOne(
        { _id: notificationId, userId },
        { $set: { read: true } },
    );
    return { id: String(notificationId), read: true };
}

export function notifyBookingConfirmation(booking) {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.BOOKING_SUBMITTED, {
        userId: booking.userId,
        bookingId: booking._id || booking.id,
        bookingNumber: booking.bookingNumber,
        title: 'Booking request submitted',
        body: `Your booking request has been submitted. It will be confirmed after admin approval.`,
        meta: { status: booking.status },
    });
}

export function notifyBookingApproved(booking) {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.BOOKING_APPROVED, {
        userId: booking.userId,
        bookingId: booking._id || booking.id,
        bookingNumber: booking.bookingNumber,
        title: 'Booking approved',
        body: 'Your bike booking has been confirmed. Please complete payment to reserve the bike.',
        meta: { status: booking.status },
    });
}

export function notifyBookingRejected(booking, reason = '') {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.BOOKING_REJECTED, {
        userId: booking.userId,
        bookingId: booking._id || booking.id,
        bookingNumber: booking.bookingNumber,
        title: 'Booking rejected',
        body: reason
            ? `Your bike booking request has been rejected. Reason: ${reason}`
            : 'Your bike booking request has been rejected.',
        meta: { status: booking.status, reason },
    });
}

export function notifyPaymentSuccess(booking) {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.PAYMENT_SUCCESS, {
        userId: booking.userId,
        bookingId: booking._id || booking.id,
        bookingNumber: booking.bookingNumber,
        title: 'Payment successful',
        body: `Your bike is reserved. Pickup code: ${booking.pickupCode || '—'}`,
        meta: { status: booking.status, paymentMethod: booking.payment?.method },
    });
}

export function notifyPickupReminder(booking) {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.PICKUP_REMINDER, {
        userId: booking.userId,
        bookingId: booking._id || booking.id,
        bookingNumber: booking.bookingNumber,
        title: 'Pickup reminder',
        body: `Pickup window for ${booking.bookingNumber} is approaching.`,
        meta: { startAt: booking.startAt, pickupWindowEndsAt: booking.pickupWindowEndsAt },
    });
}

export function notifyReturnReminder(booking) {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.RETURN_REMINDER, {
        userId: booking.userId,
        bookingId: booking._id || booking.id,
        bookingNumber: booking.bookingNumber,
        title: 'Return reminder',
        body: `Please return your bike by ${booking.endAt ? new Date(booking.endAt).toLocaleString() : 'the scheduled time'}.`,
        meta: { endAt: booking.endAt },
    });
}

export function notifyBookingCancelled(booking, reason = '') {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.BOOKING_CANCELLED, {
        userId: booking.userId,
        bookingId: booking._id || booking.id,
        bookingNumber: booking.bookingNumber,
        title: 'Booking cancelled',
        body: reason || `Booking ${booking.bookingNumber} was cancelled.`,
        meta: { reason, status: booking.status },
    });
}

export function notifyDepositRefunded(booking, amount = 0) {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.DEPOSIT_REFUNDED, {
        userId: booking.userId,
        bookingId: booking._id || booking.id,
        bookingNumber: booking.bookingNumber,
        title: 'Deposit refunded',
        body: `₹${amount} security deposit credited to your wallet.`,
        meta: { amount, depositRefunded: booking.money?.depositRefunded },
    });
}

export function notifyInspectionCompleted(booking, { lateFee = 0, damageFee = 0 } = {}) {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.INSPECTION_COMPLETED, {
        userId: booking.userId,
        bookingId: booking._id || booking.id,
        bookingNumber: booking.bookingNumber,
        title: 'Inspection completed',
        body: `Return inspection finished for ${booking.bookingNumber}.`,
        meta: { lateFee, damageFee, status: booking.status },
    });
}

export function notifyBookingExpired(booking) {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.BOOKING_EXPIRED, {
        userId: booking.userId,
        bookingId: booking._id || booking.id,
        bookingNumber: booking.bookingNumber,
        title: 'Booking expired',
        body: `Payment window ended for ${booking.bookingNumber}. The bike was released.`,
        meta: { status: 'expired' },
    });
}

export function notifyRentalExtended(booking) {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.RENTAL_EXTENDED, {
        userId: booking.userId,
        bookingId: booking._id || booking.id,
        bookingNumber: booking.bookingNumber,
        title: 'Rental extended',
        body: `New return time: ${booking.endAt ? new Date(booking.endAt).toLocaleString() : '—'}`,
        meta: { endAt: booking.endAt },
    });
}

export function notifyReturnRequested(booking) {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.RETURN_REQUESTED, {
        userId: booking.userId,
        bookingId: booking._id || booking.id,
        bookingNumber: booking.bookingNumber,
        title: 'Return requested',
        body: 'Your return request was submitted. Awaiting inspection.',
        meta: { status: booking.status },
    });
}

export function notifyNoShow(booking) {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.NO_SHOW, {
        userId: booking.userId,
        bookingId: booking._id || booking.id,
        bookingNumber: booking.bookingNumber,
        title: 'Marked as no-show',
        body: `Pickup window missed for ${booking.bookingNumber}.`,
        meta: { status: 'no_show' },
    });
}

export function notifyNoShowOverridden(booking, reason = '') {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.NO_SHOW_OVERRIDDEN, {
        userId: booking.userId,
        bookingId: booking._id || booking.id,
        bookingNumber: booking.bookingNumber,
        title: 'Your booking was restored',
        body: `Your no-show booking ${booking.bookingNumber} has been restored — you can collect the bike again.`,
        meta: { status: 'reserved', reason },
    });
}

export function notifyExtensionRequested(booking, { conflict = null } = {}) {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.EXTENSION_REQUESTED, {
        userId: booking.userId,
        bookingId: booking._id || booking.id,
        bookingNumber: booking.bookingNumber,
        title: 'Extension request received',
        body: `Your extension request for ${booking.bookingNumber} conflicts with another booking and needs admin approval.`,
        meta: {
            requestedEndAt: booking.pendingExtension?.requestedEndAt,
            conflictBookingId: conflict?.bookingId || null,
        },
        channels: ['push', 'inbox', 'admin'],
    });
}

export function notifyExtensionApproved(booking) {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.EXTENSION_APPROVED, {
        userId: booking.userId,
        bookingId: booking._id || booking.id,
        bookingNumber: booking.bookingNumber,
        title: 'Extension approved',
        body: `Your extension request for ${booking.bookingNumber} has been approved.`,
        meta: { endAt: booking.endAt, status: booking.status },
    });
}

export function notifyExtensionRejected(booking, reason = '') {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.EXTENSION_REJECTED, {
        userId: booking.userId,
        bookingId: booking._id || booking.id,
        bookingNumber: booking.bookingNumber,
        title: 'Extension rejected',
        body: reason
            ? `Your extension request for ${booking.bookingNumber} was rejected. Reason: ${reason}`
            : `Your extension request for ${booking.bookingNumber} was rejected.`,
        meta: { reason },
    });
}

export function notifyBikeReassigned(booking, { fromBikeId = null, toBikeId = null, reason = '' } = {}) {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.BIKE_REASSIGNED, {
        userId: booking.userId,
        bookingId: booking._id || booking.id,
        bookingNumber: booking.bookingNumber,
        title: 'Bike reassigned',
        body: `A different bike has been assigned to your booking ${booking.bookingNumber}.`,
        meta: {
            fromBikeId: fromBikeId ? String(fromBikeId) : null,
            toBikeId: toBikeId ? String(toBikeId) : null,
            reason,
        },
    });
}

export function notifyLateReturn(booking) {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.LATE_RETURN, {
        userId: booking.userId,
        bookingId: booking._id || booking.id,
        bookingNumber: booking.bookingNumber,
        title: 'Late return',
        body: `Your bike return for ${booking.bookingNumber} is overdue.`,
        meta: { endAt: booking.endAt },
    });
}

export function notifyPickupDelay(booking) {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.PICKUP_DELAY, {
        userId: booking.userId,
        bookingId: booking._id || booking.id,
        bookingNumber: booking.bookingNumber,
        title: 'Pickup delayed',
        body: `Pickup for ${booking.bookingNumber} has not been completed yet.`,
        meta: { startAt: booking.startAt, pickupWindowEndsAt: booking.pickupWindowEndsAt },
    });
}

export function notifyCategorySubmitted(category, vendor) {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.CATEGORY_SUBMITTED, {
        adminAudience: true,
        title: 'New category pending approval',
        body: `${vendor?.businessName || 'A vendor'} submitted "${category.name}" for approval.`,
        meta: { categoryId: String(category._id || category.id), vendorId: category.vendorId ? String(category.vendorId) : null },
    });
}

export function notifyCategoryResubmitted(category, vendor) {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.CATEGORY_RESUBMITTED, {
        adminAudience: true,
        title: 'Category resubmitted for approval',
        body: `${vendor?.businessName || 'A vendor'} resubmitted "${category.name}" after fixing it.`,
        meta: { categoryId: String(category._id || category.id), vendorId: category.vendorId ? String(category.vendorId) : null },
    });
}

export function notifyCategoryApproved(category) {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.CATEGORY_APPROVED, {
        userId: category.vendorId,
        title: 'Category approved',
        body: `Your category "${category.name}" has been approved and is now live.`,
        meta: { categoryId: String(category._id || category.id) },
    });
}

export function notifyCategoryRejected(category, reason = '') {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.CATEGORY_REJECTED, {
        userId: category.vendorId,
        title: 'Category rejected',
        body: reason
            ? `Your category "${category.name}" was rejected. Reason: ${reason}`
            : `Your category "${category.name}" was rejected.`,
        meta: { categoryId: String(category._id || category.id), reason },
    });
}

export function notifyBikeSubmitted(bike, vendor) {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.BIKE_SUBMITTED, {
        adminAudience: true,
        title: 'New bike pending approval',
        body: `${vendor?.businessName || 'A vendor'} submitted "${bike.name}" for approval.`,
        meta: { bikeId: String(bike._id || bike.id), vendorId: bike.vendorId ? String(bike.vendorId) : null },
    });
}

export function notifyBikeResubmitted(bike, vendor) {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.BIKE_RESUBMITTED, {
        adminAudience: true,
        title: 'Bike resubmitted for approval',
        body: `${vendor?.businessName || 'A vendor'} resubmitted "${bike.name}" after fixing it.`,
        meta: { bikeId: String(bike._id || bike.id), vendorId: bike.vendorId ? String(bike.vendorId) : null },
    });
}

export function notifyBikeApproved(bike) {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.BIKE_APPROVED, {
        userId: bike.vendorId,
        title: 'Bike approved',
        body: `Your bike "${bike.name}" has been approved and is now live.`,
        meta: { bikeId: String(bike._id || bike.id) },
    });
}

export function notifyBikeRejected(bike, reason = '') {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.BIKE_REJECTED, {
        userId: bike.vendorId,
        title: 'Bike rejected',
        body: reason
            ? `Your bike "${bike.name}" was rejected. Reason: ${reason}`
            : `Your bike "${bike.name}" was rejected.`,
        meta: { bikeId: String(bike._id || bike.id), reason },
    });
}

export function notifyCouponSubmitted(coupon, vendor) {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.COUPON_SUBMITTED, {
        adminAudience: true,
        title: 'New coupon pending approval',
        body: `${vendor?.businessName || 'A vendor'} submitted coupon "${coupon.code}" for approval.`,
        meta: { couponId: String(coupon._id || coupon.id), vendorId: coupon.vendorId ? String(coupon.vendorId) : null },
    });
}

export function notifyCouponResubmitted(coupon, vendor) {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.COUPON_RESUBMITTED, {
        adminAudience: true,
        title: 'Coupon resubmitted for approval',
        body: `${vendor?.businessName || 'A vendor'} resubmitted coupon "${coupon.code}" after fixing it.`,
        meta: { couponId: String(coupon._id || coupon.id), vendorId: coupon.vendorId ? String(coupon.vendorId) : null },
    });
}

export function notifyCouponApproved(coupon) {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.COUPON_APPROVED, {
        userId: coupon.vendorId,
        title: 'Coupon approved',
        body: `Your coupon "${coupon.code}" has been approved and is now live.`,
        meta: { couponId: String(coupon._id || coupon.id) },
    });
}

export function notifyCouponRejected(coupon, reason = '') {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.COUPON_REJECTED, {
        userId: coupon.vendorId,
        title: 'Coupon rejected',
        body: reason
            ? `Your coupon "${coupon.code}" was rejected. Reason: ${reason}`
            : `Your coupon "${coupon.code}" was rejected.`,
        meta: { couponId: String(coupon._id || coupon.id), reason },
    });
}

export function notifyDepositDeducted(booking, amount = 0, reason = '') {
    return emitBikeRentNotification(BIKE_RENT_NOTIFY_EVENTS.DEPOSIT_DEDUCTED, {
        userId: booking.userId,
        bookingId: booking._id || booking.id,
        bookingNumber: booking.bookingNumber,
        title: 'Security deposit deducted',
        body: reason
            ? `₹${amount} deducted from your security deposit. Reason: ${reason}`
            : `₹${amount} deducted from your security deposit.`,
        meta: { amount, reason },
    });
}
