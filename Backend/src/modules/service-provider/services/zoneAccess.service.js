import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';
import { ServiceZone } from '../models/serviceZone.model.js';
import { ServiceProviderZone } from '../models/serviceProviderZone.model.js';
import { ServiceZoneAssignment } from '../models/serviceZoneAssignment.model.js';
import { ProviderServiceZone } from '../models/providerServiceZone.model.js';
import { isPointInPolygon, polygonArea } from '../../bike-rent/utils/geo.util.js';

const activeZoneFilter = { isDeleted: { $ne: true }, status: 'active' };

const toObjectIds = (ids = []) => {
  const unique = [...new Set((ids || []).map((id) => String(id)).filter(Boolean))];
  return unique.map((id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ValidationError('One or more zone IDs are invalid');
    }
    return new mongoose.Types.ObjectId(id);
  });
};

/** Active, non-deleted catalog zones by id. */
export const assertActiveZones = async (zoneIds = [], { min = 1, label = 'zone' } = {}) => {
  const ids = toObjectIds(zoneIds);
  if (ids.length < min) {
    throw new ValidationError(`Select at least ${min} ${label}${min === 1 ? '' : 's'}`);
  }

  const zones = await ServiceZone.find({ _id: { $in: ids }, ...activeZoneFilter }).select('_id name').lean();
  const valid = new Set(zones.map((z) => String(z._id)));
  const invalid = ids.filter((id) => !valid.has(String(id)));
  if (invalid.length) {
    throw new ValidationError('One or more selected zones are inactive, deleted, or unavailable');
  }
  return ids.map((id) => String(id));
};

/**
 * Zones a provider may assign to services:
 * coverage rows (ServiceProviderZone) whose catalog zone is active + not deleted.
 * Pending/rejected zone requests never create coverage, so they never appear here.
 */
export const getProviderSelectableZoneIds = async (providerId) => {
  const coverage = await ServiceProviderZone.find({ providerId }).select('zoneId').lean();
  if (!coverage.length) return [];

  const zoneIds = coverage.map((row) => row.zoneId).filter(Boolean);
  const activeZones = await ServiceZone.find({ _id: { $in: zoneIds }, ...activeZoneFilter }).select('_id').lean();
  return activeZones.map((z) => String(z._id));
};

export const getProviderSelectableZones = async (providerId) => {
  const coverage = await ServiceProviderZone.find({ providerId }).select('zoneId').lean();
  if (!coverage.length) return [];

  const zoneIds = coverage.map((row) => row.zoneId).filter(Boolean);
  return ServiceZone.find({ _id: { $in: zoneIds }, ...activeZoneFilter })
    .select('_id name country unit status coordinates')
    .sort({ name: 1 })
    .lean();
};

/** Validate zoneIds against the provider's selectable (approved + active) zones. */
export const assertProviderSelectableZones = async (providerId, zoneIds = [], { min = 1 } = {}) => {
  const requested = toObjectIds(zoneIds).map((id) => String(id));
  if (requested.length < min) {
    throw new ValidationError('Select at least one approved zone for this service');
  }

  const allowed = new Set(await getProviderSelectableZoneIds(providerId));
  if (!allowed.size) {
    throw new ValidationError('You need at least one approved active zone before you can add services');
  }

  const unauthorized = requested.filter((id) => !allowed.has(id));
  if (unauthorized.length) {
    throw new ValidationError(
      'One or more selected zones are not approved for your account (pending, rejected, inactive, deleted, or belonging to another provider)',
    );
  }
  return requested;
};

export const replaceServiceZoneAssignments = async (serviceId, zoneIds = []) => {
  const ids = await assertActiveZones(zoneIds, { min: 1 });
  await ServiceZoneAssignment.deleteMany({ serviceId });
  if (ids.length) {
    await ServiceZoneAssignment.insertMany(
      ids.map((zoneId) => ({ serviceId, zoneId })),
      { ordered: false },
    );
  }
  return ids;
};

export const attachZonesToServices = async (services = []) => {
  if (!services.length) return services;
  const serviceIds = services.map((s) => s._id);
  const assignments = await ServiceZoneAssignment.find({ serviceId: { $in: serviceIds } })
    .populate('zoneId', 'name status isDeleted')
    .lean();

  const byService = new Map();
  for (const row of assignments) {
    const sid = String(row.serviceId);
    if (!byService.has(sid)) byService.set(sid, []);
    if (row.zoneId && row.zoneId.isDeleted !== true) {
      byService.get(sid).push({
        _id: row.zoneId._id,
        name: row.zoneId.name,
        status: row.zoneId.status,
      });
    }
  }

  return services.map((svc) => {
    const zones = byService.get(String(svc._id)) || [];
    return {
      ...svc,
      zones,
      zoneIds: zones.map((z) => z._id),
    };
  });
};

export const replaceProviderServiceZones = async (providerId, serviceId, zoneIds = []) => {
  const ids = await assertProviderSelectableZones(providerId, zoneIds, { min: 1 });
  await ProviderServiceZone.deleteMany({ providerId, serviceId });
  await ProviderServiceZone.insertMany(
    ids.map((zoneId) => ({ providerId, serviceId, zoneId })),
  );
  return ids;
};

export const clearProviderServiceZones = async (providerId, serviceIds = null) => {
  const filter = { providerId };
  if (serviceIds) filter.serviceId = { $in: serviceIds };
  await ProviderServiceZone.deleteMany(filter);
};

/** Detect the smallest active SP zone containing lat/lng (Bike Rent pattern). */
export const detectServiceProviderZone = async (lat, lng) => {
  const latN = Number(lat);
  const lngN = Number(lng);
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
    throw new ValidationError('Valid latitude and longitude are required');
  }

  const zones = await ServiceZone.find({
    ...activeZoneFilter,
    'coordinates.2': { $exists: true },
  }).lean();

  const matches = [];
  for (const zone of zones) {
    const coords = zone.coordinates || [];
    if (coords.length >= 3 && isPointInPolygon(latN, lngN, coords)) {
      matches.push({ zone, area: polygonArea(coords) });
    }
  }

  if (!matches.length) return null;
  matches.sort((a, b) => a.area - b.area);
  return matches[0].zone;
};

export { activeZoneFilter, toObjectIds };
