/**
 * Process-local TTL cache for small, hot, non-critical lookups.
 *
 * Not a substitute for the Redis response cache (middleware/cache.js): entries are
 * per-process, so with multiple PM2 instances each has its own copy and writes are
 * not invalidated across them. Use it only where briefly stale data per instance is
 * acceptable.
 */
const cache = new Map();

/**
 * Hard ceiling on entries. Expired entries are only evicted when their own key is
 * read again, so a caller that generates many distinct keys (per-user, per-order)
 * would otherwise grow this map forever — a slow leak that survives until restart.
 */
const MAX_ENTRIES = 1000;

/** Drop everything already expired; if still over the ceiling, drop oldest-first. */
function evictIfNeeded() {
    if (cache.size <= MAX_ENTRIES) return;
    const now = Date.now();
    for (const [key, entry] of cache) {
        if (now - entry.timestamp >= entry.ttl) cache.delete(key);
    }
    // Map preserves insertion order, so the leading keys are the oldest.
    if (cache.size > MAX_ENTRIES) {
        const excess = cache.size - MAX_ENTRIES;
        let removed = 0;
        for (const key of cache.keys()) {
            cache.delete(key);
            if (++removed >= excess) break;
        }
    }
}

/**
 * Get item from cache
 * @param {string} key 
 * @returns {any|null}
 */
export function getCache(key) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
        return cached.value;
    }
    if (cached) {
        cache.delete(key); // Cleanup expired
    }
    return null;
}

/**
 * Set item in cache
 * @param {string} key 
 * @param {any} value 
 * @param {number} ttlMs - TTL in milliseconds
 */
export function setCache(key, value, ttlMs = 30000) {
    cache.set(key, {
        value,
        timestamp: Date.now(),
        ttl: ttlMs
    });
    evictIfNeeded();
}

/**
 * Clear cached key
 * @param {string} key 
 */
export function deleteCache(key) {
    cache.delete(key);
}
