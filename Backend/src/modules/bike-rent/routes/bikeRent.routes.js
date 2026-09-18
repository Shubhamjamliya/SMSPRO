import express from 'express';
import { authMiddleware, checkPermission } from '../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../core/roles/role.middleware.js';
import { sensitiveActionRateLimiter } from '../../../middleware/rateLimit.js';

import {
    listZones,
    getZoneById,
    createZone,
    updateZone,
    patchZoneStatus,
    deleteZone,
    listZoneDropdown,
} from '../controllers/zone.controller.js';

import {
    listHubsByZone,
    getHubById,
    createHub,
    updateHub,
    patchHubStatus,
    deleteHub,
    listHubDropdown,
} from '../controllers/hub.controller.js';

import {
    detectZone,
    listPublicZones,
} from '../controllers/zonePublic.controller.js';

import {
    listCategories,
    getCategoryById,
    createCategory,
    updateCategory,
    patchCategoryStatus,
    deleteCategory,
    listCategoryDropdown,
    listPendingCategories,
    approveCategory,
    rejectCategory,
} from '../controllers/category.controller.js';

import {
    listBikes,
    getBikeById,
    createBike,
    updateBike,
    patchBikeStatus,
    deleteBike,
    listBikeDropdown,
    listPendingBikes,
    approveBike,
    rejectBike,
} from '../controllers/bike.controller.js';

import {
    listPricing,
    getPricingById,
    createPricing,
    updatePricing,
    patchPricingStatus,
    deletePricing,
} from '../controllers/pricing.controller.js';

import {
    listBookings,
    getBookingById,
    patchBookingStatus,
    approveBooking,
    rejectBooking,
    startRide,
    collectDeposit,
    inspectBooking,
    previewLateCharges,
    previewCancellation,
    collectLateBalance,
    releaseDepositRefund,
    resolveExtension,
    reassignBooking,
    overrideNoShow,
} from '../controllers/booking.controller.js';

import {
    listInspections,
    getInspectionById,
    listBookingInspections,
    compareBookingInspections,
} from '../controllers/inspection.controller.js';

import {
    listCustomers,
    getCustomerById,
} from '../controllers/customer.controller.js';

import {
    getDashboard,
    getReports,
    getSettings,
    updateSettings,
    previewNoShowPolicy,
    listWalletTransactions,
    getTaxSettings,
    updateTaxSettings,
    listSettlements,
    getSettlementById,
    getInvoiceById,
    listFinanceTransactions,
    createFinanceAdjustment,
    getBookingInvoice,
    getBookingSettlement,
    getBookingTransactions,
    listMonthlySettlements,
    getMonthlySettlementById,
    generateMonthlySettlements,
    approveMonthlySettlement,
    markMonthlySettlementProcessing,
    markMonthlySettlementPaid,
    markMonthlySettlementFailed,
    getFinanceOverview,
} from '../controllers/adminOps.controller.js';

import {
    listPublicBikes,
    getPublicBikeById,
    listPublicCategories,
    quoteBooking,
    checkBookingAvailability,
    getBikeAvailability,
    getPublicSettings,
    listMyBookings,
    getMyBookingById,
    createBooking,
    createDraftBooking,
    createPaymentOrder,
    verifyPayment,
    payWithWallet,
    paymentFailed,
    cancelMyBooking,
    previewMyCancellation,
    previewMyReturnSettlement,
    getMyWallet,
    confirmPickup,
    requestReturn,
    quoteExtension,
    requestExtension,
    listMyNotifications,
    markMyNotificationRead,
    createExtensionPayment,
    extendRental,
    submitReview,
    createLateBalancePaymentOrder,
    verifyLateBalancePayment,
    payLateBalanceWithWallet,
    getMyInvoice,
} from '../controllers/user.controller.js';

import {
    listCoupons,
    getCouponById,
    createCoupon,
    updateCoupon,
    patchCouponStatus,
    deleteCoupon,
    getCouponSummary,
    listCouponUsage,
    listAvailableCoupons,
    validateCoupon,
    listPendingCoupons,
    approveCoupon,
    rejectCoupon,
} from '../controllers/coupon.controller.js';

import {
    requestBikeVendorOtpController,
    verifyBikeVendorOtpController,
    registerBikeVendorController,
    getBikeVendorMeController,
    listBikeVendorRequestsController,
    getBikeVendorRequestController,
    approveBikeVendorController,
    rejectBikeVendorController,
    updateBikeVendorAdminController,
    listVendorWithdrawalsController,
    approveVendorWithdrawalController,
    rejectVendorWithdrawalController,
} from '../controllers/bikeVendor.controller.js';

import {
    listVendorZones,
    getVendorZone,
    createVendorZone,
    updateVendorZone,
    patchVendorZoneStatus,
    deleteVendorZone,
    listVendorHubs,
    listVendorHubsByZone,
    getVendorHub,
    createVendorHub,
    updateVendorHub,
    patchVendorHubStatus,
    deleteVendorHub,
    listVendorHubDropdown,
    listVendorBikes,
    getVendorBike,
    createVendorBike,
    updateVendorBike,
    patchVendorBikeStatus,
    deleteVendorBike,
    listVendorBikeDropdown,
    resubmitVendorBike,
    listVendorBookings,
    getVendorBookingById,
    approveVendorBooking,
    rejectVendorBooking,
    startVendorRide,
    collectVendorDeposit,
    inspectVendorBooking,
    collectVendorLateBalance,
    previewVendorLateCharges,
    previewVendorCancellation,
    cancelVendorBooking,
    markVendorBookingNoShow,
    overrideVendorBookingNoShow,
    releaseVendorDepositRefund,
    resolveVendorExtension,
    reassignVendorBookingBike,
    listVendorBookingInspections,
    compareVendorBookingInspections,
    listVendorInspections,
    getVendorDashboard,
    getVendorReports,
    listVendorCategories,
    getVendorCategory,
    createVendorCategory,
    resubmitVendorCategory,
    listVendorCategoryDropdown,
    listVendorCoupons,
    getVendorCoupon,
    createVendorCoupon,
    resubmitVendorCoupon,
    getVendorWallet,
    listVendorEarnings,
    listVendorWithdrawals,
    listVendorRefunds,
    requestVendorWithdrawal,
    listVendorNotifications,
    markVendorNotificationRead,
    getVendorSettings,
    updateVendorSettings,
    getVendorTaxProfile,
    updateVendorTaxProfile,
    listVendorSettlements,
    getVendorSettlementById,
    getVendorInvoiceByBooking,
    listVendorFinanceTransactions,
    getVendorBookingTransactions,
    getVendorBookingSettlement,
    listVendorMonthlySettlements,
    getVendorMonthlySettlementById,
} from '../controllers/vendorOps.controller.js';
import { requireApprovedVendor } from '../middleware/vendorGuard.middleware.js';

const router = express.Router();
const adminOrEmployee = [authMiddleware, requireRoles('ADMIN', 'EMPLOYEE')];
const userAuth = [authMiddleware, requireRoles('USER')];
const vendorAuth = [authMiddleware, requireRoles('BIKE_VENDOR')];
/** Vendor routes that manage own inventory/bookings need an approved vendor account. */
const vendorOpsAuth = [...vendorAuth, requireApprovedVendor];

const perm = (key, action) => checkPermission(key, action);

router.get('/health', (_req, res) => res.json({
    success: true,
    module: 'bike-rent',
    status: 'ok',
}));

// ——— Vendor onboarding (Bike Rental Vendor) ———
router.post('/vendor/auth/request-otp', sensitiveActionRateLimiter, requestBikeVendorOtpController);
router.post('/vendor/auth/verify-otp', sensitiveActionRateLimiter, verifyBikeVendorOtpController);
router.post('/vendor/register', sensitiveActionRateLimiter, registerBikeVendorController);
router.post('/vendor/register/authenticated', ...vendorAuth, sensitiveActionRateLimiter, registerBikeVendorController);
router.get('/vendor/me', ...vendorAuth, getBikeVendorMeController);

// ——— Admin: vendor join requests ———
router.get('/admin/vendors/requests', ...adminOrEmployee, perm('bikeRent::vendors::joining_requests', 'view'), listBikeVendorRequestsController);
router.get('/admin/vendors/requests/:id', ...adminOrEmployee, perm('bikeRent::vendors::joining_requests', 'view'), getBikeVendorRequestController);
router.post('/admin/vendors/requests/:id/approve', ...adminOrEmployee, perm('bikeRent::vendors::joining_requests', 'edit'), approveBikeVendorController);
router.post('/admin/vendors/requests/:id/reject', ...adminOrEmployee, perm('bikeRent::vendors::joining_requests', 'edit'), rejectBikeVendorController);
router.put('/admin/vendors/requests/:id', ...adminOrEmployee, perm('bikeRent::vendors::joining_requests', 'edit'), updateBikeVendorAdminController);

// ——— Admin: vendor withdrawals ———
router.get('/admin/vendors/withdrawals', ...adminOrEmployee, perm('bikeRent::vendors::joining_requests', 'view'), listVendorWithdrawalsController);
router.post('/admin/vendors/withdrawals/:id/approve', ...adminOrEmployee, perm('bikeRent::vendors::joining_requests', 'edit'), approveVendorWithdrawalController);
router.post('/admin/vendors/withdrawals/:id/reject', ...adminOrEmployee, perm('bikeRent::vendors::joining_requests', 'edit'), rejectVendorWithdrawalController);

// ——— Public (catalog + zone) ———
router.get('/zones/detect', detectZone);
router.get('/zones/public', listPublicZones);
router.get('/settings/public', getPublicSettings);
router.get('/categories/public', listPublicCategories);
router.get('/bikes', listPublicBikes);
router.get('/bikes/:id/availability', getBikeAvailability);
router.get('/bikes/:id', getPublicBikeById);
router.post('/bookings/quote', ...userAuth, quoteBooking);
router.post('/bookings/check-availability', checkBookingAvailability);
router.get('/coupons/available', ...userAuth, listAvailableCoupons);
router.post('/coupons/validate', ...userAuth, validateCoupon);

// ——— User booking engine ———
router.get('/user/bookings', ...userAuth, listMyBookings);
router.get('/user/bookings/:id', ...userAuth, getMyBookingById);
router.get('/user/bookings/:id/invoice', ...userAuth, getMyInvoice);
router.post('/user/bookings', ...userAuth, sensitiveActionRateLimiter, createBooking);
router.post('/user/bookings/draft', ...userAuth, sensitiveActionRateLimiter, createDraftBooking); // alias
router.post('/user/bookings/:id/pay/razorpay/order', ...userAuth, sensitiveActionRateLimiter, createPaymentOrder);
router.post('/user/bookings/:id/pay/razorpay/verify', ...userAuth, sensitiveActionRateLimiter, verifyPayment);
router.post('/user/bookings/:id/pay/wallet', ...userAuth, sensitiveActionRateLimiter, payWithWallet);
router.post('/user/bookings/:id/pay/failed', ...userAuth, paymentFailed);
router.post('/user/bookings/:id/cancel', ...userAuth, sensitiveActionRateLimiter, cancelMyBooking);
router.get('/user/bookings/:id/cancel/preview', ...userAuth, previewMyCancellation);
router.get('/user/bookings/:id/return/preview', ...userAuth, previewMyReturnSettlement);
router.get('/user/wallet', ...userAuth, getMyWallet);
router.get('/user/notifications', ...userAuth, listMyNotifications);
router.post('/user/notifications/:id/read', ...userAuth, markMyNotificationRead);
router.post('/user/bookings/:id/pickup', ...userAuth, sensitiveActionRateLimiter, confirmPickup);
router.post('/user/bookings/:id/return', ...userAuth, requestReturn);
router.post('/user/bookings/:id/extend/quote', ...userAuth, quoteExtension);
router.post('/user/bookings/:id/extend/request', ...userAuth, requestExtension);
router.post('/user/bookings/:id/extend/razorpay/order', ...userAuth, sensitiveActionRateLimiter, createExtensionPayment);
router.post('/user/bookings/:id/extend', ...userAuth, sensitiveActionRateLimiter, extendRental);
router.post('/user/bookings/:id/review', ...userAuth, submitReview);
router.post('/user/bookings/:id/late-balance/razorpay/order', ...userAuth, sensitiveActionRateLimiter, createLateBalancePaymentOrder);
router.post('/user/bookings/:id/late-balance/razorpay/verify', ...userAuth, sensitiveActionRateLimiter, verifyLateBalancePayment);
router.post('/user/bookings/:id/late-balance/wallet', ...userAuth, sensitiveActionRateLimiter, payLateBalanceWithWallet);

// ——— Admin dashboard / reports / settings ———
router.get('/admin/dashboard', ...adminOrEmployee, perm('bikeRent::main::dashboard', 'view'), getDashboard);
router.get('/admin/reports', ...adminOrEmployee, perm('bikeRent::operations::reports', 'view'), getReports);
router.get('/admin/settings', ...adminOrEmployee, perm('bikeRent::operations::settings', 'view'), getSettings);
router.put('/admin/settings', ...adminOrEmployee, perm('bikeRent::operations::settings', 'edit'), updateSettings);
router.post('/admin/settings/no-show/preview', ...adminOrEmployee, perm('bikeRent::operations::settings', 'view'), previewNoShowPolicy);
router.get('/admin/tax-settings', ...adminOrEmployee, perm('bikeRent::operations::settings', 'view'), getTaxSettings);
router.put('/admin/tax-settings', ...adminOrEmployee, perm('bikeRent::operations::settings', 'edit'), updateTaxSettings);
router.get('/admin/wallet/transactions', ...adminOrEmployee, perm('bikeRent::operations::reports', 'view'), listWalletTransactions);
router.get('/admin/settlements', ...adminOrEmployee, perm('bikeRent::operations::reports', 'view'), listSettlements);
router.get('/admin/settlements/:id', ...adminOrEmployee, perm('bikeRent::operations::reports', 'view'), getSettlementById);
router.get('/admin/invoices/:id', ...adminOrEmployee, perm('bikeRent::operations::reports', 'view'), getInvoiceById);
router.get('/admin/finance/transactions', ...adminOrEmployee, perm('bikeRent::operations::reports', 'view'), listFinanceTransactions);
router.post('/admin/finance/transactions/adjustment', ...adminOrEmployee, perm('bikeRent::operations::reports', 'edit'), createFinanceAdjustment);
router.get('/admin/bookings/:bookingId/invoice', ...adminOrEmployee, perm('bikeRent::operations::reports', 'view'), getBookingInvoice);
router.get('/admin/bookings/:bookingId/settlement', ...adminOrEmployee, perm('bikeRent::operations::reports', 'view'), getBookingSettlement);
router.get('/admin/bookings/:bookingId/transactions', ...adminOrEmployee, perm('bikeRent::operations::reports', 'view'), getBookingTransactions);
router.get('/admin/monthly-settlements', ...adminOrEmployee, perm('bikeRent::operations::reports', 'view'), listMonthlySettlements);
router.get('/admin/monthly-settlements/:id', ...adminOrEmployee, perm('bikeRent::operations::reports', 'view'), getMonthlySettlementById);
router.post('/admin/monthly-settlements/generate', ...adminOrEmployee, perm('bikeRent::operations::reports', 'edit'), generateMonthlySettlements);
router.post('/admin/monthly-settlements/:id/approve', ...adminOrEmployee, perm('bikeRent::operations::reports', 'edit'), approveMonthlySettlement);
router.post('/admin/monthly-settlements/:id/processing', ...adminOrEmployee, perm('bikeRent::operations::reports', 'edit'), markMonthlySettlementProcessing);
router.post('/admin/monthly-settlements/:id/paid', ...adminOrEmployee, perm('bikeRent::operations::reports', 'edit'), markMonthlySettlementPaid);
router.post('/admin/monthly-settlements/:id/failed', ...adminOrEmployee, perm('bikeRent::operations::reports', 'edit'), markMonthlySettlementFailed);
router.get('/admin/finance/overview', ...adminOrEmployee, perm('bikeRent::operations::reports', 'view'), getFinanceOverview);

// ——— Coupons (Bike Rental only) ———
router.get('/admin/coupons/summary', ...adminOrEmployee, perm('bikeRent::operations::coupons', 'view'), getCouponSummary);
// NOTE: static "/pending" route must be registered before the "/:id" routes below.
router.get('/admin/coupons/pending', ...adminOrEmployee, perm('bikeRent::operations::coupons', 'view'), listPendingCoupons);
router.post('/admin/coupons/:id/approve', ...adminOrEmployee, perm('bikeRent::operations::coupons', 'edit'), approveCoupon);
router.post('/admin/coupons/:id/reject', ...adminOrEmployee, perm('bikeRent::operations::coupons', 'edit'), rejectCoupon);
router.get('/admin/coupons', ...adminOrEmployee, perm('bikeRent::operations::coupons', 'view'), listCoupons);
router.get('/admin/coupons/:id/usage', ...adminOrEmployee, perm('bikeRent::operations::coupons', 'view'), listCouponUsage);
router.get('/admin/coupons/:id', ...adminOrEmployee, perm('bikeRent::operations::coupons', 'view'), getCouponById);
router.post('/admin/coupons', ...adminOrEmployee, perm('bikeRent::operations::coupons', 'create'), createCoupon);
router.put('/admin/coupons/:id', ...adminOrEmployee, perm('bikeRent::operations::coupons', 'edit'), updateCoupon);
router.patch('/admin/coupons/:id/status', ...adminOrEmployee, perm('bikeRent::operations::coupons', 'edit'), patchCouponStatus);
router.delete('/admin/coupons/:id', ...adminOrEmployee, perm('bikeRent::operations::coupons', 'delete'), deleteCoupon);

// ——— Zones (independent bike_rent_zones) ———
router.get('/admin/zones/dropdown', ...adminOrEmployee, perm('bikeRent::inventory::zones', 'view'), listZoneDropdown);
router.get('/admin/zones', ...adminOrEmployee, perm('bikeRent::inventory::zones', 'view'), listZones);
router.get('/admin/zones/:id', ...adminOrEmployee, perm('bikeRent::inventory::zones', 'view'), getZoneById);
router.post('/admin/zones', ...adminOrEmployee, perm('bikeRent::inventory::zones', 'create'), createZone);
router.put('/admin/zones/:id', ...adminOrEmployee, perm('bikeRent::inventory::zones', 'edit'), updateZone);
router.patch('/admin/zones/:id/status', ...adminOrEmployee, perm('bikeRent::inventory::zones', 'edit'), patchZoneStatus);
router.delete('/admin/zones/:id', ...adminOrEmployee, perm('bikeRent::inventory::zones', 'delete'), deleteZone);

// ——— Pickup hubs (multiple per zone) ———
router.get('/admin/hubs/dropdown', ...adminOrEmployee, perm('bikeRent::inventory::zones', 'view'), listHubDropdown);
router.get('/admin/hubs/:id', ...adminOrEmployee, perm('bikeRent::inventory::zones', 'view'), getHubById);
router.put('/admin/hubs/:id', ...adminOrEmployee, perm('bikeRent::inventory::zones', 'edit'), updateHub);
router.patch('/admin/hubs/:id/status', ...adminOrEmployee, perm('bikeRent::inventory::zones', 'edit'), patchHubStatus);
router.delete('/admin/hubs/:id', ...adminOrEmployee, perm('bikeRent::inventory::zones', 'delete'), deleteHub);
router.get('/admin/zones/:zoneId/hubs', ...adminOrEmployee, perm('bikeRent::inventory::zones', 'view'), listHubsByZone);
router.post('/admin/zones/:zoneId/hubs', ...adminOrEmployee, perm('bikeRent::inventory::zones', 'create'), createHub);

// ——— Categories ———
// NOTE: static "/pending" route must be registered before the "/:id" routes below.
router.get('/admin/categories/pending', ...adminOrEmployee, perm('bikeRent::inventory::categories', 'view'), listPendingCategories);
router.post('/admin/categories/:id/approve', ...adminOrEmployee, perm('bikeRent::inventory::categories', 'edit'), approveCategory);
router.post('/admin/categories/:id/reject', ...adminOrEmployee, perm('bikeRent::inventory::categories', 'edit'), rejectCategory);
router.get('/admin/categories/dropdown', ...adminOrEmployee, perm('bikeRent::inventory::categories', 'view'), listCategoryDropdown);
router.get('/admin/categories', ...adminOrEmployee, perm('bikeRent::inventory::categories', 'view'), listCategories);
router.get('/admin/categories/:id', ...adminOrEmployee, perm('bikeRent::inventory::categories', 'view'), getCategoryById);
router.post('/admin/categories', ...adminOrEmployee, perm('bikeRent::inventory::categories', 'create'), createCategory);
router.put('/admin/categories/:id', ...adminOrEmployee, perm('bikeRent::inventory::categories', 'edit'), updateCategory);
router.patch('/admin/categories/:id/status', ...adminOrEmployee, perm('bikeRent::inventory::categories', 'edit'), patchCategoryStatus);
router.delete('/admin/categories/:id', ...adminOrEmployee, perm('bikeRent::inventory::categories', 'delete'), deleteCategory);

// ——— Bikes ———
// NOTE: static "/pending" route must be registered before the "/:id" routes below.
router.get('/admin/bikes/pending', ...adminOrEmployee, perm('bikeRent::inventory::bikes', 'view'), listPendingBikes);
router.post('/admin/bikes/:id/approve', ...adminOrEmployee, perm('bikeRent::inventory::bikes', 'edit'), approveBike);
router.post('/admin/bikes/:id/reject', ...adminOrEmployee, perm('bikeRent::inventory::bikes', 'edit'), rejectBike);
router.get('/admin/bikes/dropdown', ...adminOrEmployee, perm('bikeRent::inventory::bikes', 'view'), listBikeDropdown);
router.get('/admin/bikes', ...adminOrEmployee, perm('bikeRent::inventory::bikes', 'view'), listBikes);
router.get('/admin/bikes/:id', ...adminOrEmployee, perm('bikeRent::inventory::bikes', 'view'), getBikeById);
router.post('/admin/bikes', ...adminOrEmployee, perm('bikeRent::inventory::bikes', 'create'), createBike);
router.put('/admin/bikes/:id', ...adminOrEmployee, perm('bikeRent::inventory::bikes', 'edit'), updateBike);
router.patch('/admin/bikes/:id/status', ...adminOrEmployee, perm('bikeRent::inventory::bikes', 'edit'), patchBikeStatus);
router.delete('/admin/bikes/:id', ...adminOrEmployee, perm('bikeRent::inventory::bikes', 'delete'), deleteBike);

// ——— Pricing ———
router.get('/admin/pricing', ...adminOrEmployee, perm('bikeRent::finance::pricing', 'view'), listPricing);
router.get('/admin/pricing/:id', ...adminOrEmployee, perm('bikeRent::finance::pricing', 'view'), getPricingById);
router.post('/admin/pricing', ...adminOrEmployee, perm('bikeRent::finance::pricing', 'create'), createPricing);
router.put('/admin/pricing/:id', ...adminOrEmployee, perm('bikeRent::finance::pricing', 'edit'), updatePricing);
router.patch('/admin/pricing/:id/status', ...adminOrEmployee, perm('bikeRent::finance::pricing', 'edit'), patchPricingStatus);
router.delete('/admin/pricing/:id', ...adminOrEmployee, perm('bikeRent::finance::pricing', 'delete'), deletePricing);

// ——— Bookings ———
router.get('/admin/bookings', ...adminOrEmployee, perm('bikeRent::bookings::list', 'view'), listBookings);
router.get('/admin/bookings/:id', ...adminOrEmployee, perm('bikeRent::bookings::list', 'view'), getBookingById);
router.patch('/admin/bookings/:id/status', ...adminOrEmployee, perm('bikeRent::bookings::list', 'edit'), patchBookingStatus);
router.post('/admin/bookings/:id/approve', ...adminOrEmployee, perm('bikeRent::bookings::list', 'edit'), approveBooking);
router.post('/admin/bookings/:id/reject', ...adminOrEmployee, perm('bikeRent::bookings::list', 'edit'), rejectBooking);
router.post('/admin/bookings/:id/start-ride', ...adminOrEmployee, perm('bikeRent::bookings::list', 'edit'), startRide);
router.post('/admin/bookings/:id/collect-deposit', ...adminOrEmployee, perm('bikeRent::bookings::list', 'edit'), collectDeposit);
router.post('/admin/bookings/:id/inspect', ...adminOrEmployee, perm('bikeRent::bookings::list', 'edit'), inspectBooking);
router.post('/admin/bookings/:id/late-charges/preview', ...adminOrEmployee, perm('bikeRent::bookings::list', 'view'), previewLateCharges);
router.post('/admin/bookings/:id/cancel/preview', ...adminOrEmployee, perm('bikeRent::bookings::list', 'view'), previewCancellation);
router.get('/admin/bookings/:id/cancel/preview', ...adminOrEmployee, perm('bikeRent::bookings::list', 'view'), previewCancellation);
router.post('/admin/bookings/:id/late-balance/collect', ...adminOrEmployee, perm('bikeRent::bookings::list', 'edit'), collectLateBalance);
router.post('/admin/bookings/:id/deposit-refund/release', ...adminOrEmployee, perm('bikeRent::bookings::list', 'edit'), releaseDepositRefund);
router.post('/admin/bookings/:id/extension/resolve', ...adminOrEmployee, perm('bikeRent::bookings::list', 'edit'), resolveExtension);
router.post('/admin/bookings/:id/reassign', ...adminOrEmployee, perm('bikeRent::bookings::list', 'edit'), reassignBooking);
router.post('/admin/bookings/:id/no-show/override', ...adminOrEmployee, perm('bikeRent::bookings::list', 'edit'), overrideNoShow);
router.get('/admin/bookings/:id/inspections', ...adminOrEmployee, perm('bikeRent::bookings::list', 'view'), listBookingInspections);
router.get('/admin/bookings/:id/inspections/compare', ...adminOrEmployee, perm('bikeRent::bookings::list', 'view'), compareBookingInspections);

// ——— Inspections ———
router.get('/admin/inspections', ...adminOrEmployee, perm('bikeRent::bookings::list', 'view'), listInspections);
router.get('/admin/inspections/:id', ...adminOrEmployee, perm('bikeRent::bookings::list', 'view'), getInspectionById);

// ——— Customers ———
router.get('/admin/customers', ...adminOrEmployee, perm('bikeRent::customers::list', 'view'), listCustomers);
router.get('/admin/customers/:id', ...adminOrEmployee, perm('bikeRent::customers::list', 'view'), getCustomerById);

// ——— Vendor: own dashboard ———
router.get('/vendor/dashboard', ...vendorOpsAuth, getVendorDashboard);
router.get('/vendor/reports', ...vendorOpsAuth, getVendorReports);

// ——— Vendor: zones (view all, mutate own only — enforced in the service layer) ———
router.get('/vendor/zones', ...vendorOpsAuth, listVendorZones);
router.get('/vendor/zones/:id', ...vendorOpsAuth, getVendorZone);
router.post('/vendor/zones', ...vendorOpsAuth, createVendorZone);
router.put('/vendor/zones/:id', ...vendorOpsAuth, updateVendorZone);
router.patch('/vendor/zones/:id/status', ...vendorOpsAuth, patchVendorZoneStatus);
router.delete('/vendor/zones/:id', ...vendorOpsAuth, deleteVendorZone);

// ——— Vendor: own hubs ———
router.get('/vendor/hubs', ...vendorOpsAuth, listVendorHubs);
router.get('/vendor/hubs/dropdown', ...vendorOpsAuth, listVendorHubDropdown);
router.get('/vendor/hubs/:id', ...vendorOpsAuth, getVendorHub);
router.put('/vendor/hubs/:id', ...vendorOpsAuth, updateVendorHub);
router.patch('/vendor/hubs/:id/status', ...vendorOpsAuth, patchVendorHubStatus);
router.delete('/vendor/hubs/:id', ...vendorOpsAuth, deleteVendorHub);
router.get('/vendor/zones/:zoneId/hubs', ...vendorOpsAuth, listVendorHubsByZone);
router.post('/vendor/zones/:zoneId/hubs', ...vendorOpsAuth, createVendorHub);

// ——— Vendor: categories (shared approved catalog + own proposals) ———
router.get('/vendor/categories/dropdown', ...vendorOpsAuth, listVendorCategoryDropdown);
router.get('/vendor/categories', ...vendorOpsAuth, listVendorCategories);
router.get('/vendor/categories/:id', ...vendorOpsAuth, getVendorCategory);
router.post('/vendor/categories', ...vendorOpsAuth, createVendorCategory);
router.put('/vendor/categories/:id/resubmit', ...vendorOpsAuth, resubmitVendorCategory);

// ——— Vendor: coupons (own only, admin-approval workflow) ———
router.get('/vendor/coupons', ...vendorOpsAuth, listVendorCoupons);
router.get('/vendor/coupons/:id', ...vendorOpsAuth, getVendorCoupon);
router.post('/vendor/coupons', ...vendorOpsAuth, createVendorCoupon);
router.put('/vendor/coupons/:id/resubmit', ...vendorOpsAuth, resubmitVendorCoupon);

// ——— Vendor: own bikes ———
router.get('/vendor/bikes/dropdown', ...vendorOpsAuth, listVendorBikeDropdown);
router.get('/vendor/bikes', ...vendorOpsAuth, listVendorBikes);
router.get('/vendor/bikes/:id', ...vendorOpsAuth, getVendorBike);
router.post('/vendor/bikes', ...vendorOpsAuth, createVendorBike);
router.put('/vendor/bikes/:id', ...vendorOpsAuth, updateVendorBike);
router.put('/vendor/bikes/:id/resubmit', ...vendorOpsAuth, resubmitVendorBike);
router.patch('/vendor/bikes/:id/status', ...vendorOpsAuth, patchVendorBikeStatus);
router.delete('/vendor/bikes/:id', ...vendorOpsAuth, deleteVendorBike);

// ——— Vendor: own bookings ———
router.get('/vendor/bookings', ...vendorOpsAuth, listVendorBookings);
router.get('/vendor/bookings/:id', ...vendorOpsAuth, getVendorBookingById);
router.post('/vendor/bookings/:id/approve', ...vendorOpsAuth, approveVendorBooking);
router.post('/vendor/bookings/:id/reject', ...vendorOpsAuth, rejectVendorBooking);
router.post('/vendor/bookings/:id/start-ride', ...vendorOpsAuth, startVendorRide);
router.post('/vendor/bookings/:id/collect-deposit', ...vendorOpsAuth, collectVendorDeposit);
router.post('/vendor/bookings/:id/inspect', ...vendorOpsAuth, inspectVendorBooking);
router.post('/vendor/bookings/:id/late-balance/collect', ...vendorOpsAuth, collectVendorLateBalance);
router.post('/vendor/bookings/:id/late-charges/preview', ...vendorOpsAuth, previewVendorLateCharges);
router.post('/vendor/bookings/:id/cancel/preview', ...vendorOpsAuth, previewVendorCancellation);
router.get('/vendor/bookings/:id/cancel/preview', ...vendorOpsAuth, previewVendorCancellation);
router.post('/vendor/bookings/:id/cancel', ...vendorOpsAuth, cancelVendorBooking);
router.post('/vendor/bookings/:id/no-show', ...vendorOpsAuth, markVendorBookingNoShow);
router.post('/vendor/bookings/:id/no-show/override', ...vendorOpsAuth, overrideVendorBookingNoShow);
router.post('/vendor/bookings/:id/deposit-refund/release', ...vendorOpsAuth, releaseVendorDepositRefund);
router.post('/vendor/bookings/:id/extension/resolve', ...vendorOpsAuth, resolveVendorExtension);
router.post('/vendor/bookings/:id/reassign', ...vendorOpsAuth, reassignVendorBookingBike);
router.get('/vendor/bookings/:id/inspections', ...vendorOpsAuth, listVendorBookingInspections);
router.get('/vendor/bookings/:id/inspections/compare', ...vendorOpsAuth, compareVendorBookingInspections);

// ——— Vendor: inspections (fleet-wide, across all own bookings) ———
router.get('/vendor/inspections', ...vendorOpsAuth, listVendorInspections);

// ——— Vendor: notifications ———
router.get('/vendor/notifications', ...vendorOpsAuth, listVendorNotifications);
router.post('/vendor/notifications/:id/read', ...vendorOpsAuth, markVendorNotificationRead);

// ——— Vendor: wallet ———
router.get('/vendor/wallet', ...vendorOpsAuth, getVendorWallet);
router.get('/vendor/wallet/earnings', ...vendorOpsAuth, listVendorEarnings);
router.get('/vendor/wallet/withdrawals', ...vendorOpsAuth, listVendorWithdrawals);
router.get('/vendor/wallet/refunds', ...vendorOpsAuth, listVendorRefunds);
router.post('/vendor/wallet/withdraw', ...vendorOpsAuth, sensitiveActionRateLimiter, requestVendorWithdrawal);

// ——— Vendor: settings (booking/cancellation/no-show/late-fee/deposit/support overrides) ———
router.get('/vendor/settings', ...vendorOpsAuth, getVendorSettings);
router.put('/vendor/settings', ...vendorOpsAuth, updateVendorSettings);

// ——— Vendor: tax & billing profile (business/tax identity only — no rate control) ———
router.get('/vendor/tax-profile', ...vendorOpsAuth, getVendorTaxProfile);
router.put('/vendor/tax-profile', ...vendorOpsAuth, updateVendorTaxProfile);

// ——— Vendor: settlements (own booking payout ledger) ———
router.get('/vendor/settlements', ...vendorOpsAuth, listVendorSettlements);
router.get('/vendor/settlements/:id', ...vendorOpsAuth, getVendorSettlementById);

// ——— Vendor: invoices (own bookings only) ———
router.get('/vendor/bookings/:bookingId/invoice', ...vendorOpsAuth, getVendorInvoiceByBooking);

// ——— Vendor: finance transactions (own earnings/bookings only) ———
router.get('/vendor/finance/transactions', ...vendorOpsAuth, listVendorFinanceTransactions);
router.get('/vendor/bookings/:bookingId/settlement', ...vendorOpsAuth, getVendorBookingSettlement);
router.get('/vendor/bookings/:bookingId/transactions', ...vendorOpsAuth, getVendorBookingTransactions);

// ——— Vendor: monthly settlement (own payout history, read-only) ———
router.get('/vendor/monthly-settlements', ...vendorOpsAuth, listVendorMonthlySettlements);
router.get('/vendor/monthly-settlements/:id', ...vendorOpsAuth, getVendorMonthlySettlementById);

export default router;
