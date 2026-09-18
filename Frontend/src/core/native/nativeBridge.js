/**
 * Native bridge (WebView ⇆ native shell) — Phase 2, web side.
 *
 * This is the container-agnostic JavaScript contract the native shell implements. It works
 * with the app's current Flutter WebView (`flutter_inappwebview.callHandler`) and degrades
 * gracefully for a React-Native WebView or a plain Android `addJavascriptInterface`
 * (window.NativeBridge). If no native shell is present, every call is a safe no-op so the
 * same code runs unchanged in a normal browser.
 *
 * Web → Native (native must expose these handlers):
 *   - startRing(payload)      begin the looping alarm ring + full-screen intent for a new order
 *   - stopRing()              stop the ring (on accept/reject/expiry)
 *   - getFcmToken()           return the device FCM token
 *   - openBatterySettings()   open battery-optimisation / autostart settings
 *
 * Native → Web (native calls this when an FCM data message arrives, incl. app-killed resume):
 *   - window.onNativeEvent(json)   inject an order-event envelope into the running web app
 *
 * Every injected event carries the standard envelope { event_id, seq, type, order_id,
 * target, ring, expires_at, ... }. This module dedups by `event_id` (a rolling set) so the
 * same event arriving over both Socket.IO and FCM is only acted on once, then re-broadcasts
 * it as a `native:order-event` window CustomEvent for the notification hooks to consume.
 */

const NATIVE_EVENT = 'native:order-event';
const SEEN_LIMIT = 500;
const _seen = new Set();

/** True once, false on repeats — rolling de-dup by event_id (or a composed fallback key). */
export function markSeenEvent(eventId) {
  const id = String(eventId || '').trim();
  if (!id) return true; // no id -> can't dedup, let it through
  if (_seen.has(id)) return false;
  _seen.add(id);
  if (_seen.size > SEEN_LIMIT) {
    // Evict oldest (Set preserves insertion order).
    const oldest = _seen.values().next().value;
    _seen.delete(oldest);
  }
  return true;
}

export function hasNativeShell() {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.flutter_inappwebview?.callHandler ||
      window.ReactNativeWebView?.postMessage ||
      window.NativeBridge,
  );
}

/**
 * Invoke a native handler. Returns the handler's result when the container supports a
 * return value (Flutter), otherwise resolves undefined after posting the message.
 */
export async function callNative(handler, payload = {}) {
  if (typeof window === 'undefined' || !handler) return null;

  // 1) Flutter WebView — awaitable return value.
  try {
    if (typeof window.flutter_inappwebview?.callHandler === 'function') {
      return await window.flutter_inappwebview.callHandler(handler, payload);
    }
  } catch {
    /* fall through to other transports */
  }

  // 2) Plain Android addJavascriptInterface — window.NativeBridge.<handler>(jsonString)
  try {
    const fn = window.NativeBridge?.[handler];
    if (typeof fn === 'function') {
      return fn.call(window.NativeBridge, JSON.stringify(payload));
    }
  } catch {
    /* fall through */
  }

  // 3) React-Native WebView — fire-and-forget message; native replies via onNativeEvent.
  try {
    if (typeof window.ReactNativeWebView?.postMessage === 'function') {
      window.ReactNativeWebView.postMessage(JSON.stringify({ handler, payload }));
      return undefined;
    }
  } catch {
    /* no-op */
  }

  return null; // no native shell — safe no-op
}

export const startRing = (payload = {}) => callNative('startRing', payload);
export const stopRing = () => callNative('stopRing', {});
export const openBatterySettings = () => callNative('openBatterySettings', {});

// getFcmToken: Flutter returns the token directly; RN posts it back via a one-shot event.
let _pendingTokenResolvers = [];
export async function getFcmToken({ timeoutMs = 4000 } = {}) {
  const direct = await callNative('getFcmToken', {});
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  if (direct && typeof direct === 'object' && direct.token) return String(direct.token);

  // No synchronous return (RN) — wait for native to push it back through onNativeEvent.
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      _pendingTokenResolvers = _pendingTokenResolvers.filter((r) => r !== resolve);
      resolve(null);
    }, timeoutMs);
    _pendingTokenResolvers.push((token) => {
      clearTimeout(timer);
      resolve(token);
    });
  });
}

function parseEnvelope(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

let _intakeInstalled = false;

/**
 * Define window.onNativeEvent so the native shell can inject FCM data events into the
 * running web app. Idempotent. `onEvent` (optional) is called for each fresh event; every
 * fresh event is also re-broadcast as a `native:order-event` window CustomEvent.
 */
export function installNativeEventIntake({ onEvent } = {}) {
  if (typeof window === 'undefined' || _intakeInstalled) return;
  _intakeInstalled = true;

  window.onNativeEvent = (raw) => {
    try {
      // Special channel: FCM token pushed back from native (RN path for getFcmToken()).
      const env = parseEnvelope(raw);
      if (!env) return false;

      if (env.type === 'FCM_TOKEN' && env.token) {
        const resolvers = _pendingTokenResolvers;
        _pendingTokenResolvers = [];
        resolvers.forEach((r) => r(String(env.token)));
        return true;
      }

      const eventId = env.event_id || env.eventId;
      if (!markSeenEvent(eventId)) return true; // duplicate — already handled

      if (typeof onEvent === 'function') {
        try { onEvent(env); } catch { /* consumer error shouldn't break the bridge */ }
      }
      window.dispatchEvent(new CustomEvent(NATIVE_EVENT, { detail: env }));
      return true;
    } catch {
      return false;
    }
  };
}

/** Subscribe to fresh native-injected order events. Returns an unsubscribe fn. */
export function onNativeOrderEvent(handler) {
  if (typeof window === 'undefined' || typeof handler !== 'function') return () => {};
  const listener = (e) => handler(e.detail);
  window.addEventListener(NATIVE_EVENT, listener);
  return () => window.removeEventListener(NATIVE_EVENT, listener);
}

export const NATIVE_ORDER_EVENT = NATIVE_EVENT;
