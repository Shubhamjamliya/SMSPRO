import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError } from '../../../core/auth/errors.js';
import {
  createServiceRequest,
  listMyServiceRequests,
  resubmitServiceRequest,
  listServiceRequests,
  approveServiceRequest,
  rejectServiceRequest,
} from '../services/serviceRequest.service.js';

const handle = (error, res, next) => {
  if (error instanceof ValidationError) return sendError(res, error.statusCode || 400, error.message);
  return next(error);
};

export const createServiceRequestController = asyncHandler(async (req, res, next) => {
  try {
    const result = await createServiceRequest(req.user.userId, req.body || {});
    return sendResponse(res, 201, 'Service request submitted', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const listMyServiceRequestsController = asyncHandler(async (req, res, next) => {
  try {
    const result = await listMyServiceRequests(req.user.userId);
    return sendResponse(res, 200, 'My service requests', { records: result });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const resubmitServiceRequestController = asyncHandler(async (req, res, next) => {
  try {
    const result = await resubmitServiceRequest(req.params.id, req.user.userId, req.body || {});
    return sendResponse(res, 200, 'Service request resubmitted', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const listServiceRequestsController = asyncHandler(async (req, res, next) => {
  try {
    const result = await listServiceRequests(req.query);
    return sendResponse(res, 200, 'Service requests', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const approveServiceRequestController = asyncHandler(async (req, res, next) => {
  try {
    const result = await approveServiceRequest(req.params.id, req.body || {}, req.user);
    return sendResponse(res, 200, 'Service request approved', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const rejectServiceRequestController = asyncHandler(async (req, res, next) => {
  try {
    const result = await rejectServiceRequest(req.params.id, req.body?.reason, req.user);
    return sendResponse(res, 200, 'Service request rejected', result);
  } catch (error) {
    return handle(error, res, next);
  }
});
