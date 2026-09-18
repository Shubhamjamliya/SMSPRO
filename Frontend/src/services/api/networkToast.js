/**
 * Deduplicated toast bus for API / network errors.
 * Prevents toast storms when many requests fail at once.
 */

import { toast } from "sonner";
import { ApiErrorCode, getApiErrorMessage, getFriendlyMessageForCode } from "./errors.js";

const recentKeys = new Map();
const DEFAULT_TTL_MS = 4500;

function prune(now) {
  for (const [key, expires] of recentKeys.entries()) {
    if (expires <= now) recentKeys.delete(key);
  }
}

function shouldShow(key, ttlMs) {
  const now = Date.now();
  prune(now);
  const expires = recentKeys.get(key);
  if (expires && expires > now) return false;
  recentKeys.set(key, now + ttlMs);
  return true;
}

/**
 * Show a single consolidated error toast for a normalized API failure.
 * @param {unknown} error
 * @param {{ fallback?: string, ttlMs?: number, force?: boolean }} [options]
 */
export function notifyApiError(error, options = {}) {
  const { fallback, ttlMs = DEFAULT_TTL_MS, force = false } = options;
  const message = getApiErrorMessage(error, fallback);
  const code = error?.normalized?.code || "UNKNOWN";

  if (error?.normalized?.silent && !force) return false;
  if (code === ApiErrorCode.CANCELLED && !force) return false;
  if (code === ApiErrorCode.UNAUTHORIZED && !force) return false;

  const key = `${code}::${message}`;
  if (!force && !shouldShow(key, ttlMs)) return false;

  toast.error(message, {
    id: `api-error-${code}`,
    duration: code === ApiErrorCode.OFFLINE ? 6000 : 4000,
  });
  return true;
}

export function notifyNetworkStatus(code, force = false) {
  if (code === "ONLINE_RECOVERY") {
    const key = "status::ONLINE_RECOVERY";
    if (!force && !shouldShow(key, 8000)) return false;
    dismissOfflineToast();
    toast.success("You're back online.", { id: "network-online", duration: 2500 });
    return true;
  }
  const message = getFriendlyMessageForCode(code);
  const key = `status::${code}`;
  // Slow-network: 2 min cooldown so multi-request flows don't spam
  const ttlMs = code === ApiErrorCode.SLOW_NETWORK ? 120000 : 8000;
  if (!force && !shouldShow(key, ttlMs)) return false;
  if (code === ApiErrorCode.OFFLINE) {
    toast.error(message, { id: "network-offline", duration: Infinity });
    return true;
  }
  if (code === ApiErrorCode.SLOW_NETWORK) {
    toast.message(message, { id: "network-slow", duration: 2500 });
    return true;
  }
  toast.message(message, { id: `network-${code}`, duration: 3000 });
  return true;
}

export function dismissOfflineToast() {
  toast.dismiss("network-offline");
}
