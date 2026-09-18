import mongoose from 'mongoose';

const historyEntrySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    reason: { type: String, trim: true, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const serviceRequestSchema = new mongoose.Schema(
  {
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceProviderProfile',
      required: true,
      index: true,
    },
    requestedName: { type: String, required: true, trim: true },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceCategory',
      required: true,
    },
    reason: { type: String, trim: true, default: '', maxlength: 1000 },
    /** Same fields as the admin Service create form, so a request carries everything
     *  admin would otherwise type in themselves. */
    icon: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '', maxlength: 2000 },
    /** Requested status for the catalog Service once approved — distinct from `status`
     *  below, which tracks the request's own pending/approved/rejected lifecycle. */
    requestedStatus: { type: String, enum: ['active', 'inactive'], default: 'active' },
    /** Proposed customer-facing price — admin can confirm or override at approval. */
    basePrice: { type: Number, default: 0, min: 0 },
    /** Provider's own price/earning for this service. Never copied onto the Service
     *  catalog record and never shown to customers — only used to seed the provider's
     *  own ProviderService row when the request is approved. */
    providerPrice: { type: Number, default: 0, min: 0 },
    /** Zones where the provider wants this service available (must be approved + active for them). */
    zoneIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceZone',
    }],
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    rejectionReason: { type: String, trim: true, default: '' },
    /** Prior rejection(s), preserved across edit+resubmit cycles. */
    history: { type: [historyEntrySchema], default: [] },
    /** Set when approval created the actual catalog Service row */
    createdServiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      default: null,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
    reviewedAt: { type: Date, default: null },
  },
  {
    collection: 'service_provider_service_requests',
    timestamps: true,
  },
);

serviceRequestSchema.index({ status: 1, createdAt: -1 });

export const ServiceRequest = mongoose.models.ServiceRequest
  || mongoose.model('ServiceRequest', serviceRequestSchema, 'service_provider_service_requests');
