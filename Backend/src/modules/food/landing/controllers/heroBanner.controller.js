import {
    listHeroBanners,
    createHeroBannersFromFiles,
    deleteHeroBanner,
    updateHeroBannerOrder,
    toggleHeroBannerStatus,
    updateHeroBanner,
    linkHeroBannerRestaurants
} from '../services/heroBanner.service.js';
import { sendResponse } from '../../../../utils/response.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import { invalidateCache } from '../../../../middleware/cache.js';

const invalidateHeroBannerCache = () => invalidateCache('hero_banners_public:*');

const parseContentMeta = (body = {}) => ({
    title: body.title,
    subtitle: body.subtitle,
    description: body.description,
    ctaText: body.ctaText,
    ctaLink: body.ctaLink,
    zoneId: body.zoneId
});

const resolveSortOrder = (body = {}) => {
    if (typeof body.sortOrder === 'number') return body.sortOrder;
    if (typeof body.order === 'number') return body.order;
    const fromOrder = Number(body.order);
    const fromSort = Number(body.sortOrder);
    if (!Number.isNaN(fromOrder)) return fromOrder;
    if (!Number.isNaN(fromSort)) return fromSort;
    return null;
};

export const listHeroBannersController = async (req, res, next) => {
    try {
        const data = await listHeroBanners();
        return sendResponse(res, 200, 'Hero banners fetched successfully', { banners: data });
    } catch (error) {
        next(error);
    }
};

export const uploadHeroBannersController = async (req, res, next) => {
    try {
        if (!req.files || !req.files.length) {
            throw new ValidationError('No files uploaded');
        }

        const results = await createHeroBannersFromFiles(req.files, parseContentMeta(req.body));
        await invalidateHeroBannerCache();
        const banners = results.filter((r) => r.success).map((r) => r.banner);
        const errors = results.filter((r) => !r.success).map((r) => r.error);
        return sendResponse(res, 201, 'Hero banners uploaded', { banners, results, errors });
    } catch (error) {
        next(error);
    }
};

export const deleteHeroBannerController = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            throw new ValidationError('Banner id is required');
        }
        const result = await deleteHeroBanner(id);
        await invalidateHeroBannerCache();
        return sendResponse(res, 200, result.deleted ? 'Hero banner deleted' : 'Hero banner not found', result);
    } catch (error) {
        next(error);
    }
};

export const updateHeroBannerOrderController = async (req, res, next) => {
    try {
        const { id } = req.params;
        const sortOrder = resolveSortOrder(req.body);
        if (!id || sortOrder === null) {
            throw new ValidationError('id and numeric order/sortOrder are required');
        }
        const updated = await updateHeroBannerOrder(id, sortOrder);
        await invalidateHeroBannerCache();
        return sendResponse(res, 200, 'Hero banner order updated', updated);
    } catch (error) {
        next(error);
    }
};

export const toggleHeroBannerStatusController = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            throw new ValidationError('Banner id is required');
        }

        let nextActive = req.body?.isActive;
        if (typeof nextActive !== 'boolean') {
            const banners = await listHeroBanners();
            const banner = banners.find((b) => String(b._id) === String(id));
            if (!banner) {
                throw new ValidationError('Hero banner not found');
            }
            nextActive = !banner.isActive;
        }

        const updated = await toggleHeroBannerStatus(id, nextActive);
        await invalidateHeroBannerCache();
        return sendResponse(res, 200, 'Hero banner status updated', updated);
    } catch (error) {
        next(error);
    }
};

export const updateHeroBannerController = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            throw new ValidationError('Banner id is required');
        }

        const updated = await updateHeroBanner(id, {
            ...parseContentMeta(req.body),
            zoneId: req.body?.zoneId,
            linkedRestaurantIds: req.body?.linkedRestaurantIds || req.body?.restaurantIds,
            file: req.file
        });

        if (!updated) {
            throw new ValidationError('Hero banner not found');
        }

        await invalidateHeroBannerCache();
        return sendResponse(res, 200, 'Hero banner updated', updated);
    } catch (error) {
        next(error);
    }
};

export const linkHeroBannerRestaurantsController = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            throw new ValidationError('Banner id is required');
        }

        const restaurantIds = req.body?.restaurantIds || req.body?.linkedRestaurantIds || [];
        const updated = await linkHeroBannerRestaurants(id, restaurantIds);
        if (!updated) {
            throw new ValidationError('Hero banner not found');
        }

        await invalidateHeroBannerCache();
        return sendResponse(res, 200, 'Restaurants linked to banner', updated);
    } catch (error) {
        next(error);
    }
};
