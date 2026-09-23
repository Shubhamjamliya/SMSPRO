import { ValidationError } from '../../../core/auth/errors.js';
import { recordAudit } from '../../../core/audit/audit.service.js';
import { extractPerformer } from '../../../core/utils/performer.js';
import { ConstructionBudgetService } from '../models/constructionBudgetService.model.js';
import { ConstructionService } from '../models/constructionService.model.js';

const CONSTRUCTION_MODULE = 'construction';
const alive = { isDeleted: { $ne: true } };

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exactNameRegex = (name) => new RegExp(`^${escapeRegex(name)}$`, 'i');

const audit = (action, extra) => recordAudit({
  module: CONSTRUCTION_MODULE,
  entityType: 'budget_service',
  ...extra,
  action,
});

const assertNoDuplicate = async (name, { excludeId } = {}) => {
  const filter = { name: exactNameRegex(name), ...alive };
  if (excludeId) filter._id = { $ne: excludeId };
  const existing = await ConstructionBudgetService.findOne(filter).select('name').lean();
  if (existing) throw new ValidationError(`"${existing.name}" already exists`);
};

/** A link must point at a real, active catalogue service — otherwise the customer's tap goes nowhere. */
const assertLinkable = async (catalogueServiceId) => {
  if (!catalogueServiceId) return;
  const service = await ConstructionService
    .findOne({ _id: catalogueServiceId, ...alive, status: 'active' })
    .select('_id')
    .lean();
  if (!service) throw new ValidationError('The catalogue service you linked is not available');
};

// ---------- Admin ----------

export const listBudgetServices = async ({ status } = {}) => {
  const filter = { ...alive };
  if (status === 'active' || status === 'inactive') filter.status = status;
  return ConstructionBudgetService
    .find(filter)
    .populate('catalogueServiceId', 'name status isDeleted')
    .sort({ displayOrder: 1, name: 1 })
    .lean();
};

export const createBudgetService = async (data, reqUser = null) => {
  await assertNoDuplicate(data.name);
  await assertLinkable(data.catalogueServiceId);
  const performer = extractPerformer(reqUser);
  const doc = await ConstructionBudgetService.create({
    ...data,
    createdBy: performer,
    updatedBy: performer,
  });
  await audit('budget_service.created', {
    entityId: doc._id,
    after: { name: doc.name, price: doc.price, linked: Boolean(doc.catalogueServiceId) },
    performedBy: performer,
  });
  return doc.toObject();
};

export const updateBudgetService = async (id, data, reqUser = null) => {
  const doc = await ConstructionBudgetService.findOne({ _id: id, ...alive });
  if (!doc) throw new ValidationError('Budget friendly service not found');

  if (data.name && data.name.toLowerCase() !== doc.name.toLowerCase()) {
    await assertNoDuplicate(data.name, { excludeId: id });
  }
  // Only re-checked when the link is being CHANGED: an admin must still be able to
  // edit the text of a card whose linked service has since been switched off.
  if (data.catalogueServiceId && String(data.catalogueServiceId) !== String(doc.catalogueServiceId)) {
    await assertLinkable(data.catalogueServiceId);
  }

  const before = { name: doc.name, price: doc.price, status: doc.status };
  const performer = extractPerformer(reqUser);
  Object.assign(doc, data, { updatedBy: performer });
  await doc.save();
  await audit('budget_service.updated', {
    entityId: doc._id,
    before,
    after: { name: doc.name, price: doc.price, status: doc.status },
    performedBy: performer,
  });
  return doc.toObject();
};

export const deleteBudgetService = async (id, reqUser = null) => {
  const doc = await ConstructionBudgetService.findOne({ _id: id, ...alive });
  if (!doc) throw new ValidationError('Budget friendly service not found');
  const performer = extractPerformer(reqUser);
  doc.isDeleted = true;
  doc.deletedAt = new Date();
  doc.deletedBy = performer;
  await doc.save();
  await audit('budget_service.deleted', {
    entityId: doc._id,
    before: { name: doc.name },
    performedBy: performer,
  });
  return { id: String(id) };
};

// ---------- Customer ----------

/**
 * What the app shows under Budget Friendly.
 *
 * `enquiryServiceKey` is the slug (or id) of the linked catalogue service, and is
 * only present while that service is still active. The app uses it to open the
 * normal service page and enquiry form; without it the card is display-only.
 * The raw link never leaves the server.
 */
export const listCustomerBudgetServices = async () => {
  const docs = await ConstructionBudgetService
    .find({ ...alive, status: 'active' })
    .select('name tagline description image badge price unit visitingFee typicalDurationText features catalogueServiceId displayOrder')
    .sort({ displayOrder: 1, name: 1 })
    .lean();

  const linkedIds = docs.map((d) => d.catalogueServiceId).filter(Boolean);
  const linked = linkedIds.length
    ? await ConstructionService
      .find({ _id: { $in: linkedIds }, ...alive, status: 'active' })
      .select('_id slug')
      .lean()
    : [];
  const keyById = new Map(linked.map((s) => [String(s._id), s.slug || String(s._id)]));

  return docs.map(({ catalogueServiceId, ...rest }) => ({
    ...rest,
    enquiryServiceKey: catalogueServiceId ? keyById.get(String(catalogueServiceId)) || null : null,
  }));
};
