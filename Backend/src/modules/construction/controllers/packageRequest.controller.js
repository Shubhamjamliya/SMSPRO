import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError } from '../../../core/auth/errors.js';
import * as packageRequests from '../services/packageRequest.service.js';
import * as dispatch from '../services/packageDispatch.service.js';
import {
  validatePackageRequestDto,
  validatePackageRequestStatusDto,
  validatePaymentVerificationDto,
  validateOfferDeclineDto,
  validateRefundDto,
  validateAssignDto,
} from '../validators/packageRequest.validator.js';
import * as visits from '../services/packageVisit.service.js';
import { listInbox, markInboxRead, dismissAllInbox } from '../services/notify.service.js';
import {
  validateStartJourneyDto,
  validateArrivalDto,
  validateVisitReportDto,
  validateContractDto,
  validateContractResponseDto,
} from '../validators/packageVisit.validator.js';
import { validateObjectId } from '../validators/catalog.validator.js';

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

// ---------- Customer ----------

/** Book a package. Answers with the request and, when there is a visiting fee, the payment to open. */
export const createPackageRequestController = wrap(async (req, res) => {
  const data = validatePackageRequestDto(req.body);
  const result = await packageRequests.createPackageRequest(req.user.userId, data);
  const commercial = result.request?.package?.segment === 'commercial';
  const message = result.razorpay
    ? (commercial
      ? 'Request saved. Pay the visiting fee and our team will assign a contractor.'
      : 'Request saved. Pay the visiting fee to send it to contractors.')
    : (commercial
      ? 'Request received. Our team will assign a contractor to your site visit.'
      : 'Request received. It has been sent to contractors near you.');
  return sendResponse(res, 201, message, result);
});

/** Re-open the payment for a request the customer did not finish paying for. */
export const getPackageRequestPaymentController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'request id');
  const result = await packageRequests.getPaymentCheckout(req.user.userId, id);
  return sendResponse(res, 200, 'Payment', result);
});

/** After Razorpay checkout: verify the payment, then send the request to contractors. */
export const verifyPackageRequestPaymentController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'request id');
  const payload = validatePaymentVerificationDto(req.body);
  const request = await packageRequests.confirmVisitFeePayment(
    id,
    {
      orderId: payload.razorpayOrderId,
      paymentId: payload.razorpayPaymentId,
      signature: payload.razorpaySignature,
    },
    { customerId: req.user.userId },
  );
  return sendResponse(res, 200, 'Payment received', { request });
});

// ---------- Contractor ----------

export const listContractorPackageRequestsController = wrap(async (req, res) => {
  const result = await dispatch.listContractorPackageRequests(req.user.userId, req.query);
  return sendResponse(res, 200, 'Site visit requests', result);
});

export const acceptPackageRequestController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'request id');
  const request = await dispatch.acceptOffer(req.user.userId, id);
  return sendResponse(res, 200, 'Request accepted', {
    request: dispatch.toContractorView(request, req.user.userId),
  });
});

export const declinePackageRequestController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'request id');
  const data = validateOfferDeclineDto(req.body);
  const result = await dispatch.declineOffer(req.user.userId, id, data);
  return sendResponse(res, 200, 'Request declined', result);
});

// ---------- Contractor: notification inbox ----------

export const listContractorNotificationsController = wrap(async (req, res) => {
  const inbox = await listInbox(req.user.userId);
  return sendResponse(res, 200, 'Notifications', inbox);
});

export const markContractorNotificationsReadController = wrap(async (req, res) => {
  const id = req.body?.id ? validateObjectId(req.body.id, 'notification id') : null;
  const inbox = await markInboxRead(req.user.userId, id);
  return sendResponse(res, 200, 'Notifications updated', inbox);
});

export const clearContractorNotificationsController = wrap(async (req, res) => {
  const inbox = await dismissAllInbox(req.user.userId);
  return sendResponse(res, 200, 'Notifications cleared', inbox);
});

// ---------- Contractor: the site visit ----------

export const listContractorAssignedVisitsController = wrap(async (req, res) => {
  const visitList = await visits.listContractorAssignedVisits(req.user.userId);
  return sendResponse(res, 200, 'Your site visits', { visits: visitList });
});

export const getContractorPackageRequestController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'request id');
  const request = await visits.getContractorRequestDetail(req.user.userId, id);
  return sendResponse(res, 200, 'Site visit request', { request });
});

export const startJourneyController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'request id');
  const data = validateStartJourneyDto(req.body);
  const request = await visits.startJourney(req.user.userId, id, data);
  return sendResponse(res, 200, 'Journey started — the customer has been told you are on the way', { request });
});

export const confirmArrivalController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'request id');
  const data = validateArrivalDto(req.body);
  const request = await visits.confirmArrival(req.user.userId, id, data);
  return sendResponse(res, 200, 'Visit confirmed', { request });
});

export const saveVisitReportController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'request id');
  const data = validateVisitReportDto(req.body);
  const request = await visits.saveVisitReport(req.user.userId, id, data);
  return sendResponse(res, 200, data.submit ? 'Report sent to the office' : 'Draft saved', { request });
});

/** The customer accepted the contract — this is the contractor's half of the handshake. */
export const confirmPackageContractController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'request id');
  const request = await visits.confirmContractByContractor(req.user.userId, id);
  return sendResponse(res, 200, 'Contract confirmed', { request });
});

export const declinePackageContractController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'request id');
  const request = await visits.declineContractByContractor(req.user.userId, id, validateContractResponseDto(req.body));
  return sendResponse(res, 200, 'Contract declined', { request });
});

// ---------- Customer: following the visit ----------

export const listMyPackageRequestsController = wrap(async (req, res) => {
  const requests = await visits.listCustomerRequests(req.user.userId);
  return sendResponse(res, 200, 'Your site visits', { requests });
});

export const getMyPackageRequestController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'request id');
  const request = await visits.getCustomerRequest(req.user.userId, id);
  return sendResponse(res, 200, 'Site visit', { request });
});

export const regenerateVisitOtpController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'request id');
  const request = await visits.regenerateOtp(req.user.userId, id);
  return sendResponse(res, 200, 'New OTP generated', { request });
});

export const acceptContractController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'request id');
  const request = await visits.acceptContract(req.user.userId, id, validateContractResponseDto(req.body));
  return sendResponse(res, 200, 'Contract accepted', { request });
});

export const declineContractController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'request id');
  const request = await visits.declineContract(req.user.userId, id, validateContractResponseDto(req.body));
  return sendResponse(res, 200, 'Contract declined', { request });
});

// ---------- Admin ----------

export const sendPackageContractController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'request id');
  const data = validateContractDto(req.body);
  const request = await visits.sendContract(id, data, req.user);
  return sendResponse(res, 200, 'Contract sent to the customer', { request });
});

export const listPackageRequestsController = wrap(async (req, res) => {
  const [result, counts] = await Promise.all([
    packageRequests.listPackageRequests(req.query),
    packageRequests.packageRequestCounts(req.query.segment),
  ]);
  return sendResponse(res, 200, 'Package requests', { ...result, counts });
});

export const updatePackageRequestStatusController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'request id');
  const data = validatePackageRequestStatusDto(req.body);
  const request = await packageRequests.updatePackageRequestStatus(id, data, req.user);
  return sendResponse(res, 200, 'Request updated', { request });
});

export const redispatchPackageRequestController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'request id');
  const result = await packageRequests.redispatchPackageRequest(id, req.user);
  return sendResponse(res, 200, 'Request sent again', result);
});

/** Contractors the office can give this request to: those covering the area first. */
export const listAssignableContractorsController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'request id');
  const contractors = await dispatch.listAssignableContractors(id);
  return sendResponse(res, 200, 'Contractors', { contractors });
});

export const assignPackageRequestController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'request id');
  const { contractorId } = validateAssignDto(req.body);
  const request = await dispatch.assignContractor(id, contractorId, req.user);
  return sendResponse(res, 200, 'Contractor assigned', { request });
});

export const refundPackageRequestController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'request id');
  const data = validateRefundDto(req.body);
  const request = await packageRequests.refundVisitingFee(id, data, req.user);
  return sendResponse(res, 200, 'Visiting fee refunded to the customer\'s wallet', { request });
});
