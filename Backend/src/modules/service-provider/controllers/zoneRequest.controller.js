import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError } from '../../../core/auth/errors.js';
import {
  createZoneRequest,
  listMyZoneRequests,
  resubmitZoneRequest,
  listZoneRequests,
  approveZoneRequest,
  rejectZoneRequest,
} from '../services/zoneRequest.service.js';

const handle = (error, res, next) => {
  if (error instanceof ValidationError) return sendError(res, error.statusCode || 400, error.message);
  return next(error);
};

export const createZoneRequestController = asyncHandler(async (req, res, next) => {
  try {
    const result = await createZoneRequest(req.user.userId, req.body || {});
    return sendResponse(res, 201, 'Zone request submitted', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const listMyZoneRequestsController = asyncHandler(async (req, res, next) => {
  try {
    const result = await listMyZoneRequests(req.user.userId);
    return sendResponse(res, 200, 'My zone requests', { records: result });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const resubmitZoneRequestController = asyncHandler(async (req, res, next) => {
  try {
    const result = await resubmitZoneRequest(req.params.id, req.user.userId, req.body || {});
    return sendResponse(res, 200, 'Zone request resubmitted', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const listZoneRequestsController = asyncHandler(async (req, res, next) => {
  try {
    const result = await listZoneRequests(req.query);
    return sendResponse(res, 200, 'Zone requests', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const approveZoneRequestController = asyncHandler(async (req, res, next) => {
  try {
    const result = await approveZoneRequest(req.params.id, req.user);
    return sendResponse(res, 200, 'Zone request approved', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const rejectZoneRequestController = asyncHandler(async (req, res, next) => {
  try {
    const result = await rejectZoneRequest(req.params.id, req.body?.reason, req.user);
    return sendResponse(res, 200, 'Zone request rejected', result);
  } catch (error) {
    return handle(error, res, next);
  }
});
