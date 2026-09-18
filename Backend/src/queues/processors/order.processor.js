import { logger } from '../../utils/logger.js';

/**
 * BullMQ processor for order lifecycle jobs.
 *
 * Failure contract: a processor communicates failure by THROWING. This function
 * used to catch every error and return `{ processed: true }`, which meant BullMQ
 * saw success every time — so the queue's `attempts: 3` + exponential backoff never
 * engaged, and a transient MongoDB blip during DISPATCH_TIMEOUT_CHECK silently
 * dropped the retry that re-offers an unaccepted order to the next ring of riders.
 * Errors are now logged and rethrown so the configured retry policy applies, and a
 * job that exhausts its attempts lands in `failed` where it is visible.
 *
 * Rethrowing immediately exposed a second, older bug: the dynamic import paths below
 * were `../../../modules/...`, which resolves to `Backend/modules/...` — one level
 * too high, since this file sits at `src/queues/processors/`. Both handlers had
 * therefore been throwing MODULE_NOT_FOUND on every run and the swallowed error made
 * it look like the jobs were succeeding. Corrected to `../../modules/...`.
 *
 * @param {import('bullmq').Job} job
 */
export const processOrderJob = async (job) => {
    const data = job?.data || {};
    const action = data.action || 'unknown';
    const orderId = data.orderId || '';
    const orderMongoId = data.orderMongoId || '';

    logger.info(
        `[BullMQ:order] action=${action} jobId=${job.id} attempt=${job.attemptsMade + 1} orderId=${orderId} orderMongoId=${orderMongoId}`
    );

    try {
        // Handle Smart Dispatch Timeout
        if (action === 'DISPATCH_TIMEOUT_CHECK') {
            const { processDispatchTimeout } = await import('../../modules/food/orders/services/order.service.js');
            // Pass full data object to allow attempt count and other options
            await processDispatchTimeout(orderMongoId, data.partnerId, data);
        }

        // Handle Scheduled Order Activation
        if (action === 'NOTIFY_SCHEDULED_ORDER') {
            const { processScheduledOrderNotification } = await import('../../modules/food/orders/services/order.service.js');
            await processScheduledOrderNotification(orderMongoId);
        }
    } catch (err) {
        logger.error(
            `[BullMQ:order] ${action} failed (jobId=${job.id} attempt=${job.attemptsMade + 1} orderMongoId=${orderMongoId}): ${err.message}`
        );
        throw err;
    }

    return { processed: true, action, jobId: job.id };
};
