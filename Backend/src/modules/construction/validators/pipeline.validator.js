import { z } from 'zod';
import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';
import { ENQUIRY_URGENCY_VALUES, ENQUIRY_SITE_CONDITIONS } from '../models/constructionEnquiry.model.js';
import { LEAD_DECLINE_REASONS } from '../models/contractorLead.model.js';
import { CONSTRUCTION_UNITS } from '../models/constructionSettings.model.js';

const objectId = z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), 'Invalid id');
const optionalText = (max) => z.string().max(max).optional().or(z.literal(''));

const firstIssue = (result) => {
  const issue = result.error.errors[0];
  const where = issue.path.length ? `${issue.path.join('.')}: ` : '';
  return `${where}${issue.message}`;
};

export const validateObjectId = (value, label = 'id') => {
  const id = String(value || '').trim();
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new ValidationError(`Invalid ${label}`);
  }
  return id;
};

// ---------- Enquiry (BRD C3, C4) ----------

const enquirySchema = z.object({
  serviceId: objectId,
  budgetServiceId: objectId.nullish(),
  description: optionalText(3000),
  site: z.object({
    addressLine: optionalText(300),
    area: optionalText(160),
    city: z.string().min(1, 'Which city is the site in?').max(120),
    state: optionalText(120),
    pincode: optionalText(12),
    landmark: optionalText(200),
    coordinates: z.array(z.number()).length(2).optional(),
    plotArea: z.coerce.number().min(0).nullable().optional(),
    builtUpArea: z.coerce.number().min(0).nullable().optional(),
    areaUnit: z.enum(['sqft', 'sqm', 'sqyd', '']).optional(),
    floors: z.coerce.number().int().min(0).max(200).nullable().optional(),
    currentCondition: z.enum([...ENQUIRY_SITE_CONDITIONS, '']).optional(),
  }),
  budgetMin: z.coerce.number().min(0).nullable().optional(),
  budgetMax: z.coerce.number().min(0).nullable().optional(),
  urgency: z.enum(ENQUIRY_URGENCY_VALUES).optional(),
  preferredStartDate: z.string().datetime().nullable().optional().or(z.literal('')),
  attachments: z.array(z.object({
    url: z.string().min(1).max(1000),
    kind: z.enum(['site_photo', 'drawing', 'reference', 'other']).optional(),
    caption: optionalText(200),
  })).max(20).optional(),
});

export const validateEnquiryDto = (body = {}) => {
  const result = enquirySchema.safeParse(body);
  if (!result.success) throw new ValidationError(firstIssue(result));
  const d = result.data;

  if (d.budgetMin != null && d.budgetMax != null && Number(d.budgetMax) < Number(d.budgetMin)) {
    throw new ValidationError('Maximum budget cannot be less than the minimum');
  }

  const site = { ...d.site };
  const coordinates = site.coordinates;
  delete site.coordinates;
  if (coordinates) site.location = { type: 'Point', coordinates };

  return {
    serviceId: d.serviceId,
    budgetServiceId: d.budgetServiceId || null,
    description: d.description?.trim() || '',
    site,
    budgetMin: d.budgetMin ?? null,
    budgetMax: d.budgetMax ?? null,
    urgency: d.urgency || 'flexible',
    preferredStartDate: d.preferredStartDate ? new Date(d.preferredStartDate) : null,
    attachments: (d.attachments || []).map((a) => ({
      url: a.url.trim(),
      kind: a.kind || 'site_photo',
      caption: a.caption?.trim() || '',
    })),
  };
};

// ---------- Leads (BRD W7) ----------

export const validateDeclineDto = (body = {}) => {
  const schema = z.object({
    reason: z.enum(LEAD_DECLINE_REASONS).optional(),
    note: optionalText(500),
  });
  const result = schema.safeParse(body);
  if (!result.success) throw new ValidationError(firstIssue(result));
  return { reason: result.data.reason || 'other', note: result.data.note?.trim() || '' };
};

// ---------- Site visits (BRD C9, W8, W9) ----------

export const validateProposeVisitDto = (body = {}) => {
  const schema = z.object({
    enquiryId: objectId,
    contractorId: objectId.optional(),
    scheduledAt: z.string().min(1, 'Pick a date and time'),
  });
  const result = schema.safeParse(body);
  if (!result.success) throw new ValidationError(firstIssue(result));
  return result.data;
};

export const validateVisitReportDto = (body = {}) => {
  const schema = z.object({
    report: z.object({
      measurements: optionalText(2000),
      siteCondition: optionalText(2000),
      access: z.enum(['easy', 'moderate', 'difficult', '']).optional(),
      waterAvailable: z.boolean().nullable().optional(),
      electricityAvailable: z.boolean().nullable().optional(),
      observations: optionalText(3000),
      photos: z.array(z.string().min(1).max(1000)).max(30).optional(),
    }),
    checkIn: z.object({
      coordinates: z.array(z.number()).length(2),
    }).optional(),
  });
  const result = schema.safeParse(body);
  if (!result.success) throw new ValidationError(firstIssue(result));

  const r = result.data.report;
  // A completed visit with an empty report is worthless — the quote depends on it.
  if (!String(r.measurements || '').trim() && !String(r.observations || '').trim()) {
    throw new ValidationError('Record measurements or observations before completing the visit');
  }

  return {
    report: {
      measurements: r.measurements?.trim() || '',
      siteCondition: r.siteCondition?.trim() || '',
      access: r.access || '',
      waterAvailable: r.waterAvailable ?? null,
      electricityAvailable: r.electricityAvailable ?? null,
      observations: r.observations?.trim() || '',
      photos: (r.photos || []).map((p) => p.trim()).filter(Boolean),
    },
    checkIn: result.data.checkIn || null,
  };
};

// ---------- Quotations (BRD W10–W12) ----------

const lineItemSchema = z.object({
  description: z.string().min(1, 'Every line needs a description').max(500),
  quantity: z.coerce.number().min(0),
  unit: z.enum([...CONSTRUCTION_UNITS, '']).optional(),
  rate: z.coerce.number().min(0),
  remarks: optionalText(300),
});

const sectionSchema = z.object({
  name: z.string().min(1, 'Every section needs a name').max(120),
  items: z.array(lineItemSchema).max(200).optional(),
});

const stageSchema = z.object({
  name: z.string().min(1, 'Every stage needs a name').max(160),
  description: optionalText(500),
  percentage: z.coerce.number().min(0).max(100),
  targetDays: z.coerce.number().int().min(0).nullable().optional(),
});

const quotationBodySchema = z.object({
  title: optionalText(200),
  sections: z.array(sectionSchema).max(30).optional(),
  taxMode: z.enum(['none', 'inclusive', 'exclusive']).optional(),
  taxLabel: optionalText(40),
  taxPercent: z.coerce.number().min(0).max(100).optional(),
  terms: optionalText(5000),
  exclusions: optionalText(5000),
  proposedStages: z.array(stageSchema).max(50).optional(),
  validUntil: z.string().datetime().nullable().optional().or(z.literal('')),
});

export const validateQuotationUpdateDto = (body = {}) => {
  const result = quotationBodySchema.safeParse(body);
  if (!result.success) throw new ValidationError(firstIssue(result));
  const d = result.data;

  const out = {};
  if (d.title !== undefined) out.title = d.title.trim();
  if (d.sections !== undefined) {
    out.sections = d.sections.map((s) => ({
      name: s.name.trim(),
      items: (s.items || []).map((i) => ({
        description: i.description.trim(),
        quantity: i.quantity,
        unit: i.unit || '',
        rate: i.rate,
        remarks: i.remarks?.trim() || '',
        // amount is deliberately NOT taken from the client — the model computes
        // it from quantity × rate on every save.
      })),
    }));
  }
  if (d.taxMode !== undefined) out.taxMode = d.taxMode;
  if (d.taxLabel !== undefined) out.taxLabel = d.taxLabel.trim() || 'GST';
  if (d.taxPercent !== undefined) out.taxPercent = d.taxPercent;
  if (d.terms !== undefined) out.terms = d.terms.trim();
  if (d.exclusions !== undefined) out.exclusions = d.exclusions.trim();
  if (d.proposedStages !== undefined) {
    out.proposedStages = d.proposedStages.map((s) => ({
      name: s.name.trim(),
      description: s.description?.trim() || '',
      percentage: s.percentage,
      targetDays: s.targetDays ?? null,
    }));
  }
  if (d.validUntil !== undefined) {
    out.validUntil = d.validUntil ? new Date(d.validUntil) : null;
  }
  return out;
};

export const validateCreateDraftDto = (body = {}) => {
  const schema = z.object({
    enquiryId: objectId,
    templateId: objectId.optional(),
    title: optionalText(200),
  });
  const result = schema.safeParse(body);
  if (!result.success) throw new ValidationError(firstIssue(result));
  return result.data;
};

export const validateTemplateDto = (body = {}) => {
  const schema = z.object({
    name: z.string().min(1, 'Give the template a name').max(160),
    categoryId: objectId.nullable().optional(),
    sections: z.array(sectionSchema).max(30).optional(),
    terms: optionalText(5000),
    exclusions: optionalText(5000),
    proposedStages: z.array(stageSchema).max(50).optional(),
  });
  const result = schema.safeParse(body);
  if (!result.success) throw new ValidationError(firstIssue(result));
  const d = result.data;
  return {
    name: d.name.trim(),
    categoryId: d.categoryId || null,
    sections: (d.sections || []).map((s) => ({
      name: s.name.trim(),
      items: (s.items || []).map((i) => ({
        description: i.description.trim(),
        quantity: i.quantity,
        unit: i.unit || '',
        rate: i.rate,
        remarks: i.remarks?.trim() || '',
      })),
    })),
    terms: d.terms?.trim() || '',
    exclusions: d.exclusions?.trim() || '',
    proposedStages: (d.proposedStages || []).map((s) => ({
      name: s.name.trim(),
      description: s.description?.trim() || '',
      percentage: s.percentage,
      targetDays: s.targetDays ?? null,
    })),
  };
};

export const validateReasonDto = (body = {}, { required = true, label = 'reason' } = {}) => {
  const value = String(body?.reason ?? body?.note ?? '').trim();
  if (required && !value) throw new ValidationError(`Please give a ${label}`);
  if (value.length > 2000) throw new ValidationError('That is too long');
  return value;
};

export const validateQuestionDto = (body = {}) => {
  const value = String(body?.question || '').trim();
  if (!value) throw new ValidationError('Type your question');
  if (value.length > 1000) throw new ValidationError('That question is too long');
  return value;
};
