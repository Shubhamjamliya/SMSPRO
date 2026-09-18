import mongoose from 'mongoose';
import { QuickCategory } from '../models/category.model.js';
import { QuickProduct } from '../models/product.model.js';
import { QuickReview } from '../models/review.model.js';
import { FoodUser } from '../../../core/users/user.model.js';
import { Seller } from '../seller/models/seller.model.js';
import {
  getQuickCategories,
  getQuickCoupons,
  getQuickOfferSections,
  getQuickOffers,
  getQuickSettings,
} from '../services/content.service.js';
import {
  assertQuickCouponApplicable,
  findActiveSellerCoupon,
  mapSellerCouponForApply,
  startOfDay,
  endOfDay,
  resolveCartSellerId,
  getSellerEligibleCartTotal,
} from '../utils/coupon.helpers.js';
import {
  ZONE_TYPE,
  PRODUCT_BOOTSTRAP_SELECT,
  detectQuickZoneByPoint,
  getQuickZoneByIdLean,
  listShopsForZone,
  normalizeZoneType,
} from '../services/quickZone.service.js';
import { isStoreCurrentlyOpen } from '../utils/timeFormat.helpers.js';

const setNoCache = (res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
};

const setPublicCache = (res, maxAge = 300) => {
  res.set('Cache-Control', `public, max-age=${maxAge}`);
};

const approvedOrLegacyFilter = {
  $and: [
    {
      $or: [
        { approvalStatus: 'approved' },
        { approvalStatus: { $exists: false } },
      ],
    },
  ],
};

const publicCategoryFilter = {
  $and: [
    {
      $or: [
        { status: 'active' },
        { status: { $exists: false } },
        { isActive: true },
        { isActive: { $exists: false } },
      ],
    },
    {
      $or: [
        { type: { $ne: 'subcategory' } },
        approvedOrLegacyFilter,
      ],
    },
  ],
};

const publicProductFilter = {
  $and: [
    approvedOrLegacyFilter,
    {
      $or: [{ status: 'active' }, { status: { $exists: false } }],
    },
    {
      $or: [{ isActive: true }, { isActive: { $exists: false } }],
    },
  ],
};

const mapCategory = (category) => ({
  id: category._id,
  _id: category._id,
  name: category.name,
  slug: category.slug,
  image: category.image || '',
  status: category.status || (category.isActive ? 'active' : 'inactive'),
  type: category.type || 'header',
  parentId: category.parentId || null,
  iconId: category.iconId || '',
  color: category.accentColor || '',
  gst: Number(category.handlingFees || 0),
  gstRate: Number(category.handlingFees || 0),
  adminCommission: Number(category.adminCommission || 0),
  returnWindowDays: Number(category.returnWindowDays ?? 3),
});

const buildSellerMap = async (products = []) => {
  const sellerIds = [...new Set(
    products
      .map((product) => String(product?.sellerId || '').trim())
      .filter(Boolean)
  )];

  if (!sellerIds.length) return {};

  const sellers = await Seller.find({ _id: { $in: sellerIds } })
    .select('_id shopName name shopInfo.openingHours')
    .lean();

  return sellers.reduce((acc, seller) => {
    const openingHours = seller.shopInfo?.openingHours || '';
    acc[String(seller._id)] = {
      _id: seller._id,
      shopName: seller.shopName,
      name: seller.name,
      openingHours,
      isOpen: isStoreCurrentlyOpen(openingHours),
    };
    return acc;
  }, {});
};

const buildHeaderMetaMap = async (products = []) => {
  const headerIds = [...new Set(
    products
      .map((product) => String(product?.headerId || '').trim())
      .filter((id) => id && mongoose.Types.ObjectId.isValid(id)),
  )];
  if (!headerIds.length) return {};

  const headers = await QuickCategory.find({ _id: { $in: headerIds }, type: 'header' })
    .select('_id returnWindowDays')
    .lean();

  return headers.reduce((acc, header) => {
    acc[String(header._id)] = {
      returnWindowDays: Number(header.returnWindowDays ?? 3),
    };
    return acc;
  }, {});
};

const mapProduct = (product, sellerMap = {}, headerMetaMap = {}) => {
  const seller = sellerMap[String(product?.sellerId || '')] || null;
  const headerMeta = headerMetaMap[String(product?.headerId || '')] || {};
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const firstVariant = variants[0] || null;
  const displayPrice = firstVariant
    ? Number(firstVariant.price || 0)
    : Number(product.price || 0);
  const displaySalePrice = firstVariant
    ? Number(firstVariant.salePrice || 0)
    : Number(product.salePrice || 0);
  const displayStock = variants.length
    ? variants.reduce((sum, v) => sum + Math.max(0, Number(v?.stock) || 0), 0)
    : Number(product.stock || 0);

  const firstVariantImage = Array.isArray(firstVariant?.images)
    ? firstVariant.images.find(Boolean)
    : "";
  const displayImage = firstVariantImage || product.mainImage || product.image;

  return ({
  id: product._id,
  _id: product._id,
  name: product.name,
  slug: product.slug,
  image: displayImage,
  mainImage: displayImage,
  galleryImages: Array.isArray(product.galleryImages) ? product.galleryImages : [],
  categoryId: product.categoryId,
  subcategoryId: product.subcategoryId || null,
  headerId: product.headerId || null,
  price: displayPrice,
  salePrice: displaySalePrice,
  packingAmount: Math.max(0, Number(product.packingAmount || 0)),
  // Prefer product MRP; else first-variant MRP so strike-through matches offer pricing
  originalPrice: Math.max(
    Number(product.mrp || 0),
    displayPrice,
    displaySalePrice,
  ) || displayPrice,
  weight: product.weight || product.unit || '',
  unit: product.unit || product.weight || '',
  stock: displayStock,
  status: product.status || (product.isActive ? 'active' : 'inactive'),
  brand: product.brand || '',
  description: product.description || '',
  tags: Array.isArray(product.tags) ? product.tags : [],
  variants,
  deliveryTime: product.deliveryTime,
  rating: product.rating,
  badge: product.badge,
  approvalStatus: product.approvalStatus || 'approved',
  returnWindowDays: Number(headerMeta.returnWindowDays ?? 3),
  sellerId: product.sellerId || seller?._id || null,
  seller: seller
    ? {
        _id: seller._id,
        id: seller._id,
        name: seller.name || '',
        shopName: seller.shopName || seller.name || 'Store',
        openingHours: seller.openingHours || '',
        isOpen: seller.isOpen !== false,
      }
    : null,
  storeName: seller?.shopName || seller?.name || '',
  restaurantName: seller?.shopName || seller?.name || '',
  isShopOpen: seller ? seller.isOpen !== false : true,
  shopOpeningHours: seller?.openingHours || '',
});
};

export const getHomeData = async (req, res) => {
  setPublicCache(res, 60); // 1 minute cache
  // No need to re-run on every request — this was causing unnecessary DB overhead.

  const [categories, products, settings, offerSections] = await Promise.all([
    getQuickCategories(),
    QuickProduct.find(publicProductFilter).sort({ createdAt: -1 }).limit(18).lean(),
    getQuickSettings(),
    getQuickOfferSections(),
  ]);
  const [sellerMap, headerMetaMap] = await Promise.all([
    buildSellerMap(products),
    buildHeaderMetaMap(products),
  ]);

  const homeData = {
    settings: settings || {},
    categories: categories.map(mapCategory),
    bestSellers: products.map((product) => mapProduct(product, sellerMap, headerMetaMap)),
    offerSections,
  };

  if (req.path.includes('/offer-sections')) {
    return res.json({ success: true, results: offerSections });
  }

  return res.json({
    success: true,
    result: homeData,
  });
};

// ─── Bootstrap — zone-aware single homepage payload ───────────────────────────
// Lightweight: zone meta + main categories only. Shops/products load on demand.
export const getBootstrapData = async (req, res) => {
  const lat = req.query?.lat ?? req.query?.latitude;
  const lng = req.query?.lng ?? req.query?.longitude;
  const zoneIdQuery = req.query?.zoneId;

  // Zone-specific responses should not be shared across locations
  if (lat != null || lng != null || zoneIdQuery) {
    setNoCache(res);
  } else {
    setPublicCache(res, 120);
  }

  try {
    let zone = null;
    if (zoneIdQuery) {
      zone = await getQuickZoneByIdLean(zoneIdQuery);
      if (zone && zone.isActive === false) zone = null;
    } else if (lat != null && lng != null) {
      zone = await detectQuickZoneByPoint(lat, lng);
    }

    const zoneType = zone
      ? normalizeZoneType(zone.zoneType, ZONE_TYPE.MULTI)
      : null;
    const adminHubEnabled = zone
      ? zone.adminHubEnabled === true || zoneType === ZONE_TYPE.SINGLE
      : false;

    const categories = await getQuickCategories();
    // Main catalog nodes only (no subcategory) — Home tiles + header tabs
    const mainCategories = categories
      .filter((c) => String(c?.type || 'header') !== 'subcategory')
      .map(mapCategory);

    const result = {
      zoneId: zone?._id || null,
      zoneName: zone ? zone.zoneName || zone.name || '' : null,
      zoneType,
      adminHubEnabled,
      categories: mainCategories,
      offerSections: [],
      products: [],
      shops: [],
    };

    return res.json({
      success: true,
      result,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Bootstrap fetch failed' });
  }
};

// ─── Lean offer-sections endpoint — bina poora getHomeData chalaye ────────────
export const getOfferSectionsLean = async (req, res) => {
  setPublicCache(res, 120);
  try {
    const offerSections = await getQuickOfferSections();
    return res.json({ success: true, results: offerSections || [] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to fetch offer sections' });
  }
};

export const getCoupons = async (req, res) => {
  setNoCache(res);
  try {
    const adminCoupons = await getQuickCoupons();
    let results = Array.isArray(adminCoupons) ? [...adminCoupons] : [];

    const { sellerId } = req.query;
    if (sellerId && mongoose.Types.ObjectId.isValid(sellerId)) {
      const { SellerCoupon } = await import('../models/sellerCoupon.model.js');
      const todayStart = startOfDay(new Date());
      const todayEnd = endOfDay(new Date());
      const sellerCoupons = await SellerCoupon.find({
        sellerId: new mongoose.Types.ObjectId(sellerId),
        status: 'Approved',
        isActive: { $ne: false },
        $and: [
          {
            $or: [
              { validFrom: null },
              { validFrom: { $exists: false } },
              { validFrom: { $lte: todayEnd } },
            ],
          },
          {
            $or: [
              { validTill: { $gte: todayStart } },
              { validTill: { $exists: false }, expiryDate: { $gte: todayStart } },
            ],
          },
        ],
      }).lean();

      const mappedSellerCoupons = sellerCoupons
        .map((c) => mapSellerCouponForApply(c))
        .filter(Boolean)
        .map((c) => ({
          ...c,
          id: c._id,
          title: c.discountType === 'percentage' ? `${c.discountValue}% OFF` : `₹${c.discountValue} FLAT OFF`,
        }));

      results = [...results, ...mappedSellerCoupons];
    }

    return res.json({ success: true, results });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch coupons' });
  }
};

export const applyCoupon = async (req, res) => {
  setNoCache(res);
  try {
    const { code, cartTotal, items, customerId } = req.body || {};
    if (!code) {
      return res.status(400).json({ success: false, message: 'Coupon code is required' });
    }

    const adminCoupons = await getQuickCoupons();
    let coupon = adminCoupons.find(
      (c) => String(c.code || '').toUpperCase() === String(code).toUpperCase(),
    );

    const cartSellerId = resolveCartSellerId(items);
    if (!coupon) {
      coupon = await findActiveSellerCoupon({
        code,
        sellerId: cartSellerId,
      });
    }

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found or not valid for this store',
      });
    }

    const isSellerCoupon = coupon.isSellerCoupon === true;
    const couponSellerId = String(coupon.sellerId || cartSellerId || '').trim();
    const eligibleTotal = isSellerCoupon
      ? getSellerEligibleCartTotal(items, couponSellerId)
      : Number(cartTotal || 0);

    const userId = customerId || req.user?.userId || null;
    const result = await assertQuickCouponApplicable(coupon, {
      cartTotal: eligibleTotal,
      userId,
      items: Array.isArray(items) ? items : [],
      sellerId: couponSellerId,
    });

    return res.json({
      success: true,
      message: `Coupon ${result.code} applied successfully!`,
      result,
    });
  } catch (error) {
    const status = error.statusCode || 400;
    return res.status(status).json({
      success: false,
      message: error.message || 'Failed to apply coupon',
    });
  }
};

export const getOffers = async (_req, res) => {
  setNoCache(res);
  const offers = await getQuickOffers();
  return res.json({ success: true, results: offers });
};

export const getCategories = async (req, res) => {
  setPublicCache(res, 300); // 5 minutes cache
  const { tree, parentId } = req.query;
  const categories = await getQuickCategories({ parentId });
  // 2-layer catalog only: header + main category
  const mapped = categories
    .filter((category) => String(category?.type || 'header') !== 'subcategory')
    .map(mapCategory);

  if (tree === 'true' || tree === true) {
    const catMap = {};
    mapped.forEach((cat) => {
      cat.children = [];
      catMap[String(cat._id)] = cat;
    });

    const root = [];
    mapped.forEach((cat) => {
      if (cat.parentId && catMap[String(cat.parentId)]) {
        catMap[String(cat.parentId)].children.push(cat);
      } else if (cat.type === 'header' || !cat.parentId) {
        root.push(cat);
      }
    });
    return res.json({ success: true, results: root });
  }

  return res.json({ success: true, results: mapped });
};

export const getProducts = async (req, res) => {
  setNoCache(res);
  const {
    categoryId,
    headerId,
    search,
    limit,
    sellerId,
    storeId,
    zoneId,
    lat,
    lng,
    latitude,
    longitude,
  } = req.query;
  const query = { ...publicProductFilter };

  if (categoryId || headerId) {
    if (headerId && categoryId) {
      // Strict Main Category scope under Header (2-level catalog)
      query.$and = [
        ...(query.$and || []),
        { headerId },
        {
          $or: [
            { categoryId },
            { subcategoryId: categoryId }, // legacy field only
          ],
        },
      ];
    } else if (headerId && !categoryId) {
      query.headerId = headerId;
    } else if (categoryId) {
      query.$or = [
        { categoryId },
        { subcategoryId: categoryId },
      ];
    }
  }
  if (search) query.name = { $regex: String(search).trim(), $options: 'i' };

  const scopedSellerId = sellerId || storeId;
  const hasSellerScope =
    scopedSellerId && mongoose.Types.ObjectId.isValid(String(scopedSellerId));

  let zone = null;
  const zoneScopeRequested =
    Boolean(zoneId) || lat != null || latitude != null;
  if (zoneScopeRequested) {
    zone = zoneId ? await getQuickZoneByIdLean(zoneId) : null;
    if (!zone) {
      zone = await detectQuickZoneByPoint(lat ?? latitude, lng ?? longitude);
    }
    // Never fall back to the global catalog when the client asked for a zone.
    if (!zone) {
      return res.json({
        success: true,
        result: {
          items: [],
          zoneId: null,
          zoneType: null,
        },
      });
    }
  }

  if (hasSellerScope) {
    query.sellerId = scopedSellerId;
    // When zone is known, ensure seller belongs to that zone (MV shops / SV hub).
    if (zone) {
      const zoneType = normalizeZoneType(zone.zoneType, ZONE_TYPE.MULTI);
      if (zoneType === ZONE_TYPE.SINGLE) {
        const hubId = zone.adminHubSellerId ? String(zone.adminHubSellerId) : null;
        if (hubId && String(scopedSellerId) !== hubId) {
          query.sellerId = { $in: [] };
        }
      } else {
        // MV: zone membership only. Category/header already applied on the product query.
        const hubEnabled = zone.adminHubEnabled === true;
        const hubId = zone.adminHubSellerId ? String(zone.adminHubSellerId) : null;
        const sellerOid = new mongoose.Types.ObjectId(String(scopedSellerId));
        const member = await Seller.findOne({
          _id: sellerOid,
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
              ? [{ _id: new mongoose.Types.ObjectId(hubId), isAdminHub: true }]
              : []),
          ],
        })
          .select('_id')
          .lean();
        if (!member) {
          query.sellerId = { $in: [] };
        }
      }
    }
  } else if (zone) {
    const zoneType = normalizeZoneType(zone.zoneType, ZONE_TYPE.MULTI);
    if (zoneType === ZONE_TYPE.SINGLE && zone.adminHubSellerId) {
      query.sellerId = zone.adminHubSellerId;
    } else if (zoneType === ZONE_TYPE.MULTI) {
      const shopsResult = await listShopsForZone(zone, {
        limit: 100,
        page: 1,
        categoryId: categoryId || null,
        headerId: headerId || null,
      });
      const ids = (shopsResult.items || [])
        .map((s) => s._id || s.id)
        .filter(Boolean);
      query.sellerId = ids.length ? { $in: ids } : { $in: [] };
    }
  }

  const parsedLimit = Number(limit) > 0 ? Math.min(Number(limit), 100) : 50;
  const products = await QuickProduct.find(query)
    .select(PRODUCT_BOOTSTRAP_SELECT + ' brand description tags variants')
    .sort({ createdAt: -1 })
    .limit(parsedLimit)
    .lean();
  const [sellerMap, headerMetaMap] = await Promise.all([
    buildSellerMap(products),
    buildHeaderMetaMap(products),
  ]);

  return res.json({
    success: true,
    result: {
      items: products.map((product) => mapProduct(product, sellerMap, headerMetaMap)),
    },
  });
};

export const getProductById = async (req, res) => {
  // Seller edits must reflect immediately on PDP — do not cache product detail.
  setNoCache(res);

  const product = await QuickProduct.findOne({ _id: req.params.productId, ...publicProductFilter }).lean();

  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  const [sellerMap, headerMetaMap] = await Promise.all([
    buildSellerMap([product]),
    buildHeaderMetaMap([product]),
  ]);

  return res.json({ success: true, result: mapProduct(product, sellerMap, headerMetaMap) });
};

export const getProductReviews = async (req, res) => {
  setPublicCache(res, 300); // 5 minutes cache
  const { productId } = req.params;

  try {
    const reviews = await QuickReview.find({
      productId,
      status: 'approved',
    }).populate('userId', 'name profileImage').sort({ createdAt: -1 }).lean();

    return res.json({
      success: true,
      results: reviews,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews',
    });
  }
};

export const submitProductReview = async (req, res) => {
  const { productId, rating, comment } = req.body;
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required to submit a review',
    });
  }

  if (!productId || !rating || !comment) {
    return res.status(400).json({
      success: false,
      message: 'Product ID, rating, and comment are required',
    });
  }

  try {
    const [product, user] = await Promise.all([
      QuickProduct.findById(productId),
      FoodUser.findById(userId).select('name profileImage'),
    ]);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    const review = await QuickReview.create({
      productId,
      userId,
      userName: user?.name || 'Customer',
      userAvatar: user?.profileImage || '',
      rating: Number(rating),
      comment: String(comment).trim(),
      status: 'approved', // Auto-approving for now as per simple implementation, or can be 'pending'
    });

    return res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      result: review,
    });
  } catch (error) {
    console.error('Error submitting review:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit review',
    });
  }
};

export const getStores = async (req, res) => {
  setNoCache(res);
  try {
    const {
      zoneId,
      lat,
      lng,
      latitude,
      longitude,
      limit,
      page,
      categoryId,
      headerId,
    } = req.query || {};

    let zone = null;
    if (zoneId) {
      zone = await getQuickZoneByIdLean(zoneId);
      if (zone && zone.isActive === false) {
        return res.status(400).json({
          success: false,
          message: 'Zone is inactive',
          code: 'ZONE_INACTIVE',
        });
      }
    } else {
      zone = await detectQuickZoneByPoint(lat ?? latitude, lng ?? longitude);
    }

    const emptyPagination = {
      page: Math.max(1, Number(page) || 1),
      limit: Math.max(1, Math.min(Number(limit) || 12, 50)),
      total: 0,
      pages: 1,
      hasNext: false,
    };

    if (!zone) {
      return res.json({
        success: true,
        result: {
          zoneId: null,
          zoneName: null,
          zoneType: null,
          adminHubEnabled: false,
          shops: [],
          pagination: emptyPagination,
        },
      });
    }

    const zoneType = normalizeZoneType(zone.zoneType, ZONE_TYPE.MULTI);
    const adminHubEnabled =
      zone.adminHubEnabled === true || zoneType === ZONE_TYPE.SINGLE;

    // Single Vendor: no shop listing — products via /products with zone scope
    if (zoneType === ZONE_TYPE.SINGLE) {
      return res.json({
        success: true,
        result: {
          zoneId: zone._id,
          zoneName: zone.zoneName || zone.name || '',
          zoneType,
          adminHubEnabled,
          shops: [],
          pagination: emptyPagination,
        },
      });
    }

    // Multi Vendor: zone-wide (home) or category-scoped (main category page)
    const { items, pagination } = await listShopsForZone(zone, {
      page: Number(page) > 0 ? Number(page) : 1,
      limit: Number(limit) > 0 ? Number(limit) : 12,
      categoryId: categoryId || null,
      headerId: headerId || null,
    });

    return res.json({
      success: true,
      result: {
        zoneId: zone._id,
        zoneName: zone.zoneName || zone.name || '',
        zoneType,
        adminHubEnabled,
        categoryId: categoryId || null,
        headerId: headerId || null,
        shops: items,
        pagination,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch stores',
    });
  }
};

export const getStoreDetails = async (req, res) => {
  setNoCache(res); // isOpen depends on current time — never cache
  try {
    const { storeId } = req.params;
    if (!storeId || !mongoose.Types.ObjectId.isValid(storeId)) {
      return res.status(400).json({ success: false, message: 'Invalid store ID' });
    }
    const seller = await Seller.findOne({
      _id: storeId,
      isDeleted: { $ne: true },
      accountStatus: { $ne: 'deleted' },
      isActive: { $ne: false },
    })
      .select('_id name shopName location rating totalRatings isAdminHub shopInfo approvalStatus approved')
      .lean();

    if (!seller) {
      return res.status(404).json({ success: false, message: 'Store not found' });
    }

    const openingHours = seller.shopInfo?.openingHours || '';
    return res.json({
      success: true,
      result: {
        _id: seller._id,
        id: seller._id,
        name: seller.name || '',
        shopName: seller.shopName || seller.name || 'Store',
        location: seller.location || null,
        rating: Number(seller.rating || 0),
        totalRatings: Number(seller.totalRatings || 0),
        isAdminHub: seller.isAdminHub === true,
        businessType: seller.shopInfo?.businessType || '',
        openingHours,
        isOpen: isStoreCurrentlyOpen(openingHours),
        zoneId: seller.shopInfo?.zoneId || null,
        zoneName: seller.shopInfo?.zoneName || '',
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch store details' });
  }
};


