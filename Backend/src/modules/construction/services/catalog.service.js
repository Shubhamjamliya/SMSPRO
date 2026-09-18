import { ValidationError } from '../../../core/auth/errors.js';
import { recordAudit } from '../../../core/audit/audit.service.js';
import { extractPerformer } from '../../../core/utils/performer.js';
import { ConstructionCategory } from '../models/constructionCategory.model.js';
import { ConstructionService } from '../models/constructionService.model.js';

const CONSTRUCTION_MODULE = 'construction';
const alive = { isDeleted: { $ne: true } };

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exactNameRegex = (name) => new RegExp(`^${escapeRegex(name)}$`, 'i');

const audit = (entityType, action, extra) => recordAudit({
  module: CONSTRUCTION_MODULE,
  entityType,
  ...extra,
  action,
});

// ---------- Categories ----------

/** Confirms a categoryId refers to a real, active category. */
export const assertActiveCategory = async (categoryId) => {
  const category = await ConstructionCategory
    .findOne({ _id: categoryId, ...alive, status: 'active' })
    .select('_id')
    .lean();
  if (!category) throw new ValidationError('Selected category is not available');
  return String(category._id);
};

const assertNoDuplicateCategory = async (name, { excludeId } = {}) => {
  const filter = { name: exactNameRegex(name), ...alive };
  if (excludeId) filter._id = { $ne: excludeId };
  const existing = await ConstructionCategory.findOne(filter).select('name').lean();
  if (existing) throw new ValidationError(`"${existing.name}" already exists`);
};

export const listCategories = async ({ status } = {}) => {
  const filter = { ...alive };
  if (status) filter.status = status;
  const categories = await ConstructionCategory
    .find(filter)
    .sort({ displayOrder: 1, name: 1 })
    .lean();

  if (!categories.length) return categories;

  // Admins need to know a category is empty before they publish it — an active
  // category with no services is a dead end for the customer.
  const counts = await ConstructionService.aggregate([
    { $match: { isDeleted: { $ne: true }, categoryId: { $in: categories.map((c) => c._id) } } },
    { $group: { _id: '$categoryId', total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } } } },
  ]);
  const byId = new Map(counts.map((row) => [String(row._id), row]));
  return categories.map((c) => ({
    ...c,
    serviceCount: byId.get(String(c._id))?.total || 0,
    activeServiceCount: byId.get(String(c._id))?.active || 0,
  }));
};

export const createCategory = async (data, reqUser = null) => {
  await assertNoDuplicateCategory(data.name);
  const performer = extractPerformer(reqUser);
  const category = await ConstructionCategory.create({
    ...data,
    createdBy: performer,
    updatedBy: performer,
  });
  await audit('category', 'category.created', {
    entityId: category._id,
    after: { name: category.name, status: category.status },
    performedBy: performer,
  });
  return category.toObject();
};

export const updateCategory = async (id, data, reqUser = null) => {
  const category = await ConstructionCategory.findOne({ _id: id, ...alive });
  if (!category) throw new ValidationError('Category not found');
  if (data.name && data.name.toLowerCase() !== category.name.toLowerCase()) {
    await assertNoDuplicateCategory(data.name, { excludeId: id });
  }
  const before = { name: category.name, status: category.status };
  const performer = extractPerformer(reqUser);
  Object.assign(category, data, { updatedBy: performer });
  await category.save();
  await audit('category', 'category.updated', {
    entityId: category._id,
    before,
    after: { name: category.name, status: category.status },
    performedBy: performer,
  });
  return category.toObject();
};

export const deleteCategory = async (id, reqUser = null) => {
  const category = await ConstructionCategory.findOne({ _id: id, ...alive });
  if (!category) throw new ValidationError('Category not found');

  const serviceCount = await ConstructionService.countDocuments({ categoryId: id, ...alive });
  if (serviceCount > 0) {
    throw new ValidationError(
      `Cannot delete "${category.name}" — it still has ${serviceCount} service${serviceCount === 1 ? '' : 's'}. `
      + 'Move or delete them first.',
    );
  }

  const performer = extractPerformer(reqUser);
  category.isDeleted = true;
  category.deletedAt = new Date();
  category.deletedBy = performer;
  await category.save();
  await audit('category', 'category.deleted', {
    entityId: category._id,
    before: { name: category.name },
    performedBy: performer,
  });
  return { id: String(id) };
};

// ---------- Services ----------

const assertNoDuplicateServiceInCategory = async (categoryId, name, { excludeId } = {}) => {
  const filter = { categoryId, name: exactNameRegex(name), ...alive };
  if (excludeId) filter._id = { $ne: excludeId };
  const existing = await ConstructionService.findOne(filter).select('name').lean();
  if (existing) {
    throw new ValidationError(`"${existing.name}" already exists in this category`);
  }
};

export const listServices = async ({ categoryId, status, search } = {}) => {
  const filter = { ...alive };
  if (categoryId) filter.categoryId = categoryId;
  if (status) filter.status = status;
  if (search) {
    const term = escapeRegex(String(search).trim());
    if (term) filter.name = new RegExp(term, 'i');
  }
  return ConstructionService
    .find(filter)
    .populate('categoryId', 'name slug status')
    .sort({ displayOrder: 1, name: 1 })
    .lean();
};

export const getServiceById = async (id) => {
  const service = await ConstructionService
    .findOne({ _id: id, ...alive })
    .populate('categoryId', 'name slug status')
    .lean();
  if (!service) throw new ValidationError('Service not found');
  return service;
};

export const createService = async (data, reqUser = null) => {
  await assertActiveCategory(data.categoryId);
  await assertNoDuplicateServiceInCategory(data.categoryId, data.name);
  const performer = extractPerformer(reqUser);
  const service = await ConstructionService.create({
    ...data,
    createdBy: performer,
    updatedBy: performer,
  });
  await audit('service', 'service.created', {
    entityId: service._id,
    after: { name: service.name, categoryId: String(service.categoryId), status: service.status },
    performedBy: performer,
  });
  return service.toObject();
};

export const updateService = async (id, data, reqUser = null) => {
  const service = await ConstructionService.findOne({ _id: id, ...alive });
  if (!service) throw new ValidationError('Service not found');

  const nextCategoryId = data.categoryId || service.categoryId;
  if (data.categoryId && String(data.categoryId) !== String(service.categoryId)) {
    await assertActiveCategory(data.categoryId);
  }
  const nextName = data.name || service.name;
  if (
    (data.name && data.name.toLowerCase() !== service.name.toLowerCase())
    || (data.categoryId && String(data.categoryId) !== String(service.categoryId))
  ) {
    await assertNoDuplicateServiceInCategory(nextCategoryId, nextName, { excludeId: id });
  }

  const before = { name: service.name, status: service.status };
  const performer = extractPerformer(reqUser);
  Object.assign(service, data, { updatedBy: performer });
  await service.save();
  await audit('service', 'service.updated', {
    entityId: service._id,
    before,
    after: { name: service.name, status: service.status },
    performedBy: performer,
  });
  return service.toObject();
};

export const deleteService = async (id, reqUser = null) => {
  const service = await ConstructionService.findOne({ _id: id, ...alive });
  if (!service) throw new ValidationError('Service not found');
  const performer = extractPerformer(reqUser);
  service.isDeleted = true;
  service.deletedAt = new Date();
  service.deletedBy = performer;
  await service.save();
  await audit('service', 'service.deleted', {
    entityId: service._id,
    before: { name: service.name },
    performedBy: performer,
  });
  return { id: String(id) };
};

export const setServiceStatus = async (id, status, reqUser = null) => updateService(
  id,
  { status },
  reqUser,
);

// ---------- Customer-facing catalogue (BRD C1, C2) ----------

/** C1 — categories with their active services, ready to render as a browse list. */
export const listCustomerCatalogue = async () => {
  const [categories, services] = await Promise.all([
    ConstructionCategory
      .find({ ...alive, status: 'active' })
      .select('name slug icon coverImage description displayOrder')
      .sort({ displayOrder: 1, name: 1 })
      .lean(),
    ConstructionService
      .find({ ...alive, status: 'active' })
      .select('name slug icon coverImage description categoryId typicalDurationText typicalBudget displayOrder')
      .sort({ displayOrder: 1, name: 1 })
      .lean(),
  ]);

  const byCategory = new Map();
  for (const service of services) {
    const key = String(service.categoryId);
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(service);
  }

  // A category with no active services is a dead end — hide it rather than
  // letting a customer tap into an empty screen.
  return categories
    .map((category) => ({
      ...category,
      services: byCategory.get(String(category._id)) || [],
    }))
    .filter((category) => category.services.length > 0);
};

/** C2 — the service detail page: what it covers, how long it takes, what to expect. */
export const getCustomerServiceDetail = async (idOrSlug) => {
  const bySlug = { slug: String(idOrSlug || '').trim().toLowerCase() };
  const byId = /^[0-9a-fA-F]{24}$/.test(String(idOrSlug || '')) ? { _id: idOrSlug } : null;

  const service = await ConstructionService
    .findOne({ ...alive, status: 'active', ...(byId || bySlug) })
    .populate('categoryId', 'name slug')
    .lean();
  if (!service) throw new ValidationError('This service is not available');

  return {
    id: String(service._id),
    name: service.name,
    slug: service.slug,
    description: service.description,
    icon: service.icon,
    coverImage: service.coverImage,
    covers: service.covers || [],
    excludes: service.excludes || [],
    typicalDurationText: service.typicalDurationText || '',
    typicalBudget: service.typicalBudget || { min: null, max: null },
    category: service.categoryId
      ? { id: String(service.categoryId._id), name: service.categoryId.name, slug: service.categoryId.slug }
      : null,
  };
};
