import mongoose from 'mongoose';

const historyEntrySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    reason: { type: String, trim: true, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const categoryRequestSchema = new mongoose.Schema(
  {
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceProviderProfile',
      required: true,
      index: true,
    },
    requestedName: { type: String, required: true, trim: true },
    reason: { type: String, trim: true, default: '', maxlength: 1000 },
    /** Same fields as the admin Category create form. */
    icon: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '', maxlength: 1000 },
    requestedStatus: { type: String, enum: ['active', 'inactive'], default: 'active' },
    /** Optional first service under the new category (provider may include service details). */
    serviceName: { type: String, trim: true, default: '' },
    serviceDescription: { type: String, trim: true, default: '', maxlength: 2000 },
    serviceIcon: { type: String, trim: true, default: '' },
    serviceRequestedStatus: { type: String, enum: ['active', 'inactive'], default: 'active' },
    basePrice: { type: Number, default: 0, min: 0 },
    providerPrice: { type: Number, default: 0, min: 0 },
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
    /** Set when approval created the actual catalog ServiceCategory row */
    createdCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceCategory',
      default: null,
    },
    /** Set when approval also created a Service from optional service details */
    createdServiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      default: null,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
    reviewedAt: { type: Date, default: null },
  },
  {
    collection: 'service_provider_category_requests',
    timestamps: true,
  },
);

categoryRequestSchema.index({ status: 1, createdAt: -1 });

export const CategoryRequest = mongoose.models.CategoryRequest
  || mongoose.model('CategoryRequest', categoryRequestSchema, 'service_provider_category_requests');
