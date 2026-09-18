import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/**
 * ProjectDispute — what happens when the two sides disagree (BRD open question 15).
 *
 * The BRD leaves this open and says: "There is no dispute process anywhere in
 * the platform today. With projects worth lakhs, we strongly recommend building
 * one." This is that recommendation, kept deliberately small.
 *
 * THE SHAPE
 * Either side raises a dispute against a stage. That stage freezes — it cannot
 * be approved, and its money cannot be released. Support reviews the evidence
 * already on the project (submissions, photographs, messages, documents) and
 * resolves it one of four ways: release to the contractor, refund to the
 * customer, split between them, or dismiss and let the stage carry on.
 *
 * WHAT IT IS NOT
 * Not arbitration. No appeal tiers, no panels, no deadlines that auto-decide.
 * One review step by the platform team covers almost every real case, and each
 * extra tier is a screen nobody uses and a promise nobody can keep.
 *
 * WHY FREEZING IS SAFE
 * The freeze needs no new money mechanism. `approveStage` is the only path that
 * turns held money into contractor money, and it refuses a stage whose status is
 * not `submitted_for_approval` or `approved`. Setting the stage to `disputed`
 * therefore blocks release using machinery that already exists and is already
 * tested — the customer's money simply stays held where it was.
 *
 * `preDisputeStatus` is what makes the freeze reversible: dismissing a dispute
 * has to put the stage back exactly where it was, and reconstructing that from
 * status history is guesswork.
 */
const DISPUTE_STATUSES = [
  'open',            // raised, nobody from support has picked it up
  'under_review',    // support is looking at it
  'resolved',        // decided, and any money movement has happened
  'withdrawn',       // the party who raised it backed out
];

const DISPUTE_OUTCOMES = [
  '',                     // not resolved yet
  'released_to_contractor',
  'refunded_to_customer',
  'split',
  'dismissed',            // no money moved; the stage resumes
];

const timelineEntrySchema = new mongoose.Schema(
  {
    action: { type: String, required: true, trim: true, maxlength: 60 },
    note: { type: String, default: '', trim: true, maxlength: 2000 },
    byType: {
      type: String,
      enum: ['CUSTOMER', 'CONTRACTOR', 'ADMIN', 'SYSTEM'],
      required: true,
    },
    by: { type: actionPerformerSchema, default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const projectDisputeSchema = new mongoose.Schema(
  {
    disputeNumber: { type: String, trim: true, index: true },

    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConstructionProject',
      required: true,
      index: true,
    },
    /**
     * The stage in dispute. Optional: a customer can dispute the project as a
     * whole ("nobody has been on site for three weeks"), which freezes nothing
     * by itself but still needs a record and a response.
     */
    stageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProjectStage',
      default: null,
      index: true,
    },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodUser', required: true, index: true },
    contractorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContractorProfile',
      required: true,
      index: true,
    },

    raisedByType: { type: String, enum: ['CUSTOMER', 'CONTRACTOR'], required: true },
    raisedBy: { type: actionPerformerSchema, default: null },

    reason: {
      type: String,
      enum: [
        'work_quality',
        'work_incomplete',
        'delay',
        'scope_disagreement',
        'payment_withheld',
        'materials',
        'site_access',
        'other',
      ],
      required: true,
    },
    description: { type: String, required: true, trim: true, maxlength: 4000 },
    /** Photographs or papers the raising party wants considered. */
    evidence: { type: [String], default: [] },

    status: { type: String, enum: DISPUTE_STATUSES, default: 'open', index: true },

    /**
     * The money this dispute is holding up, snapshotted when it was raised.
     *
     * Snapshotted rather than read live, because the resolution has to be judged
     * against the amount that was actually frozen. If settings or the stage
     * changed in between, the number support decided on must not move under them.
     */
    frozenAmount: { type: Number, default: 0, min: 0 },
    /** Where the stage was before the freeze, so dismissal can put it back exactly. */
    preDisputeStatus: { type: String, default: '', trim: true },

    // ---------- resolution ----------
    outcome: { type: String, enum: DISPUTE_OUTCOMES, default: '' },
    resolutionNote: { type: String, default: '', trim: true, maxlength: 4000 },
    /** For `split`: how the frozen amount was divided. Must sum to frozenAmount. */
    amountToContractor: { type: Number, default: 0, min: 0 },
    amountToCustomer: { type: Number, default: 0, min: 0 },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: actionPerformerSchema, default: null },
    /** Idempotency key for whatever escrow movement the resolution caused. */
    settlementReference: { type: String, default: '', trim: true },

    timeline: { type: [timelineEntrySchema], default: [] },

    lastActivityAt: { type: Date, default: Date.now, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  {
    collection: 'construction_disputes',
    timestamps: true,
  },
);

// The support queue: oldest open first, because a dispute nobody has touched is
// the one most likely to become a phone call.
projectDisputeSchema.index({ status: 1, createdAt: 1 });
projectDisputeSchema.index({ projectId: 1, status: 1 });
projectDisputeSchema.index({ contractorId: 1, status: 1 });

/**
 * One live dispute per stage.
 *
 * Without this, two people arguing about the same stage produce two disputes,
 * two freezes and two resolutions against one pot of money — which is how a
 * stage gets paid out twice. Partial index so resolved disputes do not block a
 * later, genuinely new disagreement about the same stage.
 *
 * `partialFilterExpression` only supports equality-style operators, so this
 * matches on the two live statuses explicitly rather than "not resolved".
 */
projectDisputeSchema.index(
  { stageId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      stageId: { $type: 'objectId' },
      status: { $in: ['open', 'under_review'] },
    },
    name: 'one_live_dispute_per_stage',
  },
);

/** A split must add up. Money that vanishes in the arithmetic is money lost. */
projectDisputeSchema.pre('validate', function guardSplit(next) {
  if (this.outcome !== 'split') return next();

  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const total = round2(round2(this.amountToContractor) + round2(this.amountToCustomer));
  if (total !== round2(this.frozenAmount)) {
    return next(new Error(
      `A split must account for the whole frozen amount: `
      + `${total} was allocated but ${round2(this.frozenAmount)} is held`,
    ));
  }
  return next();
});

export const ProjectDispute = mongoose.models.ProjectDispute
  || mongoose.model('ProjectDispute', projectDisputeSchema);

export { projectDisputeSchema, DISPUTE_STATUSES, DISPUTE_OUTCOMES };
