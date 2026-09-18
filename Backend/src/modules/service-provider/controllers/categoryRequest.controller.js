import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError } from '../../../core/auth/errors.js';
import {
  createCategoryRequest,
  listMyCategoryRequests,
  resubmitCategoryRequest,
  listCategoryRequests,
  approveCategoryRequest,
  rejectCategoryRequest,
} from '../services/categoryRequest.service.js';

const handle = (error, res, next) => {
  if (error instanceof ValidationError) return sendError(res, error.statusCode || 400, error.message);
  return next(error);
};

export const createCategoryRequestController = asyncHandler(async (req, res, next) => {
  try {
    const result = await createCategoryRequest(req.user.userId, req.body || {});
    return sendResponse(res, 201, 'Category request submitted', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const listMyCategoryRequestsController = asyncHandler(async (req, res, next) => {
  try {
    const result = await listMyCategoryRequests(req.user.userId);
    return sendResponse(res, 200, 'My category requests', { records: result });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const resubmitCategoryRequestController = asyncHandler(async (req, res, next) => {
  try {
    const result = await resubmitCategoryRequest(req.params.id, req.user.userId, req.body || {});
    return sendResponse(res, 200, 'Category request resubmitted', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const listCategoryRequestsController = asyncHandler(async (req, res, next) => {
  try {
    const result = await listCategoryRequests(req.query);
    return sendResponse(res, 200, 'Category requests', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const approveCategoryRequestController = asyncHandler(async (req, res, next) => {
  try {
    const result = await approveCategoryRequest(req.params.id, req.body || {}, req.user);
    return sendResponse(res, 200, 'Category request approved', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const rejectCategoryRequestController = asyncHandler(async (req, res, next) => {
  try {
    const result = await rejectCategoryRequest(req.params.id, req.body?.reason, req.user);
    return sendResponse(res, 200, 'Category request rejected', result);
  } catch (error) {
    return handle(error, res, next);
  }
});
