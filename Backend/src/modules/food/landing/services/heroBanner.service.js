import { FoodHeroBanner } from '../models/heroBanner.model.js';
import { v2 as cloudinary } from 'cloudinary';
import { uploadImageBufferDetailed } from '../../../../services/cloudinary.service.js';

const pickContentFields = (meta = {}) => ({
    title: typeof meta.title === 'string' ? meta.title.trim() : '',
    subtitle: typeof meta.subtitle === 'string' ? meta.subtitle.trim() : '',
    description: typeof meta.description === 'string' ? meta.description.trim() : '',
    ctaText: typeof meta.ctaText === 'string' ? meta.ctaText.trim() : '',
    ctaLink: typeof meta.ctaLink === 'string' ? meta.ctaLink.trim() : '',
});

const withAdminShape = (doc) => {
    if (!doc) return doc;
    return {
        ...doc,
        order: doc.sortOrder ?? 0,
        action: doc.ctaText || '',
    };
};

export const listHeroBanners = async () => {
    const docs = await FoodHeroBanner.find().sort({ sortOrder: 1, createdAt: -1 }).lean();
    return docs.map(withAdminShape);
};

export const createHeroBannersFromFiles = async (files, meta = {}) => {
    if (!files || !files.length) {
        return [];
    }

    const content = pickContentFields(meta);
    const results = [];
    const baseOrder = typeof meta.sortOrder === 'number' ? meta.sortOrder : await FoodHeroBanner.countDocuments();

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const uploadResult = await uploadImageBufferDetailed(file.buffer, 'food/hero-banners');

            const banner = await FoodHeroBanner.create({
                imageUrl: uploadResult.secure_url,
                publicId: uploadResult.public_id,
                ...content,
                zoneId: typeof meta.zoneId === 'string' ? meta.zoneId.trim() : '',
                linkedRestaurantIds: meta.linkedRestaurantIds || [],
                sortOrder: baseOrder + i,
                isActive: true
            });

            results.push({ success: true, banner: withAdminShape(banner.toObject()) });
        } catch (error) {
            results.push({ success: false, error: error.message });
        }
    }

    return results;
};

export const deleteHeroBanner = async (id) => {
    const doc = await FoodHeroBanner.findById(id);
    if (!doc) {
        return { deleted: false };
    }

    if (doc.publicId) {
        try {
            await cloudinary.uploader.destroy(doc.publicId);
        } catch {
            // ignore cloudinary deletion errors to avoid blocking deletion
        }
    }

    await doc.deleteOne();
    return { deleted: true };
};

export const updateHeroBannerOrder = async (id, sortOrder) => {
    const updated = await FoodHeroBanner.findByIdAndUpdate(
        id,
        { sortOrder },
        { new: true }
    ).lean();
    return withAdminShape(updated);
};

export const toggleHeroBannerStatus = async (id, isActive) => {
    const updated = await FoodHeroBanner.findByIdAndUpdate(
        id,
        { isActive },
        { new: true }
    ).lean();
    return withAdminShape(updated);
};

export const updateHeroBanner = async (id, updates = {}) => {
    const payload = {};
    const contentKeys = ['title', 'subtitle', 'description', 'ctaText', 'ctaLink'];

    for (const key of contentKeys) {
        if (Object.prototype.hasOwnProperty.call(updates, key) && typeof updates[key] === 'string') {
            payload[key] = updates[key].trim();
        }
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'zoneId')) {
        payload.zoneId = typeof updates.zoneId === 'string' ? updates.zoneId.trim() : '';
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'isActive') && typeof updates.isActive === 'boolean') {
        payload.isActive = updates.isActive;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'linkedRestaurantIds')) {
        const ids = Array.isArray(updates.linkedRestaurantIds) ? updates.linkedRestaurantIds : [];
        payload.linkedRestaurantIds = ids.filter(Boolean);
    }

    if (updates.file?.buffer) {
        const existing = await FoodHeroBanner.findById(id);
        if (!existing) return null;

        const uploadResult = await uploadImageBufferDetailed(updates.file.buffer, 'food/hero-banners');
        if (existing.publicId) {
            try {
                await cloudinary.uploader.destroy(existing.publicId);
            } catch {
                // ignore
            }
        }
        payload.imageUrl = uploadResult.secure_url;
        payload.publicId = uploadResult.public_id;
    }

    const updated = await FoodHeroBanner.findByIdAndUpdate(id, payload, {
        new: true
    }).lean();

    return withAdminShape(updated);
};

export const linkHeroBannerRestaurants = async (id, restaurantIds = []) => {
    const ids = Array.isArray(restaurantIds) ? restaurantIds.filter(Boolean) : [];
    const updated = await FoodHeroBanner.findByIdAndUpdate(
        id,
        { linkedRestaurantIds: ids },
        { new: true }
    ).lean();
    return withAdminShape(updated);
};
