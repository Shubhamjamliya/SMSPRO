// Order Service - Backend Logic
import mongoose from 'mongoose';
import { FoodOrder, FoodSettings } from '../models/order.model.js';
// import { paymentSnapshotFromOrder } from './foodOrderPayment.service.js';
import { logger } from '../../../../utils/logger.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodItem } from '../../admin/models/food.model.js';
import {
  applyOtherPriceToFood,
  loadActivePricingRulesForRestaurants,
} from '../../admin/services/otherPrice.service.js';
import { Driver } from '../../../../core/models/driver.model.js';
import { FoodZone } from '../../admin/models/zone.model.js';
import { FoodFeeSettings } from '../../admin/models/feeSettings.model.js';
import { resolveDeliverySpeedOptions, pickDeliverySpeedOption } from '../../admin/utils/deliverySpeedDefaults.js';
import { resolveRestaurantCommissionPercentage } from '../../shared/restaurantCommissionDefaults.js';
import {
  computeFoodPackagingFee,
  normalizePackagingConfig,
  resolveItemPackagingAmount,
} from '../../shared/packagingCharge.js';
import {
  assertOrderQuantity,
  resolveOrderQuantityRules,
} from '../../shared/orderQuantityRules.js';
import {
  computeAddonUnitTotal,
  loadApprovedAddonMap,
  priceAddonSelection,
} from '../../shared/addonPricing.js';
import { ValidationError, ForbiddenError, NotFoundError } from '../../../../core/auth/errors.js';
import { buildPaginationOptions, buildPaginatedResult } from '../../../../utils/helpers.js';
import {
  computeCouponDiscount,
  consumeCouponForOrder,
  releaseCouponForOrder,
  computeTaxOnTaxableAmount,
} from './coupon.service.js';
import {
  buildOrderItemsFromFoodCart,
  clearFoodCart,
} from '../../user/services/foodCart.service.js';
import {
  sendNotificationToOwner,
  sendNotificationToOwners,
} from "../../../../core/notifications/firebase.service.js";
import { assertTransition } from "../state/orderStateMachine.js";
import { newEventId, deriveEventType, recordOrderEventForTarget, ackOrderRingEvents } from "../../../../core/notifications/orderEvents.service.js";
import { FoodTransaction } from '../models/foodTransaction.model.js';
import { FoodSupportTicket } from '../../user/models/supportTicket.model.js';
import { Seller } from '../../../quick-commerce/seller/models/seller.model.js';
import { SellerOrder } from '../../../quick-commerce/seller/models/sellerOrder.model.js';
import { getSellerCommissionSnapshot } from '../../../quick-commerce/admin/services/commission.service.js';
import { QuickFeeSettings } from '../../../quick-commerce/admin/models/feeSettings.model.js';
import { getRoadDistance, geocodeAddress } from '../../../../core/location/location.service.js';
import { calculateQuickPricing, calculateDeliveryFeeFromSettings } from '../../../quick-commerce/admin/services/billing.service.js';
import {
  calculateBaseDeliveryFeeForDistance,
  calculateDeliveryFeeBreakdown,
  resolveFoodRiderEarning,
} from './deliveryFeeCalculation.service.js';
import {
    createRazorpayOrder,
    createPaymentLink,
    verifyPaymentSignature,
    getRazorpayKeyId,
    isRazorpayConfigured,
    fetchRazorpayPaymentLink,
    initiateRazorpayRefund
} from '../helpers/razorpay.helper.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { addOrderJob } from '../../../../queues/producers/order.producer.js';
import { fetchPolyline } from '../utils/googleMaps.js';
import { getFirebaseDB } from '../../../../config/firebase.js';
import * as foodTransactionService from './foodTransaction.service.js';
import { ensureDailyPassEligibility } from "../../subscriptions/services/wallet.service.js";
import {
  deductWalletBalance,
  refundWalletBalance,
} from "../../user/services/userWallet.service.js";
import {
  tryAutoAssign,
  processDispatchTimeout,
  listNearbyOnlineDeliveryPartners,
  getDispatchSettings,
  updateDispatchSettings
} from './order-dispatch.service.js';
import { resolveDeliveryDocumentType } from '../../../quick-commerce/services/dispatchDocument.service.js';
import { DISPATCH_DOCUMENT_TYPES } from '../../../quick-commerce/utils/dispatchDocument.constants.js';
import * as returnPickupDelivery from '../../../quick-commerce/services/returnPickupDelivery.service.js';
import {
  PREPARATION_TIME_DEFAULT,
  clampPreparationTimeMinutes,
  maxPreparationTimeMinutes,
  emitPreparationTimeUpdate,
  buildDeliverySocketPayload,
} from './order.helpers.js';

export {
  tryAutoAssign,
  processDispatchTimeout,
  listNearbyOnlineDeliveryPartners,
  getDispatchSettings,
  updateDispatchSettings
};

const ORDER_ID_PREFIX = "FOD-";
const ORDER_ID_LENGTH = 6;
const USER_CANCEL_FULL_REFUND_WINDOW_MS = 30 * 1000;
const USER_CANCEL_EDIT_WINDOW_MS = 60 * 1000;

/**
 * Fire-and-forget BullMQ enqueue for order lifecycle events.
 * Never blocks API response; failures are logged only.
 */
function enqueueOrderEvent(action, payload = {}) {
    try {
        void addOrderJob({ action, ...payload }).catch((err) => {
            logger.warn(`BullMQ enqueue order event failed: ${action} - ${err?.message || err}`);
        });
    } catch (err) {
        logger.warn(`BullMQ enqueue order event failed (sync): ${action} - ${err?.message || err}`);
    }

    // Synchronous fallback in development or when BullMQ is disabled
    if (process.env.BULLMQ_ENABLED !== 'true') {
        if (['delivery_completed', 'order_cancelled', 'payment_verified'].includes(action)) {
            import('../../../../queues/processors/payment.processor.js')
                .then(({ processPaymentJob }) => {
                    logger.info(`[BullMQ:fallback] Running sync payment processor for action=${action}`);
                    processPaymentJob({
                        data: { action, ...payload },
                        id: `sync_${action}_${Date.now()}`
                    }).catch((err) => {
                        logger.error(`[BullMQ:fallback] Sync payment processor failed: ${err.message}`);
                    });
                })
                .catch((err) => {
                    logger.error(`[BullMQ:fallback] Failed to import payment processor: ${err.message}`);
                });
        }
    }
}


function generateFourDigitDeliveryOtp() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function shouldShowDeliveryPartnerPhone(order) {
  if (!order) return false;
  const status = String(order.orderStatus || order.status || "").toLowerCase();
  const deliveryStatus = String(order.deliveryState?.status || "").toLowerCase();

  // Robust fallback: if order is already picked up or delivered, show phone number anyway
  const isPostPickup = ["picked_up", "reached_drop", "delivered"].includes(status) || 
                       deliveryStatus === "picked_up" || 
                       deliveryStatus === "reached_drop";
                       
  if (isPostPickup) return true;

  const reachedPickup = deliveryStatus === "reached_pickup" || status === "reached_pickup";
  const photoUploaded = !!order.deliveryState?.billImageUrl;

  return reachedPickup && photoUploaded;
}

/** Remove secret fields before returning order JSON to delivery partner / restaurant. */
function sanitizeOrderForExternal(orderDoc, roleContext = "") {
  const o = orderDoc?.toObject ? orderDoc.toObject() : { ...(orderDoc || {}) };
  delete o.deliveryOtp;
  const dv = o.deliveryVerification;
  if (dv && dv.dropOtp != null) {
    const d = dv.dropOtp;
    o.deliveryVerification = {
      ...dv,
      dropOtp: {
        required: Boolean(d.required),
        verified: Boolean(d.verified),
      },
    };
  }

  if (!o.orderMongoId) {
    o.orderMongoId = (o._id || orderDoc?._id || "").toString();
  }
  if (!o.orderId) {
    o.orderId = o.orderId || o.order_id || o.orderMongoId;
  }

  // Mask Delivery Partner phone for Restaurant panel
  if (String(roleContext).toUpperCase() === "RESTAURANT") {
    if (!shouldShowDeliveryPartnerPhone(o)) {
      if (o.dispatch?.deliveryPartnerId && typeof o.dispatch.deliveryPartnerId === "object") {
        o.dispatch.deliveryPartnerId = {
          ...o.dispatch.deliveryPartnerId,
          phone: "Hidden until photo upload",
        };
      }
      if (o.deliveryPartnerId && typeof o.deliveryPartnerId === "object") {
        o.deliveryPartnerId = {
          ...o.deliveryPartnerId,
          phone: "Hidden until photo upload",
        };
      }
      if (Array.isArray(o.dispatchPlan?.legs)) {
        o.dispatchPlan.legs = o.dispatchPlan.legs.map((leg) => {
          if (leg?.deliveryPartnerId && typeof leg.deliveryPartnerId === "object") {
            return {
              ...leg,
              deliveryPartnerId: {
                ...leg.deliveryPartnerId,
                phone: "Hidden until photo upload",
              },
            };
          }
          return leg;
        });
      }
    }
  }

  return o;
}

function emitDeliveryDropOtpToUser(order, plainOtp) {
  try {
    const io = getIO();
    if (!io || !plainOtp || !order?.userId) return;
    io.to(rooms.user(order.userId)).emit("delivery_drop_otp", {
      orderMongoId: order._id?.toString?.(),
      orderId: order.orderId,
      otp: plainOtp,
      message:
        "Share this OTP with your delivery partner to hand over the order.",
    });
  } catch (e) {
    logger.warn(`emitDeliveryDropOtpToUser failed: ${e?.message || e}`);
  }
}

async function notifyOwnersSafely(targets, payload) {
  try {
    await sendNotificationToOwners(targets, payload);
  } catch (error) {
    logger.warn(`FCM notification failed: ${error?.message || error}`);
  }
}

async function notifyOwnerSafely(target, payload) {
  try {
    await sendNotificationToOwner({ ...target, payload });
  } catch (error) {
    logger.warn(`FCM notification failed: ${error?.message || error}`);
  }
}

function buildOrderIdentityFilter(orderIdOrMongoId) {
  const raw = String(orderIdOrMongoId || "").trim();
  if (!raw) return null;
  if (mongoose.isValidObjectId(raw))
    return { _id: new mongoose.Types.ObjectId(raw) };
  return { orderId: raw };
}

function generateOrderId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < ORDER_ID_LENGTH; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return ORDER_ID_PREFIX + s;
}

async function ensureUniqueOrderId() {
  let orderId;
  let exists = true;
  let attempts = 0;
  while (exists && attempts < 10) {
    orderId = generateOrderId();
    const found = await FoodOrder.exists({ orderId });
    exists = !!found;
    attempts++;
  }
  if (exists) throw new ValidationError("Could not generate unique order id");
  return orderId;
}

function normalizeDeliveryAddress(address) {
  if (!address || typeof address !== "object") return undefined;

  const street =
    String(address.street || "").trim() ||
    String(address.address || "").trim() ||
    String(address.formattedAddress || "").trim();
  const city =
    String(address.city || "").trim() ||
    String(address.area || "").trim();
  const state =
    String(address.state || "").trim() ||
    city;

  // Accept every coordinate shape clients send: GeoJSON coordinates,
  // location: {lat, lng}, or flat latitude/longitude.
  let location;
  const geoCoords = address.location?.coordinates;
  if (Array.isArray(geoCoords) && geoCoords.length === 2) {
    const lng = Number(geoCoords[0]);
    const lat = Number(geoCoords[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      location = { type: "Point", coordinates: [lng, lat] };
    }
  }
  if (!location) {
    const lat = Number(address.location?.lat ?? address.latitude ?? address.lat);
    const lng = Number(address.location?.lng ?? address.longitude ?? address.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      location = { type: "Point", coordinates: [lng, lat] };
    }
  }

  return {
    label: address.label || "Home",
    street,
    additionalDetails:
      String(address.additionalDetails || "").trim() ||
      String(address.area || "").trim(),
    city,
    state,
    zipCode: String(address.zipCode || address.postalCode || address.pincode || "").trim(),
    area: String(address.area || "").trim(),
    landmark: String(address.landmark || "").trim(),
    formattedAddress: String(address.formattedAddress || "").trim(),
    phone: String(address.phone || "").trim(),
    location,
  };
}

function toGeoPoint(lat, lng) {
  if (lat == null || lng == null) return undefined;
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  return { type: "Point", coordinates: [b, a] };
}

function getItemType(item, fallbackOrderType = "food") {
  if (item?.type === "quick" || item?.orderType === "quick") return "quick";
  if (item?.type === "food" || item?.orderType === "food") return "food";
  return fallbackOrderType === "quick" ? "quick" : "food";
}

function buildSourceIdForItem(item, itemType) {
  if (item?.sourceId) return String(item.sourceId);
  if (itemType === "quick") {
    return String(
      item?.quickStoreId ||
        item?.storeId ||
        item?.sellerId ||
        item?.restaurantId ||
        "quick-commerce",
    );
  }
  return String(item?.restaurantId || item?.sourceRestaurantId || "");
}

function normalizeOrderItems(items = [], fallbackOrderType = "food") {
  return (Array.isArray(items) ? items : []).map((item) => {
    const itemType = getItemType(item, fallbackOrderType);
    const sourceId = buildSourceIdForItem(item, itemType);
    return {
      ...item,
      type: itemType,
      sourceId,
      sourceName:
        item?.sourceName ||
        (itemType === "quick"
          ? item?.quickStoreName || item?.storeName || item?.sellerName || ""
          : item?.restaurant || item?.restaurantName || ""),
    };
  });
}

function getPointLatLng(locationLike) {
  const coords = locationLike?.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2) return null;
  const [lng, lat] = coords;
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  return { lat: Number(lat), lng: Number(lng) };
}

/**
 * Distance used for delivery pricing: real road distance via the central
 * location service (Google Routes API, Mongo-cached). Falls back to
 * haversine automatically inside getRoadDistance, so pricing never breaks
 * when the Routes API is unavailable.
 */
export async function resolveDeliveryDistanceKm(fromPoint, toPoint) {
  if (!fromPoint || !toPoint) return 0;
  try {
    const road = await getRoadDistance(fromPoint, toPoint);
    if (road && Number.isFinite(road.distanceKm)) return road.distanceKm;
  } catch (err) {
    logger.warn(`resolveDeliveryDistanceKm failed, using haversine: ${err?.message || err}`);
  }
  return haversineKm(fromPoint.lat, fromPoint.lng, toPoint.lat, toPoint.lng);
}

function roundCurrency(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Number(num.toFixed(2));
}

/**
 * Order subtotal. An add-on is charged per unit of its parent item, so each
 * line contributes (item price + add-ons) x quantity. Add-on prices are stamped
 * from the DB by enforceMinimumFoodItemPrices before this runs.
 */
function computeItemsSubtotal(items = []) {
  return roundCurrency(
    (Array.isArray(items) ? items : []).reduce((sum, item) => {
      const price = Number(item?.price) || 0;
      const quantity = Number(item?.quantity) || 1;
      const addonUnitTotal = computeAddonUnitTotal(item?.addons);
      return sum + (price + addonUnitTotal) * quantity;
    }, 0),
  );
}

function normalizeFoodFeeSettings(feeDoc = null) {
  const defaultFeeSettings = {
    deliveryFee: 25,
    baseDistanceKm: 3,
    baseDeliveryFee: 25,
    perKmCharge: 10,
    sponsorRules: [],
    platformFee: 5,
    gstRate: 5,
    mixedOrderDistanceLimit: 2,
    mixedOrderAngleLimit: 35,
  };

  const feeSettings = {
    ...defaultFeeSettings,
    ...(feeDoc || {}),
  };

  feeSettings.baseDistanceKm = Number(
    feeSettings.baseDistanceKm ?? defaultFeeSettings.baseDistanceKm,
  );
  feeSettings.baseDeliveryFee = Number(
    feeSettings.baseDeliveryFee ??
      feeSettings.deliveryFee ??
      defaultFeeSettings.baseDeliveryFee,
  );
  feeSettings.perKmCharge = Number(
    feeSettings.perKmCharge ?? defaultFeeSettings.perKmCharge,
  );
  feeSettings.deliveryFee = Number(
    feeSettings.deliveryFee ?? feeSettings.baseDeliveryFee ?? defaultFeeSettings.deliveryFee,
  );
  feeSettings.platformFee = Number(
    feeSettings.platformFee ?? defaultFeeSettings.platformFee,
  );
  feeSettings.gstRate = Number(feeSettings.gstRate ?? defaultFeeSettings.gstRate);
  feeSettings.mixedOrderDistanceLimit = Number(
    feeSettings.mixedOrderDistanceLimit ?? defaultFeeSettings.mixedOrderDistanceLimit,
  );
  feeSettings.mixedOrderAngleLimit = Number(
    feeSettings.mixedOrderAngleLimit ?? defaultFeeSettings.mixedOrderAngleLimit,
  );
  feeSettings.sponsorRules = Array.isArray(feeSettings.sponsorRules)
    ? feeSettings.sponsorRules
    : [];
  feeSettings.deliveryDistanceSlabs = Array.isArray(feeSettings.deliveryDistanceSlabs)
    ? feeSettings.deliveryDistanceSlabs
    : [];
  feeSettings.deliverySpeedOptions = resolveDeliverySpeedOptions(feeDoc);

  return feeSettings;
}

function calculateFoodDeliveryPricing({
  subtotal,
  distanceKm,
  feeSettings,
}) {
  const safeDistance =
    Number.isFinite(Number(distanceKm)) && Number(distanceKm) >= 0
      ? Number(distanceKm)
      : 0;
  const {
    riderBaseDeliveryFee,
    deliveryExtraFee,
    totalDeliveryFee,
  } = calculateDeliveryFeeBreakdown(safeDistance, feeSettings);
  const matchedRule = (Array.isArray(feeSettings?.deliveryDistanceSlabs) && feeSettings.deliveryDistanceSlabs.length > 0)
    ? null
    : resolveSponsorRule(subtotal, safeDistance, feeSettings?.sponsorRules);

  let userDeliveryFee = totalDeliveryFee;
  let restaurantDeliveryFee = 0;
  let sponsoredKm = 0;
  let deliverySponsorType = "USER_FULL";

  if (matchedRule?.sponsorType === "RESTAURANT_FULL") {
    userDeliveryFee = 0;
    restaurantDeliveryFee = totalDeliveryFee;
    sponsoredKm = safeDistance;
    deliverySponsorType = "RESTAURANT_FULL";
  } else if (matchedRule?.sponsorType === "SPLIT") {
    const safeSponsoredKm = Math.max(
      0,
      Math.min(safeDistance, Number(matchedRule.sponsoredKm || 0)),
    );
    const sponsoredBreakdown = calculateDeliveryFeeBreakdown(safeSponsoredKm, feeSettings);
    restaurantDeliveryFee = Math.min(totalDeliveryFee, sponsoredBreakdown.totalDeliveryFee);
    userDeliveryFee = Math.max(0, roundCurrency(totalDeliveryFee - restaurantDeliveryFee));
    sponsoredKm = safeSponsoredKm;
    deliverySponsorType = "SPLIT";
  } else if (matchedRule?.sponsorType === "USER_FULL") {
    deliverySponsorType = "USER_FULL";
  }

  return {
    riderBaseDeliveryFee: roundCurrency(riderBaseDeliveryFee),
    deliveryExtraFee: roundCurrency(deliveryExtraFee),
    totalDeliveryFee: roundCurrency(totalDeliveryFee),
    userDeliveryFee: roundCurrency(userDeliveryFee),
    restaurantDeliveryFee: roundCurrency(restaurantDeliveryFee),
    deliveryFee: roundCurrency(userDeliveryFee),
    sponsoredDelivery: roundCurrency(restaurantDeliveryFee) > 0,
    sponsoredKm: roundCurrency(sponsoredKm),
    deliveryDistanceKm: roundCurrency(safeDistance),
    deliverySponsorType,
  };
}

function resolveSponsorRule(subtotal, distanceKm, sponsorRules = []) {
  const safeSubtotal = Number(subtotal);
  const safeDistance = Number(distanceKm);
  if (!Number.isFinite(safeSubtotal) || !Number.isFinite(safeDistance)) return null;

  const normalizedRules = (Array.isArray(sponsorRules) ? sponsorRules : [])
    .map((rule, index) => {
      const minOrderAmount = Number(rule?.minOrderAmount);
      const maxOrderAmount =
        rule?.maxOrderAmount == null || rule?.maxOrderAmount === ""
          ? null
          : Number(rule.maxOrderAmount);
      const maxDistanceKm = Number(rule?.maxDistanceKm);
      const sponsoredKm =
        rule?.sponsoredKm == null || rule?.sponsoredKm === ""
          ? null
          : Number(rule.sponsoredKm);
      return {
        index,
        minOrderAmount,
        maxOrderAmount,
        maxDistanceKm,
        sponsorType: String(rule?.sponsorType || "").trim().toUpperCase(),
        sponsoredKm,
      };
    })
    .filter((rule) =>
      Number.isFinite(rule.minOrderAmount) &&
      Number.isFinite(rule.maxDistanceKm) &&
      rule.maxDistanceKm >= 0 &&
      ["USER_FULL", "RESTAURANT_FULL", "SPLIT"].includes(rule.sponsorType),
    )
    .sort((a, b) => {
      if (b.minOrderAmount !== a.minOrderAmount) return b.minOrderAmount - a.minOrderAmount;
      if (a.maxDistanceKm !== b.maxDistanceKm) return a.maxDistanceKm - b.maxDistanceKm;
      return a.index - b.index;
    });

  return (
    normalizedRules.find((rule) => {
      const orderOk =
        safeSubtotal >= rule.minOrderAmount &&
        (rule.maxOrderAmount == null || safeSubtotal <= rule.maxOrderAmount);
      const distanceOk = safeDistance <= rule.maxDistanceKm;
      return orderOk && distanceOk;
    }) || null
  );
}

function angleBetweenPickupVectors(userPoint, firstPoint, secondPoint) {
  if (!userPoint || !firstPoint || !secondPoint) return null;
  const v1x = Number(firstPoint.lng) - Number(userPoint.lng);
  const v1y = Number(firstPoint.lat) - Number(userPoint.lat);
  const v2x = Number(secondPoint.lng) - Number(userPoint.lng);
  const v2y = Number(secondPoint.lat) - Number(userPoint.lat);
  const mag1 = Math.hypot(v1x, v1y);
  const mag2 = Math.hypot(v2x, v2y);
  if (mag1 === 0 || mag2 === 0) return 0;
  const cosine = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / (mag1 * mag2)));
  return Math.acos(cosine) * (180 / Math.PI);
}

async function fetchPickupSourcesByType(items = []) {
  const foodSourceIds = [...new Set(items.filter((item) => item.type === "food").map((item) => item.sourceId).filter(Boolean))];
  const quickSourceIds = [...new Set(items.filter((item) => item.type === "quick").map((item) => item.sourceId).filter(Boolean))];
  const foodObjectIds = foodSourceIds
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  const foodReadableIds = foodSourceIds
    .filter((id) => /^REST\d{6}$/i.test(String(id)))
    .map((id) => String(id).toUpperCase());

  const [restaurants, sellers] = await Promise.all([
    foodSourceIds.length
      ? FoodRestaurant.find({
          $or: [
            ...(foodObjectIds.length ? [{ _id: { $in: foodObjectIds } }] : []),
            ...(foodReadableIds.length ? [{ restaurantId: { $in: foodReadableIds } }] : []),
          ],
        })
          .select("restaurantId restaurantName location addressLine1 area city state zoneId status commissionPercentage")
          .lean()
      : [],
    quickSourceIds.length
      ? Seller.find({ _id: { $in: quickSourceIds.filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id)) } })
          .select("shopName name location shopInfo approvalStatus approved isActive")
          .lean()
      : [],
  ]);

  const sourceMap = new Map();
  for (const restaurant of restaurants) {
    const normalizedRestaurant = {
      type: "food",
      sourceId: String(restaurant._id),
      sourceName: restaurant.restaurantName || restaurant.name || "Restaurant",
      status: restaurant.status,
      location: restaurant.location,
      zoneId: restaurant.zoneId || null,
      commissionPercentage: resolveRestaurantCommissionPercentage(restaurant.commissionPercentage),
      address:
        restaurant.location?.address ||
        restaurant.location?.formattedAddress ||
        restaurant.addressLine1 ||
        [restaurant.area, restaurant.city, restaurant.state].filter(Boolean).join(", "),
    };
    sourceMap.set(String(restaurant._id), normalizedRestaurant);
    if (restaurant.restaurantId) {
      sourceMap.set(String(restaurant.restaurantId).toUpperCase(), normalizedRestaurant);
    }
  }
  for (const seller of sellers) {
    sourceMap.set(String(seller._id), {
      type: "quick",
      sourceId: String(seller._id),
      sourceName: seller.shopName || seller.name || "Quick Commerce",
      status:
        seller.approvalStatus ||
        (seller.approved && seller.isActive ? "approved" : "inactive"),
      location: seller.location,
      zoneId: seller.shopInfo?.zoneId || null,
      address:
        seller.location?.formattedAddress ||
        seller.location?.address ||
        "",
    });
  }
  return sourceMap;
}

function buildPickupPointsFromItems(items = [], sourceMap = new Map()) {
  const grouped = new Map();
  for (const item of items) {
    const key = `${item.type}:${item.sourceId}`;
    if (!grouped.has(key)) {
      const source = sourceMap.get(String(item.sourceId)) || {};
      grouped.set(key, {
        pickupType: item.type,
        sourceId: String(item.sourceId),
        sourceName: item.sourceName || source.sourceName || "",
        address: source.address || "",
        location: source.location?.coordinates
          ? { type: "Point", coordinates: source.location.coordinates }
          : undefined,
        itemIds: [],
      });
    }
    grouped.get(key).itemIds.push(String(item.itemId || item.id || item.name));
  }
  return [...grouped.values()];
}

async function evaluateCombinedPickupEligibility(pickupPoints = [], deliveryAddress) {
  const foodPickup = pickupPoints.find((point) => point.pickupType === "food");
  const quickPickup = pickupPoints.find((point) => point.pickupType === "quick");
  const foodPoint = getPointLatLng(foodPickup?.location);
  const quickPoint = getPointLatLng(quickPickup?.location);
  const userPoint = getPointLatLng(deliveryAddress?.location);
  if (!foodPoint || !quickPoint || !userPoint) {
    return {
      eligible: false,
      pickupDistanceKm: null,
      sameDirection: false,
      reason: "Pickup or delivery coordinates are unavailable",
    };
  }

  // Fetch dynamic settings
  const feeDoc = await FoodFeeSettings.findOne({ isActive: true }).sort({ createdAt: -1 }).lean();
  const distLimit = feeDoc?.mixedOrderDistanceLimit ?? 2;
  const angleLimit = feeDoc?.mixedOrderAngleLimit ?? 35;

  const pickupDistanceKm = haversineKm(foodPoint.lat, foodPoint.lng, quickPoint.lat, quickPoint.lng);
  const angle = angleBetweenPickupVectors(userPoint, foodPoint, quickPoint);
  
  // If pickups are very close to each other (e.g. < 200m), they are definitely in the same direction for practical purposes
  const isVeryClose = pickupDistanceKm <= 0.2;
  const sameDirection = isVeryClose || (angle == null ? false : angle <= angleLimit);
  
  const eligible = pickupDistanceKm <= distLimit && sameDirection;
  return {
    eligible,
    distanceLimitKm: Number(distLimit),
    angleLimitDeg: Number(angleLimit),
    pickupDistanceKm: Number.isFinite(pickupDistanceKm) ? Number(pickupDistanceKm.toFixed(2)) : null,
    sameDirection,
    reason: eligible
      ? "Pickups are close and aligned for a shared rider"
      : pickupDistanceKm > distLimit
        ? `Pickups are more than ${distLimit} km apart`
        : `Pickups are not in the same direction (exceeds ${angleLimit}° deviation)`,
  };
}

async function listNearbyPartnersForPoint(point, { maxKm = 15, limit = 5 } = {}) {
  const latLng = getPointLatLng(point?.location);
  if (!latLng) {
    const fallbackPartners = await Driver.find({
      status: "approved",
      availabilityStatus: "online",
    })
      .select("_id")
      .limit(Math.max(1, limit))
      .lean();

    return fallbackPartners.map((partner) => ({
      partnerId: partner._id,
      distanceKm: null,
    }));
  }

  const partners = await Driver.find({
    status: "approved",
    availabilityStatus: "online",
    lastLat: { $exists: true, $ne: null },
    lastLng: { $exists: true, $ne: null },
  })
    .select("_id lastLat lastLng")
    .lean();

  const nearbyPartners = partners
    .map((partner) => ({
      partnerId: partner._id,
      distanceKm: haversineKm(latLng.lat, latLng.lng, partner.lastLat, partner.lastLng),
    }))
    .filter((partner) => Number.isFinite(partner.distanceKm) && partner.distanceKm <= maxKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, Math.max(1, limit));

  if (nearbyPartners.length > 0) {
    return nearbyPartners;
  }

  const fallbackPartners = await Driver.find({
    status: "approved",
    availabilityStatus: "online",
  })
    .select("_id")
    .limit(Math.max(1, limit))
    .lean();

  return fallbackPartners.map((partner) => ({
    partnerId: partner._id,
    distanceKm: null,
  }));
}

function pushStatusHistory(order, { byRole, byId, from, to, note = "" }) {
  order.statusHistory.push({
    at: new Date(),
    byRole,
    byId: byId || undefined,
    from,
    to,
    note,
  });
}

/**
 * Order prep ETA = MAX(food item preparation times). Looks up FoodItem.preparationTime by itemId.
 */
async function resolveOrderPreparationTimeMinutes(orderItems = []) {
  const foodItemIds = [
    ...new Set(
      (orderItems || [])
        .filter((item) => String(item?.type || "food") === "food" && item?.itemId)
        .map((item) => String(item.itemId))
        .filter((id) => mongoose.Types.ObjectId.isValid(id)),
    ),
  ].map((id) => new mongoose.Types.ObjectId(id));

  if (!foodItemIds.length) return PREPARATION_TIME_DEFAULT;

  const docs = await FoodItem.find({ _id: { $in: foodItemIds } })
    .select("preparationTime")
    .lean();

  const calculated = maxPreparationTimeMinutes(
    docs.map((doc) => doc.preparationTime),
    PREPARATION_TIME_DEFAULT,
  );
  try {
    return clampPreparationTimeMinutes(calculated);
  } catch {
    return PREPARATION_TIME_DEFAULT;
  }
}

function normalizeOrderForClient(orderDoc) {
  const order = orderDoc?.toObject ? orderDoc.toObject() : orderDoc || {};
  const mongoId = (order._id || orderDoc?._id || "").toString();
  const displayId = order.orderId || order.order_id || mongoId;
  return {
    ...order,
    orderMongoId: mongoId,
    orderId: displayId,
    status: order?.orderStatus || order?.status || "",
    deliveredAt:
      order?.deliveryState?.deliveredAt || order?.deliveredAt || null,
    deliveryPartnerId:
      order?.dispatch?.deliveryPartnerId || order?.deliveryPartnerId || null,
    rating: order?.ratings?.restaurant?.rating ?? order?.rating ?? null,
    deliveryState: {
      ...(order?.deliveryState || {}),
      currentLocation: order?.lastRiderLocation?.coordinates?.length >= 2 ? {
        lat: order.lastRiderLocation.coordinates[1],
        lng: order.lastRiderLocation.coordinates[0]
      } : (order?.deliveryState?.currentLocation || null)
    }
  };
}

function toIdString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value?._id?.toString?.() || value?.toString?.() || "";
}

function isSplitDispatchOrder(order) {
  return (
    order?.orderType === "mixed" &&
    ["split", "express_split"].includes(String(order?.dispatchPlan?.strategy || ""))
  );
}

function isExpressSplitDispatchOrder(order) {
  return (
    order?.orderType === "mixed" &&
    String(order?.dispatchPlan?.strategy || "") === "express_split"
  );
}

function getAssignedDispatchLeg(order, deliveryPartnerId) {
  const partnerId = toIdString(deliveryPartnerId);
  if (!partnerId) return null;
  return (
    (order?.dispatchPlan?.legs || []).find(
      (leg) => toIdString(leg?.deliveryPartnerId) === partnerId,
    ) || null
  );
}

function isOrderAssignedToDeliveryPartner(order, deliveryPartnerId) {
  const partnerId = toIdString(deliveryPartnerId);
  if (!partnerId) return false;

  const wholeOrderPartnerId = toIdString(order?.dispatch?.deliveryPartnerId);
  if (wholeOrderPartnerId === partnerId) return true;

  return Boolean(getAssignedDispatchLeg(order, deliveryPartnerId));
}

function filterOrderItemsForLeg(order, leg) {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (!leg?.legId) return items;
  const targetLegId = String(leg.legId);
  return items.filter(
    (item) => `${item?.type || item?.orderType}:${item?.sourceId}` === targetLegId,
  );
}

function getEligibleDispatchLegs(order, deliveryPartnerId) {
  const partnerId = toIdString(deliveryPartnerId);
  if (!partnerId) return [];
  const existingAssignedLeg = getAssignedDispatchLeg(order, deliveryPartnerId);
  if (isExpressSplitDispatchOrder(order) && existingAssignedLeg) {
    return [];
  }
  return (order?.dispatchPlan?.legs || [])
    .filter((leg) => !toIdString(leg?.deliveryPartnerId))
    .filter((leg) =>
      (leg?.partnerCandidates || []).some(
        (candidate) => toIdString(candidate?.partnerId) === partnerId,
      ),
    )
    .map((leg) => {
      const candidate = (leg?.partnerCandidates || []).find(
        (entry) => toIdString(entry?.partnerId) === partnerId,
      );
      return {
        ...leg,
        candidateDistanceKm: Number.isFinite(candidate?.distanceKm)
          ? candidate.distanceKm
          : null,
      };
    });
}

function sortDispatchLegsByCandidateDistance(legs = []) {
  return [...legs].sort((a, b) => {
    const aDistance = Number.isFinite(a?.candidateDistanceKm)
      ? a.candidateDistanceKm
      : Number.POSITIVE_INFINITY;
    const bDistance = Number.isFinite(b?.candidateDistanceKm)
      ? b.candidateDistanceKm
      : Number.POSITIVE_INFINITY;
    return aDistance - bDistance;
  });
}

async function claimSplitDispatchLegAtomically(order, deliveryPartnerId, requestedLegId = "") {
  const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
  const partnerIdString = partnerId.toString();
  const orderLegs = Array.isArray(order?.dispatchPlan?.legs) ? order.dispatchPlan.legs : [];
  const existingLeg = getAssignedDispatchLeg(order, deliveryPartnerId);
  const trimmedRequestedLegId = String(requestedLegId || "").trim();
  const requestedLeg = trimmedRequestedLegId
    ? orderLegs.find((leg) => String(leg?.legId || "") === trimmedRequestedLegId)
    : null;

  if (
    isExpressSplitDispatchOrder(order) &&
    existingLeg &&
    trimmedRequestedLegId &&
    existingLeg.legId !== trimmedRequestedLegId
  ) {
    throw new ValidationError(
      "Express mixed delivery assigns separate riders per pickup leg",
    );
  }

  if (requestedLeg && !existingLeg) {
    const legOwnerId = toIdString(requestedLeg?.deliveryPartnerId);
    if (legOwnerId && legOwnerId !== partnerIdString) {
      throw new ForbiddenError("This dispatch leg is already claimed by another rider");
    }

    const eligibleForRequestedLeg = (requestedLeg?.partnerCandidates || []).some(
      (candidate) => toIdString(candidate?.partnerId) === partnerIdString,
    );

    if (!legOwnerId && !eligibleForRequestedLeg) {
      throw new ForbiddenError("This dispatch leg is not available for this rider");
    }
  }

  if (existingLeg) {
    const updatedOrder = await FoodOrder.findById(order._id);
    return {
      updatedOrder,
      claimedLegId: existingLeg.legId,
    };
  }

  const eligibleLegs = sortDispatchLegsByCandidateDistance(
    getEligibleDispatchLegs(order, deliveryPartnerId),
  );
  const candidateLegIds = trimmedRequestedLegId
    ? [trimmedRequestedLegId]
    : eligibleLegs.map((leg) => String(leg?.legId || "")).filter(Boolean);

  if (!candidateLegIds.length) {
    throw new ValidationError("No dispatch leg is currently available for this rider");
  }

  for (const legId of candidateLegIds) {
    const claimQuery = {
      _id: order._id,
      orderStatus: {
        $in: ["confirmed", "preparing", "ready_for_pickup", "picked_up"],
      },
      dispatchPlan: {
        $exists: true,
      },
      "dispatchPlan.legs": {
        $elemMatch: {
          legId,
          deliveryPartnerId: null,
          partnerCandidates: {
            $elemMatch: {
              partnerId,
            },
          },
        },
      },
    };

    if (isExpressSplitDispatchOrder(order)) {
      claimQuery["dispatchPlan.legs.deliveryPartnerId"] = { $ne: partnerId };
    }

    const claimUpdate = {
      $set: {
        "dispatchPlan.legs.$[target].deliveryPartnerId": partnerId,
        "dispatchPlan.legs.$[target].assignedAt": new Date(),
        "dispatch.assignedAt": order?.dispatch?.assignedAt || new Date(),
      },
    };

    const claimOptions = {
      arrayFilters: [
        {
          "target.legId": legId,
          "target.deliveryPartnerId": null,
        },
      ],
    };

    if (isExpressSplitDispatchOrder(order)) {
      claimUpdate.$pull = {
        "dispatchPlan.legs.$[other].partnerCandidates": {
          partnerId,
        },
      };
      claimOptions.arrayFilters.push({
        "other.legId": { $ne: legId },
      });
    }

    const claimResult = await FoodOrder.updateOne(claimQuery, claimUpdate, claimOptions);
    if (claimResult?.modifiedCount > 0) {
      const updatedOrder = await FoodOrder.findById(order._id);
      return {
        updatedOrder,
        claimedLegId: legId,
      };
    }
  }

  throw new ValidationError("No dispatch leg is currently available for this rider");
}

function reorderPickupPointsForLeg(order, legId) {
  const pickupPoints = Array.isArray(order?.pickupPoints) ? [...order.pickupPoints] : [];
  if (!legId || pickupPoints.length <= 1) return pickupPoints;
  const selectedIndex = pickupPoints.findIndex(
    (point) => `${point?.pickupType}:${point?.sourceId}` === legId,
  );
  if (selectedIndex <= 0) return pickupPoints;
  const [selectedPoint] = pickupPoints.splice(selectedIndex, 1);
  return [selectedPoint, ...pickupPoints];
}

function buildDeliveryOrderView(orderDoc, deliveryPartnerId, options = {}) {
  const order = normalizeOrderForClient(orderDoc);
  const assignedLeg =
    options.assignedDispatchLeg ||
    getAssignedDispatchLeg(orderDoc, deliveryPartnerId);
  const offeredLeg =
    options.dispatchLeg ||
    assignedLeg ||
    getEligibleDispatchLegs(orderDoc, deliveryPartnerId)[0] ||
    null;

  const activeLeg = assignedLeg || offeredLeg;
  order.orderMongoId =
    orderDoc?._id?.toString?.() || order?._id?.toString?.() || toIdString(order?._id);
  order.orderId = order?.orderId || order?.order_id || order.orderMongoId;

  if (activeLeg) {
    const legDeliveryFee = Number(activeLeg?.deliveryFee || 0);
    const legRiderEarning = Number(activeLeg?.riderEarning || 0);
    order.dispatchOfferType = isSplitDispatchOrder(orderDoc) ? "split_leg" : "single";
    if (isSplitDispatchOrder(orderDoc)) {
      order.deliveryFee = legDeliveryFee;
      order.riderEarning = legRiderEarning;
      order.earnings = legRiderEarning || legDeliveryFee || 0;
    }
    order.dispatchLeg = {
      legId: activeLeg.legId,
      pickupType: activeLeg.pickupType,
      sourceId: activeLeg.sourceId,
      sourceName: activeLeg.sourceName || "",
      deliveryFee: legDeliveryFee,
      riderEarning: legRiderEarning,
      candidateDistanceKm: Number.isFinite(activeLeg?.candidateDistanceKm)
        ? activeLeg.candidateDistanceKm
        : null,
      assignedAt: activeLeg.assignedAt || null,
      deliveryPartnerId: activeLeg.deliveryPartnerId || null,
    };
    if (isSplitDispatchOrder(orderDoc)) {
      order.items = filterOrderItemsForLeg(orderDoc, activeLeg);
      order.pickupPoints = reorderPickupPointsForLeg(orderDoc, activeLeg.legId).filter(
        (point) => `${point?.pickupType}:${point?.sourceId}` === activeLeg.legId,
      );
    } else {
      order.pickupPoints = reorderPickupPointsForLeg(orderDoc, activeLeg.legId);
    }
  }

  if (assignedLeg) {
    order.assignedDispatchLeg = {
      legId: assignedLeg.legId,
      pickupType: assignedLeg.pickupType,
      sourceId: assignedLeg.sourceId,
      sourceName: assignedLeg.sourceName || "",
      assignedAt: assignedLeg.assignedAt || null,
      deliveryPartnerId: assignedLeg.deliveryPartnerId || null,
    };
    order.deliveryPartnerId = assignedLeg.deliveryPartnerId || order.deliveryPartnerId || null;
  }

  return order;
}

async function applyAggregateRating(model, entityId, newRating) {
  if (!entityId) return;
  const doc = await model.findById(entityId).select("rating totalRatings");
  if (!doc) return;

  const totalRatings = Number(doc.totalRatings || 0);
  const currentAverage = Number(doc.rating || 0);
  const nextTotal = totalRatings + 1;
  const nextAverage = Number(
    ((currentAverage * totalRatings + Number(newRating)) / nextTotal).toFixed(
      1,
    ),
  );

  doc.totalRatings = nextTotal;
  doc.rating = nextAverage;
  await doc.save();
}

// 🗑️ Moved to foodTransaction.service.js to centralize finance logic.

// 🗑️ Moved to foodTransaction.service.js to centralize finance logic.




/** Append-only food_order_payments row; never blocks main flow on failure */
// 🗑️ Deprecated in favor of FoodTransaction system.

function buildSplitLegSocketPayload(orderDoc, leg, restaurantDoc = null) {
  const basePayload = buildDeliverySocketPayload(orderDoc, restaurantDoc);
  const legId = String(leg?.legId || "");
  const legDeliveryFee = Number(leg?.deliveryFee || 0);
  const legRiderEarning = Number(leg?.riderEarning || 0);

  return {
    ...basePayload,
    dispatchOfferType: "split_leg",
    deliveryFee: legDeliveryFee,
    riderEarning: legRiderEarning,
    earnings: legRiderEarning || legDeliveryFee || 0,
    dispatchLeg: {
      legId,
      pickupType: leg?.pickupType || "",
      sourceId: leg?.sourceId || "",
      sourceName: leg?.sourceName || "",
      deliveryFee: legDeliveryFee,
      riderEarning: legRiderEarning,
      candidateDistanceKm: null,
      assignedAt: leg?.assignedAt || null,
      deliveryPartnerId: leg?.deliveryPartnerId || null,
    },
    items: filterOrderItemsForLeg(orderDoc, leg),
    pickupPoints: reorderPickupPointsForLeg(orderDoc, legId).filter(
      (point) => `${point?.pickupType}:${point?.sourceId}` === legId,
    ),
  };
}

function emitOrderClaimedToOtherPartners(order, {
  acceptedBy,
  legId = "",
  candidatePartnerIds = [],
} = {}) {
  try {
    const io = getIO();
    if (!io) return;

    const acceptedById = toIdString(acceptedBy);
    const payload = {
      orderId: String(order?.orderId || ""),
      orderMongoId: order?._id?.toString?.() || "",
      legId: String(legId || "").trim(),
      claimedBy: acceptedById,
    };

    const partnerIds = [...new Set(
      (Array.isArray(candidatePartnerIds) ? candidatePartnerIds : [])
        .map((value) => toIdString(value))
        .filter(Boolean)
        .filter((value) => value !== acceptedById),
    )];

    for (const partnerId of partnerIds) {
      io.to(rooms.delivery(partnerId)).emit("order_claimed", payload);
      io.to(rooms.delivery(partnerId)).emit("order_reassigned_elsewhere", payload);
    }
  } catch (error) {
    logger.warn(`emitOrderClaimedToOtherPartners failed: ${error?.message || error}`);
  }
}

function canExposeOrderToRestaurant(orderLike) {
  if (orderLike?.orderStatus === "scheduled") return false;
  const method = String(orderLike?.payment?.method || "").toLowerCase();
  const status = String(orderLike?.payment?.status || "").toLowerCase();

  // Cash and Wallet are considered confirmed immediately
  if (["cash", "wallet"].includes(method)) return true;
  // Online payments must be successful
  return ["paid", "authorized", "captured", "settled"].includes(status);
}

async function notifyRestaurantNewOrder(orderDoc) {
  try {
    if (!orderDoc || !canExposeOrderToRestaurant(orderDoc)) return;
    if (orderDoc.orderStatus === "scheduled") return;

    // Ring envelope shared by the socket payload + FCM data so the native app rings on a new
    // order. Watchdog escalates if the restaurant doesn't ack within the window.
    const newOrderEventId = newEventId();
    const RING_EXPIRES_SEC = 30;
    const newOrderExpiresAt = new Date(Date.now() + RING_EXPIRES_SEC * 1000).toISOString();

    const io = getIO();
    if (io) {
      const payload = {
        ...orderDoc.toObject(),
        orderMongoId: orderDoc._id?.toString?.() || undefined,
      };

      // Ensure popup can show customer + phone even when userId is an ObjectId.
      const hasCustomerName = Boolean(
        String(payload.customerName || payload.userName || payload.userId?.name || "").trim(),
      );
      const hasCustomerPhone = Boolean(
        String(
          payload.customerPhone ||
            payload.userPhone ||
            payload.userId?.phone ||
            payload.deliveryAddress?.phone ||
            "",
        ).trim(),
      );

      if ((!hasCustomerName || !hasCustomerPhone) && orderDoc.userId) {
        try {
          let user = null;
          if (
            orderDoc.userId &&
            typeof orderDoc.userId === "object" &&
            (orderDoc.userId.name || orderDoc.userId.phone)
          ) {
            user = orderDoc.userId;
          } else {
            user = await FoodUser.findById(orderDoc.userId)
              .select("name phone")
              .lean();
          }
          if (user) {
            if (!hasCustomerName) {
              payload.customerName = user.name || "";
              payload.userName = user.name || "";
            }
            if (!hasCustomerPhone) {
              payload.customerPhone = user.phone || "";
              payload.userPhone = user.phone || "";
            }
            if (!payload.userId || typeof payload.userId !== "object") {
              payload.userId = {
                _id: user._id || orderDoc.userId,
                name: user.name || "",
                phone: user.phone || "",
              };
            }
          }
        } catch {
          // Non-blocking enrichment.
        }
      }

      // Restaurant / outlet display names for the incoming popup.
      try {
        if (orderDoc.restaurantId) {
          const restaurant = await FoodRestaurant.findById(orderDoc.restaurantId)
            .select("restaurantName")
            .lean();
          if (restaurant?.restaurantName) {
            payload.restaurantName = restaurant.restaurantName;
            payload.outletName = restaurant.restaurantName;
          }
        }
      } catch {
        // Non-blocking.
      }

      // Delivery partner details when already assigned at notify time.
      try {
        const partnerId =
          orderDoc.dispatch?.deliveryPartnerId ||
          orderDoc.dispatchPlan?.legs?.[0]?.deliveryPartnerId ||
          null;
        if (partnerId) {
          let partner = null;
          if (
            typeof partnerId === "object" &&
            (partnerId.name || partnerId.phone)
          ) {
            partner = partnerId;
          } else {
            partner = await Driver.findById(partnerId)
              .select("name phone status")
              .lean();
          }
          if (partner) {
            payload.deliveryPartner = {
              _id: partner._id || partnerId,
              name: partner.name || "",
              phone: partner.phone || "",
              status: partner.status || orderDoc.dispatch?.status || "",
            };
            payload.driverName = partner.name || "";
            payload.driverPhone = partner.phone || "";
            payload.driverStatus = partner.status || orderDoc.dispatch?.status || "";
          }
        }
      } catch {
        // Non-blocking.
      }

      // Accepted timestamp from status history (if already accepted somehow).
      const history = Array.isArray(payload.statusHistory) ? payload.statusHistory : [];
      const acceptedEntry = [...history]
        .reverse()
        .find((h) =>
          ["preparing", "accepted", "confirmed"].includes(
            String(h?.to || "").toLowerCase(),
          ),
        );
      if (acceptedEntry?.at) {
        payload.acceptedAt = acceptedEntry.at;
      }

      payload.event_id = newOrderEventId;
      payload.type = "NEW_ORDER";
      payload.ring = true;
      payload.expires_at = newOrderExpiresAt;

      io.to(rooms.restaurant(orderDoc.restaurantId)).emit("new_order", payload);
      io.to(rooms.restaurant(orderDoc.restaurantId)).emit(
        "play_notification_sound",
        {
          orderId: payload.orderId,
          orderMongoId: payload.orderMongoId,
        },
      );
    }

    await notifyOwnersSafely(
      [{ ownerType: "RESTAURANT", ownerId: orderDoc.restaurantId }],
      {
        title: "New order received",
        body: `Order ${orderDoc.orderId} is waiting for review.`,
        data: {
          type: "new_order",
          event_id: newOrderEventId,
          event_type: "NEW_ORDER",
          ring: "true",
          expires_at: newOrderExpiresAt,
          orderId: orderDoc.orderId,
          orderMongoId: orderDoc._id?.toString?.() || "",
          link: `/restaurant/orders/${orderDoc._id?.toString?.() || ""}`,
        },
      },
    );

    // Durably record the ring event for /sync replay + watchdog escalation (ackRequired).
    await recordOrderEventForTarget({
      type: "NEW_ORDER",
      orderId: orderDoc.orderId,
      orderMongoId: orderDoc._id,
      target: { ownerType: "RESTAURANT", ownerId: orderDoc.restaurantId },
      ring: true,
      expiresInSec: RING_EXPIRES_SEC,
      eventId: newOrderEventId,
      ackRequired: true,
      payload: { orderStatus: orderDoc.orderStatus },
    });
  } catch {
    // Do not block order/payment flow if notification fails.
  }
}

function buildSellerOrderAddress(deliveryAddress) {
  if (!deliveryAddress) return { address: "", city: "" };
  const coords = deliveryAddress?.location?.coordinates;
  return {
    address: deliveryAddress.street || "",
    city: deliveryAddress.city || "",
    ...(Array.isArray(coords) && coords.length === 2
      ? {
          location: {
            lat: Number(coords[1]),
            lng: Number(coords[0]),
          },
        }
      : {}),
  };
}

function buildSellerOrdersFromParent(orderDoc, { customerName = "", customerPhone = "" } = {}) {
  const order = orderDoc?.toObject ? orderDoc.toObject() : orderDoc || {};
  const quickItems = Array.isArray(order.items)
    ? order.items.filter((item) => item?.type === "quick")
    : [];
  if (!quickItems.length) return [];

  const quickSubtotal = quickItems.reduce(
    (sum, item) => sum + Number(item?.price || 0) * Number(item?.quantity || 0),
    0,
  );
  const totalDeliveryFee = Number(order?.pricing?.deliveryFee || 0);
  const sellerBuckets = new Map();

  for (const item of quickItems) {
    const sellerId = String(item?.sourceId || "").trim();
    if (!sellerId || !mongoose.isValidObjectId(sellerId)) continue;
    if (!sellerBuckets.has(sellerId)) sellerBuckets.set(sellerId, []);
    sellerBuckets.get(sellerId).push(item);
  }

  return Promise.all(
    Array.from(sellerBuckets.entries()).map(async ([sellerId, sellerItems]) => {
      const sellerSubtotal = sellerItems.reduce(
        (sum, item) => sum + Number(item?.price || 0) * Number(item?.quantity || 0),
        0,
      );
      const allocatedDeliveryFee =
        quickSubtotal > 0
          ? Number(((totalDeliveryFee * sellerSubtotal) / quickSubtotal).toFixed(2))
          : 0;

      // Phase 2: Calculate commission and receivable for sellers
      let commissionAmount = 0;
      let receivable = sellerSubtotal;

      try {
        const snapshot = await getSellerCommissionSnapshot(sellerId, sellerSubtotal);
        commissionAmount = Number(snapshot?.commissionAmount || 0);
        receivable = Math.max(0, Number((sellerSubtotal - commissionAmount).toFixed(2)));
      } catch (err) {
        logger.warn(`Failed to get commission snapshot for seller ${sellerId}: ${err.message}`);
      }

      return {
        orderType: order.orderType === "mixed" ? "mixed" : "quick",
        parentOrderId: orderDoc?._id || order?._id || null,
        sellerId: new mongoose.Types.ObjectId(sellerId),
        orderId: order.orderId,
        customer: {
          name:
            String(customerName || order?.userId?.name || "").trim() || "Customer",
          phone:
            String(customerPhone || order?.deliveryAddress?.phone || "").trim() || "",
        },
        items: sellerItems.map((item) => ({
          productId: mongoose.isValidObjectId(String(item?.itemId || ""))
            ? new mongoose.Types.ObjectId(String(item.itemId))
            : null,
          name: item?.name || "Item",
          price: Number(item?.price || 0),
          quantity: Math.max(1, Number(item?.quantity || 1)),
          image: item?.image || "",
        })),
        pricing: {
          subtotal: sellerSubtotal,
          deliveryFee: allocatedDeliveryFee,
          commission: commissionAmount,
          receivable: receivable,
          total: Number((sellerSubtotal + allocatedDeliveryFee).toFixed(2)),
        },
        status: "pending",
        workflowStatus: "SELLER_PENDING",
        sellerPendingExpiresAt: new Date(Date.now() + 2 * 60 * 1000),
        address: buildSellerOrderAddress(order.deliveryAddress),
        payment: {
          method: ["cash", "cod"].includes(String(order?.payment?.method || "").toLowerCase())
            ? "cash"
            : "online",
        },
      };
    }),
  );
}

async function upsertSellerOrdersForParent(orderDoc, options = {}) {
  const sellerOrders = await buildSellerOrdersFromParent(orderDoc, options);
  if (!sellerOrders.length) return [];

  return Promise.all(
    sellerOrders.map((sellerOrder) =>
      SellerOrder.findOneAndUpdate(
        {
          sellerId: sellerOrder.sellerId,
          orderId: sellerOrder.orderId,
        },
        { $set: sellerOrder },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      ).lean(),
    ),
  );
}

async function notifySellerNewOrders(orderDoc, sellerOrders = []) {
  try {
    if (!orderDoc || !canExposeOrderToRestaurant(orderDoc) || !sellerOrders.length) return;
    if (orderDoc.orderStatus === "scheduled") return;

    const io = getIO();
    for (const sellerOrder of sellerOrders) {
      if (!sellerOrder?.sellerId) continue;
      const payload = {
        orderId: sellerOrder.orderId,
        sellerOrderId: sellerOrder._id?.toString?.() || "",
        orderType: sellerOrder.orderType || "quick",
        status: sellerOrder.status,
        workflowStatus: sellerOrder.workflowStatus,
        items: sellerOrder.items || [],
        pricing: sellerOrder.pricing || {},
        createdAt: sellerOrder.createdAt || new Date(),
      };

      if (io) {
        io.to(rooms.seller(sellerOrder.sellerId)).emit("new_order", payload);
        io.to(rooms.seller(sellerOrder.sellerId)).emit("order:new", payload);
        io.to(rooms.seller(sellerOrder.sellerId)).emit("play_notification_sound", {
          orderId: sellerOrder.orderId,
          sellerOrderId: sellerOrder._id?.toString?.() || "",
        });
      }

      await notifyOwnerSafely(
        { ownerType: "SELLER", ownerId: sellerOrder.sellerId },
        {
          title:
            sellerOrder.orderType === "mixed"
              ? "New mixed order received"
              : "New quick order received",
          body:
            sellerOrder.orderType === "mixed"
              ? `Order ${sellerOrder.orderId} includes a mixed-order seller leg waiting for action.`
              : `Order ${sellerOrder.orderId} is waiting for seller action.`,
          data: {
            type: "new_seller_order",
            orderId: sellerOrder.orderId,
            sellerOrderId: sellerOrder._id?.toString?.() || "",
            orderType: sellerOrder.orderType || "quick",
            link: `/seller/orders`,
          },
        },
      );
    }
  } catch (error) {
    logger.warn(`Seller order notify failed: ${error?.message || error}`);
  }
}

/**
 * Synchronize cancellation of all seller-specific order legs associated with a parent order.
 * Triggers status updates and real-time socket notifications to sellers.
 */
async function cancelSellerOrdersForParent(orderDoc, reason = "Parent order cancelled") {
  try {
    const parentId = orderDoc._id;
    // Find active seller order legs (not yet delivered or already cancelled)
    const activeSellerOrders = await SellerOrder.find({
      parentOrderId: parentId,
      status: { $nin: ["cancelled", "delivered"] }
    });

    if (!activeSellerOrders.length) return;

    logger.info(`MixedOrder: Cancelling ${activeSellerOrders.length} seller legs for Order ${orderDoc.orderId}`);

    // Update all matching legs to 'cancelled' status
    await SellerOrder.updateMany(
      { 
        parentOrderId: parentId, 
        status: { $nin: ["cancelled", "delivered"] } 
      },
      { 
        $set: { 
          status: "cancelled",
          workflowStatus: "CANCELLED"
        } 
      }
    );

    // Notify each seller via Socket.io and Push Notifications
    await notifySellerOrderCancelled(orderDoc, activeSellerOrders, reason);
  } catch (error) {
    logger.error(`cancelSellerOrdersForParent failed for Order ${orderDoc?.orderId}: ${error.message}`);
  }
}

/**
 * Emit real-time socket events and send push notifications to sellers when their leg of a mixed order is cancelled.
 */
async function notifySellerOrderCancelled(orderDoc, sellerOrders, reason) {
  try {
    const io = getIO();
    for (const sellerOrder of sellerOrders) {
      const sellerId = sellerOrder.sellerId?.toString?.() || sellerOrder.sellerId;
      
      if (io && sellerId) {
        const payload = {
          orderId: sellerOrder.orderId,
          sellerOrderId: sellerOrder._id?.toString?.() || "",
          reason,
          status: "cancelled"
        };
        
        console.log(`[MIXED-SYNC] Emitting cancellation for SellerOrder ${sellerOrder.orderId} to seller room: ${rooms.seller(sellerId)}`);
        // Emit specific cancellation events to seller room
        io.to(rooms.seller(sellerId)).emit("order_cancelled", payload);
        io.to(rooms.seller(sellerId)).emit("order:cancelled", payload);
        
        // Also emit 'order_status_update' so generic UI listeners (like DashboardLayout) can update status tags
        io.to(rooms.seller(sellerId)).emit("order_status_update", {
            ...payload,
            orderStatus: "cancelled",
            sellerStatus: "cancelled",
            message: `Order #${sellerOrder.orderId} was cancelled.`
        });
      }

      if (sellerId) {
        await notifyOwnerSafely(
          { ownerType: "SELLER", ownerId: sellerId },
          {
            title: "Order Cancelled ❌",
            body: `Order ${sellerOrder.orderId} has been cancelled by the ${reason.includes('user') ? 'user' : 'restaurant'}.`,
            data: {
              type: "seller_order_cancelled",
              orderId: sellerOrder.orderId,
              sellerOrderId: sellerOrder._id?.toString?.() || "",
              link: `/seller/orders`,
            },
          }
        );
      }
    }
  } catch (error) {
    logger.warn(`notifySellerOrderCancelled failed: ${error.message}`);
  }
}


// Stale listNearbyOnlineDeliveryPartners removed (now imported from order-dispatch.service.js)

async function refreshSplitDispatchLegCandidates(order) {
  if (!isSplitDispatchOrder(order)) return false;

  const assignedPartnerIds = new Set(
    (order.dispatchPlan?.legs || [])
      .map((leg) => toIdString(leg?.deliveryPartnerId))
      .filter(Boolean),
  );

  let changed = false;
  for (const leg of order.dispatchPlan?.legs || []) {
    if (toIdString(leg?.deliveryPartnerId)) continue;

    const pickupPoint = (order.pickupPoints || []).find(
      (point) => `${point?.pickupType}:${point?.sourceId}` === leg.legId,
    );
    if (!pickupPoint) continue;

    const candidates = await listNearbyPartnersForPoint(pickupPoint);
    const nextCandidates = candidates.filter((candidate) => {
      const candidateId = toIdString(candidate?.partnerId);
      if (!candidateId) return false;
      if (
        isExpressSplitDispatchOrder(order) &&
        assignedPartnerIds.has(candidateId)
      ) {
        return false;
      }
      return true;
    });

    const previousSerialized = JSON.stringify(
      (leg.partnerCandidates || []).map((candidate) => ({
        partnerId: toIdString(candidate?.partnerId),
        distanceKm: candidate?.distanceKm == null
          ? null
          : Number(candidate.distanceKm),
      })),
    );
    const nextSerialized = JSON.stringify(
      nextCandidates.map((candidate) => ({
        partnerId: toIdString(candidate?.partnerId),
        distanceKm: candidate?.distanceKm == null
          ? null
          : Number(candidate.distanceKm),
      })),
    );

    if (previousSerialized !== nextSerialized) {
      leg.partnerCandidates = nextCandidates;
      changed = true;
    }
  }

  return changed;
}

async function notifySplitDispatchOffers(order, { restaurantDoc = null } = {}) {
  if (!order || !isSplitDispatchOrder(order)) return;

  const refreshed = await refreshSplitDispatchLegCandidates(order);
  if (refreshed) {
    await order.save();
  }

  const io = getIO();
  const restaurant =
    restaurantDoc ||
    (order.restaurantId
      ? await FoodRestaurant.findById(order.restaurantId)
          .select("restaurantName location addressLine1 area city state")
          .lean()
      : null);

  const pushTargets = [];
  const targetedPartnerIds = new Set();
  const maxCandidatesPerLeg = isExpressSplitDispatchOrder(order) ? 3 : 5;
  const openLegs = (order.dispatchPlan?.legs || []).filter(
    (leg) => !toIdString(leg?.deliveryPartnerId),
  );
  const distinctOpenCandidateIds = new Set(
    openLegs.flatMap((leg) =>
      (Array.isArray(leg?.partnerCandidates) ? leg.partnerCandidates : [])
        .map((candidate) => toIdString(candidate?.partnerId))
        .filter(Boolean),
    ),
  );
  const canEnforceDistinctExpressTargets =
    isExpressSplitDispatchOrder(order) &&
    distinctOpenCandidateIds.size >= openLegs.length;

  for (const leg of order.dispatchPlan?.legs || []) {
    if (toIdString(leg?.deliveryPartnerId)) continue;

    const legPayload = buildSplitLegSocketPayload(order, leg, restaurant);
    const candidatePool = Array.isArray(leg.partnerCandidates)
      ? [...leg.partnerCandidates]
      : [];
    const uniqueCandidates = candidatePool.filter(
      (candidate) => !targetedPartnerIds.has(toIdString(candidate?.partnerId)),
    );
    const duplicateCandidates = candidatePool.filter((candidate) =>
      targetedPartnerIds.has(toIdString(candidate?.partnerId)),
    );
    const candidatesToNotify = isExpressSplitDispatchOrder(order)
      ? (
          canEnforceDistinctExpressTargets
            ? uniqueCandidates
            : [...uniqueCandidates, ...duplicateCandidates]
        ).slice(0, maxCandidatesPerLeg)
      : candidatePool.slice(0, maxCandidatesPerLeg);

    for (const candidate of candidatesToNotify) {
      const partnerId = toIdString(candidate?.partnerId);
      if (!partnerId) continue;
      targetedPartnerIds.add(partnerId);

      if (io) {
        io.to(rooms.delivery(partnerId)).emit("new_order_available", {
          ...legPayload,
          pickupDistanceKm: candidate?.distanceKm ?? null,
          dispatchLeg: {
            ...legPayload.dispatchLeg,
            candidateDistanceKm: candidate?.distanceKm ?? null,
          },
        });
        io.to(rooms.delivery(partnerId)).emit("play_notification_sound", {
          orderId: legPayload.orderId,
          orderMongoId: legPayload.orderMongoId,
          legId: leg.legId,
        });
      }

      pushTargets.push({
        ownerType: "DELIVERY_PARTNER",
        ownerId: partnerId,
      });
    }
  }

  if (pushTargets.length) {
    await notifyOwnersSafely(pushTargets, {
      title: "New mixed pickup available",
      body: `Order ${order.orderId} has a nearby pickup leg available for delivery.`,
      data: {
        type: "new_order_available",
        orderId: order.orderId,
        orderMongoId: order._id?.toString?.() || "",
        link: "/delivery",
      },
    });
  }
}

export async function notifySplitDispatchOffersForOrder(orderId) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) {
    throw new ValidationError("Order id required");
  }

  const order = await FoodOrder.findOne(identity);
  if (!order) {
    throw new NotFoundError("Order not found");
  }

  if (!isSplitDispatchOrder(order)) {
    throw new ValidationError("Order is not configured for split dispatch");
  }

  const activeStatuses = ["confirmed", "preparing", "ready_for_pickup", "ready"];
  if (!activeStatuses.includes(String(order.orderStatus || "").toLowerCase())) {
    throw new ValidationError(`Cannot notify riders for order in status: ${order.orderStatus}`);
  }

  await notifySplitDispatchOffers(order);
  return { success: true };
}

/** Triggered by BullMQ 15 minutes before scheduledAt. */
export async function processScheduledOrderNotification(orderMongoId) {
  const order = await FoodOrder.findById(orderMongoId);
  if (!order) return { success: false, reason: "Order not found" };

  // If order was cancelled or already confirmed, skip
  if (order.orderStatus !== "scheduled") {
    return { success: false, reason: `Order is in ${order.orderStatus} status` };
  }

  // Update status to 'placed' (which is the state for orders waiting restaurant action)
  order.orderStatus = "placed";
  pushStatusHistory(order, {
    byRole: "SYSTEM",
    from: "scheduled",
    to: "placed",
    note: "Scheduled order activated for restaurant review (15m window reached)",
  });
  await order.save();

  // Now trigger the actual notifications
  await notifyRestaurantNewOrder(order);
  
  const sellerOrders = order.orderType === "quick" || order.orderType === "mixed" 
    ? await upsertSellerOrdersForParent(order)
    : [];
  if (sellerOrders.length > 0) {
    await notifySellerNewOrders(order, sellerOrders);
  }

  return { success: true };
}

// Stale getDispatchSettings and updateDispatchSettings removed (now imported from order-dispatch.service.js)

/**
 * Security: the client submits a per-item `price`, but the server never looked it up
 * against the real FoodItem before persisting an order or charging Razorpay — a client
 * could submit any price it wanted. This does not (yet) reconstruct add-on pricing
 * server-side (order items don't carry a structured add-on selection today), so it
 * enforces a floor rather than an exact match: the submitted price can't be below the
 * Forces each food line's charged price to the item's real base price (or matched
 * variant price). That blocks the "pay ₹1 for a ₹500 item" class of exploit.
 * Addon line totals must stay on separate addon fields — they are not baked into price.
 */
async function enforceMinimumFoodItemPrices(items, sourceMap) {
  const foodItems = (items || []).filter((item) => item.type === "food");
  if (!foodItems.length) return;

  const validIds = [...new Set(
    foodItems
      .map((item) => String(item.itemId || ""))
      .filter((id) => mongoose.isValidObjectId(id)),
  )].map((id) => new mongoose.Types.ObjectId(id));

  const foodDocs = validIds.length
    ? await FoodItem.find({ _id: { $in: validIds } })
        .select("restaurantId price otherPrice variants approvalStatus isAvailable name packagingCharge minOrderQuantity maxOrderQuantity")
        .lean()
    : [];
  const foodDocMap = new Map(foodDocs.map((doc) => [String(doc._id), doc]));

  const restaurantIds = [...new Set(foodDocs.map((d) => String(d.restaurantId || "")).filter(Boolean))];

  // Authoritative add-on prices: whatever the cart or client says, the charge is
  // always the approved add-on's current price, and unknown ids are rejected.
  const addonMap = restaurantIds.length
    ? await loadApprovedAddonMap(
        restaurantIds[0],
        foodItems.flatMap((item) =>
          (Array.isArray(item.addons) ? item.addons : []).map(
            (addon) => addon?.addonId ?? addon?.id ?? addon?._id,
          ),
        ),
      )
    : new Map();
  const pricingRules = await loadActivePricingRulesForRestaurants({
    restaurantIds,
    menuItemIds: foodDocs.map((d) => d._id),
  });

  for (const item of foodItems) {
    const label = item.name || "This item";
    const doc = foodDocMap.get(String(item.itemId || ""));
    if (!doc) {
      throw new ValidationError(`"${label}" is no longer available. Please refresh your cart.`);
    }
    if (doc.approvalStatus !== "approved" || doc.isAvailable === false) {
      throw new ValidationError(`"${label}" is currently unavailable. Please refresh your cart.`);
    }

    const resolvedSource = sourceMap.get(String(item.sourceId));
    const resolvedRestaurantId = resolvedSource?.sourceId;
    if (!resolvedRestaurantId || String(doc.restaurantId) !== String(resolvedRestaurantId)) {
      throw new ValidationError(`"${label}" does not belong to the selected restaurant.`);
    }

    const hasVariantsInDB = doc.variants && doc.variants.length > 0;
    if (hasVariantsInDB && !item.variantId) {
      throw new ValidationError(`Please select an option for "${label}" before adding to cart.`);
    }

    // Packaging is billed from the stored menu item, never from the cart payload,
    // so a client can't invent (or zero out) a per-item packaging charge.
    item.foodPackagingCharge = resolveItemPackagingAmount(doc);

    // Final gate on the item's min/max order quantity. The cart already enforces
    // this, but checkout can be reached with a stale cart or a direct API call.
    assertOrderQuantity(item.quantity, resolveOrderQuantityRules(doc), label);

    // Re-resolve add-ons against the approved list. A selection that no longer
    // exists fails checkout loudly rather than being dropped from a paid order.
    if (Array.isArray(item.addons) && item.addons.length) {
      const priced = priceAddonSelection(
        item.addons.map((addon) => ({
          addonId: addon?.addonId ?? addon?.id ?? addon?._id,
          quantity: addon?.quantity,
        })),
        addonMap,
      );
      if (priced.removed.length) {
        throw new ValidationError(
          `An add-on on "${label}" is no longer available. Please refresh your cart.`,
        );
      }
      item.addons = priced.addons.map((addon) => ({
        addonId: addon.addonId,
        name: addon.name,
        price: addon.price,
        quantity: addon.quantity,
      }));
    } else {
      item.addons = [];
    }

    const priced = applyOtherPriceToFood(doc, pricingRules);

    let basePrice = Number(priced.basePrice) || Number(doc.price) || 0;
    let liveOtherPrice = Number(priced.otherPrice) || 0;
    let appliedPricingType = priced.appliedPricingType || null;
    let appliedPricingValue = priced.appliedPricingValue ?? null;
    let pricingScope = priced.pricingScope || null;
    let pricingRule = priced.pricingRule || null;
    
    if (item.variantId && hasVariantsInDB) {
      const variant = (priced.variants || []).find((v) => String(v.id || v._id) === String(item.variantId))
        || doc.variants.find((v) => String(v._id) === String(item.variantId));
      if (!variant) {
        throw new ValidationError(`Selected option for "${label}" is no longer available. Please refresh your cart.`);
      }
      basePrice = Number(variant.price) || 0;
      liveOtherPrice = Number(variant.otherPrice) || 0;
      appliedPricingType = variant.appliedPricingType || appliedPricingType;
      appliedPricingValue = variant.appliedPricingValue ?? appliedPricingValue;
      pricingScope = variant.pricingScope || pricingScope;
    }

    const submittedPrice = Number(item.price);
    if (!Number.isFinite(submittedPrice) || submittedPrice < basePrice - 0.01) {
      throw new ValidationError(`Price for "${label}" has changed. Please refresh your cart and try again.`);
    }

    // Prefer cart compare-at snapshot when selling base is unchanged so the receipt
    // matches what the customer saw. Always force charged price to DB base.
    const snapshotBase = Number(item.basePrice);
    const snapshotOther = Number(item.otherPrice);
    const baseMatchesSnapshot =
      Number.isFinite(snapshotBase) && Math.abs(snapshotBase - basePrice) < 0.01;
    const useCartOtherPrice =
      baseMatchesSnapshot &&
      Number.isFinite(snapshotOther) &&
      snapshotOther >= basePrice - 0.01 &&
      (item.pricingScope || item.appliedPricingType);

    const finalOther = useCartOtherPrice ? snapshotOther : liveOtherPrice;

    item.price = basePrice;
    item.basePrice = basePrice;
    item.otherPrice = finalOther;
    item.markupAmount = Math.max(
      0,
      Math.round((finalOther - basePrice) * 100) / 100,
    );
    if (useCartOtherPrice) {
      item.appliedPricingType = item.appliedPricingType || appliedPricingType;
      item.appliedPricingValue =
        item.appliedPricingValue != null ? item.appliedPricingValue : appliedPricingValue;
      item.pricingScope = item.pricingScope || pricingScope;
      item.pricingRule = item.pricingRule || pricingRule;
    } else {
      item.appliedPricingType = appliedPricingType;
      item.appliedPricingValue = appliedPricingValue;
      item.pricingScope = pricingScope;
      item.pricingRule = pricingRule;
    }
  }
}

/**
 * Shared, authoritative coupon/discount computation — used by both the price preview
 * (calculateOrder) and real order creation (createOrder) so a client can never submit
 * an arbitrary `discount` amount without a real, currently-valid coupon backing it.
 */
/**
 * Shared coupon computation lives in coupon.service.js (single source of truth).
 */

/**
 * Food checkout always uses the DB cart as source of truth.
 * Quick-only orders keep client/QC cart items. Mixed = DB food + client quick lines.
 */
async function resolveCheckoutItems(userId, dto = {}) {
  const clientItems = normalizeOrderItems(dto.items || [], dto.orderType);
  const hasQuickClient = clientItems.some((item) => item.type === "quick");
  const useCart = dto.useCart !== false && dto.orderType !== "quick";

  if (!useCart || dto.orderType === "quick") {
    if (!clientItems.length) throw new ValidationError("Your cart is empty");
    return {
      items: clientItems,
      restaurantId: dto.restaurantId || null,
      restaurantName: dto.restaurantName || "",
      couponCode: String(dto.couponCode || "").trim(),
    };
  }

  const fromCart = await buildOrderItemsFromFoodCart(userId);
  const quickItems = clientItems.filter((item) => item.type === "quick");

  if (dto.orderType === "mixed" || (hasQuickClient && fromCart.items.length)) {
    if (!quickItems.length) {
      throw new ValidationError("Mixed orders must include quick commerce items");
    }
    return {
      items: [...fromCart.items, ...quickItems],
      restaurantId: fromCart.restaurantId,
      restaurantName: fromCart.restaurantName,
      couponCode: String(dto.couponCode || fromCart.couponCode || "").trim(),
    };
  }

  return {
    items: fromCart.items,
    restaurantId: fromCart.restaurantId,
    restaurantName: fromCart.restaurantName,
    couponCode: String(dto.couponCode || fromCart.couponCode || "").trim(),
  };
}

// ----- Calculate (validation + return pricing from payload) -----
export async function calculateOrder(userId, dto) {
  const resolved = await resolveCheckoutItems(userId, dto);
  const items = resolved.items;
  const hasFoodItems = items.some((item) => item.type === "food");
  const hasQuickItems = items.some((item) => item.type === "quick");
  const orderType =
    hasFoodItems && hasQuickItems
      ? "mixed"
      : hasQuickItems
        ? "quick"
        : "food";
  if (resolved.restaurantId) {
    dto.restaurantId = resolved.restaurantId;
  }
  if (resolved.couponCode && !dto.couponCode) {
    dto.couponCode = resolved.couponCode;
  }

  // Fee settings (admin-configured). Use safe fallbacks for dev if not configured.
  const feeDoc = await FoodFeeSettings.findOne({ isActive: true })
    .sort({ createdAt: -1 })
    .lean();
  const feeSettings = normalizeFoodFeeSettings(feeDoc);

  const sourceMap = await fetchPickupSourcesByType(items);
  // MUST run before subtotal — enforce mutates item.price to authoritative base.
  await enforceMinimumFoodItemPrices(items, sourceMap);
  const subtotal = computeItemsSubtotal(items);
  const pickupPoints = buildPickupPointsFromItems(items, sourceMap);
  const eligibility =
    orderType === "mixed"
      ? await evaluateCombinedPickupEligibility(pickupPoints, dto.address)
      : {
          eligible: false,
          pickupDistanceKm: null,
          sameDirection: false,
          reason: "",
        };

  const packagingConfig = normalizePackagingConfig(feeDoc);

  if (orderType === "quick") {
    // Quick-only carts carry their own per-product packing fee (quick-commerce),
    // so the food packaging charge never applies here.
    const packagingFee = 0;
    const platformFee = feeSettings.platformFee;
    const deliveryFee = feeSettings.deliveryFee;
    const gstRate = feeSettings.gstRate;
    const tax =
      Number.isFinite(gstRate) && gstRate > 0
        ? Math.round(subtotal * (gstRate / 100))
        : 0;
    const discount = 0;
    const total = Math.max(
      0,
      subtotal + packagingFee + deliveryFee + platformFee + tax - discount,
    );

    return {
      pricing: {
        subtotal,
        tax,
        packagingFee,
        deliveryFee,
        platformFee,
        discount,
        total,
        currency: "INR",
        couponCode: null,
        appliedCoupon: null,
      },
    };
  }

  const foodSourceIds = [
    ...new Set(
      items
        .filter((item) => item.type === "food")
        .map((item) => item.sourceId)
        .filter(Boolean),
    ),
  ];
  const primaryRestaurantId = dto.restaurantId || foodSourceIds[0];
  const primaryRestaurant = sourceMap.get(String(primaryRestaurantId));
  if (!primaryRestaurant) throw new ValidationError("Restaurant not found");
  if (primaryRestaurant.status !== "approved")
    throw new ValidationError("Restaurant not available");

  const inactiveQuickSource = [...sourceMap.values()].find(
    (source) =>
      source.type === "quick" &&
      !["approved", "active"].includes(String(source.status || "").toLowerCase()),
  );
  if (inactiveQuickSource) {
    throw new ValidationError(
      `${inactiveQuickSource.sourceName || "Quick store"} is not available`,
    );
  }

  const { packagingFee, packagingMode } = computeFoodPackagingFee({
    items,
    config: packagingConfig,
  });
  const platformFee = feeSettings.platformFee;

  let deliveryFee = 0;
  let totalDeliveryFee = 0;
  let userDeliveryFee = 0;
  let restaurantDeliveryFee = 0;
  let sponsoredDelivery = false;
  let sponsoredKm = 0;
  let deliveryDistanceKm = null;
  let deliverySponsorType = "USER_FULL";
  let riderBaseDeliveryFee = 0;
  let deliveryExtraFee = 0;

  if (orderType === "food") {
    const userPoint = getPointLatLng(dto.address?.location);
    const restaurantPoint = getPointLatLng(primaryRestaurant?.location);
    const distanceKm = await resolveDeliveryDistanceKm(restaurantPoint, userPoint);
    const deliveryPricing = calculateFoodDeliveryPricing({
      subtotal,
      distanceKm,
      feeSettings,
    });
    deliveryFee = deliveryPricing.deliveryFee;
    totalDeliveryFee = deliveryPricing.totalDeliveryFee;
    userDeliveryFee = deliveryPricing.userDeliveryFee;
    restaurantDeliveryFee = deliveryPricing.restaurantDeliveryFee;
    sponsoredDelivery = deliveryPricing.sponsoredDelivery;
    sponsoredKm = deliveryPricing.sponsoredKm;
    deliveryDistanceKm = deliveryPricing.deliveryDistanceKm;
    deliverySponsorType = deliveryPricing.deliverySponsorType;
    riderBaseDeliveryFee = deliveryPricing.riderBaseDeliveryFee;
    deliveryExtraFee = deliveryPricing.deliveryExtraFee;
  } else {
    deliveryFee = feeSettings.deliveryFee;
    totalDeliveryFee = deliveryFee;
    userDeliveryFee = deliveryFee;
  }

  const quickFeeDoc = (orderType === "mixed")
    ? await QuickFeeSettings.findOne({ isActive: true }).sort({ createdAt: -1 }).lean()
    : null;

  const quickSubtotal = orderType === "mixed"
    ? items.filter(i => i.type === "quick").reduce((s, i) => s + (Number(i.price) * Number(i.quantity)), 0)
    : 0;

  const codeRaw = dto.couponCode
    ? String(dto.couponCode).trim().toUpperCase()
    : "";
  const {
    discount,
    couponDiscount,
    itemDiscount,
    appliedCoupon,
    freeDelivery,
    couponSource,
    couponRefId,
  } = await computeCouponDiscount({
    couponCode: codeRaw,
    subtotal,
    restaurantId: primaryRestaurantId,
    userId,
    items,
  });

  const tax = computeTaxOnTaxableAmount({
    orderType,
    items,
    subtotal,
    itemDiscount,
    couponDiscount: couponDiscount || discount,
    foodGstRate: feeSettings.gstRate,
    quickGstRate: quickFeeDoc?.gstRate ?? 0,
  });

  const quickDeliveryFee = orderType === "mixed"
    ? calculateDeliveryFeeFromSettings(quickSubtotal, quickFeeDoc || undefined)
    : 0;
  const normalDeliveryFee = freeDelivery
    ? 0
    : (orderType === "mixed" ? Math.max(deliveryFee, quickDeliveryFee) : deliveryFee);
  const expressDeliveryFee = freeDelivery
    ? 0
    : (orderType === "mixed" ? deliveryFee + quickDeliveryFee : deliveryFee);
  const selectedDeliveryFee = freeDelivery
    ? 0
    : (orderType === "mixed" ? normalDeliveryFee : deliveryFee);

  // Delivery speed tier (Eco/Standard/Express) - food orders only. Rider payout
  // (deliveryFee/totalDeliveryFee/restaurantDeliveryFee above) is untouched;
  // this is a separate customer-facing surcharge for faster handling.
  const deliverySpeedOptionsList = orderType === "food" ? feeSettings.deliverySpeedOptions : [];
  const selectedDeliverySpeedOption =
    orderType === "food"
      ? pickDeliverySpeedOption(deliverySpeedOptionsList, dto.deliveryFleet)
      : null;
  const deliverySpeedFee = selectedDeliverySpeedOption
    ? Number(selectedDeliverySpeedOption.extraFee || 0)
    : 0;

  const total = Math.max(
    0,
    subtotal + packagingFee + selectedDeliveryFee + deliverySpeedFee + platformFee + tax - discount,
  );
  const deliveryOptions =
    orderType === "mixed" && eligibility.eligible
      ? [
          {
            code: "normal",
            label: "Normal delivery",
            deliveryFee: normalDeliveryFee,
            total: Math.max(
              0,
              subtotal +
                packagingFee +
                normalDeliveryFee +
                platformFee +
                tax -
                discount,
            ),
            riderCount: 1,
          },
          {
            code: "express",
            label: "Express delivery",
            deliveryFee: expressDeliveryFee,
            total: Math.max(
              0,
              subtotal +
                packagingFee +
                expressDeliveryFee +
                platformFee +
                tax -
                discount,
            ),
            riderCount: 2,
          },
        ]
      : [];
  return {
    pricing: {
      subtotal,
      tax,
      packagingFee,
      packagingMode,
      deliveryFee: selectedDeliveryFee,
      totalDeliveryFee:
        orderType === "food" ? totalDeliveryFee : selectedDeliveryFee,
      userDeliveryFee:
        orderType === "food" ? userDeliveryFee : selectedDeliveryFee,
      restaurantDeliveryFee:
        orderType === "food" ? restaurantDeliveryFee : 0,
      sponsoredDelivery:
        orderType === "food" ? sponsoredDelivery : false,
      sponsoredKm:
        orderType === "food" ? sponsoredKm : 0,
      deliveryDistanceKm:
        orderType === "food" ? deliveryDistanceKm : null,
      deliverySponsorType:
        orderType === "food" ? deliverySponsorType : "USER_FULL",
      riderBaseDeliveryFee:
        orderType === "food" ? (freeDelivery ? 0 : riderBaseDeliveryFee) : 0,
      deliveryExtraFee:
        orderType === "food" ? (freeDelivery ? 0 : deliveryExtraFee) : 0,
      platformFee,
      discount,
      itemDiscount: itemDiscount || 0,
      couponDiscount: couponDiscount || discount || 0,
      couponCode: appliedCoupon?.code || (discount > 0 || freeDelivery ? codeRaw : null) || null,
      couponSource: appliedCoupon ? couponSource : null,
      couponRefId: appliedCoupon ? couponRefId : null,
      couponFreeDelivery: Boolean(freeDelivery),
      couponConsumed: false,
      deliverySpeedFee,
      deliverySpeed: selectedDeliverySpeedOption
        ? {
            code: selectedDeliverySpeedOption.code,
            label: selectedDeliverySpeedOption.label,
            fee: deliverySpeedFee,
            etaMinutesMin: selectedDeliverySpeedOption.etaMinutesMin,
            etaMinutesMax: selectedDeliverySpeedOption.etaMinutesMax,
          }
        : null,
      deliverySpeedOptions: deliverySpeedOptionsList.map((option) => ({
        code: option.code,
        label: option.label,
        description: option.description || "",
        fee: Number(option.extraFee || 0),
        etaMinutesMin: option.etaMinutesMin,
        etaMinutesMax: option.etaMinutesMax,
        isDefault: Boolean(option.isDefault),
        total: Math.max(
          0,
          subtotal +
            packagingFee +
            selectedDeliveryFee +
            Number(option.extraFee || 0) +
            platformFee +
            tax -
            discount,
        ),
      })),
      total,
      currency: "INR",
        appliedCoupon,
        deliveryOptions,
        pickupDistanceKm: eligibility.pickupDistanceKm,
        combinedPickupEligible: eligibility.eligible,
        mixedOrderDistanceLimit: eligibility.distanceLimitKm,
        mixedOrderAngleLimit: eligibility.angleLimitDeg,
        sameDirection: eligibility.sameDirection,
        eligibilityReason: eligibility.reason,
        pickupPoints,
      },
    };
}

// ----- Create order -----
export async function createOrder(userId, dto) {
  console.log("[TRACE] createOrder reached", { userId, restaurantId: dto.restaurantId });
  const resolved = await resolveCheckoutItems(userId, dto);
  const items = resolved.items;
  const hasFoodItems = items.some((item) => item.type === "food");
  const hasQuickItems = items.some((item) => item.type === "quick");
  const orderType =
    hasFoodItems && hasQuickItems
      ? "mixed"
      : hasQuickItems
        ? "quick"
        : "food";
  if (resolved.restaurantId) {
    dto.restaurantId = resolved.restaurantId;
  }
  if (resolved.restaurantName) {
    dto.restaurantName = resolved.restaurantName;
  }
  if (resolved.couponCode) {
    dto.couponCode = resolved.couponCode;
  }
  const sourceMap = await fetchPickupSourcesByType(items);
  await enforceMinimumFoodItemPrices(items, sourceMap);
  const foodSourceIds = [
    ...new Set(
      items
        .filter((item) => item.type === "food")
        .map((item) => item.sourceId)
        .filter(Boolean),
    ),
  ];
  const primaryRestaurantId = dto.restaurantId || foodSourceIds[0] || null;
  const primaryRestaurant = primaryRestaurantId
    ? sourceMap.get(String(primaryRestaurantId))
    : null;
  if (hasFoodItems) {
    if (!primaryRestaurant) throw new ValidationError("Restaurant not found");
    if (primaryRestaurant.status !== "approved")
      throw new ValidationError("Restaurant not accepting orders");

    // PHASE 3D: SUBSCRIPTION GUARD (READ-ONLY VALIDATION) (Bypassed)
    /* Comment out the related restriction/check logic in the codebase instead of removing it completely.
    // CRITICAL: Use primaryRestaurant.sourceId (MongoDB _id) instead of primaryRestaurantId (which could be custom ID)
    console.log("[TRACE] calling eligibility", { sourceId: primaryRestaurant.sourceId });
    const eligibility = await ensureDailyPassEligibility(primaryRestaurant.sourceId, 'RESTAURANT');
    console.log("[TRACE] eligibility received in createOrder:", eligibility);
    console.log("[TRACE] condition check:", {
        eligible: eligibility.eligible,
        shouldDeduct: eligibility.shouldDeduct,
        willThrow: !eligibility.eligible || eligibility.shouldDeduct
    });
    if (!eligibility.eligible || eligibility.shouldDeduct) {
      throw new ValidationError(eligibility.reason === 'LOW_BALANCE' || eligibility.reason === 'REQUIRES_DAY_DEDUCTION'
        ? "Restaurant is not accepting new orders due to insufficient subscription balance." 
        : "Restaurant is not accepting new orders at this time.");
    }
    */
  }
  const inactiveQuickSource = [...sourceMap.values()].find(
    (source) =>
      source.type === "quick" &&
      !["approved", "active"].includes(String(source.status || "").toLowerCase()),
  );
  if (inactiveQuickSource) {
    throw new ValidationError(
      `${inactiveQuickSource.sourceName || "Quick store"} is not accepting orders`,
    );
  }

  const orderId = await ensureUniqueOrderId();
  const settings =
    orderType === "food" || orderType === "mixed"
      ? await getDispatchSettings()
      : null;
  const dispatchMode = settings?.dispatchMode || "manual";

  const deliveryAddress = normalizeDeliveryAddress(dto.address);

  // Self-heal text-only addresses (legacy saved addresses without coordinates):
  // geocode server-side so distance-based pricing, dispatch and live tracking
  // all get a usable point. Best-effort — order creation never fails on this.
  if (deliveryAddress && !deliveryAddress.location) {
    const addressText = [
      deliveryAddress.street,
      deliveryAddress.area,
      deliveryAddress.city,
      deliveryAddress.state,
      deliveryAddress.zipCode,
    ]
      .filter(Boolean)
      .join(", ");
    if (addressText) {
      try {
        const geocoded = await geocodeAddress(addressText);
        if (geocoded) {
          deliveryAddress.location = {
            type: "Point",
            coordinates: [geocoded.longitude, geocoded.latitude],
          };
        }
      } catch (err) {
        logger.warn(`Order address geocode fallback failed: ${err?.message || err}`);
      }
    }
  }

  const paymentMethod =
    dto.paymentMethod === "card" ? "razorpay" : dto.paymentMethod;
  const isCash = paymentMethod === "cash";
  const isWallet = paymentMethod === "wallet";

  // SECURITY: isCodAllowed was previously only enforced client-side (hiding the COD
  // option in the UI) — a user blocked from COD could still place a cash order via a
  // direct API call. Enforce it server-side too.
  if (isCash && userId) {
    const codUser = await FoodUser.findById(userId).select("isCodAllowed").lean();
    if (codUser && codUser.isCodAllowed === false) {
      throw new ValidationError("Cash on Delivery is not available for your account. Please choose another payment method.");
    }
  }
  const pickupPoints = buildPickupPointsFromItems(items, sourceMap);
  const combinedPickup = await evaluateCombinedPickupEligibility(
    pickupPoints,
    deliveryAddress,
  );
  const requestedDeliveryFleet =
    dto.deliveryFleet ||
    (orderType === "mixed" ? "normal" : orderType === "quick" ? "quick" : "standard");
  if (orderType === "mixed" && requestedDeliveryFleet === "express" && !combinedPickup.eligible) {
    throw new ValidationError(combinedPickup.reason || "Express delivery is not available for this mixed order");
  }
  const dispatchStrategy =
    orderType !== "mixed"
      ? "single"
      : requestedDeliveryFleet === "express"
        ? "express_split"
        : combinedPickup.eligible
          ? "single"
          : "split";

  // SECURITY: subtotal/tax/platformFee/discount/total must never be trusted from the
  // client (dto.pricing) — they were previously accepted verbatim, letting anyone submit
  // an arbitrary total and pay a fraction of the real order value. These are now always
  // computed server-side from validated item prices (see enforceMinimumFoodItemPrices
  // above) and admin-configured fee settings. Delivery fee remains a known residual gap
  // (still client-supplied) — see audit notes; it carries far less fraud value than
  // subtotal/total and reworking it touches the mixed-order express/split dispatch logic,
  // which needs its own dedicated, tested pass.
  const computedSubtotal = computeItemsSubtotal(items);
  const commissionPercentage = primaryRestaurant
    ? resolveRestaurantCommissionPercentage(primaryRestaurant.commissionPercentage)
    : resolveRestaurantCommissionPercentage(0);
  const restaurantCommission = Math.round(computedSubtotal * (commissionPercentage / 100) * 100) / 100;

  const feeDocForOrder = await FoodFeeSettings.findOne({ isActive: true })
    .sort({ createdAt: -1 })
    .lean();
  const feeSettingsForOrder = normalizeFoodFeeSettings(feeDocForOrder);

  const computedPlatformFee = (orderType === "food" || orderType === "mixed")
    ? Number(feeSettingsForOrder.platformFee || 0)
    : 0;

  // Same helper the calculate preview uses, off the same stamped items — the
  // client can never submit its own packaging amount.
  const { packagingFee: computedPackagingFee, packagingMode: computedPackagingMode } =
    computeFoodPackagingFee({
      items,
      config: normalizePackagingConfig(feeDocForOrder),
    });

  const couponResult = (orderType === "food" || orderType === "mixed")
    ? await computeCouponDiscount({
        couponCode: dto.couponCode,
        subtotal: computedSubtotal,
        restaurantId: primaryRestaurantId,
        userId,
        items,
      })
    : {
        discount: 0,
        couponDiscount: 0,
        itemDiscount: 0,
        freeDelivery: false,
        couponCode: null,
        couponSource: null,
        couponRefId: null,
        appliedCoupon: null,
      };
  const computedDiscount = Number(couponResult.discount || 0);
  const computedCouponDiscount = Number(couponResult.couponDiscount || computedDiscount || 0);
  const computedItemDiscount = Number(couponResult.itemDiscount || 0);
  const computedFreeDelivery = Boolean(couponResult.freeDelivery);

  const quickFeeDocForOrder = orderType === "mixed"
    ? await QuickFeeSettings.findOne({ isActive: true }).sort({ createdAt: -1 }).lean()
    : null;

  const computedTax = (orderType === "food" || orderType === "mixed")
    ? computeTaxOnTaxableAmount({
        orderType,
        items,
        subtotal: computedSubtotal,
        itemDiscount: computedItemDiscount,
        couponDiscount: computedCouponDiscount,
        foodGstRate: feeSettingsForOrder.gstRate,
        quickGstRate: quickFeeDocForOrder?.gstRate ?? 0,
      })
    : 0;

  // Server-side delivery fees (never trust client dto.pricing for food/mixed).
  let serverDeliveryFee = 0;
  let serverTotalDeliveryFee = 0;
  let serverUserDeliveryFee = 0;
  let serverRestaurantDeliveryFee = 0;
  let serverSponsoredDelivery = false;
  let serverSponsoredKm = 0;
  let serverDeliveryDistanceKm = null;
  let serverDeliverySponsorType = "USER_FULL";
  let serverRiderBaseDeliveryFee = 0;
  let serverDeliveryExtraFee = 0;

  if (orderType === "food") {
    const userPoint = getPointLatLng(deliveryAddress?.location);
    const restaurantPoint = getPointLatLng(primaryRestaurant?.location);
    const distanceForFee = await resolveDeliveryDistanceKm(restaurantPoint, userPoint);
    const deliveryPricing = calculateFoodDeliveryPricing({
      subtotal: computedSubtotal,
      distanceKm: distanceForFee,
      feeSettings: feeSettingsForOrder,
    });
    serverDeliveryFee = deliveryPricing.deliveryFee;
    serverTotalDeliveryFee = deliveryPricing.totalDeliveryFee;
    serverUserDeliveryFee = deliveryPricing.userDeliveryFee;
    serverRestaurantDeliveryFee = deliveryPricing.restaurantDeliveryFee;
    serverSponsoredDelivery = deliveryPricing.sponsoredDelivery;
    serverSponsoredKm = deliveryPricing.sponsoredKm;
    serverDeliveryDistanceKm = deliveryPricing.deliveryDistanceKm;
    serverDeliverySponsorType = deliveryPricing.deliverySponsorType;
    serverRiderBaseDeliveryFee = deliveryPricing.riderBaseDeliveryFee;
    serverDeliveryExtraFee = deliveryPricing.deliveryExtraFee;
  } else if (orderType === "mixed") {
    const userPoint = getPointLatLng(deliveryAddress?.location);
    const restaurantPoint = getPointLatLng(primaryRestaurant?.location);
    const distanceForFee = await resolveDeliveryDistanceKm(restaurantPoint, userPoint);
    const foodDeliveryPricing = calculateFoodDeliveryPricing({
      subtotal: computedSubtotal,
      distanceKm: distanceForFee,
      feeSettings: feeSettingsForOrder,
    });
    const quickSubtotalOnly = items
      .filter((i) => i.type === "quick")
      .reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
    const quickDeliveryFee = calculateDeliveryFeeFromSettings(
      quickSubtotalOnly,
      quickFeeDocForOrder || undefined,
    );
    const selectedFleet = requestedDeliveryFleet === "express" ? "express" : "normal";
    serverDeliveryFee = selectedFleet === "express"
      ? foodDeliveryPricing.deliveryFee + quickDeliveryFee
      : Math.max(foodDeliveryPricing.deliveryFee, quickDeliveryFee);
    serverTotalDeliveryFee = serverDeliveryFee;
    serverUserDeliveryFee = serverDeliveryFee;
    serverDeliveryDistanceKm = foodDeliveryPricing.deliveryDistanceKm;
    serverRiderBaseDeliveryFee = foodDeliveryPricing.riderBaseDeliveryFee;
    serverDeliveryExtraFee = foodDeliveryPricing.deliveryExtraFee;
  }

  if (computedFreeDelivery) {
    serverDeliveryFee = 0;
    serverTotalDeliveryFee = 0;
    serverUserDeliveryFee = 0;
    serverRestaurantDeliveryFee = 0;
    serverSponsoredDelivery = false;
    serverDeliverySponsorType = "USER_FULL";
    serverRiderBaseDeliveryFee = 0;
    serverDeliveryExtraFee = 0;
  }

  // Fast-delivery (Eco/Standard/Express) surcharge — same real lookup calculateOrder
  // already uses, so createOrder can't be handed a fabricated deliverySpeedFee.
  const deliverySpeedOptionsListForOrder = orderType === "food" ? feeSettingsForOrder.deliverySpeedOptions : [];
  const selectedDeliverySpeedOptionForOrder = orderType === "food"
    ? pickDeliverySpeedOption(deliverySpeedOptionsListForOrder, dto.deliveryFleet)
    : null;
  const computedDeliverySpeedFee = selectedDeliverySpeedOptionForOrder
    ? Number(selectedDeliverySpeedOptionForOrder.extraFee || 0)
    : 0;

  const normalizedPricing = {
    subtotal: computedSubtotal,
    tax: computedTax,
    packagingFee: computedPackagingFee,
    packagingMode: computedPackagingMode,
    deliveryFee: serverDeliveryFee,
    totalDeliveryFee: serverTotalDeliveryFee,
    userDeliveryFee: serverUserDeliveryFee,
    restaurantDeliveryFee: serverRestaurantDeliveryFee,
    sponsoredDelivery: serverSponsoredDelivery,
    sponsoredKm: serverSponsoredKm,
    deliveryDistanceKm: serverDeliveryDistanceKm,
    deliverySponsorType: serverDeliverySponsorType,
    riderBaseDeliveryFee: serverRiderBaseDeliveryFee,
    deliveryExtraFee: serverDeliveryExtraFee,
    platformFee: computedPlatformFee,
    discount: computedDiscount,
    itemDiscount: computedItemDiscount,
    couponDiscount: computedCouponDiscount,
    couponCode: couponResult.appliedCoupon?.code || (computedDiscount > 0 || computedFreeDelivery ? couponResult.couponCode : "") || "",
    couponSource: couponResult.appliedCoupon ? (couponResult.couponSource || "") : "",
    couponRefId: couponResult.appliedCoupon ? (couponResult.couponRefId || "") : "",
    couponFreeDelivery: computedFreeDelivery,
    couponConsumed: false,
    deliverySpeedFee: computedDeliverySpeedFee,
    deliverySpeed: selectedDeliverySpeedOptionForOrder
      ? {
          code: String(selectedDeliverySpeedOptionForOrder.code || ""),
          label: String(selectedDeliverySpeedOptionForOrder.label || ""),
          etaMinutesMin: selectedDeliverySpeedOptionForOrder.etaMinutesMin == null
            ? null
            : Number(selectedDeliverySpeedOptionForOrder.etaMinutesMin),
          etaMinutesMax: selectedDeliverySpeedOptionForOrder.etaMinutesMax == null
            ? null
            : Number(selectedDeliverySpeedOptionForOrder.etaMinutesMax),
        }
      : undefined,
    restaurantCommissionPercentage: commissionPercentage,
    restaurantCommission: restaurantCommission,
    total: 0,
    currency: "INR",
  };
  normalizedPricing.totalDeliveryFee = Math.max(0, normalizedPricing.totalDeliveryFee);
  normalizedPricing.userDeliveryFee = Math.max(
    0,
    Number.isFinite(normalizedPricing.userDeliveryFee)
      ? normalizedPricing.userDeliveryFee
      : normalizedPricing.deliveryFee,
  );
  normalizedPricing.restaurantDeliveryFee = Math.max(
    0,
    Number.isFinite(normalizedPricing.restaurantDeliveryFee)
      ? normalizedPricing.restaurantDeliveryFee
      : 0,
  );
  normalizedPricing.sponsoredKm = Math.max(
    0,
    Number.isFinite(normalizedPricing.sponsoredKm) ? normalizedPricing.sponsoredKm : 0,
  );
  normalizedPricing.deliveryFee = Math.max(
    0,
    Number.isFinite(normalizedPricing.deliveryFee)
      ? normalizedPricing.deliveryFee
      : normalizedPricing.userDeliveryFee,
  );
  if (normalizedPricing.totalDeliveryFee < normalizedPricing.deliveryFee) {
    normalizedPricing.totalDeliveryFee = normalizedPricing.deliveryFee;
  }
  if (
    normalizedPricing.restaurantDeliveryFee <= 0 &&
    normalizedPricing.totalDeliveryFee > normalizedPricing.deliveryFee
  ) {
    normalizedPricing.restaurantDeliveryFee = Math.max(
      0,
      normalizedPricing.totalDeliveryFee - normalizedPricing.deliveryFee,
    );
  }
  normalizedPricing.sponsoredDelivery =
    Boolean(normalizedPricing.sponsoredDelivery) ||
    normalizedPricing.restaurantDeliveryFee > 0;
  const computedTotal = Math.max(
    0,
    (Number.isFinite(normalizedPricing.subtotal)
      ? normalizedPricing.subtotal
      : 0) +
      (Number.isFinite(normalizedPricing.tax) ? normalizedPricing.tax : 0) +
      (Number.isFinite(normalizedPricing.packagingFee)
        ? normalizedPricing.packagingFee
        : 0) +
      (Number.isFinite(normalizedPricing.deliveryFee)
        ? normalizedPricing.deliveryFee
        : 0) +
      (Number.isFinite(normalizedPricing.platformFee)
        ? normalizedPricing.platformFee
        : 0) +
      (Number.isFinite(normalizedPricing.deliverySpeedFee)
        ? normalizedPricing.deliverySpeedFee
        : 0) -
      (Number.isFinite(normalizedPricing.discount)
        ? normalizedPricing.discount
        : 0),
  );
  // SECURITY: total is always server-computed from the authoritative fields above —
  // never trust dto.pricing.total (see notes above computedSubtotal).
  normalizedPricing.total = computedTotal;

  const payment = {
    method: paymentMethod,
    status: isCash ? "cod_pending" : isWallet ? "paid" : "created",
    amountDue: normalizedPricing.total ?? 0,
    razorpay: {},
    qr: {},
  };

  let distanceKm = null;
  if (
    (orderType === "food" || orderType === "mixed") &&
    primaryRestaurant?.location?.coordinates?.length === 2 &&
    dto.address?.location?.coordinates?.length === 2
  ) {
    const [rLng, rLat] = primaryRestaurant.location.coordinates;
    const [dLng, dLat] = dto.address.location.coordinates;
    const d = haversineKm(rLat, rLng, dLat, dLng);
    distanceKm = Number.isFinite(d) ? d : null;
  } else {
    console.warn(
      `Food order ${orderId}: distance not available, rider earning set to 0`,
    );
  }
  if (normalizedPricing.deliveryDistanceKm == null && Number.isFinite(distanceKm)) {
    normalizedPricing.deliveryDistanceKm = Number(distanceKm.toFixed(2));
  }

  const riderEarning =
    orderType === "food"
      ? resolveFoodRiderEarning(normalizedPricing)
      : orderType === "quick" || orderType === "mixed"
        ? await foodTransactionService.getRiderEarning(distanceKm)
        : 0;

  // Packaging counts as platform income only in ADMIN mode; in RESTAURANT mode the
  // outlet keeps it (mirrored in foodTransaction.service.js).
  const adminPackagingProfit =
    normalizedPricing.packagingMode === "ADMIN"
      ? Number(normalizedPricing.packagingFee) || 0
      : 0;

  const platformProfit =
    orderType === "food"
      ? Math.max(
          0,
          (Number.isFinite(normalizedPricing.platformFee) ? normalizedPricing.platformFee : 0) +
            adminPackagingProfit +
            (Number(normalizedPricing.restaurantCommission) || 0),
        )
      : Math.max(
          0,
          (Number.isFinite(normalizedPricing.totalDeliveryFee)
            ? normalizedPricing.totalDeliveryFee
            : Number.isFinite(normalizedPricing.deliveryFee)
              ? normalizedPricing.deliveryFee
              : 0) +
            (Number.isFinite(normalizedPricing.platformFee) ? normalizedPricing.platformFee : 0) +
            adminPackagingProfit +
            (Number(normalizedPricing.restaurantCommission) || 0) -
            riderEarning,
        );

  const activeFeeSettings =
    orderType === "mixed" && dispatchStrategy === "express_split"
      ? await FoodFeeSettings.findOne({ isActive: true })
          .sort({ createdAt: -1 })
          .lean()
      : null;
  const quickDeliveryFeeBase =
    orderType === "mixed" && dispatchStrategy === "express_split"
      ? Number(activeFeeSettings?.deliveryFee || 25)
      : 0;
  const quickLegDeliveryFee =
    orderType === "mixed" && dispatchStrategy === "express_split"
      ? quickDeliveryFeeBase
      : 0;
  const foodLegDeliveryFee =
    orderType === "mixed" && dispatchStrategy === "express_split"
      ? Math.max(0, Number(normalizedPricing.deliveryFee || 0) - quickLegDeliveryFee)
      : 0;

  const dispatchPlan = {
    strategy: dispatchStrategy,
    combinedPickupEligible: combinedPickup.eligible,
    pickupDistanceKm: combinedPickup.pickupDistanceKm,
    sameDirection: combinedPickup.sameDirection,
    reason: combinedPickup.reason,
    legs: pickupPoints.map((point) => ({
      legId: `${point.pickupType}:${point.sourceId}`,
      pickupType: point.pickupType,
      sourceId: point.sourceId,
      sourceName: point.sourceName || "",
      deliveryFee:
        dispatchStrategy === "express_split"
          ? point.pickupType === "quick"
            ? quickLegDeliveryFee
            : foodLegDeliveryFee
          : 0,
      riderEarning:
        dispatchStrategy === "express_split"
          ? point.pickupType === "quick"
            ? quickLegDeliveryFee
            : foodLegDeliveryFee
          : 0,
      assignedAt: null,
      deliveryPartnerId: null,
      partnerCandidates: [],
    })),
  };

  if (dispatchStrategy === "express_split" || dispatchStrategy === "split") {
    const legCandidates = await Promise.all(
      pickupPoints.map(async (point) => ({
        legId: `${point.pickupType}:${point.sourceId}`,
        partnerCandidates: await listNearbyPartnersForPoint(point),
      })),
    );
    for (const leg of dispatchPlan.legs) {
      const found = legCandidates.find((candidate) => candidate.legId === leg.legId);
      if (found) leg.partnerCandidates = found.partnerCandidates;
    }
  }

  const preparationTime = hasFoodItems
    ? await resolveOrderPreparationTimeMinutes(items)
    : null;

  const order = new FoodOrder({
    orderType,
    orderId,
    userId: new mongoose.Types.ObjectId(userId),
    restaurantId:
      hasFoodItems && primaryRestaurant?.sourceId ? new mongoose.Types.ObjectId(primaryRestaurant.sourceId) : null,
    zoneId:
      hasFoodItems
        ? dto.zoneId
          ? new mongoose.Types.ObjectId(dto.zoneId)
          : primaryRestaurant?.zoneId || undefined
        : undefined,
    items,
    pickupPoints,
    ...(deliveryAddress ? { deliveryAddress } : {}),
    pricing: normalizedPricing,
    payment,
    orderStatus: dto.scheduledAt ? "scheduled" : "created",
    ...(orderType === "food" || orderType === "mixed"
      ? { dispatch: { modeAtCreation: dispatchMode, status: "unassigned" } }
      : {}),
    dispatchPlan,
    statusHistory: [
      {
        at: new Date(),
        byRole: "SYSTEM",
        from: "",
        to: "created",
        note: "Order placed",
      },
    ],
    note: dto.note || "",
    sendCutlery: dto.sendCutlery !== false,
    ...(preparationTime != null ? { preparationTime } : {}),
    deliveryFleet:
      orderType === "mixed"
        ? requestedDeliveryFleet
        : orderType === "food"
          ? dto.deliveryFleet || "standard"
          : "quick",
    scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
    riderEarning,
    platformProfit,
  });

  let razorpayPayload = null;

  if (paymentMethod === "razorpay") {
    if (!isRazorpayConfigured()) {
      throw new ValidationError(
        "Online payment is temporarily unavailable. Please use Cash or Wallet, or try again later.",
      );
    }
    const amountPaise = Math.round((normalizedPricing.total ?? 0) * 100);
    if (amountPaise < 100)
      throw new ValidationError("Amount too low for online payment");
    try {
      const rzOrder = await createRazorpayOrder(amountPaise, "INR", orderId, {
        type: "food_order",
        orderId: String(orderId),
        userId: String(userId),
      });
      order.payment.razorpay = {
        orderId: rzOrder.id,
        paymentId: "",
        signature: "",
      };
      order.payment.status = "created";
      razorpayPayload = {
        key: getRazorpayKeyId(),
        orderId: rzOrder.id,
        amount: rzOrder.amount,
        currency: rzOrder.currency || "INR",
      };
    } catch (err) {
      throw new ValidationError(err?.message || "Payment gateway error");
    }
  }

  // Wallet: deduct before the order is persisted as paid. On insufficient balance or
  // debit failure, throw and never create the order. If save fails after debit, refund.
  let walletDeducted = false;
  const walletChargeAmount = Math.max(0, Number(normalizedPricing.total || 0));
  if (isWallet && walletChargeAmount > 0) {
    try {
      await deductWalletBalance(
        userId,
        walletChargeAmount,
        `Food order ${orderId}`,
        { orderId, source: "order_payment" },
      );
      walletDeducted = true;
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      throw new ValidationError(err?.message || "Wallet payment failed");
    }
  }

  try {
    await order.save();
  } catch (err) {
    if (walletDeducted) {
      try {
        await refundWalletBalance(
          userId,
          walletChargeAmount,
          `Food order ${orderId} placement rollback`,
          {
            orderId,
            refundTransactionId: `wallet_order_rollback_${orderId}`,
            source: "order_placement_rollback",
          },
        );
      } catch (refundErr) {
        logger.error(
          `Wallet rollback failed after order save error for ${orderId}: ${refundErr?.message || refundErr}`,
        );
      }
    }
    throw err;
  }

  await foodTransactionService.createInitialTransaction(order);
  const sellerOrders = hasQuickItems
    ? await upsertSellerOrdersForParent(order, {
        customerName: dto.customerName,
        customerPhone: dto.customerPhone || dto.address?.phone,
      })
    : [];

  if (paymentMethod === "razorpay" && order.payment?.razorpay?.orderId) {
    // Audit can still happen here or via FinanceService events
  }

  // COD/wallet: consume coupon BEFORE restaurant notify / cart clear.
  // If consume fails, roll back the order so it never completes at the discounted total.
  const requiresImmediateCouponConsume =
    (orderType === "food" || orderType === "mixed") &&
    (isCash || isWallet) &&
    (Number(order.pricing?.couponDiscount || order.pricing?.discount || 0) > 0 ||
      order.pricing?.couponFreeDelivery);

  if (requiresImmediateCouponConsume) {
    let consumeResult;
    try {
      consumeResult = await consumeCouponForOrder(order);
    } catch (err) {
      logger.warn(
        `Coupon consume threw for order ${order.orderId}: ${err?.message || err}`,
      );
      consumeResult = { consumed: false, reason: "CONSUME_ERROR" };
    }

    if (!consumeResult?.consumed) {
      try {
        // Safe even when consume never claimed — no-ops unless couponConsumed was set.
        await releaseCouponForOrder(order);
      } catch (releaseErr) {
        logger.warn(
          `Coupon release during consume-failure rollback for ${order.orderId}: ${releaseErr?.message || releaseErr}`,
        );
      }

      try {
        if (hasQuickItems) {
          await cancelSellerOrdersForParent(
            order,
            "Coupon could not be applied",
          );
        }
        await Promise.all([
          FoodTransaction.deleteOne({
            $or: [
              { orderId: order._id },
              { orderReadableId: String(order.orderId) },
            ],
          }),
          FoodOrder.deleteOne({ _id: order._id }),
        ]);
      } catch (rollbackErr) {
        logger.error(
          `Coupon-failure order rollback failed for ${order.orderId}: ${rollbackErr?.message || rollbackErr}`,
        );
      }

      if (walletDeducted && walletChargeAmount > 0) {
        try {
          await refundWalletBalance(
            userId,
            walletChargeAmount,
            `Food order ${orderId} coupon unavailable rollback`,
            {
              orderId,
              refundTransactionId: `wallet_coupon_fail_rollback_${orderId}`,
              source: "coupon_consume_failure_rollback",
            },
          );
        } catch (refundErr) {
          logger.error(
            `Wallet refund after coupon failure failed for ${orderId}: ${refundErr?.message || refundErr}`,
          );
        }
      }

      throw new ValidationError(
        "This coupon is no longer available. Please remove it or choose another coupon and try again.",
        "COUPON_UNAVAILABLE",
      );
    }
  }

  // Realtime + push notifications.
  try {
    // Notify customer. For online payments, order is created but awaits payment confirmation.
    const isAwaitingOnlinePayment =
      String(order.payment?.method || "").toLowerCase() === "razorpay" &&
      String(order.payment?.status || "").toLowerCase() !== "paid";
    await notifyOwnersSafely([{ ownerType: "USER", ownerId: userId }], {
      title: isAwaitingOnlinePayment
        ? "Complete Payment to Confirm Order"
        : orderType === "mixed"
          ? "Mixed Order Confirmed!"
          : orderType === "quick"
          ? "Quick Order Confirmed!"
          : "Order Confirmed!",
      body: isAwaitingOnlinePayment
        ? orderType === "mixed"
          ? `Order #${orderId} is created. Complete payment to confirm your mixed delivery.`
          : orderType === "quick"
          ? `Order #${orderId} is created. Please complete payment to confirm your quick order.`
          : `Order #${orderId} is created. Please complete payment to send it to ${primaryRestaurant?.sourceName || "the restaurant"}.`
        : orderType === "mixed"
          ? `Your mixed order #${orderId} has been placed successfully.`
          : orderType === "quick"
          ? `Your quick order #${orderId} has been placed successfully.`
          : `Your order #${orderId} from ${primaryRestaurant?.sourceName || "the restaurant"} has been placed successfully.`,
      image: "https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png",
      data: {
        type: isAwaitingOnlinePayment
          ? "order_created_pending_payment"
          : "order_created",
        orderId: String(orderId),
        orderMongoId: order._id?.toString?.() || "",
        link: `/food/user/orders/${order._id?.toString?.() || ""}`,
      },
    });

    // Restaurant gets new-order request only when payment flow is eligible.
    if (hasFoodItems) {
      await notifyRestaurantNewOrder(order);
    }
    if (hasQuickItems) {
      await notifySellerNewOrders(order, sellerOrders);
    }

    // Schedule delayed notification if it's a scheduled order
    if (order.orderStatus === "scheduled" && order.scheduledAt) {
      const now = Date.now();
      const scheduledTime = new Date(order.scheduledAt).getTime();
      const notificationTime = scheduledTime - 15 * 60 * 1000;
      const delay = Math.max(0, notificationTime - now);

      enqueueOrderEvent("NOTIFY_SCHEDULED_ORDER", {
        orderId: order.orderId,
        orderMongoId: order._id.toString(),
      }, { delay });
      
      logger.info(`Scheduled notification for order ${order.orderId} with delay of ${delay}ms`);
    }
  } catch {
    // Don't block order placement on socket failures.
  }

  // Clear DB food cart once the order exists (incl. unpaid Razorpay).
  // Source of truth becomes the order — retry payment reuses it; TTL cleans abandoned unpaid orders.
  if (
    hasFoodItems &&
    (isCash ||
      isWallet ||
      paymentMethod === "razorpay" ||
      String(dto.paymentMethod || "") === "razorpay_qr")
  ) {
    try {
      await clearFoodCart(userId);
    } catch (err) {
      logger.warn(`Food cart clear failed for order ${order.orderId}: ${err?.message || err}`);
    }
  }

  if (
    (orderType === "food" || (orderType === "mixed" && dispatchStrategy === "single")) &&
    dispatchMode === "auto" &&
    (isCash ||
      order.payment.status === "paid" ||
      order.payment.status === "cod_pending")
  ) {
    try {
      await tryAutoAssign(order._id);
    } catch {
      // leave unassigned
    }
  }

  const saved = order.toObject();
  return { order: saved, razorpay: razorpayPayload };
}

const UNPAID_ONLINE_PAYMENT_STATUSES = new Set(["created", "failed"]);
const CANCELLED_ORDER_STATUSES_FOR_RETRY = new Set([
  "cancelled_by_user",
  "cancelled_by_admin",
  "cancelled_by_restaurant",
  "cancelled",
  "failed",
  "payment_failed",
]);

/**
 * Soft-mark unpaid online payment as failed (order stays alive for Retry Payment).
 */
export async function markOnlinePaymentFailed(userId, orderId, note = "") {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne({
    ...identity,
    userId: new mongoose.Types.ObjectId(userId),
  });
  if (!order) throw new NotFoundError("Order not found");

  const method = String(order.payment?.method || "").toLowerCase();
  if (method !== "razorpay") {
    throw new ValidationError("Only unpaid Razorpay orders can be marked payment-failed");
  }
  if (String(order.payment?.status || "").toLowerCase() === "paid") {
    throw new ValidationError("Order is already paid");
  }
  if (CANCELLED_ORDER_STATUSES_FOR_RETRY.has(String(order.orderStatus || "").toLowerCase())) {
    throw new ValidationError("Order is cancelled");
  }

  if (String(order.payment?.status || "").toLowerCase() !== "failed") {
    order.payment.status = "failed";
    pushStatusHistory(order, {
      byRole: "USER",
      byId: userId,
      from: order.orderStatus,
      to: order.orderStatus,
      note: note || "Online payment attempt failed — awaiting retry",
    });
    await order.save();
  }

  return { order: order.toObject(), payment: order.payment };
}

/**
 * Reissue a Razorpay order for an existing unpaid online order (Retry Payment).
 * Does not recalculate pricing, coupons, fees, or create a new FoodOrder.
 */
export async function retryOnlinePayment(userId, orderId) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");
  if (!isRazorpayConfigured()) {
    throw new ValidationError("Payment gateway is not configured");
  }

  const order = await FoodOrder.findOne({
    ...identity,
    userId: new mongoose.Types.ObjectId(userId),
  });
  if (!order) throw new NotFoundError("Order not found");

  const method = String(order.payment?.method || "").toLowerCase();
  const payStatus = String(order.payment?.status || "").toLowerCase();
  const orderStatus = String(order.orderStatus || "").toLowerCase();

  if (method !== "razorpay") {
    throw new ValidationError("Retry payment is only available for Razorpay orders");
  }
  if (payStatus === "paid") {
    throw new ValidationError("Order is already paid");
  }
  if (CANCELLED_ORDER_STATUSES_FOR_RETRY.has(orderStatus)) {
    throw new ValidationError("Cancelled orders cannot retry payment");
  }
  if (!UNPAID_ONLINE_PAYMENT_STATUSES.has(payStatus) && payStatus !== "cancelled") {
    // Allow cancelled payment status on a still-active orderStatus=created (legacy)
    if (!(orderStatus === "created" || orderStatus === "placed" || orderStatus === "scheduled")) {
      throw new ValidationError("Order is not awaiting payment");
    }
  }
  if (!(orderStatus === "created" || orderStatus === "placed" || orderStatus === "scheduled")) {
    throw new ValidationError("Order is not awaiting payment");
  }

  const amountPaise = Math.round((Number(order.pricing?.total) || 0) * 100);
  if (amountPaise < 100) {
    throw new ValidationError("Amount too low for online payment");
  }

  // Atomic claim: only one concurrent retry can mint a new Razorpay order.
  const claim = await FoodOrder.findOneAndUpdate(
    {
      _id: order._id,
      userId: new mongoose.Types.ObjectId(userId),
      "payment.method": "razorpay",
      "payment.status": { $nin: ["paid", "refunded"] },
      orderStatus: { $nin: [...CANCELLED_ORDER_STATUSES_FOR_RETRY] },
      $or: [
        { "payment.retryInProgress": { $ne: true } },
        { "payment.retryInProgress": { $exists: false } },
      ],
    },
    { $set: { "payment.retryInProgress": true } },
    { new: true },
  );

  if (!claim) {
    throw new ValidationError(
      "A payment attempt is already in progress for this order. Please wait a moment and try again.",
      "PAYMENT_RETRY_IN_PROGRESS",
    );
  }

  try {
    const rzOrder = await createRazorpayOrder(
      amountPaise,
      order.pricing?.currency || "INR",
      order.orderId,
      {
        type: "food_order",
        orderId: String(order.orderId),
        userId: String(userId),
      },
    );

    claim.payment.razorpay = {
      orderId: rzOrder.id,
      paymentId: "",
      signature: "",
    };
    claim.payment.status = "created";
    claim.payment.amountDue = Number(order.pricing?.total) || 0;
    claim.payment.retryInProgress = false;
    await claim.save();

    return {
      order: claim.toObject(),
      razorpay: {
        key: getRazorpayKeyId(),
        orderId: rzOrder.id,
        amount: rzOrder.amount,
        currency: rzOrder.currency || "INR",
      },
    };
  } catch (err) {
    await FoodOrder.updateOne(
      { _id: order._id },
      { $set: { "payment.retryInProgress": false } },
    );
    throw new ValidationError(err?.message || "Payment gateway error");
  }
}

// ----- Verify payment -----
export async function verifyPayment(userId, dto) {
  const identity = buildOrderIdentityFilter(dto.orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne({
    ...identity,
    userId: new mongoose.Types.ObjectId(userId),
  });
  if (!order) throw new NotFoundError("Order not found");
  if (order.payment.status === "paid")
    return { order: order.toObject(), payment: order.payment };

  const storedRzOrderId = String(order.payment?.razorpay?.orderId || "").trim();
  const dtoRzOrderId = String(dto.razorpayOrderId || "").trim();
  if (!storedRzOrderId) {
    throw new ValidationError("Order has no Razorpay payment session. Please retry payment.");
  }
  if (dtoRzOrderId !== storedRzOrderId) {
    throw new ValidationError("Payment does not match this order. Please retry payment.");
  }
  if (!dto.razorpayPaymentId || !dto.razorpaySignature) {
    throw new ValidationError("Incomplete payment response. Please retry payment.");
  }

  const valid = verifyPaymentSignature(
    storedRzOrderId,
    dto.razorpayPaymentId,
    dto.razorpaySignature,
  );
  if (!valid) throw new ValidationError("Payment verification failed");

  const orderStatusForVerify = String(order.orderStatus || "").toLowerCase();
  if (
    [
      "cancelled_by_user",
      "cancelled_by_admin",
      "cancelled_by_restaurant",
      "cancelled",
    ].includes(orderStatusForVerify)
  ) {
    throw new ValidationError("Cannot verify payment for a cancelled order");
  }

  order.payment.status = "paid";
  order.payment.razorpay.paymentId = dto.razorpayPaymentId;
  order.payment.razorpay.signature = dto.razorpaySignature;
  order.payment.razorpay.orderId = storedRzOrderId;
  order.payment.retryInProgress = false;
  pushStatusHistory(order, {
    byRole: "USER",
    byId: userId,
    from: order.orderStatus,
    to: order.orderStatus === "scheduled" ? "scheduled" : "created",
    note: "Payment verified",
  });
  await order.save();

  await finalizePaidOnlineOrder(order, {
    razorpayPaymentId: dto.razorpayPaymentId,
    razorpaySignature: dto.razorpaySignature,
    recordedByRole: "USER",
    recordedById: new mongoose.Types.ObjectId(userId),
    clearCart: true,
    notifyCustomer: true,
    source: "client_verify",
  });

  return { order: order.toObject(), payment: order.payment };
}

/**
 * Shared post-payment finalization for client verify + Razorpay webhook.
 * Idempotent side-effects (coupon/ledger/notify) are best-effort and logged on failure.
 */
export async function finalizePaidOnlineOrder(order, meta = {}) {
  if (!order) return;

  try {
    await consumeCouponForOrder(order);
  } catch (err) {
    logger.warn(`Coupon consume failed after payment for ${order.orderId}: ${err?.message || err}`);
  }

  if (meta.clearCart && (order.orderType === "food" || order.orderType === "mixed")) {
    try {
      await clearFoodCart(order.userId);
    } catch (err) {
      logger.warn(`Food cart clear failed after payment for ${order.orderId}: ${err?.message || err}`);
    }
  }

  try {
    await foodTransactionService.updateTransactionStatus(order._id, "captured", {
      status: "captured",
      razorpayPaymentId: meta.razorpayPaymentId,
      razorpaySignature: meta.razorpaySignature || "webhook_verified",
      recordedByRole: meta.recordedByRole || "SYSTEM",
      recordedById: meta.recordedById || null,
      note: meta.source ? `Payment finalized via ${meta.source}` : undefined,
    });
  } catch (err) {
    logger.warn(`Ledger capture failed after payment for ${order.orderId}: ${err?.message || err}`);
  }

  // After online payment is verified, notify restaurant / sellers about the new order.
  if (order.orderType === "food" || order.orderType === "mixed") {
    try {
      await notifyRestaurantNewOrder(order);
    } catch (err) {
      logger.warn(`Restaurant notify failed after payment for ${order.orderId}: ${err?.message || err}`);
    }
  }
  if (order.orderType === "quick" || order.orderType === "mixed") {
    try {
      const sellerOrders = await upsertSellerOrdersForParent(order);
      await notifySellerNewOrders(order, sellerOrders);
    } catch (err) {
      logger.warn(`Seller notify failed after payment for ${order.orderId}: ${err?.message || err}`);
    }
  }

  // Schedule delayed notification if it's a scheduled order and payment is now verified
  if (order.orderStatus === "scheduled" && order.scheduledAt) {
    const now = Date.now();
    const scheduledTime = new Date(order.scheduledAt).getTime();
    const notificationTime = scheduledTime - 15 * 60 * 1000;
    const delay = Math.max(0, notificationTime - now);

    enqueueOrderEvent("NOTIFY_SCHEDULED_ORDER", {
      orderId: order.orderId,
      orderMongoId: order._id.toString(),
    }, { delay });

    logger.info(`Scheduled notification for verified order ${order.orderId} with delay of ${delay}ms`);
  }

  if (meta.notifyCustomer && order.userId) {
    try {
      await notifyOwnersSafely([{ ownerType: "USER", ownerId: order.userId }], {
        title: "Payment Successful! ✅",
        body: `We have received your payment of ₹${order.payment.amountDue} for Order #${order.orderId}.`,
        image: "https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png",
        data: {
          type: "payment_success",
          orderId: String(order.orderId),
          orderMongoId: String(order._id),
        },
      });
    } catch (err) {
      logger.warn(`Customer notify failed after payment for ${order.orderId}: ${err?.message || err}`);
    }
  }

  const settings =
    order.orderType === "food" ||
    (order.orderType === "mixed" && order.dispatchPlan?.strategy === "single")
      ? await getDispatchSettings()
      : null;
  if (settings?.dispatchMode === "auto") {
    try {
      await tryAutoAssign(order._id);
    } catch {}
  }
}

// ----- Auto-assign -----
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Stale tryAutoAssign and processDispatchTimeout removed (now imported from order-dispatch.service.js)

// ----- User: list, get, cancel -----
export async function listOrdersUser(userId, query) {
  const { page, limit, skip } = buildPaginationOptions(query);
  const filter = { userId: new mongoose.Types.ObjectId(userId) };
  const [docs, total] = await Promise.all([
    FoodOrder.find(filter)
      .populate(
        "restaurantId",
        "restaurantName profileImage area city location rating totalRatings",
      )
      .populate("dispatch.deliveryPartnerId", "name phone rating totalRatings")
      .populate("dispatchPlan.legs.deliveryPartnerId", "name phone rating totalRatings")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    FoodOrder.countDocuments(filter),
  ]);
  return buildPaginatedResult({
    docs: docs.map((doc) => normalizeOrderForClient(doc)),
    total,
    page,
    limit,
  });
}

export async function getOrderById(
  orderId,
  { userId, restaurantId, deliveryPartnerId, admin } = {},
) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");
  const order = await FoodOrder.findOne(identity)
    .populate(
      "restaurantId",
      "restaurantName profileImage area city location rating totalRatings",
    )
    .populate("dispatch.deliveryPartnerId", "name phone rating totalRatings")
    .populate("dispatchPlan.legs.deliveryPartnerId", "name phone rating totalRatings")
    .populate("userId", "name phone email")
    .select("+deliveryOtp")
    .lean();
  if (!order) throw new NotFoundError("Order not found");

  if (admin) return normalizeOrderForClient(order);

  const orderUserId = order.userId?._id?.toString() || order.userId?.toString();
  const orderRestaurantId = order.restaurantId?._id?.toString() || order.restaurantId?.toString();
  const orderPartnerId = order.dispatch?.deliveryPartnerId?._id?.toString() || order.dispatch?.deliveryPartnerId?.toString();
  const assignedLegPartnerId = deliveryPartnerId
    ? toIdString(getAssignedDispatchLeg(order, deliveryPartnerId)?.deliveryPartnerId)
    : "";

  if (userId && orderUserId !== userId.toString())
    throw new ForbiddenError("Not your order");
  if (restaurantId && orderRestaurantId !== restaurantId.toString())
    throw new ForbiddenError("Not your restaurant order");
  if (
    deliveryPartnerId &&
    orderPartnerId !== deliveryPartnerId.toString() &&
    assignedLegPartnerId !== deliveryPartnerId.toString()
  )
    throw new ForbiddenError("Not assigned to you");

  if (deliveryPartnerId || restaurantId) {
    if (deliveryPartnerId) {
      return buildDeliveryOrderView(order, deliveryPartnerId, {
        assignedDispatchLeg: getAssignedDispatchLeg(order, deliveryPartnerId),
      });
    }
    const normalized = normalizeOrderForClient(order);
    return sanitizeOrderForExternal(normalized, "RESTAURANT");
  }

  if (userId) {
    const drop = order.deliveryVerification?.dropOtp || {};
    const secret = String(order.deliveryOtp || "").trim();
    const out = normalizeOrderForClient(order);
    delete out.deliveryOtp;
    out.deliveryVerification = {
      ...(order.deliveryVerification || {}),
      dropOtp: {
        required: Boolean(drop.required),
        verified: Boolean(drop.verified),
      },
    };
    if (drop.required && !drop.verified && secret) {
      out.handoverOtp = secret;
    }
    return out;
  }

  return sanitizeOrderForExternal(order);
}

export async function cancelOrder(orderId, userId, reason, refundTo) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne({
    ...identity,
    userId: new mongoose.Types.ObjectId(userId),
  });
  if (!order) throw new NotFoundError("Order not found");

  const orderStatus = String(order.orderStatus || "").trim().toLowerCase();
  // Idempotent: explicit cancel on an already-cancelled order is a no-op success.
  if (
    [
      "cancelled_by_user",
      "cancelled_by_admin",
      "cancelled_by_restaurant",
      "cancelled",
    ].includes(orderStatus)
  ) {
    return order.toObject();
  }

  const alwaysCancelableStatuses = ["created", "placed"];
  const cancelWindowStatuses = ["confirmed", "preparing", "ready_for_pickup", "picked_up"];
  const dispatchStatus = String(order.dispatch?.status || "").trim().toLowerCase();
  const hasAcceptedDeliveryPartner =
    dispatchStatus === "accepted" ||
    Boolean(order.dispatch?.acceptedAt) ||
    Boolean(order.dispatch?.deliveryPartnerId);
  const canCancelBeforeDispatchStarts =
    ["confirmed", "preparing", "ready_for_pickup"].includes(orderStatus) &&
    !hasAcceptedDeliveryPartner;

  if (!alwaysCancelableStatuses.includes(orderStatus)) {
    const cancelWindowStartEntry = [...(order.statusHistory || [])]
      .reverse()
      .find((entry) => cancelWindowStatuses.includes(String(entry?.to || "").trim().toLowerCase()));
    const cancelWindowStartAt = cancelWindowStartEntry?.at || order.updatedAt || order.createdAt || null;
    const cancelWindowStartMs = cancelWindowStartAt ? new Date(cancelWindowStartAt).getTime() : NaN;
    const isWithinCancelWindow =
      cancelWindowStatuses.includes(orderStatus) &&
      Number.isFinite(cancelWindowStartMs) &&
      Date.now() - cancelWindowStartMs <= USER_CANCEL_EDIT_WINDOW_MS;

    if (!isWithinCancelWindow && !canCancelBeforeDispatchStarts) {
      throw new ValidationError("Order cannot be cancelled");
    }
  }

  const from = order.orderStatus;
  order.orderStatus = "cancelled_by_user";
  pushStatusHistory(order, {
    byRole: "USER",
    byId: userId,
    from,
    to: "cancelled_by_user",
    note: reason || "",
  });

  try {
    await releaseCouponForOrder(order);
  } catch (err) {
    logger.warn(`Coupon release failed on cancel for ${order.orderId}: ${err?.message || err}`);
  }

  const paymentMethod = String(order.payment?.method || "").trim().toLowerCase();
  const isOnlinePaid =
    ["razorpay", "razorpay_qr"].includes(paymentMethod) &&
    (order.payment.status === "paid" || order.payment.status === "refunded");
  const requestedRefundMethod =
    refundTo === "wallet" || refundTo === "gateway" ? refundTo : "gateway";

  if (isOnlinePaid) {
    order.payment.refund = {
      ...(order.payment.refund || {}),
      status: "pending",
      amount: Number(order.pricing?.total || 0),
      refundId: "",
      requestedMethod: requestedRefundMethod,
      processedMethod: undefined,
      requestedAt: new Date(),
      requestedByUser: true,
      reason: reason || "",
      processedAt: null,
    };
  } else if (!["paid", "refunded"].includes(order.payment.status)) {
    // For COD or unpaid online orders, mark payment as cancelled
    order.payment.status = "cancelled";
  }

  // User-cancelled online refunds are handled from admin so the 30-second policy can be enforced.
  if (
    false &&
    order.payment.status === "paid" &&
    order.payment.method === "razorpay" &&
    order.payment.razorpay?.paymentId &&
    (!order.payment.refund || order.payment.refund.status !== "processed")
  ) {
    try {
      const refundResult = await initiateRazorpayRefund(
        order.payment.razorpay.paymentId,
        order.pricing.total
      );

      if (refundResult.success) {
        order.payment.status = "refunded";
        order.payment.refund = {
          status: "processed",
          amount: order.pricing.total,
          refundId: refundResult.refundId,
          processedAt: new Date()
        };
      } else {
        // Log failure but let order cancellation proceed
        order.payment.refund = {
          status: "failed",
          amount: order.pricing.total
        };
      }
    } catch (err) {
      console.error(`Refund processing error for Order ${orderId}:`, err);
      order.payment.refund = { status: "failed", amount: order.pricing.total };
    }
  }

  await order.save();

  // Sync mixed order seller legs if applicable
  if (order.orderType === 'mixed' || order.orderType === 'quick') {
    await cancelSellerOrdersForParent(order, "Cancelled by user");
  }

  enqueueOrderEvent("order_cancelled_by_user", {
    orderMongoId: order._id?.toString?.(),
    orderId: order.orderId,
    userId,
    reason: reason || "",
    refundTo: isOnlinePaid ? requestedRefundMethod : undefined,
  });

  // Sync transaction status
  try {
    await foodTransactionService.updateTransactionStatus(order._id, 'cancelled_by_user', {
        status:
          order.payment.status === "refunded"
            ? 'refunded'
            : isOnlinePaid
              ? 'captured'
              : 'failed',
        note: `Order cancelled by user: ${reason || "No reason"}`,
        recordedByRole: 'USER',
        recordedById: userId
    });
  } catch (err) {
    logger.warn(`cancelOrder transaction sync failed: ${err?.message || err}`);
  }

  // Notify User and Restaurant about the cancellation
  const refundPolicyDetail =
    isOnlinePaid
      ? ` Refund review will follow the cancellation policy: full refund within ${USER_CANCEL_FULL_REFUND_WINDOW_MS / 1000} seconds, otherwise admin may process a partial refund. Requested destination: ${requestedRefundMethod === "wallet" ? "wallet" : "original payment method"}.`
      : "";

  await notifyOwnersSafely(
    [
      { ownerType: "USER", ownerId: userId },
      { ownerType: "RESTAURANT", ownerId: order.restaurantId },
    ],
    {
      title: "Order Cancelled ❌",
      body: `Order #${order.orderId} has been cancelled successfully.${refundPolicyDetail}`,
      image: "https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png",
      data: {
        type: "order_cancelled",
        orderId: String(order.orderId),
        orderMongoId: String(order._id),
      },
    },
  );

  // Real-time: status update via socket
  try {
    const io = getIO();
    if (io) {
      const payload = {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        message: `Order #${order.orderId} has been cancelled successfully.${refundPolicyDetail}`
      };
      io.to(rooms.user(userId)).emit("order_status_update", payload);
      io.to(rooms.restaurant(order.restaurantId)).emit("order_status_update", payload);
    }
  } catch (err) {
    logger.warn(`cancelOrder socket emit failed: ${err?.message || err}`);
  }

  return order.toObject();
}

export async function submitOrderRatings(orderId, userId, dto) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  // First try food order
  let order = await FoodOrder.findOne({
    ...identity,
    userId: new mongoose.Types.ObjectId(userId),
  });

  let isQuickOrder = false;
  
  // If not food order, try quick commerce order
  if (!order) {
    const { QuickOrder } = await import('../../../quick-commerce/models/order.model.js');
    order = await QuickOrder.findOne({
      ...identity,
      userId: new mongoose.Types.ObjectId(userId),
    });
    isQuickOrder = true;
  }

  if (!order) throw new NotFoundError("Order not found");
  if (String(order.orderStatus) !== "delivered") {
    throw new ValidationError("You can rate only delivered orders");
  }

  const hasDeliveryPartner = !!order.dispatch?.deliveryPartnerId;
  
  // For quick commerce orders, use sellerRating instead of restaurantRating
  const sellerRating = dto.sellerRating || dto.restaurantRating;
  const sellerComment = dto.sellerComment || dto.restaurantComment || "";

  if (!sellerRating) {
    throw new ValidationError(isQuickOrder ? "Seller rating is required" : "Restaurant rating is required");
  }

  if (hasDeliveryPartner && !dto.deliveryPartnerRating) {
    throw new ValidationError("Delivery partner rating is required");
  }

  const existingRating = isQuickOrder 
    ? (order?.ratings?.seller?.rating || order?.ratings?.restaurant?.rating) 
    : order?.ratings?.restaurant?.rating;
    
  const restaurantAlreadyRated = Number.isFinite(Number(existingRating));
  const deliveryAlreadyRated = Number.isFinite(
    Number(order?.ratings?.deliveryPartner?.rating),
  );
  if (restaurantAlreadyRated || (hasDeliveryPartner && deliveryAlreadyRated)) {
    throw new ValidationError("Ratings already submitted for this order");
  }

  const now = new Date();
  order.ratings = order.ratings || {};
  
  // Set both seller and restaurant ratings for compatibility
  if (isQuickOrder) {
    order.ratings.seller = {
      rating: sellerRating,
      comment: sellerComment,
      ratedAt: now,
    };
    order.ratings.restaurant = {
      rating: sellerRating,
      comment: sellerComment,
      ratedAt: now,
    };
  } else {
    order.ratings.restaurant = {
      rating: sellerRating,
      comment: sellerComment,
      ratedAt: now,
    };
  }

  if (hasDeliveryPartner) {
    order.ratings.deliveryPartner = {
      rating: dto.deliveryPartnerRating,
      comment: dto.deliveryPartnerComment || "",
      ratedAt: now,
    };
  }

  let sellerModel, sellerId;
  if (isQuickOrder) {
    const { Seller } = await import('../../../quick-commerce/seller/models/seller.model.js');
    sellerModel = Seller;
    const quickItem = order.items?.find(item => item.type === 'quick');
    sellerId = quickItem?.sourceId;
  } else {
    sellerModel = FoodRestaurant;
    sellerId = order.restaurantId;
  }

  const promises = [];
  if (sellerId) {
    promises.push(applyAggregateRating(sellerModel, sellerId, sellerRating));
  }
  if (hasDeliveryPartner) {
    promises.push(applyAggregateRating(
      Driver,
      order.dispatch.deliveryPartnerId,
      dto.deliveryPartnerRating,
    ));
  }

  await Promise.all(promises);

  await order.save();
  enqueueOrderEvent('order_ratings_submitted', {
    orderMongoId: order._id?.toString?.(),
    orderId: order.orderId,
    userId,
    restaurantRating: sellerRating,
    deliveryPartnerRating: hasDeliveryPartner ? dto.deliveryPartnerRating : null
  });
}

// ----- Restaurant -----
export async function listOrdersRestaurant(restaurantId, query) {
  const { page, limit, skip } = buildPaginationOptions(query);
  // Show collectible / active / completed / cancelled orders.
  // Still hide unpaid online drafts stuck in created/pending.
  const filter = {
    restaurantId: new mongoose.Types.ObjectId(restaurantId),
    $and: [
      {
        $or: [
          { "payment.method": { $in: ["cash", "wallet"] } },
          {
            "payment.status": {
              $in: [
                "paid",
                "authorized",
                "captured",
                "settled",
                "refunded",
                "cod_pending",
                "cancelled",
                "failed",
              ],
            },
          },
          {
            orderStatus: {
              $in: [
                "confirmed",
                "preparing",
                "ready_for_pickup",
                "picked_up",
                "out_for_delivery",
                "delivered",
                "cancelled",
                "cancelled_by_user",
                "cancelled_by_restaurant",
                "cancelled_by_admin",
              ],
            },
          },
        ],
      },
    ],
  };

  const rawStatus =
    typeof query.status === "string" ? query.status.trim().toLowerCase() : "";
  if (rawStatus && rawStatus !== "all") {
    const statuses = rawStatus
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .flatMap((s) => {
        if (s === "ready") return ["ready", "ready_for_pickup"];
        if (s === "completed") return ["delivered", "completed"];
        if (s === "cancelled" || s === "canceled") {
          return [
            "cancelled",
            "cancelled_by_user",
            "cancelled_by_restaurant",
            "cancelled_by_admin",
          ];
        }
        if (s === "pending") return ["created", "pending", "confirmed"];
        return [s];
      });
    if (statuses.length === 1) {
      filter.orderStatus = statuses[0];
    } else if (statuses.length > 1) {
      filter.orderStatus = { $in: [...new Set(statuses)] };
    }
  }

  const startDateRaw =
    typeof query.startDate === "string" ? query.startDate.trim() : "";
  const endDateRaw =
    typeof query.endDate === "string" ? query.endDate.trim() : "";
  if (startDateRaw || endDateRaw) {
    const createdAt = {};
    const start = startDateRaw ? new Date(startDateRaw) : null;
    const end = endDateRaw ? new Date(endDateRaw) : null;
    if (start && !Number.isNaN(start.getTime())) {
      createdAt.$gte = start;
    }
    if (end && !Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      createdAt.$lte = end;
    }
    if (Object.keys(createdAt).length) {
      filter.$and.push({ createdAt });
    }
  }

  const [docs, total] = await Promise.all([
    FoodOrder.find(filter)
      .populate("userId", "name phone email profileImage")
      .populate("dispatch.deliveryPartnerId", "name phone rating totalRatings")
      .populate("dispatchPlan.legs.deliveryPartnerId", "name phone rating totalRatings")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    FoodOrder.countDocuments(filter),
  ]);
  const sanitizedDocs = docs.map(doc => {
    const normalized = normalizeOrderForClient(doc);
    return sanitizeOrderForExternal(normalized, "RESTAURANT");
  });
  return buildPaginatedResult({ docs: sanitizedDocs, total, page, limit });
}

export async function updateOrderStatusRestaurant(
  orderId,
  restaurantId,
  orderStatus,
  options = {},
) {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new ValidationError("Invalid order id");
  }
  if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
    throw new ValidationError("Invalid restaurant id");
  }
  let order = await FoodOrder.findOne({
    _id: new mongoose.Types.ObjectId(orderId),
    restaurantId: new mongoose.Types.ObjectId(restaurantId),
  });
  if (!order) throw new NotFoundError("Order not found");
  const from = order.orderStatus;

  // Guard the transition: reject backwards / post-terminal moves. A same-status re-send is
  // allowed (noop) so preparation-time-only updates below still work.
  const { noop: sameStatus } = assertTransition(from, orderStatus);

  // Optional prep-time overwrite on accept / status change (same field, no duplicates)
  if (options.preparationTime != null && options.preparationTime !== "") {
    const previousPrep = order.preparationTime;
    const nextPrep = clampPreparationTimeMinutes(options.preparationTime);
    if (previousPrep !== nextPrep) {
      order.preparationTime = nextPrep;
      logger.info(
        `[PrepTime] order=${order.orderId} restaurant=${restaurantId} previous=${previousPrep} new=${nextPrep} updatedBy=RESTAURANT:${restaurantId}`,
      );
      pushStatusHistory(order, {
        byRole: "RESTAURANT",
        byId: restaurantId,
        from,
        to: from,
        note: `preparationTime:${previousPrep ?? "null"}->${nextPrep}`,
      });
    }
  }

  // Atomic guard: only apply a real status change if the order is still at the expected
  // previous status, so two concurrent transitions can't both win (e.g. double-accept).
  if (!sameStatus) {
    const gate = await FoodOrder.updateOne(
      { _id: order._id, restaurantId: order.restaurantId, orderStatus: from },
      { $set: { orderStatus } },
    );
    if (gate.matchedCount === 0) {
      throw new ValidationError(
        "Order status changed concurrently. Please refresh and retry.",
        "STATUS_CONFLICT",
      );
    }
  }

  order.orderStatus = orderStatus;
  pushStatusHistory(order, {
    byRole: "RESTAURANT",
    byId: restaurantId,
    from,
    to: orderStatus,
    note: String(options.note || options.reason || "").trim(),
  });
  await order.save();

  // The restaurant has acted on the order — stop the incoming-order ring/watchdog.
  ackOrderRingEvents(order.orderId).catch(() => {});

  // Standard event envelope shared by the socket payload and the FCM data below, so
  // clients can dedup by event_id and (Phase 3) order by seq. See orderEvents.service.js.
  const statusEventId = newEventId();
  const statusEventType = deriveEventType(order.orderStatus);

  // Real-time: status update to restaurant room.
  try {
    const io = getIO();
    if (io) {
      console.log(
        `[DEBUG] Emitting status update to restaurant ${restaurantId} and user ${order.userId}: ${orderStatus}`,
      );
      const prepMins = Number(order.preparationTime);
      const prepStarted =
        [...(order.statusHistory || [])]
          .reverse()
          .find((entry) => {
            const to = String(entry?.to || "").toLowerCase();
            return to === "preparing" || to === "confirmed";
          })?.at || order.updatedAt || order.createdAt;
      const payload = {
        event_id: statusEventId,
        type: statusEventType,
        order_id: order.orderId,
        ring: false,
        expires_at: null,
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        status: order.orderStatus,
        preparationTime: order.preparationTime,
        preparationStartedAt: prepStarted || null,
        expectedReadyAt:
          Number.isFinite(prepMins) && prepMins > 0 && prepStarted
            ? new Date(new Date(prepStarted).getTime() + prepMins * 60 * 1000).toISOString()
            : null,
        title: `Order ${order.orderId} updated`,
        message: `Status changed to ${String(orderStatus).replace(/_/g, " ")}`,
      };
      io.to(rooms.restaurant(restaurantId)).emit(
        "order_status_update",
        payload,
      );
      io.to(rooms.user(order.userId)).emit("order_status_update", payload);
      const assignedRiderId = order.dispatch?.deliveryPartnerId;
      if (assignedRiderId) {
        io.to(rooms.delivery(assignedRiderId)).emit("order_status_update", payload);
      }
      // Keep open offer popups in sync (prep countdown / ready / delayed).
      const offered = Array.isArray(order.dispatch?.offeredTo)
        ? order.dispatch.offeredTo
        : [];
      for (const offer of offered) {
        const partnerId = offer?.partnerId?.toString?.() || offer?.partnerId;
        if (!partnerId || String(partnerId) === String(assignedRiderId || "")) continue;
        io.to(rooms.delivery(partnerId)).emit("order_status_update", payload);
      }
    }

    let title = `Order ${order.orderId} updated`;
    let body = `Status changed to ${String(orderStatus).replace(/_/g, " ")}`;

    // Custom messages for customer based on status
    if (orderStatus === "confirmed") {
      title = "Order Accepted! 🧑‍🍳";
      body =
        "The restaurant has accepted your order and is starting to prepare it.";
    } else if (orderStatus === "preparing") {
      title = "Food is being prepared! 🍳";
      body = "Your food is currently being prepared by the restaurant.";
    } else if (orderStatus === "ready_for_pickup" || orderStatus === "ready") {
      title = "Food is ready! 🛍️";
      body = "Your order is ready and waiting to be picked up.";
    } else if (String(orderStatus).includes("cancel")) {
      const isOnlinePaid =
        order.payment?.method === "razorpay" &&
        (order.payment?.status === "paid" ||
          order.payment?.status === "refunded");
      const refundDetail = isOnlinePaid ? ` Your refund of ₹${order.pricing.total} is being processed and will be credited to your original payment method within 5-7 working days.` : "";
      
      title = "Order Cancelled ❌";
      body = `Unfortunately, your order has been cancelled by the restaurant.${refundDetail}`;
      
      // Update payment status for cancellation
      if (!isOnlinePaid) {
        order.payment.status = "cancelled";
      }

      // Sync mixed order seller legs
      if (order.orderType === 'mixed' || order.orderType === 'quick') {
        console.log(`[MIXED-SYNC] Order ${order.orderId} (type: ${order.orderType}) cancelled by restaurant. Propagating to seller legs...`);
        await cancelSellerOrdersForParent(order, "Cancelled by restaurant");
      }
    }

    const notifyList = [
      { ownerType: "USER", ownerId: order.userId },
      { ownerType: "RESTAURANT", ownerId: restaurantId },
    ];

    const assignedRiderId = order.dispatch?.deliveryPartnerId;
    if (assignedRiderId) {
      notifyList.push({ ownerType: "DELIVERY_PARTNER", ownerId: assignedRiderId });
    }

    let riderTitle = `Order #${order.orderId} updated`;
    let riderBody = `The order status is now ${String(orderStatus).replace(/_/g, " ")}.`;

    if (String(orderStatus).includes("cancel")) {
      riderTitle = "Order Cancelled ❌";
      riderBody = `Order #${order.orderId} has been cancelled. Please stop your current task.`;
      
      // Sync transaction status
      try {
        const isOnlinePaid =
          order.payment?.method === "razorpay" &&
          (order.payment?.status === "paid" ||
            order.payment?.status === "refunded");
        await foodTransactionService.updateTransactionStatus(order._id, 'cancelled_by_restaurant', {
            status: isOnlinePaid ? 'refunded' : 'failed',
            note: `Order cancelled by restaurant/admin`,
            recordedByRole: 'RESTAURANT',
            recordedById: restaurantId
        });
      } catch (err) {
        logger.warn(`updateOrderStatusRestaurant transaction sync failed: ${err?.message || err}`);
      }
    }

    await notifyOwnersSafely(
      notifyList,
      {
        title: title,
        body: body,
        image: "https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png",
        data: {
          type: "order_status_update",
          event_id: statusEventId,
          event_type: statusEventType,
          order_id: order.orderId,
          ring: "false",
          orderId: order.orderId,
          orderMongoId: order._id?.toString?.() || "",
          orderStatus: String(orderStatus || ""),
          link: `/food/user/orders/${order._id?.toString?.() || ""}`,
        },
      },
    );
  } catch (err) {
    console.error("[DEBUG] Error emitting status update to restaurant:", err);
  }

  // Durably record this status event per target so an offline client can replay it via
  // GET /food/sync?since_seq=N. Shares the same event_id stamped on the socket/FCM payloads
  // above, so a client that already received it de-dups. Additive — does not change delivery.
  try {
    const eventTargets = [
      { ownerType: "USER", ownerId: order.userId },
      { ownerType: "RESTAURANT", ownerId: restaurantId },
    ];
    const riderId = order.dispatch?.deliveryPartnerId;
    if (riderId) eventTargets.push({ ownerType: "DELIVERY_PARTNER", ownerId: riderId });
    await Promise.all(
      eventTargets.map((target) =>
        recordOrderEventForTarget({
          type: statusEventType,
          orderId: order.orderId,
          orderMongoId: order._id,
          target,
          eventId: statusEventId,
          payload: {
            orderStatus: order.orderStatus,
            orderMongoId: order._id?.toString?.() || "",
          },
        }),
      ),
    );
  } catch (err) {
    logger.warn(`recordOrderEvent (restaurant status) failed: ${err?.message || err}`);
  }

  // Real-time: delivery request / ready notifications.
  try {
    const io = getIO();
    if (io) {
      // On accept (confirmed or preparing) -> request delivery partners.
      if (
        (String(orderStatus) === "preparing" || String(orderStatus) === "confirmed") && 
        (String(from) !== "preparing" && String(from) !== "confirmed")
      ) {
        console.log(
          `[DEBUG] Order ${order.orderId} status changed to '${orderStatus}'. Triggering delivery dispatch.`,
        );
        // If auto dispatch, try assign now.
        if (
          order.dispatch?.status === "unassigned" &&
          order.dispatch?.modeAtCreation === "auto"
        ) {
          try {
            console.log(`[DEBUG] Auto-assigning order ${order.orderId}`);
            await tryAutoAssign(order._id);
            // Refresh order state from DB after auto-assignment
            order = await FoodOrder.findById(order._id); 
          } catch (err) {
            console.error(
              `[DEBUG] Auto-assign failed for order ${order.orderId}:`,
              err,
            );
          }
        }

        const restaurant = await FoodRestaurant.findById(order.restaurantId)
          .select("restaurantName shopName outletName branchName phone ownerPhone contactPhone location addressLine1 area city state")
          .lean();
        const payload = buildDeliverySocketPayload(order, restaurant);

        // If assigned, notify assigned partner only.
        const assignedId =
          order.dispatch?.deliveryPartnerId?.toString?.() ||
          order.dispatch?.deliveryPartnerId;
        if (assignedId && order.dispatch?.status === "assigned") {
          console.log(
            `[DEBUG] Order ${order.orderId} assigned to ${assignedId}. Notifying.`,
          );
          io.to(rooms.delivery(assignedId)).emit("new_order", payload);
          io.to(rooms.delivery(assignedId)).emit("play_notification_sound", {
            orderId: payload.orderId,
            orderMongoId: payload.orderMongoId,
          });
          await notifyOwnerSafely(
            { ownerType: "DELIVERY_PARTNER", ownerId: assignedId },
            {
              title: "New delivery task",
              body: `Order ${payload.orderId} is assigned to you.`,
              data: {
                type: "new_order",
                orderId: payload.orderId,
                orderMongoId: payload.orderMongoId,
                link: "/delivery",
              },
            },
          );
        } else {
          if (isSplitDispatchOrder(order)) {
            await notifySplitDispatchOffers(order, { restaurantDoc: restaurant });
          } else {
            // Broadcast to nearby online partners so someone can accept/claim.
            console.log(
              `[DEBUG] Searching for nearby partners for order ${order.orderId}`,
            );
            const { partners } = await listNearbyOnlineDeliveryPartners(
              order.restaurantId,
              { maxKm: 15, limit: 25 },
            );
            console.log(
              `[DEBUG] Found ${partners.length} partners: ${JSON.stringify(partners)}`,
            );
            for (const p of partners) {
              const targetRoom = rooms.delivery(p.partnerId);
              console.log(
                `[DEBUG] Emitting new_order_available to room: ${targetRoom}`,
              );
              io.to(targetRoom).emit("new_order_available", {
                ...payload,
                pickupDistanceKm: p.distanceKm,
              });
            }
            await notifyOwnersSafely(
              partners.slice(0, 5).map((p) => ({
                ownerType: "DELIVERY_PARTNER",
                ownerId: p.partnerId,
              })),
              {
                title: "New delivery order available",
                body: `Order ${payload.orderId} is available near ${restaurant?.restaurantName || "your area"}.`,
                data: {
                  type: "new_order_available",
                  orderId: payload.orderId,
                  orderMongoId: payload.orderMongoId,
                  link: "/delivery",
                },
              },
            );
            // Also trigger a generic sound event for the first few partners.
            for (const p of partners.slice(0, 5)) {
              io.to(rooms.delivery(p.partnerId)).emit("play_notification_sound", {
                orderId: payload.orderId,
                orderMongoId: payload.orderMongoId,
              });
            }
          }
        }
      }

            // When ready for pickup -> ping assigned delivery partner.
            if (String(orderStatus) === 'ready_for_pickup' && String(from) !== 'ready_for_pickup') {
                console.log(`[DEBUG] Order ${order.orderId} changed to 'ready_for_pickup'.`);
                const assignedId = order.dispatch?.deliveryPartnerId?.toString?.() || order.dispatch?.deliveryPartnerId;
                if (assignedId) {
                    console.log(`[DEBUG] Notifying assigned partner ${assignedId} that order is ready.`);
                    const restaurant = await FoodRestaurant.findById(order.restaurantId).select('restaurantName location addressLine1 area city state').lean();
                    const payload = buildDeliverySocketPayload(order, restaurant);
                    io.to(rooms.delivery(assignedId)).emit('order_ready', payload);
                } else {
                    console.log(`[DEBUG] Order ${order.orderId} is ready but no partner assigned.`);
                }
            }
        }
    } catch (err) {
        console.error('[DEBUG] Error in delivery notification logic:', err);
    }

    enqueueOrderEvent('restaurant_order_status_updated', {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        restaurantId,
        from,
        to: orderStatus
    });

    // ✅ NEW: Automated Razorpay Refund on Restaurant Cancel
    // Triggers if the restaurant sets status to a cancelled state (e.g., cancelled_by_restaurant)
    if (
      String(orderStatus).includes("cancel") &&
      order.payment?.status === "paid" &&
      order.payment?.method === "razorpay" &&
      order.payment?.razorpay?.paymentId &&
      (!order.payment?.refund || order.payment?.refund?.status !== "processed")
    ) {
      try {
        const refundResult = await initiateRazorpayRefund(
          order.payment.razorpay.paymentId,
          order.pricing?.total || 0
        );

        if (refundResult.success) {
          order.payment = order.payment || {};
          order.payment.status = "refunded";
          order.payment.refund = {
            status: "processed",
            amount: order.pricing?.total || 0,
            refundId: refundResult.refundId,
            processedAt: new Date()
          };
        } else {
          // Record failure so admin knows a manual refund might be needed
          order.payment = order.payment || {};
          order.payment.refund = {
            status: "failed",
            amount: order.pricing?.total || 0
          };
        }
      } catch (err) {
        console.error(`Automated refund failed for Order ${orderId} (Restaurant Cancel):`, err);
        order.payment = order.payment || {};
        order.payment.refund = {
          status: "failed",
          amount: order.pricing?.total || 0,
        };
      }
      // Re-save order with updated payment status
      await order.save();
    }

    if (String(orderStatus).includes("cancel")) {
      try {
        await releaseCouponForOrder(order);
      } catch (err) {
        logger.warn(`Coupon release failed on restaurant cancel for ${order.orderId}: ${err?.message || err}`);
      }
    }

    return order.toObject();
}

/**
 * Restaurant updates order preparationTime (existing field only).
 * Allowed for the owning restaurant before/during prep; customers/drivers cannot call this route.
 */
export async function updateOrderPreparationTimeRestaurant(
  orderId,
  restaurantId,
  preparationTime,
) {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new ValidationError("Invalid order id");
  }
  if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
    throw new ValidationError("Invalid restaurant id");
  }

  const nextPrep = clampPreparationTimeMinutes(preparationTime);

  const order = await FoodOrder.findOne({
    _id: new mongoose.Types.ObjectId(orderId),
    restaurantId: new mongoose.Types.ObjectId(restaurantId),
  });
  if (!order) throw new NotFoundError("Order not found");

  const terminal = ["delivered", "cancelled_by_user", "cancelled_by_restaurant", "cancelled_by_admin"];
  if (terminal.includes(String(order.orderStatus))) {
    throw new ValidationError("Cannot update preparation time for a completed or cancelled order");
  }

  const previousPrep = order.preparationTime;
  if (previousPrep === nextPrep) {
    return sanitizeOrderForExternal(normalizeOrderForClient(order), "RESTAURANT");
  }

  order.preparationTime = nextPrep;
  pushStatusHistory(order, {
    byRole: "RESTAURANT",
    byId: restaurantId,
    from: order.orderStatus,
    to: order.orderStatus,
    note: `preparationTime:${previousPrep ?? "null"}->${nextPrep}`,
  });
  await order.save();

  logger.info(
    `[PrepTime] order=${order.orderId} restaurant=${restaurantId} previous=${previousPrep} new=${nextPrep} updatedBy=RESTAURANT:${restaurantId} at=${new Date().toISOString()}`,
  );

  emitPreparationTimeUpdate(order);

  return sanitizeOrderForExternal(normalizeOrderForClient(order), "RESTAURANT");
}

/**
 * Manually re-trigger delivery partner search for a restaurant order.
 * Only allowed if status is preparing/ready and no partner has accepted yet.
 */
export async function resendDeliveryNotificationRestaurant(orderId, restaurantId) {
    const order = await FoodOrder.findOne({
        _id: new mongoose.Types.ObjectId(orderId),
        restaurantId: new mongoose.Types.ObjectId(restaurantId)
    });

    if (!order) throw new NotFoundError('Order not found');

    // Only allow if order is still active and not already terminal
    const activeStatuses = ['confirmed', 'preparing', 'ready_for_pickup', 'ready'];
    if (!activeStatuses.includes(order.orderStatus)) {
        throw new ValidationError(`Cannot resend notification for order in status: ${order.orderStatus}`);
    }

    // Guard: don't disrupt an active assignment that was already accepted
    if (order.dispatch?.status === 'accepted') {
        throw new ValidationError('A delivery partner has already accepted this order.');
    }

    // Reset dispatch state to unassigned to allow tryAutoAssign to start fresh
    order.dispatch.status = 'unassigned';
    order.dispatch.deliveryPartnerId = null;
    // Clear previously offered partners to give everyone a fresh chance when resending manually.
    order.dispatch.offeredTo = [];
    
    await order.save();

    if (isSplitDispatchOrder(order)) {
        await notifySplitDispatchOffers(order);
    } else {
        // Trigger smart dispatch logic immediately
        const { tryAutoAssign } = await import('./order-dispatch.service.js');
        const dispatchRes = await tryAutoAssign(order._id, { attempt: 3 });
        return { 
          success: true, 
          notifiedCount: dispatchRes?.notifiedCount || 0 
        };
    }

    return { success: true };
}

export async function getCurrentTripDelivery(deliveryPartnerId) {
  if (!deliveryPartnerId) throw new ValidationError("Delivery partner ID required");

  const activeReturn = await returnPickupDelivery.getCurrentReturnPickupTrip(deliveryPartnerId);
  if (activeReturn) return activeReturn;

  const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
  
  // Find the active order assigned to or accepted by this rider.
  const order = await FoodOrder.findOne({
    $or: [
      { "dispatch.deliveryPartnerId": partnerId },
      { "dispatchPlan.legs": { $elemMatch: { deliveryPartnerId: partnerId } } },
    ],
    orderStatus: {
      $in: ["confirmed", "preparing", "ready_for_pickup", "picked_up", "reached_pickup", "reached_drop"]
    }
  })
    .populate({ path: "restaurantId", select: "restaurantName name phone location addressLine1 area city state profileImage" })
    .populate({ path: "userId", select: "name phone" })
    .sort({ updatedAt: -1 })
    .lean();

  if (!order) return null;
  return buildDeliveryOrderView(order, deliveryPartnerId, {
    assignedDispatchLeg: getAssignedDispatchLeg(order, deliveryPartnerId),
  });
}

// ----- Delivery: available, accept, reject, status -----
export async function listOrdersAvailableDelivery(deliveryPartnerId, query) {
  const { page, limit, skip } = buildPaginationOptions(query);
  const partnerObjectId = new mongoose.Types.ObjectId(deliveryPartnerId);
  const filter = {
    $or: [
      {
        "dispatch.status": "unassigned",
        orderStatus: { $in: ["confirmed", "preparing", "ready_for_pickup"] },
      },
      {
        "dispatch.deliveryPartnerId": partnerObjectId,
        orderStatus: {
          $nin: [
            "delivered",
            "cancelled_by_user",
            "cancelled_by_restaurant",
            "cancelled_by_admin",
          ],
        },
      },
      {
        "dispatchPlan.legs": {
          $elemMatch: {
            deliveryPartnerId: partnerObjectId,
          },
        },
        orderStatus: {
          $nin: [
            "delivered",
            "cancelled_by_user",
            "cancelled_by_restaurant",
            "cancelled_by_admin",
          ],
        },
      },
      {
        "dispatchPlan.legs": {
          $elemMatch: {
            deliveryPartnerId: null,
            partnerCandidates: {
              $elemMatch: {
                partnerId: partnerObjectId,
              },
            },
          },
        },
        orderStatus: {
          $nin: [
            "delivered",
            "cancelled_by_user",
            "cancelled_by_restaurant",
            "cancelled_by_admin",
          ],
        },
      },
    ],
  };

  const orders = await FoodOrder.find(filter)
    .sort({ createdAt: -1 })
    .populate("userId", "name phone email")
    .populate("restaurantId", "restaurantName name address phone ownerPhone location profileImage")
    .lean();

  const docs = [];
  for (const order of orders) {
    const assignedLeg = getAssignedDispatchLeg(order, deliveryPartnerId);
    const assignedWholeOrder =
      toIdString(order?.dispatch?.deliveryPartnerId) === toIdString(deliveryPartnerId);
    const eligibleLegs = isSplitDispatchOrder(order)
      ? getEligibleDispatchLegs(order, deliveryPartnerId)
      : [];
    const isMarketplaceOrder = isSplitDispatchOrder(order)
      ? eligibleLegs.length > 0
      : order?.dispatch?.status === "unassigned" &&
        ["confirmed", "preparing", "ready_for_pickup"].includes(order?.orderStatus);

    if (assignedLeg) {
      docs.push(
        buildDeliveryOrderView(order, deliveryPartnerId, {
          assignedDispatchLeg: assignedLeg,
          dispatchLeg: assignedLeg,
        }),
      );
      continue;
    }

    if (isSplitDispatchOrder(order)) {
      if (!isMarketplaceOrder) continue;
      for (const leg of eligibleLegs) {
        docs.push(
          buildDeliveryOrderView(order, deliveryPartnerId, {
            dispatchLeg: leg,
          }),
        );
      }
      continue;
    }

    if (isMarketplaceOrder || assignedWholeOrder) {
      docs.push(buildDeliveryOrderView(order, deliveryPartnerId));
    }
  }

  const returnPickups = await returnPickupDelivery.listAvailableReturnPickups(
    deliveryPartnerId,
    { page: 1, limit: 100 },
  );
  const mergedDocs = [...docs, ...(returnPickups?.docs || returnPickups?.items || [])];

  return buildPaginatedResult({
    docs: mergedDocs.slice(skip, skip + limit),
    total: mergedDocs.length,
    page,
    limit,
  });
}
export async function acceptOrderDelivery(orderId, deliveryPartnerId, body = {}) {
  const { assertDriverCanReceiveOrders } = await import("../../../../core/wallet/driverMinWallet.service.js");
  await assertDriverCanReceiveOrders(deliveryPartnerId);

  const documentType = await resolveDeliveryDocumentType(orderId, body);
  if (documentType === DISPATCH_DOCUMENT_TYPES.SELLER_RETURN) {
    return returnPickupDelivery.acceptReturnPickupDelivery(orderId, deliveryPartnerId, body);
  }

  const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
  const { Driver } = await import("../../../../core/models/driver.model.js");
  const partner = await Driver.findById(partnerId).select("status isActive isDeleted accountStatus").lean();
  if (!partner || partner.isDeleted || partner.accountStatus === "deleted") {
    throw new ValidationError("Delivery partner not found");
  }
  if (partner.status !== "approved" || partner.isActive === false) {
    throw new ValidationError("Your account is not approved to accept orders");
  }

  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  let order = await FoodOrder.findOne({
    ...identity,
    orderStatus: {
      $nin: [
        "delivered",
        "cancelled_by_user",
        "cancelled_by_restaurant",
        "cancelled_by_admin",
      ],
    },
    $or: [
      { "dispatch.status": "unassigned" },
      { "dispatch.deliveryPartnerId": partnerId },
      { "dispatchPlan.legs": { $elemMatch: { deliveryPartnerId: partnerId } } },
      {
        "dispatchPlan.legs": {
          $elemMatch: {
            deliveryPartnerId: null,
            partnerCandidates: {
              $elemMatch: {
                partnerId,
              },
            },
          },
        },
      },
    ],
  });

  if (!order) throw new NotFoundError("Order not found");

  if (
    !["confirmed", "preparing", "ready_for_pickup", "picked_up"].includes(
      order.orderStatus,
    )
  ) {
    throw new ValidationError("Order not ready for delivery assignment");
  }

  // MIS-ASSIGN GUARD: a rider stays "online" for their whole active delivery (there's no
  // separate busy/on-delivery status), and offers can go stale client-side. The dispatch
  // broadcast already excludes busy riders from the pool it offers to (see
  // getBusyPartnerIds in order-dispatch.service.js), but this is the last line of defense —
  // applies to both the regular and split-dispatch accept paths below — so a rider can never
  // accept a second order while a different one is still active.
  const otherActiveOrder = await FoodOrder.findOne({
    _id: { $ne: order._id },
    "dispatch.deliveryPartnerId": partnerId,
    orderStatus: {
      $in: ["confirmed", "preparing", "ready_for_pickup", "picked_up", "reached_pickup", "reached_drop"],
    },
  })
    .select("orderId")
    .lean();
  if (otherActiveOrder) {
    throw new ValidationError(
      `You already have an active delivery (Order #${otherActiveOrder.orderId}). Complete it before accepting another.`,
    );
  }

  if (isSplitDispatchOrder(order)) {
    const requestedLegId = String(body?.legId || "").trim();
    const { updatedOrder, claimedLegId } = await claimSplitDispatchLegAtomically(
      order,
      deliveryPartnerId,
      requestedLegId,
    );

    if (!updatedOrder) {
      throw new NotFoundError("Order not found");
    }

    const targetLeg = (updatedOrder.dispatchPlan?.legs || []).find(
      (leg) =>
        String(leg?.legId || "") === String(claimedLegId || "") &&
        toIdString(leg?.deliveryPartnerId) === toIdString(deliveryPartnerId),
    );

    if (!targetLeg) {
      throw new ValidationError("No dispatch leg is currently available for this rider");
    }

    const assignedLegCount = (updatedOrder.dispatchPlan?.legs || []).filter((leg) =>
      toIdString(leg.deliveryPartnerId),
    ).length;

    const nextDispatchStatus =
      assignedLegCount >= (updatedOrder.dispatchPlan?.legs || []).length
        ? "accepted"
        : "assigned";
    const previousDispatchStatus = updatedOrder.dispatch?.status || "unassigned";

    updatedOrder.dispatch.status = nextDispatchStatus;
    updatedOrder.dispatch.assignedAt = updatedOrder.dispatch.assignedAt || new Date();
    if (nextDispatchStatus === "accepted") {
      updatedOrder.dispatch.acceptedAt = updatedOrder.dispatch.acceptedAt || new Date();
    }

    if (previousDispatchStatus !== nextDispatchStatus) {
      pushStatusHistory(updatedOrder, {
        byRole: "DELIVERY_PARTNER",
        byId: deliveryPartnerId,
        from: previousDispatchStatus,
        to: nextDispatchStatus,
        note: `Accepted split dispatch leg ${targetLeg.legId}`,
      });
    }

    emitOrderClaimedToOtherPartners(updatedOrder, {
      acceptedBy: deliveryPartnerId,
      legId: targetLeg.legId,
      candidatePartnerIds: (targetLeg.partnerCandidates || []).map(
        (candidate) => candidate?.partnerId,
      ),
    });

    await updatedOrder.save();
    return getOrderById(updatedOrder._id, { deliveryPartnerId });
  }

  // SECURITY/RACE-SAFETY: with broadcast dispatch, several riders can be offered the
  // same order and tap "accept" within milliseconds of each other. A plain
  // read-then-save here would let a later request silently overwrite an earlier
  // acceptance. Claim atomically at the DB level — only the first request whose
  // update actually matches (order still unassigned, or re-accepted by the same
  // partner) wins; everyone else gets a clear "already accepted" error instead of a
  // corrupted double-assignment. Mirrors the already-atomic claimSplitDispatchLegAtomically
  // pattern used for split-dispatch legs above.
  const acceptedFromStatus = order.dispatch?.status || "unassigned";
  const claimResult = await FoodOrder.updateOne(
    {
      _id: order._id,
      orderStatus: {
        $in: ["confirmed", "preparing", "ready_for_pickup", "picked_up"],
      },
      $or: [
        { "dispatch.status": "unassigned" },
        { "dispatch.deliveryPartnerId": partnerId },
      ],
    },
    {
      $set: {
        "dispatch.deliveryPartnerId": partnerId,
        "dispatch.status": "accepted",
        "dispatch.assignedAt": order.dispatch?.assignedAt || new Date(),
        "dispatch.acceptedAt": new Date(),
      },
      $push: {
        statusHistory: {
          at: new Date(),
          byRole: "DELIVERY_PARTNER",
          byId: deliveryPartnerId,
          from: acceptedFromStatus,
          to: "accepted",
          note: "",
        },
      },
    },
  );

  if (claimResult.matchedCount === 0) {
    const latest = await FoodOrder.findById(order._id).select("dispatch orderStatus").lean();
    if (!latest) throw new NotFoundError("Order not found");
    if (
      latest.dispatch?.deliveryPartnerId &&
      String(latest.dispatch.deliveryPartnerId) !== String(deliveryPartnerId)
    ) {
      throw new ForbiddenError("This order has already been accepted by another delivery partner");
    }
    throw new ValidationError("Order not ready for delivery assignment");
  }

  order = await FoodOrder.findById(order._id);

  emitOrderClaimedToOtherPartners(order, {
    acceptedBy: deliveryPartnerId,
    candidatePartnerIds: [
      ...(order.dispatch?.offeredTo || []).map((entry) => entry?.partnerId),
    ],
  });

  await order.populate('restaurantId');

  try {
      const rest = order.restaurantId;
      const userLoc = order.deliveryAddress?.location?.coordinates;
      const restLoc = rest?.location?.coordinates;

      if (restLoc?.[0] && userLoc?.[0]) {
          const polyline = await fetchPolyline(
              { lat: restLoc[1], lng: restLoc[0] },
              { lat: userLoc[1], lng: userLoc[0] }
          );

          const db = getFirebaseDB();
          if (db) {
              const orderRef = db.ref(`active_orders/${order.orderId}`);
              await orderRef.set({
                  polyline,
                  lat: restLoc[1],
                  lng: restLoc[0],
                  boy_lat: restLoc[1],
                  boy_lng: restLoc[0],
                  restaurant_lat: restLoc[1],
                  restaurant_lng: restLoc[0],
                  customer_lat: userLoc[1],
                  customer_lng: userLoc[0],
                  status: 'accepted',
                  last_updated: Date.now()
              }).catch(e => logger.error(`Firebase orderRef set error: ${e.message}`));
          }
      }
  } catch (err) {
      logger.error(`Error initializing Firebase order tracking: ${err.message}`);
  }

  await foodTransactionService.updateTransactionRider(order._id, deliveryPartnerId);

  try {
    const io = getIO();
    if (io) {
      io.to(rooms.delivery(deliveryPartnerId)).emit("order_status_update", {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        dispatchStatus: order.dispatch?.status,
      });
      io.to(rooms.restaurant(order.restaurantId)).emit("order_status_update", {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        dispatchStatus: order.dispatch?.status,
      });
      io.to(rooms.user(order.userId)).emit("order_status_update", {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        dispatchStatus: order.dispatch?.status,
      });
    }
  } catch (e) {
    logger.warn(`Socket emit on acceptOrderDelivery failed: ${e?.message || e}`);
  }

  enqueueOrderEvent("delivery_assigned", {
    orderMongoId: order._id?.toString?.(),
    orderId: order.orderId,
    deliveryPartnerId,
    dispatchStatus: order.dispatch?.status,
  });

  return getOrderById(order._id, { deliveryPartnerId });
}
export async function rejectOrderDelivery(orderId, deliveryPartnerId, body = {}) {
    const documentType = await resolveDeliveryDocumentType(orderId, body);
    if (documentType === DISPATCH_DOCUMENT_TYPES.SELLER_RETURN) {
      return returnPickupDelivery.rejectReturnPickupDelivery(orderId, deliveryPartnerId);
    }

    const identity = buildOrderIdentityFilter(orderId);
    if (!identity) throw new ValidationError('Order id required');
    const order = await FoodOrder.findOne(identity);
    if (!order) throw new NotFoundError('Order not found');

    if (isSplitDispatchOrder(order)) {
      const assignedLeg = getAssignedDispatchLeg(order, deliveryPartnerId);
      if (!assignedLeg) throw new ForbiddenError('No split dispatch leg assigned to you');

      assignedLeg.deliveryPartnerId = null;
      assignedLeg.assignedAt = null;
      assignedLeg.partnerCandidates = (assignedLeg.partnerCandidates || []).filter(
        (candidate) => toIdString(candidate?.partnerId) !== toIdString(deliveryPartnerId),
      );

      const assignedLegCount = (order.dispatchPlan?.legs || []).filter((leg) =>
        toIdString(leg.deliveryPartnerId),
      ).length;

      order.dispatch.status = assignedLegCount > 0 ? 'assigned' : 'unassigned';
      if (!assignedLegCount) {
        order.dispatch.assignedAt = undefined;
        order.dispatch.acceptedAt = undefined;
      }

      pushStatusHistory(order, {
        byRole: 'DELIVERY_PARTNER',
        byId: deliveryPartnerId,
        from: 'assigned',
        to: order.dispatch.status,
        note: `Rejected split dispatch leg ${assignedLeg.legId}`,
      });
      await order.save();
      return getOrderById(order._id, { deliveryPartnerId });
    }

    if (order.dispatch.deliveryPartnerId?.toString() !== deliveryPartnerId.toString()) throw new ForbiddenError('Not your order');
    
    const offer = order.dispatch.offeredTo.find(o => String(o.partnerId) === String(deliveryPartnerId) && o.action === 'offered');
    if (offer) offer.action = 'rejected';

    order.dispatch.status = 'unassigned';
    order.dispatch.deliveryPartnerId = undefined;
    order.dispatch.assignedAt = undefined;
    order.dispatch.acceptedAt = undefined;
    pushStatusHistory(order, { byRole: 'DELIVERY_PARTNER', byId: deliveryPartnerId, from: 'assigned', to: 'unassigned', note: 'Rejected' });
    await order.save();
    
    enqueueOrderEvent('delivery_rejected', {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        deliveryPartnerId
    });

    void tryAutoAssign(order._id).catch(err => logger.error(`SmartDispatch: Auto-assign after reject failed: ${err.message}`));

    return order.toObject();
}
export async function confirmReachedPickupDelivery(orderId, deliveryPartnerId, body = {}) {
  const documentType = await resolveDeliveryDocumentType(orderId, body);
  if (documentType === DISPATCH_DOCUMENT_TYPES.SELLER_RETURN) {
    return returnPickupDelivery.confirmReachedPickupReturn(orderId, deliveryPartnerId);
  }

  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne(identity);
  if (!order) throw new NotFoundError("Order not found");
  if (!isOrderAssignedToDeliveryPartner(order, deliveryPartnerId)) {
    throw new ForbiddenError("Not your order");
  }
  if (order.orderStatus === "delivered")
    throw new ValidationError("Order already delivered");

  // Idempotent: if already at/after pickup, keep success.
  const currentPhase = order.deliveryState?.currentPhase || "";
  const currentStatus = order.deliveryState?.status || "";
  if (currentPhase === "at_pickup" || currentStatus === "reached_pickup") {
    return order.toObject();
  }

  const from = currentStatus || currentPhase || order.orderStatus;
  order.deliveryState = {
    ...(order.deliveryState?.toObject?.() || order.deliveryState || {}),
    currentPhase: "at_pickup",
    status: "reached_pickup",
    reachedPickupAt: order.deliveryState?.reachedPickupAt || new Date(),
  };
  pushStatusHistory(order, {
    byRole: "DELIVERY_PARTNER",
    byId: deliveryPartnerId,
    from,
    to: "reached_pickup",
    note: "Reached pickup location",
  });
  await order.save();

  // Notify
  emitOrderUpdate(order, deliveryPartnerId);

  // Notify Restaurant about rider arrival
  try {
    const restaurant = await FoodRestaurant.findById(order.restaurantId).select("restaurantName").lean();
    const partner = await Driver.findById(deliveryPartnerId).select("name").lean();
    
    const { notifyOwnersSafely } = await import("../../../../core/notifications/firebase.service.js");
    await notifyOwnersSafely(
      [{ ownerType: "RESTAURANT", ownerId: order.restaurantId }],
      {
        title: "Rider Arrived! 🛵",
        body: `${partner?.name || "The delivery partner"} has arrived at your restaurant to pick up Order #${order.orderId}.`,
        image: "https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png",
        data: {
          type: "rider_arrived",
          orderId: String(order.orderId),
          orderMongoId: String(order._id),
          partnerName: partner?.name || ""
        }
      }
    );
  } catch (err) {
    console.error("[DEBUG] Error notifying restaurant about rider arrival:", err);
  }

    enqueueOrderEvent('reached_pickup', {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        deliveryPartnerId,
        orderStatus: order.orderStatus,
        deliveryPhase: order.deliveryState?.currentPhase,
        deliveryStatus: order.deliveryState?.status
    });
    return order.toObject();
}

/**
 * Slide to confirm pickup (Bill uploaded)
 */
export async function confirmPickupDelivery(
  orderId,
  deliveryPartnerId,
  billImageUrl,
  body = {},
) {
  const mergedBody = { ...body, billImageUrl: billImageUrl || body?.billImageUrl };
  const documentType = await resolveDeliveryDocumentType(orderId, mergedBody);
  if (documentType === DISPATCH_DOCUMENT_TYPES.SELLER_RETURN) {
    return returnPickupDelivery.confirmPickupReturn(orderId, deliveryPartnerId, mergedBody);
  }

  const identity = buildOrderIdentityFilter(orderId);
  const order = await FoodOrder.findOne(identity);
  if (!order) throw new NotFoundError("Order not found");
  if (!isOrderAssignedToDeliveryPartner(order, deliveryPartnerId)) {
    throw new ForbiddenError("Not your order");
  }

  const from = order.orderStatus;
  order.orderStatus = "picked_up";
  order.deliveryState = {
    ...(order.deliveryState?.toObject?.() || order.deliveryState || {}),
    currentPhase: "en_route_to_delivery",
    status: "picked_up",
    pickedUpAt: new Date(),
    billImageUrl,
  };
  pushStatusHistory(order, {
    byRole: "DELIVERY_PARTNER",
    byId: deliveryPartnerId,
    from,
    to: "picked_up",
    note: "Order picked up",
  });
  await order.save();

    emitOrderUpdate(order, deliveryPartnerId);
    enqueueOrderEvent('picked_up', {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        deliveryPartnerId,
        billImageUrl: billImageUrl || null
    });
    return order.toObject();
}

export async function confirmReachedDropDelivery(orderId, deliveryPartnerId, body = {}) {
  const documentType = await resolveDeliveryDocumentType(orderId, body);
  if (documentType === DISPATCH_DOCUMENT_TYPES.SELLER_RETURN) {
    return returnPickupDelivery.confirmReachedDropReturn(orderId, deliveryPartnerId);
  }

  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne(identity).select("+deliveryOtp");
  if (!order) throw new NotFoundError("Order not found");
  if (!isOrderAssignedToDeliveryPartner(order, deliveryPartnerId)) {
    throw new ForbiddenError("Not your order");
  }

  if (order.deliveryVerification?.dropOtp?.verified) {
    emitOrderUpdate(order, deliveryPartnerId);
    return sanitizeOrderForExternal(order);
  }

  const alreadyAtDrop =
    order.deliveryState?.currentPhase === "at_drop" ||
    order.deliveryState?.status === "reached_drop";
  const fromPhase =
    order.deliveryState?.status ||
    order.deliveryState?.currentPhase ||
    order.orderStatus ||
    "";

  const existingOtp = String(order.deliveryOtp || "").trim();
  if (!alreadyAtDrop || !existingOtp) {
    order.deliveryOtp = generateFourDigitDeliveryOtp();
    order.deliveryVerification = {
      ...(order.deliveryVerification?.toObject?.() ||
        order.deliveryVerification ||
        {}),
      dropOtp: { required: true, verified: false },
    };
  }

  order.deliveryState = {
    ...(order.deliveryState?.toObject?.() || order.deliveryState || {}),
    currentPhase: "at_drop",
    status: "reached_drop",
    reachedDropAt: order.deliveryState?.reachedDropAt || new Date(),
  };

  if (!alreadyAtDrop) {
    pushStatusHistory(order, {
      byRole: "DELIVERY_PARTNER",
      byId: deliveryPartnerId,
      from: fromPhase,
      to: "reached_drop",
      note: "Reached drop location",
    });
  }

  await order.save();

    const plainOtp = String(order.deliveryOtp || '').trim();
    emitDeliveryDropOtpToUser(order, plainOtp);
    emitOrderUpdate(order, deliveryPartnerId);
    enqueueOrderEvent('reached_drop', {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        deliveryPartnerId,
        dropOtpRequired: order.deliveryVerification?.dropOtp?.required ?? true,
        dropOtpVerified: order.deliveryVerification?.dropOtp?.verified ?? false
    });
    return sanitizeOrderForExternal(order);
}

export async function verifyDropOtpDelivery(orderId, deliveryPartnerId, otp) {
  const identity = buildOrderIdentityFilter(orderId);
  const order = await FoodOrder.findOne(identity).select("+deliveryOtp");
  if (!order) throw new NotFoundError("Order not found");
  if (!isOrderAssignedToDeliveryPartner(order, deliveryPartnerId)) {
    throw new ForbiddenError("Not your order");
  }

  const otpStr = String(otp || "").trim();
  if (!otpStr) throw new ValidationError("OTP is required");

  if (!order.deliveryVerification?.dropOtp?.required) {
    throw new ValidationError(
      "OTP verification is not active for this order. Confirm reached drop first.",
    );
  }
  if (order.deliveryVerification?.dropOtp?.verified) {
    return { order: sanitizeOrderForExternal(order) };
  }

  const expected = String(order.deliveryOtp || "").trim();
  if (!expected || expected !== otpStr) {
    throw new ValidationError(
      "Invalid OTP. Ask the customer for the code shown in their app.",
    );
  }

  // Use direct path assignment for robustness in Mongoose change detection
  if (!order.deliveryVerification) order.deliveryVerification = { dropOtp: {} };
  order.deliveryVerification.dropOtp.verified = true;
  order.markModified('deliveryVerification.dropOtp.verified');
  
  order.deliveryOtp = "";
  await order.save();

    emitOrderUpdate(order, deliveryPartnerId);
    enqueueOrderEvent('drop_otp_verified', {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        deliveryPartnerId
    });
    return { order: sanitizeOrderForExternal(order) };
}

export async function completeDelivery(orderId, deliveryPartnerId, body = {}) {
  const documentType = await resolveDeliveryDocumentType(orderId, body);
  if (documentType === DISPATCH_DOCUMENT_TYPES.SELLER_RETURN) {
    return returnPickupDelivery.completeReturnPickup(orderId, deliveryPartnerId, body);
  }

  const identity = buildOrderIdentityFilter(orderId);
  const order = await FoodOrder.findOne(identity);
  if (!order) throw new NotFoundError("Order not found");
  if (!isOrderAssignedToDeliveryPartner(order, deliveryPartnerId)) {
    throw new ForbiddenError("Not your order");
  }

  const { otp, ratings, paymentMode } = body;

  // Dynamically update payment method based on delivery partner selection
  if (paymentMode === 'cash') {
    order.payment.method = 'cash';
  } else if (paymentMode === 'qr') {
    order.payment.method = 'razorpay_qr';
  }

  if (
    order.deliveryVerification?.dropOtp?.required &&
    !order.deliveryVerification?.dropOtp?.verified && 
    !otp // Only throw if OTP is not provided here as fallback
  ) {
    throw new ValidationError(
      "Customer handover OTP is required. Verify the OTP from the customer before completing delivery.",
    );
  }

  const from = order.orderStatus;
  const prevPayStatus = order.payment.status;
  const payMethod = order.payment.method;

  // Security gate: only complete QR delivery after Razorpay payment-link is actually paid.
  // This enables frontend auto-complete after QR success.
  if (payMethod === "razorpay_qr") {
    // syncRazorpayQrPayment is a helper presumed present in this service context
    if (typeof syncRazorpayQrPayment === 'function') await syncRazorpayQrPayment(order);
    if (order.payment.status !== "paid") {
      throw new ValidationError("QR payment not verified yet");
    }
  }

  order.orderStatus = "delivered";
  order.payment.status = "paid"; 
  order.deliveryState = {
    ...(order.deliveryState?.toObject?.() || order.deliveryState || {}),
    currentPhase: "delivered",
    status: "delivered",
    deliveredAt: new Date(),
  };

  if (ratings) {
    order.ratings = {
       ...(order.ratings?.toObject?.() || order.ratings || {}),
       ...ratings
    };
  }

  pushStatusHistory(order, {
    byRole: "DELIVERY_PARTNER",
    byId: deliveryPartnerId,
    from,
    to: "delivered",
    note: "Delivery completed successfully",
  });

  await order.save();
  emitOrderUpdate(order, deliveryPartnerId);
  const ledgerKind =
    payMethod === "cash" && prevPayStatus === "cod_pending"
      ? "cod_marked_paid_on_delivery"
      : "payment_snapshot_sync";
      
  await foodTransactionService.updateTransactionStatus(order._id, ledgerKind, {
    status: 'captured',
    recordedByRole: "DELIVERY_PARTNER",
    recordedById: deliveryPartnerId,
    note: `Delivery completed. Prev status: ${prevPayStatus}`
  });

  emitOrderUpdate(order, deliveryPartnerId);
  enqueueOrderEvent('delivery_completed', {
    orderMongoId: order._id?.toString?.(),
    orderId: order.orderId,
    deliveryPartnerId,
    paymentMethod: payMethod,
    payMethod,
    prevPayStatus,
    paymentStatus: order.payment?.status,
    riderEarning: resolveFoodRiderEarning(order.pricing || {}) || Number(order.riderEarning || 0),
    platformProfit: Number(order.platformProfit || 0),
    total: Number(order.pricing?.total || 0),
  });
  return sanitizeOrderForExternal(order);
}

function emitOrderUpdate(order, deliveryPartnerId) {
  try {
    const io = getIO();
    if (io) {
      const dv =
        order.deliveryVerification?.toObject?.() || order.deliveryVerification;
      const payload = {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        deliveryState: order.deliveryState,
        deliveryVerification: dv,
      };
      io.to(rooms.delivery(deliveryPartnerId)).emit(
        "order_status_update",
        payload,
      );
      io.to(rooms.restaurant(order.restaurantId)).emit(
        "order_status_update",
        payload,
      );
      io.to(rooms.user(order.userId)).emit("order_status_update", payload);
    }
    let riderTitle = `Order deliverd! 🏁`;
    let riderBody = `Order #${order.orderId} has been marked as delivered.`;

    // Special message for COD payment collection
    if (order.payment?.method === "cash") {
      riderTitle = "Payment Collected! 💵";
      riderBody = `You have collected ₹${order.pricing?.total || 0} cash for Order #${order.orderId}.`;
    }

    void notifyOwnersSafely(
      [
        { ownerType: "RESTAURANT", ownerId: order.restaurantId },
        { ownerType: "USER", ownerId: order.userId },
      ],
      {
        title: `Order #${order.orderId} delivered! ✅`,
        body: `Hope you enjoyed your meal!`,
        data: {
          type: "order_status_update",
          orderId: order.orderId,
          orderMongoId: order._id?.toString?.() || "",
          orderStatus: "delivered",
        },
      },
    );

    void notifyOwnerSafely(
      { ownerType: "DELIVERY_PARTNER", ownerId: deliveryPartnerId },
      {
        title: riderTitle,
        body: riderBody,
        data: {
          type: "order_completed",
          orderId: order.orderId,
          orderMongoId: order._id?.toString?.() || "",
          paymentMethod: order.payment?.method,
          amountCollected: String(order.pricing?.total || 0),
        },
      }
    );
  } catch (e) {
    console.error("Error emitting order update:", e);
  }
}

export async function updateOrderStatusDelivery(orderId, deliveryPartnerId, orderStatus) {
    const identity = buildOrderIdentityFilter(orderId);
    if (!identity) throw new ValidationError('Order id required');
    const order = await FoodOrder.findOne(identity);
    if (!order) throw new NotFoundError('Order not found');
    if (order.dispatch.deliveryPartnerId?.toString() !== deliveryPartnerId.toString()) throw new ForbiddenError('Not your order');
    const from = order.orderStatus;
    order.orderStatus = orderStatus;
    pushStatusHistory(order, { byRole: 'DELIVERY_PARTNER', byId: deliveryPartnerId, from, to: orderStatus });
    await order.save();
    enqueueOrderEvent('delivery_status_updated', {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        deliveryPartnerId,
        from,
        to: orderStatus
    });
    return order.toObject();
}

// ----- COD QR collection -----
export async function createCollectQr(
  orderId,
  deliveryPartnerId,
  customerInfo = {},
) {
  const query = mongoose.Types.ObjectId.isValid(orderId) ? { _id: orderId } : { orderId };
  const order = await FoodOrder.findOne(query)
    .populate("userId", "name email phone")
    .lean();
  if (!order) throw new NotFoundError("Order not found");
  if (
    order.dispatch.deliveryPartnerId?.toString() !==
    deliveryPartnerId.toString()
  )
    throw new ForbiddenError("Not your order");
  if (order.payment.method !== "cash" && order.payment.status === "paid")
    throw new ValidationError("Order already paid");
  const amountDue = order.payment.amountDue ?? order.pricing?.total ?? 0;
  if (amountDue < 1) throw new ValidationError("No amount due");

  if (!isRazorpayConfigured())
    throw new ValidationError("QR payment not configured");

  const amountPaise = Math.round(amountDue * 100);
  const user = order.userId || {};
  const link = await createPaymentLink({
    amountPaise,
    currency: "INR",
    description: `Order ${order.orderId} - COD collect`,
    orderId: order.orderId,
    customerName: customerInfo.name || user.name || "Customer",
    customerEmail: customerInfo.email || user.email || "customer@example.com",
    customerPhone: customerInfo.phone || user.phone,
  });

  await FoodOrder.findByIdAndUpdate(order._id, {
    $set: {
      "payment.method": "razorpay_qr",
      "payment.status": "pending_qr",
      "payment.qr": {
        paymentLinkId: link.id,
        shortUrl: link.short_url,
        imageUrl: link.short_url,
        status: link.status || "created",
        expiresAt: link.expire_by ? new Date(link.expire_by * 1000) : null,
      },
    },
  });

    const updated = await FoodOrder.findById(order._id).select('orderId restaurantId userId riderEarning payment pricing').lean();
    if (updated) {
        await foodTransactionService.updateTransactionStatus(order._id, 'cod_collect_qr_created', {
            recordedByRole: 'DELIVERY_PARTNER',
            recordedById: deliveryPartnerId,
            note: 'COD collection QR created'
        });
    }

    enqueueOrderEvent('collect_qr_created', {
        orderMongoId: String(orderId),
        orderId: updated?.orderId || null,
        deliveryPartnerId,
        paymentLinkId: link.id,
        shortUrl: link.short_url,
        amountDue
    });

  // IMPORTANT: return QR payload so frontend can render "Generate QR" / "Show QR".
  const shortUrl =
    link?.short_url ?? link?.shortUrl ?? link?.short_url_path ?? null;
  const imageUrl =
    link?.short_url ??
    link?.image_url ??
    link?.imageUrl ??
    link?.image ??
    null;

  return {
    shortUrl,
    imageUrl,
    amount: amountDue,
    expiresAt:
      link?.expire_by
        ? new Date(link.expire_by * 1000)
        : link?.expiresAt
          ? new Date(link.expiresAt)
          : null,
  };
}

/**
 * Razorpay QR auto-verify:
 * - Fetch payment-link status from Razorpay
 * - Update `order.payment.status` to `paid` when Razorpay marks it paid
 * - Update `order.payment.qr.status` for UI/debugging
 *
 * IMPORTANT: Callers should `await` this before completing delivery.
 */
async function syncRazorpayQrPayment(orderDoc) {
  if (!orderDoc?.payment) return orderDoc?.payment;
  if (orderDoc.payment.method !== "razorpay_qr") return orderDoc.payment;
  if (orderDoc.payment.status === "paid") return orderDoc.payment;

  const paymentLinkId = orderDoc.payment?.qr?.paymentLinkId;
  if (!paymentLinkId) return orderDoc.payment;
  if (!isRazorpayConfigured()) return orderDoc.payment;

  let link;
  try {
    link = await fetchRazorpayPaymentLink(paymentLinkId);
  } catch (err) {
    logger.warn(
      `Razorpay payment-link fetch failed for ${paymentLinkId}: ${
        err?.message || err
      }`
    );
    return orderDoc.payment;
  }

  const linkStatus = String(link?.status || "").toLowerCase();
  if (!linkStatus) return orderDoc.payment;

  // Update QR snapshot status.
  orderDoc.payment.qr = {
    ...(orderDoc.payment.qr?.toObject?.() || orderDoc.payment.qr || {}),
    status: linkStatus,
  };

  // Mark paid only when Razorpay says it's paid/settled.
  if (["paid", "captured", "authorized"].includes(linkStatus)) {
    orderDoc.payment.status = "paid";
    await orderDoc.save();
    try {
      await consumeCouponForOrder(orderDoc);
    } catch (err) {
      logger.warn(`Coupon consume failed after QR paid for ${orderDoc.orderId}: ${err?.message || err}`);
    }
  } else if (["expired", "cancelled", "canceled", "failed"].includes(linkStatus)) {
    orderDoc.payment.status = "failed";
    await orderDoc.save();
  }

  return orderDoc.payment;
}

export async function getPaymentStatus(orderId, deliveryPartnerId) {
  // Support both short orderId strings and MongoDB _ids.
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne(identity).select(
    "payment dispatch riderEarning platformProfit pricing"
  );
  if (!order) throw new NotFoundError("Order not found");
  if (
    order.dispatch?.deliveryPartnerId?.toString() !==
    deliveryPartnerId.toString()
  )
    throw new ForbiddenError("Not your order");

  // Auto-sync Razorpay QR payment status before returning.
  // syncRazorpayQrPayment calls Razorpay, updates order.payment.status, and saves.
  if (order.payment?.method === "razorpay_qr") {
    await syncRazorpayQrPayment(order);
  }

  const transaction = await FoodTransaction.findOne({ orderId: order._id }).lean();
  const latestHistory = (transaction?.history || []).sort((a, b) => (b.at || 0) - (a.at || 0))[0] || null;

  return {
    payment: {
      ...(order.payment?.toObject?.() || order.payment || {}),
      // Expose the effective status in a flat field for easy frontend reading
      status: order.payment?.status,
    },
    latestPaymentSnapshot: latestHistory,
    riderEarning: order.riderEarning ?? 0,
    platformProfit: order.platformProfit ?? 0,
    pricingTotal: order.pricing?.total ?? 0,
    transactionStatus: transaction?.status ?? null,
  };
}

// ----- Admin -----
export async function listOrdersAdmin(query) {
  const { page, limit, skip } = buildPaginationOptions(query);
  const filter = {
    orderType: { $in: ["food", "mixed"] },
    $or: [
      { "payment.method": { $in: ["cash", "wallet"] } },
      { "payment.status": { $in: ["paid", "authorized", "captured", "settled", "refunded"] } },
    ],
  };

  // Extract raw query params
  const rawStatus = typeof query.status === "string" ? query.status.trim().toLowerCase() : "";
  const cancelledBy = typeof query.cancelledBy === "string" ? query.cancelledBy.trim().toLowerCase() : "";
  const restaurantIdRaw = typeof query.restaurantId === "string" ? query.restaurantId.trim() : "";
  const zoneIdRaw = typeof query.zoneId === "string" ? query.zoneId.trim() : "";
  const userIdRaw = typeof query.userId === "string" ? query.userId.trim() : "";
  const startDateRaw = typeof query.startDate === "string" ? query.startDate.trim() : "";
  const endDateRaw = typeof query.endDate === "string" ? query.endDate.trim() : "";
  const search = typeof query.search === "string" ? query.search.trim() : "";

  if (rawStatus && rawStatus !== "all") {
    switch (rawStatus) {
      case "pending":
        filter.orderStatus = { $in: ["created", "confirmed"] };
        break;
      case "accepted":
        filter.orderStatus = "confirmed";
        break;
      case "processing":
        filter.orderStatus = { $in: ["preparing", "ready_for_pickup"] };
        break;
      case "food-on-the-way":
        filter.orderStatus = "picked_up";
        break;
      case "delivered":
        filter.orderStatus = "delivered";
        break;
      case "canceled":
      case "cancelled":
        filter.orderStatus = {
          $in: ["cancelled_by_user", "cancelled_by_restaurant", "cancelled_by_admin"],
        };
        break;
      case "restaurant-cancelled":
        filter.orderStatus = "cancelled_by_restaurant";
        break;
      case "payment-failed":
        filter["payment.status"] = "failed";
        break;
      case "refunded":
        filter["payment.status"] = "refunded";
        break;
      case "offline-payments":
        filter["payment.method"] = "cash";
        filter.orderStatus = { $in: ["created", "confirmed", "delivered"] };
        break;
      case "scheduled":
        filter.scheduledAt = { $ne: null };
        break;
    }
  }

  if (cancelledBy) {
    if (cancelledBy === "restaurant") {
      filter.orderStatus = "cancelled_by_restaurant";
    } else if (cancelledBy === "user" || cancelledBy === "customer") {
      filter.orderStatus = "cancelled_by_user";
    }
  }

  // ID based filters
  if (restaurantIdRaw && mongoose.Types.ObjectId.isValid(restaurantIdRaw)) {
    filter.restaurantId = new mongoose.Types.ObjectId(restaurantIdRaw);
  }
  if (zoneIdRaw && mongoose.Types.ObjectId.isValid(zoneIdRaw)) {
    filter.zoneId = new mongoose.Types.ObjectId(zoneIdRaw);
  }
  if (userIdRaw && mongoose.Types.ObjectId.isValid(userIdRaw)) {
    filter.userId = new mongoose.Types.ObjectId(userIdRaw);
  }

  // Date filters
  if (startDateRaw || endDateRaw) {
    const createdAt = {};
    const start = startDateRaw ? new Date(startDateRaw) : null;
    const end = endDateRaw ? new Date(endDateRaw) : null;
    if (start && !Number.isNaN(start.getTime())) {
      createdAt.$gte = start;
    }
    if (end && !Number.isNaN(end.getTime())) {
      // Set to end of day
      end.setHours(23, 59, 59, 999);
      createdAt.$lte = end;
    }
    if (Object.keys(createdAt).length > 0) {
      filter.createdAt = createdAt;
    }
  }

  // Search logic
  if (search) {
    const safeSearch = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Search by Order ID (exact or partial regex)
    const searchConditions = [
      { orderId: { $regex: safeSearch, $options: "i" } }
    ];

    // If search looks like a name, we need to find matching users and restaurants first
    const [matchingUsers, matchingRestaurants] = await Promise.all([
      FoodUser.find({ name: { $regex: safeSearch, $options: "i" } }).select('_id').lean(),
      FoodRestaurant.find({ restaurantName: { $regex: safeSearch, $options: "i" } }).select('_id').lean()
    ]);

    if (matchingUsers.length > 0) {
      searchConditions.push({ userId: { $in: matchingUsers.map(u => u._id) } });
    }
    if (matchingRestaurants.length > 0) {
      searchConditions.push({ restaurantId: { $in: matchingRestaurants.map(r => r._id) } });
    }

    // Combine base filter with search conditions
    // We use $and to ensure both the visibility/status filters AND the search conditions are met
    const originalFilter = { ...filter };
    delete filter.$or; // We'll reconstruct it

    filter.$and = [
      { $or: originalFilter.$or }, // Visibility filters
      { $or: searchConditions }   // Search conditions
    ];
    
    // Copy other specific filters into $and if needed, but since they are already in `filter` object, 
    // we should be careful. Actually, it's better to just keep them as they are and let Mongo handle it.
  }

  const [docs, total] = await Promise.all([
    FoodOrder.find(filter)
      .populate("userId", "name phone email")
      .populate("restaurantId", "restaurantName area city ownerPhone")
      .populate("dispatch.deliveryPartnerId", "name phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    FoodOrder.countDocuments(filter),
  ]);

  const paginated = buildPaginatedResult({ docs, total, page, limit });
  return { ...paginated, orders: paginated.data };
}

export async function assignDeliveryPartnerAdmin(
  orderId,
  deliveryPartnerId,
  adminId,
) {
  const order = await FoodOrder.findById(orderId);
  if (!order) throw new NotFoundError("Order not found");
  if (order.dispatch.status === "accepted")
    throw new ValidationError("Order already accepted by partner");

  const partner = await Driver.findById(deliveryPartnerId)
    .select("status")
    .lean();
  if (!partner || partner.status !== "approved")
    throw new ValidationError("Delivery partner not available");

    order.dispatch.status = 'assigned';
    order.dispatch.deliveryPartnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
    order.dispatch.assignedAt = new Date();
    pushStatusHistory(order, { byRole: 'ADMIN', byId: adminId, from: order.dispatch.status, to: 'assigned' });
    await order.save();
    enqueueOrderEvent('delivery_partner_assigned', {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        deliveryPartnerId,
        adminId
    });
    return order.toObject();
}

export async function deleteOrderAdmin(orderId, adminId) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne(identity).lean();
  if (!order) throw new NotFoundError("Order not found");

  // Keep support tickets but detach deleted order reference.
  await Promise.all([
    FoodSupportTicket.updateMany(
      { orderId: order._id },
      { $set: { orderId: null } },
    ),
    FoodTransaction.deleteOne({
      $or: [{ orderId: order._id }, { orderReadableId: String(order.orderId) }],
    }),
    FoodOrder.deleteOne({ _id: order._id }),
  ]);

  // Remove realtime tracking node if present.
  try {
    const db = getFirebaseDB();
    if (db && order?.orderId) {
      await db.ref(`active_orders/${order.orderId}`).remove();
    }
  } catch (err) {
    logger.warn(`Delete order firebase cleanup failed: ${err?.message || err}`);
  }

  // Notify connected apps so stale UI entries can disappear without refresh.
  try {
    const io = getIO();
    if (io) {
      const payload = {
        orderMongoId: String(order._id),
        orderId: String(order.orderId || ""),
        deletedBy: "ADMIN",
        adminId: adminId ? String(adminId) : null,
      };

      if (order.userId) io.to(rooms.user(order.userId)).emit("order_deleted", payload);
      if (order.restaurantId) io.to(rooms.restaurant(order.restaurantId)).emit("order_deleted", payload);
      if (order.dispatch?.deliveryPartnerId) {
        io.to(rooms.delivery(order.dispatch.deliveryPartnerId)).emit("order_deleted", payload);
      }
    }
  } catch (err) {
    logger.warn(`Delete order socket emit failed: ${err?.message || err}`);
  }

  enqueueOrderEvent("order_deleted_by_admin", {
    orderMongoId: String(order._id),
    orderId: String(order.orderId || ""),
    adminId: adminId ? String(adminId) : null,
  });

  return {
    deleted: true,
    orderId: String(order.orderId || ""),
    orderMongoId: String(order._id),
  };
}

/**
 * 🕵️ Watchdog: Recovers orders that are in intermediate states for too long.
 * Runs once at server startup (triggered in server.js).
 */
export async function recoverStuckOrders() {
  try {
    const STUCK_THRESHOLD_HOURS = 2; // Orders older than this in a transient state are considered stuck
    const thresholdDate = new Date(Date.now() - STUCK_THRESHOLD_HOURS * 60 * 60 * 1000);

    const transientStates = [
      'placed',
      'created',
      'confirmed',
      'preparing',
      'ready_for_pickup',
      'picked_up'
    ];

    // Find orders that haven't been updated recently and are in a transient state
    const stuckOrders = await FoodOrder.find({
      orderStatus: { $in: transientStates },
      updatedAt: { $lt: thresholdDate }
    });

    if (stuckOrders.length === 0) {
      // logger.info('Watchdog: No stuck orders found to recover.');
      return;
    }

    logger.info(`Watchdog: Found ${stuckOrders.length} stuck orders. Mark as cancelled...`);

    const results = await Promise.all(stuckOrders.map(async (order) => {
      try {
        const oldStatus = order.orderStatus;
        order.orderStatus = 'cancelled_by_admin';
        
        pushStatusHistory(order, {
          byRole: 'SYSTEM',
          from: oldStatus,
          to: 'cancelled_by_admin',
          note: 'Watchdog auto-recovery: Order was stuck in transient state for more than 2 hours.'
        });

        await order.save({ validateBeforeSave: false });

        try {
          await releaseCouponForOrder(order);
        } catch (err) {
          logger.warn(`Coupon release failed on watchdog cancel for ${order.orderId}: ${err?.message || err}`);
        }
        
        // Sync mixed order seller legs
        if (order.orderType === 'mixed' || order.orderType === 'quick') {
          await cancelSellerOrdersForParent(order, "Cancelled by system watchdog");
        }
        
        // Enqueue event for housekeeping/finance
        enqueueOrderEvent('order_cancelled_by_watchdog', {
          orderMongoId: order._id.toString(),
          orderId: order.orderId,
          fromStatus: oldStatus
        });

        return true;
      } catch (err) {
        logger.error(`Watchdog: Failed to recover order ${order.orderId}: ${err.message}`);
        return false;
      }
    }));

    const recoveredCount = results.filter(Boolean).length;
    logger.info(`Watchdog: Successfully recovered ${recoveredCount}/${stuckOrders.length} stuck orders.`);
  } catch (err) {
    logger.error(`Watchdog Error during recovery: ${err.message}`);
  }
}

/**
 * 🆕 Resync State Helper:
 * - When a client reconnects, they call this to get their active order state.
 * - For Delivery Partners: returns the current trip details.
 * - For Users: returns the most recent active order being prepared or delivered.
 */
export async function resyncState(userId, role) {
  if (!userId || !role) return { activeOrder: null };

  let activeOrder = null;

  try {
    const roleUpper = String(role).toUpperCase();
    
    if (roleUpper === 'DELIVERY_PARTNER') {
      activeOrder = await getCurrentTripDelivery(userId);
    } else if (roleUpper === 'USER') {
      const order = await FoodOrder.findOne({
        userId: new mongoose.Types.ObjectId(userId),
        orderStatus: {
          $in: ["placed", "created", "confirmed", "preparing", "ready_for_pickup", "picked_up", "reached_pickup", "reached_drop"]
        }
      })
      .populate({ path: "restaurantId", select: "restaurantName name phone location addressLine1 area city state profileImage" })
      .sort({ createdAt: -1 })
      .lean();

      if (order) {
        activeOrder = normalizeOrderForClient(order);
        if (order.deliveryVerification?.dropOtp?.required && !order.deliveryVerification?.dropOtp?.verified) {
          activeOrder.handoverOtp = order.deliveryOtp;
        }
      }
    }
  } catch (err) {
    logger.error(`resyncState failed for ${role}:${userId} — ${err.message}`);
  }

  return { activeOrder };
}







