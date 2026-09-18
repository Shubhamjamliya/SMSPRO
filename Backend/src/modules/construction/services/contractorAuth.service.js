import ms from 'ms';
import { ValidationError, AuthError } from '../../../core/auth/errors.js';
import { findOrCreateUserByPhone } from '../../../core/users/user.service.js';
import { createOrUpdateOtp, verifyOtp } from '../../../core/otp/otp.service.js';
import { signAccessToken, signRefreshToken } from '../../../core/auth/token.util.js';
import { FoodRefreshToken } from '../../../core/refreshTokens/refreshToken.model.js';
import { assertModuleEnabled } from '../../../core/modules/moduleEnabled.service.js';
import { config } from '../../../config/env.js';
import { ContractorProfile } from '../models/contractorProfile.model.js';
/*
 * Mongoose resolves `.populate()` by MODEL NAME at call time, so every model
 * this file populates has to have been imported by SOMETHING before the first
 * request lands. Relying on another module's import chain to have done that is
 * order-dependent: it passes in one entry point and throws MissingSchemaError in
 * another. These imports exist to register the models, even where the binding
 * itself is not referenced below.
 */
import { ConstructionCategory } from '../models/constructionCategory.model.js';

export const CONTRACTOR_ROLE = 'CONTRACTOR';
export const CONSTRUCTION_MODULE_KEY = 'construction';

const str = (value) => String(value ?? '').trim();

export const normalizePhoneDigits = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.slice(-10);
};

export const findContractorByPhone = async (phone) => {
  const last10 = normalizePhoneDigits(phone);
  if (!last10 || last10.length < 10) return null;

  return ContractorProfile.findOne({
    isDeleted: { $ne: true },
    $or: [
      { phoneLast10: last10 },
      { phoneDigits: last10 },
      { phoneDigits: { $regex: `${last10}$` } },
      { phone },
    ],
  }).sort({ updatedAt: -1 });
};

/** Plain snapshot of the contractor's editable fields, stored at rejection so an
 *  admin can diff a resubmission against exactly what they turned down. */
export const snapshotContractorFields = (contractor) => ({
  businessName: contractor.businessName || '',
  businessType: contractor.businessType || '',
  ownerName: contractor.ownerName || '',
  email: contractor.email || '',
  profileImage: contractor.profileImage || '',
  yearsExperience: contractor.yearsExperience || 0,
  about: contractor.about || '',
  trades: (contractor.trades || []).map(String),
  serviceAreas: [...(contractor.serviceAreas || [])],
  travelRadiusKm: contractor.travelRadiusKm ?? null,
  projectSizeMin: contractor.projectSizeMin ?? null,
  projectSizeMax: contractor.projectSizeMax ?? null,
  maxConcurrentProjects: contractor.maxConcurrentProjects ?? null,
  documents: {
    panNumber: contractor.documents?.panNumber || '',
    panImage: contractor.documents?.panImage || '',
    aadhaarNumber: contractor.documents?.aadhaarNumber || '',
    aadhaarImage: contractor.documents?.aadhaarImage || '',
    gstNumber: contractor.documents?.gstNumber || '',
    gstImage: contractor.documents?.gstImage || '',
  },
  bank: {
    bankName: contractor.bank?.bankName || '',
    accountHolderName: contractor.bank?.accountHolderName || '',
    accountNumber: contractor.bank?.accountNumber || '',
    ifscCode: contractor.bank?.ifscCode || '',
    accountType: contractor.bank?.accountType || '',
    upiId: contractor.bank?.upiId || '',
  },
});

export const pushStatusHistory = (contractor, status, { reason = '', admin = null } = {}) => {
  if (!Array.isArray(contractor.statusHistory)) contractor.statusHistory = [];
  contractor.statusHistory.push({
    status,
    reason: str(reason),
    changedBy: admin?._id || admin?.id || null,
    changedByName: str(admin?.name || admin?.email || ''),
    at: new Date(),
  });
};

export const serializeContractor = (contractor, extras = {}) => {
  if (!contractor) return null;
  const doc = typeof contractor.toObject === 'function' ? contractor.toObject() : { ...contractor };

  // trades may be raw ids or populated category documents.
  const trades = (doc.trades || []).map((trade) =>
    (trade && typeof trade === 'object' && trade.name !== undefined
      ? { id: String(trade._id), name: trade.name, slug: trade.slug }
      : { id: String(trade), name: null, slug: null }));

  return {
    id: doc._id,
    _id: doc._id,
    contractorCode: doc.contractorCode || null,
    userId: doc.userId,
    businessName: doc.businessName || '',
    businessType: doc.businessType || 'individual',
    ownerName: doc.ownerName || '',
    email: doc.email || '',
    phone: doc.phoneLast10 || doc.phone || '',
    profileImage: doc.profileImage || '',
    yearsExperience: doc.yearsExperience || 0,
    about: doc.about || '',
    trades,
    serviceAreas: doc.serviceAreas || [],
    travelRadiusKm: doc.travelRadiusKm ?? null,
    projectSizeMin: doc.projectSizeMin ?? null,
    projectSizeMax: doc.projectSizeMax ?? null,
    maxConcurrentProjects: doc.maxConcurrentProjects ?? null,
    documents: doc.documents || {},
    bank: doc.bank || {},
    status: doc.status || 'onboarding',
    onboardingStep: doc.onboardingStep || 1,
    rejectionReason: doc.rejectionReason || '',
    rejectedSnapshot: doc.rejectedSnapshot || null,
    submittedAt: doc.submittedAt || null,
    approvedAt: doc.approvedAt || null,
    rejectedAt: doc.rejectedAt || null,
    rating: doc.rating || 0,
    totalRatings: doc.totalRatings || 0,
    trustScore: doc.trustScore || 0,
    completedProjects: doc.completedProjects || 0,
    isActive: doc.isActive !== false,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    role: CONTRACTOR_ROLE,
    ...extras,
  };
};

export const createContractorSession = async (contractor) => {
  if (!contractor?._id) throw new ValidationError('Contractor is required');

  const payload = {
    userId: contractor._id.toString(),
    role: CONTRACTOR_ROLE,
    linkedUserId: contractor.userId ? String(contractor.userId) : undefined,
  };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const ttlMs = ms(config.jwtRefreshExpiresIn || '7d');

  await FoodRefreshToken.create({
    userId: contractor._id,
    token: refreshToken,
    expiresAt: new Date(Date.now() + ttlMs),
  });

  return {
    accessToken,
    refreshToken,
    contractor: serializeContractor(contractor),
  };
};

export const requestContractorOtp = async (phone) => {
  await assertModuleEnabled(CONSTRUCTION_MODULE_KEY);

  const last10 = normalizePhoneDigits(phone);
  if (!last10 || last10.length < 10) {
    throw new ValidationError('Enter a valid 10-digit mobile number');
  }
  const otp = await createOrUpdateOtp(last10);
  const shouldExposeOtp = config.nodeEnv !== 'production' || config.useDefaultOtp;
  return shouldExposeOtp ? { otp, phone: last10 } : { phone: last10 };
};

/**
 * Verify OTP and sign the contractor in.
 *
 * A first-time number gets an onboarding draft rather than a rejection, so the
 * registration flow starts immediately after OTP instead of asking for details
 * twice. The draft is always tied to the shared FoodUser for that phone.
 */
export const verifyContractorOtpAndLogin = async (phone, otp, fcmToken) => {
  await assertModuleEnabled(CONSTRUCTION_MODULE_KEY);

  const last10 = normalizePhoneDigits(phone);
  if (!last10 || last10.length < 10) {
    throw new ValidationError('Enter a valid 10-digit mobile number');
  }
  if (!otp) throw new ValidationError('OTP is required');

  const result = await verifyOtp(last10, otp);
  if (!result.valid) {
    throw new AuthError(result.reason || 'OTP verification failed');
  }

  const contractor = await findContractorByPhone(last10);

  // One identity across the platform — reuse the existing FoodUser if this phone
  // already belongs to a customer, driver, vendor or provider (BRD Rule 1).
  const commonUser = await findOrCreateUserByPhone({ phone: last10, countryCode: '+91' });

  if (!contractor) {
    const draft = await ContractorProfile.create({
      userId: commonUser._id,
      businessName: commonUser.name || 'New contractor',
      ownerName: commonUser.name || 'Contractor',
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

    const session = await createContractorSession(draft);
    return { needsRegistration: true, phone: last10, resumeStep: 1, ...session };
  }

  if (contractor.isDeleted === true || contractor.isActive === false) {
    throw new AuthError('Your contractor account has been deactivated. Contact support.');
  }

  if (String(contractor.userId) !== String(commonUser._id)) {
    contractor.userId = commonUser._id;
  }
  if (fcmToken) {
    if (!Array.isArray(contractor.fcmTokens)) contractor.fcmTokens = [];
    if (!contractor.fcmTokens.includes(fcmToken)) contractor.fcmTokens.push(fcmToken);
  }
  contractor.lastLoginAt = new Date();
  await contractor.save();

  // An unfinished or rejected registration resumes where it left off rather than
  // landing on a dashboard the contractor cannot use yet (BRD W4).
  if (contractor.status === 'onboarding' || contractor.status === 'rejected') {
    const session = await createContractorSession(contractor);
    return {
      needsRegistration: true,
      phone: last10,
      resumeStep: contractor.onboardingStep || 1,
      ...session,
    };
  }

  return createContractorSession(contractor);
};

export const getContractorProfile = async (contractorId) => {
  const contractor = await ContractorProfile.findById(contractorId)
    .populate('trades', 'name slug status');
  if (!contractor || contractor.isDeleted) throw new ValidationError('Contractor not found');
  return serializeContractor(contractor);
};
