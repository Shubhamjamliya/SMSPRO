import { sendResponse } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as settingsService from '../services/settings.service.js';

export const getSettings = asyncHandler(async (_req, res) => {
    const settings = await settingsService.getSettings();
    return sendResponse(res, 200, 'Porter settings fetched successfully', { settings });
});

export const updateSettings = asyncHandler(async (req, res) => {
    const settings = await settingsService.updateSettings(req.body || {});
    return sendResponse(res, 200, 'Porter settings updated successfully', { settings });
});
