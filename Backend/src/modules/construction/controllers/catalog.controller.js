import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError } from '../../../core/auth/errors.js';
import * as catalog from '../services/catalog.service.js';
import {
  validateCreateCategoryDto,
  validateUpdateCategoryDto,
  validateCreateServiceDto,
  validateUpdateServiceDto,
  validateStatusDto,
  validateObjectId,
} from '../validators/catalog.validator.js';

const handle = (error, res, next) => {
  if (error instanceof ValidationError) {
    return sendError(res, error.statusCode || 400, error.message);
  }
  return next(error);
};

// ---------- Categories (BRD A8) ----------

export const listCategoriesController = asyncHandler(async (req, res, next) => {
  try {
    const categories = await catalog.listCategories(req.query);
    return sendResponse(res, 200, 'Categories', { categories });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const createCategoryController = asyncHandler(async (req, res, next) => {
  try {
    const data = validateCreateCategoryDto(req.body);
    const category = await catalog.createCategory(data, req.user);
    return sendResponse(res, 201, 'Category created', { category });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const updateCategoryController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'category id');
    const data = validateUpdateCategoryDto(req.body);
    const category = await catalog.updateCategory(id, data, req.user);
    return sendResponse(res, 200, 'Category updated', { category });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const updateCategoryStatusController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'category id');
    const { status } = validateStatusDto(req.body);
    const category = await catalog.updateCategory(id, { status }, req.user);
    return sendResponse(res, 200, `Category ${status}`, { category });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const deleteCategoryController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'category id');
    const result = await catalog.deleteCategory(id, req.user);
    return sendResponse(res, 200, 'Category deleted', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

// ---------- Services (BRD A8) ----------

export const listServicesController = asyncHandler(async (req, res, next) => {
  try {
    const services = await catalog.listServices(req.query);
    return sendResponse(res, 200, 'Services', { services });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const getServiceController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'service id');
    const service = await catalog.getServiceById(id);
    return sendResponse(res, 200, 'Service', { service });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const createServiceController = asyncHandler(async (req, res, next) => {
  try {
    const data = validateCreateServiceDto(req.body);
    const service = await catalog.createService(data, req.user);
    return sendResponse(res, 201, 'Service created', { service });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const updateServiceController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'service id');
    const data = validateUpdateServiceDto(req.body);
    const service = await catalog.updateService(id, data, req.user);
    return sendResponse(res, 200, 'Service updated', { service });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const updateServiceStatusController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'service id');
    const { status } = validateStatusDto(req.body);
    const service = await catalog.setServiceStatus(id, status, req.user);
    return sendResponse(res, 200, `Service ${status}`, { service });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const deleteServiceController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'service id');
    const result = await catalog.deleteService(id, req.user);
    return sendResponse(res, 200, 'Service deleted', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

// ---------- Customer-facing (BRD C1, C2) ----------

export const getCustomerCatalogueController = asyncHandler(async (req, res, next) => {
  try {
    const categories = await catalog.listCustomerCatalogue();
    return sendResponse(res, 200, 'Construction services', { categories });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const getCustomerServiceDetailController = asyncHandler(async (req, res, next) => {
  try {
    const service = await catalog.getCustomerServiceDetail(req.params.idOrSlug);
    return sendResponse(res, 200, 'Service detail', { service });
  } catch (error) {
    return handle(error, res, next);
  }
});
