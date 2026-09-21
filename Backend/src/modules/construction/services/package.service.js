import { ValidationError } from '../../../core/auth/errors.js';
import { recordAudit } from '../../../core/audit/audit.service.js';
import { extractPerformer } from '../../../core/utils/performer.js';
import { ConstructionPackage } from '../models/constructionPackage.model.js';
import { DEFAULT_PACKAGES } from '../data/defaultPackages.js';

const CONSTRUCTION_MODULE = 'construction';
const alive = { isDeleted: { $ne: true } };

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exactNameRegex = (name) => new RegExp(`^${escapeRegex(name)}$`, 'i');

const audit = (action, extra) => recordAudit({
  module: CONSTRUCTION_MODULE,
  entityType: 'package',
  ...extra,
  action,
});

const assertNoDuplicate = async (segment, name, { excludeId } = {}) => {
  const filter = { segment, name: exactNameRegex(name), ...alive };
  if (excludeId) filter._id = { $ne: excludeId };
  const existing = await ConstructionPackage.findOne(filter).select('name').lean();
  if (existing) throw new ValidationError(`"${existing.name}" already exists in ${segment}`);
};

// ---------- Admin ----------

export const listPackages = async ({ segment, status } = {}) => {
  const filter = { ...alive };
  if (segment) filter.segment = segment;
  if (status) filter.status = status;
  return ConstructionPackage.find(filter).sort({ displayOrder: 1, price: 1, name: 1 }).lean();
};

export const createPackage = async (data, reqUser = null) => {
  await assertNoDuplicate(data.segment, data.name);
  const performer = extractPerformer(reqUser);
  const pkg = await ConstructionPackage.create({
    ...data,
    createdBy: performer,
    updatedBy: performer,
  });
  await audit('package.created', {
    entityId: pkg._id,
    after: { segment: pkg.segment, name: pkg.name, price: pkg.price, status: pkg.status },
    performedBy: performer,
  });
  return pkg.toObject();
};

export const updatePackage = async (id, data, reqUser = null) => {
  const pkg = await ConstructionPackage.findOne({ _id: id, ...alive });
  if (!pkg) throw new ValidationError('Package not found');
  if (data.name && data.name.toLowerCase() !== pkg.name.toLowerCase()) {
    await assertNoDuplicate(pkg.segment, data.name, { excludeId: id });
  }
  const before = { name: pkg.name, price: pkg.price, status: pkg.status };
  const performer = extractPerformer(reqUser);
  Object.assign(pkg, data, { updatedBy: performer });
  await pkg.save();
  await audit('package.updated', {
    entityId: pkg._id,
    before,
    after: { name: pkg.name, price: pkg.price, status: pkg.status },
    performedBy: performer,
  });
  return pkg.toObject();
};

export const deletePackage = async (id, reqUser = null) => {
  const pkg = await ConstructionPackage.findOne({ _id: id, ...alive });
  if (!pkg) throw new ValidationError('Package not found');
  const performer = extractPerformer(reqUser);
  pkg.isDeleted = true;
  pkg.deletedAt = new Date();
  pkg.deletedBy = performer;
  await pkg.save();
  await audit('package.deleted', {
    entityId: pkg._id,
    before: { segment: pkg.segment, name: pkg.name },
    performedBy: performer,
  });
  return { id: String(id) };
};

/**
 * Loads the packages the customer app originally shipped with into a segment.
 *
 * Refuses when the segment already has ANY package, deleted ones excluded. That
 * makes it safe to expose as a button: it can restore an empty screen but can
 * never overwrite or duplicate what the team has built since.
 */
export const seedDefaultPackages = async (segment, reqUser = null) => {
  const defaults = DEFAULT_PACKAGES[segment] || [];
  const existing = await ConstructionPackage.countDocuments({ segment, ...alive });
  if (existing > 0) {
    throw new ValidationError(`${segment} already has packages — the defaults were not loaded`);
  }

  const performer = extractPerformer(reqUser);
  const created = await ConstructionPackage.insertMany(
    defaults.map((pkg, index) => ({
      ...pkg,
      segment,
      displayOrder: index,
      status: 'active',
      createdBy: performer,
      updatedBy: performer,
    })),
  );
  await audit('package.defaults_loaded', {
    after: { segment, count: created.length },
    performedBy: performer,
  });
  return created.map((doc) => doc.toObject());
};

// ---------- Customer ----------

/** What the customer app shows: active packages only, cheapest-first within display order. */
export const listCustomerPackages = async ({ segment } = {}) => {
  const filter = { ...alive, status: 'active' };
  if (segment) filter.segment = segment;
  return ConstructionPackage
    .find(filter)
    .select('segment name tagline price unit visitingFee badge isPopular theme icon features description displayOrder')
    .sort({ displayOrder: 1, price: 1, name: 1 })
    .lean();
};
