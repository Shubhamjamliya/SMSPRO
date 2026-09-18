import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError, AuthError } from '../../../core/auth/errors.js';
import * as auth from '../services/contractorAuth.service.js';
import * as onboarding from '../services/contractorOnboarding.service.js';
import {
  validateFullOnboardingDto,
  validateDraftDto,
  validateDocumentDto,
  validatePortfolioDto,
  validateObjectId,
} from '../validators/onboarding.validator.js';

const handle = (error, res, next) => {
  if (error instanceof ValidationError) {
    return sendError(res, error.statusCode || 400, error.message);
  }
  if (error instanceof AuthError) {
    return sendError(res, error.statusCode || 401, error.message);
  }
  if (error?.code === 11000) {
    return sendError(res, 409, 'A contractor account already exists for this phone number');
  }
  return next(error);
};

// ---------- Auth (BRD W1) ----------

export const requestOtpController = asyncHandler(async (req, res, next) => {
  try {
    const result = await auth.requestContractorOtp(req.body?.phone);
    return sendResponse(res, 200, 'OTP sent', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const verifyOtpController = asyncHandler(async (req, res, next) => {
  try {
    const { phone, otp, fcmToken } = req.body || {};
    const result = await auth.verifyContractorOtpAndLogin(phone, otp, fcmToken);
    return sendResponse(res, 200, 'Signed in', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const getMeController = asyncHandler(async (req, res, next) => {
  try {
    const contractor = await auth.getContractorProfile(req.user.userId);
    return sendResponse(res, 200, 'Contractor profile', { contractor });
  } catch (error) {
    return handle(error, res, next);
  }
});

/** The contractor editing their own profile after approval. */
export const updateMyProfileController = asyncHandler(async (req, res, next) => {
  try {
    const contractor = await onboarding.updateOwnProfile(
      req.contractorId,
      req.body,
      req.user,
    );
    return sendResponse(res, 200, 'Profile updated', { contractor });
  } catch (error) {
    return handle(error, res, next);
  }
});

// ---------- Onboarding (BRD W1–W4) ----------

export const getDraftController = asyncHandler(async (req, res, next) => {
  try {
    const draft = await onboarding.getOnboardingDraft(req.contractorId);
    return sendResponse(res, 200, 'Registration draft', draft);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const saveDraftController = asyncHandler(async (req, res, next) => {
  try {
    const data = validateDraftDto(req.body);
    const result = await onboarding.saveDraft(req.contractorId, data);
    return sendResponse(res, 200, 'Progress saved', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const submitOnboardingController = asyncHandler(async (req, res, next) => {
  try {
    const data = validateFullOnboardingDto(req.body);
    const session = await onboarding.submitOnboarding(req.contractorId, data);
    return sendResponse(res, 200, 'Registration submitted for verification', session);
  } catch (error) {
    return handle(error, res, next);
  }
});

export const getSelectableTradesController = asyncHandler(async (req, res, next) => {
  try {
    const trades = await onboarding.getSelectableTrades();
    return sendResponse(res, 200, 'Types of work', { trades });
  } catch (error) {
    return handle(error, res, next);
  }
});

// ---------- Documents (BRD W3) ----------

export const addDocumentController = asyncHandler(async (req, res, next) => {
  try {
    const data = validateDocumentDto(req.body);
    const document = await onboarding.addDocument(req.contractorId, data);
    return sendResponse(res, 201, 'Document uploaded', { document });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const listDocumentsController = asyncHandler(async (req, res, next) => {
  try {
    const documents = await onboarding.listDocuments(req.contractorId);
    return sendResponse(res, 200, 'Documents', { documents });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const deleteDocumentController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'document id');
    const result = await onboarding.deleteDocument(req.contractorId, id);
    return sendResponse(res, 200, 'Document removed', result);
  } catch (error) {
    return handle(error, res, next);
  }
});

// ---------- Portfolio (BRD W5) ----------

export const addPortfolioController = asyncHandler(async (req, res, next) => {
  try {
    const data = validatePortfolioDto(req.body);
    const entry = await onboarding.addPortfolioEntry(req.contractorId, data);
    return sendResponse(res, 201, 'Added to your portfolio', { entry });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const listPortfolioController = asyncHandler(async (req, res, next) => {
  try {
    const portfolio = await onboarding.listPortfolio(req.contractorId);
    return sendResponse(res, 200, 'Portfolio', { portfolio });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const updatePortfolioController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'portfolio id');
    const data = validatePortfolioDto(req.body);
    const entry = await onboarding.updatePortfolioEntry(req.contractorId, id, data);
    return sendResponse(res, 200, 'Portfolio updated', { entry });
  } catch (error) {
    return handle(error, res, next);
  }
});

export const deletePortfolioController = asyncHandler(async (req, res, next) => {
  try {
    const id = validateObjectId(req.params.id, 'portfolio id');
    const result = await onboarding.deletePortfolioEntry(req.contractorId, id);
    return sendResponse(res, 200, 'Removed from your portfolio', result);
  } catch (error) {
    return handle(error, res, next);
  }
});
