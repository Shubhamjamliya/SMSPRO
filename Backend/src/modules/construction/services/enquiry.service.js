import { ValidationError } from '../../../core/auth/errors.js';
import { recordAudit } from '../../../core/audit/audit.service.js';
import { extractPerformer } from '../../../core/utils/performer.js';
import { buildPaginationOptions, buildPaginatedResult } from '../../../utils/helpers.js';
import { ConstructionEnquiry } from '../models/constructionEnquiry.model.js';
import { ConstructionService } from '../models/constructionService.model.js';
import { ConstructionBudgetService } from '../models/constructionBudgetService.model.js';
import { ContractorLead } from '../models/contractorLead.model.js';
import { SiteVisit } from '../models/siteVisit.model.js';
import { Quotation } from '../models/quotation.model.js';
import { ContractorProfile } from '../models/contractorProfile.model.js';
/*
 * Mongoose resolves `.populate()` by MODEL NAME at call time, so every model
 * this file populates has to have been imported by SOMETHING before the first
 * request lands. Relying on another module's import chain to have done that is
 * order-dependent: it passes in one entry point and throws MissingSchemaError in
 * another. These imports exist to register the models, even where the binding
 * itself is not referenced below.
 */
import { ConstructionCategory } from '../models/constructionCategory.model.js';
import { matchEnquiry } from './matching.service.js';
import { logger } from '../../../utils/logger.js';
import {
  notifyQuotationAccepted,
  notifyQuotationRejected,
  notifyQuotationQuery,
} from './notify.service.js';

const alive = { isDeleted: { $ne: true } };

const touch = (enquiry, status, reason, performer = null) => {
  if (status && enquiry.status !== status) {
    enquiry.status = status;
    enquiry.statusHistory.push({ status, reason: reason || '', at: new Date(), by: performer });
  }
  enquiry.lastActivityAt = new Date();
};

/**
 * BRD C3–C5 — create an enquiry and immediately confirm it.
 *
 * Matching runs straight away but is deliberately non-blocking: the customer
 * gets their reference number even if no contractor covers the trade yet.
 * "Silence after submitting a form makes people assume it failed."
 */
export const createEnquiry = async (customerId, data) => {
  const service = await ConstructionService
    .findOne({ _id: data.serviceId, ...alive, status: 'active' })
    .select('_id categoryId name')
    .lean();
  if (!service) throw new ValidationError('That service is not available');

  // Remember which Budget Friendly card this came from. A card that has since been removed
  // must not block the enquiry, so it is quietly dropped rather than rejected.
  let budgetServiceId = null;
  if (data.budgetServiceId) {
    const card = await ConstructionBudgetService
      .findOne({ _id: data.budgetServiceId, ...alive })
      .select('_id')
      .lean();
    budgetServiceId = card?._id || null;
  }

  const enquiry = await ConstructionEnquiry.create({
    ...data,
    budgetServiceId,
    customerId,
    categoryId: service.categoryId,
    status: 'submitted',
    statusHistory: [{ status: 'submitted', at: new Date() }],
    lastActivityAt: new Date(),
  });

  await recordAudit({
    module: 'construction',
    entityType: 'enquiry',
    entityId: enquiry._id,
    action: 'enquiry.created',
    after: { enquiryNumber: enquiry.enquiryNumber, service: service.name },
  });

  // Fire and forget — a matching failure must never lose the enquiry itself.
  matchEnquiry(enquiry._id).catch((err) => {
    logger.error(`[construction] matching failed for ${enquiry.enquiryNumber}: ${err.message}`);
  });

  return enquiry.toObject();
};

/** BRD C5 — the customer's list of enquiries and where each has reached. */
export const listCustomerEnquiries = async (customerId, query = {}) => {
  const { page, limit, skip } = buildPaginationOptions(query);
  const filter = { customerId, ...alive };
  if (query.status) filter.status = query.status;

  const [docs, total] = await Promise.all([
    ConstructionEnquiry.find(filter)
      .populate('serviceId', 'name slug coverImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ConstructionEnquiry.countDocuments(filter),
  ]);

  // Quote counts drive the "3 quotes ready" badge that pulls a customer back in.
  const ids = docs.map((d) => d._id);
  const quoteCounts = ids.length
    ? await Quotation.aggregate([
      { $match: { enquiryId: { $in: ids }, isLatest: true, status: { $in: ['sent', 'under_review'] }, isDeleted: { $ne: true } } },
      { $group: { _id: '$enquiryId', count: { $sum: 1 } } },
    ])
    : [];
  const byId = new Map(quoteCounts.map((r) => [String(r._id), r.count]));

  return buildPaginatedResult({
    docs: docs.map((d) => ({ ...d, pendingQuoteCount: byId.get(String(d._id)) || 0 })),
    total,
    page,
    limit,
  });
};

/** Full detail for one enquiry, scoped to whoever is asking. */
export const getEnquiryForCustomer = async (customerId, enquiryId) => {
  const enquiry = await ConstructionEnquiry
    .findOne({ _id: enquiryId, customerId, ...alive })
    .populate('serviceId', 'name slug description coverImage typicalDurationText')
    .lean();
  if (!enquiry) throw new ValidationError('Enquiry not found');

  const [visits, quotations, shortlist] = await Promise.all([
    SiteVisit.find({ enquiryId })
      .populate('contractorId', 'businessName contractorCode rating profileImage')
      .sort({ scheduledAt: 1 })
      .lean(),
    Quotation.find({ enquiryId, isLatest: true, status: { $ne: 'draft' }, ...alive })
      .populate('contractorId', 'businessName contractorCode rating totalRatings profileImage completedProjects')
      .sort({ total: 1 })
      .lean(),
    // Only contractors who actually accepted the lead are offered to the
    // customer — showing someone who declined would waste everyone's time.
    ContractorLead.find({ enquiryId, status: 'accepted' })
      .populate('contractorId', 'businessName ownerName contractorCode rating totalRatings profileImage completedProjects yearsExperience about serviceAreas')
      .lean(),
  ]);

  return {
    enquiry,
    siteVisits: visits,
    quotations,
    interestedContractors: shortlist.map((l) => l.contractorId).filter(Boolean),
  };
};

/** BRD C13 — accepting locks the price and scope; this is the turning point. */
export const acceptQuotation = async (customerId, enquiryId, quotationId) => {
  const enquiry = await ConstructionEnquiry.findOne({ _id: enquiryId, customerId, ...alive });
  if (!enquiry) throw new ValidationError('Enquiry not found');
  if (enquiry.acceptedQuotationId) {
    throw new ValidationError('You have already accepted a quotation for this enquiry');
  }
  if (['converted', 'closed_lost', 'expired'].includes(enquiry.status)) {
    throw new ValidationError('This enquiry is closed');
  }

  const quotation = await Quotation.findOne({
    _id: quotationId,
    enquiryId,
    customerId,
    isLatest: true,
    ...alive,
  });
  if (!quotation) throw new ValidationError('Quotation not found');
  if (!['sent', 'under_review'].includes(quotation.status)) {
    throw new ValidationError(`This quotation cannot be accepted — it is ${quotation.status}`);
  }
  if (quotation.validUntil && quotation.validUntil.getTime() < Date.now()) {
    throw new ValidationError('This quotation has expired. Ask the contractor for a fresh one.');
  }

  quotation.status = 'accepted';
  quotation.acceptedAt = new Date();
  quotation.statusHistory.push({ status: 'accepted', at: new Date() });
  // The price and scope are locked, but this is not yet a project — the
  // contractor still has to confirm they can take it on (see
  // quotation.service.js#confirmQuotationByContractor).
  quotation.contractorConfirmation = { status: 'pending', respondedAt: null, declineReason: '' };
  await quotation.save();

  // Every other live quote on this enquiry is now moot — withdraw them so no
  // contractor is left believing they are still in the running.
  await Quotation.updateMany(
    { enquiryId, _id: { $ne: quotation._id }, status: { $in: ['sent', 'under_review', 'revision_requested'] } },
    { $set: { status: 'withdrawn' }, $push: { statusHistory: { status: 'withdrawn', reason: 'Customer accepted another quotation', at: new Date() } } },
  );

  enquiry.acceptedQuotationId = quotation._id;
  touch(enquiry, 'accepted', `Accepted ${quotation.quotationNumber}`);
  await enquiry.save();

  // BRD C13 — the turning point. The contractor needs to know immediately,
  // and now needs to actively confirm before this becomes their project.
  notifyQuotationAccepted({
    contractorId: quotation.contractorId,
    quotation: {
      id: quotation._id,
      quotationNumber: quotation.quotationNumber,
      total: quotation.total,
    },
    enquiry: { id: enquiry._id },
  }).catch(() => {});

  await recordAudit({
    module: 'construction',
    entityType: 'enquiry',
    entityId: enquiry._id,
    action: 'quotation.accepted',
    after: {
      quotationNumber: quotation.quotationNumber,
      total: quotation.total,
      contractorId: String(quotation.contractorId),
    },
  });

  // The project is NOT created here. Accepting only locks the price and
  // scope and asks the contractor to confirm — the enquiry becomes a live
  // project only once they do (`quotation.service.js#confirmQuotationByContractor`),
  // at which point it shows up under /contractor/projects.
  return { enquiry: enquiry.toObject(), quotation: quotation.toObject(), project: null };
};

/** BRD C13 — rejecting asks for a reason, which improves future matching. */
export const rejectQuotation = async (customerId, enquiryId, quotationId, reason) => {
  const quotation = await Quotation.findOne({
    _id: quotationId, enquiryId, customerId, isLatest: true, ...alive,
  });
  if (!quotation) throw new ValidationError('Quotation not found');
  if (!['sent', 'under_review', 'revision_requested'].includes(quotation.status)) {
    throw new ValidationError(`This quotation cannot be rejected — it is ${quotation.status}`);
  }

  quotation.status = 'rejected';
  quotation.rejectedAt = new Date();
  quotation.rejectionReason = String(reason || '').trim();
  quotation.statusHistory.push({ status: 'rejected', reason: quotation.rejectionReason, at: new Date() });
  await quotation.save();

  const enquiry = await ConstructionEnquiry.findById(enquiryId);
  if (enquiry) {
    enquiry.lastActivityAt = new Date();
    await enquiry.save();
  }

  notifyQuotationRejected({
    contractorId: quotation.contractorId,
    quotation: { id: quotation._id, quotationNumber: quotation.quotationNumber },
    reason: quotation.rejectionReason,
  }).catch(() => {});

  return quotation.toObject();
};

/** BRD C12 — ask about a line, or request a revised quote. */
export const askQuotationQuestion = async (customerId, quotationId, question) => {
  const quotation = await Quotation.findOne({ _id: quotationId, customerId, ...alive });
  if (!quotation) throw new ValidationError('Quotation not found');

  quotation.queries.push({ question: String(question).trim(), askedAt: new Date() });
  if (quotation.status === 'sent') quotation.status = 'under_review';
  await quotation.save();

  notifyQuotationQuery({
    contractorId: quotation.contractorId,
    quotation: { id: quotation._id, quotationNumber: quotation.quotationNumber },
    kind: 'question',
  }).catch(() => {});

  return quotation.toObject();
};

export const requestRevision = async (customerId, quotationId, note) => {
  const quotation = await Quotation.findOne({ _id: quotationId, customerId, isLatest: true, ...alive });
  if (!quotation) throw new ValidationError('Quotation not found');
  if (!['sent', 'under_review'].includes(quotation.status)) {
    throw new ValidationError('A revision can only be requested on a live quotation');
  }

  quotation.status = 'revision_requested';
  quotation.revisionRequest = String(note || '').trim();
  quotation.statusHistory.push({ status: 'revision_requested', reason: quotation.revisionRequest, at: new Date() });
  await quotation.save();

  const enquiry = await ConstructionEnquiry.findById(quotation.enquiryId);
  if (enquiry) {
    touch(enquiry, 'negotiating', 'Customer requested a revision');
    await enquiry.save();
  }

  notifyQuotationQuery({
    contractorId: quotation.contractorId,
    quotation: { id: quotation._id, quotationNumber: quotation.quotationNumber },
    kind: 'revision',
  }).catch(() => {});

  return quotation.toObject();
};

/**
 * BRD C11 — quotations side by side.
 *
 * Comparing is genuinely hard on paper, so this returns the shape the comparison
 * screen needs rather than raw documents: the union of every section across all
 * quotes, so a section one contractor priced and another omitted is visible as a
 * gap rather than silently missing.
 */
export const compareQuotations = async (customerId, enquiryId) => {
  const quotations = await Quotation.find({
    enquiryId,
    customerId,
    isLatest: true,
    status: { $in: ['sent', 'under_review', 'revision_requested'] },
    ...alive,
  })
    .populate('contractorId', 'businessName contractorCode rating totalRatings completedProjects profileImage')
    .sort({ total: 1 })
    .lean();

  if (!quotations.length) return { quotations: [], sections: [], cheapestId: null };

  const sectionNames = [...new Set(quotations.flatMap((q) => (q.sections || []).map((s) => s.name)))];

  const sections = sectionNames.map((name) => ({
    name,
    byQuotation: quotations.map((q) => {
      const found = (q.sections || []).find((s) => s.name === name);
      return {
        quotationId: String(q._id),
        // null, not 0 — "they did not quote this" is different information from
        // "they quoted it at nothing", and the customer needs to see which.
        subtotal: found ? found.subtotal : null,
        itemCount: found ? (found.items || []).length : 0,
      };
    }),
  }));

  return {
    quotations,
    sections,
    cheapestId: String(quotations[0]._id),
  };
};

// ---------- Admin (BRD A4 — enquiry pipeline) ----------

/**
 * The Budget Friendly view of the enquiries: only those raised from a Budget Friendly card,
 * or from one specific card.
 */
const budgetScope = (query = {}) => {
  if (query.budgetServiceId) return { budgetServiceId: query.budgetServiceId };
  if (query.budget === 'true') return { budgetServiceId: { $ne: null } };
  return {};
};

export const listEnquiriesAdmin = async (query = {}) => {
  const { page, limit, skip } = buildPaginationOptions(query);
  const filter = { ...alive };
  if (query.status) filter.status = query.status;
  if (query.city) filter['site.city'] = new RegExp(String(query.city).trim(), 'i');
  if (query.categoryId) filter.categoryId = query.categoryId;
  Object.assign(filter, budgetScope(query));

  // "Gone quiet" is the whole point of this screen — surface them explicitly.
  if (query.stale === 'true') {
    const days = Number(query.staleDays) || 7;
    filter.lastActivityAt = { $lt: new Date(Date.now() - days * 86400000) };
    filter.status = filter.status || { $nin: ['converted', 'closed_lost', 'expired', 'accepted'] };
  }

  const [docs, total] = await Promise.all([
    ConstructionEnquiry.find(filter)
      .populate('serviceId', 'name')
      .populate('budgetServiceId', 'name')
      .populate('customerId', 'name phone')
      .sort({ lastActivityAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ConstructionEnquiry.countDocuments(filter),
  ]);

  return buildPaginatedResult({ docs, total, page, limit });
};

export const getEnquiryAdmin = async (enquiryId) => {
  const enquiry = await ConstructionEnquiry.findOne({ _id: enquiryId, ...alive })
    .populate('serviceId', 'name')
    .populate('categoryId', 'name')
    .populate('customerId', 'name phone email')
    .lean();
  if (!enquiry) throw new ValidationError('Enquiry not found');

  const [leads, visits, quotations] = await Promise.all([
    ContractorLead.find({ enquiryId })
      .populate('contractorId', 'businessName contractorCode phone rating')
      .sort({ matchScore: -1 })
      .lean(),
    SiteVisit.find({ enquiryId }).populate('contractorId', 'businessName').lean(),
    Quotation.find({ enquiryId, ...alive })
      .populate('contractorId', 'businessName contractorCode')
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  return { enquiry, leads, siteVisits: visits, quotations };
};

/** Manual re-match — for when an enquiry stalls and ops wants to push it on. */
export const rematchEnquiry = async (enquiryId, reqUser = null) => {
  const result = await matchEnquiry(enquiryId);
  await recordAudit({
    module: 'construction',
    entityType: 'enquiry',
    entityId: enquiryId,
    action: 'enquiry.rematched',
    after: result,
    performedBy: extractPerformer(reqUser),
  });
  return result;
};

export const closeEnquiry = async (enquiryId, reason, reqUser = null) => {
  const enquiry = await ConstructionEnquiry.findOne({ _id: enquiryId, ...alive });
  if (!enquiry) throw new ValidationError('Enquiry not found');
  const performer = extractPerformer(reqUser);

  enquiry.closedReason = String(reason || '').trim();
  touch(enquiry, 'closed_lost', enquiry.closedReason, performer);
  await enquiry.save();

  // Nobody is still in the running — stop offering it and withdraw live quotes.
  await ContractorLead.updateMany(
    { enquiryId, status: 'offered' },
    { $set: { status: 'withdrawn', respondedAt: new Date() } },
  );
  await Quotation.updateMany(
    { enquiryId, status: { $in: ['sent', 'under_review', 'revision_requested'] } },
    { $set: { status: 'withdrawn' } },
  );

  await recordAudit({
    module: 'construction',
    entityType: 'enquiry',
    entityId: enquiry._id,
    action: 'enquiry.closed',
    after: { reason: enquiry.closedReason },
    performedBy: performer,
  });
  return enquiry.toObject();
};

export const getEnquiryStats = async (query = {}) => {
  const scope = { ...alive, ...budgetScope(query) };
  const [byStatus, staleCount] = await Promise.all([
    ConstructionEnquiry.aggregate([
      { $match: scope },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    ConstructionEnquiry.countDocuments({
      ...scope,
      status: { $nin: ['converted', 'closed_lost', 'expired', 'accepted'] },
      lastActivityAt: { $lt: new Date(Date.now() - 7 * 86400000) },
    }),
  ]);

  const counts = byStatus.reduce((acc, r) => ({ ...acc, [r._id]: r.count }), {});
  return {
    submitted: counts.submitted || 0,
    matching: counts.matching || 0,
    visitScheduled: counts.visit_scheduled || 0,
    quoted: counts.quoted || 0,
    negotiating: counts.negotiating || 0,
    accepted: counts.accepted || 0,
    closedLost: counts.closed_lost || 0,
    goneQuiet: staleCount,
  };
};

export { touch as touchEnquiry };
