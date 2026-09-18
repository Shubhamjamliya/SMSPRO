import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config/env.js';
import { GlobalSettings } from '../modules/common/models/settings.model.js';
import { uploadImageBuffer as uploadLocalImageBuffer } from './storage.service.js';

let imageStorageProviderCache = null;
let imageStorageProviderCacheAt = 0;
const IMAGE_STORAGE_CACHE_TTL_MS = 30_000;

const getImageStorageProvider = async () => {
    const now = Date.now();
    if (imageStorageProviderCache && now - imageStorageProviderCacheAt < IMAGE_STORAGE_CACHE_TTL_MS) {
        return imageStorageProviderCache;
    }

    const settings = await GlobalSettings.findOne().select('imageStorageProvider').lean();
    imageStorageProviderCache = settings?.imageStorageProvider === 'local' ? 'local' : 'cloudinary';
    imageStorageProviderCacheAt = now;
    return imageStorageProviderCache;
};

export const invalidateImageStorageProviderCache = () => {
    imageStorageProviderCache = null;
    imageStorageProviderCacheAt = 0;
};

cloudinary.config({
    cloud_name: config.cloudinaryCloudName,
    api_key: config.cloudinaryApiKey,
    api_secret: config.cloudinaryApiSecret
});

export const getOptimizedCloudinaryImageUrl = (url, { format = 'webp', quality = 'auto' } = {}) => {
    if (!url || typeof url !== 'string' || !url.includes('/image/upload/')) {
        return url;
    }

    if (url.includes(`/upload/f_${format},q_${quality}/`)) {
        return url;
    }

    return url.replace('/upload/', `/upload/f_${format},q_${quality}/`);
};

const getImageUploadOptions = (folder) => ({
    folder,
    resource_type: 'image',
    format: 'webp',
    quality: 'auto'
});

export const uploadImageBuffer = async (buffer, folder = 'uploads') => {
    if (!buffer) {
        throw new Error('File buffer is required');
    }

    if (await getImageStorageProvider() === 'local') {
        return uploadLocalImageBuffer(buffer, folder);
    }

    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            getImageUploadOptions(folder),
            (error, result) => {
                if (error) {
                    return reject(error);
                }
                return resolve(getOptimizedCloudinaryImageUrl(result.secure_url));
            }
        );

        stream.end(buffer);
    });
};

export const uploadImageBufferDetailed = async (buffer, folder = 'uploads') => {
    if (!buffer) {
        throw new Error('File buffer is required');
    }

    if (await getImageStorageProvider() === 'local') {
        const secureUrl = await uploadLocalImageBuffer(buffer, folder);
        return {
            secure_url: secureUrl,
            public_id: null,
            resource_type: 'image',
        };
    }

    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            getImageUploadOptions(folder),
            (error, result) => {
                if (error) {
                    return reject(error);
                }
                return resolve({
                    ...result,
                    secure_url: getOptimizedCloudinaryImageUrl(result.secure_url)
                });
            }
        );

        stream.end(buffer);
    });
};

export const uploadBufferDetailed = async (
    buffer,
    { folder = 'uploads', resourceType = 'auto' } = {}
) => {
    if (!buffer) {
        throw new Error('File buffer is required');
    }

    // Keep image uploads on the selected provider as well. Non-image assets
    // continue using Cloudinary's resource-type handling.
    if (resourceType === 'image') {
        return uploadImageBufferDetailed(buffer, folder);
    }

    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            resourceType === 'image'
                ? getImageUploadOptions(folder)
                : { folder, resource_type: resourceType },
            (error, result) => {
                if (error) {
                    return reject(error);
                }
                if (resourceType === 'image') {
                    return resolve({
                        ...result,
                        secure_url: getOptimizedCloudinaryImageUrl(result.secure_url)
                    });
                }

                return resolve(result);
            }
        );

        stream.end(buffer);
    });
};
