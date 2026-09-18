import mongoose from 'mongoose';
import { actionPerformerSchema } from '../../../core/models/actionPerformer.schema.js';

const serviceCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    slug: { type: String, trim: true, lowercase: true },
    icon: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true, maxlength: 1000 },
    displayOrder: { type: Number, default: 0, index: true },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    /** Set when this category was created from an approved CategoryRequest */
    sourceRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CategoryRequest',
      default: null,
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: actionPerformerSchema, default: null },
    createdBy: { type: actionPerformerSchema, default: null },
    updatedBy: { type: actionPerformerSchema, default: null },
  },
  {
    collection: 'service_provider_categories',
    timestamps: true,
  },
);

serviceCategorySchema.index({ isDeleted: 1, status: 1, displayOrder: 1 });
serviceCategorySchema.index(
  { slug: 1 },
// NOTE: partialFilterExpression accepts only equality-style operators. MongoDB
// treats `$ne` as `$not` and REJECTS the whole index spec, which means the index
// is never built and the uniqueness declared here silently does not exist.
// Equivalents that ARE accepted: `isDeleted: false`, `{ $type: 'objectId' }` for
// a present reference, `{ $type: 'string', $gt: '' }` for a non-empty string.
  { unique: true, partialFilterExpression: { isDeleted: false, slug: { $type: 'string' } } },
);

export const ServiceCategory = mongoose.models.ServiceCategory
  || mongoose.model('ServiceCategory', serviceCategorySchema, 'service_provider_categories');
