import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError } from '../../../core/auth/errors.js';
import {
  getMyAvailability,
  updateWeeklySchedule,
  addUnavailableDate,
  removeUnavailableDate,
} from '../services/availability.service.js';

const handle = (error, res, next) => {
  if (error instanceof ValidationError) return sendError(res, error.statusCode || 400, error.message);
  return next(error);
};

export const getMyAvailabilityController = asyncHandler(async (req, res, next) => {
  try {
    const result = await getMyAvailability(req.user.userId);
    return sendResponse(res, 200, 'Availability', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const updateWeeklyScheduleController = asyncHandler(async (req, res, next) => {
  try {
    const result = await updateWeeklySchedule(req.user.userId, req.body || {});
    return sendResponse(res, 200, 'Weekly schedule updated', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const addUnavailableDateController = asyncHandler(async (req, res, next) => {
  try {
    const result = await addUnavailableDate(req.user.userId, req.body || {});
    return sendResponse(res, 201, 'Unavailable date added', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const removeUnavailableDateController = asyncHandler(async (req, res, next) => {
  try {
    const result = await removeUnavailableDate(req.user.userId, req.params.id);
    return sendResponse(res, 200, 'Unavailable date removed', result);
  } catch (error) {
    return handle(error, res, next);
  }
});
