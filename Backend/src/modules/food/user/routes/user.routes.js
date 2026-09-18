import express from 'express';
import { upload } from '../../../../middleware/upload.js';
import {
    listAddressesController,
    addAddressController,
    updateAddressController,
    deleteAddressController,
    setDefaultAddressController
} from '../controllers/userAddress.controller.js';
import {
    getCurrentUserProfileController,
    updateCurrentUserProfileController,
    uploadCurrentUserProfileImageController,
    uploadCurrentUserIdentityDocumentController,
    deleteCurrentUserProfileController
} from '../controllers/userProfile.controller.js';
import {
    getUserWalletController,
    createWalletTopupOrderController,
    verifyWalletTopupPaymentController
} from '../controllers/userWallet.controller.js';
import {
    getUserReferralDetailsController,
    getUserReferralStatsController
} from '../controllers/userReferral.controller.js';
import {
    createSafetyEmergencyReportController,
    listMySafetyEmergencyReportsController
} from '../controllers/userSafetyEmergency.controller.js';
import {
    createSupportTicketController,
    listMySupportTicketsController
} from '../controllers/supportTicket.controller.js';
import {
    importContactsController,
    updatePermissionStatusController
} from '../controllers/userContact.controller.js';
import {
    getUserLocationController,
    updateUserLocationController
} from '../controllers/userLocation.controller.js';

import {
    submitRoleRequestController,
    listMyRoleRequestsController,
    updateRoleRequestController,
    deleteRoleRequestController
} from '../controllers/userRoleRequest.controller.js';
import { sensitiveActionRateLimiter, realtimeRateLimiter } from '../../../../middleware/rateLimit.js';

const router = express.Router();

router.get('/profile', getCurrentUserProfileController);
router.patch('/profile', updateCurrentUserProfileController);
router.delete('/profile', deleteCurrentUserProfileController);
router.post('/profile/profile-image', upload.single('file'), uploadCurrentUserProfileImageController);
router.post('/profile/identity-document', upload.single('file'), uploadCurrentUserIdentityDocumentController);

// Customer Role Requests
router.post('/role-requests', submitRoleRequestController);
router.get('/role-requests', listMyRoleRequestsController);
router.patch('/role-requests/:id', updateRoleRequestController);
router.delete('/role-requests/:id', deleteRoleRequestController);

// Wallet (Bearer USER)
router.get('/wallet', getUserWalletController);
router.post('/wallet/topup/order', sensitiveActionRateLimiter, createWalletTopupOrderController);
router.post('/wallet/topup/verify', sensitiveActionRateLimiter, verifyWalletTopupPaymentController);

// Referral stats (Bearer USER)
router.get('/referrals/stats', getUserReferralStatsController);
router.get('/referrals/details', getUserReferralDetailsController);

// Safety / Emergency reports (Bearer USER)
router.post('/safety-emergency-reports', createSafetyEmergencyReportController);
router.get('/safety-emergency-reports', listMySafetyEmergencyReportsController);

// Support tickets (Bearer USER)
router.post('/support/ticket', createSupportTicketController);
router.get('/support/my-tickets', listMySupportTicketsController);

router.get('/location', getUserLocationController);
// Written on every foreground GPS change, so it uses the per-user realtime bucket.
router.patch('/location', realtimeRateLimiter, updateUserLocationController);

router.get('/addresses', listAddressesController);
router.post('/addresses', addAddressController);
router.patch('/addresses/:addressId', updateAddressController);
router.delete('/addresses/:addressId', deleteAddressController);
router.patch('/addresses/:addressId/default', setDefaultAddressController);

// Contacts Sync & Permission Status routes (Bearer USER)
router.post('/contacts/import', importContactsController);
router.patch('/contacts/permission-status', updatePermissionStatusController);

export default router;
