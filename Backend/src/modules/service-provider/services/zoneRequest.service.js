import { ValidationError } from '../../../core/auth/errors.js';
import { ZoneRequest } from '../models/zoneRequest.model.js';
import { ServiceZone } from '../models/serviceZone.model.js';
import { ServiceProviderProfile } from '../models/serviceProviderProfile.model.js';
import { ServiceProviderZone } from '../models/serviceProviderZone.model.js';

const str = (value) => String(value ?? '').trim();
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exactNameRegex = (name) => new RegExp(`^${escapeRegex(name)}$`, 'i');
const UNITS = new Set(['kilometer', 'mile']);

const normalizeCoordinates = (coords = []) => {
  const list = Array.isArray(coords) ? coords : [];
  const normalized = list
    .map((c) => ({ lat: Number(c.lat ?? c.latitude), lng: Number(c.lng ?? c.longitude) }))
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));
  if (normalized.length < 3) {
    throw new ValidationError('Draw a zone with at least 3 points on the map');
  }
  return normalized;
};

const assertNoDuplicate = async (providerId, name, { excludeRequestId } = {}) => {
  const nameRegex = exactNameRegex(name);

  const existingZone = await ServiceZone.findOne({
    name: nameRegex,
    isDeleted: { $ne: true },
    status: 'active',
  }).select('name').lean();
  if (existingZone) {
    throw new ValidationError(`"${existingZone.name}" already exists — select it instead of requesting it`);
  }

  const pendingFilter = { providerId, status: 'pending', requestedName: nameRegex };
  if (excludeRequestId) pendingFilter._id = { $ne: excludeRequestId };
  const existingPending = await ZoneRequest.findOne(pendingFilter).lean();
  if (existingPending) {
    throw new ValidationError(`You already have a pending request for "${existingPending.requestedName}"`);
  }
};

export const createZoneRequest = async (providerId, { requestedName, country, unit, coordinates, polygon, reason }) => {
  const name = str(requestedName);
  if (!name) throw new ValidationError('Zone name is required');

  const provider = await ServiceProviderProfile.findOne({ _id: providerId, isDeleted: { $ne: true } });
  if (!provider) throw new ValidationError('Service provider not found');

  const normalizedCoordinates = normalizeCoordinates(coordinates);
  await assertNoDuplicate(providerId, name);

  const request = await ZoneRequest.create({
    providerId,
    requestedName: name,
    country: str(country) || 'India',
    unit: UNITS.has(unit) ? unit : 'kilometer',
    coordinates: normalizedCoordinates,
    polygon: str(polygon),
    reason: str(reason),
    status: 'pending',
  });
  return request.toObject();
};

export const listMyZoneRequests = async (providerId) => {
  return ZoneRequest.find({ providerId }).sort({ createdAt: -1 }).lean();
};

export const resubmitZoneRequest = async (requestId, providerId, { requestedName, country, unit, coordinates, polygon, reason }) => {
  const request = await ZoneRequest.findOne({ _id: requestId, providerId });
  if (!request) throw new ValidationError('Zone request not found');
  if (request.status !== 'rejected') throw new ValidationError('Only rejected requests can be edited and resubmitted');

  const name = str(requestedName) || request.requestedName;
  const normalizedCoordinates = coordinates !== undefined ? normalizeCoordinates(coordinates) : request.coordinates;
  await assertNoDuplicate(providerId, name, { excludeRequestId: request._id });

  request.history.push({ status: 'rejected', reason: request.rejectionReason, at: request.reviewedAt || new Date() });
  request.requestedName = name;
  request.country = country !== undefined ? (str(country) || 'India') : request.country;
  request.unit = UNITS.has(unit) ? unit : request.unit;
  request.coordinates = normalizedCoordinates;
  request.polygon = polygon !== undefined ? str(polygon) : request.polygon;
  request.reason = str(reason ?? request.reason);
  request.status = 'pending';
  request.rejectionReason = '';
  request.reviewedBy = null;
  request.reviewedAt = null;
  await request.save();
  return request.toObject();
};

export const listZoneRequests = async ({ status = 'pending', page = 1, limit = 20 } = {}) => {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  const filter = {};
  const statusKey = str(status).toLowerCase();
  if (statusKey && statusKey !== 'all') filter.status = statusKey;

  const [records, total] = await Promise.all([
    ZoneRequest.find(filter)
      .populate('providerId', 'ownerName providerCode phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    ZoneRequest.countDocuments(filter),
  ]);

  return {
    records,
    page: pageNum,
    limit: limitNum,
    total,
    pages: Math.max(1, Math.ceil(total / limitNum)),
  };
};

/** Approving creates the actual catalog ServiceZone row and auto-covers the
 *  requesting provider for it — they asked to cover this zone, no need to make
 *  them re-add it by hand once it exists. */
export const approveZoneRequest = async (requestId, admin = null) => {
  const request = await ZoneRequest.findById(requestId);
  if (!request) throw new ValidationError('Zone request not found');
  if (request.status !== 'pending') throw new ValidationError('This request has already been reviewed');

  const zone = await ServiceZone.create({
    name: request.requestedName,
    country: request.country || 'India',
    unit: request.unit || 'kilometer',
    coordinates: request.coordinates,
    polygon: request.polygon || '',
    status: 'active',
    sourceRequestId: request._id,
    createdBy: admin,
  });

  await ServiceProviderZone.findOneAndUpdate(
    { providerId: request.providerId, zoneId: zone._id },
    { $setOnInsert: { providerId: request.providerId, zoneId: zone._id } },
    { upsert: true, new: true },
  );

  request.status = 'approved';
  request.createdZoneId = zone._id;
  request.reviewedBy = admin?._id || admin?.id || null;
  request.reviewedAt = new Date();
  await request.save();

  return { request: request.toObject(), zone: zone.toObject() };
};

export const rejectZoneRequest = async (requestId, reason, admin = null) => {
  const rejectionReason = str(reason);
  if (!rejectionReason) throw new ValidationError('Rejection reason is required');

  const request = await ZoneRequest.findById(requestId);
  if (!request) throw new ValidationError('Zone request not found');
  if (request.status !== 'pending') throw new ValidationError('This request has already been reviewed');

  request.status = 'rejected';
  request.rejectionReason = rejectionReason;
  request.reviewedBy = admin?._id || admin?.id || null;
  request.reviewedAt = new Date();
  await request.save();

  return request.toObject();
};
