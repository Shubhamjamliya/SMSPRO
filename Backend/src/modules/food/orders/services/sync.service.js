/**
 * State reconciliation for clients — the single read-state API that replaces polling.
 *
 * `GET /food/sync?since_seq=N` returns the caller's currently-active order plus every order
 * event recorded for them with seq > N, and the latest_seq. Clients call it on app open,
 * on socket reconnect, and when they detect a sequence gap — then rely on the live socket in
 * between. Nothing else fetches order state on a timer.
 */
import { FoodOrderEvent } from '../models/orderEvent.model.js';
import { resyncState } from './order.service.js';

const MAX_EVENTS = 200;

export async function getSyncState({ ownerType, ownerId, sinceSeq = 0, role }) {
  const type = String(ownerType || '').toUpperCase();
  const id = String(ownerId || '');
  if (!type || !id) {
    return { events: [], latest_seq: sinceSeq, since_seq: sinceSeq, has_more: false, activeOrder: null };
  }

  const [events, latestDoc, state] = await Promise.all([
    FoodOrderEvent.find({ ownerType: type, ownerId: id, seq: { $gt: sinceSeq } })
      .sort({ seq: 1 })
      .limit(MAX_EVENTS)
      .lean(),
    FoodOrderEvent.findOne({ ownerType: type, ownerId: id }).sort({ seq: -1 }).select('seq').lean(),
    (async () => {
      try {
        return await resyncState(id, role || type);
      } catch {
        return { activeOrder: null };
      }
    })(),
  ]);

  return {
    events: events.map((e) => e.payload),
    latest_seq: latestDoc?.seq ?? sinceSeq,
    since_seq: sinceSeq,
    has_more: events.length >= MAX_EVENTS,
    activeOrder: state?.activeOrder ?? null,
  };
}
