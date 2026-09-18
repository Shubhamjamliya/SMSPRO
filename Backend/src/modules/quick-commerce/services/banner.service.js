import mongoose from 'mongoose';
import { QuickBanner, BANNER_STATUS_VALUES } from '../models/banner.model.js';
import { QuickCategory } from '../models/category.model.js';
import { QuickZone } from '../models/quick_zone.model.js';

const ADMIN_BANNER_SELECT =
  'imageUrl title startAt endAt headerCategoryIds zoneIds isDefault isEnabled createdAt updatedAt';
const PUBLIC_BANNER_SELECT = 'imageUrl title headerCategoryIds isDefault startAt endAt';

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

const toObjectId = (value) => {
  if (!value) return null;
  const id = String(value);
  return isObjectId(id) ? new mongoose.Types.ObjectId(id) : null;
};

const toObjectIdList = (values = []) => {
  const list = Array.isArray(values) ? values : [values];
  return [...new Set(list.map((v) => String(v || '')).filter(isObjectId))].map(
    (id) => new mongoose.Types.ObjectId(id),
  );
};

export const computeBannerStatus = (banner, now = new Date()) => {
  const startAt = banner?.startAt ? new Date(banner.startAt) : null;
  const endAt = banner?.endAt ? new Date(banner.endAt) : null;
  if (!startAt || !endAt || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return BANNER_STATUS_VALUES.EXPIRED;
  }
  if (now < startAt) return BANNER_STATUS_VALUES.UPCOMING;
  if (now > endAt) return BANNER_STATUS_VALUES.EXPIRED;
  return BANNER_STATUS_VALUES.ACTIVE;
};

const parseDate = (value, fieldName) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    const error = new Error(`${fieldName} is required and must be a valid date`);
    error.statusCode = 400;
    throw error;
  }
  return date;
};

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return fallback;
};

const parseIdArray = (raw) => {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return toObjectIdList(raw);
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return toObjectIdList(parsed);
    } catch {
      // comma-separated fallback
    }
    return toObjectIdList(trimmed.split(',').map((part) => part.trim()));
  }
  return toObjectIdList([raw]);
};

export const validateBannerPayload = (payload = {}, { requireImage = false, existingImageUrl = '' } = {}) => {
  const title = String(payload.title || '').trim();
  const startAt = parseDate(payload.startAt, 'Start date');
  const endAt = parseDate(payload.endAt, 'End date');

  if (endAt <= startAt) {
    const error = new Error('End date must be after start date');
    error.statusCode = 400;
    throw error;
  }

  const headerCategoryIds = parseIdArray(payload.headerCategoryIds);
  if (headerCategoryIds.length === 0) {
    const error = new Error('At least one header category is required');
    error.statusCode = 400;
    throw error;
  }

  const zoneMode = String(payload.zoneMode || '').trim().toLowerCase();
  let zoneIds = parseIdArray(payload.zoneIds);
  if (zoneMode === 'global' || parseBoolean(payload.isGlobal, false)) {
    zoneIds = [];
  } else if (zoneMode === 'specific' && zoneIds.length === 0) {
    const error = new Error('Select at least one zone or choose Global Zone');
    error.statusCode = 400;
    throw error;
  }

  const imageUrl = String(payload.imageUrl || existingImageUrl || '').trim();
  if (requireImage && !imageUrl) {
    const error = new Error('Banner image is required');
    error.statusCode = 400;
    throw error;
  }

  return {
    title,
    startAt,
    endAt,
    headerCategoryIds,
    zoneIds,
    isDefault: parseBoolean(payload.isDefault, false),
    isEnabled: parseBoolean(payload.isEnabled, true),
    imageUrl,
  };
};

const buildNameMaps = async (banners = []) => {
  const headerIds = [];
  const zoneIds = [];
  banners.forEach((banner) => {
    (banner.headerCategoryIds || []).forEach((id) => headerIds.push(String(id)));
    (banner.zoneIds || []).forEach((id) => zoneIds.push(String(id)));
  });

  const uniqueHeaderIds = [...new Set(headerIds)].filter(isObjectId);
  const uniqueZoneIds = [...new Set(zoneIds)].filter(isObjectId);

  const [headers, zones] = await Promise.all([
    uniqueHeaderIds.length
      ? QuickCategory.find({ _id: { $in: uniqueHeaderIds } })
          .select('name type')
          .lean()
      : Promise.resolve([]),
    uniqueZoneIds.length
      ? QuickZone.find({ _id: { $in: uniqueZoneIds } })
          .select('name zoneName')
          .lean()
      : Promise.resolve([]),
  ]);

  const headerMap = new Map(
    headers.map((item) => [String(item._id), { id: item._id, name: item.name || '' }]),
  );
  const zoneMap = new Map(
    zones.map((item) => [
      String(item._id),
      { id: item._id, name: item.zoneName || item.name || '' },
    ]),
  );

  return { headerMap, zoneMap };
};

export const mapBannerAdminDto = (banner, { headerMap, zoneMap, now = new Date() } = {}) => {
  const headerCategoryIds = (banner.headerCategoryIds || []).map((id) => String(id));
  const zoneIds = (banner.zoneIds || []).map((id) => String(id));
  const isGlobal = zoneIds.length === 0;

  return {
    id: banner._id,
    _id: banner._id,
    imageUrl: banner.imageUrl || '',
    title: banner.title || '',
    startAt: banner.startAt,
    endAt: banner.endAt,
    headerCategoryIds,
    headerCategories: headerCategoryIds
      .map((id) => headerMap?.get(id))
      .filter(Boolean),
    zoneIds,
    zones: isGlobal
      ? [{ id: 'global', name: 'Global Zone' }]
      : zoneIds.map((id) => zoneMap?.get(id)).filter(Boolean),
    isGlobal,
    isDefault: Boolean(banner.isDefault),
    isEnabled: banner.isEnabled !== false,
    status: computeBannerStatus(banner, now),
    createdAt: banner.createdAt,
    updatedAt: banner.updatedAt,
  };
};

export const mapBannerPublicDto = (banner) => ({
  id: banner._id,
  _id: banner._id,
  imageUrl: banner.imageUrl || '',
  title: banner.title || '',
  isDefault: banner.isDefault === true,
  headerCategoryIds: Array.isArray(banner.headerCategoryIds)
    ? banner.headerCategoryIds.map((id) => String(id))
    : [],
});

/** Prefer active non-default banners; else active defaults. */
const selectBannersByPriority = (banners = []) => {
  const activeTimeBased = banners.filter(
    (banner) => !banner.isDefault && banner.status === BANNER_STATUS_VALUES.ACTIVE,
  );
  if (activeTimeBased.length) return activeTimeBased;
  return banners.filter(
    (banner) => banner.isDefault === true && banner.status === BANNER_STATUS_VALUES.ACTIVE,
  );
};

const buildZoneMatchFilter = (zoneObjectId) => {
  const globalClauses = [
    { zoneIds: { $exists: false } },
    { zoneIds: null },
    { zoneIds: { $size: 0 } },
  ];
  if (!zoneObjectId) return { $or: globalClauses };
  return {
    $or: [...globalClauses, { zoneIds: zoneObjectId }],
  };
};

export const listAdminBanners = async ({ page = 1, limit = 50 } = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    QuickBanner.find({})
      .select(ADMIN_BANNER_SELECT)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    QuickBanner.countDocuments({}),
  ]);

  const now = new Date();
  const maps = await buildNameMaps(items);

  return {
    results: items.map((item) => mapBannerAdminDto(item, { ...maps, now })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit) || 1,
    },
  };
};

export const getAdminBannerById = async (bannerId) => {
  const id = toObjectId(bannerId);
  if (!id) {
    const error = new Error('Invalid banner id');
    error.statusCode = 400;
    throw error;
  }

  const banner = await QuickBanner.findById(id).select(ADMIN_BANNER_SELECT).lean();
  if (!banner) {
    const error = new Error('Banner not found');
    error.statusCode = 404;
    throw error;
  }

  const maps = await buildNameMaps([banner]);
  return mapBannerAdminDto(banner, { ...maps, now: new Date() });
};

const assertHeaderCategoriesExist = async (headerCategoryIds) => {
  const count = await QuickCategory.countDocuments({
    _id: { $in: headerCategoryIds },
    type: 'header',
  });
  if (count !== headerCategoryIds.length) {
    const error = new Error('One or more header categories are invalid');
    error.statusCode = 400;
    throw error;
  }
};

const assertZonesExist = async (zoneIds) => {
  if (!zoneIds.length) return;
  const count = await QuickZone.countDocuments({ _id: { $in: zoneIds } });
  if (count !== zoneIds.length) {
    const error = new Error('One or more zones are invalid');
    error.statusCode = 400;
    throw error;
  }
};

export const createBanner = async (payload, imageUrl) => {
  const data = validateBannerPayload(
    { ...payload, imageUrl },
    { requireImage: true },
  );

  await Promise.all([
    assertHeaderCategoriesExist(data.headerCategoryIds),
    assertZonesExist(data.zoneIds),
  ]);

  const created = await QuickBanner.create(data);
  return getAdminBannerById(created._id);
};

export const updateBanner = async (bannerId, payload, imageUrl) => {
  const id = toObjectId(bannerId);
  if (!id) {
    const error = new Error('Invalid banner id');
    error.statusCode = 400;
    throw error;
  }

  const existing = await QuickBanner.findById(id).select(ADMIN_BANNER_SELECT).lean();
  if (!existing) {
    const error = new Error('Banner not found');
    error.statusCode = 404;
    throw error;
  }

  const data = validateBannerPayload(
    {
      title: payload.title ?? existing.title,
      startAt: payload.startAt ?? existing.startAt,
      endAt: payload.endAt ?? existing.endAt,
      headerCategoryIds: payload.headerCategoryIds ?? existing.headerCategoryIds,
      zoneIds: payload.zoneIds ?? existing.zoneIds,
      zoneMode: payload.zoneMode,
      isGlobal: payload.isGlobal,
      isDefault: payload.isDefault ?? existing.isDefault,
      isEnabled: payload.isEnabled ?? existing.isEnabled,
      imageUrl: imageUrl || existing.imageUrl,
    },
    { requireImage: false, existingImageUrl: existing.imageUrl },
  );

  await Promise.all([
    assertHeaderCategoriesExist(data.headerCategoryIds),
    assertZonesExist(data.zoneIds),
  ]);

  await QuickBanner.updateOne({ _id: id }, { $set: data });
  return getAdminBannerById(id);
};

export const deleteBanner = async (bannerId) => {
  const id = toObjectId(bannerId);
  if (!id) {
    const error = new Error('Invalid banner id');
    error.statusCode = 400;
    throw error;
  }

  const result = await QuickBanner.deleteOne({ _id: id });
  if (!result.deletedCount) {
    const error = new Error('Banner not found');
    error.statusCode = 404;
    throw error;
  }

  return { deleted: true };
};

export const setBannerEnabled = async (bannerId, isEnabled) => {
  const id = toObjectId(bannerId);
  if (!id) {
    const error = new Error('Invalid banner id');
    error.statusCode = 400;
    throw error;
  }

  const updated = await QuickBanner.findByIdAndUpdate(
    id,
    { $set: { isEnabled: parseBoolean(isEnabled, true) } },
    { new: true },
  )
    .select(ADMIN_BANNER_SELECT)
    .lean();

  if (!updated) {
    const error = new Error('Banner not found');
    error.statusCode = 404;
    throw error;
  }

  const maps = await buildNameMaps([updated]);
  return mapBannerAdminDto(updated, { ...maps, now: new Date() });
};

/**
 * User-facing banners.
 * - With headerId: banners for that header + zone (priority applied).
 * - Without headerId: all ACTIVE banners for the zone (with headerCategoryIds) for FE cache-once.
 */
export const getVisibleBanners = async ({ headerId, zoneId } = {}) => {
  const headerObjectId = toObjectId(headerId);
  const zoneObjectId = toObjectId(zoneId);
  const zoneFilter = buildZoneMatchFilter(zoneObjectId);

  const query = {
    isEnabled: true,
    ...zoneFilter,
  };
  if (headerObjectId) {
    query.headerCategoryIds = headerObjectId;
  }

  const banners = await QuickBanner.find(query)
    .select(PUBLIC_BANNER_SELECT)
    .sort({ createdAt: -1 })
    .lean();

  if (!banners.length) return [];

  const now = new Date();
  const withStatus = banners.map((banner) => ({
    ...banner,
    status: computeBannerStatus(banner, now),
  }));

  if (headerObjectId) {
    return selectBannersByPriority(withStatus).map(mapBannerPublicDto);
  }

  return withStatus
    .filter((banner) => banner.status === BANNER_STATUS_VALUES.ACTIVE)
    .map(mapBannerPublicDto);
};
