import mongoose from 'mongoose';
import { config } from './env.js';
import { getRedisClient } from './redis.js';

/**
 * Health check: server, MongoDB, Redis and BullMQ queue depth.
 * Does not expose internal secrets.
 *
 * Returns `status: 'DEGRADED'` (still HTTP 200) when a non-fatal dependency is
 * unhealthy, so a load balancer keeps the instance in rotation while monitoring can
 * still alert. Only a MongoDB outage is treated as DOWN, since nothing works without it.
 */
export const healthCheck = async () => {
    const mongoState = mongoose.connection.readyState;
    const mongoOk = mongoState === 1; // 1 = connected

    let redisOk = null;
    if (config.redisEnabled) {
        const client = getRedisClient();
        redisOk = client ? 'ok' : 'unavailable';
        if (client) {
            try {
                await client.ping();
            } catch {
                redisOk = 'unavailable';
            }
        }
    } else {
        redisOk = 'disabled';
    }

    // Queue depth is the only signal that distinguishes "workers are running" from
    // "jobs are piling up unconsumed" — the API enqueues successfully either way.
    let queues = 'disabled';
    let queuesDegraded = false;
    if (config.bullmqEnabled && config.redisEnabled) {
        try {
            const { getQueueStats } = await import('../queues/index.js');
            const stats = await getQueueStats();
            const waiting = stats.reduce((sum, q) => sum + (q.waiting || 0), 0);
            const failed = stats.reduce((sum, q) => sum + (q.failed || 0), 0);
            queues = { waiting, failed, byQueue: stats };
            queuesDegraded = waiting > config.bullmqQueueDepthWarn;
        } catch (err) {
            queues = 'unavailable';
            queuesDegraded = true;
        }
    }

    const degraded =
        (config.redisEnabled && redisOk !== 'ok') || queuesDegraded;

    return {
        status: mongoOk ? (degraded ? 'DEGRADED' : 'UP') : 'DOWN',
        env: config.nodeEnv,
        mongo: mongoOk ? 'connected' : 'disconnected',
        redis: redisOk,
        queues
    };
};
