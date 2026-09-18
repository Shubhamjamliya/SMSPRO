import express from 'express';
import { handleRazorpayWebhook } from '../controllers/razorpayWebhook.controller.js';
import { webhookRateLimiter } from '../../../middleware/rateLimit.js';

/** ✅ NEW: Webhook Routes Module */
const router = express.Router();

/**
 * Endpoint for Razorpay payment/refund events (Public)
 * Path: /api/v1/payments/webhook/razorpay
 *
 * Exempt from the global per-IP API limiter (see middleware/rateLimit.js) because
 * provider retries would otherwise trip it and stall payment reconciliation.
 * Authenticity comes from HMAC signature verification in the controller; this
 * limiter is only a backstop against a runaway retry loop.
 */
router.post('/razorpay', webhookRateLimiter, handleRazorpayWebhook);

export default router;
