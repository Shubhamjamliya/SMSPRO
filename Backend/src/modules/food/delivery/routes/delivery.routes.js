import express from "express";
import { upload } from "../../../../middleware/upload.js";
import { authMiddleware } from "../../../../core/auth/auth.middleware.js";
import {
  requireRoles,
  requireFullDriverAccess,
} from "../../../../core/roles/role.middleware.js";
import * as orderController from "../../orders/controllers/order.controller.js";
import {
  registerDeliveryPartnerController,
  updateDeliveryPartnerProfileController,
  updateDeliveryPartnerBankDetailsController,
  listSupportTicketsController,
  createSupportTicketController,
  getSupportTicketByIdController,
  updateDeliveryPartnerDetailsController,
  updateDeliveryPartnerProfilePhotoBase64Controller,
  updateAvailabilityController,
  getWalletController,
  createWithdrawalRequestController,
  createCashDepositOrderController,
  verifyCashDepositPaymentController,
  createWalletTopupOrderController,
  verifyWalletTopupPaymentController,
  getEarningsController,
  getTripHistoryController,
  getPocketDetailsController,
  getEmergencyHelpController,
  getCashLimitController,
  getDeliveryReferralStatsController,
  getActiveEarningAddonsController,
  deleteDeliveryPartnerAccountController,
  submitDeliveryManualDepositController,
  getDeliveryOnboardingStatusController,
  getDriverOnboardingConfigController,
  resubmitDriverModulesController,
  getMyDriverOnboardingController,
  getDriverOnboardingDraftController,
  saveDriverOnboardingDraftController,
} from "../controllers/delivery.controller.js";
import { getDepositPaymentSettingsPublicController } from "../../admin/controllers/admin.controller.js";
import {
  registrationRateLimiter,
  sensitiveActionRateLimiter,
} from "../../../../middleware/rateLimit.js";
import { idempotency } from "../../../../middleware/idempotency.js";

const router = express.Router();

const uploadFields = upload.fields([
  { name: "profilePhoto", maxCount: 1 },
  { name: "aadharPhoto", maxCount: 1 },
  { name: "aadharFront", maxCount: 1 },
  { name: "aadharBack", maxCount: 1 },
  { name: "panPhoto", maxCount: 1 },
  { name: "drivingLicensePhoto", maxCount: 1 },
  { name: "drivingLicenseFront", maxCount: 1 },
  { name: "drivingLicenseBack", maxCount: 1 },
  { name: "rcPhoto", maxCount: 1 },
  { name: "rcFront", maxCount: 1 },
  { name: "rcBack", maxCount: 1 },
  { name: "insurancePhoto", maxCount: 1 },
  { name: "pucPhoto", maxCount: 1 },
  { name: "vehiclePermitPhoto", maxCount: 1 },
  { name: "fitnessCertificatePhoto", maxCount: 1 },
  { name: "bankProof", maxCount: 1 },
  { name: "upiQrCode", maxCount: 1 },
  { name: "vehicleImage", maxCount: 1 },
]);

router.get(
  "/onboarding-config",
  registrationRateLimiter,
  getDriverOnboardingConfigController,
);

router.post(
  "/register",
  registrationRateLimiter,
  uploadFields,
  registerDeliveryPartnerController,
);
router.get(
  "/onboarding-status",
  registrationRateLimiter,
  getDeliveryOnboardingStatusController,
);

router.get(
  "/onboarding/me",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  getMyDriverOnboardingController,
);

router.get(
  "/onboarding/draft",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  getDriverOnboardingDraftController,
);

router.patch(
  "/onboarding/draft",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  uploadFields,
  saveDriverOnboardingDraftController,
);

router.post(
  "/onboarding/resubmit",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  uploadFields,
  resubmitDriverModulesController,
);

router.patch(
  "/profile",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  uploadFields,
  updateDeliveryPartnerProfileController,
);
router.delete(
  "/profile",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  deleteDeliveryPartnerAccountController,
);

// JSON-only profile updates (no files) – safe for web updates like vehicle number.
router.patch(
  "/profile/details",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  updateDeliveryPartnerDetailsController,
);

// Base64 profile photo update – designed for Flutter in-app WebView camera handler.
router.post(
  "/profile/photo-base64",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  updateDeliveryPartnerProfilePhotoBase64Controller,
);

router.patch(
  "/profile/bank-details",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  uploadFields,
  updateDeliveryPartnerBankDetailsController,
);

router.patch(
  "/availability",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  requireFullDriverAccess,
  updateAvailabilityController,
);

router.get(
  "/support-tickets",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  listSupportTicketsController,
);
router.post(
  "/support-tickets",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  createSupportTicketController,
);
router.get(
  "/support-tickets/:id",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  getSupportTicketByIdController,
);

// ----- Orders -----
router.get(
  "/orders/current",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  requireFullDriverAccess,
  orderController.getCurrentTripDeliveryController,
);
router.get(
  "/orders/available",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  requireFullDriverAccess,
  orderController.listOrdersAvailableDeliveryController,
);
router.get(
  "/orders/:orderId",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  requireFullDriverAccess,
  orderController.getOrderByIdDeliveryController,
);
router.patch(
  "/orders/:orderId/accept",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  requireFullDriverAccess,
  idempotency(),
  orderController.acceptOrderDeliveryController,
);
router.patch(
  "/orders/:orderId/reject",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  requireFullDriverAccess,
  idempotency(),
  orderController.rejectOrderDeliveryController,
);
router.patch(
  "/orders/:orderId/reached-pickup",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  requireFullDriverAccess,
  idempotency(),
  orderController.confirmReachedPickupDeliveryController,
);
router.patch(
  "/orders/:orderId/confirm-pickup",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  requireFullDriverAccess,
  idempotency(),
  orderController.confirmPickupDeliveryController,
);
router.patch(
  "/orders/:orderId/reached-drop",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  requireFullDriverAccess,
  idempotency(),
  orderController.confirmReachedDropDeliveryController,
);
router.post(
  "/orders/:orderId/verify-drop-otp",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  requireFullDriverAccess,
  idempotency(),
  orderController.verifyDropOtpDeliveryController,
);
router.patch(
  "/orders/:orderId/complete",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  requireFullDriverAccess,
  idempotency(),
  orderController.completeDeliveryController,
);
router.patch(
  "/orders/:orderId/status",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  requireFullDriverAccess,
  idempotency(),
  orderController.updateOrderStatusDeliveryController,
);
router.post(
  "/orders/:orderId/collect/qr",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  requireFullDriverAccess,
  orderController.createCollectQrController,
);
router.get(
  "/orders/:orderId/payment-status",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  requireFullDriverAccess,
  orderController.getPaymentStatusController,
);

// ----- Earnings / Settings -----
router.get(
  "/earning-addons/active",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  getActiveEarningAddonsController,
);
router.post(
  "/reverify",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  (req, res) => res.json({ success: true, message: "Submitted" }),
); // Stub

// Pocket / requests page – wallet, earnings, and admin-set delivery settings
router.get(
  "/wallet",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  getWalletController,
);
router.post(
  "/wallet/withdraw",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  sensitiveActionRateLimiter,
  createWithdrawalRequestController,
);
router.post(
  "/wallet/deposit/order",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  sensitiveActionRateLimiter,
  createCashDepositOrderController,
);
router.post(
  "/wallet/deposit/verify",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  sensitiveActionRateLimiter,
  verifyCashDepositPaymentController,
);
router.post(
  "/wallet/topup/order",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  sensitiveActionRateLimiter,
  createWalletTopupOrderController,
);
router.post(
  "/wallet/topup/verify",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  sensitiveActionRateLimiter,
  verifyWalletTopupPaymentController,
);
router.post(
  "/wallet/deposit/manual",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  sensitiveActionRateLimiter,
  upload.single("paymentProof"),
  submitDeliveryManualDepositController,
);
router.get(
  "/wallet/deposit/settings",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  getDepositPaymentSettingsPublicController,
);
router.get(
  "/earnings",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  getEarningsController,
);
router.get(
  "/trip-history",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  getTripHistoryController,
);
router.get(
  "/pocket-details",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  getPocketDetailsController,
);
router.get(
  "/emergency-help",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  getEmergencyHelpController,
);
router.get(
  "/cash-limit",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  getCashLimitController,
);
router.get(
  "/referrals/stats",
  authMiddleware,
  requireRoles("DELIVERY_PARTNER"),
  getDeliveryReferralStatsController,
);

export default router;
