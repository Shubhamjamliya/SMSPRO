import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError } from '../../../core/auth/errors.js';
import * as banners from '../services/banner.service.js';
import {
  validateCreateBannerDto,
  validateUpdateBannerDto,
} from '../validators/banner.validator.js';
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

export const listBannersController = wrap(async (req, res) => {
  const rows = await banners.listBanners({ status: req.query.status });
  return sendResponse(res, 200, 'Banners', { banners: rows });
});

export const createBannerController = wrap(async (req, res) => {
  const data = validateCreateBannerDto(req.body);
  const banner = await banners.createBanner(data, req.user);
  return sendResponse(res, 201, 'Banner created', { banner });
});

export const updateBannerController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'banner id');
  const data = validateUpdateBannerDto(req.body);
  const banner = await banners.updateBanner(id, data, req.user);
  return sendResponse(res, 200, 'Banner updated', { banner });
});

export const updateBannerStatusController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'banner id');
  const { status } = validateStatusDto(req.body);
  const banner = await banners.updateBanner(id, { status }, req.user);
  return sendResponse(res, 200, `Banner ${status}`, { banner });
});

export const deleteBannerController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'banner id');
  const result = await banners.deleteBanner(id, req.user);
  return sendResponse(res, 200, 'Banner deleted', result);
});

// ---------- Customer ----------

export const getCustomerBannersController = wrap(async (req, res) => {
  const rows = await banners.listCustomerBanners();
  return sendResponse(res, 200, 'Construction banners', { banners: rows });
});
