import mongoose from 'mongoose';
import { Counter } from '../../../core/models/counter.model.js';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/**
 * ConstructionProject — the long-lived aggregate (BRD steps 9–16, C14, W14).
 *
 * Created once both sides have committed — the customer accepted a price and
 * the contractor confirmed they will do the work — which is where "the agreed
 * price and scope are locked". That handshake happens via one of two entirely
 * separate pipelines, so a project is sourced from EITHER (never both):
 *
 *   - `quotationId` — the enquiry pipeline: a contractor-built, itemised
 *     `Quotation` with its own staged payment plan
 *     (`quotation.service.js#confirmQuotationByContractor`).
 *   - `packageRequestId` — the package/site-visit pipeline: the office's
 *     fixed-price `contract` on a `PackageRequest`, which has no staged plan
 *     of its own — see `project.service.js#createProjectFromPackageContract`,
 *     which synthesises an advance/balance split (or a single stage).
 *
 * Everything commercial is SNAPSHOTTED here rather than read live from
 * settings or from the source document:
 *
 *   - `agreedValue` is frozen at acceptance. If the quotation were later revised
 *     or the settings changed, a project already under way must not silently
 *     re-price itself.
 *   - `retentionPercent`, `defectLiabilityDays` and the commission terms are
 *     copied in at creation for the same reason. A customer who signed up to 5%
 *     retention keeps 5% even if the platform later changes its default.
 *
 * Money totals here are a CACHE of the escrow ledger. `wallet_hold_ledger` is
 * the source of truth, and `reconcileProjectMoney()` recomputes from it.
 */
const PROJECT_STATUSES = [
  'awaiting_funding',   // created; customer has not put money in yet
  'active',             // funded, work under way
  'on_hold',            // admin intervention (BRD A6)
  'stages_complete',    // every stage approved and paid
  'handover_pending',   // final confirmation from the customer
  'completed',          // handed over; retention may still be held
  'closed',             // retention released, defect period over
  'cancelled',
];

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: PROJECT_STATUSES, required: true },
    reason: { type: String, trim: true, default: '' },
    at: { type: Date, default: Date.now },
    by: { type: actionPerformerSchema, default: null },
  },
  { _id: false },
);

/**
 * BRD §5 — enterprise customers may have several staff on one project with
 * different permissions ("a site engineer can see progress but only the finance
 * head can approve a payment"). Present from day one so switching it on later
 * needs no migration; a normal project simply has one owner participant.
 */
const participantSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodUser', required: true },
    role: { type: String, enum: ['owner', 'viewer', 'approver'], default: 'owner' },
    canApproveStages: { type: Boolean, default: true },
    canApprovePayments: { type: Boolean, default: true },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const constructionProjectSchema = new mongoose.Schema(
  {
    projectNumber: { type: String, unique: true, sparse: true, trim: true },

    // Exactly one of (enquiryId + quotationId) or (packageRequestId) is set — see the
    // doc comment above. `sparse` lets the unset side stay null across many rows
    // without tripping the unique index (a plain unique index treats every `null`
    // as the same value and would allow only one such project ever).
    enquiryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConstructionEnquiry',
      default: null,
      index: true,
    },
    quotationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quotation',
      default: null,
      unique: true,
      sparse: true,
    },
    packageRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PackageRequest',
      default: null,
      unique: true,
      sparse: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodUser',
      required: true,
      index: true,
    },
    contractorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContractorProfile',
      required: true,
      index: true,
    },
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'ConstructionService', default: null },

    title: { type: String, trim: true, default: '', maxlength: 200 },

    /** Frozen at acceptance — the whole escrow invariant is measured against it. */
    agreedValue: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },

    // ---------- Money (cache of wallet_hold_ledger) ----------
    holdId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletHold', default: null, index: true },
    fundedAmount: { type: Number, default: 0, min: 0 },
    releasedAmount: { type: Number, default: 0, min: 0 },
    refundedAmount: { type: Number, default: 0, min: 0 },

    /** Snapshotted from settings at creation — see the note at the top. */
    retentionPercent: { type: Number, default: 0, min: 0, max: 25 },
    defectLiabilityDays: { type: Number, default: 0, min: 0 },
    retentionReleasedAt: { type: Date, default: null },
    commission: {
      model: { type: String, default: 'percentage' },
      value: { type: Number, default: 0 },
      chargedAt: { type: String, default: 'per_stage' },
      chargedTo: { type: String, default: 'contractor' },
      collectedAmount: { type: Number, default: 0, min: 0 },
    },

    status: {
      type: String,
      enum: PROJECT_STATUSES,
      default: 'awaiting_funding',
      index: true,
    },
    statusHistory: { type: [statusHistorySchema], default: [] },

    /**
     * BRD A6 — every time the contractor was changed, and why.
     *
     * Kept on the project rather than only in the audit log because it changes
     * how the record reads: money released before a handover was earned by a
     * different firm, and anyone looking at this project later needs to see that
     * without cross-referencing an audit trail.
     */
    reassignmentHistory: {
      type: [new mongoose.Schema({
        fromContractorId: { type: mongoose.Schema.Types.ObjectId, ref: 'ContractorProfile' },
        toContractorId: { type: mongoose.Schema.Types.ObjectId, ref: 'ContractorProfile' },
        reason: { type: String, trim: true, default: '', maxlength: 1000 },
        stagesTransferred: { type: Number, default: 0, min: 0 },
        at: { type: Date, default: Date.now },
        by: { type: actionPerformerSchema, default: null },
      }, { _id: false })],
      default: [],
    },

    /** BRD A6 — admin can put a project on hold; the reason is on the record. */
    onHoldReason: { type: String, trim: true, default: '' },
    cancelledReason: { type: String, trim: true, default: '' },

    participants: { type: [participantSchema], default: [] },

    startedAt: { type: Date, default: null },
    expectedCompletionAt: { type: Date, default: null },
    stagesCompletedAt: { type: Date, default: null },
    handedOverAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },

    /** BRD C23 — the customer's rating, which feeds the contractor's score. */
    rating: { type: Number, default: null, min: 1, max: 5 },
    review: { type: String, trim: true, default: '', maxlength: 2000 },
    ratedAt: { type: Date, default: null },

    lastActivityAt: { type: Date, default: Date.now, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  {
    collection: 'construction_projects',
    timestamps: true,
  },
);

constructionProjectSchema.index({ customerId: 1, status: 1, createdAt: -1 });
constructionProjectSchema.index({ contractorId: 1, status: 1, createdAt: -1 });
constructionProjectSchema.index({ status: 1, lastActivityAt: -1 });

/** Money still held against this project. */
constructionProjectSchema.virtual('heldAmount').get(function held() {
  return Math.round((
    (Number(this.fundedAmount) || 0)
    - (Number(this.releasedAmount) || 0)
    - (Number(this.refundedAmount) || 0)
  ) * 100) / 100;
});

/** What the customer still needs to put in to cover the agreed price. */
constructionProjectSchema.virtual('outstandingToFund').get(function outstanding() {
  return Math.round((
    (Number(this.agreedValue) || 0) - (Number(this.fundedAmount) || 0)
  ) * 100) / 100;
});

constructionProjectSchema.set('toObject', { virtuals: true });
constructionProjectSchema.set('toJSON', { virtuals: true });

constructionProjectSchema.pre('validate', function checkSource(next) {
  const fromQuotation = Boolean(this.quotationId);
  const fromPackage = Boolean(this.packageRequestId);
  if (fromQuotation === fromPackage) {
    return next(new Error(
      'A project must be created from exactly one source — either a quotation or a package request contract',
    ));
  }
  if (fromQuotation && !this.enquiryId) {
    return next(new Error('A quotation-sourced project must also carry its enquiryId'));
  }
  next();
});

constructionProjectSchema.pre('validate', function checkMoney(next) {
  const funded = Number(this.fundedAmount) || 0;
  const released = Number(this.releasedAmount) || 0;
  const refunded = Number(this.refundedAmount) || 0;

  // Paying out more than was ever put in is the one thing that must never
  // happen. The ledger enforces it too; this is the second lock on the door.
  if (Math.round((released + refunded) * 100) / 100 > Math.round(funded * 100) / 100) {
    return next(new Error(
      `Project money is inconsistent: released ${released} + refunded ${refunded} exceeds funded ${funded}`,
    ));
  }
  if (Math.round(funded * 100) / 100 > Math.round((Number(this.agreedValue) || 0) * 100) / 100) {
    return next(new Error('Funded amount cannot exceed the agreed project value'));
  }
  next();
});

constructionProjectSchema.pre('save', async function assignNumber(next) {
  if (!this.isNew || this.projectNumber) return next();
  try {
    const counter = await Counter.findOneAndUpdate(
      { model: 'ConstructionProject' },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    );
    this.projectNumber = `PRJ${String(counter.seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

export const ConstructionProject = mongoose.models.ConstructionProject
  || mongoose.model('ConstructionProject', constructionProjectSchema, 'construction_projects');

export const PROJECT_STATUS_VALUES = PROJECT_STATUSES;
