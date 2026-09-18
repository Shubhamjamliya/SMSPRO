import express from 'express';
import {
    calculateOrderController,
    createOrderController,
    verifyPaymentController,
    retryOnlinePaymentController,
    markOnlinePaymentFailedController,
    listOrdersUserController,
    getOrderPaymentsUserController,
    getOrderByIdUserController,
    cancelOrderController,
    submitOrderRatingsController,
    getOrderDropOtpUserController,
    updateOrderInstructionsController
} from '../controllers/order.controller.js';
import { sensitiveActionRateLimiter } from '../../../../middleware/rateLimit.js';
import { idempotency } from '../../../../middleware/idempotency.js';

const router = express.Router();

router.post('/calculate', sensitiveActionRateLimiter, calculateOrderController);
// Idempotent so a double-tap / retry with the same Idempotency-Key can't create two orders.
router.post('/', sensitiveActionRateLimiter, idempotency(), createOrderController);
router.post('/verify-payment', sensitiveActionRateLimiter, idempotency(), verifyPaymentController);
router.post('/:orderId/retry-payment', sensitiveActionRateLimiter, idempotency(), retryOnlinePaymentController);
router.patch('/:orderId/payment-failed', sensitiveActionRateLimiter, idempotency(), markOnlinePaymentFailedController);
router.get('/', listOrdersUserController);
router.get('/:orderId/payments', getOrderPaymentsUserController);
router.get('/:orderId/drop-otp', getOrderDropOtpUserController);
router.get('/:orderId', getOrderByIdUserController);
router.patch('/:orderId/cancel', idempotency(), cancelOrderController);
router.patch('/:orderId/ratings', submitOrderRatingsController);
router.patch('/:orderId/instructions', updateOrderInstructionsController);

export default router;
