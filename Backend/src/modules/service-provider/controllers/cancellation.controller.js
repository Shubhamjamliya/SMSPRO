import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError, NotFoundError } from '../../../core/auth/errors.js';
import { previewCustomerCancellation, cancelByCustomer, cancelByProvider } from '../services/cancellation.service.js';

const handle = (error, res, next) => {
  if (error instanceof ValidationError) return sendError(res, error.statusCode || 400, error.message);
  if (error instanceof NotFoundError) return sendError(res, error.statusCode || 404, error.message);
  return next(error);
};

export const previewCancellationController = asyncHandler(async (req, res, next) => {
  try {
    const result = await previewCustomerCancellation(req.user.userId, req.params.id);
    return sendResponse(res, 200, 'Cancellation preview', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const cancelByCustomerController = asyncHandler(async (req, res, next) => {
  try {
    const booking = await cancelByCustomer(req.user.userId, req.params.id, req.body?.reason);
    return sendResponse(res, 200, 'Booking cancelled', { booking });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const cancelByProviderController = asyncHandler(async (req, res, next) => {
  try {
    const booking = await cancelByProvider(req.user.userId, req.params.id, req.body?.reason);
    return sendResponse(res, 200, 'Booking cancelled', { booking });
  } catch (error) {
    return handle(error, res, next);
  }
});
