import rateLimit, { MemoryStore } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { config } from '../config/env.js';
import { getRedisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';

/**
 * A Store that starts on in-memory limiting and transparently upgrades itself
 * to Redis once Redis is actually connected.
 *
 * Why not just construct `RedisStore` directly at module load time: this file
 * is imported (via app.js -> route files) BEFORE `connectRedis()` runs in
 * server.js, and `RedisStore`'s constructor eagerly fires an unawaited
 * `SCRIPT LOAD` command. If Redis isn't connected yet, that promise rejects
 * with nothing attached to it yet, which Node treats as an unhandled
 * rejection and crashes the process on startup. Deferring construction until
 * the first real request (by which point Redis has long since connected)
 * avoids that entirely, and the immediate `await` inside `increment()` means
 * any genuine failure is caught by `passOnStoreError` instead of crashing.
 */
class LazyRedisStore {
    constructor(prefix) {
        this.prefix = prefix;
        this.memoryStore = new MemoryStore();
        this.redisStore = null;
        this.redisStoreFailed = false;
        this.options = null;
    }

    init(options) {
        this.options = options;
        this.memoryStore.init(options);
    }

    getActiveStore() {
        if (this.redisStore) return this.redisStore;
        if (this.redisStoreFailed || !config.redisEnabled) return this.memoryStore;

        const client = getRedisClient();
        if (!client || !client.isReady) return this.memoryStore;

        try {
            const store = new RedisStore({
                prefix: this.prefix,
                sendCommand: (...args) => client.sendCommand(args)
            });
            if (this.options) store.init(this.options);
            this.redisStore = store;
            return store;
        } catch (err) {
            this.redisStoreFailed = true;
            logger.warn(`Rate limiter: failed to switch to Redis store (${this.prefix}), staying on memory store: ${err.message}`);
            return this.memoryStore;
        }
    }

    async increment(key) {
        try {
            return await this.getActiveStore().increment(key);
        } catch (err) {
            if (this.redisStore) {
                // Redis store is live but this call failed (e.g. connection blip) -
                // permanently drop back to memory rather than fail every request.
                this.redisStoreFailed = true;
                this.redisStore = null;
                logger.warn(`Rate limiter: Redis store error (${this.prefix}), falling back to memory store: ${err.message}`);
                return this.memoryStore.increment(key);
            }
            throw err;
        }
    }

    async decrement(key) {
        return this.getActiveStore().decrement(key);
    }

    async resetKey(key) {
        return this.getActiveStore().resetKey(key);
    }
}

/**
 * Normalise an IP for use as a rate-limit key.
 *
 * IPv6 clients are routinely handed a whole /64 (or larger) prefix, so keying on
 * the full address lets one host cycle through addresses and reset its bucket at
 * will. Collapsing to the first four hextets buckets the whole /64 together.
 * IPv4 (including `::ffff:` mapped form) is used as-is.
 */
const normaliseIp = (ip) => {
    if (!ip) return 'unknown';
    const raw = String(ip).replace(/^::ffff:/, '');
    if (!raw.includes(':')) return raw;
    return `${raw.split(':').slice(0, 4).join(':')}::/64`;
};

/**
 * Key limiters by the *verified* user when one is present, else by IP.
 *
 * Why this matters: Indian mobile carriers and office networks put thousands of
 * subscribers behind a handful of NAT addresses. A purely IP-keyed limiter makes
 * those users share one bucket, so a busy evening produces mass false 429s while
 * a single abusive client with its own IP stays under the limit.
 *
 * Only usable on limiters mounted AFTER authMiddleware — `req.user` is populated
 * by verified JWT there. Limiters that run before auth (the global `/api` floor,
 * auth routes) must stay IP-keyed, otherwise an attacker could mint unverifiable
 * tokens to get a fresh bucket per request.
 */
const identityKey = (req) => {
    const userId = req.user?.userId || req.user?.id || req.user?.sub;
    if (userId) return `u:${userId}`;
    return `ip:${normaliseIp(req.ip)}`;
};

/**
 * Paths that must not be throttled by the global per-IP limiter.
 *
 * Payment webhooks arrive from a small set of provider IPs and are retried
 * aggressively on non-2xx. Counting them against a per-IP bucket means a burst of
 * legitimate callbacks starts returning 429, the provider treats that as failure,
 * retries harder, and payments silently stop reconciling. They are authenticated
 * by HMAC signature instead, and get their own generous limiter below.
 */
const isWebhookPath = (req) => (req.originalUrl || req.url || '').includes('/payments/webhook');

const windowMs = config.rateLimitWindowMinutes * 60 * 1000;

export const apiRateLimiter = rateLimit({
    windowMs,
    // Dev UX: local UI can generate lots of background API calls (location, polling, etc).
    // Keep production strict, but avoid blocking local development.
    max: config.nodeEnv === 'development' ? Math.max(config.rateLimitMaxRequests, 2000) : config.rateLimitMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    // If the store errors out, fail OPEN (allow the request) rather than 500-ing all API traffic.
    passOnStoreError: true,
    store: new LazyRedisStore('rl:api:'),
    // Runs before authMiddleware, so this stays IP-keyed on purpose (see identityKey).
    keyGenerator: (req) => normaliseIp(req.ip),
    skip: isWebhookPath,
    message: {
        success: false,
        message: 'Too many requests, please try again later.'
    }
});

/**
 * Generous limiter for provider payment webhooks. Exists purely as a backstop
 * against a runaway retry loop — signature verification is the real gate.
 */
export const webhookRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    store: new LazyRedisStore('rl:webhook:'),
    keyGenerator: (req) => normaliseIp(req.ip),
    message: {
        success: false,
        message: 'Webhook rate limit exceeded.'
    }
});

const authWindowMs = config.authRateLimitWindowMinutes * 60 * 1000;

/** Stricter rate limit for auth routes (OTP, login, refresh, logout). Applied in addition to global limiter. */
export const authRateLimiter = rateLimit({
    windowMs: authWindowMs,
    // Dev UX: login/otp testing can be frequent. Keep production strict (e.g. 30),
    // but relax local development to avoid 429 when testing flows.
    max: config.nodeEnv === 'development' ? Math.max(config.authRateLimitMax, 100) : config.authRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    store: new LazyRedisStore('rl:auth:'),
    // Auth routes are pre-authentication, so bucket by IP *and* the identifier being
    // targeted. Without the identifier, one NAT'd carrier IP locks out every real
    // user behind it; without the IP, an attacker sprays across many phone numbers.
    // Keying on both means neither dimension alone can exhaust the other's budget.
    // Per-phone OTP issuance is additionally capped in core/otp/otp.service.js.
    keyGenerator: (req) => {
        const identifier = req.body?.phone || req.body?.email || req.body?.username || '';
        return `${normaliseIp(req.ip)}|${String(identifier).trim().toLowerCase()}`;
    },
    message: {
        success: false,
        message: 'Too many authentication attempts. Please try again later.'
    }
});

/**
 * Stricter limiter for money-moving / abuse-prone actions that the generic API
 * limiter is too loose for: order creation, payment verification, order price
 * calculation (can be used to brute-force coupon codes), wallet topup/deposit.
 */
export const sensitiveActionRateLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: config.nodeEnv === 'development' ? 300 : 30,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    store: new LazyRedisStore('rl:sensitive:'),
    // Every mount point for this limiter sits behind authMiddleware, so we can bucket
    // per user. 30 orders / 5 min is a sane per-account ceiling but would be a hard
    // outage if shared by everyone on one office or carrier NAT address.
    keyGenerator: identityKey,
    message: {
        success: false,
        message: 'Too many attempts. Please slow down and try again in a few minutes.'
    }
});

/**
 * High-frequency authenticated endpoints: `/food/sync` state reconciliation and
 * driver location pings. These fire every few seconds per active session by design,
 * so they get a dedicated per-user bucket rather than draining the global one — a
 * driver on a long delivery would otherwise exhaust the shared quota by itself.
 */
export const realtimeRateLimiter = rateLimit({
    windowMs: config.realtimeRateLimitWindowMinutes * 60 * 1000,
    max: config.nodeEnv === 'development'
        ? Math.max(config.realtimeRateLimitMax, 1000)
        : config.realtimeRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    store: new LazyRedisStore('rl:realtime:'),
    keyGenerator: identityKey,
    message: {
        success: false,
        message: 'Too many realtime updates. Please slow down.'
    }
});

/**
 * Limiter for registration / KYC-upload endpoints (restaurant, delivery partner
 * signup with file uploads). These are rare for a real user but attractive for
 * spam/storage-abuse, so the window is long and the ceiling is low.
 */
export const registrationRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: config.nodeEnv === 'development' ? 100 : 10,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    store: new LazyRedisStore('rl:register:'),
    // Pre-authentication (or mid-onboarding), so IP is the only trustworthy signal.
    keyGenerator: (req) => normaliseIp(req.ip),
    message: {
        success: false,
        message: 'Too many registration attempts. Please try again later.'
    }
});
