import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/**
 * ConstructionSettings — one document, admin-managed.
 *
 * This is what converts most of the BRD's open questions from build-blockers into
 * settings SMS Pro Venture controls. Every default below matches the recommendation
 * in the Decision Register, so shipping unchanged means shipping our advice; each
 * one can be overruled without a release.
 *
 *   Q5  multiple quotes per enquiry      → matching.allowMultipleQuotes / maxQuotesPerEnquiry
 *   Q6  what goes into a quotation       → quotation.*
 *   Q7  who sets stages and percentages  → stages.mode + guardrails
 *   Q11 site visit free or charged       → money.siteVisitCharged
 *   Q12 how GST is shown                 → quotation.taxMode / taxLabel
 *   Q13 who confirms a stage is done     → stages.stageApprovalMode + escalation
 *   Q14 mid-project scope change         → money.variationOrdersEnabled
 *   Q16 what documents to store          → documentTypes
 *   commission model                     → commission.*
 */

const LINE_ITEM_FIELDS = ['description', 'quantity', 'unit', 'rate', 'amount', 'remarks'];
const UNITS = ['sqft', 'sqm', 'rft', 'rmt', 'cuft', 'cum', 'nos', 'lumpsum', 'day'];

const tieredCommissionSchema = new mongoose.Schema(
  {
    /** Applies when project value falls in [minValue, maxValue). null max = no ceiling. */
    minValue: { type: Number, required: true, min: 0 },
    maxValue: { type: Number, default: null, min: 0 },
    value: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const constructionSettingsSchema = new mongoose.Schema(
  {
    /** Guards the singleton — only one document may ever exist. */
    key: { type: String, default: 'construction', unique: true, immutable: true },

    // ---------- Quotation (BRD C10, W10–W12 · Q6, Q12) ----------
    quotation: {
      /** Columns a contractor fills per line item. Admin-editable so the quote can be
       *  reshaped to match the client's own format without a release. */
      lineItemFields: {
        type: [String],
        enum: LINE_ITEM_FIELDS,
        default: ['description', 'quantity', 'unit', 'rate', 'amount'],
      },
      allowedUnits: { type: [String], enum: UNITS, default: UNITS },
      sectionsEnabled: { type: Boolean, default: true },
      defaultSections: {
        type: [String],
        default: ['Civil work', 'Electrical', 'Plumbing', 'Finishing'],
      },
      /** Q12 — exclusive is the construction norm; confirm with the client's CA. */
      taxMode: { type: String, enum: ['none', 'inclusive', 'exclusive'], default: 'exclusive' },
      taxLabel: { type: String, default: 'GST', trim: true },
      defaultTaxPercent: { type: Number, default: 18, min: 0, max: 100 },
      defaultValidityDays: { type: Number, default: 15, min: 1, max: 365 },
      standardTerms: { type: String, default: '', trim: true, maxlength: 5000 },
      standardExclusions: { type: String, default: '', trim: true, maxlength: 5000 },
      /** BRD W11 — nearly every dispute starts with something the customer assumed
       *  was included, so a quote may not be sent with exclusions left blank. */
      requireExclusions: { type: Boolean, default: true },
    },

    // ---------- Stages and approval (BRD C17, W12, W16 · Q7, Q13) ----------
    stages: {
      mode: {
        type: String,
        enum: ['platform_fixed', 'contractor_proposed', 'negotiated'],
        default: 'contractor_proposed',
      },
      minStages: { type: Number, default: 3, min: 1, max: 50 },
      maxStages: { type: Number, default: 12, min: 1, max: 50 },
      /** Guardrails that stop "70% on mobilisation" — the abuse the staged
       *  payment model exists to prevent. */
      maxSingleStagePercent: { type: Number, default: 40, min: 1, max: 100 },
      maxFirstStagePercent: { type: Number, default: 20, min: 1, max: 100 },
      minFinalStagePercent: { type: Number, default: 10, min: 0, max: 100 },

      /**
       * Q13 — the single most important fairness setting in the module.
       * customer_only lets a difficult customer withhold a contractor's payment
       * indefinitely, which is how a contractor network dies. The default lets the
       * customer approve first and escalates to a supervisor if they go quiet.
       */
      stageApprovalMode: {
        type: String,
        enum: ['customer_only', 'customer_or_supervisor', 'supervisor_required'],
        default: 'customer_or_supervisor',
      },
      approvalEscalationDays: { type: Number, default: 7, min: 1, max: 90 },
      /** 0 = never auto-approve. A last-resort backstop, off by default. */
      autoApproveAfterDays: { type: Number, default: 0, min: 0, max: 365 },
      /** BRD C18 — alert both sides once a stage passes its target date. */
      delayAlertAfterDays: { type: Number, default: 1, min: 0, max: 90 },
    },

    // ---------- Matching and quoting (BRD C6, C11, W6, W7 · Q4, Q5) ----------
    matching: {
      allowMultipleQuotes: { type: Boolean, default: true },
      /** Uncapped competition means contractors lose most site visits and stop
       *  responding. Three keeps comparison meaningful without burning supply. */
      maxQuotesPerEnquiry: { type: Number, default: 3, min: 1, max: 10 },
      leadDistributionMode: {
        type: String,
        enum: ['broadcast', 'shortlist', 'round_robin'],
        default: 'shortlist',
      },
      shortlistSize: { type: Number, default: 5, min: 1, max: 20 },
      /** BRD W7 — a fast decline beats a slow non-answer; reassign after this. */
      leadResponseHours: { type: Number, default: 24, min: 1, max: 336 },
    },

    // ---------- Commission (BRD §13 · the platform's revenue model) ----------
    commission: {
      model: {
        type: String,
        enum: ['percentage', 'fixed', 'per_lead', 'subscription', 'none'],
        default: 'percentage',
      },
      value: { type: Number, default: 5, min: 0 },
      tieredRules: { type: [tieredCommissionSchema], default: [] },
      chargedAt: {
        type: String,
        enum: ['on_acceptance', 'per_stage', 'on_completion'],
        default: 'per_stage',
      },
      chargedTo: {
        type: String,
        enum: ['contractor', 'customer', 'split'],
        default: 'contractor',
      },
    },

    // ---------- Money handling (BRD §13 · Q8, Q11, Q14) ----------
    money: {
      /** BRD §13 step 7 — a final portion held back after handover for defects. */
      retentionPercent: { type: Number, default: 5, min: 0, max: 25 },
      defectLiabilityDays: { type: Number, default: 90, min: 0, max: 1095 },

      /** Q11 — build the fee, ship it switched off. A charge at the site-visit step
       *  is friction at the exact moment you are still proving the platform works. */
      siteVisitCharged: { type: Boolean, default: false },
      siteVisitFee: { type: Number, default: 0, min: 0 },
      refundSiteVisitIfQuoteRejected: { type: Boolean, default: true },

      /**
       * A separate, CONTRACTOR-side fee — the minimum amount taken from their
       * wallet the moment they accept a site visit request (package flow).
       * Distinct from `siteVisitFee` above, which the customer pays. A
       * contractor with too little balance is not blocked: the wallet goes
       * negative and it nets out automatically against their next payout.
       */
      siteVisitAcceptanceFeeEnabled: { type: Boolean, default: false },
      siteVisitAcceptanceFee: { type: Number, default: 0, min: 0 },

      /** Q14 — without this the agreed price cannot legitimately change, so both
       *  sides settle scope changes off-platform and the project record stops
       *  being true. Not optional in construction. */
      variationOrdersEnabled: { type: Boolean, default: true },
    },

    // ---------- Cancellation (Q14) ----------
    cancellation: {
      customerNoticeDays: { type: Number, default: 7, min: 0, max: 90 },
      contractorNoticeDays: { type: Number, default: 15, min: 0, max: 90 },
      /** How work already done is valued when a project ends early. */
      completedWorkValuation: {
        type: String,
        enum: ['approved_stages_only', 'pro_rata_current_stage', 'admin_assessed'],
        default: 'approved_stages_only',
      },
      /** Deducted from the customer's refund when they cancel without cause. */
      customerCancellationFeePercent: { type: Number, default: 0, min: 0, max: 25 },
    },

    // ---------- Documents (BRD C19 · Q16) ----------
    documentTypes: {
      type: [String],
      default: [
        'Agreement / contract',
        'Approved drawings',
        'Government approvals & permits',
        'Structural certificates',
        'Material bills',
        'Completion certificate',
        'Warranty documents',
        'Site photographs',
      ],
    },

    updatedBy: { type: actionPerformerSchema, default: null },
  },
  {
    collection: 'construction_settings',
    timestamps: true,
    minimize: false,
  },
);

/** Guardrails must be internally consistent, or a valid stage plan becomes impossible. */
constructionSettingsSchema.pre('validate', function checkCoherence(next) {
  const s = this.stages || {};
  if (Number(s.minStages) > Number(s.maxStages)) {
    return next(new Error('Minimum stages cannot exceed maximum stages'));
  }
  // With N stages, at least one must carry 100/N percent. If the cap sits below
  // that, no plan can ever satisfy it and every quote would be rejected.
  const minStages = Number(s.minStages) || 1;
  const smallestPossibleMax = 100 / minStages;
  if (Number(s.maxSingleStagePercent) < smallestPossibleMax) {
    return next(new Error(
      `With a minimum of ${minStages} stages, no single stage can be capped below `
      + `${smallestPossibleMax.toFixed(1)}% — the plan would be impossible to satisfy.`,
    ));
  }
  const m = this.money || {};
  if (m.siteVisitCharged && !(Number(m.siteVisitFee) > 0)) {
    return next(new Error('Set a site visit fee greater than 0, or switch the charge off'));
  }
  if (m.siteVisitAcceptanceFeeEnabled && !(Number(m.siteVisitAcceptanceFee) > 0)) {
    return next(new Error('Set a site visit acceptance fee greater than 0, or switch the charge off'));
  }
  next();
});

export const ConstructionSettings = mongoose.models.ConstructionSettings
  || mongoose.model(
    'ConstructionSettings',
    constructionSettingsSchema,
    'construction_settings',
  );

export const CONSTRUCTION_LINE_ITEM_FIELDS = LINE_ITEM_FIELDS;
export const CONSTRUCTION_UNITS = UNITS;
