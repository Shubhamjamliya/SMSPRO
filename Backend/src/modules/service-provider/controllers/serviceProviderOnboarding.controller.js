import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError, AuthError } from '../../../core/auth/errors.js';
import {
  submitOnboarding,
  getOnboardingDraft,
  getOnboardingZones,
  getOnboardingCategories,
  getOnboardingServices,
} from '../services/serviceProviderOnboarding.service.js';
import { updateProviderServices, getProviderServiceCatalog } from '../services/providerCatalog.service.js';

const handleValidationErrors = (error, res, next) => {
  if (error instanceof ValidationError) return sendError(res, error.statusCode || 400, error.message);
  if (error instanceof AuthError) return sendError(res, 401, error.message);
  return next(error);
};

export const getOnboardingDraftController = asyncHandler(async (req, res, next) => {
  try {
    const result = await getOnboardingDraft(req.user.userId);
    return sendResponse(res, 200, 'Onboarding draft', result);
  } catch (error) {
    return handleValidationErrors(error, res, next);
  }
});

export const submitOnboardingController = asyncHandler(async (req, res, next) => {
  try {
    const result = await submitOnboarding(req.user.userId, req.body || {});
    return sendResponse(res, 200, 'Application submitted for approval', result);
  } catch (error) {
    return handleValidationErrors(error, res, next);
  }
});

export const updateProviderServicesController = asyncHandler(async (req, res, next) => {
  try {
    const services = await updateProviderServices(req.user.userId, req.body || {});
    return sendResponse(res, 200, 'Services updated', { services });
  } catch (error) {
    return handleValidationErrors(error, res, next);
  }
});

export const getProviderServiceCatalogController = asyncHandler(async (req, res, next) => {
  try {
    const services = await getProviderServiceCatalog(req.user.userId);
    return sendResponse(res, 200, 'Service catalog', { services });
  } catch (error) {
    return handleValidationErrors(error, res, next);
  }
});

export const getOnboardingZonesController = asyncHandler(async (req, res, next) => {
  try {
    const zones = await getOnboardingZones();
    return sendResponse(res, 200, 'Zones available for onboarding', { zones });
  } catch (error) {
    return handleValidationErrors(error, res, next);
  }
});

export const getOnboardingCategoriesController = asyncHandler(async (req, res, next) => {
  try {
    const categories = await getOnboardingCategories();
    return sendResponse(res, 200, 'Categories available for onboarding', { categories });
  } catch (error) {
    return handleValidationErrors(error, res, next);
  }
});

export const getOnboardingServicesController = asyncHandler(async (req, res, next) => {
  try {
    const services = await getOnboardingServices(req.query.zoneId);
    return sendResponse(res, 200, 'Services available for onboarding', { services });
  } catch (error) {
    return handleValidationErrors(error, res, next);
  }
});
