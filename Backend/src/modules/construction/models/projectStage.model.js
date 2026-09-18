import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/**
 * ProjectStage — one paid milestone (BRD C15, C17, W12, W16 · §13 steps 3–6).
 *
 * `approved → payment_released` is the ONLY transition that moves money, and it
 * is the mechanism the whole module rests on: the customer never pays for work
 * not done, and the contractor never works without knowing the money exists.
 *
 * `releaseReference` is the idempotency key handed to the escrow ledger. It is
 * derived from the stage id and is unique-indexed there, so a double-tapped
 * approval or a retried request pays exactly once.
 */
const STAGE_STATUSES = [
  'pending',                // not started
  'in_progress',            // contractor is working on it
  'submitted_for_approval', // evidence uploaded, awaiting a decision
  'approved',               // signed off; release is imminent
  'payment_released',       // money has moved
  'rejected',               // sent back for more work
  'disputed',               // frozen pending resolution (Phase 6)
];

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: STAGE_STATUSES, required: true },
    reason: { type: String, trim: true, default: '' },
    at: { type: Date, default: Date.now },
    by: { type: actionPerformerSchema, default: null },
  },
  { _id: false },
);

const projectStageSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConstructionProject',
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

    /** 1-based position. Stages are worked in order. */
    sequence: { type: Number, required: true, min: 1 },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, default: '', maxlength: 500 },

    percentage: { type: Number, required: true, min: 0, max: 100 },
    /** Frozen from agreedValue × percentage at project creation. */
    amount: { type: Number, required: true, min: 0 },

    targetDate: { type: Date, default: null, index: true },

    status: { type: String, enum: STAGE_STATUSES, default: 'pending', index: true },
    statusHistory: { type: [statusHistorySchema], default: [] },

    /** Contractor's own view of how far along this stage is (BRD W15). */
    progressPercent: { type: Number, default: 0, min: 0, max: 100 },

    submittedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: actionPerformerSchema, default: null },
    /** Which route approved it — matters for BRD Q13 reporting. */
    approvedVia: {
      type: String,
      enum: ['customer', 'supervisor', 'auto', ''],
      default: '',
    },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true, default: '' },

    releasedAt: { type: Date, default: null },
    /** Idempotency key for the escrow release. Stable per stage, by design. */
    releaseReference: { type: String, trim: true, default: '' },
    releasedAmount: { type: Number, default: 0, min: 0 },
    commissionAmount: { type: Number, default: 0, min: 0 },
    /**
     * Retention withheld from THIS stage (BRD §13 step 7).
     *
     * Persisted rather than recomputed on read: the project's retention percent
     * is snapshotted at creation and could be edited by support afterwards, and
     * a customer looking at a stage paid six months ago must see what was
     * actually withheld from it, not what the current setting would withhold.
     */
    retainedAmount: { type: Number, default: 0, min: 0 },

    /**
     * BRD Q13 — when the customer goes quiet, approval escalates to a
     * supervisor rather than letting a contractor's payment be withheld
     * indefinitely. Set when the escalation window opens.
     */
    escalatedAt: { type: Date, default: null },

    /** BRD C18 — set once a delay alert has gone out, so it is not repeated. */
    delayAlertedAt: { type: Date, default: null },

    isRetention: { type: Boolean, default: false },
  },
  {
    collection: 'construction_project_stages',
    timestamps: true,
  },
);

projectStageSchema.index({ projectId: 1, sequence: 1 }, { unique: true });
projectStageSchema.index({ status: 1, targetDate: 1 });
projectStageSchema.index({ status: 1, submittedAt: 1 });
projectStageSchema.index(
  { releaseReference: 1 },
  { unique: true, partialFilterExpression: { releaseReference: { $type: 'string', $gt: '' } } },
);

export const ProjectStage = mongoose.models.ProjectStage
  || mongoose.model('ProjectStage', projectStageSchema, 'construction_project_stages');

export const STAGE_STATUS_VALUES = STAGE_STATUSES;
