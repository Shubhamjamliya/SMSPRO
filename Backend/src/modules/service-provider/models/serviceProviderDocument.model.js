import mongoose from 'mongoose';

const DOCUMENT_TYPES = ['identity_proof', 'address_proof', 'other'];
const VERIFICATION_STATUSES = ['pending', 'verified', 'rejected'];

const serviceProviderDocumentSchema = new mongoose.Schema(
  {
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceProviderProfile',
      required: true,
      index: true,
    },
    documentType: {
      type: String,
      enum: DOCUMENT_TYPES,
      required: true,
    },
    label: { type: String, trim: true, default: '' },
    documentUrl: { type: String, trim: true, required: true },
    verificationStatus: {
      type: String,
      enum: VERIFICATION_STATUSES,
      default: 'pending',
      index: true,
    },
    rejectionReason: { type: String, trim: true, default: '' },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
    verifiedAt: { type: Date, default: null },
  },
  {
    collection: 'service_provider_documents',
    timestamps: true,
  },
);

serviceProviderDocumentSchema.index({ providerId: 1, documentType: 1 });

export const ServiceProviderDocument = mongoose.models.ServiceProviderDocument
  || mongoose.model('ServiceProviderDocument', serviceProviderDocumentSchema, 'service_provider_documents');
export const SERVICE_PROVIDER_DOCUMENT_TYPES = DOCUMENT_TYPES;
export const SERVICE_PROVIDER_DOCUMENT_VERIFICATION_STATUSES = VERIFICATION_STATUSES;
