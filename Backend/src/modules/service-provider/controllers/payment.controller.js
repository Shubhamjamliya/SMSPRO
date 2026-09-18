import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError, NotFoundError } from '../../../core/auth/errors.js';
import { payForBooking, verifyBookingPayment, markBookingPaymentFailed } from '../services/payment.service.js';

const handle = (error, res, next) => {
  if (error instanceof ValidationError) return sendError(res, error.statusCode || 400, error.message);
  if (error instanceof NotFoundError) return sendError(res, error.statusCode || 404, error.message);
  return next(error);
};

export const payForBookingController = asyncHandler(async (req, res, next) => {
  try {
    const { booking, razorpay } = await payForBooking(req.user.userId, req.params.id, req.body?.paymentMethod);
    const message = razorpay ? 'Payment started' : 'Payment completed';
    return sendResponse(res, 200, message, { booking, razorpay });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const verifyBookingPaymentController = asyncHandler(async (req, res, next) => {
  try {
    const booking = await verifyBookingPayment(req.user.userId, req.params.id, {
      razorpayOrderId: req.body?.razorpayOrderId,
      razorpayPaymentId: req.body?.razorpayPaymentId,
      razorpaySignature: req.body?.razorpaySignature,
    });
    return sendResponse(res, 200, 'Payment verified', { booking });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const markBookingPaymentFailedController = asyncHandler(async (req, res, next) => {
  try {
    const booking = await markBookingPaymentFailed(req.user.userId, req.params.id);
    return sendResponse(res, 200, 'Payment marked as failed', { booking });
  } catch (error) {
    return handle(error, res, next);
  }
});
