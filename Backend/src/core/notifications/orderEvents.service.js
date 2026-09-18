/**
 * Order event envelope + dual-send.
 *
 * Standard envelope for every critical order event so clients can dedup and (in Phase 3)
 * detect gaps / replay via /sync:
 *   { event_id, seq, type, order_id, target, ring, expires_at, ...data }
 *   - event_id : UUID, client keeps a rolling set and drops duplicates
 *   - seq      : per-target monotonically increasing number (gap detection)
 *   - ring     : whether the client should start the alarm ring
 *   - expires_at: when the ring/offer auto-stops
 *
 * `emitOrderEvent` performs the dual-send: Socket.IO (instant while app is open) + FCM
 * data-only high-priority (delivery when backgrounded/killed). Both carry the same
 * envelope. This is the single helper new code should use; existing inline emit sites are
 * migrated onto it incrementally (full migration lands with the outbox in Phase 3).
 */

import crypto from 'crypto';
import { getIO, rooms } from '../../config/socket.js';
import { Counter } from '../models/counter.model.js';
import { sendNotificationToOwner } from './firebase.service.js';
import { FoodOrderEvent } from '../../modules/food/orders/models/orderEvent.model.js';
import { logger } from '../../utils/logger.js';

const ROOM_FOR = {
  USER: (id) => rooms.user(id),
  RESTAURANT: (id) => rooms.restaurant(id),
  DELIVERY_PARTNER: (id) => rooms.delivery(id),
  ADMIN: (id) => rooms.admin(id),
  SELLER: (id) => rooms.seller(id),
};

/** Fresh event id for enriching a payload without a full dual-send. */
export const newEventId = () => crypto.randomUUID();

/** Map an orderStatus value to a stable event type for the envelope. */
export const deriveEventType = (orderStatus) => {
  const s = String(orderStatus || '').toLowerCase();
  if (s === 'confirmed') return 'ORDER_ACCEPTED';
  if (s === 'preparing') return 'ORDER_PREPARING';
  if (s === 'ready_for_pickup' || s === 'ready') return 'ORDER_READY';
  if (s === 'picked_up') return 'ORDER_PICKED_UP';
  if (s === 'delivered') return 'ORDER_DELIVERED';
  if (s.includes('cancel')) return 'ORDER_CANCELLED';
  return 'ORDER_STATUS_UPDATE';
};

/** Per-target monotonic sequence, atomically via the existing Counter collection. */
export async function nextEventSeq(ownerType, ownerId) {
  try {
    const doc = await Counter.findOneAndUpdate(
      { model: `evtseq:${String(ownerType)}:${String(ownerId)}` },
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    ).lean();
    return doc?.seq ?? 0;
  } catch (e) {
    logger.warn(`nextEventSeq failed for ${ownerType}:${ownerId}: ${e?.message || e}`);
    return 0;
  }
}

/**
 * Build a standard envelope for a single target (allocates that target's seq).
 * @param {{type:string, orderId:any, target:{ownerType:string, ownerId:any}, ring?:boolean, expiresInSec?:number|null, eventId?:string, data?:object}} args
 */
export async function buildOrderEventEnvelope({
  type,
  orderId,
  target,
  ring = false,
  expiresInSec = null,
  eventId = null,
  data = {},
}) {
  const seq = await nextEventSeq(target.ownerType, target.ownerId);
  return {
    event_id: eventId || crypto.randomUUID(),
    seq,
    type,
    order_id: String(orderId ?? ''),
    target: `${target.ownerType}:${target.ownerId}`,
    ring: Boolean(ring),
    expires_at: expiresInSec ? new Date(Date.now() + expiresInSec * 1000).toISOString() : null,
    ...data,
  };
}

/**
 * Persist an event envelope to the durable per-target log (for /sync replay + outbox).
 * `published=true` means it was just dual-sent; `false` leaves it for a relay worker.
 */
export async function recordOrderEvent({ envelope, orderMongoId = null, published = true, ackRequired = false }) {
  try {
    const [ownerType, ownerId] = String(envelope?.target || '').split(':');
    if (!ownerType || !ownerId || !envelope?.event_id) return null;
    await FoodOrderEvent.create({
      eventId: envelope.event_id,
      type: envelope.type,
      orderId: envelope.order_id || '',
      orderMongoId: orderMongoId || undefined,
      ownerType: ownerType.toUpperCase(),
      ownerId: String(ownerId),
      seq: Number(envelope.seq) || 0,
      ring: Boolean(envelope.ring),
      expiresAt: envelope.expires_at ? new Date(envelope.expires_at) : null,
      payload: envelope,
      publishedAt: published ? new Date() : null,
      ackRequired: Boolean(ackRequired),
      nextEscalationAt: ackRequired ? new Date(Date.now() + 60_000) : null,
    });
  } catch (e) {
    logger.warn(`recordOrderEvent failed: ${e?.message || e}`);
  }
  return null;
}

/** Ack every ring event for an order (e.g. once it's accepted) so the watchdog stops. */
export async function ackOrderRingEvents(orderId) {
  if (!orderId) return;
  try {
    await FoodOrderEvent.updateMany(
      { orderId: String(orderId), ackRequired: true, ackedAt: null },
      { $set: { ackedAt: new Date(), nextEscalationAt: null } },
    );
  } catch (e) {
    logger.warn(`ackOrderRingEvents failed: ${e?.message || e}`);
  }
}

/**
 * Build + record an event envelope for one target without emitting it (used to keep /sync
 * complete at emit sites that still use their own bespoke socket/FCM code). Allocates the
 * target's next seq; pass `eventId` to share it with an already-emitted socket/FCM event.
 */
export async function recordOrderEventForTarget({
  type,
  orderId,
  orderMongoId = null,
  target,
  ring = false,
  expiresInSec = null,
  eventId = null,
  ackRequired = false,
  payload = {},
}) {
  const envelope = await buildOrderEventEnvelope({ type, orderId, target, ring, expiresInSec, eventId, data: payload });
  await recordOrderEvent({ envelope, orderMongoId, published: true, ackRequired });
  return envelope;
}

/** Scalar-only FCM data map (+ full envelope JSON in `payload`) so nested fields survive. */
const toFcmData = (envelope, extra = {}) => ({
  type: String(envelope.type),
  event_id: String(envelope.event_id),
  seq: String(envelope.seq),
  order_id: String(envelope.order_id),
  ring: String(envelope.ring),
  ...(envelope.expires_at ? { expires_at: String(envelope.expires_at) } : {}),
  payload: JSON.stringify(envelope),
  ...extra,
});

/**
 * Dual-send an order event to one target (Socket.IO + FCM).
 * @param {object} args
 * @param {string[]} [args.socketEventNames] socket event names to emit (default: [type]).
 *        Pass legacy names here to stay compatible with existing client listeners.
 * @param {false|{title?:string, body?:string, image?:string, notification?:boolean, data?:object}} [args.fcm]
 *        false disables FCM; otherwise data-only unless `notification:true`.
 */
const ESCALATION_STEP_MS = 60_000; // 60s → 120s → 180s watchdog steps

/** Insert an outbox row (publishedAt:null) for durable delivery + optional watchdog. */
async function recordOutbox({ envelope, orderMongoId = null, ackRequired = false }) {
  try {
    const [ownerType, ownerId] = String(envelope?.target || '').split(':');
    if (!ownerType || !ownerId || !envelope?.event_id) return null;
    return await FoodOrderEvent.create({
      eventId: envelope.event_id,
      type: envelope.type,
      orderId: envelope.order_id || '',
      orderMongoId: orderMongoId || undefined,
      ownerType: ownerType.toUpperCase(),
      ownerId: String(ownerId),
      seq: Number(envelope.seq) || 0,
      ring: Boolean(envelope.ring),
      expiresAt: envelope.expires_at ? new Date(envelope.expires_at) : null,
      payload: envelope,
      publishedAt: null,
      ackRequired: Boolean(ackRequired),
      nextEscalationAt: ackRequired ? new Date(Date.now() + ESCALATION_STEP_MS) : null,
    });
  } catch (e) {
    logger.warn(`recordOutbox failed: ${e?.message || e}`);
    return null;
  }
}

/** Deliver an envelope over Socket.IO + FCM. Reused by the outbox relay. */
export async function deliverEnvelope(envelope, { socketEventNames = [], fcm = null } = {}) {
  const [ownerType, ownerId] = String(envelope?.target || '').split(':');

  // Socket.IO — instant delivery while the app is open.
  try {
    const io = getIO();
    const roomFn = ROOM_FOR[String(ownerType || '').toUpperCase()];
    if (io && roomFn) {
      const room = roomFn(ownerId);
      const names = socketEventNames.length ? socketEventNames : [envelope.type];
      for (const name of names) io.to(room).emit(name, envelope);
    }
  } catch (e) {
    logger.warn(`deliverEnvelope socket failed: ${e?.message || e}`);
  }

  // FCM — delivery when backgrounded/killed. Data-only unless a visible push is asked for.
  if (fcm !== false) {
    try {
      await sendNotificationToOwner({
        ownerType,
        ownerId,
        payload: {
          dataOnly: !(fcm && fcm.notification),
          title: fcm?.title,
          body: fcm?.body,
          image: fcm?.image,
          data: toFcmData(envelope, fcm?.data || {}),
        },
      });
    } catch (e) {
      logger.warn(`deliverEnvelope FCM failed: ${e?.message || e}`);
    }
  }
}

export async function emitOrderEventToTarget({
  type,
  orderId,
  orderMongoId = null,
  target,
  ring = false,
  expiresInSec = null,
  eventId = null,
  ackRequired = false,
  socketEventNames = [],
  data = {},
  fcm = null,
}) {
  const envelope = await buildOrderEventEnvelope({ type, orderId, target, ring, expiresInSec, eventId, data });

  // Outbox-first: durable row BEFORE delivery, so a crashed / failed send is picked up and
  // retried by the relay (guaranteed delivery). The client de-dups by event_id if both fire.
  const row = await recordOutbox({ envelope, orderMongoId, ackRequired });
  await deliverEnvelope(envelope, { socketEventNames, fcm });
  if (row?._id) {
    FoodOrderEvent.updateOne({ _id: row._id }, { $set: { publishedAt: new Date() } }).catch((e) =>
      logger.warn(`mark published failed: ${e?.message || e}`),
    );
  }

  return envelope;
}

/** Mark a ring event acknowledged so the watchdog stops escalating it. */
export async function ackOrderEvent(eventId) {
  if (!eventId) return;
  try {
    await FoodOrderEvent.updateMany(
      { eventId: String(eventId), ackRequired: true, ackedAt: null },
      { $set: { ackedAt: new Date(), nextEscalationAt: null } },
    );
  } catch (e) {
    logger.warn(`ackOrderEvent failed: ${e?.message || e}`);
  }
}

/** Dual-send the same logical event to several targets (each gets its own seq/event_id). */
export async function emitOrderEvent({
  type,
  orderId,
  orderMongoId = null,
  targets = [],
  ring = false,
  expiresInSec = null,
  ackRequired = false,
  socketEventNames = [],
  data = {},
  fcm = null,
}) {
  const out = [];
  for (const target of targets) {
    if (!target?.ownerType || !target?.ownerId) continue;
    out.push(
      await emitOrderEventToTarget({
        type,
        orderId,
        orderMongoId,
        target,
        ring,
        expiresInSec,
        ackRequired,
        socketEventNames,
        data,
        fcm: typeof fcm === 'function' ? fcm(target) : fcm,
      }),
    );
  }
  return out;
}
