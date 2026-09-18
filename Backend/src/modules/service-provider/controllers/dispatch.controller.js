import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError, NotFoundError } from '../../../core/auth/errors.js';
import {
  createBookingRequest,
  acceptBookingRequest,
  rejectBookingRequest,
  listIncomingRequests,
} from '../services/dispatch.service.js';

const handle = (error, res, next) => {
  if (error instanceof ValidationError) return sendError(res, error.statusCode || 400, error.message);
  if (error instanceof NotFoundError) return sendError(res, error.statusCode || 404, error.message);
  return next(error);
};

export const createBookingRequestController = asyncHandler(async (req, res, next) => {
  try {
    const booking = await createBookingRequest(req.user.userId, req.body || {});
    return sendResponse(res, 201, 'Booking request sent', { booking });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const listIncomingRequestsController = asyncHandler(async (req, res, next) => {
  try {
    const requests = await listIncomingRequests(req.user.userId);
    return sendResponse(res, 200, 'Incoming requests', { requests });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const acceptRequestController = asyncHandler(async (req, res, next) => {
  try {
    const booking = await acceptBookingRequest(req.user.userId, req.params.id);
    return sendResponse(res, 200, 'Request accepted', { booking });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const rejectRequestController = asyncHandler(async (req, res, next) => {
  try {
    const booking = await rejectBookingRequest(req.user.userId, req.params.id);
    return sendResponse(res, 200, 'Request rejected', { booking });
  } catch (error) {
    return handle(error, res, next);
  }
});
