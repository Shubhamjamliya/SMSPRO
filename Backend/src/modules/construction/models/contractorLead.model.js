import mongoose from 'mongoose';

/**
 * ContractorLead — one enquiry offered to one contractor (BRD W6, W7).
 *
 * "A steady flow of genuine leads is the single biggest reason a contractor
 * joins", and "a fast decline is far better for the customer than a slow
 * non-answer" — so a lead carries an explicit expiry and a decline reason.
 *
 * Unique on (enquiryId, contractorId): a contractor is offered a given enquiry
 * exactly once, so re-running the matching pass can never double-offer.
 */
const LEAD_STATUSES = ['offered', 'accepted', 'declined', 'expired', 'withdrawn'];

const DECLINE_REASONS = [
  'too_far',
  'outside_my_trade',
  'too_small',
  'too_large',
  'no_capacity',
  'budget_unrealistic',
  'other',
];

const contractorLeadSchema = new mongoose.Schema(
  {
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

    status: { type: String, enum: LEAD_STATUSES, default: 'offered', index: true },

    offeredAt: { type: Date, default: Date.now },
    /** From settings.matching.leadResponseHours. A lead nobody answers is
     *  reassigned rather than left rotting. */
    expiresAt: { type: Date, default: null, index: true },
    respondedAt: { type: Date, default: null },

    declineReason: { type: String, enum: [...DECLINE_REASONS, ''], default: '' },
    declineNote: { type: String, trim: true, default: '', maxlength: 500 },

    /** Why the matcher picked this contractor — shown to admins investigating
     *  why an enquiry went to the people it did. */
    matchScore: { type: Number, default: 0 },
    matchReasons: { type: [String], default: [] },
  },
  {
    collection: 'construction_leads',
    timestamps: true,
  },
);

contractorLeadSchema.index({ enquiryId: 1, contractorId: 1 }, { unique: true });
contractorLeadSchema.index({ contractorId: 1, status: 1, offeredAt: -1 });
contractorLeadSchema.index({ status: 1, expiresAt: 1 });

export const ContractorLead = mongoose.models.ContractorLead
  || mongoose.model('ContractorLead', contractorLeadSchema, 'construction_leads');

export const LEAD_STATUS_VALUES = LEAD_STATUSES;
export const LEAD_DECLINE_REASONS = DECLINE_REASONS;
