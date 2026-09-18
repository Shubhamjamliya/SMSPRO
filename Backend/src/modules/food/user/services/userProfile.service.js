import { FoodUser } from '../../../../core/users/user.model.js';
import { AuthError, ValidationError } from '../../../../core/auth/errors.js';
import { FoodUserWallet } from '../models/userWallet.model.js';
import { uploadBufferDetailed, uploadImageBuffer } from '../../../../services/cloudinary.service.js';

const parseIsoDateOrNull = (value) => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const d = new Date(`${String(value)}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
};

const IDENTITY_DOC_TYPES = new Set([
    'drivingLicenseFront',
    'drivingLicenseBack',
    'aadhaarFront',
    'aadhaarBack',
    'panCardImage',
    'passportImage',
    'voterIdImage',
]);

const IDENTITY_ALLOWED_MIME = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/pdf',
]);

const IDENTITY_MAX_BYTES = 5 * 1024 * 1024;

export const getCurrentUserProfile = async (userId) => {
    const user = await FoodUser.findById(userId).lean();
    if (!user) throw new AuthError('Profile not found');
    const wallet = await FoodUserWallet.findOne({ userId }).select('balance').lean();
    return {
        user: {
            ...user,
            walletBalance: wallet
                ? Math.max(0, Number(wallet.balance) || 0)
                : Math.max(0, Number(user.walletBalance) || 0),
        },
    };
};

export const updateCurrentUserProfile = async (userId, body) => {
    const user = await FoodUser.findById(userId);
    if (!user) throw new AuthError('Profile not found');

    if (body.phone !== undefined) {
        const nextPhone = String(body.phone || '').trim();
        const currentPhone = String(user.phone || '').trim();
        if (nextPhone && nextPhone !== currentPhone) {
            throw new ValidationError('Phone number cannot be changed');
        }
    }

    if (body.name !== undefined) user.name = String(body.name || '').trim();
    if (body.email !== undefined) user.email = String(body.email || '').trim().toLowerCase();
    if (body.alternatePhone !== undefined) {
        user.alternatePhone = String(body.alternatePhone || '').trim();
    }
    if (body.profileImage !== undefined) {
        user.profileImage = String(body.profileImage || '').trim();
    }
    if (body.gender !== undefined) user.gender = String(body.gender || '').trim();
    if (body.drivingLicenseNumber !== undefined) {
        user.drivingLicenseNumber = String(body.drivingLicenseNumber || '')
            .replace(/[\s-]/g, '')
            .trim()
            .toUpperCase();
    }
    if (body.aadhaarNumber !== undefined) {
        user.aadhaarNumber = String(body.aadhaarNumber || '').replace(/\s/g, '').trim();
    }
    for (const key of IDENTITY_DOC_TYPES) {
        if (body[key] !== undefined) {
            user[key] = String(body[key] || '').trim();
        }
    }

    const dob = parseIsoDateOrNull(body.dateOfBirth);
    if (dob !== undefined) user.dateOfBirth = dob;
    const ann = parseIsoDateOrNull(body.anniversary);
    if (ann !== undefined) user.anniversary = ann;

    await user.save();
    return { user: user.toObject() };
};

export const uploadCurrentUserProfileImage = async (userId, file) => {
    if (!file || !file.buffer) {
        throw new ValidationError('File is required');
    }
    const user = await FoodUser.findById(userId);
    if (!user) throw new AuthError('Profile not found');

    const url = await uploadImageBuffer(file.buffer, 'food/users/profile');
    user.profileImage = String(url || '').trim();
    await user.save();
    return { profileImage: user.profileImage, user: user.toObject() };
};

export const uploadCurrentUserIdentityDocument = async (userId, file, documentType) => {
    const type = String(documentType || '').trim();
    if (!IDENTITY_DOC_TYPES.has(type)) {
        throw new ValidationError('Invalid document type');
    }
    if (!file || !file.buffer) {
        throw new ValidationError('File is required');
    }

    const mime = String(file.mimetype || '').toLowerCase();
    if (!IDENTITY_ALLOWED_MIME.has(mime)) {
        throw new ValidationError('Only JPG, JPEG, PNG, or PDF files are allowed');
    }
    if (Number(file.size || 0) > IDENTITY_MAX_BYTES) {
        throw new ValidationError('File must be 5MB or smaller');
    }

    const user = await FoodUser.findById(userId);
    if (!user) throw new AuthError('Profile not found');

    const folder = 'food/users/identity';
    const isPdf = mime === 'application/pdf';
    const url = isPdf
        ? (await uploadBufferDetailed(file.buffer, { folder, resourceType: 'auto' }))?.secure_url
        : await uploadImageBuffer(file.buffer, folder);

    if (!url) throw new ValidationError('Upload failed');

    user[type] = String(url).trim();
    await user.save();

    return {
        documentType: type,
        url: user[type],
        user: user.toObject(),
    };
};

export const deleteCurrentUserAccount = async (userId) => {
    const user = await FoodUser.findById(userId);
    if (!user) throw new AuthError('Profile not found');

    user.isDeleted = true;
    user.accountStatus = 'deleted';
    user.isActive = false;
    await user.save();

    const { FoodRefreshToken } = await import('../../../../core/refreshTokens/refreshToken.model.js');
    await FoodRefreshToken.deleteMany({ userId });

    return { success: true, message: 'Account soft deleted successfully' };
};
