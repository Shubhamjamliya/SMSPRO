import { sendResponse } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as catalogService from '../services/catalog.service.js';
import * as userBookingService from '../services/userBooking.service.js';
import * as bookingEngine from '../services/bookingEngine.service.js';

export const listPublicBikes = asyncHandler(async (req, res) => {
    const data = await catalogService.listPublicBikes(req.query);
    return sendResponse(res, 200, 'Bikes fetched successfully', data);
});

export const getPublicBikeById = asyncHandler(async (req, res) => {
    const bike = await catalogService.getPublicBikeById(req.params.id, req.query);
    return sendResponse(res, 200, 'Bike fetched successfully', { bike });
});

export const listPublicCategories = asyncHandler(async (req, res) => {
    const categories = await catalogService.listPublicCategories(req.query);
    return sendResponse(res, 200, 'Categories fetched successfully', { categories });
});

export const quoteBooking = asyncHandler(async (req, res) => {
    const data = await catalogService.quoteBike({
        ...req.body,
        userId: req.user?.userId || req.body?.userId || null,
    });
    return sendResponse(res, 200, 'Quote calculated successfully', data);
});

export const checkBookingAvailability = asyncHandler(async (req, res) => {
    const { checkAvailability } = await import('../services/availability.service.js');
    const data = await checkAvailability(req.body);
    return sendResponse(res, 200, data.available ? 'Slot available' : 'Slot unavailable', data);
});

export const getBikeAvailability = asyncHandler(async (req, res) => {
    const { getBikeAvailabilityCalendar } = await import('../services/availability.service.js');
    const data = await getBikeAvailabilityCalendar(req.params.id, req.query);
    return sendResponse(res, 200, 'Availability fetched successfully', data);
});

export const getPublicSettings = asyncHandler(async (req, res) => {
    const settings = await userBookingService.getPublicModuleSettings({
        bikeId: req.query.bikeId || null,
    });
    return sendResponse(res, 200, 'Settings fetched successfully', { settings });
});

export const listMyBookings = asyncHandler(async (req, res) => {
    const data = await userBookingService.listMyBookings(req.user.userId, req.query);
    return sendResponse(res, 200, 'Bookings fetched successfully', data);
});

export const getMyBookingById = asyncHandler(async (req, res) => {
    const booking = await userBookingService.getMyBookingById(req.user.userId, req.params.id);
    return sendResponse(res, 200, 'Booking fetched successfully', { booking });
});

export const getMyInvoice = asyncHandler(async (req, res) => {
    const { getUserInvoiceByBooking } = await import('../services/invoice.service.js');
    const invoice = await getUserInvoiceByBooking(req.params.id, req.user.userId);
    return sendResponse(res, 200, 'Invoice fetched successfully', { invoice });
});

export const createBooking = asyncHandler(async (req, res) => {
    const booking = await bookingEngine.createBooking(req.user.userId, req.body, req.user);
    return sendResponse(
        res,
        201,
        'Your booking request has been submitted. It will be confirmed after admin approval.',
        { booking },
    );
});

/** @deprecated alias kept for Phase 3 clients */
export const createDraftBooking = createBooking;

export const createPaymentOrder = asyncHandler(async (req, res) => {
    const data = await bookingEngine.createRazorpayPaymentOrder(req.user.userId, req.params.id);
    return sendResponse(res, 200, 'Payment order created', data);
});

export const verifyPayment = asyncHandler(async (req, res) => {
    const booking = await bookingEngine.verifyRazorpayPayment(req.user.userId, req.params.id, req.body);
    return sendResponse(res, 200, 'Payment verified. Bike reserved.', { booking });
});

export const payWithWallet = asyncHandler(async (req, res) => {
    const booking = await bookingEngine.payWithWallet(req.user.userId, req.params.id);
    return sendResponse(res, 200, 'Wallet payment successful. Bike reserved.', { booking });
});

export const paymentFailed = asyncHandler(async (req, res) => {
    const booking = await bookingEngine.recordPaymentFailure(
        req.user.userId,
        req.params.id,
        req.body?.reason,
    );
    return sendResponse(res, 200, 'Payment failure recorded', { booking });
});

export const cancelMyBooking = asyncHandler(async (req, res) => {
    const booking = await bookingEngine.cancelBooking(
        req.user.userId,
        req.params.id,
        { reason: req.body?.reason, actor: 'user' },
        req.user,
    );
    return sendResponse(res, 200, 'Booking cancelled', { booking });
});

export const previewMyCancellation = asyncHandler(async (req, res) => {
    const preview = await bookingEngine.previewCancellation(
        req.user.userId,
        req.params.id,
        { actor: 'user' },
    );
    return sendResponse(res, 200, 'Cancellation preview', { preview });
});

export const previewMyReturnSettlement = asyncHandler(async (req, res) => {
    const preview = await bookingEngine.previewMyReturnSettlement(
        req.user.userId,
        req.params.id,
    );
    return sendResponse(res, 200, 'Return settlement preview', { preview });
});

export const getMyWallet = asyncHandler(async (req, res) => {
    const { getWalletBalance, getWalletTransactions } = await import('../../../core/wallet/index.js');
    const [balance, transactions] = await Promise.all([
        getWalletBalance(req.user.userId),
        getWalletTransactions(req.user.userId, {
            page: Number(req.query.page) || 1,
            limit: Number(req.query.limit) || 30,
            // Bike wallet UI expects bike-rental ledger rows by default.
            source: req.query.source || 'BIKE_RENTAL',
            type: req.query.type || null,
        }),
    ]);
    return sendResponse(res, 200, 'Wallet fetched', {
        wallet: balance,
        ...transactions,
    });
});

export const confirmPickup = asyncHandler(async (req, res) => {
    const booking = await bookingEngine.confirmPickup(req.user.userId, req.params.id, req.body);
    return sendResponse(res, 200, 'Pickup confirmed. Rental is active.', { booking });
});

export const requestReturn = asyncHandler(async (req, res) => {
    const booking = await bookingEngine.requestReturn(req.user.userId, req.params.id, req.body);
    return sendResponse(res, 200, 'Return requested', { booking });
});

export const quoteExtension = asyncHandler(async (req, res) => {
    const data = await bookingEngine.quoteExtension(req.user.userId, req.params.id, req.body);
    return sendResponse(res, 200, 'Extension quote calculated', data);
});

export const listMyNotifications = asyncHandler(async (req, res) => {
    const { listUserNotifications } = await import('../services/bookingNotifications.service.js');
    const notifications = await listUserNotifications(req.user.userId, {
        limit: req.query.limit,
    });
    return sendResponse(res, 200, 'Notifications fetched', { notifications });
});

export const markMyNotificationRead = asyncHandler(async (req, res) => {
    const { markNotificationRead } = await import('../services/bookingNotifications.service.js');
    const result = await markNotificationRead(req.user.userId, req.params.id);
    return sendResponse(res, 200, 'Notification marked read', result);
});

export const requestExtension = asyncHandler(async (req, res) => {
    const data = await bookingEngine.requestExtension(req.user.userId, req.params.id, req.body);
    return sendResponse(
        res,
        200,
        data.canExtendImmediately
            ? 'Extension available — proceed to payment'
            : 'Extension request submitted for admin review',
        data,
    );
});

export const createExtensionPayment = asyncHandler(async (req, res) => {
    const data = await bookingEngine.createExtensionRazorpayOrder(req.user.userId, req.params.id, req.body);
    return sendResponse(res, 200, 'Extension payment order created', data);
});

export const extendRental = asyncHandler(async (req, res) => {
    const booking = await bookingEngine.extendRental(req.user.userId, req.params.id, req.body);
    return sendResponse(res, 200, 'Rental extended', { booking });
});

export const submitReview = asyncHandler(async (req, res) => {
    const review = await userBookingService.submitReview(req.user.userId, req.params.id, req.body);
    return sendResponse(res, 201, 'Review submitted successfully', { review });
});

export const createLateBalancePaymentOrder = asyncHandler(async (req, res) => {
    const data = await bookingEngine.createRemainingLateRazorpayOrder(
        req.user.userId,
        req.params.id,
    );
    return sendResponse(res, 200, 'Late balance payment order created', data);
});

export const verifyLateBalancePayment = asyncHandler(async (req, res) => {
    const booking = await bookingEngine.verifyRemainingLateRazorpayPayment(
        req.user.userId,
        req.params.id,
        req.body,
    );
    return sendResponse(res, 200, 'Late balance paid successfully', { booking });
});

export const payLateBalanceWithWallet = asyncHandler(async (req, res) => {
    const booking = await bookingEngine.payRemainingLateBalanceWithWallet(
        req.user.userId,
        req.params.id,
    );
    return sendResponse(res, 200, 'Late balance paid from wallet', { booking });
});
