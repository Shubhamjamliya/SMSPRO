import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError } from '../../../core/auth/errors.js';
import * as budgetServices from '../services/budgetService.service.js';
import {
  validateCreateBudgetServiceDto,
  validateUpdateBudgetServiceDto,
} from '../validators/budgetService.validator.js';
import { validateObjectId, validateStatusDto } from '../validators/catalog.validator.js';

const handle = (error, res, next) => {
  if (error instanceof ValidationError) {
    return sendError(res, error.statusCode || 400, error.message);
  }
  if (error?.name === 'ValidationError') {
    const first = error.errors ? Object.values(error.errors)[0] : null;
    return sendError(res, 400, first?.message || error.message || 'Invalid data');
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

// ---------- Admin ----------

export const listBudgetServicesController = wrap(async (req, res) => {
  const rows = await budgetServices.listBudgetServices({ status: req.query.status });
  return sendResponse(res, 200, 'Budget friendly services', { services: rows });
});

export const createBudgetServiceController = wrap(async (req, res) => {
  const data = validateCreateBudgetServiceDto(req.body);
  const service = await budgetServices.createBudgetService(data, req.user);
  return sendResponse(res, 201, 'Service created', { service });
});

export const updateBudgetServiceController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'service id');
  const data = validateUpdateBudgetServiceDto(req.body);
  const service = await budgetServices.updateBudgetService(id, data, req.user);
  return sendResponse(res, 200, 'Service updated', { service });
});

export const updateBudgetServiceStatusController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'service id');
  const { status } = validateStatusDto(req.body);
  const service = await budgetServices.updateBudgetService(id, { status }, req.user);
  return sendResponse(res, 200, `Service ${status}`, { service });
});

export const deleteBudgetServiceController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'service id');
  const result = await budgetServices.deleteBudgetService(id, req.user);
  return sendResponse(res, 200, 'Service deleted', result);
});

// ---------- Customer ----------

export const getCustomerBudgetServicesController = wrap(async (req, res) => {
  const rows = await budgetServices.listCustomerBudgetServices();
  return sendResponse(res, 200, 'Budget friendly services', { services: rows });
});
