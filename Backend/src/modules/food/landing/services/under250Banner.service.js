import { FoodUnder250Banner } from '../models/under250Banner.model.js';
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

export const listUnder250Banners = async () => {
    const docs = await FoodUnder250Banner.find().sort({ sortOrder: 1, createdAt: -1 }).lean();
    return docs.map(withAdminShape);
};

export const createUnder250BannersFromFiles = async (files, meta = {}) => {
    if (!files || !files.length) {
        return [];
    }

    const content = pickContentFields(meta);
    const results = [];
    const baseOrder = typeof meta.sortOrder === 'number' ? meta.sortOrder : await FoodUnder250Banner.countDocuments();

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const uploadResult = await uploadImageBufferDetailed(file.buffer, 'food/under-250-banners');

            const banner = await FoodUnder250Banner.create({
                imageUrl: uploadResult.secure_url,
                publicId: uploadResult.public_id,
                ...content,
                zoneId: meta.zoneId,
                sortOrder: baseOrder + i,
                isActive: true,
            });

            results.push({ success: true, banner: withAdminShape(banner.toObject()) });
        } catch (error) {
            results.push({ success: false, error: error.message });
        }
    }

    return results;
};

export const deleteUnder250Banner = async (id) => {
    const doc = await FoodUnder250Banner.findById(id);
    if (!doc) {
        return { deleted: false };
    }

    if (doc.publicId) {
        try {
            await cloudinary.uploader.destroy(doc.publicId);
        } catch {
            // ignore cloudinary deletion errors
        }
    }

    await doc.deleteOne();
    return { deleted: true };
};

export const updateUnder250BannerOrder = async (id, sortOrder) => {
    const updated = await FoodUnder250Banner.findByIdAndUpdate(
        id,
        { sortOrder },
        { new: true }
    ).lean();
    return withAdminShape(updated);
};

export const toggleUnder250BannerStatus = async (id, isActive) => {
    const updated = await FoodUnder250Banner.findByIdAndUpdate(
        id,
        { isActive },
        { new: true }
    ).lean();
    return withAdminShape(updated);
};

export const updateUnder250Banner = async (id, updates = {}) => {
    const payload = {};
    const contentKeys = ['title', 'subtitle', 'description', 'ctaText', 'ctaLink'];

    for (const key of contentKeys) {
        if (Object.prototype.hasOwnProperty.call(updates, key) && typeof updates[key] === 'string') {
            payload[key] = updates[key].trim();
        }
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'zoneId')) {
        payload.zoneId = updates.zoneId;
    }

    if (updates.file?.buffer) {
        const existing = await FoodUnder250Banner.findById(id);
        if (!existing) return null;

        const uploadResult = await uploadImageBufferDetailed(updates.file.buffer, 'food/under-250-banners');
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

    const updated = await FoodUnder250Banner.findByIdAndUpdate(id, payload, { new: true }).lean();
    return withAdminShape(updated);
};
