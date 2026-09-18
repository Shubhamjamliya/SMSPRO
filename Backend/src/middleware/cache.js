import { getRedisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';

/**
 * Index of live cache keys per prefix, e.g. `cacheidx:restaurant_menu`.
 *
 * Why maintain this instead of invalidating with `SCAN MATCH prefix:*`: SCAN walks
 * the ENTIRE keyspace regardless of MATCH — it only filters what it returns. In a
 * Redis instance shared with BullMQ job hashes, rate-limit counters and socket
 * rooms that is tens of thousands of keys iterated to delete a handful. Reading a
 * per-prefix set is proportional to the keys actually being invalidated.
 */
const INDEX_PREFIX = 'cacheidx';

/** Index sets outlive their longest entry so stale members are self-clearing. */
const INDEX_TTL_BUFFER_SECONDS = 3600;

/**
 * In-flight origin calls, keyed by cache key.
 *
 * Stampede (a.k.a. dog-pile) protection: when a hot key expires, every concurrent
 * request misses at once and they all hit MongoDB together — exactly at peak load.
 * Later arrivals for a key already being computed wait on the first one instead.
 * Process-local by design: it removes the N-per-instance thundering herd without
 * the failure modes of a distributed lock (stuck locks, added Redis round-trips).
 *
 * @type {Map<string, Promise<{ status: number, body: unknown }>>}
 */
const inFlight = new Map();

const redisReady = () => {
    if (!config.redisEnabled || !config.cacheEnabled) return null;
    const redis = getRedisClient();
    return redis && redis.isReady ? redis : null;
};

/**
 * Query params that carry no meaning for the response and must not affect the key.
 *
 * Mirrors VOLATILE_PARAMS in Frontend/src/services/api/httpCache.js. Without this,
 * disabling the `?_ts=` bypass is not enough: because the key is built from the full
 * URL, `?_ts=1738...` produces a *different* key on every single request. The
 * response is then a permanent miss AND each call writes a new single-use entry into
 * Redis. The frontend appends `_ts` on restaurant menu and detail loads, so the
 * hottest endpoint in the food module was effectively uncached while still paying
 * the full cost of caching.
 */
const VOLATILE_PARAMS = new Set(['_ts', '_', 't', 'timestamp', 'cachebust', 'cachebuster']);

/**
 * Build a stable, canonical URL for keying: volatile params dropped, the rest
 * sorted so `?a=1&b=2` and `?b=2&a=1` resolve to one entry instead of two.
 */
const canonicalUrl = (req) => {
    const raw = req.originalUrl || req.url || '';
    const qIndex = raw.indexOf('?');
    if (qIndex === -1) return raw;

    const path = raw.slice(0, qIndex);
    const params = new URLSearchParams(raw.slice(qIndex + 1));

    const kept = [];
    for (const [key, value] of params) {
        if (VOLATILE_PARAMS.has(key.toLowerCase())) continue;
        kept.push([key, value]);
    }
    if (!kept.length) return path;

    kept.sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
    return `${path}?${kept.map(([k, v]) => `${k}=${v}`).join('&')}`;
};

/**
 * Decide whether this request is allowed to skip the cache.
 *
 * `Cache-Control: no-cache` is the sanctioned mechanism. The legacy `?_ts=` query
 * cache-buster is honoured only when CACHE_ALLOW_QUERY_BYPASS is set (default: dev
 * only) — in production it is a free cache-flush primitive for any caller, and the
 * frontend appends it on hot paths like restaurant menu loads, which silently
 * defeated caching exactly where it mattered most.
 */
const wantsFresh = (req) => {
    const cacheControl = String(req.headers['cache-control'] || '').toLowerCase();
    if (cacheControl.includes('no-cache') || cacheControl.includes('no-store')) return true;
    if (config.cacheAllowQueryBypass && req.query?._ts) return true;
    return false;
};

/**
 * Higher-order function to create a caching middleware.
 *
 * @param {number} ttlInSeconds - Time to live for the cache in seconds.
 * @param {string} prefix - Key prefix for Redis (e.g. 'restaurants'). Also the
 *   invalidation unit — pass the same prefix to `invalidateCache`.
 * @param {object} [options]
 * @param {'public'|'user'} [options.scope='public'] - `public` shares one entry
 *   across all callers (correct only when the response does not depend on who is
 *   asking). `user` partitions per authenticated user; use it for anything
 *   personalised, otherwise one user's response is served to another.
 * @param {(req: import('express').Request) => string} [options.varyBy] - Extra key
 *   material (zone, city, role, ...) for responses that vary on something beyond
 *   the URL.
 * @param {boolean} [options.clientCache=false] - Also emit a `Cache-Control`
 *   header so browsers/CDN can reuse the response. Only for genuinely public,
 *   non-personalised data.
 * @returns {import('express').RequestHandler}
 */
export const cacheResponse = (ttlInSeconds = 300, prefix = 'api_cache', options = {}) => {
    const { scope = 'public', varyBy, clientCache = false } = options;
    const ttl = Math.max(1, Math.round(ttlInSeconds * (config.cacheTtlMultiplier || 1)));

    return async (req, res, next) => {
        if (req.method !== 'GET') return next();

        const redis = redisReady();
        if (!redis) return next();

        if (wantsFresh(req)) {
            res.setHeader('X-Cache', 'BYPASS');
            return next();
        }

        // Scope guard: a `user`-scoped entry needs an identity to partition on.
        // Falling back to a shared key here would leak one user's data to another,
        // so skip the cache entirely instead.
        let identity = '';
        if (scope === 'user') {
            identity = String(req.user?.userId || req.user?.id || '');
            if (!identity) {
                res.setHeader('X-Cache', 'BYPASS');
                return next();
            }
        }

        const parts = [prefix, req.method, canonicalUrl(req)];
        if (identity) parts.push(`u:${identity}`);
        if (varyBy) {
            try {
                const extra = varyBy(req);
                if (extra) parts.push(String(extra));
            } catch (err) {
                logger.warn(`Cache varyBy failed for ${prefix}: ${err.message}`);
            }
        }
        const key = parts.join(':');
        const indexKey = `${INDEX_PREFIX}:${prefix}`;

        try {
            const cachedData = await redis.get(key);
            if (cachedData) {
                res.setHeader('X-Cache', 'HIT');
                if (clientCache) res.setHeader('Cache-Control', `public, max-age=${ttl}`);
                return res.json(JSON.parse(cachedData));
            }

            // Collapse concurrent misses for the same key onto one origin call.
            const pending = inFlight.get(key);
            if (pending) {
                try {
                    const { status, body } = await pending;
                    res.setHeader('X-Cache', 'HIT-COALESCED');
                    if (clientCache) res.setHeader('Cache-Control', `public, max-age=${ttl}`);
                    return res.status(status).json(body);
                } catch {
                    // Leader failed — fall through and compute independently.
                }
            }

            let settle;
            let fail;
            const leader = new Promise((resolve, reject) => {
                settle = resolve;
                fail = reject;
            });
            // A rejected in-flight promise with no waiters would surface as an
            // unhandledRejection, which server.js treats as fatal in production.
            // This no-op handler marks it handled; awaiters still see the rejection
            // through their own try/catch.
            leader.catch(() => {});
            inFlight.set(key, leader);

            // Guarantee the in-flight slot is released even if the handler never
            // calls res.json (error path, stream, client abort) — otherwise every
            // later request for this key waits on a promise that never settles.
            res.on('close', () => {
                if (inFlight.has(key)) {
                    inFlight.delete(key);
                    fail(new Error('response closed without json'));
                }
            });

            res.setHeader('X-Cache', 'MISS');

            const originalJson = res.json.bind(res);
            res.json = (body) => {
                const status = res.statusCode || 200;
                // Do not cache errors, nor 200-with-`success:false` envelopes that
                // several controllers return, nor anything carrying a Set-Cookie.
                const cacheable =
                    status < 400 &&
                    !(body && typeof body === 'object' && body.success === false) &&
                    !res.getHeader('Set-Cookie');

                if (inFlight.has(key)) {
                    inFlight.delete(key);
                    if (cacheable) settle({ status, body });
                    else fail(new Error('response not cacheable'));
                }

                if (cacheable) {
                    if (clientCache) res.setHeader('Cache-Control', `public, max-age=${ttl}`);
                    const payload = JSON.stringify(body);
                    redis
                        .multi()
                        .set(key, payload, { EX: ttl })
                        .sAdd(indexKey, key)
                        .expire(indexKey, ttl + INDEX_TTL_BUFFER_SECONDS)
                        .exec()
                        .catch((err) => logger.error(`Redis caching failed for ${key}: ${err.message}`));
                }
                return originalJson(body);
            };

            next();
        } catch (err) {
            inFlight.delete(key);
            logger.warn(`Cache middleware error: ${err.message}`);
            next(); // fallback to normal flow if something fails
        }
    };
};

/**
 * Middleware that clears cache prefixes AFTER the write succeeds.
 *
 * Route-level invalidation was previously written as `await invalidateCache(...)`
 * followed by `next()`, i.e. it cleared the cache *before* the controller ran. That
 * leaves a window between the clear and the database write in which a concurrent
 * GET repopulates the cache from the pre-write state — so the stale value comes
 * back and then survives for the full TTL. Deferring to `finish` closes the window,
 * and skipping non-2xx avoids pointlessly dumping hot caches on validation errors.
 *
 * @param {string[]|string} prefixes - Prefix or INVALIDATION_GROUPS entry.
 * @returns {import('express').RequestHandler}
 */
export const invalidateCacheAfter = (prefixes) => (req, res, next) => {
    res.on('finish', () => {
        if (res.statusCode >= 400) return;
        void invalidateCache(prefixes);
    });
    next();
};

/**
 * Delete every cached entry for one or more prefixes.
 *
 * Accepts the legacy pattern forms already used across the codebase
 * (`'offers*'`, `'cms_pages:GET:*'`, `'restaurant_menu:*'`) and reduces them to
 * the prefix, so existing call sites keep working unchanged.
 *
 * @param {...string} patterns - Cache prefixes (trailing glob/`:GET:` parts ignored).
 */
export const invalidateCache = async (...patterns) => {
    const redis = redisReady();
    if (!redis) return;

    const prefixes = [
        ...new Set(
            patterns
                .flat()
                .filter(Boolean)
                .map((p) => String(p).split(':')[0].replace(/\*+$/, '').trim())
                .filter(Boolean),
        ),
    ];
    if (!prefixes.length) return;

    // UNLINK reclaims memory on a background thread; DEL blocks the (single
    // threaded) server for the duration of the free. Older servers lack UNLINK.
    const drop = async (keys) => {
        if (!keys.length) return;
        try {
            await redis.unlink(keys);
        } catch {
            await redis.del(keys);
        }
    };

    for (const prefix of prefixes) {
        const indexKey = `${INDEX_PREFIX}:${prefix}`;
        let deleted = 0;
        try {
            const indexed = await redis.sMembers(indexKey);
            if (indexed.length) {
                await drop(indexed);
                await drop([indexKey]);
                deleted = indexed.length;
            } else {
                // No index (entries written before the index existed, or already
                // expired): fall back to a bounded SCAN so invalidation stays correct.
                let cursor = 0;
                do {
                    const result = await redis.scan(cursor, { MATCH: `${prefix}:*`, COUNT: 500 });
                    cursor = Number(result.cursor);
                    if (result.keys.length) {
                        await drop(result.keys);
                        deleted += result.keys.length;
                    }
                } while (cursor !== 0);
            }

            if (deleted > 0) {
                logger.info(`Invalidated ${deleted} cache keys for prefix: ${prefix}`);
            }
        } catch (err) {
            logger.error(`Cache invalidation error for ${prefix}: ${err.message}`);
        }
    }
};
