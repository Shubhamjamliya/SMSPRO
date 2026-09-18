import { ValidationError } from '../../../core/auth/errors.js';
import { recordAudit } from '../../../core/audit/audit.service.js';
import { buildPaginationOptions, buildPaginatedResult } from '../../../utils/helpers.js';
import { ContractorLead } from '../models/contractorLead.model.js';
import { ConstructionEnquiry } from '../models/constructionEnquiry.model.js';
import { ContractorProfile } from '../models/contractorProfile.model.js';
import { Quotation } from '../models/quotation.model.js';
/*
 * Mongoose resolves `.populate()` by MODEL NAME at call time, so every model
 * this file populates has to have been imported by SOMETHING before the first
 * request lands. Relying on another module's import chain to have done that is
 * order-dependent: it passes in one entry point and throws MissingSchemaError in
 * another. These imports exist to register the models, even where the binding
 * itself is not referenced below.
 */
import { ConstructionService } from '../models/constructionService.model.js';
import { notifyLeadAccepted } from './notify.service.js';

const alive = { isDeleted: { $ne: true } };

/**
 * BRD W6 — the contractor's enquiry feed.
 *
 * Shows enough to judge whether a job suits them without exposing the customer's
 * identity before they accept: a contractor who has not committed does not need
 * the customer's name or phone number, only the work, the area and the budget.
 */
export const listLeads = async (contractorId, query = {}) => {
  const { page, limit, skip } = buildPaginationOptions(query);
  const status = query.status || 'offered';
  const filter = { contractorId, status };

  const [leads, total] = await Promise.all([
    ContractorLead.find(filter)
      .populate({
        path: 'enquiryId',
        select: 'enquiryNumber description site budgetMin budgetMax urgency '
          + 'preferredStartDate attachments status createdAt serviceId',
        populate: { path: 'serviceId', select: 'name slug' },
      })
      .sort({ offeredAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ContractorLead.countDocuments(filter),
  ]);

  const docs = leads
    .filter((l) => l.enquiryId)
    .map((lead) => {
      const e = lead.enquiryId;
      const accepted = lead.status === 'accepted';
      return {
        id: String(lead._id),
        status: lead.status,
        offeredAt: lead.offeredAt,
        expiresAt: lead.expiresAt,
        matchScore: lead.matchScore,
        matchReasons: lead.matchReasons,
        enquiry: {
          id: String(e._id),
          enquiryNumber: e.enquiryNumber,
          service: e.serviceId?.name || null,
          description: e.description,
          // Before accepting, the contractor sees the area — not the doorstep.
          site: accepted ? e.site : {
            area: e.site?.area || '',
            city: e.site?.city || '',
            plotArea: e.site?.plotArea ?? null,
            builtUpArea: e.site?.builtUpArea ?? null,
            areaUnit: e.site?.areaUnit || '',
            floors: e.site?.floors ?? null,
            currentCondition: e.site?.currentCondition || '',
          },
          budgetMin: e.budgetMin,
          budgetMax: e.budgetMax,
          urgency: e.urgency,
          preferredStartDate: e.preferredStartDate,
          attachmentCount: (e.attachments || []).length,
          attachments: accepted ? e.attachments : [],
          createdAt: e.createdAt,
        },
      };
    });

  return buildPaginatedResult({ docs, total, page, limit });
};

/**
 * BRD W7 — take the enquiry on.
 *
 * Refuses when the contractor is already at their declared concurrent-project
 * limit. That number is the honest answer to BRD Q2: capacity is respected
 * without ever locking a contractor out of the platform.
 */
export const acceptLead = async (contractorId, leadId) => {
  const lead = await ContractorLead.findOne({ _id: leadId, contractorId });
  if (!lead) throw new ValidationError('Lead not found');
  if (lead.status !== 'offered') {
    throw new ValidationError(
      lead.status === 'expired'
        ? 'This enquiry has moved on to another contractor'
        : `You have already ${lead.status} this enquiry`,
    );
  }
  if (lead.expiresAt && lead.expiresAt.getTime() < Date.now()) {
    lead.status = 'expired';
    lead.respondedAt = new Date();
    await lead.save();
    throw new ValidationError('This enquiry has expired and moved on to another contractor');
  }

  const contractor = await ContractorProfile.findById(contractorId)
    .select('maxConcurrentProjects businessName')
    .lean();
  const liveCount = await Quotation.countDocuments({
    contractorId, status: 'accepted', ...alive,
  });
  const limit = Number(contractor?.maxConcurrentProjects) || 3;
  if (liveCount >= limit) {
    throw new ValidationError(
      `You are at your limit of ${limit} live project${limit === 1 ? '' : 's'}. `
      + 'Raise it in your profile if you can take on more.',
    );
  }

  lead.status = 'accepted';
  lead.respondedAt = new Date();
  await lead.save();

  const enquiry = await ConstructionEnquiry.findById(lead.enquiryId);
  if (enquiry) {
    enquiry.lastActivityAt = new Date();
    await enquiry.save();

    // The customer has been waiting to hear that someone took this on.
    notifyLeadAccepted({
      customerId: enquiry.customerId,
      contractorName: contractor?.businessName || 'A contractor',
      enquiry: { id: enquiry._id, enquiryNumber: enquiry.enquiryNumber },
    }).catch(() => {});
  }

  await recordAudit({
    module: 'construction',
    entityType: 'lead',
    entityId: lead._id,
    action: 'lead.accepted',
    after: { contractorId: String(contractorId), enquiryId: String(lead.enquiryId) },
  });

  return lead.toObject();
};

/** BRD W7 — pass on it, so the enquiry can move to someone else quickly. */
export const declineLead = async (contractorId, leadId, { reason, note } = {}) => {
  const lead = await ContractorLead.findOne({ _id: leadId, contractorId });
  if (!lead) throw new ValidationError('Lead not found');
  if (lead.status !== 'offered') {
    throw new ValidationError(`You have already ${lead.status} this enquiry`);
  }

  lead.status = 'declined';
  lead.respondedAt = new Date();
  lead.declineReason = reason || 'other';
  lead.declineNote = String(note || '').trim();
  await lead.save();

  // Top the shortlist back up so the customer is not left short of options
  // because someone said no. Non-blocking — a declined lead is still declined.
  import('./matching.service.js')
    .then(({ matchEnquiry }) => matchEnquiry(lead.enquiryId))
    .catch(() => {});

  return lead.toObject();
};

/** The enquiries a contractor has taken on — their working list. */
export const listAcceptedEnquiries = async (contractorId, query = {}) => {
  const { page, limit, skip } = buildPaginationOptions(query);
  const filter = { contractorId, status: 'accepted' };

  const [leads, total] = await Promise.all([
    ContractorLead.find(filter)
      .populate({
        path: 'enquiryId',
        select: 'enquiryNumber description site budgetMin budgetMax urgency status '
          + 'attachments createdAt serviceId customerId acceptedQuotationId',
        populate: [
          { path: 'serviceId', select: 'name' },
          { path: 'customerId', select: 'name phone' },
        ],
      })
      .sort({ respondedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ContractorLead.countDocuments(filter),
  ]);

  const enquiryIds = leads.map((l) => l.enquiryId?._id).filter(Boolean);
  const quotes = enquiryIds.length
    ? await Quotation.find({
      enquiryId: { $in: enquiryIds }, contractorId, isLatest: true, ...alive,
    }).select('enquiryId status total quotationNumber version').lean()
    : [];
  const quoteByEnquiry = new Map(quotes.map((q) => [String(q.enquiryId), q]));

  return buildPaginatedResult({
    docs: leads.filter((l) => l.enquiryId).map((lead) => ({
      leadId: String(lead._id),
      acceptedAt: lead.respondedAt,
      enquiry: lead.enquiryId,
      myQuotation: quoteByEnquiry.get(String(lead.enquiryId._id)) || null,
    })),
    total,
    page,
    limit,
  });
};

/** Counts for the contractor's home screen. */
export const getLeadStats = async (contractorId) => {
  const [byStatus, liveProjects] = await Promise.all([
    ContractorLead.aggregate([
      { $match: { contractorId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Quotation.countDocuments({ contractorId, status: 'accepted', ...alive }),
  ]);
  const counts = byStatus.reduce((acc, r) => ({ ...acc, [r._id]: r.count }), {});
  return {
    newLeads: counts.offered || 0,
    accepted: counts.accepted || 0,
    declined: counts.declined || 0,
    expired: counts.expired || 0,
    liveProjects,
  };
};
