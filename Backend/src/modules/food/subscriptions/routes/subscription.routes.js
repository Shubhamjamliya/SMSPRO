import express from 'express';
import * as subscriptionController from '../controllers/subscription.controller.js';
import { authMiddleware } from '../../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../../core/roles/role.middleware.js';
import { cacheResponse } from '../../../../middleware/cache.js';
import { sensitiveActionRateLimiter } from '../../../../middleware/rateLimit.js';

const router = express.Router();

router.get('/plans', cacheResponse(600, 'subscription_plans'), subscriptionController.getPlansController);

// Protected routes for users (Restaurants and Delivery Partners)
router.use(authMiddleware);
router.use(requireRoles('RESTAURANT', 'DELIVERY_PARTNER'));
router.get('/my-subscription', subscriptionController.getMySubscriptionController);
router.post('/purchase', sensitiveActionRateLimiter, subscriptionController.initiatePurchaseController);
router.post('/verify', sensitiveActionRateLimiter, subscriptionController.verifyPurchaseController);
router.post('/cancel-auto-renew', subscriptionController.cancelAutoRenewController);

// Wallet Topup & Eligibility
router.post('/wallet/topup', sensitiveActionRateLimiter, subscriptionController.createTopupOrderController);
router.post('/wallet/verify', sensitiveActionRateLimiter, subscriptionController.verifyTopupController);
router.get('/wallet/ledger', subscriptionController.getWalletLedgerController);
router.get('/eligibility', subscriptionController.getSubscriptionEligibilityController);

export default router;
