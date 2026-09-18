import express from 'express';
import { authMiddleware } from '../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../core/roles/role.middleware.js';
import { sensitiveActionRateLimiter } from '../../../middleware/rateLimit.js';
import { assertModuleEnabled } from '../../../core/modules/moduleEnabled.service.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { requireApprovedServiceProvider } from '../middleware/providerGuard.middleware.js';

import {
  requestServiceProviderOtpController,
  verifyServiceProviderOtpController,
  getServiceProviderMeController,
} from '../controllers/serviceProviderAuth.controller.js';
import {
  getOnboardingDraftController,
  submitOnboardingController,
  updateProviderServicesController,
  getProviderServiceCatalogController,
  getOnboardingZonesController,
  getOnboardingCategoriesController,
  getOnboardingServicesController,
} from '../controllers/serviceProviderOnboarding.controller.js';
import {
  listServiceProvidersController,
  getServiceProviderByIdController,
  approveServiceProviderController,
  rejectServiceProviderController,
  suspendServiceProviderController,
  activateServiceProviderController,
  adminCreateServiceProviderController,
  adminUpdateServiceProviderController,
} from '../controllers/serviceProviderAdmin.controller.js';
import {
  listCategoriesController,
  createCategoryController,
  updateCategoryController,
  deleteCategoryController,
  listServicesController,
  createServiceController,
  updateServiceController,
  deleteServiceController,
  listProvidersForServiceController,
  listZonesController,
  getZoneByIdController,
  createZoneController,
  updateZoneController,
  deleteZoneController,
  updateZoneStatusController,
} from '../controllers/serviceCatalog.controller.js';
import {
  createServiceRequestController,
  listMyServiceRequestsController,
  resubmitServiceRequestController,
  listServiceRequestsController,
  approveServiceRequestController,
  rejectServiceRequestController,
} from '../controllers/serviceRequest.controller.js';
import {
  createCategoryRequestController,
  listMyCategoryRequestsController,
  resubmitCategoryRequestController,
  listCategoryRequestsController,
  approveCategoryRequestController,
  rejectCategoryRequestController,
} from '../controllers/categoryRequest.controller.js';
import {
  detectCustomerZoneController,
  listCustomerServicesController,
  listSelectableZonesController,
} from '../controllers/customerCatalog.controller.js';
import {
  getMyAvailabilityController,
  updateWeeklyScheduleController,
  addUnavailableDateController,
  removeUnavailableDateController,
} from '../controllers/availability.controller.js';
import { getZoneSlotsController, getEligibleProvidersController } from '../controllers/discovery.controller.js';
import {
  createBookingRequestController,
  listIncomingRequestsController,
  acceptRequestController,
  rejectRequestController,
} from '../controllers/dispatch.controller.js';
import {
  markOnTheWayController,
  markArrivedController,
  startServiceController,
  completeServiceController,
  confirmCompletionController,
  addExtraChargeController,
  respondToExtraChargeController,
  submitRatingController,
  submitCustomerRatingController,
} from '../controllers/execution.controller.js';
import {
  previewCancellationController,
  cancelByCustomerController,
  cancelByProviderController,
} from '../controllers/cancellation.controller.js';
import {
  payForBookingController,
  verifyBookingPaymentController,
  markBookingPaymentFailedController,
} from '../controllers/payment.controller.js';
import {
  listMyBookingsController,
  listProviderBookingsController,
  getBookingDetailController,
} from '../controllers/booking.controller.js';
import { getFeeSettingsController, updateFeeSettingsController } from '../controllers/feeSettings.controller.js';
import {
  getOperationalSettingsController,
  updateOperationalSettingsController,
} from '../controllers/operationalSettings.controller.js';

const router = express.Router();

/** Route-level module kill-switch — 503s every provider-facing endpoint when the
 *  Service Provider module is disabled from Admin Global Settings. */
const requireServiceProviderModuleEnabled = asyncHandler(async (_req, _res, next) => {
  await assertModuleEnabled('serviceProvider');
  next();
});

const providerAuth = [authMiddleware, requireRoles('SERVICE_PROVIDER'), requireServiceProviderModuleEnabled];
// Operational endpoints additionally require a fresh DB approval check — mirrors
// bike-rent's vendorAuth vs vendorOpsAuth split (requireApprovedVendor).
const providerOpsAuth = [...providerAuth, requireApprovedServiceProvider];
const adminOrEmployee = [authMiddleware, requireRoles('ADMIN', 'EMPLOYEE')];
// Customer-facing booking actions reuse the centralized FoodUser/USER role — same
// convention as Bike Rent's own user-facing booking routes, no separate identity.
const userAuth = [authMiddleware, requireRoles('USER'), requireServiceProviderModuleEnabled];
// Booking-detail/cancel readable by whichever side owns the booking (customer,
// provider, or staff) — ownership is enforced inside the service, never by role alone.
const bookingPartyAuth = [authMiddleware, requireServiceProviderModuleEnabled];

// ---------- Public customer catalog (zone-aware, Admin Price only) ----------
router.get('/public/zones/detect', requireServiceProviderModuleEnabled, detectCustomerZoneController);
router.get('/public/services', requireServiceProviderModuleEnabled, listCustomerServicesController);
router.get('/public/availability/zone-slots', requireServiceProviderModuleEnabled, getZoneSlotsController);
router.get('/public/providers', requireServiceProviderModuleEnabled, getEligibleProvidersController);

// ---------- Provider auth (public) ----------
router.post(
  '/auth/request-otp',
  sensitiveActionRateLimiter,
  requireServiceProviderModuleEnabled,
  requestServiceProviderOtpController,
);
router.post(
  '/auth/verify-otp',
  sensitiveActionRateLimiter,
  requireServiceProviderModuleEnabled,
  verifyServiceProviderOtpController,
);

// ---------- Provider onboarding (protected, not-yet-approved providers included) ----------
router.get('/me', ...providerAuth, getServiceProviderMeController);
router.get('/onboarding/zones', ...providerAuth, getOnboardingZonesController);
router.get('/onboarding/categories', ...providerAuth, getOnboardingCategoriesController);
router.get('/onboarding/services', ...providerAuth, getOnboardingServicesController);
router.post('/onboarding/submit', ...providerAuth, sensitiveActionRateLimiter, submitOnboardingController);

// ---------- Provider dashboard + ops (protected, approved providers only) ----------
router.get('/dashboard', ...providerOpsAuth, getOnboardingDraftController);

// ---------- Provider: service requests (request a service that isn't in the catalog yet) ----------
router.post('/service-requests', ...providerOpsAuth, createServiceRequestController);
router.get('/service-requests', ...providerOpsAuth, listMyServiceRequestsController);
router.patch('/service-requests/:id', ...providerOpsAuth, resubmitServiceRequestController);

// ---------- Provider: category requests (request a category that isn't in the catalog yet) ----------
router.post('/category-requests', ...providerOpsAuth, createCategoryRequestController);
router.get('/category-requests', ...providerOpsAuth, listMyCategoryRequestsController);
router.patch('/category-requests/:id', ...providerOpsAuth, resubmitCategoryRequestController);

// ---------- Post-onboarding self-management (services offered) ----------
// Zones are admin-only: a provider selects their one zone once, during onboarding
// (see /onboarding/zones + /onboarding/submit) and cannot create, edit, or change it after.
router.patch('/services', ...providerOpsAuth, updateProviderServicesController);

// ---------- Provider: availability (own weekly schedule, breaks, unavailable dates) ----------
router.get('/availability', ...providerOpsAuth, getMyAvailabilityController);
router.patch('/availability/schedule', ...providerOpsAuth, updateWeeklyScheduleController);
router.post('/availability/unavailable-dates', ...providerOpsAuth, addUnavailableDateController);
router.delete('/availability/unavailable-dates/:id', ...providerOpsAuth, removeUnavailableDateController);

// ---------- Provider: own bookings (read-only schedule visibility) ----------
router.get('/provider-bookings', ...providerOpsAuth, listProviderBookingsController);

// ---------- Provider: incoming dispatch requests ----------
router.get('/requests/incoming', ...providerOpsAuth, listIncomingRequestsController);
router.post('/requests/:id/accept', ...providerOpsAuth, sensitiveActionRateLimiter, acceptRequestController);
router.post('/requests/:id/reject', ...providerOpsAuth, rejectRequestController);

// ---------- Provider: job execution (on an accepted booking) ----------
router.post('/bookings/:id/on-the-way', ...providerOpsAuth, markOnTheWayController);
router.post('/bookings/:id/arrived', ...providerOpsAuth, markArrivedController);
router.post('/bookings/:id/start', ...providerOpsAuth, startServiceController);
router.post('/bookings/:id/complete', ...providerOpsAuth, completeServiceController);
router.post('/bookings/:id/extra-charge', ...providerOpsAuth, addExtraChargeController);
router.post('/bookings/:id/customer-rating', ...providerOpsAuth, submitCustomerRatingController);
// Deliberately a distinct path from the customer's own /bookings/:id/cancel below —
// registering the same PATCH path twice would let Express's first-match-wins routing
// silently shadow one of the two (a provider-cancel middleware chain would reject every
// customer cancel attempt with 403 before ever reaching the customer's handler).
router.patch('/bookings/:id/provider-cancel', ...providerOpsAuth, cancelByProviderController);

// ---------- Customer: booking request lifecycle ----------
router.post('/bookings', ...userAuth, sensitiveActionRateLimiter, createBookingRequestController);
router.get('/bookings/mine', ...userAuth, listMyBookingsController);
router.get('/bookings/:id/cancel-preview', ...userAuth, previewCancellationController);
router.patch('/bookings/:id/cancel', ...userAuth, cancelByCustomerController);
router.post('/bookings/:id/confirm-completion', ...userAuth, confirmCompletionController);
router.post('/bookings/:id/extra-charge/:chargeId/respond', ...userAuth, respondToExtraChargeController);
router.post('/bookings/:id/rating', ...userAuth, submitRatingController);
router.post('/bookings/:id/pay', ...userAuth, sensitiveActionRateLimiter, payForBookingController);
router.post('/bookings/:id/verify-payment', ...userAuth, verifyBookingPaymentController);
router.post('/bookings/:id/payment-failed', ...userAuth, markBookingPaymentFailedController);

// ---------- Booking detail (customer / provider / staff — ownership enforced inside) ----------
router.get('/bookings/:id', ...bookingPartyAuth, getBookingDetailController);

// ---------- Catalog (read-only, provider-facing selection UI) ----------
router.get('/categories/catalog', ...providerOpsAuth, listCategoriesController);
// Zone-scoped to the provider's own single zone (not the raw admin catalog) — see
// getProviderServiceCatalog for the eligibility + stale-selection rules.
router.get('/services/catalog', ...providerOpsAuth, getProviderServiceCatalogController);
router.get('/zones/catalog', ...providerOpsAuth, listZonesController);
router.get('/zones/selectable', ...providerOpsAuth, listSelectableZonesController);

// ---------- Admin: providers ----------
router.get('/admin/providers', ...adminOrEmployee, listServiceProvidersController);
router.get('/admin/providers/:id', ...adminOrEmployee, getServiceProviderByIdController);
router.post('/admin/providers', ...adminOrEmployee, adminCreateServiceProviderController);
router.patch('/admin/providers/:id', ...adminOrEmployee, adminUpdateServiceProviderController);
router.patch('/admin/providers/:id/approve', ...adminOrEmployee, approveServiceProviderController);
router.patch('/admin/providers/:id/reject', ...adminOrEmployee, rejectServiceProviderController);
router.patch('/admin/providers/:id/suspend', ...adminOrEmployee, suspendServiceProviderController);
router.patch('/admin/providers/:id/activate', ...adminOrEmployee, activateServiceProviderController);

// ---------- Admin: catalog CRUD ----------
router.get('/admin/categories', ...adminOrEmployee, listCategoriesController);
router.post('/admin/categories', ...adminOrEmployee, createCategoryController);
router.patch('/admin/categories/:id', ...adminOrEmployee, updateCategoryController);
router.delete('/admin/categories/:id', ...adminOrEmployee, deleteCategoryController);

router.get('/admin/services', ...adminOrEmployee, listServicesController);
router.post('/admin/services', ...adminOrEmployee, createServiceController);
router.patch('/admin/services/:id', ...adminOrEmployee, updateServiceController);
router.delete('/admin/services/:id', ...adminOrEmployee, deleteServiceController);
router.get('/admin/services/:id/providers', ...adminOrEmployee, listProvidersForServiceController);

router.get('/admin/zones', ...adminOrEmployee, listZonesController);
router.get('/admin/zones/:id', ...adminOrEmployee, getZoneByIdController);
router.post('/admin/zones', ...adminOrEmployee, createZoneController);
router.patch('/admin/zones/:id', ...adminOrEmployee, updateZoneController);
router.patch('/admin/zones/:id/status', ...adminOrEmployee, updateZoneStatusController);
router.delete('/admin/zones/:id', ...adminOrEmployee, deleteZoneController);

// ---------- Admin: service requests ----------
router.get('/admin/service-requests', ...adminOrEmployee, listServiceRequestsController);
router.patch('/admin/service-requests/:id/approve', ...adminOrEmployee, approveServiceRequestController);
router.patch('/admin/service-requests/:id/reject', ...adminOrEmployee, rejectServiceRequestController);

// ---------- Admin: category requests ----------
router.get('/admin/category-requests', ...adminOrEmployee, listCategoryRequestsController);
router.patch('/admin/category-requests/:id/approve', ...adminOrEmployee, approveCategoryRequestController);
router.patch('/admin/category-requests/:id/reject', ...adminOrEmployee, rejectCategoryRequestController);

// ---------- Admin: booking fee/tax + dispatch/cancellation settings ----------
router.get('/admin/fee-settings', ...adminOrEmployee, getFeeSettingsController);
router.patch('/admin/fee-settings', ...adminOrEmployee, updateFeeSettingsController);
router.get('/admin/operational-settings', ...adminOrEmployee, getOperationalSettingsController);
router.patch('/admin/operational-settings', ...adminOrEmployee, updateOperationalSettingsController);

export default router;
