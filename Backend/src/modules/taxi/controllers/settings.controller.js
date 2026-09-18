import { sendResponse } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import * as settingsService from '../services/settings.service.js';
import * as cashLimitService from '../services/cashLimit.service.js';

export const getSettings = asyncHandler(async (_req, res) => {
    const [settings, cashLimit] = await Promise.all([
        settingsService.getSettings(),
        cashLimitService.getCashLimitSettings(),
    ]);
    return sendResponse(res, 200, 'Taxi settings fetched successfully', {
        settings: { ...settings, cashLimit },
    });
});

export const updateSettings = asyncHandler(async (req, res) => {
    const body = req.body || {};
    let settings = await settingsService.getSettings();

    if (body.searchRadiusKm !== undefined) {
        settings = await settingsService.updateSettings({
            searchRadiusKm: body.searchRadiusKm,
        });
    }

    let cashLimit = await cashLimitService.getCashLimitSettings();
    if (body.cashLimit !== undefined) {
        if (typeof body.cashLimit === 'object' && body.cashLimit !== null) {
            cashLimit = await cashLimitService.updateCashLimitSettings(body.cashLimit);
        } else {
            cashLimit = await cashLimitService.updateCashLimitSettings({
                cashLimit: body.cashLimit,
                isActive: body.cashLimitActive,
            });
        }
    } else if (body.cashLimitActive !== undefined) {
        cashLimit = await cashLimitService.updateCashLimitSettings({
            isActive: body.cashLimitActive,
        });
    }

    return sendResponse(res, 200, 'Taxi settings updated successfully', {
        settings: { ...settings, cashLimit },
    });
});

export const getCashLimit = asyncHandler(async (_req, res) => {
    const settings = await cashLimitService.getCashLimitSettings();
    return sendResponse(res, 200, 'Taxi cash limit fetched', { settings });
});

export const updateCashLimit = asyncHandler(async (req, res) => {
    const settings = await cashLimitService.updateCashLimitSettings(req.body);
    return sendResponse(res, 200, 'Taxi cash limit updated', { settings });
});
