import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError } from '../../../core/auth/errors.js';
import * as packages from '../services/package.service.js';
import {
  validateCreatePackageDto,
  validateUpdatePackageDto,
  validateSegment,
} from '../validators/package.validator.js';
import { validateObjectId, validateStatusDto } from '../validators/catalog.validator.js';

const handle = (error, res, next) => {
  if (error instanceof ValidationError) {
    return sendError(res, error.statusCode || 400, error.message);
  }
  return next(error);
};

// ---------- Admin ----------

export const listPackagesController = asyncHandler(async (req, res, next) => {
  try {
    const segment = req.query.segment ? validateSegment(req.query.segment) : undefined;
    // Only the two known values reach the query — anything else is ignored rather
    // than passed through, since a query string can carry an object.
    const status = ['active', 'inactive'].includes(req.query.status) ? req.query.status : undefined;
    const rows = await packages.listPackages({ segment, status });
    return sendResponse(res, 200, 'Packages', { packages: rows });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const createPackageController = asyncHandler(async (req, res, next) => {
  try {
    const data = validateCreatePackageDto(req.body);
    const pkg = await packages.createPackage(data, req.user);
    return sendResponse(res, 201, 'Package created', { package: pkg });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const updatePackageController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'package id');
    const data = validateUpdatePackageDto(req.body);
    const pkg = await packages.updatePackage(id, data, req.user);
    return sendResponse(res, 200, 'Package updated', { package: pkg });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const updatePackageStatusController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'package id');
    const { status } = validateStatusDto(req.body);
    const pkg = await packages.updatePackage(id, { status }, req.user);
    return sendResponse(res, 200, `Package ${status}`, { package: pkg });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const deletePackageController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'package id');
    const result = await packages.deletePackage(id, req.user);
    return sendResponse(res, 200, 'Package deleted', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const seedDefaultPackagesController = asyncHandler(async (req, res, next) => {
  try {
    const segment = validateSegment(req.body?.segment);
    const rows = await packages.seedDefaultPackages(segment, req.user);
    return sendResponse(res, 201, 'Default packages loaded', { packages: rows });
  } catch (error) {
    return handle(error, res, next);
  }
});

// ---------- Customer ----------

export const getCustomerPackagesController = asyncHandler(async (req, res, next) => {
  try {
    const segment = req.query.segment ? validateSegment(req.query.segment) : undefined;
    const rows = await packages.listCustomerPackages({ segment });
    return sendResponse(res, 200, 'Construction packages', { packages: rows });
  } catch (error) {
    return handle(error, res, next);
  }
});
