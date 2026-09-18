import mongoose from 'mongoose';

/**
 * Durable per-target order-event log.
 *
 * Every critical order event is recorded here keyed by (ownerType, ownerId, seq) so a client
 * can replay everything it missed while offline via `GET /food/sync?since_seq=N`. It doubles
 * as the transactional-outbox store: `publishedAt=null` marks a row a relay worker still
 * needs to dual-send (Phase 3B). Rows auto-expire after 7 days.
 */
const orderEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true },
    type: { type: String, required: true },
    orderId: { type: String, default: '' }, // human order id (e.g. ORD00123)
    orderMongoId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // Target: OWNER_TYPE ∈ USER | RESTAURANT | DELIVERY_PARTNER | ADMIN | SELLER
    ownerType: { type: String, required: true },
    ownerId: { type: String, required: true },
    seq: { type: Number, required: true }, // per-target monotonic (see nextEventSeq)
    ring: { type: Boolean, default: false },
    expiresAt: { type: Date, default: null },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} }, // the full envelope
    publishedAt: { type: Date, default: null }, // outbox marker: null = pending relay
    attempts: { type: Number, default: 0 }, // relay send attempts

    // Watchdog (ring events need an ack; escalate if none arrives).
    ackRequired: { type: Boolean, default: false },
    ackedAt: { type: Date, default: null },
    escalationStage: { type: Number, default: 0 }, // 0 none, 1 resent, 2 ivr, 3 reassign/cancel
    nextEscalationAt: { type: Date, default: null },

    createdAt: { type: Date, default: Date.now },
  },
  { minimize: false },
);

// /sync?since_seq=N — fetch a target's events in order.
orderEventSchema.index({ ownerType: 1, ownerId: 1, seq: 1 });
// Dedup / lookup by event id.
orderEventSchema.index({ eventId: 1 });
// Relay worker — find rows still needing a dual-send.
orderEventSchema.index({ publishedAt: 1 });
// Watchdog — find unacked ring events due for escalation.
orderEventSchema.index({ ackRequired: 1, ackedAt: 1, nextEscalationAt: 1 });
// TTL self-clean after 7 days.
orderEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export const FoodOrderEvent = mongoose.model(
  'FoodOrderEvent',
  orderEventSchema,
  'food_order_events',
);
