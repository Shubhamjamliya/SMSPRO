import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError } from '../../../core/auth/errors.js';
import {
  listServiceProviders,
  getServiceProviderByIdForAdmin,
  approveServiceProvider,
  rejectServiceProvider,
  suspendServiceProvider,
  activateServiceProvider,
  adminOnboardServiceProvider,
  adminUpdateServiceProvider,
} from '../services/serviceProviderAdmin.service.js';

const handle = (error, res, next) => {
  if (error instanceof ValidationError) return sendError(res, error.statusCode || 400, error.message);
  return next(error);
};

export const listServiceProvidersController = asyncHandler(async (req, res, next) => {
  try {
    const result = await listServiceProviders(req.query);
    return sendResponse(res, 200, 'Service providers', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const getServiceProviderByIdController = asyncHandler(async (req, res, next) => {
  try {
    const result = await getServiceProviderByIdForAdmin(req.params.id);
    return sendResponse(res, 200, 'Service provider', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const approveServiceProviderController = asyncHandler(async (req, res, next) => {
  try {
    const result = await approveServiceProvider(req.params.id, req.user);
    return sendResponse(res, 200, 'Service provider approved', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const rejectServiceProviderController = asyncHandler(async (req, res, next) => {
  try {
    const result = await rejectServiceProvider(req.params.id, req.body?.reason, req.user);
    return sendResponse(res, 200, 'Service provider rejected', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const suspendServiceProviderController = asyncHandler(async (req, res, next) => {
  try {
    const result = await suspendServiceProvider(req.params.id, req.body?.reason, req.user);
    return sendResponse(res, 200, 'Service provider suspended', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const activateServiceProviderController = asyncHandler(async (req, res, next) => {
  try {
    const result = await activateServiceProvider(req.params.id, req.user);
    return sendResponse(res, 200, 'Service provider activated', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const adminCreateServiceProviderController = asyncHandler(async (req, res, next) => {
  try {
    const result = await adminOnboardServiceProvider(req.body || {}, req.user);
    return sendResponse(res, 201, 'Service provider created and approved', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const adminUpdateServiceProviderController = asyncHandler(async (req, res, next) => {
  try {
    const result = await adminUpdateServiceProvider(req.params.id, req.body || {}, req.user);
    return sendResponse(res, 200, 'Service provider updated', result);
  } catch (error) {
    return handle(error, res, next);
  }
});
