import { ValidationError } from '../../../core/auth/errors.js';
import { ServiceCategory } from '../models/serviceCategory.model.js';
import { Service } from '../models/service.model.js';
import { ServiceZone } from '../models/serviceZone.model.js';
import { ServiceZoneAssignment } from '../models/serviceZoneAssignment.model.js';
import { ProviderService } from '../models/providerService.model.js';
import {
  attachZonesToServices,
  replaceServiceZoneAssignments,
  assertActiveZones,
} from './zoneAccess.service.js';

const activeFilter = { isDeleted: { $ne: true } };
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exactNameRegex = (name) => new RegExp(`^${escapeRegex(name)}$`, 'i');

const assertNoDuplicateServiceInCategory = async (categoryId, name, { excludeId } = {}) => {
  const filter = { categoryId, name: exactNameRegex(name), ...activeFilter };
  if (excludeId) filter._id = { $ne: excludeId };
  const existing = await Service.findOne(filter).select('name').lean();
  if (existing) {
    throw new ValidationError(`"${existing.name}" already exists in this category`);
  }
};

/** Attaches how many active providers currently offer each service — admin visibility only. */
const attachProviderCounts = async (services) => {
  if (!services.length) return services;
  const serviceIds = services.map((s) => s._id);
  const rows = await ProviderService.find({ serviceId: { $in: serviceIds }, status: 'active' })
    .select('serviceId')
    .lean();
  const counts = new Map();
  for (const row of rows) {
    const sid = String(row.serviceId);
    counts.set(sid, (counts.get(sid) || 0) + 1);
  }
  return services.map((s) => ({ ...s, providerCount: counts.get(String(s._id)) || 0 }));
};

// ---------- Categories ----------

/** Confirms categoryId refers to a real, active category — used where a categoryId is
 *  accepted from the client for display/UX purposes but must still be rejected cleanly
 *  if bogus, even though it isn't itself relied on for any authorization decision. */
export const assertActiveCategory = async (categoryId) => {
  const category = await ServiceCategory.findOne({ _id: categoryId, ...activeFilter, status: 'active' }).select('_id').lean();
  if (!category) throw new ValidationError('Selected category is not available');
  return String(category._id);
};

export const listCategories = async ({ status } = {}) => {
  const filter = { ...activeFilter };
  if (status) filter.status = status;
  return ServiceCategory.find(filter).sort({ displayOrder: 1, name: 1 }).lean();
};

export const createCategory = async (data, performer = null) => {
  const category = await ServiceCategory.create({ ...data, createdBy: performer, updatedBy: performer });
  return category.toObject();
};

export const updateCategory = async (id, data, performer = null) => {
  const category = await ServiceCategory.findOne({ _id: id, ...activeFilter });
  if (!category) throw new ValidationError('Category not found');
  Object.assign(category, data, { updatedBy: performer });
  await category.save();
  return category.toObject();
};

export const deleteCategory = async (id, performer = null) => {
  const category = await ServiceCategory.findOne({ _id: id, ...activeFilter });
  if (!category) throw new ValidationError('Category not found');
  const serviceCount = await Service.countDocuments({ categoryId: id, ...activeFilter });
  if (serviceCount > 0) throw new ValidationError('Cannot delete a category that still has services');
  category.isDeleted = true;
  category.deletedAt = new Date();
  category.deletedBy = performer;
  await category.save();
  return { id };
};

// ---------- Services ----------

export const listServices = async ({ categoryId, status, zoneId } = {}) => {
  const filter = { ...activeFilter };
  if (categoryId) filter.categoryId = categoryId;
  if (status) filter.status = status;

  if (zoneId) {
    const assignments = await ServiceZoneAssignment.find({ zoneId }).select('serviceId').lean();
    filter._id = { $in: assignments.map((a) => a.serviceId) };
  }

  const services = await Service.find(filter)
    .populate('categoryId', 'name')
    .sort({ displayOrder: 1, name: 1 })
    .lean();
  const withZones = await attachZonesToServices(services);
  return attachProviderCounts(withZones);
};

/** Providers currently offering a given service — admin visibility ("who's offering this"). */
export const listServiceProviders = async (serviceId) => {
  const service = await Service.findOne({ _id: serviceId, ...activeFilter }).select('_id').lean();
  if (!service) throw new ValidationError('Service not found');

  const offers = await ProviderService.find({ serviceId, status: 'active' })
    .populate('providerId', 'ownerName providerCode phone status isActive')
    .lean();

  return offers
    .filter((o) => o.providerId)
    .map((o) => ({
      providerId: o.providerId._id,
      ownerName: o.providerId.ownerName,
      providerCode: o.providerId.providerCode,
      phone: o.providerId.phone,
      providerStatus: o.providerId.status,
      isActive: o.providerId.isActive !== false,
      price: o.price,
    }));
};

export const createService = async (data, performer = null) => {
  const { zoneIds, ...serviceData } = data;
  const category = await ServiceCategory.findOne({ _id: serviceData.categoryId, ...activeFilter });
  if (!category) throw new ValidationError('Category not found');
  if (!(Number(serviceData.basePrice) > 0)) {
    throw new ValidationError('Admin price is required and must be greater than ₹0');
  }

  await assertNoDuplicateServiceInCategory(serviceData.categoryId, serviceData.name);
  await assertActiveZones(zoneIds, { min: 1 });

  const service = await Service.create({ ...serviceData, createdBy: performer, updatedBy: performer });
  await replaceServiceZoneAssignments(service._id, zoneIds);

  const [withZones] = await attachZonesToServices([service.toObject()]);
  return withZones;
};

export const updateService = async (id, data, performer = null) => {
  const service = await Service.findOne({ _id: id, ...activeFilter });
  if (!service) throw new ValidationError('Service not found');

  const { zoneIds, ...serviceData } = data;
  if (serviceData.basePrice !== undefined && !(Number(serviceData.basePrice) > 0)) {
    throw new ValidationError('Admin price is required and must be greater than ₹0');
  }

  if (serviceData.name !== undefined || serviceData.categoryId !== undefined) {
    await assertNoDuplicateServiceInCategory(
      serviceData.categoryId ?? service.categoryId,
      serviceData.name ?? service.name,
      { excludeId: service._id },
    );
  }

  Object.assign(service, serviceData, { updatedBy: performer });
  await service.save();

  if (zoneIds !== undefined) {
    await replaceServiceZoneAssignments(service._id, zoneIds);
  }

  const [withZones] = await attachZonesToServices([service.toObject()]);
  return withZones;
};

export const deleteService = async (id, performer = null) => {
  const service = await Service.findOne({ _id: id, ...activeFilter });
  if (!service) throw new ValidationError('Service not found');
  service.isDeleted = true;
  service.deletedAt = new Date();
  service.deletedBy = performer;
  await service.save();
  await ServiceZoneAssignment.deleteMany({ serviceId: id });
  return { id };
};

// ---------- Zones ----------

export const listZones = async ({ status } = {}) => {
  const filter = { ...activeFilter };
  if (status) filter.status = status;
  return ServiceZone.find(filter).sort({ displayOrder: 1, name: 1 }).lean();
};

export const getZoneById = async (id) => {
  const zone = await ServiceZone.findOne({ _id: id, ...activeFilter }).lean();
  if (!zone) throw new ValidationError('Zone not found');
  return zone;
};

export const createZone = async (data, performer = null) => {
  const zone = await ServiceZone.create({ ...data, createdBy: performer, updatedBy: performer });
  return zone.toObject();
};

export const updateZone = async (id, data, performer = null) => {
  const zone = await ServiceZone.findOne({ _id: id, ...activeFilter });
  if (!zone) throw new ValidationError('Zone not found');
  Object.assign(zone, data, { updatedBy: performer });
  await zone.save();
  return zone.toObject();
};

export const updateZoneStatus = async (id, status, performer = null) => {
  const zone = await ServiceZone.findOne({ _id: id, ...activeFilter });
  if (!zone) throw new ValidationError('Zone not found');
  zone.status = status;
  zone.updatedBy = performer;
  await zone.save();
  return zone.toObject();
};

export const deleteZone = async (id, performer = null) => {
  const zone = await ServiceZone.findOne({ _id: id, ...activeFilter });
  if (!zone) throw new ValidationError('Zone not found');
  zone.isDeleted = true;
  zone.deletedAt = new Date();
  zone.deletedBy = performer;
  await zone.save();
  // Soft-deleted / inactive zones are excluded from customer + assignment validation.
  // Existing assignment rows remain for audit but are ignored when zone is not active.
  return { id };
};
