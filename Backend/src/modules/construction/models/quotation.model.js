import mongoose from 'mongoose';
import { Counter } from '../../../core/models/counter.model.js';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/**
 * Quotation — the module's headline feature (BRD C10–C13, W10–W12).
 *
 * "Replaces the number-over-the-phone with something the customer can actually
 * study, save and refer back to."
 *
 * Revisions are NEW ROWS, never edits. BRD C12 requires that "every version is
 * kept, so both sides can see exactly what changed" — an in-place edit would
 * destroy exactly the record that settles a later argument. `parentQuotationId`
 * chains versions together and `isLatest` marks the live one.
 *
 * Money is recomputed server-side on every save. A client-supplied `amount` or
 * `total` is never trusted: this document becomes a binding agreement the moment
 * it is accepted.
 */
const QUOTATION_STATUSES = [
  'draft',
  'sent',
  'under_review',
  'revision_requested',
  'superseded',   // replaced by a newer version
  'accepted',
  'rejected',
  'expired',
  'withdrawn',
];

const lineItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true, maxlength: 500 },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, trim: true, default: '' },
    rate: { type: Number, required: true, min: 0 },
    /** Always quantity × rate, recomputed on save. Never taken from the client. */
    amount: { type: Number, default: 0, min: 0 },
    remarks: { type: String, trim: true, default: '', maxlength: 300 },
  },
  { _id: false },
);

const sectionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    items: { type: [lineItemSchema], default: [] },
    /** Sum of this section's items — makes a long quote readable (BRD W10). */
    subtotal: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

/** BRD W12 — the payment plan both sides agree before any work begins. */
const proposedStageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, default: '', maxlength: 500 },
    percentage: { type: Number, required: true, min: 0, max: 100 },
    /** Working days from project start. */
    targetDays: { type: Number, default: null, min: 0 },
  },
  { _id: false },
);

/** BRD C12 — questions asked against the quote, kept with it. */
const querySchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true, maxlength: 1000 },
    askedAt: { type: Date, default: Date.now },
    answer: { type: String, trim: true, default: '', maxlength: 2000 },
    answeredAt: { type: Date, default: null },
  },
  { _id: true },
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: QUOTATION_STATUSES, required: true },
    reason: { type: String, trim: true, default: '' },
    at: { type: Date, default: Date.now },
    by: { type: actionPerformerSchema, default: null },
  },
  { _id: false },
);

const quotationSchema = new mongoose.Schema(
  {
    quotationNumber: { type: String, unique: true, sparse: true, trim: true },

    enquiryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConstructionEnquiry',
      required: true,
      index: true,
    },
    contractorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContractorProfile',
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodUser',
      required: true,
      index: true,
    },
    siteVisitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SiteVisit',
      default: null,
    },

    // ---------- Versioning (BRD C12) ----------
    version: { type: Number, default: 1, min: 1 },
    parentQuotationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quotation',
      default: null,
      index: true,
    },
    /** Exactly one version per contractor per enquiry carries this. */
    isLatest: { type: Boolean, default: true, index: true },

    // ---------- The quote itself (BRD W10) ----------
    title: { type: String, trim: true, default: '', maxlength: 200 },
    sections: { type: [sectionSchema], default: [] },

    subtotal: { type: Number, default: 0, min: 0 },
    taxMode: { type: String, enum: ['none', 'inclusive', 'exclusive'], default: 'exclusive' },
    taxLabel: { type: String, trim: true, default: 'GST' },
    taxPercent: { type: Number, default: 0, min: 0, max: 100 },
    taxAmount: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0, min: 0 },

    // ---------- BRD W11 ----------
    terms: { type: String, trim: true, default: '', maxlength: 5000 },
    exclusions: { type: String, trim: true, default: '', maxlength: 5000 },

    proposedStages: { type: [proposedStageSchema], default: [] },

    /** BRD C10 — "how long the price is valid". */
    validUntil: { type: Date, default: null, index: true },

    status: { type: String, enum: QUOTATION_STATUSES, default: 'draft', index: true },
    statusHistory: { type: [statusHistorySchema], default: [] },

    sentAt: { type: Date, default: null },
    acceptedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    /** BRD C13 — "rejecting asks for a brief reason, which helps improve future matching". */
    rejectionReason: { type: String, trim: true, default: '' },
    revisionRequest: { type: String, trim: true, default: '', maxlength: 2000 },

    queries: { type: [querySchema], default: [] },

    isDeleted: { type: Boolean, default: false, index: true },
  },
  {
    collection: 'construction_quotations',
    timestamps: true,
  },
);

quotationSchema.index({ enquiryId: 1, isLatest: 1, status: 1 });
quotationSchema.index({ contractorId: 1, status: 1, createdAt: -1 });
quotationSchema.index({ customerId: 1, status: 1, createdAt: -1 });
quotationSchema.index({ status: 1, validUntil: 1 });

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Recompute every monetary field from the line items.
 *
 * Runs on every save so the stored totals can never disagree with the items a
 * customer is looking at — this document becomes binding on acceptance.
 */
quotationSchema.pre('validate', function recomputeTotals(next) {
  let subtotal = 0;
  for (const section of this.sections || []) {
    let sectionTotal = 0;
    for (const item of section.items || []) {
      item.amount = round2((Number(item.quantity) || 0) * (Number(item.rate) || 0));
      sectionTotal += item.amount;
    }
    section.subtotal = round2(sectionTotal);
    subtotal += section.subtotal;
  }
  this.subtotal = round2(subtotal);

  const percent = Number(this.taxPercent) || 0;
  if (this.taxMode === 'exclusive') {
    this.taxAmount = round2(this.subtotal * (percent / 100));
    this.total = round2(this.subtotal + this.taxAmount);
  } else if (this.taxMode === 'inclusive') {
    // The subtotal already contains tax; show how much of it that is.
    this.taxAmount = round2(this.subtotal - this.subtotal / (1 + percent / 100));
    this.total = this.subtotal;
  } else {
    this.taxAmount = 0;
    this.total = this.subtotal;
  }

  // A stage plan that does not total 100% would under- or over-collect against
  // the agreed price — the invariant Phase 0's escrow ledger depends on.
  const stages = this.proposedStages || [];
  if (stages.length) {
    const stageTotal = round2(stages.reduce((sum, s) => sum + (Number(s.percentage) || 0), 0));
    if (stageTotal !== 100) {
      return next(new Error(`Payment stages must total 100% — they currently total ${stageTotal}%`));
    }
  }

  next();
});

quotationSchema.pre('save', async function assignNumber(next) {
  if (!this.isNew || this.quotationNumber) return next();
  try {
    const counter = await Counter.findOneAndUpdate(
      { model: 'Quotation' },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    );
    this.quotationNumber = `QUO${String(counter.seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

export const Quotation = mongoose.models.Quotation
  || mongoose.model('Quotation', quotationSchema, 'construction_quotations');

export const QUOTATION_STATUS_VALUES = QUOTATION_STATUSES;
