import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError } from '../../../core/auth/errors.js';
import * as materials from '../services/material.service.js';
import {
  validateCreateMaterialDto,
  validateUpdateMaterialDto,
  validateMaterialRequestDto,
  validateRequestStatusDto,
} from '../validators/material.validator.js';
import { validateObjectId, validateStatusDto } from '../validators/catalog.validator.js';

const handle = (error, res, next) => {
  if (error instanceof ValidationError) {
    return sendError(res, error.statusCode || 400, error.message);
  }
  // A Mongoose schema guard tripping (e.g. an empty items list).
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

// ---------- Admin: materials ----------

export const listMaterialsController = wrap(async (req, res) => {
  const [rows, categories] = await Promise.all([
    materials.listMaterials(req.query),
    materials.listMaterialCategories(),
  ]);
  return sendResponse(res, 200, 'Materials', { materials: rows, categories });
});

export const createMaterialController = wrap(async (req, res) => {
  const data = validateCreateMaterialDto(req.body);
  const material = await materials.createMaterial(data, req.user);
  return sendResponse(res, 201, 'Material created', { material });
});

export const updateMaterialController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'material id');
  const data = validateUpdateMaterialDto(req.body);
  const material = await materials.updateMaterial(id, data, req.user);
  return sendResponse(res, 200, 'Material updated', { material });
});

export const updateMaterialStatusController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'material id');
  const { status } = validateStatusDto(req.body);
  const material = await materials.updateMaterial(id, { status }, req.user);
  return sendResponse(res, 200, `Material ${status}`, { material });
});

export const deleteMaterialController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'material id');
  const result = await materials.deleteMaterial(id, req.user);
  return sendResponse(res, 200, 'Material deleted', result);
});

// ---------- Admin: requests ----------

export const listMaterialRequestsController = wrap(async (req, res) => {
  const [result, counts] = await Promise.all([
    materials.listMaterialRequests(req.query),
    materials.materialRequestCounts(),
  ]);
  return sendResponse(res, 200, 'Material requests', { ...result, counts });
});

export const updateMaterialRequestStatusController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'request id');
  const data = validateRequestStatusDto(req.body);
  const request = await materials.updateMaterialRequestStatus(id, data, req.user);
  return sendResponse(res, 200, 'Request updated', { request });
});

// ---------- Customer ----------

export const getCustomerMaterialsController = wrap(async (req, res) => {
  const rows = await materials.listCustomerMaterials();
  return sendResponse(res, 200, 'Construction materials', { materials: rows });
});

export const createMaterialRequestController = wrap(async (req, res) => {
  const data = validateMaterialRequestDto(req.body);
  const request = await materials.createMaterialRequest(req.user.userId, data);
  return sendResponse(res, 201, 'Request received. Our team will contact you shortly.', { request });
});
