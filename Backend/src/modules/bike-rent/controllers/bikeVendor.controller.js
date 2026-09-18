import { sendResponse, sendError } from '../../../utils/response.js';
import {
  requestBikeVendorOtp,
  verifyBikeVendorOtpAndLogin,
  registerOrSubmitBikeVendor,
  getBikeVendorProfile,
  listPendingBikeVendors,
  getBikeVendorByIdForAdmin,
  approveBikeVendor,
  rejectBikeVendor,
  normalizePhoneDigits,
  updateBikeVendorAdmin,
} from '../services/bikeVendor.service.js';
import {
  listAllWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
} from '../services/vendorWallet.service.js';
import { ValidationError, AuthError } from '../../../core/auth/errors.js';

const parseBody = (req) => {
  const body = { ...(req.body || {}) };
  // Support JSON string fields from multipart forms
  for (const key of ['shopImages', 'bank', 'documents']) {
    const raw = body[key];
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          body[key] = JSON.parse(trimmed);
        } catch {
          /* keep string */
        }
      }
    }
  }
  return body;
};

export const requestBikeVendorOtpController = async (req, res, next) => {
  try {
    const phone = normalizePhoneDigits(req.body?.phone);
    const result = await requestBikeVendorOtp(phone);
    return sendResponse(res, 200, 'OTP sent successfully', result);
  } catch (error) {
    if (error instanceof ValidationError) return sendError(res, 400, error.message);
    return next(error);
  }
};

export const verifyBikeVendorOtpController = async (req, res, next) => {
  try {
    const phone = normalizePhoneDigits(req.body?.phone);
    const otp = String(req.body?.otp || '').trim();
    const fcmToken = req.body?.fcmToken || null;
    const result = await verifyBikeVendorOtpAndLogin(phone, otp, fcmToken);
    return sendResponse(res, 200, 'OTP verified', result);
  } catch (error) {
    if (error instanceof ValidationError) return sendError(res, 400, error.message);
    if (error instanceof AuthError) return sendError(res, 401, error.message);
    return next(error);
  }
};

export const registerBikeVendorController = async (req, res, next) => {
  try {
    const body = parseBody(req);
    let phone = normalizePhoneDigits(body.phone);
    const otp = String(body.otp || '').trim();
    const submitForApproval = body.submitForApproval !== false && body.submit !== false;

    const vendorId =
      req.user?.role === 'BIKE_VENDOR' ? req.user.userId : body.vendorId || null;

    if (vendorId && !phone) {
      const { BikeVendor } = await import('../models/bikeVendor.model.js');
      const existing = await BikeVendor.findById(vendorId).select('phone phoneLast10').lean();
      phone = normalizePhoneDigits(existing?.phoneLast10 || existing?.phone);
    }

    if (!phone) {
      return sendError(res, 400, 'Phone number is required');
    }

    if (!vendorId && !otp) {
      return sendError(res, 400, 'OTP is required to register');
    }

    const result = await registerOrSubmitBikeVendor({
      phone,
      otp: vendorId ? null : otp,
      payload: body,
      submitForApproval,
      vendorId,
    });

    return sendResponse(
      res,
      201,
      submitForApproval
        ? 'Registration submitted for approval'
        : 'Draft saved successfully',
      result,
    );
  } catch (error) {
    if (error instanceof ValidationError) return sendError(res, 400, error.message);
    if (error instanceof AuthError) return sendError(res, 401, error.message);
    return next(error);
  }
};

export const getBikeVendorMeController = async (req, res, next) => {
  try {
    if (req.user?.role !== 'BIKE_VENDOR') {
      return sendError(res, 403, 'Bike vendor access required');
    }
    const vendor = await getBikeVendorProfile(req.user.userId);
    return sendResponse(res, 200, 'Vendor profile', { vendor });
  } catch (error) {
    if (error instanceof AuthError) return sendError(res, 401, error.message);
    return next(error);
  }
};

export const listBikeVendorRequestsController = async (req, res, next) => {
  try {
    const result = await listPendingBikeVendors({
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      status: req.query.status || 'pending',
    });
    return sendResponse(res, 200, 'Vendor requests', result);
  } catch (error) {
    return next(error);
  }
};

export const getBikeVendorRequestController = async (req, res, next) => {
  try {
    const vendor = await getBikeVendorByIdForAdmin(req.params.id);
    return sendResponse(res, 200, 'Vendor request', { vendor });
  } catch (error) {
    if (error instanceof ValidationError) return sendError(res, 404, error.message);
    return next(error);
  }
};

export const approveBikeVendorController = async (req, res, next) => {
  try {
    const vendor = await approveBikeVendor(req.params.id, req.user);
    return sendResponse(res, 200, 'Vendor approved', { vendor });
  } catch (error) {
    if (error instanceof ValidationError) return sendError(res, 400, error.message);
    return next(error);
  }
};

export const rejectBikeVendorController = async (req, res, next) => {
  try {
    const reason = req.body?.reason || req.body?.rejectionReason || '';
    const vendor = await rejectBikeVendor(req.params.id, reason, req.user);
    return sendResponse(res, 200, 'Vendor rejected', { vendor });
  } catch (error) {
    if (error instanceof ValidationError) return sendError(res, 400, error.message);
    return next(error);
  }
};

export const updateBikeVendorAdminController = async (req, res, next) => {
  try {
    const vendor = await updateBikeVendorAdmin(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Vendor updated', { vendor });
  } catch (error) {
    if (error instanceof ValidationError) return sendError(res, 400, error.message);
    return next(error);
  }
};

export const listVendorWithdrawalsController = async (req, res, next) => {
  try {
    const data = await listAllWithdrawals(req.query);
    return sendResponse(res, 200, 'Withdrawal requests fetched', data);
  } catch (error) {
    return next(error);
  }
};

export const approveVendorWithdrawalController = async (req, res, next) => {
  try {
    const withdrawal = await approveWithdrawal(req.params.id, req.body, req.user);
    return sendResponse(res, 200, 'Withdrawal approved', { withdrawal });
  } catch (error) {
    if (error instanceof ValidationError) return sendError(res, 400, error.message);
    return next(error);
  }
};

export const rejectVendorWithdrawalController = async (req, res, next) => {
  try {
    const reason = req.body?.reason || req.body?.rejectionReason || '';
    const withdrawal = await rejectWithdrawal(req.params.id, reason, req.user);
    return sendResponse(res, 200, 'Withdrawal rejected', { withdrawal });
  } catch (error) {
    if (error instanceof ValidationError) return sendError(res, 400, error.message);
    return next(error);
  }
};
