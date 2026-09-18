import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError, NotFoundError } from '../../../core/auth/errors.js';
import { listMyBookings, listProviderBookings, getBookingDetail } from '../services/booking.service.js';

const handle = (error, res, next) => {
  if (error instanceof ValidationError) return sendError(res, error.statusCode || 400, error.message);
  if (error instanceof NotFoundError) return sendError(res, error.statusCode || 404, error.message);
  return next(error);
};

export const listMyBookingsController = asyncHandler(async (req, res, next) => {
  try {
    const bookings = await listMyBookings(req.user.userId);
    return sendResponse(res, 200, 'My bookings', { bookings });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const listProviderBookingsController = asyncHandler(async (req, res, next) => {
  try {
    const bookings = await listProviderBookings(req.user.userId);
    return sendResponse(res, 200, 'Provider bookings', { bookings });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const getBookingDetailController = asyncHandler(async (req, res, next) => {
  try {
    const booking = await getBookingDetail(req.user, req.params.id);
    return sendResponse(res, 200, 'Booking detail', { booking });
  } catch (error) {
    return handle(error, res, next);
  }
});
