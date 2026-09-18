import ms from "ms";
import mongoose from "mongoose";
import {
  createOrUpdateOtp,
  verifyOtp,
} from "../../../../core/otp/otp.service.js";
import {
  signAccessToken,
  signRefreshToken,
} from "../../../../core/auth/token.util.js";
import { FoodRefreshToken } from "../../../../core/refreshTokens/refreshToken.model.js";
import { config } from "../../../../config/env.js";
import { getIO, rooms } from "../../../../config/socket.js";
import { logger } from "../../../../utils/logger.js";
import { uploadImageBuffer } from "../../../../services/cloudinary.service.js";
import { sendError, sendResponse } from "../../../../utils/response.js";
import { Seller } from "../models/seller.model.js";
import { SellerNotification } from "../models/sellerNotification.model.js";
import { upsertSellerNotification } from "../services/sellerNotify.service.js";
import {
  buildSellerProfilePatch,
  splitSellerReviewablePatch,
  mergeSellerPendingProfileChanges,
  restoreStagedFieldsFromSnapshot,
  sellerHadPriorApproval,
  sanitizePendingProfileChangesForApi,
} from "../../shared/pendingProfileChanges.js";
import { SellerOrder } from "../models/sellerOrder.model.js";
import { SellerProduct } from "../models/sellerProduct.model.js";
import { QuickCategory } from "../../models/category.model.js";
import { SellerReturn } from "../models/sellerReturn.model.js";
import { recordSellerReturnDecision, requestSellerReturnPickup } from "../../services/quickReturn.service.js";
import { serializeReturnForSeller, mergeSellerReturnOrderContext } from "../../utils/return.helpers.js";
import { getSellerWithdrawableBalance } from "../../services/sellerLedger.service.js";
import { buildSellerOrderReturnSummary } from "../../services/returnMirror.service.js";
import {
  getSellerWithdrawalSettings,
  validateWithdrawalAmountAgainstLimits,
} from "../../admin/services/withdrawalSettings.service.js";
import { SellerStockAdjustment } from "../models/sellerStockAdjustment.model.js";
import { SellerTransaction } from "../models/sellerTransaction.model.js";
import { QuickOrder } from "../../models/order.model.js";
import { resolveQuickOrderCancellationReason } from "../../utils/cancellation.helpers.js";
import { getSellerVisibleQuickOrderPaymentFilter, isQuickOrderVisibleToSeller } from "../../utils/sellerOrderVisibility.helpers.js";
import { resolveQuickOrderCustomer } from "../../utils/customer.helpers.js";
import { Driver } from '../../../../core/models/driver.model.js';
import {
  buildDeliverySocketPayload,
  haversineKm,
  notifyOwnerSafely,
} from "../../../food/orders/services/order.helpers.js";
import { resolveQuickSellerCommissionAmount } from "../../admin/services/commission.service.js";
import {
  computeSellerReceivable,
  resolveSellerPackingAmount,
} from "../../utils/sellerEarnings.helpers.js";
import * as quickOrderService from "../../services/quickOrder.service.js";
import { assertSellerCanJoinZone, mapZoneDto, ZONE_SELECT_PUBLIC, ZONE_TYPE, normalizeZoneType } from "../../services/quickZone.service.js";
import { QuickZone } from "../../models/quick_zone.model.js";
import {
  buildSellerCategoryTree,
  resolveSellerCategoryIds,
  syncSellerInventoryNotification,
} from "../services/sellerCatalog.service.js";
import {
  MAX_PRODUCT_VARIANTS,
  MAX_VARIANT_IMAGES,
  assertVariantImageRules,
  deriveProductImagesFromVariants,
  sanitizeVariantImageList,
} from "../../utils/variantImages.helpers.js";

const STATUS_LABELS = {
  pending: "Pending",
  confirmed: "Confirmed",
  packed: "Packed",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const normalizePhone = (value) => String(value || "").replace(/\D/g, "");
const last10 = (value) => normalizePhone(value).slice(-10);
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const optionalNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const optionalDate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const optionalBoolean = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  return fallback;
};
const str = (value, fallback = "") =>
  typeof value === "string" ? value.trim() : fallback;
const arr = (value) => (Array.isArray(value) ? value : []);
// Redundant getOrderAddressPoint removed in favor of quickOrderService.getOrderAddressPoint

const buildSellerAddressFromParentOrder = (order) => {
  const coords = order?.deliveryAddress?.location?.coordinates;
  return {
    address: String(order?.deliveryAddress?.street || "").trim(),
    city: String(order?.deliveryAddress?.city || "").trim(),
    ...(Array.isArray(coords) && coords.length === 2
      ? {
        location: {
          lat: Number(coords[1]),
          lng: Number(coords[0]),
        },
      }
      : {}),
  };
};

const buildSellerOrderFromParentOrder = async (order, sellerId) => {
  const sellerKey = String(sellerId || "").trim();
  if (!sellerKey) return null;
  if (!isQuickOrderVisibleToSeller(order)) return null;

  const quickItems = Array.isArray(order?.items)
    ? order.items.filter(
      (item) =>
        item?.type === "quick" &&
        String(item?.sourceId || "").trim() === sellerKey,
    )
    : [];
  if (!quickItems.length) return null;

  const quickSubtotal = (Array.isArray(order?.items) ? order.items : [])
    .filter((item) => item?.type === "quick")
    .reduce(
      (sum, item) =>
        sum + Number(item?.price || 0) * Number(item?.quantity || 0),
      0,
    );
  const sellerSubtotal = quickItems.reduce(
    (sum, item) => sum + Number(item?.price || 0) * Number(item?.quantity || 0),
    0,
  );
  const allocatedDeliveryFee =
    quickSubtotal > 0
      ? Number(
        (
          (Number(order?.pricing?.deliveryFee || 0) * sellerSubtotal) /
          quickSubtotal
        ).toFixed(2),
      )
      : 0;
  const packingTotal = resolveSellerPackingAmount({
    items: quickItems.map((item) => ({
      productId: item?.itemId || item?.productId,
      packingAmount: Number(item?.packingAmount || 0),
    })),
    parentPricing: order?.pricing || {},
    sellerSubtotal,
    parentSubtotal: quickSubtotal,
  });
  const commissionAmount = await resolveQuickSellerCommissionAmount(
    sellerId,
    sellerSubtotal,
    quickItems,
  );
  const couponDiscount = Math.max(
    0,
    Number(order?.pricing?.couponDiscount ?? order?.pricing?.discount ?? 0) || 0,
  );
  const couponSource = String(order?.pricing?.couponSource || '')
    .trim()
    .toLowerCase();
  const sellerReceivable = computeSellerReceivable({
    subtotal: sellerSubtotal,
    commission: commissionAmount,
    packingAmount: packingTotal,
    couponDiscount,
    couponSource,
  });

  const parentStatus = String(order?.orderStatus || "pending").toLowerCase();
  let sellerStatus = "pending";
  let workflowStatus = "SELLER_PENDING";

  if (parentStatus === "delivered") {
    sellerStatus = "delivered";
    workflowStatus = "DELIVERED";
  } else if (parentStatus.startsWith("cancel")) {
    sellerStatus = "cancelled";
    workflowStatus = "CANCELLED";
  } else if (
    ["confirmed", "preparing", "ready_for_pickup", "ready", "picked_up", "out_for_delivery"].includes(
      parentStatus,
    )
  ) {
    sellerStatus = parentStatus;
    workflowStatus = parentStatus.toUpperCase();
  }

  const addr = order?.deliveryAddress;
  const customer = resolveQuickOrderCustomer(order);

  return {
    orderType: order?.orderType === "mixed" ? "mixed" : "quick",
    parentOrderId: order?._id || null,
    sellerId,
    orderId: order?.orderId,
    customer: {
      name: customer.name,
      phone: customer.phone || addr?.phone || "",
    },
    items: quickItems.map((item) => ({
      productId: mongoose.isValidObjectId(String(item?.itemId || ""))
        ? new mongoose.Types.ObjectId(String(item.itemId))
        : null,
      name: item?.name || "Item",
      price: Number(item?.price || 0),
      quantity: Math.max(1, Number(item?.quantity || 1)),
      image: item?.image || "",
      variantName: item?.variantName || item?.notes || "",
      packingAmount: Math.max(0, Number(item?.packingAmount || 0)),
    })),
    pricing: {
      subtotal: sellerSubtotal,
      packingAmount: packingTotal,
      commission: commissionAmount,
      total: sellerSubtotal + allocatedDeliveryFee + packingTotal,
      receivable: (() => {
        if (sellerStatus !== "cancelled") return sellerReceivable;
        const payMethod = String(order?.payment?.method || "").toLowerCase();
        const payStatus = String(order?.payment?.status || "").toLowerCase();
        const isCod = ["cash", "cod", "cash_on_delivery"].includes(payMethod);
        const isPrepaidPaid =
          !isCod && ["paid", "captured", "refunded"].includes(payStatus);
        return isPrepaidPaid ? packingTotal : 0;
      })(),
      couponDiscount:
        couponSource === "seller" || couponSource === "restaurant"
          ? couponDiscount
          : 0,
      couponSource:
        couponSource === "seller" || couponSource === "restaurant"
          ? "seller"
          : couponSource === "admin"
            ? "admin"
            : "",
    },
    status: sellerStatus,
    workflowStatus: workflowStatus,
    deliveredAt: order?.deliveryState?.deliveredAt || (parentStatus === "delivered" ? order.updatedAt : null),
    sellerPendingExpiresAt: new Date(Date.now() + 2 * 60 * 1000),
    address: {
      address:
        [addr?.street, addr?.additionalDetails].filter(Boolean).join(", ") ||
        addr?.address ||
        "",
      city: addr?.city || "",
      phone: customer.phone || addr?.phone || "",
      location: addr?.location
        ? {
          lat: addr.location.coordinates?.[1],
          lng: addr.location.coordinates?.[0],
        }
        : undefined,
    },
    payment: {
      method: ["cash", "cod"].includes(
        String(order?.payment?.method || "").toLowerCase(),
      )
        ? "cash"
        : "online",
    },
  };
};

const resolveParentQuickOrder = (
  sellerOrder,
  { populateUser = false } = {},
) => {
  const parentOrderId = sellerOrder?.parentOrderId;
  const orderId = String(sellerOrder?.orderId || "").trim();

  const baseQuery = {
    orderType: { $in: ["quick", "mixed"] },
  };

  let query = null;
  if (mongoose.isValidObjectId(String(parentOrderId || ""))) {
    query = QuickOrder.findOne({
      ...baseQuery,
      _id: new mongoose.Types.ObjectId(String(parentOrderId)),
    });
  } else if (orderId) {
    query = QuickOrder.findOne({
      ...baseQuery,
      orderId,
    });
  }

  if (!query) return null;
  if (populateUser) query = query.populate("userId");
  return query;
};

const backfillSellerOrdersFromParentOrders = async (sellerId) => {
  const sellerKey = String(sellerId || "").trim();
  if (!sellerKey) return;

  const [existingSellerOrders, mixedOrders] = await Promise.all([
    SellerOrder.find({ sellerId }).select("orderId").lean(),
    QuickOrder.find({
      orderType: { $in: ["mixed", "quick"] },
      items: { $elemMatch: { type: "quick", sourceId: sellerKey } },
      ...getSellerVisibleQuickOrderPaymentFilter(),
    })
      .select("_id orderId orderType items pricing deliveryAddress payment")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
  ]);

  const existingOrderIds = new Set(
    existingSellerOrders
      .map((item) => String(item.orderId || "").trim())
      .filter(Boolean),
  );

  const missingDocs = (
    await Promise.all(
      mixedOrders
        .filter(
          (order) => !existingOrderIds.has(String(order.orderId || "").trim()),
        )
        .map((order) => buildSellerOrderFromParentOrder(order, sellerId)),
    )
  ).filter(Boolean);

  if (!missingDocs.length) return;

  await Promise.all(
    missingDocs.map((doc) =>
      SellerOrder.findOneAndUpdate(
        { sellerId: doc.sellerId, orderId: doc.orderId },
        { $set: doc },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ),
    ),
  );
};

const listNearbyOnlineDeliveryPartnersByCoords = async (
  origin,
  { maxKm = 15, limit = 10 } = {},
) => {
  const onlinePartners = await Driver.find({
    availabilityStatus: "online",
    authorizedServices: "quick-commerce",
    status: {
      $in:
        process.env.NODE_ENV === "production"
          ? ["approved"]
          : ["approved", "pending"],
    },
  })
    .select("_id name phone lastLat lastLng lastLocationAt")
    .lean();

  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) {
    return onlinePartners.slice(0, Math.max(1, limit)).map((partner) => ({
      partnerId: partner._id,
      distanceKm: null,
      name: partner.name || "Delivery Partner",
      phone: partner.phone || "",
    }));
  }

  const STALE_GPS_MS = 10 * 60 * 1000;
  const scored = onlinePartners
    .map((partner) => {
      const lat = Number(partner.lastLat);
      const lng = Number(partner.lastLng);
      const isStale =
        !partner.lastLocationAt ||
        Date.now() - new Date(partner.lastLocationAt).getTime() > STALE_GPS_MS;

      if (!Number.isFinite(lat) || !Number.isFinite(lng) || isStale) {
        return {
          partnerId: partner._id,
          distanceKm: null,
          score: Number.MAX_SAFE_INTEGER,
          name: partner.name || "Delivery Partner",
          phone: partner.phone || "",
        };
      }

      const distanceKm = haversineKm(origin.lat, origin.lng, lat, lng);
      return {
        partnerId: partner._id,
        distanceKm,
        score: Number.isFinite(distanceKm)
          ? distanceKm
          : Number.MAX_SAFE_INTEGER,
        name: partner.name || "Delivery Partner",
        phone: partner.phone || "",
      };
    })
    .filter(
      (partner) => partner.distanceKm == null || partner.distanceKm <= maxKm,
    )
    .sort((a, b) => a.score - b.score)
    .slice(0, Math.max(1, limit));

  return scored;
};
const currency = (value) => `₹${num(value, 0).toLocaleString("en-IN")}`;
const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";

const createSellerSku = () =>
  `SKU-${Date.now().toString(36).slice(-6).toUpperCase()}${Math.random()
    .toString(36)
    .slice(2, 4)
    .toUpperCase()}`;

const buildVariantSku = (baseSku, variantName, index) => {
  const base = str(baseSku) || createSellerSku();
  const namePart = slugify(variantName).replace(/-/g, "").slice(0, 6).toUpperCase();
  return `${base}-${namePart || index + 1}`;
};

const assertVariantPricing = (variants = []) => {
  for (const variant of variants) {
    const price = Number(variant?.price || 0);
    const salePrice = Number(variant?.salePrice || 0);
    const name = str(variant?.name) || "Variant";

    if (!(price > 0)) {
      const err = new Error(`${name}: Price (MRP) must be greater than 0`);
      err.statusCode = 400;
      throw err;
    }
    if (salePrice < 0) {
      const err = new Error(`${name}: Sale price cannot be negative`);
      err.statusCode = 400;
      throw err;
    }
    // price = MRP, salePrice = offer price. Offer cannot exceed MRP.
    if (salePrice > 0 && salePrice > price) {
      const err = new Error(
        `${name}: Sale price (₹${salePrice}) cannot be greater than Price/MRP (₹${price})`,
      );
      err.statusCode = 400;
      throw err;
    }
  }
};

const serializeSellerProfile = (seller) => ({
  _id: seller._id,
  name: seller.name,
  shopName: seller.shopName,
  phone: seller.phoneLast10 || seller.phone || "",
  email: seller.email || "",
  role: "Seller",
  isAdminHub: seller.isAdminHub === true,
  isActive: seller.isActive !== false,
  isVerified: seller.isVerified !== false,
  approved: seller.approved !== false,
  approvalStatus:
    seller.approvalStatus ||
    (seller.approved === false ? "pending" : "approved"),
  onboardingSubmitted: seller.onboardingSubmitted === true,
  approvalNotes: seller.approvalNotes || "",
  approvedAt: seller.approvedAt || null,
  rejectedAt: seller.rejectedAt || null,
  wasPreviouslyRejected: seller.wasPreviouslyRejected === true,
  lastRejectionReason: seller.lastRejectionReason || "",
  location: seller.location || null,
  address: seller.location?.formattedAddress || seller.location?.address || "",
  rating: num(seller.rating, 0),
  totalRatings: num(seller.totalRatings, 0),
  bankInfo: {
    bankName: seller.bankInfo?.bankName || "",
    accountHolderName: seller.bankInfo?.accountHolderName || "",
    accountNumber: seller.bankInfo?.accountNumber || "",
    ifscCode: seller.bankInfo?.ifscCode || "",
    accountType: seller.bankInfo?.accountType || "",
    upiId: seller.bankInfo?.upiId || "",
    upiQrImage: seller.bankInfo?.upiQrImage || "",
  },
  documents: {
    panNumber: seller.documents?.panNumber || "",
    gstRegistered: seller.documents?.gstRegistered === true,
    gstNumber: seller.documents?.gstNumber || "",
    gstLegalName: seller.documents?.gstLegalName || "",
    fssaiNumber: seller.documents?.fssaiNumber || "",
    fssaiExpiry: seller.documents?.fssaiExpiry || null,
    fssaiImage: seller.documents?.fssaiImage || "",
    shopLicenseNumber: seller.documents?.shopLicenseNumber || "",
    shopLicenseImage: seller.documents?.shopLicenseImage || "",
    shopLicenseExpiry: seller.documents?.shopLicenseExpiry || null,
    isDocumentsVerified: seller.documents?.isDocumentsVerified === true,
  },
  shopInfo: {
    businessType:
      seller.shopInfo?.businessType === "Pharmacy"
        ? "Quick Commerce"
        : seller.shopInfo?.businessType || "Quick Commerce",
    alternatePhone: seller.shopInfo?.alternatePhone || "",
    supportEmail: seller.shopInfo?.supportEmail || "",
    openingHours: seller.shopInfo?.openingHours || "",
    zoneId: seller.shopInfo?.zoneId || null,
    zoneSource: seller.shopInfo?.zoneSource || "",
    zoneName: seller.shopInfo?.zoneName || "",
    shopImage: seller.shopInfo?.shopImage || "",
  },
  zoneType: "",
  zoneTypeLabel: "",
  wasEverApproved: seller.wasEverApproved === true,
  hasPendingProfileUpdate: Boolean(
    sanitizePendingProfileChangesForApi(seller.pendingProfileChanges),
  ),
  pendingProfileChanges: sanitizePendingProfileChangesForApi(
    seller.pendingProfileChanges,
  ),
});

/** Attach zoneType / label from the seller's assigned Quick zone. */
const withSellerZoneType = async (profile, seller) => {
  const zoneId = seller?.shopInfo?.zoneId || profile?.shopInfo?.zoneId;
  if (!zoneId) return profile;

  const zone = await QuickZone.findById(zoneId).select("zoneType").lean();
  if (!zone) return profile;

  const zoneType = normalizeZoneType(zone.zoneType, ZONE_TYPE.MULTI);
  return {
    ...profile,
    zoneType,
    zoneTypeLabel:
      zoneType === ZONE_TYPE.SINGLE ? "Single Vendor" : "Multi Vendor",
    shopInfo: {
      ...(profile.shopInfo || {}),
      zoneType,
    },
  };
};

const objectIdOrNull = (value) =>
  mongoose.Types.ObjectId.isValid(value)
    ? new mongoose.Types.ObjectId(value)
    : null;

const toDataUrl = (file) =>
  file ? `data:${file.mimetype};base64,${file.buffer.toString("base64")}` : "";

const parseTags = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const parseVariants = (raw, fallback = {}, existingVariants = []) => {
  let parsed = raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = [];
    }
  }

  const productSku = str(fallback.sku) || createSellerSku();
  const usedSkus = new Set();
  const previous = arr(existingVariants);

  const variants = arr(parsed)
    .slice(0, MAX_PRODUCT_VARIANTS)
    .map((variant, index) => {
      const name = str(variant?.name) || `Variant ${index + 1}`;
      let sku = str(variant?.sku);
      // Never reuse product-level SKU for every variant when sku is blank
      if (!sku || usedSkus.has(sku.toUpperCase())) {
        sku = buildVariantSku(productSku, name, index);
      }
      let uniqueSku = sku;
      let n = 2;
      while (usedSkus.has(uniqueSku.toUpperCase())) {
        uniqueSku = `${sku}-${n}`;
        n += 1;
      }
      usedSkus.add(uniqueSku.toUpperCase());

      const previousMatch =
        previous.find((item) => {
          if (variant?._id && item?._id && String(item._id) === String(variant._id)) {
            return true;
          }
          if (str(variant?.sku) && str(item?.sku) && str(variant.sku).toUpperCase() === str(item.sku).toUpperCase()) {
            return true;
          }
          return false;
        }) || previous[index] || {};

      const incomingImages = sanitizeVariantImageList(variant?.images);
      const images = incomingImages.length
        ? incomingImages
        : sanitizeVariantImageList(previousMatch.images);

      const mapped = {
        name,
        price: num(variant?.price, fallback.price),
        salePrice: num(variant?.salePrice, fallback.salePrice),
        stock: Math.max(0, num(variant?.stock, fallback.stock)),
        sku: uniqueSku,
        images,
      };
      if (variant?._id && mongoose.isValidObjectId(String(variant._id))) {
        mapped._id = variant._id;
      } else if (previousMatch?._id) {
        mapped._id = previousMatch._id;
      }
      return mapped;
    })
    .filter((variant) => variant.name);

  if (variants.length > 0) {
    assertVariantPricing(variants);
    return variants;
  }

  const defaultVariant = {
    name: str(fallback.weight) || "Default",
    price: num(fallback.price),
    salePrice: num(fallback.salePrice),
    stock: Math.max(0, num(fallback.stock)),
    sku: productSku,
  };
  assertVariantPricing([defaultVariant]);
  return [defaultVariant];
};

const populateProductQuery = (query) =>
  query
    .populate("headerId", "name")
    .populate("categoryId", "name")
    .populate("subcategoryId", "name");

const serializeProduct = (product) => {
  if (!product) return null;
  const doc =
    typeof product.toObject === "function"
      ? product.toObject({ virtuals: true })
      : { ...product };

  const variants = arr(doc.variants).map((variant) => ({
    _id: variant._id,
    name: variant.name || "",
    price: Number(variant.price || 0),
    salePrice: Number(variant.salePrice || 0),
    stock: Number(variant.stock || 0),
    sku: variant.sku || "",
    images: sanitizeVariantImageList(variant.images),
  }));
  const firstVariantImage = variants[0]?.images?.[0] || "";

  return {
    id: doc._id,
    _id: doc._id,
    sellerId: doc.sellerId,
    name: doc.name,
    slug: doc.slug,
    sku: doc.sku || "",
    description: doc.description || "",
    price: Number(doc.price || 0),
    salePrice: Number(doc.salePrice || 0),
    mrp: Number(doc.mrp || doc.price || 0),
    stock: Number(doc.stock || 0),
    packingAmount: Number(doc.packingAmount || 0),
    lowStockAlert: Number(doc.lowStockAlert || 0),
    brand: doc.brand || "",
    weight: doc.weight || "",
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    mainImage: firstVariantImage || doc.mainImage || doc.image || "",
    galleryImages: Array.isArray(doc.galleryImages) && doc.galleryImages.length
      ? doc.galleryImages
      : variants.flatMap((variant) => variant.images || []),
    headerId: doc.headerId || null,
    categoryId: doc.categoryId || null,
    subcategoryId: doc.subcategoryId || null,
    status: doc.status || (doc.isActive === false ? "inactive" : "active"),
    isActive: doc.isActive !== false,
    approvalStatus: doc.approvalStatus || "pending",
    variants,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
};

const sellerScope = (req) => req.user?.userId;

const reconcileSellerDeliveredOrders = async (sellerId) => {
  // Backfill: if parent quick order is delivered/cancelled but seller leg didn't update, fix it.
  const candidates = await SellerOrder.find({
    sellerId,
    status: {
      $in: [
        "pending",
        "confirmed",
        "packed",
        "ready_for_pickup",
        "out_for_delivery",
      ],
    },
  })
    .select("_id orderId parentOrderId status workflowStatus deliveredAt")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  if (!candidates.length) return;

  const parentIds = candidates
    .map((o) => o.parentOrderId)
    .filter(Boolean)
    .map((id) => String(id));

  const parentOrders = parentIds.length
    ? await QuickOrder.find({ _id: { $in: parentIds } })
      .select("_id orderId orderStatus workflowStatus updatedAt")
      .lean()
    : [];

  const parentMap = new Map(parentOrders.map((p) => [String(p._id), p]));

  const updates = [];
  for (const so of candidates) {
    const parent = so.parentOrderId
      ? parentMap.get(String(so.parentOrderId))
      : null;
    const parentStatus = String(parent?.orderStatus || "").toLowerCase();
    if (!parent || !parentStatus) continue;

    if (parentStatus === "delivered") {
      updates.push({
        id: so._id,
        patch: {
          status: "delivered",
          workflowStatus: "DELIVERED",
          deliveredAt: so.deliveredAt || parent.updatedAt || new Date(),
        },
      });
    } else if (parentStatus.startsWith("cancelled")) {
      updates.push({
        id: so._id,
        patch: {
          status: "cancelled",
          workflowStatus: "CANCELLED",
        },
      });
    }
  }

  if (!updates.length) return;

  await Promise.all(
    updates.map((u) =>
      SellerOrder.updateOne({ _id: u.id, sellerId }, { $set: u.patch }),
    ),
  );

  // Best-effort: also ensure Order Payment transactions exist for newly-delivered legs.
  const deliveredIds = updates
    .filter((u) => u.patch.status === "delivered")
    .map((u) => String(u.id));
  if (deliveredIds.length) {
    const deliveredOrders = await SellerOrder.find({
      _id: { $in: deliveredIds },
      sellerId,
    })
      .select("orderId customer pricing deliveredAt updatedAt createdAt")
      .lean();

    await Promise.all(
      deliveredOrders
        .map((o) => {
          const receivable =
            Number(o?.pricing?.receivable) ||
            Math.max(
              0,
              num(o?.pricing?.subtotal) - num(o?.pricing?.commission),
            );
          if (!Number.isFinite(receivable) || receivable <= 0) return null;

          return SellerTransaction.findOneAndUpdate(
            {
              sellerId,
              type: "Order Payment",
              orderId: String(o.orderId || "").trim(),
            },
            {
              $set: {
                amount: receivable,
                status: "Settled",
                reference: String(o.orderId || "").trim(),
                customer: o?.customer?.name || "Customer",
                createdAt:
                  o?.deliveredAt || o?.updatedAt || o?.createdAt || new Date(),
              },
              $setOnInsert: {
                sellerId,
                type: "Order Payment",
                orderId: String(o.orderId || "").trim(),
                reason: "",
              },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
          );
        })
        .filter(Boolean),
    );
  }
};

const parseProductPayload = async (req, existingProduct = null) => {
  const mainUpload = arr(req.files?.mainImage)[0];
  const galleryUploads = arr(req.files?.galleryImages);

  let bodyGallery = [];
  if (req.body?.galleryImages) {
    if (Array.isArray(req.body.galleryImages)) {
      bodyGallery = req.body.galleryImages.map(img => String(img || "").trim()).filter(Boolean);
    } else if (typeof req.body.galleryImages === "string") {
      try {
        const parsed = JSON.parse(req.body.galleryImages);
        if (Array.isArray(parsed)) {
          bodyGallery = parsed.map(img => String(img || "").trim()).filter(Boolean);
        } else if (parsed && typeof parsed === "string") {
          bodyGallery = parsed.split(",").map(img => img.trim()).filter(Boolean);
        }
      } catch {
        bodyGallery = req.body.galleryImages.split(",").map(img => img.trim()).filter(Boolean);
      }
    }
  }

  const variants = parseVariants(req.body?.variants, {
    price: req.body?.price,
    salePrice: req.body?.salePrice,
    stock: req.body?.stock,
    sku: req.body?.sku,
    weight: req.body?.weight,
  }, existingProduct?.variants);
  const firstVariant = variants[0] || {};
  const variantStockTotal = variants.reduce(
    (sum, variant) => sum + Math.max(0, Number(variant?.stock) || 0),
    0,
  );
  // Product card price always mirrors the first variant
  const derivedPrice = Math.max(
    0,
    num(firstVariant?.price, num(req.body?.price, existingProduct?.price ?? 0)),
  );
  const derivedSalePrice = Math.max(
    0,
    num(
      firstVariant?.salePrice,
      num(req.body?.salePrice, existingProduct?.salePrice ?? 0),
    ),
  );
  const derivedStock =
    variants.length > 0
      ? variantStockTotal
      : Math.max(
          0,
          num(req.body?.stock, existingProduct?.stock ?? 0),
        );

  // Upload images to Cloudinary when files are provided.
  const uploadedMainImage = mainUpload?.buffer
    ? await uploadImageBuffer(mainUpload.buffer, "quick-commerce/products/main")
    : "";

  const uploadedGallery = galleryUploads.length
    ? await Promise.all(
        galleryUploads
          .filter((f) => f?.buffer)
          .map((file) =>
            uploadImageBuffer(file.buffer, "quick-commerce/products/gallery"),
          ),
      )
    : [];

  const variantFileGroups = Array.from({ length: MAX_PRODUCT_VARIANTS }, (_, index) =>
    arr(req.files?.[`variantImages_${index}`]),
  );
  const uploadedVariantImages = await Promise.all(
    variantFileGroups.map((files) =>
      files.length
        ? Promise.all(
            files
              .filter((file) => file?.buffer)
              .slice(0, MAX_VARIANT_IMAGES)
              .map((file) =>
                uploadImageBuffer(file.buffer, "quick-commerce/products/variants"),
              ),
          )
        : Promise.resolve([]),
    ),
  );

  variants.forEach((variant, index) => {
    const uploaded = uploadedVariantImages[index] || [];
    if (!uploaded.length) return;
    variant.images = sanitizeVariantImageList([...(variant.images || []), ...uploaded]);
  });

  const hasVariantImageInput =
    variants.some((variant) => (variant.images || []).length > 0) ||
    uploadedVariantImages.some((group) => group.length > 0);

  assertVariantImageRules(variants, {
    requireImages: Boolean(str(req.body?.clientRequestId)) && !existingProduct,
  });

  const derivedFromVariants = deriveProductImagesFromVariants(variants);

  const weightValue =
    str(req.body?.weight) ||
    str(req.body?.unit) ||
    existingProduct?.weight ||
    existingProduct?.unit ||
    "";
  const unitValue =
    str(req.body?.unit) ||
    str(req.body?.weight) ||
    existingProduct?.unit ||
    existingProduct?.weight ||
    "";
  const mainImageValue =
    uploadedMainImage ||
    str(req.body?.mainImage) ||
    derivedFromVariants.mainImage ||
    existingProduct?.mainImage ||
    existingProduct?.image ||
    "";

  // If client sent galleryImages (incl. empty), replace; otherwise keep existing.
  const galleryProvided =
    req.body?.galleryImages !== undefined && req.body?.galleryImages !== null;
  const nextGallery = (
    galleryProvided || uploadedGallery.length
      ? [...bodyGallery, ...uploadedGallery]
      : derivedFromVariants.galleryImages.length
        ? derivedFromVariants.galleryImages
        : arr(existingProduct?.galleryImages)
  )
    .filter(Boolean)
    .filter((url, idx, all) => all.indexOf(url) === idx);

  // Seller-owned products stay customer-visible after edit (preserve approved).
  const prevApproval = String(existingProduct?.approvalStatus || "").trim();
  const nextApproval =
    prevApproval === "rejected"
      ? "pending"
      : prevApproval === "pending" || prevApproval === "approved"
        ? prevApproval
        : "approved";

  return {
    name: str(req.body?.name) || existingProduct?.name || "Untitled Product",
    slug:
      slugify(
        str(req.body?.slug) || str(req.body?.name) || existingProduct?.slug,
      ) || slugify(existingProduct?.name),
    sku:
      str(req.body?.sku) ||
      existingProduct?.sku ||
      firstVariant?.sku ||
      createSellerSku(),
    description:
      str(req.body?.description) || existingProduct?.description || "",
    price: derivedPrice,
    salePrice: derivedSalePrice,
    stock: derivedStock,
    packingAmount: Math.max(
      0,
      num(req.body?.packingAmount, existingProduct?.packingAmount ?? 0),
    ),
    lowStockAlert: Math.max(
      0,
      num(req.body?.lowStockAlert, existingProduct?.lowStockAlert ?? 5),
    ),
    brand: str(req.body?.brand) || existingProduct?.brand || "",
    weight: weightValue,
    unit: unitValue,
    tags: parseTags(req.body?.tags ?? existingProduct?.tags),
    mainImage: mainImageValue,
    image: mainImageValue,
    galleryImages: nextGallery,
    mrp: Math.max(
      0,
      num(req.body?.mrp, derivedPrice || existingProduct?.mrp || 0),
    ),
    status:
      str(req.body?.status).toLowerCase() === "inactive"
        ? "inactive"
        : "active",
    isActive: str(req.body?.status).toLowerCase() === "inactive" ? false : true,
    approvalStatus: nextApproval,
    approvedAt:
      nextApproval === "approved"
        ? existingProduct?.approvedAt || new Date()
        : existingProduct?.approvedAt || null,
    variants,
    clientRequestId:
      str(req.body?.clientRequestId) || existingProduct?.clientRequestId || "",
  };
};

const createAuthTokens = async (sellerId) => {
  const payload = { userId: String(sellerId), role: "SELLER" };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const ttlMs = ms(config.jwtRefreshExpiresIn || "7d");
  const expiresAt = new Date(Date.now() + ttlMs);

  await FoodRefreshToken.create({
    userId: sellerId,
    token: refreshToken,
    expiresAt,
  });

  return { accessToken, refreshToken };
};

const availableWithdrawalBalance = (transactions) => {
  const totalRevenue = transactions
    .filter((item) => item.type === "Order Payment")
    .reduce((sum, item) => sum + num(item.amount), 0);
  const totalWithdrawn = transactions
    .filter((item) => item.type === "Withdrawal" && item.status === "Settled")
    .reduce((sum, item) => sum + Math.abs(num(item.amount)), 0);
  const pendingPayouts = transactions
    .filter(
      (item) =>
        item.type === "Withdrawal" &&
        ["Pending", "Processing"].includes(String(item.status || "")),
    )
    .reduce((sum, item) => sum + Math.abs(num(item.amount)), 0);

  return Math.max(0, totalRevenue - totalWithdrawn - pendingPayouts);
};

const monthlyRevenueChart = (transactions) => {
  const buckets = new Map();
  const now = new Date();

  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    buckets.set(`${date.getFullYear()}-${date.getMonth()}`, {
      name: date.toLocaleDateString("en-IN", { month: "short" }),
      revenue: 0,
    });
  }

  transactions
    .filter((item) => item.type === "Order Payment")
    .forEach((item) => {
      const createdAt = item.createdAt ? new Date(item.createdAt) : null;
      if (!createdAt || Number.isNaN(createdAt.getTime())) return;
      const bucket = buckets.get(
        `${createdAt.getFullYear()}-${createdAt.getMonth()}`,
      );
      if (bucket) {
        bucket.revenue += num(item.amount);
      }
    });

  return Array.from(buckets.values());
};

const monthlyRevenueChartFromOrders = (orders, returnDeductionByOrderId = new Map()) => {
  const buckets = new Map();
  const now = new Date();

  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    buckets.set(`${date.getFullYear()}-${date.getMonth()}`, {
      name: date.toLocaleDateString("en-IN", { month: "short" }),
      revenue: 0,
      refunded: 0,
    });
  }

  (Array.isArray(orders) ? orders : []).forEach((order) => {
    const effectiveAt =
      order?.deliveredAt || order?.updatedAt || order?.createdAt;
    const when = effectiveAt ? new Date(effectiveAt) : null;
    if (!when || Number.isNaN(when.getTime())) return;

    const bucket = buckets.get(`${when.getFullYear()}-${when.getMonth()}`);
    if (!bucket) return;

    const receivable =
      Number(order?.pricing?.receivable) ||
      Math.max(
        0,
        num(order?.pricing?.subtotal) - num(order?.pricing?.commission),
      );
    const refunded = num(
      returnDeductionByOrderId.get(String(order?.orderId || ""))?.deducted,
    );
    bucket.revenue += Math.max(0, num(receivable) - refunded);
    bucket.refunded += refunded;
  });

  return Array.from(buckets.values());
};

/**
 * Seller-facing labels for internal ledger types. The seller UI groups rows by
 * this label, so return debits must surface as "Refund" rather than the raw
 * RETURN_REFUND / RETURN_PICKUP_FEE enum values.
 */
const LEDGER_TYPE_LABELS = {
  RETURN_REFUND: "Refund",
  RETURN_PICKUP_FEE: "Refund",
  ORDER_CREDIT: "Order Payment",
  SETTLEMENT: "Adjustment",
  MANUAL_ADJUSTMENT: "Adjustment",
  COMMISSION: "Commission",
};

const resolveLedgerTypeLabel = (type) =>
  LEDGER_TYPE_LABELS[String(type || "")] || String(type || "");

const serializeLedger = (transactions) =>
  transactions.map((item) => ({
    id: item.reference || String(item._id),
    type: resolveLedgerTypeLabel(item.type),
    rawType: item.type,
    amount: item.amount,
    status: item.status,
    orderId: item.orderId || "",
    returnId: item.returnId ? String(item.returnId) : "",
    direction: num(item.amount) < 0 ? "debit" : "credit",
    date: item.createdAt
      ? new Date(item.createdAt).toLocaleDateString("en-IN")
      : "",
    time: item.createdAt
      ? new Date(item.createdAt).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      })
      : "",
    customer:
      item.type === "Withdrawal"
        ? item.customer || "Bank Transfer"
        : item.customer || "Customer",
    method:
      item.paymentMethod === "upi"
        ? "UPI Transfer"
        : item.paymentMethod === "bank_transfer"
          ? "Bank Transfer"
          : item.customer || (item.bankDetails?.upiId ? "UPI Transfer" : "Bank Transfer"),
    paymentMethod: item.paymentMethod || "",
    bankDetails: item.bankDetails || null,
    processedAt: item.processedAt || null,
    ref: item.orderId || item.reference || String(item._id),
    reason: item.reason || "",
    createdAt: item.createdAt,
  }));

export const requestSellerOtpController = async (req, res) => {
  try {
    const phone = str(req.body?.phone);
    const digits = normalizePhone(phone);
    if (digits.length < 10) {
      return sendError(res, 400, "Enter a valid phone number");
    }

    await createOrUpdateOtp(phone);
    const hasSmsProvider = Boolean(config.smsApiKey && config.smsSenderId);

    return sendResponse(res, 200, "OTP sent successfully", {
      phone,
      deliveryMode: hasSmsProvider ? "sms" : "otp",
    });
  } catch (error) {
    return sendError(res, 400, error.message || "Failed to send OTP");
  }
};

export const verifySellerOtpController = async (req, res) => {
  try {
    const phone = str(req.body?.phone);
    const otp = str(req.body?.otp);

    if (!phone || !otp) {
      return sendError(res, 400, "Phone and OTP are required");
    }

    const verification = await verifyOtp(phone, otp);
    if (!verification.valid) {
      return sendError(
        res,
        401,
        verification.reason || "OTP verification failed",
      );
    }

    const digits = normalizePhone(phone);
    const phoneSuffix = digits.slice(-10);
    
    // Find all possible matching sellers
    const allSellers = await Seller.find({
      $or: [
        { phoneDigits: digits },
        ...(phoneSuffix ? [{ phoneLast10: phoneSuffix }] : []),
        { phone },
      ],
    }).sort({ 
      // Prefer: approved > pending > draft, and onboarded > not, and newer > older
      approved: -1, 
      onboardingSubmitted: -1, 
      createdAt: -1 
    });

    let seller = allSellers[0]; // Take the first one (preferred one)

    if (!seller) {
      const suffix = phoneSuffix || digits || Date.now().toString().slice(-4);
      seller = await Seller.create({
        name: `Seller ${suffix.slice(-4)}`,
        shopName: `Store ${suffix.slice(-4)}`,
        phone,
        email: `seller${suffix}@seller.local`,
        isVerified: true,
        isActive: true,
        approved: false,
        approvalStatus: "draft",
        onboardingSubmitted: false,
        approvedAt: null,
        rejectedAt: null,
        lastLogin: new Date(),
      });
    } else {
      if (seller.isActive === false || seller.isDeleted === true || seller.accountStatus === 'deleted') {
        return sendError(
          res,
          403,
          "Your account has been deleted/deactivated. Please contact support."
        );
      }
      
      // Backfill phoneDigits and phoneLast10 if they're missing
      if (!seller.phoneDigits || !seller.phoneLast10) {
        seller.phoneDigits = digits;
        seller.phoneLast10 = phoneSuffix;
      }
      
      seller.isVerified = true;
      seller.lastLogin = new Date();
      await seller.save();
    }

    const { accessToken, refreshToken } = await createAuthTokens(seller._id);

    return sendResponse(res, 200, "Seller login successful", {
      accessToken,
      refreshToken,
      seller: serializeSellerProfile(seller),
    });
  } catch (error) {
    return sendError(res, 400, error.message || "OTP verification failed");
  }
};

export const getSellerCategoryTreeController = async (_req, res) => {
  try {
    const tree = await buildSellerCategoryTree();
    return res.json({ success: true, result: tree });
  } catch (error) {
    return sendError(res, 500, error.message || "Failed to load categories");
  }
};

export const getSellerProductsController = async (req, res) => {
  try {
    const sellerId = sellerScope(req);
    const page = Math.max(1, num(req.query?.page, 1));
    const limit = Math.max(1, Math.min(100, num(req.query?.limit, 20)));
    const skip = (page - 1) * limit;
    const stockStatus = str(req.query?.stockStatus).toLowerCase();

    const query = { sellerId };
    if (stockStatus === "in") query.stock = { $gt: 0 };
    if (stockStatus === "out") query.stock = 0;

    const [items, total] = await Promise.all([
      populateProductQuery(
        SellerProduct.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
      ).lean(),
      SellerProduct.countDocuments(query),
    ]);

    return res.json({
      success: true,
      result: {
        items: items.map(serializeProduct),
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    return sendError(res, 500, error.message || "Failed to load products");
  }
};

export const getSellerProductByIdController = async (req, res) => {
  try {
    const sellerId = sellerScope(req);
    const { productId } = req.params;

    const product = await populateProductQuery(
      SellerProduct.findOne({ _id: productId, sellerId }),
    );

    if (!product) {
      return sendError(res, 404, "Product not found");
    }

    return res.json({ success: true, result: serializeProduct(product) });
  } catch (error) {
    return sendError(res, 500, error.message || "Failed to load product");
  }
};

export const createSellerProductController = async (req, res) => {
  try {
    const sellerId = sellerScope(req);
    const clientRequestId = str(req.body?.clientRequestId);
    const existingByRequest = clientRequestId
      ? await SellerProduct.findOne({ sellerId, clientRequestId })
      : null;

    const basePayload = await parseProductPayload(req, existingByRequest);

    if (basePayload.variants && basePayload.variants.length > 0) {
      basePayload.stock = basePayload.variants.reduce(
        (sum, v) => sum + (Number(v.stock) || 0),
        0,
      );
      const first = basePayload.variants[0] || {};
      basePayload.price = Number(first.price) || 0;
      basePayload.salePrice = Number(first.salePrice) || 0;
      basePayload.mrp = Number(first.price) || basePayload.mrp || 0;
    }

    const categoryIds = await resolveSellerCategoryIds({
      headerId: req.body?.headerId || existingByRequest?.headerId,
      categoryId: req.body?.categoryId || existingByRequest?.categoryId,
    });

    const nextStatus = String(basePayload.status || "active").toLowerCase() === "inactive"
      ? "inactive"
      : "active";

    if (existingByRequest) {
      Object.assign(existingByRequest, {
        ...basePayload,
        ...categoryIds,
        subcategoryId: null,
        status: nextStatus,
        isActive: nextStatus === "active",
        clientRequestId,
        approvalStatus:
          existingByRequest.approvalStatus === "approved"
            ? "approved"
            : basePayload.approvalStatus || existingByRequest.approvalStatus || "approved",
        approvedAt:
          existingByRequest.approvalStatus === "approved" || basePayload.approvalStatus === "approved"
            ? existingByRequest.approvedAt || new Date()
            : existingByRequest.approvedAt || null,
      });
      existingByRequest.markModified("variants");
      existingByRequest.markModified("galleryImages");
      existingByRequest.markModified("tags");
      await existingByRequest.save();
      await syncSellerInventoryNotification(sellerId, existingByRequest);

      const populatedExisting = await populateProductQuery(
        SellerProduct.findById(existingByRequest._id),
      ).lean();

      return res.json({
        success: true,
        result: serializeProduct(populatedExisting),
        duplicated: false,
        updatedExisting: true,
      });
    }

    const product = await SellerProduct.create({
      sellerId,
      ...basePayload,
      ...categoryIds,
      subcategoryId: null,
      status: nextStatus,
      isActive: nextStatus === "active",
      approvalStatus: "approved",
      approvedAt: new Date(),
      clientRequestId,
    });

    await syncSellerInventoryNotification(sellerId, product);

    const populated = await populateProductQuery(
      SellerProduct.findById(product._id),
    ).lean();

    return res
      .status(201)
      .json({ success: true, result: serializeProduct(populated) });
  } catch (error) {
    if (error?.statusCode === 400) {
      return sendError(res, 400, error.message);
    }
    if (error?.code === 11000) {
      const keys = error.keyPattern ? Object.keys(error.keyPattern) : [];
      if (keys.includes("clientRequestId")) {
        const sellerId = sellerScope(req);
        const requestId = str(req.body?.clientRequestId);
        if (sellerId && requestId) {
          const raced = await SellerProduct.findOne({ sellerId, clientRequestId: requestId }).lean();
          if (raced) {
            return res.json({
              success: true,
              result: serializeProduct(raced),
              updatedExisting: true,
            });
          }
        }
      }
      if (keys.includes("slug")) {
        return sendError(res, 400, "Product slug already exists in your store");
      }
      if (keys.includes("sku")) {
        return sendError(res, 400, "SKU already exists in your store");
      }
      return sendError(res, 400, "Product slug or SKU already exists in your store");
    }
    return sendError(res, 500, error.message || "Failed to create product");
  }
};

export const updateSellerProductController = async (req, res) => {
  try {
    const sellerId = sellerScope(req);
    const { productId } = req.params;
    const existing = await SellerProduct.findOne({ _id: productId, sellerId });
    if (!existing) {
      return sendError(res, 404, "Product not found");
    }

    const categoryIds = await resolveSellerCategoryIds({
      headerId: req.body?.headerId || existing.headerId,
      categoryId: req.body?.categoryId || existing.categoryId,
    });

    const payload = await parseProductPayload(req, existing);

    if (payload.variants && payload.variants.length > 0) {
      payload.stock = payload.variants.reduce(
        (sum, v) => sum + (Number(v.stock) || 0),
        0,
      );
      const first = payload.variants[0] || {};
      payload.price = Number(first.price) || 0;
      payload.salePrice = Number(first.salePrice) || 0;
      payload.mrp = Number(first.price) || payload.mrp || 0;
    }

    const nextStatus = String(payload.status || existing.status || "active").toLowerCase() === "inactive"
      ? "inactive"
      : "active";

    Object.assign(existing, {
      ...payload,
      ...categoryIds,
      subcategoryId: null,
      status: nextStatus,
      isActive: nextStatus === "active",
      // Never demote an already-approved live product on edit.
      approvalStatus:
        existing.approvalStatus === "approved"
          ? "approved"
          : payload.approvalStatus || existing.approvalStatus || "approved",
      approvedAt:
        existing.approvalStatus === "approved" || payload.approvalStatus === "approved"
          ? existing.approvedAt || new Date()
          : existing.approvedAt || null,
    });

    existing.markModified("variants");
    existing.markModified("galleryImages");
    existing.markModified("tags");

    await existing.save();
    await syncSellerInventoryNotification(sellerId, existing);

    const populated = await populateProductQuery(
      SellerProduct.findById(existing._id),
    ).lean();

    return res.json({ success: true, result: serializeProduct(populated) });
  } catch (error) {
    if (error?.statusCode === 400) {
      return sendError(res, 400, error.message);
    }
    if (error?.code === 11000) {
      const keys = error.keyPattern ? Object.keys(error.keyPattern) : [];
      if (keys.includes("slug")) {
        return sendError(res, 400, "Product slug already exists in your store");
      }
      if (keys.includes("sku")) {
        return sendError(res, 400, "SKU already exists in your store");
      }
      return sendError(res, 400, "Product slug or SKU already exists in your store");
    }
    return sendError(res, 500, error.message || "Failed to update product");
  }
};

export const deleteSellerProductController = async (req, res) => {
  try {
    const sellerId = sellerScope(req);
    const { productId } = req.params;
    const deleted = await SellerProduct.findOneAndDelete({
      _id: productId,
      sellerId,
    });

    if (!deleted) {
      return sendError(res, 404, "Product not found");
    }

    await SellerNotification.deleteMany({
      sellerId,
      key: {
        $in: [`inventory:${deleted._id}:low`, `inventory:${deleted._id}:out`],
      },
    });

    return res.json({ success: true, result: { deleted: true } });
  } catch (error) {
    return sendError(res, 500, error.message || "Failed to delete product");
  }
};

export const getSellerStockHistoryController = async (req, res) => {
  try {
    const sellerId = sellerScope(req);
    const history = await SellerStockAdjustment.find({ sellerId })
      .populate("productId", "name")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.json({
      success: true,
      result: history.map((item) => ({
        ...item,
        product: item.productId
          ? {
            _id: item.productId._id,
            name: item.productId.name,
          }
          : null,
      })),
    });
  } catch (error) {
    return sendError(res, 500, error.message || "Failed to load stock history");
  }
};

export const adjustSellerStockController = async (req, res) => {
  try {
    const sellerId = sellerScope(req);
    const productId = str(req.body?.productId);
    const quantity = num(req.body?.quantity);
    const type = str(req.body?.type) || "Correction";
    const variantName = str(req.body?.variantName);
    const variantId = str(req.body?.variantId);

    const product = await SellerProduct.findOne({ _id: productId, sellerId });
    if (!product) {
      return sendError(res, 404, "Product not found");
    }

    const variants = Array.isArray(product.variants) ? product.variants : [];
    if (variants.length > 0) {
      let target =
        (variantId &&
          variants.find((v) => String(v._id) === String(variantId))) ||
        (variantName &&
          variants.find(
            (v) =>
              String(v.name || "").toLowerCase() ===
              variantName.toLowerCase(),
          )) ||
        variants[0];

      if (!target) {
        return sendError(res, 404, "Variant not found");
      }

      target.stock = Math.max(0, num(target.stock) + quantity);
      product.stock = variants.reduce(
        (sum, v) => sum + Math.max(0, Number(v.stock) || 0),
        0,
      );
      const first = variants[0] || {};
      product.price = Number(first.price) || product.price || 0;
      product.salePrice = Number(first.salePrice) || product.salePrice || 0;
    } else {
      product.stock = Math.max(0, num(product.stock) + quantity);
    }

    product.status = product.stock === 0 ? "inactive" : "active";
    product.isActive = product.stock > 0;
    product.markModified("variants");
    await product.save();

    await SellerStockAdjustment.create({
      sellerId,
      productId: product._id,
      type,
      quantity,
      note: str(req.body?.note),
    });

    await syncSellerInventoryNotification(sellerId, product);

    return res.json({ success: true, result: serializeProduct(product) });
  } catch (error) {
    return sendError(res, 500, error.message || "Failed to adjust stock");
  }
};

export const getSellerProfileController = async (req, res) => {
  try {
    const sellerId = sellerScope(req);
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return sendError(res, 404, "Seller not found");
    }

    if (Object.prototype.hasOwnProperty.call(seller.toObject(), "serviceRadius")) {
      seller.set("serviceRadius", undefined);
      await Seller.updateOne({ _id: sellerId }, { $unset: { serviceRadius: "" } });
    }

    // Admin Hub sellers are bound to the zone admin created — repair binding if needed.
    if (seller.isAdminHub === true) {
      await ensureAdminHubZoneBinding(seller);
    }

    return res.json({
      success: true,
      result: await withSellerZoneType(serializeSellerProfile(seller), seller),
    });
  } catch (error) {
    return sendError(
      res,
      500,
      error.message || "Failed to load seller profile",
    );
  }
};

/**
 * Zones available for this seller.
 * Admin Hub → only the zone admin assigned (locked).
 * External sellers → Multi Vendor zones only.
 */
export const getSellerZonesController = async (req, res) => {
  try {
    const seller = await Seller.findById(sellerScope(req));
    if (!seller) {
      return sendError(res, 404, "Seller not found");
    }

    if (seller.isAdminHub === true) {
      await ensureAdminHubZoneBinding(seller);
      const zoneId = seller.shopInfo?.zoneId;
      const zone = zoneId
        ? await QuickZone.findById(zoneId).select(ZONE_SELECT_PUBLIC).lean()
        : null;

      return sendResponse(res, 200, "Zones fetched successfully", {
        zones: zone ? [mapZoneDto(zone)] : [],
        locked: true,
        isAdminHub: true,
      });
    }

    const zones = await QuickZone.find({
      isActive: true,
      zoneType: { $ne: ZONE_TYPE.SINGLE },
    })
      .select(ZONE_SELECT_PUBLIC)
      .sort({ createdAt: 1 })
      .lean();

    return sendResponse(res, 200, "Zones fetched successfully", {
      zones: zones.map((zone) => mapZoneDto(zone)),
      locked: false,
      isAdminHub: false,
    });
  } catch (error) {
    return sendError(res, 500, error.message || "Failed to load zones");
  }
};

const ensureAdminHubZoneBinding = async (seller) => {
  if (!seller || seller.isAdminHub !== true) return seller;
  if (!seller.shopInfo) seller.shopInfo = {};

  if (seller.shopInfo.zoneId) {
    if (!seller.shopInfo.zoneSource) seller.shopInfo.zoneSource = "quick";
    return seller;
  }

  const zone = await QuickZone.findOne({
    adminHubSellerId: seller._id,
  })
    .select("_id name zoneName")
    .lean();

  if (!zone) return seller;

  seller.shopInfo.zoneId = zone._id;
  seller.shopInfo.zoneName = zone.zoneName || zone.name || "";
  seller.shopInfo.zoneSource = "quick";
  seller.markModified("shopInfo");
  await seller.save();
  return seller;
};

export const updateSellerProfileController = async (req, res) => {
  try {
    const seller = await Seller.findById(sellerScope(req));
    if (!seller) {
      return sendError(res, 404, "Seller not found");
    }

    const profileSnapshot = {
      name: seller.name,
      shopName: seller.shopName,
      email: seller.email,
      phone: seller.phone,
      location: seller.location
        ? JSON.parse(JSON.stringify(seller.location))
        : null,
      bankInfo: JSON.parse(JSON.stringify(seller.bankInfo || {})),
      documents: JSON.parse(JSON.stringify(seller.documents || {})),
      shopInfo: JSON.parse(JSON.stringify(seller.shopInfo || {})),
    };

    if (req.body?.name !== undefined)
      seller.name = str(req.body.name) || seller.name;
    if (req.body?.shopName !== undefined)
      seller.shopName = str(req.body.shopName) || seller.shopName;
    if (req.body?.phone !== undefined)
      seller.phone = str(req.body.phone) || seller.phone;
    if (req.body?.email !== undefined)
      seller.email = str(req.body.email).toLowerCase();

    const lat = optionalNumber(req.body?.lat);
    const lng = optionalNumber(req.body?.lng);
    const address = str(req.body?.address);
    const bankInfoBody =
      req.body?.bankInfo && typeof req.body.bankInfo === "object"
        ? req.body.bankInfo
        : {};
    const documentsBody =
      req.body?.documents && typeof req.body.documents === "object"
        ? req.body.documents
        : {};
    const shopInfoBody =
      req.body?.shopInfo && typeof req.body.shopInfo === "object"
        ? req.body.shopInfo
        : {};
    const files = req.files && typeof req.files === "object" ? req.files : {};
    const submitForApproval = optionalBoolean(
      req.body?.submitForApproval,
      false,
    );

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      seller.location = {
        type: "Point",
        coordinates: [lng, lat],
        latitude: lat,
        longitude: lng,
        formattedAddress: address || (seller.location ? (seller.location.formattedAddress || seller.location.address) : ""),
        address: address || (seller.location ? seller.location.address : ""),
      };
      seller.markModified("location");
    } else if (address) {
      if (!seller.location) {
        seller.location = {
          type: "Point",
          coordinates: [0, 0], // Default coordinates if missing but address provided
          latitude: 0,
          longitude: 0,
          formattedAddress: address,
          address: address,
        };
      } else {
        seller.location.formattedAddress = address;
        seller.location.address = address;
      }
      seller.markModified("location");
    }

    seller.bankInfo = seller.bankInfo || {};
    if (
      req.body?.bankName !== undefined ||
      bankInfoBody.bankName !== undefined
    ) {
      seller.bankInfo.bankName = str(
        bankInfoBody.bankName ?? req.body.bankName,
        "",
      );
    }
    if (
      req.body?.accountHolderName !== undefined ||
      bankInfoBody.accountHolderName !== undefined
    ) {
      seller.bankInfo.accountHolderName = str(
        bankInfoBody.accountHolderName ?? req.body.accountHolderName,
        "",
      );
    }
    if (
      req.body?.accountNumber !== undefined ||
      bankInfoBody.accountNumber !== undefined
    ) {
      seller.bankInfo.accountNumber = str(
        bankInfoBody.accountNumber ?? req.body.accountNumber,
        "",
      );
    }
    if (
      req.body?.ifscCode !== undefined ||
      bankInfoBody.ifscCode !== undefined
    ) {
      seller.bankInfo.ifscCode = str(
        bankInfoBody.ifscCode ?? req.body.ifscCode,
        "",
      );
    }
    if (
      req.body?.accountType !== undefined ||
      bankInfoBody.accountType !== undefined
    ) {
      seller.bankInfo.accountType = str(
        bankInfoBody.accountType ?? req.body.accountType,
        "",
      );
    }
    if (req.body?.upiId !== undefined || bankInfoBody.upiId !== undefined) {
      seller.bankInfo.upiId = str(bankInfoBody.upiId ?? req.body.upiId, "");
    }
    if (
      req.body?.upiQrImage !== undefined ||
      req.body?.upiQrCode !== undefined ||
      bankInfoBody.upiQrImage !== undefined
    ) {
      seller.bankInfo.upiQrImage = str(
        bankInfoBody.upiQrImage ?? req.body.upiQrImage ?? req.body.upiQrCode,
        "",
      );
    }
    if (files?.upiQrImage?.[0]) {
      seller.bankInfo.upiQrImage = await uploadImageBuffer(
        files.upiQrImage[0].buffer,
        "seller/upi-qr",
      );
    }

    seller.documents = seller.documents || {};
    if (
      req.body?.panNumber !== undefined ||
      documentsBody.panNumber !== undefined
    ) {
      seller.documents.panNumber = str(
        documentsBody.panNumber ?? req.body.panNumber,
        "",
      );
    }
    if (
      req.body?.gstRegistered !== undefined ||
      documentsBody.gstRegistered !== undefined
    ) {
      seller.documents.gstRegistered = optionalBoolean(
        documentsBody.gstRegistered ?? req.body.gstRegistered,
        seller.documents.gstRegistered === true,
      );
    }
    if (
      req.body?.gstNumber !== undefined ||
      documentsBody.gstNumber !== undefined
    ) {
      seller.documents.gstNumber = str(
        documentsBody.gstNumber ?? req.body.gstNumber,
        "",
      );
    }
    if (
      req.body?.gstLegalName !== undefined ||
      documentsBody.gstLegalName !== undefined
    ) {
      seller.documents.gstLegalName = str(
        documentsBody.gstLegalName ?? req.body.gstLegalName,
        "",
      );
    }
    if (
      req.body?.fssaiNumber !== undefined ||
      documentsBody.fssaiNumber !== undefined
    ) {
      seller.documents.fssaiNumber = str(
        documentsBody.fssaiNumber ?? req.body.fssaiNumber,
        "",
      );
    }
    if (
      req.body?.fssaiExpiry !== undefined ||
      documentsBody.fssaiExpiry !== undefined
    ) {
      seller.documents.fssaiExpiry = optionalDate(
        documentsBody.fssaiExpiry ?? req.body.fssaiExpiry,
      );
    }
    if (
      req.body?.fssaiImage !== undefined ||
      documentsBody.fssaiImage !== undefined
    ) {
      // Allow clearing during onboarding by sending an empty string.
      seller.documents.fssaiImage = str(
        documentsBody.fssaiImage ?? req.body.fssaiImage,
        "",
      );
    }
    if (
      req.body?.shopLicenseNumber !== undefined ||
      documentsBody.shopLicenseNumber !== undefined
    ) {
      seller.documents.shopLicenseNumber = str(
        documentsBody.shopLicenseNumber ?? req.body.shopLicenseNumber,
        "",
      );
    }
    if (
      req.body?.shopLicenseImage !== undefined ||
      documentsBody.shopLicenseImage !== undefined
    ) {
      // Allow clearing during onboarding by sending an empty string.
      seller.documents.shopLicenseImage = str(
        documentsBody.shopLicenseImage ?? req.body.shopLicenseImage,
        "",
      );
    }

    const [
      uploadedUpiQrImage,
      uploadedShopImage,
      uploadedFssaiImage,
      uploadedShopLicenseImage,
    ] = await Promise.all([
      files?.upiQrImage?.[0]?.buffer
        ? uploadImageBuffer(files.upiQrImage[0].buffer, "seller/upi-qr")
        : Promise.resolve(""),
      files?.shopImage?.[0]?.buffer
        ? uploadImageBuffer(files.shopImage[0].buffer, "seller/shop-image")
        : Promise.resolve(""),
      files?.fssaiImage?.[0]?.buffer
        ? uploadImageBuffer(files.fssaiImage[0].buffer, "seller/fssai")
        : Promise.resolve(""),
      files?.shopLicenseImage?.[0]?.buffer
        ? uploadImageBuffer(files.shopLicenseImage[0].buffer, "seller/shop-license")
        : Promise.resolve(""),
    ]);

    if (uploadedUpiQrImage) seller.bankInfo.upiQrImage = uploadedUpiQrImage;
    seller.shopInfo = seller.shopInfo || {};
    if (uploadedShopImage) seller.shopInfo.shopImage = uploadedShopImage;
    if (uploadedFssaiImage) seller.documents.fssaiImage = uploadedFssaiImage;
    if (uploadedShopLicenseImage) seller.documents.shopLicenseImage = uploadedShopLicenseImage;

    if (
      req.body?.shopLicenseExpiry !== undefined ||
      documentsBody.shopLicenseExpiry !== undefined
    ) {
      seller.documents.shopLicenseExpiry = optionalDate(
        documentsBody.shopLicenseExpiry ?? req.body.shopLicenseExpiry,
      );
    }
    if (
      req.body?.isDocumentsVerified !== undefined ||
      documentsBody.isDocumentsVerified !== undefined
    ) {
      seller.documents.isDocumentsVerified = optionalBoolean(
        documentsBody.isDocumentsVerified ?? req.body.isDocumentsVerified,
        seller.documents.isDocumentsVerified === true,
      );
    }

    seller.shopInfo = seller.shopInfo || {};
    if (
      req.body?.businessType !== undefined ||
      shopInfoBody.businessType !== undefined
    ) {
      const nextBusinessType = str(
        shopInfoBody.businessType ?? req.body.businessType,
        "",
      );
      seller.shopInfo.businessType =
        nextBusinessType === "Pharmacy" || !nextBusinessType
          ? "Quick Commerce"
          : nextBusinessType;
    }
    if (
      req.body?.alternatePhone !== undefined ||
      shopInfoBody.alternatePhone !== undefined
    ) {
      seller.shopInfo.alternatePhone = str(
        shopInfoBody.alternatePhone ?? req.body.alternatePhone,
        "",
      );
    }
    if (
      req.body?.supportEmail !== undefined ||
      shopInfoBody.supportEmail !== undefined
    ) {
      seller.shopInfo.supportEmail = str(
        shopInfoBody.supportEmail ?? req.body.supportEmail,
        "",
      );
    }
    if (req.body?.openingHours !== undefined ||
      shopInfoBody.openingHours !== undefined
    ) {
      seller.shopInfo.openingHours = str(
        shopInfoBody.openingHours ?? req.body.openingHours,
        "",
      );
    }

    // Admin Hub: zone is fixed by admin at zone-create — never allow seller to change it.
    if (seller.isAdminHub === true) {
      await ensureAdminHubZoneBinding(seller);
      const requestedZoneId = objectIdOrNull(
        shopInfoBody.zoneId ?? req.body?.zoneId,
      );
      if (
        requestedZoneId &&
        seller.shopInfo?.zoneId &&
        String(requestedZoneId) !== String(seller.shopInfo.zoneId)
      ) {
        return sendError(
          res,
          403,
          "Admin Hub zone is assigned by admin and cannot be changed",
        );
      }
      if (!seller.shopInfo.zoneSource) seller.shopInfo.zoneSource = "quick";
    } else {
      if (req.body?.zoneId !== undefined || shopInfoBody.zoneId !== undefined) {
        seller.shopInfo.zoneId = objectIdOrNull(
          shopInfoBody.zoneId ?? req.body.zoneId,
        );
      }
      if (
        req.body?.zoneSource !== undefined ||
        shopInfoBody.zoneSource !== undefined
      ) {
        const zoneSource = str(
          shopInfoBody.zoneSource ?? req.body.zoneSource,
          "",
        ).toLowerCase();
        seller.shopInfo.zoneSource =
          zoneSource === "quick" ? "quick" : zoneSource === "food" ? "food" : "";
      }
      if (
        req.body?.zoneName !== undefined ||
        shopInfoBody.zoneName !== undefined
      ) {
        seller.shopInfo.zoneName = str(
          shopInfoBody.zoneName ?? req.body.zoneName,
          "",
        );
      }
    }
    if (
      req.body?.shopImage !== undefined ||
      shopInfoBody.shopImage !== undefined
    ) {
      // Allow clearing during onboarding by sending an empty string.
      seller.shopInfo.shopImage = str(
        shopInfoBody.shopImage ?? req.body.shopImage,
        "",
      );
    }

    // External sellers cannot join Single Vendor zones (Admin Hub is exempt / locked).
    const zoneAssignmentChanged =
      seller.isAdminHub !== true &&
      (req.body?.zoneId !== undefined ||
        shopInfoBody.zoneId !== undefined ||
        req.body?.zoneSource !== undefined ||
        shopInfoBody.zoneSource !== undefined ||
        submitForApproval);

    if (zoneAssignmentChanged && seller.shopInfo?.zoneId) {
      try {
        const joinedZone = await assertSellerCanJoinZone(seller.shopInfo.zoneId, {
          zoneSource: seller.shopInfo.zoneSource || "quick",
        });
        if (joinedZone && !seller.shopInfo.zoneName) {
          seller.shopInfo.zoneName = joinedZone.zoneName || joinedZone.name || "";
        }
        if (joinedZone && !seller.shopInfo.zoneSource) {
          seller.shopInfo.zoneSource = "quick";
        }
      } catch (zoneError) {
        return sendError(
          res,
          zoneError.status || 403,
          zoneError.message || "Cannot assign this service zone",
        );
      }
    }

    const requiresProfileReview =
      sellerHadPriorApproval(seller) && !submitForApproval;

    if (requiresProfileReview) {
      const patch = buildSellerProfilePatch({
        body: req.body,
        bankInfoBody,
        documentsBody,
        shopInfoBody,
        uploaded: {
          upiQrImage: uploadedUpiQrImage,
          shopImage: uploadedShopImage,
          fssaiImage: uploadedFssaiImage,
          shopLicenseImage: uploadedShopLicenseImage,
        },
        lat,
        lng,
        address,
      });

      const { stagedPatch, shouldStage } = splitSellerReviewablePatch(
        profileSnapshot,
        patch,
        { requiresReview: true },
      );

      if (shouldStage) {
        restoreStagedFieldsFromSnapshot(seller, profileSnapshot, stagedPatch);
        seller.pendingProfileChanges = mergeSellerPendingProfileChanges(
          seller.pendingProfileChanges,
          stagedPatch,
          profileSnapshot,
        );
        seller.markModified("pendingProfileChanges");

        await upsertSellerNotification(seller._id, {
          key: `profile-update:${String(seller._id)}:submitted`,
          type: "system",
          title: "Profile changes submitted",
          message:
            "Your requested profile changes are with our team for review. Customers still see your current approved details until admin approves.",
          link: "/seller/profile",
        });
      }
    }

    if (submitForApproval) {
      const razorpayOrderId = str(req.body?.razorpayOrderId);
      const razorpayPaymentId = str(req.body?.razorpayPaymentId);
      const razorpaySignature = str(req.body?.razorpaySignature);

      if (seller.approvalStatus !== "rejected") {
        // Verify onboarding fee payment if required
        const { verifyAndConsumeOnboardingPayment } = await import("../../../common/services/onboardingFee.service.js");
        await verifyAndConsumeOnboardingPayment({
          role: "SELLER",
          paymentDetails: { razorpayOrderId, razorpayPaymentId, razorpaySignature },
          userDetails: { name: seller.name, phone: seller.phone, email: seller.email },
          entityId: seller._id
        });
      }

      const isReapply =
        seller.approvalStatus === "rejected" ||
        seller.wasPreviouslyRejected === true;

      seller.onboardingSubmitted = true;
      seller.approved = false;
      seller.approvalStatus = "pending";
      // Clear live rejection note for the seller UI, but keep history for admin "Re-applied"
      if (isReapply) {
        seller.wasPreviouslyRejected = true;
        if (!seller.lastRejectionReason && seller.approvalNotes) {
          seller.lastRejectionReason = seller.approvalNotes;
        }
      }
      seller.approvalNotes = "";
      seller.approvedAt = null;
      seller.rejectedAt = null;
      if (seller.pendingProfileChanges?.hasPendingUpdate) {
        seller.pendingProfileChanges = {
          hasPendingUpdate: false,
          proposed: null,
          previous: null,
          changeTypes: [],
          reason: "",
          requestedAt: null,
        };
        seller.markModified("pendingProfileChanges");
      }
    }

    await seller.save();
    await Seller.updateOne({ _id: seller._id }, { $unset: { serviceRadius: "" } });

    return res.json({
      success: true,
      result: await withSellerZoneType(serializeSellerProfile(seller), seller),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return sendError(
        res,
        400,
        "Phone or email already belongs to another seller",
      );
    }
    return sendError(
      res,
      500,
      error.message || "Failed to update seller profile",
    );
  }
};

export const getSellerNotificationsController = async (req, res) => {
  try {
    const sellerId = sellerScope(req);
    const notifications = await SellerNotification.find({ sellerId })
      .sort({ createdAt: -1 })
      .limit(25)
      .lean();

    return res.json({
      success: true,
      result: {
        notifications,
        items: notifications,
        unreadCount: notifications.filter((item) => !item.isRead).length,
      },
    });
  } catch (error) {
    return sendError(res, 500, error.message || "Failed to load notifications");
  }
};

export const markSellerNotificationReadController = async (req, res) => {
  try {
    const sellerId = sellerScope(req);
    const updated = await SellerNotification.findOneAndUpdate(
      { _id: req.params.notificationId, sellerId },
      { $set: { isRead: true } },
      { new: true },
    ).lean();

    if (!updated) {
      return sendError(res, 404, "Notification not found");
    }

    return res.json({ success: true, result: updated });
  } catch (error) {
    return sendError(
      res,
      500,
      error.message || "Failed to update notification",
    );
  }
};

export const markAllSellerNotificationsReadController = async (req, res) => {
  try {
    await SellerNotification.updateMany(
      { sellerId: sellerScope(req), isRead: false },
      { $set: { isRead: true } },
    );

    return res.json({ success: true, result: { success: true } });
  } catch (error) {
    return sendError(
      res,
      500,
      error.message || "Failed to update notifications",
    );
  }
};

export const getSellerOrdersController = async (req, res) => {
  try {
    const sellerId = sellerScope(req);
    const sellerKey = String(sellerId);

    const page = Math.max(1, num(req.query?.page, 1));
    const limit = Math.max(1, Math.min(100, num(req.query?.limit, 50)));
    const skip = (page - 1) * limit;

    // Use parent collection as the source of truth as requested
    const parentQuery = {
      items: { $elemMatch: { sourceId: sellerKey, type: "quick" } },
      ...getSellerVisibleQuickOrderPaymentFilter(),
    };

    if (req.query?.startDate || req.query?.endDate) {
      parentQuery.createdAt = {};
      if (req.query?.startDate) {
        parentQuery.createdAt.$gte = new Date(`${req.query.startDate}T00:00:00.000Z`);
      }
      if (req.query?.endDate) {
        parentQuery.createdAt.$lte = new Date(`${req.query.endDate}T23:59:59.999Z`);
      }
    }

    // Returned tab: restrict pagination to orders that actually have a return so
    // the seller sees every returned order, not just the ones on page 1.
    const returnsOnly = ["1", "true", "yes"].includes(
      str(req.query?.returnsOnly).toLowerCase(),
    );
    if (returnsOnly) {
      const returnedOrderIds = await SellerReturn.find({ sellerId })
        .distinct("orderId");
      parentQuery.orderId = { $in: returnedOrderIds.length ? returnedOrderIds : ["__none__"] };
    }

    const [parentOrders, total] = await Promise.all([
      QuickOrder.find(parentQuery)
        .populate("userId", "name phone email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      QuickOrder.countDocuments(parentQuery),
    ]);

    if (!parentOrders.length) {
      return res.json({
        success: true,
        result: { items: [], total: 0, page, limit, totalPages: 0 },
      });
    }

    const parentIds = parentOrders.map((p) => p._id);
    const existingSellerOrders = await SellerOrder.find({
      parentOrderId: { $in: parentIds },
      sellerId,
    }).lean();

    const existingMap = new Map(
      existingSellerOrders.map((so) => [String(so.parentOrderId), so]),
    );

    const items = await Promise.all(
      parentOrders.map(async (po) => {
        let so = existingMap.get(String(po._id));
        const parentStatus = String(po?.orderStatus || "").toLowerCase();

        if (!so) {
          const doc = await buildSellerOrderFromParentOrder(po, sellerId);
          if (doc) {
            so = await SellerOrder.findOneAndUpdate(
              { parentOrderId: po._id, sellerId },
              { $set: doc },
              { upsert: true, new: true, setDefaultsOnInsert: true },
            ).lean();
          }
        } else if (parentStatus === "delivered" && so.status !== "delivered") {
          so = await SellerOrder.findOneAndUpdate(
            { _id: so._id },
            {
              $set: {
                status: "delivered",
                workflowStatus: "DELIVERED",
                deliveredAt:
                  po.deliveryState?.deliveredAt || po.updatedAt || new Date(),
              },
            },
            { new: true },
          ).lean();
        } else if (
          parentStatus.startsWith("cancel") &&
          so.status !== "cancelled"
        ) {
          so = await SellerOrder.findOneAndUpdate(
            { _id: so._id },
            { $set: { status: "cancelled", workflowStatus: "CANCELLED" } },
            { new: true },
          ).lean();
        }
        return so;
      }),
    );

    const filteredItems = items.filter(Boolean);

    const quickOrderMap = new Map(
      parentOrders.map((order) => [String(order.orderId), order]),
    );

    // Read returns straight from SellerReturn so legacy orders (created before the
    // returnSummary mirror existed) still show their return state.
    const pageOrderIds = filteredItems
      .map((item) => String(item.orderId || ""))
      .filter(Boolean);
    const pageReturns = pageOrderIds.length
      ? await SellerReturn.find({ sellerId, orderId: { $in: pageOrderIds } }).lean()
      : [];
    const returnByOrderId = new Map(
      pageReturns.map((row) => [String(row.orderId), row]),
    );

    const deliveryPartnerIds = parentOrders
      .map((order) => order?.dispatch?.deliveryPartnerId)
      .filter(Boolean);

    const deliveryPartners = deliveryPartnerIds.length
      ? await Driver.find({ _id: { $in: deliveryPartnerIds } })
        .select("_id name phone vehicleType vehicleNumber")
        .lean()
      : [];

    const deliveryPartnerMap = new Map(
      deliveryPartners.map((partner) => [String(partner._id), partner]),
    );

    const enrichedItems = filteredItems.map((item) => {
      const quickOrder = quickOrderMap.get(String(item.orderId));
      const acceptedPartner = quickOrder?.dispatch?.deliveryPartnerId
        ? deliveryPartnerMap.get(String(quickOrder.dispatch.deliveryPartnerId))
        : null;

      const subtotal = num(item.pricing?.subtotal);
      const commission = num(item.pricing?.commission);
      const packingAmount =
        num(item.pricing?.packingAmount) ||
        num(quickOrder?.pricing?.packagingFee);
      const isCancelled = String(item.status || "").toLowerCase() === "cancelled";
      const payMethod = String(
        quickOrder?.payment?.method || item?.payment?.method || "",
      )
        .trim()
        .toLowerCase();
      const payStatus = String(quickOrder?.payment?.status || "")
        .trim()
        .toLowerCase();
      const isCod = ["cash", "cod", "cash_on_delivery"].includes(payMethod);
      const isPrepaidPaid =
        !isCod && ["paid", "captured", "refunded"].includes(payStatus);
      const receivable = isCancelled
        ? isPrepaidPaid
          ? packingAmount
          : 0
        : num(item.pricing?.receivable) ||
          Math.max(0, subtotal - commission + packingAmount);

      // Prefer full parent delivery address for seller UI.
      const parentAddr = quickOrder?.deliveryAddress || {};
      const legAddr = item.address || {};
      const fullAddress = {
        address:
          [
            parentAddr.street || legAddr.address || legAddr.street,
            parentAddr.additionalDetails || parentAddr.landmark,
          ]
            .filter(Boolean)
            .join(", ") ||
          legAddr.address ||
          "",
        city: parentAddr.city || legAddr.city || "",
        state: parentAddr.state || legAddr.state || "",
        zipCode: parentAddr.zipCode || parentAddr.pincode || legAddr.zipCode || "",
        landmark: parentAddr.landmark || legAddr.landmark || "",
        phone: parentAddr.phone || legAddr.phone || "",
        location: Array.isArray(parentAddr?.location?.coordinates)
          ? {
              lat: parentAddr.location.coordinates[1],
              lng: parentAddr.location.coordinates[0],
            }
          : legAddr.location || null,
      };

      let riderPhone = "";
      if (acceptedPartner) {
        const orderStatus = String(quickOrder?.orderStatus || "").toLowerCase();
        const deliveryStatus = String(quickOrder?.deliveryState?.status || "").toLowerCase();
        const reachedPickup =
          deliveryStatus === "reached_pickup" ||
          deliveryStatus === "picked_up" ||
          ["picked_up", "reached_drop", "delivered"].includes(orderStatus);
        const photoUploaded = !!quickOrder?.deliveryState?.billImageUrl;

        riderPhone = (reachedPickup && photoUploaded)
          ? (acceptedPartner.phone || "")
          : "Hidden until photo upload";
      }

      const resolvedCustomer = resolveQuickOrderCustomer(quickOrder, item);
      const returnDoc = returnByOrderId.get(String(item.orderId)) || null;
      const returnSummary = buildSellerOrderReturnSummary(returnDoc, {
        ...item,
        pricing: { ...item.pricing, receivable },
      });

      return {
        ...item,
        customer: {
          ...resolvedCustomer,
          phone:
            resolvedCustomer.phone ||
            fullAddress.phone ||
            item?.customer?.phone ||
            "",
        },
        address: fullAddress,
        returnSummary,
        returnStatus: returnSummary.returnStatus,
        returnTimeline: (returnDoc?.returnHistory || []).map((entry) => ({
          at: entry?.at || null,
          action: entry?.action || "",
          fromStatus: entry?.fromStatus || "",
          toStatus: entry?.toStatus || "",
          byRole: entry?.byRole || "SYSTEM",
          note: entry?.note || "",
        })),
        returnItems: (returnDoc?.returnItems || []).map((line) => ({
          name: line?.name || "",
          variantName: line?.variantName || "",
          image: line?.image || "",
          quantity: num(line?.returnedQty || line?.quantity),
          unitPrice: num(line?.unitPrice || line?.price),
          refundAmount: num(line?.refundAmount),
        })),
        pricing: {
          ...item.pricing,
          packingAmount,
          commission,
          subtotal,
          receivable,
          returnRefundDeducted: returnSummary.sellerDeductedAmount,
          netReceivable: returnSummary.hasReturn
            ? returnSummary.netReceivable
            : receivable,
        },
        statusHistory: Array.isArray(quickOrder?.statusHistory)
          ? quickOrder.statusHistory
          : [],
        orderStatus: quickOrder?.orderStatus || item.status,
        cancellationReason: resolveQuickOrderCancellationReason(quickOrder, item),
        orderType: (item.orderType || quickOrder?.orderType) === "mixed" ? "mixed" : "quick",
        dispatchStatus: quickOrder?.dispatch?.status || "unassigned",
        deliveryPartner: acceptedPartner
          ? {
            _id: acceptedPartner._id,
            name: acceptedPartner.name || "Delivery Partner",
            phone: riderPhone,
            vehicleType: acceptedPartner.vehicleType || "",
            vehicleNumber: acceptedPartner.vehicleNumber || "",
          }
          : null,
      };
    });

    // Best-effort: zero COD-cancel receivables + delete ghost packing credits.
    const cancelledCodIds = enrichedItems
      .filter((item) => {
        if (String(item.status || "").toLowerCase() !== "cancelled") return false;
        const method = String(
          quickOrderMap.get(String(item.orderId))?.payment?.method ||
            item?.payment?.method ||
            "",
        ).toLowerCase();
        return ["cash", "cod", "cash_on_delivery"].includes(method);
      })
      .map((item) => String(item.orderId || ""))
      .filter(Boolean);

    if (cancelledCodIds.length) {
      void Promise.all([
        SellerOrder.updateMany(
          { sellerId, orderId: { $in: cancelledCodIds }, status: "cancelled" },
          { $set: { "pricing.receivable": 0 } },
        ),
        SellerTransaction.deleteMany({
          sellerId,
          type: "Order Payment",
          orderId: { $in: cancelledCodIds },
        }),
      ]).catch(() => null);
    }

    return res.json({
      success: true,
      result: {
        items: enrichedItems,
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    return sendError(res, 500, error.message || "Failed to load orders");
  }
};

export const updateSellerOrderStatusController = async (req, res) => {
  try {
    const sellerId = sellerScope(req);
    const nextStatus = str(
      req.body?.status || req.body?.orderStatus,
    ).toLowerCase();
    const orderId = req.params.orderId;
    const reason = str(req.body?.reason || req.body?.cancellationReason);

    if (!nextStatus) {
      return sendError(res, 400, "Status is required");
    }

    // Sellers can only manually change status to 'confirmed', 'packed', or 'cancelled'
    // 'out_for_delivery' and 'delivered' are managed automatically by the delivery partner app
    const restrictedStatuses = ["out_for_delivery", "delivered"];
    if (restrictedStatuses.includes(nextStatus)) {
      return sendError(
        res,
        403,
        `Sellers cannot manually change order status to ${nextStatus.replace(/_/g, " ")}. This status is updated automatically by the delivery partner.`,
      );
    }

    const result = await quickOrderService.updateSellerOrderStatus(
      orderId,
      sellerId,
      nextStatus,
      reason,
    );
    return sendResponse(res, 200, "Order status updated", result);
  } catch (error) {
    logger.error(
      `Update seller order status failed: ${error?.message || error}`,
    );
    return sendError(
      res,
      error.statusCode || 500,
      error.message || "Failed to update order status",
    );
  }
};

export const resendSellerOrderDispatchController = async (req, res) => {
  try {
    const sellerId = sellerScope(req);
    const objectId = objectIdOrNull(req.params.orderId);
    const sellerOrder = await SellerOrder.findOne({
      sellerId,
      $or: [
        { orderId: req.params.orderId },
        ...(objectId ? [{ _id: objectId }] : []),
      ],
    }).lean();

    if (!sellerOrder) {
      return sendError(res, 404, "Order not found");
    }

    const quickOrder = await resolveParentQuickOrder(sellerOrder, {
      populateUser: true,
    });

    if (!quickOrder) {
      return sendError(res, 404, "Parent order not found");
    }

    if (
      [
        "delivered",
        "cancelled_by_user",
        "cancelled_by_restaurant",
        "cancelled_by_admin",
      ].includes(String(quickOrder.orderStatus || "").toLowerCase())
    ) {
      return sendError(res, 400, "This order can no longer be reassigned");
    }

    if (
      quickOrder.dispatch?.status === "accepted" &&
      quickOrder.dispatch?.deliveryPartnerId
    ) {
      return sendError(
        res,
        400,
        "A delivery partner has already accepted this order",
      );
    }

    const seller = await Seller.findById(sellerId)
      .select("shopName name phone location shopInfo")
      .lean();
    const origin = quickOrderService.getSellerLocation(seller);
    if (!origin) {
      return sendError(
        res,
        400,
        "Seller store location is not configured. Please update your store address in profile.",
      );
    }

    const nearbyPartners = await listNearbyOnlineDeliveryPartnersByCoords(
      origin,
      {
        maxKm: 15,
        limit: 15,
      },
    );

    const closestPartner = nearbyPartners[0];
    if (!closestPartner?.partnerId) {
      return sendError(res, 404, "No nearby online delivery partner found");
    }

    const now = new Date();
    quickOrder.dispatch = {
      ...(quickOrder.dispatch?.toObject?.() || quickOrder.dispatch || {}),
      modeAtCreation: quickOrder.dispatch?.modeAtCreation || "auto",
      status: "assigned",
      deliveryPartnerId: closestPartner.partnerId,
      assignedAt: now,
      acceptedAt: null,
      offeredTo: [
        ...(quickOrder.dispatch?.offeredTo || []).filter(Boolean),
        {
          partnerId: closestPartner.partnerId,
          at: now,
          action: "offered",
        },
      ],
    };
    await quickOrder.save();

    const io = getIO();
    const deliveryPayload = {
      ...buildDeliverySocketPayload(quickOrder, seller),
      orderId: quickOrder.orderId,
      orderMongoId: quickOrder._id?.toString?.(),
      restaurantName:
        seller?.shopName || seller?.name || "Quick Commerce Seller",
      restaurantPhone: seller?.phone || "",
      dispatch: quickOrder.dispatch,
      sourceType: "quick",
    };

    if (io) {
      for (const partner of nearbyPartners || []) {
        const deliveryRoom = rooms.delivery(partner.partnerId);
        const payloadWithDistance = {
          ...deliveryPayload,
          pickupDistanceKm: partner.distanceKm,
        };
        io.to(deliveryRoom).emit("new_order", payloadWithDistance);
        io.to(deliveryRoom).emit("new_order_available", payloadWithDistance);
        io.to(deliveryRoom).emit("play_notification_sound", {
          orderId: quickOrder.orderId,
          orderMongoId: quickOrder._id?.toString?.(),
        });

        await notifyOwnerSafely(
          { ownerType: "DELIVERY_PARTNER", ownerId: partner.partnerId },
          {
            title: "New nearby order",
            body: `Order #${quickOrder.orderId} is ready for pickup.`,
            data: {
              type: "new_order",
              orderId: quickOrder.orderId,
              orderMongoId: quickOrder._id?.toString?.(),
              link: "/delivery",
            },
          },
        );
      }
    }

    return sendResponse(res, 200, "Driver notified again", {
      orderId: quickOrder.orderId,
      dispatchStatus: quickOrder.dispatch?.status || "assigned",
      notifiedPartner: {
        _id: closestPartner.partnerId,
        name: closestPartner.name || "Delivery Partner",
        phone: closestPartner.phone || "",
        distanceKm: closestPartner.distanceKm,
      },
    });
  } catch (error) {
    logger.error(`Resend seller dispatch failed: ${error?.message || error}`);
    return sendError(
      res,
      500,
      error.message || "Failed to resend driver notification",
    );
  }
};

const enrichSellerReturnsWithOrderContext = async (returnDocs = [], sellerId) => {
  if (!returnDocs.length) return [];

  const orderIds = [...new Set(returnDocs.map((doc) => doc.orderId).filter(Boolean))];
  const partnerIds = [
    ...new Set(
      returnDocs
        .map((doc) => doc.dispatch?.deliveryPartnerId)
        .filter((id) => id && mongoose.isValidObjectId(String(id))),
    ),
  ];

  const [sellerOrders, parentOrders, deliveryPartners] = await Promise.all([
    SellerOrder.find({ sellerId, orderId: { $in: orderIds } })
      .select("orderId address customer items")
      .lean(),
    QuickOrder.find({ orderId: { $in: orderIds } })
      .select("orderId deliveryAddress items")
      .lean(),
    partnerIds.length
      ? Driver.find({ _id: { $in: partnerIds } })
          .select("name phone")
          .lean()
      : Promise.resolve([]),
  ]);

  const sellerOrderMap = new Map(sellerOrders.map((row) => [row.orderId, row]));
  const parentOrderMap = new Map(parentOrders.map((row) => [row.orderId, row]));
  const partnerMap = new Map(deliveryPartners.map((row) => [String(row._id), row]));

  return returnDocs.map((doc) => {
    const serialized = serializeReturnForSeller(doc);
    const sellerOrder = sellerOrderMap.get(doc.orderId);
    const parentOrder = parentOrderMap.get(doc.orderId);
    const partner = partnerMap.get(String(doc.dispatch?.deliveryPartnerId || ""));

    return {
      ...mergeSellerReturnOrderContext(serialized, {
        sellerOrder,
        deliveryAddress: parentOrder?.deliveryAddress,
        orderItems: parentOrder?.items || [],
      }),
      deliveryPartner: partner
        ? {
            id: String(partner._id),
            name: partner.name || "Delivery Partner",
            phone: partner.phone || "",
          }
        : null,
    };
  });
};

export const getSellerReturnsController = async (req, res) => {
  try {
    const sellerId = sellerScope(req);
    const items = await SellerReturn.find({ sellerId })
      .select('+sellerOtp')
      .sort({ returnRequestedAt: -1 })
      .lean();

    const enriched = await enrichSellerReturnsWithOrderContext(items, sellerId);

    return res.json({
      success: true,
      result: { items: enriched },
    });
  } catch (error) {
    return sendError(res, 500, error.message || "Failed to load returns");
  }
};

export const approveSellerReturnController = async (req, res) => {
  try {
    const sellerId = sellerScope(req);
    const { returnDoc, pickupDispatch } = await recordSellerReturnDecision({
      sellerId,
      orderId: req.params.orderId,
      decision: "approve",
      reason: str(req.body?.reason),
      actorRole: "SELLER",
      actorId: sellerId,
    });

    if (!returnDoc) {
      return sendError(res, 404, "Return request not found");
    }

    const populated = await SellerReturn.findById(returnDoc._id)
      .select("+sellerOtp")
      .lean();

    const [enriched] = await enrichSellerReturnsWithOrderContext([populated], sellerId);

    if (pickupDispatch && pickupDispatch.success === false) {
      return res.status(422).json({
        success: false,
        message:
          pickupDispatch.message ||
          'Return approved but pickup dispatch failed — no nearby delivery partner found',
        result: {
          ...enriched,
          pickupDispatch,
        },
      });
    }

    return res.json({
      success: true,
      result: {
        ...enriched,
        pickupDispatch,
      },
    });
  } catch (error) {
    const status = error?.statusCode || 500;
    return sendError(res, status, error.message || "Failed to approve return");
  }
};

export const rejectSellerReturnController = async (req, res) => {
  try {
    const sellerId = sellerScope(req);
    const { returnDoc } = await recordSellerReturnDecision({
      sellerId,
      orderId: req.params.orderId,
      decision: "reject",
      reason: str(req.body?.reason),
      actorRole: "SELLER",
      actorId: sellerId,
    });

    if (!returnDoc) {
      return sendError(res, 404, "Return request not found");
    }

    const [enriched] = await enrichSellerReturnsWithOrderContext(
      [returnDoc.toObject()],
      sellerId,
    );
    return res.json({ success: true, result: enriched });
  } catch (error) {
    const status = error?.statusCode || 500;
    return sendError(res, status, error.message || "Failed to reject return");
  }
};

export const requestSellerReturnPickupController = async (req, res) => {
  try {
    const sellerId = sellerScope(req);
    const result = await requestSellerReturnPickup({
      sellerId,
      orderId: req.params.orderId,
      actorId: sellerId,
    });

    return res.json({
      success: true,
      result,
    });
  } catch (error) {
    const status = error?.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: error.message || 'Failed to request return pickup',
      ...(error?.dispatchAudit ? { dispatchAudit: error.dispatchAudit } : {}),
      ...(error?.pickupDispatch ? { pickupDispatch: error.pickupDispatch } : {}),
    });
  }
};

export const getSellerEarningsController = async (req, res) => {
  try {
    const sellerId = sellerScope(req);

    // Ensure seller legs reflect parent delivery/cancellation even if realtime sync missed it.
    await reconcileSellerDeliveredOrders(sellerId);

    const [transactions, orders] = await Promise.all([
      SellerTransaction.find({ sellerId }).sort({ createdAt: -1 }).lean(),
      SellerOrder.find({ sellerId, status: "delivered" })
        .select("orderId customer pricing createdAt updatedAt deliveredAt")
        .lean(),
    ]);

    // COD/unpaid cancelled legs must not keep a positive receivable after cancel.
    // Also wipe any ghost Order Payment credits tied to cancelled COD orders.
    const cancelledLegs = await SellerOrder.find({ sellerId, status: "cancelled" })
      .select("orderId pricing parentOrderId")
      .lean();
    const cancelledIds = cancelledLegs.map((o) => String(o.orderId || "")).filter(Boolean);
    if (cancelledIds.length) {
      const parents = await QuickOrder.find({ orderId: { $in: cancelledIds } })
        .select("orderId payment")
        .lean();
      const prepaidCancelIds = new Set();
      const codCancelIds = [];
      parents.forEach((p) => {
        const method = String(p?.payment?.method || "").toLowerCase();
        const status = String(p?.payment?.status || "").toLowerCase();
        const isCod = ["cash", "cod", "cash_on_delivery"].includes(method);
        const isPrepaidPaid =
          !isCod && ["paid", "captured", "refunded"].includes(status);
        if (isPrepaidPaid) prepaidCancelIds.add(String(p.orderId));
        else codCancelIds.push(String(p.orderId));
      });

      if (codCancelIds.length) {
        await Promise.all([
          SellerOrder.updateMany(
            { sellerId, status: "cancelled", orderId: { $in: codCancelIds } },
            { $set: { "pricing.receivable": 0 } },
          ),
          SellerTransaction.deleteMany({
            sellerId,
            type: "Order Payment",
            orderId: { $in: codCancelIds },
          }),
        ]);
      }

      // Also drop legacy cancel packing credits that don't map to prepaid cancels.
      await SellerTransaction.deleteMany({
        sellerId,
        type: "Order Payment",
        reason: { $regex: /packing fee retained on seller cancel/i },
        ...(prepaidCancelIds.size
          ? { orderId: { $nin: [...prepaidCancelIds] } }
          : {}),
      }).catch(() => null);
    }

    // Re-read after purge so in-memory ledger/cards never reuse deleted cancel credits.
    const liveTransactions = await SellerTransaction.find({ sellerId })
      .sort({ createdAt: -1 })
      .lean();

    // Source of truth for cards: delivered SellerOrders only.
    // Cancel packing credits must NOT inflate Gross / Net / Available (esp. COD).
    const orderNetEarnings = orders.reduce((sum, o) => {
      const packing = num(o?.pricing?.packingAmount);
      const receivable =
        Number(o?.pricing?.receivable) ||
        Math.max(0, num(o?.pricing?.subtotal) - num(o?.pricing?.commission) + packing);
      return sum + num(receivable);
    }, 0);

    // Returned orders stay 'delivered', so their receivable is still counted in
    // orderNetEarnings above. Subtract whatever the return flow recovered from
    // this seller or the cards would keep showing money that was refunded.
    const sellerReturns = await SellerReturn.find({ sellerId })
      .select("orderId returnStatus refundStatus returnRefundAmount finance")
      .lean();

    const returnFinanceByOrderId = new Map();
    let returnRefundDeducted = 0;
    let returnRefundPending = 0;
    let returnRefundToCustomers = 0;
    let pickupFeesPaidByAdmin = 0;

    sellerReturns.forEach((row) => {
      const finance = row.finance || {};
      const applied = Boolean(finance.sellerLedgerApplied);
      const deducted = applied
        ? num(finance.preSettlementDeducted) + num(finance.postSettlementDebited)
        : 0;
      const refundAmount = num(row.returnRefundAmount);

      returnRefundDeducted += deducted;
      pickupFeesPaidByAdmin += num(finance.pickupFeeAdminExpense);
      if (String(row.refundStatus || "") === "completed") {
        returnRefundToCustomers += refundAmount;
      } else if (
        !["none", "failed"].includes(String(row.refundStatus || "")) ||
        [
          "return_approved",
          "return_pickup_assigned",
          "return_in_transit",
          "returned",
        ].includes(String(row.returnStatus || ""))
      ) {
        returnRefundPending += refundAmount;
      }

      returnFinanceByOrderId.set(String(row.orderId || ""), {
        deducted,
        refundAmount,
        preSettlementDeducted: applied ? num(finance.preSettlementDeducted) : 0,
        returnStatus: row.returnStatus || "",
        refundStatus: row.refundStatus || "",
      });
    });

    const returnedOrdersCount = sellerReturns.filter((row) =>
      ["returned", "refund_completed"].includes(String(row.returnStatus || "")),
    ).length;

    const totalNetEarnings = orderNetEarnings - returnRefundDeducted;

    const itemsSubtotal = orders.reduce(
      (sum, o) => sum + num(o.pricing?.subtotal),
      0,
    );
    const totalPacking = orders.reduce(
      (sum, o) => sum + num(o.pricing?.packingAmount),
      0,
    );
    const grossSales = itemsSubtotal + totalPacking;
    const totalCommission = orders.reduce(
      (sum, o) => sum + num(o.pricing?.commission),
      0,
    );
    const sellerCouponDiscount = orders.reduce((sum, o) => {
      const source = String(o?.pricing?.couponSource || "").toLowerCase();
      if (source !== "seller") return sum;
      return sum + num(o?.pricing?.couponDiscount);
    }, 0);
    const deliveryFees = orders.reduce(
      (sum, o) =>
        sum + Math.max(0, num(o.pricing?.total) - num(o.pricing?.subtotal) - num(o.pricing?.packingAmount)),
      0,
    );

    const deliveredOrderIds = new Set(
      orders.map((o) => String(o.orderId || "")).filter(Boolean),
    );

    const cleanTransactions = (liveTransactions || []).filter((item) => {
      if (item.type !== "Order Payment") return true;
      const oid = String(item.orderId || item.reference || "");
      const reason = String(item.reason || "").toLowerCase();
      if (reason.includes("packing fee retained on seller cancel")) {
        return reason.includes("prepaid");
      }
      return !oid || deliveredOrderIds.has(oid);
    });

    const totalWithdrawn = cleanTransactions
      .filter((item) => item.type === "Withdrawal" && item.status === "Settled")
      .reduce((sum, item) => sum + Math.abs(num(item.amount)), 0);
    const pendingPayouts = cleanTransactions
      .filter(
        (item) =>
          item.type === "Withdrawal" &&
          ["Pending", "Processing"].includes(String(item.status || "")),
      )
      .reduce((sum, item) => sum + Math.abs(num(item.amount)), 0);

    const settledBalance = Math.max(
      0,
      totalNetEarnings - totalWithdrawn - pendingPayouts,
    );

    // The return flow claws back pre-settlement refunds by shrinking the original
    // Order Payment row. Restore the full delivered receivable here and let the
    // Refund rows carry the deduction, so the ledger adds up to the cards above.
    const deliveredReceivableByOrderId = new Map(
      orders.map((o) => {
        const packing = num(o?.pricing?.packingAmount);
        return [
          String(o.orderId || ""),
          Number(o?.pricing?.receivable) ||
            Math.max(0, num(o?.pricing?.subtotal) - num(o?.pricing?.commission) + packing),
        ];
      }),
    );

    const ledgerTxns = cleanTransactions.map((item) => {
      const orderId = String(item.orderId || item.reference || "");

      if (item.type === "Order Payment" && deliveredReceivableByOrderId.has(orderId)) {
        return { ...item, amount: deliveredReceivableByOrderId.get(orderId) };
      }

      // Pre-settlement markers are stored at amount 0 to keep the balance intact.
      // Show the real recovered amount so the seller can see the money leaving.
      if (item.type === "RETURN_REFUND" && !num(item.amount)) {
        const preSettlement = num(
          returnFinanceByOrderId.get(orderId)?.preSettlementDeducted,
        );
        if (!preSettlement) return item;
        return {
          ...item,
          amount: -preSettlement,
          reason:
            item.reason ||
            "Return refund adjusted against this order before settlement",
        };
      }

      return item;
    });

    const existingOrderRefs = new Set(
      ledgerTxns
        .filter((t) => t.type === "Order Payment")
        .map((t) => String(t.orderId || t.reference || t._id || ""))
        .filter(Boolean),
    );
    const syntheticOrderTxns = orders
      .filter((o) => !existingOrderRefs.has(String(o.orderId || "")))
      .map((o) => {
        const packing = num(o?.pricing?.packingAmount);
        return {
          _id: o._id,
          reference: String(o.orderId || ""),
          orderId: String(o.orderId || ""),
          type: "Order Payment",
          amount:
            Number(o?.pricing?.receivable) ||
            Math.max(0, num(o?.pricing?.subtotal) - num(o?.pricing?.commission) + packing),
          status: "Settled",
          customer: o?.customer?.name || "Customer",
          createdAt: o?.deliveredAt || o?.updatedAt || o?.createdAt,
          reason: "Delivered order earnings",
        };
      });

    const mergedLedger = [...ledgerTxns, ...syntheticOrderTxns].sort(
      (a, b) => {
        const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      },
    );

    const balances = {
      totalRevenue: totalNetEarnings,
      totalNetEarnings,
      /** Delivered receivables before any return money was clawed back. */
      netEarningsBeforeReturns: orderNetEarnings,
      itemsSubtotal,
      totalPacking,
      grossSales,
      totalCommission,
      sellerCouponDiscount,
      deliveryFees,
      totalWithdrawn,
      settledBalance,
      pendingPayouts,
      /** Recovered from this seller for completed returns. */
      returnRefundDeducted,
      /** Refund value on returns still in flight — not deducted yet. */
      returnRefundPending,
      /** Total paid back to customers across this seller's returns. */
      returnRefundToCustomers,
      /** Return pickup charges the platform absorbed on the seller's behalf. */
      pickupFeesPaidByAdmin,
      returnedOrdersCount,
      totalReturns: sellerReturns.length,
    };

    const withdrawalLimits = await getSellerWithdrawalSettings();

    return res.json({
      success: true,
      result: {
        balances,
        withdrawalLimits,
        monthlyChart:
          orders.length > 0
            ? monthlyRevenueChartFromOrders(orders, returnFinanceByOrderId)
            : monthlyRevenueChart(cleanTransactions),
        ledger: serializeLedger(mergedLedger),
      },
    });
  } catch (error) {
    return sendError(res, 500, error.message || "Failed to load earnings");
  }
};

export const requestSellerWithdrawalController = async (req, res) => {
  try {
    const sellerId = sellerScope(req);
    const requestedMethod = str(
      req.body?.paymentMethod || req.body?.method,
    ).toLowerCase();

    const [seller, transactions, deliveredOrders, withdrawalLimits] = await Promise.all([
      Seller.findById(sellerId).select("bankInfo").lean(),
      SellerTransaction.find({ sellerId }).lean(),
      SellerOrder.find({ sellerId, status: "delivered" })
        .select("pricing")
        .lean(),
      getSellerWithdrawalSettings(),
    ]);

    let amount;
    try {
      amount = validateWithdrawalAmountAgainstLimits(req.body?.amount, withdrawalLimits);
    } catch (error) {
      return sendError(res, 400, error.message || "Enter a valid withdrawal amount");
    }

    const bankInfo = seller?.bankInfo || {};
    const hasUpi = Boolean(str(bankInfo.upiId));
    const hasBank =
      Boolean(str(bankInfo.bankName)) &&
      Boolean(str(bankInfo.accountHolderName)) &&
      Boolean(str(bankInfo.accountNumber)) &&
      Boolean(str(bankInfo.ifscCode));
    const paymentMethod =
      requestedMethod === "upi" && hasUpi
        ? "upi"
        : requestedMethod === "bank_transfer" && hasBank
          ? "bank_transfer"
          : requestedMethod === "bank" && hasBank
            ? "bank_transfer"
            : hasBank
              ? "bank_transfer"
              : hasUpi
                ? "upi"
                : "";

    if (!paymentMethod) {
      return sendError(
        res,
        400,
        "Add a bank account or UPI ID in your profile before requesting withdrawal",
      );
    }
    if (paymentMethod === "upi" && !hasUpi) {
      return sendError(res, 400, "Add a UPI ID in your profile to withdraw via UPI");
    }
    if (paymentMethod === "bank_transfer" && !hasBank) {
      return sendError(res, 400, "Complete bank details in your profile to withdraw to bank");
    }

    const orderNetEarnings = (deliveredOrders || []).reduce((sum, o) => {
      const packing = num(o?.pricing?.packingAmount);
      const receivable =
        Number(o?.pricing?.receivable) ||
        Math.max(0, num(o?.pricing?.subtotal) - num(o?.pricing?.commission) + packing);
      return sum + num(receivable);
    }, 0);

    // Mirror the earnings card math: returned orders remain 'delivered', so the
    // recovered refund has to come off before we quote an available balance.
    const appliedReturns = await SellerReturn.find({
      sellerId,
      "finance.sellerLedgerApplied": true,
    })
      .select("finance")
      .lean();

    const returnRefundDeducted = appliedReturns.reduce(
      (sum, row) =>
        sum +
        num(row?.finance?.preSettlementDeducted) +
        num(row?.finance?.postSettlementDebited),
      0,
    );

    const netEarnings = orderNetEarnings - returnRefundDeducted;

    const totalWithdrawn = transactions
      .filter((item) => item.type === "Withdrawal" && item.status === "Settled")
      .reduce((sum, item) => sum + Math.abs(num(item.amount)), 0);

    const pendingPayouts = transactions
      .filter(
        (item) =>
          item.type === "Withdrawal" &&
          ["Pending", "Processing"].includes(String(item.status || "")),
      )
      .reduce((sum, item) => sum + Math.abs(num(item.amount)), 0);

    const available = Math.max(
      0,
      netEarnings - totalWithdrawn - pendingPayouts,
    );

    const ledgerBalance = await getSellerWithdrawableBalance(sellerId);
    const availableFromLedger = ledgerBalance.withdrawable;
    const effectiveAvailable = Math.min(available, availableFromLedger);

    if (amount > effectiveAvailable) {
      return sendError(
        res,
        400,
        `Insufficient balance. Available: ${currency(effectiveAvailable)}`,
      );
    }

    const created = await SellerTransaction.create({
      sellerId,
      type: "Withdrawal",
      amount: -amount,
      status: "Pending",
      reference: `WDR-${Date.now()}`,
      customer: paymentMethod === "upi" ? "UPI Transfer" : "Bank Transfer",
      paymentMethod,
      bankDetails: {
        bankName: str(bankInfo.bankName),
        accountHolderName: str(bankInfo.accountHolderName),
        accountNumber: str(bankInfo.accountNumber),
        accountNumberLast4: String(bankInfo.accountNumber || "").replace(/\s/g, "").slice(-4),
        accountType: str(bankInfo.accountType),
        ifscCode: str(bankInfo.ifscCode).toUpperCase(),
        upiId: str(bankInfo.upiId),
        upiQrImage: str(bankInfo.upiQrImage),
      },
    });

    return res.status(201).json({ success: true, result: created.toObject() });
  } catch (error) {
    return sendError(res, 500, error.message || "Failed to create withdrawal");
  }
};

export const getSellerStatsController = async (req, res) => {
  try {
    const sellerId = sellerScope(req);
    const range = str(req.query?.range, "daily").toLowerCase();
    const [orders, products, transactions, statsReturns] = await Promise.all([
      SellerOrder.find({ sellerId }).sort({ createdAt: -1 }).lean(),
      populateProductQuery(SellerProduct.find({ sellerId })).lean(),
      SellerTransaction.find({ sellerId }).sort({ createdAt: -1 }).lean(),
      SellerReturn.find({ sellerId })
        .select("orderId returnStatus refundStatus returnRefundAmount finance returnRequestedAt")
        .lean(),
    ]);

    const deliveredOrders = orders.filter((o) => o.status === "delivered");

    const returnDeductionByOrderId = new Map(
      statsReturns.map((row) => [
        String(row.orderId || ""),
        row?.finance?.sellerLedgerApplied
          ? num(row.finance.preSettlementDeducted) + num(row.finance.postSettlementDebited)
          : 0,
      ]),
    );

    const grossSalesFromOrders = deliveredOrders.reduce((sum, order) => {
      const packing = num(order?.pricing?.packingAmount);
      return (
        sum +
        (num(order?.pricing?.receivable) ||
          Math.max(
            0,
            num(order?.pricing?.subtotal) - num(order?.pricing?.commission) + packing,
          ))
      );
    }, 0);

    const returnRefundDeducted = statsReturns.reduce(
      (sum, row) => sum + num(returnDeductionByOrderId.get(String(row.orderId || ""))),
      0,
    );

    // Returned orders keep status 'delivered', so net out the recovered refund.
    const totalSales = grossSalesFromOrders - returnRefundDeducted;
    const totalOrders = deliveredOrders.length;
    const avgOrderValue = totalOrders ? totalSales / totalOrders : 0;

    const returnsOverview = {
      totalReturns: statsReturns.length,
      activeReturns: statsReturns.filter((row) =>
        [
          "return_requested",
          "return_approved",
          "return_pickup_assigned",
          "return_in_transit",
        ].includes(String(row.returnStatus || "")),
      ).length,
      pendingApproval: statsReturns.filter(
        (row) => String(row.returnStatus || "") === "return_requested",
      ).length,
      completedReturns: statsReturns.filter((row) =>
        ["returned", "refund_completed"].includes(String(row.returnStatus || "")),
      ).length,
      rejectedReturns: statsReturns.filter(
        (row) => String(row.returnStatus || "") === "return_rejected",
      ).length,
      refundedToCustomers: statsReturns
        .filter((row) => String(row.refundStatus || "") === "completed")
        .reduce((sum, row) => sum + num(row.returnRefundAmount), 0),
      deductedFromEarnings: returnRefundDeducted,
      returnRate: totalOrders
        ? Math.round((statsReturns.length / totalOrders) * 1000) / 10
        : 0,
    };

    const chartBuckets = new Map();
    const now = new Date();
    if (range === "monthly") {
      for (let offset = 5; offset >= 0; offset -= 1) {
        const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
        chartBuckets.set(`${date.getFullYear()}-${date.getMonth()}`, {
          key: `${date.getFullYear()}-${date.getMonth()}`,
          name: date.toLocaleDateString("en-IN", { month: "short" }),
          sales: 0,
          returns: 0,
          traffic: 0,
        });
      }
    } else if (range === "weekly") {
      for (let offset = 3; offset >= 0; offset -= 1) {
        chartBuckets.set(`week-${offset}`, {
          key: `week-${offset}`,
          name: `W${4 - offset}`,
          sales: 0,
          returns: 0,
          traffic: 0,
        });
      }
    } else {
      for (let offset = 6; offset >= 0; offset -= 1) {
        const date = new Date(now);
        date.setDate(now.getDate() - offset);
        chartBuckets.set(
          `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
          {
            key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
            name: date.toLocaleDateString("en-IN", { weekday: "short" }),
            sales: 0,
            returns: 0,
            traffic: 0,
          },
        );
      }
    }

    orders.forEach((order) => {
      const createdAt = order.createdAt ? new Date(order.createdAt) : null;
      if (!createdAt || Number.isNaN(createdAt.getTime())) return;

      const key =
        range === "monthly"
          ? `${createdAt.getFullYear()}-${createdAt.getMonth()}`
          : range === "weekly"
            ? `week-${Math.min(
              3,
              Math.floor((now - createdAt) / (7 * 24 * 60 * 60 * 1000)),
            )}`
            : `${createdAt.getFullYear()}-${createdAt.getMonth()}-${createdAt.getDate()}`;

      const bucket = chartBuckets.get(key);
      if (!bucket) return;

      // Sales chart should only reflect earnings from delivered orders
      if (order.status === "delivered") {
        const receivable =
          num(order?.pricing?.receivable) ||
          Math.max(
            0,
            num(order?.pricing?.subtotal) - num(order?.pricing?.commission),
          );
        const refunded = num(returnDeductionByOrderId.get(String(order.orderId || "")));
        bucket.sales += Math.max(0, receivable - refunded);
        bucket.returns += refunded;
      }
      bucket.traffic += 1;
    });

    const categoryMixMap = new Map();
    products.forEach((product) => {
      const label =
        product?.categoryId?.name || product?.subcategoryId?.name || "Catalog";
      categoryMixMap.set(label, (categoryMixMap.get(label) || 0) + 1);
    });

    const topProductsMap = new Map();
    deliveredOrders.forEach((order) => {
      arr(order.items).forEach((item) => {
        const name = str(item.name, "Item");
        if (!topProductsMap.has(name)) {
          topProductsMap.set(name, { name, sales: 0, revenue: 0 });
        }
        const current = topProductsMap.get(name);
        current.sales += num(item.quantity, 1);
        current.revenue += num(item.price) * num(item.quantity, 1);
      });
    });

    const balances = {
      totalRevenue: totalSales,
    };

    return res.json({
      success: true,
      result: {
        overview: {
          totalSales: currency(totalSales),
          totalOrders: String(totalOrders),
          avgOrderValue: currency(avgOrderValue),
          conversionRate: `${Math.max(
            0,
            Math.min(
              99,
              Math.round(
                products.length ? (totalOrders / products.length) * 25 : 0,
              ),
            ),
          )}%`,
          salesTrend: "+0%",
          ordersTrend: "+0%",
          grossSales: currency(grossSalesFromOrders),
          returnDeductions: currency(returnRefundDeducted),
          totalReturns: String(returnsOverview.totalReturns),
          returnRate: `${returnsOverview.returnRate}%`,
        },
        returns: returnsOverview,
        salesTrend: Array.from(chartBuckets.values()),
        categoryMix: Array.from(categoryMixMap.entries()).map(
          ([subject, count]) => ({
            subject,
            A: count,
          }),
        ),
        topProducts: Array.from(topProductsMap.values())
          .sort((a, b) => b.sales - a.sales)
          .slice(0, 5)
          .map((item) => ({
            ...item,
            revenue: currency(item.revenue),
            trend: Math.max(0, Math.round(item.sales * 1.5)),
          })),
        trafficSources: [
          {
            name: "Direct",
            value: totalOrders ? Math.max(1, Math.round(totalOrders * 0.5)) : 0,
            color: "#0f172a",
          },
          {
            name: "Repeat",
            value: totalOrders ? Math.max(1, Math.round(totalOrders * 0.3)) : 0,
            color: "#16a34a",
          },
          {
            name: "Search",
            value: totalOrders ? Math.max(1, Math.round(totalOrders * 0.2)) : 0,
            color: "#2563eb",
          },
        ],
        insights: {
          topCity: orders[0]?.address?.city || "Local",
          peakTime: orders[0]?.createdAt
            ? `${String(new Date(orders[0].createdAt).getHours()).padStart(
              2,
              "0",
            )}:00`
            : "12:00",
          topDevice: balances.totalRevenue > 0 ? "Mobile" : "N/A",
        },
      },
    });
  } catch (error) {
    return sendError(res, 500, error.message || "Failed to load stats");
  }
};

export const listSellerCouponsController = async (req, res, next) => {
  try {
    const sellerId = sellerScope(req);
    const { listSellerCoupons } = await import("../services/sellerCoupon.service.js");
    const coupons = await listSellerCoupons(sellerId);
    return sendResponse(res, 200, "Coupons fetched successfully", coupons);
  } catch (error) {
    next(error);
  }
};

export const createSellerCouponController = async (req, res, next) => {
  try {
    const sellerId = sellerScope(req);
    const { createSellerCoupon } = await import("../services/sellerCoupon.service.js");
    const coupon = await createSellerCoupon(sellerId, req.body || {});
    return sendResponse(res, 201, "Coupon created and pending approval", coupon);
  } catch (error) {
    next(error);
  }
};

export const updateSellerCouponController = async (req, res, next) => {
  try {
    const sellerId = sellerScope(req);
    const couponId = req.params.id;
    const { updateSellerCoupon } = await import("../services/sellerCoupon.service.js");
    const coupon = await updateSellerCoupon(sellerId, couponId, req.body || {});
    return sendResponse(res, 200, "Coupon updated and pending approval", coupon);
  } catch (error) {
    next(error);
  }
};

export const deleteSellerCouponController = async (req, res, next) => {
  try {
    const sellerId = sellerScope(req);
    const couponId = req.params.id;
    const { deleteSellerCoupon } = await import("../services/sellerCoupon.service.js");
    const result = await deleteSellerCoupon(sellerId, couponId);
    return sendResponse(res, 200, "Coupon deleted successfully", result);
  } catch (error) {
    next(error);
  }
};

export const deleteSellerAccountController = async (req, res, next) => {
  try {
    const sellerId = sellerScope(req);
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return sendError(res, 404, "Seller profile not found");
    }

    // Soft delete
    seller.isDeleted = true;
    seller.accountStatus = "deleted";
    seller.isActive = false;
    await seller.save();

    // Invalidate/delete all active refresh tokens for this seller
    const { FoodRefreshToken } = await import("../../../../core/refreshTokens/refreshToken.model.js");
    await FoodRefreshToken.deleteMany({ userId: sellerId });

    return sendResponse(res, 200, "Seller account soft deleted successfully");
  } catch (error) {
    next(error);
  }
};

const parseCSV = (text) => {
  const lines = [];
  let row = [""];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push("");
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      lines.push(row.map(cell => cell.trim()));
      row = [""];
    } else {
      row[row.length - 1] += char;
    }
  }
  if (row.length > 1 || row[0] !== "") {
    lines.push(row.map(cell => cell.trim()));
  }
  return lines;
};

export const bulkUploadSellerProductsController = async (req, res) => {
  try {
    const sellerId = sellerScope(req);

    if (!req.file) {
      return sendError(res, 400, "Please upload a CSV file");
    }

    const csvText = req.file.buffer.toString("utf-8");
    const rows = parseCSV(csvText);

    if (rows.length < 2) {
      return sendError(res, 400, "CSV file is empty or only contains headers");
    }

    const headers = rows[0].map((h) => String(h || "").trim().toLowerCase());

    // ─── Aliases ────────────────────────────────────────────────────────────
    const nameAliases = ["name", "title", "product title", "productname"];
    const descriptionAliases = ["description", "about", "about this item", "aboutitem", "desc"];
    const brandAliases = ["brand", "brand name", "brandname"];
    const skuAliases = ["sku", "product code", "productcode", "code"];
    const priceAliases = ["price", "standard price", "selling price"];
    const salePriceAliases = ["saleprice", "sale price", "discounted price", "discountedprice"];
    const stockAliases = ["stock", "quantity", "qty", "stock level", "inventory"];
    const lowStockAlertAliases = ["lowstockalert", "low stock alert", "alert limit"];
    const headerIdAliases = ["headerid", "header_id", "main group id", "maingroupid"];
    const headerAliases = ["header", "main group", "maingroup", "group"];
    const categoryIdAliases = ["categoryid", "category_id", "specific category id"];
    const categoryAliases = ["category", "specific category", "specificcategory"];
    const subcategoryIdAliases = ["subcategoryid", "subcategory_id", "sub-category id"];
    const subcategoryAliases = ["subcategory", "sub-category", "sub category"];
    const mainImageAliases = ["mainimage", "main image", "cover photo", "image url", "image"];
    const galleryImagesAliases = ["galleryimages", "gallery images", "photos", "additional images"];
    const statusAliases = ["status", "state", "publish status"];
    const variantNameAliases = ["variantname", "variant name", "weight", "size", "unit"];
    const variantPriceAliases = ["variantprice", "variant price"];
    const variantSalePriceAliases = ["variantsaleprice", "variant sale price", "variant discounted price"];
    const variantStockAliases = ["variantstock", "variant stock", "variant quantity"];
    const variantSkuAliases = ["variantsku", "variant sku", "variant code"];
    const variantsAliases = ["variants", "variant list"];
    const tagsAliases = ["tags", "product tags"];

    // ─── Check required header ───────────────────────────────────────────────
    const hasAnyHeader = (aliases) => aliases.some((a) => headers.includes(a.toLowerCase()));

    if (!hasAnyHeader(nameAliases)) {
      return sendError(res, 400, "CSV is missing the product title/name column.");
    }

    // ─── Helper: get value by aliases ────────────────────────────────────────
    const getVal = (row, aliases) => {
      for (const alias of aliases) {
        const idx = headers.indexOf(alias.toLowerCase());
        if (idx !== -1) return String(row[idx] || "").trim();
      }
      return "";
    };

    // ─── Load categories once ────────────────────────────────────────────────
    const dbCategories = await QuickCategory.find({ isActive: { $ne: false } }).lean();
    const categoriesMap = new Map(dbCategories.map((c) => [String(c._id), c]));

    // FIX: O(1) category name lookup instead of O(n) .find() per product
    const categoryNameMap = new Map(
      dbCategories.map((c) => [
        `${c.type}:${String(c.parentId || "")}:${String(c.name || "").trim().toLowerCase()}`,
        c,
      ])
    );

    const findCategoryByName = (name, type, parentId = null) => {
      const key = `${type}:${String(parentId || "")}:${String(name || "").trim().toLowerCase()}`;
      return categoryNameMap.get(key) || null;
    };

    // ─── Group rows by product name ──────────────────────────────────────────
    const errors = [];
    const productGroups = new Map();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 0 || (row.length === 1 && !row[0])) continue;

      const rowNum = i + 1;
      const name = getVal(row, nameAliases);

      if (!name) {
        errors.push(`Row ${rowNum}: Product Title/Name is required.`);
        continue;
      }

      const nameKey = name.toLowerCase().trim();
      if (!productGroups.has(nameKey)) productGroups.set(nameKey, []);
      productGroups.get(nameKey).push({ row, rowNum });
    }

    // ─── Validate all product groups, collect errors first ──────────────────
    const productsToCreate = [];

    for (const [, group] of productGroups) {
      if (errors.length > 100) {
        errors.push("Too many validation errors. Showing first 100.");
        break;
      }

      const firstItem = group[0];
      const firstRow = firstItem.row;
      const mainRowNum = firstItem.rowNum;

      const name = getVal(firstRow, nameAliases);
      const description = getVal(firstRow, descriptionAliases);
      const brand = getVal(firstRow, brandAliases);
      const statusStr = getVal(firstRow, statusAliases).toLowerCase();
      const lowStockAlertStr = getVal(firstRow, lowStockAlertAliases) || "5";
      const mainImage = getVal(firstRow, mainImageAliases);
      const galleryImagesStr = getVal(firstRow, galleryImagesAliases);

      const groupErrors = [];

      if (statusStr && statusStr !== "active" && statusStr !== "inactive") {
        groupErrors.push(`Row ${mainRowNum}: Status must be either 'active' or 'inactive'.`);
      }

      const lowStockAlert = parseInt(lowStockAlertStr, 10);
      if (lowStockAlertStr && (isNaN(lowStockAlert) || lowStockAlert < 0)) {
        groupErrors.push(
          `Row ${mainRowNum}: Low Stock Alert must be a valid number greater than or equal to 0.`
        );
      }

      let resolvedHeaderId = null;
      let resolvedCategoryId = null;
      let resolvedSubcategoryId = null;

      const headerIdStr = getVal(firstRow, headerIdAliases);
      const headerNameStr = getVal(firstRow, headerAliases);
      const categoryIdStr = getVal(firstRow, categoryIdAliases);
      const categoryNameStr = getVal(firstRow, categoryAliases);
      const subcategoryIdStr = getVal(firstRow, subcategoryIdAliases);
      const subcategoryNameStr = getVal(firstRow, subcategoryAliases);

      if (headerIdStr && mongoose.Types.ObjectId.isValid(headerIdStr)) {
        const node = categoriesMap.get(headerIdStr);
        if (node && node.type === "header") resolvedHeaderId = headerIdStr;
      }
      if (!resolvedHeaderId && headerNameStr) {
        const node = findCategoryByName(headerNameStr, "header");
        if (node) resolvedHeaderId = String(node._id);
      }
      if (!resolvedHeaderId) {
        groupErrors.push(
          `Row ${mainRowNum}: Main Group (headerId or name) is missing, invalid, or does not exist.`
        );
      }

      if (resolvedHeaderId) {
        if (categoryIdStr && mongoose.Types.ObjectId.isValid(categoryIdStr)) {
          const node = categoriesMap.get(categoryIdStr);
          if (node && node.type === "category" && String(node.parentId) === resolvedHeaderId) {
            resolvedCategoryId = categoryIdStr;
          }
        }
        if (!resolvedCategoryId && categoryNameStr) {
          const node = findCategoryByName(categoryNameStr, "category", resolvedHeaderId);
          if (node) resolvedCategoryId = String(node._id);
        }
      }
      if (!resolvedCategoryId) {
        groupErrors.push(
          `Row ${mainRowNum}: Specific Category (categoryId or name) is missing, invalid, or does not belong to the selected Main Group.`
        );
      }

      // Sub-category layer removed — keep null for compatibility
      resolvedSubcategoryId = null;

      if (mainImage && !/^https?:\/\/.+/i.test(mainImage)) {
        groupErrors.push(
          `Row ${mainRowNum}: Main Cover Photo URL is invalid. It must start with http:// or https://.`
        );
      }

      const galleryImages = [];
      if (galleryImagesStr) {
        const urls = galleryImagesStr
          .split(",")
          .map((u) => u.trim())
          .filter(Boolean);
        for (const url of urls) {
          if (!/^https?:\/\/.+/i.test(url)) {
            groupErrors.push(
              `Row ${mainRowNum}: Gallery image URL '${url}' is invalid. It must start with http:// or https://.`
            );
          } else {
            galleryImages.push(url);
          }
        }
      }

      const variantsList = [];

      for (const { row, rowNum } of group) {
        const inlineVariantsStr = getVal(row, variantsAliases);

        if (inlineVariantsStr) {
          let inlineList = [];

          if (inlineVariantsStr.startsWith("[")) {
            try {
              inlineList = JSON.parse(inlineVariantsStr);
            } catch {
              groupErrors.push(`Row ${rowNum}: Invalid JSON format in variants column.`);
            }
          } else {
            const parts = inlineVariantsStr
              .split(/[;/]/)
              .map((p) => p.trim())
              .filter(Boolean);
            parts.forEach((part) => {
              const subParts = part.split(":").map((sp) => sp.trim());
              inlineList.push({
                name: subParts[0],
                price: parseFloat(subParts[1] || "0"),
                salePrice: parseFloat(subParts[2] || subParts[1] || "0"),
                stock: parseInt(subParts[3] || "0", 10),
              });
            });
          }

          inlineList.forEach((v, vIdx) => {
            const vLabel = `${rowNum} (variant #${vIdx + 1})`;
            const vName = v.name || "Default";
            const vPrice = parseFloat(v.price);
            const vSalePrice = parseFloat(v.salePrice ?? v.price);
            const vStock = parseInt(v.stock, 10);

            if (isNaN(vPrice) || vPrice < 0)
              groupErrors.push(`Row ${vLabel}: Variant price must be a valid number >= 0.`);
            if (isNaN(vSalePrice) || vSalePrice < 0)
              groupErrors.push(`Row ${vLabel}: Variant discounted price must be a valid number >= 0.`);
            if (isNaN(vStock) || vStock < 0)
              groupErrors.push(`Row ${vLabel}: Variant stock must be a valid number >= 0.`);

            variantsList.push({
              name: vName,
              price: isNaN(vPrice) ? 0 : vPrice,
              salePrice: isNaN(vSalePrice) ? (isNaN(vPrice) ? 0 : vPrice) : vSalePrice,
              stock: isNaN(vStock) ? 0 : vStock,
            });
          });
        } else {
          const vName = getVal(row, variantNameAliases) || "Default";
          const priceStr = getVal(row, variantPriceAliases) || getVal(row, priceAliases);
          const salePriceStr = getVal(row, variantSalePriceAliases) || getVal(row, salePriceAliases);
          const stockStr = getVal(row, variantStockAliases) || getVal(row, stockAliases);

          const price = parseFloat(priceStr);
          const salePrice = salePriceStr ? parseFloat(salePriceStr) : price;
          const stock = parseInt(stockStr, 10);

          if (isNaN(price) || price < 0)
            groupErrors.push(`Row ${rowNum}: Price must be a valid number >= 0.`);
          if (salePriceStr && (isNaN(salePrice) || salePrice < 0))
            groupErrors.push(`Row ${rowNum}: Discounted Price must be a valid number >= 0.`);
          if (isNaN(stock) || stock < 0)
            groupErrors.push(`Row ${rowNum}: Stock must be a valid number >= 0.`);

          variantsList.push({
            name: vName,
            price: isNaN(price) ? 0 : price,
            salePrice: isNaN(salePrice) ? (isNaN(price) ? 0 : price) : salePrice,
            stock: isNaN(stock) ? 0 : stock,
          });
        }
      }

      if (variantsList.length === 0) {
        groupErrors.push(`Row ${mainRowNum}: Product must have at least one variant.`);
      }

      errors.push(...groupErrors);

      if (groupErrors.length === 0 && errors.length === 0) {
        // Generate unique main SKU based on product name
        const cleanName = String(name || "")
          .toUpperCase()
          .trim()
          .replace(/[^A-Z0-9\s-]/g, "")
          .replace(/[\s-]+/g, "-");
        
        const baseSku = `SKU-${cleanName}`.substring(0, 40);
        const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
        const productSku = `${baseSku}-${randomSuffix}`;

        // Map SKUs to variants list with name-based suffixes
        const finalizedVariants = [];
        const variantSkuSet = new Set();
        variantsList.forEach((v, idx) => {
          const vName = v.name || "Default";
          let vSkuSuffix = `V${idx + 1}`;
          if (vName && vName.toLowerCase() !== "default") {
            const cleanVariant = String(vName)
              .toUpperCase()
              .trim()
              .replace(/[^A-Z0-9\s-]/g, "")
              .replace(/[\s-]+/g, "-");
            if (cleanVariant) {
              vSkuSuffix = cleanVariant;
            }
          }
          let proposedSku = `${productSku}-${vSkuSuffix}`;
          if (variantSkuSet.has(proposedSku)) {
            proposedSku = `${productSku}-${vSkuSuffix}-V${idx + 1}`;
          }
          variantSkuSet.add(proposedSku);
          finalizedVariants.push({
            ...v,
            sku: proposedSku
          });
        });

        const firstVariant = finalizedVariants[0];
        const finalSlug = `${slugify(name)}-${Math.random().toString(36).substring(2, 7)}`;
        const status = statusStr === "inactive" ? "inactive" : "active";
        const tagsStr = getVal(firstRow, tagsAliases);
        const tags = tagsStr ? tagsStr.split(",").map((t) => t.trim()).filter(Boolean) : [];

        productsToCreate.push({
          sellerId,
          name,
          slug: finalSlug,
          sku: productSku,
          description,
          price: firstVariant.price,
          salePrice: firstVariant.salePrice,
          stock: firstVariant.stock,
          lowStockAlert: isNaN(lowStockAlert) ? 5 : lowStockAlert,
          brand,
          weight: firstVariant.name !== "Default" ? firstVariant.name : "",
          unit: firstVariant.name !== "Default" ? firstVariant.name : "",
          tags,
          mainImage: mainImage || "",
          image: mainImage || "",
          galleryImages,
          headerId: new mongoose.Types.ObjectId(resolvedHeaderId),
          categoryId: new mongoose.Types.ObjectId(resolvedCategoryId),
          subcategoryId: null,
          status,
          isActive: status === "active",
          variants: finalizedVariants,
        });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "CSV Validation Failed",
        errors,
      });
    }

    // ─── Batch insert all products in one DB call ────────────────────────────
    const createdProducts = await SellerProduct.insertMany(productsToCreate);

    // FIX: Run all notification syncs in parallel instead of sequential awaits
    await Promise.all(
      createdProducts.map((product) => syncSellerInventoryNotification(sellerId, product))
    );

    const totalVariants = createdProducts.reduce((sum, p) => sum + p.variants.length, 0);

    return res.json({
      success: true,
      message: `Successfully imported ${createdProducts.length} products with a total of ${totalVariants} variants.`,
      result: { count: createdProducts.length },
    });
  } catch (error) {
    return sendError(res, 500, error.message || "Bulk upload failed");
  }
};


