import { ValidationError } from '../../../core/auth/errors.js';
import { Service } from '../models/service.model.js';
import { ServiceCategory } from '../models/serviceCategory.model.js';
import { ServiceZoneAssignment } from '../models/serviceZoneAssignment.model.js';
import { ProviderService } from '../models/providerService.model.js';
import { ProviderServiceZone } from '../models/providerServiceZone.model.js';
import { ServiceProviderProfile } from '../models/serviceProviderProfile.model.js';
import { ServiceProviderZone } from '../models/serviceProviderZone.model.js';
import { ServiceZone } from '../models/serviceZone.model.js';
import { detectServiceProviderZone, activeZoneFilter } from './zoneAccess.service.js';

const activeServiceFilter = {
  isDeleted: { $ne: true },
  status: 'active',
  basePrice: { $gt: 0 },
};

/**
 * Customer-facing catalog for a lat/lng (or explicit zoneId).
 * Returns ONLY admin/customer price (basePrice). Never exposes providerPrice / ProviderService.price.
 */
export const listCustomerServicesNear = async ({ lat, lng, zoneId, categoryId } = {}) => {
  let zone = null;

  if (zoneId) {
    zone = await ServiceZone.findOne({ _id: zoneId, ...activeZoneFilter }).lean();
    if (!zone) {
      return { zone: null, categories: [], services: [], message: 'Zone is not available' };
    }
  } else if (lat !== undefined || lng !== undefined) {
    zone = await detectServiceProviderZone(lat, lng);
    if (!zone) {
      return { zone: null, categories: [], services: [], message: 'Your location is outside all supported service zones' };
    }
  } else {
    throw new ValidationError('Provide lat/lng or zoneId');
  }

  const zid = zone._id;

  // Catalog services explicitly assigned to this active zone
  const catalogAssignments = await ServiceZoneAssignment.find({ zoneId: zid }).select('serviceId').lean();
  const catalogServiceIds = new Set(catalogAssignments.map((a) => String(a.serviceId)));

  // Provider offerings in this zone — only from approved, active providers who still cover the zone
  const providerZoneRows = await ProviderServiceZone.find({ zoneId: zid }).lean();
  const providerIds = [...new Set(providerZoneRows.map((r) => String(r.providerId)))];

  const eligibleProviders = providerIds.length
    ? await ServiceProviderProfile.find({
      _id: { $in: providerIds },
      isDeleted: { $ne: true },
      isActive: { $ne: false },
      status: 'approved',
    }).select('_id').lean()
    : [];
  const eligibleProviderIds = new Set(eligibleProviders.map((p) => String(p._id)));

  // Provider must still have coverage on this zone
  const coverage = eligibleProviderIds.size
    ? await ServiceProviderZone.find({
      providerId: { $in: [...eligibleProviderIds] },
      zoneId: zid,
    }).select('providerId').lean()
    : [];
  const coveringProviders = new Set(coverage.map((c) => String(c.providerId)));

  const offeringRows = providerZoneRows.filter((r) => coveringProviders.has(String(r.providerId)));
  const offeredServiceIds = [...new Set(offeringRows.map((r) => String(r.serviceId)))];

  // Active ProviderService rows for those offerings
  const activeOffers = offeredServiceIds.length && coveringProviders.size
    ? await ProviderService.find({
      providerId: { $in: [...coveringProviders] },
      serviceId: { $in: offeredServiceIds },
      status: 'active',
    }).select('serviceId').lean()
    : [];
  const activeOfferedServiceIds = new Set(activeOffers.map((o) => String(o.serviceId)));

  const visibleServiceIds = new Set([
    ...catalogServiceIds,
    ...[...activeOfferedServiceIds].filter((id) => catalogServiceIds.has(id) || activeOfferedServiceIds.has(id)),
  ]);

  // Admin-created services with zone assignment are visible even without a provider.
  // Provider-offered services are visible when the provider offer is active in this zone.
  // Union both sets:
  for (const id of activeOfferedServiceIds) visibleServiceIds.add(id);
  for (const id of catalogServiceIds) visibleServiceIds.add(id);

  if (!visibleServiceIds.size) {
    return {
      zone: { _id: zone._id, name: zone.name },
      categories: [],
      services: [],
      message: 'No services available in your zone yet',
    };
  }

  const serviceFilter = {
    _id: { $in: [...visibleServiceIds] },
    ...activeServiceFilter,
  };
  if (categoryId) serviceFilter.categoryId = categoryId;

  const services = await Service.find(serviceFilter)
    .populate('categoryId', 'name icon status isDeleted')
    .sort({ displayOrder: 1, name: 1 })
    .lean();

  // Drop services whose category is inactive/deleted
  const customerServices = services
    .filter((s) => s.categoryId && s.categoryId.status === 'active' && s.categoryId.isDeleted !== true)
    .map((s) => ({
      _id: s._id,
      name: s.name,
      description: s.description || '',
      icon: s.icon || '',
      duration: s.duration || null,
      /** Customer-facing Admin Price only — never provider price */
      price: s.basePrice,
      basePrice: s.basePrice,
      categoryId: s.categoryId?._id || s.categoryId,
      categoryName: s.categoryId?.name || '',
      categoryIcon: s.categoryId?.icon || '',
      zoneId: zone._id,
      zoneName: zone.name,
    }));

  const categoryIds = [...new Set(customerServices.map((s) => String(s.categoryId)))];
  const categories = categoryIds.length
    ? await ServiceCategory.find({
      _id: { $in: categoryIds },
      isDeleted: { $ne: true },
      status: 'active',
    }).select('_id name icon displayOrder').sort({ displayOrder: 1, name: 1 }).lean()
    : [];

  return {
    zone: { _id: zone._id, name: zone.name },
    categories,
    services: customerServices,
  };
};

export const detectZoneForCustomer = async ({ lat, lng } = {}) => {
  const zone = await detectServiceProviderZone(lat, lng);
  if (!zone) {
    return { zone: null, inService: false, message: 'Your location is outside all supported service zones' };
  }
  return {
    zone: {
      _id: zone._id,
      name: zone.name,
      country: zone.country,
      unit: zone.unit,
    },
    inService: true,
  };
};
