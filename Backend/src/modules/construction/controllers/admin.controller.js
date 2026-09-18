import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError } from '../../../core/auth/errors.js';
import { listAuditTrail } from '../../../core/audit/audit.service.js';
import * as dashboardService from '../services/dashboard.service.js';
import * as reportService from '../services/report.service.js';
import { validateObjectId } from '../validators/pipeline.validator.js';

/**
 * Phase 7 — the office team's screens (BRD A1, A7, A9, A10).
 *
 * Everything here is read-only. The one Phase 7 action that changes anything —
 * reassigning a contractor — lives with the other project interventions in
 * `project.controller`, because it is an intervention, not a report.
 */

const handle = (error, res, next) => {
  if (error instanceof ValidationError) {
    return sendError(res, error.statusCode || 400, error.message);
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

// ==================== A1 — dashboard ====================

export const dashboardController = wrap(async (req, res) => {
  const data = await dashboardService.getDashboard({ days: req.query.days });
  return sendResponse(res, 200, 'Construction dashboard', data);
});

// ==================== A7 — payment control ====================

export const paymentControlController = wrap(async (req, res) => {
  const data = await dashboardService.getPaymentControl(req.query);
  return sendResponse(res, 200, 'Payment control', data);
});

// ==================== A9 — reports ====================

export const cityReportController = wrap(async (req, res) => {
  const data = await reportService.getCityReport(req.query);
  return sendResponse(res, 200, 'Report by city', data);
});

export const serviceReportController = wrap(async (req, res) => {
  const data = await reportService.getServiceReport(req.query);
  return sendResponse(res, 200, 'Report by service', data);
});

export const periodReportController = wrap(async (req, res) => {
  const data = await reportService.getPeriodReport(req.query);
  return sendResponse(res, 200, 'Report by period', data);
});

export const contractorReportController = wrap(async (req, res) => {
  const data = await reportService.getContractorReport(req.query);
  return sendResponse(res, 200, 'Contractor performance', data);
});

export const delayReportController = wrap(async (req, res) => {
  const data = await reportService.getDelayReport(req.query);
  return sendResponse(res, 200, 'Delay report', data);
});

// ==================== A10 — the activity record ====================

/**
 * BRD A10 — "a permanent, unchangeable record of every action taken on every
 * project by anyone, including your own staff."
 *
 * Scoped to `module: 'construction'` regardless of what the caller asks for.
 * The audit collection is shared with every other module, and a construction
 * operator has no business reading food's activity from this endpoint.
 */
export const activityLogController = wrap(async (req, res) => {
  const result = await listAuditTrail({
    module: 'construction',
    entityType: req.query.entityType || null,
    entityId: req.query.entityId || null,
    action: req.query.action || null,
    page: req.query.page,
    limit: req.query.limit,
  });
  return sendResponse(res, 200, 'Activity record', result);
});

/** The same record, narrowed to one project — the view support actually uses. */
export const projectActivityController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'project id');
  const result = await listAuditTrail({
    module: 'construction',
    entityType: 'project',
    entityId: id,
    page: req.query.page,
    limit: req.query.limit || 100,
  });
  return sendResponse(res, 200, 'Project activity', result);
});
