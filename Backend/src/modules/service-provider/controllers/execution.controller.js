import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError, NotFoundError } from '../../../core/auth/errors.js';
import {
  markOnTheWay,
  markArrived,
  startService,
  completeService,
  confirmCompletion,
  addExtraCharge,
  respondToExtraCharge,
  submitRating,
  submitCustomerRating,
} from '../services/execution.service.js';

const handle = (error, res, next) => {
  if (error instanceof ValidationError) return sendError(res, error.statusCode || 400, error.message);
  if (error instanceof NotFoundError) return sendError(res, error.statusCode || 404, error.message);
  return next(error);
};

export const markOnTheWayController = asyncHandler(async (req, res, next) => {
  try {
    const booking = await markOnTheWay(req.user.userId, req.params.id);
    return sendResponse(res, 200, 'Marked on the way', { booking });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const markArrivedController = asyncHandler(async (req, res, next) => {
  try {
    const booking = await markArrived(req.user.userId, req.params.id);
    return sendResponse(res, 200, 'Marked arrived', { booking });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const startServiceController = asyncHandler(async (req, res, next) => {
  try {
    const booking = await startService(req.user.userId, req.params.id, {
      otp: req.body?.otp,
      beforePhotos: req.body?.beforePhotos,
    });
    return sendResponse(res, 200, 'Service started', { booking });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const completeServiceController = asyncHandler(async (req, res, next) => {
  try {
    const booking = await completeService(req.user.userId, req.params.id, {
      afterPhotos: req.body?.afterPhotos,
      completionNotes: req.body?.completionNotes,
    });
    return sendResponse(res, 200, 'Service marked completed', { booking });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const confirmCompletionController = asyncHandler(async (req, res, next) => {
  try {
    const booking = await confirmCompletion(req.user.userId, req.params.id);
    return sendResponse(res, 200, 'Completion confirmed', { booking });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const addExtraChargeController = asyncHandler(async (req, res, next) => {
  try {
    const booking = await addExtraCharge(req.user.userId, req.params.id, {
      description: req.body?.description,
      amount: req.body?.amount,
    });
    return sendResponse(res, 200, 'Extra charge requested', { booking });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const respondToExtraChargeController = asyncHandler(async (req, res, next) => {
  try {
    const approve = req.body?.approve === true;
    const booking = await respondToExtraCharge(req.user.userId, req.params.id, req.params.chargeId, approve);
    return sendResponse(res, 200, approve ? 'Extra charge approved' : 'Extra charge rejected', { booking });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const submitRatingController = asyncHandler(async (req, res, next) => {
  try {
    const booking = await submitRating(req.user.userId, req.params.id, {
      stars: req.body?.stars,
      comment: req.body?.comment,
    });
    return sendResponse(res, 200, 'Rating submitted', { booking });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const submitCustomerRatingController = asyncHandler(async (req, res, next) => {
  try {
    const booking = await submitCustomerRating(req.user.userId, req.params.id, {
      stars: req.body?.stars,
      comment: req.body?.comment,
    });
    return sendResponse(res, 200, 'Rating submitted', { booking });
  } catch (error) {
    return handle(error, res, next);
  }
});
