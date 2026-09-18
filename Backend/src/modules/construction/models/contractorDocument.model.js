import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

/**
 * ContractorDocument — licences, registrations and certificates (BRD W3).
 *
 * Separate from the identity KYC held on the profile because these carry expiry
 * dates, and BRD Rule 6 requires the system to track them and warn before one
 * lapses. A contractor whose licence has expired is not a verified contractor,
 * which is the entire foundation of the trust promise made to customers.
 */
const DOCUMENT_TYPES = [
  'contractor_license',
  'business_registration',
  'gst_certificate',
  'labour_license',
  'pf_registration',
  'esi_registration',
  'insurance',
  'trade_certificate',
  'iso_certificate',
  'other',
];

const DOCUMENT_STATUSES = ['pending', 'verified', 'rejected'];

const contractorDocumentSchema = new mongoose.Schema(
  {
    contractorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContractorProfile',
      required: true,
      index: true,
    },
    type: { type: String, enum: DOCUMENT_TYPES, required: true, index: true },
    /** Shown when type is 'other', or to name a specific certificate. */
    label: { type: String, trim: true, default: '', maxlength: 160 },
    documentNumber: { type: String, trim: true, default: '' },
    fileUrl: { type: String, trim: true, required: true },

    issuedAt: { type: Date, default: null },
    /**
     * null means the document does not expire. Anything with a date here is
     * swept by the expiry job, which warns the contractor and your team before
     * it lapses and flags them once it has.
     */
    expiresAt: { type: Date, default: null, index: true },

    status: {
      type: String,
      enum: DOCUMENT_STATUSES,
      default: 'pending',
      index: true,
    },
    rejectionReason: { type: String, trim: true, default: '' },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: actionPerformerSchema, default: null },

    /** Set once a warning has gone out, so the job does not notify daily. */
    expiryWarnedAt: { type: Date, default: null },

    isDeleted: { type: Boolean, default: false, index: true },
  },
  {
    collection: 'construction_contractor_documents',
    timestamps: true,
  },
);

contractorDocumentSchema.index({ contractorId: 1, status: 1 });
contractorDocumentSchema.index({ expiresAt: 1, status: 1, isDeleted: 1 });

/** True once the expiry date has passed. */
contractorDocumentSchema.virtual('isExpired').get(function isExpired() {
  return Boolean(this.expiresAt && this.expiresAt.getTime() < Date.now());
});

contractorDocumentSchema.set('toObject', { virtuals: true });
contractorDocumentSchema.set('toJSON', { virtuals: true });

contractorDocumentSchema.pre('validate', function checkDates(next) {
  if (this.issuedAt && this.expiresAt && this.expiresAt <= this.issuedAt) {
    return next(new Error('Expiry date must be after the issue date'));
  }
  if (this.type === 'other' && !String(this.label || '').trim()) {
    return next(new Error('Name the document when the type is "other"'));
  }
  next();
});

export const ContractorDocument = mongoose.models.ContractorDocument
  || mongoose.model(
    'ContractorDocument',
    contractorDocumentSchema,
    'construction_contractor_documents',
  );

export const CONTRACTOR_DOCUMENT_TYPES = DOCUMENT_TYPES;
export const CONTRACTOR_DOCUMENT_STATUSES = DOCUMENT_STATUSES;
