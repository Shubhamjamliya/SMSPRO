import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError } from '../../../core/auth/errors.js';
import * as settings from '../services/settings.service.js';
import { validateUpdateSettingsDto } from '../validators/settings.validator.js';

const handle = (error, res, next) => {
  if (error instanceof ValidationError) {
    return sendError(res, error.statusCode || 400, error.message);
  }
  // Mongoose validation from the settings model's coherence checks.
  if (error?.name === 'ValidationError' && error?.errors) {
    const first = Object.values(error.errors)[0];
    return sendError(res, 400, first?.message || 'Invalid settings');
  }
  if (error?.name === 'ValidationError' && error?.message) {
    return sendError(res, 400, error.message);
  }
  return next(error);
};

export const getSettingsController = asyncHandler(async (req, res, next) => {
  try {
    const doc = await settings.getSettings({ force: true });
    return sendResponse(res, 200, 'Construction settings', { settings: doc });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const updateSettingsController = asyncHandler(async (req, res, next) => {
  try {
    const patch = validateUpdateSettingsDto(req.body);
    const doc = await settings.updateSettings(patch, req.user);
    return sendResponse(res, 200, 'Settings updated', { settings: doc });
  } catch (error) {
    return handle(error, res, next);
  }
});

/** The subset the customer and contractor apps may read. */
export const getPublicSettingsController = asyncHandler(async (req, res, next) => {
  try {
    const doc = await settings.getPublicSettings();
    return sendResponse(res, 200, 'Construction settings', { settings: doc });
  } catch (error) {
    return handle(error, res, next);
  }
});
