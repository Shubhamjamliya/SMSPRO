import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError } from '../../../core/auth/errors.js';
import {
  listCustomerServicesNear,
  detectZoneForCustomer,
} from '../services/customerCatalog.service.js';
import { listProviderSelectableZones } from '../services/providerCatalog.service.js';

const handle = (error, res, next) => {
  if (error instanceof ValidationError) return sendError(res, error.statusCode || 400, error.message);
  return next(error);
};

export const detectCustomerZoneController = asyncHandler(async (req, res, next) => {
  try {
    const result = await detectZoneForCustomer({
      lat: req.query.lat,
      lng: req.query.lng,
    });
    return sendResponse(res, 200, 'Zone detection', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const listCustomerServicesController = asyncHandler(async (req, res, next) => {
  try {
    const result = await listCustomerServicesNear({
      lat: req.query.lat,
      lng: req.query.lng,
      zoneId: req.query.zoneId,
      categoryId: req.query.categoryId,
    });
    return sendResponse(res, 200, 'Services near you', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const listSelectableZonesController = asyncHandler(async (req, res, next) => {
  try {
    const zones = await listProviderSelectableZones(req.user.userId);
    return sendResponse(res, 200, 'Selectable zones', { zones });
  } catch (error) {
    return handle(error, res, next);
  }
});
