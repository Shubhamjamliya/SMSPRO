/**
 * Client-side order-state reconciliation (Phase 3A).
 *
 * Replaces polling: instead of refetching orders on a timer, the app calls `syncNow(module)`
 * on socket connect / reconnect (and on a detected sequence gap) to pull everything it missed
 * from `GET /food/sync?since_seq=N`. Between syncs it relies on the live socket.
 *
 * All three sources (socket, native FCM injection, /sync replay) are de-duplicated by
 * `event_id` through the shared rolling set in nativeBridge.js, and every fresh event is
 * re-broadcast as a single `order:event` window CustomEvent so UI code has one stream.
 */
import apiClient from '@food/api';
import { markSeenEvent } from '@core/native/nativeBridge';

const ORDER_EVENT = 'order:event';
const seqKey = (module) => `order_sync_seq_${module}`;

const getSeq = (module) => {
  const v = parseInt(localStorage.getItem(seqKey(module)) || '0', 10);
  return Number.isFinite(v) ? v : 0;
};
const setSeq = (module, v) => {
  try {
    localStorage.setItem(seqKey(module), String(v));
  } catch {
    /* storage full / disabled — non-fatal */
  }
};

const broadcast = (envelope) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ORDER_EVENT, { detail: envelope }));
  }
};

const _inFlight = {};

/**
 * Pull missed events for a module ("user" | "restaurant" | "delivery" | "admin").
 * Idempotent per module (concurrent calls share one request); pages if the server caps.
 */
export async function syncNow(module) {
  if (!module || typeof window === 'undefined') return null;
  if (_inFlight[module]) return _inFlight[module];

  const run = (async () => {
    try {
      const since = getSeq(module);
      const res = await apiClient.get('/food/sync', {
        params: { since_seq: since },
        contextModule: module,
        noCache: true,
      });
      const data = res?.data?.data || {};
      const events = Array.isArray(data.events) ? data.events : [];

      for (const env of events) {
        const id = env?.event_id || env?.eventId;
        if (id && !markSeenEvent(id)) continue; // already handled via socket/native
        broadcast(env);
      }

      if (Number.isFinite(data.latest_seq)) setSeq(module, Math.max(since, data.latest_seq));
      if (data.activeOrder) broadcast({ type: 'ACTIVE_ORDER_SNAPSHOT', activeOrder: data.activeOrder });

      // Server capped the page — drain the rest.
      if (data.has_more) {
        _inFlight[module] = null;
        return syncNow(module);
      }
      return data;
    } catch {
      return null;
    } finally {
      _inFlight[module] = null;
    }
  })();

  _inFlight[module] = run;
  return run;
}

/**
 * Feed a live socket/native event through de-dup + gap detection. Returns false if it was a
 * duplicate. On a sequence gap it triggers a reconcile.
 */
export function ingestLiveEvent(module, envelope) {
  if (!envelope) return false;
  const id = envelope.event_id || envelope.eventId;
  if (id && !markSeenEvent(id)) return false; // duplicate

  const seq = Number(envelope.seq);
  if (module && Number.isFinite(seq)) {
    const known = getSeq(module);
    if (seq > known + 1) syncNow(module); // gap — reconcile the missed range
    setSeq(module, Math.max(known, seq));
  }
  broadcast(envelope);
  return true;
}

/** Subscribe to the unified order-event stream. Returns an unsubscribe fn. */
export function onOrderEvent(handler) {
  if (typeof window === 'undefined' || typeof handler !== 'function') return () => {};
  const listener = (e) => handler(e.detail);
  window.addEventListener(ORDER_EVENT, listener);
  return () => window.removeEventListener(ORDER_EVENT, listener);
}

export const ORDER_EVENT_NAME = ORDER_EVENT;
