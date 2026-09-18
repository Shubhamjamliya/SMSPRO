import { z } from 'zod';
import { ValidationError } from '../../../core/auth/errors.js';
import {
  CONSTRUCTION_LINE_ITEM_FIELDS,
  CONSTRUCTION_UNITS,
} from '../models/constructionSettings.model.js';

/**
 * Settings are updated section by section — the admin UI saves one card at a time,
 * and a partial payload must never blank out a section it did not send.
 */
const quotationSchema = z.object({
  lineItemFields: z.array(z.enum(CONSTRUCTION_LINE_ITEM_FIELDS)).min(1).max(6).optional(),
  allowedUnits: z.array(z.enum(CONSTRUCTION_UNITS)).min(1).optional(),
  sectionsEnabled: z.boolean().optional(),
  defaultSections: z.array(z.string().max(80)).max(20).optional(),
  taxMode: z.enum(['none', 'inclusive', 'exclusive']).optional(),
  taxLabel: z.string().max(40).optional(),
  defaultTaxPercent: z.coerce.number().min(0).max(100).optional(),
  defaultValidityDays: z.coerce.number().int().min(1).max(365).optional(),
  standardTerms: z.string().max(5000).optional(),
  standardExclusions: z.string().max(5000).optional(),
  requireExclusions: z.boolean().optional(),
});

const stagesSchema = z.object({
  mode: z.enum(['platform_fixed', 'contractor_proposed', 'negotiated']).optional(),
  minStages: z.coerce.number().int().min(1).max(50).optional(),
  maxStages: z.coerce.number().int().min(1).max(50).optional(),
  maxSingleStagePercent: z.coerce.number().min(1).max(100).optional(),
  maxFirstStagePercent: z.coerce.number().min(1).max(100).optional(),
  minFinalStagePercent: z.coerce.number().min(0).max(100).optional(),
  stageApprovalMode: z
    .enum(['customer_only', 'customer_or_supervisor', 'supervisor_required'])
    .optional(),
  approvalEscalationDays: z.coerce.number().int().min(1).max(90).optional(),
  autoApproveAfterDays: z.coerce.number().int().min(0).max(365).optional(),
  delayAlertAfterDays: z.coerce.number().int().min(0).max(90).optional(),
});

const matchingSchema = z.object({
  allowMultipleQuotes: z.boolean().optional(),
  maxQuotesPerEnquiry: z.coerce.number().int().min(1).max(10).optional(),
  leadDistributionMode: z.enum(['broadcast', 'shortlist', 'round_robin']).optional(),
  shortlistSize: z.coerce.number().int().min(1).max(20).optional(),
  leadResponseHours: z.coerce.number().int().min(1).max(336).optional(),
});

const commissionSchema = z.object({
  model: z.enum(['percentage', 'fixed', 'per_lead', 'subscription', 'none']).optional(),
  value: z.coerce.number().min(0).optional(),
  tieredRules: z.array(z.object({
    minValue: z.coerce.number().min(0),
    maxValue: z.coerce.number().min(0).nullable().optional(),
    value: z.coerce.number().min(0),
  })).max(10).optional(),
  chargedAt: z.enum(['on_acceptance', 'per_stage', 'on_completion']).optional(),
  chargedTo: z.enum(['contractor', 'customer', 'split']).optional(),
});

const moneySchema = z.object({
  retentionPercent: z.coerce.number().min(0).max(25).optional(),
  defectLiabilityDays: z.coerce.number().int().min(0).max(1095).optional(),
  siteVisitCharged: z.boolean().optional(),
  siteVisitFee: z.coerce.number().min(0).optional(),
  refundSiteVisitIfQuoteRejected: z.boolean().optional(),
  variationOrdersEnabled: z.boolean().optional(),
});

const cancellationSchema = z.object({
  customerNoticeDays: z.coerce.number().int().min(0).max(90).optional(),
  contractorNoticeDays: z.coerce.number().int().min(0).max(90).optional(),
  completedWorkValuation: z
    .enum(['approved_stages_only', 'pro_rata_current_stage', 'admin_assessed'])
    .optional(),
  customerCancellationFeePercent: z.coerce.number().min(0).max(25).optional(),
});

const settingsSchema = z.object({
  quotation: quotationSchema.optional(),
  stages: stagesSchema.optional(),
  matching: matchingSchema.optional(),
  commission: commissionSchema.optional(),
  money: moneySchema.optional(),
  cancellation: cancellationSchema.optional(),
  documentTypes: z.array(z.string().max(120)).max(40).optional(),
});

const trimList = (values, max) => (values || [])
  .map((v) => String(v || '').trim())
  .filter(Boolean)
  .slice(0, max);

export const validateUpdateSettingsDto = (body = {}) => {
  const result = settingsSchema.safeParse(body);
  if (!result.success) {
    const issue = result.error.errors[0];
    const where = issue.path.length ? `${issue.path.join('.')}: ` : '';
    throw new ValidationError(`${where}${issue.message}`);
  }
  const data = result.data;

  if (data.quotation?.defaultSections !== undefined) {
    data.quotation.defaultSections = trimList(data.quotation.defaultSections, 20);
  }
  if (data.quotation?.taxLabel !== undefined) {
    data.quotation.taxLabel = data.quotation.taxLabel.trim() || 'GST';
  }
  if (data.documentTypes !== undefined) {
    data.documentTypes = trimList(data.documentTypes, 40);
  }

  // Tiered commission bands must not overlap, or the rate applied to a project
  // depends on which band happened to be checked first.
  const tiers = data.commission?.tieredRules;
  if (tiers?.length) {
    const sorted = [...tiers].sort((a, b) => a.minValue - b.minValue);
    for (let i = 0; i < sorted.length; i += 1) {
      const current = sorted[i];
      if (current.maxValue != null && current.maxValue <= current.minValue) {
        throw new ValidationError(
          `Commission band starting at ${current.minValue} must end above where it starts`,
        );
      }
      const next = sorted[i + 1];
      if (next && current.maxValue != null && next.minValue < current.maxValue) {
        throw new ValidationError(
          `Commission bands overlap around ${next.minValue} — each project value must match exactly one band`,
        );
      }
      if (next && current.maxValue == null) {
        throw new ValidationError(
          'Only the highest commission band may be left open-ended',
        );
      }
    }
    data.commission.tieredRules = sorted;
  }

  return data;
};
