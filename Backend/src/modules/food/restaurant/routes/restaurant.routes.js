import express from 'express';
import { upload } from '../../../../middleware/upload.js';
import { idempotency } from '../../../../middleware/idempotency.js';
import {
    registerRestaurantController,
    saveOnboardingStepController,
    getOnboardingDraftController,
    activateRestaurantSessionController,
    listApprovedRestaurantsController,
    getApprovedRestaurantController,
    listPublicOffersController,
    getCurrentRestaurantController,
    updateRestaurantProfileController,
    updateRestaurantAcceptingOrdersController,
    updateCurrentRestaurantDiningSettingsController,
    uploadRestaurantProfileImageController,
    uploadRestaurantMenuImageController,
    uploadRestaurantCoverImagesController,
    uploadRestaurantMenuImagesController,
    getRestaurantComplaintsController,
    deleteRestaurantAccountController,
    getRestaurantReferralStatsController,
    getRestaurantReferralDetailsController,
    checkSubscriptionEligibilityController,
} from '../controllers/restaurant.controller.js';
import {
    createRestaurantSupportTicketController,
    listRestaurantSupportTicketsController
} from '../controllers/supportTicket.controller.js';
import {
    createWithdrawalRequestController,
    listMyWithdrawalsController
} from '../controllers/withdrawal.controller.js';
import {
    listCategoriesController,
    createCategoryController,
    updateCategoryController,
    deleteCategoryController
} from '../controllers/restaurantCategory.controller.js';
import { getMenuController, updateMenuController, getPublicRestaurantMenuController, getMenuItemsController } from '../controllers/restaurantMenu.controller.js';
import { getPublicRestaurantAddonsController } from '../controllers/publicAddons.controller.js';
import * as feedbackExperienceController from '../../admin/controllers/feedbackExperience.controller.js';
import {
    getOutletTimingsByRestaurantIdController,
    getCurrentRestaurantOutletTimingsController,
    upsertCurrentRestaurantOutletTimingsController
} from '../controllers/outletTimings.controller.js';
import {
    createRestaurantFoodController,
    updateRestaurantFoodController
} from '../controllers/restaurantFood.controller.js';
import {
    listAddonsController,
    createAddonController,
    updateAddonController,
    deleteAddonController
} from '../controllers/restaurantAddon.controller.js';
import * as orderController from '../../orders/controllers/order.controller.js';
import { authMiddleware } from '../../../../core/auth/auth.middleware.js';
import { sendError } from '../../../../utils/response.js';
import { getRestaurantFinanceController, getRestaurantSubscriptionWalletController } from '../controllers/restaurantFinance.controller.js';
import { createTopupOrderController, verifyTopupController } from '../../subscriptions/controllers/subscription.controller.js';

import {
    listRestaurantCouponsController,
    createRestaurantCouponController,
    updateRestaurantCouponController,
    deleteRestaurantCouponController
} from '../controllers/restaurantCoupon.controller.js';

import { cacheResponse, invalidateCacheAfter } from '../../../../middleware/cache.js';
import { CACHE_PREFIX, CACHE_TTL, INVALIDATION_GROUPS } from '../../../../config/cacheKeys.js';
import { registrationRateLimiter, sensitiveActionRateLimiter } from '../../../../middleware/rateLimit.js';

const router = express.Router();

const requireRestaurant = (req, res, next) => {
    if (req.user?.role !== 'RESTAURANT') {
        return sendError(res, 403, 'Restaurant access required');
    }
    next();
};

const uploadFields = upload.fields([
    { name: 'profileImage', maxCount: 1 },
    { name: 'panImage', maxCount: 1 },
    { name: 'gstImage', maxCount: 1 },
    { name: 'fssaiImage', maxCount: 1 },
    { name: 'menuImages', maxCount: 10 }
]);

router.post('/register', registrationRateLimiter, uploadFields, registerRestaurantController);
router.post('/onboarding/step/:step', registrationRateLimiter, uploadFields, saveOnboardingStepController);
router.get('/onboarding/draft', getOnboardingDraftController);
router.post('/onboarding/activate-session', registrationRateLimiter, activateRestaurantSessionController);

// Public: approved restaurants list (for user app).
// TTLs come from CACHE_TTL so they stay consistent with the invalidation groups
// declared in config/cacheKeys.js.
router.get('/restaurants', cacheResponse(CACHE_TTL.SHORT, CACHE_PREFIX.RESTAURANTS), listApprovedRestaurantsController);
router.get('/restaurants/:id', cacheResponse(CACHE_TTL.MEDIUM, CACHE_PREFIX.RESTAURANT_DETAIL), getApprovedRestaurantController);
router.get('/restaurants/:id/menu', cacheResponse(CACHE_TTL.MEDIUM, CACHE_PREFIX.RESTAURANT_MENU), getPublicRestaurantMenuController);
router.get('/restaurants/:id/outlet-timings', cacheResponse(CACHE_TTL.MEDIUM, CACHE_PREFIX.RESTAURANT_TIMINGS), getOutletTimingsByRestaurantIdController);
router.get('/offers', cacheResponse(CACHE_TTL.SHORT, CACHE_PREFIX.OFFERS), listPublicOffersController);
// Public: categories list (zone-aware; returns zone categories + global)
router.get('/categories/public', cacheResponse(CACHE_TTL.MEDIUM, CACHE_PREFIX.CATEGORIES), listCategoriesController);

// Restaurant dashboard/profile (Bearer token + RESTAURANT role)
router.get('/current', authMiddleware, requireRestaurant, getCurrentRestaurantController);
router.patch('/profile', authMiddleware, requireRestaurant, invalidateCacheAfter(INVALIDATION_GROUPS.RESTAURANT), updateRestaurantProfileController);
router.patch('/availability', authMiddleware, requireRestaurant, invalidateCacheAfter(INVALIDATION_GROUPS.RESTAURANT), updateRestaurantAcceptingOrdersController);
router.patch('/dining-settings', authMiddleware, requireRestaurant, invalidateCacheAfter(INVALIDATION_GROUPS.RESTAURANT), updateCurrentRestaurantDiningSettingsController);
router.get('/outlet-timings', authMiddleware, requireRestaurant, getCurrentRestaurantOutletTimingsController);
router.put('/outlet-timings', authMiddleware, requireRestaurant, invalidateCacheAfter(INVALIDATION_GROUPS.TIMINGS), upsertCurrentRestaurantOutletTimingsController);
router.get('/finance', authMiddleware, requireRestaurant, getRestaurantFinanceController);
router.get('/subscription-eligibility', authMiddleware, requireRestaurant, checkSubscriptionEligibilityController);
router.get('/subscription-wallet', authMiddleware, requireRestaurant, getRestaurantSubscriptionWalletController);
router.post('/subscription-topup', authMiddleware, requireRestaurant, sensitiveActionRateLimiter, createTopupOrderController);
router.post('/verify-topup', authMiddleware, requireRestaurant, sensitiveActionRateLimiter, verifyTopupController);
router.post('/withdraw', authMiddleware, requireRestaurant, createWithdrawalRequestController);
router.get('/withdrawals', authMiddleware, requireRestaurant, listMyWithdrawalsController);
router.post(
    '/profile/profile-image',
    authMiddleware,
    requireRestaurant,
    upload.single('file'),
    invalidateCacheAfter(INVALIDATION_GROUPS.RESTAURANT),
    uploadRestaurantProfileImageController
);
router.post(
    '/profile/menu-image',
    authMiddleware,
    requireRestaurant,
    upload.single('file'),
    invalidateCacheAfter(INVALIDATION_GROUPS.MENU),
    uploadRestaurantMenuImageController
);
router.post(
    '/profile/cover-images',
    authMiddleware,
    requireRestaurant,
    upload.array('files', 20),
    invalidateCacheAfter(INVALIDATION_GROUPS.RESTAURANT),
    uploadRestaurantCoverImagesController
);
router.post(
    '/profile/menu-images',
    authMiddleware,
    requireRestaurant,
    upload.array('files', 20),
    invalidateCacheAfter(INVALIDATION_GROUPS.MENU),
    uploadRestaurantMenuImagesController
);

// Categories (restaurant dashboard). Read-only for item creation, CRUD for Menu Categories page.
router.get('/categories', authMiddleware, requireRestaurant, listCategoriesController);
router.post('/categories', authMiddleware, requireRestaurant, invalidateCacheAfter(INVALIDATION_GROUPS.MENU), createCategoryController);
router.patch('/categories/:id', authMiddleware, requireRestaurant, invalidateCacheAfter(INVALIDATION_GROUPS.MENU), updateCategoryController);
router.delete('/categories/:id', authMiddleware, requireRestaurant, invalidateCacheAfter(INVALIDATION_GROUPS.MENU), deleteCategoryController);

// Menu (restaurant dashboard) - only fields needed by UI
router.get('/menu', authMiddleware, requireRestaurant, getMenuController);
router.get('/menu/items', authMiddleware, requireRestaurant, getMenuItemsController);
router.patch('/menu', authMiddleware, requireRestaurant, invalidateCacheAfter(INVALIDATION_GROUPS.MENU), updateMenuController);

// Feedback (restaurant dashboard)
router.post('/feedback-experience', authMiddleware, requireRestaurant, feedbackExperienceController.createFeedbackExperience);

// Public: restaurant add-ons (user app)
router.get('/restaurants/:id/addons', cacheResponse(CACHE_TTL.MEDIUM, CACHE_PREFIX.RESTAURANT_ADDONS), getPublicRestaurantAddonsController);

// Foods (restaurant creates/updates items -> stored in food_items collection)
router.post('/foods', authMiddleware, requireRestaurant, invalidateCacheAfter(INVALIDATION_GROUPS.MENU), createRestaurantFoodController);
router.patch('/foods/:id', authMiddleware, requireRestaurant, invalidateCacheAfter(INVALIDATION_GROUPS.MENU), updateRestaurantFoodController);

// Add-ons (restaurant dashboard) - approval handled by admin.
// Add-ons are embedded in the cached public menu + addons payloads, so writes here
// have to clear the MENU group too — previously they cleared nothing.
router.get('/addons', authMiddleware, requireRestaurant, listAddonsController);
router.post('/addons', authMiddleware, requireRestaurant, invalidateCacheAfter(INVALIDATION_GROUPS.MENU), createAddonController);
router.patch('/addons/:id', authMiddleware, requireRestaurant, invalidateCacheAfter(INVALIDATION_GROUPS.MENU), updateAddonController);
router.delete('/addons/:id', authMiddleware, requireRestaurant, invalidateCacheAfter(INVALIDATION_GROUPS.MENU), deleteAddonController);

// Orders (restaurant dashboard)
router.get('/orders', authMiddleware, requireRestaurant, orderController.listOrdersRestaurantController);
router.get('/orders/:orderId', authMiddleware, requireRestaurant, orderController.getOrderByIdRestaurantController);
router.patch('/orders/:orderId/status', authMiddleware, requireRestaurant, idempotency(), orderController.updateOrderStatusRestaurantController);
router.patch('/orders/:orderId/preparation-time', authMiddleware, requireRestaurant, orderController.updateOrderPreparationTimeRestaurantController);
router.post('/orders/:orderId/resend-notification', authMiddleware, requireRestaurant, orderController.resendDeliveryNotificationRestaurantController);

// Complaints (restaurant dashboard)
router.get('/complaints', authMiddleware, requireRestaurant, getRestaurantComplaintsController);

// Referrals
router.get('/referral-stats', authMiddleware, requireRestaurant, getRestaurantReferralStatsController);
router.get('/referral-details', authMiddleware, requireRestaurant, getRestaurantReferralDetailsController);
router.post('/support/tickets', authMiddleware, requireRestaurant, createRestaurantSupportTicketController);
router.get('/support/tickets', authMiddleware, requireRestaurant, listRestaurantSupportTicketsController);

router.delete('/delete-account', authMiddleware, requireRestaurant, deleteRestaurantAccountController);

// Coupons (restaurant dashboard)
router.get('/coupons', authMiddleware, requireRestaurant, listRestaurantCouponsController);
router.post('/coupons', authMiddleware, requireRestaurant, createRestaurantCouponController);
router.put('/coupons/:id', authMiddleware, requireRestaurant, updateRestaurantCouponController);
router.delete('/coupons/:id', authMiddleware, requireRestaurant, deleteRestaurantCouponController);

export default router;


