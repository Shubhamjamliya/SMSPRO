import { ValidationError, AuthError } from '../../../core/auth/errors.js';
import { findOrCreateUserByPhone } from '../../../core/users/user.service.js';
import { FoodUser } from '../../../core/users/user.model.js';
import { createOrUpdateOtp, verifyOtp } from '../../../core/otp/otp.service.js';
import { signAccessToken, signRefreshToken } from '../../../core/auth/token.util.js';
import { FoodRefreshToken } from '../../../core/refreshTokens/refreshToken.model.js';
import { config } from '../../../config/env.js';
import { FoodUserWallet } from '../../food/user/models/userWallet.model.js';
import ms from 'ms';
import { BikeVendor } from '../models/bikeVendor.model.js';

export const BIKE_VENDOR_ROLE = 'BIKE_VENDOR';

const str = (value) => String(value ?? '').trim();

export const normalizePhoneDigits = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.slice(-10);
};

export const findVendorByPhone = async (phone) => {
  const last10 = normalizePhoneDigits(phone);
  if (!last10 || last10.length < 10) return null;

  return BikeVendor.findOne({
    isDeleted: { $ne: true },
    $or: [
      { phoneLast10: last10 },
      { phoneDigits: last10 },
      { phoneDigits: { $regex: `${last10}$` } },
      { phone },
    ],
  }).sort({ updatedAt: -1 });
};

/** Plain-object snapshot of the vendor's editable profile fields, used to diff
 *  a resubmission against what the admin actually rejected. */
const snapshotVendorFields = (vendor) => ({
  ownerName: vendor.ownerName || '',
  businessName: vendor.businessName || '',
  email: vendor.email || '',
  address: vendor.address || '',
  city: vendor.city || '',
  state: vendor.state || '',
  pincode: vendor.pincode || '',
  landmark: vendor.landmark || '',
  profilePhoto: vendor.profilePhoto || '',
  shopImages: Array.isArray(vendor.shopImages) ? [...vendor.shopImages] : [],
  bank: {
    bankName: vendor.bank?.bankName || '',
    accountHolderName: vendor.bank?.accountHolderName || '',
    accountNumber: vendor.bank?.accountNumber || '',
    ifscCode: vendor.bank?.ifscCode || '',
    accountType: vendor.bank?.accountType || '',
    upiId: vendor.bank?.upiId || '',
  },
  documents: {
    panNumber: vendor.documents?.panNumber || '',
    panImage: vendor.documents?.panImage || '',
    aadhaarNumber: vendor.documents?.aadhaarNumber || '',
    aadhaarImage: vendor.documents?.aadhaarImage || '',
    drivingLicenseNumber: vendor.documents?.drivingLicenseNumber || '',
    drivingLicenseImage: vendor.documents?.drivingLicenseImage || '',
    gstNumber: vendor.documents?.gstNumber || '',
    gstImage: vendor.documents?.gstImage || '',
    businessRegistrationNumber: vendor.documents?.businessRegistrationNumber || '',
    businessRegistrationImage: vendor.documents?.businessRegistrationImage || '',
  },
});

const pushStatusHistory = (vendor, status, { reason = '', admin = null } = {}) => {
  if (!Array.isArray(vendor.statusHistory)) vendor.statusHistory = [];
  vendor.statusHistory.push({
    status,
    reason: str(reason),
    changedBy: admin?._id || admin?.id || null,
    changedByName: str(admin?.name || admin?.email || ''),
    at: new Date(),
  });
};

export const serializeBikeVendor = (vendor, extras = {}) => {
  if (!vendor) return null;
  const doc = typeof vendor.toObject === 'function' ? vendor.toObject() : { ...vendor };
  return {
    id: doc._id,
    _id: doc._id,
    vendorCode: doc.vendorCode || null,
    userId: doc.userId,
    ownerName: doc.ownerName || '',
    businessName: doc.businessName || '',
    email: doc.email || '',
    phone: doc.phoneLast10 || doc.phone || '',
    address: doc.address || '',
    city: doc.city || '',
    state: doc.state || '',
    pincode: doc.pincode || '',
    landmark: doc.landmark || '',
    latitude: doc.latitude ?? null,
    longitude: doc.longitude ?? null,
    profilePhoto: doc.profilePhoto || '',
    shopImages: Array.isArray(doc.shopImages) ? doc.shopImages : [],
    bank: doc.bank || {},
    documents: doc.documents || {},
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
    role: BIKE_VENDOR_ROLE,
    ...extras,
  };
};

export const createBikeVendorSession = async (vendor) => {
  if (!vendor?._id) throw new ValidationError('Vendor is required');

  const payload = {
    userId: vendor._id.toString(),
    role: BIKE_VENDOR_ROLE,
    linkedUserId: vendor.userId ? String(vendor.userId) : undefined,
  };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const ttlMs = ms(config.jwtRefreshExpiresIn || '7d');
  const expiresAt = new Date(Date.now() + ttlMs);

  await FoodRefreshToken.create({
    userId: vendor._id,
    token: refreshToken,
    expiresAt,
  });

  return {
    accessToken,
    refreshToken,
    vendor: serializeBikeVendor(vendor),
  };
};

const getLinkedWalletBalance = async (userId) => {
  if (!userId) return 0;
  const wallet = await FoodUserWallet.findOne({ userId }).select('balance').lean();
  if (wallet) return Math.max(0, Number(wallet.balance) || 0);
  const user = await FoodUser.findById(userId).select('walletBalance').lean();
  return Math.max(0, Number(user?.walletBalance) || 0);
};

export const requestBikeVendorOtp = async (phone) => {
  const last10 = normalizePhoneDigits(phone);
  if (!last10 || last10.length < 10) {
    throw new ValidationError('Enter a valid 10-digit mobile number');
  }
  const otp = await createOrUpdateOtp(last10);
  const shouldExposeOtp =
    config.nodeEnv !== 'production' || config.useDefaultOtp;
  return shouldExposeOtp ? { otp, phone: last10 } : { phone: last10 };
};

export const verifyBikeVendorOtpAndLogin = async (phone, otp, fcmToken) => {
  const last10 = normalizePhoneDigits(phone);
  if (!last10 || last10.length < 10) {
    throw new ValidationError('Enter a valid 10-digit mobile number');
  }
  if (!otp) throw new ValidationError('OTP is required');

  const result = await verifyOtp(last10, otp);
  if (!result.valid) {
    throw new AuthError(result.reason || 'OTP verification failed');
  }

  const vendor = await findVendorByPhone(last10);

  // Ensure centralized user exists for this phone (shared wallet / profile)
  const commonUser = await findOrCreateUserByPhone({ phone: last10, countryCode: '+91' });

  if (!vendor) {
    const draft = await BikeVendor.create({
      userId: commonUser._id,
      ownerName: commonUser.name || 'Vendor',
      businessName: 'New Bike Rental',
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

    const session = await createBikeVendorSession(draft);
    return {
      needsRegistration: true,
      phone: last10,
      resumeStep: 1,
      ...session,
    };
  }

  if (vendor.isDeleted === true || vendor.isActive === false) {
    throw new AuthError('Your vendor account has been deactivated. Contact support.');
  }

  if (String(vendor.userId) !== String(commonUser._id)) {
    vendor.userId = commonUser._id;
  }

  if (fcmToken) {
    if (!Array.isArray(vendor.fcmTokens)) vendor.fcmTokens = [];
    if (!vendor.fcmTokens.includes(fcmToken)) {
      vendor.fcmTokens.push(fcmToken);
    }
  }
  vendor.lastLoginAt = new Date();
  await vendor.save();

  if (vendor.status === 'onboarding') {
    const session = await createBikeVendorSession(vendor);
    return {
      needsRegistration: true,
      phone: last10,
      resumeStep: vendor.onboardingStep || 1,
      ...session,
    };
  }

  if (vendor.status === 'pending') {
    return {
      isPending: true,
      phone: last10,
      vendor: serializeBikeVendor(vendor),
      ...(await createBikeVendorSession(vendor)),
    };
  }

  if (vendor.status === 'rejected') {
    return {
      isRejected: true,
      rejectionReason: vendor.rejectionReason || null,
      phone: last10,
      vendor: serializeBikeVendor(vendor),
      ...(await createBikeVendorSession(vendor)),
    };
  }

  const session = await createBikeVendorSession(vendor);
  return {
    needsRegistration: false,
    isPending: false,
    isRejected: false,
    phone: last10,
    ...session,
  };
};

const applyRegistrationPayload = (vendor, payload = {}) => {
  vendor.ownerName = str(payload.ownerName) || vendor.ownerName;
  vendor.businessName = str(payload.businessName) || vendor.businessName;
  vendor.email = str(payload.email).toLowerCase() || vendor.email;
  vendor.address = str(payload.address) || vendor.address;
  vendor.city = str(payload.city) || vendor.city;
  vendor.state = str(payload.state) || vendor.state;
  vendor.pincode = str(payload.pincode) || vendor.pincode;
  vendor.landmark = str(payload.landmark) || vendor.landmark;

  if (payload.latitude != null && Number.isFinite(Number(payload.latitude))) {
    vendor.latitude = Number(payload.latitude);
  }
  if (payload.longitude != null && Number.isFinite(Number(payload.longitude))) {
    vendor.longitude = Number(payload.longitude);
  }

  if (payload.profilePhoto) vendor.profilePhoto = str(payload.profilePhoto);

  if (Array.isArray(payload.shopImages)) {
    vendor.shopImages = payload.shopImages.map(str).filter(Boolean).slice(0, 8);
  } else if (typeof payload.shopImages === 'string' && payload.shopImages.trim()) {
    try {
      const parsed = JSON.parse(payload.shopImages);
      if (Array.isArray(parsed)) {
        vendor.shopImages = parsed.map(str).filter(Boolean).slice(0, 8);
      }
    } catch {
      vendor.shopImages = payload.shopImages.split(',').map(str).filter(Boolean).slice(0, 8);
    }
  }

  vendor.bank = {
    bankName: str(payload.bankName ?? payload.bank?.bankName),
    accountHolderName: str(payload.accountHolderName ?? payload.bank?.accountHolderName),
    accountNumber: str(payload.accountNumber ?? payload.bank?.accountNumber),
    ifscCode: str(payload.ifscCode ?? payload.bank?.ifscCode).toUpperCase(),
    accountType: str(payload.accountType ?? payload.bank?.accountType).toLowerCase(),
    upiId: str(payload.upiId ?? payload.bank?.upiId),
  };

  vendor.documents = {
    panNumber: str(payload.panNumber ?? payload.documents?.panNumber).toUpperCase(),
    panImage: str(payload.panImage ?? payload.documents?.panImage),
    aadhaarNumber: str(payload.aadhaarNumber ?? payload.documents?.aadhaarNumber),
    aadhaarImage: str(payload.aadhaarImage ?? payload.documents?.aadhaarImage),
    drivingLicenseNumber: str(
      payload.drivingLicenseNumber ?? payload.documents?.drivingLicenseNumber,
    ).toUpperCase(),
    drivingLicenseImage: str(
      payload.drivingLicenseImage ?? payload.documents?.drivingLicenseImage,
    ),
    gstNumber: str(payload.gstNumber ?? payload.documents?.gstNumber).toUpperCase(),
    gstImage: str(payload.gstImage ?? payload.documents?.gstImage),
    businessRegistrationNumber: str(
      payload.businessRegistrationNumber ?? payload.documents?.businessRegistrationNumber,
    ),
    businessRegistrationImage: str(
      payload.businessRegistrationImage ?? payload.documents?.businessRegistrationImage,
    ),
  };
};

const validateRegistrationPayload = (payload, { requireComplete = true } = {}) => {
  const required = [
    ['ownerName', 'Owner name'],
    ['businessName', 'Business name'],
    ['address', 'Address'],
    ['city', 'City'],
    ['state', 'State'],
    ['pincode', 'PIN code'],
    ['panNumber', 'PAN'],
    ['aadhaarNumber', 'Aadhaar'],
    ['accountHolderName', 'Account holder name'],
    ['accountNumber', 'Bank account number'],
    ['ifscCode', 'IFSC code'],
    ['upiId', 'UPI ID'],
  ];

  if (!requireComplete) return;

  for (const [key, label] of required) {
    const value =
      payload[key] ??
      payload.bank?.[key] ??
      payload.documents?.[key] ??
      (key === 'accountHolderName' ? payload.bank?.accountHolderName : undefined) ??
      (key === 'accountNumber' ? payload.bank?.accountNumber : undefined) ??
      (key === 'ifscCode' ? payload.bank?.ifscCode : undefined) ??
      (key === 'upiId' ? payload.bank?.upiId : undefined) ??
      (key === 'panNumber' ? payload.documents?.panNumber : undefined) ??
      (key === 'aadhaarNumber' ? payload.documents?.aadhaarNumber : undefined);

    if (!str(value)) {
      throw new ValidationError(`${label} is required`);
    }
  }

  const pincode = str(payload.pincode);
  if (!/^\d{6}$/.test(pincode)) {
    throw new ValidationError('PIN code must be 6 digits');
  }

  const pan = str(payload.panNumber ?? payload.documents?.panNumber).toUpperCase();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
    throw new ValidationError('Enter a valid PAN number');
  }

  const aadhaar = str(payload.aadhaarNumber ?? payload.documents?.aadhaarNumber).replace(/\s/g, '');
  if (!/^\d{12}$/.test(aadhaar)) {
    throw new ValidationError('Aadhaar must be 12 digits');
  }

  const ifsc = str(payload.ifscCode ?? payload.bank?.ifscCode).toUpperCase();
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
    throw new ValidationError('Enter a valid IFSC code');
  }

  const gst = str(payload.gstNumber ?? payload.documents?.gstNumber).toUpperCase();
  if (gst && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gst)) {
    throw new ValidationError('Enter a valid GST number');
  }

  const email = str(payload.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError('Enter a valid email');
  }

  if (!str(payload.profilePhoto)) {
    throw new ValidationError('Profile photo is required');
  }
};

const syncCommonUserProfile = async (userId, payload) => {
  const user = await FoodUser.findById(userId);
  if (!user) return;

  const ownerName = str(payload.ownerName);
  const email = str(payload.email).toLowerCase();
  let dirty = false;

  if (ownerName && (!user.name || String(user.name).startsWith('User'))) {
    user.name = ownerName;
    dirty = true;
  }
  if (email && !user.email) {
    user.email = email;
    dirty = true;
  }
  if (payload.profilePhoto && !user.profileImage) {
    user.profileImage = str(payload.profilePhoto);
    dirty = true;
  }
  if (payload.panNumber && !user.panNumber) {
    user.panNumber = str(payload.panNumber).toUpperCase();
    dirty = true;
  }
  if (payload.aadhaarNumber && !user.aadhaarNumber) {
    user.aadhaarNumber = str(payload.aadhaarNumber);
    dirty = true;
  }
  if (payload.drivingLicenseNumber && !user.drivingLicenseNumber) {
    user.drivingLicenseNumber = str(payload.drivingLicenseNumber).toUpperCase();
    dirty = true;
  }

  if (dirty) await user.save();
};

export const registerOrSubmitBikeVendor = async ({
  phone,
  otp,
  payload = {},
  submitForApproval = true,
  vendorId = null,
}) => {
  const last10 = normalizePhoneDigits(phone);
  if (!last10 || last10.length < 10) {
    throw new ValidationError('Enter a valid 10-digit mobile number');
  }

  // Fresh OTP required for public registration; authenticated vendor updates can skip
  if (otp) {
    const result = await verifyOtp(last10, otp);
    if (!result.valid) {
      throw new AuthError(result.reason || 'OTP verification failed');
    }
  }

  if (submitForApproval) {
    validateRegistrationPayload({
      ...payload,
      panNumber: payload.panNumber ?? payload.documents?.panNumber,
      aadhaarNumber: payload.aadhaarNumber ?? payload.documents?.aadhaarNumber,
      ifscCode: payload.ifscCode ?? payload.bank?.ifscCode,
      accountNumber: payload.accountNumber ?? payload.bank?.accountNumber,
      accountHolderName: payload.accountHolderName ?? payload.bank?.accountHolderName,
      upiId: payload.upiId ?? payload.bank?.upiId,
    });
  }

  const commonUser = await findOrCreateUserByPhone({ phone: last10, countryCode: '+91' });

  let vendor = null;
  if (vendorId) {
    vendor = await BikeVendor.findOne({ _id: vendorId, isDeleted: { $ne: true } });
  }
  if (!vendor) {
    vendor = await findVendorByPhone(last10);
  }

  if (vendor && vendor.status === 'approved') {
    throw new ValidationError('This mobile number is already registered as an approved bike rental vendor');
  }
  if (vendor && vendor.status === 'pending' && submitForApproval) {
    throw new ValidationError('Your registration is already pending approval');
  }

  if (!vendor) {
    vendor = new BikeVendor({
      userId: commonUser._id,
      ownerName: str(payload.ownerName) || 'Vendor',
      businessName: str(payload.businessName) || 'Bike Rental',
      phone: last10,
      phoneLast10: last10,
      phoneDigits: last10,
      status: 'onboarding',
    });
  } else if (String(vendor.userId) !== String(commonUser._id)) {
    vendor.userId = commonUser._id;
  }

  applyRegistrationPayload(vendor, payload);
  vendor.phone = last10;
  vendor.phoneLast10 = last10;
  vendor.phoneDigits = last10;

  if (submitForApproval) {
    vendor.status = 'pending';
    vendor.submittedAt = new Date();
    vendor.rejectionReason = '';
    vendor.rejectedAt = null;
    vendor.onboardingStep = 4;
    pushStatusHistory(vendor, 'pending', { reason: 'Submitted for admin approval' });
  } else {
    vendor.status = 'onboarding';
    vendor.onboardingStep = Math.min(4, Math.max(1, Number(payload.onboardingStep) || vendor.onboardingStep || 1));
  }

  await vendor.save();
  await syncCommonUserProfile(commonUser._id, {
    ownerName: vendor.ownerName,
    email: vendor.email,
    profilePhoto: vendor.profilePhoto,
    panNumber: vendor.documents?.panNumber,
    aadhaarNumber: vendor.documents?.aadhaarNumber,
    drivingLicenseNumber: vendor.documents?.drivingLicenseNumber,
  });

  const session = await createBikeVendorSession(vendor);
  return {
    ...session,
    vendor: serializeBikeVendor(vendor),
    linkedUserId: commonUser._id,
  };
};

export const getBikeVendorProfile = async (vendorId) => {
  const vendor = await BikeVendor.findById(vendorId).lean();
  if (!vendor || vendor.isDeleted) {
    throw new AuthError('Vendor profile not found');
  }
  const walletBalance = await getLinkedWalletBalance(vendor.userId);
  const linkedUser = await FoodUser.findById(vendor.userId)
    .select('name email phone profileImage walletBalance')
    .lean();

  return serializeBikeVendor(vendor, {
    walletBalance,
    linkedUser: linkedUser
      ? {
          id: linkedUser._id,
          name: linkedUser.name || '',
          email: linkedUser.email || '',
          phone: linkedUser.phone || '',
          profileImage: linkedUser.profileImage || '',
        }
      : null,
  });
};

export const listPendingBikeVendors = async ({ page = 1, limit = 20, search = '', status = 'pending' } = {}) => {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  const filter = {
    isDeleted: { $ne: true },
  };

  const statusKey = str(status).toLowerCase();
  if (statusKey && statusKey !== 'all') {
    filter.status = statusKey;
  } else if (!statusKey) {
    filter.status = 'pending';
  }

  const q = str(search);
  if (q) {
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { ownerName: regex },
      { businessName: regex },
      { phone: regex },
      { phoneLast10: regex },
      { email: regex },
      { vendorCode: regex },
      { city: regex },
    ];
  }

  const [records, total] = await Promise.all([
    BikeVendor.find(filter)
      .sort({ submittedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    BikeVendor.countDocuments(filter),
  ]);

  return {
    records: records.map((item) => serializeBikeVendor(item)),
    page: pageNum,
    limit: limitNum,
    total,
    pages: Math.max(1, Math.ceil(total / limitNum)),
  };
};

export const getBikeVendorByIdForAdmin = async (vendorId) => {
  const vendor = await BikeVendor.findById(vendorId).lean();
  if (!vendor || vendor.isDeleted) {
    throw new ValidationError('Vendor not found');
  }
  const linkedUser = await FoodUser.findById(vendor.userId)
    .select('name email phone profileImage createdAt')
    .lean();
  return serializeBikeVendor(vendor, {
    linkedUser: linkedUser || null,
    statusHistory: vendor.statusHistory || [],
  });
};

export const approveBikeVendor = async (vendorId, admin = null) => {
  const vendor = await BikeVendor.findById(vendorId);
  if (!vendor || vendor.isDeleted) {
    throw new ValidationError('Vendor not found');
  }
  if (vendor.status === 'approved') {
    return serializeBikeVendor(vendor);
  }

  vendor.status = 'approved';
  vendor.approvedAt = new Date();
  vendor.rejectedAt = null;
  vendor.rejectionReason = '';
  vendor.rejectedSnapshot = null;
  vendor.reviewedBy = admin?._id || admin?.id || null;
  vendor.isActive = true;
  pushStatusHistory(vendor, 'approved', {
    reason: 'Approved by admin',
    admin,
  });
  await vendor.save();
  return serializeBikeVendor(vendor);
};

export const rejectBikeVendor = async (vendorId, reason, admin = null) => {
  const rejectionReason = str(reason);
  if (!rejectionReason) {
    throw new ValidationError('Rejection reason is required');
  }

  const vendor = await BikeVendor.findById(vendorId);
  if (!vendor || vendor.isDeleted) {
    throw new ValidationError('Vendor not found');
  }

  vendor.rejectedSnapshot = { ...snapshotVendorFields(vendor), rejectionReason };
  vendor.status = 'rejected';
  vendor.rejectedAt = new Date();
  vendor.approvedAt = null;
  vendor.rejectionReason = rejectionReason;
  vendor.reviewedBy = admin?._id || admin?.id || null;
  pushStatusHistory(vendor, 'rejected', { reason: rejectionReason, admin });
  await vendor.save();
  return serializeBikeVendor(vendor);
};

export const updateBikeVendorAdmin = async (vendorId, body = {}, admin = null) => {
  const vendor = await BikeVendor.findById(vendorId);
  if (!vendor || vendor.isDeleted) {
    throw new ValidationError('Vendor not found');
  }

  if (body.commissionRate !== undefined) {
    const rate = body.commissionRate === null || body.commissionRate === ''
      ? null
      : Number(body.commissionRate);
    if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) {
      throw new ValidationError('Commission rate must be between 0 and 100');
    }
    vendor.commissionRate = rate;
  }

  if (body.isActive !== undefined) {
    vendor.isActive = Boolean(body.isActive);
  }

  await vendor.save();
  return serializeBikeVendor(vendor);
};

/** Middleware helper — approved vendors only for dashboard features */
export const assertBikeVendorApproved = (vendorLike) => {
  const status = String(vendorLike?.status || '').toLowerCase();
  if (status !== 'approved') {
    throw new AuthError(
      status === 'pending'
        ? 'Your vendor registration is pending approval'
        : status === 'rejected'
          ? 'Your vendor registration was rejected. Please update and resubmit.'
          : 'Complete vendor registration and get approved to access this feature',
    );
  }
};
