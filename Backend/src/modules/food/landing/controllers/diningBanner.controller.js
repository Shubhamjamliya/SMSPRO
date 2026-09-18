import {
    listDiningBanners,
    createDiningBannersFromFiles,
    deleteDiningBanner,
    updateDiningBannerOrder,
    toggleDiningBannerStatus,
    updateDiningBanner
} from '../services/diningBanner.service.js';
import { sendResponse } from '../../../../utils/response.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import { invalidateCache } from '../../../../middleware/cache.js';

const invalidateDiningBannerCache = () => invalidateCache('dining_banners_public:*');

const parseContentMeta = (body = {}) => ({
    title: body.title,
    subtitle: body.subtitle,
    description: body.description,
    ctaText: body.ctaText,
    ctaLink: body.ctaLink,
    diningType: body.diningType,
});

export const listDiningBannersController = async (req, res, next) => {
    try {
        const data = await listDiningBanners();
        return sendResponse(res, 200, 'Dining banners fetched successfully', { banners: data });
    } catch (error) {
        next(error);
    }
};

export const uploadDiningBannersController = async (req, res, next) => {
    try {
        if (!req.files || !req.files.length) {
            throw new ValidationError('No files uploaded');
        }

        const results = await createDiningBannersFromFiles(req.files, parseContentMeta(req.body));
        await invalidateDiningBannerCache();
        const banners = results.filter((r) => r.success).map((r) => r.banner);
        return sendResponse(res, 201, 'Dining banners uploaded', { banners, results });
    } catch (error) {
        next(error);
    }
};

export const deleteDiningBannerController = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            throw new ValidationError('Banner id is required');
        }
        const result = await deleteDiningBanner(id);
        await invalidateDiningBannerCache();
        return sendResponse(res, 200, result.deleted ? 'Dining banner deleted' : 'Dining banner not found', result);
    } catch (error) {
        next(error);
    }
};

export const updateDiningBannerOrderController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { order, sortOrder } = req.body;
        const resolved = Number(typeof sortOrder === 'number' ? sortOrder : order);
        if (!id || Number.isNaN(resolved)) {
            throw new ValidationError('id and numeric order are required');
        }
        const updated = await updateDiningBannerOrder(id, resolved);
        await invalidateDiningBannerCache();
        return sendResponse(res, 200, 'Dining banner order updated', updated);
    } catch (error) {
        next(error);
    }
};

export const toggleDiningBannerStatusController = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            throw new ValidationError('Banner id is required');
        }
        const banners = await listDiningBanners();
        const banner = banners.find(b => b._id.toString() === id);
        if (!banner) {
            throw new ValidationError('Dining banner not found');
        }
        const nextActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : !banner.isActive;
        const updated = await toggleDiningBannerStatus(id, nextActive);
        await invalidateDiningBannerCache();
        return sendResponse(res, 200, 'Dining banner status updated', updated);
    } catch (error) {
        next(error);
    }
};

export const updateDiningBannerController = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            throw new ValidationError('Banner id is required');
        }

        const updated = await updateDiningBanner(id, {
            ...parseContentMeta(req.body),
            file: req.file
        });

        if (!updated) {
            throw new ValidationError('Dining banner not found');
        }

        await invalidateDiningBannerCache();
        return sendResponse(res, 200, 'Dining banner updated', updated);
    } catch (error) {
        next(error);
    }
};
