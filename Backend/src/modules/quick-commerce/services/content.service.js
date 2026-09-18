
import mongoose from 'mongoose';
import { QuickCategory } from '../models/category.model.js';
import { QuickProduct } from '../models/product.model.js';
import {
  buildQuickCouponDateQuery,
  enrichQuickCoupon,
  isQuickCouponCurrentlyValid,
  isQuickCouponExpired,
  startOfDay,
} from '../utils/coupon.helpers.js';

const getCollection = (name) => mongoose.connection?.db?.collection(name) || null;

// --- In-memory Cache ---
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cache = {
  settings: { data: null, expiry: 0 },
  offerSections: { data: null, expiry: 0 },
  categories: { data: null, treeInfo: null, expiry: 0 }
};

const isExpired = (expiry) => Date.now() > expiry;

const buildCategoryTreeInfo = (allCategories = []) => {
  const childrenMap = new Map();
  allCategories.forEach((c) => {
    if (c.parentId) {
      const pid = String(c.parentId);
      if (!childrenMap.has(pid)) childrenMap.set(pid, []);
      childrenMap.get(pid).push(c);
    }
  });

  const getRecursiveChildIds = (catId, seen = new Set()) => {
    const id = String(catId);
    if (seen.has(id)) return [];
    seen.add(id);
    let ids = [id];
    const children = childrenMap.get(id) || [];
    children.forEach((child) => {
      ids = [...ids, ...getRecursiveChildIds(child._id, seen)];
    });
    return ids;
  };

  return { allCategories, childrenMap, getRecursiveChildIds };
};

export const clearContentCache = () => {
  cache.settings.expiry = 0;
  cache.offerSections.expiry = 0;
  cache.categories.data = null;
  cache.categories.treeInfo = null;
  cache.categories.expiry = 0;
};

const toIdString = (value) => {
  if (!value) return null;
  if (typeof value === 'object' && value !== null) {
    if (value._id) return String(value._id);
    if (value.id) return String(value.id);
  }
  return String(value);
};

const normalizeStatusQuery = () => ({
  $and: [
    {
      $or: [
        { status: 'active' },
        { status: { $exists: false } },
        { isActive: true },
        { isActive: { $exists: false } },
      ],
    },
  ],
});

export const getQuickSettings = async () => {
  if (cache.settings.data && !isExpired(cache.settings.expiry)) {
    return cache.settings.data;
  }

  const collection = getCollection('quick_settings');
  if (!collection) return null;
  const data = await collection.findOne({}, { sort: { updatedAt: -1, createdAt: -1 } });

  cache.settings.data = data;
  cache.settings.expiry = Date.now() + CACHE_TTL;
  return data;
};

export const expireStaleQuickCoupons = async () => {
  const collection = getCollection('quick_coupons');
  if (!collection) return 0;

  const now = new Date();
  const today = startOfDay(now);
  const result = await collection.updateMany(
    {
      isActive: true,
      validTill: { $type: 'date', $lt: today },
    },
    { $set: { isActive: false, status: 'expired', updatedAt: now } },
  );

  return Number(result?.modifiedCount || 0);
};

export const getQuickCoupons = async () => {
  const collection = getCollection('quick_coupons');
  if (!collection) return [];

  await expireStaleQuickCoupons();

  const coupons = await collection
    .find({
      $and: [
        normalizeStatusQuery().$and[0],
        buildQuickCouponDateQuery(),
      ],
    })
    .sort({ updatedAt: -1, createdAt: -1 })
    .toArray();

  return coupons
    .filter((coupon) => isQuickCouponCurrentlyValid(coupon))
    .map((coupon) => enrichQuickCoupon(coupon));
};

export const getAdminQuickCoupons = async (params = {}) => {
  const collection = getCollection('quick_coupons');
  if (!collection) return [];

  await expireStaleQuickCoupons();

  const filter = {};
  if (params.status && params.status !== 'all') {
    if (params.status === 'active') {
      filter.isActive = true;
    } else if (params.status === 'inactive') {
      filter.isActive = false;
    } else if (params.status === 'expired') {
      filter.$or = [{ status: 'expired' }, { isActive: false }];
    }
  }
  if (params.search) {
    filter.$or = [
      { code: { $regex: params.search, $options: 'i' } },
      { title: { $regex: params.search, $options: 'i' } },
      { description: { $regex: params.search, $options: 'i' } },
    ];
  }

  const coupons = await collection.find(filter).sort({ updatedAt: -1, createdAt: -1 }).toArray();
  const now = new Date();

  return coupons
    .map((coupon) => enrichQuickCoupon(coupon, now))
    .filter((coupon) => {
      if (params.status === 'active') return coupon.isEffectivelyActive;
      if (params.status === 'expired') return coupon.effectiveStatus === 'expired';
      if (params.status === 'inactive') {
        return coupon.effectiveStatus === 'inactive' || coupon.effectiveStatus === 'scheduled';
      }
      return true;
    });
};

export const createAdminQuickCoupon = async (data) => {
  const collection = getCollection('quick_coupons');
  if (!collection) throw new Error('Collection not found');

  const {
    validateAndNormalizeQuickCouponPayload,
  } = await import('../utils/coupon.helpers.js');
  const normalized = validateAndNormalizeQuickCouponPayload(data, { requireDates: true });

  const existing = await collection.findOne({ code: normalized.code });
  if (existing) throw new Error('A coupon with this code already exists');

  const coupon = {
    code: normalized.code,
    discountType: normalized.discountType,
    discountValue: normalized.discountValue,
    minOrderValue: normalized.minOrderValue,
    maxDiscount: normalized.maxDiscount,
    usageLimit: normalized.usageLimit,
    perUserLimit: normalized.perUserLimit,
    description: normalized.description,
    isFirstOrderOnly: normalized.isFirstOrderOnly,
    usedCount: 0,
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    status: 'active',
    validFrom: normalized.validFrom,
    validTill: normalized.validTill,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await collection.insertOne(coupon);
  return { ...coupon, _id: result.insertedId };
};

export const updateAdminQuickCoupon = async (id, data) => {
  const collection = getCollection('quick_coupons');
  if (!collection) throw new Error('Collection not found');

  const {
    validateAndNormalizeQuickCouponPayload,
  } = await import('../utils/coupon.helpers.js');
  const normalized = validateAndNormalizeQuickCouponPayload(data, { requireDates: true });

  const { ObjectId } = mongoose.Types;
  const objId = ObjectId.isValid(id) ? new ObjectId(id) : null;
  if (!objId) throw new Error('Invalid coupon ID');

  const duplicate = await collection.findOne({
    code: normalized.code,
    _id: { $ne: objId },
  });
  if (duplicate) throw new Error('A coupon with this code already exists');

  const update = {
    code: normalized.code,
    discountType: normalized.discountType,
    discountValue: normalized.discountValue,
    minOrderValue: normalized.minOrderValue,
    maxDiscount: normalized.maxDiscount,
    usageLimit: normalized.usageLimit,
    perUserLimit: normalized.perUserLimit,
    description: normalized.description,
    isFirstOrderOnly: normalized.isFirstOrderOnly,
    validFrom: normalized.validFrom,
    validTill: normalized.validTill,
    updatedAt: new Date(),
  };

  const result = await collection.findOneAndUpdate(
    { _id: objId },
    { $set: update, $unset: { couponType: '' } },
    { returnDocument: 'after' }
  );
  return result;
};

export const deleteAdminQuickCoupon = async (id) => {
  const collection = getCollection('quick_coupons');
  if (!collection) throw new Error('Collection not found');

  const { ObjectId } = mongoose.Types;
  const objId = ObjectId.isValid(id) ? new ObjectId(id) : null;
  if (!objId) throw new Error('Invalid coupon ID');

  await collection.deleteOne({ _id: objId });
  return true;
};

export const toggleAdminQuickCouponStatus = async (id) => {
  const collection = getCollection('quick_coupons');
  if (!collection) throw new Error('Collection not found');

  const { ObjectId } = mongoose.Types;
  const objId = ObjectId.isValid(id) ? new ObjectId(id) : null;
  if (!objId) throw new Error('Invalid coupon ID');

  const existing = await collection.findOne({ _id: objId });
  if (!existing) throw new Error('Coupon not found');

  if (isQuickCouponExpired(existing)) {
    throw new Error('Expired coupons cannot be reactivated. Update the validity dates first.');
  }

  const newStatus = !existing.isActive;
  await collection.updateOne({ _id: objId }, { $set: { isActive: newStatus, updatedAt: new Date() } });
  return enrichQuickCoupon({ ...existing, isActive: newStatus, updatedAt: new Date() });
};

export const getQuickOffers = async () => {
  const collection = getCollection('quick_offers');
  if (!collection) return [];
  return collection.find(normalizeStatusQuery()).sort({ updatedAt: -1, createdAt: -1 }).toArray();
};

export const getQuickOfferSections = async (query = {}) => {
  if (cache.offerSections.data && !isExpired(cache.offerSections.expiry)) {
    return cache.offerSections.data;
  }

  const collection = getCollection('quick_offer_sections');
  if (!collection) return [];

  const filter = normalizeStatusQuery();
  if (query.status && query.status !== 'all') {
    // Override normalizeStatusQuery if explicit status is provided
    filter.$and = filter.$and.filter(f => !f.status);
    filter.$and.push({ status: query.status });
  }

  const sections = await collection
    .find(filter)
    .sort({ order: 1, createdAt: 1 })
    .toArray();

  if (!sections.length) return [];

  const productIds = new Set();
  const categoryIds = new Set();

  sections.forEach((section) => {
    const rawProductIds = Array.isArray(section.productIds) ? section.productIds : [];
    rawProductIds.forEach((id) => {
      const normalized = toIdString(id);
      if (normalized) productIds.add(normalized);
    });

    const rawCategoryIds = Array.isArray(section.categoryIds)
      ? section.categoryIds
      : section.categoryId
        ? [section.categoryId]
        : [];

    rawCategoryIds.forEach((id) => {
      const normalized = toIdString(id);
      if (normalized) categoryIds.add(normalized);
    });
  });

  const [products, categories] = await Promise.all([
    productIds.size
      ? QuickProduct.find({ _id: { $in: Array.from(productIds) } }).lean()
      : Promise.resolve([]),
    categoryIds.size
      ? QuickCategory.find({ _id: { $in: Array.from(categoryIds) } }).lean()
      : Promise.resolve([]),
  ]);

  const productsById = new Map(products.map((product) => [String(product._id), product]));
  const categoriesById = new Map(categories.map((category) => [String(category._id), category]));

  const finalOfferSections = sections.map((section) => {
    // Only hydrate from live DB docs — never fall back to embedded/stale
    // snapshots that may remain in offer-section documents after deletes.
    const hydratedCategoryIds = (Array.isArray(section.categoryIds) ? section.categoryIds : [])
      .map((id) => categoriesById.get(toIdString(id)))
      .filter(Boolean);

    const hydratedCategory =
      categoriesById.get(toIdString(section.categoryId)) || null;

    const hydratedProducts = (Array.isArray(section.productIds) ? section.productIds : [])
      .map((id) => productsById.get(toIdString(id)))
      .filter(Boolean);

    return {
      ...section,
      categoryId: hydratedCategory,
      categoryIds: hydratedCategoryIds,
      productIds: hydratedProducts,
    };
  });

  cache.offerSections.data = finalOfferSections;
  cache.offerSections.expiry = Date.now() + CACHE_TTL;
  return finalOfferSections;
};

export const createQuickOfferSection = async (data) => {
  const collection = getCollection('quick_offer_sections');
  if (!collection) throw new Error('Collection not found');

  const section = {
    ...data,
    order: data.order ?? 0,
    status: data.status || 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await collection.insertOne(section);
  return { ...section, _id: result.insertedId };
};

export const updateQuickOfferSection = async (id, data) => {
  const collection = getCollection('quick_offer_sections');
  if (!collection) throw new Error('Collection not found');

  const update = {
    ...data,
    updatedAt: new Date(),
  };
  delete update._id;

  const result = await collection.findOneAndUpdate(
    { _id: toId(id) },
    { $set: update },
    { returnDocument: 'after' }
  );

  return result;
};

export const deleteQuickOfferSection = async (id) => {
  const collection = getCollection('quick_offer_sections');
  if (!collection) throw new Error('Collection not found');

  await collection.deleteOne({ _id: toId(id) });
  return true;
};

export const reorderQuickOfferSections = async (items = []) => {
  const collection = getCollection('quick_offer_sections');
  if (!collection) throw new Error('Collection not found');

  const ops = items.map((item) => ({
    updateOne: {
      filter: { _id: toId(item.id) },
      update: { $set: { order: item.order, updatedAt: new Date() } },
    },
  }));

  if (ops.length > 0) {
    await collection.bulkWrite(ops);
  }
  return true;
};

export const getQuickCategories = async (query = {}) => {
  if (!query.parentId && cache.categories.data && !isExpired(cache.categories.expiry)) {
    return cache.categories.data;
  }

  const filter = normalizeStatusQuery();

  if (query.parentId) {
    filter.$and.push({ parentId: query.parentId });
  }

  const categories = await QuickCategory.find(filter)
    .sort({ order: 1, name: 1 })
    .lean();

  if (!query.parentId) {
    cache.categories.data = categories;
    cache.categories.treeInfo = buildCategoryTreeInfo(categories);
    cache.categories.expiry = Date.now() + CACHE_TTL;
  }
  return categories;
};
