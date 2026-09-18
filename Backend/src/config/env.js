import dotenv from 'dotenv';

dotenv.config();

const isProd = (process.env.NODE_ENV || 'development') === 'production';

/**
 * Parse a comma-separated origin list into an array usable by the `cors` package.
 * Entries wrapped in `/.../` are treated as regular expressions so Vercel-style
 * preview domains can be allow-listed without hardcoding them in app.js.
 */
const parseCorsOrigins = (raw) => {
    if (!raw) return null;
    const entries = String(raw)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    if (!entries.length) return null;
    if (entries.length === 1 && entries[0] === '*') return '*';
    return entries.map((entry) => {
        if (entry.startsWith('/') && entry.lastIndexOf('/') > 0) {
            const end = entry.lastIndexOf('/');
            try {
                return new RegExp(entry.slice(1, end), entry.slice(end + 1) || undefined);
            } catch {
                return entry;
            }
        }
        return entry;
    });
};

export const config = {
    // Basic server config
    port: process.env.PORT || 5000,
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',

    // Database
    mongodbUri: process.env.MONGO_URI || process.env.MONGODB_URI,

    // JWT
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
    jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES || '7d',

    // OTP
    otpExpiry: process.env.OTP_EXPIRY || '5m',
    otpMaxAttempts: Number(process.env.OTP_MAX_ATTEMPTS || 5),
    otpExpiryMinutes: Number(process.env.OTP_EXPIRY_MINUTES || 10),
    otpExpirySeconds: Number(process.env.OTP_EXPIRY_SECONDS || 300),
    otpRateLimit: Number(process.env.OTP_RATE_LIMIT || 3),
    otpRateWindow: Number(process.env.OTP_RATE_WINDOW || 600),
    useDefaultOtp: process.env.USE_DEFAULT_OTP === 'true',

    // SMS India Hub
    smsIndiaHubUsername: process.env.SMS_INDIA_HUB_USERNAME,
    smsApiKey: process.env.SMS_INDIA_HUB_API_KEY,
    smsSenderId: process.env.SMS_INDIA_HUB_SENDER_ID,
    smsDltTemplateId: process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID,

    // Rate limiting
    rateLimitWindowMinutes: Number(process.env.RATE_LIMIT_WINDOW || 15),
    // Default 500 req/15min per identity — enough for normal multi-tab app usage
    // (location polling, cart updates, order status pings all count against this).
    // Requests are keyed per authenticated user where possible and only fall back
    // to IP for anonymous traffic, so mobile-carrier NAT does not pool many real
    // users into one bucket. See middleware/rateLimit.js.
    rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX || 500),
    authRateLimitWindowMinutes: Number(process.env.AUTH_RATE_LIMIT_WINDOW || 15),
    authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX || 30),
    // High-frequency authenticated endpoints (/sync reconciliation, driver location
    // pings). These legitimately fire every few seconds per active session, so they
    // get their own generous bucket instead of exhausting the global one.
    realtimeRateLimitWindowMinutes: Number(process.env.REALTIME_RATE_LIMIT_WINDOW || 1),
    realtimeRateLimitMax: Number(process.env.REALTIME_RATE_LIMIT_MAX || 240),

    // Security
    bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS || 10),

    // Uploads
    uploadPath: process.env.UPLOAD_PATH || 'uploads/',
    requestBodyLimit: process.env.REQUEST_BODY_LIMIT || '2mb',

    // Redis
    redisEnabled: process.env.REDIS_ENABLED === 'true',
    redisUrl: process.env.REDIS_URL,

    // HTTP response cache (middleware/cache.js)
    // Master kill-switch so caching can be disabled without turning off Redis
    // (Redis is also used for rate limiting, socket fan-out and BullMQ).
    cacheEnabled: process.env.CACHE_ENABLED !== 'false',
    // Multiplier applied to every route TTL. Lets staging run with short TTLs
    // (e.g. 0.1) while production uses the tuned per-route values.
    cacheTtlMultiplier: Number(process.env.CACHE_TTL_MULTIPLIER || 1),
    // Allowing `?_ts=` to bypass the server cache is a free cache-flush primitive
    // for anyone hitting the public API, so it is dev-only by default. Clients that
    // genuinely need fresh data should send `Cache-Control: no-cache`.
    cacheAllowQueryBypass: process.env.CACHE_ALLOW_QUERY_BYPASS === 'true' || !isProd,

    // BullMQ
    bullmqEnabled: process.env.BULLMQ_ENABLED === 'true',
    // Worker tuning — kept in env so a busy queue can be scaled without a code change.
    bullmqWorkerConcurrency: Number(process.env.BULLMQ_WORKER_CONCURRENCY || 5),
    bullmqJobAttempts: Number(process.env.BULLMQ_JOB_ATTEMPTS || 3),
    bullmqBackoffDelayMs: Number(process.env.BULLMQ_BACKOFF_DELAY_MS || 1000),
    // Alert threshold for the /health queue probe.
    bullmqQueueDepthWarn: Number(process.env.BULLMQ_QUEUE_DEPTH_WARN || 1000),

    // Cloudinary
    cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME,
    cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
    cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET,

    // Firebase / FCM
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
    firebaseDatabaseUrl: process.env.FIREBASE_DATABASE_URL || process.env.VITE_FIREBASE_DATABASE_URL,
    firebaseServiceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    firebaseServiceAccount: process.env.FIREBASE_SERVICE_ACCOUNT,
    firebaseWebApiKey: process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY,
    firebaseWebAuthDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN,
    firebaseWebStorageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET,
    firebaseWebMessagingSenderId:
        process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID,
    firebaseWebAppId: process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID,
    firebaseWebMeasurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || process.env.FIREBASE_MEASUREMENT_ID,
    firebaseWebVapidKey: process.env.VITE_FIREBASE_VAPID_KEY || process.env.FIREBASE_VAPID_KEY,
    firebaseVapidPrivateKey: process.env.FIREBASE_VAPID_PRIVATE_KEY,

    // Google Maps (server-side key: Geocoding, Places, Routes, Directions)
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAP_API_KEY,

    // Socket.io. Parsed the same way as CORS_ORIGIN (comma-separated, `/regex/`
    // entries compiled) because Socket.IO's `origin` accepts a string, array or
    // RegExp — passing the raw env string meant a comma-separated list was treated
    // as one literal origin, silently rejecting every real handshake.
    socketCorsOrigin: parseCorsOrigins(process.env.SOCKET_CORS_ORIGIN) || '*',

    // HTTP CORS. Comma-separated; `/regex/` entries are compiled (for preview domains).
    // When unset we keep the historical hardcoded allow-list so an existing deploy
    // that never defined CORS_ORIGIN does not suddenly reject its own frontend;
    // validateEnv warns in production so it gets configured explicitly.
    corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN) || [
        'https://dukaanwallah.vercel.app',
        /^https:\/\/dukaanwallah.*\.vercel\.app$/,
        'http://localhost:5173',
        'http://localhost:3000',
    ],
    corsOriginConfigured: Boolean(process.env.CORS_ORIGIN),

    // Razorpay (payments)
    razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET,
    razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET, // ✅ NEW

    // Email (SMTP) – for admin forgot password OTP etc.
    emailHost: process.env.EMAIL_HOST,
    emailPort: Number(process.env.EMAIL_PORT) || 587,
    emailUser: process.env.EMAIL_USER,
    emailPass: process.env.EMAIL_PASS ? String(process.env.EMAIL_PASS).replace(/\s/g, '') : '',
    emailFrom: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@example.com'
};

export const env = {
    nodeEnv: config.nodeEnv,
    port: Number(config.port),
    mongoUri: config.mongodbUri,
    mongoDbName: process.env.MONGODB_DB_NAME || 'appzeto_food',
    jwtSecret: config.jwtAccessSecret,
    jwtExpiresIn: config.jwtAccessExpiresIn,
    corsOrigin: process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '*',
    cloudinary: {
        cloudName: config.cloudinaryCloudName || '',
        apiKey: config.cloudinaryApiKey || '',
        apiSecret: config.cloudinaryApiSecret || '',
        folder: process.env.CLOUDINARY_FOLDER || 'appzeto-food',
    },
    firebase: {
        databaseURL: process.env.FIREBASE_DATABASE_URL || config.firebaseDatabaseUrl || '',
        serviceAccountPath: config.firebaseServiceAccountPath || '',
        serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || config.firebaseServiceAccount || '',
        vapidPrivateKey: process.env.FIREBASE_VAPID_PRIVATE_KEY || '',
    },

};
