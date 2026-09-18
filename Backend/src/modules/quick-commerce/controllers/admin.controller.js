import mongoose from 'mongoose';
import { FoodUser } from '../../../core/users/user.model.js';
import { QuickCategory } from '../models/category.model.js';
import { QuickProduct } from '../models/product.model.js';
import { QuickOrder } from '../models/order.model.js';
import { Seller } from '../seller/models/seller.model.js';
import { SellerOrder } from '../seller/models/sellerOrder.model.js';
import { SellerReturn } from '../seller/models/sellerReturn.model.js';
import { upsertSellerNotification } from '../seller/services/sellerNotify.service.js';
import {
  buildApplySellerPendingProfileChanges,
  buildDiscardSellerPendingProfileChanges,
  sanitizePendingProfileChangesForApi,
  stripPharmacySellerDocuments,
} from '../shared/pendingProfileChanges.js';
import { QuickZone } from '../models/quick_zone.model.js';
import { resolveQuickOrderCancellationReason } from '../utils/cancellation.helpers.js';
import { RETURN_STATUSES } from '../utils/return.helpers.js';
import { resolveQuickOrderCustomer } from '../utils/customer.helpers.js';
import { Driver } from '../../../core/models/driver.model.js';
import { applyAdminCouponToPlatformProfit, getQuickCouponDiscount, getQuickCouponSource } from '../utils/couponEarnings.helpers.js';
import { computeSellerReceivable } from '../utils/sellerEarnings.helpers.js';
import { uploadImageBuffer } from '../../../services/cloudinary.service.js';
import { getIO, rooms } from '../../../config/socket.js';
import {
  getQuickOfferSections,
  createQuickOfferSection,
  updateQuickOfferSection,
  deleteQuickOfferSection,
  reorderQuickOfferSections,
  getAdminQuickCoupons,
  createAdminQuickCoupon,
  updateAdminQuickCoupon,
  deleteAdminQuickCoupon,
  toggleAdminQuickCouponStatus,
  clearContentCache,
} from '../services/content.service.js';
import {
  getQuickCommerceFinanceLedger,
  getQuickCommerceFinancePayouts,
  getQuickCommerceFinanceSummary,
  getQuickCommerceSellerWithdrawals,
  getQuickCommerceSellerTransactions,
  updateQuickCommerceWithdrawalStatus,
} from "../services/finance.service.js";
import {
  getSellerWithdrawalSettings,
  upsertSellerWithdrawalSettings,
} from "../admin/services/withdrawalSettings.service.js";
import {
  cascadeCategoryStatus,
  cascadeDeleteCategory,
} from '../services/categoryCascade.service.js';
import {
  ZONE_TYPE,
  ZONE_SELECT_ADMIN,
  ZONE_SELECT_PUBLIC,
  mapZoneDto,
  mapAdminHubDto,
  resolveZoneHubConfig,
  assertZoneConversionAllowed,
  bindAdminHubToZone,
  assertSellerCanJoinZone,
  normalizeZoneType,
} from '../services/quickZone.service.js';

const toCategory = (category, { lean = false } = {}) => {
  const type = String(category?.type || 'header').trim().toLowerCase() || 'header';
  const status = category.status || (category.isActive ? 'active' : 'inactive');
  const base = {
    id: category._id,
    _id: category._id,
    name: category.name,
    slug: category.slug,
    type,
    status,
    parentId: category.parentId || null,
    isActive: category.isActive !== false && String(status) === 'active',
  };

  if (lean) return base;

  // Main categories only need catalog fields (no header GST / commission / icon).
  if (type === 'category') {
    return {
      ...base,
      image: category.image || '',
      description: category.description || '',
    };
  }

  return {
    ...base,
    iconId: category.iconId || '',
    image: category.image,
    accentColor: category.accentColor,
    description: category.description || '',
    adminCommission: Number(category.adminCommission || 0),
    // GST % (DB column remains handlingFees for compatibility; not exposed as handling fee)
    gst: Number(category.handlingFees || 0),
    gstRate: Number(category.handlingFees || 0),
    returnWindowDays: Number(category.returnWindowDays ?? 3),
    sortOrder: category.sortOrder,
    approvalStatus: category.approvalStatus || 'approved',
    approvedAt: category.approvedAt || null,
  };
};

const toProduct = (product) => {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const firstVariantImage = Array.isArray(variants[0]?.images)
    ? variants[0].images.find(Boolean)
    : "";
  const displayImage = firstVariantImage || product.mainImage || product.image;
  return {
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
  price: product.price,
  mrp: product.mrp,
  salePrice: product.salePrice || 0,
  unit: product.unit,
  description: product.description || '',
  stock: Number(product.stock || 0),
  lowStockAlert: Number(product.lowStockAlert ?? 5),
  packingAmount: Number(product.packingAmount || 0),
  status: product.status || (product.isActive ? 'active' : 'inactive'),
  brand: product.brand || '',
  weight: product.weight || '',
  sku: product.sku || '',
  tags: Array.isArray(product.tags) ? product.tags : [],
  variants: Array.isArray(product.variants) ? product.variants : [],
  headerBusinessType: product.headerId?.businessType || '',
  sellerBusinessType: product.seller?.shopInfo?.businessType || '',
  isFeatured: Boolean(product.isFeatured),
  badge: product.badge,
  isActive: product.isActive,
  approvalStatus: product.approvalStatus || 'approved',
  approvedAt: product.approvedAt || null,
  sellerId: product.sellerId || null,
  seller: product.seller || null,
  storeName: product.storeName || '',
  restaurantName: product.restaurantName || '',
};
};

const buildProductSellerMap = async (products = []) => {
  const sellerIds = [...new Set(
    products
      .map((product) => String(product?.sellerId || '').trim())
      .filter(Boolean),
  )];

  if (!sellerIds.length) return {};

  const sellers = await Seller.find({ _id: { $in: sellerIds } })
    .select('_id shopName name shopInfo.businessType')
    .lean();

  return sellers.reduce((acc, seller) => {
    acc[String(seller._id)] = seller;
    return acc;
  }, {});
};

const withProductSeller = (product, sellerMap = {}) => {
  const seller = sellerMap[String(product?.sellerId || '')] || null;
  const sellerInfo = seller
    ? {
        _id: seller._id,
        id: seller._id,
        name: seller.name || '',
        shopName: seller.shopName || seller.name || 'Store',
        shopInfo: seller.shopInfo || {},
      }
    : null;

  return {
    ...product,
    sellerId: product?.sellerId || sellerInfo?._id || null,
    seller: sellerInfo,
    storeName: sellerInfo?.shopName || sellerInfo?.name || '',
    restaurantName: sellerInfo?.shopName || sellerInfo?.name || '',
    sellerBusinessType: sellerInfo?.shopInfo?.businessType || '',
  };
};

const slugify = (value = '') =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

const parseNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Header GST % — accept gst / gstRate / handlingFees (legacy DB field). */
const resolveHeaderGstRate = (body = {}, fallback = 0) => {
  if (body.gst !== undefined && body.gst !== null && body.gst !== '') {
    return Math.max(0, Math.min(100, parseNumber(body.gst, fallback)));
  }
  if (body.gstRate !== undefined && body.gstRate !== null && body.gstRate !== '') {
    return Math.max(0, Math.min(100, parseNumber(body.gstRate, fallback)));
  }
  if (body.handlingFees !== undefined && body.handlingFees !== null && body.handlingFees !== '') {
    return Math.max(0, Math.min(100, parseNumber(body.handlingFees, fallback)));
  }
  return Math.max(0, Math.min(100, parseNumber(fallback, 0)));
};

const hasHeaderGstInput = (body = {}) =>
  (body.gst !== undefined && body.gst !== null && body.gst !== '') ||
  (body.gstRate !== undefined && body.gstRate !== null && body.gstRate !== '') ||
  (body.handlingFees !== undefined && body.handlingFees !== null && body.handlingFees !== '');

const parseBool = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return fallback;
};

const parseVariants = (value = '[]') => {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.map((variant) => ({
      name: String(variant?.name || '').trim(),
      price: parseNumber(variant?.price, 0),
      salePrice: parseNumber(variant?.salePrice, 0),
      stock: parseNumber(variant?.stock, 0),
      sku: String(variant?.sku || '').trim(),
    })) : [];
  } catch {
    return [];
  }
};

const QUICK_CANCELLED_STATUSES = ['cancelled', 'cancelled_by_user', 'cancelled_by_restaurant', 'cancelled_by_admin'];

const legacyQuickStatusFromOrder = (order = {}) => {
  const workflowStatus = String(order?.workflowStatus || '').toUpperCase();
  const rawStatus = String(order?.orderStatus || order?.status || '').toLowerCase();

  if (workflowStatus === 'OUT_FOR_DELIVERY') return 'out_for_delivery';
  if (workflowStatus === 'DELIVERED') return 'delivered';
  if (workflowStatus === 'CANCELLED' || QUICK_CANCELLED_STATUSES.includes(rawStatus)) return 'cancelled';
  if (workflowStatus === 'SELLER_ACCEPTED' || workflowStatus === 'DELIVERY_SEARCH' || workflowStatus === 'DELIVERY_ASSIGNED' || workflowStatus === 'PICKUP_READY') {
    return 'confirmed';
  }
  if (rawStatus === 'out_for_delivery') return 'out_for_delivery';
  if (rawStatus === 'delivered') return 'delivered';
  if (rawStatus === 'confirmed' || rawStatus === 'packed') return rawStatus;
  return 'pending';
};

/**
 * Flatten a SellerReturn into the shape the admin order tables read.
 *
 * Returned separately from the order's own fields because refund money moves on
 * the return document, not on the order.
 */
const buildAdminOrderReturnBlock = (returnDoc) => {
  if (!returnDoc) {
    return {
      hasReturn: false,
      returnId: '',
      returnStatus: '',
      refundStatus: '',
      refundMethod: '',
      returnReason: '',
      refundAmount: 0,
      refundedAmount: 0,
      sellerRecovered: 0,
      pickupFeeAdminExpense: 0,
      returnedItemCount: 0,
      requestedAt: null,
      refundReference: '',
      refundTransactionId: '',
    };
  }

  const finance = returnDoc.finance || {};
  const refundAmount = Number(returnDoc.returnRefundAmount || 0);
  const refundCompleted = String(returnDoc.refundStatus || '') === 'completed';

  return {
    hasReturn: true,
    returnId: String(returnDoc._id || ''),
    returnStatus: returnDoc.returnStatus || '',
    refundStatus: returnDoc.refundStatus || '',
    refundMethod: returnDoc.refundMethod || '',
    returnReason: returnDoc.returnReason || '',
    refundAmount,
    refundedAmount: refundCompleted ? refundAmount : 0,
    sellerRecovered: finance.sellerLedgerApplied
      ? Number(finance.preSettlementDeducted || 0) + Number(finance.postSettlementDebited || 0)
      : 0,
    pickupFeeAdminExpense: Number(finance.pickupFeeAdminExpense || 0),
    returnedItemCount: Array.isArray(returnDoc.returnItems) ? returnDoc.returnItems.length : 0,
    requestedAt: returnDoc.returnRequestedAt || null,
    refundReference: returnDoc.refundReference || '',
    refundTransactionId: returnDoc.refundTransactionId || '',
  };
};

const buildQuickAdminOrderResponse = (
  order,
  sellerMap = {},
  sellerOrderMap = {},
  riderMap = {},
  returnMap = {},
) => {
  const paymentAmountDue = Number(order?.payment?.amountDue || 0);
  const payableAmount = Number(order?.payableAmount || 0);
  const totalAmount = Number(order?.totalAmount || 0);
  const amount = Number(order?.amount || 0);
  const total = Number(order?.total || 0);
  const pricingTotal = Number(order?.pricing?.total || 0);
  const platformFee = Number(order?.pricing?.platformFee || 0);
  const payableTotal = Math.max(
    0,
    paymentAmountDue,
    payableAmount,
    totalAmount,
    amount,
    total,
    pricingTotal,
  );

  const quickItems = Array.isArray(order?.items) ? order.items.filter((item) => item?.type === 'quick') : [];
  const firstSellerId = String(quickItems[0]?.sourceId || '');
  const seller = sellerMap[firstSellerId] || null;
  const sellerOrder = sellerOrderMap[String(order?.orderId || '')] || null;
  const itemCount = Array.isArray(order?.items)
    ? order.items.reduce((sum, item) => sum + Number(item?.quantity || 0), 0)
    : 0;

  const pricing = order.pricing || {};
  const sellerLegCommission = Number(sellerOrder?.pricing?.commission || 0);
  const parentCommission = Number(pricing.restaurantCommission || 0);
  // Prefer whichever still has the real commission (parent may have been wiped on older cancels).
  const sellerCommission =
    parentCommission > 0 ? parentCommission : sellerLegCommission > 0 ? sellerLegCommission : parentCommission;
  const packingFee = Number(
    pricing.packagingFee ?? sellerOrder?.pricing?.packingAmount ?? 0,
  );
  const couponDiscount = getQuickCouponDiscount(pricing);
  const couponSource = getQuickCouponSource(pricing);
  const isCancelled = String(order?.orderStatus || '').toLowerCase().includes('cancel')
    || String(sellerOrder?.status || '').toLowerCase() === 'cancelled';
  const payMethod = String(order?.payment?.method || '').trim().toLowerCase();
  const payStatus = String(order?.payment?.status || '').trim().toLowerCase();
  const isCod = ['cash', 'cod', 'cash_on_delivery'].includes(payMethod);
  const isPrepaidPaid =
    !isCod && ['paid', 'captured', 'refunded'].includes(payStatus);
  const packingToSeller = isCancelled
    ? (isPrepaidPaid ? packingFee : 0)
    : packingFee;
  const adminEarned = isCancelled
    ? 0
    : applyAdminCouponToPlatformProfit(
        Math.max(
          0,
          platformFee + Number(pricing.tax || pricing.gst || 0) + sellerCommission,
        ),
        { discount: couponDiscount, couponSource },
      );
  const sellerReceivableWouldBe = computeSellerReceivable({
    subtotal: Number(pricing.subtotal || 0),
    commission: sellerCommission,
    packingAmount: packingFee,
    couponDiscount,
    couponSource,
  });
  const sellerReceivable = isCancelled
    ? packingToSeller
    : Number(sellerOrder?.pricing?.receivable) || sellerReceivableWouldBe;

  const riderId = order?.dispatch?.deliveryPartnerId
    ? String(order.dispatch.deliveryPartnerId)
    : '';
  const rider = riderId ? riderMap[riderId] || null : null;
  const populatedUser =
    order?.userId && typeof order.userId === 'object' ? order.userId : null;
  const customerResolved = resolveQuickOrderCustomer(order, sellerOrder);
  const sellerAddress =
    seller?.location?.formattedAddress ||
    seller?.location?.address ||
    seller?.address ||
    sellerOrder?.address?.address ||
    '';
  const sellerImage =
    seller?.shopInfo?.shopImage ||
    seller?.shopImage ||
    '';
  const txnHash =
    order?.payment?.razorpay?.paymentId ||
    order?.payment?.razorpayPaymentId ||
    order?.payment?.transactionId ||
    order?.payment?.txnId ||
    order?.payment?.reference ||
    order?.payment?.razorpay?.orderId ||
    (isCod ? 'COD — no gateway txn' : '');

  return {
    id: order._id,
    _id: order._id,
    orderId: order.orderId,
    orderNumber: order.orderId,
    orderType: order.orderType === "mixed" ? "mixed" : (order.orderType || "quick"),
    total: payableTotal,
    amount: payableTotal,
    status: legacyQuickStatusFromOrder(order),
    orderStatus: order.orderStatus || '',
    workflowStatus: order.workflowStatus || '',
    workflowVersion: order.workflowVersion || 1,
    returnStatus: order.returnStatus || '',
    returnInfo: buildAdminOrderReturnBlock(returnMap[String(order.orderId || '')]),
    itemCount,
    items: Array.isArray(order.items) ? order.items : [],
    pricing: {
      ...pricing,
      packagingFee: packingFee,
      restaurantCommission: sellerCommission,
      tax: Number(pricing.tax || pricing.gst || 0),
      discount: couponDiscount,
      couponDiscount,
      couponSource: couponSource || pricing.couponSource || '',
    },
    payment: {
      ...(order.payment || {}),
      transactionId: txnHash || order?.payment?.transactionId || '',
      txnHash: txnHash || '',
    },
    sessionId: order.sessionId || '',
    createdAt: order.createdAt || null,
    updatedAt: order.updatedAt || null,
    customer: {
      ...customerResolved,
      _id: populatedUser?._id || order?.userId || null,
      id: populatedUser?._id || order?.userId || null,
      image: populatedUser?.profileImage || '',
      profileImage: populatedUser?.profileImage || '',
    },
    seller: seller
      ? {
          _id: seller._id,
          id: seller._id,
          shopName: seller.shopName || seller.name || 'Store',
          name: seller.name || seller.shopName || 'Store',
          phone: seller.phone || seller.phoneLast10 || '',
          email: seller.email || seller?.shopInfo?.supportEmail || '',
          image: sellerImage,
          shopImage: sellerImage,
          address: sellerAddress,
          businessType: seller?.shopInfo?.businessType || '',
          location: seller.location || null,
        }
      : null,
    storeName: seller?.shopName || seller?.name || '',
    sellerOrder: sellerOrder
      ? {
          _id: sellerOrder._id,
          status: sellerOrder.status,
          workflowStatus: sellerOrder.workflowStatus,
          customer: sellerOrder.customer || {},
          address: sellerOrder.address || {},
          cancellationReason: sellerOrder.cancellationReason || '',
          pricing: {
            ...(sellerOrder.pricing || {}),
            commission: sellerCommission || Number(sellerOrder?.pricing?.commission || 0),
            packingAmount: Number(sellerOrder?.pricing?.packingAmount || packingFee),
            receivable: sellerReceivable,
          },
        }
      : null,
    cancellationReason: resolveQuickOrderCancellationReason(order, sellerOrder),
    statusHistory: Array.isArray(order.statusHistory) ? order.statusHistory : [],
    address: order.deliveryAddress || sellerOrder?.address || {},
    dispatch: order.dispatch || {},
    deliveryState: order.deliveryState || {},
    riderEarning: Number(order.riderEarning || 0),
    platformProfit: isCancelled ? 0 : Number(order.platformProfit || 0),
    earnings: {
      // Always show commission that applied / would have applied on this order.
      sellerCommission,
      sellerReceivable,
      sellerReceivableIfDelivered: sellerReceivableWouldBe,
      packingFee,
      packingToSeller,
      adminEarned,
      riderEarned: isCancelled ? 0 : Number(order.riderEarning || 0),
      isCancelled,
      isCod,
    },
    rider: rider
      ? {
          _id: rider._id,
          name: rider.name || 'Rider',
          phone: rider.phone || '',
          vehicleType: rider.vehicleType || '',
          vehicleNumber: rider.vehicleNumber || '',
        }
      : null,
    deliveryBoy: rider
      ? {
          _id: rider._id,
          name: rider.name || 'Rider',
          phone: rider.phone || '',
        }
      : null,
  };
};

const getCategoryImage = async (req) => {
  if (req.file?.buffer) {
    return uploadImageBuffer(req.file.buffer, 'quick-commerce/categories');
  }
  return String(req.body?.image || '').trim();
};

const getProductImages = async (req) => {
  const mainFile = req.files?.mainImage?.[0];
  const galleryFiles = Array.isArray(req.files?.galleryImages) ? req.files.galleryImages : [];

  const mainImage = mainFile?.buffer
    ? await uploadImageBuffer(mainFile.buffer, 'quick-commerce/products/main')
    : String(req.body?.mainImage || req.body?.image || '').trim();

  const existingGallery = []
    .concat(req.body?.galleryImages || [])
    .flat()
    .filter(Boolean)
    .map((value) => String(value).trim());

  const uploadedGallery = await Promise.all(
    galleryFiles.map((file) => uploadImageBuffer(file.buffer, 'quick-commerce/products/gallery'))
  );

  const galleryImages = [...existingGallery, ...uploadedGallery].filter(Boolean);

  return {
    mainImage,
    galleryImages,
    image: mainImage || galleryImages[0] || '',
  };
};

const buildCategoryTree = (categories) => {
  // Only 2 layers: header + main category (exclude subcategory)
  const usable = (categories || []).filter(
    (category) => String(category?.type || 'header') !== 'subcategory',
  );
  const byId = new Map();
  const roots = [];

  usable.forEach((category) => {
    byId.set(String(category._id), { ...toCategory(category), children: [] });
  });

  byId.forEach((category) => {
    const parentId = category.parentId ? String(category.parentId) : null;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId).children.push(category);
    } else if (category.type === 'header' || !parentId) {
      roots.push(category);
    }
  });

  return roots;
};

const toSellerRequest = (seller, extras = {}) => {
  const zoneType = extras.zoneType
    ? normalizeZoneType(extras.zoneType, '')
    : '';
  const businessType =
    seller.shopInfo?.businessType === 'Pharmacy'
      ? 'Quick Commerce'
      : seller.shopInfo?.businessType || 'Quick Commerce';
  const pendingProfileChanges = sanitizePendingProfileChangesForApi(
    seller.pendingProfileChanges,
  );
  return {
  id: seller._id,
  _id: seller._id,
  shopName: seller.shopName || seller.name || 'Store',
  ownerName: seller.name || 'Seller',
  email: seller.email || '',
  phone: seller.phoneLast10 || seller.phone || '',
  location: seller.location?.formattedAddress || seller.location?.address || '',
  lat:
    seller.location?.latitude ??
    (Array.isArray(seller.location?.coordinates)
      ? seller.location.coordinates[1]
      : null),
  lng:
    seller.location?.longitude ??
    (Array.isArray(seller.location?.coordinates)
      ? seller.location.coordinates[0]
      : null),
  category: businessType,
  applicationDate: seller.createdAt,
  approvedAt: seller.approvedAt || null,
  zoneId: seller.shopInfo?.zoneId || null,
  zoneName: seller.shopInfo?.zoneName || '',
  zoneType: zoneType || '',
  zoneTypeLabel:
    zoneType === ZONE_TYPE.SINGLE
      ? 'Single Vendor'
      : zoneType === ZONE_TYPE.MULTI
        ? 'Multi Vendor'
        : '',
  productCount: Number(extras.productCount) || 0,
  status:
    seller.approvalStatus ||
    (seller.approved === false ? 'pending' : 'approved'),
  approvalStatus:
    seller.approvalStatus ||
    (seller.approved === false ? 'pending' : 'approved'),
  approved: seller.approved !== false,
  onboardingSubmitted: seller.onboardingSubmitted === true,
  isAdminHub: seller.isAdminHub === true,
  bankInfo: seller.bankInfo || {},
  documents: stripPharmacySellerDocuments(seller.documents || {}),
  shopInfo: {
    ...(seller.shopInfo || {}),
    businessType,
  },
  approvalNotes: seller.approvalNotes || '',
  rejectedAt: seller.rejectedAt || null,
  wasPreviouslyRejected:
    seller.wasPreviouslyRejected === true || seller.approvalStatus === 'rejected',
  lastRejectionReason:
    seller.lastRejectionReason ||
    (seller.approvalStatus === 'rejected' ? seller.approvalNotes || '' : ''),
  isReapplication:
    seller.approvalStatus === 'pending' &&
    (seller.wasPreviouslyRejected === true || Boolean(seller.lastRejectionReason)),
  wasEverApproved: seller.wasEverApproved === true,
  hasPendingProfileUpdate: Boolean(pendingProfileChanges),
  pendingProfileChanges,
  profileUpdateRequestedAt: pendingProfileChanges?.requestedAt || null,
};
};

/** Map zoneId → normalized zoneType for a batch of sellers. */
const buildSellerZoneTypeMap = async (sellers = []) => {
  const zoneIds = [
    ...new Set(
      sellers
        .map((seller) => String(seller?.shopInfo?.zoneId || '').trim())
        .filter((id) => id && mongoose.isValidObjectId(id)),
    ),
  ];
  if (!zoneIds.length) return {};

  const zones = await QuickZone.find({ _id: { $in: zoneIds } })
    .select('_id zoneType')
    .lean();

  return zones.reduce((acc, zone) => {
    acc[String(zone._id)] = normalizeZoneType(zone.zoneType, ZONE_TYPE.MULTI);
    return acc;
  }, {});
};

export const getAdminStats = async (_req, res) => {

  const [categories, products, orders, sellers, users, revenueAgg, returnsAgg] = await Promise.all([
    QuickCategory.countDocuments({ isActive: true }),
    QuickProduct.countDocuments({ isActive: true }),
    QuickOrder.countDocuments({ orderType: { $in: ['quick', 'mixed'] } }),
    Seller.countDocuments({ approvalStatus: 'approved' }),
    FoodUser.countDocuments({ role: 'USER' }),
    QuickOrder.aggregate([
      { $match: { 
          orderType: { $in: ['quick', 'mixed'] },
          $or: [
            { orderStatus: 'delivered' },
            { workflowStatus: 'DELIVERED' }
          ]
      } },
      { $group: { 
          _id: null, 
          total: { $sum: '$pricing.total' },
          totalGst: { $sum: { $ifNull: ['$pricing.tax', { $ifNull: ['$pricing.gst', 0] }] } },
          totalPlatformFee: { $sum: { $ifNull: ['$pricing.platformFee', 0] } }
        } 
      },
    ]),
    // Returns overview for the admin dashboard KPI row.
    SellerReturn.aggregate([
      {
        $group: {
          _id: null,
          totalReturns: { $sum: 1 },
          activeReturns: {
            $sum: {
              $cond: [
                {
                  $in: [
                    '$returnStatus',
                    [
                      RETURN_STATUSES.REQUESTED,
                      RETURN_STATUSES.APPROVED,
                      RETURN_STATUSES.PICKUP_ASSIGNED,
                      RETURN_STATUSES.IN_TRANSIT,
                      RETURN_STATUSES.RETURNED,
                    ],
                  ],
                },
                1,
                0,
              ],
            },
          },
          refundedToCustomers: {
            $sum: {
              $cond: [
                { $eq: ['$refundStatus', 'completed'] },
                { $ifNull: ['$returnRefundAmount', 0] },
                0,
              ],
            },
          },
          refundsPending: {
            $sum: {
              $cond: [
                { $in: ['$refundStatus', ['pending', 'processing']] },
                { $ifNull: ['$returnRefundAmount', 0] },
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  const returnsSummary = returnsAgg?.[0] || {};

  return res.json({
    success: true,
    result: {
      categories,
      products,
      orders,
      sellers,
      users,
      revenue: Number(revenueAgg?.[0]?.total || 0),
      gstCollected: Number(revenueAgg?.[0]?.totalGst || 0),
      platformCharges: Number(revenueAgg?.[0]?.totalPlatformFee || 0),
      totalReturns: Number(returnsSummary.totalReturns || 0),
      activeReturns: Number(returnsSummary.activeReturns || 0),
      refundedToCustomers: Number(returnsSummary.refundedToCustomers || 0),
      refundsPending: Number(returnsSummary.refundsPending || 0),
    },
  });
};

export const getAdminCategories = async (_req, res) => {
  const {
    type,
    search,
    approvalStatus,
    tree,
    flat,
    page = 1,
    limit = 50,
  } = _req.query || {};

  const query = { type: { $ne: 'subcategory' } };
  if (type && String(tree) !== 'true') {
    const requestedType = String(type).trim().toLowerCase();
    if (requestedType === 'subcategory') {
      return res.json({
        success: true,
        result: { items: [], page: 1, limit: 0, total: 0 },
        results: [],
      });
    }
    query.type = requestedType;
  }
  if (search) query.name = { $regex: String(search).trim(), $options: 'i' };
  if (approvalStatus && approvalStatus !== 'all') query.approvalStatus = String(approvalStatus);

  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const perPage = String(tree) === 'true' ? 5000 : Math.max(1, Math.min(parseInt(limit, 10) || 50, 1000));

  const [categories, total] = await Promise.all([
    QuickCategory.find(query)
      .sort({ sortOrder: 1, createdAt: -1 })
      .skip(String(tree) === 'true' ? 0 : (currentPage - 1) * perPage)
      .limit(perPage)
      .lean(),
    QuickCategory.countDocuments(query),
  ]);

  const mapped = categories.map(toCategory);
  if (String(tree) === 'true') {
    let fullTree = buildCategoryTree(categories);
    if (type) {
      const originalCount = fullTree.length;
      fullTree = fullTree.filter(root => 
        !root.parentId && 
        (String(root.type).toLowerCase() === String(type).toLowerCase() || !root.type || root.type === 'default')
      );
    }
    return res.json({ success: true, results: fullTree });
  }
  if (String(flat) === 'true') {
    return res.json({ success: true, results: mapped });
  }

  return res.json({
    success: true,
    result: {
      items: mapped,
      page: currentPage,
      limit: perPage,
      total,
    },
    results: mapped,
  });
};

export const createCategory = async (req, res) => {
  const body = req.body || {};
  const {
    name,
    slug: slugInput,
    accentColor,
    sortOrder,
    description,
    type,
    status,
    approvalStatus,
    parentId,
    iconId,
    adminCommission,
    returnWindowDays,
  } = body;
  const image = await getCategoryImage(req);
  const resolvedType = String(type || 'header').trim().toLowerCase();

  if (resolvedType === 'subcategory') {
    return res.status(400).json({
      success: false,
      message: 'Sub-categories are disabled. Use header and main categories only.',
    });
  }

  if (!name) {
    return res.status(400).json({ success: false, message: 'name is required' });
  }

  if (resolvedType === 'header' && !String(iconId || '').trim()) {
    return res.status(400).json({ success: false, message: 'Icon is required for header categories' });
  }

  if (resolvedType === 'category' && !mongoose.isValidObjectId(parentId)) {
    return res.status(400).json({ success: false, message: 'Main category must belong to a header' });
  }

  const baseSlug = slugify(slugInput || name);
  if (!baseSlug) {
    return res.status(400).json({ success: false, message: 'Valid name or slug is required' });
  }
  const count = await QuickCategory.countDocuments({ slug: { $regex: `^${baseSlug}` } });
  const slug = count > 0 ? `${baseSlug}-${count + 1}` : baseSlug;
  const gstRate = resolvedType === 'header' ? resolveHeaderGstRate(body, 0) : 0;

  const category = await QuickCategory.create({
    name,
    slug,
    image: resolvedType === 'header' ? undefined : image,
    description: description || '',
    type: resolvedType === 'category' ? 'category' : 'header',
    status: status || 'active',
    approvalStatus: approvalStatus || 'approved',
    approvedAt: (approvalStatus || 'approved') === 'approved' ? new Date() : null,
    parentId: resolvedType === 'category' && mongoose.isValidObjectId(parentId) ? parentId : null,
    iconId: iconId || '',
    adminCommission: resolvedType === 'header' ? parseNumber(adminCommission, 0) : 0,
    handlingFees: gstRate,
    returnWindowDays: resolvedType === 'header' ? Math.max(0, Math.min(30, parseNumber(returnWindowDays, 3))) : 0,
    accentColor: accentColor || '#0c831f',
    sortOrder: Number(sortOrder || 0),
    isActive: (status || 'active') === 'active',
  });

  clearContentCache();
  return res.status(201).json({ success: true, result: toCategory(category) });
};

export const updateCategory = async (req, res) => {
  const category = await QuickCategory.findById(req.params.categoryId);
  if (!category) {
    return res.status(404).json({ success: false, message: 'Category not found' });
  }

  const image = await getCategoryImage(req);
  const body = req.body || {};
  const {
    name,
    slug,
    accentColor,
    sortOrder,
    description,
    type,
    status,
    approvalStatus,
    parentId,
    iconId,
    adminCommission,
    returnWindowDays,
  } = body;

  const nextType = type !== undefined ? String(type || 'header').trim().toLowerCase() : category.type;
  if (nextType === 'subcategory') {
    return res.status(400).json({
      success: false,
      message: 'Sub-categories are disabled. Use header and main categories only.',
    });
  }

  const prevActive = category.isActive !== false && String(category.status || 'active') === 'active';

  if (name !== undefined) category.name = name;
  if (slug !== undefined) category.slug = slugify(slug || name || category.name);
  if (image && nextType !== 'header') category.image = image;
  if (description !== undefined) category.description = description;
  if (type !== undefined) category.type = nextType === 'category' ? 'category' : 'header';
  if (status !== undefined) {
    category.status = String(status).trim().toLowerCase() === 'inactive' ? 'inactive' : 'active';
    category.isActive = category.status === 'active';
  }
  if (approvalStatus !== undefined) {
    category.approvalStatus = approvalStatus || 'pending';
    category.approvedAt = category.approvalStatus === 'approved' ? new Date() : null;
  }
  if (accentColor !== undefined) category.accentColor = accentColor || '#0c831f';
  if (sortOrder !== undefined) category.sortOrder = parseNumber(sortOrder, 0);
  if (parentId !== undefined) {
    category.parentId = category.type === 'category' && mongoose.isValidObjectId(parentId) ? parentId : null;
  }
  if (iconId !== undefined) category.iconId = iconId || '';
  if (category.type === 'header' && !String(category.iconId || '').trim()) {
    return res.status(400).json({ success: false, message: 'Icon is required for header categories' });
  }
  if (adminCommission !== undefined) category.adminCommission = parseNumber(adminCommission, 0);
  if (hasHeaderGstInput(body) && String(category.type) === 'header') {
    category.handlingFees = resolveHeaderGstRate(body, category.handlingFees || 0);
  }
  if (returnWindowDays !== undefined && String(category.type) === 'header') {
    category.returnWindowDays = Math.max(0, Math.min(30, parseNumber(returnWindowDays, 3)));
  }

  const nextActive = category.isActive !== false && String(category.status || 'active') === 'active';

  // Cannot activate a main category while its header is inactive
  if (!prevActive && nextActive && category.type === 'category' && category.parentId) {
    const header = await QuickCategory.findById(category.parentId).select('name status isActive').lean();
    const headerActive = header && header.isActive !== false && String(header.status || 'active') === 'active';
    if (!headerActive) {
      return res.status(400).json({
        success: false,
        message: `Header category${header?.name ? ` "${header.name}"` : ''} is inactive. Activate the header first.`,
      });
    }
  }

  await category.save();

  let cascade = null;
  if (prevActive !== nextActive) {
    cascade = await cascadeCategoryStatus(category, nextActive);
  }

  clearContentCache();

  return res.json({
    success: true,
    result: toCategory(category),
    cascade: cascade
      ? { productsUpdated: cascade.products?.modified || 0 }
      : undefined,
  });
};

export const removeCategory = async (req, res) => {
  const category = await QuickCategory.findById(req.params.categoryId).lean();
  if (!category) {
    return res.status(404).json({ success: false, message: 'Category not found' });
  }

  if (String(category.type || '') === 'subcategory') {
    await QuickCategory.findByIdAndDelete(category._id);
    clearContentCache();
    return res.json({ success: true, result: { deleted: true } });
  }

  const cascade = await cascadeDeleteCategory(category);
  clearContentCache();

  return res.json({
    success: true,
    result: {
      deleted: true,
      deletedMainCount: cascade.deletedMainCount || 0,
      productsInactivated: cascade.products?.modified || 0,
    },
  });
};

export const getAdminProducts = async (req, res) => {
  const {
    categoryId,
    category,
    search,
    status,
    approvalStatus,
    businessType,
    page = 1,
    limit = 50,
  } = req.query || {};
  const query = {};

  const categoryFilter = categoryId || category;
  if (categoryFilter && mongoose.isValidObjectId(categoryFilter)) {
    query.$or = [
      { categoryId: categoryFilter },
      { subcategoryId: categoryFilter },
      { headerId: categoryFilter },
    ];
  }
  
  if (businessType && businessType !== 'all') {
    const headers = await QuickCategory.find({
      type: 'header',
      businessType,
    }).select('_id');
    query.headerId = { $in: headers.map(h => h._id) };
  }

  if (search) query.name = { $regex: String(search).trim(), $options: 'i' };
  if (status && status !== 'all') {
    query.status = status;
    query.isActive = status === 'active';
  }
  if (approvalStatus && approvalStatus !== 'all') query.approvalStatus = approvalStatus;

  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const perPage = Math.max(1, Math.min(parseInt(limit, 10) || 50, 100));

  const [products, total] = await Promise.all([
    QuickProduct.find(query)
      .populate('headerId categoryId subcategoryId', 'name slug businessType type')
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * perPage)
      .limit(perPage)
      .lean(),
    QuickProduct.countDocuments(query),
  ]);
  const sellerMap = await buildProductSellerMap(products);

  return res.json({
    success: true,
    result: {
      items: products.map((product) => toProduct(withProductSeller(product, sellerMap))),
      page: currentPage,
      limit: perPage,
      total,
    },
  });
};

export const getAdminProductById = async (req, res) => {
  const productId = String(req.params.productId || '').trim();

  if (!mongoose.isValidObjectId(productId)) {
    return res.status(400).json({ success: false, message: 'Invalid product id' });
  }

  const product = await QuickProduct.findById(productId)
    .populate('headerId categoryId subcategoryId', 'name slug businessType type')
    .lean();

  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  const sellerMap = await buildProductSellerMap([product]);

  return res.json({
    success: true,
    result: toProduct(withProductSeller(product, sellerMap)),
  });
};

export const createProduct = async (req, res) => {
  const {
    name,
    categoryId,
    subcategoryId,
    headerId,
    price,
    mrp,
    salePrice,
    unit,
    badge,
    description,
    stock,
    lowStockAlert,
    packingAmount,
    status,
    approvalStatus,
    brand,
    weight,
    sku,
    tags,
    isFeatured,
    deliveryTime,
    variants,
  } = req.body || {};
  const images = await getProductImages(req);

  if (!name || !categoryId || !mongoose.isValidObjectId(categoryId)) {
    return res.status(400).json({ success: false, message: 'name and valid categoryId are required' });
  }

  const category = await QuickCategory.findById(categoryId).lean();
  if (!category) {
    return res.status(404).json({ success: false, message: 'Category not found' });
  }

  const baseSlug = slugify(name);
  const count = await QuickProduct.countDocuments({ slug: { $regex: `^${baseSlug}` } });
  const slug = count > 0 ? `${baseSlug}-${count + 1}` : baseSlug;

  const parsedVariants = parseVariants(variants);
  let calculatedStock = parseNumber(stock, 0);
  if (parsedVariants && parsedVariants.length > 0) {
    const isDefaultVariantOnly = parsedVariants.length === 1 && String(parsedVariants[0].name || "").trim() === "Default";
    if (isDefaultVariantOnly) {
       parsedVariants[0].stock = calculatedStock;
    } else {
       calculatedStock = parsedVariants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
    }
  }

  const product = await QuickProduct.create({
    name,
    slug,
    image: images.image,
    mainImage: images.mainImage,
    galleryImages: images.galleryImages,
    categoryId,
    subcategoryId: null,
    headerId: mongoose.isValidObjectId(headerId) ? headerId : null,
    description: description || '',
    price: Number(price || 0),
    mrp: Number(mrp || salePrice || price || 0),
    salePrice: Number(salePrice || 0),
    unit: unit || '',
    weight: weight || '',
    brand: brand || '',
    sku: sku || '',
    stock: calculatedStock,
    lowStockAlert: parseNumber(lowStockAlert, 5),
    packingAmount: Math.max(0, parseNumber(packingAmount, 0)),
    status: status || 'active',
    approvalStatus: approvalStatus || 'approved',
    approvedAt: (approvalStatus || 'approved') === 'approved' ? new Date() : null,
    isFeatured: parseBool(isFeatured, false),
    tags: String(tags || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    variants: parsedVariants,
    deliveryTime: deliveryTime || '10 mins',
    badge: badge || '',
    isActive: (status || 'active') === 'active',
  });

  clearContentCache();
  return res.status(201).json({ success: true, result: toProduct(product) });
};

export const updateProduct = async (req, res) => {
  const product = await QuickProduct.findById(req.params.productId);
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  const images = await getProductImages(req);
  const body = req.body || {};

  if (body.name !== undefined) product.name = body.name;
  if (body.slug !== undefined || body.name !== undefined) {
    product.slug = slugify(body.slug || body.name || product.name);
  }
  if (body.categoryId && mongoose.isValidObjectId(body.categoryId)) product.categoryId = body.categoryId;
  product.subcategoryId = null;
  if (body.headerId !== undefined) product.headerId = mongoose.isValidObjectId(body.headerId) ? body.headerId : null;
  if (body.description !== undefined) product.description = body.description;
  if (body.price !== undefined) product.price = parseNumber(body.price, product.price);
  if (body.mrp !== undefined || body.salePrice !== undefined || body.price !== undefined) {
    product.mrp = parseNumber(body.mrp, parseNumber(body.salePrice, parseNumber(body.price, product.mrp)));
  }
  if (body.salePrice !== undefined) product.salePrice = parseNumber(body.salePrice, 0);
  if (body.unit !== undefined) product.unit = body.unit || '';
  if (body.weight !== undefined) product.weight = body.weight || '';
  if (body.brand !== undefined) product.brand = body.brand || '';
  if (body.sku !== undefined) product.sku = body.sku || '';
  if (body.stock !== undefined) product.stock = parseNumber(body.stock, 0);
  if (body.lowStockAlert !== undefined) product.lowStockAlert = parseNumber(body.lowStockAlert, 5);
  if (body.packingAmount !== undefined) {
    product.packingAmount = Math.max(0, parseNumber(body.packingAmount, 0));
  }
  if (body.status !== undefined) {
    product.status = body.status || 'active';
    product.isActive = product.status === 'active';
  }
  if (body.approvalStatus !== undefined) {
    product.approvalStatus = body.approvalStatus || 'pending';
    product.approvedAt = product.approvalStatus === 'approved' ? new Date() : null;
  }
  if (body.isFeatured !== undefined) product.isFeatured = parseBool(body.isFeatured, false);
  if (body.tags !== undefined) {
    product.tags = String(body.tags || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  if (body.variants !== undefined) {
    product.variants = parseVariants(body.variants);
  }
  if (product.variants && product.variants.length > 0) {
    const isDefaultVariantOnly = product.variants.length === 1 && String(product.variants[0].name || "").trim() === "Default";
    if (isDefaultVariantOnly) {
       product.variants[0].stock = product.stock;
    } else {
       product.stock = product.variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
    }
  }
  if (body.deliveryTime !== undefined) product.deliveryTime = body.deliveryTime || '10 mins';
  if (body.badge !== undefined) product.badge = body.badge || '';
  if (images.mainImage) {
    product.mainImage = images.mainImage;
    product.image = images.image;
  }
  if (Array.isArray(images.galleryImages) && images.galleryImages.length > 0) {
    product.galleryImages = images.galleryImages;
  }

  await product.save();
  clearContentCache();
  const populated = await QuickProduct.findById(product._id)
    .populate('headerId categoryId subcategoryId', 'name slug businessType type')
    .lean();
  const sellerMap = await buildProductSellerMap([populated]);
  return res.json({ success: true, result: toProduct(withProductSeller(populated, sellerMap)) });
};

export const removeProduct = async (req, res) => {
  await QuickProduct.findByIdAndDelete(req.params.productId);
  clearContentCache();
  return res.json({ success: true, result: { deleted: true } });
};

export const getAdminOrders = async (req, res) => {
  const { status, page = 1, limit = 50 } = req.query || {};
  const query = { orderType: { $in: ['quick', 'mixed'] } };
  if (status && status !== 'all') {
    switch (status) {
      case 'pending':
        query.$or = [
          { orderStatus: 'pending' },
          { workflowStatus: { $in: ['CREATED', 'SELLER_PENDING'] } },
        ];
        break;
      case 'processed':
        query.$or = [
          { orderStatus: { $in: ['confirmed', 'packed'] } },
          { workflowStatus: { $in: ['SELLER_ACCEPTED', 'DELIVERY_SEARCH', 'DELIVERY_ASSIGNED', 'PICKUP_READY'] } },
        ];
        break;
      case 'cancelled':
        query.orderStatus = { $in: QUICK_CANCELLED_STATUSES };
        break;
      case 'out-for-delivery':
        query.$or = [
          { orderStatus: 'out_for_delivery' },
          { workflowStatus: 'OUT_FOR_DELIVERY' },
        ];
        break;
      case 'delivered':
        query.$or = [
          { orderStatus: 'delivered' },
          { workflowStatus: 'DELIVERED' },
        ];
        break;
      case 'returned':
        // Filter server-side so pagination and totals reflect returns only.
        query.returnStatus = { $nin: ['', 'none', null] };
        break;
      default:
        break;
    }
  }

  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const perPage = Math.max(1, Math.min(parseInt(limit, 10) || 50, 200));
  const [orders, total] = await Promise.all([
    QuickOrder.find(query)
      .populate('userId', 'name phone email')
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * perPage)
      .limit(perPage)
      .lean(),
    QuickOrder.countDocuments(query),
  ]);

  const sellerIds = [...new Set(
    orders.flatMap(order => 
      (order.items || [])
        .filter(item => item.type === 'quick')
        .map(item => String(item.sourceId))
    )
  )].filter(id => mongoose.Types.ObjectId.isValid(id));

  const sellers = await Seller.find({ _id: { $in: sellerIds } })
    .select('_id shopName name shopInfo.businessType')
    .lean();

  const sellerOrders = await SellerOrder.find({ orderId: { $in: orders.map((order) => order.orderId).filter(Boolean) } })
    .select('_id orderId status workflowStatus customer address cancellationReason pricing')
    .lean();

  const sellerMap = sellers.reduce((acc, s) => {
    acc[String(s._id)] = s;
    return acc;
  }, {});

  const sellerOrderMap = sellerOrders.reduce((acc, sellerOrder) => {
    acc[String(sellerOrder.orderId)] = sellerOrder;
    return acc;
  }, {});

  const orderReturns = await SellerReturn.find({
    orderId: { $in: orders.map((order) => order.orderId).filter(Boolean) },
  })
    .select(
      'orderId returnStatus refundStatus refundMethod returnReason returnRefundAmount finance returnItems returnRequestedAt refundReference refundTransactionId',
    )
    .lean();

  const returnMap = orderReturns.reduce((acc, row) => {
    acc[String(row.orderId)] = row;
    return acc;
  }, {});

  const riderIds = [...new Set(
    orders
      .map((order) => order?.dispatch?.deliveryPartnerId)
      .filter(Boolean)
      .map((id) => String(id)),
  )].filter((id) => mongoose.Types.ObjectId.isValid(id));

  const riders = riderIds.length
    ? await Driver.find({ _id: { $in: riderIds } })
      .select('_id name phone vehicleType vehicleNumber')
      .lean()
    : [];
  const riderMap = riders.reduce((acc, rider) => {
    acc[String(rider._id)] = rider;
    return acc;
  }, {});

  return res.json({
    success: true,
    result: {
      items: orders.map((order) =>
        buildQuickAdminOrderResponse(order, sellerMap, sellerOrderMap, riderMap, returnMap),
      ),
      page: currentPage,
      limit: perPage,
      total,
    },
  });
};

export const getAdminOrderById = async (req, res) => {
  const rawOrderId = String(req.params.orderId || '').trim();

  if (!rawOrderId) {
    return res.status(400).json({ success: false, message: 'orderId is required' });
  }

  const query = {
    orderType: { $in: ['quick', 'mixed'] },
    $or: [
      { orderId: rawOrderId },
      ...(mongoose.isValidObjectId(rawOrderId) ? [{ _id: rawOrderId }] : []),
    ],
  };

  const order = await QuickOrder.findOne(query).populate('userId', 'name phone email profileImage').lean();
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  const quickItems = Array.isArray(order.items) ? order.items.filter((item) => item?.type === 'quick') : [];
  const sellerIds = [...new Set(quickItems.map((item) => String(item?.sourceId || '')).filter(Boolean))].filter((id) => mongoose.Types.ObjectId.isValid(id));
  const riderId = order?.dispatch?.deliveryPartnerId
    ? String(order.dispatch.deliveryPartnerId)
    : '';
  const [sellers, sellerOrders, riders] = await Promise.all([
    Seller.find({ _id: { $in: sellerIds } })
      .select('_id shopName name phone email location address shopInfo')
      .lean(),
    SellerOrder.find({ orderId: order.orderId }).select('_id orderId status workflowStatus customer address cancellationReason pricing').lean(),
    riderId && mongoose.Types.ObjectId.isValid(riderId)
      ? Driver.find({ _id: riderId }).select('_id name phone vehicleType vehicleNumber').lean()
      : Promise.resolve([]),
  ]);

  const sellerMap = sellers.reduce((acc, seller) => {
    acc[String(seller._id)] = seller;
    return acc;
  }, {});
  const sellerOrderMap = sellerOrders.reduce((acc, sellerOrder) => {
    acc[String(sellerOrder.orderId)] = sellerOrder;
    return acc;
  }, {});
  const riderMap = (riders || []).reduce((acc, rider) => {
    acc[String(rider._id)] = rider;
    return acc;
  }, {});

  // Older cancels wiped restaurantCommission — restore display commission from seller leg or recompute.
  let sellerOrderDoc = sellerOrderMap[String(order.orderId)] || null;
  const parentCommission = Number(order?.pricing?.restaurantCommission || 0);
  const legCommission = Number(sellerOrderDoc?.pricing?.commission || 0);
  if (parentCommission <= 0 && legCommission <= 0 && sellerOrderDoc?.sellerId) {
    try {
      const { resolveQuickSellerCommissionAmount } = await import(
        '../admin/services/commission.service.js'
      );
      const quickItems = Array.isArray(order.items)
        ? order.items.filter((item) => item?.type === 'quick')
        : [];
      const subtotal = quickItems.reduce(
        (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
        0,
      );
      const recomputed = await resolveQuickSellerCommissionAmount(
        sellerOrderDoc.sellerId,
        subtotal,
        quickItems,
      );
      if (recomputed > 0) {
        order.pricing = order.pricing || {};
        order.pricing.restaurantCommission = recomputed;
        if (sellerOrderDoc.pricing) {
          sellerOrderDoc = {
            ...sellerOrderDoc,
            pricing: { ...sellerOrderDoc.pricing, commission: recomputed },
          };
          sellerOrderMap[String(order.orderId)] = sellerOrderDoc;
        }
      }
    } catch (_) {
      /* ignore recompute failures */
    }
  } else if (parentCommission <= 0 && legCommission > 0) {
    order.pricing = order.pricing || {};
    order.pricing.restaurantCommission = legCommission;
  }

  const detailReturn = await SellerReturn.findOne({ orderId: order.orderId }).lean();
  const detailReturnMap = detailReturn
    ? { [String(detailReturn.orderId)]: detailReturn }
    : {};

  return res.json({
    success: true,
    result: buildQuickAdminOrderResponse(
      order,
      sellerMap,
      sellerOrderMap,
      riderMap,
      detailReturnMap,
    ),
  });
};

export const getAdminCustomers = async (req, res) => {
  const { page = 1, limit = 50, search = '' } = req.query || {};
  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const perPage = Math.max(1, Math.min(parseInt(limit, 10) || 50, 200));
  const skip = (currentPage - 1) * perPage;
  const normalizedSearch = String(search || '').trim().toLowerCase();

  const filter = { role: 'USER' };
  if (normalizedSearch) {
    filter.$or = [
      { name: { $regex: normalizedSearch, $options: 'i' } },
      { email: { $regex: normalizedSearch, $options: 'i' } },
      { phone: { $regex: normalizedSearch, $options: 'i' } }
    ];
  }

  const [users, total] = await Promise.all([
    FoodUser.find(filter)
      .select('_id name email phone profileImage isActive createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(perPage)
      .lean(),
    FoodUser.countDocuments(filter)
  ]);

  const userIds = users.map(u => u._id);
  const orders = await QuickOrder.find({ 
    userId: { $in: userIds },
    orderType: { $in: ['quick', 'mixed'] } 
  }).select('userId pricing createdAt').lean();

  const customerMap = new Map();
  users.forEach(u => {
    const name = u.name || 'Customer';
    customerMap.set(String(u._id), {
      id: String(u._id),
      name: name,
      email: u.email || '',
      phone: u.phone || '',
      avatar: u.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
      status: u.isActive === false ? 'inactive' : 'active',
      totalOrders: 0,
      totalSpent: 0,
      joinedDate: u.createdAt,
      lastOrderDate: null
    });
  });

  orders.forEach(order => {
    const customer = customerMap.get(String(order.userId));
    if (customer) {
      const pricingTotal = Number(order.pricing?.total || 0);
      const payableTotal = Math.max(pricingTotal, Number(order.payment?.amountDue || 0));

      customer.totalOrders += 1;
      customer.totalSpent += payableTotal;
      if (!customer.lastOrderDate || new Date(order.createdAt) > new Date(customer.lastOrderDate)) {
        customer.lastOrderDate = order.createdAt;
      }
    }
  });

  return res.json({
    success: true,
    result: {
      items: Array.from(customerMap.values()),
      page: currentPage,
      limit: perPage,
      total
    }
  });
};

export const getAdminCustomerById = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ success: false, message: 'Invalid customer ID' });
  }

  const user = await FoodUser.findById(id).lean();
  if (!user) {
    return res.status(404).json({ success: false, message: 'Customer not found' });
  }

  const orders = await QuickOrder.find({
    userId: user._id,
    orderType: { $in: ['quick', 'mixed'] }
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const totalSpent = orders
    .filter(o => o.orderStatus === 'delivered')
    .reduce((sum, o) => {
        const pricingTotal = Number(o.pricing?.total || 0);
        return sum + Math.max(pricingTotal, Number(o.payment?.amountDue || 0));   }, 0);

  const name = user.name || 'Customer';
  const result = {
    id: String(user._id),
    name: name,
    email: user.email || '',
    phone: user.phone || '',
    avatar: user.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
    status: user.isActive === false ? 'inactive' : 'active',
    joinedDate: user.createdAt,
    totalOrders: orders.length,
    totalSpent,
    lastOrderDate: orders[0]?.createdAt || null,
    addresses: (user.addresses || []).map(addr => ({
      id: addr._id,
      label: addr.label,
      fullAddress: `${addr.street}, ${addr.city}, ${addr.state} - ${addr.zipCode}`,
      city: addr.city,
      state: addr.state,
      pincode: addr.zipCode,
      isDefault: addr.isDefault
    })),
    recentOrders: orders.slice(0, 10).map(o => {
      const pricingTotal = Number(o.pricing?.total || 0);
      const payableTotal = Math.max(pricingTotal, Number(o.payment?.amountDue || 0));

      return {
        id: `#${o.orderId || o._id}`,
        date: o.createdAt,
        status: legacyQuickStatusFromOrder(o),
        amount: payableTotal,
        itemsCount: o.items?.length || 0
      };
    })
  };

  return res.json({
    success: true,
    result
  });
};

export const deleteAdminOrder = async (req, res) => {
  const rawOrderId = String(req.params.orderId || '').trim();

  if (!rawOrderId) {
    return res.status(400).json({ success: false, message: 'orderId is required' });
  }

  const orderQuery = {
    orderType: { $in: ['quick', 'mixed'] },
    $or: [
      { orderId: rawOrderId },
      ...(mongoose.isValidObjectId(rawOrderId) ? [{ _id: rawOrderId }] : []),
    ],
  };

  const order = await QuickOrder.findOne(orderQuery).lean();
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  const linkedSellerOrders = await SellerOrder.find({ orderId: order.orderId })
    .select('_id sellerId orderId')
    .lean();

  await Promise.all([
    QuickOrder.deleteOne({ _id: order._id }),
    SellerOrder.deleteMany({ orderId: order.orderId }),
  ]);

  try {
    const io = getIO();
    if (io) {
      const payload = {
        orderId: order.orderId,
        orderMongoId: order._id?.toString?.() || '',
        message: 'Order deleted by admin',
      };

      if (order.userId) {
        io.to(rooms.user(order.userId)).emit('order_deleted', payload);
      }
      io.to(rooms.tracking(order.orderId)).emit('order_deleted', payload);

      linkedSellerOrders.forEach((sellerOrder) => {
        if (!sellerOrder?.sellerId) return;
        io.to(rooms.seller(sellerOrder.sellerId)).emit('order_deleted', {
          ...payload,
          sellerOrderId: sellerOrder._id?.toString?.() || '',
        });
      });

      if (order.dispatch?.deliveryPartnerId) {
        io.to(rooms.delivery(order.dispatch.deliveryPartnerId)).emit('order_deleted', payload);
      }
    }
  } catch {
    // best-effort realtime cleanup
  }

  return res.json({
    success: true,
    result: {
      deleted: true,
      orderId: order.orderId,
      sellerOrdersDeleted: linkedSellerOrders.length,
    },
  });
};

export const getAdminSellerById = async (req, res) => {
  const { sellerId } = req.params;
  const seller = await Seller.findById(sellerId).lean();

  if (!seller) {
    return res.status(404).json({ success: false, message: 'Seller not found' });
  }

  const [productCount, zoneTypeMap] = await Promise.all([
    QuickProduct.countDocuments({
      sellerId: seller._id,
      $or: [{ isActive: true }, { isActive: { $exists: false } }],
    }),
    buildSellerZoneTypeMap([seller]),
  ]);

  const zoneId = String(seller?.shopInfo?.zoneId || '').trim();
  return res.json({
    success: true,
    result: toSellerRequest(seller, {
      productCount,
      zoneType: zoneTypeMap[zoneId] || '',
    }),
  });
};

export const getAdminSellerRequests = async (req, res) => {
  const {
    status = 'pending',
    page = 1,
    limit = 50,
    search = '',
    zoneType: zoneTypeFilter,
  } = req.query || {};
  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const perPage = Math.max(1, Math.min(parseInt(limit, 10) || 50, 100));
  const query = {};

  if (status === 'pending') query.approvalStatus = 'pending';
  else if (status === 'approved') query.approvalStatus = 'approved';
  else if (status === 'rejected') query.approvalStatus = 'rejected';
  else if (status === 'draft') query.approvalStatus = 'draft';
  else if (status === 'review_queue') {
    query.$or = [
      { approvalStatus: { $in: ['pending', 'rejected'] } },
      { 'pendingProfileChanges.hasPendingUpdate': true },
    ];
  }

  // Include Admin Hub sellers in queues — they must complete onboarding + admin approval.

  const searchText = String(search || '').trim();
  if (searchText) {
    const searchClause = [
      { name: { $regex: searchText, $options: 'i' } },
      { shopName: { $regex: searchText, $options: 'i' } },
      { email: { $regex: searchText, $options: 'i' } },
      { phone: { $regex: searchText, $options: 'i' } },
    ];
    if (query.$or) {
      query.$and = [{ $or: query.$or }, { $or: searchClause }];
      delete query.$or;
    } else {
      query.$or = searchClause;
    }
  }

  const parsedZoneType = normalizeZoneType(zoneTypeFilter, '');
  if (parsedZoneType) {
    const matchingZones = await QuickZone.find({ zoneType: parsedZoneType })
      .select('_id')
      .lean();
    const zoneIds = matchingZones.map((z) => z._id);
    query['shopInfo.zoneId'] = { $in: zoneIds.length ? zoneIds : [null] };
  }

  const [items, total] = await Promise.all([
    Seller.find(query)
      .sort(
        status === 'review_queue'
          ? { 'pendingProfileChanges.requestedAt': -1, rejectedAt: -1, updatedAt: -1, createdAt: -1 }
          : { createdAt: -1 },
      )
      .skip((currentPage - 1) * perPage)
      .limit(perPage)
      .lean(),
    Seller.countDocuments(query),
  ]);

  const sellerIds = items.map((s) => s._id).filter(Boolean);
  const productCountBySeller = new Map();
  const zoneTypeMap = await buildSellerZoneTypeMap(items);
  if (sellerIds.length) {
    const counts = await QuickProduct.aggregate([
      {
        $match: {
          sellerId: { $in: sellerIds },
          $or: [{ isActive: true }, { isActive: { $exists: false } }],
        },
      },
      { $group: { _id: '$sellerId', count: { $sum: 1 } } },
    ]);
    counts.forEach((row) => {
      productCountBySeller.set(String(row._id), Number(row.count) || 0);
    });
  }

  return res.json({
    success: true,
    result: {
      items: items.map((seller) => {
        const zoneId = String(seller?.shopInfo?.zoneId || '').trim();
        return toSellerRequest(seller, {
          productCount: productCountBySeller.get(String(seller._id)) || 0,
          zoneType: zoneTypeMap[zoneId] || '',
        });
      }),
      page: currentPage,
      limit: perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    },
  });
};

export const approveAdminSellerRequest = async (req, res) => {
  const { sellerId } = req.params;
  const seller = await Seller.findById(sellerId);

  if (!seller) {
    return res.status(404).json({ success: false, message: 'Seller request not found' });
  }

  const isProfileReapproval =
    seller.approvalStatus === 'approved' &&
    seller.pendingProfileChanges?.hasPendingUpdate === true;

  if (isProfileReapproval) {
    const applyUpdate = buildApplySellerPendingProfileChanges(seller.pendingProfileChanges);
    const updated = await Seller.findByIdAndUpdate(sellerId, applyUpdate, {
      new: true,
      runValidators: false,
    });

    await upsertSellerNotification(updated._id, {
      key: `profile-update:${String(updated._id)}:approved`,
      type: 'system',
      title: 'Profile update approved',
      message: 'Your requested profile changes are now live.',
      link: '/seller/profile',
    });

    return res.json({
      success: true,
      message: 'Seller profile update approved',
      result: toSellerRequest(updated),
    });
  }

  // External sellers cannot be approved into Single Vendor zones.
  // Admin Hub sellers are the intended SV operator — skip this gate for them.
  const zoneId = seller.shopInfo?.zoneId;
  const zoneSource = seller.shopInfo?.zoneSource || 'quick';
  if (seller.isAdminHub !== true && zoneId && zoneSource !== 'food') {
    try {
      await assertSellerCanJoinZone(zoneId, { zoneSource });
    } catch (error) {
      return res.status(error.status || 400).json({
        success: false,
        message: error.message || 'Seller cannot be approved for this zone',
        code: error.code || 'ZONE_FORBIDDEN',
      });
    }
  }

  seller.approved = true;
  seller.approvalStatus = 'approved';
  seller.onboardingSubmitted = true;
  seller.wasEverApproved = true;
  seller.wasPreviouslyRejected = false;
  seller.lastRejectionReason = '';
  seller.approvedAt = new Date();
  seller.rejectedAt = null;
  seller.approvalNotes = String(req.body?.approvalNotes || '').trim();
  await seller.save();

  await upsertSellerNotification(seller._id, {
    key: `onboarding:${String(seller._id)}:decision`,
    type: 'system',
    title: 'Your store is approved',
    message: seller.approvalNotes
      ? `Your seller account is approved and live. Note from our team: ${seller.approvalNotes}`
      : 'Your seller account is approved. You can start adding products and taking orders.',
    link: '/seller',
  });

  return res.json({
    success: true,
    message: 'Seller approved successfully',
    result: toSellerRequest(seller),
  });
};

export const rejectAdminSellerRequest = async (req, res) => {
  const { sellerId } = req.params;
  const seller = await Seller.findById(sellerId);

  if (!seller) {
    return res.status(404).json({ success: false, message: 'Seller request not found' });
  }

  const reason = String(req.body?.approvalNotes || req.body?.reason || '').trim();
  const isProfileReapproval =
    seller.approvalStatus === 'approved' &&
    seller.pendingProfileChanges?.hasPendingUpdate === true;

  if (isProfileReapproval) {
    const discardUpdate = buildDiscardSellerPendingProfileChanges();
    const updated = await Seller.findByIdAndUpdate(
      sellerId,
      { $unset: discardUpdate.$unset },
      { new: true, runValidators: false },
    );

    await upsertSellerNotification(updated._id, {
      key: `profile-update:${String(updated._id)}:rejected`,
      type: 'system',
      title: 'Profile update rejected',
      message: reason
        ? `Your requested profile changes were rejected. Reason: ${reason}`
        : 'Your requested profile changes were rejected. Your current approved details remain active.',
      link: '/seller/profile',
    });

    return res.json({
      success: true,
      message: 'Seller profile update rejected',
      result: toSellerRequest(updated),
    });
  }

  seller.approved = false;
  seller.approvalStatus = 'rejected';
  seller.onboardingSubmitted = true;
  seller.approvedAt = null;
  seller.rejectedAt = new Date();
  seller.wasPreviouslyRejected = true;
  seller.lastRejectionReason = reason;
  seller.approvalNotes = reason;
  await seller.save();

  await upsertSellerNotification(seller._id, {
    key: `onboarding:${String(seller._id)}:decision`,
    type: 'system',
    title: 'Your application needs changes',
    message: seller.approvalNotes
      ? `Your seller application was rejected. Reason: ${seller.approvalNotes}`
      : 'Your seller application was rejected. Please review your details and submit again.',
    link: '/seller/onboarding',
  });

  return res.json({
    success: true,
    message: 'Seller request rejected',
    result: toSellerRequest(seller),
  });
};

export const getAdminZones = async (req, res) => {
  const { search, page = 1, limit = 50, zoneType } = req.query || {};
  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const perPage = Math.max(1, Math.min(parseInt(limit, 10) || 50, 1000));
  const filter = {};

  if (search) {
    filter.$or = [
      { name: { $regex: String(search).trim(), $options: 'i' } },
      { zoneName: { $regex: String(search).trim(), $options: 'i' } },
      { serviceLocation: { $regex: String(search).trim(), $options: 'i' } },
    ];
  }

  if (zoneType) {
    const parsedType = normalizeZoneType(zoneType, '');
    if (parsedType) filter.zoneType = parsedType;
  }

  const [zones, total] = await Promise.all([
    QuickZone.find(filter)
      .select(ZONE_SELECT_ADMIN)
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * perPage)
      .limit(perPage)
      .lean(),
    QuickZone.countDocuments(filter),
  ]);

  return res.json({
    success: true,
    data: {
      zones: zones.map((zone) => mapZoneDto(zone)),
      total,
      page: currentPage,
      limit: perPage,
    },
  });
};

/**
 * Public zones for Seller Panel — Multi Vendor only by default.
 * Pass includeSingle=true to include Single Vendor zones (not for seller onboarding).
 */
export const listPublicZones = async (req, res) => {
  const includeSingle =
    req.query?.includeSingle === '1' || req.query?.includeSingle === 'true';

  const filter = { isActive: true };
  // Existing zones without zoneType are treated as multi_vendor ($ne still matches missing).
  if (!includeSingle) {
    filter.zoneType = { $ne: ZONE_TYPE.SINGLE };
  }

  const zones = await QuickZone.find(filter)
    .select(ZONE_SELECT_PUBLIC)
    .sort({ createdAt: 1 })
    .lean();

  return res.json({
    success: true,
    message: 'Zones fetched successfully',
    data: {
      zones: zones.map((zone) => mapZoneDto(zone)),
    },
  });
};

export const getAdminZoneById = async (req, res) => {
  const zone = await QuickZone.findById(req.params.zoneId).select(ZONE_SELECT_ADMIN).lean();
  if (!zone) {
    return res.status(404).json({ success: false, message: 'Zone not found' });
  }

  const hub = zone.adminHubSellerId
    ? await Seller.findById(zone.adminHubSellerId)
        .select('_id name shopName phone phoneLast10 isActive approvalStatus isAdminHub')
        .lean()
    : null;

  return res.json({
    success: true,
    data: {
      zone: mapZoneDto(zone),
      adminHub: mapAdminHubDto(hub),
    },
  });
};

export const getAdminHub = async (_req, res) => {
  // Admin Hub is per-zone (unique phone each time) — not a reusable platform singleton.
  return res.json({
    success: true,
    data: {
      exists: false,
      adminHub: null,
      perZone: true,
      message:
        'Admin Hub is created per zone with a unique mobile number. Complete Seller Panel onboarding before access.',
      storage: {
        collection: 'quick_sellers',
        isAdminHub: true,
      },
    },
  });
};

export const createAdminZone = async (req, res) => {
  try {
    const body = req.body || {};
    const name =
      typeof body.name === 'string'
        ? body.name.trim()
        : (body.zoneName && String(body.zoneName).trim()) || '';
    const coordinates = Array.isArray(body.coordinates) ? body.coordinates : [];

    if (!name) {
      return res.status(400).json({ success: false, message: 'Zone name is required' });
    }

    if (coordinates.length < 3) {
      return res.status(400).json({ success: false, message: 'Zone must have at least 3 coordinates' });
    }

    // Single Vendor → hub required. Multi Vendor → hub only if adminHubEnabled.
    const hubConfig = await resolveZoneHubConfig({
      zoneType: body.zoneType,
      adminHubEnabled: body.adminHubEnabled,
      useExistingAdminHub: false,
      adminHubSellerId: null,
      adminHubPhone: body.adminHubPhone || body.adminHub?.phone || body.hubPhone,
      adminHubShopName:
        body.adminHubShopName || body.adminHub?.shopName || body.hubShopName,
      adminHubName: body.adminHubName || body.adminHub?.name || body.hubName,
    });

    // Persist normalized zoneType only (single_vendor | multi_vendor)
    const zone = await QuickZone.create({
      name,
      zoneName: body.zoneName && String(body.zoneName).trim() ? String(body.zoneName).trim() : name,
      country: body.country ? String(body.country).trim() : 'India',
      serviceLocation: body.serviceLocation ? String(body.serviceLocation).trim() : name,
      unit: body.unit === 'miles' ? 'miles' : 'kilometer',
      isActive: body.isActive !== false,
      zoneType: hubConfig.zoneType,
      adminHubEnabled: hubConfig.adminHubEnabled === true,
      adminHubSellerId: hubConfig.adminHubSellerId || null,
      coordinates: coordinates.map((coord) => ({
        latitude: Number(coord?.latitude ?? coord?.lat),
        longitude: Number(coord?.longitude ?? coord?.lng),
      })),
    });

    if (hubConfig.adminHubEnabled && hubConfig.adminHubSellerId) {
      await bindAdminHubToZone(hubConfig.adminHubSellerId, zone);
    }

    const hub = hubConfig.adminHubSellerId
      ? await Seller.findById(hubConfig.adminHubSellerId)
          .select('_id name shopName phone phoneLast10 isActive approvalStatus isAdminHub')
          .lean()
      : null;

    return res.status(201).json({
      success: true,
      data: {
        zone: mapZoneDto(zone.toObject ? zone.toObject() : zone),
        adminHub: mapAdminHubDto(hub),
      },
    });
  } catch (error) {
    return res.status(error.status || 400).json({
      success: false,
      message: error.message || 'Failed to create zone',
      code: error.code || 'ZONE_CREATE_FAILED',
    });
  }
};

export const updateAdminZone = async (req, res) => {
  try {
    const zone = await QuickZone.findById(req.params.zoneId);
    if (!zone) {
      return res.status(404).json({ success: false, message: 'Zone not found' });
    }

    const body = req.body || {};
    if (body.name !== undefined) zone.name = String(body.name || '').trim();
    if (body.zoneName !== undefined) zone.zoneName = String(body.zoneName || '').trim();
    if (body.country !== undefined) zone.country = String(body.country || '').trim() || 'India';
    if (body.serviceLocation !== undefined) {
      zone.serviceLocation = String(body.serviceLocation || '').trim();
    }
    if (body.unit !== undefined) zone.unit = body.unit === 'miles' ? 'miles' : 'kilometer';
    if (body.isActive !== undefined) zone.isActive = body.isActive !== false;
    if (Array.isArray(body.coordinates) && body.coordinates.length >= 3) {
      zone.coordinates = body.coordinates.map((coord) => ({
        latitude: Number(coord?.latitude ?? coord?.lat),
        longitude: Number(coord?.longitude ?? coord?.lng),
      }));
    }
    if (!zone.zoneName) zone.zoneName = zone.name;
    if (!zone.serviceLocation) zone.serviceLocation = zone.name;

    // Zone type is immutable after create
    const lockedType = normalizeZoneType(zone.zoneType, ZONE_TYPE.MULTI);
    if (body.zoneType !== undefined) {
      const requestedType = normalizeZoneType(body.zoneType, lockedType);
      if (requestedType !== lockedType) {
        return res.status(400).json({
          success: false,
          message: 'Zone type cannot be changed after creation',
          code: 'ZONE_TYPE_LOCKED',
        });
      }
    }

    const hubChanging =
      body.adminHubEnabled !== undefined ||
      body.useExistingAdminHub !== undefined ||
      body.adminHubSellerId !== undefined ||
      body.adminHubPhone !== undefined ||
      body.adminHub !== undefined ||
      body.hubPhone !== undefined ||
      body.adminHubMode !== undefined;

    let conversion = null;

    if (hubChanging) {
      const hubConfig = await resolveZoneHubConfig({
        zoneType: lockedType,
        adminHubEnabled:
          body.adminHubEnabled !== undefined
            ? body.adminHubEnabled
            : lockedType === ZONE_TYPE.SINGLE
              ? true
              : zone.adminHubEnabled,
        useExistingAdminHub: false,
        adminHubSellerId: null,
        adminHubPhone: body.adminHubPhone || body.adminHub?.phone || body.hubPhone,
        adminHubShopName:
          body.adminHubShopName || body.adminHub?.shopName || body.hubShopName,
        adminHubName: body.adminHubName || body.adminHub?.name || body.hubName,
        previous: {
          zoneType: lockedType,
          adminHubEnabled: zone.adminHubEnabled,
          adminHubSellerId: zone.adminHubSellerId,
        },
      });

      conversion = await assertZoneConversionAllowed({
        previousType: lockedType,
        nextType: lockedType,
        zoneId: zone._id,
        adminHubEnabled: hubConfig.adminHubEnabled,
        adminHubSellerId: hubConfig.adminHubSellerId,
      });

      zone.zoneType = lockedType;
      zone.adminHubEnabled = hubConfig.adminHubEnabled === true;
      zone.adminHubSellerId = hubConfig.adminHubSellerId || null;
    } else {
      zone.zoneType = lockedType;
    }

    await zone.save();

    if (zone.adminHubEnabled && zone.adminHubSellerId) {
      await bindAdminHubToZone(zone.adminHubSellerId, zone);
    }

    const hub = zone.adminHubSellerId
      ? await Seller.findById(zone.adminHubSellerId)
          .select('_id name shopName phone phoneLast10 isActive approvalStatus isAdminHub')
          .lean()
      : null;

    return res.json({
      success: true,
      data: {
        zone: mapZoneDto(zone.toObject()),
        adminHub: mapAdminHubDto(hub),
        conversion,
      },
    });
  } catch (error) {
    return res.status(error.status || 400).json({
      success: false,
      message: error.message || 'Failed to update zone',
      code: error.code || 'ZONE_UPDATE_FAILED',
    });
  }
};

export const deleteAdminZone = async (req, res) => {
  const deleted = await QuickZone.findByIdAndDelete(req.params.zoneId);
  if (!deleted) {
    return res.status(404).json({ success: false, message: 'Zone not found' });
  }

  // Admin Hub seller lives in quick_sellers — zone delete unbinds but does not delete the seller profile.
  if (deleted.adminHubSellerId) {
    await Seller.updateOne(
      {
        _id: deleted.adminHubSellerId,
        isAdminHub: true,
        'shopInfo.zoneId': deleted._id,
      },
      {
        $set: {
          'shopInfo.zoneId': null,
          'shopInfo.zoneName': '',
        },
      },
    );
  }

  return res.json({
    success: true,
    data: {
      id: req.params.zoneId,
      adminHubPreserved: true,
    },
  });
};

export const getAdminOfferSections = async (req, res) => {
  const sections = await getQuickOfferSections(req.query);
  return res.json({ success: true, results: sections });
};

export const createAdminOfferSection = async (req, res) => {
  const section = await createQuickOfferSection(req.body);
  return res.status(201).json({ success: true, result: section });
};

export const updateAdminOfferSection = async (req, res) => {
  const section = await updateQuickOfferSection(req.params.id, req.body);
  if (!section) {
    return res.status(404).json({ success: false, message: 'Section not found' });
  }
  return res.json({ success: true, result: section });
};

export const deleteAdminOfferSection = async (req, res) => {
  await deleteQuickOfferSection(req.params.id);
  return res.json({ success: true, result: { deleted: true } });
};

export const reorderAdminOfferSections = async (req, res) => {
  await reorderQuickOfferSections(req.body);
  return res.json({ success: true, result: { reordered: true } });
};

export const getAdminFinanceSummary = async (_req, res) => {
  const result = await getQuickCommerceFinanceSummary();
  return res.json({ success: true, result });
};

export const getAdminFinanceLedger = async (req, res) => {
  const page = Math.max(1, Number(req.query?.page || 1) || 1);
  const limit = Math.max(1, Math.min(100, Number(req.query?.limit || 25) || 25));
  const result = await getQuickCommerceFinanceLedger({ page, limit });
  return res.json({ success: true, result });
};

export const getAdminFinancePayouts = async (req, res) => {
  const page = Math.max(1, Number(req.query?.page || 1) || 1);
  const limit = Math.max(1, Math.min(200, Number(req.query?.limit || 100) || 100));
  const status = req.query?.status || "PENDING";
  const seller = String(req.query?.seller || "").toLowerCase() === "true";
  const result = await getQuickCommerceFinancePayouts({ seller, status, page, limit });
  return res.json({ success: true, result });
};

export const getAdminSellerWithdrawals = async (req, res) => {
  try {
    const result = await getQuickCommerceSellerWithdrawals({
      page: req.query?.page,
      limit: req.query?.limit,
      status: req.query?.status,
      search: req.query?.search,
    });
    return res.json({ success: true, result });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load seller withdrawals",
    });
  }
};

export const getAdminSellerTransactions = async (req, res) => {
  try {
    const result = await getQuickCommerceSellerTransactions({
      page: req.query?.page,
      limit: req.query?.limit,
      status: req.query?.status,
      type: req.query?.type,
      search: req.query?.search,
      sellerId: req.query?.sellerId,
    });
    return res.json({ success: true, result });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load seller transactions",
    });
  }
};



export const updateAdminWithdrawalStatus = async (req, res) => {
  try {
    const result = await updateQuickCommerceWithdrawalStatus(
      req.params.withdrawalId,
      req.body,
    );
    return res.json({ success: true, result });
  } catch (error) {
    const message = error.message || "Failed to update withdrawal";
    const statusCode = message.includes("not found") ? 404 : 400;
    return res.status(statusCode).json({ success: false, message });
  }
};

export const getAdminSellerWithdrawalSettings = async (_req, res) => {
  try {
    const result = await getSellerWithdrawalSettings();
    return res.json({ success: true, result });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load withdrawal settings",
    });
  }
};

export const updateAdminSellerWithdrawalSettings = async (req, res) => {
  try {
    const result = await upsertSellerWithdrawalSettings(req.body || {});
    return res.json({ success: true, result });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to update withdrawal settings",
    });
  }
};



// ─── Coupon Management ───────────────────────────────────────────────────────

export const getAdminCoupons = async (req, res) => {
  try {
    const { status, search } = req.query || {};
    const coupons = await getAdminQuickCoupons({ status, search });
    return res.json({ success: true, results: coupons, result: coupons });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch coupons' });
  }
};

export const createCoupon = async (req, res) => {
  try {
    const coupon = await createAdminQuickCoupon(req.body || {});
    return res.status(201).json({ success: true, result: coupon });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || 'Failed to create coupon' });
  }
};

export const updateCoupon = async (req, res) => {
  try {
    const { couponId } = req.params;
    const coupon = await updateAdminQuickCoupon(couponId, req.body || {});
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
    return res.json({ success: true, result: coupon });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || 'Failed to update coupon' });
  }
};

export const deleteCoupon = async (req, res) => {
  try {
    const { couponId } = req.params;
    await deleteAdminQuickCoupon(couponId);
    return res.json({ success: true, result: { deleted: true } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || 'Failed to delete coupon' });
  }
};

export const toggleCouponStatus = async (req, res) => {
  try {
    const { couponId } = req.params;
    const coupon = await toggleAdminQuickCouponStatus(couponId);
    return res.json({ success: true, result: coupon });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || 'Failed to toggle coupon status' });
  }
};

export const getAdminSellerCouponRequests = async (req, res) => {
  try {
    const { status, search } = req.query || {};
    const {
      listAdminSellerCoupons,
    } = await import('../seller/services/sellerCoupon.service.js');
    const coupons = await listAdminSellerCoupons({ status, search });
    return res.json({ success: true, results: coupons, result: coupons });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch seller coupon requests',
    });
  }
};

export const updateAdminSellerCouponRequestStatus = async (req, res) => {
  try {
    const { couponId } = req.params;
    const status = req.body?.status;
    const {
      updateAdminSellerCouponStatus,
    } = await import('../seller/services/sellerCoupon.service.js');
    const coupon = await updateAdminSellerCouponStatus(couponId, status);

    try {
      if (coupon?.sellerId) {
        const approved = coupon.status === 'Approved';
        await upsertSellerNotification(coupon.sellerId, {
          key: `seller_coupon_${coupon._id}_${coupon.status}`,
          type: approved ? 'coupon_approved' : 'coupon_rejected',
          title: approved ? 'Coupon approved' : 'Coupon rejected',
          message: approved
            ? `Your coupon ${coupon.couponCode} is now active.`
            : `Your coupon ${coupon.couponCode} was rejected/deactivated.`,
          link: '/seller/coupons',
          metadata: { couponId: coupon._id, couponCode: coupon.couponCode },
        });
      }
    } catch {
      // Notification failure should not block status update.
    }

    return res.json({ success: true, result: coupon });
  } catch (error) {
    const message = error.message || 'Failed to update seller coupon status';
    const statusCode = /not found|invalid/i.test(message) ? 400 : 500;
    return res.status(statusCode).json({ success: false, message });
  }
};

