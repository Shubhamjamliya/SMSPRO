import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoSanitize from 'mongo-sanitize';
import xssClean from 'xss-clean';
import routes from './routes/index.js';
import errorHandler from './middleware/errorHandler.js';
import { responseTimeLogger } from './middleware/responseTimeLogger.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { healthCheck } from './config/health.js';
import { config } from './config/env.js';
import { resolveUploadRoot } from './utils/uploadPaths.js';




const app = express();

// Serve the exact same physical root used by the storage service.
const uploadRoot = resolveUploadRoot();
app.use('/uploads', express.static(uploadRoot, { fallthrough: true, index: false }));
app.use('/api/v1/uploads', express.static(uploadRoot, { fallthrough: true, index: false }));

// Trust first proxy (essential for express-rate-limit if behind a proxy)
app.set('trust proxy', 1);

// Request ID tracing (before other middlewares so all logs can use it)
app.use(requestIdMiddleware);

// Health endpoints (no rate limit, minimal JSON, no secrets)
app.get('/health', async (_req, res) => {
    try {
        const data = await healthCheck();
        // DEGRADED stays 200 so the instance keeps serving traffic while monitoring
        // alerts; only DOWN (no MongoDB) is a non-2xx, which is what the post-deploy
        // gate in .github/workflows/deploy.yml checks.
        res.status(data.status === 'DOWN' ? 503 : 200).json(data);
    } catch (err) {
        res.status(503).json({ status: 'DOWN', error: 'Health check failed' });
    }
});
app.get('/ready', (_req, res) => {
    res.status(200).json({ status: 'ready' });
});

// Security & parsing middlewares
app.use(helmet({
    // Allow Razorpay/bank 3DS popups to talk back to checkout (default same-origin breaks them → about:blank)
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    contentSecurityPolicy: { directives: { defaultSrc: ["'self'"] } },
    hsts: config.nodeEnv === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    xssFilter: true,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// ✅ CORS — driven by CORS_ORIGIN (comma-separated, `/regex/` entries allowed for
// vercel preview URLs). Falls back to the historical allow-list when unset.
app.use(cors({
    origin: config.corsOrigins,
    credentials: true
}));

app.use(morgan('dev'));
app.use(express.json({
    limit: config.requestBodyLimit,
    verify: (req, res, buf) => {
        // ✅ Store rawBody for signature verification (Razorpay Webhooks)
        if (req.originalUrl && req.originalUrl.includes('/webhook/razorpay')) {
            req.rawBody = buf;
        }
    }
}));
app.use(express.urlencoded({ extended: true, limit: config.requestBodyLimit }));

// Protect against NoSQL injection and XSS
app.use((req, _res, next) => {
    req.body = mongoSanitize(req.body);
    req.query = mongoSanitize(req.query);
    req.params = mongoSanitize(req.params);
    next();
});
app.use(xssClean());

// Optional: log API response time (method, path, status, duration) - no sensitive data
app.use('/api', responseTimeLogger);

// API Routes
app.use('/api', routes);

// Error Handling
app.use(errorHandler);

export default app;
