import express from 'express';
import * as settingsController from '../controllers/settings.controller.js';
import { upload } from '../../../middleware/upload.js';
import { authMiddleware } from '../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../core/roles/role.middleware.js';
import * as vehicleConfigurationController from '../controllers/vehicleConfiguration.controller.js';

const router = express.Router();

// Public endpoint for app logo/theme
router.get('/public', settingsController.getGlobalSettings);
router.get(
    '/driver-onboarding-config',
    async (req, res, next) => {
        try {
            const { getPublicDriverOnboardingConfig } =
                await import('../services/driverOnboardingConfig.service.js');
            const { sendResponse } = await import('../../../utils/response.js');
            const data = await getPublicDriverOnboardingConfig();
            return sendResponse(res, 200, 'Driver onboarding configuration fetched', data);
        } catch (error) {
            next(error);
        }
    },
);

// Protected admin endpoints
router.get('/', authMiddleware, requireRoles('ADMIN', 'EMPLOYEE'), settingsController.getGlobalSettings);
router.patch('/', authMiddleware, requireRoles('ADMIN'), upload.fields([
    { name: 'adminLogo', maxCount: 1 },
    { name: 'adminFavicon', maxCount: 1 },
    { name: 'userLogo', maxCount: 1 },
    { name: 'userFavicon', maxCount: 1 },
    { name: 'deliveryLogo', maxCount: 1 },
    { name: 'deliveryFavicon', maxCount: 1 },
    { name: 'restaurantLogo', maxCount: 1 },
    { name: 'restaurantFavicon', maxCount: 1 },
    { name: 'sellerLogo', maxCount: 1 },
    { name: 'sellerFavicon', maxCount: 1 },
    { name: 'loginBanner', maxCount: 1 },
    { name: 'sellerLoginBanner', maxCount: 1 },
    { name: 'restaurantLoginBanner', maxCount: 1 }
]), settingsController.updateGlobalSettings);

router.post(
    '/reset-operational-data',
    authMiddleware,
    requireRoles('ADMIN'),
    settingsController.resetOperationalData,
);

router.get(
    '/vehicle-configurations',
    authMiddleware,
    requireRoles('ADMIN', 'EMPLOYEE'),
    vehicleConfigurationController.getConfiguration
);
router.post(
    '/vehicle-configurations',
    authMiddleware,
    requireRoles('ADMIN'),
    upload.single('icon'),
    vehicleConfigurationController.createVehicle
);
router.patch(
    '/vehicle-configurations/:id',
    authMiddleware,
    requireRoles('ADMIN'),
    upload.single('icon'),
    vehicleConfigurationController.updateVehicle
);
router.patch(
    '/vehicle-configurations/:id/status',
    authMiddleware,
    requireRoles('ADMIN'),
    vehicleConfigurationController.setVehicleStatus
);
router.delete(
    '/vehicle-configurations/:id',
    authMiddleware,
    requireRoles('ADMIN'),
    vehicleConfigurationController.deleteVehicle
);
router.put(
    '/module-vehicle-mappings',
    authMiddleware,
    requireRoles('ADMIN'),
    vehicleConfigurationController.updateMappings
);

export default router;
