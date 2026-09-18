import {
    listUnder250Banners,
    createUnder250BannersFromFiles,
    deleteUnder250Banner,
    updateUnder250BannerOrder,
    toggleUnder250BannerStatus,
    updateUnder250Banner
} from '../services/under250Banner.service.js';
import { sendResponse } from '../../../../utils/response.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import { invalidateCache } from '../../../../middleware/cache.js';

const invalidateUnder250BannerCache = () => invalidateCache('under250_banners_public:*');

const parseContentMeta = (body = {}) => ({
    title: body.title,
    subtitle: body.subtitle,
    description: body.description,
    ctaText: body.ctaText,
    ctaLink: body.ctaLink,
    zoneId: body.zoneId,
});

export const listUnder250BannersController = async (req, res, next) => {
    try {
        const data = await listUnder250Banners();
        return sendResponse(res, 200, 'Under 250 banners fetched successfully', { banners: data });
    } catch (error) {
        next(error);
    }
};

export const uploadUnder250BannersController = async (req, res, next) => {
    try {
        if (!req.files || !req.files.length) {
            throw new ValidationError('No files uploaded');
        }

        const results = await createUnder250BannersFromFiles(req.files, parseContentMeta(req.body));
        await invalidateUnder250BannerCache();
        const banners = results.filter((r) => r.success).map((r) => r.banner);
        return sendResponse(res, 201, 'Under 250 banners uploaded', { banners, results });
    } catch (error) {
        next(error);
    }
};

export const deleteUnder250BannerController = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            throw new ValidationError('Banner id is required');
        }
        const result = await deleteUnder250Banner(id);
        await invalidateUnder250BannerCache();
        return sendResponse(res, 200, result.deleted ? 'Under 250 banner deleted' : 'Under 250 banner not found', result);
    } catch (error) {
        next(error);
    }
};

export const updateUnder250BannerOrderController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { order, sortOrder } = req.body;
        const resolved = Number(typeof sortOrder === 'number' ? sortOrder : order);
        if (!id || Number.isNaN(resolved)) {
            throw new ValidationError('id and numeric order are required');
        }
        const updated = await updateUnder250BannerOrder(id, resolved);
        await invalidateUnder250BannerCache();
        return sendResponse(res, 200, 'Under 250 banner order updated', updated);
    } catch (error) {
        next(error);
    }
};

export const toggleUnder250BannerStatusController = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            throw new ValidationError('Banner id is required');
        }
        const banner = await listUnder250Banners().then(list => list.find(b => b._id.toString() === id));
        if (!banner) {
            throw new ValidationError('Under 250 banner not found');
        }
        const nextActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : !banner.isActive;
        const updated = await toggleUnder250BannerStatus(id, nextActive);
        await invalidateUnder250BannerCache();
        return sendResponse(res, 200, 'Under 250 banner status updated', updated);
    } catch (error) {
        next(error);
    }
};

export const updateUnder250BannerController = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            throw new ValidationError('Banner id is required');
        }

        const updated = await updateUnder250Banner(id, {
            ...parseContentMeta(req.body),
            file: req.file
        });

        if (!updated) {
            throw new ValidationError('Under 250 banner not found');
        }

        await invalidateUnder250BannerCache();
        return sendResponse(res, 200, 'Under 250 banner updated', updated);
    } catch (error) {
        next(error);
    }
};
