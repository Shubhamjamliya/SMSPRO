import { ValidationError } from '../../../core/auth/errors.js';
import { recordAudit } from '../../../core/audit/audit.service.js';
import { Quotation } from '../models/quotation.model.js';
import { QuotationTemplate } from '../models/quotationTemplate.model.js';
import { ConstructionEnquiry } from '../models/constructionEnquiry.model.js';
import { ContractorLead } from '../models/contractorLead.model.js';
import { SiteVisit } from '../models/siteVisit.model.js';
/*
 * Mongoose resolves `.populate()` by MODEL NAME at call time, so every model
 * this file populates has to have been imported by SOMETHING before the first
 * request lands. Relying on another module's import chain to have done that is
 * order-dependent: it passes in one entry point and throws MissingSchemaError in
 * another. These imports exist to register the models, even where the binding
 * itself is not referenced below.
 */
import { ConstructionService } from '../models/constructionService.model.js';
import { ContractorProfile } from '../models/contractorProfile.model.js';
import { ConstructionCategory } from '../models/constructionCategory.model.js';
import { getSettings } from './settings.service.js';
import { touchEnquiry } from './enquiry.service.js';
import { notifyQuotationSent, contractorName } from './notify.service.js';

const alive = { isDeleted: { $ne: true } };

const assertContractorOnEnquiry = async (contractorId, enquiryId) => {
  const lead = await ContractorLead.findOne({
    enquiryId, contractorId, status: 'accepted',
  }).select('_id').lean();
  if (!lead) throw new ValidationError('You have not taken on this enquiry');
};

/**
 * Enforce the stage guardrails from settings (BRD Q7).
 *
 * These are what stop a contractor writing "70% on mobilisation" — the exact
 * abuse the staged payment model exists to prevent. The percentages totalling
 * 100 is enforced by the model itself; these are the shape rules on top.
 */
const assertStagePlan = async (stages) => {
  const settings = await getSettings();
  const s = settings.stages || {};

  if (s.mode === 'platform_fixed') return; // stages come from the service template

  if (!stages?.length) {
    throw new ValidationError('Propose the payment stages before sending this quotation');
  }
  const min = Number(s.minStages) || 3;
  const max = Number(s.maxStages) || 12;
  if (stages.length < min) throw new ValidationError(`Use at least ${min} payment stages`);
  if (stages.length > max) throw new ValidationError(`Use at most ${max} payment stages`);

  const cap = Number(s.maxSingleStagePercent) || 40;
  const worst = stages.find((x) => Number(x.percentage) > cap);
  if (worst) {
    throw new ValidationError(`No single stage may exceed ${cap}% — "${worst.name}" is ${worst.percentage}%`);
  }

  const firstCap = Number(s.maxFirstStagePercent) || 20;
  if (Number(stages[0].percentage) > firstCap) {
    throw new ValidationError(`The first stage may not exceed ${firstCap}% — customers are paying before any work is done`);
  }

  const lastFloor = Number(s.minFinalStagePercent) || 10;
  if (Number(stages[stages.length - 1].percentage) < lastFloor) {
    throw new ValidationError(`The final stage must be at least ${lastFloor}% — it is what secures handover`);
  }
};

/** BRD W10 — start a quotation, optionally from a saved template (W13). */
export const createDraft = async (contractorId, { enquiryId, templateId, title }) => {
  await assertContractorOnEnquiry(contractorId, enquiryId);

  const enquiry = await ConstructionEnquiry.findOne({ _id: enquiryId, ...alive })
    .populate('serviceId', 'name defaultQuoteSections defaultUnit')
    .lean();
  if (!enquiry) throw new ValidationError('Enquiry not found');

  const existingDraft = await Quotation.findOne({
    enquiryId, contractorId, status: 'draft', ...alive,
  });
  if (existingDraft) return existingDraft.toObject();

  const settings = await getSettings();
  const q = settings.quotation || {};

  let sections = [];
  let terms = q.standardTerms || '';
  let exclusions = q.standardExclusions || '';
  let proposedStages = [];

  if (templateId) {
    const template = await QuotationTemplate.findOne({ _id: templateId, contractorId, ...alive });
    if (!template) throw new ValidationError('Template not found');
    sections = (template.sections || []).map((s) => ({
      name: s.name,
      items: (s.items || []).map((i) => ({
        description: i.description,
        quantity: i.quantity ?? 1,
        unit: i.unit || '',
        rate: i.rate ?? 0,
        remarks: i.remarks || '',
      })),
    }));
    terms = template.terms || terms;
    exclusions = template.exclusions || exclusions;
    proposedStages = (template.proposedStages || []).map((s) => ({ ...s }));
    await QuotationTemplate.updateOne({ _id: template._id }, { $inc: { useCount: 1 } });
  } else {
    // Seed with the service's own sections so the contractor is not staring at
    // a blank page — they can rename or delete any of them.
    const names = enquiry.serviceId?.defaultQuoteSections?.length
      ? enquiry.serviceId.defaultQuoteSections
      : q.defaultSections || [];
    sections = names.map((name) => ({ name, items: [] }));
  }

  const lastVisit = await SiteVisit.findOne({
    enquiryId, contractorId, status: 'completed',
  }).sort({ completedAt: -1 }).select('_id').lean();

  const validityDays = Number(q.defaultValidityDays) || 15;

  const quotation = await Quotation.create({
    enquiryId,
    contractorId,
    customerId: enquiry.customerId,
    siteVisitId: lastVisit?._id || null,
    title: title || `Quotation for ${enquiry.serviceId?.name || 'construction work'}`,
    sections,
    taxMode: q.taxMode || 'exclusive',
    taxLabel: q.taxLabel || 'GST',
    taxPercent: q.taxMode === 'none' ? 0 : Number(q.defaultTaxPercent) || 0,
    terms,
    exclusions,
    proposedStages,
    validUntil: new Date(Date.now() + validityDays * 86400000),
    status: 'draft',
    version: 1,
    isLatest: true,
  });

  return quotation.toObject();
};

/** Save the builder's contents. Totals are recomputed by the model on save. */
export const updateDraft = async (contractorId, quotationId, data) => {
  const quotation = await Quotation.findOne({ _id: quotationId, contractorId, ...alive });
  if (!quotation) throw new ValidationError('Quotation not found');
  if (quotation.status !== 'draft') {
    throw new ValidationError('A quotation that has been sent cannot be edited. Send a revision instead.');
  }

  const assignable = ['title', 'sections', 'taxMode', 'taxLabel', 'taxPercent',
    'terms', 'exclusions', 'proposedStages', 'validUntil'];
  for (const key of assignable) {
    if (data[key] !== undefined) quotation[key] = data[key];
  }
  await quotation.save();
  return quotation.toObject();
};

/**
 * BRD C10 — send it to the customer.
 *
 * Everything that makes a quote binding is checked here rather than at draft
 * time, so a contractor can save a half-finished quote without being nagged.
 */
export const sendQuotation = async (contractorId, quotationId) => {
  const quotation = await Quotation.findOne({ _id: quotationId, contractorId, ...alive });
  if (!quotation) throw new ValidationError('Quotation not found');
  if (quotation.status !== 'draft') throw new ValidationError('This quotation has already been sent');

  const itemCount = (quotation.sections || []).reduce((n, s) => n + (s.items || []).length, 0);
  if (itemCount === 0) throw new ValidationError('Add at least one line item before sending');
  if (quotation.total <= 0) throw new ValidationError('The quotation total must be greater than zero');

  const settings = await getSettings();
  // BRD W11 — "nearly every construction dispute begins with something the
  // customer assumed was included."
  if (settings.quotation?.requireExclusions !== false && !String(quotation.exclusions || '').trim()) {
    throw new ValidationError('State what is NOT included before sending — it is what prevents disputes later');
  }
  await assertStagePlan(quotation.proposedStages);

  if (!quotation.validUntil || quotation.validUntil.getTime() < Date.now()) {
    const days = Number(settings.quotation?.defaultValidityDays) || 15;
    quotation.validUntil = new Date(Date.now() + days * 86400000);
  }

  // Respect the cap on how many contractors may quote one enquiry (BRD Q5).
  const m = settings.matching || {};
  if (m.allowMultipleQuotes === false) {
    const others = await Quotation.countDocuments({
      enquiryId: quotation.enquiryId,
      contractorId: { $ne: contractorId },
      isLatest: true,
      status: { $in: ['sent', 'under_review', 'revision_requested', 'accepted'] },
      ...alive,
    });
    if (others > 0) throw new ValidationError('Another contractor has already quoted for this enquiry');
  } else {
    const cap = Number(m.maxQuotesPerEnquiry) || 3;
    const others = await Quotation.countDocuments({
      enquiryId: quotation.enquiryId,
      contractorId: { $ne: contractorId },
      isLatest: true,
      status: { $in: ['sent', 'under_review', 'revision_requested', 'accepted'] },
      ...alive,
    });
    if (others >= cap) {
      throw new ValidationError(`This enquiry already has the maximum of ${cap} quotations`);
    }
  }

  quotation.status = 'sent';
  quotation.sentAt = new Date();
  quotation.statusHistory.push({ status: 'sent', at: new Date() });
  await quotation.save();

  const enquiry = await ConstructionEnquiry.findById(quotation.enquiryId);
  if (enquiry && !['accepted', 'converted'].includes(enquiry.status)) {
    touchEnquiry(enquiry, 'quoted', `${quotation.quotationNumber} sent`);
    await enquiry.save();
  }

  // BRD C10 — the quote is in the app; tell the customer it arrived.
  contractorName(contractorId)
    .then((name) => notifyQuotationSent({
      customerId: quotation.customerId,
      contractorName: name,
      quotation: {
        id: quotation._id,
        quotationNumber: quotation.quotationNumber,
        total: quotation.total,
      },
      enquiry: { id: quotation.enquiryId },
    }))
    .catch(() => {});

  await recordAudit({
    module: 'construction',
    entityType: 'quotation',
    entityId: quotation._id,
    action: 'quotation.sent',
    after: {
      quotationNumber: quotation.quotationNumber,
      total: quotation.total,
      version: quotation.version,
      enquiryId: String(quotation.enquiryId),
    },
  });

  return quotation.toObject();
};

/**
 * BRD C12 — a revision is a NEW VERSION, never an edit.
 *
 * "Every version is kept, so both sides can see exactly what changed." The old
 * row is marked superseded and stays readable forever; the new one carries
 * version + 1 and points back at its parent.
 */
export const createRevision = async (contractorId, quotationId) => {
  const previous = await Quotation.findOne({ _id: quotationId, contractorId, ...alive });
  if (!previous) throw new ValidationError('Quotation not found');
  if (previous.status === 'accepted') {
    throw new ValidationError('An accepted quotation cannot be revised');
  }
  if (previous.status === 'draft') {
    throw new ValidationError('This quotation is still a draft — edit it directly');
  }

  const revision = await Quotation.create({
    enquiryId: previous.enquiryId,
    contractorId: previous.contractorId,
    customerId: previous.customerId,
    siteVisitId: previous.siteVisitId,
    version: previous.version + 1,
    parentQuotationId: previous._id,
    isLatest: true,
    title: previous.title,
    sections: previous.sections.map((s) => s.toObject?.() ?? s),
    taxMode: previous.taxMode,
    taxLabel: previous.taxLabel,
    taxPercent: previous.taxPercent,
    terms: previous.terms,
    exclusions: previous.exclusions,
    proposedStages: previous.proposedStages.map((s) => s.toObject?.() ?? s),
    validUntil: previous.validUntil,
    status: 'draft',
  });

  previous.isLatest = false;
  previous.status = 'superseded';
  previous.statusHistory.push({
    status: 'superseded',
    reason: `Replaced by version ${revision.version}`,
    at: new Date(),
  });
  await previous.save();

  return revision.toObject();
};

/** Answer a customer's question against the quote (BRD C12). */
export const answerQuery = async (contractorId, quotationId, queryId, answer) => {
  const quotation = await Quotation.findOne({ _id: quotationId, contractorId, ...alive });
  if (!quotation) throw new ValidationError('Quotation not found');

  const query = quotation.queries.id(queryId);
  if (!query) throw new ValidationError('Question not found');

  query.answer = String(answer || '').trim();
  query.answeredAt = new Date();
  await quotation.save();
  return quotation.toObject();
};

export const listContractorQuotations = async (contractorId, query = {}) => {
  const filter = { contractorId, ...alive };
  if (query.status) filter.status = query.status;
  if (query.enquiryId) filter.enquiryId = query.enquiryId;
  else filter.isLatest = true;

  return Quotation.find(filter)
    .populate({
      path: 'enquiryId',
      select: 'enquiryNumber site serviceId',
      populate: { path: 'serviceId', select: 'name' },
    })
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();
};

/**
 * Every quotation the customer has been sent, across all their enquiries.
 *
 * The per-enquiry compare view (BRD C11) answers "which of these three do I
 * pick"; this answers the question that comes first — "has anyone quoted me
 * yet". Without it a customer has to open each enquiry in turn to find out.
 *
 * Drafts are excluded on purpose. A contractor's unsent working copy is not
 * something the customer is entitled to see, and `isLatest` keeps a superseded
 * revision from showing up next to the one that replaced it.
 */
export const listCustomerQuotations = async (customerId, query = {}) => {
  const filter = {
    customerId,
    isLatest: true,
    status: { $in: ['sent', 'under_review', 'revision_requested', 'accepted', 'rejected', 'expired'] },
    ...alive,
  };
  if (query.status) filter.status = query.status;
  if (query.enquiryId) filter.enquiryId = query.enquiryId;

  return Quotation.find(filter)
    .populate({
      path: 'enquiryId',
      select: 'enquiryNumber site serviceId status',
      populate: { path: 'serviceId', select: 'name' },
    })
    .populate('contractorId', 'businessName contractorCode rating totalRatings profileImage')
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();
};

/** One quotation plus its full version history (BRD C12). */
export const getQuotation = async (quotationId, { contractorId, customerId } = {}) => {
  const filter = { _id: quotationId, ...alive };
  if (contractorId) filter.contractorId = contractorId;
  if (customerId) filter.customerId = customerId;

  const quotation = await Quotation.findOne(filter)
    .populate('contractorId', 'businessName contractorCode rating totalRatings completedProjects profileImage phone')
    .populate({
      path: 'enquiryId',
      select: 'enquiryNumber site description serviceId',
      populate: { path: 'serviceId', select: 'name' },
    })
    .lean();
  if (!quotation) throw new ValidationError('Quotation not found');

  const versions = await Quotation.find({
    enquiryId: quotation.enquiryId?._id || quotation.enquiryId,
    contractorId: quotation.contractorId?._id || quotation.contractorId,
    ...alive,
  })
    .select('quotationNumber version status total sentAt createdAt')
    .sort({ version: 1 })
    .lean();

  return { quotation, versions };
};

/** Expire quotations whose validity has run out. */
export const expireQuotations = async () => {
  const now = new Date();
  const result = await Quotation.updateMany(
    {
      status: { $in: ['sent', 'under_review'] },
      validUntil: { $ne: null, $lt: now },
      isDeleted: { $ne: true },
    },
    {
      $set: { status: 'expired' },
      $push: { statusHistory: { status: 'expired', reason: 'Validity period ended', at: now } },
    },
  );
  return { expired: result.modifiedCount || 0 };
};

// ---------- Templates (BRD W13) ----------

export const listTemplates = (contractorId) =>
  QuotationTemplate.find({ contractorId, ...alive })
    .populate('categoryId', 'name')
    .sort({ useCount: -1, updatedAt: -1 })
    .lean();

export const saveTemplate = async (contractorId, data) => {
  const template = await QuotationTemplate.create({ ...data, contractorId });
  return template.toObject();
};

/** Save an existing quotation as a reusable template — the common path. */
export const saveQuotationAsTemplate = async (contractorId, quotationId, name) => {
  const quotation = await Quotation.findOne({ _id: quotationId, contractorId, ...alive }).lean();
  if (!quotation) throw new ValidationError('Quotation not found');

  const template = await QuotationTemplate.create({
    contractorId,
    name: String(name || quotation.title || 'Untitled template').trim(),
    sections: (quotation.sections || []).map((s) => ({
      name: s.name,
      items: (s.items || []).map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        rate: i.rate,
        remarks: i.remarks,
      })),
    })),
    terms: quotation.terms,
    exclusions: quotation.exclusions,
    proposedStages: quotation.proposedStages || [],
  });
  return template.toObject();
};

export const deleteTemplate = async (contractorId, templateId) => {
  const template = await QuotationTemplate.findOne({ _id: templateId, contractorId, ...alive });
  if (!template) throw new ValidationError('Template not found');
  template.isDeleted = true;
  await template.save();
  return { id: String(templateId) };
};
