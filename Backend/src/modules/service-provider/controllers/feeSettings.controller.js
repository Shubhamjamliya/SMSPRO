import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError } from '../../../core/auth/errors.js';
import { getFeeSettings, updateFeeSettings } from '../services/pricing.service.js';

const handle = (error, res, next) => {
  if (error instanceof ValidationError) return sendError(res, error.statusCode || 400, error.message);
  return next(error);
};

export const getFeeSettingsController = asyncHandler(async (req, res, next) => {
  try {
    const settings = await getFeeSettings();
    return sendResponse(res, 200, 'Fee settings', { settings: settings.toObject() });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const updateFeeSettingsController = asyncHandler(async (req, res, next) => {
  try {
    const settings = await updateFeeSettings(req.body || {}, req.user);
    return sendResponse(res, 200, 'Fee settings updated', { settings });
  } catch (error) {
    return handle(error, res, next);
  }
});
