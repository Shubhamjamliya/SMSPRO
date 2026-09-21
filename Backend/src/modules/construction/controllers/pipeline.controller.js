import { sendResponse, sendError } from '../../../utils/response.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ValidationError } from '../../../core/auth/errors.js';
import * as enquiryService from '../services/enquiry.service.js';
import * as leadService from '../services/lead.service.js';
import * as visitService from '../services/siteVisit.service.js';
import * as quoteService from '../services/quotation.service.js';
import {
  validateEnquiryDto,
  validateDeclineDto,
  validateProposeVisitDto,
  validateVisitReportDto,
  validateQuotationUpdateDto,
  validateCreateDraftDto,
  validateTemplateDto,
  validateReasonDto,
  validateQuestionDto,
  validateObjectId,
} from '../validators/pipeline.validator.js';

const handle = (error, res, next) => {
  if (error instanceof ValidationError) {
    return sendError(res, error.statusCode || 400, error.message);
  }
  // Mongoose validation from the quotation/enquiry model guards.
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

// ==================== CUSTOMER ====================

export const createEnquiryController = wrap(async (req, res) => {
  const data = validateEnquiryDto(req.body);
  const enquiry = await enquiryService.createEnquiry(req.user.userId, data);
  return sendResponse(res, 201, `Enquiry ${enquiry.enquiryNumber} received`, { enquiry });
});

export const listMyEnquiriesController = wrap(async (req, res) => {
  const result = await enquiryService.listCustomerEnquiries(req.user.userId, req.query);
  return sendResponse(res, 200, 'Your enquiries', result);
});

export const getMyEnquiryController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'enquiry id');
  const result = await enquiryService.getEnquiryForCustomer(req.user.userId, id);
  return sendResponse(res, 200, 'Enquiry', result);
});

export const compareQuotationsController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'enquiry id');
  const result = await enquiryService.compareQuotations(req.user.userId, id);
  return sendResponse(res, 200, 'Quotation comparison', result);
});

/**
 * BRD C10 — every quote the customer has received, newest first.
 * Named for the customer explicitly: the contractor already has a
 * `listMyQuotationsController`, and "my" means a different person on each side.
 */
export const listCustomerQuotationsController = wrap(async (req, res) => {
  const quotations = await quoteService.listCustomerQuotations(req.user.userId, req.query);
  return sendResponse(res, 200, 'Your quotations', { quotations });
});

export const getMyQuotationController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'quotation id');
  const result = await quoteService.getQuotation(id, { customerId: req.user.userId });
  return sendResponse(res, 200, 'Quotation', result);
});

export const acceptQuotationController = wrap(async (req, res) => {
  const enquiryId = validateObjectId(req.params.id, 'enquiry id');
  const quotationId = validateObjectId(req.params.quotationId, 'quotation id');
  const result = await enquiryService.acceptQuotation(req.user.userId, enquiryId, quotationId);
  return sendResponse(res, 200, 'Quotation accepted', result);
});

export const rejectQuotationController = wrap(async (req, res) => {
  const enquiryId = validateObjectId(req.params.id, 'enquiry id');
  const quotationId = validateObjectId(req.params.quotationId, 'quotation id');
  const reason = validateReasonDto(req.body, { required: false });
  const quotation = await enquiryService.rejectQuotation(req.user.userId, enquiryId, quotationId, reason);
  return sendResponse(res, 200, 'Quotation rejected', { quotation });
});

export const askQuestionController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'quotation id');
  const question = validateQuestionDto(req.body);
  const quotation = await enquiryService.askQuotationQuestion(req.user.userId, id, question);
  return sendResponse(res, 200, 'Question sent to the contractor', { quotation });
});

export const requestRevisionController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'quotation id');
  const note = validateReasonDto(req.body, { required: true, label: 'note on what to change' });
  const quotation = await enquiryService.requestRevision(req.user.userId, id, note);
  return sendResponse(res, 200, 'Revision requested', { quotation });
});

export const customerProposeVisitController = wrap(async (req, res) => {
  const data = validateProposeVisitDto(req.body);
  if (!data.contractorId) throw new ValidationError('Choose a contractor for the visit');
  const visit = await visitService.proposeVisit({
    ...data,
    proposedBy: 'customer',
    actorId: req.user.userId,
  });
  return sendResponse(res, 201, 'Site visit proposed', { visit });
});

export const customerConfirmVisitController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'visit id');
  const visit = await visitService.confirmVisit(id, { actorRole: 'customer', actorId: req.user.userId });
  return sendResponse(res, 200, 'Site visit confirmed', { visit });
});

export const customerCancelVisitController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'visit id');
  const reason = validateReasonDto(req.body, { required: false });
  const visit = await visitService.cancelVisit(id, { actorRole: 'customer', actorId: req.user.userId, reason });
  return sendResponse(res, 200, 'Site visit cancelled', { visit });
});

// ==================== CONTRACTOR ====================

export const listLeadsController = wrap(async (req, res) => {
  const result = await leadService.listLeads(req.contractorId, req.query);
  return sendResponse(res, 200, 'Your enquiries', result);
});

export const leadStatsController = wrap(async (req, res) => {
  const stats = await leadService.getLeadStats(req.contractorId);
  return sendResponse(res, 200, 'Lead stats', { stats });
});

export const acceptLeadController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'lead id');
  const lead = await leadService.acceptLead(req.contractorId, id);
  return sendResponse(res, 200, 'Enquiry accepted', { lead });
});

export const declineLeadController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'lead id');
  const data = validateDeclineDto(req.body);
  const lead = await leadService.declineLead(req.contractorId, id, data);
  return sendResponse(res, 200, 'Enquiry declined', { lead });
});

export const listMyJobsController = wrap(async (req, res) => {
  const result = await leadService.listAcceptedEnquiries(req.contractorId, req.query);
  return sendResponse(res, 200, 'Your jobs', result);
});

export const contractorProposeVisitController = wrap(async (req, res) => {
  const data = validateProposeVisitDto(req.body);
  const visit = await visitService.proposeVisit({
    enquiryId: data.enquiryId,
    contractorId: req.contractorId,
    scheduledAt: data.scheduledAt,
    proposedBy: 'contractor',
    actorId: req.contractorId,
  });
  return sendResponse(res, 201, 'Site visit proposed', { visit });
});

export const contractorConfirmVisitController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'visit id');
  const visit = await visitService.confirmVisit(id, { actorRole: 'contractor', actorId: req.contractorId });
  return sendResponse(res, 200, 'Site visit confirmed', { visit });
});

export const contractorCancelVisitController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'visit id');
  const reason = validateReasonDto(req.body, { required: false });
  const visit = await visitService.cancelVisit(id, { actorRole: 'contractor', actorId: req.contractorId, reason });
  return sendResponse(res, 200, 'Site visit cancelled', { visit });
});

export const listMyVisitsController = wrap(async (req, res) => {
  const visits = await visitService.listContractorVisits(req.contractorId, req.query);
  return sendResponse(res, 200, 'Site visits', { visits });
});

export const getVisitController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'visit id');
  const visit = await visitService.getVisit(id, { contractorId: req.contractorId });
  return sendResponse(res, 200, 'Site visit', { visit });
});

export const submitVisitReportController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'visit id');
  const data = validateVisitReportDto(req.body);
  const visit = await visitService.submitVisitReport(req.contractorId, id, data);
  return sendResponse(res, 200, 'Site visit recorded', { visit });
});

// ---------- Quotation builder ----------

export const createDraftController = wrap(async (req, res) => {
  const data = validateCreateDraftDto(req.body);
  const quotation = await quoteService.createDraft(req.contractorId, data);
  return sendResponse(res, 201, 'Quotation started', { quotation });
});

export const updateDraftController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'quotation id');
  const data = validateQuotationUpdateDto(req.body);
  const quotation = await quoteService.updateDraft(req.contractorId, id, data);
  return sendResponse(res, 200, 'Quotation saved', { quotation });
});

export const sendQuotationController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'quotation id');
  const quotation = await quoteService.sendQuotation(req.contractorId, id);
  return sendResponse(res, 200, 'Quotation sent to the customer', { quotation });
});

export const createRevisionController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'quotation id');
  const quotation = await quoteService.createRevision(req.contractorId, id);
  return sendResponse(res, 201, `Revision v${quotation.version} created`, { quotation });
});

export const answerQueryController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'quotation id');
  const queryId = validateObjectId(req.params.queryId, 'question id');
  const answer = validateReasonDto(req.body, { required: true, label: 'answer' });
  const quotation = await quoteService.answerQuery(req.contractorId, id, queryId, answer);
  return sendResponse(res, 200, 'Answer sent', { quotation });
});

export const listMyQuotationsController = wrap(async (req, res) => {
  const quotations = await quoteService.listContractorQuotations(req.contractorId, req.query);
  return sendResponse(res, 200, 'Your quotations', { quotations });
});

export const getContractorQuotationController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'quotation id');
  const result = await quoteService.getQuotation(id, { contractorId: req.contractorId });
  return sendResponse(res, 200, 'Quotation', result);
});

// ---------- Templates (BRD W13) ----------

export const listTemplatesController = wrap(async (req, res) => {
  const templates = await quoteService.listTemplates(req.contractorId);
  return sendResponse(res, 200, 'Your templates', { templates });
});

export const createTemplateController = wrap(async (req, res) => {
  const data = validateTemplateDto(req.body);
  const template = await quoteService.saveTemplate(req.contractorId, data);
  return sendResponse(res, 201, 'Template saved', { template });
});

export const saveAsTemplateController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'quotation id');
  const template = await quoteService.saveQuotationAsTemplate(req.contractorId, id, req.body?.name);
  return sendResponse(res, 201, 'Saved as a template', { template });
});

export const deleteTemplateController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'template id');
  const result = await quoteService.deleteTemplate(req.contractorId, id);
  return sendResponse(res, 200, 'Template removed', result);
});

// ==================== ADMIN (BRD A4) ====================

export const adminListEnquiriesController = wrap(async (req, res) => {
  const result = await enquiryService.listEnquiriesAdmin(req.query);
  return sendResponse(res, 200, 'Enquiries', result);
});

export const adminGetEnquiryController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'enquiry id');
  const result = await enquiryService.getEnquiryAdmin(id);
  return sendResponse(res, 200, 'Enquiry', result);
});

export const adminEnquiryStatsController = wrap(async (req, res) => {
  const stats = await enquiryService.getEnquiryStats(req.query);
  return sendResponse(res, 200, 'Enquiry stats', { stats });
});

export const adminRematchController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'enquiry id');
  const result = await enquiryService.rematchEnquiry(id, req.user);
  return sendResponse(res, 200, `Offered to ${result.matched} contractor(s)`, result);
});

export const adminCloseEnquiryController = wrap(async (req, res) => {
  const id = validateObjectId(req.params.id, 'enquiry id');
  const reason = validateReasonDto(req.body, { required: true, label: 'reason for closing' });
  const enquiry = await enquiryService.closeEnquiry(id, reason, req.user);
  return sendResponse(res, 200, 'Enquiry closed', { enquiry });
});
