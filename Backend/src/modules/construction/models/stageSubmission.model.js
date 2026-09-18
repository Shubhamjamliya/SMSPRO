import mongoose from 'mongoose';

/**
 * StageSubmission — the dated evidence that unlocks a payment (BRD W15, C16).
 *
 * "This evidence is what unlocks the payment, so it is in the contractor's own
 * interest." And for a customer living in another city, the photo gallery built
 * from these rows is the whole product.
 *
 * Append-only in spirit: a resubmission after rejection creates a NEW row rather
 * than editing the old one, so the full history of what was claimed and when
 * survives a later dispute.
 */
const submissionPhotoSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    caption: { type: String, trim: true, default: '', maxlength: 200 },
    /**
     * When the photograph was taken, if the device reported it. BRD asks for
     * "dated photographs" — `createdAt` on the row proves when it was uploaded,
     * which is the date that actually matters for a payment claim.
     */
    capturedAt: { type: Date, default: null },
  },
  { _id: false },
);

const stageSubmissionSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ConstructionProject',
      required: true,
      index: true,
    },
    stageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProjectStage',
      required: true,
      index: true,
    },
    contractorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContractorProfile',
      required: true,
      index: true,
    },

    /** Which attempt this is — 1 for the first, 2 after a rejection, and so on. */
    attempt: { type: Number, default: 1, min: 1 },

    progressPercent: { type: Number, default: 100, min: 0, max: 100 },
    notes: { type: String, trim: true, default: '', maxlength: 3000 },
    photos: { type: [submissionPhotoSchema], default: [] },

    reviewedAt: { type: Date, default: null },
    reviewOutcome: { type: String, enum: ['approved', 'rejected', ''], default: '' },
    reviewNote: { type: String, trim: true, default: '', maxlength: 2000 },
  },
  {
    collection: 'construction_stage_submissions',
    timestamps: true,
  },
);

stageSubmissionSchema.index({ stageId: 1, attempt: -1 });
stageSubmissionSchema.index({ projectId: 1, createdAt: -1 });

stageSubmissionSchema.pre('validate', function requireEvidence(next) {
  // A submission with no photographs is a claim with nothing behind it. The
  // customer is being asked to release money on the strength of this.
  if (!Array.isArray(this.photos) || this.photos.length === 0) {
    return next(new Error('Add at least one photograph as proof of the work done'));
  }
  if (this.photos.length > 40) {
    return next(new Error('A submission can hold at most 40 photographs'));
  }
  next();
});

export const StageSubmission = mongoose.models.StageSubmission
  || mongoose.model('StageSubmission', stageSubmissionSchema, 'construction_stage_submissions');
