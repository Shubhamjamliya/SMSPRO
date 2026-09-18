/**
 * Combined BullMQ worker process.
 *
 * Runs every queue's Worker inside one Node process. The per-queue entrypoints
 * (`order.worker.js`, `otp.worker.js`, ...) still exist for scaling a single hot
 * queue onto its own process, but for a single-VPS deployment one supervised
 * process is cheaper in memory and simpler to keep alive than five.
 *
 * Run via `npm run worker:all` (PM2 manages it as the `smspro-workers` app).
 *
 * Without a worker process running, producers still enqueue successfully and the
 * queues simply grow — order dispatch retries, scheduled-order notifications,
 * location cold-storage sync and subscription expiry all stop happening with no
 * error surfaced to the API. That silent failure mode is why this exists.
 */
import 'dotenv/config';
import { Worker } from 'bullmq';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { getBullMQConnection, closeBullMQConnection } from '../connection.js';
import {
    OTP_QUEUE,
    ORDER_QUEUE,
    PAYMENT_QUEUE,
    TRACKING_QUEUE,
    SUBSCRIPTION_QUEUE,
} from '../queue.constants.js';
import { processOtpJob } from '../processors/otp.processor.js';
import { processOrderJob } from '../processors/order.processor.js';
import { processPaymentJob } from '../processors/payment.processor.js';
import { processTrackingJob } from '../processors/tracking.processor.js';
import { processSubscriptionJob } from '../processors/subscription.processor.js';

/** How long to let in-flight jobs finish before exiting anyway. */
const SHUTDOWN_TIMEOUT_MS = 15000;

/**
 * Per-queue concurrency. Tracking is the highest-volume queue (driver location
 * cold-storage sync) and subscription runs a single batch sweep, so it stays at 1
 * to avoid overlapping runs of the same expiry pass.
 */
const WORKER_SPECS = [
    { name: ORDER_QUEUE, processor: processOrderJob, concurrency: config.bullmqWorkerConcurrency },
    { name: OTP_QUEUE, processor: processOtpJob, concurrency: config.bullmqWorkerConcurrency },
    { name: PAYMENT_QUEUE, processor: processPaymentJob, concurrency: config.bullmqWorkerConcurrency },
    { name: TRACKING_QUEUE, processor: processTrackingJob, concurrency: config.bullmqWorkerConcurrency * 2 },
    { name: SUBSCRIPTION_QUEUE, processor: processSubscriptionJob, concurrency: 1 },
];

const startWorkers = () => {
    if (!config.bullmqEnabled) {
        logger.error('BULLMQ_ENABLED is not true — worker process has nothing to do. Exiting.');
        process.exit(1);
    }

    const connection = getBullMQConnection();
    if (!connection) {
        logger.error('Worker process: Redis connection unavailable (check REDIS_ENABLED / REDIS_URL). Exiting.');
        process.exit(1);
    }

    return WORKER_SPECS.map(({ name, processor, concurrency }) => {
        const worker = new Worker(name, processor, { connection, concurrency });

        worker.on('completed', (job) => logger.info(`[${name}] job ${job.id} completed`));
        // A job that exhausts its attempts is a real incident — it is dropped after
        // 24h by removeOnFail, so log it loudly enough to alert on.
        worker.on('failed', (job, err) => {
            const exhausted = job && job.attemptsMade >= (job.opts?.attempts ?? 1);
            const level = exhausted ? 'error' : 'warn';
            logger[level](
                `[${name}] job ${job?.id} ${exhausted ? 'FAILED PERMANENTLY' : 'failed, will retry'} ` +
                `(attempt ${job?.attemptsMade}/${job?.opts?.attempts ?? 1}): ${err.message}`,
            );
        });
        worker.on('error', (err) => logger.error(`[${name}] worker error: ${err.message}`));

        logger.info(`[${name}] worker started (concurrency=${concurrency})`);
        return worker;
    });
};

const workers = startWorkers();

let shuttingDown = false;
const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, closing ${workers.length} workers`);

    // Bound the wait: worker.close() waits for active jobs to finish, and a job stuck
    // on a hung network call would otherwise block exit until pm2 SIGKILLs us.
    const forceExit = setTimeout(() => {
        logger.error('Worker shutdown timed out, forcing exit');
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    try {
        await Promise.all(workers.map((w) => w.close()));
        await closeBullMQConnection();
        clearTimeout(forceExit);
        logger.info('Workers shut down cleanly');
        process.exit(0);
    } catch (err) {
        clearTimeout(forceExit);
        logger.error(`Worker shutdown error: ${err.message}`);
        process.exit(1);
    }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => {
    logger.error(`Worker unhandled rejection: ${err?.message || err}`);
});
