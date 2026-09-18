import express from 'express';
import {
    authMiddleware,
    checkPermission,
    getCachedRolePermissions,
} from '../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../core/roles/role.middleware.js';
import { upload } from '../../../middleware/upload.js';
import { sendError } from '../../../utils/response.js';
import { FoodAdmin } from '../../../core/admin/admin.model.js';

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
    listVehicles,
    getVehicleById,
    createVehicle,
    updateVehicle,
    patchVehicleStatus,
    deleteVehicle,
    listVehicleDropdown,
    uploadVehicleIcon,
} from '../controllers/vehicle.controller.js';

import {
    listPricing,
    getPricingById,
    getPricingByVehicleId,
    createPricing,
    updatePricing,
    patchPricingStatus,
    deletePricing,
    upsertVehiclePricing,
    clearVehiclePricing,
    saveZonePricingMatrix,
    deleteZonePricingMatrix,
} from '../controllers/pricing.controller.js';

import {
    listCoupons,
    getCouponById,
    createCoupon,
    updateCoupon,
    patchCouponStatus,
    deleteCoupon,
    getCouponSummary,
} from '../controllers/coupon.controller.js';

import {
    listBanners,
    getBannerById,
    createBanner,
    updateBanner,
    patchBannerStatus,
    deleteBanner,
    getBannerStats,
} from '../controllers/banner.controller.js';

import {
    listPorterUsers,
    getPorterUserById,
    updatePorterUser,
    deletePorterUser,
} from '../controllers/user.controller.js';

import {
    listPublicVehicles,
    listAvailableVehicles,
    quoteTrip,
    createTrip,
    listMyTrips,
    getMyTripById,
    cancelMyTrip,
    payWithWallet,
    createUserRazorpayOrder,
    verifyUserRazorpayPayment,
    requestTripSearch,
    payExtraLoadingWithWallet,
    getUserPaymentStatus,
    listAdminTrips,
    getAdminTripById,
    acceptTrip,
    getActivePartnerTrip,
    listPartnerTrips,
    markArrived,
    startTrip,
    markLoaded,
    markAtDrop,
    completeTrip,
    collectCash,
    createCollectQr,
    getPartnerPaymentStatus,
} from '../controllers/trip.controller.js';

import {
    getSettings,
    updateSettings,
} from '../controllers/settings.controller.js';

import {
    listDrivers,
    getDriverById,
    patchDriverStatus,
    getDashboard,
} from '../controllers/adminOps.controller.js';

import {
    listGoodsTypes,
    getGoodsTypeById,
    createGoodsType,
    updateGoodsType,
    deleteGoodsType,
    listPublicGoodsCatalog,
    updateRestrictedItems,
} from '../controllers/goodsType.controller.js';

const router = express.Router();
const adminOrEmployee = [authMiddleware, requireRoles('ADMIN', 'EMPLOYEE')];
const userOnly = [authMiddleware, requireRoles('USER')];
const partnerOnly = [authMiddleware, requireRoles('DELIVERY_PARTNER')];

/** Accept either porter::trips or porter::orders view permission. */
const checkPorterTripView = async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) return sendError(res, 401, 'Authentication required');
        if (user.role === 'ADMIN') return next();
        if (user.role !== 'EMPLOYEE') {
            return sendError(res, 403, 'Access denied: insufficient privileges');
        }

        const employee = await FoodAdmin.findById(user.userId)
            .select('adminRoleId isActive')
            .lean();
        if (!employee || !employee.isActive) {
            return sendError(res, 403, 'Employee account is suspended or inactive');
        }
        if (!employee.adminRoleId) {
            return sendError(res, 403, 'No administrative role assigned to this account');
        }

        const permissions = await getCachedRolePermissions(employee.adminRoleId);
        if (!permissions) {
            return sendError(res, 403, 'Assigned administrative role is inactive');
        }

        const keys = ['porter::trips', 'porter::orders'];
        const hasPerm = keys.some((key) => {
            if (permissions[key]?.view === true) return true;
            const prefix = `${key}::`;
            return Object.entries(permissions).some(
                ([k, val]) => k.startsWith(prefix) && val && val.view === true,
            );
        });

        if (!hasPerm) {
            return sendError(res, 403, 'Access denied: missing view permission for porter::trips or porter::orders');
        }
        return next();
    } catch (error) {
        return sendError(res, 500, `Internal authorization error: ${error.message}`);
    }
};

router.get('/health', (_req, res) => res.json({ success: true, module: 'porter', status: 'ok' }));

// Public vehicle catalog
router.get('/vehicles/public', listPublicVehicles);
router.get('/vehicle-types/public', listPublicVehicles);
router.post('/vehicles/available', ...userOnly, listAvailableVehicles);
router.get('/goods-types', listPublicGoodsCatalog);

// Admin settings
router.get('/admin/settings', ...adminOrEmployee, checkPermission('porter::vehicles', 'view'), getSettings);
router.put('/admin/settings', ...adminOrEmployee, checkPermission('porter::vehicles', 'edit'), updateSettings);

// Admin: Goods types
router.get('/admin/goods-types', ...adminOrEmployee, checkPermission('porter::vehicles', 'view'), listGoodsTypes);
router.post('/admin/goods-types', ...adminOrEmployee, checkPermission('porter::vehicles', 'create'), createGoodsType);
router.get('/admin/goods-types/:id', ...adminOrEmployee, checkPermission('porter::vehicles', 'view'), getGoodsTypeById);
router.put('/admin/goods-types/:id', ...adminOrEmployee, checkPermission('porter::vehicles', 'edit'), updateGoodsType);
router.delete('/admin/goods-types/:id', ...adminOrEmployee, checkPermission('porter::vehicles', 'delete'), deleteGoodsType);
router.put('/admin/restricted-items', ...adminOrEmployee, checkPermission('porter::vehicles', 'edit'), updateRestrictedItems);

// Admin: Drivers (Porter-authorized partners)
router.get('/admin/drivers', ...adminOrEmployee, checkPermission('porter::users', 'view'), listDrivers);
router.get('/admin/drivers/:id', ...adminOrEmployee, checkPermission('porter::users', 'view'), getDriverById);
router.patch('/admin/drivers/:id/status', ...adminOrEmployee, checkPermission('porter::users', 'edit'), patchDriverStatus);

// Zones
router.get('/admin/zones/dropdown', ...adminOrEmployee, checkPermission('porter::zones', 'view'), listZoneDropdown);
router.get('/admin/zones', ...adminOrEmployee, checkPermission('porter::zones', 'view'), listZones);
router.get('/admin/zones/:id', ...adminOrEmployee, checkPermission('porter::zones', 'view'), getZoneById);
router.post('/admin/zones', ...adminOrEmployee, checkPermission('porter::zones', 'create'), createZone);
router.put('/admin/zones/:id', ...adminOrEmployee, checkPermission('porter::zones', 'edit'), updateZone);
router.patch('/admin/zones/:id/status', ...adminOrEmployee, checkPermission('porter::zones', 'edit'), patchZoneStatus);
router.delete('/admin/zones/:id', ...adminOrEmployee, checkPermission('porter::zones', 'delete'), deleteZone);

// Vehicles
router.get('/admin/vehicles/dropdown', ...adminOrEmployee, checkPermission('porter::vehicles', 'view'), listVehicleDropdown);
router.get('/admin/vehicles', ...adminOrEmployee, checkPermission('porter::vehicles', 'view'), listVehicles);
router.get('/admin/vehicles/:id', ...adminOrEmployee, checkPermission('porter::vehicles', 'view'), getVehicleById);
router.post('/admin/vehicles', ...adminOrEmployee, checkPermission('porter::vehicles', 'create'), upload.single('icon'), createVehicle);
router.put('/admin/vehicles/:id', ...adminOrEmployee, checkPermission('porter::vehicles', 'edit'), upload.single('icon'), updateVehicle);
router.patch('/admin/vehicles/:id/status', ...adminOrEmployee, checkPermission('porter::vehicles', 'edit'), patchVehicleStatus);
router.post('/admin/vehicles/:id/icon', ...adminOrEmployee, checkPermission('porter::vehicles', 'edit'), upload.single('icon'), uploadVehicleIcon);
router.delete('/admin/vehicles/:id', ...adminOrEmployee, checkPermission('porter::vehicles', 'delete'), deleteVehicle);

// Pricing
router.get('/admin/pricing', ...adminOrEmployee, checkPermission('porter::pricing', 'view'), listPricing);
router.post('/admin/pricing/zone-matrix', ...adminOrEmployee, checkPermission('porter::pricing', 'create'), saveZonePricingMatrix);
router.delete('/admin/pricing/zone-matrix/:zoneId', ...adminOrEmployee, checkPermission('porter::pricing', 'edit'), deleteZonePricingMatrix);
router.get('/admin/pricing/vehicle/:vehicleId', ...adminOrEmployee, checkPermission('porter::pricing', 'view'), getPricingByVehicleId);
router.get('/admin/pricing/:id', ...adminOrEmployee, checkPermission('porter::pricing', 'view'), getPricingById);
router.post('/admin/pricing', ...adminOrEmployee, checkPermission('porter::pricing', 'create'), createPricing);
router.put('/admin/pricing/:id', ...adminOrEmployee, checkPermission('porter::pricing', 'edit'), updatePricing);
router.put('/admin/pricing/vehicle/:vehicleId', ...adminOrEmployee, checkPermission('porter::pricing', 'edit'), upsertVehiclePricing);
router.patch('/admin/pricing/:id/status', ...adminOrEmployee, checkPermission('porter::pricing', 'edit'), patchPricingStatus);
router.delete('/admin/pricing/:id', ...adminOrEmployee, checkPermission('porter::pricing', 'delete'), deletePricing);
router.delete('/admin/pricing/vehicle/:vehicleId', ...adminOrEmployee, checkPermission('porter::pricing', 'delete'), clearVehiclePricing);

// Coupons
router.get('/admin/coupons/summary', ...adminOrEmployee, checkPermission('porter::coupons', 'view'), getCouponSummary);
router.get('/admin/coupons', ...adminOrEmployee, checkPermission('porter::coupons', 'view'), listCoupons);
router.get('/admin/coupons/:id', ...adminOrEmployee, checkPermission('porter::coupons', 'view'), getCouponById);
router.post('/admin/coupons', ...adminOrEmployee, checkPermission('porter::coupons', 'create'), createCoupon);
router.put('/admin/coupons/:id', ...adminOrEmployee, checkPermission('porter::coupons', 'edit'), updateCoupon);
router.patch('/admin/coupons/:id/status', ...adminOrEmployee, checkPermission('porter::coupons', 'edit'), patchCouponStatus);
router.delete('/admin/coupons/:id', ...adminOrEmployee, checkPermission('porter::coupons', 'delete'), deleteCoupon);

// Banners
router.get('/admin/banners/stats', ...adminOrEmployee, checkPermission('porter::banners', 'view'), getBannerStats);
router.get('/admin/banners', ...adminOrEmployee, checkPermission('porter::banners', 'view'), listBanners);
router.get('/admin/banners/:id', ...adminOrEmployee, checkPermission('porter::banners', 'view'), getBannerById);
router.post('/admin/banners', ...adminOrEmployee, checkPermission('porter::banners', 'create'), upload.single('image'), createBanner);
router.put('/admin/banners/:id', ...adminOrEmployee, checkPermission('porter::banners', 'edit'), upload.single('image'), updateBanner);
router.patch('/admin/banners/:id/status', ...adminOrEmployee, checkPermission('porter::banners', 'edit'), patchBannerStatus);
router.delete('/admin/banners/:id', ...adminOrEmployee, checkPermission('porter::banners', 'delete'), deleteBanner);

// Users (FoodUser listing)
router.get('/admin/users', ...adminOrEmployee, checkPermission('porter::users', 'view'), listPorterUsers);
router.get('/admin/users/:id', ...adminOrEmployee, checkPermission('porter::users', 'view'), getPorterUserById);
router.put('/admin/users/:id', ...adminOrEmployee, checkPermission('porter::users', 'edit'), updatePorterUser);
router.delete('/admin/users/:id', ...adminOrEmployee, checkPermission('porter::users', 'delete'), deletePorterUser);

// Admin: Trips
router.get('/admin/trips', ...adminOrEmployee, checkPorterTripView, listAdminTrips);
router.get('/admin/trips/:id', ...adminOrEmployee, checkPorterTripView, getAdminTripById);
router.get('/admin/dashboard', ...adminOrEmployee, checkPorterTripView, getDashboard);

// User: quote + trips
router.post('/quote', ...userOnly, quoteTrip);
router.post('/trips', ...userOnly, createTrip);
router.get('/trips', ...userOnly, listMyTrips);
router.get('/trips/:id', ...userOnly, getMyTripById);
router.post('/trips/:id/cancel', ...userOnly, cancelMyTrip);
router.post('/trips/:id/pay/wallet', ...userOnly, payWithWallet);
router.post('/trips/:id/pay/razorpay/order', ...userOnly, createUserRazorpayOrder);
router.post('/trips/:id/pay/razorpay/verify', ...userOnly, verifyUserRazorpayPayment);
router.post('/trips/:id/search', ...userOnly, requestTripSearch);
router.post('/trips/:id/pay/extra/wallet', ...userOnly, payExtraLoadingWithWallet);
router.get('/trips/:id/payment-status', ...userOnly, getUserPaymentStatus);

// Partner: trip lifecycle
router.get('/partner/trips/active', ...partnerOnly, getActivePartnerTrip);
router.get('/partner/trips', ...partnerOnly, listPartnerTrips);
router.post('/partner/trips/:id/accept', ...partnerOnly, acceptTrip);
router.post('/partner/trips/:id/arrived', ...partnerOnly, markArrived);
router.post('/partner/trips/:id/start', ...partnerOnly, startTrip);
router.post('/partner/trips/:id/loaded', ...partnerOnly, markLoaded);
router.post('/partner/trips/:id/at-drop', ...partnerOnly, markAtDrop);
router.post('/partner/trips/:id/collect/cash', ...partnerOnly, collectCash);
router.post('/partner/trips/:id/collect/qr', ...partnerOnly, createCollectQr);
router.get('/partner/trips/:id/payment-status', ...partnerOnly, getPartnerPaymentStatus);
router.post('/partner/trips/:id/complete', ...partnerOnly, completeTrip);

export default router;
