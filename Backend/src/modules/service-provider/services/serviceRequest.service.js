import { ValidationError } from '../../../core/auth/errors.js';
import { ServiceRequest } from '../models/serviceRequest.model.js';
import { Service } from '../models/service.model.js';
import { ServiceCategory } from '../models/serviceCategory.model.js';
import { ServiceProviderProfile } from '../models/serviceProviderProfile.model.js';
import { ProviderService } from '../models/providerService.model.js';
import { ProviderServiceZone } from '../models/providerServiceZone.model.js';
import {
  assertProviderSelectableZones,
  replaceServiceZoneAssignments,
} from './zoneAccess.service.js';

const str = (value) => String(value ?? '').trim();
const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
const REQUEST_STATUSES = new Set(['active', 'inactive']);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exactNameRegex = (name) => new RegExp(`^${escapeRegex(name)}$`, 'i');

const assertNoDuplicate = async (providerId, categoryId, name, { excludeRequestId } = {}) => {
  const nameRegex = exactNameRegex(name);

  const existingService = await Service.findOne({
    categoryId,
    name: nameRegex,
    isDeleted: { $ne: true },
    status: 'active',
  }).select('name').lean();
  if (existingService) {
    throw new ValidationError(`"${existingService.name}" already exists in this category — select it instead of requesting it`);
  }

  const pendingFilter = { providerId, status: 'pending', requestedName: nameRegex };
  if (excludeRequestId) pendingFilter._id = { $ne: excludeRequestId };
  const existingPending = await ServiceRequest.findOne(pendingFilter).lean();
  if (existingPending) {
    throw new ValidationError(`You already have a pending request for "${existingPending.requestedName}"`);
  }
};

export const createServiceRequest = async (
  providerId,
  { requestedName, categoryId, reason, icon, description, requestedStatus, basePrice, providerPrice, zoneIds },
) => {
  const name = str(requestedName);
  if (!name) throw new ValidationError('Requested service name is required');
  if (!categoryId) throw new ValidationError('Select a category for this service request');
  if (!(Number(providerPrice) > 0)) {
    throw new ValidationError('Enter your price for this service (must be greater than ₹0)');
  }

  const provider = await ServiceProviderProfile.findOne({ _id: providerId, isDeleted: { $ne: true } });
  if (!provider) throw new ValidationError('Service provider not found');

  const category = await ServiceCategory.findOne({ _id: categoryId, isDeleted: { $ne: true }, status: 'active' });
  if (!category) throw new ValidationError('Selected category is not available');

  const validatedZoneIds = await assertProviderSelectableZones(providerId, zoneIds || [], { min: 1 });
  await assertNoDuplicate(providerId, categoryId, name);

  const request = await ServiceRequest.create({
    providerId,
    requestedName: name,
    categoryId,
    reason: str(reason),
    icon: str(icon),
    description: str(description),
    requestedStatus: REQUEST_STATUSES.has(requestedStatus) ? requestedStatus : 'active',
    basePrice: num(basePrice),
    providerPrice: num(providerPrice),
    zoneIds: validatedZoneIds,
    status: 'pending',
  });
  return request.toObject();
};

export const listMyServiceRequests = async (providerId) => {
  return ServiceRequest.find({ providerId })
    .populate('categoryId', 'name')
    .populate('zoneIds', 'name status')
    .sort({ createdAt: -1 })
    .lean();
};

export const resubmitServiceRequest = async (
  requestId,
  providerId,
  { requestedName, categoryId, reason, icon, description, requestedStatus, basePrice, providerPrice, zoneIds },
) => {
  const request = await ServiceRequest.findOne({ _id: requestId, providerId });
  if (!request) throw new ValidationError('Service request not found');
  if (request.status !== 'rejected') throw new ValidationError('Only rejected requests can be edited and resubmitted');

  const name = str(requestedName) || request.requestedName;
  const nextCategoryId = categoryId || request.categoryId;
  const nextProviderPrice = providerPrice !== undefined ? Number(providerPrice) : request.providerPrice;
  if (!(nextProviderPrice > 0)) {
    throw new ValidationError('Enter your price for this service (must be greater than ₹0)');
  }
  const category = await ServiceCategory.findOne({ _id: nextCategoryId, isDeleted: { $ne: true }, status: 'active' });
  if (!category) throw new ValidationError('Selected category is not available');

  const nextZoneIds = zoneIds !== undefined
    ? await assertProviderSelectableZones(providerId, zoneIds, { min: 1 })
    : await assertProviderSelectableZones(providerId, request.zoneIds || [], { min: 1 });

  await assertNoDuplicate(providerId, nextCategoryId, name, { excludeRequestId: request._id });

  request.history.push({ status: 'rejected', reason: request.rejectionReason, at: request.reviewedAt || new Date() });
  request.requestedName = name;
  request.categoryId = nextCategoryId;
  request.reason = str(reason ?? request.reason);
  request.icon = icon !== undefined ? str(icon) : request.icon;
  request.description = description !== undefined ? str(description) : request.description;
  request.requestedStatus = REQUEST_STATUSES.has(requestedStatus) ? requestedStatus : request.requestedStatus;
  request.basePrice = basePrice !== undefined ? num(basePrice) : request.basePrice;
  request.providerPrice = nextProviderPrice;
  request.zoneIds = nextZoneIds;
  request.status = 'pending';
  request.rejectionReason = '';
  request.reviewedBy = null;
  request.reviewedAt = null;
  await request.save();
  return request.toObject();
};

export const listServiceRequests = async ({ status = 'pending', page = 1, limit = 20 } = {}) => {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  const filter = {};
  const statusKey = str(status).toLowerCase();
  if (statusKey && statusKey !== 'all') filter.status = statusKey;

  const [records, total] = await Promise.all([
    ServiceRequest.find(filter)
      .populate('providerId', 'ownerName providerCode phone')
      .populate('categoryId', 'name')
      .populate('zoneIds', 'name status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    ServiceRequest.countDocuments(filter),
  ]);

  return {
    records,
    page: pageNum,
    limit: limitNum,
    total,
    pages: Math.max(1, Math.ceil(total / limitNum)),
  };
};

/** Approving creates the catalog Service (admin price), assigns zones, and links the
 *  requesting provider's ProviderService + ProviderServiceZone rows.
 *  Zones that are no longer valid for the provider are dropped; at least one must remain. */
export const approveServiceRequest = async (requestId, { categoryId, basePrice, zoneIds } = {}, admin = null) => {
  const request = await ServiceRequest.findById(requestId);
  if (!request) throw new ValidationError('Service request not found');
  if (request.status !== 'pending') throw new ValidationError('This request has already been reviewed');

  const resolvedCategoryId = categoryId || request.categoryId;
  if (!resolvedCategoryId) throw new ValidationError('A category is required to approve this request');

  const resolvedBasePrice = basePrice !== undefined ? Number(basePrice) : request.basePrice;
  if (!(resolvedBasePrice > 0)) {
    throw new ValidationError('Set an admin price greater than ₹0 before approving this request');
  }

  if (!(Number(request.providerPrice) > 0)) {
    throw new ValidationError('This request is missing a valid provider price and cannot be approved');
  }

  const requestedZones = zoneIds?.length ? zoneIds : (request.zoneIds || []);
  // Re-validate against the provider's currently selectable zones so a zone that
  // became pending/rejected/inactive after submission cannot go live.
  const validZoneIds = await assertProviderSelectableZones(request.providerId, requestedZones, { min: 1 });

  const service = await Service.create({
    categoryId: resolvedCategoryId,
    name: request.requestedName,
    description: request.description || '',
    icon: request.icon || '',
    basePrice: resolvedBasePrice,
    status: request.requestedStatus || 'active',
    sourceRequestId: request._id,
    createdBy: admin,
  });

  await replaceServiceZoneAssignments(service._id, validZoneIds);

  await ProviderService.findOneAndUpdate(
    { providerId: request.providerId, serviceId: service._id },
    { $set: { price: request.providerPrice, status: 'active' }, $setOnInsert: { providerId: request.providerId, serviceId: service._id } },
    { upsert: true, new: true },
  );

  await ProviderServiceZone.deleteMany({ providerId: request.providerId, serviceId: service._id });
  await ProviderServiceZone.insertMany(
    validZoneIds.map((zoneId) => ({
      providerId: request.providerId,
      serviceId: service._id,
      zoneId,
    })),
  );

  request.status = 'approved';
  request.zoneIds = validZoneIds;
  request.createdServiceId = service._id;
  request.reviewedBy = admin?._id || admin?.id || null;
  request.reviewedAt = new Date();
  await request.save();

  return { request: request.toObject(), service: service.toObject(), zoneIds: validZoneIds };
};

export const rejectServiceRequest = async (requestId, reason, admin = null) => {
  const rejectionReason = str(reason);
  if (!rejectionReason) throw new ValidationError('Rejection reason is required');

  const request = await ServiceRequest.findById(requestId);
  if (!request) throw new ValidationError('Service request not found');
  if (request.status !== 'pending') throw new ValidationError('This request has already been reviewed');

  request.status = 'rejected';
  request.rejectionReason = rejectionReason;
  request.reviewedBy = admin?._id || admin?.id || null;
  request.reviewedAt = new Date();
  await request.save();

  return request.toObject();
};
