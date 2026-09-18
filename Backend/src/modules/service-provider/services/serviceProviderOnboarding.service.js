import { ValidationError } from '../../../core/auth/errors.js';
import { ServiceProviderProfile } from '../models/serviceProviderProfile.model.js';
import { ServiceProviderDocument } from '../models/serviceProviderDocument.model.js';
import { ServiceProviderZone } from '../models/serviceProviderZone.model.js';
import { validateFullOnboardingDto } from '../validators/onboarding.validator.js';
import {
  serializeServiceProviderProfile,
  snapshotProviderFields,
  pushStatusHistory,
  createServiceProviderSession,
} from './serviceProviderAuth.service.js';
import { loadProviderServicesWithZones, applyProviderServices } from './providerCatalog.service.js';
import { getProviderSelectableZones, assertActiveZones } from './zoneAccess.service.js';
import { listZones, listCategories, listServices, assertActiveCategory } from './serviceCatalog.service.js';

const getEditableProvider = async (providerId) => {
  const provider = await ServiceProviderProfile.findOne({ _id: providerId, isDeleted: { $ne: true } });
  if (!provider) throw new ValidationError('Service provider not found');
  if (provider.status === 'approved') {
    throw new ValidationError('Your profile is already approved. Contact support to update it.');
  }
  return provider;
};

/** One-shot onboarding submit — same shape as Bike Rent Vendor's `registerOrSubmitBikeVendor`:
 *  validate the whole form, save everything, flip to pending_approval, and mint a fresh
 *  token pair so the session survives past whatever the access token's TTL was at login. */
export const submitOnboarding = async (providerId, body) => {
  const data = validateFullOnboardingDto(body);
  const provider = await getEditableProvider(providerId);

  // Provider only ever SELECTS one existing admin-created zone — never creates,
  // edits, or requests one. Re-validated against the DB every submit (including
  // resubmission after rejection), so a stale/inactive/deleted zoneId can never
  // slip through even if the client sent something else.
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

  // Full-replace semantics: this submission is the source of truth for supplementary documents.
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

  provider.rejectedSnapshot = provider.status === 'rejected'
    ? { ...snapshotProviderFields(provider), rejectionReason: provider.rejectionReason }
    : provider.rejectedSnapshot;
  provider.status = 'pending_approval';
  provider.onboardingStep = 6;
  provider.submittedAt = new Date();
  provider.rejectionReason = '';
  provider.rejectedAt = null;
  pushStatusHistory(provider, 'pending_approval', { reason: 'Submitted for admin approval' });
  await provider.save();

  // Keep the legacy coverage table (still read by zoneAccess/customerCatalog for
  // per-service zone eligibility + customer discovery) in sync with the one zone
  // the provider is actually allowed to have — full-replace, exactly one row.
  await ServiceProviderZone.deleteMany({ providerId: provider._id });
  await ServiceProviderZone.create({ providerId: provider._id, zoneId: validZoneId });

  // categoryId itself is never relied on for authorization (the real single-category
  // rule is derived from the selected services' own categoryId in applyProviderServices)
  // — this just rejects an outright bogus/inactive id with a clean error instead of
  // silently ignoring it.
  await assertActiveCategory(data.categoryId);
  await applyProviderServices(provider, data.services);

  return createServiceProviderSession(provider);
};

export const getOnboardingDraft = async (providerId) => {
  const provider = await ServiceProviderProfile.findOne({ _id: providerId, isDeleted: { $ne: true } })
    .populate('zoneId', 'name country unit status coordinates');
  if (!provider) throw new ValidationError('Service provider not found');

  const [documents, providerServices, providerZones, selectableZones] = await Promise.all([
    ServiceProviderDocument.find({ providerId: provider._id }).lean(),
    loadProviderServicesWithZones(provider._id),
    ServiceProviderZone.find({ providerId: provider._id }).populate('zoneId', 'name status').lean(),
    getProviderSelectableZones(provider._id),
  ]);

  return {
    provider: serializeServiceProviderProfile(provider),
    resumeStep: provider.onboardingStep || 1,
    documents,
    services: providerServices,
    zones: providerZones,
    selectableZones,
  };
};

/** Active, admin-created zones a provider may pick from during onboarding —
 *  reachable before approval (unlike /zones/catalog, which requires an approved provider). */
export const getOnboardingZones = () => listZones({ status: 'active' });

/** Active categories selectable during onboarding — reachable before approval. */
export const getOnboardingCategories = () => listCategories({ status: 'active' });

/** Active services mapped to the given (not-yet-saved) zone selection — reachable before
 *  approval. Always zone-scoped by design: no zoneId means no services, never a silent
 *  fallback to the unfiltered catalog. An invalid/foreign zoneId just yields an empty list. */
export const getOnboardingServices = (zoneId) => {
  if (!zoneId) return [];
  return listServices({ status: 'active', zoneId });
};
