import express from 'express';
import { upload, uploadMedia } from '../../../middleware/upload.js';
import { uploadBufferDetailed, uploadImageBuffer } from '../../../services/cloudinary.service.js';

const router = express.Router();

const ONBOARDING_IMAGE_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const ONBOARDING_IMAGE_MIN_BYTES = 20 * 1024;
const ONBOARDING_DOCUMENT_MAX_BYTES = 2.5 * 1024 * 1024;
const ONBOARDING_MENU_MAX_BYTES = 5 * 1024 * 1024;

const validateUploadImage = (file, folder = '') => {
    const isRestaurantOnboarding = String(folder).includes('appzeto/restaurant') || String(folder).includes('food/restaurants');
    if (!isRestaurantOnboarding) return null;

    if (!ONBOARDING_IMAGE_ALLOWED_TYPES.has(file.mimetype)) {
        return 'Image must be JPG, PNG, WEBP, HEIC or HEIF';
    }
    if (Number(file.size || 0) < ONBOARDING_IMAGE_MIN_BYTES) {
        return 'Image is too small. Minimum size is 20KB';
    }
    const maxBytes = String(folder).includes('/menu') ? ONBOARDING_MENU_MAX_BYTES : ONBOARDING_DOCUMENT_MAX_BYTES;
    if (Number(file.size || 0) > maxBytes) {
        return `Image is too large. Maximum size is ${String(folder).includes('/menu') ? '5MB' : '2.5MB'}`;
    }
    return null;
};

const isVideoMime = (mime = '') => String(mime).toLowerCase().startsWith('video/');

// POST /v1/uploads/image
router.post('/image', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({
                success: false,
                message: 'No file provided'
            });
        }

        const folder = typeof req.body?.folder === 'string' && req.body.folder.trim()
            ? req.body.folder.trim()
            : 'uploads';

        const validationError = validateUploadImage(req.file, folder);
        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError
            });
        }

        const mime = String(req.file.mimetype || '').toLowerCase();
        const isPdf = mime === 'application/pdf';

        // PDFs need resource_type auto; images keep existing optimized path
        const url = isPdf
            ? (await uploadBufferDetailed(req.file.buffer, { folder, resourceType: 'auto' }))?.secure_url
            : await uploadImageBuffer(req.file.buffer, folder);

        if (!url) {
            return res.status(500).json({
                success: false,
                message: 'Upload failed'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Image uploaded successfully',
            data: {
                url,
                publicId: null
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /v1/uploads/media — images, PDFs, and videos (bike inspection).
 */
router.post('/media', uploadMedia.single('file'), async (req, res, next) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({
                success: false,
                message: 'No file provided',
            });
        }

        const folder = typeof req.body?.folder === 'string' && req.body.folder.trim()
            ? req.body.folder.trim()
            : 'uploads';
        const mime = String(req.file.mimetype || '').toLowerCase();
        const video = isVideoMime(mime);
        const isPdf = mime === 'application/pdf';

        let result;
        if (video || isPdf) {
            result = await uploadBufferDetailed(req.file.buffer, {
                folder,
                resourceType: video ? 'video' : 'auto',
            });
        } else {
            const url = await uploadImageBuffer(req.file.buffer, folder);
            result = { secure_url: url, public_id: null, resource_type: 'image' };
        }

        const url = result?.secure_url;
        if (!url) {
            return res.status(500).json({
                success: false,
                message: 'Upload failed',
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Media uploaded successfully',
            data: {
                url,
                publicId: result.public_id || null,
                resourceType: result.resource_type || (video ? 'video' : 'image'),
            },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
