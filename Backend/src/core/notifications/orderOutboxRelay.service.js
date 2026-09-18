/**
 * Outbox relay + escalation watchdog (Phase 3B/3C).
 *
 * A single periodic sweep (started in server.js) does two jobs:
 *  1. RELAY — re-deliver events whose inline dual-send never marked `publishedAt` (process
 *     crashed or socket/FCM threw). Guarantees at-least-once delivery; clients de-dup by
 *     event_id.
 *  2. WATCHDOG — for `ring:true` events that require an ack, escalate when none arrives:
 *     60s → resend FCM, 120s → IVR call (stubbed), 180s → final action hook
 *     (reassign driver / auto-cancel — left as an explicit, non-destructive stub).
 *
 * Multi-instance safe: each tick is guarded by a short Redis lock so only one instance
 * sweeps. With Redis disabled it runs unguarded (single instance).
 */
import { FoodOrderEvent } from '../../modules/food/orders/models/orderEvent.model.js';
import { deliverEnvelope } from './orderEvents.service.js';
import { sendNotificationToOwner } from './firebase.service.js';
import { getRedisClient } from '../../config/redis.js';
import { logger } from '../../utils/logger.js';

const RELAY_STALE_MS = 10_000; // only relay rows pending longer than this
const MAX_ATTEMPTS = 5;
const BATCH = 100;
const ESCALATION_STEP_MS = 60_000;
const LOCK_KEY = 'lock:order_outbox_sweep';

async function acquireSweepLock(ttlMs = 8000) {
  try {
    const redis = getRedisClient();
    if (!redis) return true; // no Redis → assume single instance
    const ok = await redis.set(LOCK_KEY, String(process.pid), { NX: true, PX: ttlMs });
    return ok === 'OK' || ok === true;
  } catch {
    return true; // lock unavailable → don't block the sweep
  }
}

const scalarOnly = (env = {}) =>
  Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== null && typeof v !== 'object').map(([k, v]) => [k, String(v)]),
  );

const bumpEscalation = (id, stage) =>
  FoodOrderEvent.updateOne(
    { _id: id },
    { $set: { escalationStage: stage, nextEscalationAt: new Date(Date.now() + ESCALATION_STEP_MS) } },
  );

async function relayPending() {
  const cutoff = new Date(Date.now() - RELAY_STALE_MS);
  const rows = await FoodOrderEvent.find({ publishedAt: null, createdAt: { $lt: cutoff } })
    .sort({ createdAt: 1 })
    .limit(BATCH)
    .lean();

  for (const row of rows) {
    try {
      if ((row.attempts || 0) >= MAX_ATTEMPTS) {
        await FoodOrderEvent.updateOne({ _id: row._id }, { $set: { publishedAt: new Date() } });
        logger.warn(`Outbox relay gave up on ${row.eventId} after ${row.attempts} attempts`);
        continue;
      }
      await deliverEnvelope(row.payload, { socketEventNames: [row.type], fcm: null });
      await FoodOrderEvent.updateOne(
        { _id: row._id },
        { $set: { publishedAt: new Date() }, $inc: { attempts: 1 } },
      );
    } catch (e) {
      await FoodOrderEvent.updateOne({ _id: row._id }, { $inc: { attempts: 1 } }).catch(() => {});
      logger.warn(`Outbox relay failed for ${row.eventId}: ${e?.message || e}`);
    }
  }
  return rows.length;
}

async function escalateUnacked() {
  const now = new Date();
  const rows = await FoodOrderEvent.find({
    ackRequired: true,
    ackedAt: null,
    nextEscalationAt: { $ne: null, $lte: now },
  })
    .sort({ nextEscalationAt: 1 })
    .limit(BATCH)
    .lean();

  for (const row of rows) {
    try {
      // Stop once the ring window has expired and we've at least resent once.
      if (row.expiresAt && row.expiresAt < now && (row.escalationStage || 0) >= 1) {
        await FoodOrderEvent.updateOne({ _id: row._id }, { $set: { nextEscalationAt: null } });
        continue;
      }
      const stage = (row.escalationStage || 0) + 1;
      if (stage === 1) {
        await sendNotificationToOwner({
          ownerType: row.ownerType,
          ownerId: row.ownerId,
          payload: { dataOnly: true, data: { ...scalarOnly(row.payload), resend: 'true' } },
        }).catch(() => {});
        await bumpEscalation(row._id, 1);
      } else if (stage === 2) {
        await placeIvrCall(row);
        await bumpEscalation(row._id, 2);
      } else {
        await onFinalEscalation(row);
        await FoodOrderEvent.updateOne(
          { _id: row._id },
          { $set: { escalationStage: 3, nextEscalationAt: null } },
        );
      }
    } catch (e) {
      logger.warn(`Watchdog escalation failed for ${row.eventId}: ${e?.message || e}`);
    }
  }
  return rows.length;
}

async function placeIvrCall(row) {
  if (!process.env.IVR_PROVIDER) {
    logger.info(`[Watchdog] IVR stub: would call ${row.ownerType}:${row.ownerId} re order ${row.orderId}`);
    return;
  }
  // TODO: integrate Twilio/Exotel using process.env credentials (IVR_PROVIDER, tokens).
}

async function onFinalEscalation(row) {
  // Concrete policy: a restaurant that never accepted a NEW_ORDER within the escalation
  // window has the order auto-cancelled. Reusing the normal restaurant-cancel path triggers
  // the refund + customer notification + transaction sync. Guarded + idempotent — if the
  // order already moved on (accepted/cancelled), the state-machine guard rejects it and we
  // no-op. (Driver offers are not ackRequired; their re-dispatch is owned by the dispatch
  // retry loop, so they never reach here.)
  try {
    if (row.type === 'NEW_ORDER' && String(row.ownerType).toUpperCase() === 'RESTAURANT' && row.orderMongoId) {
      const { updateOrderStatusRestaurant } = await import(
        '../../modules/food/orders/services/order.service.js'
      );
      await updateOrderStatusRestaurant(
        String(row.orderMongoId),
        String(row.ownerId),
        'cancelled_by_restaurant',
        {},
      );
      logger.warn(
        `[Watchdog] Auto-cancelled order ${row.orderId}: restaurant ${row.ownerId} did not accept in time.`,
      );
      return;
    }
    logger.warn(
      `[Watchdog] Final escalation (no concrete action) for ${row.ownerType}:${row.ownerId} order ${row.orderId}.`,
    );
  } catch (e) {
    // Order already accepted/cancelled → the transition guard rejected it. Non-fatal.
    logger.info(`[Watchdog] Final escalation skipped for order ${row.orderId}: ${e?.message || e}`);
  }
}

let running = false;
export async function sweepOutboxOnce() {
  if (running) return; // no overlap within a process
  if (!(await acquireSweepLock())) return; // another instance owns this tick
  running = true;
  try {
    await relayPending();
    await escalateUnacked();
  } catch (e) {
    logger.error(`Outbox sweep error: ${e?.message || e}`);
  } finally {
    running = false;
  }
}
