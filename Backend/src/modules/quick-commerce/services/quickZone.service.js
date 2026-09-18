import mongoose from 'mongoose';
import { QuickZone } from '../models/quick_zone.model.js';
import { QuickProduct } from '../models/product.model.js';
import { Seller } from '../seller/models/seller.model.js';
import { isPointInPolygon } from '../../../utils/geo.js';
import { isStoreCurrentlyOpen } from '../utils/timeFormat.helpers.js';

export const ZONE_TYPE = Object.freeze({
  SINGLE: 'single_vendor',
  MULTI: 'multi_vendor',
});

export const ZONE_SELECT_ADMIN =
  'name zoneName serviceLocation country unit isActive coordinates zoneType adminHubEnabled adminHubSellerId createdAt updatedAt';

export const ZONE_SELECT_PUBLIC =
  'name zoneName serviceLocation country unit isActive coordinates zoneType adminHubEnabled createdAt';

export const SHOP_SELECT =
  '_id name shopName rating totalRatings location isAdminHub shopInfo.zoneId shopInfo.zoneName shopInfo.businessType shopInfo.openingHours shopInfo.shopImage shopInfo.address';

export const PRODUCT_BOOTSTRAP_SELECT =
  '_id name slug mainImage image categoryId subcategoryId headerId price salePrice mrp unit weight stock status isActive approvalStatus deliveryTime rating badge sellerId packingAmount galleryImages variants';

const normalizeZoneType = (value, fallback = ZONE_TYPE.MULTI) => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === ZONE_TYPE.SINGLE || raw === 'single' || raw === 'sv') return ZONE_TYPE.SINGLE;
  if (raw === ZONE_TYPE.MULTI || raw === 'multi' || raw === 'mv') return ZONE_TYPE.MULTI;
  return fallback;
};

const toObjectId = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  const str = String(value).trim();
  return mongoose.Types.ObjectId.isValid(str) ? new mongoose.Types.ObjectId(str) : null;
};

const normalizePhoneDigits = (phone) =>
  String(phone || '')
    .replace(/\D/g, '')
    .slice(-15);

const maskPhone = (phone) => {
  const digits = normalizePhoneDigits(phone);
  if (digits.length < 4) return '';
  const last4 = digits.slice(-4);
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${last4}`;
};

export const mapZoneDto = (zone, { includeCoordinates = true } = {}) => {
  if (!zone) return null;
  const zoneType = normalizeZoneType(zone.zoneType, ZONE_TYPE.MULTI);
  const id = zone._id ? String(zone._id) : null;
  const hubSellerId = zone.adminHubSellerId ? String(zone.adminHubSellerId) : null;
  const dto = {
    id,
    _id: id,
    name: zone.name || zone.zoneName || '',
    zoneName: zone.zoneName || zone.name || '',
    serviceLocation: zone.serviceLocation || zone.name || '',
    country: zone.country || 'India',
    unit: zone.unit || 'kilometer',
    isActive: zone.isActive !== false,
    zoneType,
    adminHubEnabled: zone.adminHubEnabled === true || zoneType === ZONE_TYPE.SINGLE,
    adminHubSellerId: hubSellerId,
    createdAt: zone.createdAt || null,
    updatedAt: zone.updatedAt || null,
  };
  if (includeCoordinates) {
    dto.coordinates = Array.isArray(zone.coordinates) ? zone.coordinates : [];
  }
  return dto;
};

export const mapShopDto = (seller, { productCount = null } = {}) => {
  if (!seller) return null;
  const openingHours = seller.shopInfo?.openingHours || '';
  const shopImage = seller.shopInfo?.shopImage || '';
  const address =
    seller.location?.formattedAddress ||
    seller.location?.address ||
    seller.shopInfo?.address ||
    '';
  const dto = {
    id: seller._id,
    _id: seller._id,
    name: seller.name || '',
    shopName: seller.shopName || seller.name || 'Store',
    image: shopImage,
    shopImage,
    rating: Number(seller.rating || 0),
    totalRatings: Number(seller.totalRatings || 0),
    isAdminHub: seller.isAdminHub === true,
    businessType: seller.shopInfo?.businessType || '',
    openingHours,
    isOpen: isStoreCurrentlyOpen(openingHours),
    zoneId: seller.shopInfo?.zoneId || null,
    zoneName: seller.shopInfo?.zoneName || '',
    address,
    location: seller.location
      ? {
          latitude: seller.location.latitude ?? seller.location.coordinates?.[1] ?? null,
          longitude: seller.location.longitude ?? seller.location.coordinates?.[0] ?? null,
          address,
        }
      : null,
  };
  if (productCount != null) {
    dto.productCount = Math.max(0, Number(productCount) || 0);
  }
  return dto;
};

/** Product counts for a page of sellers (optional category/header scope). */
export const countProductsBySellerIds = async (
  sellerIds,
  categoryId = null,
  headerId = null,
) => {
  if (!Array.isArray(sellerIds) || sellerIds.length === 0) return {};

  const catMatch = buildCategoryProductMatch(categoryId, headerId);
  const match = {
    sellerId: { $in: sellerIds },
    $and: [
      ...(publicProductSellerMatch.$and || []),
      ...(catMatch ? [catMatch] : []),
    ],
  };

  const rows = await QuickProduct.aggregate([
    { $match: match },
    { $group: { _id: '$sellerId', count: { $sum: 1 } } },
  ]);

  return rows.reduce((acc, row) => {
    if (row?._id) acc[String(row._id)] = Number(row.count) || 0;
    return acc;
  }, {});
};

export const mapAdminHubDto = (seller) => {
  if (!seller) return null;
  const id = seller._id ? String(seller._id) : null;
  return {
    id,
    _id: id,
    shopName: seller.shopName || seller.name || 'Admin Hub',
    name: seller.name || '',
    phoneMasked: maskPhone(seller.phoneLast10 || seller.phone),
    phoneLast4: normalizePhoneDigits(seller.phoneLast10 || seller.phone).slice(-4),
    isActive: seller.isActive !== false,
    approvalStatus: seller.approvalStatus || 'approved',
    isAdminHub: seller.isAdminHub === true,
  };
};

let adminHubUniqueIndexDropped = false;

/**
 * Drop legacy unique isAdminHub index so multiple per-zone hubs can exist.
 */
const ensureAdminHubIndexAllowsMultiple = async () => {
  if (adminHubUniqueIndexDropped) return;
  adminHubUniqueIndexDropped = true;
  try {
    const indexes = await Seller.collection.indexes();
    const uniqueHub = indexes.find(
      (idx) => idx?.key?.isAdminHub === 1 && idx.unique === true,
    );
    if (uniqueHub?.name) {
      await Seller.collection.dropIndex(uniqueHub.name);
    }
  } catch {
    // Index may already be gone or collection not ready — safe to continue.
  }
};

/**
 * Find any Admin Hub seller (legacy helper — hubs are per-zone now).
 */
export const findAdminHubSeller = async ({ lean = true } = {}) => {
  const query = Seller.findOne({
    isAdminHub: true,
    isDeleted: { $ne: true },
    accountStatus: { $ne: 'deleted' },
  }).select('_id name shopName phone phoneDigits phoneLast10 isActive approvalStatus approved isAdminHub');

  return lean ? query.lean() : query;
};

/**
 * Create a new Admin Hub seller for one zone.
 * - Unique phone required (cannot reuse any existing seller number)
 * - Not approved — must complete Seller Panel onboarding before full access
 */
export const createAdminHubSeller = async ({
  phone,
  shopName,
  name,
} = {}) => {
  await ensureAdminHubIndexAllowsMultiple();

  const digits = normalizePhoneDigits(phone);
  if (digits.length < 10) {
    const err = new Error('Valid Admin Hub mobile number is required');
    err.status = 400;
    err.code = 'ADMIN_HUB_PHONE_REQUIRED';
    throw err;
  }

  const phoneSuffix = digits.slice(-10);

  const phoneOwner = await Seller.findOne({
    $or: [{ phoneDigits: digits }, { phoneLast10: phoneSuffix }],
    isDeleted: { $ne: true },
  }).select('_id isAdminHub shopName');

  if (phoneOwner) {
    const err = new Error(
      'This mobile number is already registered. Each zone needs a unique Admin Hub number.',
    );
    err.status = 409;
    err.code = 'ADMIN_HUB_PHONE_IN_USE';
    throw err;
  }

  const resolvedName = String(name || shopName || 'Admin Hub').trim() || 'Admin Hub';
  const resolvedShop = String(shopName || name || 'Admin Hub').trim() || 'Admin Hub';

  // Same QC Seller collection + OTP login; panel stays gated until onboarding + approval.
  const seller = await Seller.create({
    name: resolvedName,
    shopName: resolvedShop,
    phone: phoneSuffix,
    email: `adminhub${phoneSuffix}@seller.local`,
    role: 'SELLER',
    isAdminHub: true,
    isVerified: true,
    isActive: true,
    approved: false,
    approvalStatus: 'draft',
    onboardingSubmitted: false,
    approvedAt: null,
    rejectedAt: null,
    shopInfo: {
      zoneSource: 'quick',
      businessType: 'Admin Hub',
      zoneId: null,
      zoneName: '',
    },
  });

  return { seller, created: true };
};

/** @deprecated Use createAdminHubSeller — kept for import compatibility */
export const resolveOrCreateAdminHub = async (args = {}) => {
  if (args.useExisting) {
    const err = new Error(
      'Admin Hub cannot be reused. Provide a unique mobile number for this zone.',
    );
    err.status = 400;
    err.code = 'ADMIN_HUB_REUSE_FORBIDDEN';
    throw err;
  }
  return createAdminHubSeller(args);
};

/**
 * Resolve hub attachment for zone create/update.
 * - Single Vendor: Admin Hub required
 * - Multi Vendor: Admin Hub optional
 * When hub is enabled/created: unique phone → new draft seller (no reuse).
 * Update keeps the zone's own hub when still enabled.
 */
export const resolveZoneHubConfig = async ({
  zoneType,
  adminHubEnabled,
  useExistingAdminHub,
  adminHubSellerId,
  adminHubPhone,
  adminHubShopName,
  adminHubName,
  previous,
} = {}) => {
  const type = normalizeZoneType(zoneType, previous?.zoneType || ZONE_TYPE.MULTI);
  const isUpdate = Boolean(previous);

  const wantsHub =
    type === ZONE_TYPE.SINGLE
      ? true
      : adminHubEnabled === true ||
        adminHubEnabled === 'true' ||
        adminHubEnabled === 1 ||
        adminHubEnabled === '1';

  if (!wantsHub) {
    return {
      zoneType: type,
      adminHubEnabled: false,
      adminHubSellerId: null,
    };
  }

  // Update: keep this zone's linked hub (never attach another zone's hub)
  if (isUpdate && previous?.adminHubSellerId) {
    const hubSeller = await Seller.findOne({
      _id: previous.adminHubSellerId,
      isAdminHub: true,
      isDeleted: { $ne: true },
    });
    if (hubSeller) {
      if (hubSeller.isActive === false) {
        const err = new Error('Admin Hub seller is inactive or deleted');
        err.status = 400;
        err.code = 'ADMIN_HUB_INACTIVE';
        throw err;
      }
      return {
        zoneType: type,
        adminHubEnabled: true,
        adminHubSellerId: hubSeller._id,
      };
    }
    // Linked hub missing — fall through to create with a new phone
  }

  const reuseRequested =
    useExistingAdminHub === true ||
    useExistingAdminHub === 'true' ||
    adminHubSellerId;

  // On create, never allow "use existing" or attaching an arbitrary seller id
  if (!isUpdate && reuseRequested) {
    const err = new Error(
      'Admin Hub cannot be reused. Enter a unique mobile number for this zone.',
    );
    err.status = 400;
    err.code = 'ADMIN_HUB_REUSE_FORBIDDEN';
    throw err;
  }

  // Create (or repair update without hub): require unique phone → new seller profile
  const result = await createAdminHubSeller({
    phone: adminHubPhone,
    shopName: adminHubShopName,
    name: adminHubName,
  });

  return {
    zoneType: type,
    adminHubEnabled: true,
    adminHubSellerId: result.seller._id,
  };
};

const externalSellerInZoneFilter = (zoneId) => ({
  'shopInfo.zoneId': zoneId,
  isAdminHub: { $ne: true },
  isDeleted: { $ne: true },
  accountStatus: { $ne: 'deleted' },
  // QC sellers only — never touch Food zone assignments
  $or: [
    { 'shopInfo.zoneSource': { $in: ['quick', ''] } },
    { 'shopInfo.zoneSource': null },
    { 'shopInfo.zoneSource': { $exists: false } },
  ],
});

/**
 * Count external (non-hub) sellers assigned to a quick zone.
 */
export const countExternalSellersInZone = async (zoneId) => {
  const id = toObjectId(zoneId);
  if (!id) return 0;
  return Seller.countDocuments(externalSellerInZoneFilter(id));
};

/**
 * Detach external QC sellers from a zone (used when converting to Single Vendor).
 */
export const detachExternalSellersFromZone = async (zoneId) => {
  const id = toObjectId(zoneId);
  if (!id) return 0;
  const result = await Seller.updateMany(externalSellerInZoneFilter(id), {
    $set: {
      'shopInfo.zoneId': null,
      'shopInfo.zoneName': '',
    },
  });
  return Number(result?.modifiedCount || 0);
};

/**
 * Validate / prepare zone type conversion.
 * Admin can freely switch Single ↔ Multi. Multi→Single detaches external sellers.
 */
export const assertZoneConversionAllowed = async ({
  previousType,
  nextType,
  zoneId,
  adminHubEnabled,
  adminHubSellerId,
}) => {
  const from = normalizeZoneType(previousType, ZONE_TYPE.MULTI);
  const to = normalizeZoneType(nextType, from);
  if (from === to) return { from, to, detachedSellers: 0 };

  let detachedSellers = 0;

  if (to === ZONE_TYPE.SINGLE) {
    detachedSellers = await detachExternalSellersFromZone(zoneId);
    if (!adminHubEnabled || !adminHubSellerId) {
      const err = new Error('Single Vendor zones require an Admin Hub');
      err.status = 400;
      err.code = 'ADMIN_HUB_REQUIRED';
      throw err;
    }
  }

  return { from, to, detachedSellers };
};

/**
 * Bind Admin Hub seller metadata for a zone.
 * One hub seller ↔ one zone. Does NOT auto-approve — onboarding/admin approval still required.
 */
export const bindAdminHubToZone = async (hubSellerId, zone) => {
  const id = toObjectId(hubSellerId);
  if (!id || !zone?._id) return;

  await Seller.updateOne(
    { _id: id, isAdminHub: true },
    {
      $set: {
        isActive: true,
        isDeleted: false,
        accountStatus: 'active',
        'shopInfo.zoneSource': 'quick',
        'shopInfo.businessType': 'Admin Hub',
        'shopInfo.zoneId': zone._id,
        'shopInfo.zoneName': zone.zoneName || zone.name || '',
      },
    },
  );
};

/**
 * Detect active Quick zone containing lat/lng (first match).
 */
export const detectQuickZoneByPoint = async (lat, lng) => {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const zones = await QuickZone.find({ isActive: true })
    .select(ZONE_SELECT_ADMIN)
    .lean();

  for (const zone of zones) {
    if (isPointInPolygon(latitude, longitude, zone.coordinates || [])) {
      return zone;
    }
  }
  return null;
};

export const getQuickZoneByIdLean = async (zoneId) => {
  const id = toObjectId(zoneId);
  if (!id) return null;
  return QuickZone.findById(id).select(ZONE_SELECT_ADMIN).lean();
};

/**
 * Sellers that may join a zone: multi_vendor only; never single_vendor.
 */
export const assertSellerCanJoinZone = async (zoneId, { zoneSource = 'quick' } = {}) => {
  const source = String(zoneSource || 'quick').toLowerCase();
  if (source === 'food') {
    // Food zones are outside QC SV/MV rules.
    return null;
  }

  const zone = await getQuickZoneByIdLean(zoneId);
  if (!zone) {
    const err = new Error('Service zone not found');
    err.status = 404;
    err.code = 'ZONE_NOT_FOUND';
    throw err;
  }
  if (zone.isActive === false) {
    const err = new Error('Service zone is inactive');
    err.status = 400;
    err.code = 'ZONE_INACTIVE';
    throw err;
  }

  const zoneType = normalizeZoneType(zone.zoneType, ZONE_TYPE.MULTI);
  if (zoneType === ZONE_TYPE.SINGLE) {
    const err = new Error('Single Vendor zones are managed by Admin Hub only and cannot be joined by sellers');
    err.status = 403;
    err.code = 'SINGLE_VENDOR_ZONE_FORBIDDEN';
    throw err;
  }

  return zone;
};

const buildCategoryProductMatch = (categoryId, headerId = null) => {
  const catOid = toObjectId(categoryId);
  const headerOid = toObjectId(headerId);
  if (!catOid && !headerOid) return null;

  // Two-level catalog: Header (headerId) → Main Category (categoryId).
  // Never treat main category id as a headerId match.
  if (headerOid && catOid) {
    return {
      $and: [
        { headerId: headerOid },
        {
          $or: [
            { categoryId: catOid },
            { subcategoryId: catOid }, // legacy field only
          ],
        },
      ],
    };
  }
  if (headerOid && !catOid) {
    return { headerId: headerOid };
  }
  return {
    $or: [
      { categoryId: catOid },
      { subcategoryId: catOid },
    ],
  };
};

const publicProductSellerMatch = {
  $and: [
    {
      $or: [
        { approvalStatus: 'approved' },
        { approvalStatus: { $exists: false } },
      ],
    },
    {
      $or: [{ status: 'active' }, { status: { $exists: false } }],
    },
    {
      $or: [{ isActive: true }, { isActive: { $exists: false } }],
    },
    { sellerId: { $ne: null } },
  ],
};

/**
 * Distinct sellerIds that have ≥1 active approved product in category.
 * Uses lean distinct + compound-friendly filter (no aggregation).
 */
export const findSellerIdsWithCategoryProducts = async (sellerIds, categoryId, headerId = null) => {
  const catMatch = buildCategoryProductMatch(categoryId, headerId);
  if (!catMatch || !Array.isArray(sellerIds) || sellerIds.length === 0) return [];

  const ids = await QuickProduct.distinct('sellerId', {
    sellerId: { $in: sellerIds },
    $and: [
      ...(publicProductSellerMatch.$and || []),
      catMatch,
    ],
  });

  return ids.filter(Boolean).map((id) => String(id));
};

/**
 * Approved shops for a multi-vendor zone (includes Admin Hub when enabled).
 * When categoryId/headerId is provided, return only sellers that have products in that scope.
 * Always returns { items, pagination } for lean, paginated clients.
 */
export const listShopsForZone = async (
  zone,
  { page = 1, limit = 12, categoryId = null, headerId = null } = {},
) => {
  const empty = {
    items: [],
    pagination: { page: 1, limit: 12, total: 0, pages: 1, hasNext: false },
  };
  if (!zone?._id) return empty;

  const zoneType = normalizeZoneType(zone.zoneType, ZONE_TYPE.MULTI);
  if (zoneType === ZONE_TYPE.SINGLE) return empty;

  const hubEnabled = zone.adminHubEnabled === true || zoneType === ZONE_TYPE.SINGLE;
  const hubId = zone.adminHubSellerId ? String(zone.adminHubSellerId) : null;
  const safeLimit = Math.max(1, Math.min(Number(limit) || 12, 50));
  const safePage = Math.max(1, Number(page) || 1);
  const skip = (safePage - 1) * safeLimit;
  const categoryOid = toObjectId(categoryId);
  const headerOid = toObjectId(headerId);
  const hasCatalogScope = Boolean(categoryOid || headerOid);

  const filter = {
    isDeleted: { $ne: true },
    accountStatus: { $ne: 'deleted' },
    isActive: { $ne: false },
    approved: { $ne: false },
    approvalStatus: 'approved',
    $or: [
      {
        'shopInfo.zoneId': zone._id,
        isAdminHub: { $ne: true },
        'shopInfo.zoneSource': { $nin: ['food'] },
      },
      ...(hubEnabled && hubId
        ? [{ _id: toObjectId(hubId), isAdminHub: true }]
        : []),
    ],
  };

  const buildPagination = (total) => {
    const pages = Math.max(1, Math.ceil(total / safeLimit));
    return {
      page: safePage,
      limit: safeLimit,
      total,
      pages,
      hasNext: safePage < pages,
    };
  };

  // Zone-wide listing (home) — DB-level pagination
  if (!hasCatalogScope) {
    const [rows, total] = await Promise.all([
      Seller.find(filter)
        .select(SHOP_SELECT)
        .sort({ isAdminHub: -1, shopName: 1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      Seller.countDocuments(filter),
    ]);

    const counts = await countProductsBySellerIds(rows.map((r) => r._id).filter(Boolean));
    return {
      items: rows
        .map((row) => mapShopDto(row, { productCount: counts[String(row._id)] || 0 }))
        .filter(Boolean),
      pagination: buildPagination(total),
    };
  }

  // Category/header scoped — intersect inventory, then paginate
  const candidates = await Seller.find(filter)
    .select('_id')
    .sort({ isAdminHub: -1, shopName: 1 })
    .limit(500)
    .lean();

  if (!candidates.length) {
    return { items: [], pagination: buildPagination(0) };
  }

  const candidateIds = candidates.map((r) => r._id).filter(Boolean);
  const withStock = await findSellerIdsWithCategoryProducts(
    candidateIds,
    categoryOid || null,
    headerOid || null,
  );
  if (!withStock.length) {
    return { items: [], pagination: buildPagination(0) };
  }

  const allowed = new Set(withStock);
  const orderedIds = candidates
    .map((r) => r._id)
    .filter((id) => allowed.has(String(id)));
  const total = orderedIds.length;
  const pageIds = orderedIds.slice(skip, skip + safeLimit);

  if (!pageIds.length) {
    return { items: [], pagination: buildPagination(total) };
  }

  const rows = await Seller.find({ _id: { $in: pageIds } })
    .select(SHOP_SELECT)
    .lean();

  const byId = new Map(rows.map((row) => [String(row._id), row]));
  const counts = await countProductsBySellerIds(
    pageIds,
    categoryOid || null,
    headerOid || null,
  );
  const items = pageIds
    .map((id) =>
      mapShopDto(byId.get(String(id)), {
        productCount: counts[String(id)] || 0,
      }),
    )
    .filter(Boolean);

  return {
    items,
    pagination: buildPagination(total),
  };
};

export { normalizeZoneType, toObjectId, normalizePhoneDigits };
