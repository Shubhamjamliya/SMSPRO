import { sendResponse } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as tripService from '../services/trip.service.js';
import * as tripDispatchService from '../services/tripDispatch.service.js';
import * as vehicleService from '../services/vehicle.service.js';

export const listPublicVehicles = asyncHandler(async (_req, res) => {
    const vehicles = await vehicleService.listPublicVehicles();
    return sendResponse(res, 200, 'Vehicles fetched successfully', { vehicles });
});

export const listAvailableVehicles = asyncHandler(async (req, res) => {
    const data = await vehicleService.listAvailableVehiclesForRoute(req.body || {});
    return sendResponse(res, 200, 'Available vehicles fetched successfully', data);
});

export const quoteTrip = asyncHandler(async (req, res) => {
    const quote = await tripService.quoteTrip(req.body);
    return sendResponse(res, 200, 'Fare quote generated successfully', { quote });
});

export const createTrip = asyncHandler(async (req, res) => {
    const trip = await tripService.createTrip(req.user?.userId, req.body);
    return sendResponse(res, 201, 'Trip created successfully', { trip });
});

export const listMyTrips = asyncHandler(async (req, res) => {
    const data = await tripService.listTripsForUser(req.user?.userId, req.query);
    return sendResponse(res, 200, 'Trips fetched successfully', data);
});

export const getMyTripById = asyncHandler(async (req, res) => {
    const trip = await tripService.getTripById(req.params.id, {
        userId: req.user?.userId,
        includeDriver: true,
    });
    return sendResponse(res, 200, 'Trip fetched successfully', { trip });
});

export const cancelMyTrip = asyncHandler(async (req, res) => {
    const trip = await tripService.cancelTripByUser(req.user?.userId, req.params.id, req.body);
    return sendResponse(res, 200, 'Trip cancelled successfully', { trip });
});

export const payWithWallet = asyncHandler(async (req, res) => {
    const { payWithWallet: pay } = await import('../services/tripPayment.service.js');
    const trip = await pay(req.user?.userId, req.params.id);
    return sendResponse(res, 200, 'Paid with wallet successfully', { trip });
});

export const createUserRazorpayOrder = asyncHandler(async (req, res) => {
    const { createUserRazorpayOrder: createOrder } = await import('../services/tripPayment.service.js');
    const data = await createOrder(req.user?.userId, req.params.id);
    return sendResponse(res, 200, 'Razorpay order created successfully', data);
});

export const verifyUserRazorpayPayment = asyncHandler(async (req, res) => {
    const { verifyUserRazorpayPayment: verify } = await import('../services/tripPayment.service.js');
    const trip = await verify(req.user?.userId, req.params.id, req.body || {});
    return sendResponse(res, 200, 'Payment verified successfully', { trip });
});

export const requestTripSearch = asyncHandler(async (req, res) => {
    const { requestTripSearch: search } = await import('../services/tripPayment.service.js');
    const data = await search(req.user?.userId, req.params.id);
    return sendResponse(res, 200, 'Partner search refreshed', data);
});

export const payExtraLoadingWithWallet = asyncHandler(async (req, res) => {
    const { payExtraLoadingWithWallet: pay } = await import('../services/tripPayment.service.js');
    const trip = await pay(req.user?.userId, req.params.id);
    return sendResponse(res, 200, 'Payment successful', { trip });
});

export const getUserPaymentStatus = asyncHandler(async (req, res) => {
    const { getUserPaymentStatus: getStatus } = await import('../services/tripPayment.service.js');
    const trip = await getStatus(req.user?.userId, req.params.id);
    return sendResponse(res, 200, 'Payment status fetched', { trip });
});

export const listAdminTrips = asyncHandler(async (req, res) => {
    const data = await tripService.listTripsAdmin(req.query);
    return sendResponse(res, 200, 'Trips fetched successfully', data);
});

export const getAdminTripById = asyncHandler(async (req, res) => {
    const trip = await tripService.getTripById(req.params.id, { includeOtp: true });
    return sendResponse(res, 200, 'Trip fetched successfully', { trip });
});

export const acceptTrip = asyncHandler(async (req, res) => {
    const trip = await tripDispatchService.acceptTrip(req.user?.userId, req.params.id);
    return sendResponse(res, 200, 'Trip accepted successfully', { trip });
});

export const getActivePartnerTrip = asyncHandler(async (req, res) => {
    const trip = await tripDispatchService.getActiveTripForPartner(req.user?.userId);
    return sendResponse(res, 200, 'Active trip fetched successfully', { trip });
});

export const listPartnerTrips = asyncHandler(async (req, res) => {
    const trips = await tripDispatchService.listPartnerTrips(req.user?.userId, req.query);
    return sendResponse(res, 200, 'Partner trips fetched successfully', { trips });
});

export const markArrived = asyncHandler(async (req, res) => {
    const trip = await tripDispatchService.markArrived(req.user?.userId, req.params.id);
    return sendResponse(res, 200, 'Marked arrived successfully', { trip });
});

export const startTrip = asyncHandler(async (req, res) => {
    const trip = await tripDispatchService.startTrip(req.user?.userId, req.params.id, req.body);
    return sendResponse(res, 200, 'Loading started successfully', { trip });
});

export const markLoaded = asyncHandler(async (req, res) => {
    const trip = await tripDispatchService.markLoaded(req.user?.userId, req.params.id);
    return sendResponse(res, 200, 'Parcel loaded successfully', { trip });
});

export const markAtDrop = asyncHandler(async (req, res) => {
    const trip = await tripDispatchService.markAtDrop(req.user?.userId, req.params.id, req.body);
    return sendResponse(res, 200, 'Arrived at drop — collect payment', { trip });
});

export const completeTrip = asyncHandler(async (req, res) => {
    const trip = await tripDispatchService.completeTrip(req.user?.userId, req.params.id, req.body);
    const extraDue = Number(trip?.payment?.extraDue || 0);
    const message = trip?.status === 'awaiting_payment'
        ? `₹${extraDue} pending — collect payment`
        : 'Trip completed successfully';
    return sendResponse(res, 200, message, { trip });
});

export const collectCash = asyncHandler(async (req, res) => {
    const { collectCash: collect } = await import('../services/tripPayment.service.js');
    const trip = await collect(req.user?.userId, req.params.id, req.body);
    return sendResponse(res, 200, 'Cash collected · trip completed', { trip });
});

export const createCollectQr = asyncHandler(async (req, res) => {
    const { createDriverCollectQr } = await import('../services/tripPayment.service.js');
    const data = await createDriverCollectQr(req.user?.userId, req.params.id, req.body);
    return sendResponse(res, 200, 'Payment QR created', data);
});

export const getPartnerPaymentStatus = asyncHandler(async (req, res) => {
    const { getPartnerPaymentStatus: getStatus } = await import('../services/tripPayment.service.js');
    const trip = await getStatus(req.user?.userId, req.params.id);
    return sendResponse(res, 200, 'Payment status fetched', { trip });
});
