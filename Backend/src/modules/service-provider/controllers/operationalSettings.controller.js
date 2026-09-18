import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError } from '../../../core/auth/errors.js';
import { getOperationalSettings, updateOperationalSettings } from '../services/operationalSettings.service.js';

const handle = (error, res, next) => {
  if (error instanceof ValidationError) return sendError(res, error.statusCode || 400, error.message);
  return next(error);
};

export const getOperationalSettingsController = asyncHandler(async (req, res, next) => {
  try {
    const settings = await getOperationalSettings();
    return sendResponse(res, 200, 'Operational settings', { settings: settings.toObject() });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const updateOperationalSettingsController = asyncHandler(async (req, res, next) => {
  try {
    const settings = await updateOperationalSettings(req.body || {}, req.user);
    return sendResponse(res, 200, 'Operational settings updated', { settings });
  } catch (error) {
    return handle(error, res, next);
  }
});
