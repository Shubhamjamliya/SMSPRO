import http from 'http';
import app from './src/app.js';
import { config } from './src/config/env.js';
import { validateConfig } from './src/config/validateEnv.js';
import { connectDB, disconnectDB } from './src/config/db.js';
import { connectRedis, closeRedis } from './src/config/redis.js';
import { initSocket } from './src/config/socket.js';
import { initializeQueues, closeBullMQConnection } from './src/queues/index.js';
import { expireExpiredOffers } from './src/modules/food/admin/services/admin.service.js';
import { syncExpiredFssaiNotifications } from './src/modules/food/restaurant/services/fssaiExpiry.service.js';
import { sweepOutboxOnce } from './src/core/notifications/orderOutboxRelay.service.js';
import { startRideDispatchCron } from './src/modules/taxi/cron/rideDispatch.cron.js';
import { startTripDispatchCron } from './src/modules/porter/cron/tripDispatch.cron.js';
import { startConstructionDocumentExpiryCron } from './src/modules/construction/cron/documentExpiry.cron.js';
import { startConstructionPipelineCron, startConstructionProjectCron, startConstructionScoreCron } from './src/modules/construction/cron/pipeline.cron.js';

import { logger } from './src/utils/logger.js';
import { initializeFirebaseRealtime } from './src/config/firebase.js';

const SHUTDOWN_TIMEOUT_MS = 10000;
let server = null;
let expireOffersInterval = null;
let fssaiExpiryInterval = null;
let outboxSweepInterval = null;
let bikeRentBookingSweepInterval = null;
let quickSellerPendingExpireInterval = null;
let bikeRentSettlementSweepInterval = null;
let serviceProviderDispatchSweepInterval = null;

const gracefulShutdown = async (signal) => {
    logger.info(`${signal} received, starting graceful shutdown`);
    if (!server) {
        process.exit(0);
        return;
    }
    server.close(async () => {
        try {
            await disconnectDB();
            await closeRedis();
            await closeBullMQConnection();
            if (expireOffersInterval) clearInterval(expireOffersInterval);
            if (fssaiExpiryInterval) clearInterval(fssaiExpiryInterval);
            if (outboxSweepInterval) clearInterval(outboxSweepInterval);
            if (bikeRentBookingSweepInterval) clearInterval(bikeRentBookingSweepInterval);
            if (quickSellerPendingExpireInterval) clearInterval(quickSellerPendingExpireInterval);
            if (bikeRentSettlementSweepInterval) clearInterval(bikeRentSettlementSweepInterval);
            if (serviceProviderDispatchSweepInterval) clearInterval(serviceProviderDispatchSweepInterval);
            logger.info('Graceful shutdown complete');
            process.exit(0);
        } catch (err) {
            logger.error(`Shutdown error: ${err.message}`);
            process.exit(1);
        }
    });
    setTimeout(() => {
        logger.error('Shutdown timeout, forcing exit');
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
};

const startServer = async () => {
    try {
        validateConfig();
        initializeFirebaseRealtime();

        // 1. Connect to Database (MongoDB)
        await connectDB();

        // 2. Create HTTP server from Express app
        const httpServer = http.createServer(app);

        // 3. Initialize Socket.IO with the HTTP server (Redis adapter when Redis enabled)
        await initSocket(httpServer);

        if (config.redisEnabled) {
            await connectRedis();
        }
        
        // 5a. Watchdog: Recover stuck orders from previous run
        try {
            const { recoverStuckOrders } = await import('./src/modules/food/orders/services/order.service.js');
            await recoverStuckOrders();
        } catch (err) {
            logger.error(`Watchdog startup error: ${err.message}`);
        }

        // 5. Conditionally initialize BullMQ queues.
        // BullMQ requires Redis; skip queue bootstrap when Redis is disabled.
        if (config.bullmqEnabled && config.redisEnabled) {
            try {
                initializeQueues();
            } catch (err) {
                logger.error(`BullMQ initialization error (server continues): ${err.message}`);
            }
        } else if (config.bullmqEnabled && !config.redisEnabled) {
            logger.warn('BullMQ is enabled but Redis is disabled. Queue initialization skipped.');
        }

        // 6. Start the HTTP server
        server = httpServer.listen(config.port, config.host, () => {
            logger.info(`Server running in ${config.nodeEnv} mode on ${config.host}:${config.port}`);
            console.log(`🌐 [URL] http://localhost:${config.port}`);
        });

        const runExpire = async () => {
            try {
                await expireExpiredOffers();
            } catch (err) {
                logger.error(`Expire offers error: ${err.message}`);
            }
        };
        runExpire();
        expireOffersInterval = setInterval(runExpire, 5 * 60 * 1000);

        const runFssaiExpirySync = async () => {
            try {
                await syncExpiredFssaiNotifications();
            } catch (err) {
                logger.error(`FSSAI expiry sync error: ${err.message}`);
            }
        };
        runFssaiExpirySync();
        fssaiExpiryInterval = setInterval(runFssaiExpirySync, 60 * 60 * 1000);

        // Outbox relay + escalation watchdog (Phase 3): re-deliver unpublished order events
        // and escalate unacked ring events. Leader-locked via Redis for multi-instance safety.
        const runOutboxSweep = async () => {
            try {
                await sweepOutboxOnce();
            } catch (err) {
                logger.error(`Outbox sweep error: ${err.message}`);
            }
        };
        outboxSweepInterval = setInterval(runOutboxSweep, 5000);

        // Bike Rent: expire unpaid bookings + mark no-shows past pickup window
        const runBikeRentBookingSweep = async () => {
            try {
                const { runBookingMaintenanceSweep } = await import(
                    './src/modules/bike-rent/services/bookingEngine.service.js'
                );
                await runBookingMaintenanceSweep();
            } catch (err) {
                logger.error(`Bike Rent booking sweep error: ${err.message}`);
            }
        };
        runBikeRentBookingSweep();
        bikeRentBookingSweepInterval = setInterval(runBikeRentBookingSweep, 60 * 1000);

        // Quick Commerce: auto-cancel seller-pending orders after accept window expires
        const runQuickSellerPendingExpire = async () => {
            try {
                const { expireSellerPendingQuickOrders } = await import(
                    './src/modules/quick-commerce/services/expireSellerPending.service.js'
                );
                await expireSellerPendingQuickOrders();
            } catch (err) {
                logger.error(`Quick seller-pending expire error: ${err.message}`);
            }
        };
        runQuickSellerPendingExpire();
        quickSellerPendingExpireInterval = setInterval(runQuickSellerPendingExpire, 15 * 1000);
        // Bike Rent: auto-generate monthly vendor settlements once the configured day arrives.
        // Idempotent per vendor+period, so running this daily (or even more often) is safe.
        const runBikeRentSettlementSweep = async () => {
            try {
                const { getSettings } = await import('./src/modules/bike-rent/services/settings.service.js');
                const { runMonthlySettlementIfDue } = await import(
                    './src/modules/bike-rent/services/monthlySettlementService.js'
                );
                const settings = await getSettings();
                const result = await runMonthlySettlementIfDue(settings.settlementDayOfMonth);
                if (result.ran && result.results.length) {
                    logger.info(`Bike Rent monthly settlement: generated ${result.results.length} vendor settlement(s) for ${result.period}`);
                }
            } catch (err) {
                logger.error(`Bike Rent settlement sweep error: ${err.message}`);
            }
        };
        runBikeRentSettlementSweep();
        bikeRentSettlementSweepInterval = setInterval(runBikeRentSettlementSweep, 24 * 60 * 60 * 1000);

        // Start Taxi ride dispatch automated resend cron
        startRideDispatchCron();
        // Start Porter trip dispatch automated resend cron (same attempt/radius rules)
        startTripDispatchCron();

        // Construction: warn before a contractor licence lapses and stop treating
        // an expired one as verified (BRD Rule 6). Daily, not interval-based —
        // expiry is a calendar event and repeated warnings are just noise.
        startConstructionDocumentExpiryCron();

        // Construction: expire unanswered leads and stale quotations, and offer
        // the enquiry on to the next contractor (BRD W7, C10).
        startConstructionPipelineCron();

        // Construction: escalate stale stage approvals, alert on delays, release
        // retention when the defect period ends, and reconcile every project's
        // money against the escrow ledger (BRD Q13, C18, §13).
        startConstructionProjectCron();

        // Construction: recalculate contractor trust scores from source data
        // (BRD W18). Runs after the project sweep, because disputes resolved and
        // retentions released there are inputs to the score.
        startConstructionScoreCron();

        // Service Provider: advance/expire stalled dispatch offers (a provider who never
        // accepts/rejects within the configured window) — same interval-sweep shape as
        // the Bike Rent booking sweep above, ticking faster since offer windows are short.
        const runServiceProviderDispatchSweep = async () => {
            try {
                const { sweepStalledRequests } = await import(
                    './src/modules/service-provider/services/dispatch.service.js'
                );
                await sweepStalledRequests();
            } catch (err) {
                logger.error(`Service Provider dispatch sweep error: ${err.message}`);
            }
        };
        runServiceProviderDispatchSweep();
        serviceProviderDispatchSweepInterval = setInterval(runServiceProviderDispatchSweep, 10 * 1000);

        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // Handle nodemon restart

        // Handle server errors (like EADDRINUSE)
        server.on('error', async (err) => {
            if (err.code === 'EADDRINUSE') {
                logger.error(`Port ${config.port} is already in use.`);
                if (config.nodeEnv === 'development') {
                    logger.info('Attempting to clear the port automatically...');
                    try {
                        const { execSync } = await import('child_process');
                        if (process.platform === 'win32') {
                            const stdout = execSync(`netstat -ano | findstr :${config.port}`).toString();
                            const lines = stdout.split('\n');
                            const listeningLine = lines.find(line => line.includes('LISTENING'));
                            if (listeningLine) {
                                const pid = listeningLine.trim().split(/\s+/).pop();
                                if (pid && pid !== process.pid.toString()) {
                                    execSync(`taskkill /F /PID ${pid}`);
                                    logger.info(`Successfully killed process ${pid} on port ${config.port}. Restarting...`);
                                    // Give it a moment then restart or exit and let nodemon handle it
                                    setTimeout(() => process.exit(0), 1000);
                                    return;
                                }
                            }
                        }
                    } catch (killErr) {
                        logger.error(`Failed to auto-kill process: ${killErr.message}`);
                    }
                }
                logger.info(`Try running: netstat -ano | findstr :${config.port} then taskkill /F /PID <PID>`);
            } else {
                logger.error(`Server Error: ${err.message}`);
            }
            process.exit(1);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (err) => {
            logger.error(`Unhandled Rejection: ${err?.message || err}`);
            if (config.nodeEnv === 'production') {
                if (server) server.close(() => process.exit(1));
                else process.exit(1);
            }
        });

        process.on('uncaughtException', (err) => {
            logger.error(`Uncaught Exception: ${err?.message || err}`);
            if (config.nodeEnv === 'production') {
                process.exit(1);
            }
        });

    } catch (error) {
        logger.error(`Error starting server: ${error.message}`);
        process.exit(1);
    }
};

startServer();

