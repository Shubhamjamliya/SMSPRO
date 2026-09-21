import { ValidationError } from '../../../core/auth/errors.js';
import { recordAudit } from '../../../core/audit/audit.service.js';
import { extractPerformer } from '../../../core/utils/performer.js';
import { ConstructionBanner } from '../models/constructionBanner.model.js';
import { assertDateOrder } from '../validators/banner.validator.js';

const CONSTRUCTION_MODULE = 'construction';
const alive = { isDeleted: { $ne: true } };

/** Most banners the app will ever load — a carousel of thirty is not a carousel. */
const CUSTOMER_LIMIT = 10;

const audit = (action, extra) => recordAudit({
  module: CONSTRUCTION_MODULE,
  entityType: 'banner',
  ...extra,
  action,
});

// ---------- Admin ----------

export const listBanners = async ({ status } = {}) => {
  const filter = { ...alive };
  if (status === 'active' || status === 'inactive') filter.status = status;
  return ConstructionBanner.find(filter).sort({ displayOrder: 1, createdAt: -1 }).lean();
};

export const createBanner = async (data, reqUser = null) => {
  const performer = extractPerformer(reqUser);
  const banner = await ConstructionBanner.create({
    ...data,
    createdBy: performer,
    updatedBy: performer,
  });
  await audit('banner.created', {
    entityId: banner._id,
    after: { title: banner.title, status: banner.status },
    performedBy: performer,
  });
  return banner.toObject();
};

export const updateBanner = async (id, data, reqUser = null) => {
  const banner = await ConstructionBanner.findOne({ _id: id, ...alive });
  if (!banner) throw new ValidationError('Banner not found');

  // The DTO only sees what arrived in this request; the order of the two dates has
  // to hold against what is stored too, or changing just one could invert them.
  assertDateOrder({
    startDate: data.startDate !== undefined ? data.startDate : banner.startDate,
    endDate: data.endDate !== undefined ? data.endDate : banner.endDate,
  });

  const before = { title: banner.title, status: banner.status };
  const performer = extractPerformer(reqUser);
  Object.assign(banner, data, { updatedBy: performer });
  await banner.save();
  await audit('banner.updated', {
    entityId: banner._id,
    before,
    after: { title: banner.title, status: banner.status },
    performedBy: performer,
  });
  return banner.toObject();
};

export const deleteBanner = async (id, reqUser = null) => {
  const banner = await ConstructionBanner.findOne({ _id: id, ...alive });
  if (!banner) throw new ValidationError('Banner not found');
  const performer = extractPerformer(reqUser);
  banner.isDeleted = true;
  banner.deletedAt = new Date();
  banner.deletedBy = performer;
  await banner.save();
  await audit('banner.deleted', {
    entityId: banner._id,
    before: { title: banner.title },
    performedBy: performer,
  });
  return { id: String(id) };
};

// ---------- Customer ----------

/**
 * Banners the app should show right now: active, not deleted, and inside their
 * schedule window. The window is decided here, on the server clock, rather than in
 * the app — a customer's phone clock must not decide what is live.
 */
export const listCustomerBanners = async (now = new Date()) => ConstructionBanner
  .find({
    ...alive,
    status: 'active',
    $and: [
      { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
    ],
  })
  .select('image title subtitle link displayOrder')
  .sort({ displayOrder: 1, createdAt: -1 })
  .limit(CUSTOMER_LIMIT)
  .lean();
