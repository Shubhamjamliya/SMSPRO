import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError } from '../../../core/auth/errors.js';
import * as catalogService from '../services/serviceCatalog.service.js';
import {
  validateCreateCategoryDto,
  validateUpdateCategoryDto,
  validateCreateServiceDto,
  validateUpdateServiceDto,
  validateCreateZoneDto,
  validateUpdateZoneDto,
  validateObjectId,
  validateStatusDto,
} from '../validators/catalog.validator.js';

const handle = (error, res, next) => {
  if (error instanceof ValidationError) return sendError(res, error.statusCode || 400, error.message);
  return next(error);
};

// ---------- Categories ----------

export const listCategoriesController = asyncHandler(async (req, res, next) => {
  try {
    const categories = await catalogService.listCategories(req.query);
    return sendResponse(res, 200, 'Categories', { categories });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const createCategoryController = asyncHandler(async (req, res, next) => {
  try {
    const data = validateCreateCategoryDto(req.body);
    const category = await catalogService.createCategory(data, req.user);
    return sendResponse(res, 201, 'Category created', { category });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const updateCategoryController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'category id');
    const data = validateUpdateCategoryDto(req.body);
    const category = await catalogService.updateCategory(id, data, req.user);
    return sendResponse(res, 200, 'Category updated', { category });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const deleteCategoryController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'category id');
    const result = await catalogService.deleteCategory(id, req.user);
    return sendResponse(res, 200, 'Category deleted', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

// ---------- Services ----------

export const listServicesController = asyncHandler(async (req, res, next) => {
  try {
    const services = await catalogService.listServices(req.query);
    return sendResponse(res, 200, 'Services', { services });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const createServiceController = asyncHandler(async (req, res, next) => {
  try {
    const data = validateCreateServiceDto(req.body);
    const service = await catalogService.createService(data, req.user);
    return sendResponse(res, 201, 'Service created', { service });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const updateServiceController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'service id');
    const data = validateUpdateServiceDto(req.body);
    const service = await catalogService.updateService(id, data, req.user);
    return sendResponse(res, 200, 'Service updated', { service });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const deleteServiceController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'service id');
    const result = await catalogService.deleteService(id, req.user);
    return sendResponse(res, 200, 'Service deleted', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const listProvidersForServiceController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'service id');
    const providers = await catalogService.listServiceProviders(id);
    return sendResponse(res, 200, 'Providers offering this service', { providers });
  } catch (error) {
    return handle(error, res, next);
  }
});

// ---------- Zones ----------

export const listZonesController = asyncHandler(async (req, res, next) => {
  try {
    const zones = await catalogService.listZones(req.query);
    return sendResponse(res, 200, 'Zones', { zones });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const getZoneByIdController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'zone id');
    const zone = await catalogService.getZoneById(id);
    return sendResponse(res, 200, 'Zone', { zone });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const createZoneController = asyncHandler(async (req, res, next) => {
  try {
    const data = validateCreateZoneDto(req.body);
    const zone = await catalogService.createZone(data, req.user);
    return sendResponse(res, 201, 'Zone created', { zone });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const updateZoneController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'zone id');
    const data = validateUpdateZoneDto(req.body);
    const zone = await catalogService.updateZone(id, data, req.user);
    return sendResponse(res, 200, 'Zone updated', { zone });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const deleteZoneController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'zone id');
    const result = await catalogService.deleteZone(id, req.user);
    return sendResponse(res, 200, 'Zone deleted', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const updateZoneStatusController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'zone id');
    const { status } = validateStatusDto(req.body);
    const zone = await catalogService.updateZoneStatus(id, status, req.user);
    return sendResponse(res, 200, 'Zone status updated', { zone });
  } catch (error) {
    return handle(error, res, next);
  }
});
