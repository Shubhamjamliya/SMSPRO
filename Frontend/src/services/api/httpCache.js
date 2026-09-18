/**
 * Systematic GET de-duplication + short-TTL response cache for an axios instance.
 *
 * Why this exists
 * ---------------
 * Many screens fetch the same endpoints from several components / effects at once, and
 * React StrictMode double-invokes effects in development. Navigating away and back
 * re-mounts components that immediately refetch. Without a shared layer, every one of
 * those is a separate network round-trip for identical data — the "same API is called
 * again and again on page change" problem.
 *
 * What it does (transparently, at the axios *adapter* level, so no call site changes)
 * ----------------------------------------------------------------------------------
 *  - Collapses concurrent identical GETs into a single in-flight request.
 *  - Serves a cached response within a short TTL window (covers StrictMode double-mount
 *    and quick back-navigation).
 *  - Clears the cache after any successful mutating request (POST/PUT/PATCH/DELETE) so
 *    reads-after-writes stay correct.
 *
 * Why the adapter layer is the correct place
 * ------------------------------------------
 * At the adapter boundary `response.data` is still the raw payload (before axios runs
 * `transformResponse`). Both fresh and cached responses therefore flow through
 * `transformResponse` identically on every resolution — no double-parse, no divergence.
 *
 * Per-request opt-outs (pass in the axios config)
 * -----------------------------------------------
 *  - `noCache: true` or `cache: false` -> always hit the network; never read/store cache.
 *  - `cacheTTL: <ms>`                   -> override the default TTL for this request
 *                                          (e.g. longer for slow-moving catalog data).
 *  - `invalidate: false` (on a write)   -> do not clear the cache after this mutation.
 */

import axios from "axios";

// Matches the ad-hoc in-flight caches already used in api/index.js (3s) so behaviour is
// consistent across the app. Slow-moving catalog endpoints opt into a longer TTL.
const DEFAULT_TTL_MS = 3000;

// Non-semantic cache-buster params. They are stripped from the cache key so callers that
// append them (e.g. `_ts: Date.now()`) still de-duplicate against each other instead of
// forcing a fresh network round-trip every render.
const VOLATILE_PARAMS = new Set(["_ts", "_", "t", "timestamp", "cacheBust"]);

const cacheStore = new Map(); // key -> { at:number, response:AxiosResponse }
const inFlight = new Map(); // key -> Promise<AxiosResponse>

function headerValue(headers, name) {
  if (!headers) return "";
  if (typeof headers.get === "function") {
    // AxiosHeaders instance
    return headers.get(name) || "";
  }
  return headers[name] || headers[name.toLowerCase?.() || name] || "";
}

function isFormDataBody(data) {
  if (!data || typeof data !== "object") return false;
  if (typeof FormData !== "undefined" && data instanceof FormData) return true;
  return Object.prototype.toString.call(data) === "[object FormData]";
}

function pickNetworkAdapter(config, xhrAdapter) {
  // Flutter InAppWebView XHR often strips File parts; fetch keeps the boundary.
  if (
    isFormDataBody(config?.data) &&
    typeof window !== "undefined" &&
    window.flutter_inappwebview
  ) {
    try {
      return axios.getAdapter("fetch");
    } catch {
      return xhrAdapter;
    }
  }
  return xhrAdapter;
}

function stableParams(params) {
  if (!params || typeof params !== "object") return "";
  return Object.keys(params)
    .filter((k) => !VOLATILE_PARAMS.has(k))
    .sort()
    .map((k) => `${k}=${JSON.stringify(params[k])}`)
    .join("&");
}

function buildKey(config) {
  const method = (config.method || "get").toLowerCase();
  const url = config.url || "";
  const headers = config.headers || {};
  const auth = headerValue(headers, "Authorization");
  const ctx = config.contextModule || headerValue(headers, "x-context-module") || "";
  const quick = headerValue(headers, "x-quick-session");
  return `${method} ${url}?${stableParams(config.params)}|${ctx}|${auth}|${quick}`;
}

function isCacheableGet(config) {
  if ((config.method || "get").toLowerCase() !== "get") return false;
  if (config.noCache === true) return false;
  if (config.cache === false) return false;
  return true;
}

/** Drop every cached GET response. */
export function clearHttpCache() {
  cacheStore.clear();
}

/**
 * Targeted invalidation. `pattern` may be a substring or a RegExp tested against the
 * cache key (which is `"<method> <url>?<params>|<ctx>|<auth>|<quick>"`).
 */
export function invalidateHttpCache(pattern) {
  if (!pattern) {
    clearHttpCache();
    return;
  }
  for (const key of Array.from(cacheStore.keys())) {
    const match =
      typeof pattern === "string" ? key.includes(pattern) : pattern.test(key);
    if (match) cacheStore.delete(key);
  }
}

/**
 * Install the cache/dedupe adapter onto an axios instance. Idempotent — installing twice
 * is a no-op.
 */
export function installHttpCache(instance) {
  if (!instance || instance.__httpCacheInstalled) return;
  instance.__httpCacheInstalled = true;

  const baseAdapter = axios.getAdapter(
    instance.defaults.adapter || axios.defaults.adapter,
  );

  instance.defaults.adapter = async (config) => {
    const method = (config.method || "get").toLowerCase();
    const networkAdapter = pickNetworkAdapter(config, baseAdapter);

    // Mutations: run normally, then clear the cache so subsequent reads are fresh.
    if (method !== "get") {
      const response = await networkAdapter(config);
      const ok = response && response.status >= 200 && response.status < 300;
      if (ok && config.invalidate !== false) {
        clearHttpCache();
      }
      return response;
    }

    if (!isCacheableGet(config)) {
      return networkAdapter(config);
    }

    const key = buildKey(config);
    const ttl = Number.isFinite(config.cacheTTL) ? config.cacheTTL : DEFAULT_TTL_MS;
    const now = Date.now();

    const hit = cacheStore.get(key);
    if (hit && now - hit.at < ttl) {
      // Fresh shallow copy + this request's own config so downstream interceptors and
      // callers never mutate the object we retain in the cache.
      return { ...hit.response, config, cached: true };
    }

    const pending = inFlight.get(key);
    if (pending) return pending;

    const promise = networkAdapter(config)
      .then((response) => {
        const ok = response && response.status >= 200 && response.status < 300;
        if (ok) cacheStore.set(key, { at: Date.now(), response });
        return response;
      })
      .finally(() => {
        inFlight.delete(key);
      });

    inFlight.set(key, promise);
    return promise;
  };
}
