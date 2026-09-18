import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError } from '../../../core/auth/errors.js';
import * as contractorAdmin from '../services/contractorAdmin.service.js';
import { validateObjectId } from '../validators/onboarding.validator.js';

const handle = (error, res, next) => {
  if (error instanceof ValidationError) {
    return sendError(res, error.statusCode || 400, error.message);
  }
  return next(error);
};

const reason = (req) => req.body?.reason ?? req.body?.rejectionReason ?? '';

// ---------- Queue and register (BRD A2, A3) ----------

export const listContractorsController = asyncHandler(async (req, res, next) => {
  try {
    const result = await contractorAdmin.listContractors(req.query);
    return sendResponse(res, 200, 'Contractors', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const getContractorController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'contractor id');
    const result = await contractorAdmin.getContractorById(id);
    return sendResponse(res, 200, 'Contractor', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const getContractorStatsController = asyncHandler(async (req, res, next) => {
  try {
    const stats = await contractorAdmin.getContractorStats();
    return sendResponse(res, 200, 'Contractor stats', { stats });
  } catch (error) {
    return handle(error, res, next);
  }
});

// ---------- Approval decisions (BRD A2, Rule 6) ----------

export const approveContractorController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'contractor id');
    const contractor = await contractorAdmin.approveContractor(id, req.user);
    return sendResponse(res, 200, 'Contractor approved', { contractor });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const rejectContractorController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'contractor id');
    const contractor = await contractorAdmin.rejectContractor(id, reason(req), req.user);
    return sendResponse(res, 200, 'Contractor rejected', { contractor });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const suspendContractorController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'contractor id');
    const contractor = await contractorAdmin.suspendContractor(id, reason(req), req.user);
    return sendResponse(res, 200, 'Contractor suspended', { contractor });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const activateContractorController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'contractor id');
    const contractor = await contractorAdmin.activateContractor(id, req.user);
    return sendResponse(res, 200, 'Contractor reactivated', { contractor });
  } catch (error) {
    return handle(error, res, next);
  }
});

// ---------- Document verification (Rule 6) ----------

export const verifyDocumentController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.documentId, 'document id');
    const document = await contractorAdmin.verifyDocument(id, req.user);
    return sendResponse(res, 200, 'Document verified', { document });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const rejectDocumentController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.documentId, 'document id');
    const document = await contractorAdmin.rejectDocument(id, reason(req), req.user);
    return sendResponse(res, 200, 'Document rejected', { document });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const setPortfolioVerifiedController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.entryId, 'portfolio id');
    const entry = await contractorAdmin.setPortfolioVerified(id, req.body?.verified, req.user);
    return sendResponse(res, 200, 'Portfolio updated', { entry });
  } catch (error) {
    return handle(error, res, next);
  }
});
