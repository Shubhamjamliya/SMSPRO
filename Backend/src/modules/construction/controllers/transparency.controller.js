import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError } from '../../../core/auth/errors.js';
import * as documentService from '../services/document.service.js';
import * as messageService from '../services/message.service.js';
import * as disputeService from '../services/dispute.service.js';
import * as scoreService from '../services/score.service.js';
import * as directoryService from '../services/directory.service.js';
import { validateObjectId, validateReasonDto } from '../validators/pipeline.validator.js';

/**
 * Phase 6 — documents (C19), messaging (C20), disputes (Q15) and trust score (W18).
 *
 * Every handler passes an ACTOR down to the service rather than a bare id. The
 * service decides what that actor may see; the controller never assumes. Three
 * different callers reach the same document vault — customer, contractor and
 * support — and each sees a different slice of it.
 */

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

/** Who is calling, in the shape every Phase 6 service expects. */
const customerActor = (req) => ({ customerId: req.user.userId, reqUser: req.user });
const contractorActor = (req) => ({ contractorId: req.contractorId, reqUser: req.user });
const adminActor = (req) => ({ isAdmin: true, reqUser: req.user });

// ==================== DOCUMENTS (BRD C19) ====================

const listDocumentsFor = (actorOf) => wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'project id');
  const result = await documentService.listDocuments(id, actorOf(req), req.query);
  return sendResponse(res, 200, 'Project documents', result);
});

const addDocumentFor = (actorOf) => wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'project id');
  const document = await documentService.addDocument(id, req.body, actorOf(req));
  return sendResponse(
    res,
    201,
    req.body?.supersedesId ? 'New version filed' : 'Document added',
    { document },
  );
});

const documentHistoryFor = (actorOf) => wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'project id');
  const documentId = validateObjectId(req.params.documentId, 'document id');
  const result = await documentService.getDocumentHistory(id, documentId, actorOf(req));
  return sendResponse(res, 200, 'Document history', result);
});

const revokeDocumentFor = (actorOf) => wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'project id');
  const documentId = validateObjectId(req.params.documentId, 'document id');
  const reason = validateReasonDto(req.body, { required: true, label: 'reason' });
  const document = await documentService.revokeDocument(id, documentId, reason, actorOf(req));
  return sendResponse(res, 200, 'Document withdrawn', { document });
});

export const listMyDocumentsController = listDocumentsFor(customerActor);
export const addMyDocumentController = addDocumentFor(customerActor);
export const myDocumentHistoryController = documentHistoryFor(customerActor);
export const revokeMyDocumentController = revokeDocumentFor(customerActor);

export const listContractorDocumentsController = listDocumentsFor(contractorActor);
export const addContractorDocumentController = addDocumentFor(contractorActor);
export const contractorDocumentHistoryController = documentHistoryFor(contractorActor);
export const revokeContractorDocumentController = revokeDocumentFor(contractorActor);

export const adminListDocumentsController = listDocumentsFor(adminActor);
export const adminAddDocumentController = addDocumentFor(adminActor);

/** BRD C23 — what the handover pack is still missing. */
export const documentReadinessController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'project id');
  const readiness = await documentService.getDocumentReadiness(id, customerActor(req));
  return sendResponse(res, 200, 'Document readiness', readiness);
});

// ==================== MESSAGES (BRD C20) ====================

const listMessagesFor = (actorOf) => wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'project id');
  const result = await messageService.listMessages(id, actorOf(req), req.query);
  return sendResponse(res, 200, 'Messages', result);
});

const sendMessageFor = (actorOf) => wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'project id');
  const message = await messageService.sendMessage(id, req.body, actorOf(req));
  return sendResponse(res, 201, 'Sent', { message });
});

const markReadFor = (actorOf) => wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'project id');
  const result = await messageService.markRead(id, actorOf(req));
  return sendResponse(res, 200, 'Marked as read', result);
});

const unreadCountFor = (actorOf) => wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'project id');
  const result = await messageService.getUnreadCount(id, actorOf(req));
  return sendResponse(res, 200, 'Unread count', result);
});

const retractFor = (actorOf) => wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'project id');
  const messageId = validateObjectId(req.params.messageId, 'message id');
  const message = await messageService.retractMessage(id, messageId, actorOf(req));
  return sendResponse(res, 200, 'Message retracted', { message });
});

export const listMyMessagesController = listMessagesFor(customerActor);
export const sendMyMessageController = sendMessageFor(customerActor);
export const markMyMessagesReadController = markReadFor(customerActor);
export const myUnreadCountController = unreadCountFor(customerActor);
export const retractMyMessageController = retractFor(customerActor);

export const listContractorMessagesController = listMessagesFor(contractorActor);
export const sendContractorMessageController = sendMessageFor(contractorActor);
export const markContractorMessagesReadController = markReadFor(contractorActor);
export const contractorUnreadCountController = unreadCountFor(contractorActor);
export const retractContractorMessageController = retractFor(contractorActor);

export const adminListMessagesController = listMessagesFor(adminActor);
export const adminSendMessageController = sendMessageFor(adminActor);

// ==================== DISPUTES (BRD Q15) ====================

const raiseDisputeFor = (actorOf) => wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'project id');
  const dispute = await disputeService.raiseDispute(id, req.body, actorOf(req));
  return sendResponse(
    res,
    201,
    'Dispute recorded. Our team will review it.',
    { dispute },
  );
});

const listProjectDisputesFor = (actorOf) => wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'project id');
  const disputes = await disputeService.listDisputesForProject(id, actorOf(req));
  return sendResponse(res, 200, 'Disputes', { disputes });
});

const getDisputeFor = (actorOf) => wrap(async (req, res) => {
  const disputeId = validateObjectId(req.params.disputeId, 'dispute id');
  const result = await disputeService.getDispute(disputeId, actorOf(req));
  return sendResponse(res, 200, 'Dispute', result);
});

const commentFor = (actorOf) => wrap(async (req, res) => {
  const disputeId = validateObjectId(req.params.disputeId, 'dispute id');
  const dispute = await disputeService.addComment(disputeId, req.body?.note, actorOf(req));
  return sendResponse(res, 200, 'Added', { dispute });
});

const withdrawFor = (actorOf) => wrap(async (req, res) => {
  const disputeId = validateObjectId(req.params.disputeId, 'dispute id');
  const dispute = await disputeService.withdrawDispute(disputeId, req.body?.reason, actorOf(req));
  return sendResponse(res, 200, 'Dispute withdrawn', { dispute });
});

export const raiseMyDisputeController = raiseDisputeFor(customerActor);
export const listMyDisputesController = listProjectDisputesFor(customerActor);
export const getMyDisputeController = getDisputeFor(customerActor);
export const commentMyDisputeController = commentFor(customerActor);
export const withdrawMyDisputeController = withdrawFor(customerActor);

export const raiseContractorDisputeController = raiseDisputeFor(contractorActor);
export const listContractorDisputesController = listProjectDisputesFor(contractorActor);
export const getContractorDisputeController = getDisputeFor(contractorActor);
export const commentContractorDisputeController = commentFor(contractorActor);
export const withdrawContractorDisputeController = withdrawFor(contractorActor);

// ---- admin ----

export const adminListDisputesController = wrap(async (req, res) => {
  const result = await disputeService.listDisputesAdmin(req.query);
  return sendResponse(res, 200, 'Disputes', result);
});

export const adminDisputeStatsController = wrap(async (req, res) => {
  const stats = await disputeService.getDisputeStats();
  return sendResponse(res, 200, 'Dispute stats', { stats });
});

export const adminGetDisputeController = getDisputeFor(adminActor);
export const adminCommentDisputeController = commentFor(adminActor);
export const adminWithdrawDisputeController = withdrawFor(adminActor);

export const adminStartReviewController = wrap(async (req, res) => {
  const disputeId = validateObjectId(req.params.disputeId, 'dispute id');
  const dispute = await disputeService.startReview(disputeId, req.user);
  return sendResponse(res, 200, 'Review started', { dispute });
});

/** The decision. This is the only Phase 6 endpoint that moves money. */
export const adminResolveDisputeController = wrap(async (req, res) => {
  const disputeId = validateObjectId(req.params.disputeId, 'dispute id');
  const result = await disputeService.resolveDispute(disputeId, {
    outcome: String(req.body?.outcome || '').trim(),
    resolutionNote: req.body?.resolutionNote,
    amountToContractor: req.body?.amountToContractor,
    amountToCustomer: req.body?.amountToCustomer,
    reqUser: req.user,
  });
  return sendResponse(
    res,
    200,
    result.alreadyResolved ? 'This dispute was already resolved' : 'Dispute resolved',
    result,
  );
});

// ==================== TRUST SCORE (BRD W18) ====================

/** The contractor's own view, with the breakdown and what to fix first. */
export const myScoreController = wrap(async (req, res) => {
  const score = await scoreService.getMyScore(req.contractorId);
  return sendResponse(res, 200, 'Your trust score', { score });
});

/** What a customer sees on a contractor — badge only, never the breakdown. */
export const publicScoreController = wrap(async (req, res) => {
  const contractorId = validateObjectId(req.params.contractorId, 'contractor id');
  const score = await scoreService.getPublicScore(contractorId);
  return sendResponse(res, 200, 'Contractor score', { score });
});

export const adminRecalculateScoreController = wrap(async (req, res) => {
  const contractorId = validateObjectId(req.params.contractorId, 'contractor id');
  const score = await scoreService.recalculateScore(contractorId);
  return sendResponse(res, 200, 'Score recalculated', { score });
});

export const adminRecalculateAllScoresController = wrap(async (req, res) => {
  const result = await scoreService.recalculateAllScores();
  return sendResponse(res, 200, 'Scores recalculated', result);
});

// ==================== CONTRACTOR DIRECTORY (BRD C6, C7, C8) ====================

/**
 * These three are what let a customer CHOOSE rather than simply be assigned.
 * All read-only, and all served through an explicit allow-list in the service
 * so a contractor's bank details or documents can never leak into them.
 */

/** BRD C6 — the contractors matched to this enquiry. */
export const listEnquiryContractorsController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'enquiry id');
  const result = await directoryService.listContractorsForEnquiry(req.user.userId, id);
  return sendResponse(res, 200, 'Matched contractors', result);
});

/** BRD C8 — search and filter the verified network. */
export const searchContractorsController = wrap(async (req, res) => {
  const result = await directoryService.searchContractors(req.query);
  return sendResponse(res, 200, 'Contractors', result);
});

/** BRD C7 — one contractor's full public page. */
export const contractorProfileController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.contractorId, 'contractor id');
  const contractor = await directoryService.getContractorProfile(id);
  return sendResponse(res, 200, 'Contractor profile', { contractor });
});
