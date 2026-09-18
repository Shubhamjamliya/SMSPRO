import mongoose from "mongoose";
import { FoodOrder, FoodSettings } from "../models/order.model.js";
import { FoodRestaurant } from "../../restaurant/models/restaurant.model.js";
import { Seller } from "../../../quick-commerce/seller/models/seller.model.js";
import { Driver } from '../../../../core/models/driver.model.js';
import { canonicalizeDriverModuleKey } from '../../../common/utils/moduleKeys.js';
import { getDeliveryPartnerWalletEnhanced } from "../../delivery/services/deliveryFinance.service.js";
import { FoodDailyPass } from "../../subscriptions/models/foodDailyPass.model.js";
import { UserSubscription } from "../../user/models/userSubscription.model.js";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);
dayjs.extend(timezone);
import {
  ValidationError,
  NotFoundError,
} from "../../../../core/auth/errors.js";
import { logger } from "../../../../utils/logger.js";
import { config } from "../../../../config/env.js";
import { getIO, rooms } from "../../../../config/socket.js";
import { addOrderJob } from "../../../../queues/producers/order.producer.js";
import {
  buildDeliverySocketPayload,
  buildOrderIdentityFilter,
  haversineKm,
  notifyOwnerSafely,
  notifyOwnersSafely,
} from "./order.helpers.js";
import { SellerReturn } from "../../../quick-commerce/seller/models/sellerReturn.model.js";
import { newEventId, recordOrderEventForTarget } from "../../../../core/notifications/orderEvents.service.js";
import { DISPATCH_DOCUMENT_TYPES } from "../../../quick-commerce/utils/dispatchDocument.constants.js";
import {
  buildReturnDeliverySocketPayload,
  loadReturnPickupContext,
} from "../../../quick-commerce/utils/returnPickup.helpers.js";

/**
 * A rider stays `availabilityStatus: "online"` for their entire active delivery — there is
 * no separate "busy"/"on_delivery" state in the schema. Without this check, a rider already
 * mid-delivery on Order A would still show up as "eligible" and get broadcast Order B, C, D...
 * and could accept one, leaving them juggling two deliveries (or the dispatch system offering
 * an order to someone who can't actually take it). This is the primary guard against that
 * "mis-assign" class of bug when several orders are being dispatched at once.
 */
const ACTIVE_ORDER_STATUSES_FOR_BUSY_CHECK = [
  "confirmed",
  "preparing",
  "ready_for_pickup",
  "picked_up",
  "reached_pickup",
  "reached_drop",
];
const ACTIVE_RETURN_STATUSES_FOR_BUSY_CHECK = ["return_pickup_assigned", "return_in_transit"];

/** Map food/quick sourceType → driver activeWorkModule / authorizedServices key */
const workModuleForSourceType = (sourceType) =>
  sourceType === "quick" ? "quick-commerce" : "food";

/**
 * Online drivers for a vertical: authorized + currently working that module.
 */
const onlineDriversForModuleQuery = (moduleKey) => {
  const canonical = canonicalizeDriverModuleKey(moduleKey) || moduleKey;
  const authorized =
    canonical === "porter"
      ? { $in: ["porter", "parcel"] }
      : canonical;
  return {
    availabilityStatus: "online",
    authorizedServices: authorized,
    activeWorkModule: canonical === "porter" ? { $in: ["porter", "parcel"] } : canonical,
  };
};

async function getBusyPartnerIds(partnerIds = []) {
  if (!partnerIds.length) return new Set();
  const ids = partnerIds.map((id) => new mongoose.Types.ObjectId(String(id)));

  const [busyOnOrders, busyOnReturns] = await Promise.all([
    FoodOrder.find({
      "dispatch.deliveryPartnerId": { $in: ids },
      orderStatus: { $in: ACTIVE_ORDER_STATUSES_FOR_BUSY_CHECK },
    })
      .select("dispatch.deliveryPartnerId")
      .lean(),
    SellerReturn.find({
      "dispatch.deliveryPartnerId": { $in: ids },
      "dispatch.status": { $in: ["accepted", "assigned"] },
      returnStatus: { $in: ACTIVE_RETURN_STATUSES_FOR_BUSY_CHECK },
    })
      .select("dispatch.deliveryPartnerId")
      .lean(),
  ]);

  const dbBusy = [
    ...busyOnOrders.map((o) => String(o.dispatch?.deliveryPartnerId || "")),
    ...busyOnReturns.map((r) => String(r.dispatch?.deliveryPartnerId || "")),
  ].filter(Boolean);

  // Also exclude drivers holding a Redis busy lock (fast, race-free — Phase 4).
  const { getRedisBusyDriverIds } = await import("./driverBusyLock.service.js");
  const redisBusy = await getRedisBusyDriverIds(partnerIds);

  return new Set([...dbBusy, ...redisBusy]);
}

export async function filterEligiblePartners(partners) {
  if (!partners.length) return [];
  const busyPartnerIds = await getBusyPartnerIds(partners.map((p) => p.partnerId));
  const freePartners = partners.filter((p) => !busyPartnerIds.has(String(p.partnerId)));
  if (!freePartners.length) return [];

  const partnerIds = freePartners.map(p => p.partnerId);
  const today = dayjs().tz("Asia/Kolkata").format("YYYY-MM-DD");
  
  const [activePasses, activeSubs] = await Promise.all([
    FoodDailyPass.find({
      userId: { $in: partnerIds },
      userType: "DELIVERY_PARTNER",
      date: today,
      expiresAt: { $gt: new Date() }
    }).select("userId").lean(),
    UserSubscription.find({
      deliveryBoyId: { $in: partnerIds },
      status: { $in: ["active", "grace"] }
    }).select("deliveryBoyId").lean()
  ]);

  const subEligibleIds = new Set([
    ...activePasses.map(p => p.userId.toString()),
    ...activeSubs.map(s => s.deliveryBoyId.toString())
  ]);

  // Use a bypassed subscription list if needed, or strictly use subEligibleIds.
  // For now, we apply both subscription eligibility AND cash limit eligibility.
  const fullyEligiblePartners = [];

  for (const p of freePartners) {
    const isSubEligible = subEligibleIds.has(p.partnerId.toString());
    
    // Check cash limit
    try {
      // Use the SAME wallet calculation as the frontend UI (getDeliveryPartnerWalletEnhanced)
      // The old getDeliveryPartnerWallet only counted payment.status:'paid' COD orders
      // which caused cashInHand to appear as ₹0 even when rider had thousands in hand.
      const wallet = await getDeliveryPartnerWalletEnhanced(p.partnerId);
      // Block if: (1) admin set limit to 0 OR (2) delivery boy has exhausted their limit
      const cashLimitHit = wallet.totalCashLimit === 0 || wallet.availableCashLimit <= 0;
      if (cashLimitHit) {
        // If they exceeded limit, turn them offline immediately
        Driver.updateOne(
          { _id: p.partnerId, availabilityStatus: 'online' },
          { $set: { availabilityStatus: 'offline' } }
        ).exec().catch(err => logger.error(`Auto-offline save failed: ${err.message}`));
        
        const io = getIO();
        if (io) {
          io.to(rooms.delivery(p.partnerId)).emit('forced_offline', { reason: 'CASH_LIMIT_EXCEEDED' });
        }
        continue; // Skip this partner
      }

      // Shared pocket-wallet floor — skip offers only, do not force offline
      if (wallet.canReceiveOrders === false) {
        continue;
      }
      
      // If cash limit is fine, check subscription (or if bypassed, always push)
      if (isSubEligible) {
        fullyEligiblePartners.push(p);
      } else {
        // Optionally bypass sub check if that was the intent elsewhere: fullyEligiblePartners.push(p);
        fullyEligiblePartners.push(p); // Bypassing subscription here as well since it was bypassed in accept.
      }
    } catch (err) {
      logger.error(`Failed to check wallet for partner ${p.partnerId}: ${err.message}`);
    }
  }

  return fullyEligiblePartners;
}

/**
 * Proactive cash-limit enforcement sweep.
 * Scans ALL currently-online delivery partners and forces offline any whose
 * availableCashLimit has reached ₹0 (or totalCashLimit === 0 meaning admin-blocked).
 * Emits `forced_offline` socket event to each affected rider.
 * Safe to call on every dispatch cycle or resend — lightweight query, skips if all OK.
 */
export async function enforceCashLimitForAllOnlinePartners() {
  try {
    const onlinePartners = await Driver.find({
      availabilityStatus: "online",
      status: "approved",
    }).select("_id name").lean();

    if (!onlinePartners.length) return { checkedCount: 0, offlinedCount: 0 };

    let offlinedCount = 0;
    const io = getIO();

    for (const partner of onlinePartners) {
      try {
        const wallet = await getDeliveryPartnerWalletEnhanced(partner._id);
        const cashLimitHit = wallet.totalCashLimit === 0 || wallet.availableCashLimit <= 0;
        if (!cashLimitHit) continue;

        // Force offline in DB
        await Driver.updateOne(
          { _id: partner._id, availabilityStatus: "online" },
          { $set: { availabilityStatus: "offline" } }
        );

        // Notify rider's app via socket
        if (io) {
          io.to(rooms.delivery(partner._id)).emit("forced_offline", {
            reason: "CASH_LIMIT_EXCEEDED",
          });
        }

        offlinedCount++;
        logger.info(
          `[CashLimit] 🔴 Forced offline: ${partner.name} (${partner._id}) | cashInHand=₹${wallet.cashInHand}, limit=₹${wallet.totalCashLimit}, available=₹${wallet.availableCashLimit}`
        );
      } catch (err) {
        logger.error(`[CashLimit] Wallet check failed for ${partner._id}: ${err.message}`);
      }
    }

    if (offlinedCount > 0) {
      logger.warn(`[CashLimit] Sweep complete: ${offlinedCount}/${onlinePartners.length} riders forced offline due to cash limit breach.`);
    }

    return { checkedCount: onlinePartners.length, offlinedCount };
  } catch (err) {
    logger.error(`[CashLimit] enforceCashLimitForAllOnlinePartners failed: ${err.message}`);
    return { checkedCount: 0, offlinedCount: 0 };
  }
}

export async function listNearbyOnlineDeliveryPartners(
  sourceId,
  { maxKm = 15, limit = 25, sourceType = "food", auditLabel = "" } = {},
) {
  if (!sourceId) {
    const fallback = await listAllOnlinePartnersFallback({ limit, sourceType });
    if (auditLabel) {
      await auditPartnerElimination(fallback.partners, { label: auditLabel, maxKm });
    }
    return fallback;
  }
  const sId = (sourceId?._id || sourceId).toString();

  let source = null;
  if (sourceType === "quick") {
    source = await Seller.findById(sId).lean();
  } else {
    source = await FoodRestaurant.findById(sId).lean();
  }

  if (!source?.location?.coordinates?.length) {
    const fallbackLat = Number(source?.location?.latitude);
    const fallbackLng = Number(source?.location?.longitude);
    if (Number.isFinite(fallbackLat) && Number.isFinite(fallbackLng)) {
      source = {
        ...source,
        location: {
          ...(source.location || {}),
          coordinates: [fallbackLng, fallbackLat],
        },
      };
    }
  }

  if (!source?.location?.coordinates?.length) {
    const fallback = await listAllOnlinePartnersFallback({ limit, sourceType });
    if (auditLabel) {
      await auditPartnerElimination(fallback.partners, { label: auditLabel, maxKm });
    }
    return { ...fallback, source };
  }

  const [rLng, rLat] = source.location.coordinates;
  const workModule = workModuleForSourceType(sourceType);
  const allOnline = await Driver.find(onlineDriversForModuleQuery(workModule))
    .select("_id status lastLat lastLng lastLocationAt name activeWorkModule")
    .lean();

  const scored = [];
  const allowedStatuses =
    process.env.NODE_ENV === "production"
      ? ["approved"]
      : ["approved", "pending"];
  const STALE_GPS_MS = 10 * 60 * 1000;

  for (const p of allOnline) {
    if (!allowedStatuses.includes(p.status)) continue;

    const isStale =
      !p.lastLocationAt ||
      Date.now() - new Date(p.lastLocationAt).getTime() > STALE_GPS_MS;
    if (p.lastLat == null || p.lastLng == null || isStale) {
      scored.push({ partnerId: p._id, distanceKm: 999, status: p.status });
      continue;
    }

    const d = haversineKm(rLat, rLng, p.lastLat, p.lastLng);
    if (Number.isFinite(d) && d <= maxKm) {
      scored.push({ partnerId: p._id, distanceKm: d, status: p.status });
    }
  }

  scored.sort((a, b) => a.distanceKm - b.distanceKm);
  const picked = scored.slice(0, Math.max(1, limit));

  if (picked.length === 0) {
    const anyOnline = await Driver.find({
      status: { $in: allowedStatuses },
      ...onlineDriversForModuleQuery(workModule),
    })
      .select("_id status name")
      .limit(Math.max(1, limit))
      .lean();

    const fallbackPartners = anyOnline.map((p) => ({
      partnerId: p._id,
      distanceKm: null,
      status: p.status,
    }));

    const eligibleFallback = await filterEligiblePartners(fallbackPartners);
    return {
      source,
      partners: eligibleFallback,
    };
  }

  const final =
    config.env === "production"
      ? picked.filter((p) => p.status === "approved")
      : picked;

  const eligible = await filterEligiblePartners(final);
  if (auditLabel) {
    await auditPartnerElimination(eligible, {
      label: auditLabel,
      maxKm,
      origin: { lat: rLat, lng: rLng },
    });
  }
  return { source, partners: eligible };
}

export async function listNearbyOnlineDeliveryPartnersByCoords(
  coords,
  { maxKm = 15, limit = 25, auditLabel = "" } = {},
) {
  const lat = Number(coords?.lat);
  const lng = Number(coords?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return listNearbyOnlineDeliveryPartners(null, { maxKm, limit, sourceType: "quick", auditLabel });
  }

  const pseudoSource = {
    location: { coordinates: [lng, lat], latitude: lat, longitude: lng },
  };

  const allOnline = await Driver.find(onlineDriversForModuleQuery("quick-commerce"))
    .select("_id status lastLat lastLng lastLocationAt name activeWorkModule")
    .lean();

  const scored = [];
  const allowedStatuses =
    process.env.NODE_ENV === "production" ? ["approved"] : ["approved", "pending"];
  const STALE_GPS_MS = 10 * 60 * 1000;

  for (const p of allOnline) {
    if (!allowedStatuses.includes(p.status)) continue;
    const isStale =
      !p.lastLocationAt ||
      Date.now() - new Date(p.lastLocationAt).getTime() > STALE_GPS_MS;
    if (p.lastLat == null || p.lastLng == null || isStale) {
      scored.push({ partnerId: p._id, distanceKm: 999, status: p.status });
      continue;
    }
    const d = haversineKm(lat, lng, p.lastLat, p.lastLng);
    if (Number.isFinite(d) && d <= maxKm) {
      scored.push({ partnerId: p._id, distanceKm: d, status: p.status });
    }
  }

  scored.sort((a, b) => a.distanceKm - b.distanceKm);
  const picked = scored.slice(0, Math.max(1, limit));
  const final =
    config.env === "production" ? picked.filter((p) => p.status === "approved") : picked;
  const eligible = await filterEligiblePartners(final.length ? final : picked);
  if (auditLabel) {
    await auditPartnerElimination(eligible, { label: auditLabel, maxKm, origin: { lat, lng } });
  }
  return { source: pseudoSource, partners: eligible };
}

/**
 * Hyperlocal ring escalation for delivery dispatch: start tight (2km) and widen every
 * RING_RETRY_DELAY_MS if nobody in the current ring accepts. Growth continues past the
 * last tier (reusing the final 60km value) so an order is never abandoned outright.
 */
const RADIUS_TIERS_KM = [2, 4, 6, 10, 15, 20, 30, 45, 60];
const RING_RETRY_DELAY_MS = 20000;
/** Fires the admin "unassigned crisis" alert once retries have run this many rings
 * (attempt 8 at 20s/ring is ~2.5 minutes — "a few minutes" without being trigger-happy). */
const ADMIN_ALERT_ATTEMPT_THRESHOLD = 8;

const buildDispatchJobPayload = (documentType, documentMongoId, attempt) => ({
  action: "DISPATCH_TIMEOUT_CHECK",
  documentType,
  orderMongoId: documentMongoId,
  orderId: documentMongoId,
  attempt,
});

/** Mongo match: rider has not accepted yet (null is stored explicitly on SellerReturn). */
const dispatchNotAcceptedClause = {
  $or: [{ "dispatch.acceptedAt": { $exists: false } }, { "dispatch.acceptedAt": null }],
};

const dispatchRetryableStatusClause = {
  $or: [
    { "dispatch.status": "unassigned" },
    {
      "dispatch.status": "assigned",
      ...dispatchNotAcceptedClause,
    },
  ],
};

const listAllOnlinePartnersFallback = async ({ limit = 25, sourceType = "food" } = {}) => {
  const allowedStatuses =
    process.env.NODE_ENV === "production" ? ["approved"] : ["approved", "pending"];
  const workModule = workModuleForSourceType(sourceType);
  const partners = await Driver.find({
    status: { $in: allowedStatuses },
    ...onlineDriversForModuleQuery(workModule),
  })
    .select("_id status name lastLat lastLng lastLocationAt")
    .limit(Math.max(1, limit))
    .lean();

  const rawPartners = partners.map((p) => ({ partnerId: p._id, distanceKm: null, status: p.status }));
  const eligiblePartners = await filterEligiblePartners(rawPartners);
  logger.info(
    `[Dispatch] Online fallback pool: ${rawPartners.length} online → ${eligiblePartners.length} eligible after filters`,
  );
  return { source: null, partners: eligiblePartners };
};

const auditPartnerElimination = async (partners, { label = "dispatch", maxKm = 15, origin = null } = {}) => {
  if (!partners?.length) {
    logger.warn(`[DispatchAudit:${label}] No online delivery partners in database`);
    return;
  }

  const allowedStatuses =
    process.env.NODE_ENV === "production" ? ["approved"] : ["approved", "pending"];
  const STALE_GPS_MS = 10 * 60 * 1000;
  const eligibleIds = new Set((partners || []).map((p) => String(p.partnerId)));

  const allOnline = await Driver.find({
    availabilityStatus: "online",
    authorizedServices: { $in: ["food", "quick-commerce"] },
    activeWorkModule: { $in: ["food", "quick-commerce"] },
  })
    .select("_id status name lastLat lastLng lastLocationAt availabilityStatus activeWorkModule")
    .lean();

  logger.info(
    `[DispatchAudit:${label}] Auditing ${allOnline.length} online partner(s); eligible shortlist=${eligibleIds.size}; maxKm=${maxKm}`,
  );

  for (const p of allOnline) {
    const partnerId = String(p._id);
    const row = {
      partnerId,
      name: p.name || "",
      online: p.availabilityStatus === "online",
      accountStatus: p.status,
      lastLat: p.lastLat,
      lastLng: p.lastLng,
      lastLocationAt: p.lastLocationAt,
      finalEligible: eligibleIds.has(partnerId),
    };

    let reason = null;
    if (!allowedStatuses.includes(p.status)) {
      reason = `accountStatus=${p.status}`;
    } else if (p.lastLat == null || p.lastLng == null) {
      reason = "missing_gps";
    } else if (!p.lastLocationAt || Date.now() - new Date(p.lastLocationAt).getTime() > STALE_GPS_MS) {
      reason = "stale_gps";
    } else if (origin?.lat != null && origin?.lng != null) {
      const d = haversineKm(origin.lat, origin.lng, p.lastLat, p.lastLng);
      row.distanceKm = Number.isFinite(d) ? Number(d.toFixed(2)) : null;
      row.radiusKm = maxKm;
      if (!Number.isFinite(d) || d > maxKm) {
        reason = `distance=${row.distanceKm ?? "n/a"}km > ${maxKm}km`;
      }
    }

    if (!reason && !row.finalEligible) {
      reason = "filtered_by_cash_limit_or_wallet";
    }

    if (reason) {
      row.finalEligible = false;
      logger.warn(`[DispatchAudit:${label}] Rider ${partnerId} REJECTED: ${reason}`, row);
    } else {
      logger.info(`[DispatchAudit:${label}] Rider ${partnerId} ELIGIBLE`, row);
    }
  }
};

const ACTIVE_OFFER_ACTIONS = new Set(["offered", "assigned"]);

const getActiveOfferedPartnerIds = (offeredTo = []) =>
  (Array.isArray(offeredTo) ? offeredTo : [])
    .filter((entry) => ACTIVE_OFFER_ACTIONS.has(String(entry?.action || "offered")))
    .map((entry) => String(entry?.partnerId || ""))
    .filter(Boolean);

const loadOnlinePartnersByIds = async (partnerIds = []) => {
  const uniqueIds = [...new Set(partnerIds.map((id) => String(id)).filter(Boolean))];
  if (!uniqueIds.length) return [];

  const allowedStatuses =
    process.env.NODE_ENV === "production" ? ["approved"] : ["approved", "pending"];
  const rows = await Driver.find({
    _id: { $in: uniqueIds },
    availabilityStatus: "online",
    status: { $in: allowedStatuses },
  })
    .select("_id status name lastLat lastLng lastLocationAt availabilityStatus")
    .lean();

  const raw = rows.map((p) => ({ partnerId: p._id, distanceKm: null, status: p.status }));
  return filterEligiblePartners(raw);
};

const emitDispatchOffer = (io, roomName, payload, soundMeta = {}) => {
  if (!io || !roomName) return;
  logDispatchRoomEmit(io, roomName, payload, "new_order,new_order_available");
  io.to(roomName).emit("new_order", payload);
  io.to(roomName).emit("new_order_available", payload);
  io.to(roomName).emit("play_notification_sound", {
    orderId: soundMeta.orderId || payload.orderId,
    orderMongoId: soundMeta.orderMongoId || payload.orderMongoId,
    documentType: payload.documentType,
    tripType: payload.tripType,
    returnId: payload.returnId,
  });
};

const logDispatchRoomEmit = (io, roomName, payload, eventName) => {
  const partnerId = String(roomName).replace(/^delivery:/, "");
  const roomSize = io?.sockets?.adapter?.rooms?.get(roomName)?.size ?? 0;
  logger.info(
    `[DispatchSocket] emit partnerId=${partnerId} room=${roomName} roomSize=${roomSize} event=${eventName} documentType=${payload?.documentType} tripType=${payload?.tripType} orderId=${payload?.orderId || payload?.orderMongoId}`,
  );
};

export const renotifyExistingReturnPickupOffers = async (returnDoc, { context = null } = {}) => {
  const activeIds = getActiveOfferedPartnerIds(returnDoc?.dispatch?.offeredTo);
  if (!activeIds.length) {
    logger.warn(
      `[ReturnDispatch] renotifyExistingReturnPickupOffers: no active offers on return ${returnDoc?._id}`,
    );
    return { notifiedCount: 0, socketEmitCount: 0, partnerPoolCount: 0, partnerIds: [] };
  }

  const partners = await loadOnlinePartnersByIds(activeIds);
  if (!partners.length) {
    logger.warn(
      `[ReturnDispatch] renotifyExistingReturnPickupOffers: ${activeIds.length} active offer(s) but 0 online eligible partners`,
    );
    return { notifiedCount: 0, socketEmitCount: 0, partnerPoolCount: 0, partnerIds: activeIds };
  }

  const ctx = context || (await loadReturnPickupContext(returnDoc));
  const payload = await buildReturnDeliverySocketPayload(returnDoc, ctx);
  const io = getIO();
  let socketEmitCount = 0;

  for (const p of partners) {
    const roomName = rooms.delivery(p.partnerId);
    if (io) {
      emitDispatchOffer(io, roomName, { ...payload, pickupDistanceKm: p.distanceKm });
      socketEmitCount += 1;
    }
  }

  logger.info(
    `[ReturnDispatch] renotifyExistingReturnPickupOffers returnId=${returnDoc?._id} activeOffers=${activeIds.length} partnerPool=${partners.length} socketEmitCount=${socketEmitCount}`,
  );

  return {
    notifiedCount: partners.length,
    socketEmitCount,
    partnerPoolCount: partners.length,
    renotifiedCount: partners.length,
    partnerIds: partners.map((p) => String(p.partnerId)),
  };
};

async function runDispatchHunt({
  documentType,
  documentMongoId,
  attempt,
  offeredIds,
  buildPayload,
  resolvePartners,
  persistOffers,
  alertLabel,
}) {
  void enforceCashLimitForAllOnlinePartners().catch((err) =>
    logger.warn(`[Dispatch] Pre-dispatch cash-limit sweep failed: ${err.message}`),
  );

  // Hyperlocal ring escalation: broadcast to every eligible rider within the ring
  // simultaneously (first to accept wins — see the atomic claim in acceptDeliveryOrder),
  // then widen the ring every RETRY_DELAY_MS if nobody has accepted yet. Growth continues
  // past the last defined tier (reusing 60km) rather than giving up.
  const maxKm = RADIUS_TIERS_KM[Math.min(attempt - 1, RADIUS_TIERS_KM.length - 1)];

  const isPhase3 = attempt >= ADMIN_ALERT_ATTEMPT_THRESHOLD;
  let { partners, source } = await resolvePartners(maxKm);
  const geoPartnerPoolCount = partners?.length || 0;

  if (!partners?.length && offeredIds.length) {
    partners = await loadOnlinePartnersByIds(offeredIds);
    logger.info(
      `[DispatchHunt] ${documentType} ${documentMongoId} geoPool=0 — hydrated ${partners.length} partner(s) from ${offeredIds.length} prior active offer(s)`,
    );
  }

  logger.info(
    `[DispatchHunt] ${documentType} ${documentMongoId} attempt=${attempt} geoPartnerPool=${geoPartnerPoolCount} partnerPool=${partners?.length || 0} maxKm=${maxKm} priorOfferedIds=${offeredIds.length}`,
  );

  if (isPhase3) {
    logger.error(
      `[CRITICAL] ${alertLabel} ${documentMongoId} unassigned for ${attempt} attempts. Triggering Admin Alert.`,
    );
    try {
      await notifyOwnersSafely([{ ownerType: "ADMIN", ownerId: "GLOBAL" }], {
        title: "Unassigned dispatch crisis!",
        body: `${alertLabel} ${documentMongoId} has not been assigned. Manual intervention required.`,
        data: { type: "admin_alert_unassigned", documentType, documentMongoId },
      });
    } catch (err) {
      logger.warn(`Admin notification failed: ${err.message}`);
    }
  }

  const eligible = partners.filter((p) => !offeredIds.includes(p.partnerId.toString()));
  const io = getIO();
  const payload = await buildPayload(source);
  let socketEmitCount = 0;

  if (!eligible.length) {
    logger.info(
      `tryAutoAssign: No NEW eligible partners in ${maxKm}km for ${documentType} ${documentMongoId}.`,
    );

    const newOffers = partners.filter((p) => !offeredIds.includes(p.partnerId.toString()));
    const notifyTargets = newOffers.length ? newOffers : partners;

    if (io && notifyTargets.length > 0) {
      for (const p of notifyTargets) {
        emitDispatchOffer(io, rooms.delivery(p.partnerId), {
          ...payload,
          pickupDistanceKm: p.distanceKm,
        });
        socketEmitCount += 1;
      }
    }

    if (newOffers.length > 0) {
      const offeredToEntries = newOffers.map((p) => ({
        partnerId: p.partnerId,
        at: new Date(),
        action: "offered",
      }));
      await persistOffers(offeredToEntries);
    }

    const retryJob = await addOrderJob(buildDispatchJobPayload(documentType, documentMongoId, attempt + 1), {
      delay: RING_RETRY_DELAY_MS,
    });
    if (!retryJob) {
      logger.warn(
        `[Dispatch] BullMQ unavailable — DISPATCH_TIMEOUT_CHECK not scheduled for ${documentType} ${documentMongoId}. Configure Redis/BullMQ worker for automatic retries.`,
      );
    }

    const dispatchAudit = {
      reason:
        partners.length === 0
          ? "no_online_riders"
          : newOffers.length === 0
            ? "all_nearby_riders_already_offered"
            : "reoffered_existing_pool",
      eligibleCount: 0,
      partnerPoolCount: partners.length,
      geoPartnerPoolCount,
      notifiedCount: notifyTargets.length,
      renotifiedCount: newOffers.length === 0 ? notifyTargets.length : 0,
      persistedOfferCount: newOffers.length,
      socketEmitCount,
      maxKm,
      attempt,
      bullmqRetryScheduled: Boolean(retryJob),
    };

    logger.info(
      `[DispatchHunt:summary] ${documentType} ${documentMongoId} eligiblePartners=0 partnerPool=${partners.length} persistedOffers=${newOffers.length} socketEmitCount=${socketEmitCount} notifiedCount=${notifyTargets.length} reason=${dispatchAudit.reason}`,
    );

    return { notifiedCount: notifyTargets.length, payload, dispatchAudit };
  }

  // Broadcast to every eligible rider in this ring at once — first to tap "accept" wins
  // (enforced atomically in acceptDeliveryOrder); everyone else gets `order_claimed` /
  // `order_reassigned_elsewhere` once that happens.
  const ringTimeoutSeconds = Math.round(RING_RETRY_DELAY_MS / 1000);

  // Ring envelope shared by the socket payload + FCM data so the driver app rings on a new
  // offer (native full-screen when backgrounded). Individual driver offers are NOT
  // ackRequired — re-dispatch is owned by the DISPATCH_TIMEOUT_CHECK retry below, and the
  // acceptance race is resolved atomically in acceptOrderDelivery (others get order_claimed).
  const offerEventId = newEventId();
  const offerExpiresAt = new Date(Date.now() + ringTimeoutSeconds * 1000).toISOString();
  payload.event_id = offerEventId;
  payload.type = "NEW_ORDER";
  payload.ring = true;
  payload.expires_at = offerExpiresAt;

  for (const p of eligible) {
    emitDispatchOffer(io, rooms.delivery(p.partnerId), {
      ...payload,
      pickupDistanceKm: p.distanceKm,
    });
    socketEmitCount += 1;
  }
  try {
    await notifyOwnersSafely(
      eligible.map((p) => ({ ownerType: "DELIVERY_PARTNER", ownerId: p.partnerId })),
      {
        title: payload.tripType === "return_pickup" ? "New return pickup nearby!" : "New order nearby!",
        body: `Tap to accept ${alertLabel} ${payload.orderId || documentMongoId} — first to accept gets it (~${ringTimeoutSeconds}s).`,
        data: {
          type: "new_order",
          event_id: offerEventId,
          event_type: "NEW_ORDER",
          ring: "true",
          expires_at: offerExpiresAt,
          documentType,
          orderId: documentMongoId,
          tripType: payload.tripType || "forward",
        },
      },
    );
  } catch (err) {
    logger.warn(`Push notification broadcast failed for ${documentType} ${documentMongoId}: ${err.message}`);
  }

  // Durably record the offer per driver for /sync replay + client dedup (ring, no ack).
  try {
    await Promise.all(
      eligible.map((p) =>
        recordOrderEventForTarget({
          type: "NEW_ORDER",
          orderId: payload.orderId || documentMongoId,
          orderMongoId: documentType === "food_order" ? documentMongoId : null,
          target: { ownerType: "DELIVERY_PARTNER", ownerId: p.partnerId },
          ring: true,
          expiresInSec: ringTimeoutSeconds,
          eventId: offerEventId,
          payload: { tripType: payload.tripType || "forward", documentType },
        }),
      ),
    );
  } catch (err) {
    logger.warn(`recordOrderEvent (driver offer) failed: ${err.message}`);
  }

  const offeredToEntries = eligible.map((p) => ({
    partnerId: p.partnerId,
    at: new Date(),
    action: "offered",
  }));
  await persistOffers(offeredToEntries);

  const retryJob = await addOrderJob(buildDispatchJobPayload(documentType, documentMongoId, attempt + 1), {
    delay: RING_RETRY_DELAY_MS,
  });
  if (!retryJob) {
    logger.warn(
      `[Dispatch] BullMQ unavailable — DISPATCH_TIMEOUT_CHECK not scheduled for ${documentType} ${documentMongoId}. Configure Redis/BullMQ worker for automatic retries.`,
    );
  }

  const dispatchAudit = {
    reason: "offers_persisted",
    eligibleCount: eligible.length,
    partnerPoolCount: partners.length,
    geoPartnerPoolCount,
    notifiedCount: eligible.length,
    persistedOfferCount: eligible.length,
    socketEmitCount,
    maxKm,
    attempt,
    bullmqRetryScheduled: Boolean(retryJob),
  };

  logger.info(
    `[DispatchHunt:summary] ${documentType} ${documentMongoId} eligiblePartners=${eligible.length} partnerPool=${partners.length} persistedOffers=${eligible.length} socketEmitCount=${socketEmitCount} notifiedCount=${dispatchAudit.notifiedCount} reason=${dispatchAudit.reason}`,
  );

  return { notifiedCount: dispatchAudit.notifiedCount, payload, dispatchAudit };
}

async function tryAutoAssignForwardOrder(orderId, options = {}) {
  const attempt = options.attempt || 1;
  const lockTimeout = 55000;

  const order = await FoodOrder.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(orderId),
      $or: [
        { "dispatch.status": "unassigned" },
        {
          "dispatch.status": "assigned",
          "dispatch.acceptedAt": { $exists: false },
          "dispatch.assignedAt": { $lt: new Date(Date.now() - lockTimeout) },
        },
      ],
      "dispatch.dispatchingAt": { $exists: false },
    },
    { $set: { "dispatch.dispatchingAt": new Date() } },
    { new: true },
  ).populate(["restaurantId", "userId"]);

  if (!order) {
    logger.info(`tryAutoAssign forward: Skip for ${orderId}`);
    return null;
  }

  // Delivery partners must only be offered AFTER restaurant acceptance.
  const orderStatus = String(order.orderStatus || "").toLowerCase();
  const restaurantAcceptedStatuses = new Set([
    "confirmed",
    "preparing",
    "ready_for_pickup",
  ]);
  if (!restaurantAcceptedStatuses.has(orderStatus)) {
    logger.info(
      `tryAutoAssign forward: Skip pre-accept status "${orderStatus}" for ${orderId}`,
    );
    return null;
  }

  try {
    const offeredIds = (order.dispatch?.offeredTo || []).map((o) => o.partnerId.toString());
    const isQuickOrder = order.orderType === "quick";
    const quickSellerId =
      options.quickSellerId ||
      order.items?.find((item) => item?.type === "quick" && item?.sourceId)?.sourceId ||
      order.pickupPoints?.find((point) => point?.pickupType === "quick" && point?.sourceId)?.sourceId;
    const dispatchSourceId = isQuickOrder ? quickSellerId : order.restaurantId;

    const result = await runDispatchHunt({
      documentType: DISPATCH_DOCUMENT_TYPES.FORWARD_ORDER,
      documentMongoId: order._id.toString(),
      attempt,
      offeredIds,
      alertLabel: "Order",
      buildPayload: async (source) => buildDeliverySocketPayload(order, source),
      resolvePartners: (maxKm) =>
        listNearbyOnlineDeliveryPartners(dispatchSourceId, {
          maxKm,
          limit: 15,
          sourceType: isQuickOrder ? "quick" : "food",
        }),
      persistOffers: async (offeredToEntries) => {
        order.dispatch.status = "unassigned";
        order.dispatch.deliveryPartnerId = null;
        order.dispatch.offeredTo.push(...offeredToEntries);
        await order.save();
      },
    });

    return { ...order.toObject(), notifiedCount: result.notifiedCount };
  } finally {
    await FoodOrder.findByIdAndUpdate(orderId, { $unset: { "dispatch.dispatchingAt": "" } });
  }
}

async function tryAutoAssignSellerReturn(returnId, options = {}) {
  const attempt = options.attempt || 1;
  const lockTimeout = 55000;
  const returnObjectId = new mongoose.Types.ObjectId(returnId);

  const returnDoc = await SellerReturn.findOneAndUpdate(
    {
      _id: returnObjectId,
      returnStatus: { $in: ["return_approved", "return_pickup_assigned"] },
      ...dispatchRetryableStatusClause,
      "dispatch.dispatchingAt": { $exists: false },
    },
    { $set: { "dispatch.dispatchingAt": new Date() } },
    { new: true },
  );

  if (!returnDoc) {
    const staleLockCleared = await SellerReturn.findOneAndUpdate(
      {
        _id: returnObjectId,
        returnStatus: { $in: ["return_approved", "return_pickup_assigned"] },
        "dispatch.dispatchingAt": { $lt: new Date(Date.now() - lockTimeout) },
      },
      { $unset: { "dispatch.dispatchingAt": "" } },
      { new: true },
    );

    if (staleLockCleared && !options._retriedStaleLock) {
      logger.warn(`tryAutoAssign seller_return: Released stale dispatch lock for ${returnId}`);
      return tryAutoAssignSellerReturn(returnId, { ...options, _retriedStaleLock: true });
    }

    logger.warn(`tryAutoAssign seller_return: Skip for ${returnId} (lock active or dispatch not retryable)`);
    const snapshot = await SellerReturn.findById(returnObjectId)
      .select("returnStatus dispatch")
      .lean();
    if (snapshot) {
      logger.warn(`[DispatchAudit:seller_return_skip] returnStatus=${snapshot.returnStatus} dispatchStatus=${snapshot.dispatch?.status} acceptedAt=${snapshot.dispatch?.acceptedAt} dispatchingAt=${snapshot.dispatch?.dispatchingAt} offeredTo=${snapshot.dispatch?.offeredTo?.length || 0}`);
    }
    return null;
  }

  try {
    const context = await loadReturnPickupContext(returnDoc);
    returnDoc.riderEarning = context.riderEarning;
    if (returnDoc.returnStatus === "return_approved") {
      returnDoc.returnStatus = "return_pickup_assigned";
    }
    await returnDoc.save();

    const offeredIds = getActiveOfferedPartnerIds(returnDoc.dispatch?.offeredTo);

    const result = await runDispatchHunt({
      documentType: DISPATCH_DOCUMENT_TYPES.SELLER_RETURN,
      documentMongoId: returnDoc._id.toString(),
      attempt,
      offeredIds,
      alertLabel: "Return pickup",
      buildPayload: async () => buildReturnDeliverySocketPayload(returnDoc, context),
      resolvePartners: (maxKm) => {
        const auditLabel = `seller_return:${returnDoc._id}`;
        if (context.customerCoords) {
          return listNearbyOnlineDeliveryPartnersByCoords(context.customerCoords, {
            maxKm,
            limit: 15,
            auditLabel,
          });
        }
        return listNearbyOnlineDeliveryPartners(returnDoc.sellerId, {
          maxKm,
          limit: 15,
          sourceType: "quick",
          auditLabel,
        });
      },
      persistOffers: async (offeredToEntries) => {
        const fresh = await SellerReturn.findById(returnDoc._id);
        if (!fresh) return;
        if (!Array.isArray(fresh.dispatch?.offeredTo)) {
          fresh.dispatch.offeredTo = [];
        }
        if (offeredToEntries.length > 0) {
          fresh.dispatch.status = "assigned";
          fresh.dispatch.assignedAt = fresh.dispatch.assignedAt || new Date();
        }
        fresh.dispatch.offeredTo.push(...offeredToEntries);
        fresh.markModified("dispatch");
        await fresh.save();
        logger.info(
          `[ReturnDispatch] persistOffers returnId=${fresh._id} status=${fresh.dispatch.status} offeredTo=${fresh.dispatch.offeredTo.length} newOffers=${offeredToEntries.length}`,
        );
      },
    });

    const onlineCount = await Driver.countDocuments({
      availabilityStatus: "online",
      status: {
        $in: process.env.NODE_ENV === "production" ? ["approved"] : ["approved", "pending"],
      },
    });

    const dispatchAudit = {
      ...(result.dispatchAudit || {}),
      onlineCount,
      filteredCount: result.dispatchAudit?.partnerPoolCount ?? 0,
    };

    const freshAfterHunt = await SellerReturn.findById(returnDoc._id).select("dispatch.offeredTo").lean();
    const offeredToAfter = Array.isArray(freshAfterHunt?.dispatch?.offeredTo)
      ? freshAfterHunt.dispatch.offeredTo.length
      : 0;

    return {
      ...returnDoc.toObject(),
      notifiedCount: result.notifiedCount,
      dispatchAudit,
      offeredToCount: offeredToAfter,
    };
  } finally {
    await SellerReturn.findByIdAndUpdate(returnId, { $unset: { "dispatch.dispatchingAt": "" } });
  }
}

export async function getDispatchSettings() {
  return { dispatchMode: "auto" };
}

export async function updateDispatchSettings(dispatchMode, adminId) {
  // Always set to auto
  await FoodSettings.findOneAndUpdate(
    { key: "dispatch" },
    {
      $set: {
        dispatchMode: "auto",
        updatedBy: { role: "ADMIN", adminId, at: new Date() },
      },
    },
    { upsert: true, new: true },
  );
  return getDispatchSettings();
}

export async function tryAutoAssign(documentId, options = {}) {
  const documentType = options.documentType || DISPATCH_DOCUMENT_TYPES.FORWARD_ORDER;
  if (documentType === DISPATCH_DOCUMENT_TYPES.SELLER_RETURN) {
    return tryAutoAssignSellerReturn(documentId, options);
  }
  return tryAutoAssignForwardOrder(documentId, options);
}

export async function processDispatchTimeout(documentId, partnerId, jobData = {}) {
  const documentType = jobData.documentType || DISPATCH_DOCUMENT_TYPES.FORWARD_ORDER;

  if (documentType === DISPATCH_DOCUMENT_TYPES.SELLER_RETURN) {
    const returnDoc = await SellerReturn.findById(documentId);
    if (!returnDoc) return;

    const stillAssigned =
      returnDoc.dispatch?.status === "assigned" &&
      String(returnDoc.dispatch?.deliveryPartnerId) === String(partnerId) &&
      !returnDoc.dispatch?.acceptedAt;

    if (stillAssigned) {
      const offer = returnDoc.dispatch.offeredTo.find(
        (o) => String(o.partnerId) === String(partnerId) && o.action === "offered",
      );
      if (offer) offer.action = "timeout";
      returnDoc.dispatch.status = "unassigned";
      returnDoc.dispatch.deliveryPartnerId = null;
      await returnDoc.save();
    }

    if (["unassigned", "assigned"].includes(returnDoc.dispatch?.status)) {
      const attempt = (returnDoc.dispatch?.offeredTo?.length || 0) + 1;
      await tryAutoAssign(documentId, {
        documentType: DISPATCH_DOCUMENT_TYPES.SELLER_RETURN,
        attempt,
      });
    }
    return;
  }

  const order = await FoodOrder.findById(documentId);
  if (!order) return;

  const stillAssigned =
    order.dispatch?.status === "assigned" &&
    String(order.dispatch?.deliveryPartnerId) === String(partnerId) &&
    !order.dispatch?.acceptedAt;

  if (stillAssigned) {
    logger.info(
      `Dispatch timeout for partner ${partnerId} on order ${documentId}. Re-trying hunt...`,
    );
    const offer = order.dispatch.offeredTo.find(
      (o) => String(o.partnerId) === String(partnerId) && o.action === "offered",
    );
    if (offer) offer.action = "timeout";

    order.dispatch.status = "unassigned";
    order.dispatch.deliveryPartnerId = null;
    await order.save();

    const attempt = (order.dispatch?.offeredTo?.length || 0) + 1;
    await tryAutoAssign(documentId, { attempt });
  } else if (order.dispatch?.status === "unassigned") {
    const attempt = (order.dispatch?.offeredTo?.length || 0) + 1;
    await tryAutoAssign(documentId, { attempt });
  }
}

export async function resendDeliveryNotificationRestaurant(
  orderId,
  restaurantId,
) {
  const identity = buildOrderIdentityFilter(orderId);
  const order = await FoodOrder.findOne({
    ...identity,
    restaurantId: new mongoose.Types.ObjectId(restaurantId),
  });

  if (!order) throw new NotFoundError("Order not found");

  const activeStatuses = [
    "confirmed",
    "preparing",
    "ready_for_pickup",
    "ready",
  ];
  if (!activeStatuses.includes(order.orderStatus)) {
    throw new ValidationError(
      `Cannot resend notification for order in status: ${order.orderStatus}`,
    );
  }

  if (order.dispatch?.status === "accepted") {
    throw new ValidationError(
      "A delivery partner has already accepted this order.",
    );
  }

  order.dispatch.status = "unassigned";
  order.dispatch.deliveryPartnerId = null;
  order.dispatch.offeredTo = [];
  await order.save();

  // Proactively sweep all online riders — force offline anyone whose cash limit is ₹0
  // before we attempt to dispatch this order to them.
  void enforceCashLimitForAllOnlinePartners().catch(err =>
    logger.warn(`[Resend] Cash-limit sweep failed: ${err.message}`)
  );

  const res = await tryAutoAssign(order._id, { attempt: 3 });
  return {
    success: true,
    notifiedCount: res?.notifiedCount || 0,
  };
}
