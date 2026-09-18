import {
    deleteLandingHeaderVideo,
    getLandingSettings,
    updateLandingSettings,
    uploadLandingHeaderVideo
} from '../services/landingSettings.service.js';
import { sendResponse } from '../../../../utils/response.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import { invalidateCache } from '../../../../middleware/cache.js';

const invalidateLandingSettingsCache = () => invalidateCache('landing_settings_public:*');

export const getAdminLandingSettingsController = async (req, res, next) => {
    try {
        const settings = await getLandingSettings();
        return sendResponse(res, 200, 'Landing settings fetched successfully', { settings });
    } catch (error) {
        next(error);
    }
};

export const updateAdminLandingSettingsController = async (req, res, next) => {
    try {
        const payload = req.body || {};
        if (typeof payload !== 'object') {
            throw new ValidationError('Invalid settings payload');
        }
        const updated = await updateLandingSettings(payload);
        await invalidateLandingSettingsCache();
        return sendResponse(res, 200, 'Landing settings updated successfully', { settings: updated });
    } catch (error) {
        next(error);
    }
};

export const uploadAdminLandingHeaderVideoController = async (req, res, next) => {
    try {
        const updated = await uploadLandingHeaderVideo(req.file);
        await invalidateLandingSettingsCache();
        return sendResponse(res, 200, 'Landing header video uploaded successfully', { settings: updated });
    } catch (error) {
        next(error);
    }
};

export const deleteAdminLandingHeaderVideoController = async (req, res, next) => {
    try {
        const updated = await deleteLandingHeaderVideo();
        await invalidateLandingSettingsCache();
        return sendResponse(res, 200, 'Landing header video removed successfully', { settings: updated });
    } catch (error) {
        next(error);
    }
};

