import express from 'express';
import { authMiddleware, checkPermission } from '../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../core/roles/role.middleware.js';
import { assertModuleEnabled } from '../../../core/modules/moduleEnabled.service.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

import {
  listCategoriesController,
  createCategoryController,
  updateCategoryController,
  updateCategoryStatusController,
  deleteCategoryController,
  listServicesController,
  getServiceController,
  createServiceController,
  updateServiceController,
  updateServiceStatusController,
  deleteServiceController,
  getCustomerCatalogueController,
  getCustomerServiceDetailController,
} from '../controllers/catalog.controller.js';
import {
  listPackagesController,
  createPackageController,
  updatePackageController,
  updatePackageStatusController,
  deletePackageController,
  seedDefaultPackagesController,
  getCustomerPackagesController,
} from '../controllers/package.controller.js';
import {
  createPackageRequestController,
  getPackageRequestPaymentController,
  verifyPackageRequestPaymentController,
  listContractorPackageRequestsController,
  acceptPackageRequestController,
  declinePackageRequestController,
  listPackageRequestsController,
  updatePackageRequestStatusController,
  redispatchPackageRequestController,
  listAssignableContractorsController,
  assignPackageRequestController,
  refundPackageRequestController,
  getContractorPackageRequestController,
  listContractorAssignedVisitsController,
  listContractorNotificationsController,
  markContractorNotificationsReadController,
  startJourneyController,
  confirmArrivalController,
  saveVisitReportController,
  listMyPackageRequestsController,
  getMyPackageRequestController,
  regenerateVisitOtpController,
  acceptContractController,
  declineContractController,
  sendPackageContractController,
} from '../controllers/packageRequest.controller.js';
import {
  listBannersController,
  createBannerController,
  updateBannerController,
  updateBannerStatusController,
  deleteBannerController,
  getCustomerBannersController,
} from '../controllers/banner.controller.js';
import {
  listBudgetServicesController,
  createBudgetServiceController,
  updateBudgetServiceController,
  updateBudgetServiceStatusController,
  deleteBudgetServiceController,
  getCustomerBudgetServicesController,
} from '../controllers/budgetService.controller.js';
import {
  listMaterialsController,
  createMaterialController,
  updateMaterialController,
  updateMaterialStatusController,
  deleteMaterialController,
  listMaterialRequestsController,
  updateMaterialRequestStatusController,
  getCustomerMaterialsController,
  createMaterialRequestController,
} from '../controllers/material.controller.js';
import {
  getSettingsController,
  updateSettingsController,
  getPublicSettingsController,
} from '../controllers/settings.controller.js';
import {
  requestOtpController,
  verifyOtpController,
  getMeController,
  updateMyProfileController,
  getDraftController,
  saveDraftController,
  submitOnboardingController,
  getSelectableTradesController,
  addDocumentController,
  listDocumentsController,
  deleteDocumentController,
  addPortfolioController,
  listPortfolioController,
  updatePortfolioController,
  deletePortfolioController,
} from '../controllers/contractor.controller.js';
import {
  listContractorsController,
  getContractorController,
  getContractorStatsController,
  approveContractorController,
  rejectContractorController,
  suspendContractorController,
  activateContractorController,
  verifyDocumentController,
  rejectDocumentController,
  setPortfolioVerifiedController,
} from '../controllers/contractorAdmin.controller.js';
import {
  requireApprovedContractor,
  requireContractorAccount,
} from '../middleware/contractorGuard.middleware.js';
import { authRateLimiter } from '../../../middleware/rateLimit.js';
import {
  createEnquiryController,
  listMyEnquiriesController,
  getMyEnquiryController,
  compareQuotationsController,
  getMyQuotationController,
  listCustomerQuotationsController,
  acceptQuotationController,
  rejectQuotationController,
  askQuestionController,
  requestRevisionController,
  customerProposeVisitController,
  customerConfirmVisitController,
  customerCancelVisitController,
  listLeadsController,
  leadStatsController,
  acceptLeadController,
  declineLeadController,
  listMyJobsController,
  contractorProposeVisitController,
  contractorConfirmVisitController,
  contractorCancelVisitController,
  listMyVisitsController,
  getVisitController,
  submitVisitReportController,
  createDraftController,
  updateDraftController,
  sendQuotationController,
  createRevisionController,
  answerQueryController,
  listMyQuotationsController,
  getContractorQuotationController,
  listTemplatesController,
  createTemplateController,
  saveAsTemplateController,
  deleteTemplateController,
  adminListEnquiriesController,
  adminGetEnquiryController,
  adminEnquiryStatsController,
  adminRematchController,
  adminCloseEnquiryController,
} from '../controllers/pipeline.controller.js';
import {
  listMyProjectsController,
  getMyProjectController,
  getMyProjectMoneyController,
  fundProjectController,
  approveStageController,
  rejectStageController,
  getStageForCustomerController,
  listPendingApprovalsController,
  confirmHandoverController,
  listContractorProjectsController,
  getContractorProjectController,
  updateStageProgressController,
  submitStageController,
  getStageForContractorController,
  contractorEarningsController,
  adminListProjectsController,
  adminProjectStatsController,
  adminGetProjectController,
  adminHoldProjectController,
  adminResumeProjectController,
  adminCancelProjectController,
  adminApproveStageController,
  adminReconcileProjectController,
  adminReleaseRetentionController,
  adminReassignContractorController,
  requestCashPaymentController,
  approveCashPaymentController,
  rejectCashPaymentController,
  listContractorCashRequestsController,
  listCustomerCashRequestsController,
  adminListCashPaymentsController,
} from '../controllers/project.controller.js';

import {
  listMyDocumentsController, addMyDocumentController, myDocumentHistoryController,
  revokeMyDocumentController, documentReadinessController,
  listContractorDocumentsController, addContractorDocumentController,
  contractorDocumentHistoryController, revokeContractorDocumentController,
  adminListDocumentsController, adminAddDocumentController,

  listMyMessagesController, sendMyMessageController, markMyMessagesReadController,
  myUnreadCountController, retractMyMessageController,
  listContractorMessagesController, sendContractorMessageController,
  markContractorMessagesReadController, contractorUnreadCountController,
  retractContractorMessageController,
  adminListMessagesController, adminSendMessageController,

  raiseMyDisputeController, listMyDisputesController, getMyDisputeController,
  commentMyDisputeController, withdrawMyDisputeController,
  raiseContractorDisputeController, listContractorDisputesController,
  getContractorDisputeController, commentContractorDisputeController,
  withdrawContractorDisputeController,
  adminListDisputesController, adminDisputeStatsController, adminGetDisputeController,
  adminCommentDisputeController, adminWithdrawDisputeController,
  adminStartReviewController, adminResolveDisputeController,

  myScoreController, publicScoreController,
  listEnquiryContractorsController, searchContractorsController,
  contractorProfileController,
  adminRecalculateScoreController, adminRecalculateAllScoresController,
} from '../controllers/transparency.controller.js';

import {
  dashboardController, paymentControlController,
  cityReportController, serviceReportController, periodReportController,
  contractorReportController, delayReportController,
  activityLogController, projectActivityController,
} from '../controllers/admin.controller.js';

const router = express.Router();

/**
 * Module kill-switch.
 *
 * Blocks NEW work: browsing the catalogue, raising an enquiry, accepting a
 * quotation, taking a lead, sending a quote. Admin READS stay open, because when
 * the module is off your team must still be able to see what is configured.
 *
 * It deliberately does NOT block the completion of work that already exists.
 * Those routes use `customerLiveAuth` / `contractorLiveAuth`, and the three
 * admin money paths — approving a stage, releasing retention, resolving a
 * dispute — carry no gate either.
 *
 * The reason is money. An open project holds customer funds in escrow. If the
 * switch also froze the release paths, flipping it mid-project would leave that
 * money with exactly one way out: cancel the project and refund the customer,
 * stranding a contractor who has already built something. A kill-switch whose
 * only escape is not paying people who did the work is not a safety feature, and
 * `verify-construction-acceptance.js` exists largely to keep it that way.
 */
const requireModuleEnabled = asyncHandler(async (_req, _res, next) => {
  await assertModuleEnabled('construction');
  next();
});

/**
 * BRD Rule 5 — construction is a protected service. Unlike Food or Home Services,
 * there is no anonymous browsing of it at all: large sums of money and access to
 * people's homes are involved, so every customer-facing route requires a login.
 */
const customerAuth = [authMiddleware, requireRoles('USER'), requireModuleEnabled];

/**
 * The kill-switch has two tiers, and the difference matters more than it looks.
 *
 * `customerAuth` blocks NEW demand: browsing the catalogue, raising an enquiry,
 * accepting a quotation. Switching construction off should stop work arriving.
 *
 * `customerLiveAuth` deliberately has NO module gate, because a project that is
 * already running holds real customer money. If the switch also froze completion
 * paths, then flipping it mid-project would leave held funds with no way out
 * except cancelling and refunding the customer - stranding a contractor who has
 * already built something. A kill-switch that can only be escaped by not paying
 * people who did the work is not a safety feature.
 *
 * So: enquiries stop, funding/approval/handover/dispute resolution continue
 * until every open project has finished. Both tiers still require a logged-in
 * customer, and every route below still checks that THIS customer owns THAT
 * project - turning the module off never widens access, it only narrows it.
 */
const customerLiveAuth = [authMiddleware, requireRoles('USER')];
const adminAuth = [authMiddleware, requireRoles('ADMIN', 'EMPLOYEE')];

/**
 * Contractor guards.
 *
 * `contractorRegistering` is the weaker one — the account must exist and not be
 * suspended, but NOT be approved, or a contractor could never complete the very
 * registration that leads to approval. `contractorAuth` is the full guard used
 * for everything a working contractor does.
 *
 * Both are essential rather than defensive: authMiddleware only re-checks the
 * database for USER and DELIVERY_PARTNER tokens, so without these a suspended
 * contractor would keep working until their token expired.
 */
const contractorRegistering = [
  authMiddleware,
  requireRoles('CONTRACTOR'),
  requireModuleEnabled,
  requireContractorAccount,
];
// requireApprovedContractor is the full guard, used from Phase 4 onwards for
// leads, site visits and quotes — everything a working contractor does. It is
// imported here so the two guards stay documented together.
export const contractorAuth = [
  authMiddleware,
  requireRoles('CONTRACTOR'),
  requireModuleEnabled,
  requireApprovedContractor,
];

/** The contractor half of the same rule: finish what you started, take nothing new. */
const contractorLiveAuth = [
  authMiddleware,
  requireRoles('CONTRACTOR'),
  requireApprovedContractor,
];

// ---------- Customer catalogue (BRD C1, C2) ----------

router.get('/services', ...customerAuth, getCustomerCatalogueController);
router.get('/services/:idOrSlug', ...customerAuth, getCustomerServiceDetailController);
router.get('/settings', ...customerAuth, getPublicSettingsController);
router.get('/packages', ...customerAuth, getCustomerPackagesController);
router.post('/package-requests', ...customerAuth, createPackageRequestController);
router.post('/package-requests/:id/payment', ...customerAuth, getPackageRequestPaymentController);
router.post('/package-requests/:id/verify-payment', ...customerAuth, verifyPackageRequestPaymentController);

// Contractors: the site-visit requests sent to them, and taking or declining one.
router.get('/contractor/package-requests', ...contractorAuth, listContractorPackageRequestsController);
router.post('/contractor/package-requests/:id/accept', ...contractorAuth, acceptPackageRequestController);
router.post('/contractor/package-requests/:id/decline', ...contractorAuth, declinePackageRequestController);
// The bell in the contractor's header: recent notifications and marking them read.
router.get('/contractor/notifications', ...contractorAuth, listContractorNotificationsController);
router.post('/contractor/notifications/read', ...contractorAuth, markContractorNotificationsReadController);
// The booking page: start the journey, confirm arrival with the customer's OTP, send the report.
router.get('/contractor/package-visits', ...contractorAuth, listContractorAssignedVisitsController);
router.get('/contractor/package-requests/:id', ...contractorAuth, getContractorPackageRequestController);
router.post('/contractor/package-requests/:id/start-journey', ...contractorAuth, startJourneyController);
router.post('/contractor/package-requests/:id/verify-otp', ...contractorAuth, confirmArrivalController);
router.put('/contractor/package-requests/:id/report', ...contractorAuth, saveVisitReportController);

// Customers following their booking: contractor, OTP, and the contract to accept.
router.get('/package-requests', ...customerAuth, listMyPackageRequestsController);
router.get('/package-requests/:id', ...customerAuth, getMyPackageRequestController);
router.post('/package-requests/:id/visit-otp', ...customerAuth, regenerateVisitOtpController);
router.post('/package-requests/:id/contract/accept', ...customerAuth, acceptContractController);
router.post('/package-requests/:id/contract/decline', ...customerAuth, declineContractController);
router.get('/banners', ...customerAuth, getCustomerBannersController);
router.get('/budget-services', ...customerAuth, getCustomerBudgetServicesController);
router.get('/materials', ...customerAuth, getCustomerMaterialsController);
router.post('/material-requests', ...customerAuth, createMaterialRequestController);

// ---------- Admin: categories (BRD A8) ----------

router.get(
  '/admin/categories',
  ...adminAuth,
  checkPermission('construction::settings', 'view'),
  listCategoriesController,
);
router.post(
  '/admin/categories',
  ...adminAuth,
  checkPermission('construction::settings', 'create'),
  requireModuleEnabled,
  createCategoryController,
);
router.patch(
  '/admin/categories/:id',
  ...adminAuth,
  checkPermission('construction::settings', 'edit'),
  requireModuleEnabled,
  updateCategoryController,
);
router.patch(
  '/admin/categories/:id/status',
  ...adminAuth,
  checkPermission('construction::settings', 'edit'),
  requireModuleEnabled,
  updateCategoryStatusController,
);
router.delete(
  '/admin/categories/:id',
  ...adminAuth,
  checkPermission('construction::settings', 'delete'),
  requireModuleEnabled,
  deleteCategoryController,
);

// ---------- Admin: services (BRD A8) ----------

router.get(
  '/admin/services',
  ...adminAuth,
  checkPermission('construction::settings', 'view'),
  listServicesController,
);
router.get(
  '/admin/services/:id',
  ...adminAuth,
  checkPermission('construction::settings', 'view'),
  getServiceController,
);
router.post(
  '/admin/services',
  ...adminAuth,
  checkPermission('construction::settings', 'create'),
  requireModuleEnabled,
  createServiceController,
);
router.patch(
  '/admin/services/:id',
  ...adminAuth,
  checkPermission('construction::settings', 'edit'),
  requireModuleEnabled,
  updateServiceController,
);
router.patch(
  '/admin/services/:id/status',
  ...adminAuth,
  checkPermission('construction::settings', 'edit'),
  requireModuleEnabled,
  updateServiceStatusController,
);
router.delete(
  '/admin/services/:id',
  ...adminAuth,
  checkPermission('construction::settings', 'delete'),
  requireModuleEnabled,
  deleteServiceController,
);

// ---------- Admin: residential and commercial packages ----------
// Same permission as the rest of the catalogue: these are what the customer app
// shows before anyone enquires, so they are managed alongside categories and services.

router.get(
  '/admin/packages',
  ...adminAuth,
  checkPermission('construction::settings', 'view'),
  listPackagesController,
);
router.post(
  '/admin/packages',
  ...adminAuth,
  checkPermission('construction::settings', 'create'),
  requireModuleEnabled,
  createPackageController,
);
router.post(
  '/admin/packages/seed-defaults',
  ...adminAuth,
  checkPermission('construction::settings', 'create'),
  requireModuleEnabled,
  seedDefaultPackagesController,
);
router.patch(
  '/admin/packages/:id',
  ...adminAuth,
  checkPermission('construction::settings', 'edit'),
  requireModuleEnabled,
  updatePackageController,
);
router.patch(
  '/admin/packages/:id/status',
  ...adminAuth,
  checkPermission('construction::settings', 'edit'),
  requireModuleEnabled,
  updatePackageStatusController,
);
router.delete(
  '/admin/packages/:id',
  ...adminAuth,
  checkPermission('construction::settings', 'delete'),
  requireModuleEnabled,
  deletePackageController,
);

// ---------- Admin: package requests (customers selecting a package) ----------
// Handled from the End to End section, under the same permission as its packages.

router.get(
  '/admin/package-requests',
  ...adminAuth,
  checkPermission('construction::settings', 'view'),
  listPackageRequestsController,
);
router.patch(
  '/admin/package-requests/:id/status',
  ...adminAuth,
  checkPermission('construction::settings', 'edit'),
  requireModuleEnabled,
  updatePackageRequestStatusController,
);
router.post(
  '/admin/package-requests/:id/redispatch',
  ...adminAuth,
  checkPermission('construction::settings', 'edit'),
  requireModuleEnabled,
  redispatchPackageRequestController,
);
// The office picks the contractor: every commercial visit, and any residential one nobody accepted.
router.get(
  '/admin/package-requests/:id/contractors',
  ...adminAuth,
  checkPermission('construction::settings', 'view'),
  listAssignableContractorsController,
);
router.post(
  '/admin/package-requests/:id/assign',
  ...adminAuth,
  checkPermission('construction::settings', 'edit'),
  requireModuleEnabled,
  assignPackageRequestController,
);
// Once the contractor's site visit report is in, the office sends the customer a price and terms.
router.post(
  '/admin/package-requests/:id/contract',
  ...adminAuth,
  checkPermission('construction::settings', 'edit'),
  requireModuleEnabled,
  sendPackageContractController,
);
// Giving money back sits behind the payments permission, like every other money action here.
router.post(
  '/admin/package-requests/:id/refund',
  ...adminAuth,
  checkPermission('construction::payments', 'edit'),
  refundPackageRequestController,
);

// ---------- Admin: home screen banners ----------
// Managed from the Catalogue section, so they share its permission.

router.get(
  '/admin/banners',
  ...adminAuth,
  checkPermission('construction::settings', 'view'),
  listBannersController,
);
router.post(
  '/admin/banners',
  ...adminAuth,
  checkPermission('construction::settings', 'create'),
  requireModuleEnabled,
  createBannerController,
);
router.patch(
  '/admin/banners/:id',
  ...adminAuth,
  checkPermission('construction::settings', 'edit'),
  requireModuleEnabled,
  updateBannerController,
);
router.patch(
  '/admin/banners/:id/status',
  ...adminAuth,
  checkPermission('construction::settings', 'edit'),
  requireModuleEnabled,
  updateBannerStatusController,
);
router.delete(
  '/admin/banners/:id',
  ...adminAuth,
  checkPermission('construction::settings', 'delete'),
  requireModuleEnabled,
  deleteBannerController,
);

// ---------- Admin: budget friendly services ----------
// Same catalogue permission as the rest of these sidebar sections.

router.get(
  '/admin/budget-services',
  ...adminAuth,
  checkPermission('construction::settings', 'view'),
  listBudgetServicesController,
);
router.post(
  '/admin/budget-services',
  ...adminAuth,
  checkPermission('construction::settings', 'create'),
  requireModuleEnabled,
  createBudgetServiceController,
);
router.patch(
  '/admin/budget-services/:id',
  ...adminAuth,
  checkPermission('construction::settings', 'edit'),
  requireModuleEnabled,
  updateBudgetServiceController,
);
router.patch(
  '/admin/budget-services/:id/status',
  ...adminAuth,
  checkPermission('construction::settings', 'edit'),
  requireModuleEnabled,
  updateBudgetServiceStatusController,
);
router.delete(
  '/admin/budget-services/:id',
  ...adminAuth,
  checkPermission('construction::settings', 'delete'),
  requireModuleEnabled,
  deleteBudgetServiceController,
);

// ---------- Admin: materials and material quote requests ----------
// Under the same catalogue permission as everything else in these sidebar sections.

router.get(
  '/admin/materials',
  ...adminAuth,
  checkPermission('construction::settings', 'view'),
  listMaterialsController,
);
router.post(
  '/admin/materials',
  ...adminAuth,
  checkPermission('construction::settings', 'create'),
  requireModuleEnabled,
  createMaterialController,
);
router.patch(
  '/admin/materials/:id',
  ...adminAuth,
  checkPermission('construction::settings', 'edit'),
  requireModuleEnabled,
  updateMaterialController,
);
router.patch(
  '/admin/materials/:id/status',
  ...adminAuth,
  checkPermission('construction::settings', 'edit'),
  requireModuleEnabled,
  updateMaterialStatusController,
);
router.delete(
  '/admin/materials/:id',
  ...adminAuth,
  checkPermission('construction::settings', 'delete'),
  requireModuleEnabled,
  deleteMaterialController,
);
router.get(
  '/admin/material-requests',
  ...adminAuth,
  checkPermission('construction::settings', 'view'),
  listMaterialRequestsController,
);
router.patch(
  '/admin/material-requests/:id/status',
  ...adminAuth,
  checkPermission('construction::settings', 'edit'),
  requireModuleEnabled,
  updateMaterialRequestStatusController,
);

// ---------- Admin: module settings (§7 of the blueprint) ----------

router.get(
  '/admin/settings',
  ...adminAuth,
  checkPermission('construction::settings', 'view'),
  getSettingsController,
);
router.patch(
  '/admin/settings',
  ...adminAuth,
  checkPermission('construction::settings', 'edit'),
  requireModuleEnabled,
  updateSettingsController,
);

// ---------- Contractor auth (BRD W1) ----------

router.post('/contractor/auth/request-otp', authRateLimiter, requestOtpController);
router.post('/contractor/auth/verify-otp', authRateLimiter, verifyOtpController);
router.get(
  '/contractor/auth/me',
  authMiddleware,
  requireRoles('CONTRACTOR'),
  getMeController,
);

// ---------- Contractor registration (BRD W1–W5) ----------
// Reachable while still unapproved — that is the whole point of these routes.

// A contractor editing their own profile after approval (photo, description,
// where they work, capacity). Uses the LIVE tier — a contractor mid-project must
// still be able to correct their own details if the module is switched off.
router.patch('/contractor/profile', ...contractorLiveAuth, updateMyProfileController);

router.get('/contractor/onboarding/draft', ...contractorRegistering, getDraftController);
router.patch('/contractor/onboarding/draft', ...contractorRegistering, saveDraftController);
router.post('/contractor/onboarding/submit', ...contractorRegistering, submitOnboardingController);
router.get('/contractor/onboarding/trades', ...contractorRegistering, getSelectableTradesController);

router.get('/contractor/documents', ...contractorRegistering, listDocumentsController);
router.post('/contractor/documents', ...contractorRegistering, addDocumentController);
router.delete('/contractor/documents/:id', ...contractorRegistering, deleteDocumentController);

router.get('/contractor/portfolio', ...contractorRegistering, listPortfolioController);
router.post('/contractor/portfolio', ...contractorRegistering, addPortfolioController);
router.patch('/contractor/portfolio/:id', ...contractorRegistering, updatePortfolioController);
router.delete('/contractor/portfolio/:id', ...contractorRegistering, deletePortfolioController);

// ---------- Admin: contractor approval queue (BRD A2, A3 · Rule 6) ----------

router.get(
  '/admin/contractors/stats',
  ...adminAuth,
  checkPermission('construction::contractors', 'view'),
  getContractorStatsController,
);
router.get(
  '/admin/contractors',
  ...adminAuth,
  checkPermission('construction::contractors', 'view'),
  listContractorsController,
);
router.get(
  '/admin/contractors/:id',
  ...adminAuth,
  checkPermission('construction::contractors', 'view'),
  getContractorController,
);
router.patch(
  '/admin/contractors/:id/approve',
  ...adminAuth,
  checkPermission('construction::contractors', 'edit'),
  requireModuleEnabled,
  approveContractorController,
);
router.patch(
  '/admin/contractors/:id/reject',
  ...adminAuth,
  checkPermission('construction::contractors', 'edit'),
  requireModuleEnabled,
  rejectContractorController,
);
router.patch(
  '/admin/contractors/:id/suspend',
  ...adminAuth,
  checkPermission('construction::contractors', 'edit'),
  suspendContractorController,
);
router.patch(
  '/admin/contractors/:id/activate',
  ...adminAuth,
  checkPermission('construction::contractors', 'edit'),
  requireModuleEnabled,
  activateContractorController,
);

// Suspend is deliberately NOT gated on the module being enabled: if construction
// is switched off mid-incident your team must still be able to stop a contractor.

router.patch(
  '/admin/contractors/documents/:documentId/verify',
  ...adminAuth,
  checkPermission('construction::contractors', 'edit'),
  requireModuleEnabled,
  verifyDocumentController,
);
router.patch(
  '/admin/contractors/documents/:documentId/reject',
  ...adminAuth,
  checkPermission('construction::contractors', 'edit'),
  requireModuleEnabled,
  rejectDocumentController,
);
router.patch(
  '/admin/contractors/portfolio/:entryId/verify',
  ...adminAuth,
  checkPermission('construction::contractors', 'edit'),
  requireModuleEnabled,
  setPortfolioVerifiedController,
);

// ==================== PHASE 4 — enquiry to quote ====================

// ---------- Customer (BRD C3–C13) ----------

router.post('/enquiries', ...customerAuth, createEnquiryController);
router.get('/enquiries', ...customerAuth, listMyEnquiriesController);
router.get('/enquiries/:id', ...customerAuth, getMyEnquiryController);
router.get('/enquiries/:id/compare', ...customerAuth, compareQuotationsController);
router.post('/enquiries/:id/quotations/:quotationId/accept', ...customerAuth, acceptQuotationController);
router.post('/enquiries/:id/quotations/:quotationId/reject', ...customerAuth, rejectQuotationController);

router.get('/quotations', ...customerAuth, listCustomerQuotationsController);
router.get('/quotations/:id', ...customerAuth, getMyQuotationController);
router.post('/quotations/:id/questions', ...customerAuth, askQuestionController);
router.post('/quotations/:id/request-revision', ...customerAuth, requestRevisionController);

router.post('/site-visits', ...customerAuth, customerProposeVisitController);
router.patch('/site-visits/:id/confirm', ...customerAuth, customerConfirmVisitController);
router.patch('/site-visits/:id/cancel', ...customerAuth, customerCancelVisitController);

// ---------- Contractor (BRD W6–W13) ----------
// Every route below requires an APPROVED contractor: an unverified contractor
// must never see a customer's enquiry, which is the whole trust promise.

router.get('/contractor/leads', ...contractorAuth, listLeadsController);
router.get('/contractor/leads/stats', ...contractorAuth, leadStatsController);
router.patch('/contractor/leads/:id/accept', ...contractorAuth, acceptLeadController);
router.patch('/contractor/leads/:id/decline', ...contractorAuth, declineLeadController);
router.get('/contractor/jobs', ...contractorAuth, listMyJobsController);

router.get('/contractor/site-visits', ...contractorAuth, listMyVisitsController);
router.post('/contractor/site-visits', ...contractorAuth, contractorProposeVisitController);
router.get('/contractor/site-visits/:id', ...contractorAuth, getVisitController);
router.patch('/contractor/site-visits/:id/confirm', ...contractorAuth, contractorConfirmVisitController);
router.patch('/contractor/site-visits/:id/cancel', ...contractorAuth, contractorCancelVisitController);
router.post('/contractor/site-visits/:id/report', ...contractorAuth, submitVisitReportController);

router.get('/contractor/quotations', ...contractorAuth, listMyQuotationsController);
router.post('/contractor/quotations', ...contractorAuth, createDraftController);
router.get('/contractor/quotations/:id', ...contractorAuth, getContractorQuotationController);
router.patch('/contractor/quotations/:id', ...contractorAuth, updateDraftController);
router.post('/contractor/quotations/:id/send', ...contractorAuth, sendQuotationController);
router.post('/contractor/quotations/:id/revise', ...contractorAuth, createRevisionController);
router.post('/contractor/quotations/:id/queries/:queryId/answer', ...contractorAuth, answerQueryController);
router.post('/contractor/quotations/:id/save-as-template', ...contractorAuth, saveAsTemplateController);

router.get('/contractor/templates', ...contractorAuth, listTemplatesController);
router.post('/contractor/templates', ...contractorAuth, createTemplateController);
router.delete('/contractor/templates/:id', ...contractorAuth, deleteTemplateController);

// ---------- Admin: enquiry pipeline (BRD A4) ----------

router.get(
  '/admin/enquiries/stats',
  ...adminAuth,
  checkPermission('construction::enquiries', 'view'),
  adminEnquiryStatsController,
);
router.get(
  '/admin/enquiries',
  ...adminAuth,
  checkPermission('construction::enquiries', 'view'),
  adminListEnquiriesController,
);
router.get(
  '/admin/enquiries/:id',
  ...adminAuth,
  checkPermission('construction::enquiries', 'view'),
  adminGetEnquiryController,
);
router.post(
  '/admin/enquiries/:id/rematch',
  ...adminAuth,
  checkPermission('construction::enquiries', 'edit'),
  requireModuleEnabled,
  adminRematchController,
);
router.post(
  '/admin/enquiries/:id/close',
  ...adminAuth,
  checkPermission('construction::enquiries', 'edit'),
  adminCloseEnquiryController,
);

// ==================== PHASE 5 — projects, stages and escrow ====================

// ---------- Customer (BRD C14–C17, C21–C23) ----------
// Funding and approval carry real money, so both accept an Idempotency-Key and
// are additionally idempotent server-side on a stable reference.

router.get('/projects', ...customerLiveAuth, listMyProjectsController);
router.get('/projects/pending-approvals', ...customerLiveAuth, listPendingApprovalsController);
router.get('/projects/:id', ...customerLiveAuth, getMyProjectController);
router.get('/projects/:id/money', ...customerLiveAuth, getMyProjectMoneyController);
router.post('/projects/:id/fund', ...customerLiveAuth, fundProjectController);
router.post('/projects/:id/handover', ...customerLiveAuth, confirmHandoverController);

router.get('/stages/:stageId', ...customerLiveAuth, getStageForCustomerController);
router.post('/stages/:stageId/approve', ...customerLiveAuth, approveStageController);
router.post('/stages/:stageId/reject', ...customerLiveAuth, rejectStageController);

// ---------- Contractor (BRD W14–W17) ----------

router.get('/contractor/projects', ...contractorLiveAuth, listContractorProjectsController);
router.get('/contractor/earnings', ...contractorLiveAuth, contractorEarningsController);
router.get('/contractor/projects/:id', ...contractorLiveAuth, getContractorProjectController);
router.get('/contractor/stages/:stageId', ...contractorLiveAuth, getStageForContractorController);
router.patch('/contractor/stages/:stageId/progress', ...contractorLiveAuth, updateStageProgressController);
router.post('/contractor/stages/:stageId/submit', ...contractorLiveAuth, submitStageController);

// ---------- Admin (BRD A5, A6, A7) ----------

router.get(
  '/admin/projects/stats',
  ...adminAuth,
  checkPermission('construction::projects', 'view'),
  adminProjectStatsController,
);
router.get(
  '/admin/projects',
  ...adminAuth,
  checkPermission('construction::projects', 'view'),
  adminListProjectsController,
);
router.get(
  '/admin/projects/:id',
  ...adminAuth,
  checkPermission('construction::projects', 'view'),
  adminGetProjectController,
);

// Intervention (BRD A6). Hold is NOT gated on the module being enabled: if
// construction is switched off mid-incident your team must still be able to
// stop a project.
router.post(
  '/admin/projects/:id/hold',
  ...adminAuth,
  checkPermission('construction::projects', 'edit'),
  adminHoldProjectController,
);
router.post(
  '/admin/projects/:id/resume',
  ...adminAuth,
  checkPermission('construction::projects', 'edit'),
  requireModuleEnabled,
  adminResumeProjectController,
);
router.post(
  '/admin/projects/:id/cancel',
  ...adminAuth,
  checkPermission('construction::projects', 'edit'),
  adminCancelProjectController,
);

/**
 * Money control (BRD A7). Deliberately behind `construction::payments` rather
 * than `construction::projects`: approving a release on a customer's behalf and
 * paying out retention are the two most consequential actions in the module, and
 * they should not come bundled with ordinary project access.
 */
router.post(
  '/admin/stages/:stageId/approve',
  ...adminAuth,
  checkPermission('construction::payments', 'edit'),
  adminApproveStageController,
);
router.post(
  '/admin/projects/:id/release-retention',
  ...adminAuth,
  checkPermission('construction::payments', 'edit'),
  adminReleaseRetentionController,
);
router.post(
  '/admin/projects/:id/reconcile',
  ...adminAuth,
  checkPermission('construction::payments', 'view'),
  adminReconcileProjectController,
);

// Cash Payment Routes (Customer, Contractor & Admin)
router.post('/projects/:id/cash-fund', ...customerLiveAuth, requestCashPaymentController);
router.get('/cash-requests', ...customerLiveAuth, listCustomerCashRequestsController);

router.get('/contractor/cash-requests', ...contractorLiveAuth, listContractorCashRequestsController);
router.post('/contractor/cash-requests/:requestId/approve', ...contractorLiveAuth, approveCashPaymentController);
router.post('/contractor/cash-requests/:requestId/reject', ...contractorLiveAuth, rejectCashPaymentController);

router.get(
  '/admin/cash-payments',
  ...adminAuth,
  checkPermission('construction::payments', 'view'),
  adminListCashPaymentsController,
);

// ============================================================================
// PHASE 6 - transparency: documents (C19), messaging (C20), disputes (Q15),
// trust score (W18)
// ============================================================================

// ---------- Customer: documents (BRD C19) ----------
router.get('/projects/:id/documents', ...customerLiveAuth, listMyDocumentsController);
router.post('/projects/:id/documents', ...customerLiveAuth, addMyDocumentController);
router.get('/projects/:id/documents/readiness', ...customerLiveAuth, documentReadinessController);
router.get('/projects/:id/documents/:documentId/history', ...customerLiveAuth, myDocumentHistoryController);
router.post('/projects/:id/documents/:documentId/revoke', ...customerLiveAuth, revokeMyDocumentController);

// ---------- Customer: messages (BRD C20) ----------
router.get('/projects/:id/messages', ...customerLiveAuth, listMyMessagesController);
router.post('/projects/:id/messages', ...customerLiveAuth, sendMyMessageController);
router.get('/projects/:id/messages/unread', ...customerLiveAuth, myUnreadCountController);
router.post('/projects/:id/messages/read', ...customerLiveAuth, markMyMessagesReadController);
router.post('/projects/:id/messages/:messageId/retract', ...customerLiveAuth, retractMyMessageController);

// ---------- Customer: disputes (BRD Q15) ----------
router.get('/projects/:id/disputes', ...customerLiveAuth, listMyDisputesController);
router.post('/projects/:id/disputes', ...customerLiveAuth, raiseMyDisputeController);
router.get('/disputes/:disputeId', ...customerLiveAuth, getMyDisputeController);
router.post('/disputes/:disputeId/comments', ...customerLiveAuth, commentMyDisputeController);
router.post('/disputes/:disputeId/withdraw', ...customerLiveAuth, withdrawMyDisputeController);

// ---------- Customer: choosing a contractor (BRD C6, C7, C8) ----------
// Browsing is how NEW work starts, so these sit behind the module gate. The
// order matters: '/contractors' must be registered before '/contractors/:id'
// or the literal path would be swallowed by the parameter.
router.get('/contractors', ...customerAuth, searchContractorsController);
router.get('/contractors/:contractorId', ...customerAuth, contractorProfileController);
router.get('/contractors/:contractorId/score', ...customerAuth, publicScoreController);
router.get('/enquiries/:id/contractors', ...customerAuth, listEnquiryContractorsController);

// ---------- Contractor: documents ----------
router.get('/contractor/projects/:id/documents', ...contractorLiveAuth, listContractorDocumentsController);
router.post('/contractor/projects/:id/documents', ...contractorLiveAuth, addContractorDocumentController);
router.get('/contractor/projects/:id/documents/:documentId/history', ...contractorLiveAuth, contractorDocumentHistoryController);
router.post('/contractor/projects/:id/documents/:documentId/revoke', ...contractorLiveAuth, revokeContractorDocumentController);

// ---------- Contractor: messages ----------
router.get('/contractor/projects/:id/messages', ...contractorLiveAuth, listContractorMessagesController);
router.post('/contractor/projects/:id/messages', ...contractorLiveAuth, sendContractorMessageController);
router.get('/contractor/projects/:id/messages/unread', ...contractorLiveAuth, contractorUnreadCountController);
router.post('/contractor/projects/:id/messages/read', ...contractorLiveAuth, markContractorMessagesReadController);
router.post('/contractor/projects/:id/messages/:messageId/retract', ...contractorLiveAuth, retractContractorMessageController);

// ---------- Contractor: disputes ----------
router.get('/contractor/projects/:id/disputes', ...contractorLiveAuth, listContractorDisputesController);
router.post('/contractor/projects/:id/disputes', ...contractorLiveAuth, raiseContractorDisputeController);
router.get('/contractor/disputes/:disputeId', ...contractorLiveAuth, getContractorDisputeController);
router.post('/contractor/disputes/:disputeId/comments', ...contractorLiveAuth, commentContractorDisputeController);
router.post('/contractor/disputes/:disputeId/withdraw', ...contractorLiveAuth, withdrawContractorDisputeController);

// ---------- Contractor: own trust score (BRD W18) ----------
router.get('/contractor/score', ...contractorAuth, myScoreController);

// ---------- Admin: documents and messages ----------
router.get(
  '/admin/projects/:id/documents',
  ...adminAuth,
  checkPermission('construction::projects', 'view'),
  adminListDocumentsController,
);
router.post(
  '/admin/projects/:id/documents',
  ...adminAuth,
  checkPermission('construction::projects', 'edit'),
  requireModuleEnabled,
  adminAddDocumentController,
);
router.get(
  '/admin/projects/:id/messages',
  ...adminAuth,
  checkPermission('construction::projects', 'view'),
  adminListMessagesController,
);
router.post(
  '/admin/projects/:id/messages',
  ...adminAuth,
  checkPermission('construction::projects', 'edit'),
  requireModuleEnabled,
  adminSendMessageController,
);

// ---------- Admin: the dispute queue (BRD Q15) ----------
// Reading and triaging sit under `disputes`. RESOLVING sits under `payments`,
// because a resolution moves customer money - the same reasoning that keeps
// stage approval and retention release on the payments permission.
router.get(
  '/admin/disputes/stats',
  ...adminAuth,
  checkPermission('construction::disputes', 'view'),
  adminDisputeStatsController,
);
router.get(
  '/admin/disputes',
  ...adminAuth,
  checkPermission('construction::disputes', 'view'),
  adminListDisputesController,
);
router.get(
  '/admin/disputes/:disputeId',
  ...adminAuth,
  checkPermission('construction::disputes', 'view'),
  adminGetDisputeController,
);
router.post(
  '/admin/disputes/:disputeId/review',
  ...adminAuth,
  checkPermission('construction::disputes', 'edit'),
  adminStartReviewController,
);
router.post(
  '/admin/disputes/:disputeId/comments',
  ...adminAuth,
  checkPermission('construction::disputes', 'edit'),
  adminCommentDisputeController,
);
router.post(
  '/admin/disputes/:disputeId/withdraw',
  ...adminAuth,
  checkPermission('construction::disputes', 'edit'),
  adminWithdrawDisputeController,
);
router.post(
  '/admin/disputes/:disputeId/resolve',
  ...adminAuth,
  checkPermission('construction::payments', 'edit'),
  adminResolveDisputeController,
);

// ---------- Admin: trust score (BRD W18) ----------
router.post(
  '/admin/contractors/:contractorId/score/recalculate',
  ...adminAuth,
  checkPermission('construction::contractors', 'edit'),
  adminRecalculateScoreController,
);
router.post(
  '/admin/scores/recalculate',
  ...adminAuth,
  checkPermission('construction::contractors', 'edit'),
  adminRecalculateAllScoresController,
);

// ============================================================================
// PHASE 7 - the office team: dashboard (A1), payment control (A7),
// reports (A9), activity record (A10)
// ============================================================================

// ---------- A1 - the screen ops keeps open all day ----------
router.get(
  '/admin/dashboard',
  ...adminAuth,
  checkPermission('construction::reports', 'view'),
  dashboardController,
);

// ---------- A7 - oversight of every rupee held and released ----------
router.get(
  '/admin/payment-control',
  ...adminAuth,
  checkPermission('construction::payments', 'view'),
  paymentControlController,
);

// ---------- A9 - reports ----------
router.get(
  '/admin/reports/cities',
  ...adminAuth,
  checkPermission('construction::reports', 'view'),
  cityReportController,
);
router.get(
  '/admin/reports/services',
  ...adminAuth,
  checkPermission('construction::reports', 'view'),
  serviceReportController,
);
router.get(
  '/admin/reports/periods',
  ...adminAuth,
  checkPermission('construction::reports', 'view'),
  periodReportController,
);
router.get(
  '/admin/reports/contractors',
  ...adminAuth,
  checkPermission('construction::reports', 'view'),
  contractorReportController,
);
router.get(
  '/admin/reports/delays',
  ...adminAuth,
  checkPermission('construction::reports', 'view'),
  delayReportController,
);

// ---------- A10 - the permanent activity record ----------
// Read-only by construction of the storage layer: `platform_audit_logs` refuses
// updates and deletes, so there is deliberately no endpoint to amend it.
router.get(
  '/admin/activity',
  ...adminAuth,
  checkPermission('construction::reports', 'view'),
  activityLogController,
);
router.get(
  '/admin/projects/:id/activity',
  ...adminAuth,
  checkPermission('construction::projects', 'view'),
  projectActivityController,
);

// ---------- A6 - reassign the contractor ----------
// Sits on `payments` rather than `projects`: money already released stays with
// the outgoing contractor, so this decides who gets paid for the rest.
router.post(
  '/admin/projects/:id/reassign',
  ...adminAuth,
  checkPermission('construction::payments', 'edit'),
  requireModuleEnabled,
  adminReassignContractorController,
);

export default router;
