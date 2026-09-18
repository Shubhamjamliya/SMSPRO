import express from 'express';
import { authMiddleware, checkPermission } from '../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../core/roles/role.middleware.js';

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
    listVehicleTypes,
    getVehicleTypeById,
    createVehicleType,
    updateVehicleType,
    patchVehicleTypeStatus,
    deleteVehicleType,
    listVehicleTypeDropdown,
} from '../controllers/vehicleType.controller.js';

import {
    listPricing,
    getPricingById,
    getPricingByVehicleTypeId,
    createPricing,
    updatePricing,
    patchPricingStatus,
    deletePricing,
    saveZonePricingMatrix,
    deleteZonePricingMatrix,
} from '../controllers/pricing.controller.js';

import {
    listSurgeSlots,
    getSurgeSlotById,
    createSurgeSlot,
    updateSurgeSlot,
    patchSurgeSlotStatus,
    deleteSurgeSlot,
} from '../controllers/surgeSlot.controller.js';

import {
    listCoupons,
    getCouponById,
    createCoupon,
    updateCoupon,
    patchCouponStatus,
    deleteCoupon,
    getCouponSummary,
    previewUserCoupon,
    listAvailableUserCoupons,
} from '../controllers/coupon.controller.js';

import {
    quoteRide,
    createRide,
    listMyRides,
    getMyRideById,
    getMyActiveRide,
    cancelMyRide,
    listAdminRides,
    getAdminRideById,
    getActivePartnerRide,
    listPartnerRides,
    acceptRide,
    markArrived,
    startRide,
    reachDrop,
    createCollectQr,
    collectCash,
    partnerPaymentStatus,
    completeRide,
    payWithWallet,
    createUserRazorpayOrder,
    verifyUserRazorpayPayment,
    userPaymentStatus,
} from '../controllers/ride.controller.js';

import {
    listDrivers,
    getDriverById,
    patchDriverStatus,
    listCustomers,
    listFleet,
    getDashboard,
} from '../controllers/adminOps.controller.js';

import {
    getSettings,
    updateSettings,
    getCashLimit,
    updateCashLimit,
} from '../controllers/settings.controller.js';

const router = express.Router();
const adminOrEmployee = [authMiddleware, requireRoles('ADMIN', 'EMPLOYEE')];
const userOnly = [authMiddleware, requireRoles('USER')];
const partnerOnly = [authMiddleware, requireRoles('DELIVERY_PARTNER')];

router.get('/health', (_req, res) => res.json({ success: true, module: 'taxi', status: 'ok' }));

router.get('/vehicle-types/public', listVehicleTypeDropdown);

router.get('/admin/settings', ...adminOrEmployee, checkPermission('taxi::rides', 'view'), getSettings);
router.put('/admin/settings', ...adminOrEmployee, checkPermission('taxi::rides', 'edit'), updateSettings);
router.get('/admin/cash-limit', ...adminOrEmployee, checkPermission('taxi::rides', 'view'), getCashLimit);
router.put('/admin/cash-limit', ...adminOrEmployee, checkPermission('taxi::rides', 'edit'), updateCashLimit);

router.get('/admin/dashboard', ...adminOrEmployee, checkPermission('taxi::rides', 'view'), getDashboard);
router.get('/admin/drivers', ...adminOrEmployee, checkPermission('taxi::rides', 'view'), listDrivers);
router.get('/admin/drivers/:id', ...adminOrEmployee, checkPermission('taxi::rides', 'view'), getDriverById);
router.patch('/admin/drivers/:id/status', ...adminOrEmployee, checkPermission('taxi::rides', 'edit'), patchDriverStatus);
router.get('/admin/customers', ...adminOrEmployee, checkPermission('taxi::rides', 'view'), listCustomers);
router.get('/admin/fleet', ...adminOrEmployee, checkPermission('taxi::vehicles', 'view'), listFleet);

router.get('/admin/zones/dropdown', ...adminOrEmployee, checkPermission('taxi::zones', 'view'), listZoneDropdown);
router.get('/admin/zones', ...adminOrEmployee, checkPermission('taxi::zones', 'view'), listZones);
router.get('/admin/zones/:id', ...adminOrEmployee, checkPermission('taxi::zones', 'view'), getZoneById);
router.post('/admin/zones', ...adminOrEmployee, checkPermission('taxi::zones', 'create'), createZone);
router.put('/admin/zones/:id', ...adminOrEmployee, checkPermission('taxi::zones', 'edit'), updateZone);
router.patch('/admin/zones/:id/status', ...adminOrEmployee, checkPermission('taxi::zones', 'edit'), patchZoneStatus);
router.delete('/admin/zones/:id', ...adminOrEmployee, checkPermission('taxi::zones', 'delete'), deleteZone);

router.get('/admin/vehicle-types/dropdown', ...adminOrEmployee, checkPermission('taxi::vehicles', 'view'), listVehicleTypeDropdown);
router.get('/admin/vehicle-types', ...adminOrEmployee, checkPermission('taxi::vehicles', 'view'), listVehicleTypes);
router.get('/admin/vehicle-types/:id', ...adminOrEmployee, checkPermission('taxi::vehicles', 'view'), getVehicleTypeById);
router.post('/admin/vehicle-types', ...adminOrEmployee, checkPermission('taxi::vehicles', 'create'), createVehicleType);
router.put('/admin/vehicle-types/:id', ...adminOrEmployee, checkPermission('taxi::vehicles', 'edit'), updateVehicleType);
router.patch('/admin/vehicle-types/:id/status', ...adminOrEmployee, checkPermission('taxi::vehicles', 'edit'), patchVehicleTypeStatus);
router.delete('/admin/vehicle-types/:id', ...adminOrEmployee, checkPermission('taxi::vehicles', 'delete'), deleteVehicleType);

router.get('/admin/pricing', ...adminOrEmployee, checkPermission('taxi::pricing', 'view'), listPricing);
router.get('/admin/pricing/vehicle/:vehicleTypeId', ...adminOrEmployee, checkPermission('taxi::pricing', 'view'), getPricingByVehicleTypeId);
router.post('/admin/pricing/zone-matrix', ...adminOrEmployee, checkPermission('taxi::pricing', 'create'), saveZonePricingMatrix);
router.delete('/admin/pricing/zone-matrix/:zoneId', ...adminOrEmployee, checkPermission('taxi::pricing', 'edit'), deleteZonePricingMatrix);
router.get('/admin/pricing/:id', ...adminOrEmployee, checkPermission('taxi::pricing', 'view'), getPricingById);
router.post('/admin/pricing', ...adminOrEmployee, checkPermission('taxi::pricing', 'create'), createPricing);
router.put('/admin/pricing/:id', ...adminOrEmployee, checkPermission('taxi::pricing', 'edit'), updatePricing);
router.patch('/admin/pricing/:id/status', ...adminOrEmployee, checkPermission('taxi::pricing', 'edit'), patchPricingStatus);
router.delete('/admin/pricing/:id', ...adminOrEmployee, checkPermission('taxi::pricing', 'edit'), deletePricing);

router.get('/admin/surge-slots', ...adminOrEmployee, checkPermission('taxi::pricing', 'view'), listSurgeSlots);
router.get('/admin/surge-slots/:id', ...adminOrEmployee, checkPermission('taxi::pricing', 'view'), getSurgeSlotById);
router.post('/admin/surge-slots', ...adminOrEmployee, checkPermission('taxi::pricing', 'create'), createSurgeSlot);
router.put('/admin/surge-slots/:id', ...adminOrEmployee, checkPermission('taxi::pricing', 'edit'), updateSurgeSlot);
router.patch('/admin/surge-slots/:id/status', ...adminOrEmployee, checkPermission('taxi::pricing', 'edit'), patchSurgeSlotStatus);
router.delete('/admin/surge-slots/:id', ...adminOrEmployee, checkPermission('taxi::pricing', 'edit'), deleteSurgeSlot);

router.get('/admin/coupons/summary', ...adminOrEmployee, checkPermission('taxi::coupons', 'view'), getCouponSummary);
router.get('/admin/coupons', ...adminOrEmployee, checkPermission('taxi::coupons', 'view'), listCoupons);
router.get('/admin/coupons/:id', ...adminOrEmployee, checkPermission('taxi::coupons', 'view'), getCouponById);
router.post('/admin/coupons', ...adminOrEmployee, checkPermission('taxi::coupons', 'create'), createCoupon);
router.put('/admin/coupons/:id', ...adminOrEmployee, checkPermission('taxi::coupons', 'edit'), updateCoupon);
router.patch('/admin/coupons/:id/status', ...adminOrEmployee, checkPermission('taxi::coupons', 'edit'), patchCouponStatus);
router.delete('/admin/coupons/:id', ...adminOrEmployee, checkPermission('taxi::coupons', 'delete'), deleteCoupon);

router.get('/admin/rides', ...adminOrEmployee, checkPermission('taxi::rides', 'view'), listAdminRides);
router.get('/admin/rides/:id', ...adminOrEmployee, checkPermission('taxi::rides', 'view'), getAdminRideById);

router.post('/quote', ...userOnly, quoteRide);
router.get('/coupons/available', ...userOnly, listAvailableUserCoupons);
router.post('/coupons/preview', ...userOnly, previewUserCoupon);
router.post('/rides', ...userOnly, createRide);
router.get('/rides/active', ...userOnly, getMyActiveRide);
router.get('/rides', ...userOnly, listMyRides);
router.get('/rides/:id', ...userOnly, getMyRideById);
router.post('/rides/:id/cancel', ...userOnly, cancelMyRide);
router.post('/rides/:id/pay/wallet', ...userOnly, payWithWallet);
router.post('/rides/:id/pay/razorpay/order', ...userOnly, createUserRazorpayOrder);
router.post('/rides/:id/pay/razorpay/verify', ...userOnly, verifyUserRazorpayPayment);
router.get('/rides/:id/payment-status', ...userOnly, userPaymentStatus);

router.get('/partner/rides/active', ...partnerOnly, getActivePartnerRide);
router.get('/partner/rides', ...partnerOnly, listPartnerRides);
router.post('/partner/rides/:id/accept', ...partnerOnly, acceptRide);
router.post('/partner/rides/:id/arrived', ...partnerOnly, markArrived);
router.post('/partner/rides/:id/start', ...partnerOnly, startRide);
router.post('/partner/rides/:id/reach-drop', ...partnerOnly, reachDrop);
router.post('/partner/rides/:id/collect/qr', ...partnerOnly, createCollectQr);
router.post('/partner/rides/:id/collect/cash', ...partnerOnly, collectCash);
router.get('/partner/rides/:id/payment-status', ...partnerOnly, partnerPaymentStatus);
router.post('/partner/rides/:id/complete', ...partnerOnly, completeRide);

export default router;
