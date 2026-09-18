import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError } from '../../../core/auth/errors.js';
import * as projectService from '../services/project.service.js';
import * as stageService from '../services/stage.service.js';
import * as handoverService from '../services/handover.service.js';
import { validateObjectId, validateReasonDto } from '../validators/pipeline.validator.js';

const handle = (error, res, next) => {
  if (error instanceof ValidationError) {
    return sendError(res, error.statusCode || 400, error.message);
  }
  if (error?.name === 'ValidationError') {
    const first = error.errors ? Object.values(error.errors)[0] : null;
    return sendError(res, 400, first?.message || error.message || 'Invalid data');
  }
  return next(error);
};

const wrap = (fn) => asyncHandler(async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    handle(error, res, next);
  }
});

// ==================== CUSTOMER (BRD C14–C17, C21–C23) ====================

export const listMyProjectsController = wrap(async (req, res) => {
  const result = await projectService.listCustomerProjects(req.user.userId, req.query);
  return sendResponse(res, 200, 'Your projects', result);
});

export const getMyProjectController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'project id');
  const result = await projectService.getProjectForCustomer(req.user.userId, id);
  return sendResponse(res, 200, 'Project', result);
});

export const getMyProjectMoneyController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'project id');
  const money = await projectService.getProjectMoney(id, { customerId: req.user.userId });
  return sendResponse(res, 200, 'Payment schedule', money);
});

/** BRD C22 — put money in. Held, not transferred. */
export const fundProjectController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'project id');
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ValidationError('Enter an amount greater than zero');
  }
  const result = await projectService.fundProject(req.user.userId, id, amount);
  return sendResponse(
    res,
    200,
    result.alreadyProcessed ? 'Already funded' : 'Money held for this project',
    result,
  );
});

/** BRD C17 — approving is what releases the payment. */
export const approveStageController = wrap(async (req, res) => {
  const stageId = validateObjectId(req.params.stageId, 'stage id');
  const result = await stageService.approveStage(stageId, {
    actorRole: 'customer',
    actorId: req.user.userId,
    reqUser: req.user,
    via: 'customer',
    note: String(req.body?.note || '').trim(),
  });
  return sendResponse(
    res,
    200,
    result.alreadyReleased ? 'This stage was already paid' : 'Stage approved and payment released',
    result,
  );
});

export const rejectStageController = wrap(async (req, res) => {
  const stageId = validateObjectId(req.params.stageId, 'stage id');
  const reason = validateReasonDto(req.body, { required: true, label: 'note on what still needs doing' });
  const stage = await stageService.rejectStage(stageId, {
    actorId: req.user.userId, reqUser: req.user, reason,
  });
  return sendResponse(res, 200, 'Sent back to the contractor', { stage });
});

export const getStageForCustomerController = wrap(async (req, res) => {
  const stageId = validateObjectId(req.params.stageId, 'stage id');
  const result = await stageService.getStage(stageId, { customerId: req.user.userId });
  return sendResponse(res, 200, 'Stage', result);
});

export const listPendingApprovalsController = wrap(async (req, res) => {
  const stages = await stageService.listStagesAwaitingCustomer(req.user.userId);
  return sendResponse(res, 200, 'Waiting for your approval', { stages });
});

/** BRD C23 — handover and rating. */
export const confirmHandoverController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'project id');
  const result = await handoverService.confirmHandover(req.user.userId, id, {
    rating: req.body?.rating,
    review: req.body?.review,
  });
  return sendResponse(res, 200, 'Handover confirmed', result);
});

// ==================== CONTRACTOR (BRD W14–W17) ====================

export const listContractorProjectsController = wrap(async (req, res) => {
  const result = await projectService.listContractorProjects(req.contractorId, req.query);
  return sendResponse(res, 200, 'Your projects', result);
});

export const getContractorProjectController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'project id');
  const result = await projectService.getProjectForContractor(req.contractorId, id);
  return sendResponse(res, 200, 'Project', result);
});

/** BRD W15 — record how far along a stage is. */
export const updateStageProgressController = wrap(async (req, res) => {
  const stageId = validateObjectId(req.params.stageId, 'stage id');
  const stage = await stageService.updateProgress(req.contractorId, stageId, {
    progressPercent: req.body?.progressPercent,
    notes: req.body?.notes,
  });
  return sendResponse(res, 200, 'Progress saved', { stage });
});

/** BRD W16 — submit for approval, with the evidence that unlocks payment. */
export const submitStageController = wrap(async (req, res) => {
  const stageId = validateObjectId(req.params.stageId, 'stage id');
  const photos = Array.isArray(req.body?.photos) ? req.body.photos : [];
  if (photos.length === 0) {
    throw new ValidationError('Add at least one photograph as proof of the work done');
  }
  const result = await stageService.submitStage(req.contractorId, stageId, {
    progressPercent: req.body?.progressPercent,
    notes: req.body?.notes,
    photos,
  });
  return sendResponse(res, 200, 'Sent to the customer for approval', result);
});

export const getStageForContractorController = wrap(async (req, res) => {
  const stageId = validateObjectId(req.params.stageId, 'stage id');
  const result = await stageService.getStage(stageId, { contractorId: req.contractorId });
  return sendResponse(res, 200, 'Stage', result);
});

/** BRD W17 — earnings and settlements. */
export const contractorEarningsController = wrap(async (req, res) => {
  const { ConstructionProject } = await import('../models/constructionProject.model.js');
  const { ProjectStage } = await import('../models/projectStage.model.js');
  const { getWalletBalance } = await import('../../../core/payments/wallet.service.js');

  const [projects, stages, wallet] = await Promise.all([
    ConstructionProject.find({ contractorId: req.contractorId, isDeleted: { $ne: true } })
      .select('projectNumber title agreedValue releasedAmount fundedAmount refundedAmount status retentionPercent')
      .lean(),
    ProjectStage.find({ contractorId: req.contractorId })
      .select('projectId name amount releasedAmount status releasedAt targetDate')
      .sort({ releasedAt: -1 })
      .limit(100)
      .lean(),
    getWalletBalance('contractor', req.contractorId).catch(() => ({ balance: 0 })),
  ]);

  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const earned = round2(projects.reduce((s, p) => s + (p.releasedAmount || 0), 0));
  // Money the customer has put in that has not reached the contractor yet —
  // work still to do, plus retention on work already approved.
  const stillHeld = round2(projects.reduce(
    (s, p) => s + ((p.fundedAmount || 0) - (p.releasedAmount || 0) - (p.refundedAmount || 0)), 0,
  ));
  const awaitingApproval = round2(stages
    .filter((s) => s.status === 'submitted_for_approval')
    .reduce((s, x) => s + (x.amount || 0), 0));

  return sendResponse(res, 200, 'Earnings', {
    walletBalance: round2(wallet.balance),
    totalEarned: earned,
    heldAgainstYourProjects: stillHeld,
    awaitingApproval,
    projects,
    recentStages: stages,
  });
});

// ==================== ADMIN (BRD A5, A6, A7) ====================

export const adminListProjectsController = wrap(async (req, res) => {
  const result = await projectService.listProjectsAdmin(req.query);
  return sendResponse(res, 200, 'Projects', result);
});

export const adminProjectStatsController = wrap(async (req, res) => {
  const stats = await projectService.getProjectStats();
  return sendResponse(res, 200, 'Project stats', { stats });
});

export const adminGetProjectController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'project id');
  const result = await projectService.getProjectAdmin(id);
  return sendResponse(res, 200, 'Project', result);
});

export const adminHoldProjectController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'project id');
  const reason = validateReasonDto(req.body, { required: true, label: 'reason' });
  const project = await projectService.holdProject(id, reason, req.user);
  return sendResponse(res, 200, 'Project put on hold', { project });
});

export const adminResumeProjectController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'project id');
  const project = await projectService.resumeProject(id, req.user);
  return sendResponse(res, 200, 'Project resumed', { project });
});

export const adminCancelProjectController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'project id');
  const reason = validateReasonDto(req.body, { required: true, label: 'reason' });
  const project = await projectService.cancelProject(id, reason, req.user);
  return sendResponse(res, 200, 'Project cancelled and held money returned', { project });
});

/** BRD A7 — supervisor approval when the customer has gone quiet (Q13). */
export const adminApproveStageController = wrap(async (req, res) => {
  const stageId = validateObjectId(req.params.stageId, 'stage id');
  const result = await stageService.approveStage(stageId, {
    actorRole: 'admin',
    reqUser: req.user,
    via: 'supervisor',
    note: String(req.body?.note || '').trim(),
  });
  return sendResponse(
    res,
    200,
    result.alreadyReleased ? 'This stage was already paid' : 'Stage approved and payment released',
    result,
  );
});

/**
 * BRD A6 — reassign the contractor.
 *
 * Grouped with the other interventions rather than with the Phase 7 reports,
 * because it changes a live project rather than describing one.
 */
export const adminReassignContractorController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'project id');
  const newContractorId = validateObjectId(req.body?.contractorId, 'contractor id');
  const reason = validateReasonDto(req.body, { required: true, label: 'reason' });

  const result = await projectService.reassignContractor(id, {
    newContractorId,
    reason,
    reqUser: req.user,
  });
  return sendResponse(
    res,
    200,
    `Project reassigned to ${result.newContractor}`,
    result,
  );
});

export const adminReconcileProjectController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'project id');
  const result = await projectService.reconcileProjectMoney(id, {
    repair: req.body?.repair === true,
  });
  return sendResponse(res, 200, result.inSync ? 'Money reconciles' : 'Drift detected', result);
});

export const adminReleaseRetentionController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'project id');
  const result = await handoverService.releaseRetention(id, {
    reqUser: req.user,
    force: req.body?.force === true,
  });
  return sendResponse(res, 200, 'Retention released', result);
});

// ==================== CASH PAYMENT CONTROLLERS ====================

export const requestCashPaymentController = wrap(async (req, res) => {
  const { createCashPaymentRequest } = await import('../services/cashPayment.service.js');
  const id = validateObjectId(req.params.id, 'project id');
  const stageId = req.body?.stageId ? validateObjectId(req.body.stageId, 'stage id') : null;
  const amount = Number(req.body?.amount);
  const notes = String(req.body?.notes || '').trim();

  const result = await createCashPaymentRequest(req.user.userId, {
    projectId: id,
    stageId,
    amount,
    notes,
  });
  return sendResponse(res, 201, result.message, result);
});

export const approveCashPaymentController = wrap(async (req, res) => {
  const { approveCashPaymentByContractor } = await import('../services/cashPayment.service.js');
  const requestId = validateObjectId(req.params.requestId, 'request id');
  const result = await approveCashPaymentByContractor(req.contractorId, requestId, req.user);
  return sendResponse(res, 200, 'Cash payment approved successfully', result);
});

export const rejectCashPaymentController = wrap(async (req, res) => {
  const { rejectCashPaymentByContractor } = await import('../services/cashPayment.service.js');
  const requestId = validateObjectId(req.params.requestId, 'request id');
  const reason = String(req.body?.reason || '').trim();
  const result = await rejectCashPaymentByContractor(req.contractorId, requestId, reason);
  return sendResponse(res, 200, 'Cash payment request rejected', result);
});

export const listContractorCashRequestsController = wrap(async (req, res) => {
  const { listCashPaymentRequests } = await import('../services/cashPayment.service.js');
  const requests = await listCashPaymentRequests({ contractorId: req.contractorId });
  return sendResponse(res, 200, 'Contractor cash payment requests', { requests });
});

export const listCustomerCashRequestsController = wrap(async (req, res) => {
  const { listCashPaymentRequests } = await import('../services/cashPayment.service.js');
  const requests = await listCashPaymentRequests({ customerId: req.user.userId });
  return sendResponse(res, 200, 'Customer cash payment requests', { requests });
});

export const adminListCashPaymentsController = wrap(async (req, res) => {
  const { listCashPaymentRequests } = await import('../services/cashPayment.service.js');
  const requests = await listCashPaymentRequests({});
  return sendResponse(res, 200, 'All cash payment requests audit history', { requests });
});

