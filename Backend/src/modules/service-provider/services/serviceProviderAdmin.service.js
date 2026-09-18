import { ValidationError } from '../../../core/auth/errors.js';
import { FoodUser } from '../../../core/users/user.model.js';
import { findOrCreateUserByPhone } from '../../../core/users/user.service.js';
import { ServiceProviderProfile } from '../models/serviceProviderProfile.model.js';
import { ServiceProviderDocument } from '../models/serviceProviderDocument.model.js';
import { ProviderService } from '../models/providerService.model.js';
import { ServiceProviderZone } from '../models/serviceProviderZone.model.js';
import {
  normalizePhoneDigits,
  findProviderByPhone,
  serializeServiceProviderProfile,
  pushStatusHistory,
} from './serviceProviderAuth.service.js';
import { assertActiveZones } from './zoneAccess.service.js';
import { applyProviderServices } from './providerCatalog.service.js';
import { assertActiveCategory } from './serviceCatalog.service.js';
import {
  validateAdminOnboardServiceProviderDto,
  validateFullOnboardingDto,
} from '../validators/onboarding.validator.js';

const str = (value) => String(value ?? '').trim();

/** Full-replace: applies the validated onboarding fields (name/documents/bank/zone/etc)
 *  onto a ServiceProviderProfile doc and syncs its KYC docs + zone coverage row.
 *  Shared by admin-create and admin-edit so the two paths can never drift apart. */
const applyProviderFields = async (provider, data) => {
  const [validZoneId] = await assertActiveZones([data.zoneId], { min: 1, label: 'service zone' });

  provider.ownerName = data.ownerName;
  provider.email = data.email;
  provider.profileImage = data.profileImage;
  provider.zoneId = validZoneId;
  provider.experience = data.experience;
  provider.skills = data.skills;
  provider.about = data.about;
  provider.documents = {
    panNumber: data.panNumber,
    panImage: data.panImage,
    aadhaarNumber: data.aadhaarNumber,
    aadhaarImage: data.aadhaarImage,
  };
  provider.bank = {
    bankName: data.bankName,
    accountHolderName: data.accountHolderName,
    accountNumber: data.accountNumber,
    ifscCode: data.ifscCode,
    accountType: data.accountType,
    upiId: data.upiId,
  };

  await ServiceProviderDocument.deleteMany({ providerId: provider._id });
  if (data.documents.length) {
    await ServiceProviderDocument.insertMany(
      data.documents.map((doc) => ({
        providerId: provider._id,
        documentType: doc.documentType,
        label: doc.label || '',
        documentUrl: doc.documentUrl,
        verificationStatus: 'pending',
      })),
    );
  }

  await ServiceProviderZone.deleteMany({ providerId: provider._id });
  await ServiceProviderZone.create({ providerId: provider._id, zoneId: validZoneId });

  // categoryId isn't itself relied on for authorization (the real single-category rule
  // is derived from the selected services' own categoryId in applyProviderServices) —
  // this just rejects an outright bogus/inactive id with a clean error.
  await assertActiveCategory(data.categoryId);
  // Category is derived from the selected services themselves (never trusted from the
  // client directly) — applyProviderServices re-validates zone/active/single-category
  // and persists ProviderService + ProviderServiceZone.
  await applyProviderServices(provider, data.services);
};

export const listServiceProviders = async ({ page = 1, limit = 20, search = '', status = 'pending_approval' } = {}) => {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  const filter = { isDeleted: { $ne: true } };

  const statusKey = str(status).toLowerCase();
  if (statusKey === 'suspended') {
    filter.isActive = false;
  } else if (statusKey && statusKey !== 'all') {
    filter.status = statusKey;
  } else if (!statusKey) {
    filter.status = 'pending_approval';
  }

  const q = str(search);
  if (q) {
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { ownerName: regex },
      { phone: regex },
      { phoneLast10: regex },
      { email: regex },
      { providerCode: regex },
    ];
  }

  const [records, total] = await Promise.all([
    ServiceProviderProfile.find(filter)
      .sort({ submittedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    ServiceProviderProfile.countDocuments(filter),
  ]);

  return {
    records: records.map((r) => serializeServiceProviderProfile(r)),
    page: pageNum,
    limit: limitNum,
    total,
    pages: Math.max(1, Math.ceil(total / limitNum)),
  };
};

export const getServiceProviderByIdForAdmin = async (providerId) => {
  const provider = await ServiceProviderProfile.findById(providerId)
    .populate('zoneId', 'name country unit status coordinates')
    .lean();
  if (!provider || provider.isDeleted) throw new ValidationError('Service provider not found');

  const [linkedUser, documents, services, zones] = await Promise.all([
    FoodUser.findById(provider.userId).select('name email phone profileImage createdAt').lean(),
    ServiceProviderDocument.find({ providerId: provider._id }).lean(),
    ProviderService.find({ providerId: provider._id })
      .populate({ path: 'serviceId', select: 'name basePrice categoryId', populate: { path: 'categoryId', select: 'name' } })
      .lean(),
    ServiceProviderZone.find({ providerId: provider._id }).populate('zoneId', 'name').lean(),
  ]);

  return serializeServiceProviderProfile(provider, {
    linkedUser: linkedUser || null,
    statusHistory: provider.statusHistory || [],
    // NOTE: named kycDocuments (not documents) so it doesn't clobber the base
    // serializer's structured `documents` field (PAN/Aadhaar number + image).
    // This list holds only supplementary uploads (address proof / other).
    kycDocuments: documents,
    services,
    zones,
  });
};

export const approveServiceProvider = async (providerId, admin = null) => {
  const provider = await ServiceProviderProfile.findById(providerId);
  if (!provider || provider.isDeleted) throw new ValidationError('Service provider not found');
  if (provider.status === 'approved') return serializeServiceProviderProfile(provider);

  provider.status = 'approved';
  provider.approvedAt = new Date();
  provider.rejectedAt = null;
  provider.rejectionReason = '';
  provider.rejectedSnapshot = null;
  provider.reviewedBy = admin?._id || admin?.id || null;
  provider.approvedBy = admin?._id || admin?.id || null;
  provider.isActive = true;
  pushStatusHistory(provider, 'approved', { reason: 'Approved by admin', admin });
  await provider.save();
  return serializeServiceProviderProfile(provider);
};

export const rejectServiceProvider = async (providerId, reason, admin = null) => {
  const rejectionReason = str(reason);
  if (!rejectionReason) throw new ValidationError('Rejection reason is required');

  const provider = await ServiceProviderProfile.findById(providerId);
  if (!provider || provider.isDeleted) throw new ValidationError('Service provider not found');

  provider.status = 'rejected';
  provider.rejectedAt = new Date();
  provider.approvedAt = null;
  provider.rejectionReason = rejectionReason;
  provider.reviewedBy = admin?._id || admin?.id || null;
  pushStatusHistory(provider, 'rejected', { reason: rejectionReason, admin });
  await provider.save();
  return serializeServiceProviderProfile(provider);
};

export const suspendServiceProvider = async (providerId, reason, admin = null) => {
  const provider = await ServiceProviderProfile.findById(providerId);
  if (!provider || provider.isDeleted) throw new ValidationError('Service provider not found');

  provider.isActive = false;
  pushStatusHistory(provider, provider.status, { reason: reason ? str(reason) : 'Suspended by admin', admin });
  await provider.save();
  return serializeServiceProviderProfile(provider);
};

export const activateServiceProvider = async (providerId, admin = null) => {
  const provider = await ServiceProviderProfile.findById(providerId);
  if (!provider || provider.isDeleted) throw new ValidationError('Service provider not found');

  provider.isActive = true;
  pushStatusHistory(provider, provider.status, { reason: 'Reactivated by admin', admin });
  await provider.save();
  return serializeServiceProviderProfile(provider);
};

/**
 * Admin-initiated full onboarding — same field rules as self-registration
 * (validateAdminOnboardServiceProviderDto reuses the exact self-registration schema),
 * but skips the pending_approval step entirely: the provider is created already
 * approved + active, since an admin manually entering the details IS the approval.
 * Reuses the centralized FoodUser by phone (found or created) — never a duplicate.
 */
export const adminOnboardServiceProvider = async (body, admin = null) => {
  const data = validateAdminOnboardServiceProviderDto(body);

  const last10 = normalizePhoneDigits(data.phone);
  if (!last10 || last10.length < 10) throw new ValidationError('Enter a valid 10-digit mobile number');

  const existing = await findProviderByPhone(last10);
  if (existing) throw new ValidationError('A service provider already exists for this phone number');

  const commonUser = await findOrCreateUserByPhone({ phone: last10, countryCode: '+91' });

  const provider = new ServiceProviderProfile({
    userId: commonUser._id,
    ownerName: data.ownerName,
    phone: last10,
    phoneLast10: last10,
    phoneDigits: last10,
    status: 'onboarding',
    onboardingStep: 1,
  });

  await applyProviderFields(provider, data);

  provider.status = 'approved';
  provider.onboardingStep = 6;
  provider.submittedAt = new Date();
  provider.approvedAt = new Date();
  provider.reviewedBy = admin?._id || admin?.id || null;
  provider.approvedBy = admin?._id || admin?.id || null;
  provider.isActive = true;
  pushStatusHistory(provider, 'approved', { reason: 'Created and approved directly by admin', admin });
  await provider.save();

  return serializeServiceProviderProfile(provider);
};

/** Admin edit of an existing provider's full profile — same field rules as
 *  self-registration, but admin-authorized so it works regardless of status
 *  (unlike the provider's own submitOnboarding, which locks once approved). */
export const adminUpdateServiceProvider = async (providerId, body, admin = null) => {
  const data = validateFullOnboardingDto(body);

  const provider = await ServiceProviderProfile.findOne({ _id: providerId, isDeleted: { $ne: true } });
  if (!provider) throw new ValidationError('Service provider not found');

  const wasApproved = provider.status === 'approved';
  await applyProviderFields(provider, data);

  // Editing an approved provider's details doesn't change their status — just log it.
  // Editing a non-approved provider (onboarding/pending/rejected draft) via this admin
  // form is treated the same as admin-creating one: finalize it as approved.
  if (wasApproved) {
    pushStatusHistory(provider, provider.status, { reason: 'Profile updated by admin', admin });
  } else {
    provider.status = 'approved';
    provider.onboardingStep = 6;
    provider.submittedAt = provider.submittedAt || new Date();
    provider.approvedAt = new Date();
    provider.rejectedAt = null;
    provider.rejectionReason = '';
    provider.rejectedSnapshot = null;
    provider.reviewedBy = admin?._id || admin?.id || null;
    provider.approvedBy = admin?._id || admin?.id || null;
    provider.isActive = true;
    pushStatusHistory(provider, 'approved', { reason: 'Completed and approved by admin', admin });
  }

  await provider.save();
  return serializeServiceProviderProfile(provider);
};
