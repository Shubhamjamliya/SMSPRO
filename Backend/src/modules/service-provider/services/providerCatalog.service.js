import { ValidationError } from '../../../core/auth/errors.js';
import { ServiceProviderProfile } from '../models/serviceProviderProfile.model.js';
import { ProviderService } from '../models/providerService.model.js';
import { ProviderServiceZone } from '../models/providerServiceZone.model.js';
import { Service } from '../models/service.model.js';
import { ServiceZone } from '../models/serviceZone.model.js';
import { validateProviderServicesDto } from '../validators/catalog.validator.js';
import { getProviderSelectableZones, attachZonesToServices } from './zoneAccess.service.js';
import { ServiceZoneAssignment } from '../models/serviceZoneAssignment.model.js';

/**
 * Ongoing, post-onboarding self-management (services offered / zones covered).
 * Deliberately NOT locked once the profile is approved — unlike onboarding fields
 * (name/documents/bank), a provider must be able to keep adjusting their service
 * list and coverage area for as long as they're active on the platform.
 */
const getManageableProvider = async (providerId) => {
  const provider = await ServiceProviderProfile.findOne({ _id: providerId, isDeleted: { $ne: true } });
  if (!provider) throw new ValidationError('Service provider not found');
  if (provider.isActive === false) {
    throw new ValidationError('Your account has been deactivated. Contact support.');
  }
  return provider;
};

const loadProviderServicesWithZones = async (providerId) => {
  const [services, serviceZones] = await Promise.all([
    ProviderService.find({ providerId }).populate('serviceId', 'name basePrice categoryId status').lean(),
    ProviderServiceZone.find({ providerId }).populate('zoneId', 'name status').lean(),
  ]);

  const zonesByService = new Map();
  for (const row of serviceZones) {
    const sid = String(row.serviceId);
    if (!zonesByService.has(sid)) zonesByService.set(sid, []);
    if (row.zoneId) {
      zonesByService.get(sid).push({
        _id: row.zoneId._id || row.zoneId,
        name: row.zoneId.name,
        status: row.zoneId.status,
      });
    }
  }

  return services.map((svc) => {
    const sid = String(svc.serviceId?._id || svc.serviceId);
    const zones = zonesByService.get(sid) || [];
    return {
      ...svc,
      zones,
      zoneIds: zones.map((z) => z._id),
    };
  });
};

/**
 * Core validation + persistence for "which catalog services does this provider offer,
 * at what price" — shared by the standalone post-onboarding PATCH /services endpoint
 * AND the onboarding submit paths (self-registration + admin create/edit), so all three
 * entry points enforce the exact same rules and can never drift apart.
 *
 * Takes an already-resolved `provider` doc (its zoneId must already be set/valid) rather
 * than a providerId, since onboarding callers pass a not-yet-saved `new` doc.
 * `servicesInput` is `[{serviceId, price}]` — never trusted for zone/category eligibility,
 * both are re-derived from the DB (ServiceZoneAssignment / each Service's own categoryId).
 */
export const applyProviderServices = async (provider, servicesInput = []) => {
  const serviceIds = servicesInput.map((s) => s.serviceId);

  if (serviceIds.length) {
    if (!provider.zoneId) {
      throw new ValidationError('You need an assigned service zone before you can add services');
    }
    const zone = await ServiceZone.findOne({ _id: provider.zoneId, isDeleted: { $ne: true } }).select('status').lean();
    if (!zone || zone.status !== 'active') {
      throw new ValidationError('Your service zone is currently inactive — contact admin before adding new services');
    }

    const uniqueServiceIds = [...new Set(serviceIds.map(String))];
    if (uniqueServiceIds.length !== serviceIds.length) {
      throw new ValidationError('Duplicate service selections are not allowed');
    }

    // basePrice > 0 required — a legacy catalog service with no admin price set
    // can't be offered until admin fixes its price.
    const validServices = await Service.find({
      _id: { $in: serviceIds },
      isDeleted: { $ne: true },
      status: 'active',
      basePrice: { $gt: 0 },
    }).select('_id categoryId').lean();
    const validIds = new Set(validServices.map((s) => String(s._id)));
    const invalid = serviceIds.filter((id) => !validIds.has(String(id)));
    if (invalid.length) throw new ValidationError('One or more selected services are not available');

    // A provider can only offer services from one category at a time.
    const distinctCategories = new Set(validServices.map((s) => String(s.categoryId)));
    if (distinctCategories.size > 1) {
      throw new ValidationError('You can only offer services from one category at a time');
    }

    // Every selected service must already be admin-mapped to the provider's own zone —
    // never auto-created here, admin controls zone availability exclusively.
    const zoneAssignments = await ServiceZoneAssignment.find({
      serviceId: { $in: serviceIds },
      zoneId: provider.zoneId,
    }).select('serviceId').lean();
    const zoneEligible = new Set(zoneAssignments.map((a) => String(a.serviceId)));
    const outOfZone = serviceIds.filter((id) => !zoneEligible.has(String(id)));
    if (outOfZone.length) {
      throw new ValidationError('One or more selected services are not available in your service zone');
    }
  }

  await ProviderService.deleteMany({ providerId: provider._id });
  await ProviderServiceZone.deleteMany({ providerId: provider._id });

  if (servicesInput.length) {
    await ProviderService.insertMany(
      servicesInput.map((s) => ({
        providerId: provider._id,
        serviceId: s.serviceId,
        price: s.price,
        status: 'active',
      })),
    );
    await ProviderServiceZone.insertMany(
      servicesInput.map((s) => ({
        providerId: provider._id,
        serviceId: s.serviceId,
        zoneId: provider.zoneId,
      })),
    );
  }
};

/** Provider self-service selection: which catalog services they offer, at what price.
 *  A provider has exactly ONE admin-assigned zone (set at onboarding, never provider-editable),
 *  so zone eligibility is enforced here — never provider-supplied — via ServiceZoneAssignment.
 *  Unlike onboarding, this allows an empty list (a provider may temporarily offer nothing). */
export const updateProviderServices = async (providerId, body) => {
  const data = validateProviderServicesDto(body);
  const provider = await getManageableProvider(providerId);
  await applyProviderServices(provider, data.services);
  return loadProviderServicesWithZones(provider._id);
};

/** Services a provider may currently pick from: admin-active + mapped to their one zone,
 *  UNIONED with whatever they already have selected (even if it went stale — inactive,
 *  re-zoned, etc.) so they can always see and consciously drop a stale selection instead
 *  of "Save" silently failing on an entry they can no longer even see. */
export const getProviderServiceCatalog = async (providerId) => {
  const provider = await getManageableProvider(providerId);

  const [zoneAssignments, currentSelections] = await Promise.all([
    provider.zoneId
      ? ServiceZoneAssignment.find({ zoneId: provider.zoneId }).select('serviceId').lean()
      : Promise.resolve([]),
    ProviderService.find({ providerId: provider._id }).select('serviceId').lean(),
  ]);

  const allIds = [...new Set([
    ...zoneAssignments.map((a) => String(a.serviceId)),
    ...currentSelections.map((s) => String(s.serviceId)),
  ])];
  if (!allIds.length) return [];

  const services = await Service.find({ _id: { $in: allIds }, isDeleted: { $ne: true } })
    .populate('categoryId', 'name')
    .sort({ displayOrder: 1, name: 1 })
    .lean();
  return attachZonesToServices(services);
};

export const listProviderSelectableZones = async (providerId) => {
  await getManageableProvider(providerId);
  return getProviderSelectableZones(providerId);
};

export { loadProviderServicesWithZones };
