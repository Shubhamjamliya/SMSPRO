import { ValidationError } from '../../../core/auth/errors.js';
import { CategoryRequest } from '../models/categoryRequest.model.js';
import { ServiceCategory } from '../models/serviceCategory.model.js';
import { Service } from '../models/service.model.js';
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

const assertNoDuplicate = async (providerId, name, { excludeRequestId } = {}) => {
  const nameRegex = exactNameRegex(name);

  const existingCategory = await ServiceCategory.findOne({
    name: nameRegex,
    isDeleted: { $ne: true },
    status: 'active',
  }).select('name').lean();
  if (existingCategory) {
    throw new ValidationError(`"${existingCategory.name}" already exists — select it instead of requesting it`);
  }

  const pendingFilter = { providerId, status: 'pending', requestedName: nameRegex };
  if (excludeRequestId) pendingFilter._id = { $ne: excludeRequestId };
  const existingPending = await CategoryRequest.findOne(pendingFilter).lean();
  if (existingPending) {
    throw new ValidationError(`You already have a pending request for "${existingPending.requestedName}"`);
  }
};

const normalizeOptionalService = async (providerId, payload = {}) => {
  const serviceName = str(payload.serviceName);
  if (!serviceName) {
    return {
      serviceName: '',
      serviceDescription: '',
      serviceIcon: '',
      serviceRequestedStatus: 'active',
      basePrice: 0,
      providerPrice: 0,
      zoneIds: [],
    };
  }

  if (!(Number(payload.providerPrice) > 0)) {
    throw new ValidationError('Enter your price for the service (must be greater than ₹0)');
  }

  const zoneIds = await assertProviderSelectableZones(providerId, payload.zoneIds || [], { min: 1 });

  return {
    serviceName,
    serviceDescription: str(payload.serviceDescription),
    serviceIcon: str(payload.serviceIcon),
    serviceRequestedStatus: REQUEST_STATUSES.has(payload.serviceRequestedStatus)
      ? payload.serviceRequestedStatus
      : 'active',
    basePrice: num(payload.basePrice),
    providerPrice: num(payload.providerPrice),
    zoneIds,
  };
};

export const createCategoryRequest = async (
  providerId,
  {
    requestedName,
    reason,
    icon,
    description,
    requestedStatus,
    serviceName,
    serviceDescription,
    serviceIcon,
    serviceRequestedStatus,
    basePrice,
    providerPrice,
    zoneIds,
  },
) => {
  const name = str(requestedName);
  if (!name) throw new ValidationError('Requested category name is required');

  const provider = await ServiceProviderProfile.findOne({ _id: providerId, isDeleted: { $ne: true } });
  if (!provider) throw new ValidationError('Service provider not found');

  await assertNoDuplicate(providerId, name);

  const serviceFields = await normalizeOptionalService(providerId, {
    serviceName,
    serviceDescription,
    serviceIcon,
    serviceRequestedStatus,
    basePrice,
    providerPrice,
    zoneIds,
  });

  const request = await CategoryRequest.create({
    providerId,
    requestedName: name,
    reason: str(reason),
    icon: str(icon),
    description: str(description),
    requestedStatus: REQUEST_STATUSES.has(requestedStatus) ? requestedStatus : 'active',
    ...serviceFields,
    status: 'pending',
  });
  return request.toObject();
};

export const listMyCategoryRequests = async (providerId) => {
  return CategoryRequest.find({ providerId })
    .populate('zoneIds', 'name status')
    .sort({ createdAt: -1 })
    .lean();
};

export const resubmitCategoryRequest = async (
  requestId,
  providerId,
  {
    requestedName,
    reason,
    icon,
    description,
    requestedStatus,
    serviceName,
    serviceDescription,
    serviceIcon,
    serviceRequestedStatus,
    basePrice,
    providerPrice,
    zoneIds,
  },
) => {
  const request = await CategoryRequest.findOne({ _id: requestId, providerId });
  if (!request) throw new ValidationError('Category request not found');
  if (request.status !== 'rejected') throw new ValidationError('Only rejected requests can be edited and resubmitted');

  const name = str(requestedName) || request.requestedName;
  await assertNoDuplicate(providerId, name, { excludeRequestId: request._id });

  const serviceFields = await normalizeOptionalService(providerId, {
    serviceName: serviceName !== undefined ? serviceName : request.serviceName,
    serviceDescription: serviceDescription !== undefined ? serviceDescription : request.serviceDescription,
    serviceIcon: serviceIcon !== undefined ? serviceIcon : request.serviceIcon,
    serviceRequestedStatus: serviceRequestedStatus !== undefined ? serviceRequestedStatus : request.serviceRequestedStatus,
    basePrice: basePrice !== undefined ? basePrice : request.basePrice,
    providerPrice: providerPrice !== undefined ? providerPrice : request.providerPrice,
    zoneIds: zoneIds !== undefined ? zoneIds : request.zoneIds,
  });

  request.history.push({ status: 'rejected', reason: request.rejectionReason, at: request.reviewedAt || new Date() });
  request.requestedName = name;
  request.reason = str(reason ?? request.reason);
  request.icon = icon !== undefined ? str(icon) : request.icon;
  request.description = description !== undefined ? str(description) : request.description;
  request.requestedStatus = REQUEST_STATUSES.has(requestedStatus) ? requestedStatus : request.requestedStatus;
  Object.assign(request, serviceFields);
  request.status = 'pending';
  request.rejectionReason = '';
  request.reviewedBy = null;
  request.reviewedAt = null;
  await request.save();
  return request.toObject();
};

export const listCategoryRequests = async ({ status = 'pending', page = 1, limit = 20 } = {}) => {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  const filter = {};
  const statusKey = str(status).toLowerCase();
  if (statusKey && statusKey !== 'all') filter.status = statusKey;

  const [records, total] = await Promise.all([
    CategoryRequest.find(filter)
      .populate('providerId', 'ownerName providerCode phone')
      .populate('zoneIds', 'name status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    CategoryRequest.countDocuments(filter),
  ]);

  return {
    records,
    page: pageNum,
    limit: limitNum,
    total,
    pages: Math.max(1, Math.ceil(total / limitNum)),
  };
};

/** Approving creates the category from provider-submitted details (no silent edits).
 *  If the request included a service, creates it only when zones are still valid. */
export const approveCategoryRequest = async (requestId, { basePrice } = {}, admin = null) => {
  const request = await CategoryRequest.findById(requestId);
  if (!request) throw new ValidationError('Category request not found');
  if (request.status !== 'pending') throw new ValidationError('This request has already been reviewed');

  const category = await ServiceCategory.create({
    name: request.requestedName,
    description: request.description || '',
    icon: request.icon || '',
    status: request.requestedStatus || 'active',
    sourceRequestId: request._id,
    createdBy: admin,
  });

  let service = null;
  const serviceName = str(request.serviceName);
  if (serviceName) {
    const resolvedBasePrice = basePrice !== undefined ? Number(basePrice) : request.basePrice;
    if (!(resolvedBasePrice > 0)) {
      throw new ValidationError('Set an admin price greater than ₹0 before approving the included service');
    }
    if (!(Number(request.providerPrice) > 0)) {
      throw new ValidationError('Included service is missing a valid provider price');
    }

    const validZoneIds = await assertProviderSelectableZones(request.providerId, request.zoneIds || [], { min: 1 });

    service = await Service.create({
      categoryId: category._id,
      name: serviceName,
      description: request.serviceDescription || '',
      icon: request.serviceIcon || '',
      basePrice: resolvedBasePrice,
      status: request.serviceRequestedStatus || 'active',
      sourceRequestId: null,
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

    request.createdServiceId = service._id;
    request.zoneIds = validZoneIds;
  }

  request.status = 'approved';
  request.createdCategoryId = category._id;
  request.reviewedBy = admin?._id || admin?.id || null;
  request.reviewedAt = new Date();
  await request.save();

  return {
    request: request.toObject(),
    category: category.toObject(),
    service: service ? service.toObject() : null,
  };
};

export const rejectCategoryRequest = async (requestId, reason, admin = null) => {
  const rejectionReason = str(reason);
  if (!rejectionReason) throw new ValidationError('Rejection reason is required');

  const request = await CategoryRequest.findById(requestId);
  if (!request) throw new ValidationError('Category request not found');
  if (request.status !== 'pending') throw new ValidationError('This request has already been reviewed');

  request.status = 'rejected';
  request.rejectionReason = rejectionReason;
  request.reviewedBy = admin?._id || admin?.id || null;
  request.reviewedAt = new Date();
  await request.save();

  return request.toObject();
};
