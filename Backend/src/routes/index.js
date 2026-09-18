import express from "express";
import authRoutes from "../core/auth/auth.routes.js";
import deliveryRoutes from "../modules/food/delivery/routes/delivery.routes.js";
import restaurantRoutes from "../modules/food/restaurant/routes/restaurant.routes.js";
import mediaRoutes from "../modules/media/routes/media.routes.js";
import landingRoutes from "../modules/food/landing/routes/landing.routes.js";
import {
  getPublicDiningCategories,
  getPublicDiningRestaurants,
} from "../modules/food/dining/controllers/diningPublic.controller.js";
import uploadRoutes from "../modules/uploads/routes/upload.routes.js";
import restaurantAdminRoutes from "../modules/food/admin/routes/admin.routes.js";
import userRoutes from "../modules/food/user/routes/user.routes.js";
import foodCartRoutes from "../modules/food/user/routes/foodCart.routes.js";
import orderUserRoutes from "../modules/food/orders/routes/order.routes.user.js";
import syncRoutes from "../modules/food/orders/routes/sync.routes.js";
import paymentRoutes from "../core/payments/payment.routes.js";
import fcmRoutes from "../core/notifications/fcm.routes.js";
import notificationRoutes from "../core/notifications/notification.routes.js";
import { authMiddleware } from "../core/auth/auth.middleware.js";

import { requireRoles } from "../core/roles/role.middleware.js";
import { getQueuesController } from "../controllers/admin.controller.js";
import { getPublicEnvController } from "../modules/food/landing/controllers/publicEnv.controller.js";
import quickCommerceRoutes from "../modules/quick-commerce/routes/quick-commerce.routes.js";
import webhookRoutes from "../core/payments/routes/webhook.routes.js";
import sellerRoutes from "../modules/quick-commerce/seller/routes/seller.routes.js";
import searchRoutes from "../modules/food/search/routes/search.routes.js";
import subscriptionRoutes from "../modules/food/subscriptions/routes/subscription.routes.js";
import {
  getPublicFeeSummary,
  getPublicDeliverySpeedOptions,
} from "../modules/food/admin/controllers/admin.controller.js";

import commonSettingsRoutes from "../modules/common/routes/settings.routes.js";
import { getGlobalSettings as getPublicSettings } from "../modules/common/controllers/settings.controller.js";
import onboardingFeeRoutes from "../modules/common/routes/onboardingFee.routes.js";
import driverOnboardingAdminRoutes from "../modules/common/routes/driverOnboardingAdmin.routes.js";
import porterRoutes from "../modules/porter/routes/porter.routes.js";
import taxiRoutes from "../modules/taxi/routes/taxi.routes.js";
import bikeRentRoutes from "../modules/bike-rent/routes/bikeRent.routes.js";
import serviceProviderRoutes from "../modules/service-provider/routes/serviceProvider.routes.js";
import constructionRoutes from "../modules/construction/routes/construction.routes.js";
import locationRoutes from "../core/location/location.routes.js";
import { cacheResponse } from "../middleware/cache.js";
import { CACHE_PREFIX, CACHE_TTL } from "../config/cacheKeys.js";

const router = express.Router();

router.get("/v1/health", (req, res) => {
  res.status(200).json({ status: "UP", message: "Server is healthy" });
});

// Centralized location services (geocode, reverse-geocode, autocomplete, road distance)
router.use("/v1/location", locationRoutes);

// Food-prefixed auth routes (preferred)
router.use("/v1/food/auth", authRoutes);

// Backward-compatible auth routes (legacy)
router.use("/v1/auth", authRoutes);
router.use("/v1/food/delivery", deliveryRoutes);
router.use("/v1/food/restaurant", restaurantRoutes);
router.use("/v1/media", mediaRoutes);
router.use("/v1/food/subscriptions", subscriptionRoutes);
// Landing & hero-banners for Food user app (paths start with /food/hero-banners/...)
router.use("/v1/food", landingRoutes);
router.use("/v1/food/search", searchRoutes);
router.get(
  "/v1/food/dining/categories/public",
  cacheResponse(CACHE_TTL.MEDIUM, CACHE_PREFIX.DINING_CATEGORIES, { clientCache: true }),
  getPublicDiningCategories,
);
router.get(
  "/v1/food/dining/restaurants/public",
  cacheResponse(CACHE_TTL.SHORT, CACHE_PREFIX.DINING_RESTAURANTS),
  getPublicDiningRestaurants,
);
router.use("/v1/uploads", uploadRoutes);

// Mark business-settings/public as truly public (must be before protected admin block)
// Global Settings routes
router.use("/v1/common/settings", commonSettingsRoutes);
router.use("/v1/common/onboarding-fees", onboardingFeeRoutes);
router.use("/v1/common/driver-onboarding", driverOnboardingAdminRoutes);

// Backward compatibility for public settings.
// These four are fetched by every client on cold start and again on most order
// screens (fees feed the price breakdown), so they were the highest-volume
// uncached reads in the module. They change only via admin writes, which
// invalidate the SETTINGS group — the TTL is just a backstop.
const cacheBusinessSettings = cacheResponse(
  CACHE_TTL.MEDIUM,
  CACHE_PREFIX.BUSINESS_SETTINGS,
  { clientCache: true },
);
const cacheDeliverySpeed = cacheResponse(
  CACHE_TTL.MEDIUM,
  CACHE_PREFIX.DELIVERY_SPEED_OPTIONS,
  { clientCache: true },
);
const cacheFeeSettings = cacheResponse(
  CACHE_TTL.MEDIUM,
  CACHE_PREFIX.FEE_SETTINGS,
  { clientCache: true },
);

router.get(
  "/v1/food/admin/business-settings/public",
  cacheBusinessSettings,
  getPublicSettings,
);
router.get(
  "/v1/food/delivery-speed-options/public",
  cacheDeliverySpeed,
  getPublicDeliverySpeedOptions,
);
router.get(
  "/v1/food/public/delivery-speed-options",
  cacheDeliverySpeed,
  getPublicDeliverySpeedOptions,
);
router.get("/v1/food/fee-settings/public", cacheFeeSettings, getPublicFeeSummary);
router.get(
  "/v1/food/admin/fee-settings/public",
  cacheFeeSettings,
  getPublicFeeSummary,
);

router.use(
  "/v1/food/admin",
  authMiddleware,
  requireRoles("ADMIN", "EMPLOYEE"),
  restaurantAdminRoutes,
);
router.use("/v1/food/user", authMiddleware, requireRoles("USER"), userRoutes);
router.use(
  "/v1/food/cart",
  authMiddleware,
  requireRoles("USER"),
  foodCartRoutes,
);
router.use(
  "/v1/food/notifications",
  authMiddleware,
  requireRoles("USER", "RESTAURANT", "DELIVERY_PARTNER"),
  notificationRoutes,
);
router.use(
  "/v1/food/orders",
  authMiddleware,
  requireRoles("USER"),
  orderUserRoutes,
);
// State reconciliation (replaces order-status polling). Any authenticated role.
router.use(
  "/v1/food/sync",
  authMiddleware,
  requireRoles("USER", "RESTAURANT", "DELIVERY_PARTNER", "ADMIN", "SELLER"),
  syncRoutes,
);
router.use("/v1/food/payments", authMiddleware, paymentRoutes);
router.use("/v1/payments/webhook", webhookRoutes);
router.use("/v1/fcm-tokens", fcmRoutes);
router.use("/fcm-tokens", fcmRoutes);
router.use("/v1/quick-commerce", quickCommerceRoutes);
router.use("/v1/porter", porterRoutes);
router.use("/v1/taxi", taxiRoutes);
router.use("/v1/bike-rent", bikeRentRoutes);
router.use("/v1/service-provider", serviceProviderRoutes);
router.use("/v1/construction", constructionRoutes);
router.use("/v1/seller", sellerRoutes);

// router.get('/v1/env/public', getPublicEnvController);
// router.get('/env/public', getPublicEnvController);

router.get(
  "/v1/admin/queues",
  authMiddleware,
  requireRoles("ADMIN"),
  getQueuesController,
);

export default router;
