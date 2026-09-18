import { sendResponse } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as bookingService from '../services/booking.service.js';
import * as bookingEngine from '../services/bookingEngine.service.js';

/** Admin must collect the code from the rider — never return it in admin API payloads. */
function forAdmin(booking) {
    if (!booking || typeof booking !== 'object') return booking;
    const next = { ...booking };
    delete next.pickupCode;
    return next;
}

export const listBookings = asyncHandler(async (req, res) => {
    const data = await bookingService.listBookings(req.query);
    return sendResponse(res, 200, 'Bookings fetched successfully', data);
});

export const getBookingById = asyncHandler(async (req, res) => {
    const booking = await bookingService.getBookingById(req.params.id);
    return sendResponse(res, 200, 'Booking fetched successfully', { booking });
});

export const patchBookingStatus = asyncHandler(async (req, res) => {
    const status = String(req.body?.status || '').trim();
    if (status === 'cancelled') {
        const booking = await bookingEngine.cancelBooking(
            null,
            req.params.id,
            { reason: req.body?.note || req.body?.reason, actor: 'admin' },
            req.user,
        );
        return sendResponse(res, 200, 'Booking cancelled', { booking: forAdmin(booking) });
    }
    if (status === 'no_show') {
        const booking = await bookingEngine.markNoShow(req.params.id, req.body?.note, req.user);
        return sendResponse(res, 200, 'Marked as no-show', { booking: forAdmin(booking) });
    }
    if (status === 'expired') {
        const booking = await bookingEngine.expireBooking(req.params.id, req.body?.note);
        return sendResponse(res, 200, 'Booking expired', { booking: forAdmin(booking) });
    }
    if (status === 'payment_pending' || status === 'approved') {
        const booking = await bookingEngine.adminApproveBooking(req.params.id, req.user, {
            note: req.body?.note,
        });
        return sendResponse(res, 200, 'Booking approved — awaiting payment', {
            booking: forAdmin(booking),
        });
    }
    if (status === 'rejected') {
        const booking = await bookingEngine.adminRejectBooking(req.params.id, req.user, {
            reason: req.body?.note || req.body?.reason,
        });
        return sendResponse(res, 200, 'Booking rejected', { booking: forAdmin(booking) });
    }
    const booking = await bookingService.updateBookingStatus(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Booking status updated successfully', {
        booking: forAdmin(booking),
    });
});

export const approveBooking = asyncHandler(async (req, res) => {
    const booking = await bookingEngine.adminApproveBooking(req.params.id, req.user, {
        note: req.body?.note,
    });
    return sendResponse(res, 200, 'Booking approved — awaiting payment', {
        booking: forAdmin(booking),
    });
});

export const rejectBooking = asyncHandler(async (req, res) => {
    const booking = await bookingEngine.adminRejectBooking(req.params.id, req.user, {
        reason: req.body?.reason || req.body?.note,
    });
    return sendResponse(res, 200, 'Booking rejected', { booking: forAdmin(booking) });
});

export const startRide = asyncHandler(async (req, res) => {
    const booking = await bookingEngine.adminStartRide(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Hub handover confirmed — rental started', {
        booking: forAdmin(booking),
    });
});

export const collectDeposit = asyncHandler(async (req, res) => {
    const booking = await bookingEngine.adminCollectDeposit(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Security deposit collected', { booking: forAdmin(booking) });
});

export const inspectBooking = asyncHandler(async (req, res) => {
    const booking = await bookingEngine.inspectAndSettle(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Inspection and deposit settlement completed', {
        booking: forAdmin(booking),
    });
});

export const previewLateCharges = asyncHandler(async (req, res) => {
    const preview = await bookingEngine.previewLateReturnCharges(req.params.id, {
        actualReturnAt: req.body?.actualReturnAt || req.query?.actualReturnAt,
        damageFee: req.body?.damageFee ?? req.query?.damageFee ?? 0,
        lateFeeOverride: req.body?.lateFee ?? req.query?.lateFee,
    });
    return sendResponse(res, 200, 'Late return charges preview', { preview });
});

export const previewCancellation = asyncHandler(async (req, res) => {
    const preview = await bookingEngine.previewCancellation(null, req.params.id, { actor: 'admin' });
    return sendResponse(res, 200, 'Cancellation preview', { preview });
});

export const collectLateBalance = asyncHandler(async (req, res) => {
    const booking = await bookingEngine.collectRemainingLateBalance(
        req.params.id,
        {
            method: req.body?.method,
            transactionId: req.body?.transactionId,
            note: req.body?.note,
        },
        req.user,
    );
    return sendResponse(res, 200, 'Remaining late balance collected', {
        booking: forAdmin(booking),
    });
});

export const releaseDepositRefund = asyncHandler(async (req, res) => {
    const booking = await bookingEngine.releaseScheduledDepositRefund(req.params.id, {
        force: req.body?.force !== false,
        note: req.body?.note || 'Refund released by admin',
        finalRefundAmount: req.body?.amount,
        reqUser: req.user,
    });
    return sendResponse(res, 200, 'Security deposit refund released to wallet', {
        booking: forAdmin(booking),
    });
});

export const resolveExtension = asyncHandler(async (req, res) => {
    const booking = await bookingEngine.adminResolveExtension(req.params.id, req.body, req.user);
    const action = String(req.body?.action || '').toLowerCase();
    return sendResponse(
        res,
        200,
        action === 'reject' ? 'Extension request rejected' : 'Extension request approved',
        { booking: forAdmin(booking) },
    );
});

export const reassignBooking = asyncHandler(async (req, res) => {
    const booking = await bookingEngine.reassignBookingBike(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Booking reassigned to another bike', {
        booking: forAdmin(booking),
    });
});

export const overrideNoShow = asyncHandler(async (req, res) => {
    const booking = await bookingEngine.overrideNoShow(
        req.params.id,
        { reason: req.body?.reason },
        req.user,
    );
    return sendResponse(res, 200, 'No-show overridden — booking restored', {
        booking: forAdmin(booking),
    });
});
