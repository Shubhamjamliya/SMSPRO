import ms from 'ms';
import { ValidationError, AuthError } from '../../../core/auth/errors.js';
import { findOrCreateUserByPhone } from '../../../core/users/user.service.js';
import { createOrUpdateOtp, verifyOtp } from '../../../core/otp/otp.service.js';
import { signAccessToken, signRefreshToken } from '../../../core/auth/token.util.js';
import { FoodRefreshToken } from '../../../core/refreshTokens/refreshToken.model.js';
import { assertModuleEnabled } from '../../../core/modules/moduleEnabled.service.js';
import { config } from '../../../config/env.js';
import { ServiceProviderProfile } from '../models/serviceProviderProfile.model.js';

export const SERVICE_PROVIDER_ROLE = 'SERVICE_PROVIDER';
export const SERVICE_PROVIDER_MODULE_KEY = 'serviceProvider';

const str = (value) => String(value ?? '').trim();

export const normalizePhoneDigits = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.slice(-10);
};

export const findProviderByPhone = async (phone) => {
  const last10 = normalizePhoneDigits(phone);
  if (!last10 || last10.length < 10) return null;

  return ServiceProviderProfile.findOne({
    isDeleted: { $ne: true },
    $or: [
      { phoneLast10: last10 },
      { phoneDigits: last10 },
      { phoneDigits: { $regex: `${last10}$` } },
      { phone },
    ],
  }).sort({ updatedAt: -1 });
};

/** Plain-object snapshot of the provider's editable profile fields, used to diff
 *  a resubmission against what the admin actually rejected. */
export const snapshotProviderFields = (provider) => ({
  ownerName: provider.ownerName || '',
  email: provider.email || '',
  profileImage: provider.profileImage || '',
  experience: provider.experience || '',
  skills: Array.isArray(provider.skills) ? [...provider.skills] : [],
  about: provider.about || '',
  bank: {
    bankName: provider.bank?.bankName || '',
    accountHolderName: provider.bank?.accountHolderName || '',
    accountNumber: provider.bank?.accountNumber || '',
    ifscCode: provider.bank?.ifscCode || '',
    accountType: provider.bank?.accountType || '',
    upiId: provider.bank?.upiId || '',
  },
  documents: {
    panNumber: provider.documents?.panNumber || '',
    panImage: provider.documents?.panImage || '',
    aadhaarNumber: provider.documents?.aadhaarNumber || '',
    aadhaarImage: provider.documents?.aadhaarImage || '',
  },
});

export const pushStatusHistory = (provider, status, { reason = '', admin = null } = {}) => {
  if (!Array.isArray(provider.statusHistory)) provider.statusHistory = [];
  provider.statusHistory.push({
    status,
    reason: str(reason),
    changedBy: admin?._id || admin?.id || null,
    changedByName: str(admin?.name || admin?.email || ''),
    at: new Date(),
  });
};

export const serializeServiceProviderProfile = (provider, extras = {}) => {
  if (!provider) return null;
  const doc = typeof provider.toObject === 'function' ? provider.toObject() : { ...provider };
  // zoneId may be a raw id (unpopulated) or a populated { _id, name, ... } object.
  const populatedZone = doc.zoneId && typeof doc.zoneId === 'object' && doc.zoneId.name !== undefined
    ? doc.zoneId
    : null;
  return {
    id: doc._id,
    _id: doc._id,
    providerCode: doc.providerCode || null,
    userId: doc.userId,
    ownerName: doc.ownerName || '',
    email: doc.email || '',
    phone: doc.phoneLast10 || doc.phone || '',
    profileImage: doc.profileImage || '',
    experience: doc.experience || '',
    skills: Array.isArray(doc.skills) ? doc.skills : [],
    about: doc.about || '',
    bank: doc.bank || {},
    documents: doc.documents || {},
    zoneId: populatedZone ? populatedZone._id : (doc.zoneId || null),
    zone: populatedZone ? {
      _id: populatedZone._id,
      name: populatedZone.name,
      country: populatedZone.country,
      unit: populatedZone.unit,
      status: populatedZone.status,
      coordinates: populatedZone.coordinates || [],
    } : null,
    rejectedSnapshot: doc.rejectedSnapshot || null,
    status: doc.status || 'onboarding',
    onboardingStep: doc.onboardingStep || 1,
    rejectionReason: doc.rejectionReason || '',
    submittedAt: doc.submittedAt || null,
    approvedAt: doc.approvedAt || null,
    rejectedAt: doc.rejectedAt || null,
    isActive: doc.isActive !== false,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    role: SERVICE_PROVIDER_ROLE,
    ...extras,
  };
};

export const createServiceProviderSession = async (provider) => {
  if (!provider?._id) throw new ValidationError('Service provider is required');

  const payload = {
    userId: provider._id.toString(),
    role: SERVICE_PROVIDER_ROLE,
    linkedUserId: provider.userId ? String(provider.userId) : undefined,
  };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const ttlMs = ms(config.jwtRefreshExpiresIn || '7d');
  const expiresAt = new Date(Date.now() + ttlMs);

  await FoodRefreshToken.create({
    userId: provider._id,
    token: refreshToken,
    expiresAt,
  });

  return {
    accessToken,
    refreshToken,
    provider: serializeServiceProviderProfile(provider),
  };
};

export const requestServiceProviderOtp = async (phone) => {
  await assertModuleEnabled(SERVICE_PROVIDER_MODULE_KEY);

  const last10 = normalizePhoneDigits(phone);
  if (!last10 || last10.length < 10) {
    throw new ValidationError('Enter a valid 10-digit mobile number');
  }
  const otp = await createOrUpdateOtp(last10);
  const shouldExposeOtp = config.nodeEnv !== 'production' || config.useDefaultOtp;
  return shouldExposeOtp ? { otp, phone: last10 } : { phone: last10 };
};

export const verifyServiceProviderOtpAndLogin = async (phone, otp, fcmToken) => {
  await assertModuleEnabled(SERVICE_PROVIDER_MODULE_KEY);

  const last10 = normalizePhoneDigits(phone);
  if (!last10 || last10.length < 10) {
    throw new ValidationError('Enter a valid 10-digit mobile number');
  }
  if (!otp) throw new ValidationError('OTP is required');

  const result = await verifyOtp(last10, otp);
  if (!result.valid) {
    throw new AuthError(result.reason || 'OTP verification failed');
  }

  const provider = await findProviderByPhone(last10);

  // Centralized user — reuse if this phone already exists as a customer / driver / vendor / etc.
  const commonUser = await findOrCreateUserByPhone({ phone: last10, countryCode: '+91' });

  if (!provider) {
    const draft = await ServiceProviderProfile.create({
      userId: commonUser._id,
      ownerName: commonUser.name || 'Service Provider',
      phone: last10,
      phoneLast10: last10,
      phoneDigits: last10,
      email: commonUser.email || '',
      status: 'onboarding',
      onboardingStep: 1,
      lastLoginAt: new Date(),
      fcmTokens: fcmToken ? [fcmToken] : [],
    });
    pushStatusHistory(draft, 'onboarding', { reason: 'OTP verified — draft created' });
    await draft.save();

    const session = await createServiceProviderSession(draft);
    return {
      needsRegistration: true,
      phone: last10,
      resumeStep: 1,
      ...session,
    };
  }

  if (provider.isDeleted === true || provider.isActive === false) {
    throw new AuthError('Your service provider account has been deactivated. Contact support.');
  }

  if (String(provider.userId) !== String(commonUser._id)) {
    provider.userId = commonUser._id;
  }

  if (fcmToken) {
    if (!Array.isArray(provider.fcmTokens)) provider.fcmTokens = [];
    if (!provider.fcmTokens.includes(fcmToken)) {
      provider.fcmTokens.push(fcmToken);
    }
  }
  provider.lastLoginAt = new Date();
  await provider.save();

  if (provider.status === 'onboarding') {
    const session = await createServiceProviderSession(provider);
    return {
      needsRegistration: true,
      phone: last10,
      resumeStep: provider.onboardingStep || 1,
      ...session,
    };
  }

  return createServiceProviderSession(provider);
};

export const getServiceProviderProfile = async (providerId) => {
  const provider = await ServiceProviderProfile.findById(providerId);
  if (!provider || provider.isDeleted) throw new ValidationError('Service provider not found');
  return serializeServiceProviderProfile(provider);
};
