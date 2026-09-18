import { sendResponse, sendError } from '../../../utils/response.js';
import {
  requestServiceProviderOtp,
  verifyServiceProviderOtpAndLogin,
  getServiceProviderProfile,
  normalizePhoneDigits,
} from '../services/serviceProviderAuth.service.js';
import { ValidationError, AuthError } from '../../../core/auth/errors.js';

export const requestServiceProviderOtpController = async (req, res, next) => {
  try {
    const phone = normalizePhoneDigits(req.body?.phone);
    const result = await requestServiceProviderOtp(phone);
    return sendResponse(res, 200, 'OTP sent successfully', result);
  } catch (error) {
    if (error instanceof ValidationError) return sendError(res, error.statusCode || 400, error.message);
    return next(error);
  }
};

export const verifyServiceProviderOtpController = async (req, res, next) => {
  try {
    const phone = normalizePhoneDigits(req.body?.phone);
    const otp = String(req.body?.otp || '').trim();
    const fcmToken = req.body?.fcmToken || null;
    const result = await verifyServiceProviderOtpAndLogin(phone, otp, fcmToken);
    return sendResponse(res, 200, 'OTP verified', result);
  } catch (error) {
    if (error instanceof ValidationError) return sendError(res, error.statusCode || 400, error.message);
    if (error instanceof AuthError) return sendError(res, 401, error.message);
    return next(error);
  }
};

export const getServiceProviderMeController = async (req, res, next) => {
  try {
    const provider = await getServiceProviderProfile(req.user.userId);
    return sendResponse(res, 200, 'Service provider profile', provider);
  } catch (error) {
    if (error instanceof ValidationError) return sendError(res, error.statusCode || 400, error.message);
    return next(error);
  }
};
